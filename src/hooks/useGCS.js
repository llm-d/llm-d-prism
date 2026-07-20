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
import { parseJsonEntry, parseLogFile } from '../utils/dataParser';
import { parseReportV02, stageToEntry } from '../utils/benchmarkReportV02Parser';

const limitConcurrency = async (tasks, limit, onProgressUpdate) => {
    let activeCount = 0;
    let nextIndex = 0;
    let loadedCount = 0;
    const totalCount = tasks.length;

    return new Promise((resolve) => {
        if (totalCount === 0) {
            resolve();
            return;
        }

        const runNext = () => {
            if (nextIndex >= totalCount && activeCount === 0) {
                resolve();
                return;
            }

            while (activeCount < limit && nextIndex < totalCount) {
                const index = nextIndex++;
                activeCount++;
                const task = tasks[index];

                (async () => {
                    try {
                        await task();
                    } finally {
                        activeCount--;
                        loadedCount++;
                        if (onProgressUpdate) {
                            onProgressUpdate(loadedCount, totalCount);
                        }
                        runNext();
                    }
                })();
            }
        };

        runNext();
    });
};

export const useGCS = ({ pendingRequests, addToast, accessToken }) => {
    const fetchBucketData = useCallback(async (bucket, forceRefresh = false, prefix = '', onProgress = null) => {
        const cleanBucketName = bucket.replace(/^gs:\/\//, '');
        const cacheKey = prefix ? `${cleanBucketName}:${prefix}` : cleanBucketName;

        if (pendingRequests.current.has(`gcs:${cacheKey}`) && !forceRefresh) {
             console.log(`[Dedupe] Already fetching ${cacheKey}, returning shared promise.`);
             return pendingRequests.current.get(`gcs:${cacheKey}`);
        }

        if (!forceRefresh) {
            const cached = await CacheManager.get('gcs', cacheKey);
            if (cached) {
                console.log(`[Cache Hit] Loading GCS bucket ${cacheKey} from cache.`);
                addToast(`[Cache] Loaded ${cleanBucketName}${prefix ? ` (${prefix})` : ''}`, 'success');
                return cached;
            }
        }

        let usingProxy = false;
        
        const fetchPromise = (async () => {
            try {
                const queryParams = new URLSearchParams();
                if (prefix) {
                    queryParams.set('prefix', prefix);
                }
                const queryString = queryParams.toString();
                const suffix = queryString ? `?${queryString}` : '';
                const fetchOpts = forceRefresh ? { cache: 'no-cache' } : {};
                let response = await fetch(`https://storage.googleapis.com/storage/v1/b/${cleanBucketName}/o${suffix}`, fetchOpts);
                
                if (response.status === 401 || response.status === 403) {
                    console.log(`[Bucket] Public access denied for ${cleanBucketName}, trying proxy...`);
                    const headers = {};
                    if (accessToken) {
                        headers['X-Prism-Github-Token'] = accessToken;
                    }
                    response = await fetch(`/api/gcs/storage/v1/b/${cleanBucketName}/o${suffix}`, {
                        headers,
                        ...fetchOpts
                    });
                    if (response.ok) usingProxy = true;
                }

                if (response.status === 404) throw new Error('Bucket not found.');
                if (response.status === 401 || response.status === 403) throw new Error('Access denied. Bucket must be public or accessible by server service account.');
                if (!response.ok) throw new Error(`Failed to access bucket (${response.status}).`);
                
                const json = await response.json();
                if (!json.items) throw new Error('No files found in bucket.');

                const filesToProcess = json.items.filter(item => !item.name.endsWith('/'));
                if (filesToProcess.length === 0) throw new Error('No valid files found in bucket.');

                const newEntries = [];
                const fileMetadata = [];

                const tasks = filesToProcess.map((file) => async () => {
                    try {
                        let fileUrl = file.mediaLink;
                        if (usingProxy && fileUrl.startsWith('https://storage.googleapis.com/')) {
                            const path = fileUrl.replace('https://storage.googleapis.com/', '');
                            fileUrl = `/api/gcs/${path}`;
                        }

                        const fileHeaders = {};
                        if (accessToken && fileUrl.startsWith('/api/gcs/')) {
                            fileHeaders['X-Prism-Github-Token'] = accessToken;
                        }
                        const fileRes = await fetch(fileUrl, {
                            headers: fileHeaders,
                            ...fetchOpts
                        });
                        if (!fileRes.ok) throw new Error(`Fetch failed: ${fileRes.status}`);
                        
                        const content = await fileRes.text();
                        let entries = [];

                        try {
                            const jsonContent = JSON.parse(content);
                            if (jsonContent.metrics || jsonContent.load_summary) {
                                const entry = parseJsonEntry({ ...jsonContent, source: `gcs:${cleanBucketName}` }, file.name);
                                entries = [entry];
                            } else if (jsonContent.format === 'brv02' && Array.isArray(jsonContent.entries)) {
                                for (const stageEntry of jsonContent.entries) {
                                    if (stageEntry.raw_report) {
                                        const parsedStage = parseReportV02(stageEntry.raw_report, file.name);
                                        if (parsedStage) {
                                            parsedStage.runId = jsonContent.runId;
                                            parsedStage.runLabel = jsonContent.runLabel;
                                            parsedStage.github_author = jsonContent.github_author;
                                            
                                            // Extract submission details from GCS contexts.custom
                                            const customMeta = {};
                                            if (file.contexts?.custom) {
                                                Object.keys(file.contexts.custom).forEach(k => {
                                                    customMeta[k] = file.contexts.custom[k]?.value;
                                                });
                                            }
                                            parsedStage.submission_state = customMeta.submission_state || customMeta.state || 'submitted_pending_processing';
                                            parsedStage.submitted_at = jsonContent.submitted_at || file.timeCreated || file.updated || null;
                                            parsedStage.approved_at = customMeta.approved_at || null;

                                            const resolvedWellLit = jsonContent.well_lit_path || customMeta.well_lit_path || null;
                                            parsedStage.well_lit_path = resolvedWellLit;
                                            parsedStage.wellLitPath = resolvedWellLit;
                                            const entry = stageToEntry(parsedStage);
                                            entries.push(entry);
                                        }
                                    }
                                }
                                console.log(`[useGCS] Successfully parsed results-store file ${file.name} with ${entries.length} stages.`);
                            }
                        } catch (err) {
                            console.warn(`[useGCS] Failed to parse JSON for file ${file.name}:`, err);
                        }
                        
                        if (entries.length === 0) {
                            entries = parseLogFile(content, file.name);
                        }
                        
                        if (entries.length > 0) {
                            entries.forEach(e => {
                                e.source = `gcs:${cleanBucketName}`; 
                                let type = 'storage';

                                if (e.source_info) {
                                    e.source_info.origin = `gcs:${cleanBucketName}`;
                                    if (e.source_info.type !== 'benchmark_report_v02') {
                                        e.source_info.type = type;
                                    }
                                } else {
                                    e.source_info = {
                                        type,
                                        origin: `gcs:${cleanBucketName}`,
                                        file_identifier: file.name,
                                        raw_url: file.mediaLink
                                    };
                                }
                                e.raw_url = `https://storage.googleapis.com/${cleanBucketName}/${file.name}`;
                                
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
                            fileMetadata.push({ name: file.name, entryCount: entries.length });
                        }
                    } catch (e) {
                        console.warn(`Failed to process ${file.name}:`, e);
                        fileMetadata.push({ name: file.name, entryCount: 0, error: e.message });
                    }
                });

                if (onProgress) {
                    onProgress({ loaded: 0, total: tasks.length, bucketName: cleanBucketName });
                }

                await limitConcurrency(tasks, 6, (loaded, total) => {
                    if (onProgress) {
                        onProgress({ loaded, total, bucketName: cleanBucketName });
                    }
                });

                const result = {
                    bucketName: cleanBucketName,
                    entries: newEntries,
                    profile: {
                        bucketName: cleanBucketName,
                        prefix: prefix || null,
                        files: fileMetadata,
                        entryCount: fileMetadata.filter(f => f.entryCount > 0).length, 
                        loadedAt: new Date().toISOString(),
                        error: null
                    }
                };
                
                const saved = await CacheManager.set('gcs', cacheKey, result);
                if (!saved) {
                    addToast(`[Error] Cache Full - Could not save ${cleanBucketName}${prefix ? ` (${prefix})` : ''}`, 'error');
                } else {
                    addToast(`[Network] Fetched ${cleanBucketName}${prefix ? ` (${prefix})` : ''}`, 'info');
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

        if (!forceRefresh) pendingRequests.current.set(`gcs:${cacheKey}`, fetchPromise);
        
        try {
            return await fetchPromise;
        } finally {
            pendingRequests.current.delete(`gcs:${cacheKey}`);
        }
    }, [addToast, pendingRequests, accessToken]);

    return { fetchBucketData };
};
