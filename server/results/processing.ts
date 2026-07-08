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

import { readResultPayload, writeResult } from './gcs.ts';
import { validatePrismUploadStructure } from '../../src/utils/benchmarkValidator.js';
import { PrismSubmissionState } from './api.ts';

export interface ProcessSubmissionResult {
    success: boolean;
    state: PrismSubmissionState;
    errors: string[];
    warnings: string[];
}

/**
 * Validates and processes a benchmark submission by its runId.
 * Decoupled so it can run synchronously inside the API server, or inside a background worker.
 * Reads the raw staged result payload, performs consistency and metric validation,
 * and updates the submission state in Google Cloud Storage.
 */
export async function processSubmission(runId: string): Promise<ProcessSubmissionResult> {
    const payload = await readResultPayload(runId);
    
    // Resolve contributor/author username
    const username = payload.github_author?.username || 'Unknown';

    // Perform validation checks
    const validation = validatePrismUploadStructure(payload, { isUpload: true });

    const newState: PrismSubmissionState = validation.isValid
        ? 'submitted_pending_review'
        : 'rejected';

    // If validation fails, store validation errors in the payload's metadata for audit
    if (!validation.isValid) {
        payload.metadata = {
            ...(payload.metadata || {}),
            validation_errors: validation.errors
        };
    }

    // Write back the processed result with updated GCS custom metadata context state
    await writeResult(runId, payload, newState, username);

    return {
        success: validation.isValid,
        state: newState,
        errors: validation.errors || [],
        warnings: validation.warnings || []
    };
}
