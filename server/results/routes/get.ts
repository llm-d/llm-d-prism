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
import { readResultPayload, readResultMetadata } from '../gcs.ts';
import { PrismResultPayload } from '../api.ts';

export type ResultsGetResponse = PrismResultPayload;

/**
 * GET /api/results/:runId
 * 
 * Retrieves the complete payload of a single benchmark submission run bundle by its UUID.
 * 
 * - **Headers:** `X-Prism-Github-Token: <access_token>` (optional)
 * - **Authorization Rules:**
 *     - **Admin:** Full access.
 *     - **Standard User/Guest:**
 *         - Can view their own benchmark run bundle in any state.
 *         - Can view other contributors' benchmark run bundle only if its state is `public` or `promoted`.
 *         - Returns `403 Forbidden` (or `404 Not Found`) if the user lacks permissions.
 * - **Response Format:** A JSON object representing the full benchmark result payload matching the `PrismResultPayload` interface (see api.ts).
 */
export async function getResultsHandler(req: Request, res: Response<ResultsGetResponse | { error: string; details?: string }>) {
    const { runId } = req.params;

    // Validate UUID format of runId to prevent path traversal
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(runId)) {
        return res.status(400).json({ error: 'Invalid runId format. Must be a UUID.' });
    }

    // 1. Authenticate user
    const token = req.headers['x-prism-github-token'] as string | undefined;
    let username: string | null = null;
    let permission = 'none';

    if (token) {
        try {
            const authResult = await validateGitHubToken(token);
            username = authResult.username;
            permission = authResult.permission;
        } catch (e: any) {
            console.warn('[Results API] Invalid session token:', e.message);
        }
    }

    try {
        // 2. Fetch GCS metadata context first to enforce authorization check
        const metadata = await readResultMetadata(runId);
        if (!metadata) {
            return res.status(404).json({ error: 'Result not found' });
        }

        const { user: itemUser, state: itemState } = metadata;

        // 3. Permission check
        let allowed = false;
        if (permission === 'admin') {
            allowed = true;
        } else {
            if (itemState === 'public' || itemState === 'promoted') {
                allowed = true;
            } else if (username && itemUser.toLowerCase() === username.toLowerCase()) {
                allowed = true;
            }
        }

        if (!allowed) {
            return res.status(403).json({ error: 'Access denied. You do not have permissions to view this result.' });
        }

        // 4. Fetch actual file content from GCS
        const fileContent = await readResultPayload(runId);
        res.json(fileContent);

    } catch (error: any) {
        console.error('[Results Get API Error]', error);
        res.status(500).json({ error: 'Failed to retrieve result details', details: error.message });
    }
}
