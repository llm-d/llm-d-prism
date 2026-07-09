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

import type { PrismResultPayload, PrismSubmissionState, PrismResultContext, PrismSummaryEntry } from './api.ts';
import { Storage } from '@google-cloud/storage';
import { parseReportV02, stageToEntry } from '../../src/utils/benchmarkReportV02Parser.js';
import { parseJsonEntry } from '../../src/utils/dataParser.js';
import yaml from 'js-yaml';

export const storage = new Storage(
    process.env.GOOGLE_APPLICATION_DEFAULT_CREDENTIALS
        ? { keyFilename: process.env.GOOGLE_APPLICATION_DEFAULT_CREDENTIALS }
        : undefined
);

/**
 * Resolves the primary Google Cloud Storage bucket for storing and listing Prism benchmark results.
 */
export function getPrismResultsBucket(): string {
    const rawBuckets = process.env.DEFAULT_BUCKETS || 'llm-d-benchmarks-staging,llm-d-benchmarks';
    const buckets = rawBuckets.split(',').map(b => b.trim());
    if (buckets.includes('llm-d-benchmarks-staging')) {
        return 'llm-d-benchmarks-staging';
    }
    return buckets[0] || 'llm-d-benchmarks';
}

export type ResultsListItem = Omit<PrismResultPayload, 'entries'> & {
    state: PrismSubmissionState;
    summary?: PrismSummaryEntry[];
};

export interface ListResultsOptions {
    limit: number;
    pageToken?: string;
    statusFilter?: PrismSubmissionState | null;
    ownFilter?: boolean;
    username?: string | null;
    permission?: string;
}

export interface ListResultsResult {
    items: ResultsListItem[];
    nextPageToken: string | null;
}

function encodePageToken(tokenObj: { gcsToken: string; skipCount: number }): string {
    return Buffer.from(JSON.stringify(tokenObj)).toString('base64');
}

function decodePageToken(tokenStr: string): { gcsToken: string; skipCount: number } {
    try {
        return JSON.parse(Buffer.from(tokenStr, 'base64').toString('utf-8'));
    } catch (e) {
        return { gcsToken: '', skipCount: 0 };
    }
}

function resolveRunTimestamp(path: string, metadata?: any, summary?: any): string | null {
    if (summary) {
        if (Array.isArray(summary) && summary[0]?.timestamp) return String(summary[0].timestamp);
        if (summary.timestamp) return String(summary.timestamp);
    }
    const customTs = metadata?.metadata?.timestamp || metadata?.customMetadata?.timestamp;
    if (customTs) return String(customTs);

    const isoDateMatch = path.match(/(\d{4}-\d{2}-\d{2})/);
    if (isoDateMatch) {
        return `${isoDateMatch[1]}T00:00:00Z`;
    }
    const compactDateMatch = path.match(/runner-(\d{4})(\d{2})(\d{2})/);
    if (compactDateMatch) {
        return `${compactDateMatch[1]}-${compactDateMatch[2]}-${compactDateMatch[3]}T00:00:00Z`;
    }

    return metadata?.timeCreated || metadata?.updated || null;
}

function resolveModelName(path: string, metadata?: any, summary?: any): string {
    const fromMeta = metadata?.contexts?.custom?.model_name?.value || metadata?.metadata?.model_name;
    if (fromMeta && fromMeta !== 'Unknown') return String(fromMeta);

    if (summary) {
        if (Array.isArray(summary) && summary[0]?.model_name && summary[0].model_name !== 'Unknown') return String(summary[0].model_name);
        if (summary.model_name && summary.model_name !== 'Unknown') return String(summary.model_name);
    }

    const filename = path.split('/').pop() || '';
    if (filename && filename !== 'Unknown' && !filename.startsWith('runner-')) {
        return filename.replace(/\.json$/, '').replace(/\.yaml$/, '');
    }

    return 'Unknown';
}

/**
 * Lists benchmark results from Google Cloud Storage, applying status, user ownership filters,
 * and user permission authorization checks.
 */
export async function listResults(options: ListResultsOptions): Promise<ListResultsResult> {
    const { limit, pageToken, statusFilter, ownFilter, username, permission } = options;
    const { gcsToken, skipCount } = pageToken ? decodePageToken(pageToken) : { gcsToken: '', skipCount: 0 };

    const bucket = getPrismResultsBucket();

    // Craft list of filter predicates upfront depending on options and permissions
    // eslint-disable-next-line no-unused-vars
    const filters: ((state: PrismSubmissionState, user: string) => boolean)[] = [];

    // 1. Permission check (non-admins can only see their own results or public/promoted results)
    if (permission !== 'admin') {
        filters.push((state, user) => {
            const isApproved = state === 'public' || state === 'promoted';
            const isOwn = !!(username && user.toLowerCase() === username.toLowerCase());
            return isApproved || isOwn;
        });
    }

    // 2. Status Filter
    if (statusFilter) {
        filters.push((state) => state === statusFilter);
    }

    // 3. Ownership Filter
    if (ownFilter) {
        filters.push((_, user) => !!(username && user.toLowerCase() === username.toLowerCase()));
    }

    // Helper: returns true if the item metadata matches all filters
    const matchesFilters = (state: PrismSubmissionState, user: string): boolean => {
        return filters.every(f => f(state, user));
    };


    // Construct single query filter parameter if possible as GCS side optimization
    let gcsFilter: string | undefined;
    if (ownFilter && username) {
        gcsFilter = `contexts."github_user"="${username}"`;
    } else if (statusFilter) {
        gcsFilter = `contexts."submission_state"="${statusFilter}"`;
    }

    const matchedItems: ResultsListItem[] = [];
    let currentGcsToken = gcsToken;
    let currentSkipCount = skipCount;
    let hasMoreGcs = true;

    while (matchedItems.length < limit && hasMoreGcs) {
        const maxResults = 100;
        const [files, nextQuery] = await storage.bucket(bucket).getFiles({
            prefix: 'prism-results-store/',
            maxResults,
            pageToken: currentGcsToken || undefined,
            autoPaginate: false,
            filter: gcsFilter
        });

        let i = currentSkipCount;
        for (; i < files.length && matchedItems.length < limit; i++) {
            const file = files[i];

            if (!file.name.startsWith('prism-results-store/') || !file.name.endsWith('.v1.json')) {
                continue;
            }

            const metadata = file.metadata;
            const customContexts = metadata?.contexts?.custom || {};
            const customMetadata = metadata?.metadata || {};
            const itemUser = String(customContexts.github_user?.value || customMetadata.user || '');
            const itemState = String(customContexts.submission_state?.value || customMetadata.state || 'submitted_pending_processing') as PrismSubmissionState;

            if (!matchesFilters(itemState, itemUser)) {
                continue;
            }

            const runIdMatch = file.name.match(/prism-results-store\/([^/]+)\.v1\.json/);
            const runId = runIdMatch ? runIdMatch[1] : String(customContexts.run_id?.value || customMetadata.run_id || '');
            const runLabel = String(customContexts.run_label?.value || customMetadata.run_label || customMetadata.runLabel || runId);
            const summaryVal = customMetadata.prism_summary;
            const summary = summaryVal ? JSON.parse(String(summaryVal)) : undefined;

            const model_name = resolveModelName(file.name, metadata, summary);
            const hardware_name = String(customContexts.hardware_name?.value || customMetadata.hardware_name || 'Unknown');

            matchedItems.push({
                runId,
                runLabel,
                model_name,
                hardware: {
                    hardware_name
                },
                format: 'brv02',
                state: itemState,
                github_author: {
                    username: itemUser || 'Unknown'
                },
                submitted_at: resolveRunTimestamp(file.name, metadata, summary),
                summary
            });
        }

        if (matchedItems.length === limit) {
            const nextSkipCount = i;
            const nextGcsToken = nextQuery?.pageToken || '';
            
            let nextPageToken: string | null = null;
            if (nextSkipCount < files.length) {
                nextPageToken = encodePageToken({ gcsToken: currentGcsToken, skipCount: nextSkipCount });
            } else if (nextGcsToken) {
                nextPageToken = encodePageToken({ gcsToken: nextGcsToken, skipCount: 0 });
            }

            return {
                items: matchedItems,
                nextPageToken
            };
        }

        if (nextQuery?.pageToken) {
            currentGcsToken = nextQuery.pageToken;
            currentSkipCount = 0;
        } else {
            hasMoreGcs = false;
        }
    }

    return {
        items: matchedItems,
        nextPageToken: null
    };
}

/**
 * Fetches the JSON file payload content of a benchmark result run bundle from Google Cloud Storage.
 */
export async function readResultPayload(runId: string): Promise<PrismResultPayload> {
    const bucketName = getPrismResultsBucket();
    const objectName = `prism-results-store/${runId}.v1.json`;
    const file = storage.bucket(bucketName).file(objectName);
    const [contents] = await file.download();
    return JSON.parse(contents.toString('utf8')) as PrismResultPayload;
}

/**
 * Fetches GCS metadata for a single benchmark result run bundle to check ownership and state.
 */
export async function readResultMetadata(runId: string): Promise<{ user: string; state: PrismSubmissionState } | null> {
    const bucketName = getPrismResultsBucket();
    const objectName = `prism-results-store/${runId}.v1.json`;
    const file = storage.bucket(bucketName).file(objectName);
    try {
        const [metadata] = await file.getMetadata();
        const customContexts = metadata.contexts?.custom || {};
        const customMetadata = metadata.metadata || {};
        return {
            user: String(customContexts.github_user?.value || customMetadata.user || ''),
            state: String(customContexts.submission_state?.value || customMetadata.state || 'submitted_pending_processing') as PrismSubmissionState
        };
    } catch (e: any) {
        if (e.code === 404) return null;
        throw new Error(`Failed to fetch metadata from GCS: ${e.message}`);
    }
}

function extractSummaryFromPayload(payload: PrismResultPayload): any[] {
    const entries: any[] = [];
    if (payload.entries && Array.isArray(payload.entries)) {
        for (const entry of payload.entries) {
            const parsedStage = parseReportV02(entry.raw_report, entry.filename);
            if (parsedStage) {
                parsedStage.runId = payload.runId;
                parsedStage.runLabel = payload.runLabel;
                parsedStage.run_metadata = payload.run_metadata;
                if (payload.metadata?.config) {
                    parsedStage.config = payload.metadata.config;
                }
                const fullEntry = stageToEntry(parsedStage);
                if (payload.github_author) {
                    fullEntry.github_author = payload.github_author;
                }
                entries.push(fullEntry);
            }
        }
    }
    
    return entries.map(e => ({
        runLabel: e.runLabel || e.run_description || '',
        github_author: e.github_author,
        model: e.model || e.model_name || 'Unknown',
        model_name: e.model_name || e.model || 'Unknown',
        hardware: e.hardware || e.metadata?.hardware || 'Unknown',
        precision: e.precision || e.metadata?.precision || 'Unknown',
        backend: e.backend || e.metadata?.backend || 'Unknown',
        isl: e.isl || e.workload?.input_tokens || 0,
        osl: e.osl || e.workload?.output_tokens || 0,
        timestamp: e.timestamp || e.metadata?.timestamp || null,
        throughput: e.throughput || e.metrics?.throughput || null,
        latency: {
            mean: e.latency?.mean ?? e.metrics?.latency?.mean ?? null
        },
        components: e.components || e.metadata?.components || [],
        metadata: {
            model_name: e.metadata?.model_name || e.model_name || 'Unknown',
            backend: e.metadata?.backend || e.backend || 'Unknown',
            hardware: e.metadata?.hardware || e.hardware || 'Unknown',
            accelerator_type: e.metadata?.accelerator_type || e.hardware || 'Unknown',
            accelerator_count: e.metadata?.accelerator_count || 1,
            precision: e.metadata?.precision || 'Unknown',
            timestamp: e.metadata?.timestamp || e.timestamp || null,
            tp: e.metadata?.tp || 1,
            architecture: e.metadata?.architecture || 'aggregate',
            components: e.metadata?.components || e.components || []
        },
        workload: {
            input_tokens: e.workload?.input_tokens || e.isl || 0,
            output_tokens: e.workload?.output_tokens || e.osl || 0,
            stage: e.workload?.stage ?? 1
        }
    }));
}

export async function writeResult(
    runId: string,
    payload: PrismResultPayload,
    submissionState: PrismSubmissionState,
    githubUser: string
): Promise<void> {
    const bucketName = getPrismResultsBucket();
    const objectName = `prism-results-store/${runId}.v1.json`;
    const file = storage.bucket(bucketName).file(objectName);

    const contextsCustom = {
        submission_state: { value: submissionState },
        github_user: { value: githubUser },
        run_id: { value: runId },
        hardware_name: { value: payload.hardware?.hardware_name || 'Unknown' },
        model_name: { value: payload.model_name || 'Unknown' },
        run_label: { value: payload.runLabel || runId }
    } satisfies PrismResultContext;

    const summary = extractSummaryFromPayload(payload);
    const summaryStr = JSON.stringify(summary);

    try {
        await file.save(JSON.stringify(payload), {
            contentType: 'application/json',
            metadata: {
                contexts: {
                    custom: contextsCustom
                },
                metadata: {
                    prism_summary: summaryStr
                }
            }
        });
    } catch (e: any) {
        throw new Error(`GCS upload failed: ${e.message}`);
    }
}

export interface ListBenchmarksOptions {
    bucket?: string;
    prefix?: string;
    limit: number;
    pageToken?: string;
    username?: string | null;
    permission?: string;
}

export interface BenchmarkListItem {
    runId: string;
    runLabel: string | null;
    isFromResultStore: boolean;
    github_author?: { username: string };
    model_name?: string;
    hardware?: { hardware_name: string };
    state?: string;
    submitted_at: string | null;
    downloadUrl: string;
    summary?: any[];
}

export interface ListBenchmarksResult {
    items: BenchmarkListItem[];
    nextPageToken: string | null;
}

export async function listBenchmarks(options: ListBenchmarksOptions): Promise<ListBenchmarksResult> {
    const { bucket: bucketParam, prefix, limit, pageToken, username, permission } = options;
    const bucketName = bucketParam || getPrismResultsBucket();
    
    const { gcsToken, skipCount } = pageToken ? decodePageToken(pageToken) : { gcsToken: '', skipCount: 0 };
    
    const matchedItems: BenchmarkListItem[] = [];
    const seenRunIds = new Set<string>();
    let currentGcsToken = gcsToken;
    let currentSkipCount = skipCount;
    let hasMoreGcs = true;

    while (matchedItems.length < limit && hasMoreGcs) {
        const maxResults = 100;
        const [files, nextQuery] = await storage.bucket(bucketName).getFiles({
            prefix: prefix || undefined,
            maxResults,
            pageToken: currentGcsToken || undefined,
            autoPaginate: false
        });

        const batchGroups: { [runId: string]: { file: any; originalIndex: number }[] } = {};
        const groupOrder: string[] = [];

        let i = currentSkipCount;
        for (; i < files.length; i++) {
            const file = files[i];
            if (file.name.endsWith('/') || file.name.endsWith('.keep') || file.name.split('/').pop()?.startsWith('.')) {
                continue;
            }
            const baseName = (file.name.split('/').pop() || '').toLowerCase();
            if (baseName === 'per_request_lifecycle_metrics.json') {
                continue;
            }
            const isResultsStoreFile = file.name.startsWith('prism-results-store/');
            const isCandidate = baseName.startsWith('benchmark_report') && 
                                (baseName.endsWith('.json') || baseName.endsWith('.yaml') || baseName.endsWith('.yml'));
            if (!isResultsStoreFile && !isCandidate) {
                continue;
            }

            const runIdMatch = file.name.match(/prism-results-store\/([^/]+)\.v1\.json/);
            const runId = isResultsStoreFile
                ? (runIdMatch ? runIdMatch[1] : String(file.metadata?.contexts?.custom?.run_id?.value || file.metadata?.metadata?.run_id || file.name))
                : (file.name.includes('/') ? file.name.substring(0, file.name.lastIndexOf('/')) : file.name);

            if (seenRunIds.has(runId)) {
                continue;
            }

            if (!batchGroups[runId]) {
                batchGroups[runId] = [];
                groupOrder.push(runId);
            }
            batchGroups[runId].push({ file, originalIndex: i });
        }

        let groupIdx = 0;
        for (; groupIdx < groupOrder.length && matchedItems.length < limit; groupIdx++) {
            const runId = groupOrder[groupIdx];
            const group = batchGroups[runId];

            // If a folder has BRV02 OR BRV01 files, skip raw log and raw json entries
            const brGroup = group.filter(g => {
                const base = (g.file.name.split('/').pop() || '').toLowerCase();
                return base.startsWith('benchmark_report');
            });
            const targetGroup = brGroup.length > 0 ? brGroup : group;

            // Prioritize the file that has metadata summary
            const representativeObj = targetGroup.find(g => g.file.metadata?.metadata?.prism_summary) || targetGroup[0];
            const file = representativeObj.file;

            const metadata = file.metadata;
            const customContexts = metadata?.contexts?.custom || {};
            const customMetadata = metadata?.metadata || {};
            const isResultsStoreFile = file.name.startsWith('prism-results-store/');

            const itemUser = String(customContexts.github_user?.value || customMetadata.user || '');
            const itemState = String(customContexts.submission_state?.value || customMetadata.state || 'submitted_pending_processing');

            // Enforce authorization for Results Store files
            if (isResultsStoreFile && permission !== 'admin') {
                const isApproved = itemState === 'public' || itemState === 'promoted';
                const isOwn = !!(username && itemUser.toLowerCase() === username.toLowerCase());
                if (!isApproved && !isOwn) {
                    continue;
                }
            }

            seenRunIds.add(runId);

            const rawRunLabel = customContexts.run_label?.value || customMetadata.run_label || customMetadata.runLabel;
            const runLabel = rawRunLabel ? String(rawRunLabel) : null;
            const summaryVal = customMetadata.prism_summary;
            const summary = summaryVal ? JSON.parse(String(summaryVal)) : undefined;

            const downloadPath = isResultsStoreFile ? file.name : runId;

            const item: BenchmarkListItem = {
                runId,
                runLabel,
                isFromResultStore: isResultsStoreFile,
                github_author: itemUser ? { username: itemUser } : undefined,
                submitted_at: resolveRunTimestamp(file.name, metadata, summary),
                downloadUrl: `/api/benchmarks/content?path=${encodeURIComponent(downloadPath)}&bucket=${encodeURIComponent(bucketName)}`,
                summary
            };

            if (isResultsStoreFile) {
                const model_name = resolveModelName(file.name, metadata, summary);
                const hardware_name = String(customContexts.hardware_name?.value || customMetadata.hardware_name || 'Unknown');
                item.model_name = model_name;
                item.hardware = {
                    hardware_name
                };
                item.state = itemState;
            }

            matchedItems.push(item);
        }

        if (matchedItems.length === limit) {
            let nextSkipCount = files.length;
            if (groupIdx < groupOrder.length) {
                const nextGroup = batchGroups[groupOrder[groupIdx]];
                nextSkipCount = nextGroup[0].originalIndex;
            }
            const nextGcsToken = nextQuery?.pageToken || '';

            let nextPageToken: string | null = null;
            if (nextSkipCount < files.length) {
                nextPageToken = encodePageToken({ gcsToken: currentGcsToken, skipCount: nextSkipCount });
            } else if (nextGcsToken) {
                nextPageToken = encodePageToken({ gcsToken: nextGcsToken, skipCount: 0 });
            }

            return {
                items: matchedItems,
                nextPageToken
            };
        }

        if (nextQuery?.pageToken) {
            currentGcsToken = nextQuery.pageToken;
            currentSkipCount = 0;
        } else {
            hasMoreGcs = false;
        }
    }

    return {
        items: matchedItems,
        nextPageToken: null
    };
}

export async function readBenchmarkContent(bucketParam: string | undefined, path: string): Promise<string> {
    const bucketName = bucketParam || getPrismResultsBucket();
    const isFile = path.endsWith('.json') || path.endsWith('.yaml') || path.endsWith('.yml') || path.endsWith('.log');

    if (isFile) {
        const file = storage.bucket(bucketName).file(path);
        const [contents] = await file.download();
        return contents.toString('utf8');
    }

    // It's a directory/prefix path. List all candidate files inside, download, and merge them.
    const [files] = await storage.bucket(bucketName).getFiles({
        prefix: path.endsWith('/') ? path : `${path}/`
    });

    // Filter candidateFiles to only BRV01/BRV02 reports
    const candidateFiles = files.filter(f => {
        const baseName = (f.name.split('/').pop() || '').toLowerCase();
        return baseName.startsWith('benchmark_report') && 
               (baseName.endsWith('.json') || baseName.endsWith('.yaml') || baseName.endsWith('.yml'));
    });

    const v01Entries: any[] = [];
    const v02Entries: any[] = [];

    await Promise.all(candidateFiles.map(async f => {
        try {
            const [contents] = await f.download();
            const contentStr = contents.toString('utf8');

            let parsedDoc: any = null;
            let isYaml = false;
            let isJson = false;

            try {
                parsedDoc = JSON.parse(contentStr);
                isJson = true;
            } catch {
                try {
                    parsedDoc = yaml.load(contentStr);
                    isYaml = true;
                } catch {
                    // Not valid JSON/YAML. Could be a raw log file.
                }
            }

            let fileEntries: any[] = [];
            let isV02File = false;

            if (parsedDoc && typeof parsedDoc === 'object' && !Array.isArray(parsedDoc)) {
                if (parsedDoc.version === '0.2') {
                    isV02File = true;
                    const parsedStage = parseReportV02(parsedDoc, f.name);
                    if (parsedStage) {
                        const entry = stageToEntry(parsedStage);
                        fileEntries = [entry];
                    }
                } else if (parsedDoc.metrics || parsedDoc.load_summary) {
                    const entry = parseJsonEntry({ ...parsedDoc, source: 'gcs' }, f.name);
                    fileEntries = [entry];
                }
            }

            if (fileEntries.length > 0) {
                fileEntries.forEach(e => {
                    if (!e.timestamp) {
                        e.timestamp = resolveRunTimestamp(f.name);
                        if (e.metadata) {
                            e.metadata.timestamp = e.timestamp;
                        }
                    }
                    if (!e.runLabel) {
                        const parts = f.name.split('/');
                        parts.pop();
                        const folderBase = parts.filter(Boolean).pop() || '';
                        e.runLabel = folderBase || null;
                    }
                    e._source_file = f.name;
                });

                if (isV02File) {
                    v02Entries.push(...fileEntries);
                } else {
                    v01Entries.push(...fileEntries);
                }
            }
        } catch (err: any) {
            console.warn(`[readBenchmarkContent] Failed to parse file ${f.name}:`, err.message);
        }
    }));

    // Apply V0.2 vs V0.1 precedence rules
    const finalEntries = v02Entries.length > 0 ? v02Entries : v01Entries;
    return JSON.stringify(finalEntries);
}
