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

import type { PrismResultPayload } from './api.ts';
import { normalizeReviewers } from '../../src/utils/benchmarkReportV02Parser.js';

export { processSubmission } from './processing.ts';
export type { ProcessSubmissionResult } from './processing.ts';
export {
    listResults,
    readResultPayload,
    readResultMetadata,
    writeResult,
    deleteResult,
    encodeContextValue,
    decodeContextValue,
} from './gcs.ts';

/**
 * Sanitizes and normalizes a submission payload while preserving campaign grouping (#185),
 * DCO sign-off, agent provenance, and PII scrub audit metadata.
 */
export function sanitizeSubmissionPayload(payload: Partial<PrismResultPayload>): Partial<PrismResultPayload> {
    const sanitized: Partial<PrismResultPayload> = {
        ...payload,
        experiment_id: payload.experiment_id ?? undefined,
        experiment_label: payload.experiment_label ?? undefined,
        baseline_run_id: payload.baseline_run_id ?? undefined,
        dco_signoff: payload.dco_signoff ?? undefined,
        agent_provenance: payload.agent_provenance ?? undefined,
        pii_scrub_summary: payload.pii_scrub_summary ?? undefined,
    };

    if (Array.isArray(sanitized.requested_reviewers)) {
        const reviewers = normalizeReviewers(sanitized.requested_reviewers);
        if (reviewers.length > 0) {
            sanitized.requested_reviewers = reviewers;
        } else {
            delete sanitized.requested_reviewers;
        }
    } else if (sanitized.requested_reviewers === null) {
        delete sanitized.requested_reviewers;
    }

    return sanitized;
}
