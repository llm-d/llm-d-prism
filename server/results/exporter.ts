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
import { PrismResultPayload } from './api.ts';

/**
 * Sanitizes a string for safe filename and directory usage while preserving commas.
 */
export function sanitizeFilename(name: string): string {
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
export function getBRV02StageFilename(stageIndex: number): string {
    const stageNum = typeof stageIndex === 'number' && !isNaN(stageIndex) ? stageIndex : 0;
    return `benchmark_report_v0.2,_stage_${stageNum}_lifecycle_metrics.json.yaml`;
}

/**
 * Resolves a human-friendly run label from PrismResultPayload,
 * ignoring internal synthetic keys (e.g. "brv02:...", "results-store:...").
 */
export function resolvePayloadRunLabel(payload: PrismResultPayload): string {
    const firstReport = (payload.entries?.[0]?.raw_report || {}) as Record<string, any>;
    const rawStack = Array.isArray(firstReport.scenario?.stack) ? firstReport.scenario.stack : [];
    const stackModel = rawStack.find((c: any) => c?.standardized?.model?.name)?.standardized?.model?.name;
    const modelName = payload.model_name || stackModel || '';

    const candidates = [
        payload.runLabel,
        firstReport.run?.description,
        firstReport.run?.label,
        firstReport.scenario?.model,
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
                (modelName ? trimmed.toLowerCase() !== modelName.toLowerCase() : true)
            ) {
                return trimmed;
            }
        }
    }

    // Priority 2: Fallback to any valid non-synthetic candidate or modelName
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
export function serializeRawReportToYaml(rawReport: unknown): string {
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
 * Decodes a data: URI into string content.
 * Handles both base64-encoded and percent-encoded (URL-encoded) data URIs.
 */
export function parseDataUri(dataUri: string): string | null {
    if (!dataUri || typeof dataUri !== 'string' || !dataUri.startsWith('data:')) return null;

    const commaIdx = dataUri.indexOf(',');
    if (commaIdx === -1) return null;

    const meta = dataUri.substring(5, commaIdx);
    const rawData = dataUri.substring(commaIdx + 1);

    try {
        if (meta.includes(';base64')) {
            return Buffer.from(rawData, 'base64').toString('utf-8');
        } else {
            return decodeURIComponent(rawData);
        }
    } catch (e) {
        console.warn('Failed to decode data URI:', e);
        return null;
    }
}

/**
 * Encodes string content into an optimal data: URI.
 * Compares Base64 vs Percent-Encoding (encodeURIComponent) and returns whichever string is shorter.
 */
export function toOptimalDataUri(content: string, mimeType = 'text/plain'): string {
    const text = typeof content === 'string' ? content : String(content);
    const base64Str = Buffer.from(text, 'utf-8').toString('base64');
    const base64Uri = `data:${mimeType};base64,${base64Str}`;

    const percentStr = encodeURIComponent(text);
    const percentUri = `data:${mimeType};charset=utf-8,${percentStr}`;

    return percentUri.length < base64Uri.length ? percentUri : base64Uri;
}

/**
 * Packs all constituent stage entries of a PrismResultPayload into a ZIP buffer containing BRV0.2 .yaml files,
 * as well as unpacking data: URIs in manifests (to root) and evidence (to evidence/ subfolder).
 */
export function createRunZipBuffer(payload: PrismResultPayload): { buffer: Buffer; filename: string } {
    const rawLabel = resolvePayloadRunLabel(payload);
    const runLabel = sanitizeFilename(rawLabel);
    const rawRunId = payload.runId || '';
    const shortRunId = rawRunId ? (rawRunId.split('-')[0] || rawRunId.substring(0, 8)) : '';
    const archiveName = shortRunId ? `${runLabel}-${shortRunId}` : runLabel;
    const zipFiles: Record<string, Uint8Array> = {};

    const entries = payload.entries || [];
    const stageNameCounts = new Map<string, number>();
    entries.forEach((entry, idx) => {
        const rawYaml = serializeRawReportToYaml(entry.raw_report);
        const stageNum = entry.prism_stage_index ?? idx;
        const canonicalName = getBRV02StageFilename(stageNum);
        const count = (stageNameCounts.get(canonicalName) || 0) + 1;
        stageNameCounts.set(canonicalName, count);
        const cleanStageName = count === 1
            ? canonicalName
            : canonicalName.replace('.json.yaml', `_${count}.json.yaml`);
        const fullPath = `${archiveName}/${cleanStageName}`;
        zipFiles[fullPath] = strToU8(rawYaml);
    });

    // Unpack inline data: URIs from manifests into root folder of ZIP
    if (payload.manifests) {
        Object.entries(payload.manifests).forEach(([filename, val]) => {
            if (val && typeof val === 'string' && val.startsWith('data:')) {
                const text = parseDataUri(val);
                if (text !== null) {
                    zipFiles[`${archiveName}/${filename}`] = strToU8(text);
                }
            }
        });
    }

    // Unpack inline data: URIs from evidence into evidence/ subfolder of ZIP
    if (payload.evidence) {
        Object.entries(payload.evidence).forEach(([filename, val]) => {
            if (val && typeof val === 'string' && val.startsWith('data:')) {
                const text = parseDataUri(val);
                if (text !== null) {
                    zipFiles[`${archiveName}/evidence/${filename}`] = strToU8(text);
                }
            }
        });
    }

    const zipped = zipSync(zipFiles);
    return {
        buffer: Buffer.from(zipped),
        filename: `${archiveName}.zip`,
    };
}

