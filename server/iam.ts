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

import { GoogleAuth, UserRefreshClient } from 'google-auth-library';
import fs from 'fs';
import { getResultsStoreBucket } from './buckets.js';
import { isS3ResultsStore } from './results/backend.ts';

const auth = new GoogleAuth();

export type PermissionLevel = 'none' | 'user' | 'admin';

/**
 * Resolves the GCS bucket name to read IAM allowlist configurations from.
 */
function getIAMBucket(): string {
    return getResultsStoreBucket();
}

/**
 * Retrieves the GCS access token using ADC.
 */
async function getAccessToken(): Promise<string> {
    let client;
    const adcPath = process.env.GOOGLE_APPLICATION_DEFAULT_CREDENTIALS;
    if (adcPath && fs.existsSync(adcPath)) {
        try {
            const creds = JSON.parse(fs.readFileSync(adcPath, 'utf8'));
            if (creds.type === 'authorized_user') {
                client = new UserRefreshClient({
                    clientId: creds.client_id,
                    clientSecret: creds.client_secret,
                    refreshToken: creds.refresh_token
                });
            }
        } catch (e) {
            console.warn('Failed to parse ADC file for explicit auth:', e);
        }
    }

    if (!client) {
        client = await auth.getClient();
    }
    const token = await client.getAccessToken();
    if (!token.token) {
        throw new Error('Could not retrieve access token');
    }
    return token.token;
}

/**
 * Parses an allowlist file: one GitHub username per line, blank lines and lines
 * starting with '#' ignored, case-insensitive.
 */
function parseAllowlist(text: string): Set<string> {
    return new Set(
        text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(line => line.toLowerCase())
    );
}

/**
 * Fetches and parses an allowlist file from the active Results Store backend: the GCS
 * IAM bucket, or the S3 store's bucket.
 */
async function fetchAllowlist(filename: string): Promise<Set<string>> {
    const bucket = getIAMBucket();
    const objectPath = `prism-iam/${filename}`;
    const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media`;

    try {
        if (isS3ResultsStore()) {
            // Imported lazily to avoid an import cycle (store -> listFilters.ts -> this module).
            const { getS3ResultsStore } = await import('./results/store/active.ts');
            const text = await getS3ResultsStore().readIamFile(objectPath);
            if (text === null) {
                console.warn(`Allowlist file ${objectPath} not found in the S3 Results Store`);
                return new Set<string>();
            }
            return parseAllowlist(text);
        }

        const accessToken = await getAccessToken();
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`Allowlist file ${objectPath} not found in bucket ${bucket}`);
                return new Set<string>();
            }
            throw new Error(`Failed to fetch allowlist: ${response.status} ${response.statusText}`);
        }

        return parseAllowlist(await response.text());
    } catch (error) {
        console.error(`Error fetching allowlist ${filename}:`, error);
        throw error;
    }
}

/**
 * Resolves whether Results Store Playground Mode is active via environment variable.
 */
export function isPlaygroundMode(): boolean {
    const val = String(process.env.RESULTS_STORE_PLAYGROUND_MODE || '').trim().toLowerCase();
    return val === '1' || val === 'true' || val === 'yes' || val === 'on';
}

/**
 * Validates a GitHub user's permissions level based on the IAM bucket allowlists.
 */
export async function validateGitHubUser(username: string): Promise<PermissionLevel> {
    if (isPlaygroundMode()) {
        return 'admin';
    }

    const normalizedUsername = username.trim().toLowerCase();
    if (!normalizedUsername) {
        return 'none';
    }

    try {
        const [admins, users] = await Promise.all([
            fetchAllowlist('github-admin-allowlist.txt'),
            fetchAllowlist('github-user-allowlist.txt')
        ]);

        if (admins.has(normalizedUsername)) {
            return 'admin';
        }
        if (users.has(normalizedUsername)) {
            return 'user';
        }
        return 'none';
    } catch (error) {
        console.error(`Error validating permissions for user ${username}:`, error);
        return 'none';
    }
}
