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
 * Converts a glob pattern containing `*` and `?` wildcards into a RegExp pattern string.
 * All regex special characters except `*` and `?` are escaped.
 * Multiple consecutive asterisks (e.g. `**`) are collapsed to a single `.*`.
 *
 * @param {string} pattern - The glob search pattern.
 * @returns {string} The regular expression pattern string.
 */
export function globToRegexPattern(pattern) {
    if (!pattern) return '';

    // Step 1: Escape regex special characters except '*' and '?'
    // Special regex characters: \ ^ $ . + ( ) [ ] { } |
    const escaped = pattern.replace(/[\\^$.+()[\]{}|]/g, '\\$&');

    // Step 2: Convert glob wildcards to regex equivalents
    // - One or more '*' -> '.*'
    // - '?' -> '.'
    return escaped
        .replace(/\*+/g, '.*')
        .replace(/\?/g, '.');
}

/**
 * Creates a reusable matcher function for a given glob pattern.
 * Supports simple `*` (zero or more characters) and `?` (single character) wildcard syntax.
 * Matches anywhere in the target string (unanchored, case-insensitive by default).
 *
 * @param {string} pattern - The glob search term.
 * @param {Object} [options]
 * @param {boolean} [options.caseSensitive=false] - Whether matching should be case-sensitive.
 * @returns {(target: any) => boolean} Matcher function returning true if target matches.
 */
export function createGlobMatcher(pattern, { caseSensitive = false } = {}) {
    const trimmed = (pattern || '').trim();
    if (!trimmed) {
        return () => true;
    }

    try {
        const regexStr = globToRegexPattern(trimmed);
        const flags = caseSensitive ? '' : 'i';
        const regex = new RegExp(regexStr, flags);

        return (target) => {
            if (target === null || target === undefined) return false;
            return regex.test(String(target));
        };
    } catch {
        // Fallback to substring matching if regex creation fails
        const lowerPattern = trimmed.toLowerCase();
        return (target) => {
            if (target === null || target === undefined) return false;
            return String(target).toLowerCase().includes(lowerPattern);
        };
    }
}

/**
 * Convenience helper to test if a target string matches a glob pattern.
 *
 * @param {string} pattern - Glob search pattern with * and ?
 * @param {any} target - Target string or value to test
 * @param {Object} [options]
 * @returns {boolean}
 */
export function matchesGlob(pattern, target, options) {
    return createGlobMatcher(pattern, options)(target);
}

/**
 * Checks if a benchmark stat or entry matches a search query using glob syntax.
 *
 * @param {Object} stat - Benchmark stat or entry object.
 * @param {string|Function} search - The search term string or a pre-compiled matcher function.
 * @returns {boolean}
 */
export function matchesBenchmarkStat(stat, search) {
    if (!stat) return false;
    if (!search) return true;

    const matcher = typeof search === 'function' ? search : createGlobMatcher(search);

    // Primary benchmark metadata
    if (stat.model && matcher(stat.model)) return true;
    if (stat.model_name && matcher(stat.model_name)) return true;
    if (stat.hardware && matcher(stat.hardware)) return true;
    if (stat.configuration && matcher(stat.configuration)) return true;
    if (stat.runLabel && matcher(stat.runLabel)) return true;
    if (stat.benchmarkKey && matcher(stat.benchmarkKey)) return true;

    // Authorship and provenance
    if (stat.forked_from && matcher(stat.forked_from)) return true;
    if (stat.github_author?.username && matcher(stat.github_author.username)) return true;
    if (stat.github_author?.name && matcher(stat.github_author.name)) return true;

    // Source info
    if (stat.source && matcher(stat.source)) return true;
    if (stat.source_info?.origin && matcher(stat.source_info.origin)) return true;
    if (stat.source_info?.file_identifier && matcher(stat.source_info.file_identifier)) return true;

    // Underlying run data items if present
    if (Array.isArray(stat.data) && stat.data.length > 0) {
        for (const item of stat.data) {
            if (item.model && matcher(item.model)) return true;
            if (item.model_name && matcher(item.model_name)) return true;
            if (item.hardware && matcher(item.hardware)) return true;
            if (item.configuration && matcher(item.configuration)) return true;
            if (item.runLabel && matcher(item.runLabel)) return true;
            if (item.run_id && matcher(item.run_id)) return true;
            if (item.filename && matcher(item.filename)) return true;
            if (item.backend && matcher(item.backend)) return true;
            if (item.metadata?.model_name && matcher(item.metadata.model_name)) return true;
            if (item.metadata?.hardware && matcher(item.metadata.hardware)) return true;
            const itemTags = item.tags || item.metadata?.tags;
            if (Array.isArray(itemTags) && itemTags.some(t => matcher(t))) return true;
        }
    }

    return false;
}
