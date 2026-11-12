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

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { resolveAllowlistRole, PermissionLevel, isPlaygroundMode } from './iam';

export const oauthRouter = Router();

// Environment variables for GitHub OAuth
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';

const getBaseUrl = (req: Request): string => {
    if (process.env.PUBLIC_URL) {
        return process.env.PUBLIC_URL.replace(/\/$/, '');
    }
    const forwardedHost = req.headers['x-forwarded-host'] as string;
    const host = forwardedHost || req.get('host');
    const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    return `${protocol}://${host}`;
};

// Check if OAuth is configured
const isOAuthConfigured = (): boolean => {
    return !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET);
};

// Middleware to enforce configuration check
oauthRouter.use((req: Request, res: Response, next) => {
    if (req.path.startsWith('/api/auth/github')) {
        if (isPlaygroundMode() && req.path === '/api/auth/github/me') {
            res.json({
                authenticated: true,
                configured: true,
                username: 'anonymous',
                permission: 'admin',
                avatarUrl: null,
                playgroundMode: true
            });
            return;
        }
        if (!isOAuthConfigured()) {
            if (req.path === '/api/auth/github/me') {
                res.json({
                    authenticated: false,
                    configured: false,
                    username: null,
                    permission: 'none'
                });
                return;
            }
            res.status(501).json({
                error: 'GitHub OAuth is not configured. The server does not yet support GitHub authentication.'
            });
            return;
        }
    }
    next();
});

export const GITHUB_OAUTH_SCOPE = 'read:user read:org';

/**
 * Builds the GitHub OAuth authorization redirect URL.
 * Requests `read:user read:org` so OAuth Apps can inspect private `llm-d`
 * organization memberships; GitHub Apps ignore `scope` and rely on their
 * configured Organization Members (Read-only) permission + org installation.
 */
export function buildGitHubAuthUrl(clientId: string, redirectUri: string, state: string): string {
    return `https://github.com/login/oauth/authorize` +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${encodeURIComponent(state)}` +
        `&scope=${encodeURIComponent(GITHUB_OAUTH_SCOPE)}`;
}

/**
 * GET /api/auth/github/login
 * Initiates the GitHub OAuth flow.
 */
oauthRouter.get('/api/auth/github/login', (req: Request, res: Response) => {
    const state = (req.query.state as string) || crypto.randomBytes(16).toString('hex');
    const redirectUri = `${getBaseUrl(req)}/api/auth/github/callback`;
    const githubAuthUrl = buildGitHubAuthUrl(GITHUB_CLIENT_ID, redirectUri, state);

    res.redirect(githubAuthUrl);
});

type GitHubIdentity = { username: string, permission: PermissionLevel, avatarUrl?: string };

/**
 * Read routes (list, get, export) may reuse a validation briefly ({ cached: true }), keyed by
 * a hash of the token: a dashboard load sends the token with many reads, and each validation
 * otherwise costs several GitHub API calls against the user's hourly limit. For those reads a
 * revoked token or a permission change therefore takes effect within this window. Routes
 * that change data always validate afresh. Only definitive results are kept: not failures,
 * and not a permission computed while the org or allowlist lookup failed.
 */
const TOKEN_CACHE_TTL_MS = 60_000;
const TOKEN_CACHE_MAX_ENTRIES = 1000;
const tokenCache = new Map<string, { expiresAt: number; identity: Promise<GitHubIdentity> }>();

/** Test hook: forget cached validations. */
export function clearGitHubTokenCacheForTesting(): void {
    tokenCache.clear();
}

/**
 * Validates a GitHub access token.
 * Fetches the user profile and permissions directly from GitHub API (with `cached`, possibly
 * from a validation made in the last minute; see above).
 */
export async function validateGitHubToken(token: string, { cached = false }: { cached?: boolean } = {}): Promise<GitHubIdentity> {
    if (isPlaygroundMode()) {
        return { username: 'anonymous', permission: 'admin' };
    }
    if (!cached) return (await fetchGitHubIdentity(token)).identity;
    const key = crypto.createHash('sha256').update(token).digest('hex');
    const hit = tokenCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.identity;

    // Concurrent requests with the same token share one validation.
    const lookup = fetchGitHubIdentity(token);
    const identity = lookup.then(r => r.identity);
    tokenCache.delete(key);
    tokenCache.set(key, { expiresAt: Date.now() + TOKEN_CACHE_TTL_MS, identity });
    const forget = () => { if (tokenCache.get(key)?.identity === identity) tokenCache.delete(key); };
    lookup.then(r => { if (!r.definitive) forget(); }, forget);
    if (tokenCache.size > TOKEN_CACHE_MAX_ENTRIES) tokenCache.delete(tokenCache.keys().next().value!);
    return identity;
}

/** `definitive` is false when a permission lookup failed and the result fell back to less. */
async function fetchGitHubIdentity(token: string): Promise<{ identity: GitHubIdentity; definitive: boolean }> {
    const userResponse = await fetch('https://api.github.com/user', {
        headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'llm-d-prism'
        }
    });

    if (!userResponse.ok) {
        throw new Error(`Invalid GitHub token: ${userResponse.statusText}`);
    }

    const userData = await userResponse.json() as { login: string, avatar_url?: string };
    const username = userData.login;

    // Resolve organization membership role
    let orgRole: PermissionLevel = 'none';
    let orgLookupComplete = true;
    const encodedUsername = encodeURIComponent(username);
    try {
        const orgResponse = await fetch(`https://api.github.com/orgs/llm-d/memberships/${encodedUsername}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'llm-d-prism'
            }
        });
        if (orgResponse.ok) {
            const orgData = await orgResponse.json() as { role?: string; state?: string };
            if (orgData.state === 'active') {
                if (orgData.role === 'admin') {
                    orgRole = 'admin';
                } else if (orgData.role === 'member') {
                    orgRole = 'user';
                }
            }
        } else if (orgResponse.status === 403) {
            // A plain 403 (org restricts OAuth apps, missing scope) is a stable answer; a
            // rate-limit 403 is temporary, so a result computed during it is not cached.
            if (orgResponse.headers?.get?.('x-ratelimit-remaining') === '0' || orgResponse.headers?.get?.('retry-after')) {
                orgLookupComplete = false;
            }
            console.warn(
                `GitHub org membership check returned 403 for ${username}; ` +
                `ensure token has 'read:org' scope or the GitHub App is installed on 'llm-d' with Members: Read-only. ` +
                `Falling back to public_members check.`
            );
            const publicMemberResponse = await fetch(`https://api.github.com/orgs/llm-d/public_members/${encodedUsername}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'llm-d-prism'
                }
            });
            if (publicMemberResponse.status === 204) {
                orgRole = 'user';
            } else if (publicMemberResponse.status !== 404) {
                orgLookupComplete = false;
            }
        } else if (orgResponse.status !== 404) {
            orgLookupComplete = false;
        }
    } catch (e) {
        orgLookupComplete = false;
        console.warn(`Error checking llm-d organization membership for user ${username}:`, e);
    }

    // Resolve allowlist role
    const { role: allowlistRole, complete: allowlistComplete } = await resolveAllowlistRole(username);

    // Determine highest role
    let permission: PermissionLevel = 'none';
    if (orgRole === 'admin' || allowlistRole === 'admin') {
        permission = 'admin';
    } else if (orgRole === 'user' || allowlistRole === 'user') {
        permission = 'user';
    }

    return {
        identity: { username, permission, avatarUrl: userData.avatar_url },
        definitive: orgLookupComplete && allowlistComplete,
    };
}

/**
 * GET /api/auth/github/callback
 * Handles the redirect callback from GitHub OAuth.
 * Exchanges code for token, and redirects back to the frontend with the token.
 */
oauthRouter.get('/api/auth/github/callback', async (req: Request, res: Response) => {
    const { code, state } = req.query;

    if (!code) {
        return res.status(400).send('Authorization code missing.');
    }

    try {
        // Exchange code for access token
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                client_secret: GITHUB_CLIENT_SECRET,
                code
            })
        });

        if (!tokenResponse.ok) {
            throw new Error(`Failed to exchange code: ${tokenResponse.statusText}`);
        }

        const tokenData = await tokenResponse.json() as {
            access_token?: string;
            expires_in?: number;
            refresh_token?: string;
            refresh_token_expires_in?: number;
            error?: string;
            error_description?: string;
        };
        if (tokenData.error) {
            throw new Error(`GitHub OAuth error: ${tokenData.error_description || tokenData.error}`);
        }

        const accessToken = tokenData.access_token;
        if (!accessToken) {
            throw new Error('Access token not found in response.');
        }

        // Construct the redirect hash fragment
        let hashParams = `access_token=${encodeURIComponent(accessToken)}`;
        if (tokenData.refresh_token) {
            hashParams += `&refresh_token=${encodeURIComponent(tokenData.refresh_token)}`;
        }
        if (tokenData.expires_in) {
            hashParams += `&expires_in=${tokenData.expires_in}`;
        }
        if (tokenData.refresh_token_expires_in) {
            hashParams += `&refresh_token_expires_in=${tokenData.refresh_token_expires_in}`;
        }
        hashParams += `&state=${encodeURIComponent(state as string || '')}`;

        // Redirect back to the frontend manage-benchmarks view with the token details
        res.redirect(`${getBaseUrl(req)}/?view=manage-benchmarks#${hashParams}`);
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('OAuth Callback Error:', err);
        res.status(500).send(`Authentication failed: ${err.message}`);
    }
});

/**
 * POST /api/auth/github/refresh
 * Refreshes an expired GitHub access token using a refresh token.
 */
oauthRouter.post('/api/auth/github/refresh', async (req: Request, res: Response) => {
    const { refresh_token } = req.body;
    if (!refresh_token) {
        res.status(400).json({ error: 'Refresh token is required.' });
        return;
    }

    try {
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                client_secret: GITHUB_CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token
            })
        });

        if (!tokenResponse.ok) {
            throw new Error(`Failed to refresh token: ${tokenResponse.statusText}`);
        }

        const tokenData = await tokenResponse.json() as {
            access_token?: string;
            expires_in?: number;
            refresh_token?: string;
            refresh_token_expires_in?: number;
            error?: string;
            error_description?: string;
        };

        if (tokenData.error) {
            throw new Error(`GitHub OAuth refresh error: ${tokenData.error_description || tokenData.error}`);
        }

        res.json({
            access_token: tokenData.access_token,
            expires_in: tokenData.expires_in,
            refresh_token: tokenData.refresh_token,
            refresh_token_expires_in: tokenData.refresh_token_expires_in
        });
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('OAuth Refresh Error:', err);
        res.status(500).json({ error: `Token refresh failed: ${err.message}` });
    }
});

/**
 * GET /api/auth/github/me
 * Returns current authenticated user metadata and permission levels.
 * Expects X-Prism-Github-Token header.
 */
oauthRouter.get('/api/auth/github/me', async (req: Request, res: Response) => {
    if (isPlaygroundMode()) {
        return res.json({
            authenticated: true,
            configured: true,
            username: 'anonymous',
            permission: 'admin',
            avatarUrl: '/api/avatar/anonymous',
            playgroundMode: true
        });
    }

    const token = req.headers['x-prism-github-token'] as string;
    if (!token) {
        return res.json({
            authenticated: false,
            configured: true,
            username: null,
            permission: 'none'
        });
    }

    try {
        const { username, permission, avatarUrl } = await validateGitHubToken(token);
        
        res.json({
            authenticated: true,
            configured: true,
            username,
            permission,
            avatarUrl
        });
    } catch (error) {
        console.error('Error resolving session details:', error);
        res.status(401).json({
            authenticated: false,
            configured: true,
            username: null,
            permission: 'none',
            error: 'Invalid or expired GitHub token'
        });
    }
});

/**
 * POST /api/auth/github/logout
 * Logs out the user. Since session is client-side, this is a no-op that returns success.
 */
oauthRouter.post('/api/auth/github/logout', (req: Request, res: Response) => {
    res.json({ success: true });
});

