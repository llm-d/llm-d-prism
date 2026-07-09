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

import { Request, Response } from 'express';
import { validateGitHubToken } from '../../oauth.ts';
import { listBenchmarks, readBenchmarkContent, readResultMetadata } from '../gcs.ts';

export async function listBenchmarksHandler(req: Request, res: Response) {
    const token = req.headers['x-prism-github-token'] as string | undefined;
    let username: string | null = null;
    let permission = 'none';

    if (token) {
        try {
            const authResult = await validateGitHubToken(token);
            username = authResult.username;
            permission = authResult.permission;
        } catch (e: any) {
            console.warn('[Benchmarks API] Invalid session token:', e.message);
        }
    }

    const bucket = req.query.bucket as string | undefined;
    const prefix = req.query.prefix as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string || '', 10) || 20, 100);
    const pageToken = req.query.pageToken as string | undefined;

    try {
        const results = await listBenchmarks({
            bucket,
            prefix,
            limit,
            pageToken,
            username,
            permission
        });
        res.json(results);
    } catch (error: any) {
        console.error('[Benchmarks List Error]', error);
        res.status(500).json({ error: 'Failed to list benchmarks', details: error.message });
    }
}

export async function getBenchmarkContentHandler(req: Request, res: Response) {
    const token = req.headers['x-prism-github-token'] as string | undefined;
    let username: string | null = null;
    let permission = 'none';

    if (token) {
        try {
            const authResult = await validateGitHubToken(token);
            username = authResult.username;
            permission = authResult.permission;
        } catch (e: any) {
            console.warn('[Benchmarks Content API] Invalid session token:', e.message);
        }
    }

    const path = req.query.path as string;
    const bucket = req.query.bucket as string | undefined;

    if (!path) {
        return res.status(400).json({ error: 'Missing path parameter.' });
    }

    try {
        // Enforce authorization for prism-results-store files
        if (path.startsWith('prism-results-store/')) {
            const runIdMatch = path.match(/prism-results-store\/([^/]+)\.v1\.json/);
            const runId = runIdMatch ? runIdMatch[1] : '';
            if (runId) {
                const metadata = await readResultMetadata(runId);
                if (!metadata) {
                    return res.status(404).json({ error: 'Result not found' });
                }

                const { user: itemUser, state: itemState } = metadata;
                let allowed = false;
                if (permission === 'admin') {
                    allowed = true;
                } else {
                    if (itemState === 'public' || itemState === 'promoted') {
                        allowed = true;
                    } else if (username && itemUser.toLowerCase() === username.toLowerCase()) {
                        allowed = true;
                    }
                }

                if (!allowed) {
                    return res.status(403).json({ error: 'Access denied. You do not have permissions to view this result.' });
                }
            }
        }

        const content = await readBenchmarkContent(bucket, path);
        
        if (path.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json');
        } else if (path.endsWith('.yaml') || path.endsWith('.yml')) {
            res.setHeader('Content-Type', 'text/yaml');
        } else {
            res.setHeader('Content-Type', 'text/plain');
        }
        res.send(content);

    } catch (error: any) {
        console.error('[Benchmark Content Error]', error);
        res.status(500).json({ error: 'Failed to retrieve benchmark content', details: error.message });
    }
}
