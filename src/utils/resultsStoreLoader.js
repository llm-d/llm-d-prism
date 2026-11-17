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
 * Loads Results Store runs through the backend-agnostic /api/results API.
 *
 * On the GCS backend the dashboard reads approved runs by listing the bucket through
 * /api/gcs (unchanged). On the S3 backend the bucket is never exposed to the browser,
 * so the dashboard pages GET /api/results, which applies the server's visibility rules,
 * and fetches each run with GET /api/results/:runId. It is the only source of Results
 * Store runs on S3 (submissions hydration does not add any there), and loads what the GCS
 * dashboard shows: approved runs, the caller's own runs, everything for admins, and, like
 * hydration on GCS, the most recent unlisted runs.
 */

import { parseReportV02, stageToEntry, forwardBundleMetadata } from './benchmarkReportV02Parser';
import { mapLimit } from './mapLimit';

/** Source key for runs loaded from an S3-backed Results Store. */
export const RESULTS_STORE_SOURCE_KEY = 'results:store';

/** Source key for runs from the default GCS Results Store (historical value). */
export const GCS_RESULTS_STORE_SOURCE_KEY = 'gcs:llm-d-benchmarks';

/**
 * The source key that share-link loaders should tag runs with, so they merge with
 * (instead of duplicating) the runs the dashboard already loaded.
 * @param {{ resultsStoreBackend?: string } | null | undefined} config
 */
export function getResultsStoreSourceKey(config) {
    return config?.resultsStoreBackend === 's3' ? RESULTS_STORE_SOURCE_KEY : GCS_RESULTS_STORE_SOURCE_KEY;
}

/**
 * Converts a Results Store payload (brv02 envelope from GET /api/results/:runId) into
 * dashboard entries, one per stage. `state` is the submission state the caller trusts
 * most; the payload's own `submission_state` (added by GET) is the fallback.
 *
 * Runs from the S3 store keep stageToEntry's source_info (submitted/approved dates), as
 * GCS bucket-listed runs do. GCS share-link and hydrated runs keep the minimal
 * source_info they have always had.
 *
 * @param {object} payload
 * @param {{ sourceKey: string, state?: string | null, runId?: string }} options
 * @returns {object[]}
 */
export function parseResultsBundle(payload, { sourceKey, state = null, runId = payload?.runId }) {
    if (!payload || !Array.isArray(payload.entries)) return [];
    const submissionState = state || payload.submission_state || 'public';
    const keepStageInfo = sourceKey === RESULTS_STORE_SOURCE_KEY;
    const entries = [];
    for (const stageEntry of payload.entries) {
        if (!stageEntry?.raw_report) continue;
        const parsedStage = parseReportV02(stageEntry.raw_report, stageEntry.filename);
        if (!parsedStage) continue;
        forwardBundleMetadata(parsedStage, payload);
        const entry = stageToEntry(parsedStage);
        entry.run_id = runId;
        entry.source = sourceKey;
        entry.source_info = {
            ...(keepStageInfo ? entry.source_info : {}),
            type: 'benchmark_report_v02',
            origin: sourceKey,
            submission_state: submissionState,
            file_identifier: runId
        };
        entries.push(entry);
    }
    return entries;
}

const authHeaders = (token) => (token ? { 'X-Prism-Github-Token': token } : {});
const fetchRun = (fetchFn, runId, headers, signal) => fetchFn(`/api/results/${encodeURIComponent(runId)}`, { headers, signal });
/** Statuses that mean the run is gone or hidden from this caller (vs. not checkable now). */
const GONE_STATUSES = new Set([401, 403, 404]);

/** States anyone may open, so those runs are fetched without the GitHub token. */
const OPEN_STATES = new Set(['public', 'promoted', 'unlisted']);

/**
 * Pages one listing into `items` (first occurrence of a runId wins). Returns an error
 * message, or `truncated: true` if it stopped at maxPages with more pages left.
 */
async function listInto(items, { fetchFn, headers, signal, query, pageLimit, maxPages }) {
    let pageToken = null;
    for (let page = 0; page < maxPages; page++) {
        const qs = new URLSearchParams({ ...query, limit: String(pageLimit) });
        if (pageToken) qs.set('pageToken', pageToken);
        const res = await fetchFn(`/api/results?${qs.toString()}`, { headers, signal });
        if (!res.ok) {
            const detail = await res.json().then(b => b?.error, () => null);
            return { error: detail || `Results Store request failed (${res.status}).`, truncated: false };
        }
        const body = await res.json();
        for (const item of body.items || []) {
            if (item?.runId && !items.has(item.runId)) items.set(item.runId, item);
        }
        pageToken = body.nextPageToken || null;
        if (!pageToken) return { error: null, truncated: false };
    }
    return { error: null, truncated: true };
}

/** How many of the most recent unlisted runs non-admins get (as hydration does on GCS). */
const RECENT_UNLISTED_LIMIT = 50;

/**
 * Loads the runs the caller's dashboard shows: the general listing; the caller's own runs
 * when signed in (including withdrawn, i.e. unlisted, ones); and unlisted runs: all of them
 * for admins (`allUnlisted`, also set in playground mode), else the most recent 50. Only
 * the general listing is required; if another listing fails, its runs are missing and
 * `partialError` says why.
 *
 * Runs anyone may open are fetched without the GitHub token, so they cost the server no
 * GitHub API calls; only the caller's other runs (own, or pending review for admins) send it.
 * A run whose `revision` matches its entry in `cache` (from the previous load) is not
 * fetched again; the returned `cache` holds this load's runs for the next one.
 *
 * Returns `listedRunIds` (every listed run) and `unverifiedRunIds` (listed runs whose GET
 * failed for a reason other than 401/403/404), so callers can keep what they already had.
 * `signal` aborts the requests (e.g. when a newer load replaces this one).
 *
 * @param {{
 *   fetchFn?: typeof fetch,
 *   token?: string | null,
 *   allUnlisted?: boolean,
 *   signal?: AbortSignal,
 *   cache?: Map<string, { revision: string, entries: object[] }>,
 *   pageLimit?: number,
 *   maxPages?: number,
 *   concurrency?: number
 * }} [options]
 * @returns {Promise<{ entries: object[], runs: number, failed: number, truncated: boolean, partialError: string | null,
 *   error: string | null, listedRunIds: string[], unverifiedRunIds: string[], cache: Map<string, { revision: string, entries: object[] }> }>}
 */
export async function loadResultsStoreRuns({
    fetchFn = fetch,
    token = null,
    allUnlisted = false,
    signal,
    cache = new Map(),
    pageLimit = 100,
    maxPages = 100,
    // Below the browser's 6 connections per host (HTTP/1.1), so other requests (logout,
    // review actions) are not queued behind a long load.
    concurrency = 4
} = {}) {
    const headers = authHeaders(token);
    const items = new Map(); // runId -> list item; listings and pages may overlap
    const listing = { fetchFn, headers, signal, pageLimit, maxPages };
    const all = await listInto(items, { ...listing, query: {} });
    if (all.error) {
        return { entries: [], runs: 0, failed: 0, truncated: false, partialError: null, error: all.error, listedRunIds: [], unverifiedRunIds: [], cache };
    }
    const listingFailed = e => ({ error: e?.message || String(e), truncated: false });
    const unlisted = allUnlisted
        ? listInto(items, { ...listing, query: { status: 'unlisted' } })
        : listInto(items, { ...listing, query: { status: 'unlisted' }, pageLimit: RECENT_UNLISTED_LIMIT, maxPages: 1 })
            .then(r => ({ ...r, truncated: false })); // only the most recent, by design
    const extraResults = await Promise.all([
        token && listInto(items, { ...listing, query: { own: 'true' } }).catch(listingFailed),
        unlisted.catch(listingFailed)
    ].filter(Boolean));
    const partialError = extraResults.find(r => r.error)?.error || null;

    let failed = 0;
    const unverifiedRunIds = [];
    const nextCache = new Map();
    const perRun = await mapLimit([...items.values()], concurrency, async (item) => {
        const cached = cache.get(item.runId);
        if (item.revision && cached?.revision === item.revision) {
            nextCache.set(item.runId, cached);
            return cached.entries;
        }
        let status = null;
        try {
            const open = OPEN_STATES.has(item.state);
            let res = await fetchRun(fetchFn, item.runId, open ? {} : headers, signal);
            // A run that stopped being open since the listing needs the caller's identity.
            if ((res.status === 401 || res.status === 403) && token && open) {
                res = await fetchRun(fetchFn, item.runId, headers, signal);
            }
            status = res.status;
            if (res.ok) {
                // The GET's state is newer than the listing's.
                const payload = await res.json();
                const entries = parseResultsBundle(payload, { sourceKey: RESULTS_STORE_SOURCE_KEY, state: payload?.submission_state || item.state });
                if (item.revision) nextCache.set(item.runId, { revision: item.revision, entries });
                return entries;
            }
        } catch {
            // network error: counted below
        }
        failed++;
        if (!GONE_STATUSES.has(status)) unverifiedRunIds.push(item.runId);
        return [];
    });

    return {
        entries: perRun.flat(), runs: items.size, failed,
        truncated: [all, ...extraResults].some(r => r.truncated), partialError, error: null,
        listedRunIds: [...items.keys()], unverifiedRunIds, cache: nextCache
    };
}

/**
 * Re-fetches specific runs (e.g. ones opened through a share link). Returns fresh
 * dashboard entries for runs the caller can still see, and the ids of runs that could
 * not be checked (network error, 5xx) so callers keep what they have instead of
 * dropping them. Runs that were deleted or are no longer visible (404/403/401) are in
 * neither list, so callers drop them.
 *
 * @param {string[]} runIds
 * @param {{ fetchFn?: typeof fetch, token?: string | null, concurrency?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<{ entries: object[], unverified: string[] }>}
 */
export async function revalidateResultsStoreRuns(runIds, { fetchFn = fetch, token = null, concurrency = 4, signal } = {}) {
    const headers = authHeaders(token);
    const unverified = [];
    const perRun = await mapLimit(runIds, concurrency, async (runId) => {
        try {
            const res = await fetchRun(fetchFn, runId, headers, signal);
            if (GONE_STATUSES.has(res.status)) return [];
            if (res.ok) {
                return parseResultsBundle(await res.json(), { sourceKey: RESULTS_STORE_SOURCE_KEY })
                    .map(e => ({ ...e, _dynamicallyInjected: true }));
            }
        } catch {
            // could not check; reported below
        }
        unverified.push(runId);
        return [];
    });
    return { entries: perRun.flat(), unverified };
}
