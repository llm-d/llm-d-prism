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

vi.mock('./iam', () => {
    const validateGitHubUser = vi.fn();
    return {
        validateGitHubUser,
        // Delegates to the mock above, so tests can keep stubbing validateGitHubUser.
        resolveAllowlistRole: vi.fn(async (username: string) => ({ role: await validateGitHubUser(username), complete: true })),
        isPlaygroundMode: vi.fn(() => false)
    };
});

import { validateGitHubToken, buildGitHubAuthUrl, GITHUB_OAUTH_SCOPE, clearGitHubTokenCacheForTesting } from './oauth';
import { validateGitHubUser, resolveAllowlistRole, isPlaygroundMode } from './iam';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRISM_IAM_PATH = path.resolve(__dirname, '../tools/prism-iam');

describe('buildGitHubAuthUrl', () => {
    it('requests both read:user and read:org scopes for llm-d organization membership checks', () => {
        expect(GITHUB_OAUTH_SCOPE).toBe('read:user read:org');
        const url = new URL(buildGitHubAuthUrl('client-123', 'https://prism.llm-d.ai/api/auth/github/callback', 'state-xyz'));
        expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
        expect(url.searchParams.get('client_id')).toBe('client-123');
        expect(url.searchParams.get('redirect_uri')).toBe('https://prism.llm-d.ai/api/auth/github/callback');
        expect(url.searchParams.get('state')).toBe('state-xyz');
        expect(url.searchParams.get('scope')).toBe('read:user read:org');
    });
});

describe('validateGitHubToken', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        clearGitHubTokenCacheForTesting();
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

    it('grants user permission to active llm-d org members even when absent from GCS allowlist', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ login: 'org-member', avatar_url: 'https://example.com/m.png' })
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ state: 'active', role: 'member' })
            });
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        vi.mocked(validateGitHubUser).mockResolvedValueOnce('none');

        const result = await validateGitHubToken('gho_read_org_token');
        expect(result).toEqual({
            username: 'org-member',
            permission: 'user',
            avatarUrl: 'https://example.com/m.png'
        });
    });

    it('does not grant permission to pending (unaccepted) llm-d org invitations', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ login: 'invited-user' })
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ state: 'pending', role: 'member' })
            });
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        vi.mocked(validateGitHubUser).mockResolvedValueOnce('none');

        const result = await validateGitHubToken('gho_read_org_token');
        expect(result.permission).toBe('none');
    });

    it('falls back to public_members check when private org membership check returns 403', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ login: 'public-org-member', avatar_url: 'https://example.com/p.png' })
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 403,
                statusText: 'Forbidden'
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 204
            });
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        vi.mocked(validateGitHubUser).mockResolvedValueOnce('none');

        const result = await validateGitHubToken('gho_legacy_read_user_only');
        expect(result).toEqual({
            username: 'public-org-member',
            permission: 'user',
            avatarUrl: 'https://example.com/p.png'
        });
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('returned 403'));
        warnSpy.mockRestore();
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

describe('validateGitHubToken caching', () => {
    const originalFetch = globalThis.fetch;
    const githubOk = () => vi.fn(async (url: string) => ({
        ok: true,
        status: url.includes('/memberships/') ? 404 : 200,
        json: async () => (url.endsWith('/user') ? { login: 'alice' } : {})
    }));

    beforeEach(() => {
        clearGitHubTokenCacheForTesting();
        vi.clearAllMocks();
        vi.mocked(isPlaygroundMode).mockReturnValue(false);
        vi.mocked(validateGitHubUser).mockResolvedValue('user');
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.useRealTimers();
    });

    it('reuses a validation for the same token, including concurrent ones', async () => {
        const fetchMock = githubOk();
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const [a, b] = await Promise.all([validateGitHubToken('tok-1'), validateGitHubToken('tok-1')]);
        await validateGitHubToken('tok-1');
        expect(a).toEqual(b);
        const userCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/user'));
        expect(userCalls).toHaveLength(1);
        expect(validateGitHubUser).toHaveBeenCalledTimes(1);
        await validateGitHubToken('tok-2');
        expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/user'))).toHaveLength(2);
    });

    it('validates again after a minute, so revocations and permission changes take effect', async () => {
        vi.useFakeTimers({ now: 0 });
        const fetchMock = githubOk();
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        await validateGitHubToken('tok-1');
        vi.setSystemTime(59_000);
        await validateGitHubToken('tok-1');
        vi.setSystemTime(61_000);
        await validateGitHubToken('tok-1');
        expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/user'))).toHaveLength(2);
    });

    it('does not keep a result computed while the org lookup failed', async () => {
        let orgDown = true;
        const fetchMock = vi.fn(async (url: string) => {
            if (url.endsWith('/user')) return { ok: true, status: 200, json: async () => ({ login: 'alice' }) };
            if (url.includes('/memberships/')) {
                if (orgDown) throw new Error('ECONNRESET');
                return { ok: true, status: 200, json: async () => ({ state: 'active', role: 'admin' }) };
            }
            return { ok: false, status: 404, json: async () => ({}) };
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        vi.mocked(validateGitHubUser).mockResolvedValue('none');
        expect((await validateGitHubToken('tok-1')).permission).toBe('none'); // fails closed...
        orgDown = false;
        expect((await validateGitHubToken('tok-1')).permission).toBe('admin'); // ...but is not cached
        expect((await validateGitHubToken('tok-1')).permission).toBe('admin');
        expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/user'))).toHaveLength(2);
    });

    it('caches a plain 403 org answer, but not a rate-limited one', async () => {
        const run = async (headers: Record<string, string>) => {
            clearGitHubTokenCacheForTesting();
            const fetchMock = vi.fn(async (url: string) => {
                if (url.endsWith('/user')) return { ok: true, status: 200, json: async () => ({ login: 'alice' }) };
                if (url.includes('/memberships/')) return { ok: false, status: 403, headers: new Headers(headers), json: async () => ({}) };
                return { ok: false, status: 404, json: async () => ({}) };
            });
            globalThis.fetch = fetchMock as unknown as typeof fetch;
            await validateGitHubToken('tok-1');
            await validateGitHubToken('tok-1');
            return fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/user')).length;
        };
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(await run({})).toBe(1); // org restricts OAuth apps: stable, cached
        expect(await run({ 'x-ratelimit-remaining': '0' })).toBe(2);
        expect(await run({ 'retry-after': '30' })).toBe(2);
    });

    it('does not keep a result computed while the allowlists could not be read', async () => {
        const fetchMock = githubOk();
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        vi.mocked(resolveAllowlistRole)
            .mockResolvedValueOnce({ role: 'none', complete: false })
            .mockResolvedValueOnce({ role: 'admin', complete: true });
        expect((await validateGitHubToken('tok-1')).permission).toBe('none');
        expect((await validateGitHubToken('tok-1')).permission).toBe('admin');
        expect((await validateGitHubToken('tok-1')).permission).toBe('admin');
        expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/user'))).toHaveLength(2);
    });

    it('does not keep a failed validation', async () => {
        globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) })) as unknown as typeof fetch;
        await expect(validateGitHubToken('tok-1')).rejects.toThrow(/Invalid GitHub token/);
        const fetchMock = githubOk();
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        await expect(validateGitHubToken('tok-1')).resolves.toMatchObject({ username: 'alice', permission: 'user' });
    });
});
