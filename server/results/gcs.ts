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

import type { PrismResultPayload, PrismSubmissionState, PrismResultContext } from './api.ts';
import { Storage } from '@google-cloud/storage';

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
            const model_name = String(customContexts.model_name?.value || customMetadata.model_name || 'Unknown');
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
                submitted_at: metadata?.timeCreated || metadata?.updated || null
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

    try {
        await file.save(JSON.stringify(payload), {
            contentType: 'application/json',
            metadata: {
                contexts: {
                    custom: contextsCustom
                }
            }
        });
    } catch (e: any) {
        throw new Error(`GCS upload failed: ${e.message}`);
    }
}
