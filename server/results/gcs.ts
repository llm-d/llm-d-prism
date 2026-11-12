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
import {
    getResultsStoreBucket,
    getResultsStorePrefix,
    getResultsStoreObjectPath
} from '../buckets.js';
import { isPlaygroundMode } from '../iam.ts';
import { normalizeReviewers } from '../../src/utils/benchmarkReportV02Parser.js';
import { buildListFilters } from './listFilters.ts';
import { isS3ResultsStore } from './backend.ts';

/** The S3 store, imported on first use so GCS deployments never load the AWS SDK. */
const s3Store = async () => (await import('./store/active.ts')).getS3ResultsStore();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeContextValue(val: string): string {
    return 'e' + Buffer.from(val, 'utf8').toString('base64url');
}

export function decodeContextValue(val: string): string {
    if (!val) return '';
    if (UUID_RE.test(val)) return val;
    if (val.startsWith('e')) {
        return Buffer.from(val.substring(1), 'base64url').toString('utf8');
    }
    return val;
}

export const storage = new Storage(
    process.env.GOOGLE_APPLICATION_DEFAULT_CREDENTIALS
        ? { keyFilename: process.env.GOOGLE_APPLICATION_DEFAULT_CREDENTIALS }
        : undefined
);

/**
 * Resolves the primary Google Cloud Storage bucket for storing and listing Prism benchmark results.
 */
export function getPrismResultsBucket(): string {
    return getResultsStoreBucket();
}

/**
 * Resolves the object prefix for storing and listing Prism benchmark results.
 */
export function getPrismResultsPrefix(): string {
    return getResultsStorePrefix();
}

export type ResultsListItem = Omit<PrismResultPayload, 'entries' | 'forked_from'> & {
    state: PrismSubmissionState;
    forked_from?: PrismResultPayload['forked_from'] | boolean;
    experiment_id?: string | null;
    experiment_label?: string | null;
    baseline_run_id?: string | null;
    dco_signoff?: PrismResultPayload['dco_signoff'];
    agent_provenance?: PrismResultPayload['agent_provenance'];
    pii_scrub_summary?: PrismResultPayload['pii_scrub_summary'];
};

export interface ListResultsOptions {
    limit: number;
    pageToken?: string;
    statusFilter?: PrismSubmissionState | null;
    ownFilter?: boolean;
    experimentId?: string | null;
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
    } catch {
        return { gcsToken: '', skipCount: 0 };
    }
}

/**
 * Lists benchmark results from Google Cloud Storage, applying status, user ownership filters,
 * experimentId campaign filter, and user permission authorization checks.
 */
export async function listResults(options: ListResultsOptions): Promise<ListResultsResult> {
    if (isS3ResultsStore()) return (await s3Store()).list(options);
    const { limit, pageToken, statusFilter, ownFilter, experimentId, username, permission } = options;
    const normalizedExperimentId = experimentId && experimentId.trim() ? experimentId.trim() : null;
    const { gcsToken, skipCount } = pageToken ? decodePageToken(pageToken) : { gcsToken: '', skipCount: 0 };

    const bucket = getPrismResultsBucket();
    const resultsPrefix = getPrismResultsPrefix();

    // Visibility rules are shared with every storage backend (see listFilters.ts).
    const matchesFilters = buildListFilters({ statusFilter, ownFilter, experimentId, username, permission });

    // Construct single query filter parameter if possible as GCS side optimization
    let gcsFilter: string | undefined;
    if (ownFilter && username) {
        gcsFilter = `contexts."github_user"="${username}"`;
    } else if (normalizedExperimentId) {
        gcsFilter = `contexts."experiment_id"="${encodeContextValue(normalizedExperimentId)}"`;
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
            prefix: resultsPrefix,
            maxResults,
            pageToken: currentGcsToken || undefined,
            autoPaginate: false,
            filter: gcsFilter
        });

        let i = currentSkipCount;
        for (; i < files.length && matchedItems.length < limit; i++) {
            const file = files[i];

            if (!file.name.startsWith(resultsPrefix) || !file.name.endsWith('.v1.json')) {
                continue;
            }

            const metadata = file.metadata;
            const customContexts = metadata?.contexts?.custom || {};
            const itemUser = String(customContexts.github_user?.value || '');
            const itemState = (customContexts.submission_state?.value || 'submitted_pending_processing') as PrismSubmissionState;

            if (!matchesFilters(itemState, itemUser)) {
                continue;
            }

            const itemExperimentId = decodeContextValue(String(customContexts.experiment_id?.value || ''));
            if (normalizedExperimentId && itemExperimentId !== normalizedExperimentId) {
                continue;
            }

            const itemExperimentLabel = decodeContextValue(String(customContexts.experiment_label?.value || ''));
            const itemBaselineRunId = decodeContextValue(String(customContexts.baseline_run_id?.value || ''));

            const relativePath = file.name.slice(resultsPrefix.length);
            const runIdMatch = relativePath.match(/^([^/]+)\.v1\.json$/);
            const runId = runIdMatch ? runIdMatch[1] : String(customContexts.run_id?.value || '');
            const runLabel = decodeContextValue(String(customContexts.run_label?.value || runId));
            const model_name = decodeContextValue(String(customContexts.model_name?.value || 'Unknown'));
            const hardware_name = decodeContextValue(String(customContexts.hardware_name?.value || 'Unknown'));
            const feedback = decodeContextValue(String(customContexts.feedback?.value || ''));
            const rawRequestedReviewers = decodeContextValue(String(customContexts.requested_reviewers?.value || ''));
            const requestedReviewers = rawRequestedReviewers ? normalizeReviewers(rawRequestedReviewers) : [];
            const well_lit_path = decodeContextValue(String(customContexts.well_lit_path?.value || ''));

            const isForked = customContexts.forked?.value === 'true' || customContexts.forked_from?.value !== undefined;

            const rawAccCount = customContexts.accelerator_count?.value;
            const parsedAccCount = rawAccCount ? parseInt(String(rawAccCount), 10) : NaN;
            const accelerator_count = !isNaN(parsedAccCount) && parsedAccCount > 0 ? parsedAccCount : 1;

            matchedItems.push({
                runId,
                runLabel,
                model_name,
                hardware: {
                    hardware_name,
                    accelerator_count
                },
                format: 'brv02',
                state: itemState,
                github_author: {
                    username: itemUser || 'Unknown'
                },
                submitted_at: metadata?.timeCreated || metadata?.updated || null,
                feedback: feedback || undefined,
                requested_reviewers: requestedReviewers.length > 0 ? requestedReviewers : undefined,
                well_lit_path: well_lit_path || undefined,
                forked: isForked || undefined,
                forked_from: isForked ? true : undefined,
                experiment_id: itemExperimentId || undefined,
                experiment_label: itemExperimentLabel || undefined,
                baseline_run_id: itemBaselineRunId || undefined
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
    if (isS3ResultsStore()) return (await s3Store()).readPayload(runId);
    const bucketName = getPrismResultsBucket();
    const objectName = getResultsStoreObjectPath(runId);
    const file = storage.bucket(bucketName).file(objectName);
    const [contents] = await file.download();
    return JSON.parse(contents.toString('utf8')) as PrismResultPayload;
}

/**
 * Fetches GCS metadata for a single benchmark result run bundle to check ownership and state.
 */
export async function readResultMetadata(runId: string): Promise<{ user: string; state: PrismSubmissionState } | null> {
    if (isS3ResultsStore()) return (await s3Store()).readMetadata(runId);
    const bucketName = getPrismResultsBucket();
    const objectName = getResultsStoreObjectPath(runId);
    const file = storage.bucket(bucketName).file(objectName);
    try {
        const [metadata] = await file.getMetadata();
        const customContexts = metadata.contexts?.custom || {};
        return {
            user: String(customContexts.github_user?.value || ''),
            state: (customContexts.submission_state?.value || 'submitted_pending_processing') as PrismSubmissionState
        };
    } catch (e: unknown) {
        if (e && typeof e === 'object' && 'code' in e && (e as { code?: number }).code === 404) return null;
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(`Failed to fetch metadata from GCS: ${message}`);
    }
}

export async function writeResult(
    runId: string,
    payload: PrismResultPayload,
    submissionState: PrismSubmissionState,
    githubUser: string
): Promise<void> {
    if (isS3ResultsStore()) return (await s3Store()).write(runId, payload, submissionState, githubUser);
    const bucketName = getPrismResultsBucket();
    const objectName = getResultsStoreObjectPath(runId);
    const file = storage.bucket(bucketName).file(objectName);

    const contextsCustom: PrismResultContext = {
        submission_state: { value: submissionState },
        github_user: { value: githubUser },
        run_id: { value: runId },
        hardware_name: { value: encodeContextValue(payload.hardware?.hardware_name || 'Unknown') },
        model_name: { value: encodeContextValue(payload.model_name || 'Unknown') },
        run_label: { value: encodeContextValue(payload.runLabel || runId) }
    };

    if (typeof payload.hardware?.accelerator_count === 'number') {
        contextsCustom.accelerator_count = { value: String(payload.hardware.accelerator_count) };
    }

    if (payload.feedback) {
        contextsCustom.feedback = { value: encodeContextValue(payload.feedback) };
    }

    if (Array.isArray(payload.requested_reviewers) && payload.requested_reviewers.length > 0) {
        const sanitizedReviewers = normalizeReviewers(payload.requested_reviewers);
        if (sanitizedReviewers.length > 0) {
            contextsCustom.requested_reviewers = { value: encodeContextValue(sanitizedReviewers.join(',')) };
        }
    }

    if (payload.well_lit_path) {
        contextsCustom.well_lit_path = { value: encodeContextValue(payload.well_lit_path) };
    }

    if (payload.forked_from || payload.forked) {
        contextsCustom.forked = { value: 'true' };
    }

    if (payload.experiment_id) {
        contextsCustom.experiment_id = { value: encodeContextValue(payload.experiment_id) };
    }

    if (payload.experiment_label) {
        contextsCustom.experiment_label = { value: encodeContextValue(payload.experiment_label) };
    }

    if (payload.baseline_run_id) {
        contextsCustom.baseline_run_id = { value: payload.baseline_run_id };
    }

    if (isPlaygroundMode() || payload.github_author?.playground) {
        contextsCustom.playground_submitted = { value: 'true' };
    }

    try {
        await file.save(JSON.stringify(payload), {
            contentType: 'application/json',
            metadata: {
                contexts: {
                    custom: contextsCustom
                }
            }
        });
    } catch (e: unknown) {
        console.error('[Results GCS Error details]:', e);
        let message = '';
        if (e instanceof Error) {
            message = e.message;
        } else if (e && typeof e === 'object') {
            try {
                message = JSON.stringify(e);
            } catch {
                message = String(e);
            }
        } else {
            message = String(e);
        }
        throw new Error(`GCS upload failed: ${message}`);
    }
}

/**
 * Deletes a benchmark result bundle from Google Cloud Storage by its runId.
 */
export async function deleteResult(runId: string): Promise<void> {
    if (isS3ResultsStore()) return (await s3Store()).delete(runId);
    const bucketName = getPrismResultsBucket();
    const objectName = getResultsStoreObjectPath(runId);
    const file = storage.bucket(bucketName).file(objectName);
    try {
        await file.delete();
    } catch (e: unknown) {
        if (e && typeof e === 'object' && 'code' in e && (e as { code?: number }).code === 404) return;
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(`Failed to delete result from GCS: ${message}`);
    }
}

