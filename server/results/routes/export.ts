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
import { readResultPayload, readResultMetadata } from '../gcs.ts';
import { storageErrorStatus } from '../backend.ts';
import { PrismResultPayload } from '../api.ts';
import { createRunZipBuffer, getBRV02StageFilename, serializeRawReportToYaml, syncPayloadMetadataToRawReport } from '../exporter.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Helper to validate user authorization for accessing a benchmark result run.
 */
async function fetchAndAuthorizeResult(req: Request, runId: string): Promise<{
    allowed: boolean;
    payload?: PrismResultPayload;
    status: number;
    error?: string;
}> {
    if (!UUID_REGEX.test(runId)) {
        return { allowed: false, status: 400, error: 'Invalid runId format. Must be a UUID.' };
    }

    const token = req.headers['x-prism-github-token'] as string | undefined;
    let username: string | null = null;
    let permission = 'none';

    if (token) {
        try {
            const authResult = await validateGitHubToken(token);
            username = authResult.username;
            permission = authResult.permission;
        } catch (e: any) {
            console.warn('[Results Export API] Invalid session token:', e.message);
        }
    }

    const metadata = await readResultMetadata(runId);
    if (!metadata) {
        return { allowed: false, status: 404, error: 'Result not found' };
    }

    const { user: itemUser, state: itemState } = metadata;
    let allowed = false;

    if (permission === 'admin') {
        allowed = true;
    } else if (itemState === 'public' || itemState === 'promoted' || itemState === 'unlisted') {
        allowed = true;
    } else if (username && itemUser.toLowerCase() === username.toLowerCase()) {
        allowed = true;
    }

    if (!allowed) {
        return { allowed: false, status: 403, error: 'Access denied. You do not have permissions to export this result.' };
    }

    const payload = await readResultPayload(runId);
    return { allowed: true, status: 200, payload };
}

/**
 * GET /api/results/:runId/export
 * 
 * Downloads an entire benchmark run dissected into BRV0.2 YAML files as a ZIP archive (or single .yaml file if format=yaml and single stage).
 */
export async function exportResultsHandler(req: Request, res: Response) {
    const { runId } = req.params;

    try {
        const authRes = await fetchAndAuthorizeResult(req, runId);
        if (!authRes.allowed || !authRes.payload) {
            return res.status(authRes.status).json({ error: authRes.error });
        }

        const payload = authRes.payload;
        const entries = payload.entries || [];
        if (entries.length === 0) {
            return res.status(400).json({ error: 'No benchmark stage entries found in run payload.' });
        }

        const formatQuery = (req.query.format as string || '').toLowerCase();

        // If single stage and format=yaml requested, return the single YAML file directly
        if (entries.length === 1 && formatQuery === 'yaml') {
            const entry = entries[0];
            const syncedReport = syncPayloadMetadataToRawReport(entry.raw_report, payload);
            const yamlContent = serializeRawReportToYaml(syncedReport);
            const stageNum = entry.prism_stage_index ?? 0;
            const filename = getBRV02StageFilename(stageNum);

            res.setHeader('Content-Type', 'application/x-yaml');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.send(yamlContent);
        }

        // Default: Zip constituent stage .yaml reports
        const { buffer, filename } = createRunZipBuffer(payload);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(buffer);

    } catch (error: any) {
        console.error('[Results Export API Error]', error);
        return res.status(storageErrorStatus(error, 500)).json({ error: 'Failed to export benchmark run', details: error.message });
    }
}

/**
 * GET /api/results/:runId/entries/:entryIndex/download
 * 
 * Downloads a specific stage entry from a benchmark run as a standalone BRV0.2 .yaml file.
 */
export async function downloadEntryHandler(req: Request, res: Response) {
    const { runId, entryIndex: entryIndexStr } = req.params;
    const entryIndex = parseInt(entryIndexStr, 10);

    if (isNaN(entryIndex) || entryIndex < 0) {
        return res.status(400).json({ error: 'Invalid entryIndex parameter.' });
    }

    try {
        const authRes = await fetchAndAuthorizeResult(req, runId);
        if (!authRes.allowed || !authRes.payload) {
            return res.status(authRes.status).json({ error: authRes.error });
        }

        const payload = authRes.payload;
        const entries = payload.entries || [];
        if (entryIndex >= entries.length) {
            return res.status(404).json({ error: `Stage entry at index ${entryIndex} not found.` });
        }

        const entry = entries[entryIndex];
        const syncedReport = syncPayloadMetadataToRawReport(entry.raw_report, payload);
        const yamlContent = serializeRawReportToYaml(syncedReport);
        const stageNum = entry.prism_stage_index ?? entryIndex;
        const filename = getBRV02StageFilename(stageNum);

        res.setHeader('Content-Type', 'application/x-yaml');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(yamlContent);

    } catch (error: any) {
        console.error('[Results Entry Download API Error]', error);
        return res.status(storageErrorStatus(error, 500)).json({ error: 'Failed to download stage entry', details: error.message });
    }
}
