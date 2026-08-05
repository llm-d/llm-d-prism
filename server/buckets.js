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

export const DEFAULT_RESULTS_BUCKETS = 'llm-d-benchmarks-staging,llm-d-benchmarks';

/**
 * Parses a single DEFAULT_BUCKETS entry of the form "bucket" or
 * "bucket/path/to/dir" (optionally scheme-prefixed) into its bucket name
 * and normalized object prefix ("" or "path/to/dir/").
 *
 * @param {string} entry
 * @returns {{ bucket: string, prefix: string }}
 */
export function parseBucketEntry(entry) {
    const cleaned = String(entry || '')
        .trim()
        .replace(/^(gs|s3|https?):\/\//i, '')
        .replace(/\/+$/, '');
    const slashIdx = cleaned.indexOf('/');
    if (slashIdx === -1) {
        return { bucket: cleaned, prefix: '' };
    }
    const pathParts = cleaned.slice(slashIdx + 1).split('/').filter(Boolean);
    return {
        bucket: cleaned.slice(0, slashIdx),
        prefix: pathParts.length ? `${pathParts.join('/')}/` : ''
    };
}

/**
 * Returns the raw (trimmed) entries configured via DEFAULT_BUCKETS,
 * which may include "bucket/path" scoped entries.
 *
 * @param {string|undefined} rawBuckets - typically process.env.DEFAULT_BUCKETS
 * @returns {string[]}
 */
export function getConfiguredBucketEntries(rawBuckets) {
    const raw = rawBuckets || DEFAULT_RESULTS_BUCKETS;
    return raw.split(',').map(e => e.trim()).filter(Boolean);
}

/**
 * Returns the bucket names configured via DEFAULT_BUCKETS with any
 * "/path" scoping suffixes stripped. Use this wherever an entry must be
 * compared against or used as a plain GCS bucket name.
 *
 * @param {string|undefined} rawBuckets - typically process.env.DEFAULT_BUCKETS
 * @returns {string[]}
 */
export function getConfiguredBucketNames(rawBuckets) {
    return getConfiguredBucketEntries(rawBuckets)
        .map(e => parseBucketEntry(e).bucket)
        .filter(Boolean);
}
