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
 * and fetches each run with GET /api/results/:runId. Unlisted runs, which listings omit,
 * reach the dashboard through share links and submissions hydration, as on GCS.
 */

import { parseReportV02, stageToEntry, forwardBundleMetadata } from './benchmarkReportV02Parser';

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

async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i]);
        }
    });
    await Promise.all(workers);
    return results;
}

const authHeaders = (token) => (token ? { 'X-Prism-Github-Token': token } : {});
const fetchRun = (fetchFn, runId, headers) => fetchFn(`/api/results/${encodeURIComponent(runId)}`, { headers });

/**
 * Loads every run visible to the caller from the Results Store API.
 *
 * @param {{
 *   fetchFn?: typeof fetch,
 *   token?: string | null,
 *   pageLimit?: number,
 *   maxPages?: number,
 *   concurrency?: number
 * }} [options]
 * @returns {Promise<{ entries: object[], runs: number, failed: number, error: string | null }>}
 */
export async function loadResultsStoreRuns({
    fetchFn = fetch,
    token = null,
    pageLimit = 100,
    maxPages = 100,
    concurrency = 6
} = {}) {
    const headers = authHeaders(token);

    const items = new Map(); // runId -> list item; pages may overlap
    let pageToken = null;
    for (let page = 0; page < maxPages; page++) {
        const qs = new URLSearchParams({ limit: String(pageLimit) });
        if (pageToken) qs.set('pageToken', pageToken);
        const res = await fetchFn(`/api/results?${qs.toString()}`, { headers });
        if (!res.ok) {
            const detail = await res.json().then(b => b?.error, () => null);
            return { entries: [], runs: 0, failed: 0, error: detail || `Results Store request failed (${res.status}).` };
        }
        const body = await res.json();
        for (const item of body.items || []) {
            if (item?.runId && !items.has(item.runId)) items.set(item.runId, item);
        }
        pageToken = body.nextPageToken || null;
        if (!pageToken) break;
    }

    let failed = 0;
    const perRun = await mapLimit([...items.values()], concurrency, async (item) => {
        try {
            const res = await fetchRun(fetchFn, item.runId, headers);
            if (res.ok) {
                // The GET's state is newer than the listing's.
                const payload = await res.json();
                return parseResultsBundle(payload, { sourceKey: RESULTS_STORE_SOURCE_KEY, state: payload?.submission_state || item.state });
            }
        } catch {
            // counted below
        }
        failed++;
        return [];
    });

    return { entries: perRun.flat(), runs: items.size, failed, error: null };
}

/**
 * Re-fetches specific runs (e.g. ones opened through a share link). Returns fresh
 * dashboard entries for runs the caller can still see, and the ids of runs that could
 * not be checked (network error, 5xx) so callers keep what they have instead of
 * dropping them. Runs that were deleted or are no longer visible (404/403/401) are in
 * neither list, so callers drop them.
 *
 * @param {string[]} runIds
 * @param {{ fetchFn?: typeof fetch, token?: string | null, concurrency?: number }} [options]
 * @returns {Promise<{ entries: object[], unverified: string[] }>}
 */
export async function revalidateResultsStoreRuns(runIds, { fetchFn = fetch, token = null, concurrency = 6 } = {}) {
    const headers = authHeaders(token);
    const unverified = [];
    const perRun = await mapLimit(runIds, concurrency, async (runId) => {
        try {
            const res = await fetchRun(fetchFn, runId, headers);
            if ([401, 403, 404].includes(res.status)) return [];
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
