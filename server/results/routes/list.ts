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

import { Request, Response } from 'express';
import { validateGitHubToken } from '../../oauth.ts';
import { isPlaygroundMode } from '../../iam.ts';
import { listResults, ListResultsResult as ResultsListResponse } from '../gcs.ts';
import { PrismSubmissionState } from '../api.ts';

export interface ResultsListQuery {
    limit?: string;
    pageToken?: string;
    status?: PrismSubmissionState;
    own?: string;
    experimentId?: string;
}

/**
 * GET /api/results
 * 
 * Lists benchmark runs from the active Prism results store (defined in RESULTS_STORE_BUCKET).
 * 
 * - **Headers:** `X-Prism-Github-Token: <access_token>` (optional)
 * - **Query Parameters:**
 *     - `limit`: (Optional) Maximum number of results to return (integer, defaults to 10, max 100).
 *     - `pageToken`: (Optional) Pagination token retrieved from the nextPageToken of a prior list response.
 *     - `status`: (Optional) Filter by submission status (staged | submitted_pending_processing | submitted_pending_review | public | promoted).
 *     - `own`: (Optional) Filter to retrieve only the logged-in user's submissions (true | false).
 *     - `experimentId`: (Optional) Filter by multi-arm campaign/experiment ID.
 * - **Authorization Rules:**
 *     - **Playground Mode:** Default admin permissions for all callers.
 *     - **Admin:** Can list all benchmarks in all statuses.
 *     - **Standard User/Guest:**
 *         - Can list their own benchmarks in any status.
 *         - Can only list approved (`public` or `promoted`) benchmarks of other users.
 *         - Benchmarks in pending or rejected states belonging to other users are filtered out.
 */
export async function listResultsHandler(
    req: Request<Record<string, never>, ResultsListResponse | { error: string; details?: string }, Record<string, never>, ResultsListQuery>,
    res: Response<ResultsListResponse | { error: string; details?: string }>
) {
    // 1. Authenticate user
    const token = req.headers['x-prism-github-token'] as string | undefined;
    let username: string | null = null;
    let permission = isPlaygroundMode() ? 'admin' : 'none';

    if (token) {
        try {
            const authResult = await validateGitHubToken(token);
            username = authResult.username;
            permission = authResult.permission;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn('[Results API] Invalid session token:', msg);
        }
    }

    if (isPlaygroundMode()) {
        permission = 'admin';
    }

    // 2. Parse pagination options & filters
    const limit = Math.min(parseInt(req.query.limit || '', 10) || 10, 100);
    const pageTokenParam = req.query.pageToken || '';
    const statusFilter = req.query.status || null;
    const ownFilter = req.query.own === 'true';
    const experimentIdParam = req.query.experimentId ? String(req.query.experimentId).trim() : null;

    try {
        const results = await listResults({
            limit,
            pageToken: pageTokenParam,
            statusFilter,
            ownFilter,
            experimentId: experimentIdParam,
            username,
            permission
        });
        res.json(results);
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[Results List API Error]', error);
        res.status(500).json({ error: 'Failed to list results', details: msg });
    }
}
