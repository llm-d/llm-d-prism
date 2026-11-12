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
 * Results Store backend selection: RESULTS_STORE_BACKEND=gcs (default) or s3. The S3
 * settings are documented in the README ("Results Store on S3-compatible storage").
 *
 * This module does not import the store implementation, so iam.ts, gcs.ts and
 * server.js can all import it without creating an import cycle.
 */

import { parseBucketEntry, DEFAULT_RESULTS_STORE_PREFIX } from '../buckets.js';

export function isS3ResultsStore(): boolean {
    return String(process.env.RESULTS_STORE_BACKEND || '').trim().toLowerCase() === 's3';
}

/**
 * A storage error with a definite HTTP status: 503 when the S3 backend is selected but
 * not configured, 400 when a payload cannot be stored.
 */
export class ResultsStoreError extends Error {
    readonly statusCode: 400 | 503;
    constructor(message: string, statusCode: 400 | 503) {
        super(message);
        this.name = 'ResultsStoreError';
        this.statusCode = statusCode;
    }
}

export interface S3ResultsStoreLocation {
    bucket: string;
    prefix: string;
    endpoint: string | undefined;
    region: string;
    forcePathStyle: boolean;
}

/** Resolves the S3 Results Store location from the environment. */
export function resolveS3ResultsStore(): { ok: true; location: S3ResultsStoreLocation } | { ok: false; reason: string } {
    // Unlike GCS, there is no fallback to DEFAULT_BUCKETS or a default bucket name.
    const { bucket, prefix } = parseBucketEntry(process.env.RESULTS_STORE_BUCKET || '');
    if (!bucket) {
        return { ok: false, reason: 'RESULTS_STORE_BUCKET is not set.' };
    }
    return {
        ok: true,
        location: {
            bucket,
            prefix: prefix || DEFAULT_RESULTS_STORE_PREFIX,
            endpoint: String(process.env.RESULTS_STORE_S3_ENDPOINT || '').trim() || undefined,
            region: String(process.env.RESULTS_STORE_S3_REGION || '').trim() || 'us-east-1',
            forcePathStyle: String(process.env.RESULTS_STORE_S3_FORCE_PATH_STYLE || '').trim().toLowerCase() === 'true',
        },
    };
}

/** HTTP status for a storage error: a ResultsStoreError's own status, else `fallback`. */
export function storageErrorStatus(error: unknown, fallback: number): number {
    return error instanceof ResultsStoreError ? error.statusCode : fallback;
}
