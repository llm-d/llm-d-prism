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
 * S3-compatible Results Store (AWS S3, IBM Cloud Object Storage, MinIO, Ceph).
 *
 * Layout matches the GCS store: one JSON object per run at `<prefix><runId>.v1.json`.
 *
 * S3 user metadata is limited to 2 KB of ASCII header values, so it holds only the
 * short fields needed for authorization and listing (state, owner, submitted-at,
 * experiment id). Free-text values are encoded as 'e' + base64url(utf8), so arbitrary
 * input is always header-safe. Descriptive fields shown in lists (label, model,
 * hardware, feedback, ...) are read from the payload itself, which is never truncated.
 *
 * S3 cannot list objects together with their metadata. A list LISTs the prefix and
 * HEADs every run (that scan is reused for a few seconds, see summaryTtlMs), and reads
 * descriptive fields from a cache keyed by a revision id (`prism-rev`, a fresh UUID on
 * every write). The payload is re-read only when the revision changed, from a GET that
 * must carry the revision just authorized, so a list never pairs one version's state
 * with another version's content. ETag and LastModified are only a fallback revision
 * for objects Prism did not write: rewriting identical JSON keeps the ETag, and
 * LastModified has one-second resolution.
 */

import {
    S3Client,
    GetObjectCommand,
    HeadObjectCommand,
    HeadBucketCommand,
    PutObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { PrismSubmissionStateSchema, type PrismResultPayload, type PrismSubmissionState } from '../api.ts';
import type { ListResultsOptions, ListResultsResult, ResultsListItem } from '../gcs.ts';
import { buildListFilters } from '../listFilters.ts';
import { normalizeReviewers } from '../../../src/utils/benchmarkReportV02Parser.js';
import { mapLimit } from '../../../src/utils/mapLimit.js';
import { ResultsStoreError, type S3ResultsStoreLocation } from '../backend.ts';
import { randomUUID } from 'crypto';

/**
 * Network timeouts. The SDK default has no connect timeout, so an endpoint IP that
 * stops accepting connections stalls each attempt for the OS TCP timeout (minutes).
 * With these, a dead address fails within seconds and the SDK's retries can reach a
 * working one. socketTimeout (idle) is used rather than requestTimeout: in this SDK,
 * requestTimeout only logs a warning, and it would also cap large uploads that are
 * still making progress.
 */
const S3_CONNECTION_TIMEOUT_MS = 5000;
const S3_SOCKET_TIMEOUT_MS = 30000;
/** Max time to read one response body once headers have arrived. */
const S3_BODY_TIMEOUT_MS = 60000;

/** Credentials come from the AWS SDK default chain (env vars, profile, or role). */
function createS3Client(location: Pick<S3ResultsStoreLocation, 'endpoint' | 'region' | 'forcePathStyle'>): S3Client {
    return new S3Client({
        endpoint: location.endpoint,
        region: location.region,
        forcePathStyle: location.forcePathStyle,
        requestHandler: {
            connectionTimeout: S3_CONNECTION_TIMEOUT_MS,
            socketTimeout: S3_SOCKET_TIMEOUT_MS,
        },
    });
}

interface S3Body {
    // eslint-disable-next-line no-unused-vars
    transformToString(encoding?: string): Promise<string>;
    destroy?: () => void;
}

/**
 * Reads a response body with a deadline. The socket timeout stops applying once
 * response headers arrive, so a body that stalls mid-transfer would otherwise hang
 * its request forever. On timeout the stream is destroyed, freeing the socket.
 */
export async function readS3Body(body: unknown, timeoutMs: number = S3_BODY_TIMEOUT_MS): Promise<string> {
    if (!body) throw new Error('S3 response has no body');
    const stream = body as S3Body;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            stream.destroy?.();
            reject(Object.assign(new Error(`S3 response body not received within ${timeoutMs} ms`), { name: 'TimeoutError' }));
        }, timeoutMs);
    });
    try {
        return await Promise.race([stream.transformToString('utf-8'), deadline]);
    } finally {
        clearTimeout(timer);
    }
}

/** Run ids the Results Store routes accept (UUID v1-5); other keys are never listed. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_SUFFIX = '.v1.json';

/** Default reuse window for one prefix scan (see S3ResultsStoreConfig.summaryTtlMs). */
const DEFAULT_SUMMARY_TTL_MS = 5000;
/** Max parallel HEAD/GET requests per list. */
const CONCURRENCY = 8;

export const META_KEYS = {
    revision: 'prism-rev',
    state: 'prism-state',
    user: 'prism-user',
    submittedAt: 'prism-submitted-at',
    experimentId: 'prism-experiment-id',
} as const;

/**
 * Per-value caps (characters, before encoding). They keep the total metadata under
 * S3's 2 KB limit even if every character takes 4 bytes in UTF-8.
 */
const META_VALUE_CAPS: Record<string, number> = {
    [META_KEYS.user]: 100,
    [META_KEYS.experimentId]: 128,
    [META_KEYS.submittedAt]: 40,
};

export function encodeMetaValue(val: string): string {
    return 'e' + Buffer.from(val, 'utf8').toString('base64url');
}

/** Values not written by encodeMetaValue decode to '' rather than being trusted. */
export function decodeMetaValue(val: string | undefined): string {
    return val?.startsWith('e') ? Buffer.from(val.substring(1), 'base64url').toString('utf8') : '';
}

/** Metadata keys come back in provider-specific casing; normalize to lowercase. */
function normalizeMetadata(meta: Record<string, string> | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(meta || {})) {
        out[k.toLowerCase()] = v;
    }
    return out;
}

function parseState(raw: string | undefined): PrismSubmissionState {
    const parsed = PrismSubmissionStateSchema.safeParse(raw);
    return parsed.success ? parsed.data : 'submitted_pending_processing';
}

/** A missing object (not a missing bucket, which is a configuration error). */
function isNotFound(e: unknown): boolean {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
    return !!err && err.name !== 'NoSuchBucket' && (err.$metadata?.httpStatusCode === 404 || err.name === 'NoSuchKey');
}

function notFoundError(runId: string): Error {
    const err = new Error(`Result ${runId} not found`) as Error & { code: number };
    err.code = 404;
    return err;
}

function describeError(e: unknown): string {
    // Node network errors (e.g. ECONNREFUSED) can have an empty message but a code, and
    // bodiless S3 errors (HEAD) a generic one, so the HTTP status is added when known.
    if (e instanceof Error) {
        const err = e as Error & { code?: string; $metadata?: { httpStatusCode?: number } };
        const status = err.$metadata?.httpStatusCode;
        return (err.message || err.code || err.name) + (status ? ` (HTTP ${status})` : '');
    }
    try {
        return JSON.stringify(e);
    } catch {
        return String(e);
    }
}

/**
 * Builds the metadata stored on a result object. Throws if a value exceeds its cap or
 * the total would exceed S3's metadata limit, so a write never fails half-way at the
 * provider with an opaque error.
 */
export function buildS3Metadata(
    payload: PrismResultPayload,
    state: PrismSubmissionState,
    user: string,
    submittedAt: string,
    revision: string = randomUUID()
): Record<string, string> {
    const raw: Record<string, string> = {
        [META_KEYS.state]: state,
        [META_KEYS.user]: user || '',
        [META_KEYS.submittedAt]: submittedAt,
    };
    if (payload.experiment_id) raw[META_KEYS.experimentId] = String(payload.experiment_id);

    const meta: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
        const cap = META_VALUE_CAPS[key];
        if (cap !== undefined && value.length > cap) {
            throw new ResultsStoreError(`Results Store metadata field '${key}' exceeds ${cap} characters.`, 400);
        }
        // State is a fixed ASCII enum; everything else is encoded.
        meta[key] = key === META_KEYS.state ? value : encodeMetaValue(value);
    }
    meta[META_KEYS.revision] = revision;
    return meta;
}

interface RunDetails {
    runLabel: string;
    model_name: string;
    hardware_name: string;
    accelerator_count: number;
    feedback: string;
    requested_reviewers: string[];
    well_lit_path: string;
    experiment_label: string;
    baseline_run_id: string;
    forked: boolean;
}

/** Cached in place of RunDetails for a revision whose payload cannot be parsed. */
const UNREADABLE = Symbol('unreadable');

interface RunSummary {
    revision: string;
    lastModified: string | null;
    user: string;
    state: PrismSubmissionState;
    submittedAt: string | null;
    experimentId: string;
}

export interface S3ResultsStoreConfig extends Partial<Pick<S3ResultsStoreLocation, 'endpoint' | 'region' | 'forcePathStyle'>> {
    bucket: string;
    prefix: string;
    /** Defaults to a client for endpoint/region/forcePathStyle. */
    client?: S3Client;
    /**
     * How long a finished prefix scan (LIST + a HEAD per run) is reused by later list
     * calls, so paging through N runs costs one scan instead of one per page. Concurrent
     * callers share a scan in progress. Local writes and deletes invalidate it at once;
     * changes made by other processes become visible within this window. 0 disables reuse
     * of finished scans.
     */
    summaryTtlMs?: number;
}

/** Revision id stored on every write; objects written by other tools fall back to ETag + LastModified. */
function revisionOf(meta: Record<string, string>, etag: unknown, lastModified: string | null): string {
    return meta[META_KEYS.revision] || `etag:${String(etag || '')}|${lastModified || ''}`;
}

/** Parses a stored payload; anything but a JSON object (null, an array, ...) is unreadable. */
function parsePayload(text: string): PrismResultPayload {
    const payload: unknown = JSON.parse(text);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('payload is not a JSON object');
    }
    return payload as PrismResultPayload;
}

function isoOrNull(d: Date | undefined): string | null {
    return d ? new Date(d).toISOString() : null;
}

export class S3ResultsStore {
    readonly bucket: string;
    readonly prefix: string;
    private readonly client: S3Client;
    private readonly summaryTtlMs: number;
    /** runId -> descriptive fields (or UNREADABLE) for one revision of the payload. */
    private readonly detailsCache = new Map<string, { revision: string; details: RunDetails | typeof UNREADABLE }>();
    /** The latest prefix scan; dropped by every local write/delete so it is never reused across one. */
    private scan: { doneAt: number | null; result: Promise<{ runId: string; summary: RunSummary }[]> } | null = null;

    constructor(config: S3ResultsStoreConfig) {
        this.bucket = config.bucket;
        this.prefix = config.prefix;
        this.client = config.client || createS3Client({
            endpoint: config.endpoint,
            region: config.region || 'us-east-1',
            forcePathStyle: !!config.forcePathStyle,
        });
        this.summaryTtlMs = config.summaryTtlMs ?? DEFAULT_SUMMARY_TTL_MS;
    }

    private objectKey(runId: string): string {
        return `${this.prefix}${runId}${OBJECT_SUFFIX}`;
    }

    /** Extracts the runId from a key, or null when the key is not a Results Store object. */
    private runIdFromKey(key: string): string | null {
        if (!key.startsWith(this.prefix) || !key.endsWith(OBJECT_SUFFIX)) return null;
        const id = key.slice(this.prefix.length, key.length - OBJECT_SUFFIX.length);
        return UUID_RE.test(id) ? id : null;
    }

    async readPayload(runId: string): Promise<PrismResultPayload> {
        try {
            const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(runId) }));
            return parsePayload(await readS3Body(out.Body));
        } catch (e) {
            if (isNotFound(e)) throw notFoundError(runId);
            throw new Error(`Failed to read result from S3: ${describeError(e)}`);
        }
    }

    async readMetadata(runId: string): Promise<{ user: string; state: PrismSubmissionState } | null> {
        const s = await this.summarize(runId);
        if (!s) await this.assertBucketReachable();
        return s && { user: s.user, state: s.state };
    }

    /** A HEAD 404 has no body, so a missing bucket would look like a missing run. */
    private async assertBucketReachable(): Promise<void> {
        try {
            await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
        } catch (e) {
            throw new Error(`Results Store bucket '${this.bucket}' is not reachable: ${describeError(e)}`);
        }
    }

    async write(runId: string, payload: PrismResultPayload, state: PrismSubmissionState, user: string): Promise<void> {
        // Keep the original submission time across state changes; S3 has no creation time.
        let submittedAt = typeof payload.submitted_at === 'string' && payload.submitted_at ? payload.submitted_at : '';
        if (!submittedAt) {
            submittedAt = (await this.summarize(runId))?.submittedAt || new Date().toISOString();
        }
        const metadata = buildS3Metadata(payload, state, user, submittedAt);
        try {
            await this.client.send(new PutObjectCommand({
                Bucket: this.bucket,
                Key: this.objectKey(runId),
                Body: JSON.stringify(payload),
                ContentType: 'application/json',
                Metadata: metadata,
            }));
        } catch (e) {
            console.error('[Results S3 Error details]:', describeError(e));
            throw new Error(`S3 upload failed: ${describeError(e)}`);
        }
        this.invalidate(runId);
    }

    /** A local write or delete: drop the run's cached details and any reusable scan. */
    private invalidate(runId: string): void {
        this.detailsCache.delete(runId);
        this.scan = null;
    }

    async delete(runId: string): Promise<void> {
        try {
            await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(runId) }));
        } catch (e) {
            if (!isNotFound(e)) {
                throw new Error(`Failed to delete result from S3: ${describeError(e)}`);
            }
        }
        this.invalidate(runId);
    }

    /** Reads an IAM allowlist file (e.g. prism-iam/github-admin-allowlist.txt). null if missing. */
    async readIamFile(objectPath: string): Promise<string | null> {
        try {
            const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectPath }));
            return await readS3Body(out.Body);
        } catch (e) {
            if (isNotFound(e)) return null;
            throw new Error(`Failed to fetch ${objectPath} from S3: ${describeError(e)}`);
        }
    }

    /** Lists the runIds of every Results Store object under the prefix. */
    private async listRunIds(): Promise<string[]> {
        const ids: string[] = [];
        let token: string | undefined;
        do {
            let out;
            try {
                out = await this.client.send(new ListObjectsV2Command({
                    Bucket: this.bucket,
                    Prefix: this.prefix,
                    ContinuationToken: token,
                }));
            } catch (e) {
                throw new Error(`Failed to list results in S3: ${describeError(e)}`);
            }
            for (const obj of out.Contents || []) {
                const runId = obj.Key ? this.runIdFromKey(obj.Key) : null;
                if (runId) ids.push(runId);
            }
            token = out.IsTruncated ? out.NextContinuationToken : undefined;
        } while (token);
        return ids;
    }

    /** Current metadata of one run (HEAD), or null if it no longer exists. */
    private async summarize(runId: string): Promise<RunSummary | null> {
        let out;
        try {
            out = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.objectKey(runId) }));
        } catch (e) {
            if (isNotFound(e)) return null;
            throw new Error(`Failed to fetch metadata from S3: ${describeError(e)}`);
        }
        const meta = normalizeMetadata(out.Metadata);
        const lastModified = isoOrNull(out.LastModified);
        return {
            revision: revisionOf(meta, out.ETag, lastModified),
            lastModified,
            user: decodeMetaValue(meta[META_KEYS.user]),
            state: parseState(meta[META_KEYS.state]),
            submittedAt: decodeMetaValue(meta[META_KEYS.submittedAt]) || null,
            experimentId: decodeMetaValue(meta[META_KEYS.experimentId]),
        };
    }

    /**
     * Descriptive fields for a run, consistent with `summary`. Returns null if the run
     * was deleted, or changed (another revision is now stored) since `summary` was
     * read — callers then re-check rather than mixing two versions.
     */
    private async details(runId: string, summary: RunSummary): Promise<RunDetails | null | typeof UNREADABLE> {
        const cached = this.detailsCache.get(runId);
        if (cached && cached.revision === summary.revision) return cached.details;

        let out;
        try {
            out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(runId) }));
        } catch (e) {
            if (isNotFound(e)) return null;
            throw new Error(`Failed to read result from S3: ${describeError(e)}`);
        }
        const revision = revisionOf(normalizeMetadata(out.Metadata), out.ETag, isoOrNull(out.LastModified));
        if (revision !== summary.revision) {
            // Release the unread response body so the connection returns to the pool.
            (out.Body as { destroy?: () => void } | undefined)?.destroy?.();
            return null;
        }

        // Transient read errors (timeouts, resets) propagate like any other storage error.
        const text = await readS3Body(out.Body);
        let payload: PrismResultPayload;
        try {
            payload = parsePayload(text);
        } catch (e) {
            // A corrupt object must not break the listing for everyone: skip it. Remembered
            // per revision, so it is fetched and logged once, not on every list.
            console.warn(`[Results S3] Skipping unreadable result ${runId}: ${describeError(e)}`);
            this.detailsCache.set(runId, { revision, details: UNREADABLE });
            return UNREADABLE;
        }
        const acc = Number(payload.hardware?.accelerator_count);
        const details: RunDetails = {
            runLabel: String(payload.runLabel || runId),
            model_name: String(payload.model_name || 'Unknown'),
            hardware_name: String(payload.hardware?.hardware_name || 'Unknown'),
            accelerator_count: Number.isFinite(acc) && acc > 0 ? Math.floor(acc) : 1,
            feedback: typeof payload.feedback === 'string' ? payload.feedback : '',
            requested_reviewers: Array.isArray(payload.requested_reviewers)
                ? normalizeReviewers(payload.requested_reviewers)
                : [],
            well_lit_path: typeof payload.well_lit_path === 'string' ? payload.well_lit_path : '',
            experiment_label: typeof payload.experiment_label === 'string' ? payload.experiment_label : '',
            baseline_run_id: typeof payload.baseline_run_id === 'string' ? payload.baseline_run_id : '',
            forked: !!(payload.forked_from || payload.forked),
        };
        this.detailsCache.set(runId, { revision, details });
        return details;
    }

    /**
     * Details for a run whose summary may be outdated by a concurrent write: re-reads
     * the summary and retries (bounded). Returns the summary the details belong to, or
     * null if the run disappeared or no longer matches.
     */
    private async consistentItem(
        runId: string,
        summary: RunSummary,
        // eslint-disable-next-line no-unused-vars
        stillMatches: (s: RunSummary) => boolean
    ): Promise<{ summary: RunSummary; details: RunDetails } | null> {
        let current: RunSummary | null = summary;
        for (let attempt = 0; attempt < 3 && current; attempt++) {
            if (!stillMatches(current)) return null;
            const d = await this.details(runId, current);
            if (d === UNREADABLE) return null;
            if (d) return { summary: current, details: d };
            current = await this.summarize(runId);
        }
        return null;
    }

    /**
     * LIST the prefix and HEAD every run. Reused for summaryTtlMs (concurrent callers
     * share one scan); never reused across a local write or delete.
     */
    private scanSummaries(): Promise<{ runId: string; summary: RunSummary }[]> {
        if (this.scan && (this.scan.doneAt === null || Date.now() - this.scan.doneAt < this.summaryTtlMs)) {
            return this.scan.result;
        }
        const result = (async () => {
            const ids = await this.listRunIds();
            const summaries = await mapLimit(ids, CONCURRENCY, async (runId) => {
                const summary = await this.summarize(runId);
                return summary ? { runId, summary } : null;
            });
            const idSet = new Set(ids);
            for (const runId of [...this.detailsCache.keys()]) {
                if (!idSet.has(runId)) this.detailsCache.delete(runId);
            }
            return summaries.filter((x): x is { runId: string; summary: RunSummary } => x !== null);
        })();
        const entry: NonNullable<typeof this.scan> = { doneAt: null, result };
        this.scan = entry;
        // The reuse window starts when the scan finishes; a failed scan is never reused.
        result.then(() => { entry.doneAt = Date.now(); }, () => { if (this.scan === entry) this.scan = null; });
        return result;
    }

    async list(options: ListResultsOptions): Promise<ListResultsResult> {
        const { limit, pageToken, experimentId } = options;
        const normalizedExperimentId = experimentId && experimentId.trim() ? experimentId.trim() : null;
        const after = decodeCursor(pageToken);
        const visible = buildListFilters(options);
        const matches = (e: RunSummary) =>
            visible(e.state, e.user) && (!normalizedExperimentId || e.experimentId === normalizedExperimentId);

        const summaries = await this.scanSummaries();

        // Stable order: newest submission first, runId as tie-breaker. Pages continue
        // strictly after the last run considered (keyset cursor), so runs added or
        // removed between requests never shift later pages.
        const sortKey = (x: { runId: string; summary: RunSummary }) => ({
            t: x.summary.submittedAt || x.summary.lastModified || '',
            id: x.runId,
        });
        const candidates = summaries
            .filter(x => matches(x.summary))
            .sort((a, b) => compareKeys(sortKey(a), sortKey(b)))
            .filter(x => !after || compareKeys(sortKey(x), after) > 0);

        // Fill the page; runs that change or vanish while being read are skipped and
        // the next candidates take their place.
        const items: ResultsListItem[] = [];
        let consumed = 0;
        while (items.length < limit && consumed < candidates.length) {
            const batch = candidates.slice(consumed, consumed + (limit - items.length));
            consumed += batch.length;
            const resolved = await mapLimit(batch, CONCURRENCY, ({ runId, summary }) =>
                this.consistentItem(runId, summary, matches).then(r => (r ? { runId, ...r } : null)));
            for (const r of resolved) {
                if (!r) continue;
                const { runId, summary: e, details: d } = r;
                items.push({
                    runId,
                    runLabel: d.runLabel,
                    model_name: d.model_name,
                    hardware: { hardware_name: d.hardware_name, accelerator_count: d.accelerator_count },
                    format: 'brv02',
                    state: e.state,
                    github_author: { username: e.user || 'Unknown' },
                    submitted_at: e.submittedAt || e.lastModified || null,
                    feedback: d.feedback || undefined,
                    requested_reviewers: d.requested_reviewers.length > 0 ? d.requested_reviewers : undefined,
                    well_lit_path: d.well_lit_path || undefined,
                    forked: d.forked || undefined,
                    forked_from: d.forked ? true : undefined,
                    experiment_id: e.experimentId || undefined,
                    experiment_label: d.experiment_label || undefined,
                    baseline_run_id: d.baseline_run_id || undefined,
                } as ResultsListItem);
            }
        }

        const hasMore = consumed < candidates.length;
        return {
            items,
            nextPageToken: hasMore && consumed > 0 ? encodeCursor(sortKey(candidates[consumed - 1])) : null,
        };
    }

}


interface Cursor { t: string; id: string }

/** Newest first (descending t), then ascending runId. */
function compareKeys(a: Cursor, b: Cursor): number {
    if (a.t !== b.t) return a.t < b.t ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function encodeCursor(c: Cursor): string {
    return Buffer.from(JSON.stringify({ s3After: c })).toString('base64');
}

function decodeCursor(token: string | undefined): Cursor | null {
    if (!token) return null;
    try {
        const parsed = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
        const c = parsed?.s3After;
        return c && typeof c.t === 'string' && typeof c.id === 'string' ? { t: c.t, id: c.id } : null;
    } catch {
        return null;
    }
}
