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
import { readResultPayload, writeResult, readResultMetadata } from '../gcs.ts';
import { storageErrorStatus } from '../backend.ts';
import { PrismSubmissionState } from '../api.ts';

export interface ReviewResultsRequest {
    status: PrismSubmissionState;
    feedback?: string;
    reviewer?: string;
}

export interface ReviewResultsResponse {
    success: boolean;
    state?: PrismSubmissionState;
    message?: string;
    updatedData?: unknown;
}

/**
 * POST /api/results/:runId/review
 *
 * Reviews (approves or rejects) a result store benchmark submission.
 *
 * - **Headers:** `X-Prism-Github-Token: <access_token>` (required, optional in playground mode)
 * - **Authorization Rules:**
 *     - **Playground Mode:** Full access for all review operations anonymously.
 *     - **Admin:** Can approve (`public` / `promoted`) or reject (`rejected` / `changes_requested`).
 *     - **Non-Admin Users / Guests:** `403 Forbidden`.
 */
export async function reviewResultsHandler(
    req: Request<{ runId: string }, ReviewResultsResponse | { error: string; details?: unknown }, ReviewResultsRequest>,
    res: Response<ReviewResultsResponse | { error: string; details?: unknown }>
) {
    const { runId } = req.params;

    // Validate UUID format of runId to prevent path traversal
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(runId)) {
        return res.status(400).json({ error: 'Invalid runId format. Must be a UUID.' });
    }

    // 1. Authenticate user
    const token = req.headers['x-prism-github-token'] as string | undefined;
    let username = 'anonymous';
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

    if (permission !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin privileges required for benchmark reviews.' });
    }

    const { status, feedback, reviewer } = req.body;
    if (!status) {
        return res.status(400).json({ error: 'Missing status in request body.' });
    }

    // Validate review status target
    const validReviewStatuses: PrismSubmissionState[] = ['public', 'promoted', 'rejected', 'changes_requested'];
    if (!validReviewStatuses.includes(status)) {
        return res.status(400).json({
            error: `Invalid review status '${status}'. Review endpoint only supports 'public', 'promoted', 'rejected', or 'changes_requested'. Use /promote for owner submission promotions.`
        });
    }

    try {
        // 2. Fetch GCS metadata context first to ensure benchmark exists
        const metadata = await readResultMetadata(runId);
        if (!metadata) {
            return res.status(404).json({ error: 'Result not found' });
        }

        const { user: itemUser } = metadata;

        // 3. Fetch actual file content from GCS to edit the review fields
        const payload = await readResultPayload(runId);

        // Update feedback
        payload.feedback = feedback || null;

        // Initialize review metadata
        if (!payload.review) {
            payload.review = { history: [] };
        }
        const reviewBy = reviewer || username;
        payload.review.reviewer = reviewBy;
        payload.review.reviewedAt = new Date().toISOString();

        if (!payload.review.history) {
            payload.review.history = [];
        }
        payload.review.history.push({
            status,
            changedAt: new Date().toISOString(),
            by: reviewBy
        });

        // 4. Save the updated payload and state back to GCS
        await writeResult(runId, payload, status, itemUser);

        return res.json({
            success: true,
            state: status,
            message: `Benchmark submission status successfully updated to ${status}.`,
            updatedData: payload
        });
    } catch (error: unknown) {
        console.error('[Results Review API Error]', error);
        const msg = error instanceof Error ? error.message : String(error);
        return res.status(storageErrorStatus(error, 500)).json({ error: 'Failed to update result submission status', details: msg });
    }
}

