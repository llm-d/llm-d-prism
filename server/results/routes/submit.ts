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
import crypto from 'crypto';
import { validateGitHubToken } from '../../oauth.ts';
import { isPlaygroundMode } from '../../iam.ts';
import { writeResult, deleteResult } from '../gcs.ts';
import { processSubmission } from '../processing.ts';
import { PrismSubmissionState, PrismResultPayload } from '../api.ts';
import { normalizeReportUnits } from '../../../src/utils/benchmarkReportV02Parser.js';

export interface ResultsSubmitResponse {
    success: boolean;
    runId: string;
    oldRunId?: string;
    state: PrismSubmissionState;
    message: string;
}

/**
 * POST /api/results
 *
 * Submits a benchmark result bundle to the active results store.
 *
 * - **Headers:** `X-Prism-Github-Token: <access_token>` (required, optional in playground mode)
 * - **Authorization Rules:** Only allowlisted contributors (with role `user` or `admin`) can submit benchmark results (bypassed in playground mode).
 * - **Request Format:** A JSON object representing the benchmark run upload payload matching the `PrismResultPayload` interface (see api.ts).
 * - **Response Format:** A JSON object confirming the submission status. All internal IDs (including top-level `runId` and nested entry `run_id`s) are regenerated on the server to prevent ID collisions. The response includes the new server-generated `runId`, the client-supplied `oldRunId` (if one was sent), the final promoted state (`submitted_pending_review`), and a success message.
 */
export async function submitResultsHandler(
    req: Request<{}, ResultsSubmitResponse | { error: string; details?: any; warnings?: any; state?: PrismSubmissionState }, PrismResultPayload>,
    res: Response<ResultsSubmitResponse | { error: string; details?: any; warnings?: any; state?: PrismSubmissionState }>
) {
    const uploadData = req.body;
    if (!uploadData) {
        return res.status(400).json({ error: 'Missing upload payload.' });
    }

    // 1. Authenticate user
    const token = req.headers['x-prism-github-token'] as string | undefined;
    let username = 'anonymous';
    let permission = 'none';

    if (isPlaygroundMode()) {
        permission = 'admin';
        if (uploadData.github_author?.username) {
            username = uploadData.github_author.username.trim() || 'anonymous';
        }
    } else {
        if (!token) {
            return res.status(401).json({ error: 'Authentication required. Missing session token.' });
        }

        try {
            const authResult = await validateGitHubToken(token);
            username = authResult.username;
            permission = authResult.permission;
        } catch (e: any) {
            return res.status(401).json({ error: 'Invalid or expired session token.', details: e.message });
        }

        // 2. Authorization check
        if (permission !== 'user' && permission !== 'admin') {
            return res.status(403).json({ error: 'Forbidden. Contributor is not allowlisted to submit benchmarks.' });
        }
    }

    // 3. Prepare request payload
    const clientRunId = uploadData.runId || '';

    // Now generate Prism server-side internal IDs (replacing client-supplied IDs)
    const serverRunId = crypto.randomUUID();
    uploadData.runId = serverRunId;

    if (uploadData.entries && Array.isArray(uploadData.entries)) {
        for (const entry of uploadData.entries) {
            entry.run_id = crypto.randomUUID();
            if (entry.raw_report) {
                entry.raw_report = normalizeReportUnits(entry.raw_report);
            }
        }
    }

    // 4. Enrich payload with author & time metadata
    // Determine target visibility state ('unlisted' vs default 'submitted_pending_review')
    const rawTargetState = (req.query.targetState as string) || (uploadData as any).targetState;
    const targetState: PrismSubmissionState = rawTargetState === 'unlisted' ? 'unlisted' : 'submitted_pending_review';

    if (isPlaygroundMode()) {
        uploadData.github_author = {
            username: (uploadData.github_author?.username && uploadData.github_author.username.trim())
                ? uploadData.github_author.username.trim()
                : username,
            playground: true
        };
    } else {
        uploadData.github_author = { username };
    }
    uploadData.submitted_at = new Date().toISOString();

    try {
        // Use GCS storage service layer to stage the initial submission
        const initialState: PrismSubmissionState = 'submitted_pending_processing';
        await writeResult(serverRunId, uploadData, initialState, username);

        // 5. Run automated validation and promotion processing synchronously for now
        const processingResult = await processSubmission(serverRunId, targetState);

        if (!processingResult.success) {
            return res.status(400).json({
                error: 'Validation failed during processing. Upload dropped.',
                details: processingResult.errors,
                warnings: processingResult.warnings
            });
        }

        const successMessage = processingResult.state === 'unlisted'
            ? 'Benchmark result successfully processed and saved as unlisted.'
            : 'Benchmark result successfully submitted and promoted to review.';

        res.status(201).json({
            success: true,
            runId: serverRunId,
            oldRunId: clientRunId,
            state: processingResult.state,
            message: successMessage
        });

    } catch (error: any) {
        console.error('[Results Submit API Error]', error);
        if (serverRunId) {
            await deleteResult(serverRunId).catch((cleanupErr) => {
                console.error('[Results Submit API Cleanup Error]', cleanupErr);
            });
        }
        res.status(502).json({ error: 'Failed to submit or process result in storage backend', details: error.message });
    }
}
