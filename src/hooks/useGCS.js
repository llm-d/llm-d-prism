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

import { useCallback } from 'react';
import { CacheManager } from '../utils/cacheManager';

export const useGCS = ({ pendingRequests, addToast }) => {
    const fetchBucketData = useCallback(async (bucket, forceRefresh = false, pageToken = '') => {
        const cleanBucketName = bucket.replace(/^gs:\/\//, '').replace(/\/$/, '');
        const shouldCache = cleanBucketName !== 'llm-d-benchmarks' && cleanBucketName !== 'llm-d-benchmarks-staging';

        if (pendingRequests.current.has(`gcs:${cleanBucketName}`) && !forceRefresh && !pageToken) {
             console.log(`[Dedupe] Already fetching GCS:${cleanBucketName}, returning shared promise.`);
             return pendingRequests.current.get(`gcs:${cleanBucketName}`);
        }

        if (shouldCache && !forceRefresh && !pageToken) {
            const cached = await CacheManager.get('gcs', cleanBucketName);
            if (cached) {
                console.log(`[Cache Hit] Loading GCS bucket ${cleanBucketName} from cache.`);
                addToast(`[Cache] Loaded ${cleanBucketName}`, 'success');
                return cached;
            }
        }

        const fetchPromise = (async () => {
            try {
                const token = localStorage.getItem('github_oauth_token');
                const headers = token ? { 'X-Prism-Github-Token': token } : {};
                const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
                const response = await fetch(`/api/benchmarks?bucket=${cleanBucketName}&limit=100${tokenParam}`, { headers });

                if (!response.ok) throw new Error(`Failed to fetch benchmarks listing (${response.status})`);

                const json = await response.json();
                if (!json.items) throw new Error('No files found in bucket.');

                const newEntries = [];
                const fileMetadata = [];

                json.items.forEach((item) => {
                    try {
                        const hasSummary = item.summary && Array.isArray(item.summary) && item.summary.length > 0;
                        let entries = [];

                        if (hasSummary) {
                            // Map summary stages directly, marking isFull: false
                            entries = item.summary.map(s => ({
                                ...s,
                                runId: item.runId,
                                isFromResultStore: item.isFromResultStore || false,
                                source: `gcs:${cleanBucketName}`,
                                downloadUrl: item.downloadUrl,
                                isFull: false
                            }));
                        } else {
                            // Synthesize lightweight summary entry from item listing metadata without fetching content
                            const runLabel = item.runLabel ?? null;
                            const hasModel = item.model_name && item.model_name !== 'Unknown';
                            const displayModel = runLabel || (hasModel ? item.model_name : 'Unknown');
                            const displayHardware = item.hardware?.hardware_name || 'Unknown';

                            entries = [{
                                runId: item.runId,
                                runLabel: runLabel,
                                isFromResultStore: item.isFromResultStore || false,
                                model: displayModel,
                                model_name: hasModel ? item.model_name : 'Unknown',
                                hardware: displayHardware,
                                precision: 'Unknown',
                                backend: 'Unknown',
                                isl: 0,
                                osl: 0,
                                timestamp: item.submitted_at || null,
                                throughput: null,
                                latency: { mean: null },
                                components: [],
                                metadata: {
                                    model_name: displayModel,
                                    backend: 'Unknown',
                                    hardware: displayHardware,
                                    accelerator_type: displayHardware,
                                    accelerator_count: 1,
                                    precision: 'Unknown',
                                    timestamp: item.submitted_at || null,
                                    tp: 1,
                                    architecture: 'unknown',
                                    components: []
                                },
                                workload: {
                                    input_tokens: 0,
                                    output_tokens: 0,
                                    stage: 1
                                },
                                github_author: item.github_author,
                                source: `gcs:${cleanBucketName}`,
                                downloadUrl: item.downloadUrl,
                                isFull: false
                            }];
                        }

                        if (entries.length > 0) {
                            entries.forEach(e => {
                                e.source = `gcs:${cleanBucketName}`;
                                e.source_info = {
                                    ...(e.source_info || {}),
                                    type: 'storage',
                                    origin: `gcs:${cleanBucketName}`,
                                    raw_url: item.downloadUrl
                                };
                                if (!e.source_info.file_identifier) {
                                    e.source_info.file_identifier = item.runId;
                                }
                                e.raw_url = item.downloadUrl;

                                if (e.latency?.mean && e.latency.mean < 100) {
                                    e.latency.mean *= 1000;
                                    if (e.latency.p50) e.latency.p50 *= 1000;
                                    if (e.latency.p99) e.latency.p99 *= 1000;
                                    if (e.latency.min) e.latency.min *= 1000;
                                    if (e.latency.max) e.latency.max *= 1000;
                                }
                                if (e.ttft?.mean && e.ttft.mean < 100) {
                                    e.ttft.mean *= 1000;
                                    if (e.ttft.p50) e.ttft.p50 *= 1000;
                                    if (e.ttft.p99) e.ttft.p99 *= 1000;
                                    if (e.ttft.min) e.ttft.min *= 1000;
                                    if (e.ttft.max) e.ttft.max *= 1000;
                                }
                                newEntries.push(e);
                            });
                            fileMetadata.push({ name: item.runId, entryCount: entries.length });
                        }
                    } catch (e) {
                        console.warn(`Failed to process ${item.runId}:`, e);
                        fileMetadata.push({ name: item.runId, entryCount: 0, error: e.message });
                    }
                });

                const result = {
                    bucketName: cleanBucketName,
                    entries: newEntries,
                    nextPageToken: json.nextPageToken || null,
                    profile: {
                        bucketName: cleanBucketName,
                        files: fileMetadata,
                        entryCount: fileMetadata.filter(f => f.entryCount > 0).length, 
                        loadedAt: new Date().toISOString(),
                        error: null,
                        nextPageToken: json.nextPageToken || null,
                        type: 'gcs'
                    }
                };

                if (shouldCache && !pageToken) {
                    const saved = await CacheManager.set('gcs', cleanBucketName, result);
                    if (!saved) {
                        addToast(`[Error] Cache Full - Could not save ${cleanBucketName}`, 'error');
                    } else {
                        addToast(`[Network] Fetched ${cleanBucketName}`, 'info');
                    }
                } else if (!pageToken) {
                    addToast(`[Network] Fetched ${cleanBucketName} (uncached)`, 'info');
                } else {
                    addToast(`[Network] Loaded page from ${cleanBucketName}`, 'info');
                }
                return result;

            } catch (err) {
                console.error(`Error fetching bucket ${bucket}:`, err);
                return {
                    bucketName: cleanBucketName,
                    entries: [],
                    profile: {
                        bucketName: cleanBucketName,
                        files: [],
                        entryCount: 0,
                        loadedAt: new Date().toISOString(),
                        error: err.message
                    }
                };
            }
        })();

        if (!forceRefresh) pendingRequests.current.set(`gcs:${cleanBucketName}`, fetchPromise);
        
        try {
            return await fetchPromise;
        } finally {
            pendingRequests.current.delete(`gcs:${cleanBucketName}`);
        }
    }, [addToast, pendingRequests]);

    return { fetchBucketData };
};
