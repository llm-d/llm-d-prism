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


import { CacheManager } from '../utils/cacheManager';
import { parseGiqData } from '../utils/dataParser';

export const useGIQ = ({ pendingRequests, addToast, setLoading }) => {
    const fetchGiqData = async (projectId, authToken, forceRefresh = false, onProgress = null) => {
            console.log(`[useGIQ] fetchGiqData START for ${projectId}. Token provided: ${!!authToken}, forceRefresh: ${forceRefresh}`);
            // Deduplication Check: Return existing promise if already fetching/loading
            if (pendingRequests.current.has(`giq:${projectId}`) && !forceRefresh) {
                 console.log(`[Dedupe] Already fetching/loading GIQ ${projectId}, returning shared promise.`);
                 return pendingRequests.current.get(`giq:${projectId}`);
            }
    
            const fetchPromise = (async () => {
                try {
                    // Cache Check
                    if (!forceRefresh) {
                        const cached = await CacheManager.get('giq', projectId);
                        if (cached) {
                            // Self-healing: if cached data has 0 entries, treat as a miss and refetch.
                            // This avoids stale empty results (e.g., from before a parsing fix) 
                            // persisting for the full 24-hour TTL without a manual version bump.
                            if (!cached.entries || cached.entries.length === 0) {
                                console.warn(`[Cache Miss] Cached GIQ result for ${projectId} has 0 entries — discarding and refetching.`);
                                await CacheManager.remove('giq', projectId);
                            } else {
                                console.log(`[Cache Hit] Loading ${cached.entries.length} entries from cache for ${projectId}`);
                                addToast(`[Cache] Loaded GIQ: ${projectId}`, 'success');
                                return cached;
                            }
                        }
                    }

                    console.log(`[Network] Fetching GIQ data for project: ${projectId}`);
    
                    // Step 1: Fetch list of profiles (Discovery)
                    const KNOWN_USE_CASES = [
                        "Advanced Customer Support",
                        "Chatbot (ShareGPT)",
                        "Code Completion",
                        "Deep Research",
                        "Multi Agent Large Document Summarization",
                        "Text Generation",
                        "Text Summarization"
                    ];
    
                    const fullListJson = { profile: [] }; 
    
                    // Fetch function for a single use/case (handling pagination)
                    const fetchProfilesForUseCase = async (uc) => {
                         let nextPageToken = null;
                         let pageCount = 0;
                         const results = [];
                         
                         console.log(`[GIQ Discovery] Fetching use case: "${uc}"...`);
    
                         do {
                            pageCount++;
                            if (onProgress) {
                                onProgress({
                                    loaded: Math.min(pageCount, 10),
                                    total: 10,
                                    currentAction: `Discovering profiles page ${pageCount}...`
                                });
                            }
                            const bodyPayload = { pageToken: nextPageToken };
                            const fetchHeaders = {
                                'Content-Type': 'application/json',
                                'X-Goog-User-Project': projectId
                            };
                            
                            if (authToken) {
                                fetchHeaders['Authorization'] = `Bearer ${authToken}`;
                            }
    
                            const listResponse = await fetch(`/api/giq/v1/profiles:fetch`, {
                                method: 'POST',
                                headers: fetchHeaders,
                                body: JSON.stringify(bodyPayload),
                                cache: 'no-store'
                            });
    
                            if (!listResponse.ok) {
                                const errorText = await listResponse.text();
                                console.warn(`[GIQ] Discovery failed: ${errorText}`);
                                throw new Error(`GIQ Discovery Failed: ${listResponse.status} ${listResponse.statusText} - ${errorText}`);
                            }
    
                            const listJson = await listResponse.json();
                            const pageProfiles = listJson.profile || [];
                            results.push(...pageProfiles);
                            nextPageToken = listJson.nextPageToken;
    
                         } while (nextPageToken && pageCount < 10);
                         return results;
                    };
    
                    const allProfiles = await fetchProfilesForUseCase(null);
                    console.log(`[GIQ Discovery] Found ${allProfiles.length} total profiles.`);
                    
                    const seenProfiles = new Set();
                    const uniqueProfiles = [];
                    allProfiles.forEach((p, index) => {
                        // Use the profile name/id if available, otherwise fallback to the granular config
                        // We also include the index to ensure we don't accidentally collapse 
                        // if the API returns separate entries for things we can't see yet.
                        const profileId = p.name || p.id || `profile-${index}`;
                        const profileKey = `${profileId}|${p.modelServerInfo?.model}|${p.workloadSpec?.useCase}`;
                        
                        if (!seenProfiles.has(profileKey)) {
                            seenProfiles.add(profileKey);
                            uniqueProfiles.push(p);
                            fullListJson.profile.push(p);
                        }
                    });
    
                    const profiles = uniqueProfiles;
                    console.log(`[GIQ Discovery] Found ${profiles.length} unique profiles after filtering.`);
                    const listJson = fullListJson;
                    const initialParsed = parseGiqData(listJson, projectId);
                    console.log(`[GIQ Discovery] Parsed into ${initialParsed.entries.length} data entries.`);
                
                    const detailedResults = [];
                    const fullResponses = { list: listJson, details: [] };
                    
                    const DETAIL_BATCH_SIZE = 5;
                    const totalDetailsBatches = Math.ceil(profiles.length / DETAIL_BATCH_SIZE);
                    for (let i = 0; i < profiles.length; i += DETAIL_BATCH_SIZE) {
                        if (i > 0) await new Promise(r => setTimeout(r, 200));
                        const batch = profiles.slice(i, i + DETAIL_BATCH_SIZE);
                        const batchIndex = Math.floor(i / DETAIL_BATCH_SIZE);
                        if (onProgress) {
                            onProgress({
                                loaded: batchIndex,
                                total: totalDetailsBatches,
                                currentAction: `Fetching details for ${batch.map(p => p.modelServerInfo?.model).filter(Boolean).join(', ')}...`
                            });
                        }
                        try {
                            const batchPromises = batch.map(async (p) => {
                                if (!p.modelServerInfo) return [];

                                let attempts = 0;
                                const maxAttempts = 3;

                                while (attempts < maxAttempts) {
                                    try {
                                        const detailRes = await fetch(`/api/giq/v1/benchmarkingData:fetch`, {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'X-Goog-User-Project': projectId,
                                                'Authorization': `Bearer ${authToken}`
                                            },
                                            body: JSON.stringify({
                                                modelServerInfo: p.modelServerInfo,
                                                useCase: p.workloadSpec?.useCase
                                            }),
                                            cache: 'no-store'
                                        });

                                        if (detailRes.ok) {
                                            const detailJson = await detailRes.json();
                                            fullResponses.details.push({ model: p.modelServerInfo.model, data: detailJson });
                                            return parseGiqData(detailJson, projectId);
                                        } else if (detailRes.status === 429 || detailRes.status >= 500) {
                                            attempts++;
                                            if (attempts < maxAttempts) {
                                                console.log(`[GIQ Retry] detail fetch for ${p.modelServerInfo.model} failed with ${detailRes.status}. Retrying (${attempts}/${maxAttempts})...`);
                                                await new Promise(r => setTimeout(r, 1000 * attempts));
                                                continue;
                                            }
                                        }

                                        console.warn(`[GIQ Warn] Final failure for ${p.modelServerInfo.model} details. Status: ${detailRes.status}`);
                                        return [];
                                    } catch (err) {
                                        attempts++;
                                        if (attempts < maxAttempts) {
                                            console.log(`[GIQ Retry] Network error fetching ${p.modelServerInfo.model}. Retrying (${attempts}/${maxAttempts})...`);
                                            await new Promise(r => setTimeout(r, 1000 * attempts));
                                            continue;
                                        }
                                        console.warn(`Failed to fetch details for ${p.modelServerInfo.model}`, err);
                                        return [];
                                    }
                                }
                                return [];
                            });
    
                            const batchResults = await Promise.all(batchPromises);
                            batchResults.forEach(r => detailedResults.push(r));
                        } catch (batchErr) {
                            console.error("Batch detailed fetch failed", batchErr);
                        }
                    }
    
                    const flatDetailed = detailedResults.flat();
                    
                    // Simple and safe merging: 
                    // 1. Identify which models we have detailed points for
                    const detailedModels = new Set(flatDetailed.map(e => e.metadata?.model_name || e.model_name));
                    
                    // 2. Only keep discovery entries for models where we HAVEN'T fetched details
                    // This is a bit broader than the config-specific merge, but safer until we 
                    // can verify config key stability.
                    const filteredInitial = initialParsed.filter(e => !detailedModels.has(e.metadata?.model_name || e.model_name));
                    
                    const allEntries = [...filteredInitial, ...flatDetailed]; 
                    
                    const modelGroups = new Map();
                    allEntries.forEach(e => {
                        if (e._raw && e._raw.model_info && e._raw.model_info.model) {
                            const rModel = e._raw.model_info.model;
                            const rServer = e._raw.model_info.modelServer || 'vllm'; 
                            const rAccelerator = e._raw.target_stat?.acceleratorType || 
                                                 e._raw.parent_profile_meta?.acceleratorType || 
                                                 e.metadata?.accelerator_type || 
                                                 e.accelerator_type || 
                                                 'unknown';
                            const rawKey = `${rModel}|${rServer}|${rAccelerator}`;
                            if (!modelGroups.has(rawKey)) {
                                modelGroups.set(rawKey, {
                                    entries: [],
                                    rawModel: rModel,
                                    rawServer: rServer,
                                    rawAccelerator: rAccelerator
                                });
                            }
                            modelGroups.get(rawKey).entries.push(e);
                        }
                    });
    
                    const enrichTasks = [];
                    const pricingTargets = [
                        { key: 'spot', field: 'spot' },
                        { key: 'on-demand', field: 'on_demand' },
                        { key: '1-year-cud', field: 'cud_1y' },
                        { key: '3-years-cud', field: 'cud_3y' }
                    ];
    
                    for (const [key, group] of modelGroups) {
                        pricingTargets.forEach(target => {
                            enrichTasks.push(async () => {
                                try {
                                    const res = await fetch(`/api/giq/v1/benchmarkingData:fetch`, {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'X-Goog-User-Project': projectId,
                                            'Authorization': `Bearer ${authToken}`
                                        },
                                        body: JSON.stringify({
                                            modelServerInfo: {
                                                model: group.rawModel,
                                                modelServer: group.rawServer
                                            },
                                            pricingModel: target.key
                                        })
                                    });
                                    
                                    if (res.ok) {
                                        const json = await res.json();
                                        const profiles = json.profile || json.benchmarkingData || [];
                                        const kFactors = [];
                                        const rawCosts = [];
                                        const fetchedPoints = [];
    
                                        profiles.forEach(p => {
                                            const pAcc = p.acceleratorType || p.resourcesUsed?.acceleratorType;
                                            if (group.rawAccelerator !== 'unknown' && pAcc && pAcc !== group.rawAccelerator) return;
    
                                            (p.performanceStats || []).forEach(stat => {
                                                const stringsToNum = (v) => v ? Number(v) : 0;
                                                const tput = stringsToNum(stat.outputTokensPerSecond) || 
                                                             stringsToNum(stat.outputTokenThroughputTokensPerSecond) || 
                                                             stringsToNum(stat.throughputTokensPerSecond) ||
                                                             stringsToNum(stat.performanceMetrics?.outputTokensPerSecond) ||
                                                             stringsToNum(stat.performanceMetrics?.outputTokenThroughputTokensPerSecond) ||
                                                             stringsToNum(stat.performanceMetrics?.throughputTokensPerSecond);
    
                                                if (stat.cost) {
                                                     stat.cost.forEach(c => {
                                                         let val = 0;
                                                         const cObj = c.costPerMillionOutputTokens || c.cost_per_million_output_tokens ||
                                                                      c.costPerMillionTokens || c.cost_per_million_tokens ||
                                                                      c.totalCost || c.total_cost ||
                                                                      c.amount || (c.units !== undefined ? c : null);
    
                                                         if (cObj) val = (Number(cObj.units || 0) + (Number(cObj.nanos || 0) / 1e9));
                                                         if (val > 0) {
                                                             if (tput > 0) {
                                                                 kFactors.push(val * tput);
                                                                 fetchedPoints.push({ tput, cost: val });
                                                             }
                                                             rawCosts.push(val); 
                                                         }
                                                     });
                                                }
                                            });
                                        });
    
                                        let avgK = 0, avgRawCost = 0;
                                        if (kFactors.length > 0) avgK = kFactors.reduce((a, b) => a + b, 0) / kFactors.length;
                                        if (rawCosts.length > 0) avgRawCost = rawCosts.reduce((a, b) => a + b, 0) / rawCosts.length;
    
                                        if (avgK > 0 || avgRawCost > 0) {
                                            group.entries.forEach(e => {
                                                 if (!e.metrics) e.metrics = {};
                                                 if (!e.metrics.cost) e.metrics.cost = {};
                                                 const eTput = e.metrics.throughput || e.metrics.output_tput;
                                                 let finalCost = 0, method = 'none';
                                                 if (eTput > 0 && fetchedPoints.length > 0) {
                                                     const match = fetchedPoints.find(p => Math.abs(p.tput - eTput) / eTput < 0.05);
                                                     if (match) {
                                                        finalCost = match.cost;
                                                        method = 'enriched_explicit_match';
                                                     } else if (avgK > 0) {
                                                        finalCost = avgK / eTput;
                                                        method = 'enriched_derived';
                                                     }
                                                 } else if (avgK > 0 && avgRawCost > 0) {
                                                      finalCost = avgRawCost;
                                                      method = 'enriched_flat_fallback';
                                                 }
    
                                                 if ((e.metrics.cost[target.field] > 0 && e.metrics.cost.source === 'explicit_stat') || (e.metrics.cost._debug && e.metrics.cost._debug[target.field])) return;
                                                 if (finalCost > 0) {
                                                     e.metrics.cost[target.field] = finalCost;
                                                     if (target.key === 'on-demand') {
                                                         e.metrics.cost.input = 0; 
                                                         e.metrics.cost.output = finalCost; 
                                                         e.metrics.cost.total = finalCost; 
                                                         e.metrics.cost.source = method; 
                                                     }
                                                 }
                                            });
                                        }
                                    }
                                } catch (err) {
                                    console.warn(`Cost fetch failed for ${group.rawModel} [${target.key}]`, err);
                                }
                            });
                        });
                    }
    
                    const BATCH_SIZE = 3;
                    const totalEnrichBatches = Math.ceil(enrichTasks.length / BATCH_SIZE);
                    for (let i = 0; i < enrichTasks.length; i += BATCH_SIZE) {
                        const batch = enrichTasks.slice(i, i + BATCH_SIZE);
                        const enrichIndex = Math.floor(i / BATCH_SIZE);
                        if (onProgress) {
                            onProgress({
                                loaded: enrichIndex,
                                total: totalEnrichBatches,
                                currentAction: `Enriching pricing data batch ${enrichIndex + 1} of ${totalEnrichBatches}...`
                            });
                        }
                        try {
                            await Promise.all(batch.map(task => task()));
                        } catch (batchErr) {
                            console.error("Batch enrichment failed", batchErr);
                        }
                    }
    

                    const resultEntries = allEntries.map(e => ({ ...e, source: `giq:${projectId}` }));
    
                    const resultPayload = {
                        sourceName: `giq:${projectId}`,
                        entries: resultEntries,
                        rawResponse: fullResponses, 
                        profile: {
                            bucketName: projectId,  
                            files: [], 
                            entryCount: allEntries.length,
                            profileCount: profiles.length,
                            loadedAt: new Date().toISOString(),
                            error: null
                        }
                    };
                    
                    const cachePayload = { ...resultPayload, rawResponse: null };
                    const saved = await CacheManager.set('giq', projectId, cachePayload);
                    if (!saved) {
                        addToast(`[Error] Cache Full - Could not save GIQ`, 'error');
                    } else {
                        addToast(`[Network] Fetched GIQ: ${projectId}`, 'info');
                    }
                    if (onProgress) {
                        onProgress({ loaded: 1, total: 1, status: 'completed', currentAction: 'Completed' });
                    }
                    return resultPayload;
    
                } catch (error) {
                    console.error("GIQ API Fetch Error:", error);
                    if (onProgress) {
                        onProgress({ status: 'failed', currentAction: error.message });
                    }
                    return {
                        sourceName: `giq:${projectId}`,
                        entries: [],
                        rawResponse: { error: error.message },
                        profile: {
                            bucketName: projectId,
                            files: [],
                            entryCount: 0,
                            profileCount: 0,
                            loadedAt: new Date().toISOString(),
                            error: error.message
                        }
                    };
                } finally {
                    pendingRequests.current.delete(`giq:${projectId}`);
                }
            })();
    
            if (!forceRefresh) {
                pendingRequests.current.set(`giq:${projectId}`, fetchPromise);
            }
            return fetchPromise;
        };
    return { fetchGiqData };
};
