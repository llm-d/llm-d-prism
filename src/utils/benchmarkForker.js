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

import { v4 as uuidv4 } from 'uuid';
import { getRawPrismCloudPayload, resolveRunLabel } from './brv02Exporter.js';
import { validateBenchmark, validatePrismUploadStructure } from './benchmarkValidator.js';

/**
 * Extracts and deep-clones a canonical PrismResultPayload from any benchmark stat/entry representation,
 * generating a fresh staging UUID, attaching root provenance metadata in $.forked_from,
 * re-indexing stage entries with unique UUIDs, and leaving raw_report dictionaries intact.
 *
 * @param {Object} runPayloadOrStat - A PrismResultPayload, table stat item, or local run object.
 * @param {Array} [benchmarkData=[]] - Array of NormalizedBenchmarkEntry records for this benchmark.
 * @param {Object} [options={}] - Optional overrides for original_run_id, source_bucket, etc.
 * @returns {{ payload: Object, newRunId: string, forkDetail: Object }}
 */
export function forkBenchmarkPayload(runPayloadOrStat, benchmarkData = [], options = {}) {
    if (!runPayloadOrStat && (!benchmarkData || benchmarkData.length === 0)) {
        throw new Error('Missing benchmark data to fork.');
    }

    const rawPayload = getRawPrismCloudPayload(runPayloadOrStat, benchmarkData);
    if (!rawPayload) {
        throw new Error('Failed to extract canonical benchmark payload.');
    }

    // Deep clone canonical payload so original in-memory data is untouched
    const payload = JSON.parse(JSON.stringify(rawPayload));

    const firstEntry = Array.isArray(benchmarkData) && benchmarkData.length > 0 ? benchmarkData[0] : null;

    // Resolve original run ID
    const originalRunId = options.original_run_id ||
        rawPayload.runId ||
        runPayloadOrStat?.runId ||
        runPayloadOrStat?.run_id ||
        firstEntry?.run_id ||
        firstEntry?.runId ||
        firstEntry?.source_info?.run_id ||
        uuidv4();

    // Resolve original run label
    const originalRunLabel = options.original_run_label ||
        rawPayload.runLabel ||
        resolveRunLabel(runPayloadOrStat, benchmarkData, []) ||
        payload.model_name ||
        'Benchmark Run';

    // Resolve original author
    const originalAuthor = options.original_author !== undefined
        ? options.original_author
        : (
            rawPayload.github_author ||
            firstEntry?.github_author ||
            runPayloadOrStat?.github_author ||
            runPayloadOrStat?.submitter ||
            firstEntry?.source_info?.github_user ||
            null
        );

    // Resolve original source bucket or prefix
    const sourceBucket = options.source_bucket || (() => {
        const rawSource = firstEntry?.source ||
            runPayloadOrStat?.source ||
            firstEntry?.source_info?.origin ||
            rawPayload.source_bucket ||
            '';

        if (typeof rawSource === 'string') {
            if (rawSource.startsWith('gcs:')) {
                return rawSource.substring(4);
            }
            if (rawSource.startsWith('brv02:')) {
                return 'staging';
            }
            if (rawSource) {
                return rawSource;
            }
        }
        return 'llm-d-benchmarks';
    })();

    const forkedAt = options.forked_at || new Date().toISOString();

    /** @type {import('../../server/results/api').ForkDetail} */
    const forkDetail = {
        original_run_id: String(originalRunId),
        original_run_label: String(originalRunLabel),
        original_author: originalAuthor,
        source_bucket: String(sourceBucket),
        forked_at: String(forkedAt)
    };

    // Handle lineage chaining (multi-fork support)
    const existingForked = payload.forked_from;
    let nextForkedFrom;
    if (existingForked) {
        if (Array.isArray(existingForked)) {
            nextForkedFrom = [...existingForked, forkDetail];
        } else {
            nextForkedFrom = [existingForked, forkDetail];
        }
    } else {
        nextForkedFrom = forkDetail;
    }
    payload.forked_from = nextForkedFrom;

    // Generate fresh staging UUID
    const newRunId = options.newRunId || uuidv4();
    payload.runId = newRunId;

    // Ensure format is brv02
    payload.format = 'brv02';

    // Ensure entries have fresh run_id, synchronized description, but intact raw_report
    if (Array.isArray(payload.entries)) {
        payload.entries = payload.entries.map((entry, idx) => ({
            ...entry,
            run_id: uuidv4(),
            run_description: payload.runLabel || originalRunLabel,
            filename: entry.filename || `benchmark_report_v0.2,_stage_${entry.prism_stage_index ?? idx}_lifecycle_metrics.json.yaml`,
            prism_stage_index: entry.prism_stage_index !== undefined ? entry.prism_stage_index : idx,
            raw_report: entry.raw_report
        }));
    }

    // Reset review / submission lifecycle metadata
    delete payload.submitted_at;
    delete payload.review;
    delete payload.requested_reviewers;
    delete payload.feedback;
    delete payload.github_author;
    payload.submission_state = 'staged';

    return {
        payload,
        newRunId,
        forkDetail
    };
}

/**
 * Builds a staging workspace bundle from a forked PrismResultPayload.
 *
 * @param {Object} forkedPayload - The forked PrismResultPayload object.
 * @param {Object} [rawRunStat=null] - Optional reference to the source stat item.
 * @returns {Object} Staged bundle object suitable for handleValidatedUpload and SubmitValidationPage.
 */
export function buildForkedBundle(forkedPayload, rawRunStat = null) {
    const newRunId = forkedPayload.runId;

    const stageFiles = (forkedPayload.entries || []).map((entry, idx) => {
        const rawContent = typeof entry.raw_report === 'object'
            ? JSON.stringify(entry.raw_report)
            : (entry.raw_report || '');

        const filename = entry.filename || `benchmark_report_v0.2,_stage_${entry.prism_stage_index ?? idx}_lifecycle_metrics.json.yaml`;

        return {
            file: {
                name: filename,
                webkitRelativePath: `${newRunId}/${filename}`
            },
            content: rawContent,
            validation: validateBenchmark(rawContent, filename)
        };
    });

    const metadataFiles = {
        run_metadata: forkedPayload.run_metadata ? {
            file: { name: 'run_metadata.json' },
            content: JSON.stringify(forkedPayload.run_metadata),
            parsed: forkedPayload.run_metadata
        } : null,
        config: forkedPayload.config ? {
            file: { name: 'config.json' },
            content: JSON.stringify(forkedPayload.config),
            parsed: forkedPayload.config
        } : null
    };

    const uploadValidation = validatePrismUploadStructure(forkedPayload, { isUpload: false });
    const bundleValidation = {
        format: 'brv02',
        isValid: uploadValidation.isValid,
        errors: uploadValidation.errors || [],
        warnings: uploadValidation.warnings || [],
        fieldErrors: uploadValidation.fieldErrors || {},
        dcoChecked: true
    };

    return {
        id: Math.random().toString(36).substring(7),
        dirKey: newRunId,
        name: forkedPayload.runLabel,
        stageFiles,
        metadataFiles,
        payload: forkedPayload,
        validation: bundleValidation,
        isExpanded: true,
        isSkipped: false,
        targetDashboards: rawRunStat?.targetDashboards || ['performance-browser']
    };
}

/**
 * Convenience helper that forks a benchmark and returns both the payload and the staging bundle.
 *
 * @param {Object} runPayloadOrStat - The benchmark stat or payload to fork.
 * @param {Array} [benchmarkData=[]] - The benchmark stage records.
 * @param {Object} [options={}] - Additional options for forking.
 * @returns {{ payload: Object, bundle: Object, newRunId: string, forkDetail: Object }}
 */
export function forkBenchmark(runPayloadOrStat, benchmarkData = [], options = {}) {
    const { payload, newRunId, forkDetail } = forkBenchmarkPayload(runPayloadOrStat, benchmarkData, options);
    const bundle = buildForkedBundle(payload, runPayloadOrStat);
    return {
        payload,
        bundle,
        newRunId,
        forkDetail
    };
}
