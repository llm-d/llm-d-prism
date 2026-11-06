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

/* eslint-disable no-unused-vars */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

import {
    scrubTextPii,
    scrubObjectPii,
    scrubBundlePii,
} from '../src/utils/piiScrubber.js';
import {
    discoverAndAssembleArms,
    generateExperimentYamlConfig,
    buildRemediationRecipe,
    buildGithubIssueReport,
} from '../src/utils/bundleAssembler.js';
import { encodeShareLink, isValidUuid } from '../src/utils/shareLinkEncoder.js';
import { forkBenchmarkPayload, buildForkedBundle } from '../src/utils/benchmarkForker.js';
import { validatePrismUploadStructure } from '../src/utils/benchmarkValidator.js';
import { parseReportV02, stageToEntry } from '../src/utils/benchmarkReportV02Parser.js';

export const PRISM_CLI_VERSION = 'prism-cli/0.1.0';
export const DEFAULT_API_URL = 'https://prism.llm-d.ai';
export const DEFAULT_UI_URL = 'https://prism.llm-d.ai';
const GITHUB_ISSUES_NEW_URL = 'https://github.com/llm-d/llm-d-prism/issues/new';
const DCO_REGEX = /^[^<>]+\s+<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>$/;

export interface PrismCliIo {
    stdout?: (msg: string) => void;
    stderr?: (msg: string) => void;
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    isTTY?: boolean;
    execTokenFn?: () => string | null;
}

export interface PiiReportNormalized {
    scrubbed: boolean;
    scrubbed_at: string;
    scrubbedAt: string;
    total_redactions: number;
    totalRedactions: number;
    categories: Record<string, number>;
    findings: Array<{ category: string; path?: string; count: number; matchPreview?: string }>;
    filesScanned?: number;
}

export interface IssueReport {
    message: string;
    newIssueUrl: string;
    issueReportUrl: string;
    scrubbedDiagnostics: Record<string, unknown>;
}

export interface PrismCliResult {
    exitCode: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: Record<string, any>;
}

interface ParsedCliArgs {
    command: string;
    positionals: string[];
    flags: {
        output?: string;
        file?: string;
        experimentId?: string;
        experimentLabel?: string;
        baseline?: string;
        targetState?: string;
        publish?: boolean;
        dcoSignoff?: string;
        yesUserApproved?: boolean;
        reviewers?: string;
        model?: string;
        hardware?: string;
        chips?: number;
        tool?: string;
        toolVersion?: string;
        harness?: string;
        harnessVersion?: string;
        wellLitPath?: string;
        dropFailedStages?: boolean;
        inPlace?: boolean;
        strict?: boolean;
        dryRun?: boolean;
        concurrency?: number;
        apiUrl?: string;
        uiUrl?: string;
        status?: string;
        own?: boolean;
        limit?: number;
        exportDir?: string;
        stage?: number;
        sloTtftMs?: number;
        sloTpotMs?: number;
        markdown?: boolean;
        feedback?: string;
        label?: string;
        tags?: string;
        json?: boolean;
        help?: boolean;
    };
}

const BOOLEAN_FLAGS = new Set([
    '--json',
    '--in-place',
    '--strict',
    '--drop-failed-stages',
    '--publish',
    '--yes-user-approved',
    '--dry-run',
    '--own',
    '--markdown',
    '--help',
    '-h',
]);

const SHORT_FLAG_ALIASES: Record<string, string> = {
    '-o': '--output',
    '-f': '--file',
    '-h': '--help',
};

function flagToCamelCase(flag: string): string {
    return flag
        .replace(/^--/, '')
        .replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
    const positionals: string[] = [];
    const rawFlags: Record<string, string | boolean> = {};

    let i = 0;
    while (i < argv.length) {
        const token = argv[i];
        if (!token.startsWith('-')) {
            positionals.push(token);
            i += 1;
            continue;
        }

        let flagName = token;
        let inlineVal: string | undefined;
        const eqIdx = token.indexOf('=');
        if (eqIdx !== -1) {
            flagName = token.slice(0, eqIdx);
            inlineVal = token.slice(eqIdx + 1);
        }

        if (SHORT_FLAG_ALIASES[flagName]) {
            flagName = SHORT_FLAG_ALIASES[flagName];
        }

        const camelKey = flagToCamelCase(flagName);

        if (BOOLEAN_FLAGS.has(flagName)) {
            if (inlineVal !== undefined) {
                rawFlags[camelKey] = inlineVal !== 'false' && inlineVal !== '0';
            } else {
                rawFlags[camelKey] = true;
            }
            i += 1;
            continue;
        }

        if (inlineVal !== undefined) {
            rawFlags[camelKey] = inlineVal;
            i += 1;
            continue;
        }

        const nextToken = argv[i + 1];
        if (nextToken !== undefined && !nextToken.startsWith('-')) {
            rawFlags[camelKey] = nextToken;
            i += 2;
        } else {
            rawFlags[camelKey] = true;
            i += 1;
        }
    }

    const toNum = (v: string | boolean | undefined): number | undefined => {
        if (typeof v !== 'string') return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    };

    const toStr = (v: string | boolean | undefined): string | undefined =>
        typeof v === 'string' ? v : undefined;

    return {
        command: positionals[0] || 'help',
        positionals: positionals.slice(1),
        flags: {
            output: toStr(rawFlags.output),
            file: toStr(rawFlags.file),
            experimentId: toStr(rawFlags.experimentId),
            experimentLabel: toStr(rawFlags.experimentLabel),
            baseline: toStr(rawFlags.baseline),
            targetState: toStr(rawFlags.targetState),
            publish: Boolean(rawFlags.publish),
            dcoSignoff: toStr(rawFlags.dcoSignoff),
            yesUserApproved: Boolean(rawFlags.yesUserApproved),
            reviewers: toStr(rawFlags.reviewers),
            model: toStr(rawFlags.model),
            hardware: toStr(rawFlags.hardware),
            chips: toNum(rawFlags.chips),
            tool: toStr(rawFlags.tool),
            toolVersion: toStr(rawFlags.toolVersion),
            harness: toStr(rawFlags.harness),
            harnessVersion: toStr(rawFlags.harnessVersion),
            wellLitPath: toStr(rawFlags.wellLitPath),
            dropFailedStages: Boolean(rawFlags.dropFailedStages),
            inPlace: Boolean(rawFlags.inPlace),
            strict: Boolean(rawFlags.strict),
            dryRun: Boolean(rawFlags.dryRun),
            concurrency: toNum(rawFlags.concurrency),
            apiUrl: toStr(rawFlags.apiUrl),
            uiUrl: toStr(rawFlags.uiUrl),
            status: toStr(rawFlags.status),
            own: Boolean(rawFlags.own),
            limit: toNum(rawFlags.limit),
            exportDir: toStr(rawFlags.exportDir),
            stage: toNum(rawFlags.stage),
            sloTtftMs: toNum(rawFlags.sloTtftMs),
            sloTpotMs: toNum(rawFlags.sloTpotMs),
            markdown: Boolean(rawFlags.markdown),
            feedback: toStr(rawFlags.feedback),
            label: toStr(rawFlags.label),
            tags: toStr(rawFlags.tags),
            json: Boolean(rawFlags.json),
            help: Boolean(rawFlags.help),
        },
    };
}

function normalizePiiReport(raw?: Record<string, unknown> | null): PiiReportNormalized {
    const now = new Date().toISOString();
    if (!raw || typeof raw !== 'object') {
        return {
            scrubbed: true,
            scrubbed_at: now,
            scrubbedAt: now,
            total_redactions: 0,
            totalRedactions: 0,
            categories: {},
            findings: [],
        };
    }
    const scrubbedAt = String(raw.scrubbed_at || raw.scrubbedAt || now);
    const total = Number(raw.total_redactions ?? raw.totalRedactions ?? 0) || 0;
    const categories = (raw.categories && typeof raw.categories === 'object')
        ? (raw.categories as Record<string, number>)
        : {};
    const findings = Array.isArray(raw.findings)
        ? (raw.findings as Array<{ category: string; path?: string; count: number; matchPreview?: string }>)
        : [];
    return {
        scrubbed: true,
        scrubbed_at: scrubbedAt,
        scrubbedAt,
        total_redactions: total,
        totalRedactions: total,
        categories,
        findings,
        ...(typeof raw.filesScanned === 'number' ? { filesScanned: raw.filesScanned } : {}),
    };
}

function mergePiiReports(reports: Array<Record<string, unknown> | null | undefined>): PiiReportNormalized {
    const now = new Date().toISOString();
    let totalRedactions = 0;
    const categories: Record<string, number> = {};
    const findings: Array<{ category: string; path?: string; count: number; matchPreview?: string }> = [];

    for (const r of reports) {
        const norm = normalizePiiReport(r);
        totalRedactions += norm.total_redactions;
        for (const [cat, cnt] of Object.entries(norm.categories)) {
            categories[cat] = (categories[cat] || 0) + cnt;
        }
        findings.push(...norm.findings);
    }

    return {
        scrubbed: true,
        scrubbed_at: now,
        scrubbedAt: now,
        total_redactions: totalRedactions,
        totalRedactions,
        categories,
        findings,
    };
}

function makeIssueReport(params: {
    command: string;
    errorCode: string;
    message: string;
    exitCode: number;
    details?: unknown;
}): IssueReport {
    try {
        if (typeof buildGithubIssueReport === 'function') {
            const built = buildGithubIssueReport(params) as Record<string, unknown>;
            if (built && typeof built === 'object') {
                const url = String(built.newIssueUrl || built.issueReportUrl || GITHUB_ISSUES_NEW_URL);
                return {
                    message: String(
                        built.message ||
                            'Encountered an error with Prism Results Store tooling? Recommend posting a GitHub issue with the scrubbed diagnostic block below.'
                    ),
                    newIssueUrl: url,
                    issueReportUrl: url,
                    scrubbedDiagnostics: (built.scrubbedDiagnostics as Record<string, unknown>) || {
                        command: `prism ${params.command}`,
                        exitCode: params.exitCode,
                        errorCode: params.errorCode,
                    },
                };
            }
        }
    } catch {
        // Fallback below
    }

    const scrubbedMsg = scrubTextPii(String(params.message || '')).text;
    const scrubbedDetails = params.details
        ? scrubTextPii(typeof params.details === 'string' ? params.details : JSON.stringify(params.details)).text
        : undefined;

    const diagnostics: Record<string, unknown> = {
        command: `prism ${params.command}`,
        exitCode: params.exitCode,
        errorCode: params.errorCode,
        message: scrubbedMsg,
        ...(scrubbedDetails ? { details: scrubbedDetails } : {}),
        nodeVersion: process.version,
        toolVersion: PRISM_CLI_VERSION,
    };

    const title = `[Prism CLI] ${params.errorCode} in prism ${params.command}`;
    const body = [
        '### Prism CLI Diagnostic Report (PII Scrubbed)',
        '',
        '```json',
        JSON.stringify(diagnostics, null, 2),
        '```',
    ].join('\n');

    const newIssueUrl = `${GITHUB_ISSUES_NEW_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    return {
        message: 'Encountered an error with Prism Results Store tooling? Recommend posting a GitHub issue with the scrubbed diagnostic block below.',
        newIssueUrl,
        issueReportUrl: newIssueUrl,
        scrubbedDiagnostics: diagnostics,
    };
}

function resolveGithubToken(env: NodeJS.ProcessEnv, execTokenFn?: () => string | null): string | null {
    if (env.PRISM_GITHUB_TOKEN && env.PRISM_GITHUB_TOKEN.trim()) {
        return env.PRISM_GITHUB_TOKEN.trim();
    }
    if (env.GITHUB_TOKEN && env.GITHUB_TOKEN.trim()) {
        return env.GITHUB_TOKEN.trim();
    }
    if (typeof execTokenFn === 'function') {
        try {
            const tok = execTokenFn();
            if (tok && tok.trim()) return tok.trim();
        } catch {
            return null;
        }
        return null;
    }
    try {
        const out = execSync('gh auth token', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 3000,
        });
        if (out && out.trim()) {
            return out.trim();
        }
    } catch {
        // Ignore gh CLI absence or unauthenticated status
    }
    return null;
}

function safeEncodeShareLink(runIds: string[]): string {
    if (!Array.isArray(runIds) || runIds.length === 0) return '';
    try {
        if (runIds.every((id) => isValidUuid(id))) {
            const encoded = encodeShareLink(runIds);
            if (encoded) return encoded;
        }
    } catch {
        // Fallback for non-UUID test IDs
    }
    return Buffer.from(runIds.join(','), 'utf8').toString('base64url');
}

function buildShareUrl(uiUrl: string, runIds: string[], experimentId?: string | null): string {
    const base = (uiUrl || DEFAULT_UI_URL).replace(/\/+$/, '');
    const encoded = safeEncodeShareLink(runIds);
    return `${base}/?view=results-store&benchmarks=${encodeURIComponent(encoded)}${experimentId ? `&experimentId=${encodeURIComponent(experimentId)}` : ''}`;
}

export function createForkedBundle(
    sourcePayload: Record<string, unknown>,
    options: { label?: string; tags?: string[] } = {}
): { payload: Record<string, unknown>; bundle: Record<string, unknown>; newRunId: string } {
    const { payload, newRunId } = forkBenchmarkPayload(sourcePayload, [], {});
    const forkedPayload = payload as Record<string, unknown>;

    if (options.label && options.label.trim()) {
        forkedPayload.runLabel = options.label.trim();
        if (Array.isArray(forkedPayload.entries)) {
            forkedPayload.entries = (forkedPayload.entries as Array<Record<string, unknown>>).map((entry) => ({
                ...entry,
                run_description: options.label!.trim(),
            }));
        }
    }

    if (Array.isArray(options.tags) && options.tags.length > 0) {
        const existingTags = Array.isArray(forkedPayload.tags) ? (forkedPayload.tags as string[]) : [];
        forkedPayload.tags = Array.from(new Set([...existingTags, ...options.tags]));
    }

    const bundle = buildForkedBundle(forkedPayload, sourcePayload) as Record<string, unknown>;
    return {
        payload: forkedPayload,
        bundle,
        newRunId,
    };
}

function collectScrubbableFiles(targetPath: string): string[] {
    const resolved = path.resolve(targetPath);
    if (!fs.existsSync(resolved)) {
        return [];
    }
    const stat = fs.statSync(resolved);
    if (stat.isFile()) {
        return [resolved];
    }

    const files: string[] = [];
    const walk = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (/\.(yaml|yml|json|log|txt)$/i.test(entry.name)) {
                files.push(fullPath);
            }
        }
    };
    walk(resolved);
    return files;
}

function buildAssembleOptions(flags: ParsedCliArgs['flags']) {
    const parsedReviewers = flags.reviewers
        ? flags.reviewers.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
    const resolvedTargetState = flags.publish ? 'public' : flags.targetState;

    return {
        dropFailedStages: Boolean(flags.dropFailedStages),
        model: flags.model,
        model_name: flags.model,
        hardware: flags.hardware,
        hardware_name: flags.hardware,
        chips: flags.chips,
        accelerator_count: flags.chips,
        tool: flags.tool,
        inference_tool: flags.tool,
        toolVersion: flags.toolVersion,
        inference_tool_version: flags.toolVersion,
        harness: flags.harness,
        benchmark_harness: flags.harness,
        harnessVersion: flags.harnessVersion,
        benchmark_harness_version: flags.harnessVersion,
        wellLitPath: flags.wellLitPath,
        well_lit_path: flags.wellLitPath,
        experimentId: flags.experimentId,
        experimentLabel: flags.experimentLabel,
        baseline: flags.baseline,
        targetState: resolvedTargetState,
        dcoSignoff: flags.dcoSignoff,
        reviewers: parsedReviewers,
        overrides: {
            ...(flags.model ? { model_name: flags.model } : {}),
            ...(flags.hardware ? { hardware_name: flags.hardware } : {}),
            ...(flags.chips !== undefined ? { accelerator_count: flags.chips } : {}),
            ...(flags.tool ? { inference_tool: flags.tool } : {}),
            ...(flags.toolVersion ? { inference_tool_version: flags.toolVersion } : {}),
            ...(flags.harness ? { benchmark_harness: flags.harness } : {}),
            ...(flags.harnessVersion ? { benchmark_harness_version: flags.harnessVersion } : {}),
            ...(flags.wellLitPath ? { well_lit_path: flags.wellLitPath } : {}),
            ...(parsedReviewers ? { requested_reviewers: parsedReviewers } : {}),
            ...(flags.dcoSignoff ? { dco_signoff: flags.dcoSignoff } : {}),
        },
    };
}

interface NormalizedArm {
    armKey: string;
    path: string;
    runLabel: string;
    isBaseline: boolean;
    isValid: boolean;
    errors: string[];
    warnings: string[];
    fieldErrors: Record<string, unknown>;
    remediation: Record<string, unknown> | null;
    bundle: Record<string, unknown>;
    piiReport: PiiReportNormalized;
    droppedStages: number[];
}

function normalizeAssembledOutput(
    assembledRaw: unknown,
    flags: ParsedCliArgs['flags']
): {
    experimentId: string | null;
    experimentLabel: string | null;
    experimentConfig: Record<string, unknown>;
    arms: NormalizedArm[];
    piiReport: PiiReportNormalized;
} {
    const obj = (assembledRaw && typeof assembledRaw === 'object' && !Array.isArray(assembledRaw))
        ? (assembledRaw as Record<string, unknown>)
        : {};
    const rawArms = Array.isArray(assembledRaw)
        ? assembledRaw
        : (Array.isArray(obj.arms) ? obj.arms : []);

    const experimentObj = (obj.experiment && typeof obj.experiment === 'object')
        ? (obj.experiment as Record<string, unknown>)
        : {};

    const experimentId = String(
        flags.experimentId ||
        obj.experimentId ||
        obj.experiment_id ||
        experimentObj.id ||
        experimentObj.experiment_id ||
        ''
    ) || null;

    const experimentLabel = String(
        flags.experimentLabel ||
        obj.experimentLabel ||
        obj.experiment_label ||
        experimentObj.label ||
        experimentObj.experiment_label ||
        ''
    ) || null;

    const armPiiReports: Array<Record<string, unknown>> = [];
    if (obj.piiReport && typeof obj.piiReport === 'object') {
        armPiiReports.push(obj.piiReport as Record<string, unknown>);
    }

    const arms: NormalizedArm[] = rawArms.map((rawArm: Record<string, unknown>, idx: number) => {
        const rawBundle = ((rawArm.bundle || rawArm.payload || rawArm) as Record<string, unknown>);
        const scrubbedRes = rawArm.piiReport
            ? {
                bundle: rawBundle,
                piiReport: normalizePiiReport(rawArm.piiReport as Record<string, unknown>),
            }
            : scrubBundlePii(rawBundle);

        if (!obj.piiReport) {
            armPiiReports.push(scrubbedRes.piiReport as unknown as Record<string, unknown>);
        }

        const bundle = scrubbedRes.bundle as Record<string, unknown>;
        if (experimentId && !bundle.experiment_id) {
            bundle.experiment_id = experimentId;
        }
        if (experimentLabel && !bundle.experiment_label) {
            bundle.experiment_label = experimentLabel;
        }

        const validation = (rawArm.validation && typeof rawArm.validation === 'object')
            ? (rawArm.validation as Record<string, unknown>)
            : (validatePrismUploadStructure(bundle, { isUpload: true }) as Record<string, unknown>);

        const errors = Array.isArray(rawArm.errors)
            ? (rawArm.errors as string[])
            : (Array.isArray(validation.errors) ? (validation.errors as string[]) : []);
        const warnings = Array.isArray(rawArm.warnings)
            ? (rawArm.warnings as string[])
            : (Array.isArray(validation.warnings) ? (validation.warnings as string[]) : []);
        const fieldErrors = (rawArm.fieldErrors && typeof rawArm.fieldErrors === 'object')
            ? (rawArm.fieldErrors as Record<string, unknown>)
            : ((validation.fieldErrors as Record<string, unknown>) || {});
        const isValid = rawArm.isValid !== undefined
            ? Boolean(rawArm.isValid)
            : Boolean(validation.isValid && errors.length === 0);

        const armKey = String(rawArm.armKey || rawArm.key || bundle.runLabel || `arm-${idx + 1}`);
        const armPath = String(rawArm.path || rawArm.dirPath || '.');
        const runLabel = String(bundle.runLabel || rawArm.runLabel || rawArm.run_label || armKey);

        const isBaseline = Boolean(
            rawArm.is_baseline ||
            rawArm.isBaseline ||
            (flags.baseline && (
                armKey === flags.baseline ||
                armPath === flags.baseline ||
                path.basename(armPath) === flags.baseline
            ))
        );

        let remediation: Record<string, unknown> | null = null;
        if (!isValid) {
            if (rawArm.remediation && typeof rawArm.remediation === 'object') {
                remediation = rawArm.remediation as Record<string, unknown>;
            } else if (typeof buildRemediationRecipe === 'function') {
                remediation = buildRemediationRecipe(
                    { isValid, errors, warnings, fieldErrors },
                    { armKey, path: armPath, bundle }
                ) as Record<string, unknown>;
            }
        }

        return {
            armKey,
            path: armPath,
            runLabel,
            isBaseline,
            isValid,
            errors,
            warnings,
            fieldErrors,
            remediation,
            bundle,
            piiReport: scrubbedRes.piiReport,
            droppedStages: Array.isArray(rawArm.droppedStages) ? (rawArm.droppedStages as number[]) : [],
        };
    });

    const piiReport = armPiiReports.length > 0
        ? mergePiiReports(armPiiReports)
        : normalizePiiReport(null);

    return {
        experimentId,
        experimentLabel,
        experimentConfig: experimentObj,
        arms,
        piiReport,
    };
}

interface StageMetricPoint {
    throughput: number | null;
    ttftMs: number | null;
    tpotMs: number | null;
    latencyMs: number | null;
}

function extractRunComparisonMetrics(
    runPayload: Record<string, unknown>,
    options: { sloTtftMs?: number; sloTpotMs?: number } = {}
) {
    const entries = Array.isArray(runPayload.entries)
        ? (runPayload.entries as Array<Record<string, unknown>>)
        : [];

    const stagePoints: StageMetricPoint[] = [];

    for (const entry of entries) {
        let throughput: number | null = null;
        let ttftMs: number | null = null;
        let tpotMs: number | null = null;
        let latencyMs: number | null = null;

        const rawReport = entry.raw_report || entry.rawReport;
        if (rawReport) {
            const parsedStage = parseReportV02(rawReport, String(entry.filename || 'stage.yaml'));
            if (parsedStage) {
                parsedStage.model_name = runPayload.model_name || null;
                parsedStage.hardware = runPayload.hardware || null;
                const norm = stageToEntry(parsedStage) as Record<string, unknown>;
                if (typeof norm.throughput === 'number') throughput = norm.throughput;
                const normTtft = norm.ttft as Record<string, unknown> | number | undefined;
                if (typeof normTtft === 'number') ttftMs = normTtft;
                else if (normTtft && typeof normTtft.mean === 'number') ttftMs = normTtft.mean;
                if (typeof norm.tpot === 'number') tpotMs = norm.tpot;
                const normLat = norm.latency as Record<string, unknown> | number | undefined;
                if (typeof normLat === 'number') latencyMs = normLat;
                else if (normLat && typeof normLat.mean === 'number') latencyMs = normLat.mean;
            }
        }

        // Fallback to direct properties on entry or raw_report for lightweight test fixtures
        if (throughput === null && typeof entry.throughput === 'number') {
            throughput = entry.throughput;
        }
        if (ttftMs === null) {
            if (typeof entry.ttft_ms === 'number') ttftMs = entry.ttft_ms;
            else if (typeof entry.ttft === 'number') ttftMs = entry.ttft;
            else if (entry.ttft && typeof (entry.ttft as Record<string, unknown>).mean === 'number') {
                ttftMs = (entry.ttft as Record<string, number>).mean;
            }
        }
        if (tpotMs === null) {
            if (typeof entry.tpot_ms === 'number') tpotMs = entry.tpot_ms;
            else if (typeof entry.tpot === 'number') tpotMs = entry.tpot;
            else if (entry.tpot && typeof (entry.tpot as Record<string, unknown>).mean === 'number') {
                tpotMs = (entry.tpot as Record<string, number>).mean;
            }
        }
        if (latencyMs === null) {
            if (typeof entry.latency_ms === 'number') latencyMs = entry.latency_ms;
            else if (typeof entry.latency === 'number') latencyMs = entry.latency;
            else if (entry.latency && typeof (entry.latency as Record<string, unknown>).mean === 'number') {
                latencyMs = (entry.latency as Record<string, number>).mean;
            }
        }

        stagePoints.push({ throughput, ttftMs, tpotMs, latencyMs });
    }

    const validThroughputs = stagePoints.map((p) => p.throughput).filter((v): v is number => typeof v === 'number');
    const validTtfts = stagePoints.map((p) => p.ttftMs).filter((v): v is number => typeof v === 'number');
    const validTpots = stagePoints.map((p) => p.tpotMs).filter((v): v is number => typeof v === 'number');
    const validLatencies = stagePoints.map((p) => p.latencyMs).filter((v): v is number => typeof v === 'number');

    const maxThroughput = validThroughputs.length > 0 ? Math.max(...validThroughputs) : 0;
    const minTtftMs = validTtfts.length > 0 ? Math.min(...validTtfts) : null;
    const meanTtftMs = validTtfts.length > 0
        ? validTtfts.reduce((a, b) => a + b, 0) / validTtfts.length
        : null;
    const minTpotMs = validTpots.length > 0 ? Math.min(...validTpots) : null;
    const meanTpotMs = validTpots.length > 0
        ? validTpots.reduce((a, b) => a + b, 0) / validTpots.length
        : null;
    const minLatencyMs = validLatencies.length > 0 ? Math.min(...validLatencies) : null;
    const meanLatencyMs = validLatencies.length > 0
        ? validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length
        : null;

    const hasSlo = options.sloTtftMs !== undefined || options.sloTpotMs !== undefined;
    let sloPass: boolean | null = null;
    let passingStages = stagePoints.length;
    let maxSloThroughput: number | null = null;

    if (hasSlo) {
        const passing = stagePoints.filter((pt) => {
            if (options.sloTtftMs !== undefined && pt.ttftMs !== null && pt.ttftMs > options.sloTtftMs) {
                return false;
            }
            if (options.sloTpotMs !== undefined && pt.tpotMs !== null && pt.tpotMs > options.sloTpotMs) {
                return false;
            }
            return true;
        });
        passingStages = passing.length;
        sloPass = passing.length > 0;
        const passingTputs = passing.map((p) => p.throughput).filter((v): v is number => typeof v === 'number');
        maxSloThroughput = passingTputs.length > 0 ? Math.max(...passingTputs) : 0;
    }

    const hwObj = runPayload.hardware as Record<string, unknown> | undefined;
    const hardwareLabel = hwObj?.hardware_name
        ? `${hwObj.hardware_name}${hwObj.accelerator_count ? ` x${hwObj.accelerator_count}` : ''}`
        : String(runPayload.hardware || 'Unknown');

    return {
        runId: String(runPayload.runId || runPayload.run_id || ''),
        runLabel: String(runPayload.runLabel || runPayload.run_label || runPayload.runId || 'Run'),
        model_name: String(runPayload.model_name || runPayload.model || ''),
        hardware: hardwareLabel,
        stageCount: stagePoints.length,
        maxThroughput,
        minTtftMs,
        meanTtftMs,
        minTpotMs,
        meanTpotMs,
        minLatencyMs,
        meanLatencyMs,
        sloPass,
        passingStages,
        maxSloThroughput,
    };
}

function formatPctDelta(current: number | null, baseline: number | null): { pct: number | null; formatted: string } {
    if (current === null || baseline === null || baseline === 0) {
        return { pct: null, formatted: 'N/A' };
    }
    const pct = ((current - baseline) / baseline) * 100;
    const sign = pct > 0 ? '+' : '';
    return { pct: Number(pct.toFixed(2)), formatted: `${sign}${pct.toFixed(1)}%` };
}

export async function runPrismCli(argv: string[], io: PrismCliIo = {}): Promise<PrismCliResult> {
    const stdout = io.stdout || ((msg: string) => console.log(msg));
    const stderr = io.stderr || io.stdout || ((msg: string) => console.error(msg));
    const fetchFn = io.fetchImpl || globalThis.fetch;
    const env = io.env || process.env;

    const { command, positionals, flags } = parseCliArgs(argv);
    const apiUrl = (flags.apiUrl || env.PRISM_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
    const uiUrl = (flags.uiUrl || env.PRISM_UI_URL || DEFAULT_UI_URL).replace(/\/+$/, '');

    const emitResult = (exitCode: number, payload: Record<string, unknown>): PrismCliResult => {
        if (exitCode !== 0 && !payload.issueReport) {
            payload.issueReport = makeIssueReport({
                command,
                errorCode: String(payload.error || 'CLI_ERROR'),
                message: String(payload.message || payload.summary || 'Command failed'),
                exitCode,
                details: payload.errors || payload.details,
            });
        }

        if (flags.json) {
            stdout(JSON.stringify(payload, null, 2));
        } else {
            if (typeof payload.markdown === 'string' && payload.markdown) {
                stdout(payload.markdown);
            } else if (typeof payload.message === 'string' && payload.message) {
                if (exitCode === 0) stdout(payload.message);
                else stderr(payload.message);
            } else if (typeof payload.summary === 'string' && payload.summary) {
                if (exitCode === 0) stdout(payload.summary);
                else stderr(payload.summary);
            }

            if (payload.preflightSummary && typeof payload.preflightSummary === 'object') {
                const ps = payload.preflightSummary as Record<string, unknown>;
                const pii = (payload.piiReport || {}) as Record<string, unknown>;
                const logFn = exitCode === 0 ? stdout : stderr;
                logFn(`Experiment: ${ps.experimentLabel || 'N/A'} (${ps.experimentId || 'N/A'})`);
                logFn(`Target State: ${ps.targetState || 'submitted_pending_review'}`);
                logFn(`Arms Ready: ${ps.totalArms ?? 0} arm(s), ${ps.totalStages ?? 0} stage(s)`);
                logFn(`PII Redactions: ${pii.total_redactions ?? pii.totalRedactions ?? 0} item(s) scrubbed`);
                if (ps.dcoSignoff) {
                    logFn(`DCO Sign-Off: ${ps.dcoSignoff}`);
                }
            }

            if (exitCode === 2 && Array.isArray(payload.arms)) {
                const invalidArms = (payload.arms as Array<Record<string, unknown>>).filter(
                    (a) => a && a.isValid === false
                );
                for (const arm of invalidArms) {
                    stderr(`Arm '${arm.armKey}' (${arm.path || '.'}) failed validation:`);
                    if (Array.isArray(arm.errors)) {
                        for (const errLine of arm.errors as string[]) {
                            stderr(`  - ${errLine}`);
                        }
                    }
                    const rem = arm.remediation as Record<string, unknown> | null | undefined;
                    if (rem && typeof rem === 'object') {
                        if (typeof rem.hint === 'string' && rem.hint) {
                            stderr(`  Hint: ${rem.hint}`);
                        }
                        if (typeof rem.cliFlags === 'string' && rem.cliFlags) {
                            stderr(`  Suggested CLI Flags: ${rem.cliFlags}`);
                        }
                    }
                }
            }

            if (typeof payload.shareUrl === 'string' && payload.shareUrl) {
                stdout(`Share URL: ${payload.shareUrl}`);
            }
            if (exitCode !== 0 && payload.issueReport) {
                const ir = payload.issueReport as IssueReport;
                stderr(`Recommend filing a GitHub issue: ${ir.newIssueUrl}`);
            }
        }

        return { exitCode, payload };
    };

    try {
        if (command === 'help' || flags.help) {
            return emitResult(0, {
                ok: true,
                exitCode: 0,
                command: 'help',
                version: PRISM_CLI_VERSION,
                commands: ['init', 'scrub', 'validate', 'submit', 'list', 'get', 'compare', 'promote', 'review', 'fork'],
                message: 'Usage: prism <init|scrub|validate|submit|list|get|compare|promote|review|fork> [options]',
            });
        }

        // -------------------------------------------------------------------
        // 1. prism init <dir>
        // -------------------------------------------------------------------
        if (command === 'init') {
            const targetDir = positionals[0] || '.';
            const resolvedDir = path.resolve(targetDir);
            if (!fs.existsSync(resolvedDir)) {
                return emitResult(2, {
                    ok: false,
                    exitCode: 2,
                    command: 'init',
                    error: 'DIRECTORY_NOT_FOUND',
                    message: `Target directory does not exist: ${targetDir}`,
                });
            }

            const initOptions = {
                experimentId: flags.experimentId,
                experiment_id: flags.experimentId,
                experimentLabel: flags.experimentLabel,
                experiment_label: flags.experimentLabel,
                baseline: flags.baseline,
                targetState: flags.publish ? 'public' : flags.targetState,
                target_state: flags.publish ? 'public' : flags.targetState,
                dcoSignoff: flags.dcoSignoff,
                dco_signoff: flags.dcoSignoff,
                outputPath: flags.output,
                model: flags.model,
                hardware: flags.hardware,
                chips: flags.chips,
                tool: flags.tool,
                toolVersion: flags.toolVersion,
            };

            const initRes = (await generateExperimentYamlConfig(resolvedDir, initOptions)) as Record<string, unknown>;
            const configObject = (initRes.configObject || initRes.config || {}) as Record<string, unknown>;
            const yamlString = typeof initRes.yamlString === 'string'
                ? initRes.yamlString
                : (typeof initRes.yaml === 'string' ? initRes.yaml : yaml.dump(configObject));
            const outputPath = flags.output
                ? path.resolve(flags.output)
                : path.join(resolvedDir, 'experiment.yaml');

            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            fs.writeFileSync(outputPath, yamlString, 'utf8');

            const piiReport = normalizePiiReport(initRes.piiReport as Record<string, unknown>);
            const discoveredArms = Array.isArray(initRes.discoveredArms)
                ? initRes.discoveredArms
                : (Array.isArray(initRes.arms) ? initRes.arms : []);
            const expBlock = (configObject.experiment || {}) as Record<string, unknown>;

            return emitResult(0, {
                ok: true,
                exitCode: 0,
                command: 'init',
                outputPath,
                experimentId: expBlock.id || flags.experimentId || null,
                experimentLabel: expBlock.label || flags.experimentLabel || null,
                configObject,
                yamlString,
                discoveredArms,
                piiReport,
                message: `Initialized experiment manifest at ${outputPath} (${discoveredArms.length} arm(s) discovered).`,
            });
        }

        // -------------------------------------------------------------------
        // 2. prism scrub <dirOrFile>
        // -------------------------------------------------------------------
        if (command === 'scrub') {
            const target = flags.file || positionals[0] || '.';
            const resolvedTarget = path.resolve(target);
            if (!fs.existsSync(resolvedTarget)) {
                return emitResult(2, {
                    ok: false,
                    exitCode: 2,
                    command: 'scrub',
                    error: 'TARGET_NOT_FOUND',
                    message: `Target path does not exist: ${target}`,
                });
            }

            const files = collectScrubbableFiles(resolvedTarget);
            const fileReports: Array<Record<string, unknown>> = [];

            for (const filePath of files) {
                const rawText = fs.readFileSync(filePath, 'utf8');
                const ext = path.extname(filePath).toLowerCase();

                if (ext === '.json' || ext === '.yaml' || ext === '.yml') {
                    try {
                        const parsed = ext === '.json' ? JSON.parse(rawText) : yaml.load(rawText);
                        if (parsed && typeof parsed === 'object') {
                            const { data: scrubbedObj, piiReport: objReport } = scrubObjectPii(parsed);
                            fileReports.push(objReport as unknown as Record<string, unknown>);
                            if (flags.inPlace && objReport.total_redactions > 0) {
                                const serialized = ext === '.json'
                                    ? `${JSON.stringify(scrubbedObj, null, 2)}\n`
                                    : yaml.dump(scrubbedObj, { lineWidth: 120, noRefs: true });
                                fs.writeFileSync(filePath, serialized, 'utf8');
                            }
                            continue;
                        }
                    } catch {
                        // Fall through to plain text scrubbing if YAML/JSON parse fails
                    }
                }

                const textRes = scrubTextPii(rawText);
                const count = textRes.findings.reduce((acc, f) => acc + f.count, 0);
                const categories: Record<string, number> = {};
                for (const f of textRes.findings) {
                    categories[f.category] = (categories[f.category] || 0) + f.count;
                }
                fileReports.push({
                    scrubbed: true,
                    scrubbed_at: new Date().toISOString(),
                    total_redactions: count,
                    categories,
                    findings: textRes.findings.map((f) => ({
                        category: f.category,
                        path: path.relative(resolvedTarget, filePath) || path.basename(filePath),
                        count: f.count,
                        matchPreview: f.matchPreview,
                    })),
                });

                if (flags.inPlace && count > 0) {
                    fs.writeFileSync(filePath, textRes.text, 'utf8');
                }
            }

            const piiReport = mergePiiReports(fileReports);
            piiReport.filesScanned = files.length;

            if (flags.strict && piiReport.total_redactions > 0) {
                return emitResult(2, {
                    ok: false,
                    exitCode: 2,
                    command: 'scrub',
                    error: 'PII_DETECTED_STRICT',
                    message: `Strict PII check failed: ${piiReport.total_redactions} redaction(s) required across ${files.length} file(s).`,
                    piiReport,
                });
            }

            return emitResult(0, {
                ok: true,
                exitCode: 0,
                command: 'scrub',
                inPlace: Boolean(flags.inPlace),
                piiReport,
                message: `Scrubbed ${files.length} file(s): ${piiReport.total_redactions} sensitive item(s) redacted.`,
            });
        }

        // -------------------------------------------------------------------
        // 3. prism validate [dir]
        // -------------------------------------------------------------------
        if (command === 'validate') {
            const target = flags.file || positionals[0] || '.';
            const assembleOpts = buildAssembleOptions(flags);
            const rawAssembled = await discoverAndAssembleArms(target, assembleOpts);
            const { experimentId, experimentLabel, arms, piiReport } = normalizeAssembledOutput(rawAssembled, flags);

            if (arms.length === 0) {
                return emitResult(2, {
                    ok: false,
                    exitCode: 2,
                    command: 'validate',
                    error: 'PREFLIGHT_VALIDATION_FAILED',
                    summary: `No valid benchmark stage reports discovered in ${target}.`,
                    arms: [],
                    piiReport,
                });
            }

            const invalidArms = arms.filter((a) => !a.isValid);
            const armSummaries = arms.map((a) => ({
                armKey: a.armKey,
                path: a.path,
                runLabel: a.runLabel,
                isBaseline: a.isBaseline,
                isValid: a.isValid,
                stageCount: Array.isArray(a.bundle.entries) ? a.bundle.entries.length : 0,
                droppedStages: a.droppedStages,
                model_name: a.bundle.model_name,
                hardware: a.bundle.hardware,
                inference_tool: a.bundle.inference_tool,
                errors: a.errors,
                warnings: a.warnings,
                fieldErrors: a.fieldErrors,
                remediation: a.remediation,
            }));

            if (invalidArms.length > 0) {
                const primaryRemediation = invalidArms[0].remediation;
                return emitResult(2, {
                    ok: false,
                    exitCode: 2,
                    command: 'validate',
                    error: 'PREFLIGHT_VALIDATION_FAILED',
                    summary: `${invalidArms.length} of ${arms.length} arm(s) failed preflight validation. No runs were uploaded.`,
                    experimentId,
                    experimentLabel,
                    arms: armSummaries,
                    remediation: primaryRemediation,
                    piiReport,
                });
            }

            return emitResult(0, {
                ok: true,
                exitCode: 0,
                command: 'validate',
                summary: `All ${arms.length} arm(s) passed preflight validation.`,
                experimentId,
                experimentLabel,
                arms: armSummaries,
                piiReport,
            });
        }

        // -------------------------------------------------------------------
        // 4. prism submit [dir]
        // -------------------------------------------------------------------
        if (command === 'submit') {
            const target = flags.file || positionals[0] || '.';
            const assembleOpts = buildAssembleOptions(flags);
            const rawAssembled = await discoverAndAssembleArms(target, assembleOpts);
            const { experimentId, experimentLabel, experimentConfig, arms, piiReport } = normalizeAssembledOutput(rawAssembled, flags);

            if (arms.length === 0) {
                return emitResult(2, {
                    ok: false,
                    exitCode: 2,
                    command: 'submit',
                    error: 'PREFLIGHT_VALIDATION_FAILED',
                    summary: `No valid benchmark arms discovered in ${target}. Zero network requests made.`,
                    arms: [],
                    piiReport,
                });
            }

            const invalidArms = arms.filter((a) => !a.isValid);
            if (invalidArms.length > 0) {
                return emitResult(2, {
                    ok: false,
                    exitCode: 2,
                    command: 'submit',
                    error: 'PREFLIGHT_VALIDATION_FAILED',
                    summary: `${invalidArms.length} of ${arms.length} arm(s) failed preflight validation. Zero network requests made.`,
                    arms: arms.map((a) => ({
                        armKey: a.armKey,
                        path: a.path,
                        isValid: a.isValid,
                        errors: a.errors,
                        warnings: a.warnings,
                        fieldErrors: a.fieldErrors,
                        remediation: a.remediation,
                    })),
                    remediation: invalidArms[0].remediation,
                    piiReport,
                });
            }

            const targetState = flags.publish
                ? 'public'
                : String(flags.targetState || experimentConfig.target_state || 'submitted_pending_review');

            // Resolve DCO Sign-off from CLI flag, experiment manifest, or bundle
            const rawDco = flags.dcoSignoff ||
                (typeof experimentConfig.dco_signoff === 'string' ? experimentConfig.dco_signoff : undefined) ||
                ((experimentConfig.dco_signoff as Record<string, unknown> | undefined)?.signed_off_by as string | undefined) ||
                ((arms[0].bundle.dco_signoff as Record<string, unknown> | undefined)?.signed_off_by as string | undefined) ||
                (typeof arms[0].bundle.dco_signoff === 'string' ? (arms[0].bundle.dco_signoff as string) : undefined);

            const hasValidDco = Boolean(rawDco && DCO_REGEX.test(rawDco.trim()));

            const preflightSummary = {
                experimentId: experimentId || crypto.randomUUID(),
                experimentLabel: experimentLabel || arms[0].runLabel,
                targetState,
                totalArms: arms.length,
                totalStages: arms.reduce(
                    (acc, a) => acc + (Array.isArray(a.bundle.entries) ? a.bundle.entries.length : 0),
                    0
                ),
                baselineArm: arms.find((a) => a.isBaseline)?.armKey || null,
                dcoSignoff: rawDco || null,
                arms: arms.map((a) => ({
                    armKey: a.armKey,
                    runLabel: a.runLabel,
                    isBaseline: a.isBaseline,
                    stages: Array.isArray(a.bundle.entries) ? a.bundle.entries.length : 0,
                    model_name: a.bundle.model_name,
                    hardware: a.bundle.hardware,
                    inference_tool: a.bundle.inference_tool,
                })),
            };

            if (flags.dryRun) {
                return emitResult(0, {
                    ok: true,
                    exitCode: 0,
                    command: 'submit',
                    dryRun: true,
                    preflightSummary,
                    piiReport,
                    message: 'Dry-run validation succeeded. Zero network requests made.',
                });
            }

            // Mandatory Human Contribution Sign-Off Gate & DCO Verification
            if (!hasValidDco || !flags.yesUserApproved) {
                const errorCode = !flags.yesUserApproved ? 'USER_SIGNOFF_REQUIRED' : 'DCO_SIGNOFF_REQUIRED';
                return emitResult(2, {
                    ok: false,
                    exitCode: 2,
                    command: 'submit',
                    error: errorCode,
                    dcoSignoffValid: hasValidDco,
                    userApproved: Boolean(flags.yesUserApproved),
                    message:
                        'Explicit user sign-off and valid DCO 1.1 attribution ("Name <email@domain>") are required before transmitting benchmark data to the Prism Results Store. Present the preflightSummary and piiReport to the user, obtain their approval, and re-run with --dco-signoff "Name <email>" --yes-user-approved.',
                    preflightSummary,
                    piiReport,
                });
            }

            const signedAt = new Date().toISOString();
            const dcoRecord = {
                signed_off_by: rawDco!.trim(),
                signed_at: signedAt,
                source: flags.dcoSignoff ? 'cli-flag' : 'experiment-manifest',
            };

            const effectiveExperimentId = preflightSummary.experimentId;
            const effectiveExperimentLabel = preflightSummary.experimentLabel;

            for (const arm of arms) {
                arm.bundle.dco_signoff = dcoRecord;
                if (arms.length > 1 || experimentId) {
                    arm.bundle.experiment_id = effectiveExperimentId;
                    arm.bundle.experiment_label = effectiveExperimentLabel;
                }
                if (!arm.bundle.agent_provenance) {
                    arm.bundle.agent_provenance = {
                        agent_name: 'prism-cli',
                        tool_version: PRISM_CLI_VERSION,
                    };
                }
            }

            const token = resolveGithubToken(env, io.execTokenFn);
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                ...(token ? { 'X-Prism-Github-Token': token } : {}),
            };

            const succeededRunIds: string[] = [];
            const uploadedRuns: Array<Record<string, unknown>> = [];
            const failedArms: Array<Record<string, unknown>> = [];

            const uploadSingleArm = async (arm: NormalizedArm, baselineRunIdToAttach: string | null) => {
                if (baselineRunIdToAttach && !arm.isBaseline) {
                    arm.bundle.baseline_run_id = baselineRunIdToAttach;
                }

                const submitUrl = `${apiUrl}/api/results?targetState=${encodeURIComponent(targetState)}`;
                let res = await fetchFn(submitUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(arm.bundle),
                });

                let bodyData: Record<string, unknown> = {};
                try {
                    bodyData = (await res.json()) as Record<string, unknown>;
                } catch {
                    bodyData = {};
                }

                const wantsDirectPublish = targetState === 'public' || targetState === 'promoted';

                // Fallback if an older server returns 400 when given targetState=public|promoted
                if (res.status === 400 && wantsDirectPublish) {
                    const fallbackUrl = `${apiUrl}/api/results?targetState=submitted_pending_review`;
                    res = await fetchFn(fallbackUrl, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(arm.bundle),
                    });
                    try {
                        bodyData = (await res.json()) as Record<string, unknown>;
                    } catch {
                        bodyData = {};
                    }
                }

                if (!res.ok) {
                    failedArms.push({
                        armKey: arm.armKey,
                        runLabel: arm.runLabel,
                        status: res.status,
                        error: bodyData.error || `HTTP ${res.status}`,
                        details: bodyData.details,
                    });
                    return null;
                }

                const serverRunId = String(bodyData.runId || arm.bundle.runId || '');
                let finalState = String(bodyData.state || targetState);

                // If direct publish was requested but server returned a non-published state, chain POST /api/results/:runId/review
                if (wantsDirectPublish && finalState !== targetState && serverRunId) {
                    const reviewUrl = `${apiUrl}/api/results/${encodeURIComponent(serverRunId)}/review`;
                    const reviewRes = await fetchFn(reviewUrl, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                            status: targetState,
                            feedback: 'Published via Prism CLI',
                        }),
                    });
                    if (reviewRes.ok) {
                        try {
                            const reviewData = (await reviewRes.json()) as Record<string, unknown>;
                            finalState = String(reviewData.state || targetState);
                        } catch {
                            finalState = targetState;
                        }
                    }
                }

                succeededRunIds.push(serverRunId);
                const runRecord = {
                    armKey: arm.armKey,
                    runLabel: arm.runLabel,
                    runId: serverRunId,
                    state: finalState,
                    isBaseline: arm.isBaseline,
                    baseline_run_id: arm.bundle.baseline_run_id || null,
                };
                uploadedRuns.push(runRecord);
                return serverRunId;
            };

            // Pass 1: Upload baseline arm first if designated
            const baselineArm = arms.find((a) => a.isBaseline) || null;
            const remainingArms = baselineArm ? arms.filter((a) => a !== baselineArm) : [...arms];
            let baselineRunId: string | null = null;

            if (baselineArm) {
                baselineRunId = await uploadSingleArm(baselineArm, null);
            }

            // Pass 2: Upload remaining arms with bounded concurrency
            const concurrency = Math.max(1, flags.concurrency || 4);
            for (let idx = 0; idx < remainingArms.length; idx += concurrency) {
                const chunk = remainingArms.slice(idx, idx + concurrency);
                await Promise.all(chunk.map((arm) => uploadSingleArm(arm, baselineRunId)));
            }

            const shareUrl = buildShareUrl(
                uiUrl,
                succeededRunIds,
                arms.length > 1 || experimentId ? effectiveExperimentId : null
            );

            if (failedArms.length > 0 && succeededRunIds.length === 0) {
                return emitResult(1, {
                    ok: false,
                    exitCode: 1,
                    command: 'submit',
                    error: 'API_UPLOAD_ERROR',
                    message: `All ${failedArms.length} arm(s) failed to upload: ${failedArms[0].error}`,
                    failedArms,
                    piiReport,
                });
            }

            if (failedArms.length > 0) {
                return emitResult(3, {
                    ok: false,
                    exitCode: 3,
                    command: 'submit',
                    error: 'PARTIAL_BATCH_FAILURE',
                    message: `${succeededRunIds.length} arm(s) uploaded, but ${failedArms.length} arm(s) failed.`,
                    experimentId: effectiveExperimentId,
                    baselineRunId,
                    succeededRunIds,
                    uploadedRunIds: succeededRunIds,
                    runs: uploadedRuns,
                    failedArms,
                    shareUrl,
                    piiReport,
                });
            }

            return emitResult(0, {
                ok: true,
                exitCode: 0,
                command: 'submit',
                experimentId: effectiveExperimentId,
                experimentLabel: effectiveExperimentLabel,
                baselineRunId,
                targetState,
                uploadedRunIds: succeededRunIds,
                succeededRunIds,
                runs: uploadedRuns,
                shareUrl,
                piiReport,
                message: `Successfully submitted ${succeededRunIds.length} arm(s) to Prism Results Store.`,
            });
        }

        // -------------------------------------------------------------------
        // 5. prism list
        // -------------------------------------------------------------------
        if (command === 'list') {
            const token = resolveGithubToken(env, io.execTokenFn);
            const params = new URLSearchParams();
            if (flags.experimentId) params.set('experimentId', flags.experimentId);
            if (flags.status) params.set('status', flags.status);
            if (flags.own) params.set('own', 'true');
            if (flags.limit !== undefined) params.set('limit', String(flags.limit));

            const qs = params.toString();
            const url = `${apiUrl}/api/results${qs ? `?${qs}` : ''}`;
            const res = await fetchFn(url, {
                method: 'GET',
                headers: token ? { 'X-Prism-Github-Token': token } : {},
            });

            if (!res.ok) {
                return emitResult(1, {
                    ok: false,
                    exitCode: 1,
                    command: 'list',
                    error: 'API_LIST_ERROR',
                    message: `Failed to list results (HTTP ${res.status}).`,
                });
            }

            const data = (await res.json()) as Record<string, unknown> | Array<Record<string, unknown>>;
            let items: Array<Record<string, unknown>> = Array.isArray(data)
                ? data
                : (Array.isArray(data.results) ? data.results : (Array.isArray(data.items) ? data.items : []));

            if (flags.experimentId) {
                items = items.filter((it) => !it.experiment_id || it.experiment_id === flags.experimentId);
            }
            if (flags.model) {
                const needle = flags.model.toLowerCase();
                items = items.filter((it) =>
                    String(it.model_name || it.model || '').toLowerCase().includes(needle)
                );
            }
            if (flags.hardware) {
                const needle = flags.hardware.toLowerCase();
                items = items.filter((it) => {
                    const hw = (it.hardware as Record<string, unknown> | undefined)?.hardware_name ||
                        it.hardware_name ||
                        it.hardware ||
                        '';
                    return String(hw).toLowerCase().includes(needle);
                });
            }
            if (flags.limit !== undefined && flags.limit > 0) {
                items = items.slice(0, flags.limit);
            }

            return emitResult(0, {
                ok: true,
                exitCode: 0,
                command: 'list',
                count: items.length,
                results: items,
            });
        }

        // -------------------------------------------------------------------
        // 6. prism get <runId>
        // -------------------------------------------------------------------
        if (command === 'get') {
            const runId = positionals[0];
            if (!runId) {
                return emitResult(2, {
                    ok: false,
                    exitCode: 2,
                    command: 'get',
                    error: 'MISSING_RUN_ID',
                    message: 'Usage: prism get <runId> [--export-dir <dir>] [--json]',
                });
            }

            const token = resolveGithubToken(env, io.execTokenFn);
            const res = await fetchFn(`${apiUrl}/api/results/${encodeURIComponent(runId)}`, {
                method: 'GET',
                headers: token ? { 'X-Prism-Github-Token': token } : {},
            });

            if (!res.ok) {
                return emitResult(1, {
                    ok: false,
                    exitCode: 1,
                    command: 'get',
                    error: 'API_GET_ERROR',
                    message: `Failed to fetch run ${runId} (HTTP ${res.status}).`,
                });
            }

            const payload = (await res.json()) as Record<string, unknown>;
            const exportedFiles: string[] = [];

            if (flags.exportDir) {
                const outDir = path.resolve(flags.exportDir);
                fs.mkdirSync(outDir, { recursive: true });
                const bundleFile = path.join(outDir, `${runId}.v1.json`);
                fs.writeFileSync(bundleFile, JSON.stringify(payload, null, 2), 'utf8');
                exportedFiles.push(bundleFile);

                if (Array.isArray(payload.entries)) {
                    for (const entry of payload.entries as Array<Record<string, unknown>>) {
                        const fname = path.basename(String(entry.filename || `stage_${entry.prism_stage_index ?? 0}.yaml`));
                        const fpath = path.join(outDir, fname);
                        const rawContent = typeof entry.raw_report === 'string'
                            ? entry.raw_report
                            : yaml.dump(entry.raw_report || {});
                        fs.writeFileSync(fpath, rawContent, 'utf8');
                        exportedFiles.push(fpath);
                    }
                }
            }

            return emitResult(0, {
                ok: true,
                exitCode: 0,
                command: 'get',
                runId,
                result: payload,
                exportedFiles,
            });
        }

        // -------------------------------------------------------------------
        // 7. prism compare [runIds...]
        // -------------------------------------------------------------------
        if (command === 'compare') {
            const token = resolveGithubToken(env, io.execTokenFn);
            const headers: Record<string, string> = token ? { 'X-Prism-Github-Token': token } : {};

            const targetRunIds = [...positionals];
            const preloadedPayloads = new Map<string, Record<string, unknown>>();

            if (flags.experimentId && targetRunIds.length === 0) {
                const listRes = await fetchFn(
                    `${apiUrl}/api/results?experimentId=${encodeURIComponent(flags.experimentId)}`,
                    { method: 'GET', headers }
                );
                if (!listRes.ok) {
                    return emitResult(1, {
                        ok: false,
                        exitCode: 1,
                        command: 'compare',
                        error: 'API_COMPARE_LIST_ERROR',
                        message: `Failed to list runs for experiment ${flags.experimentId} (HTTP ${listRes.status}).`,
                    });
                }
                const listData = (await listRes.json()) as Record<string, unknown> | Array<Record<string, unknown>>;
                const listItems: Array<Record<string, unknown>> = Array.isArray(listData)
                    ? listData
                    : (Array.isArray(listData.results) ? listData.results : (Array.isArray(listData.items) ? listData.items : []));

                for (const item of listItems) {
                    const id = String(item.runId || item.run_id || '');
                    if (id) {
                        targetRunIds.push(id);
                        if (Array.isArray(item.entries) && item.entries.length > 0) {
                            preloadedPayloads.set(id, item);
                        }
                    }
                }
            }

            if (targetRunIds.length === 0) {
                return emitResult(2, {
                    ok: false,
                    exitCode: 2,
                    command: 'compare',
                    error: 'MISSING_COMPARE_RUNS',
                    message: 'Provide one or more runIds or --experiment-id <id> to compare.',
                });
            }

            const runPayloads: Array<Record<string, unknown>> = [];
            for (const id of targetRunIds) {
                if (preloadedPayloads.has(id)) {
                    runPayloads.push(preloadedPayloads.get(id)!);
                    continue;
                }
                const res = await fetchFn(`${apiUrl}/api/results/${encodeURIComponent(id)}`, {
                    method: 'GET',
                    headers,
                });
                if (!res.ok) {
                    return emitResult(1, {
                        ok: false,
                        exitCode: 1,
                        command: 'compare',
                        error: 'API_COMPARE_GET_ERROR',
                        message: `Failed to fetch run ${id} for comparison (HTTP ${res.status}).`,
                    });
                }
                const data = (await res.json()) as Record<string, unknown>;
                runPayloads.push(data);
            }

            const rawMetrics = runPayloads.map((p) =>
                extractRunComparisonMetrics(p, {
                    sloTtftMs: flags.sloTtftMs,
                    sloTpotMs: flags.sloTpotMs,
                })
            );

            // Identify baseline run
            let baselineMetric = rawMetrics.find(
                (m) => flags.baseline && (m.runId === flags.baseline || m.runLabel === flags.baseline)
            );
            if (!baselineMetric) {
                const linkedBaseId = runPayloads
                    .map((p) => p.baseline_run_id as string | undefined)
                    .find((id) => Boolean(id));
                if (linkedBaseId) {
                    baselineMetric = rawMetrics.find((m) => m.runId === linkedBaseId);
                }
            }
            if (!baselineMetric) {
                baselineMetric = rawMetrics[0];
            }

            const comparisonRows = rawMetrics.map((m) => {
                const isBaseline = m.runId === baselineMetric!.runId;
                const tputDelta = formatPctDelta(m.maxThroughput, baselineMetric!.maxThroughput);
                const ttftDelta = formatPctDelta(m.meanTtftMs, baselineMetric!.meanTtftMs);
                const tpotDelta = formatPctDelta(m.meanTpotMs, baselineMetric!.meanTpotMs);

                return {
                    ...m,
                    isBaseline,
                    deltas: {
                        throughputPct: isBaseline ? 0 : tputDelta.pct,
                        throughputFormatted: isBaseline ? 'baseline' : tputDelta.formatted,
                        ttftPct: isBaseline ? 0 : ttftDelta.pct,
                        ttftFormatted: isBaseline ? 'baseline' : ttftDelta.formatted,
                        tpotPct: isBaseline ? 0 : tpotDelta.pct,
                        tpotFormatted: isBaseline ? 'baseline' : tpotDelta.formatted,
                    },
                };
            });

            const shareUrl = buildShareUrl(uiUrl, targetRunIds, flags.experimentId || null);

            const mdLines = [
                '| Run / Arm | Model | Hardware | Peak Throughput (tok/s) | vs Baseline | Mean TTFT (ms) | Mean TPOT (ms) | SLO Status |',
                '| :--- | :--- | :--- | ---: | ---: | ---: | ---: | :--- |',
            ];
            for (const row of comparisonRows) {
                const tputStr = row.maxThroughput ? row.maxThroughput.toFixed(1) : 'N/A';
                const ttftStr = row.meanTtftMs !== null
                    ? `${row.meanTtftMs.toFixed(1)} (${row.deltas.ttftFormatted})`
                    : 'N/A';
                const tpotStr = row.meanTpotMs !== null
                    ? `${row.meanTpotMs.toFixed(1)} (${row.deltas.tpotFormatted})`
                    : 'N/A';
                const sloStr = row.sloPass === null
                    ? '—'
                    : (row.sloPass ? `PASS (${row.passingStages}/${row.stageCount})` : `FAIL (0/${row.stageCount})`);
                const labelStr = row.isBaseline ? `${row.runLabel} (Baseline)` : row.runLabel;
                mdLines.push(
                    `| ${labelStr} | ${row.model_name} | ${row.hardware} | ${tputStr} | ${row.deltas.throughputFormatted} | ${ttftStr} | ${tpotStr} | ${sloStr} |`
                );
            }
            mdLines.push('', `**Compare in Prism**: ${shareUrl}`);
            const markdownTable = mdLines.join('\n');

            return emitResult(0, {
                ok: true,
                exitCode: 0,
                command: 'compare',
                experimentId: flags.experimentId || null,
                baselineRunId: baselineMetric.runId,
                runs: comparisonRows,
                markdown: markdownTable,
                shareUrl,
            });
        }

        // -------------------------------------------------------------------
        // 8. prism promote [runId]
        // -------------------------------------------------------------------
        if (command === 'promote') {
            const token = resolveGithubToken(env, io.execTokenFn);
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                ...(token ? { 'X-Prism-Github-Token': token } : {}),
            };

            const targetRunIds = [...positionals];
            if (flags.experimentId && targetRunIds.length === 0) {
                const listRes = await fetchFn(
                    `${apiUrl}/api/results?experimentId=${encodeURIComponent(flags.experimentId)}`,
                    { method: 'GET', headers }
                );
                if (listRes.ok) {
                    const listData = (await listRes.json()) as Record<string, unknown> | Array<Record<string, unknown>>;
                    const items = Array.isArray(listData)
                        ? listData
                        : (Array.isArray(listData.results) ? listData.results : []);
                    for (const it of items) {
                        const id = String(it.runId || it.run_id || '');
                        if (id) targetRunIds.push(id);
                    }
                }
            }

            if (targetRunIds.length === 0) {
                return emitResult(2, {
                    ok: false,
                    exitCode: 2,
                    command: 'promote',
                    error: 'MISSING_RUN_ID',
                    message: 'Provide <runId> or --experiment-id <id> to promote.',
                });
            }

            const promoted: Array<Record<string, unknown>> = [];
            for (const id of targetRunIds) {
                const res = await fetchFn(`${apiUrl}/api/results/${encodeURIComponent(id)}/promote`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(flags.status ? { status: flags.status } : {}),
                });
                if (!res.ok) {
                    return emitResult(1, {
                        ok: false,
                        exitCode: 1,
                        command: 'promote',
                        error: 'API_PROMOTE_ERROR',
                        message: `Failed to promote run ${id} (HTTP ${res.status}).`,
                    });
                }
                const data = (await res.json()) as Record<string, unknown>;
                promoted.push({ runId: id, ...data });
            }

            return emitResult(0, {
                ok: true,
                exitCode: 0,
                command: 'promote',
                promoted,
                message: `Promoted ${promoted.length} run(s).`,
            });
        }

        // -------------------------------------------------------------------
        // 9. prism review [runId]
        // -------------------------------------------------------------------
        if (command === 'review') {
            const token = resolveGithubToken(env, io.execTokenFn);
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                ...(token ? { 'X-Prism-Github-Token': token } : {}),
            };

            const targetRunIds = [...positionals];
            if (flags.experimentId && targetRunIds.length === 0) {
                const listRes = await fetchFn(
                    `${apiUrl}/api/results?experimentId=${encodeURIComponent(flags.experimentId)}`,
                    { method: 'GET', headers }
                );
                if (listRes.ok) {
                    const listData = (await listRes.json()) as Record<string, unknown> | Array<Record<string, unknown>>;
                    const items = Array.isArray(listData)
                        ? listData
                        : (Array.isArray(listData.results) ? listData.results : []);
                    for (const it of items) {
                        const id = String(it.runId || it.run_id || '');
                        if (id) targetRunIds.push(id);
                    }
                }
            }

            if (targetRunIds.length === 0) {
                return emitResult(2, {
                    ok: false,
                    exitCode: 2,
                    command: 'review',
                    error: 'MISSING_RUN_ID',
                    message: 'Provide <runId> or --experiment-id <id> to review.',
                });
            }

            const reviewStatus = flags.status || 'public';
            const reviewed: Array<Record<string, unknown>> = [];
            for (const id of targetRunIds) {
                const res = await fetchFn(`${apiUrl}/api/results/${encodeURIComponent(id)}/review`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        status: reviewStatus,
                        ...(flags.feedback ? { feedback: flags.feedback } : {}),
                    }),
                });
                if (!res.ok) {
                    return emitResult(1, {
                        ok: false,
                        exitCode: 1,
                        command: 'review',
                        error: 'API_REVIEW_ERROR',
                        message: `Failed to review run ${id} (HTTP ${res.status}).`,
                    });
                }
                const data = (await res.json()) as Record<string, unknown>;
                reviewed.push({ runId: id, ...data });
            }

            return emitResult(0, {
                ok: true,
                exitCode: 0,
                command: 'review',
                reviewed,
                message: `Reviewed ${reviewed.length} run(s) -> ${reviewStatus}.`,
            });
        }

        // -------------------------------------------------------------------
        // 10. prism fork <runId>
        // -------------------------------------------------------------------
        if (command === 'fork') {
            const runId = positionals[0];
            if (!runId) {
                return emitResult(2, {
                    ok: false,
                    exitCode: 2,
                    command: 'fork',
                    error: 'MISSING_RUN_ID',
                    message: 'Usage: prism fork <runId> [--label <str>] [--tags <t1,t2>] [--output <file>]',
                });
            }

            const token = resolveGithubToken(env, io.execTokenFn);
            const res = await fetchFn(`${apiUrl}/api/results/${encodeURIComponent(runId)}`, {
                method: 'GET',
                headers: token ? { 'X-Prism-Github-Token': token } : {},
            });

            if (!res.ok) {
                return emitResult(1, {
                    ok: false,
                    exitCode: 1,
                    command: 'fork',
                    error: 'API_FORK_GET_ERROR',
                    message: `Failed to fetch source run ${runId} for forking (HTTP ${res.status}).`,
                });
            }

            const sourceRun = (await res.json()) as Record<string, unknown>;
            const parsedTags = flags.tags
                ? flags.tags.split(',').map((t) => t.trim()).filter(Boolean)
                : undefined;

            const forked = createForkedBundle(sourceRun, {
                label: flags.label,
                tags: parsedTags,
            });

            let outputPath: string | null = null;
            if (flags.output) {
                outputPath = path.resolve(flags.output);
                fs.mkdirSync(path.dirname(outputPath), { recursive: true });
                fs.writeFileSync(outputPath, JSON.stringify(forked.payload, null, 2), 'utf8');
            }

            return emitResult(0, {
                ok: true,
                exitCode: 0,
                command: 'fork',
                originalRunId: runId,
                newRunId: forked.newRunId,
                payload: forked.payload,
                bundle: forked.bundle,
                outputPath,
                message: `Forked run ${runId} -> ${forked.newRunId}.`,
            });
        }

        return emitResult(2, {
            ok: false,
            exitCode: 2,
            command,
            error: 'UNKNOWN_COMMAND',
            message: `Unknown command '${command}'. Supported commands: init, scrub, validate, submit, list, get, compare, promote, review, fork.`,
        });
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return emitResult(1, {
            ok: false,
            exitCode: 1,
            command,
            error: 'UNHANDLED_CLI_ERROR',
            message: errMsg,
        });
    }
}

const isMainEntry = (() => {
    try {
        if (!process.argv[1]) return false;
        const resolvedArgv1 = path.resolve(process.argv[1]);
        return (
            import.meta.url === pathToFileURL(resolvedArgv1).href ||
            resolvedArgv1.endsWith('prism.ts') ||
            resolvedArgv1.endsWith('prism.mjs') ||
            resolvedArgv1.endsWith('prism-results')
        );
    } catch {
        return false;
    }
})();

if (isMainEntry) {
    runPrismCli(process.argv.slice(2)).then(({ exitCode }) => {
        process.exit(exitCode);
    });
}
