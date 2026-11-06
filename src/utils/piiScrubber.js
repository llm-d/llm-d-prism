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
 * Isomorphic PII and Sensitive Data Scrubber for Prism Results Store bundles.
 *
 * Redacts API/cloud/HF/GitHub tokens, PEM private keys, user home directory paths,
 * corporate/internal hostnames, RFC1918 private IPv4 addresses, and email addresses
 * across raw text, nested JSON/YAML objects, and base64-encoded Data-URI manifests.
 */

const SENSITIVE_KEY_PATTERN = /(?:^|_|-)(?:token|secret|password|passwd|api_key|apikey|access_key|private_key|credentials|authorization|cookie|hf_token)(?:$|_|-)/i;

const DEFAULT_ALLOW_EMAIL_PATHS = [
    'dco_signoff.signed_off_by',
    'github_author',
    'requested_reviewers',
];

function decodeBase64Utf8(base64Str) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.Buffer !== 'undefined') {
        return globalThis.Buffer.from(base64Str, 'base64').toString('utf-8');
    }
    return decodeURIComponent(escape(atob(base64Str)));
}

function encodeBase64Utf8(text) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.Buffer !== 'undefined') {
        return globalThis.Buffer.from(text, 'utf-8').toString('base64');
    }
    return btoa(unescape(encodeURIComponent(text)));
}

function makePreview(matchStr) {
    const s = String(matchStr || '');
    if (s.length <= 8) return '***';
    return `${s.slice(0, 4)}...${s.slice(-2)}`;
}

function isEmailAllowedAtPath(pathStr, allowEmailPaths = DEFAULT_ALLOW_EMAIL_PATHS) {
    if (!pathStr) return false;
    const normalized = pathStr.replace(/\[\d+\]/g, '');
    for (const allowed of allowEmailPaths) {
        if (
            normalized === allowed ||
            normalized.startsWith(`${allowed}.`) ||
            normalized.endsWith(`.${allowed}`) ||
            normalized.includes(`.${allowed}.`)
        ) {
            return true;
        }
    }
    return false;
}

/**
 * Scrubs sensitive secrets and PII from a plain string.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {boolean} [options.allowEmails=false]
 * @returns {{ text: string, findings: Array<{ category: string, matchPreview: string, count: number }> }}
 */
export function scrubTextPii(text, options = {}) {
    if (typeof text !== 'string' || text.length === 0) {
        return { text: typeof text === 'string' ? text : '', findings: [] };
    }

    const { allowEmails = false } = options;
    let current = text;
    const categoryStats = new Map();

    const recordMatch = (category, matchStr) => {
        const existing = categoryStats.get(category);
        if (existing) {
            existing.count += 1;
        } else {
            categoryStats.set(category, {
                category,
                matchPreview: makePreview(matchStr),
                count: 1,
            });
        }
    };

    // 1. Secret rules
    // 1a. PEM private keys
    current = current.replace(
        /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
        (match) => {
            recordMatch('secret', match);
            return '[REDACTED_PRIVATE_KEY]';
        }
    );

    // 1b. HuggingFace tokens
    current = current.replace(/\bhf_[A-Za-z0-9]{16,}\b/g, (match) => {
        recordMatch('secret', match);
        return '[REDACTED_SECRET]';
    });

    // 1c. GitHub tokens (classic ghp/gho/ghu/ghs/ghr & fine-grained github_pat_)
    current = current.replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, (match) => {
        recordMatch('secret', match);
        return '[REDACTED_SECRET]';
    });
    current = current.replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, (match) => {
        recordMatch('secret', match);
        return '[REDACTED_SECRET]';
    });

    // 1d. GitLab tokens (glpat-)
    current = current.replace(/\bglpat-[A-Za-z0-9\-_]{20,}\b/g, (match) => {
        recordMatch('secret', match);
        return '[REDACTED_SECRET]';
    });

    // 1e. Google API keys & OAuth tokens
    current = current.replace(/\bAIza[0-9A-Za-z\-_]{35}\b/g, (match) => {
        recordMatch('secret', match);
        return '[REDACTED_SECRET]';
    });
    current = current.replace(/\bya29\.[0-9A-Za-z\-_]{20,}\b/g, (match) => {
        recordMatch('secret', match);
        return '[REDACTED_SECRET]';
    });

    // 1f. AWS Access Key IDs
    current = current.replace(/\bAKIA[0-9A-Z]{16}\b/g, (match) => {
        recordMatch('secret', match);
        return '[REDACTED_SECRET]';
    });

    // 1g. OpenAI / Anthropic / generic sk- tokens
    current = current.replace(/\bsk-[A-Za-z0-9\-_]{20,}\b/g, (match) => {
        recordMatch('secret', match);
        return '[REDACTED_SECRET]';
    });

    // 1h. Bearer tokens in Authorization headers
    current = current.replace(
        /Bearer\s+(?!\[REDACTED_SECRET\])([A-Za-z0-9\-._~+/]+=*)/g,
        (match, tokenPart) => {
            recordMatch('secret', tokenPart);
            return 'Bearer [REDACTED_SECRET]';
        }
    );

    // 1i. Inline key-value secret assignments in YAML / env / CLI flags
    current = current.replace(
        /((?:HF_TOKEN|GITHUB_TOKEN|API_KEY|SECRET_KEY|ACCESS_TOKEN|PASSWORD|PRIVATE_KEY|AWS_SECRET_ACCESS_KEY|OPENAI_API_KEY)\s*[:=]\s*["']?)([^\s"'\n]+)(["']?)/gi,
        (match, prefix, secretVal, suffix) => {
            if (secretVal === '[REDACTED_SECRET]' || secretVal === '[REDACTED_PRIVATE_KEY]') {
                return match;
            }
            recordMatch('secret', secretVal);
            return `${prefix}[REDACTED_SECRET]${suffix}`;
        }
    );

    // 2. Home & workspace paths
    current = current.replace(/\/google\/src\/cloud\/[A-Za-z0-9._-]+\//g, (match) => {
        recordMatch('home_path', match);
        return '$WORKSPACE/';
    });
    current = current.replace(/\/Users\/[A-Za-z0-9._-]+\//g, (match) => {
        recordMatch('home_path', match);
        return '$HOME/';
    });
    current = current.replace(/\/home\/[A-Za-z0-9._-]+\//g, (match) => {
        recordMatch('home_path', match);
        return '$HOME/';
    });

    // 5. Email addresses (run before internal_host so user@corp.google.com is redacted as a complete email)
    if (!allowEmails) {
        current = current.replace(
            /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
            (match) => {
                recordMatch('email', match);
                return '[REDACTED_EMAIL]';
            }
        );
    }

    // 3. Internal corporate / cluster hostnames
    current = current.replace(
        /\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+(?:corp\.google\.com|c\.googlers\.com|googleplex\.com|svc\.cluster\.local|pod\.cluster\.local|internal)\b/gi,
        (match) => {
            if (allowEmails) {
                return match;
            }
            recordMatch('internal_host', match);
            return '[REDACTED_INTERNAL_HOST]';
        }
    );

    // 4. RFC1918 Private IPv4 addresses
    // Use lookbehind/lookahead so version strings like v10.0.0.1 or 1.10.0.0.1 aren't matched
    current = current.replace(
        /(?<![0-9A-Za-z.])(?:10\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)|192\.168\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)|172\.(?:1[6-9]|2\d|3[0-1])\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))(?![0-9.])/g,
        (match) => {
            recordMatch('private_ip', match);
            return '[REDACTED_PRIVATE_IP]';
        }
    );

    return {
        text: current,
        findings: Array.from(categoryStats.values()),
    };
}

/**
 * Deep-clones and recursively scrubs an object or array for PII and sensitive secrets.
 *
 * @param {any} obj
 * @param {object} [options]
 * @param {string[]} [options.allowEmailPaths]
 * @param {boolean} [options.allowEmails=false]
 * @returns {{
 *   data: any,
 *   piiReport: {
 *     scrubbed: boolean,
 *     scrubbed_at: string,
 *     scrubbedAt: string,
 *     total_redactions: number,
 *     totalRedactions: number,
 *     categories: Record<string, number>,
 *     findings: Array<{ category: string, path: string, count: number, matchPreview?: string }>
 *   }
 * }}
 */
export function scrubObjectPii(obj, options = {}) {
    const allowEmailPaths = Array.isArray(options.allowEmailPaths)
        ? [...DEFAULT_ALLOW_EMAIL_PATHS, ...options.allowEmailPaths]
        : DEFAULT_ALLOW_EMAIL_PATHS;

    const categories = {};
    const findings = [];
    let totalRedactions = 0;

    const addFinding = (category, pathStr, count, matchPreview) => {
        if (!count || count <= 0) return;
        totalRedactions += count;
        categories[category] = (categories[category] || 0) + count;
        findings.push({
            category,
            path: pathStr || '$',
            count,
            ...(matchPreview ? { matchPreview } : {}),
        });
    };

    const traverse = (value, currentPath, parentKey = '') => {
        if (value === null || value === undefined) {
            return value;
        }

        if (typeof value === 'string') {
            // Check if parent property key is a sensitive secret key
            if (
                parentKey &&
                SENSITIVE_KEY_PATTERN.test(parentKey) &&
                value.trim() !== '' &&
                value !== '[REDACTED_SECRET]' &&
                value !== '[REDACTED_PRIVATE_KEY]'
            ) {
                addFinding('secret', currentPath, 1, makePreview(value));
                return '[REDACTED_SECRET]';
            }

            // Check if string is a base64 Data-URI (e.g. data:text/yaml;base64,...)
            if (value.startsWith('data:') && value.includes(';base64,')) {
                const commaIdx = value.indexOf(',');
                if (commaIdx !== -1) {
                    const header = value.slice(0, commaIdx); // e.g., data:text/yaml;base64
                    const rawB64 = value.slice(commaIdx + 1);
                    try {
                        const decoded = decodeBase64Utf8(rawB64);
                        const allowEmailsHere = Boolean(options.allowEmails) || isEmailAllowedAtPath(currentPath, allowEmailPaths);
                        const scrubbedRes = scrubTextPii(decoded, { ...options, allowEmails: allowEmailsHere });
                        if (scrubbedRes.findings.length > 0) {
                            for (const f of scrubbedRes.findings) {
                                addFinding(f.category, currentPath, f.count, f.matchPreview);
                            }
                            const reencoded = encodeBase64Utf8(scrubbedRes.text);
                            return `${header},${reencoded}`;
                        }
                        return value;
                    } catch {
                        // Fall through to normal text scrubbing if invalid base64
                    }
                }
            }

            // Also handle percent-encoded Data-URIs (e.g. data:application/x-yaml;charset=utf-8,...)
            if (value.startsWith('data:') && !value.includes(';base64,')) {
                const commaIdx = value.indexOf(',');
                if (commaIdx !== -1) {
                    const header = value.slice(0, commaIdx);
                    const rawPayload = value.slice(commaIdx + 1);
                    try {
                        const decoded = decodeURIComponent(rawPayload);
                        const allowEmailsHere = Boolean(options.allowEmails) || isEmailAllowedAtPath(currentPath, allowEmailPaths);
                        const scrubbedRes = scrubTextPii(decoded, { ...options, allowEmails: allowEmailsHere });
                        if (scrubbedRes.findings.length > 0) {
                            for (const f of scrubbedRes.findings) {
                                addFinding(f.category, currentPath, f.count, f.matchPreview);
                            }
                            return `${header},${encodeURIComponent(scrubbedRes.text)}`;
                        }
                        return value;
                    } catch {
                        // Fall through
                    }
                }
            }

            const allowEmailsHere = Boolean(options.allowEmails) || isEmailAllowedAtPath(currentPath, allowEmailPaths);
            const scrubbedRes = scrubTextPii(value, { ...options, allowEmails: allowEmailsHere });
            if (scrubbedRes.findings.length > 0) {
                for (const f of scrubbedRes.findings) {
                    addFinding(f.category, currentPath, f.count, f.matchPreview);
                }
            }
            return scrubbedRes.text;
        }

        if (Array.isArray(value)) {
            return value.map((item, idx) => {
                const itemPath = currentPath ? `${currentPath}[${idx}]` : `[${idx}]`;
                return traverse(item, itemPath, '');
            });
        }

        if (typeof value === 'object') {
            if (value instanceof Date) {
                return new Date(value.getTime());
            }
            const out = {};
            for (const [k, v] of Object.entries(value)) {
                if (k === 'pii_scrub_summary') {
                    out[k] = v;
                    continue;
                }
                const nextPath = currentPath ? `${currentPath}.${k}` : k;
                out[k] = traverse(v, nextPath, k);
            }
            return out;
        }

        return value;
    };

    const scrubbedClone = traverse(obj, '', '');
    const scrubbedAt = new Date().toISOString();

    return {
        data: scrubbedClone,
        piiReport: {
            scrubbed: true,
            scrubbed_at: scrubbedAt,
            scrubbedAt,
            total_redactions: totalRedactions,
            totalRedactions,
            categories,
            findings,
        },
    };
}

/**
 * Scrubs a full Prism Run Bundle payload and attaches `bundle.pii_scrub_summary`.
 *
 * @param {object} bundle
 * @param {object} [options]
 * @returns {{ bundle: object, piiReport: object }}
 */
export function scrubBundlePii(bundle, options = {}) {
    if (!bundle || typeof bundle !== 'object') {
        const now = new Date().toISOString();
        const emptyReport = {
            scrubbed: true,
            scrubbed_at: now,
            scrubbedAt: now,
            total_redactions: 0,
            totalRedactions: 0,
            categories: {},
            findings: [],
        };
        return { bundle, piiReport: emptyReport };
    }

    const { data: scrubbedBundle, piiReport } = scrubObjectPii(bundle, options);
    scrubbedBundle.pii_scrub_summary = {
        scrubbed: true,
        scrubbed_at: piiReport.scrubbed_at,
        total_redactions: piiReport.total_redactions,
        categories: piiReport.categories,
    };

    return {
        bundle: scrubbedBundle,
        piiReport,
    };
}
