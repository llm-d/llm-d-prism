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

import { describe, it, expect, vi } from 'vitest';
import {
    loadResultsStoreRuns,
    parseResultsBundle,
    getResultsStoreSourceKey,
    RESULTS_STORE_SOURCE_KEY,
    GCS_RESULTS_STORE_SOURCE_KEY
} from './resultsStoreLoader';

const report = (stage) => ({
    version: '0.2',
    run: { uid: `u${stage}`, eid: 'e1' },
    scenario: { stack: [{ standardized: { tool: 'vllm', model: { name: 'meta-llama/Llama-3.1-8B-Instruct' }, accelerator: { model: 'H100', count: 2 } } }] },
    workload: { stage },
    results: { request_performance: { aggregate: {
        requests: { total: 10, failures: 0 },
        throughput: { output_token_rate: { mean: 100 + stage, units: 'tokens/s' } },
        latency: { time_to_first_token: { mean: 0.1, units: 's' } }
    } } }
});

const bundle = (runId, stages = 2) => ({
    runId,
    runLabel: `run ${runId}`,
    format: 'brv02',
    model_name: 'meta-llama/Llama-3.1-8B-Instruct',
    hardware: { hardware_name: 'H100', accelerator_count: 2 },
    entries: Array.from({ length: stages }, (_, i) => ({ filename: `stage_${i}.yaml`, raw_report: report(i) }))
});

function jsonResponse(body, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('getResultsStoreSourceKey', () => {
    it('uses the historical GCS key unless the backend is s3', () => {
        expect(getResultsStoreSourceKey(null)).toBe(GCS_RESULTS_STORE_SOURCE_KEY);
        expect(getResultsStoreSourceKey({ resultsStoreBackend: 'gcs' })).toBe(GCS_RESULTS_STORE_SOURCE_KEY);
        expect(getResultsStoreSourceKey({ resultsStoreBackend: 's3' })).toBe(RESULTS_STORE_SOURCE_KEY);
    });
});

describe('parseResultsBundle', () => {
    it('emits one entry per stage, tagged with the run id, source and authoritative state', () => {
        const entries = parseResultsBundle({ ...bundle('r1'), submission_state: 'public' }, { sourceKey: 'results:store', state: 'unlisted' });
        expect(entries).toHaveLength(2);
        for (const e of entries) {
            expect(e.run_id).toBe('r1');
            expect(e.source).toBe('results:store');
            expect(e.source_info).toMatchObject({ type: 'benchmark_report_v02', origin: 'results:store', submission_state: 'unlisted', file_identifier: 'r1' });
        }
    });

    it('falls back to the payload state, then public', () => {
        expect(parseResultsBundle({ ...bundle('r1', 1), submission_state: 'rejected' }, { sourceKey: 's' })[0].source_info.submission_state).toBe('rejected');
        expect(parseResultsBundle(bundle('r1', 1), { sourceKey: 's' })[0].source_info.submission_state).toBe('public');
    });

    it('keeps the historical minimal source_info on GCS and the stage dates on S3', () => {
        const payload = { ...bundle('r1', 1), submitted_at: '2026-01-01T00:00:00Z' };
        expect(parseResultsBundle(payload, { sourceKey: GCS_RESULTS_STORE_SOURCE_KEY })[0].source_info).toEqual({
            type: 'benchmark_report_v02', origin: GCS_RESULTS_STORE_SOURCE_KEY, submission_state: 'public', file_identifier: 'r1'
        });
        expect(parseResultsBundle(payload, { sourceKey: RESULTS_STORE_SOURCE_KEY })[0].source_info.submitted_at).toBe('2026-01-01T00:00:00Z');
    });

    it('uses the runId option when the payload has none', () => {
        const [e] = parseResultsBundle({ ...bundle('r1', 1), runId: undefined }, { sourceKey: 's', runId: 'fallback' });
        expect(e.run_id).toBe('fallback');
        expect(e.source_info.file_identifier).toBe('fallback');
    });

    it('ignores malformed payloads and stages', () => {
        expect(parseResultsBundle(null, { sourceKey: 's' })).toEqual([]);
        expect(parseResultsBundle({ entries: 'x' }, { sourceKey: 's' })).toEqual([]);
        expect(parseResultsBundle({ runId: 'r', entries: [null, {}, { raw_report: null }] }, { sourceKey: 's' })).toEqual([]);
    });
});

describe('loadResultsStoreRuns', () => {
    it('pages through the list, fetches each run once, and falls back to list state', async () => {
        const fetchFn = vi.fn(async (url) => {
            if (url === '/api/results?limit=2') return jsonResponse({ items: [{ runId: 'a', state: 'public' }, { runId: 'b', state: 'promoted' }], nextPageToken: 'T1' });
            if (url === '/api/results?limit=2&pageToken=T1') return jsonResponse({ items: [{ runId: 'b', state: 'promoted' }, { runId: 'c', state: 'submitted_pending_review' }], nextPageToken: null });
            const m = url.match(/^\/api\/results\/(\w+)$/);
            if (m) return jsonResponse(bundle(m[1], 1));
            throw new Error(`unexpected ${url}`);
        });
        const r = await loadResultsStoreRuns({ fetchFn, pageLimit: 2 });
        expect(r).toMatchObject({ runs: 3, failed: 0, error: null });
        expect(r.entries.map(e => [e.run_id, e.source_info.submission_state])).toEqual([['a', 'public'], ['b', 'promoted'], ['c', 'submitted_pending_review']]);
        expect(fetchFn.mock.calls.filter(([u]) => u === '/api/results/b')).toHaveLength(1);
    });

    it("prefers the run's own state from GET over the (older) list state", async () => {
        const fetchFn = vi.fn(async (url) => url.startsWith('/api/results?')
            ? jsonResponse({ items: [{ runId: 'a', state: 'public' }], nextPageToken: null })
            : jsonResponse({ ...bundle('a', 1), submission_state: 'unlisted' }));
        const r = await loadResultsStoreRuns({ fetchFn });
        expect(r.entries.map(e => e.source_info.submission_state)).toEqual(['unlisted']);
    });

    it('lists like the GCS dashboard: general; plus own runs when signed in; plus all unlisted for admins', async () => {
        const urls = async (opts) => {
            const fetchFn = vi.fn(async () => jsonResponse({ items: [], nextPageToken: null }));
            await loadResultsStoreRuns({ fetchFn, ...opts });
            return fetchFn.mock.calls.map(([u, o]) => [u, o.headers['X-Prism-Github-Token'] || null]);
        };
        expect(await urls({})).toEqual([['/api/results?limit=100', null]]);
        expect(await urls({ token: 'tok' })).toEqual([['/api/results?limit=100', 'tok'], ['/api/results?own=true&limit=100', 'tok']]);
        expect(await urls({ token: 'tok', allUnlisted: true })).toEqual([
            ['/api/results?limit=100', 'tok'], ['/api/results?own=true&limit=100', 'tok'], ['/api/results?status=unlisted&limit=100', 'tok']
        ]);
        expect(await urls({ allUnlisted: true })).toEqual([['/api/results?limit=100', null], ['/api/results?status=unlisted&limit=100', null]]);
    });

    it("keeps the caller's own withdrawn (unlisted) runs, which the general listing omits", async () => {
        const fetchFn = vi.fn(async (url) => {
            if (url.startsWith('/api/results?own=true')) return jsonResponse({ items: [{ runId: 'mine', state: 'unlisted' }] });
            if (url.startsWith('/api/results?')) return jsonResponse({ items: [{ runId: 'pub', state: 'public' }] });
            const id = url.split('/').pop();
            return jsonResponse({ ...bundle(id, 1), submission_state: id === 'mine' ? 'unlisted' : 'public' });
        });
        const r = await loadResultsStoreRuns({ fetchFn, token: 'tok' });
        expect(r.entries.map(e => [e.run_id, e.source_info.submission_state]).sort()).toEqual([['mine', 'unlisted'], ['pub', 'public']]);
    });

    it('keeps the general listing when another listing fails, and reports it', async () => {
        const fetchFn = vi.fn(async (url) => {
            if (url.startsWith('/api/results?status=unlisted')) return jsonResponse({ error: 'S3 timeout' }, 500);
            if (url.startsWith('/api/results?own=true')) throw new Error('network down');
            if (url.startsWith('/api/results?')) return jsonResponse({ items: [{ runId: 'pub', state: 'public' }] });
            return jsonResponse(bundle('pub', 1));
        });
        const r = await loadResultsStoreRuns({ fetchFn, token: 'tok', allUnlisted: true });
        expect(r).toMatchObject({ runs: 1, error: null });
        expect(r.partialError).toMatch(/S3 timeout|network down/);
        expect(r.failedListings.sort()).toEqual(['own', 'unlisted']);
        expect(r.entries.map(e => e.run_id)).toEqual(['pub']);
    });

    it('fetches public and unlisted runs without the token, others with it, and retries a run that stopped being open', async () => {
        const fetchFn = vi.fn(async (url, { headers }) => {
            if (url.startsWith('/api/results?')) {
                return jsonResponse({ items: url.includes('own=true') ? [{ runId: 'unl', state: 'unlisted' }] : [
                    { runId: 'pub', state: 'public' }, { runId: 'pending', state: 'submitted_pending_review' }, { runId: 'flipped', state: 'public' }
                ] });
            }
            const id = url.split('/').pop();
            if (id === 'flipped' && !headers['X-Prism-Github-Token']) return jsonResponse({ error: 'forbidden' }, 403);
            return jsonResponse(bundle(id, 1));
        });
        const r = await loadResultsStoreRuns({ fetchFn, token: 'tok' });
        expect(r).toMatchObject({ runs: 4, failed: 0 });
        const runCalls = fetchFn.mock.calls.filter(([u]) => !u.includes('?')).map(([u, o]) => [u.split('/').pop(), !!o.headers['X-Prism-Github-Token']]);
        expect(runCalls).toEqual(expect.arrayContaining([['pub', false], ['unl', false], ['pending', true], ['flipped', false], ['flipped', true]]));
        expect(runCalls).toHaveLength(5);
    });

    it('reports a list failure with the server message and returns no entries', async () => {
        const fetchFn = async () => jsonResponse({ error: 'Results Store is not configured' }, 503);
        expect(await loadResultsStoreRuns({ fetchFn })).toEqual({ entries: [], runs: 0, failed: 0, truncated: false, partialError: null, failedListings: [], error: 'Results Store is not configured' });
    });

    it('counts runs that fail to load without failing the whole load', async () => {
        const fetchFn = async (url) => {
            if (url.startsWith('/api/results?')) return jsonResponse({ items: [{ runId: 'a', state: 'public' }, { runId: 'b', state: 'public' }] });
            if (url === '/api/results/a') return jsonResponse({ error: 'gone' }, 404);
            if (url === '/api/results/b') return jsonResponse(bundle('b', 1));
        };
        const r = await loadResultsStoreRuns({ fetchFn });
        expect(r.runs).toBe(2);
        expect(r.failed).toBe(1);
        expect(r.entries.map(e => e.run_id)).toEqual(['b']);
    });

    it('stops after maxPages and reports the load as truncated', async () => {
        const fetchFn = vi.fn(async (url) => url.startsWith('/api/results?')
            ? jsonResponse({ items: [], nextPageToken: 'again' })
            : jsonResponse(bundle('x', 1)));
        const r = await loadResultsStoreRuns({ fetchFn, maxPages: 3 });
        expect(fetchFn).toHaveBeenCalledTimes(3);
        expect(r).toMatchObject({ truncated: true, error: null });
        const done = await loadResultsStoreRuns({ fetchFn: async () => jsonResponse({ items: [], nextPageToken: null }) });
        expect(done.truncated).toBe(false);
    });
});

describe('revalidateResultsStoreRuns', () => {
    it('returns fresh entries for visible runs and drops deleted or hidden ones', async () => {
        const { revalidateResultsStoreRuns } = await import('./resultsStoreLoader');
        const fetchFn = async (url) => {
            if (url === '/api/results/ok') return jsonResponse({ ...bundle('ok', 1), submission_state: 'unlisted' });
            if (url === '/api/results/gone') return jsonResponse({ error: 'Result not found' }, 404);
            if (url === '/api/results/hidden') return jsonResponse({ error: 'denied' }, 403);
            throw new Error('network');
        };
        const { entries, unverified } = await revalidateResultsStoreRuns(['ok', 'gone', 'hidden', 'boom', 'flaky'], {
            fetchFn: async (url) => (url === '/api/results/flaky' ? jsonResponse({ error: 'busy' }, 503) : fetchFn(url))
        });
        expect(entries.map(e => [e.run_id, e.source_info.submission_state, e._dynamicallyInjected]))
            .toEqual([['ok', 'unlisted', true]]);
        // Network errors and 5xx are "could not check", not "gone".
        expect(unverified.sort()).toEqual(['boom', 'flaky']);
    });
});
