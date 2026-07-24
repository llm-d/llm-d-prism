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
 * Extracts the canonical bucket name from a bucket string or object.
 * e.g., "gs://slabe-bucket/" -> "slabe-bucket"
 *       "s3://my-bucket" -> "my-bucket"
 *       { bucket: "gs://slabe-bucket/", alias: "slabe" } -> "slabe-bucket"
 *
 * @param {string|object} entry
 * @returns {string}
 */
export function getCanonicalBucketName(entry) {
    if (!entry) return '';
    const raw = typeof entry === 'string' ? entry : (entry.bucket || '');
    return raw
        .trim()
        .replace(/^(gs:\/\/|s3:\/\/|https?:\/\/)/i, '')
        .replace(/\/+$/, '')
        .trim();
}

/**
 * Extracts the custom alias from a bucket string or object, if present and non-empty.
 *
 * @param {string|object} entry
 * @returns {string|null}
 */
export function getBucketAlias(entry) {
    if (typeof entry === 'object' && entry !== null && entry.alias) {
        const alias = String(entry.alias).trim();
        if (alias) return alias;
    }
    return null;
}

/**
 * Deduplicates an array of bucket configs based on canonical bucket name (URL scheme agnostic).
 * Preserves user custom aliases if available across duplicate entries.
 *
 * @param {Array<string|object>} configs
 * @returns {Array<string|object>}
 */
export function dedupeBucketConfigs(configs) {
    if (!Array.isArray(configs)) return [];

    const map = new Map();

    for (const entry of configs) {
        const canonical = getCanonicalBucketName(entry);
        if (!canonical) continue;

        const alias = getBucketAlias(entry);

        if (!map.has(canonical)) {
            if (alias && alias !== canonical) {
                map.set(canonical, { bucket: canonical, alias });
            } else {
                map.set(canonical, canonical);
            }
        } else {
            // If existing entry has no alias, but this duplicate entry has a custom alias, upgrade it
            const existing = map.get(canonical);
            const existingAlias = getBucketAlias(existing);

            if ((!existingAlias || existingAlias === canonical) && alias && alias !== canonical) {
                map.set(canonical, { bucket: canonical, alias });
            }
        }
    }

    return Array.from(map.values());
}
