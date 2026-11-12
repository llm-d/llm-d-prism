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

/**
 * End-to-end route tests with RESULTS_STORE_BACKEND=s3 against an in-memory S3.
 * Exercises the real route handlers, processing, listing and IAM code paths; only
 * GitHub token validation is stubbed.
 */

/* global process */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../server/oauth.ts', () => ({
    validateGitHubToken: vi.fn()
}));

import { validateGitHubToken } from '../../server/oauth.ts';
import { submitResultsHandler } from '../../server/results/routes/submit.ts';
import { listResultsHandler } from '../../server/results/routes/list.ts';
import { getResultsHandler } from '../../server/results/routes/get.ts';
import { reviewResultsHandler } from '../../server/results/routes/review.ts';
import { promoteResultsHandler } from '../../server/results/routes/promote.ts';
import { deleteResultsHandler } from '../../server/results/routes/delete.ts';
import { exportResultsHandler } from '../../server/results/routes/export.ts';
import { S3ResultsStore, META_KEYS, decodeMetaValue } from '../../server/results/store/s3.ts';
import { setS3ResultsStoreForTesting, getS3ResultsStore } from '../../server/results/store/active.ts';
import { createFakeS3 } from '../../server/results/store/fakeS3.js';
import { validateGitHubUser } from '../../server/iam.ts';
import { resolveS3ResultsStore } from '../../server/results/backend.ts';

const ENV_KEYS = [
    'RESULTS_STORE_BACKEND',
    'RESULTS_STORE_BUCKET',
    'RESULTS_STORE_S3_ENDPOINT',
    'RESULTS_STORE_S3_REGION',
    'RESULTS_STORE_S3_FORCE_PATH_STYLE',
    'RESULTS_STORE_PLAYGROUND_MODE',
    'DEFAULT_BUCKETS'
];

function validPayload(overrides = {}) {
    const runLabel = overrides.runLabel ?? 'Llama 70B H100';
    return {
        runId: 'client-supplied-id',
        runLabel,
        model_name: 'meta-llama/Llama-3.1-70B-Instruct',
        hardware: { hardware_name: 'H100', accelerator_count: 8 },
        format: 'brv02',
        entries: [
            {
                run_id: 'client-entry',
                run_description: runLabel,
                filename: 'stage_0.yaml',
                prism_stage_index: 0,
                raw_report: {
                    version: '0.2',
                    workload: { stage: 0 },
                    scenario: {
                        stack: [{
                            standardized: {
                                tool: 'vllm',
                                model: { name: 'meta-llama/Llama-3.1-70B-Instruct' },
                                accelerator: { model: 'H100', count: 8 }
                            }
                        }]
                    },
                    results: {
                        request_performance: {
                            aggregate: {
                                requests: { total: 100, failures: 0 },
                                throughput: { output_token_rate: { mean: 450, units: 'tokens/s' } },
                                latency: {
                                    request_latency: { mean: 1.2, units: 's' },
                                    time_to_first_token: { mean: 0.08, units: 's' },
                                    time_per_output_token: { mean: 0.015, units: 's/token' }
                                }
                            }
                        }
                    }
                }
            }
        ],
        ...overrides
    };
}

function call(handler, { token = 'tok', body = {}, query = {}, params = {} } = {}) {
    const headers = { host: 'prism.example' };
    if (token) headers['x-prism-github-token'] = token;
    const req = { method: 'GET', headers, body, query, params, get: (h) => headers[h.toLowerCase()] };
    const res = {
        statusCode: 200,
        body: null,
        headers: {},
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
        send(b) { this.body = b; return this; },
        setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
        end() { return this; }
    };
    return handler(req, res).then(() => res);
}

function asUser(username, permission) {
    vi.mocked(validateGitHubToken).mockResolvedValue({ username, permission });
}

/** Clears ENV_KEYS before each test of the enclosing describe and restores them after. */
function useCleanEnv() {
    let saved;
    beforeEach(() => {
        saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
        ENV_KEYS.forEach(k => delete process.env[k]);
    });
    afterEach(() => {
        ENV_KEYS.forEach(k => {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        });
    });
}

describe('S3 Results Store backend (routes)', () => {
    let fake;
    useCleanEnv();

    beforeEach(() => {
        process.env.RESULTS_STORE_BACKEND = 's3';
        process.env.RESULTS_STORE_BUCKET = 'prism-results';
        // S3-only deployments set DEFAULT_BUCKETS='' explicitly; listing must still work.
        process.env.DEFAULT_BUCKETS = '';
        fake = createFakeS3();
        setS3ResultsStoreForTesting(new S3ResultsStore({ bucket: 'prism-results', prefix: 'prism-results-store/', client: fake.client }));
        vi.mocked(validateGitHubToken).mockReset();
    });

    afterEach(() => setS3ResultsStoreForTesting(null));

    async function submit(user = 'alice', overrides = {}, query = {}) {
        asUser(user, 'user');
        const res = await call(submitResultsHandler, { body: validPayload(overrides), query });
        expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
        return res.body.runId;
    }

    it('submit stores the run in S3 under a server-generated UUID, pending review, owned by the caller', async () => {
        const runId = await submit('alice');
        expect(runId).toMatch(/^[0-9a-f-]{36}$/);
        const obj = fake.objects.get(`prism-results-store/${runId}.v1.json`);
        expect(obj.metadata[META_KEYS.state]).toBe('submitted_pending_review');
        expect(decodeMetaValue(obj.metadata[META_KEYS.user])).toBe('alice');
        expect(JSON.parse(obj.body).runId).toBe(runId);
    });

    it('invalid submissions are rejected and leave nothing behind', async () => {
        asUser('alice', 'user');
        const res = await call(submitResultsHandler, { body: validPayload({ runLabel: '' }) });
        expect(res.statusCode).toBe(400);
        expect(fake.objects.size).toBe(0);
    });

    it('the full lifecycle works: pending → public (admin) → withdrawn → deleted', async () => {
        const runId = await submit('alice');

        // Hidden from anonymous users while pending.
        let list = await call(listResultsHandler, { token: null });
        expect(list.body.items).toHaveLength(0);
        expect((await call(getResultsHandler, { token: null, params: { runId } })).statusCode).toBe(403);

        // The owner sees it.
        asUser('alice', 'user');
        list = await call(listResultsHandler, { query: { own: 'true' } });
        expect(list.body.items.map(i => i.runId)).toEqual([runId]);

        // A non-admin cannot review.
        asUser('mallory', 'user');
        expect((await call(reviewResultsHandler, { params: { runId }, body: { status: 'public' } })).statusCode).toBe(403);

        // Admin approves.
        asUser('root', 'admin');
        const reviewed = await call(reviewResultsHandler, { params: { runId }, body: { status: 'public', feedback: 'LGTM' } });
        expect(reviewed.statusCode, JSON.stringify(reviewed.body)).toBe(200);

        // Now public: visible to everyone, owner preserved, feedback from the payload.
        list = await call(listResultsHandler, { token: null });
        expect(list.body.items).toHaveLength(1);
        expect(list.body.items[0]).toMatchObject({ runId, state: 'public', github_author: { username: 'alice' }, feedback: 'LGTM' });
        const got = await call(getResultsHandler, { token: null, params: { runId } });
        expect(got.statusCode).toBe(200);
        expect(got.body.review.history.map(h => h.status)).toEqual(['public']);

        // Export works for anonymous viewers of a public run.
        const exported = await call(exportResultsHandler, { token: null, params: { runId }, query: { format: 'yaml' } });
        expect(exported.statusCode).toBe(200);

        // Owner withdraws: public → unlisted (not deleted).
        asUser('alice', 'user');
        expect((await call(deleteResultsHandler, { params: { runId } })).statusCode).toBe(200);
        expect(fake.objects.get(`prism-results-store/${runId}.v1.json`).metadata[META_KEYS.state]).toBe('unlisted');
        expect((await call(listResultsHandler, { token: null })).body.items).toHaveLength(0);

        // Deleting an unlisted run removes the object.
        expect((await call(deleteResultsHandler, { params: { runId } })).statusCode).toBe(200);
        expect(fake.objects.size).toBe(0);
        expect((await call(getResultsHandler, { token: null, params: { runId } })).statusCode).toBe(404);
    });

    it('unlisted submissions skip review and the owner can promote them to review', async () => {
        const runId = await submit('alice', {}, { targetState: 'unlisted' });
        expect(fake.objects.get(`prism-results-store/${runId}.v1.json`).metadata[META_KEYS.state]).toBe('unlisted');

        asUser('bob', 'user');
        expect((await call(promoteResultsHandler, { params: { runId }, body: {} })).statusCode).toBe(403);

        asUser('alice', 'user');
        const promoted = await call(promoteResultsHandler, { params: { runId }, body: {} });
        expect(promoted.statusCode, JSON.stringify(promoted.body)).toBe(200);
        expect(fake.objects.get(`prism-results-store/${runId}.v1.json`).metadata[META_KEYS.state]).toBe('submitted_pending_review');
    });

    it('an experiment_id the S3 store cannot hold is a 400, not a storage failure', async () => {
        asUser('alice', 'user');
        const res = await call(submitResultsHandler, { body: validPayload({ experiment_id: 'x'.repeat(129) }) });
        expect(res.statusCode).toBe(400);
        expect(fake.objects.size).toBe(0);
    });

    it('non-admins cannot publish directly', async () => {
        asUser('alice', 'user');
        const res = await call(submitResultsHandler, { body: validPayload(), query: { targetState: 'public' } });
        expect(res.statusCode).toBe(403);
        expect(fake.objects.size).toBe(0);
    });

    it('playground mode: anonymous submit with a self-declared author', async () => {
        process.env.RESULTS_STORE_PLAYGROUND_MODE = '1';
        const res = await call(submitResultsHandler, { token: null, body: validPayload({ github_author: { username: '  Zoë 李  ' } }) });
        expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
        const obj = fake.objects.get(`prism-results-store/${res.body.runId}.v1.json`);
        expect(decodeMetaValue(obj.metadata[META_KEYS.user])).toBe('Zoë 李');
        expect(JSON.parse(obj.body).github_author).toEqual({ username: 'Zoë 李', playground: true });
    });

    it('playground mode: an author name over 100 characters is a 400 on S3', async () => {
        process.env.RESULTS_STORE_PLAYGROUND_MODE = '1';
        const res = await call(submitResultsHandler, { token: null, body: validPayload({ github_author: { username: 'x'.repeat(101) } }) });
        expect(res.statusCode).toBe(400);
        expect(fake.objects.size).toBe(0);
    });

    it('returns 503 (not 500, and never GCS) when the S3 backend is misconfigured', async () => {
        setS3ResultsStoreForTesting(null);
        delete process.env.RESULTS_STORE_BUCKET;
        process.env.DEFAULT_BUCKETS = 'some-gcs-bucket';
        const list = await call(listResultsHandler, { token: null });
        expect(list.statusCode).toBe(503);
        asUser('alice', 'user');
        const sub = await call(submitResultsHandler, { body: validPayload() });
        expect(sub.statusCode).toBe(503);
        const runId = '11111111-2222-4333-8444-555555555555';
        expect((await call(getResultsHandler, { token: null, params: { runId } })).statusCode).toBe(503);
    });
});

describe('IAM allowlists', () => {
    let fake;
    useCleanEnv();
    beforeEach(() => {
        fake = createFakeS3();
        setS3ResultsStoreForTesting(new S3ResultsStore({ bucket: 'prism-results', prefix: 'prism-results-store/', client: fake.client }));
    });
    afterEach(() => setS3ResultsStoreForTesting(null));

    it('reads allowlist files from the S3 store bucket', async () => {
        process.env.RESULTS_STORE_BACKEND = 's3';
        fake.putRaw('prism-iam/github-admin-allowlist.txt', 'root\n');
        fake.putRaw('prism-iam/github-user-allowlist.txt', '# users\nAlice\n');
        expect(await validateGitHubUser('ROOT')).toBe('admin');
        expect(await validateGitHubUser('alice')).toBe('user');
        expect(await validateGitHubUser('mallory')).toBe('none');
    });

    it('missing allowlist files mean no allowlist role', async () => {
        process.env.RESULTS_STORE_BACKEND = 's3';
        expect(await validateGitHubUser('alice')).toBe('none');
    });

    it('fails closed when the store errors', async () => {
        process.env.RESULTS_STORE_BACKEND = 's3';
        fake.client.send = async () => { throw new Error('network down'); };
        expect(await validateGitHubUser('alice')).toBe('none');
    });

    it('playground mode grants admin regardless of lists', async () => {
        process.env.RESULTS_STORE_PLAYGROUND_MODE = 'true';
        expect(await validateGitHubUser('anyone')).toBe('admin');
    });
});

describe('S3 store configuration', () => {
    useCleanEnv();

    it('reads the bucket and prefix from RESULTS_STORE_BUCKET, as on GCS', () => {
        process.env.RESULTS_STORE_BUCKET = 'prism-results';
        expect(resolveS3ResultsStore()).toEqual({
            ok: true,
            location: { bucket: 'prism-results', prefix: 'prism-results-store/', endpoint: undefined, region: 'us-east-1', forcePathStyle: false }
        });
        process.env.RESULTS_STORE_BUCKET = 's3://prism-results/team-a/results/';
        expect(resolveS3ResultsStore()).toMatchObject({ ok: true, location: { bucket: 'prism-results', prefix: 'team-a/results/' } });
    });

    it('reads endpoint, region and path style', () => {
        process.env.RESULTS_STORE_BUCKET = 'b';
        process.env.RESULTS_STORE_S3_ENDPOINT = ' https://s3.us-south.cloud-object-storage.appdomain.cloud ';
        process.env.RESULTS_STORE_S3_REGION = 'us-south';
        process.env.RESULTS_STORE_S3_FORCE_PATH_STYLE = 'TRUE';
        expect(resolveS3ResultsStore()).toMatchObject({
            ok: true,
            location: { endpoint: 'https://s3.us-south.cloud-object-storage.appdomain.cloud', region: 'us-south', forcePathStyle: true }
        });
    });

    it('requires RESULTS_STORE_BUCKET: no fallback to DEFAULT_BUCKETS or the GCS default bucket', () => {
        process.env.DEFAULT_BUCKETS = 'gcs-bucket';
        expect(resolveS3ResultsStore()).toEqual({ ok: false, reason: 'RESULTS_STORE_BUCKET is not set.' });
        process.env.RESULTS_STORE_BUCKET = '  ';
        expect(resolveS3ResultsStore().ok).toBe(false);
    });

    it('builds the store from the environment once', () => {
        process.env.RESULTS_STORE_BACKEND = 's3';
        process.env.RESULTS_STORE_BUCKET = 'bucket-a/x';
        const a = getS3ResultsStore();
        expect([a.bucket, a.prefix]).toEqual(['bucket-a', 'x/']);
        expect(getS3ResultsStore()).toBe(a);
    });
});
