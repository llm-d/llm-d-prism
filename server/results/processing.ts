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

import { readResultPayload, writeResult, deleteResult } from './gcs.ts';
import { validatePrismUploadStructure } from '../../src/utils/benchmarkValidator.js';
import { normalizeReportUnits } from '../../src/utils/benchmarkReportV02Parser.js';
import { PrismSubmissionState } from './api.ts';

export interface ProcessSubmissionResult {
    success: boolean;
    state?: PrismSubmissionState;
    errors: string[];
    warnings: string[];
}

/**
 * Validates and processes a benchmark submission by its runId.
 * Decoupled so it can run synchronously inside the API server, or inside a background worker.
 * Reads the raw staged result payload and performs consistency and metric validation.
 * If validation fails, the item is dropped completely (deleted from GCS storage).
 * If validation passes, the item is promoted to `submitted_pending_review`.
 */
export async function processSubmission(
    runId: string,
    targetState: PrismSubmissionState = 'submitted_pending_review'
): Promise<ProcessSubmissionResult> {
    try {
        const payload = await readResultPayload(runId);
        
        // Resolve contributor/author username
        const username = payload.github_author?.username || 'Unknown';

        // Perform validation checks before normalizing units so original unit presence is validated
        const validation = validatePrismUploadStructure(payload, { isUpload: true });

        // Ensure all entry raw reports have normalized units (seconds)
        if (payload.entries && Array.isArray(payload.entries)) {
            for (const entry of payload.entries) {
                if (entry.raw_report) {
                    entry.raw_report = normalizeReportUnits(entry.raw_report);
                }
            }
        }

        // If validation fails, drop the submission completely from GCS storage
        if (!validation.isValid) {
            await deleteResult(runId);
            return {
                success: false,
                errors: validation.errors || [],
                warnings: validation.warnings || []
            };
        }

        const newState: PrismSubmissionState = targetState;

        // Write back the processed result with updated GCS custom metadata context state
        await writeResult(runId, payload, newState, username);

        return {
            success: true,
            state: newState,
            errors: [],
            warnings: validation.warnings || []
        };
    } catch (error: unknown) {
        // Guarantee clean up of staged GCS artifact if unexpected processing error occurs
        await deleteResult(runId).catch(() => {});
        throw error;
    }
}
