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
import { readResultMetadata, readResultPayload, writeResult, deleteResult } from '../gcs.ts';
import { storageErrorStatus } from '../backend.ts';

export interface DeleteResultsResponse {
    success: boolean;
    message: string;
}

/**
 * DELETE /api/results/:runId
 *
 * Deletes or withdraws a benchmark result run bundle from the GCS Results Store.
 *
 * - **Headers:** `X-Prism-Github-Token: <access_token>` (required, optional in playground mode)
 * - **Authorization Rules:**
 *     - **Playground Mode:** Full access to delete or withdraw any benchmark in RESULTS_STORE_BUCKET anonymously.
 *     - **Submitting User (Owner) / Admin:**
 *         - State `unlisted` or `rejected`: Permanently deletes the benchmark bundle off GCS.
 *         - State `submitted_pending_review`, `in_review`, `submitted_pending_processing`, `public`, or `promoted`:
 *           Demotes/withdraws the benchmark back to `unlisted` state (double-delete flow).
 *     - **Other users:** `403 Forbidden`.
 * - **Benchmark Checks:**
 *     - `runId` must be a valid UUID.
 *     - Benchmark must exist in the GCS Results Store.
 */
export async function deleteResultsHandler(
    req: Request<{ runId: string }, DeleteResultsResponse | { error: string; details?: unknown }>,
    res: Response<DeleteResultsResponse | { error: string; details?: unknown }>
) {
    const { runId } = req.params;

    // Validate UUID format of runId to prevent path traversal
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(runId)) {
        return res.status(400).json({ error: 'Invalid runId format. Must be a UUID.' });
    }

    // 1. Authenticate user
    const token = req.headers['x-prism-github-token'] as string | undefined;
    let username = '';
    let permission = 'none';

    if (isPlaygroundMode()) {
        permission = 'admin';
        if (token) {
            try {
                const authResult = await validateGitHubToken(token);
                username = authResult.username;
            } catch {
                // Ignore token errors in playground mode
            }
        }
    } else {
        if (!token) {
            return res.status(401).json({ error: 'Authentication required. Missing session token.' });
        }

        try {
            const authResult = await validateGitHubToken(token);
            username = authResult.username;
            permission = authResult.permission;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            return res.status(401).json({ error: 'Invalid or expired session token.', details: msg });
        }
    }

    try {
        // 2. Fetch GCS metadata context to check submission status/state & author
        const metadata = await readResultMetadata(runId);
        if (!metadata) {
            return res.status(404).json({ error: 'Result not found.' });
        }

        const { user: itemUser, state: itemState } = metadata;
        const isOwner = !!(username && itemUser.toLowerCase() === username.toLowerCase());
        const isAdmin = permission === 'admin' || isPlaygroundMode();

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                error: 'Forbidden. You do not have permission to delete or withdraw this benchmark.'
            });
        }

        // 3. Process action based on current submission state
        if (itemState === 'unlisted' || itemState === 'rejected') {
            // Permanently delete object from GCS Results Store
            await deleteResult(runId);

            return res.json({
                success: true,
                message: `Benchmark ${runId} successfully deleted.`
            });
        } else {
            // Demote / withdraw benchmark to 'unlisted' state
            const payload = await readResultPayload(runId);

            if (!payload.review) {
                payload.review = { history: [] };
            }
            if (!payload.review.history) {
                payload.review.history = [];
            }
            payload.review.history.push({
                status: 'unlisted',
                changedAt: new Date().toISOString(),
                by: username || 'anonymous'
            });

            await writeResult(runId, payload, 'unlisted', itemUser);

            const isPublicState = itemState === 'public' || itemState === 'promoted';
            const message = isPublicState
                ? `Public benchmark ${runId} successfully pulled back to unlisted.`
                : `Benchmark ${runId} successfully withdrawn to unlisted.`;

            return res.json({
                success: true,
                message
            });
        }
    } catch (error: unknown) {
        console.error('[Results Delete API Error]', error);
        const msg = error instanceof Error ? error.message : String(error);
        return res.status(storageErrorStatus(error, 500)).json({ error: 'Failed to process benchmark deletion', details: msg });
    }
}

