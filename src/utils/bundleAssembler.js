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

/**
 * Isomorphic & Node/CLI 3-Tier Bundle Assembler for Prism Results Store.
 *
 * Discovers single-run or multi-arm benchmark directories (or declarative `experiment.yaml`),
 * combines Benchmark Report v0.2 stage files into a Run Bundle, applies 3-tier metadata
 * resolution (Tier 1: CLI / experiment.yaml overrides > Tier 2: sibling manifests / config.yaml /
 * run_metadata.yaml > Tier 3: stage report native values), scrubs PII/secrets, validates via
 * `validatePrismUploadStructure({ isUpload: true })`, and generates actionable self-repair
 * remediation recipes and pre-scrubbed GitHub issue links on failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { v4 as uuidv4 } from 'uuid';
import {
    parseReportV02,
    stageToEntry,
    compareOriginalStageOrder,
    mutateRawReportMetadata,
    normalizeTags,
    normalizeReviewers,
} from './benchmarkReportV02Parser.js';
import { validatePrismUploadStructure } from './benchmarkValidator.js';
import { extractMetadataFromManifest, normalizeManifestHardware } from './manifestMetadataExtractor.js';
import { scrubBundlePii, scrubObjectPii, scrubTextPii } from './piiScrubber.js';

const GITHUB_NEW_ISSUE_BASE_URL = 'https://github.com/llm-d/llm-d-prism/issues/new';

/**
 * Checks whether a value is considered an unfilled metadata gap.
 *
 * @param {any} val
 * @returns {boolean}
 */
export function isGapValue(val) {
    if (val === null || val === undefined) return true;
    if (typeof val === 'number') return !Number.isFinite(val) || val <= 0;
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed) return true;
        const lower = trimmed.toLowerCase();
        return (
            lower === 'unknown' ||
            lower === 'unknown model' ||
            lower === 'unknown hardware' ||
            lower === 'n/a' ||
            lower === 'na' ||
            lower === 'none' ||
            lower === 'null' ||
            lower === 'undefined' ||
            lower === '//:' ||
            lower === '0'
        );
    }
    return false;
}

/**
 * Picks the first non-gap value across tier candidates.
 *
 * @param  {...any} candidates
 * @returns {any}
 */
function resolveTierValue(...candidates) {
    for (const c of candidates) {
        if (!isGapValue(c)) {
            return typeof c === 'string' ? c.trim() : c;
        }
    }
    return null;
}

/**
 * Checks if a parsed document or raw YAML/JSON text is a valid Benchmark Report v0.2 stage report.
 *
 * @param {string|object} contentOrDoc
 * @param {string} [filename='']
 * @returns {boolean}
 */
export function isReportV02(contentOrDoc, filename = '') {
    return Boolean(parseReportV02(contentOrDoc, filename));
}

/**
 * Checks if a parsed document or raw JSON/YAML string is an already-assembled Prism Run Bundle
 * (such as the output of `prism fork <runId> --output forked.json`).
 *
 * @param {string|object} contentOrDoc
 * @returns {boolean}
 */
export function isAssembledPrismBundle(contentOrDoc) {
    if (!contentOrDoc) return false;
    let doc = contentOrDoc;
    if (typeof contentOrDoc === 'string') {
        const trimmed = contentOrDoc.trim();
        if (!trimmed) return false;
        try {
            doc = trimmed.startsWith('{') ? JSON.parse(trimmed) : yaml.load(trimmed);
        } catch {
            return false;
        }
    }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
    const target = doc.payload && typeof doc.payload === 'object' && Array.isArray(doc.payload.entries)
        ? doc.payload
        : doc;
    if (!Array.isArray(target.entries) || target.entries.length === 0) return false;
    return target.entries.some(
        (e) => e && typeof e === 'object' && (e.raw_report || e.filename || e.run_id)
    );
}

/**
 * Encodes UTF-8 text as a `data:<mimeType>;base64,...` URI.
 *
 * @param {string} content
 * @param {string} [mimeType='text/yaml']
 * @returns {string}
 */
export function toBase64DataUri(content, mimeType = 'text/yaml') {
    const text = typeof content === 'string' ? content : String(content ?? '');
    if (typeof globalThis !== 'undefined' && typeof globalThis.Buffer !== 'undefined') {
        return `data:${mimeType};base64,${globalThis.Buffer.from(text, 'utf-8').toString('base64')}`;
    }
    return `data:${mimeType};base64,${btoa(unescape(encodeURIComponent(text)))}`;
}

/**
 * Determines whether a parsed BR v0.2 stage record represents a 100%-failed saturation stage.
 *
 * @param {object} parsedStage
 * @returns {boolean}
 */
export function isStageAllFailed(parsedStage) {
    if (!parsedStage) return false;
    const perf = parsedStage.performance || {};
    const failures = perf.failures;
    const totalRequests = perf.totalRequests;
    const throughput = perf.outputTokenRate;
    const latencyVal = perf.e2eMean;

    const hasFailures = typeof failures === 'number' && failures > 0;
    if (!hasFailures) return false;

    const isMissingMetrics =
        throughput === null ||
        throughput === undefined ||
        latencyVal === null ||
        latencyVal === undefined;

    return typeof totalRequests === 'number' && totalRequests > 0
        ? failures >= totalRequests
        : isMissingMetrics;
}

/**
 * Combines an array of parsed BR v0.2 stages into an initial Prism Run Bundle structure.
 *
 * @param {Array<{ parsedStage?: object, content?: string|object, filename: string } | object>} stageInputs
 * @param {object} [options]
 * @param {boolean} [options.dropFailedStages=false]
 * @param {string} [options.runId]
 * @param {string} [options.runLabel]
 * @returns {{ bundle: object, droppedStages: Array<{ stageIndex: number, filename: string, failures: number|null, totalRequests: number|null }>, nativeMetadata: object }}
 */
export function combineStagesToRunBundle(stageInputs, options = {}) {
    const { dropFailedStages = false, runId = uuidv4(), runLabel: explicitRunLabel } = options;
    const parsedItems = [];
    const droppedStages = [];

    for (const item of stageInputs || []) {
        if (!item) continue;
        const filename = item.filename || 'stage_report.yaml';
        const parsedStage = item.parsedStage || (item.rawReport ? item : parseReportV02(item.content || item, filename));
        if (!parsedStage) continue;

        if (dropFailedStages && isStageAllFailed(parsedStage)) {
            droppedStages.push({
                stageIndex: parsedStage.stageIndex ?? 0,
                filename,
                failures: parsedStage.performance?.failures ?? null,
                totalRequests: parsedStage.performance?.totalRequests ?? null,
            });
            continue;
        }

        parsedItems.push({
            filename,
            parsedStage,
            rawReport: parsedStage.rawReport || (typeof item.content === 'object' ? item.content : yaml.load(String(item.content || ''))),
        });
    }

    const firstStage = parsedItems[0]?.parsedStage || null;
    const firstEntry = firstStage ? stageToEntry(firstStage) : null;

    // Extract native Tier 3 metadata from stage reports
    const rawStageModel = resolveTierValue(
        ...parsedItems.map((p) => p.parsedStage?.scenario?.model),
        firstEntry?.model_name
    );
    const rawStageHw = resolveTierValue(
        ...parsedItems.map((p) => {
            const hw = p.parsedStage?.scenario?.hardware;
            if (hw && hw !== 'TPU' && hw !== 'GPU') return hw;
            return null;
        }),
        firstEntry?.hardware && firstEntry.hardware !== 'TPU' && firstEntry.hardware !== 'GPU' ? firstEntry.hardware : null
    );
    const rawStageAccCount = resolveTierValue(
        ...parsedItems.map((p) => p.parsedStage?.scenario?.acceleratorCount),
        ...parsedItems.map((p) => p.parsedStage?.scenario?.tp)
    );
    const rawStageTool = resolveTierValue(
        ...parsedItems.map((p) => p.parsedStage?.inference_tool || p.parsedStage?.scenario?.inferenceTool)
    );
    const rawStageToolVer = resolveTierValue(
        ...parsedItems.map((p) => p.parsedStage?.inference_tool_version || p.parsedStage?.scenario?.inferenceToolVersion)
    );
    const rawStageHarness = resolveTierValue(
        ...parsedItems.map((p) => p.parsedStage?.benchmark_harness || p.parsedStage?.scenario?.harness)
    );
    const rawStageHarnessVer = resolveTierValue(
        ...parsedItems.map((p) => p.parsedStage?.benchmark_harness_version || p.parsedStage?.scenario?.harnessVersion)
    );
    const rawStageRunLabel = resolveTierValue(
        explicitRunLabel,
        ...parsedItems.map((p) => p.parsedStage?.runLabel)
    );

    const resolvedRunLabel = rawStageRunLabel || rawStageModel || 'benchmark_run';

    const entries = parsedItems.map((item) => ({
        run_id: uuidv4(),
        run_description: resolvedRunLabel,
        filename: item.filename,
        raw_report: item.rawReport ? JSON.parse(JSON.stringify(item.rawReport)) : {},
    }));

    entries.sort(compareOriginalStageOrder);
    entries.forEach((entry, idx) => {
        entry.prism_stage_index = idx;
    });

    const nativeTags = normalizeTags(
        entries.flatMap((e) => e.raw_report?.run?.keywords || [])
    );

    const nativeMetadata = {
        runLabel: rawStageRunLabel,
        model_name: rawStageModel,
        hardware_name: rawStageHw ? normalizeManifestHardware(rawStageHw) || rawStageHw : null,
        accelerator_count: rawStageAccCount ? Number(rawStageAccCount) : null,
        inference_tool: rawStageTool,
        inference_tool_version: rawStageToolVer,
        benchmark_harness: rawStageHarness,
        benchmark_harness_version: rawStageHarnessVer,
        tags: nativeTags,
    };

    const bundle = {
        runId,
        runLabel: resolvedRunLabel,
        model_name: nativeMetadata.model_name || '',
        hardware: {
            hardware_name: nativeMetadata.hardware_name || 'Unknown',
            accelerator_count: nativeMetadata.accelerator_count || null,
        },
        format: 'brv02',
        inference_tool: nativeMetadata.inference_tool || null,
        inference_tool_version: nativeMetadata.inference_tool_version || null,
        benchmark_harness: nativeMetadata.benchmark_harness || null,
        benchmark_harness_version: nativeMetadata.benchmark_harness_version || null,
        tags: nativeTags,
        manifests: {},
        evidence: {},
        entries,
    };

    return {
        bundle,
        droppedStages,
        nativeMetadata,
    };
}

/**
 * Generates an actionable self-repair remediation recipe for exit code 2 when validation fails.
 *
 * @param {object} validationOrArmResult
 * @param {object} [armContext={}]
 * @returns {{ cliFlags: string, experimentYamlPatch: object, hint: string }}
 */
export function buildRemediationRecipe(validationOrArmResult, armContext = {}) {
    const validation = validationOrArmResult?.validation || validationOrArmResult || {};
    const errors = Array.isArray(validation.errors) ? validation.errors : [];
    const fieldErrors = validation.fieldErrors || {};
    const bundle = validationOrArmResult?.bundle || armContext?.bundle || {};

    const cliFlagParts = [];
    const defaultsPatch = {};
    const hints = [];

    const hasModelError =
        Boolean(fieldErrors['model_name']) ||
        errors.some((e) => /model_name|model name/i.test(e));
    const hasHwNameError =
        Boolean(fieldErrors['hardware.hardware_name']) ||
        errors.some((e) => /hardware_name|hardware specification|mismatching hardware/i.test(e));
    const hasAccCountError =
        Boolean(fieldErrors['hardware.accelerator_count']) ||
        errors.some((e) => /accelerator_count|accelerator chip count/i.test(e));
    const hasFailedStagesError =
        Object.keys(fieldErrors).some((k) => k.endsWith('.failures')) ||
        errors.some((e) => /100% failed requests|request failure/i.test(e));
    const hasRunLabelError =
        Boolean(fieldErrors['runLabel']) ||
        errors.some((e) => /runLabel|Missing benchmark run name/i.test(e));
    const hasToolMismatch =
        Boolean(fieldErrors['inference_tool']) ||
        errors.some((e) => /mismatching serving stack/i.test(e));

    if (hasModelError) {
        const exampleModel = !isGapValue(bundle.model_name) ? bundle.model_name : 'meta-llama/Llama-3.1-70B-Instruct';
        cliFlagParts.push(`--model "${exampleModel}"`);
        defaultsPatch.model_name = exampleModel;
        hints.push('Pass --model <org/model-name> (or set defaults.model_name in experiment.yaml)');
    }

    if (hasHwNameError) {
        const exampleHw = !isGapValue(bundle.hardware?.hardware_name) ? bundle.hardware.hardware_name : 'H100';
        cliFlagParts.push(`--hardware "${exampleHw}"`);
        if (!defaultsPatch.hardware) defaultsPatch.hardware = {};
        defaultsPatch.hardware.hardware_name = exampleHw;
        hints.push('Pass --hardware <H100|A100|TPU v6e> (or set defaults.hardware.hardware_name in experiment.yaml)');
    }

    if (hasAccCountError) {
        const exampleChips = Number(bundle.hardware?.accelerator_count) > 0 ? Number(bundle.hardware.accelerator_count) : 8;
        cliFlagParts.push(`--chips ${exampleChips}`);
        if (!defaultsPatch.hardware) defaultsPatch.hardware = {};
        defaultsPatch.hardware.accelerator_count = exampleChips;
        hints.push('Pass --chips <count> (or set defaults.hardware.accelerator_count in experiment.yaml)');
    }

    if (hasToolMismatch) {
        const exampleTool = !isGapValue(bundle.inference_tool) ? bundle.inference_tool : 'vLLM';
        cliFlagParts.push(`--tool "${exampleTool}"`);
        defaultsPatch.inference_tool = exampleTool;
        hints.push('Pass --tool <vLLM|SGLang|TensorRT-LLM> to unify serving stack across stages');
    }

    if (hasRunLabelError) {
        defaultsPatch.run_label = armContext.armKey || 'Benchmark Run';
        hints.push('Set run_label on the arm in experiment.yaml');
    }

    if (hasFailedStagesError) {
        cliFlagParts.push('--drop-failed-stages');
        hints.push('Pass --drop-failed-stages to automatically exclude 100%-failed saturation stages');
    }

    const hasEmptyEntriesError =
        Boolean(fieldErrors['entries']) ||
        (Array.isArray(bundle.entries) && bundle.entries.length === 0) ||
        errors.some((e) => /at least one.*stage|entries/i.test(e));

    if (hasEmptyEntriesError) {
        hints.push(
            'Convert raw harness outputs (e.g. stage_*_lifecycle_metrics.json) to Benchmark Report v0.2 first using `llmd-benchmark-report` (`pip install llmd-benchmark-report` or `pip install ./benchmark-report` from llm-d/llm-d-benchmark): benchmark-report <stage_N_lifecycle_metrics.json> <output.yaml> -w inference-perf -b 0.2 (or python -m llmd_benchmark_report.cli ... -w inference-perf -b 0.2)'
        );
    }

    const experimentYamlPatch = Object.keys(defaultsPatch).length > 0 ? { defaults: defaultsPatch } : {};
    const cliFlags = cliFlagParts.join(' ');
    const hint =
        hints.length > 0
            ? `${hints.join(' and ')}.`
            : 'Inspect fieldErrors and provide missing metadata via CLI flags or experiment.yaml.';

    return {
        cliFlags,
        experimentYamlPatch,
        hint,
    };
}

/**
 * Generates a pre-scrubbed GitHub Issue Report object pointing to `llm-d/llm-d-prism/issues/new`.
 * Ensures `scrubTextPii` is applied to `message` and `details` so no PII or secrets ever leak into the URL.
 *
 * @param {object} params
 * @param {string} [params.command='prism']
 * @param {string} [params.errorCode='UNKNOWN_ERROR']
 * @param {string} [params.message='An unexpected error occurred']
 * @param {number} [params.exitCode=1]
 * @param {any} [params.details=null]
 * @param {string} [params.toolVersion='prism-cli/0.1.0']
 * @returns {{
 *   message: string,
 *   newIssueUrl: string,
 *   scrubbedDiagnostics: {
 *     command: string,
 *     exitCode: number,
 *     errorCode: string,
 *     message: string,
 *     details?: any,
 *     nodeVersion: string,
 *     toolVersion: string
 *   }
 * }}
 */
export function buildGithubIssueReport({
    command = 'prism',
    errorCode = 'UNKNOWN_ERROR',
    message = 'An unexpected error occurred.',
    exitCode = 1,
    details = null,
    toolVersion = 'prism-cli/0.1.0',
} = {}) {
    const scrubbedMsg = scrubTextPii(String(message || '')).text;
    let scrubbedDetails = undefined;

    if (details !== null && details !== undefined) {
        if (typeof details === 'string') {
            scrubbedDetails = scrubTextPii(details).text;
        } else if (typeof details === 'object') {
            scrubbedDetails = scrubObjectPii(details).data;
        } else {
            scrubbedDetails = scrubTextPii(String(details)).text;
        }
    }

    const nodeVersion =
        typeof globalThis !== 'undefined' && globalThis.process?.version
            ? globalThis.process.version
            : 'browser';

    const scrubbedDiagnostics = {
        command: scrubTextPii(String(command)).text,
        exitCode: Number(exitCode) || 1,
        errorCode: String(errorCode),
        message: scrubbedMsg,
        ...(scrubbedDetails !== undefined ? { details: scrubbedDetails } : {}),
        nodeVersion,
        toolVersion,
    };

    const issueTitle = `[Prism CLI] ${errorCode} in \`${scrubbedDiagnostics.command}\`: ${scrubbedMsg.slice(0, 80)}`;
    const issueBody = [
        '### Error Summary',
        `- **Command**: \`${scrubbedDiagnostics.command}\``,
        `- **Error Code**: \`${scrubbedDiagnostics.errorCode}\``,
        `- **Exit Code**: \`${scrubbedDiagnostics.exitCode}\``,
        `- **Tool Version**: \`${scrubbedDiagnostics.toolVersion}\``,
        `- **Runtime**: \`${scrubbedDiagnostics.nodeVersion}\``,
        '',
        '### Scrubbed Diagnostics (PII Redacted)',
        '```json',
        JSON.stringify(scrubbedDiagnostics, null, 2),
        '```',
    ].join('\n');

    const newIssueUrl = `${GITHUB_NEW_ISSUE_BASE_URL}?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;

    return {
        message: 'Encountered an error with Prism Results Store tooling? Please file a GitHub issue with the scrubbed diagnostic block below.',
        newIssueUrl,
        scrubbedDiagnostics,
    };
}

/**
 * Classifies whether a filename is a sibling metadata/manifest file rather than a stage report.
 *
 * @param {string} filename
 * @returns {'run_metadata' | 'config' | 'manifest' | 'evidence' | 'candidate_yaml_json' | 'ignore'}
 */
function classifyFilename(filename) {
    const base = path.basename(filename);
    const lower = base.toLowerCase();

    if (lower === 'experiment.yaml' || lower === 'experiment.yml') {
        return 'ignore';
    }
    if (/^run_metadata\.ya?ml$/i.test(base)) {
        return 'run_metadata';
    }
    if (/^config\.ya?ml$/i.test(base)) {
        return 'config';
    }
    if (/prometheus_metrics\.json$/i.test(base) || /\.log$/i.test(base)) {
        return 'evidence';
    }
    if (
        /(?:deployment|statefulset|daemonset|service|values|manifest|lws|leaderworkerset|inferenceservice|inferencepool|pod|k8s).*\.ya?ml$/i.test(
            base
        )
    ) {
        return 'manifest';
    }
    if (/\.(?:ya?ml|json)$/i.test(base)) {
        return 'candidate_yaml_json';
    }
    return 'ignore';
}

/**
 * Normalizes a DCO sign-off input (string `"Name <email>"` or object `{ signed_off_by, signed_at, source }`)
 * into a schema-valid `dco_signoff` object.
 *
 * @param {string|object|null|undefined} rawDco
 * @param {'cli-flag' | 'experiment-manifest' | 'web-wizard'} [defaultSource='experiment-manifest']
 * @returns {object|undefined}
 */
export function normalizeDcoSignoff(rawDco, defaultSource = 'experiment-manifest') {
    if (!rawDco) return undefined;
    if (typeof rawDco === 'string') {
        const trimmed = rawDco.trim();
        if (!trimmed) return undefined;
        return {
            signed_off_by: trimmed,
            signed_at: new Date().toISOString(),
            source: defaultSource,
        };
    }
    if (typeof rawDco === 'object' && rawDco.signed_off_by) {
        return {
            signed_off_by: String(rawDco.signed_off_by).trim(),
            signed_at: rawDco.signed_at || new Date().toISOString(),
            source: rawDco.source || defaultSource,
        };
    }
    return undefined;
}

/**
 * Scans a single arm directory and assembles a resolved, PII-scrubbed, and validated Run Bundle.
 *
 * @param {object} armDescriptor
 * @param {string} armDescriptor.armKey
 * @param {string} armDescriptor.armDir
 * @param {object} [armDescriptor.armConfig={}]
 * @param {object} [armDescriptor.experimentDefaults={}]
 * @param {object} [armDescriptor.experimentMeta={}]
 * @param {object} [options={}]
 * @returns {object}
 */
function assembleSingleArm(
    {
        armKey,
        armDir,
        armConfig = {},
        experimentDefaults = {},
        experimentMeta = {},
        baseDir,
    },
    options = {}
) {
    const cliOverrides = options.overrides || {};
    const dropFailedStages = Boolean(options.dropFailedStages ?? cliOverrides.dropFailedStages);

    const isDirectFile = fs.existsSync(armDir) && fs.statSync(armDir).isFile();
    const effectiveArmDir = isDirectFile ? path.dirname(armDir) : armDir;
    const dirEntries =
        !isDirectFile && fs.existsSync(armDir) && fs.statSync(armDir).isDirectory()
            ? fs.readdirSync(armDir, { withFileTypes: true })
            : [];

    const stageInputs = [];
    const assembledBundles = [];
    const siblingManifestExtractions = [];
    let runMetadataParsed = null;
    let configParsed = null;
    const attachedManifests = {};
    const attachedEvidence = {};

    // Sort directory entries deterministically (or single file if armDir is a file path)
    const sortedFiles = isDirectFile
        ? [path.basename(armDir)]
        : dirEntries
              .filter((d) => d.isFile())
              .map((d) => d.name)
              .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    for (const fname of sortedFiles) {
        const fullPath = isDirectFile ? armDir : path.join(armDir, fname);
        const classification = classifyFilename(fname);
        if (classification === 'ignore') continue;

        let rawContent = '';
        try {
            rawContent = fs.readFileSync(fullPath, 'utf-8');
        } catch {
            continue;
        }

        if (classification === 'evidence') {
            const mime = fname.toLowerCase().endsWith('.json') ? 'application/json' : 'text/plain';
            attachedEvidence[fname] = toBase64DataUri(rawContent, mime);
            continue;
        }

        // Check if it is a valid BR v0.2 stage report or an already-assembled Prism bundle first
        if (classification === 'candidate_yaml_json') {
            const parsedStage = parseReportV02(rawContent, fname);
            if (parsedStage) {
                stageInputs.push({
                    filename: fname,
                    content: rawContent,
                    parsedStage,
                });
                continue;
            }

            let candidateDoc = null;
            try {
                candidateDoc = fname.toLowerCase().endsWith('.json')
                    ? JSON.parse(rawContent)
                    : yaml.load(rawContent);
            } catch {
                candidateDoc = null;
            }

            if (candidateDoc && isAssembledPrismBundle(candidateDoc)) {
                const unwrappedBundle =
                    candidateDoc.payload &&
                    typeof candidateDoc.payload === 'object' &&
                    Array.isArray(candidateDoc.payload.entries)
                        ? candidateDoc.payload
                        : candidateDoc;
                assembledBundles.push(unwrappedBundle);
                for (let idx = 0; idx < unwrappedBundle.entries.length; idx++) {
                    const entry = unwrappedBundle.entries[idx];
                    if (!entry || typeof entry !== 'object') continue;
                    const entryFilename = entry.filename || `stage_${idx}.yaml`;
                    const rawRep = entry.raw_report || entry;
                    const parsedEntryStage = parseReportV02(rawRep, entryFilename);
                    if (parsedEntryStage) {
                        stageInputs.push({
                            filename: entryFilename,
                            content: rawRep,
                            parsedStage: parsedEntryStage,
                        });
                    }
                }
                continue;
            }
        }

        // Otherwise treat YAML/JSON file as a sibling manifest / config / run_metadata file
        if (
            classification === 'run_metadata' ||
            classification === 'config' ||
            classification === 'manifest' ||
            classification === 'candidate_yaml_json'
        ) {
            let parsedDoc = null;
            try {
                parsedDoc = fname.toLowerCase().endsWith('.json') ? JSON.parse(rawContent) : yaml.load(rawContent);
            } catch {
                parsedDoc = null;
            }

            if (classification === 'run_metadata' && parsedDoc && typeof parsedDoc === 'object') {
                runMetadataParsed = parsedDoc;
            } else if (classification === 'config' && parsedDoc && typeof parsedDoc === 'object') {
                configParsed = parsedDoc;
            }

            const extracted = extractMetadataFromManifest(fname, rawContent);
            const hasExtractedMetadata = Boolean(
                extracted.model_name ||
                    extracted.hardware_name ||
                    extracted.accelerator_count ||
                    extracted.inference_tool ||
                    extracted.inference_tool_version ||
                    extracted.well_lit_path ||
                    extracted.helm_ServingStack_values ||
                    classification === 'run_metadata' ||
                    classification === 'config' ||
                    classification === 'manifest'
            );

            if (hasExtractedMetadata) {
                siblingManifestExtractions.push({
                    filename: fname,
                    priority:
                        classification === 'run_metadata'
                            ? 1
                            : classification === 'config'
                                ? 2
                                : 3,
                    extracted,
                });
                const mime = fname.toLowerCase().endsWith('.json') ? 'application/json' : 'text/yaml';
                attachedManifests[fname] = toBase64DataUri(rawContent, mime);
            }
        }
    }

    // Also process any explicit manifest files declared in experimentDefaults.manifests or armConfig.manifests
    const declaredManifestMap = {
        ...(experimentDefaults.manifests || {}),
        ...(armConfig.manifests || {}),
        ...(cliOverrides.manifests || {}),
    };
    for (const [manifestKey, manifestRef] of Object.entries(declaredManifestMap)) {
        if (!manifestRef || typeof manifestRef !== 'string') continue;
        if (
            manifestRef.startsWith('data:') ||
            manifestRef.startsWith('http://') ||
            manifestRef.startsWith('https://') ||
            manifestRef.startsWith('gs://') ||
            manifestRef.startsWith('s3://')
        ) {
            attachedManifests[manifestKey] = manifestRef;
        } else {
            const candidatePath = path.isAbsolute(manifestRef)
                ? manifestRef
                : path.resolve(baseDir || effectiveArmDir, manifestRef);
            if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
                const content = fs.readFileSync(candidatePath, 'utf-8');
                const extracted = extractMetadataFromManifest(path.basename(candidatePath), content);
                siblingManifestExtractions.push({
                    filename: manifestKey,
                    priority: 3,
                    extracted,
                });
                attachedManifests[manifestKey] = toBase64DataUri(content, 'text/yaml');
            }
        }
    }

    // Sort sibling manifest extractions: run_metadata (1) > config.yaml (2) > K8s manifests (3)
    siblingManifestExtractions.sort((a, b) => a.priority - b.priority);

    const primaryAssembledBundle = assembledBundles[0] || null;

    // Combine stages (Tier 3 native extraction)
    const { bundle: rawBundle, droppedStages, nativeMetadata } = combineStagesToRunBundle(stageInputs, {
        dropFailedStages,
        runId:
            cliOverrides.run_id ||
            cliOverrides.runId ||
            armConfig.run_id ||
            armConfig.runId ||
            primaryAssembledBundle?.runId ||
            uuidv4(),
        runLabel: armConfig.run_label || armConfig.runLabel || primaryAssembledBundle?.runLabel,
    });

    // If input was an already-assembled Prism bundle (e.g. `prism fork` output), merge its top-level metadata into nativeMetadata
    if (primaryAssembledBundle) {
        nativeMetadata.runLabel = resolveTierValue(primaryAssembledBundle.runLabel, nativeMetadata.runLabel);
        nativeMetadata.model_name = resolveTierValue(primaryAssembledBundle.model_name, nativeMetadata.model_name);
        const bundleHw = primaryAssembledBundle.hardware?.hardware_name;
        nativeMetadata.hardware_name = resolveTierValue(
            bundleHw ? normalizeManifestHardware(bundleHw) || bundleHw : null,
            nativeMetadata.hardware_name
        );
        nativeMetadata.accelerator_count = resolveTierValue(
            primaryAssembledBundle.hardware?.accelerator_count,
            nativeMetadata.accelerator_count
        );
        nativeMetadata.inference_tool = resolveTierValue(
            primaryAssembledBundle.inference_tool,
            nativeMetadata.inference_tool
        );
        nativeMetadata.inference_tool_version = resolveTierValue(
            primaryAssembledBundle.inference_tool_version,
            nativeMetadata.inference_tool_version
        );
        nativeMetadata.benchmark_harness = resolveTierValue(
            primaryAssembledBundle.benchmark_harness,
            nativeMetadata.benchmark_harness
        );
        nativeMetadata.benchmark_harness_version = resolveTierValue(
            primaryAssembledBundle.benchmark_harness_version,
            nativeMetadata.benchmark_harness_version
        );
        nativeMetadata.well_lit_path = resolveTierValue(
            primaryAssembledBundle.well_lit_path,
            nativeMetadata.well_lit_path
        );
        nativeMetadata.tags = normalizeTags([
            ...(Array.isArray(primaryAssembledBundle.tags) ? primaryAssembledBundle.tags : []),
            ...(nativeMetadata.tags || []),
        ]);
        if (primaryAssembledBundle.manifests && typeof primaryAssembledBundle.manifests === 'object') {
            rawBundle.manifests = { ...primaryAssembledBundle.manifests, ...rawBundle.manifests };
        }
        if (primaryAssembledBundle.evidence && typeof primaryAssembledBundle.evidence === 'object') {
            rawBundle.evidence = { ...primaryAssembledBundle.evidence, ...rawBundle.evidence };
        }
        if (primaryAssembledBundle.run_metadata && !runMetadataParsed) {
            rawBundle.run_metadata = primaryAssembledBundle.run_metadata;
        }
        if (primaryAssembledBundle.metadata) {
            rawBundle.metadata = { ...primaryAssembledBundle.metadata, ...(rawBundle.metadata || {}) };
        }
        if (primaryAssembledBundle.schema_version) {
            rawBundle.schema_version = primaryAssembledBundle.schema_version;
        }
        if (primaryAssembledBundle.forked_from) {
            rawBundle.forked_from =
                typeof primaryAssembledBundle.forked_from === 'string'
                    ? {
                          original_run_id: primaryAssembledBundle.forked_from,
                          original_run_label: primaryAssembledBundle.runLabel || 'Forked Run',
                          original_author: null,
                          source_bucket: 'llm-d-benchmarks',
                          forked_at: new Date().toISOString(),
                      }
                    : primaryAssembledBundle.forked_from;
        }
        if (primaryAssembledBundle.forked !== undefined) {
            rawBundle.forked = Boolean(primaryAssembledBundle.forked);
        }
    }

    // Tier 2 aggregated metadata from sibling files
    const tier2 = {
        model_name: resolveTierValue(...siblingManifestExtractions.map((s) => s.extracted.model_name)),
        hardware_name: resolveTierValue(...siblingManifestExtractions.map((s) => s.extracted.hardware_name)),
        accelerator_count: resolveTierValue(...siblingManifestExtractions.map((s) => s.extracted.accelerator_count)),
        inference_tool: resolveTierValue(...siblingManifestExtractions.map((s) => s.extracted.inference_tool)),
        inference_tool_version: resolveTierValue(
            ...siblingManifestExtractions.map((s) => s.extracted.inference_tool_version)
        ),
        well_lit_path: resolveTierValue(...siblingManifestExtractions.map((s) => s.extracted.well_lit_path)),
    };

    // Tier 1 explicit overrides (CLI flags > per-arm config in experiment.yaml)
    const tier1Explicit = {
        runLabel: resolveTierValue(
            cliOverrides.runLabel,
            cliOverrides.run_label,
            armConfig.run_label,
            armConfig.runLabel
        ),
        model_name: resolveTierValue(
            cliOverrides.model,
            cliOverrides.model_name,
            armConfig.model_name,
            armConfig.model
        ),
        hardware_name: resolveTierValue(
            cliOverrides.hardware,
            cliOverrides.hardware_name,
            cliOverrides.hardware?.hardware_name,
            typeof armConfig.hardware === 'string' ? armConfig.hardware : armConfig.hardware?.hardware_name,
            armConfig.hardware_name
        ),
        accelerator_count: resolveTierValue(
            cliOverrides.chips,
            cliOverrides.accelerator_count,
            cliOverrides.hardware?.accelerator_count,
            armConfig.hardware?.accelerator_count,
            armConfig.accelerator_count,
            armConfig.chips
        ),
        inference_tool: resolveTierValue(
            cliOverrides.tool,
            cliOverrides.inference_tool,
            armConfig.inference_tool
        ),
        inference_tool_version: resolveTierValue(
            cliOverrides.toolVersion,
            cliOverrides.inference_tool_version,
            armConfig.inference_tool_version
        ),
        benchmark_harness: resolveTierValue(
            cliOverrides.harness,
            cliOverrides.benchmark_harness,
            armConfig.benchmark_harness
        ),
        benchmark_harness_version: resolveTierValue(
            cliOverrides.harnessVersion,
            cliOverrides.benchmark_harness_version,
            armConfig.benchmark_harness_version
        ),
        well_lit_path: resolveTierValue(
            cliOverrides.wellLitPath,
            cliOverrides.well_lit_path,
            armConfig.well_lit_path
        ),
    };

    // Campaign defaults from experiment.yaml `defaults:` block (fills gaps without clobbering heterogeneous per-arm native metadata)
    const defaultsTier = {
        runLabel: resolveTierValue(experimentDefaults.run_label, experimentDefaults.runLabel),
        model_name: resolveTierValue(experimentDefaults.model_name, experimentDefaults.model),
        hardware_name: resolveTierValue(
            typeof experimentDefaults.hardware === 'string'
                ? experimentDefaults.hardware
                : experimentDefaults.hardware?.hardware_name,
            experimentDefaults.hardware_name
        ),
        accelerator_count: resolveTierValue(
            experimentDefaults.hardware?.accelerator_count,
            experimentDefaults.accelerator_count,
            experimentDefaults.chips
        ),
        inference_tool: resolveTierValue(experimentDefaults.inference_tool),
        inference_tool_version: resolveTierValue(experimentDefaults.inference_tool_version),
        benchmark_harness: resolveTierValue(experimentDefaults.benchmark_harness),
        benchmark_harness_version: resolveTierValue(experimentDefaults.benchmark_harness_version),
        well_lit_path: resolveTierValue(experimentDefaults.well_lit_path),
    };

    const tier1 = {
        runLabel: resolveTierValue(tier1Explicit.runLabel, defaultsTier.runLabel),
        model_name: resolveTierValue(tier1Explicit.model_name, defaultsTier.model_name),
        hardware_name: resolveTierValue(tier1Explicit.hardware_name, defaultsTier.hardware_name),
        accelerator_count: resolveTierValue(tier1Explicit.accelerator_count, defaultsTier.accelerator_count),
        inference_tool: resolveTierValue(tier1Explicit.inference_tool, defaultsTier.inference_tool),
        inference_tool_version: resolveTierValue(
            tier1Explicit.inference_tool_version,
            defaultsTier.inference_tool_version
        ),
        benchmark_harness: resolveTierValue(tier1Explicit.benchmark_harness, defaultsTier.benchmark_harness),
        benchmark_harness_version: resolveTierValue(
            tier1Explicit.benchmark_harness_version,
            defaultsTier.benchmark_harness_version
        ),
        well_lit_path: resolveTierValue(tier1Explicit.well_lit_path, defaultsTier.well_lit_path),
    };

    // 3-Tier Resolution: Tier 1 explicit (CLI/armConfig) > Tier 2 (sibling manifests) > Tier 3 (stage report) > experimentDefaults
    const resolvedModelName =
        resolveTierValue(
            tier1Explicit.model_name,
            tier2.model_name,
            nativeMetadata.model_name,
            defaultsTier.model_name
        ) || '';
    const rawResolvedHw = resolveTierValue(
        tier1Explicit.hardware_name,
        tier2.hardware_name,
        nativeMetadata.hardware_name,
        defaultsTier.hardware_name
    );
    const resolvedHardwareName = rawResolvedHw
        ? normalizeManifestHardware(rawResolvedHw) || rawResolvedHw
        : 'Unknown';
    const rawResolvedAccCount = resolveTierValue(
        tier1Explicit.accelerator_count,
        tier2.accelerator_count,
        nativeMetadata.accelerator_count,
        defaultsTier.accelerator_count
    );
    const resolvedAcceleratorCount =
        rawResolvedAccCount !== null && rawResolvedAccCount !== undefined ? Number(rawResolvedAccCount) : null;

    const resolvedInferenceTool =
        resolveTierValue(
            tier1Explicit.inference_tool,
            tier2.inference_tool,
            nativeMetadata.inference_tool,
            defaultsTier.inference_tool
        ) || null;
    const resolvedInferenceToolVersion =
        resolveTierValue(
            tier1Explicit.inference_tool_version,
            tier2.inference_tool_version,
            nativeMetadata.inference_tool_version,
            defaultsTier.inference_tool_version
        ) || null;
    const resolvedHarness =
        resolveTierValue(
            tier1Explicit.benchmark_harness,
            nativeMetadata.benchmark_harness,
            defaultsTier.benchmark_harness
        ) || null;
    const resolvedHarnessVersion =
        resolveTierValue(
            tier1Explicit.benchmark_harness_version,
            nativeMetadata.benchmark_harness_version,
            defaultsTier.benchmark_harness_version
        ) || null;
    const resolvedWellLitPath =
        resolveTierValue(
            tier1Explicit.well_lit_path,
            tier2.well_lit_path,
            nativeMetadata.well_lit_path,
            defaultsTier.well_lit_path
        ) || null;

    const resolvedRunLabel =
        resolveTierValue(
            tier1Explicit.runLabel,
            nativeMetadata.runLabel,
            defaultsTier.runLabel,
            armKey && armKey !== 'default' ? armKey : null,
            path.basename(armDir),
            resolvedModelName
        ) || 'benchmark_run';

    const combinedTags = normalizeTags([
        ...(nativeMetadata.tags || []),
        ...(Array.isArray(experimentDefaults.tags) ? experimentDefaults.tags : []),
        ...(Array.isArray(armConfig.tags) ? armConfig.tags : []),
        ...(Array.isArray(cliOverrides.tags) ? cliOverrides.tags : []),
    ]);

    const combinedReviewers = normalizeReviewers([
        ...(Array.isArray(primaryAssembledBundle?.requested_reviewers)
            ? primaryAssembledBundle.requested_reviewers
            : []),
        ...(Array.isArray(experimentMeta.requested_reviewers) ? experimentMeta.requested_reviewers : []),
        ...(Array.isArray(experimentDefaults.requested_reviewers) ? experimentDefaults.requested_reviewers : []),
        ...(Array.isArray(armConfig.requested_reviewers) ? armConfig.requested_reviewers : []),
        ...(Array.isArray(cliOverrides.requested_reviewers) ? cliOverrides.requested_reviewers : []),
    ]);

    const resolvedDcoSignoff =
        normalizeDcoSignoff(cliOverrides.dco_signoff || cliOverrides.dcoSignoff, 'cli-flag') ||
        normalizeDcoSignoff(
            armConfig.dco_signoff ||
                experimentMeta.dco_signoff ||
                experimentDefaults.dco_signoff ||
                primaryAssembledBundle?.dco_signoff,
            'experiment-manifest'
        );

    const resolvedAgentProvenance =
        cliOverrides.agent_provenance ||
        armConfig.agent_provenance ||
        experimentMeta.agent_provenance ||
        experimentDefaults.agent_provenance ||
        primaryAssembledBundle?.agent_provenance ||
        undefined;

    const resolvedExperimentId =
        cliOverrides.experiment_id ||
        cliOverrides.experimentId ||
        armConfig.experiment_id ||
        experimentMeta.id ||
        experimentMeta.experiment_id ||
        primaryAssembledBundle?.experiment_id ||
        undefined;

    const resolvedExperimentLabel =
        cliOverrides.experiment_label ||
        cliOverrides.experimentLabel ||
        armConfig.experiment_label ||
        experimentMeta.label ||
        experimentMeta.experiment_label ||
        primaryAssembledBundle?.experiment_label ||
        undefined;

    const resolvedBaselineRunId =
        cliOverrides.baseline_run_id ||
        cliOverrides.baselineRunId ||
        armConfig.baseline_run_id ||
        experimentMeta.baseline_run_id ||
        primaryAssembledBundle?.baseline_run_id ||
        undefined;

    // Update bundle with resolved metadata
    rawBundle.runLabel = resolvedRunLabel;
    rawBundle.model_name = resolvedModelName;
    rawBundle.hardware = {
        hardware_name: resolvedHardwareName,
        accelerator_count: resolvedAcceleratorCount,
    };
    rawBundle.inference_tool = resolvedInferenceTool;
    rawBundle.inference_tool_version = resolvedInferenceToolVersion;
    rawBundle.benchmark_harness = resolvedHarness;
    rawBundle.benchmark_harness_version = resolvedHarnessVersion;
    rawBundle.well_lit_path = resolvedWellLitPath;
    rawBundle.tags = combinedTags;
    rawBundle.manifests = {
        ...rawBundle.manifests,
        ...attachedManifests,
    };
    rawBundle.evidence = {
        ...rawBundle.evidence,
        ...attachedEvidence,
        ...(experimentDefaults.evidence || {}),
        ...(armConfig.evidence || {}),
    };
    if (runMetadataParsed) {
        rawBundle.run_metadata = runMetadataParsed;
    }
    if (armConfig.metadata || experimentDefaults.metadata || configParsed) {
        rawBundle.metadata = {
            ...(configParsed ? { config: configParsed } : {}),
            ...(experimentDefaults.metadata || {}),
            ...(armConfig.metadata || {}),
        };
    }
    if (combinedReviewers.length > 0) {
        rawBundle.requested_reviewers = combinedReviewers;
    }
    if (resolvedExperimentId) {
        rawBundle.experiment_id = resolvedExperimentId;
    }
    if (resolvedExperimentLabel) {
        rawBundle.experiment_label = resolvedExperimentLabel;
    }
    if (resolvedBaselineRunId) {
        rawBundle.baseline_run_id = resolvedBaselineRunId;
    }
    if (resolvedDcoSignoff) {
        rawBundle.dco_signoff = resolvedDcoSignoff;
    }
    if (resolvedAgentProvenance) {
        rawBundle.agent_provenance = resolvedAgentProvenance;
    }
    if (
        cliOverrides.github_author ||
        armConfig.github_author ||
        experimentMeta.github_author ||
        primaryAssembledBundle?.github_author
    ) {
        rawBundle.github_author =
            cliOverrides.github_author ||
            armConfig.github_author ||
            experimentMeta.github_author ||
            primaryAssembledBundle?.github_author;
    }

    // Propagate resolved root metadata into every stage's raw_report via mutateRawReportMetadata
    rawBundle.entries = (rawBundle.entries || []).map((entry) => ({
        ...entry,
        run_description: resolvedRunLabel,
        raw_report: mutateRawReportMetadata(entry.raw_report, {
            model_name: resolvedModelName || undefined,
            hardware_name:
                resolvedHardwareName && resolvedHardwareName !== 'Unknown' ? resolvedHardwareName : undefined,
            runLabel: resolvedRunLabel || undefined,
            tags: combinedTags.length > 0 ? combinedTags : undefined,
            inference_tool: resolvedInferenceTool || undefined,
            inference_tool_version: resolvedInferenceToolVersion || undefined,
            benchmark_harness: resolvedHarness || undefined,
            benchmark_harness_version: resolvedHarnessVersion || undefined,
            accelerator_count: resolvedAcceleratorCount || undefined,
        }),
    }));

    // Run mandatory PII Scrubber across the assembled bundle
    const { bundle: scrubbedBundle, piiReport } = scrubBundlePii(rawBundle, options.scrubOptions);

    // Run full Prism upload structure validation
    const validation = validatePrismUploadStructure(scrubbedBundle, { isUpload: true });

    const armResult = {
        armKey,
        path: armDir,
        isBaseline: Boolean(armConfig.is_baseline || armConfig.isBaseline),
        bundle: scrubbedBundle,
        piiReport,
        droppedStages,
        isValid: validation.isValid,
        errors: validation.errors,
        warnings: validation.warnings,
        fieldErrors: validation.fieldErrors,
        validation,
        remediation: null,
        tierResolution: {
            tier1,
            tier2,
            tier3: nativeMetadata,
        },
    };

    if (!validation.isValid) {
        armResult.remediation = buildRemediationRecipe(armResult, { armKey, armDir, bundle: scrubbedBundle });
    }

    return armResult;
}

/**
 * Discovers single-run or multi-arm benchmark directories (or parses an `experiment.yaml` manifest)
 * and assembles validated, PII-scrubbed Run Bundles.
 *
 * @param {string} targetPath - Path to an `experiment.yaml` file OR a directory.
 * @param {object} [options={}]
 * @param {object} [options.overrides] - Tier 1 CLI metadata overrides.
 * @param {boolean} [options.dropFailedStages=false] - Whether to drop 100%-failed saturation stages.
 * @param {boolean} [options.ignoreExperimentYaml=false] - Ignore `experiment.yaml` inside directory.
 * @param {object} [options.scrubOptions] - Options forwarded to `scrubBundlePii`.
 * @returns {{
 *   ok: boolean,
 *   exitCode: number,
 *   experiment: object,
 *   arms: Array<object>,
 *   piiReport: object,
 *   errors: Array<string>,
 *   issueReport?: object
 * }}
 */
export function discoverAndAssembleArms(targetPath, options = {}) {
    const resolvedTarget = path.resolve(String(targetPath || '.'));
    if (!fs.existsSync(resolvedTarget)) {
        const errMsg = `Target path does not exist: ${resolvedTarget}`;
        return {
            ok: false,
            exitCode: 1,
            experiment: {},
            arms: [],
            piiReport: { scrubbed: true, total_redactions: 0, totalRedactions: 0, categories: {}, findings: [] },
            errors: [errMsg],
            issueReport: buildGithubIssueReport({
                command: 'prism validate',
                errorCode: 'TARGET_NOT_FOUND',
                message: errMsg,
                exitCode: 1,
            }),
        };
    }

    const stat = fs.statSync(resolvedTarget);
    let experimentConfig = null;
    let baseDir = resolvedTarget;
    let directFileArmDescriptor = null;

    if (stat.isFile()) {
        baseDir = path.dirname(resolvedTarget);
        const rawFile = fs.readFileSync(resolvedTarget, 'utf-8');
        let parsedFile = null;
        try {
            parsedFile = resolvedTarget.toLowerCase().endsWith('.json')
                ? JSON.parse(rawFile)
                : yaml.load(rawFile);
        } catch {
            parsedFile = null;
        }

        if (
            isAssembledPrismBundle(parsedFile) ||
            isReportV02(parsedFile || rawFile, path.basename(resolvedTarget))
        ) {
            directFileArmDescriptor = {
                armKey: path.basename(resolvedTarget, path.extname(resolvedTarget)) || 'default',
                armDir: resolvedTarget,
                armConfig: {},
                experimentDefaults: {},
                experimentMeta: {},
                baseDir,
            };
        } else {
            experimentConfig = parsedFile || {};
        }
    } else if (stat.isDirectory() && !options.ignoreExperimentYaml) {
        const expYamlPath = path.join(resolvedTarget, 'experiment.yaml');
        const expYmlPath = path.join(resolvedTarget, 'experiment.yml');
        if (fs.existsSync(expYamlPath)) {
            experimentConfig = yaml.load(fs.readFileSync(expYamlPath, 'utf-8')) || {};
        } else if (fs.existsSync(expYmlPath)) {
            experimentConfig = yaml.load(fs.readFileSync(expYmlPath, 'utf-8')) || {};
        }
    }

    const experimentMeta = {
        ...(experimentConfig?.experiment || {}),
        ...(experimentConfig?.id && !experimentConfig?.experiment?.id ? { id: experimentConfig.id } : {}),
        ...(experimentConfig?.label && !experimentConfig?.experiment?.label ? { label: experimentConfig.label } : {}),
    };
    const experimentDefaults = experimentConfig?.defaults || {};

    const armDescriptors = [];

    if (directFileArmDescriptor) {
        armDescriptors.push(directFileArmDescriptor);
    } else if (experimentConfig && Array.isArray(experimentConfig.arms) && experimentConfig.arms.length > 0) {
        for (let i = 0; i < experimentConfig.arms.length; i++) {
            const armEntry = experimentConfig.arms[i] || {};
            const relArmPath = armEntry.path || armEntry.dir || '.';
            const absArmDir = path.isAbsolute(relArmPath) ? relArmPath : path.resolve(baseDir, relArmPath);
            const armKey = armEntry.key || armEntry.id || path.basename(absArmDir) || `arm-${i + 1}`;
            armDescriptors.push({
                armKey,
                armDir: absArmDir,
                armConfig: armEntry,
                experimentDefaults,
                experimentMeta,
                baseDir,
            });
        }
    } else {
        // Auto-discover in directory: check if baseDir itself has BR v0.2 stage reports or pre-assembled Prism bundles
        const entries = fs.readdirSync(baseDir, { withFileTypes: true });
        const rootHasStageReports = entries
            .filter((d) => d.isFile() && /\.(?:ya?ml|json)$/i.test(d.name))
            .some((d) => {
                if (classifyFilename(d.name) !== 'candidate_yaml_json') return false;
                try {
                    const content = fs.readFileSync(path.join(baseDir, d.name), 'utf-8');
                    return isReportV02(content, d.name) || isAssembledPrismBundle(content);
                } catch {
                    return false;
                }
            });

        if (rootHasStageReports) {
            armDescriptors.push({
                armKey: path.basename(baseDir) || 'default',
                armDir: baseDir,
                armConfig: {},
                experimentDefaults,
                experimentMeta,
                baseDir,
            });
        } else {
            // Check subdirectories (and nested `./arms/*` if present)
            const candidateDirs = [];
            const subdirs = entries
                .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            for (const sub of subdirs) {
                const subPath = path.join(baseDir, sub.name);
                if (sub.name === 'arms') {
                    const nested = fs
                        .readdirSync(subPath, { withFileTypes: true })
                        .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
                        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
                    for (const n of nested) {
                        candidateDirs.push(path.join(subPath, n.name));
                    }
                } else {
                    candidateDirs.push(subPath);
                }
            }

            for (const candDir of candidateDirs) {
                const filesInSub = fs.readdirSync(candDir, { withFileTypes: true });
                const hasReports = filesInSub
                    .filter((f) => f.isFile() && /\.(?:ya?ml|json)$/i.test(f.name))
                    .some((f) => {
                        if (classifyFilename(f.name) !== 'candidate_yaml_json') return false;
                        try {
                            const content = fs.readFileSync(path.join(candDir, f.name), 'utf-8');
                            return isReportV02(content, f.name) || isAssembledPrismBundle(content);
                        } catch {
                            return false;
                        }
                    });
                if (hasReports) {
                    const armName = path.basename(candDir);
                    armDescriptors.push({
                        armKey: armName,
                        armDir: candDir,
                        armConfig: {
                            is_baseline: /baseline/i.test(armName),
                        },
                        experimentDefaults,
                        experimentMeta,
                        baseDir,
                    });
                }
            }

            // If no subdirectories had reports either, still assemble baseDir so caller gets standard validation error
            if (armDescriptors.length === 0) {
                armDescriptors.push({
                    armKey: path.basename(baseDir) || 'default',
                    armDir: baseDir,
                    armConfig: {},
                    experimentDefaults,
                    experimentMeta,
                    baseDir,
                });
            }
        }
    }

    // Ensure shared experiment_id when multi-arm or experiment config is used
    if (armDescriptors.length > 1 && !experimentMeta.id && !experimentMeta.experiment_id) {
        experimentMeta.id = uuidv4();
    }

    const arms = armDescriptors.map((desc) => assembleSingleArm(desc, options));

    // Aggregate PII report across all arms
    const aggregatedCategories = {};
    const aggregatedFindings = [];
    let totalRedactions = 0;

    for (const arm of arms) {
        if (!arm.piiReport) continue;
        totalRedactions += arm.piiReport.total_redactions || 0;
        for (const [cat, cnt] of Object.entries(arm.piiReport.categories || {})) {
            aggregatedCategories[cat] = (aggregatedCategories[cat] || 0) + cnt;
        }
        for (const f of arm.piiReport.findings || []) {
            aggregatedFindings.push({
                ...f,
                armKey: arm.armKey,
                path: `${arm.armKey}.${f.path}`,
            });
        }
    }

    const allValid = arms.length > 0 && arms.every((a) => a.isValid);
    const allErrors = arms.flatMap((a) => a.errors.map((e) => `[${a.armKey}] ${e}`));
    const nowIso = new Date().toISOString();

    const result = {
        ok: allValid,
        exitCode: allValid ? 0 : 2,
        experiment: {
            id: experimentMeta.id || experimentMeta.experiment_id || null,
            label: experimentMeta.label || experimentMeta.experiment_label || null,
            target_state: experimentMeta.target_state || 'submitted_pending_review',
            requested_reviewers: normalizeReviewers(experimentMeta.requested_reviewers || []),
            dco_signoff: experimentMeta.dco_signoff || null,
            agent_provenance: experimentMeta.agent_provenance || null,
        },
        arms,
        piiReport: {
            scrubbed: true,
            scrubbed_at: nowIso,
            scrubbedAt: nowIso,
            total_redactions: totalRedactions,
            totalRedactions,
            categories: aggregatedCategories,
            findings: aggregatedFindings,
        },
        errors: allErrors,
    };

    if (!allValid) {
        result.issueReport = buildGithubIssueReport({
            command: 'prism validate',
            errorCode: 'PREFLIGHT_VALIDATION_FAILED',
            message: `${arms.filter((a) => !a.isValid).length} of ${arms.length} arm(s) failed preflight validation.`,
            exitCode: 2,
            details: arms
                .filter((a) => !a.isValid)
                .map((a) => ({
                    armKey: a.armKey,
                    errors: a.errors,
                    remediation: a.remediation,
                })),
        });
    }

    return result;
}

/**
 * Scans `dirPath`, runs 3-tier metadata inference + PII scrubbing, and generates a declarative
 * `experiment.yaml` configuration for `prism init`.
 *
 * @param {string} dirPath
 * @param {object} [options={}]
 * @param {string} [options.experimentId]
 * @param {string} [options.experimentLabel]
 * @param {string} [options.targetState='submitted_pending_review']
 * @param {string} [options.baseline]
 * @param {object} [options.overrides]
 * @returns {{ configObject: object, yamlString: string, piiReport: object, discoveredArms: Array<object> }}
 */
export function generateExperimentYamlConfig(dirPath, options = {}) {
    const resolvedDir = path.resolve(String(dirPath || '.'));
    const assembly = discoverAndAssembleArms(resolvedDir, {
        ...options,
        ignoreExperimentYaml: true,
    });

    const firstBundle = assembly.arms[0]?.bundle || {};
    const armBundles = assembly.arms.map((a) => a.bundle || {});

    const resolveSharedDefault = (values, fallbackWhenAllGap = undefined) => {
        const nonGap = values.filter((v) => !isGapValue(v));
        if (nonGap.length === 0) return { isShared: true, value: fallbackWhenAllGap };
        const distinct = Array.from(new Set(nonGap));
        if (distinct.length === 1) {
            return { isShared: true, value: distinct[0] };
        }
        return { isShared: false, value: undefined };
    };

    const sharedModel = resolveSharedDefault(
        armBundles.map((b) => b.model_name),
        'Unknown'
    );
    const sharedHw = resolveSharedDefault(
        armBundles.map((b) => b.hardware?.hardware_name),
        'Unknown'
    );
    const sharedChips = resolveSharedDefault(
        armBundles.map((b) => (Number(b.hardware?.accelerator_count) > 0 ? Number(b.hardware.accelerator_count) : null)),
        1
    );
    const sharedTool = resolveSharedDefault(
        armBundles.map((b) => b.inference_tool),
        'vLLM'
    );
    const sharedToolVer = resolveSharedDefault(
        armBundles.map((b) => b.inference_tool_version),
        undefined
    );
    const sharedHarness = resolveSharedDefault(
        armBundles.map((b) => b.benchmark_harness),
        options.harness || options.benchmark_harness || undefined
    );
    const sharedHarnessVer = resolveSharedDefault(
        armBundles.map((b) => b.benchmark_harness_version),
        options.harnessVersion || options.benchmark_harness_version || undefined
    );

    const experimentId = options.experimentId || assembly.experiment.id || uuidv4();
    const experimentLabel =
        options.experimentLabel ||
        assembly.experiment.label ||
        `${path.basename(resolvedDir)} Benchmark Campaign`;

    const explicitTags = Array.isArray(options.tags)
        ? normalizeTags(options.tags)
        : typeof options.tags === 'string'
          ? normalizeTags(options.tags.split(','))
          : [];
    const mergedDefaultTags = normalizeTags([...(firstBundle.tags || []), ...explicitTags]);
    const resolvedWellLitPath = options.wellLitPath || options.well_lit_path || firstBundle.well_lit_path || undefined;
    const resolvedReviewers = options.requestedReviewers || options.reviewers || undefined;

    const defaultsBlock = {
        ...(sharedModel.isShared && sharedModel.value !== undefined ? { model_name: sharedModel.value } : {}),
        ...(sharedHw.isShared || sharedChips.isShared
            ? {
                  hardware: {
                      ...(sharedHw.isShared && sharedHw.value !== undefined ? { hardware_name: sharedHw.value } : {}),
                      ...(sharedChips.isShared && sharedChips.value !== undefined
                          ? { accelerator_count: sharedChips.value }
                          : {}),
                  },
              }
            : {}),
        ...(sharedTool.isShared && sharedTool.value !== undefined ? { inference_tool: sharedTool.value } : {}),
        ...(sharedToolVer.isShared && sharedToolVer.value ? { inference_tool_version: sharedToolVer.value } : {}),
        ...(sharedHarness.isShared && sharedHarness.value ? { benchmark_harness: sharedHarness.value } : {}),
        ...(sharedHarnessVer.isShared && sharedHarnessVer.value ? { benchmark_harness_version: sharedHarnessVer.value } : {}),
        ...(resolvedWellLitPath ? { well_lit_path: resolvedWellLitPath } : {}),
        ...(mergedDefaultTags.length > 0 ? { tags: mergedDefaultTags } : {}),
    };

    const rawConfigObject = {
        version: '1.0',
        experiment: {
            id: experimentId,
            label: experimentLabel,
            target_state: options.targetState || 'submitted_pending_review',
            ...(resolvedReviewers
                ? { requested_reviewers: normalizeReviewers(resolvedReviewers) }
                : {}),
            ...(options.dcoSignoff ? { dco_signoff: options.dcoSignoff } : {}),
        },
        defaults: defaultsBlock,
        arms: assembly.arms.map((arm, idx) => {
            const relPath = path.relative(resolvedDir, arm.path) || '.';
            const normalizedRel = relPath === '.' ? '.' : `./${relPath.replace(/\\/g, '/')}`;
            const isBaseline = options.baseline
                ? arm.armKey === options.baseline || path.basename(arm.path) === options.baseline
                : Boolean(arm.isBaseline || (idx === 0 && assembly.arms.length > 1 && /baseline/i.test(arm.armKey)));
            const armBundle = arm.bundle || {};
            const armHw = {};
            if (!sharedHw.isShared && !isGapValue(armBundle.hardware?.hardware_name)) {
                armHw.hardware_name = armBundle.hardware.hardware_name;
            }
            if (!sharedChips.isShared && Number(armBundle.hardware?.accelerator_count) > 0) {
                armHw.accelerator_count = Number(armBundle.hardware.accelerator_count);
            }
            const explicitSingleArmLabel =
                assembly.arms.length === 1 && (options.runLabel || options.label)
                    ? String(options.runLabel || options.label).trim()
                    : '';
            const armTags = normalizeTags([...(armBundle.tags || []), ...explicitTags]);
            return {
                key: arm.armKey,
                run_label: explicitSingleArmLabel || armBundle.runLabel || arm.armKey,
                path: normalizedRel,
                ...(isBaseline ? { is_baseline: true } : {}),
                ...(!sharedModel.isShared && !isGapValue(armBundle.model_name)
                    ? { model_name: armBundle.model_name }
                    : {}),
                ...(Object.keys(armHw).length > 0 ? { hardware: armHw } : {}),
                ...(!sharedTool.isShared && !isGapValue(armBundle.inference_tool)
                    ? { inference_tool: armBundle.inference_tool }
                    : {}),
                ...(!sharedToolVer.isShared && !isGapValue(armBundle.inference_tool_version)
                    ? { inference_tool_version: armBundle.inference_tool_version }
                    : {}),
                ...(armTags.length > 0 ? { tags: armTags } : {}),
            };
        }),
    };

    const { data: configObject, piiReport: configPiiReport } = scrubObjectPii(rawConfigObject, options.scrubOptions);
    const yamlString = yaml.dump(configObject, {
        noRefs: true,
        lineWidth: 100,
    });

    // Combine assembly PII report with config object PII report
    const combinedTotal = (assembly.piiReport?.total_redactions || 0) + (configPiiReport.total_redactions || 0);
    const combinedCategories = { ...(assembly.piiReport?.categories || {}) };
    for (const [k, v] of Object.entries(configPiiReport.categories || {})) {
        combinedCategories[k] = (combinedCategories[k] || 0) + v;
    }

    return {
        configObject,
        yamlString,
        piiReport: {
            ...assembly.piiReport,
            total_redactions: combinedTotal,
            totalRedactions: combinedTotal,
            categories: combinedCategories,
        },
        discoveredArms: assembly.arms,
    };
}
