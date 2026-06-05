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

import express from 'express';
import compression from 'compression';
import { GoogleAuth, UserRefreshClient } from 'google-auth-library';
import fs from 'fs';
import yaml from 'js-yaml';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Enable gzip compression
app.use(compression());
app.use(express.json());

// Trust the first proxy (Cloud Run Load Balancer) to properly resolve X-Forwarded-For
app.set('trust proxy', 1);

// Rate Limiting: 200 requests per 15 minutes per IP
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 50000, // Effectively unlimited for local dev
    standardHeaders: true, 
    legacyHeaders: false, 
});
app.use('/api', limiter);

// Google Auth Client
const auth = new GoogleAuth();

// --- API: Shared Configuration ---
app.get('/api/config', (req, res) => {
    // Parse environment variables for default data sources
    const defaultBuckets = process.env.DEFAULT_BUCKETS ? process.env.DEFAULT_BUCKETS.split(',') : [];
    const defaultProjects = process.env.DEFAULT_PROJECTS ? process.env.DEFAULT_PROJECTS.split(',') : [];

    res.json({
        buckets: defaultBuckets.map(b => b.trim()).filter(b => b),
        projects: defaultProjects.map(p => p.trim()).filter(p => p),
        hostProject: process.env.GOOGLE_CLOUD_PROJECT || null,
        siteName: process.env.SITE_NAME || null,
        gaTrackingId: process.env.GA_TRACKING_ID || null,
        contactUrl: process.env.CONTACT_US_URL || null
    });
});

// --- API: GIQ Proxy (Backend-for-Frontend) ---
// Proxies requests to the Google Kubernetes Engine Recommender API (GIQ)
// Injects the Application Default Credentials (ADC) token.
app.all('/api/giq/*', async (req, res) => {
    try {


        let accessToken;
        const authHeader = req.headers['authorization'];
        
        // If client provides a specific token (e.g. valid length), use it.
        // Otherwise, fallback to ADC.
        if (authHeader && authHeader.startsWith('Bearer ') && authHeader.length > 20) {
             console.log('[Proxy] Using user-provided token');
             accessToken = authHeader.split(' ')[1];
        } else {
             console.log('[Proxy] Using Server ADC token');
             const client = await auth.getClient();
             const token = await client.getAccessToken();
             accessToken = token.token;
        }
        
        // Construct target URL
        // Incoming: /api/giq/v1/profiles:fetch
        // Target: https://gkerecommender.googleapis.com/v1/profiles:fetch
        const targetPath = req.params[0]; 
        const targetUrl = `https://gkerecommender.googleapis.com/${targetPath}`;
        
        console.log(`[Proxy] Forwarding to: ${targetUrl}`);

        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            // User Project is required for quota attribution
            'X-Goog-User-Project': req.headers['x-goog-user-project'] || process.env.GOOGLE_CLOUD_PROJECT
        };

        const response = await fetch(targetUrl, {
            method: req.method,
            headers: headers,
            body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
        });

        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            data = { error: 'Non-JSON Response', raw: text };
        }

        if (targetUrl.includes('profiles:fetch')) {
            console.log(`[Proxy Debug] PROFILES Data string: ${JSON.stringify(data).substring(0, 200)}...`);
        }
        
        // Debug GIQ Cost Data
        if (targetUrl.includes('benchmarkingData')) {
            console.log(`[Proxy Debug] DETAILS Data string: ${JSON.stringify(data).substring(0, 200)}...`);
            if (req.body && req.body.pricingModel) {
            	console.log(`[Proxy Debug] Fetching Cost: ${req.body.pricingModel}`);
            	const p = (data.benchmarkingData || data.profile || [])[0];
            	if (p && p.performanceStats) {
            	     const stat = p.performanceStats.find(s => s.cost && s.cost.length > 0);
            	     if (stat) {
            	         console.log(`[Proxy Debug] Found Cost (${req.body.pricingModel}):`, JSON.stringify(stat.cost[0]));
            	     } else {
            	         console.log(`[Proxy Debug] No cost stats found for ${req.body.pricingModel}`);
            	     }
            	} else {
            	     console.log(`[Proxy Debug] No profiles/stats found.`);
            	}
			}
        }
        
        if (!response.ok) {
            console.log(`[Proxy Error] ${response.status}:`, JSON.stringify(data));
            return res.status(response.status).json(data);
        }

        res.json(data);

    } catch (error) {
        console.log('[Proxy Internal Error]', error);
        res.status(500).json({ error: 'Internal Proxy Error', details: error.message });
    }
});

// --- API: Local Benchmarks (Dev Mode) ---
app.get('/api/local/list', async (req, res) => {
    const fs = await import('fs');
    const dir = path.join(__dirname, '../private/benchmarks');
    if (!fs.existsSync(dir)) {
        return res.json({ items: [] });
    }
    const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
    const items = files.map(f => ({
        name: f,
        mediaLink: `/api/local/file/${f}`
    }));
    res.json({ items });
});

app.get('/api/local/file/:filename', async (req, res) => {
    const fs = await import('fs');
    const filename = req.params.filename;
    // Sanitization to prevent traversing up
    const safeFilename = path.basename(filename); 
    const filepath = path.join(__dirname, '../private/benchmarks', safeFilename);
    
    if (fs.existsSync(filepath)) {
        res.sendFile(filepath);
    } else {
        res.status(404).send('Not found');
    }
});

// --- API: GCS Proxy ---
// Proxies requests to Google Cloud Storage for private buckets.
// Uses server's ADC for authentication.
app.all('/api/gcs/*', async (req, res) => {
    try {
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
        const accessToken = token.token;

        // Path format: /api/gcs/BUCKET_NAME/APP_PATH...
        // Target: https://storage.googleapis.com/BUCKET_NAME/APP_PATH...
        // Express decodes req.params[0], so we MUST re-encode the target path properly 
        // to handle files in folders (which require %2F instead of / in GCS Object API).
        const rawPath = req.params[0];
        
        // Re-encode object names for the /o/ endpoint
        let targetPath = rawPath;
        if (targetPath.includes('/o/')) {
             const parts = targetPath.split('/o/');
             // Encode the object name part
             targetPath = parts[0] + '/o/' + encodeURIComponent(parts[1]);
        }
        
        // Append query string if present (critical for ?alt=media)
        const queryString = new URLSearchParams(req.query).toString();
        const targetUrl = `https://storage.googleapis.com/${targetPath}${queryString ? `?${queryString}` : ''}`;

        console.log(`[GCS Proxy] Forwarding to: ${targetUrl}`);

        const response = await fetch(targetUrl, {
            method: req.method,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                 // Pass explicit Accept header if needed, or rely on fetch defaults
            }
        });

        if (!response.ok) {
             const errText = await response.text();
             console.error(`[GCS Proxy Error] ${response.status}: ${errText}`);
             return res.status(response.status).send(errText);
        }

        const contentType = response.headers.get('content-type');
        if (contentType) res.setHeader('Content-Type', contentType);

        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));

    } catch (error) {
        console.error('[GCS Proxy Internal Error]', error);
        res.status(500).json({ error: 'Internal GCS Proxy Error', details: error.message });
    }
});

const generateUUID = () => crypto.randomUUID();

const parseServerRegressionReport = (content, filePath, metadataContent, jsonContent, planConfigContent) => {
    try {
        const doc = yaml.load(content);
        if (!doc) return null;

        const aggregate = doc.results?.request_performance?.aggregate || {};
        
        const requests = aggregate.requests || {};
        const totalReqs = requests.total || 0;
        const failures = requests.failures || 0;
        const successRate = totalReqs > 0 ? ((totalReqs - failures) / totalReqs) * 100 : 100;
        
        const throughput = aggregate.throughput || {};

        const config = doc.config || {};
        const latency = aggregate.latency || {};

        const ttft = latency.time_to_first_token || {};
        const tpot = latency.time_per_output_token || {};
        const ntpot = latency.normalized_time_per_output_token || {};
        const itl = latency.inter_token_latency || {};

        const parts = filePath.split('/');
        const stageMatch = filePath.match(/_stage_(\d+)_/);
        const stage = stageMatch ? parseInt(stageMatch[1], 10) : 0;

        let durationSeconds = 0;
        if (jsonContent && (jsonContent.benchmark_time_seconds !== undefined || jsonContent.load_summary?.send_duration !== undefined)) {
            durationSeconds = jsonContent.benchmark_time_seconds || jsonContent.load_summary?.send_duration || 0;
        } else {
            const durationStr = doc.run?.time?.duration || '';
            const durationMatch = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);
            if (durationMatch) {
                const h = parseFloat(durationMatch[1] || 0);
                const m = parseFloat(durationMatch[2] || 0);
                const s = parseFloat(durationMatch[3] || 0);
                durationSeconds = h * 3600 + m * 60 + s;
            }
        }

        const requestRate = doc.scenario?.load?.standardized?.rate_qps || doc.scenario?.load?.rate_qps || doc.config?.rate_qps || 0;
        
        let date = 'Unknown';
        let runId = 'Unknown';
        let suite = 'Unknown';

        if (parts[1] === 'optimized-baseline') {
            date = parts[4] || 'Unknown';
            runId = parts[5] || 'Unknown';
            suite = `${parts[1]}/${parts[2]}/${parts[3]}`;
        } else {
            date = parts[3] || 'Unknown';
            runId = parts[4] || 'Unknown';
            suite = `${parts[1] || 'gke'}/${parts[2] || 'standalone'}`;
        }

        let model = 'Unknown';
        let githubRunId = null;
        let githubRepository = null;
        let hardware = 'Unknown';
        let metaDoc = null;
        if (metadataContent) {
            try {
                metaDoc = yaml.load(metadataContent);
                if (metaDoc) {
                    if (metaDoc.model) {
                        model = metaDoc.model;
                    }
                    if (metaDoc.github_run_id) {
                        githubRunId = String(metaDoc.github_run_id);
                    }
                    if (metaDoc.github_repository) {
                        githubRepository = String(metaDoc.github_repository);
                    }
                    let accel = metaDoc.accelerator || null;
                    if (accel) {
                        accel = String(accel).toLowerCase();
                        if (accel === 'tpu-v6' || accel.includes('v6')) {
                            hardware = 'TPU v6e';
                        } else if (accel === 'tpu-v7' || accel.includes('v7') || accel.includes('tpu7')) {
                            hardware = 'TPU v7';
                        } else if (accel.includes('h100')) {
                            hardware = 'H100';
                        } else if (accel.includes('a100')) {
                            hardware = 'A100';
                        } else if (accel.includes('l4')) {
                            hardware = 'L4';
                        } else if (accel === 'gpu') {
                            hardware = 'GPU';
                        } else {
                            hardware = metaDoc.accelerator;
                        }
                    } else if (metaDoc.namespace) {
                        const ns = String(metaDoc.namespace).toLowerCase();
                        if (ns.includes('tpu')) {
                            hardware = 'TPU';
                        } else if (ns.includes('gpu')) {
                            hardware = 'GPU';
                        }
                    }
                }
            } catch (e) {
                // Ignore
            }
        }

        // Fallback to plan config.yaml if accelerator is still Unknown or generic TPU/GPU
        if ((hardware === 'Unknown' || hardware === 'TPU' || hardware === 'GPU') && planConfigContent) {
            console.log(`[Regressions API] Entering fallback block for run ${runId}. Current hardware: ${hardware}`);
            try {
                const planDoc = yaml.load(planConfigContent);
                const accBackend = planDoc?.kustomize?.acceleratorBackend;
                console.log(`[Regressions API] accBackend for ${runId}: ${accBackend}`);
                let inferredHw = null;
                if (accBackend) {
                    const match = accBackend.match(/^(tpu-v\d+|h100|a100|l4)/i);
                    if (match) {
                        const accel = match[1].toLowerCase();
                        if (accel.includes('v6')) inferredHw = 'TPU v6e';
                        else if (accel.includes('v7')) inferredHw = 'TPU v7';
                        else if (accel.includes('v5')) inferredHw = 'TPU v5e';
                        else if (accel.includes('h100')) inferredHw = 'H100';
                        else if (accel.includes('a100')) inferredHw = 'A100';
                        else if (accel.includes('l4')) inferredHw = 'L4';
                    }
                }

                if (!inferredHw) {
                    const stdType = planDoc?.standalone?.acceleratorType?.labelValue || planDoc?.prefill?.acceleratorType?.labelValue;
                    if (stdType) {
                        const match = stdType.match(/(h100|a100|l4|tpu-v\d+)/i);
                        if (match) {
                            const accel = match[1].toLowerCase();
                            if (accel.includes('v6')) inferredHw = 'TPU v6e';
                            else if (accel.includes('v7')) inferredHw = 'TPU v7';
                            else if (accel.includes('v5')) inferredHw = 'TPU v5e';
                            else if (accel.includes('h100')) inferredHw = 'H100';
                            else if (accel.includes('a100')) inferredHw = 'A100';
                            else if (accel.includes('l4')) inferredHw = 'L4';
                        }
                    }
                }

                console.log(`[Regressions API] inferredHw for ${runId}: ${inferredHw}`);
                if (inferredHw) {
                    const isTpuNs = String(metaDoc?.namespace || '').toLowerCase().includes('tpu');
                    const isGpuNs = String(metaDoc?.namespace || '').toLowerCase().includes('gpu') || String(metaDoc?.namespace || '').toLowerCase().includes('nvidia');
                    const isInferredTpu = inferredHw.startsWith('TPU');
                    if ((isTpuNs && isInferredTpu) || (isGpuNs && !isInferredTpu) || (!isTpuNs && !isGpuNs)) {
                        hardware = inferredHw;
                        console.log(`[Regressions API] hardware resolved to: ${hardware}`);
                    }
                }
            } catch (e) {
                console.error(`[Regressions API] Error in fallback parsing for ${runId}:`, e);
            }
        }

        if (model === 'Unknown') {
            model = config.model || (parts[1] === 'optimized-baseline' ? 'Qwen/Qwen3-32B' : parts[6]) || 'Unknown';
        }
        
        const rawNameLower = filePath.toLowerCase();
        let precision = config.precision || 'Unknown';
        if (precision === 'Unknown') {
            if (rawNameLower.includes('fp8')) precision = 'FP8';
            else if (rawNameLower.includes('fp16')) precision = 'FP16';
            else if (rawNameLower.includes('bf16')) precision = 'BF16';
        }

        let serving_engine = config.serving_engine || config.backend || 'Unknown';
        if (serving_engine === 'Unknown') {
            if (rawNameLower.includes('vllm')) serving_engine = 'vLLM';
            else if (rawNameLower.includes('tgi')) serving_engine = 'TGI';
            else if (rawNameLower.includes('tensorrt')) serving_engine = 'TensorRT-LLM';
        }

        return {
            id: generateUUID(),
            filePath,
            date,
            runId,
            suite,
            model,
            model_name: model,
            github_run_id: githubRunId,
            github_repository: githubRepository,
            hardware: hardware,
            precision: precision,
            serving_engine,
            stage,
            duration: durationSeconds,
            request_rate: requestRate,
            success_rate: successRate,
            qps: throughput.request_rate?.mean || 0,
            output_token_rate: throughput.output_token_rate?.mean || 0,
            total_token_rate: throughput.total_token_rate?.mean || 0,
            input_token_rate: (throughput.total_token_rate?.mean || 0) - (throughput.output_token_rate?.mean || 0),
            ttft: {
                p50: (ttft.p50 || 0) * 1000,
                p90: (ttft.p90 || 0) * 1000,
                p99: (ttft.p99 || 0) * 1000,
            },
            tpot: {
                p50: (tpot.p50 || 0) * 1000,
                p90: (tpot.p90 || 0) * 1000,
                p99: (tpot.p99 || 0) * 1000,
            },
            ntpot: {
                p50: (ntpot.p50 || 0) * 1000,
                p90: (ntpot.p90 || 0) * 1000,
                p99: (ntpot.p99 || 0) * 1000,
            },
            itl: {
                p50: (itl.p50 || 0) * 1000,
                p90: (itl.p90 || 0) * 1000,
                p99: (itl.p99 || 0) * 1000,
            }
        };
    } catch (e) {
        return null;
    }
};

let regressionsCache = null;
let lastRegressionsFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

app.get('/api/regressions', async (req, res) => {
    const bypassCache = req.query.refresh === 'true';
    const now = Date.now();
    
    if (regressionsCache && (now - lastRegressionsFetch < CACHE_TTL) && !bypassCache) {
        console.log('[Regressions API] Returning cached data');
        return res.json(regressionsCache);
    }
    
    try {
        console.log('[Regressions API] Fetching fresh data from GCS...');
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
        const accessToken = token.token;

        let allItems = [];
        let pageToken = '';
        let hasMore = true;
        
        while (hasMore) {
            const listUrl = `https://storage.googleapis.com/storage/v1/b/llm-d-benchmarks/o?prefix=regressions/optimized-baseline/` +
                (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
            const response = await fetch(listUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!response.ok) {
                throw new Error(`Failed to list GCS bucket: ${response.status}`);
            }
            const data = await response.json();
            if (data.items) {
                allItems = allItems.concat(data.items);
            }
            if (data.nextPageToken) {
                pageToken = data.nextPageToken;
            } else {
                hasMore = false;
            }
        }

        const reportItems = allItems.filter(item => item.name.endsWith('.yaml') && item.name.includes('benchmark_report_v0.2'));
        const reports = [];

        await Promise.all(reportItems.map(async (item) => {
            try {
                const parentPath = item.name.substring(0, item.name.lastIndexOf('/'));
                const metadataPath = parentPath + '/run_metadata.yaml';

                const filename = item.name.substring(item.name.lastIndexOf('/') + 1);
                const jsonFilename = filename.replace('benchmark_report_v0.2,_', '').replace('.yaml', '');
                const jsonPath = parentPath + '/' + jsonFilename;

                const parts = item.name.split('/');
                let configPath = '';
                if (parts.length >= 6) {
                    configPath = parts.slice(0, 6).join('/') + '/plan/' + parts[1] + '/config.yaml';
                }

                const reportUrl = `https://storage.googleapis.com/storage/v1/b/llm-d-benchmarks/o/${encodeURIComponent(item.name)}?alt=media`;
                const metadataUrl = `https://storage.googleapis.com/storage/v1/b/llm-d-benchmarks/o/${encodeURIComponent(metadataPath)}?alt=media`;
                const jsonUrl = `https://storage.googleapis.com/storage/v1/b/llm-d-benchmarks/o/${encodeURIComponent(jsonPath)}?alt=media`;
                const configUrl = configPath ? `https://storage.googleapis.com/storage/v1/b/llm-d-benchmarks/o/${encodeURIComponent(configPath)}?alt=media` : '';

                const [reportRes, metadataRes, jsonRes, configRes] = await Promise.all([
                    fetch(reportUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }),
                    fetch(metadataUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }).catch(() => null),
                    fetch(jsonUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }).catch(() => null),
                    configUrl ? fetch(configUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }).catch(() => null) : null
                ]);

                if (!reportRes.ok) return;

                const content = await reportRes.text();
                let metadataContent = null;
                if (metadataRes && metadataRes.ok) {
                    metadataContent = await metadataRes.text();
                }

                let jsonContent = null;
                if (jsonRes && jsonRes.ok) {
                    try {
                        jsonContent = await jsonRes.json();
                    } catch (err) {
                        console.warn('Failed to parse JSON content:', jsonPath, err);
                    }
                }

                let planConfigContent = null;
                if (configRes) {
                    if (configRes.ok) {
                        planConfigContent = await configRes.text();
                    } else {
                        console.warn(`[Regressions API] Failed to fetch configUrl: ${configUrl} status: ${configRes.status}`);
                    }
                }

                const parsed = parseServerRegressionReport(content, item.name, metadataContent, jsonContent, planConfigContent);
                if (parsed) reports.push(parsed);
            } catch (e) {
                console.warn(`Failed to parse file ${item.name}:`, e);
            }
        }));

        regressionsCache = reports;
        lastRegressionsFetch = now;
        res.json(reports);
    } catch (err) {
        console.error('[Regressions API Error]', err);
        res.status(500).json({ error: 'Failed to fetch regressions', details: err.message });
    }
});

// Serve Static Assets (Production Build)
app.use(express.static(path.join(__dirname, '../dist'), { index: false }));

// SPA Fallback: Serve index.html for any unknown routes
// SPA Fallback: Serve index.html with runtime env injection
app.get('*', async (req, res) => {
    try {
        const fs = await import('fs/promises');
        const indexPath = path.join(__dirname, '../dist', 'index.html');
        
        let html = await fs.readFile(indexPath, 'utf-8');
        
        // Inject runtime environment variables
        // We inject GOOGLE_API_KEY specifically as it's required for the dashboard
        // Priorities: Process Env > Build Time (already in HTML)
        const runtimeEnv = {
            GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || process.env.VITE_GOOGLE_API_KEY || process.env.REACT_APP_GOOGLE_API_KEY
        };

        const scriptTag = `<script>window.env = ${JSON.stringify(runtimeEnv)};</script>`;
        
        // Inject before </head>
        html = html.replace('</head>', `${scriptTag}</head>`);
        
        res.send(html);
    } catch (e) {
        console.error('Error serving index.html:', e);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
});
