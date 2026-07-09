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
import { validateGitHubUser, PermissionLevel } from './iam';

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

/**
 * GET /api/auth/github/login
 * Initiates the GitHub OAuth flow.
 */
oauthRouter.get('/api/auth/github/login', (req: Request, res: Response) => {
    const state = (req.query.state as string) || crypto.randomBytes(16).toString('hex');
    const redirectUri = `${getBaseUrl(req)}/api/auth/github/callback`;
    const githubAuthUrl = `https://github.com/login/oauth/authorize` +
        `?client_id=${encodeURIComponent(GITHUB_CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${encodeURIComponent(state)}` +
        `&scope=read:user`;

    res.redirect(githubAuthUrl);
});

/**
 * Validates a GitHub access token.
 * Fetches the user profile and permissions directly from GitHub API.
 */
export async function validateGitHubToken(token: string): Promise<{ username: string, permission: PermissionLevel, avatarUrl?: string }> {
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
    try {
        const orgResponse = await fetch(`https://api.github.com/orgs/llm-d/memberships/${username}`, {
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
        }
    } catch (e) {
        console.warn(`Error checking llm-d organization membership for user ${username}:`, e);
    }

    // Resolve allowlist role
    const allowlistRole = await validateGitHubUser(username);

    // Determine highest role
    let permission: PermissionLevel = 'none';
    if (orgRole === 'admin' || allowlistRole === 'admin') {
        permission = 'admin';
    } else if (orgRole === 'user' || allowlistRole === 'user') {
        permission = 'user';
    }

    return { username, permission, avatarUrl: userData.avatar_url };
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

