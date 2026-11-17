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

/**
 * A fake server: `runs` maps runId -> { state, owner, rev?, unlistedFromListings?, getStatus? };
 * visibility as the real routes (admin* see all). `signals` records each request's AbortSignal.
 */
function installServer(runs, { backend = 's3', playground = false, listDelayMs = 0, localDelayMs = () => 0, failList = () => false, ignoreAbort = false, getDelayMs = () => 0 } = {}) {
    const calls = [];
    calls.signals = [];
    globalThis.fetch = window.fetch = vi.fn(async (url, opts = {}) => {
        const u = String(url);
        const token = opts.headers?.['X-Prism-Github-Token'] || null;
        const caller = token ? token.replace('tok-', '').split('#')[0] : null; // 'tok-alice#2' = alice, refreshed
        const isAdmin = playground || !!caller?.startsWith('admin');
        calls.push([u, token]);
        calls.signals.push([u, opts.signal]);
        if (u === '/api/config') return json({ buckets: [], projects: [], resultsStoreBackend: backend, playgroundMode: playground });
        if (u.startsWith('/api/local/list')) {
            const delay = localDelayMs();
            if (delay) await new Promise(r => setTimeout(r, delay));
            return json({ files: [] });
        }
        if (u.startsWith('/api/results?')) {
            const delay = typeof listDelayMs === 'function' ? listDelayMs(u, token) : listDelayMs;
            if (delay) await new Promise(r => setTimeout(r, delay));
            if (opts.signal?.aborted && !ignoreAbort) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
            if (failList(u)) return json({ error: 'listing failed' }, 500);
            const own = u.includes('own=true');
            const status = new URL(u, 'http://x').searchParams.get('status');
            const items = Object.entries(runs)
                .filter(([, r]) => !r.unlistedFromListings)
                .filter(([, r]) => status ? r.state === status
                    : own ? r.owner === caller
                    : r.state !== 'unlisted' && (isAdmin || ['public', 'promoted'].includes(r.state) || r.owner === caller))
                .map(([runId, r]) => ({ runId, state: r.state, github_author: { username: r.owner }, revision: r.rev ?? r.state }));
            return json({ items, nextPageToken: null });
        }
        const m = u.match(/^\/api\/results\/([\w-]+)$/);
        if (m) {
            const getDelay = getDelayMs(m[1]);
            if (getDelay) await new Promise(r => setTimeout(r, getDelay));
            const r = runs[m[1]];
            if (!r) return json({ error: 'not found' }, 404);
            if (r.getStatus) return json({ error: 'unavailable' }, r.getStatus);
            if (!['public', 'promoted', 'unlisted'].includes(r.state) && r.owner !== caller && !isAdmin) return json({ error: 'forbidden' }, 403);
            return json(bundle(m[1], r.state));
        }
        return json({});
    });
    return calls;
}

const userFor = (t) => {
    if (!t) return null;
    const username = t.replace('tok-', '').split('#')[0];
    return { username, permission: username.startsWith('admin') ? 'admin' : 'user' };
};

function renderWithToken(token, { playground = false, authLoading = false } = {}) {
    let auth = { user: authLoading ? null : userFor(token), accessToken: token, isAuthenticated: !!token, isLoading: authLoading, isPlaygroundMode: playground };
    const wrapper = ({ children }) => <GitHubAuthContext.Provider value={auth}>{children}</GitHubAuthContext.Provider>;
    // Wired as App.jsx does.
    const hook = renderHook(() => {
        const dashboardState = useDashboardState();
        return { ...useDashboardData(dashboardState.initialState, dashboardState), selectedBenchmarks: dashboardState.selectedBenchmarks };
    }, { wrapper });
    const setToken = (t) => {
        auth = { ...auth, accessToken: t, user: userFor(t), isAuthenticated: !!t };
        hook.rerender();
    };
    const setUser = (user) => { auth = { ...auth, user }; hook.rerender(); };
    const resolveAuth = () => { auth = { ...auth, isLoading: false, user: userFor(auth.accessToken) }; hook.rerender(); };
    return { ...hook, setToken, setUser, resolveAuth };
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

    it('keeps a withdrawn run in the table when an admin withdraws someone else\'s run', async () => {
        const runs = { r1: { state: 'public', owner: 'bob' } };
        installServer(runs);
        const { result } = renderWithToken('tok-admin');
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { await result.current.loadAllData(null, true); });
        runs.r1.state = 'unlisted';
        await act(async () => { await result.current.loadAllData(null, true); });
        await waitFor(() => expect(storeRuns(result)).toEqual(['r1:unlisted']));
    });

    it('keeps a withdrawn run in the table in playground mode (no token)', async () => {
        const runs = { r1: { state: 'public', owner: 'anonymous' } };
        installServer(runs, { playground: true });
        const { result } = renderWithToken(null, { playground: true });
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { await result.current.loadAllData(null, true); });
        runs.r1.state = 'unlisted';
        await act(async () => { await result.current.loadAllData(null, true); });
        await waitFor(() => expect(storeRuns(result)).toEqual(['r1:unlisted']));
    });

    it('non-admins get only the most recent unlisted runs; admins get all of them', async () => {
        const runs = { theirs: { state: 'unlisted', owner: 'bob' }, pub: { state: 'public', owner: 'bob' } };
        for (const [token, allPages] of [['tok-alice', false], ['tok-admin', true]]) {
            const calls = installServer(runs);
            const { result, unmount } = renderWithToken(token);
            await act(async () => { await result.current.fetchConfig(); });
            await act(async () => { await result.current.loadAllData(null, true); });
            await waitFor(() => expect(storeRuns(result)).toEqual(['pub:public', 'theirs:unlisted']));
            const unlistedCalls = calls.map(([u]) => u).filter(u => u.startsWith('/api/results?status=unlisted'));
            expect(unlistedCalls.some(u => u.includes('limit=100'))).toBe(allPages);
            unmount();
        }
    });

    it('reloads with every unlisted run when admin access arrives after a load ran without it', async () => {
        const calls = installServer({ r1: { state: 'public', owner: 'bob' }, old: { state: 'unlisted', owner: 'bob' } });
        const { result, setUser } = renderWithToken('tok-admin');
        setUser(null); // the session check failed (e.g. /me errored); the load runs as a non-admin
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { await result.current.loadAllData(null, true); });
        await waitFor(() => expect(result.current.resultsStoreLoading).toBe(false));
        const general = () => calls.filter(([u]) => u === '/api/results?limit=100').length;
        const allUnlisted = () => calls.filter(([u]) => u === '/api/results?status=unlisted&limit=100').length;
        expect([general(), allUnlisted()]).toEqual([1, 0]);

        await act(async () => { setUser({ username: 'admin', permission: 'user' }); }); // still not admin: no reload
        await act(async () => { await new Promise(r => setTimeout(r, 50)); });
        expect(general()).toBe(1);

        await act(async () => { setUser({ username: 'admin', permission: 'admin' }); }); // a later check succeeds
        await waitFor(() => expect(allUnlisted()).toBe(1));
        await waitFor(() => expect(result.current.resultsStoreLoading).toBe(false));
        expect(general()).toBe(2);
        expect(storeRuns(result)).toEqual(['old:unlisted', 'r1:public']);

        await act(async () => { setUser({ username: 'admin', permission: 'user' }); });
        await act(async () => { setUser({ username: 'admin', permission: 'admin' }); }); // the last load already listed all
        await act(async () => { await new Promise(r => setTimeout(r, 50)); });
        expect(general()).toBe(2);
    });

    it('tracks the store load in `resultsStoreLoading` without holding up `loading`', async () => {
        installServer({ r1: { state: 'public', owner: 'bob' } }, { listDelayMs: url => (url.includes('limit=100') ? 400 : 0) });
        const { result } = renderWithToken(null);
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { await result.current.loadAllData(null, true); });
        expect(result.current.loading).toBe(false); // other sources are done
        expect(result.current.resultsStoreLoading).toBe(true);
        expect(storeRuns(result)).toEqual([]);
        await waitFor(() => expect(result.current.resultsStoreLoading).toBe(false));
        expect(storeRuns(result)).toEqual(['r1:public']);
    });

    it('keeps `resultsStoreLoading` true through a newer load, and not stuck on a superseded one', async () => {
        let phase = 'first';
        installServer({ r1: { state: 'public', owner: 'bob' } }, {
            // The first load's store listing never answers; the second's takes 300 ms.
            listDelayMs: url => (url.includes('limit=100') ? (phase === 'first' ? 1e9 : 300) : 0)
        });
        const { result } = renderWithToken(null);
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { await result.current.loadAllData(null, true); });
        phase = 'second';
        await act(async () => { await result.current.loadAllData(null, true); });
        await act(async () => { await new Promise(r => setTimeout(r, 100)); });
        expect(result.current.resultsStoreLoading).toBe(true);
        await waitFor(() => expect(result.current.resultsStoreLoading).toBe(false));
        expect(storeRuns(result)).toEqual(['r1:public']);
    });

    it('an older store load finishing late does not clear `resultsStoreLoading` for a newer one', async () => {
        let phase = 'first';
        installServer({ r1: { state: 'public', owner: 'bob' } }, {
            // First load's listing answers at 300 ms, the second's at 900 ms.
            listDelayMs: url => (url.includes('limit=100') ? (phase === 'first' ? 300 : 900) : 0)
        });
        const { result } = renderWithToken(null);
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { await result.current.loadAllData(null, true); });
        phase = 'second';
        await act(async () => { await result.current.loadAllData(null, true); });
        await act(async () => { await new Promise(r => setTimeout(r, 500)); }); // first done, second not
        expect(result.current.resultsStoreLoading).toBe(true);
        await waitFor(() => expect(result.current.resultsStoreLoading).toBe(false), { timeout: 2000 });
    });

    it('on S3, hydration adds nothing: the store load lists own and recent unlisted runs, once each', async () => {
        const runs = { mine: { state: 'unlisted', owner: 'alice' }, theirs: { state: 'unlisted', owner: 'bob' } };
        const calls = installServer(runs);
        const { result } = renderWithToken('tok-alice');
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { await result.current.loadAllData(null, true); });
        await act(async () => { await result.current.loadSubmissions(true); });
        await waitFor(() => expect(storeRuns(result)).toEqual(['mine:unlisted', 'theirs:unlisted']));
        await act(async () => { await new Promise(r => setTimeout(r, 100)); });
        expect(calls.filter(([u]) => u === '/api/results/mine')).toHaveLength(1);
        expect(calls.filter(([u]) => u === '/api/results/theirs')).toHaveLength(1);
    });

    it('a failed own-runs listing keeps the rest and shows an error on the source', async () => {
        installServer({ pub: { state: 'public', owner: 'bob' } }, { failList: url => url.includes('own=true&limit=100') });
        const { result } = renderWithToken('tok-alice');
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { await result.current.loadAllData(null, true); });
        await waitFor(() => expect(storeRuns(result)).toEqual(['pub:public']));
        const profile = result.current.gcsProfiles.find(p => p.type === 'results');
        expect(profile?.error).toMatch(/could not be listed/);
    });

    it('stale-token results: adds only open runs, makes no extra requests, and returns false', async () => {
        const runs = { pend: { state: 'submitted_pending_review', owner: 'bob' }, pub: { state: 'public', owner: 'bob' }, unl: { state: 'unlisted', owner: 'bob' } };
        const calls = installServer(runs, { backend: 'gcs' });
        const { result } = renderWithToken('tok-admin#2');
        await act(async () => { await result.current.fetchConfig(); });
        const before = calls.length;
        const entries = Object.keys(runs).flatMap(id => parseResultsBundle(bundle(id, runs[id].state), { sourceKey: GCS_RESULTS_STORE_SOURCE_KEY }));
        let returned;
        act(() => { returned = result.current.injectDynamicEntries(entries, { token: 'tok-admin#1' }); });
        expect(returned).toBe(false);
        expect(storeRuns(result, GCS_RESULTS_STORE_SOURCE_KEY)).toEqual(['pub:public', 'unl:unlisted']);
        await act(async () => { await new Promise(r => setTimeout(r, 30)); });
        expect(calls.slice(before).filter(([u]) => u.startsWith('/api/results/'))).toEqual([]);
        // With the current token, everything is added.
        act(() => { returned = result.current.injectDynamicEntries(entries, { token: 'tok-admin#2' }); });
        expect(returned).toBe(true);
        expect(storeRuns(result, GCS_RESULTS_STORE_SOURCE_KEY)).toEqual(['pend:submitted_pending_review', 'pub:public', 'unl:unlisted']);
    });

    it('after a token refresh, the reload brings back a private run the identity may see', async () => {
        const runs = { pend: { state: 'submitted_pending_review', owner: 'alice' } };
        installServer(runs);
        const { result, setToken } = renderWithToken('tok-alice#1');
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { setToken('tok-alice#2'); });
        // A share-link result fetched with the old token is not trusted...
        const entries = parseResultsBundle(bundle('pend', 'submitted_pending_review'), { sourceKey: RESULTS_STORE_SOURCE_KEY });
        act(() => { result.current.injectDynamicEntries(entries, { token: 'tok-alice#1' }); });
        // ...but the reload that the token change started loads it for the current identity.
        await waitFor(() => expect(storeRuns(result)).toEqual(['pend:submitted_pending_review']));
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

    it('the first load waits for the session check, so admins get every unlisted run without a second load', async () => {
        const calls = installServer({ old: { state: 'unlisted', owner: 'bob' } });
        const { result, resolveAuth } = renderWithToken('tok-admin', { authLoading: true });
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { await result.current.loadAllData(null, true); });
        expect(result.current.resultsStoreLoading).toBe(true);
        expect(calls.some(([u]) => u.startsWith('/api/results?limit=100'))).toBe(false); // waiting
        await act(async () => { resolveAuth(); });
        await waitFor(() => expect(result.current.resultsStoreLoading).toBe(false));
        expect(calls.filter(([u]) => u === '/api/results?limit=100')).toHaveLength(1);
        expect(calls.some(([u]) => u === '/api/results?status=unlisted&limit=100')).toBe(true);
        expect(storeRuns(result)).toEqual(['old:unlisted']);
    });

    it('a load that started before logout never applies its (private) result', async () => {
        const runs = { pend: { state: 'submitted_pending_review', owner: 'alice' } };
        // The server answers the old load even though it was aborted, so only the
        // latest-load check stands between it and the dashboard.
        installServer(runs, { listDelayMs: (url, token) => (token ? 300 : 0), ignoreAbort: true });
        const { result, setToken } = renderWithToken('tok-alice');
        await act(async () => { await result.current.fetchConfig(); });
        act(() => { void result.current.loadAllData(null, true); });
        await act(async () => { await new Promise(r => setTimeout(r, 50)); }); // its listing is in flight
        await act(async () => { setToken(null); });
        await act(async () => { await new Promise(r => setTimeout(r, 1200)); }); // the old load's listings finish
        expect(storeRuns(result)).toEqual([]);
    });

    it('a private run loaded by the store disappears at once on logout', async () => {
        const runs = { pend: { state: 'submitted_pending_review', owner: 'alice' }, pub: { state: 'public', owner: 'bob' } };
        installServer(runs, { listDelayMs: (url, token) => (token ? 0 : 1000) }); // the anonymous reload is slow
        const { result, setToken } = renderWithToken('tok-alice');
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { await result.current.loadAllData(null, true); });
        await waitFor(() => expect(storeRuns(result)).toEqual(['pend:submitted_pending_review', 'pub:public']));
        await act(async () => { setToken(null); });
        expect(storeRuns(result)).toEqual(['pub:public']); // before the reload finishes
    });

    it('keeps share-link runs across reloads, including ones added while a reload runs', async () => {
        const runs = {
            pub: { state: 'public', owner: 'bob' },
            before: { state: 'unlisted', owner: 'bob', unlistedFromListings: true },
            during: { state: 'unlisted', owner: 'bob', unlistedFromListings: true }
        };
        let slow = false;
        // On the reload, re-checking 'before' (the share-link run it found) takes 200 ms.
        installServer(runs, { getDelayMs: id => (slow && id === 'before' ? 200 : 0) });
        const { result } = renderWithToken(null);
        const inject = id => result.current.injectDynamicEntries(parseResultsBundle(bundle(id, 'unlisted'), { sourceKey: RESULTS_STORE_SOURCE_KEY }), { token: null });
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { await result.current.loadAllData(null, true); });
        act(() => { inject('before'); });
        slow = true;
        await act(async () => { await result.current.loadAllData(null, true); });
        await act(async () => { await new Promise(r => setTimeout(r, 50)); });
        act(() => { inject('during'); }); // while the reload re-checks 'before'
        await waitFor(() => expect(result.current.resultsStoreLoading).toBe(false));
        expect(storeRuns(result)).toEqual(['before:unlisted', 'during:unlisted', 'pub:public']);
    });

    it('a run that could not be loaded this time keeps what was shown, and the problem is reported', async () => {
        const runs = { r1: { state: 'public', owner: 'bob', rev: 'v1' } };
        installServer(runs);
        const { result } = renderWithToken(null);
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { await result.current.loadAllData(null, true); });
        await waitFor(() => expect(storeRuns(result)).toEqual(['r1:public']));
        Object.assign(runs.r1, { rev: 'v2', getStatus: 503 }); // changed, then S3 hiccups
        await act(async () => { await result.current.loadAllData(null, true); });
        await waitFor(() => expect(result.current.resultsStoreLoading).toBe(false));
        expect(storeRuns(result)).toEqual(['r1:public']);
        expect(result.current.gcsError).toMatch(/^Results Store: 1 run\(s\) could not be loaded/);
    });

    it('a failed store load is reported to the user', async () => {
        installServer({}, { failList: url => url === '/api/results?limit=100' });
        const { result } = renderWithToken(null);
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { await result.current.loadAllData(null, true); });
        await waitFor(() => expect(result.current.resultsStoreLoading).toBe(false));
        expect(result.current.gcsError).toMatch(/^Results Store: listing failed/);
        expect(result.current.toasts.some(t => /Results Store could not be loaded/.test(t.message))).toBe(true);
    });

    it('a load replaced by a newer one is aborted', async () => {
        const calls = installServer({ r1: { state: 'public', owner: 'bob' } }, { listDelayMs: 200 });
        const { result } = renderWithToken(null);
        await act(async () => { await result.current.fetchConfig(); });
        act(() => { void result.current.loadAllData(null, true); });
        await act(async () => { await new Promise(r => setTimeout(r, 20)); });
        act(() => { void result.current.loadAllData(null, true); });
        await waitFor(() => expect(result.current.resultsStoreLoading).toBe(false), { timeout: 2000 });
        const listSignals = calls.signals.filter(([u]) => u === '/api/results?limit=100').map(([, sig]) => sig);
        expect(listSignals).toHaveLength(2);
        expect(listSignals[0].aborted).toBe(true);
        expect(listSignals[1].aborted).toBe(false);
    });

    it('reloads reuse unchanged runs, and do not auto-select a run', async () => {
        const calls = installServer({ r1: { state: 'public', owner: 'bob', rev: 'v1' } });
        const { result } = renderWithToken(null);
        await act(async () => { await result.current.fetchConfig(); });
        for (let i = 0; i < 3; i++) {
            await act(async () => { await result.current.loadAllData(null, true); });
            await waitFor(() => expect(result.current.resultsStoreLoading).toBe(false));
        }
        expect(storeRuns(result)).toEqual(['r1:public']);
        expect(calls.filter(([u]) => u === '/api/results/r1')).toHaveLength(1);
        expect(result.current.selectedBenchmarks.size).toBe(0);
    });

    it('a failed secondary listing keeps only unlisted runs it would have added, not deleted ones', async () => {
        const runs = { pub: { state: 'public', owner: 'bob' }, unl: { state: 'unlisted', owner: 'bob' } };
        let failUnlisted = false;
        installServer(runs, { failList: url => failUnlisted && url.includes('status=unlisted') });
        const { result } = renderWithToken(null);
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { await result.current.loadAllData(null, true); });
        await waitFor(() => expect(storeRuns(result)).toEqual(['pub:public', 'unl:unlisted']));
        delete runs.pub; // deleted by an admin
        failUnlisted = true;
        await act(async () => { await result.current.loadAllData(null, true); });
        await waitFor(() => expect(result.current.resultsStoreLoading).toBe(false));
        expect(storeRuns(result)).toEqual(['unl:unlisted']);
    });

    it('shows Results Store problems together with the other sources\' errors', async () => {
        installServer({ r1: { state: 'public', owner: 'bob', getStatus: 503 } });
        const { result } = renderWithToken(null);
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { await result.current.loadAllData(null, true); });
        await waitFor(() => expect(result.current.resultsStoreLoading).toBe(false));
        act(() => { result.current.setGcsError('Connection issue with: some-bucket'); });
        expect(result.current.gcsError).toMatch(/Connection issue with: some-bucket/);
        expect(result.current.gcsError).toMatch(/Results Store: 1 run\(s\) could not be loaded/);
    });

    it('stops waiting for a slow session check, and reloads once if the caller turns out to be an admin', async () => {
        const calls = installServer({ old: { state: 'unlisted', owner: 'bob' } });
        const { result, resolveAuth } = renderWithToken('tok-admin', { authLoading: true });
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { await result.current.loadAllData(null, true); });
        await waitFor(() => expect(result.current.resultsStoreLoading).toBe(false), { timeout: 7000 });
        expect(calls.filter(([u]) => u === '/api/results?limit=100')).toHaveLength(1); // went ahead
        expect(calls.some(([u]) => u === '/api/results?status=unlisted&limit=100')).toBe(false);
        await act(async () => { resolveAuth(); }); // admin after all
        await waitFor(() => expect(calls.some(([u]) => u === '/api/results?status=unlisted&limit=100')).toBe(true));
        expect(calls.filter(([u]) => u === '/api/results?limit=100')).toHaveLength(2);
    }, 15000);

    it('the loading popup lists the Results Store while it loads (loadAllData keeps its task)', async () => {
        installServer({ r1: { state: 'public', owner: 'bob' } }, { listDelayMs: 300 });
        const { result } = renderWithToken(null);
        await act(async () => { await result.current.fetchConfig(); });
        await act(async () => { await result.current.loadAllData(null, true); });
        expect(result.current.resultsStoreLoading).toBe(true);
        expect(result.current.loadingTasks[RESULTS_STORE_SOURCE_KEY]?.status).toBe('loading');
        await waitFor(() => expect(result.current.loadingTasks[RESULTS_STORE_SOURCE_KEY]?.status).toBe('completed'));
    });
});
