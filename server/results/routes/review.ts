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
import { readResultPayload, writeResult, readResultMetadata } from '../gcs.ts';
import { processSubmission } from '../processing.ts';
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
 * POST /api/results/:runId/status
 *
 * Updates/reviews the status of a result store submission.
 *
 * - **Headers:** `X-Prism-Github-Token: <access_token>` (required)
 * - **Authorization Rules:**
 *     - **Admin:** Full access. Can approve (`public` / `promoted`), reject (`rejected`), or reset state.
 *     - **Owner of submission:** Can only submit/resubmit, i.e., set state to `submitted_pending_processing` or `submitted_pending_review`.
 *       Any attempt to set state to `public` or `rejected` returns `403 Forbidden`.
 *     - **Other users:** `403 Forbidden`.
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
    if (!token) {
        return res.status(401).json({ error: 'Authentication required. Missing session token.' });
    }

    let username = '';
    let permission = 'none';

    try {
        const authResult = await validateGitHubToken(token);
        username = authResult.username;
        permission = authResult.permission;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return res.status(401).json({ error: 'Invalid or expired session token.', details: msg });
    }

    const { status, feedback, reviewer } = req.body;
    if (!status) {
        return res.status(400).json({ error: 'Missing status in request body.' });
    }

    try {
        // 2. Fetch GCS metadata context first to enforce authorization check
        const metadata = await readResultMetadata(runId);
        if (!metadata) {
            return res.status(404).json({ error: 'Result not found' });
        }

        const { user: itemUser } = metadata;

        // 3. Permission and authorization checks
        let allowed = false;
        if (permission === 'admin') {
            allowed = true;
        } else {
            // Check if the current user is the owner/author of the submission
            if (username && itemUser.toLowerCase() === username.toLowerCase()) {
                // Owners can only transition their own runs to 'submitted_pending_processing' or 'submitted_pending_review' (resubmission/promotion)
                if (status === 'submitted_pending_processing' || status === 'submitted_pending_review') {
                    allowed = true;
                } else {
                    return res.status(403).json({ error: 'Forbidden. Non-admin users cannot approve, reject, or promote benchmarks of other status values.' });
                }
            }
        }

        if (!allowed) {
            return res.status(403).json({ error: 'Access denied. You do not have permissions to modify this result.' });
        }

        // 4. Fetch actual file content from GCS to edit the fields
        const payload = await readResultPayload(runId);

        // Update feedback
        payload.feedback = feedback || null;

        // Initialize review metadata if not present (mirroring old /api/local/status)
        if (!payload.review) {
            payload.review = {
                history: []
            };
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

        // 5. Save the updated payload and state back to GCS
        await writeResult(runId, payload, status, itemUser);

        // 6. If the requested status is 'submitted_pending_processing', run the validation processing synchronously
        if (status === 'submitted_pending_processing') {
            const processingResult = await processSubmission(runId);
            if (!processingResult.success) {
                return res.status(400).json({
                    error: 'Validation failed during resubmission.',
                    details: processingResult.errors,
                    state: processingResult.state
                });
            }
            return res.json({
                success: true,
                state: processingResult.state,
                message: `Benchmark successfully resubmitted and promoted to review.`,
                updatedData: payload
            });
        }

        res.json({
            success: true,
            state: status,
            message: `Benchmark submission status successfully updated to ${status}.`,
            updatedData: payload
        });

    } catch (error: unknown) {
        console.error('[Results Review API Error]', error);
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: 'Failed to update result submission status', details: msg });
    }
}
