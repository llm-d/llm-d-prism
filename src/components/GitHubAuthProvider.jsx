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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GitHubAuthContext } from '../context/GitHubAuthContext';

export function GitHubAuthProvider({ children }) {
    const [accessToken, setAccessToken] = useState(() => localStorage.getItem('prism_github_access_token'));
    const [refreshToken, setRefreshToken] = useState(() => localStorage.getItem('prism_github_refresh_token'));
    const [user, setUser] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isConfigured, setIsConfigured] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const refreshTimerRef = useRef(null);

    const logout = useCallback(async () => {
        try {
            await fetch('/api/auth/github/logout', { method: 'POST' });
        } catch (e) {
            console.error('Logout request failed:', e);
        }
        localStorage.removeItem('prism_github_access_token');
        localStorage.removeItem('prism_github_refresh_token');
        localStorage.removeItem('prism_github_access_token_expires_at');
        localStorage.removeItem('prism_github_refresh_token_expires_at');
        setAccessToken(null);
        setRefreshToken(null);
        setUser(null);
        setIsAuthenticated(false);
    }, []);

    const refreshTokens = useCallback(async (rToken) => {
        const currRefreshToken = rToken || refreshToken;
        if (!currRefreshToken) return null;

        try {
            const res = await fetch('/api/auth/github/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: currRefreshToken })
            });

            if (res.status === 501) {
                setIsConfigured(false);
                logout();
                return null;
            }

            if (!res.ok) {
                throw new Error(`Token refresh failed with status ${res.status}`);
            }

            const data = await res.json();
            
            localStorage.setItem('prism_github_access_token', data.access_token);
            setAccessToken(data.access_token);

            if (data.refresh_token) {
                localStorage.setItem('prism_github_refresh_token', data.refresh_token);
                setRefreshToken(data.refresh_token);
            }

            if (data.expires_in) {
                const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
                localStorage.setItem('prism_github_access_token_expires_at', expiresAt);
            }

            if (data.refresh_token_expires_in) {
                const refreshExpiresAt = new Date(Date.now() + data.refresh_token_expires_in * 1000).toISOString();
                localStorage.setItem('prism_github_refresh_token_expires_at', refreshExpiresAt);
            }

            return data.access_token;
        } catch (err) {
            console.error('Error refreshing token:', err);
            logout();
            return null;
        }
    }, [refreshToken, logout]);

    const checkSession = useCallback(async (tokenToVerify) => {
        const token = tokenToVerify || accessToken;
        if (!token) {
            setUser(null);
            setIsAuthenticated(false);
            setIsLoading(false);
            return;
        }

        try {
            const res = await fetch('/api/auth/github/me', {
                headers: { 'X-Prism-Github-Token': token }
            });

            if (res.status === 501) {
                setIsConfigured(false);
                setUser(null);
                setIsAuthenticated(false);
                setIsLoading(false);
                return;
            }

            if (!res.ok) {
                if (res.status === 401 && refreshToken) {
                    console.log('Access token expired, attempting silent refresh...');
                    const refreshedToken = await refreshTokens();
                    if (refreshedToken) {
                        await checkSession(refreshedToken);
                        return;
                    }
                }
                throw new Error(`Session check failed with status ${res.status}`);
            }

            const data = await res.json();
            setIsConfigured(data.configured !== false);
            if (data.authenticated) {
                setUser({ username: data.username, permission: data.permission, avatarUrl: data.avatarUrl });
                setIsAuthenticated(true);
            } else {
                setUser(null);
                setIsAuthenticated(false);
            }
        } catch (err) {
            console.error('Session verification error:', err);
            setUser(null);
            setIsAuthenticated(false);
        } finally {
            setIsLoading(false);
        }
    }, [accessToken, refreshToken, refreshTokens]);

    // Parse tokens from URL hash if redirecting from OAuth flow
    useEffect(() => {
        const hash = window.location.hash;
        if (hash && hash.startsWith('#access_token=')) {
            const params = new URLSearchParams(hash.substring(1));
            const token = params.get('access_token');
            const rToken = params.get('refresh_token');
            const expiresIn = params.get('expires_in');
            const refreshExpiresIn = params.get('refresh_token_expires_in');

            if (token) {
                localStorage.setItem('prism_github_access_token', token);
                setAccessToken(token);

                if (rToken) {
                    localStorage.setItem('prism_github_refresh_token', rToken);
                    setRefreshToken(rToken);
                }

                if (expiresIn) {
                    const expiresAt = new Date(Date.now() + parseInt(expiresIn, 10) * 1000).toISOString();
                    localStorage.setItem('prism_github_access_token_expires_at', expiresAt);
                }

                if (refreshExpiresIn) {
                    const refreshExpiresAt = new Date(Date.now() + parseInt(refreshExpiresIn, 10) * 1000).toISOString();
                    localStorage.setItem('prism_github_refresh_token_expires_at', refreshExpiresAt);
                }

                // Clear the hash in the browser URL
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
                
                checkSession(token);
            }
        } else {
            // Check session with existing local token on mount
            checkSession();
        }
    }, [checkSession]);

    // Timer for auto-renewal
    useEffect(() => {
        const startTimer = () => {
            if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);

            refreshTimerRef.current = setInterval(async () => {
                const expiresAtStr = localStorage.getItem('prism_github_access_token_expires_at');
                const rToken = localStorage.getItem('prism_github_refresh_token');

                if (!expiresAtStr || !rToken) return;

                const expiresAt = new Date(expiresAtStr).getTime();
                const now = Date.now();
                const timeRemaining = expiresAt - now;

                // If less than 5 minutes remaining (300,000 ms), trigger refresh
                if (timeRemaining < 300000) {
                    console.log(`Access token close to expiration (${Math.round(timeRemaining / 1000)}s remaining), renewing...`);
                    await refreshTokens(rToken);
                }
            }, 60000); // Check every minute
        };

        if (isAuthenticated && refreshToken) {
            startTimer();
        }

        return () => {
            if (refreshTimerRef.current) {
                clearInterval(refreshTimerRef.current);
            }
        };
    }, [isAuthenticated, refreshToken, refreshTokens]);

    // Check if the backend has OAuth configured on initial load, even if no token is stored
    useEffect(() => {
        const checkConfigurationOnly = async () => {
            if (accessToken) return; // session check handles this
            try {
                const res = await fetch('/api/auth/github/me');
                if (res.status === 501) {
                    setIsConfigured(false);
                } else if (res.ok) {
                    const data = await res.json();
                    setIsConfigured(data.configured !== false);
                } else {
                    setIsConfigured(true);
                }
            } catch (e) {
                console.error('Error checking OAuth configuration:', e);
            }
        };
        checkConfigurationOnly();
    }, [accessToken]);

    const login = useCallback((options) => {
        const state = Math.random().toString(36).substring(2, 15);
        if (options && options.showSubmitDialog === true) {
            sessionStorage.setItem('prism_show_submit_dialog_after_login', 'true');
        }
        window.location.href = `/api/auth/github/login?state=${state}`;
    }, []);

    return (
        <GitHubAuthContext.Provider value={{
            accessToken,
            refreshToken,
            user,
            isAuthenticated,
            isConfigured,
            isLoading,
            login,
            logout,
            refreshTokens
        }}>
            {children}
        </GitHubAuthContext.Provider>
    );
}
