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

import yaml from 'js-yaml';
import { zipSync, strToU8 } from 'fflate';
import { parseDataUri } from './dataParser.js';


/**
 * Sanitizes a string for safe filename usage while preserving commas.
 */
export function sanitizeFilename(name) {
    if (!name || typeof name !== 'string') return 'benchmark_report';
    return name
        .replace(/[^a-zA-Z0-9._,-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^\.+/, '')
        .substring(0, 100);
}

/**
 * Returns canonical BRV0.2 filename for a given stage index.
 */
export function getBRV02StageFilename(stageIndex) {
    const stageNum = typeof stageIndex === 'number' && !isNaN(stageIndex) ? stageIndex : 0;
    return `benchmark_report_v0.2,_stage_${stageNum}_lifecycle_metrics.json.yaml`;
}

/**
 * Resolves a human-friendly run label from payload/stat/benchmarkData objects,
 * ignoring internal synthetic keys and fallback model names when a distinct run label exists.
 */
export function resolveRunLabel(runPayloadOrStat, benchmarkData = [], stages = []) {
    const dataArr = Array.isArray(benchmarkData) && benchmarkData.length > 0
        ? benchmarkData
        : (runPayloadOrStat?.data || []);

    const first = dataArr[0] || {};
    const firstReport = runPayloadOrStat?.entries?.[0]?.raw_report ||
        runPayloadOrStat?.stages?.[0]?.rawReport ||
        stages[0]?.rawReport ||
        first?.rawReport || first?.raw_report || {};

    const rawStack = Array.isArray(firstReport?.scenario?.stack) ? firstReport.scenario.stack : [];
    const stackModel = rawStack.find(c => c?.standardized?.model?.name)?.standardized?.model?.name;
    const modelName = runPayloadOrStat?.model_name || runPayloadOrStat?.model || first?.model_name || first?.model || stackModel || '';

    const candidates = [
        runPayloadOrStat?.runLabel,
        runPayloadOrStat?.run_description,
        runPayloadOrStat?.payload?.runLabel,
        firstReport?.run?.description,
        firstReport?.run?.label,
        first?.runLabel,
        first?.source_info?.origin?.replace(/^brv02:/, ''),
    ];

    // Priority 1: Pick first non-empty, non-synthetic label that isn't the model name or generic string
    for (const c of candidates) {
        if (c && typeof c === 'string') {
            const trimmed = c.trim();
            if (
                trimmed &&
                !trimmed.startsWith('brv02:') &&
                !trimmed.startsWith('results-store:') &&
                !trimmed.startsWith('file:') &&
                trimmed.toLowerCase() !== 'custom model' &&
                trimmed.toLowerCase() !== 'unknown' &&
                trimmed.toLowerCase() !== 'unknown model' &&
                (modelName && typeof modelName === 'string' ? trimmed.toLowerCase() !== modelName.toLowerCase() : true)
            ) {
                return trimmed;
            }
        }
    }

    // Priority 2: Fallback to any valid non-synthetic candidate or model name
    for (const c of candidates) {
        if (c && typeof c === 'string') {
            const trimmed = c.trim();
            if (
                trimmed &&
                !trimmed.startsWith('brv02:') &&
                !trimmed.startsWith('results-store:') &&
                !trimmed.startsWith('file:')
            ) {
                return trimmed;
            }
        }
    }

    return modelName || 'benchmark_run';
}

/**
 * Serializes a raw BRV0.2 report object into a clean YAML string.
 */
export function serializeRawReportToYaml(rawReport) {
    if (!rawReport) return '';
    if (typeof rawReport === 'string') return rawReport;
    return yaml.dump(rawReport, {
        noRefs: true,
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false,
    });
}

/**
 * Triggers a browser file download from a Blob or Uint8Array.
 */
export function triggerFileDownload(data, filename, mimeType = 'application/octet-stream') {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Exports an individual stage raw report object directly as a .yaml file download.
 */
export function downloadSingleStageYaml(rawReport, stageIndexOrName = 0) {
    const yamlStr = serializeRawReportToYaml(rawReport);
    if (!yamlStr) {
        throw new Error('No raw report content available to export.');
    }
    let stageNum = 0;
    if (typeof stageIndexOrName === 'number') {
        stageNum = stageIndexOrName;
    } else if (typeof stageIndexOrName === 'string') {
        const match = stageIndexOrName.match(/stage[_\s]*(\d+)/i);
        if (match) {
            stageNum = parseInt(match[1], 10);
        }
    }
    const cleanName = getBRV02StageFilename(stageNum);
    triggerFileDownload(yamlStr, cleanName, 'application/x-yaml');
}

/**
 * Dissects and exports a benchmark run's constituent stage reports into a ZIP file (or single .yaml if 1 stage).
 */
export function downloadRunBRV02(runPayloadOrStat, benchmarkData = []) {
    let stages = [];
    let rawRunId = '';

    // Option 1: Direct PrismResultPayload with .entries
    if (runPayloadOrStat?.entries && Array.isArray(runPayloadOrStat.entries)) {
        rawRunId = runPayloadOrStat.runId || '';
        stages = runPayloadOrStat.entries.map((entry, idx) => ({
            rawReport: entry.raw_report || entry.rawReport || entry.content || entry,
            stageIndex: entry.prism_stage_index ?? idx,
        }));
    }
    // Option 2: Object with .payload containing .entries
    else if (runPayloadOrStat?.payload?.entries && Array.isArray(runPayloadOrStat.payload.entries)) {
        const p = runPayloadOrStat.payload;
        rawRunId = p.runId || '';
        stages = p.entries.map((entry, idx) => ({
            rawReport: entry.raw_report || entry.rawReport || entry.content || entry,
            stageIndex: entry.prism_stage_index ?? idx,
        }));
    }
    // Option 3: Local staged run object with .stages
    else if (runPayloadOrStat?.stages && Array.isArray(runPayloadOrStat.stages)) {
        rawRunId = runPayloadOrStat.runId || '';
        stages = runPayloadOrStat.stages.map((stage, idx) => ({
            rawReport: stage.rawReport || stage.raw_report || stage,
            stageIndex: stage.prism_stage_index ?? stage.workload?.stage ?? idx,
        }));
    }
    // Option 4: Table stat object or benchmarkData array from UnifiedDataTable
    else {
        const dataArr = Array.isArray(benchmarkData) && benchmarkData.length > 0
            ? benchmarkData
            : (runPayloadOrStat?.data || []);

        const first = dataArr[0] || {};

        if (first?.payload?.entries && Array.isArray(first.payload.entries)) {
            const p = first.payload;
            rawRunId = p.runId || '';
            stages = p.entries.map((entry, idx) => ({
                rawReport: entry.raw_report || entry.rawReport || entry.content || entry,
                stageIndex: entry.prism_stage_index ?? idx,
            }));
        } else {
            rawRunId = runPayloadOrStat?.runId || runPayloadOrStat?.run_id || first?.run_id || first?.runId || first?.source_info?.run_id || '';

            if (!rawRunId) {
                const key = runPayloadOrStat?.benchmarkKey || first?.source || '';
                if (key.startsWith('results-store:')) {
                    rawRunId = key.substring('results-store:'.length);
                } else if (key.startsWith('brv02:')) {
                    rawRunId = key.substring('brv02:'.length);
                }
            }

            stages = dataArr.map((d, idx) => ({
                rawReport: d.rawReport || d.raw_report || d.payload?.entries?.[0]?.raw_report || d,
                stageIndex: d.workload?.stage ?? d.prism_stage_index ?? idx,
            }));
        }
    }

    if (stages.length === 0) {
        throw new Error('No stage benchmark reports found in run payload.');
    }

    const runLabel = resolveRunLabel(runPayloadOrStat, benchmarkData, stages);

    // Extract manifests and evidence from all potential properties on runPayloadOrStat or benchmarkData
    const manifests = runPayloadOrStat?.manifests 
        || runPayloadOrStat?.payload?.manifests 
        || runPayloadOrStat?.bundle?.payload?.manifests
        || (Array.isArray(benchmarkData) && benchmarkData[0]?.payload?.manifests)
        || {};

    const evidence = runPayloadOrStat?.evidence 
        || runPayloadOrStat?.payload?.evidence 
        || runPayloadOrStat?.bundle?.payload?.evidence
        || (Array.isArray(benchmarkData) && benchmarkData[0]?.payload?.evidence)
        || {};

    const attachedManifests = runPayloadOrStat?.attachedManifests 
        || runPayloadOrStat?.bundle?.attachedManifests 
        || [];

    const attachedEvidence = runPayloadOrStat?.attachedEvidence 
        || runPayloadOrStat?.bundle?.attachedEvidence 
        || [];

    const hasExtraFiles = 
        Object.keys(manifests).length > 0 || 
        Object.keys(evidence).length > 0 || 
        attachedManifests.length > 0 || 
        attachedEvidence.length > 0;

    // Only skip ZIP creation if there's strictly 1 stage AND no extra manifest/evidence files attached
    if (stages.length === 1 && !hasExtraFiles) {
        const singleStage = stages[0];
        const rawYaml = serializeRawReportToYaml(singleStage.rawReport);
        const stageNum = singleStage.stageIndex ?? 0;
        const stageFileName = getBRV02StageFilename(stageNum);
        triggerFileDownload(rawYaml, stageFileName, 'application/x-yaml');
        return;
    }

    const zipFiles = {};
    const sanitizedLabel = sanitizeFilename(runLabel);
    const shortRunId = rawRunId ? (rawRunId.split('-')[0] || rawRunId.substring(0, 8)) : '';
    const archiveName = shortRunId ? `${sanitizedLabel}-${shortRunId}` : sanitizedLabel;

    stages.forEach((stage, idx) => {
        const rawYaml = serializeRawReportToYaml(stage.rawReport);
        const stageNum = stage.stageIndex ?? idx;
        const cleanStageName = getBRV02StageFilename(stageNum);
        const fullPath = `${archiveName}/${cleanStageName}`;
        zipFiles[fullPath] = strToU8(rawYaml);
    });

    // Unpack locally attached manifest files
    attachedManifests.forEach((file) => {
        if (file.name && file.content) {
            zipFiles[`${archiveName}/${file.name}`] = strToU8(file.content);
        }
    });

    // Unpack inline data: URIs or raw text from manifests into root of ZIP
    Object.entries(manifests).forEach(([filename, val]) => {
        if (val && typeof val === 'string') {
            if (val.startsWith('data:')) {
                const text = parseDataUri(val);
                if (text !== null) {
                    zipFiles[`${archiveName}/${filename}`] = strToU8(text);
                }
            } else if (!val.startsWith('http://') && !val.startsWith('https://') && !val.startsWith('gs://')) {
                zipFiles[`${archiveName}/${filename}`] = strToU8(val);
            }
        }
    });

    // Unpack locally attached evidence files
    attachedEvidence.forEach((file) => {
        if (file.name && file.content) {
            zipFiles[`${archiveName}/evidence/${file.name}`] = strToU8(file.content);
        }
    });

    // Unpack inline data: URIs or raw text from evidence into evidence/ subfolder of ZIP
    Object.entries(evidence).forEach(([filename, val]) => {
        if (val && typeof val === 'string') {
            if (val.startsWith('data:')) {
                const text = parseDataUri(val);
                if (text !== null) {
                    zipFiles[`${archiveName}/evidence/${filename}`] = strToU8(text);
                }
            } else if (!val.startsWith('http://') && !val.startsWith('https://') && !val.startsWith('gs://')) {
                zipFiles[`${archiveName}/evidence/${filename}`] = strToU8(val);
            }
        }
    });

    const zipped = zipSync(zipFiles);
    triggerFileDownload(zipped, `${archiveName}.zip`, 'application/zip');
}

/**
 * Resolves or reconstructs the canonical PrismResultPayload structure for a benchmark run item.
 */
export function getRawPrismCloudPayload(runPayloadOrStat, benchmarkData = []) {
    if (!runPayloadOrStat) return null;

    if (runPayloadOrStat.payload && runPayloadOrStat.payload.entries) {
        return runPayloadOrStat.payload;
    }
    if (runPayloadOrStat.bundle?.payload && runPayloadOrStat.bundle.payload.entries) {
        return runPayloadOrStat.bundle.payload;
    }
    if (runPayloadOrStat.entries && Array.isArray(runPayloadOrStat.entries)) {
        return runPayloadOrStat;
    }

    const dataArr = Array.isArray(benchmarkData) && benchmarkData.length > 0
        ? benchmarkData
        : (runPayloadOrStat.data || (Array.isArray(runPayloadOrStat) ? runPayloadOrStat : [runPayloadOrStat]));

    const first = dataArr[0] || {};

    if (first.payload && first.payload.entries) {
        return first.payload;
    }
    if (first.bundle?.payload && first.bundle.payload.entries) {
        return first.bundle.payload;
    }

    const rawRunId = runPayloadOrStat.runId || runPayloadOrStat.run_id || first.run_id || first.runId || first.source_info?.run_id || '';
    const runLabel = resolveRunLabel(runPayloadOrStat, benchmarkData, []);

    const modelName = runPayloadOrStat.model || runPayloadOrStat.model_name || first.model || first.rawReport?.scenario?.model || 'Unknown Model';
    const hardwareName = runPayloadOrStat.hardware || runPayloadOrStat.hardware_name || first.hardware || first.rawReport?.system?.accelerator?.name || 'Unknown Hardware';
    const acceleratorCount = runPayloadOrStat.accelerator_count || first.accelerator_count || first.rawReport?.system?.accelerator?.count || undefined;

    const manifests = runPayloadOrStat?.manifests 
        || runPayloadOrStat?.payload?.manifests 
        || runPayloadOrStat?.bundle?.payload?.manifests
        || first?.manifests 
        || first?.payload?.manifests
        || null;

    const evidence = runPayloadOrStat?.evidence 
        || runPayloadOrStat?.payload?.evidence 
        || runPayloadOrStat?.bundle?.payload?.evidence
        || first?.evidence 
        || first?.payload?.evidence
        || null;

    const entries = dataArr.map((d, idx) => {
        const rawReport = d.rawReport || d.raw_report || d.payload?.entries?.[0]?.raw_report || d;
        const stageIndex = d.workload?.stage ?? d.prism_stage_index ?? idx;
        const filename = d.filename || getBRV02StageFilename(stageIndex);
        return {
            run_id: rawRunId,
            run_description: runLabel,
            filename,
            prism_stage_index: stageIndex,
            raw_report: rawReport
        };
    });

    const forked_from = runPayloadOrStat?.forked_from 
        || runPayloadOrStat?.payload?.forked_from 
        || runPayloadOrStat?.bundle?.payload?.forked_from
        || first?.forked_from 
        || first?.payload?.forked_from
        || null;

    const github_author = runPayloadOrStat?.github_author 
        || runPayloadOrStat?.payload?.github_author 
        || runPayloadOrStat?.bundle?.payload?.github_author
        || first?.github_author 
        || first?.payload?.github_author
        || (runPayloadOrStat?.submitter ? { username: runPayloadOrStat.submitter } : null);

    return {
        runId: rawRunId,
        runLabel,
        model_name: modelName,
        hardware: {
            hardware_name: hardwareName,
            ...(acceleratorCount ? { accelerator_count: Number(acceleratorCount) } : {})
        },
        format: 'brv02',
        ...(forked_from ? { forked_from } : {}),
        ...(github_author ? { github_author } : {}),
        well_lit_path: runPayloadOrStat.well_lit_path || first.well_lit_path || null,
        inference_tool: runPayloadOrStat.inference_tool || first.inference_tool || null,
        inference_tool_version: runPayloadOrStat.inference_tool_version || first.inference_tool_version || null,
        other_tools: runPayloadOrStat.other_tools || first.other_tools || null,
        manifests,
        evidence,
        run_metadata: runPayloadOrStat.run_metadata || runPayloadOrStat.payload?.run_metadata || first.run_metadata || first.payload?.run_metadata || null,
        // Only run-level metadata is submitted: a normalized entry's metadata carries
        // fields derived for display, which do not belong in a stored payload.
        metadata: runPayloadOrStat.metadata || runPayloadOrStat.payload?.metadata || first.payload?.metadata || null,
        submitter: runPayloadOrStat.submitter || runPayloadOrStat.payload?.submitter || first.submitter || null,
        submitted_at: runPayloadOrStat.submitted_at || runPayloadOrStat.payload?.submitted_at || first.submitted_at || null,
        entries
    };
}

