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
import { processSubmission } from '../processing.ts';
import { PrismSubmissionState } from '../api.ts';

export interface PromoteResultsRequest {
    status?: PrismSubmissionState;
}

export interface PromoteResultsResponse {
    success: boolean;
    state?: PrismSubmissionState;
    message?: string;
    updatedData?: unknown;
}

/**
 * POST /api/results/:runId/promote
 *
 * Promotes a benchmark submission up the lifecycle.
 *
 * - **Headers:** `X-Prism-Github-Token: <access_token>` (required, optional in playground mode)
 * - **Authorization Rules:**
 *     - **Playground Mode:** Full access to promote or resubmit any benchmark anonymously.
 *     - **Submitting User (Owner ONLY):**
 *         - `unlisted` -> `submitted_pending_review`
 *         - `rejected` / `changes_requested` -> `submitted_pending_processing` (triggers automated validation)
 *         - `submitted_pending_processing` -> `submitted_pending_review`
 *     - **Other users & Admins (for non-owned runs):** `403 Forbidden`.
 */
export async function promoteResultsHandler(
    req: Request<{ runId: string }, PromoteResultsResponse | { error: string; details?: unknown }, PromoteResultsRequest>,
    res: Response<PromoteResultsResponse | { error: string; details?: unknown }>
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

    if (isPlaygroundMode()) {
        username = 'anonymous';
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
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            return res.status(401).json({ error: 'Invalid or expired session token.', details: msg });
        }
    }

    try {
        // 2. Fetch GCS metadata context first to enforce authorization check
        const metadata = await readResultMetadata(runId);
        if (!metadata) {
            return res.status(404).json({ error: 'Result not found.' });
        }

        const { user: itemUser, state: currentState } = metadata;
        const isOwner = !!(username && itemUser.toLowerCase() === username.toLowerCase());

        if (!isOwner && !isPlaygroundMode()) {
            return res.status(403).json({ error: 'Forbidden. Only the submitting user (owner) can promote this benchmark.' });
        }

        // Determine target status
        let targetStatus = req.body.status;
        if (!targetStatus) {
            if (currentState === 'unlisted' || currentState === 'submitted_pending_processing') {
                targetStatus = 'submitted_pending_review';
            } else if (currentState === 'rejected' || currentState === 'changes_requested') {
                targetStatus = 'submitted_pending_processing';
            } else {
                return res.status(400).json({ error: `Benchmark in state '${currentState}' cannot be promoted further.` });
            }
        }

        // Validate state promotion path
        if (currentState === 'unlisted') {
            if (targetStatus !== 'submitted_pending_review') {
                return res.status(400).json({ error: 'Unlisted benchmarks can only be promoted to submitted_pending_review.' });
            }
        } else if (currentState === 'rejected' || currentState === 'changes_requested') {
            if (targetStatus !== 'submitted_pending_processing' && targetStatus !== 'submitted_pending_review') {
                return res.status(400).json({ error: 'Rejected benchmarks can only be promoted to submitted_pending_processing for automated re-verification.' });
            }
        } else if (currentState === 'submitted_pending_processing') {
            if (targetStatus !== 'submitted_pending_review') {
                return res.status(400).json({ error: 'Processed benchmarks can only be promoted to submitted_pending_review.' });
            }
        } else {
            return res.status(400).json({
                error: `Benchmark in state '${currentState}' cannot be promoted using /promote. Use /api/results/:runId/review for review actions or DELETE for demotion/withdrawal.`
            });
        }

        // 3. Fetch actual file content from GCS to update review history
        const payload = await readResultPayload(runId);

        if (!payload.review) {
            payload.review = { history: [] };
        }
        if (!payload.review.history) {
            payload.review.history = [];
        }
        payload.review.history.push({
            status: targetStatus,
            changedAt: new Date().toISOString(),
            by: username
        });

        // 4. Save the updated payload and state back to GCS
        await writeResult(runId, payload, targetStatus, itemUser);

        // 5. If the requested status is 'submitted_pending_processing', run the validation processing synchronously
        if (targetStatus === 'submitted_pending_processing') {
            const processingResult = await processSubmission(runId);
            if (!processingResult.success) {
                return res.status(400).json({
                    error: 'Validation failed during resubmission. Submission dropped.',
                    details: processingResult.errors
                });
            }
            return res.json({
                success: true,
                state: processingResult.state,
                message: `Benchmark successfully resubmitted and promoted to review.`,
                updatedData: payload
            });
        }

        return res.json({
            success: true,
            state: targetStatus,
            message: `Benchmark ${runId} successfully promoted to ${targetStatus}.`,
            updatedData: payload
        });
    } catch (error: unknown) {
        console.error('[Results Promote API Error]', error);
        const msg = error instanceof Error ? error.message : String(error);
        return res.status(storageErrorStatus(error, 500)).json({ error: 'Failed to promote benchmark submission', details: msg });
    }
}
