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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

vi.mock('./iam', () => ({
    validateGitHubUser: vi.fn(),
    isPlaygroundMode: vi.fn(() => false)
}));

import { validateGitHubToken } from './oauth';
import { validateGitHubUser, isPlaygroundMode } from './iam';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRISM_IAM_PATH = path.resolve(__dirname, '../tools/prism-iam');

describe('validateGitHubToken', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(isPlaygroundMode).mockReturnValue(false);
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('does not bypass GitHub verification for mock_token_prism outside playground mode', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 401,
            statusText: 'Unauthorized'
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        await expect(validateGitHubToken('mock_token_prism')).rejects.toThrow(/Invalid GitHub token/i);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.github.com/user',
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer mock_token_prism'
                })
            })
        );
    });

    it('returns anonymous admin only when playground mode is explicitly enabled', async () => {
        vi.mocked(isPlaygroundMode).mockReturnValue(true);
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await validateGitHubToken('any-token');
        expect(result).toEqual({ username: 'anonymous', permission: 'admin' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('combines active llm-d org membership and GCS allowlist role to select highest permission', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ login: 'contributor-user', avatar_url: 'https://example.com/a.png' })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ state: 'active', role: 'member' })
            });
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        vi.mocked(validateGitHubUser).mockResolvedValueOnce('admin');

        const result = await validateGitHubToken('gho_valid_token');
        expect(result).toEqual({
            username: 'contributor-user',
            permission: 'admin',
            avatarUrl: 'https://example.com/a.png'
        });
    });
});

describe('tools/prism-iam GCS error handling', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-iam-test-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    function writeFakeGcloud(scriptBody: string) {
        const gcloudPath = path.join(tempDir, 'gcloud');
        fs.writeFileSync(gcloudPath, `#!/bin/bash\n${scriptBody}\n`, { mode: 0o755 });
    }

    it('fails non-zero on auth or Context-Aware Access errors instead of reporting empty allowlists or overwriting', () => {
        const cpMarker = path.join(tempDir, 'cp-called');
        writeFakeGcloud(`
if [ "$1" = "storage" ] && [ "$2" = "cat" ]; then
    echo "ERROR: (gcloud.storage.cat) Access was blocked by Context Aware Access." >&2
    exit 1
fi
if [ "$1" = "storage" ] && [ "$2" = "cp" ]; then
    touch "${cpMarker}"
    exit 0
fi
exit 1
`);

        const env = { ...process.env, PATH: `${tempDir}:/usr/bin:/bin` };

        expect(() => {
            execFileSync(PRISM_IAM_PATH, ['summarize', 'production'], { env, encoding: 'utf8', stdio: 'pipe' });
        }).toThrow(/Context Aware Access/);

        expect(() => {
            execFileSync(PRISM_IAM_PATH, ['user-allowlist', 'production', 'add', 'new-user'], { env, encoding: 'utf8', stdio: 'pipe' });
        }).toThrow(/Context Aware Access/);

        expect(fs.existsSync(cpMarker)).toBe(false);
    });

    it('treats missing GCS allowlist objects (404 / matched no objects) as empty', () => {
        const uploadedFile = path.join(tempDir, 'uploaded.txt');
        writeFakeGcloud(`
if [ "$1" = "storage" ] && [ "$2" = "cat" ]; then
    echo "ERROR: (gcloud.storage.cat) The following URLs matched no objects:" >&2
    exit 1
fi
if [ "$1" = "storage" ] && [ "$2" = "cp" ]; then
    cp "$3" "${uploadedFile}"
    exit 0
fi
exit 1
`);

        const env = { ...process.env, PATH: `${tempDir}:/usr/bin:/bin` };

        const summary = execFileSync(PRISM_IAM_PATH, ['summarize', 'staging'], { env, encoding: 'utf8' });
        expect(summary).toContain('user-allowlist staging:\n  []');

        execFileSync(PRISM_IAM_PATH, ['user-allowlist', 'staging', 'add', 'first-contributor'], { env, encoding: 'utf8' });
        expect(fs.readFileSync(uploadedFile, 'utf8').trim()).toBe('first-contributor');
    });
});
