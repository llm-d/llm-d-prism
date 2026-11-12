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
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { GitHubAuthContext } from '../context/GitHubAuthContext.js';
import { useDashboardData } from '../hooks/useDashboardData.jsx';
import { useDashboardState } from '../hooks/useDashboardState.js';
import { RESULTS_STORE_SOURCE_KEY, GCS_RESULTS_STORE_SOURCE_KEY, parseResultsBundle } from '../utils/resultsStoreLoader.js';

// jsdom here has no Web Storage; the hook persists state to it.
const memoryStorage = () => {
    let store = {};
    return {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
        clear: () => { store = {}; },
        key: i => Object.keys(store)[i] ?? null,
        get length() { return Object.keys(store).length; },
    };
};
for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(window, name, { value: memoryStorage(), configurable: true, writable: true });
    Object.defineProperty(globalThis, name, { value: window[name], configurable: true, writable: true });
}

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
const bundle = (runId, state) => ({
    runId, runLabel: `run ${runId}`, format: 'brv02', submission_state: state,
    model_name: 'meta-llama/Llama-3.1-8B-Instruct', hardware: { hardware_name: 'H100', accelerator_count: 2 },
    entries: [{ filename: 'stage_0.yaml', raw_report: report(0) }]
});
const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });

/** A fake server: `runs` maps runId -> { state, owner }; visibility as the real routes (admin* see all). */
function installServer(runs, { backend = 's3', runDelayMs = 0 } = {}) {
    const calls = [];
    globalThis.fetch = window.fetch = vi.fn(async (url, opts = {}) => {
        const u = String(url);
        const token = opts.headers?.['X-Prism-Github-Token'] || null;
        const caller = token ? token.replace('tok-', '') : null;
        const isAdmin = !!caller?.startsWith('admin');
        calls.push([u, token]);
        if (u === '/api/config') return json({ buckets: [], projects: [], resultsStoreBackend: backend });
        if (u.startsWith('/api/results?')) {
            const own = u.includes('own=true');
            const status = new URL(u, 'http://x').searchParams.get('status');
            const items = Object.entries(runs)
                .filter(([, r]) => status ? r.state === status
                    : own ? r.owner === caller
                    : r.state !== 'unlisted' && (isAdmin || ['public', 'promoted'].includes(r.state) || r.owner === caller))
                .map(([runId, r]) => ({ runId, state: r.state, github_author: { username: r.owner } }));
            return json({ items, nextPageToken: null });
        }
        const m = u.match(/^\/api\/results\/([\w-]+)$/);
        if (m) {
            if (runDelayMs) await new Promise(r => setTimeout(r, runDelayMs));
            const r = runs[m[1]];
            if (!r) return json({ error: 'not found' }, 404);
            if (!['public', 'promoted', 'unlisted'].includes(r.state) && r.owner !== caller && !isAdmin) return json({ error: 'forbidden' }, 403);
            return json(bundle(m[1], r.state));
        }
        return json({});
    });
    return calls;
}

function renderWithToken(token) {
    let auth = { user: token ? { username: token.replace('tok-', ''), permission: 'user' } : null, accessToken: token, isAuthenticated: !!token, isLoading: false, isPlaygroundMode: false };
    const wrapper = ({ children }) => <GitHubAuthContext.Provider value={auth}>{children}</GitHubAuthContext.Provider>;
    // Wired as App.jsx does.
    const hook = renderHook(() => {
        const dashboardState = useDashboardState();
        return useDashboardData(dashboardState.initialState, dashboardState);
    }, { wrapper });
    const setToken = (t) => {
        auth = { ...auth, accessToken: t, user: t ? { username: t.replace('tok-', ''), permission: 'user' } : null, isAuthenticated: !!t };
        hook.rerender();
    };
    return { ...hook, setToken };
}

const storeTask = (result) => result.current.loadingTasks?.[RESULTS_STORE_SOURCE_KEY]?.status;
const storeRuns = (result, sourceKey = RESULTS_STORE_SOURCE_KEY) => [...new Set(result.current.data.filter(d => d.source === sourceKey).map(d => `${d.run_id}:${d.source_info?.submission_state}`))].sort();

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe('useDashboardData with the S3 Results Store', () => {
    it("keeps a run in its owner's table after it is withdrawn (unlisted)", async () => {
        const runs = { r1: { state: 'public', owner: 'alice' }, r2: { state: 'public', owner: 'bob' } };
        installServer(runs);
        const { result } = renderWithToken('tok-alice');
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { await result.current.loadAllData(null, true); });
        await waitFor(() => expect(storeRuns(result)).toEqual(['r1:public', 'r2:public']));
        expect(storeTask(result)).toBe('completed');

        runs.r1.state = 'unlisted'; // withdrawn by alice
        await act(async () => { await result.current.loadAllData(null, true); });
        await waitFor(() => expect(storeRuns(result)).toEqual(['r1:unlisted', 'r2:public']));
        expect(storeTask(result)).toBe('completed');
    });

    it('re-checks runs fetched with a token that is no longer current (any backend), instead of dropping them', async () => {
        // GCS backend (no Results Store reload on token change) and an admin viewing
        // someone else's pending run: nothing but the re-check can add it. The re-check's
        // response is delayed, so the call must wait for it.
        const runs = { pend: { state: 'submitted_pending_review', owner: 'bob' }, pub: { state: 'public', owner: 'bob' } };
        const calls = installServer(runs, { backend: 'gcs', runDelayMs: 30 });
        const { result } = renderWithToken('tok-admin');
        await act(async () => { await result.current.fetchConfig(); });
        const entries = ['pend', 'pub'].flatMap(id => parseResultsBundle(bundle(id, runs[id].state), { sourceKey: GCS_RESULTS_STORE_SOURCE_KEY }));

        // Fetched before a token refresh: the public run is added at once, the pending
        // one after re-fetching it with the current token.
        await act(async () => { await result.current.injectDynamicEntries(entries, { token: 'tok-admin-old' }); });
        // Resolved only once the re-checked run is in.
        expect(storeRuns(result, GCS_RESULTS_STORE_SOURCE_KEY)).toEqual(['pend:submitted_pending_review', 'pub:public']);
        expect(calls).toContainEqual(['/api/results/pend', 'tok-admin']);
        expect(calls).not.toContainEqual(['/api/results/pub', 'tok-admin']);
    });

    it('does not show a private run fetched before logout', async () => {
        const runs = { pend: { state: 'submitted_pending_review', owner: 'alice' } };
        installServer(runs);
        const { result, setToken } = renderWithToken('tok-alice');
        await act(async () => { await result.current.fetchConfig(); });
        const entries = parseResultsBundle(bundle('pend', 'submitted_pending_review'), { sourceKey: RESULTS_STORE_SOURCE_KEY });

        await act(async () => { setToken(null); });
        await act(async () => { result.current.injectDynamicEntries(entries, { token: 'tok-alice' }); });
        await act(async () => { await new Promise(r => setTimeout(r, 20)); });
        expect(storeRuns(result)).toEqual([]);
    });

    it('starts the re-check over if the token changes again while it is in flight', async () => {
        const runs = { pend: { state: 'submitted_pending_review', owner: 'bob' } };
        const calls = installServer(runs, { backend: 'gcs' });
        const { result, setToken } = renderWithToken('tok-admin');
        await act(async () => { await result.current.fetchConfig(); });
        const serve = globalThis.fetch;
        // Hold the re-check made with tok-admin; it is answered 403 only after the token
        // became tok-admin2 (another admin, not the owner, so hydration doesn't add the run).
        let release;
        const held = new Promise(r => { release = r; });
        globalThis.fetch = window.fetch = vi.fn(async (url, opts = {}) => {
            if (String(url) === '/api/results/pend' && opts.headers?.['X-Prism-Github-Token'] === 'tok-admin') {
                calls.push([String(url), 'tok-admin']);
                await held;
                return json({ error: 'forbidden' }, 403);
            }
            return serve(url, opts);
        });
        const entries = parseResultsBundle(bundle('pend', 'submitted_pending_review'), { sourceKey: GCS_RESULTS_STORE_SOURCE_KEY });
        let injected;
        act(() => { injected = result.current.injectDynamicEntries(entries, { token: 'tok-old' }); });
        await waitFor(() => expect(calls).toContainEqual(['/api/results/pend', 'tok-admin']));
        await act(async () => { setToken('tok-admin2'); });
        release();
        await act(async () => { await injected; });
        expect(calls).toContainEqual(['/api/results/pend', 'tok-admin2']);
        expect(storeRuns(result, GCS_RESULTS_STORE_SOURCE_KEY)).toEqual(['pend:submitted_pending_review']);
    });
});
