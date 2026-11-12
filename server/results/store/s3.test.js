// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    S3ResultsStore,
    buildS3Metadata,
    encodeMetaValue,
    decodeMetaValue,
    META_KEYS,
    readS3Body
} from './s3.ts';
import { ResultsStoreError } from '../backend.ts';
import { createFakeS3 } from './fakeS3.js';

const PREFIX = 'prism-results-store/';
const RUN_A = '11111111-2222-4333-8444-555555555555';
const RUN_B = '22222222-3333-4444-8555-666666666666';
const RUN_C = '33333333-4444-4555-8666-777777777777';

function payload(overrides = {}) {
    return {
        runId: RUN_A,
        runLabel: 'Llama 70B on H100',
        model_name: 'meta-llama/Llama-3.1-70B-Instruct',
        hardware: { hardware_name: 'H100', accelerator_count: 8 },
        format: 'brv02',
        submitted_at: '2026-11-08T10:00:00.000Z',
        entries: [],
        ...overrides
    };
}

function makeStore(fakeOpts, storeOpts = {}) {
    const fake = createFakeS3(fakeOpts);
    const store = new S3ResultsStore({ bucket: 'results', prefix: PREFIX, client: fake.client, summaryTtlMs: 0, ...storeOpts });
    return { fake, store };
}

/**
 * Runs `before(cmd, send)` once, just before the first command matching `match` is
 * served; `send` bypasses the hook (e.g. for a concurrent writer on another replica).
 */
function interceptOnce(fake, match, before) {
    const send = fake.client.send.bind(fake.client);
    let armed = true;
    fake.client.send = async (cmd) => {
        if (armed && match(cmd)) {
            armed = false;
            await before(cmd, send);
        }
        return send(cmd);
    };
}
const isGet = (cmd) => cmd.constructor.name === 'GetObjectCommand';
const replica = (send) => new S3ResultsStore({ bucket: 'results', prefix: PREFIX, client: { send } });

describe('S3 metadata encoding', () => {
    it('round-trips arbitrary unicode through header-safe ASCII', () => {
        for (const value of ['alice', 'Zoë 李', 'tab\there', '', 'x'.repeat(100)]) {
            const encoded = encodeMetaValue(value);
            expect(encoded).toMatch(/^[\x20-\x7e]*$/);
            expect(decodeMetaValue(encoded)).toBe(value);
        }
    });

    it('treats unencoded or malformed values as empty rather than trusting them', () => {
        expect(decodeMetaValue(undefined)).toBe('');
        expect(decodeMetaValue('alice')).toBe('');
    });

    it('stores only short authorization/listing fields and never descriptive free text', () => {
        const meta = buildS3Metadata(
            payload({ runLabel: 'L'.repeat(5000), feedback: 'F'.repeat(5000), experiment_id: 'exp-1', forked: true }),
            'public',
            'alice',
            '2026-11-08T10:00:00.000Z'
        );
        expect(Object.keys(meta).sort()).toEqual(
            [META_KEYS.revision, META_KEYS.state, META_KEYS.user, META_KEYS.submittedAt, META_KEYS.experimentId].sort()
        );
        expect(meta[META_KEYS.state]).toBe('public');
    });

    it('stays under the 2 KB S3 metadata limit with every value at its cap', () => {
        // Caps count UTF-16 units; 3-byte characters give the most bytes per unit.
        const meta = buildS3Metadata(payload({ experiment_id: '中'.repeat(128) }), 'submitted_pending_processing', '中'.repeat(100), '中'.repeat(40));
        const size = Object.entries(meta).reduce((n, [k, v]) => n + Buffer.byteLength(`x-amz-meta-${k}`) + Buffer.byteLength(v), 0);
        expect(size).toBeLessThan(2048);
    });

    it('rejects an over-long owner instead of letting the provider fail the PUT', () => {
        expect(() => buildS3Metadata(payload(), 'public', 'u'.repeat(101), '2026-11-08T10:00:00.000Z'))
            .toThrow(/prism-user/);
    });

    it('reports an over-cap value as an HTTP 400 error', () => {
        let err;
        try { buildS3Metadata(payload({ experiment_id: 'x'.repeat(200) }), 'public', 'u', 't'); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(ResultsStoreError);
        expect(err.statusCode).toBe(400);
    });
});

describe('S3ResultsStore basic operations', () => {
    let fake;
    let store;
    beforeEach(() => ({ fake, store } = makeStore()));

    it('writes the payload at <prefix><runId>.v1.json with JSON content type and metadata', async () => {
        await store.write(RUN_A, payload(), 'submitted_pending_review', 'Zoë');
        const obj = fake.objects.get(`${PREFIX}${RUN_A}.v1.json`);
        expect(obj).toBeTruthy();
        expect(obj.contentType).toBe('application/json');
        expect(JSON.parse(obj.body).runLabel).toBe('Llama 70B on H100');
        expect(obj.metadata[META_KEYS.state]).toBe('submitted_pending_review');
        expect(decodeMetaValue(obj.metadata[META_KEYS.user])).toBe('Zoë');
    });

    it('reads back payload and metadata', async () => {
        await store.write(RUN_A, payload(), 'public', 'alice');
        expect((await store.readPayload(RUN_A)).model_name).toBe('meta-llama/Llama-3.1-70B-Instruct');
        expect(await store.readMetadata(RUN_A)).toEqual({ user: 'alice', state: 'public' });
    });

    it('returns null metadata and a 404-coded error for missing runs', async () => {
        expect(await store.readMetadata(RUN_A)).toBeNull();
        await expect(store.readPayload(RUN_A)).rejects.toMatchObject({ code: 404 });
    });

    it('delete is idempotent', async () => {
        await store.write(RUN_A, payload(), 'unlisted', 'alice');
        await store.delete(RUN_A);
        await store.delete(RUN_A);
        expect(fake.objects.size).toBe(0);
    });

    it('defaults unknown or missing state to submitted_pending_processing', async () => {
        fake.putRaw(`${PREFIX}${RUN_A}.v1.json`, payload(), { [META_KEYS.state]: 'bogus' });
        fake.putRaw(`${PREFIX}${RUN_B}.v1.json`, payload({ runId: RUN_B }), {});
        expect((await store.readMetadata(RUN_A)).state).toBe('submitted_pending_processing');
        expect(await store.readMetadata(RUN_B)).toEqual({ user: '', state: 'submitted_pending_processing' });
    });

    it.each(['upper', 'mixed'])('normalizes %s-case metadata keys returned by the provider', async (metadataKeyCase) => {
        ({ fake, store } = makeStore({ metadataKeyCase }));
        await store.write(RUN_A, payload(), 'promoted', 'alice');
        expect(await store.readMetadata(RUN_A)).toEqual({ user: 'alice', state: 'promoted' });
    });

    it('keeps the original submitted-at across state changes when the payload lacks it', async () => {
        await store.write(RUN_A, payload({ submitted_at: '2026-01-01T00:00:00.000Z' }), 'submitted_pending_review', 'alice');
        await store.write(RUN_A, payload({ submitted_at: undefined }), 'public', 'alice');
        const meta = fake.objects.get(`${PREFIX}${RUN_A}.v1.json`).metadata;
        expect(decodeMetaValue(meta[META_KEYS.submittedAt])).toBe('2026-01-01T00:00:00.000Z');
    });

    it('reads IAM files and returns null when missing', async () => {
        expect(await store.readIamFile('prism-iam/github-admin-allowlist.txt')).toBeNull();
        fake.putRaw('prism-iam/github-admin-allowlist.txt', 'alice\n');
        expect(await store.readIamFile('prism-iam/github-admin-allowlist.txt')).toBe('alice\n');
    });

    it('wraps provider errors with context', async () => {
        const broken = { send: vi.fn(async () => { const e = new Error('AccessDenied'); e.$metadata = { httpStatusCode: 403 }; throw e; }) };
        const s = new S3ResultsStore({ bucket: 'b', prefix: PREFIX, client: broken });
        await expect(s.readPayload(RUN_A)).rejects.toThrow(/Failed to read result from S3: AccessDenied/);
        await expect(s.readMetadata(RUN_A)).rejects.toThrow(/Failed to fetch metadata from S3/);
        await expect(s.write(RUN_A, payload(), 'public', 'a')).rejects.toThrow(/S3 upload failed/);
        await expect(s.delete(RUN_A)).rejects.toThrow(/Failed to delete result from S3/);
    });
});

describe('S3ResultsStore listing', () => {
    let fake;
    let store;
    beforeEach(async () => {
        ({ fake, store } = makeStore());
        await store.write(RUN_A, payload({ runId: RUN_A, runLabel: 'A', submitted_at: '2026-11-01T00:00:00.000Z' }), 'public', 'alice');
        await store.write(RUN_B, payload({ runId: RUN_B, runLabel: 'B', submitted_at: '2026-11-02T00:00:00.000Z' }), 'submitted_pending_review', 'bob');
        await store.write(RUN_C, payload({ runId: RUN_C, runLabel: 'C', submitted_at: '2026-11-03T00:00:00.000Z', experiment_id: 'exp-1' }), 'unlisted', 'alice');
    });

    const ids = (r) => r.items.map(i => i.runId);

    it('anonymous users see only approved runs; unlisted is excluded by default', async () => {
        const r = await store.list({ limit: 10, permission: 'none', username: null });
        expect(ids(r)).toEqual([RUN_A]);
    });

    it('owners also see their own non-public runs, admins see all except unlisted in the default grid', async () => {
        expect(ids(await store.list({ limit: 10, permission: 'user', username: 'BOB' }))).toEqual([RUN_B, RUN_A]);
        expect(ids(await store.list({ limit: 10, permission: 'admin', username: 'root' }))).toEqual([RUN_B, RUN_A]);
    });

    it('status, own and experiment filters match the GCS rules', async () => {
        expect(ids(await store.list({ limit: 10, statusFilter: 'unlisted', permission: 'none' }))).toEqual([RUN_C]);
        expect(ids(await store.list({ limit: 10, ownFilter: true, username: 'alice', permission: 'user' }))).toEqual([RUN_C, RUN_A]);
        expect(ids(await store.list({ limit: 10, experimentId: ' exp-1 ', permission: 'admin' }))).toEqual([RUN_C]);
        expect(ids(await store.list({ limit: 10, statusFilter: 'submitted_pending_review', permission: 'none' }))).toEqual([]);
    });

    it('returns list items with descriptive fields from the payload', async () => {
        const [item] = (await store.list({ limit: 10, permission: 'none' })).items;
        expect(item).toMatchObject({
            runId: RUN_A,
            runLabel: 'A',
            model_name: 'meta-llama/Llama-3.1-70B-Instruct',
            hardware: { hardware_name: 'H100', accelerator_count: 8 },
            format: 'brv02',
            state: 'public',
            github_author: { username: 'alice' },
            submitted_at: '2026-11-01T00:00:00.000Z'
        });
    });

    it('paginates newest-first with stable tokens', async () => {
        const own = await store.list({ limit: 1, permission: 'user', ownFilter: true, username: 'alice' });
        expect(ids(own)).toEqual([RUN_C]);
        expect(ids(await store.list({ limit: 1, permission: 'user', ownFilter: true, username: 'alice', pageToken: own.nextPageToken }))).toEqual([RUN_A]);
        const all1 = await store.list({ limit: 1, permission: 'admin' });
        expect(ids(all1)).toEqual([RUN_B]);
        expect(all1.nextPageToken).toBeTruthy();
        const all2 = await store.list({ limit: 1, permission: 'admin', pageToken: all1.nextPageToken });
        expect(ids(all2)).toEqual([RUN_A]);
        expect(all2.nextPageToken).toBeNull();
    });

    it('paging never skips a surviving run when an earlier one is deleted mid-request', async () => {
        // Order (newest first): C, B, A. Delete C between its HEAD and GET on page 1.
        interceptOnce(fake, cmd => isGet(cmd) && cmd.input.Key.includes(RUN_C), cmd => fake.objects.delete(cmd.input.Key));
        store.detailsCache.clear();
        const seen = [];
        let token;
        do {
            const r = await store.list({ limit: 1, permission: 'admin', ownFilter: true, username: 'alice', pageToken: token });
            seen.push(...ids(r));
            token = r.nextPageToken;
        } while (token);
        // C is gone; A (alice's other run) must still be delivered.
        expect(seen).toEqual([RUN_A]);
    });

    it('a run added between page requests does not shift or duplicate later pages', async () => {
        const p1 = await store.list({ limit: 1, permission: 'admin' });
        expect(ids(p1)).toEqual([RUN_B]);
        const RUN_D = '44444444-5555-4666-8777-888888888888';
        await store.write(RUN_D, payload({ runId: RUN_D, submitted_at: '2026-11-04T00:00:00.000Z' }), 'public', 'dave');
        const p2 = await store.list({ limit: 5, permission: 'admin', pageToken: p1.nextPageToken });
        expect(ids(p2)).toEqual([RUN_A]);
    });

    it('releases the response body when a revision changed between HEAD and GET', async () => {
        await store.write(RUN_A, payload(), 'public', 'alice');
        store.detailsCache.clear();
        const origSend = fake.client.send.bind(fake.client);
        let destroyed = 0;
        let raced = false;
        fake.client.send = async (cmd) => {
            if (cmd.constructor.name === 'GetObjectCommand' && !raced) {
                // Another replica rewrites the run after our HEAD, before our GET.
                raced = true;
                await new S3ResultsStore({ bucket: 'results', prefix: PREFIX, client: { send: origSend } })
                    .write(RUN_A, payload(), 'public', 'alice');
                const out = await origSend(cmd);
                out.Body.destroy = () => { destroyed++; };
                return out;
            }
            return origSend(cmd);
        };
        const r = await store.list({ limit: 10, permission: 'none' });
        expect(ids(r)).toContain(RUN_A);
        expect(destroyed).toBe(1);
    });

    it('ignores garbage page tokens', async () => {
        expect(ids(await store.list({ limit: 10, permission: 'none', pageToken: 'not-base64-json' }))).toEqual([RUN_A]);
    });

    it('pages through ListObjectsV2 continuation tokens', async () => {
        ({ fake, store } = makeStore({ pageSize: 1 }));
        for (const id of [RUN_A, RUN_B, RUN_C]) await store.write(id, payload({ runId: id }), 'public', 'a');
        expect((await store.list({ limit: 10, permission: 'none' })).items).toHaveLength(3);
    });

    it('ignores keys that are not <uuid>.v1.json under the prefix', async () => {
        fake.putRaw(`${PREFIX}legacy-envelope.v1.json`, payload(), { [META_KEYS.state]: 'public' });
        fake.putRaw(`${PREFIX}${RUN_A}.json`, payload(), { [META_KEYS.state]: 'public' });
        fake.putRaw(`other/${RUN_B}.v1.json`, payload(), { [META_KEYS.state]: 'public' });
        expect(ids(await store.list({ limit: 10, permission: 'admin' }))).toEqual([RUN_B, RUN_A]);
    });

    it('hides hand-copied objects without Prism metadata from non-admins', async () => {
        const RUN_D = '44444444-5555-4666-8777-888888888888';
        fake.putRaw(`${PREFIX}${RUN_D}.v1.json`, payload({ runId: RUN_D }), {});
        expect(ids(await store.list({ limit: 10, permission: 'none' }))).toEqual([RUN_A]);
    });
});

describe('S3ResultsStore freshness and consistency', () => {
    let fake;
    let store;
    // tickMs: 0 — every write lands in the same second, so neither ETag nor
    // LastModified changes when identical JSON is rewritten with new metadata.
    beforeEach(() => ({ fake, store } = makeStore({ tickMs: 0 })));

    const key = (id) => `${PREFIX}${id}.v1.json`;
    const listIds = async (opts = {}) => (await store.list({ limit: 10, permission: 'none', ...opts })).items.map(i => i.runId);

    it('sees a same-second, same-body state change made by another replica', async () => {
        const other = new S3ResultsStore({ bucket: 'results', prefix: PREFIX, client: fake.client });
        await store.write(RUN_A, payload(), 'public', 'alice');
        expect(await listIds()).toEqual([RUN_A]);

        const before = { ...fake.objects.get(key(RUN_A)) };
        await other.write(RUN_A, payload(), 'rejected', 'alice');
        const after = fake.objects.get(key(RUN_A));
        expect(after.etag).toBe(before.etag);
        expect(after.lastModified.getTime()).toBe(before.lastModified.getTime());

        expect(await listIds()).toEqual([]);
        await other.write(RUN_A, payload(), 'public', 'alice');
        expect(await listIds()).toEqual([RUN_A]);
    });

    it('never returns content from a newer, non-visible revision under an older visible state', async () => {
        await store.write(RUN_A, payload({ feedback: '' }), 'public', 'alice');
        // Between the HEAD that authorizes the run and the GET for its content, an admin
        // rejects it with private feedback.
        interceptOnce(fake, isGet, (_, send) =>
            replica(send).write(RUN_A, payload({ feedback: 'private reviewer notes' }), 'rejected', 'alice'));
        const { items } = await store.list({ limit: 10, permission: 'none' });
        expect(items).toEqual([]);
        expect(JSON.stringify(items)).not.toContain('private reviewer notes');
    });

    it('returns the newer revision when a concurrent change keeps the run visible', async () => {
        await store.write(RUN_A, payload({ runLabel: 'old' }), 'public', 'alice');
        interceptOnce(fake, isGet, (_, send) => replica(send).write(RUN_A, payload({ runLabel: 'new' }), 'promoted', 'alice'));
        const { items } = await store.list({ limit: 10, permission: 'none' });
        expect(items.map(i => [i.runLabel, i.state])).toEqual([['new', 'promoted']]);
    });

    it('drops runs deleted out of band, and runs that vanish between LIST and HEAD/GET', async () => {
        await store.write(RUN_A, payload(), 'public', 'alice');
        await store.write(RUN_B, payload({ runId: RUN_B }), 'public', 'bob');
        await store.write(RUN_C, payload({ runId: RUN_C }), 'public', 'carol');
        expect((await listIds()).sort()).toEqual([RUN_A, RUN_B, RUN_C].sort());

        fake.objects.delete(key(RUN_A));
        const origSend = fake.client.send.bind(fake.client);
        fake.client.send = async (cmd) => {
            if (cmd.constructor.name === 'HeadObjectCommand' && cmd.input.Key === key(RUN_B)) fake.objects.delete(key(RUN_B));
            if (cmd.constructor.name === 'GetObjectCommand' && cmd.input.Key === key(RUN_C)) fake.objects.delete(key(RUN_C));
            return origSend(cmd);
        };
        store.detailsCache.clear();
        expect(await listIds()).toEqual([]);
    });

    it('re-reads payload content only when the revision changes', async () => {
        await store.write(RUN_A, payload(), 'public', 'alice');
        await listIds();
        fake.resetCalls();
        await listIds();
        expect(fake.calls.map(c => c.name)).toEqual(['ListObjectsV2Command', 'HeadObjectCommand']);

        const other = new S3ResultsStore({ bucket: 'results', prefix: PREFIX, client: fake.client });
        await other.write(RUN_A, payload({ runLabel: 'renamed' }), 'public', 'alice');
        fake.resetCalls();
        const { items } = await store.list({ limit: 10, permission: 'none' });
        expect(items[0].runLabel).toBe('renamed');
        expect(fake.calls.map(c => c.name)).toEqual(['ListObjectsV2Command', 'HeadObjectCommand', 'GetObjectCommand']);
    });

    it('handles objects written without a revision id (e.g. by older tooling)', async () => {
        fake.putRaw(key(RUN_A), payload(), { [META_KEYS.state]: 'public' });
        expect(await listIds()).toEqual([RUN_A]);
    });

    it('stamps a fresh revision id on every write', async () => {
        await store.write(RUN_A, payload(), 'public', 'alice');
        const r1 = fake.objects.get(key(RUN_A)).metadata[META_KEYS.revision];
        await store.write(RUN_A, payload(), 'public', 'alice');
        const r2 = fake.objects.get(key(RUN_A)).metadata[META_KEYS.revision];
        expect(r1).toMatch(/^[0-9a-f-]{36}$/);
        expect(r2).not.toBe(r1);
    });
});

describe('S3ResultsStore robustness', () => {
    const key = (id) => `${PREFIX}${id}.v1.json`;

    it('lists free text of any length from the payload, untouched by metadata limits', async () => {
        const { store } = makeStore();
        await store.write(RUN_A, payload({ runLabel: '名'.repeat(4000), well_lit_path: 'p'.repeat(3000) }), 'public', 'alice');
        const [item] = (await store.list({ limit: 1, permission: 'none' })).items;
        expect(item.runLabel).toHaveLength(4000);
    });

    it('skips an object whose payload is not valid JSON instead of failing the listing', async () => {
        const { fake, store } = makeStore();
        await store.write(RUN_A, payload(), 'public', 'alice');
        fake.putRaw(key(RUN_B), '{"runLabel": truncated', { [META_KEYS.state]: 'public' });
        fake.putRaw(key(RUN_C), 'null', { [META_KEYS.state]: 'public' });
        fake.putRaw(key('44444444-5555-4666-8777-888888888888'), '[1,2]', { [META_KEYS.state]: 'public' });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const r = await store.list({ limit: 10, permission: 'none' });
        expect(r.items.map(i => i.runId)).toEqual([RUN_A]);
        expect(warn).toHaveBeenCalledTimes(3);
        warn.mockRestore();
        await expect(store.readPayload(RUN_C)).rejects.toThrow(/not a JSON object/);
    });

    it('a missing bucket is a storage error, not a missing run', async () => {
        const noBucket = Object.assign(new Error('The specified bucket does not exist'), { name: 'NoSuchBucket', $metadata: { httpStatusCode: 404 } });
        const s = new S3ResultsStore({ bucket: 'b', prefix: PREFIX, client: { send: async () => { throw noBucket; } } });
        await expect(s.readPayload(RUN_A)).rejects.toThrow(/does not exist/);
        await expect(s.readPayload(RUN_A)).rejects.not.toHaveProperty('code', 404);
    });

    it('a missing bucket is not reported as a missing run on HEAD either', async () => {
        const s = new S3ResultsStore({ bucket: 'b', prefix: PREFIX, client: { send: async () => {
            throw Object.assign(new Error(''), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
        } } });
        await expect(s.readMetadata(RUN_A)).rejects.toThrow(/bucket 'b' is not reachable: NotFound \(HTTP 404\)/);
    });

    it('reports the error code of network errors that have no message', async () => {
        const refused = Object.assign(new Error(''), { code: 'ECONNREFUSED' });
        const s = new S3ResultsStore({ bucket: 'b', prefix: PREFIX, client: { send: async () => { throw refused; } } });
        await expect(s.readMetadata(RUN_A)).rejects.toThrow(/ECONNREFUSED/);
        await expect(s.list({ limit: 10, permission: 'admin' })).rejects.toThrow(/ECONNREFUSED/);
    });

    it('fetches and logs a corrupt object once per revision, not on every list', async () => {
        const { fake, store } = makeStore();
        fake.putRaw(key(RUN_B), '{bad', { [META_KEYS.state]: 'public', [META_KEYS.revision]: 'r1' });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await store.list({ limit: 10, permission: 'none' });
        fake.resetCalls();
        await store.list({ limit: 10, permission: 'none' });
        expect(fake.calls.filter(c => c.name === 'GetObjectCommand')).toHaveLength(0);
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('a transient body-read failure is an error, not a silently skipped run', async () => {
        const { fake, store } = makeStore();
        await store.write(RUN_A, payload(), 'public', 'alice');
        const orig = fake.client.send.bind(fake.client);
        fake.client.send = async (cmd) => {
            const out = await orig(cmd);
            if (cmd.constructor.name === 'GetObjectCommand') out.Body = { transformToString: async () => { throw Object.assign(new Error('reset'), { name: 'ECONNRESET' }); } };
            return out;
        };
        store.detailsCache.clear();
        await expect(store.list({ limit: 10, permission: 'none' })).rejects.toThrow('reset');
    });

    it('never lists keys whose UUID the API routes would reject (e.g. UUIDv7)', async () => {
        const { fake, store } = makeStore();
        fake.putRaw(key('01933b5e-8a2f-7d4e-9b1c-123456789abc'), payload(), { [META_KEYS.state]: 'public' });
        expect((await store.list({ limit: 10, permission: 'admin' })).items).toEqual([]);
    });
});

describe('S3ResultsStore scan reuse', () => {
    it('one prefix scan serves every page within the window', async () => {
        const { fake, store } = makeStore({}, { summaryTtlMs: 60000 });
        for (const id of [RUN_A, RUN_B, RUN_C]) await store.write(id, payload({ runId: id }), 'public', 'a');
        fake.resetCalls();
        let token; let pages = 0;
        do { const r = await store.list({ limit: 1, permission: 'none', pageToken: token }); token = r.nextPageToken; pages++; } while (token);
        expect(pages).toBe(3);
        const names = fake.calls.map(c => c.name);
        expect(names.filter(n => n === 'ListObjectsV2Command')).toHaveLength(1);
        expect(names.filter(n => n === 'HeadObjectCommand')).toHaveLength(3);
    });

    it('a local write or delete is visible immediately despite the window', async () => {
        const { store } = makeStore({}, { summaryTtlMs: 60000 });
        await store.write(RUN_A, payload(), 'public', 'a');
        expect((await store.list({ limit: 10, permission: 'none' })).items).toHaveLength(1);
        await store.write(RUN_A, payload(), 'rejected', 'a');
        expect((await store.list({ limit: 10, permission: 'none' })).items).toHaveLength(0);
        await store.write(RUN_B, payload({ runId: RUN_B }), 'public', 'b');
        expect((await store.list({ limit: 10, permission: 'none' })).items.map(i => i.runId)).toEqual([RUN_B]);
        await store.delete(RUN_B);
        expect((await store.list({ limit: 10, permission: 'none' })).items).toHaveLength(0);
    });

    it('changes by another process become visible once the window passes', async () => {
        const { fake, store } = makeStore({}, { summaryTtlMs: 40 });
        await store.write(RUN_A, payload(), 'public', 'a');
        expect((await store.list({ limit: 10, permission: 'none' })).items).toHaveLength(1);
        await new S3ResultsStore({ bucket: 'results', prefix: PREFIX, client: fake.client }).write(RUN_A, payload({ feedback: 'no' }), 'rejected', 'a');
        await new Promise(r => setTimeout(r, 60));
        expect((await store.list({ limit: 10, permission: 'none' })).items).toHaveLength(0);
    });

    it('a slow scan is shared while it runs, and its window starts when it finishes', async () => {
        const { fake, store } = makeStore({}, { summaryTtlMs: 30 });
        await store.write(RUN_A, payload(), 'public', 'a');
        const orig = fake.client.send.bind(fake.client);
        fake.client.send = async (cmd) => {
            if (cmd.constructor.name === 'ListObjectsV2Command') await new Promise(r => setTimeout(r, 60));
            return orig(cmd);
        };
        fake.resetCalls();
        const first = store.list({ limit: 10, permission: 'none' });
        await new Promise(r => setTimeout(r, 40)); // past the window, scan still running
        const second = store.list({ limit: 10, permission: 'none' });
        await Promise.all([first, second]);
        await store.list({ limit: 10, permission: 'none' }); // just finished: reused
        expect(fake.calls.filter(c => c.name === 'ListObjectsV2Command')).toHaveLength(1);
    });

    it('a failed scan is not reused', async () => {
        const { fake, store } = makeStore({}, { summaryTtlMs: 60000 });
        await store.write(RUN_A, payload(), 'public', 'a');
        const orig = fake.client.send.bind(fake.client);
        let fail = true;
        fake.client.send = async (cmd) => { if (fail && cmd.constructor.name === 'ListObjectsV2Command') { fail = false; throw new Error('boom'); } return orig(cmd); };
        await expect(store.list({ limit: 10, permission: 'none' })).rejects.toThrow('boom');
        expect((await store.list({ limit: 10, permission: 'none' })).items).toHaveLength(1);
    });
});

describe('S3 client and body reads', () => {
    it('reads a body as text', async () => {
        expect(await readS3Body({ transformToString: async () => 'hi' })).toBe('hi');
        await expect(readS3Body(undefined)).rejects.toThrow(/no body/);
    });

    it('fails and destroys the stream when the body stalls', async () => {
        let destroyed = false;
        const body = { transformToString: () => new Promise(() => {}), destroy: () => { destroyed = true; } };
        await expect(readS3Body(body, 50)).rejects.toThrow(/not received within 50 ms/);
        expect(destroyed).toBe(true);
    });
});
