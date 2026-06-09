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

/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps, no-empty, no-self-assign */
/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps, no-empty */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, ReferenceDot, Label
} from 'recharts';

import { Activity, Clock, Zap, AlertCircle, ChevronDown, ChevronUp, FileJson, ExternalLink, Cloud, Loader, Filter, X, Plus, RefreshCw, Database, Check, CheckCircle, RotateCcw, Sun, Moon, Eye, EyeOff, Trash2, Edit2, Share2, MessageCircle, Target, ArrowLeft } from 'lucide-react';
import { parseJsonEntry, parseLogFile, parseGiqData, normalizeModelName, normalizeHardware, parseLpgLifecycleMetrics, parseLpgRequestLog } from '../utils/dataParser';
import { listFolderRecursive, fetchFileContent, parseDriveMetadata, findFolderByName } from '../utils/googleDrive';
import { defaultState } from '../config/defaultState';

import DataConnectionsPanel from './DataConnectionsPanel';
import { CacheManager } from '../utils/cacheManager';
import { QualityParser, normalizeQualityModelName } from '../utils/qualityParser';

import { CustomLabel, MultiSelectDropdown, Row, CustomChartTooltip, CustomXAxis, CustomYAxis, Card, ChartCard } from './common';
import { FilterPanel } from './Dashboard/FilterPanel';
import { UnifiedDataTable } from './Dashboard/UnifiedDataTable';
import { ThroughputCostChart } from './Dashboard/ThroughputCostChart';
import { RunComparisonChart } from './Dashboard/RunComparisonChart';
import DataInspector from './DataInspector';
import { useDashboardState } from '../hooks/useDashboardState';
import { useDashboardData } from '../hooks/useDashboardData';
import { INTEGRATIONS, getBucket, getRatioType, getEffectiveTp, sortBuckets, findParetoPoint, getNodesAndType, getBenchmarkKey } from '../utils/dashboardHelpers';

const getCleanModelName = (name) => {
    if (!name) return '';
    return name.replace(/\s*\[.*?\]/g, '').replace(/\s*\(.*?\)/g, '').trim();
};

const USE_CASE_META = {
    "Advanced Customer Support": "(~9k/256)",
    "Chatbot (ShareGPT)": "(~128/128)",
    "Code Completion": "(~512/32)",
    "Deep Research": "(~256/4k)",
    "Multi Agent Large Document Summarization": "(~8k/64)",
    "Text Generation": "(~512/2k)",
    "Text Summarization": "(~1k/128)"
};






// Row component moved outside to avoid re-creation on render


// Helper Functions (Moved to Module Scope)
const extractAcceleratorCount = (hardware) => {
    if (!hardware) return 1;
    const match = hardware.match(/\(x(\d+)\)/);
    return match ? parseInt(match[1]) : 1;
};

const getAcceleratorCount = (d) => {
    if (d.metadata?.accelerator_count && d.metadata.accelerator_count > 1) return d.metadata.accelerator_count;
    return extractAcceleratorCount(d.hardware);
};




const MOCK_FALLBACK_DATA_LEGACY = [
    {
        run_id: "Run-1",
        model: "Llama-3-70B",
        hardware: "NVIDIA H100",
        accelerator_count: 8,
        architecture: "Standard TCP",
        latency: { mean: 15.2, p50: 14.8, p99: 18.5 },
        ttft: { mean: 120.5, p50: 118.2 },
        throughput: 2500,
        source: "local",
        backend: "vLLM",
        isl: 512,
        osl: 128,
        timestamp: "2026-03-26T10:00:00Z"
    },
    {
        run_id: "Run-2",
        model: "Llama-3-70B",
        hardware: "NVIDIA H100",
        accelerator_count: 8,
        architecture: "Standard TCP",
        latency: { mean: 18.5, p50: 17.2, p99: 22.1 },
        ttft: { mean: 140.1, p50: 135.5 },
        throughput: 5000,
        source: "local",
        backend: "vLLM",
        isl: 1024,
        osl: 128,
        timestamp: "2026-03-26T10:05:00Z"
    },
    {
        run_id: "Run-3",
        model: "Gemma-2-27B",
        hardware: "NVIDIA A100",
        accelerator_count: 4,
        architecture: "Low Latency",
        latency: { mean: 12.1, p50: 11.5, p99: 14.2 },
        ttft: { mean: 80.2, p50: 78.5 },
        throughput: 8000,
        source: "local",
        backend: "vLLM",
        isl: 512,
        osl: 256,
        timestamp: "2026-03-26T10:10:00Z"
    },
    {
        run_id: "Run-4",
        model: "Gemma-2-27B",
        hardware: "NVIDIA A100",
        accelerator_count: 4,
        architecture: "Low Latency",
        latency: { mean: 14.2, p50: 13.8, p99: 16.5 },
        ttft: { mean: 95.5, p50: 92.1 },
        throughput: 16000,
        source: "local",
        backend: "vLLM",
        isl: 1024,
        osl: 256,
        timestamp: "2026-03-26T10:15:00Z"
    }
];

const Dashboard = ({ onNavigateBack, onNavigate, dashboardState: propState, dashboardData: propData }) => {

    const localState = useDashboardState();
    const dashboardState = propState || localState;
    const {
        initialState,
        chartColorMode, setChartColorMode,
        chartMode, setChartMode,
        tputType, setTputType,
        costMode, setCostMode,
        latType, setLatType,
        xQualityMode, setXQualityMode,
        yQualityMode, setYQualityMode,
        xAxisMax, setXAxisMax,
        showPerChip, setShowPerChip,
        showSelectedOnly, setShowSelectedOnly,
        showPareto, setShowPareto,
        showLabels, setShowLabels,
        showDataLabels, setShowDataLabels,
        isZoomEnabled, setIsZoomEnabled,
        isLogScaleX, setIsLogScaleX,
        zoomDomain, setZoomDomain,
        showDataPanel, setShowDataPanel,
        showFilterPanel,
        isInspectorOpen, setIsInspectorOpen,
        qualityInspectOpen, setQualityInspectOpen,
        selectedBenchmarks, setSelectedBenchmarks,
        baselineBenchmarkKey, setBaselineBenchmarkKey,
        activeFilters, setActiveFilters,
        generateShareUrl
    } = dashboardState;

    const localData = useDashboardData(initialState, dashboardState);
    const dashboardData = propData || localData;
    const {
        data: liveData, setData,
        loading, setLoading,
        isRestoringConnections,
        gcsLoading, setGcsLoading,
        gcsError, setGcsError,
        gcsSuccess, setGcsSuccess,
        lpgLoading, setLpgLoading,
        lpgError, setLpgError,
        lpgPasteText, setLpgPasteText,
        driveLoading, setDriveLoading,
        driveStatus, setDriveStatus,
        driveProgress, setDriveProgress,
        driveError, setDriveError,
        qualityMetrics, setQualityMetrics,
        availableSources, setAvailableSources,
        selectedSources, setSelectedSources,
        bucketConfigs, setBucketConfigs,
        apiConfigs, setApiConfigs,
        gcsProfiles, setGcsProfiles,
        enableLLMDResults, setEnableLLMDResults,
        toasts, setToasts,
        addToast, removeToast,
        siteName, setSiteName,
        contactUrl, setContactUrl,
        fetchConfig, fetchBucketData, fetchGiqData,
        fetchQualityData, fetchLocalData, fetchArchivedData,
        loadAllData, handleLpgFileUpload, handleLpgGcsScan, handleLpgGcsLoad, syncDriveData,
        restoreSampleData, removeSampleData, removeLLMDData,
        newBucketName, setNewBucketName,
        newBucketAlias, setNewBucketAlias,
        connectionType, setConnectionType,
        newProjectId, setNewProjectId,
        newAuthToken, setNewAuthToken,
        showSampleData, setShowSampleData,
        expandedModels, setExpandedModels,
        debugInfo, setDebugInfo,
        API_KEY,
        expandedIntegration, setExpandedIntegration,
        awsBucketConfigs, handleAddAWSBucket, removeAWSBucket,
        brv02Runs, brv02CustomLabels, setBrv02CustomLabels,
    } = dashboardData;

    const data = useMemo(() => {
        if (!liveData || liveData.length === 0) return MOCK_FALLBACK_DATA_LEGACY.map((d, i) => ({ ...d, id: i }));
        return liveData;
    }, [liveData]);

    // Shared State Parsing Logic



    // ... existing state ...
    const [apiError, setApiError] = useState(null);
    const [shareToast, setShareToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [hoveredDataPoint, setHoveredDataPoint] = useState(null);

    // Helper to generate unique benchmark key
    const [visibleRecommendations, setVisibleRecommendations] = useState(5);

    const chartContainerRef = useRef(null);
    const lastMouseRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);

    // GCS State


    // Persistent State

    const theme = 'dark';

    // API KEY Access (Vite vs CRA Compat)
    // Note: User has REACT_APP_ in .env.local but Vite expects VITE_.
    // We can't change user's .env easily without asking, so we might need to rely on
    // them fixing it OR we can try to access it if we defined define in vite.config (which we didn't).
    // Actually, in the screenshot the error explicitly says "Missing Google API Key (REACT_APP_GOOGLE_API_KEY)".
    // This implies the code WAS looking for that.
    // For now, let's try to support both if possible, but mainly we need to use the one that works in Vite.
    // If the user hasn't set VITE_, we might need to ask them to rename it.
    // BUT, we can just ask them to rename it in a Toast if it's missing.


    // Load Local LLM-D Benchmarks (Generated by Script)





    const toggleModelExpansion = (model) => {
        const newExpanded = new Set(expandedModels);
        if (newExpanded.has(model)) {
            newExpanded.delete(model);
        } else {
            newExpanded.add(model);
        }
        setExpandedModels(newExpanded);
    };



    useEffect(() => {
        localStorage.setItem('bucketConfigs', JSON.stringify(bucketConfigs));
    }, [bucketConfigs]);

    useEffect(() => {
        localStorage.setItem('selectedSources', JSON.stringify([...selectedSources]));
    }, [selectedSources]);



    useEffect(() => {
        localStorage.setItem('apiConfigs', JSON.stringify(apiConfigs));
    }, [apiConfigs]);

    // GIQ / API State



    // Deduplication Ref







    // Save connections handled gracefully in useDashboardData.jsx


    // Restore connections on mount



    // Using helpers imported from dashboardHelpers.jsx



    // Extract unique metadata for filters - MUST be at top level to avoid Hook errors






    // Safety Force Load Off after 15s to prevent getting stuck





    // Google Drive Fetching Logic (Milestone 1)

    // Auto-select new models when selectedSources changes
    // Auto-select new models when selectedSources changes - DISABLED to respect user selection
    // useEffect(() => {
    //     const filtered = data.filter(d => selectedSources.has(d.source || 'local'));
    //     const visibleModels = new Set(filtered.map(d => d.model).filter(m => m !== 'Unknown'));
    //     
    //     setSelectedBenchmarks(prev => {
    //         const next = new Set(prev);
    //         if (prev.size === 0) {
    //             return visibleModels;
    //         }
    //         visibleModels.forEach(m => {
    //             if (!prev.has(m)) {
    //                 next.add(m); 
    //             }
    //         });
    //         return next;
    //     });
    // }, [selectedSources, data]);

    const toggleFilter = (category, value) => {
        setShowSelectedOnly(false); // Reset 'show selected only' when user modifies filters
        setActiveFilters(prev => {
            const newSet = new Set(prev[category]);
            if (value === '' || value === undefined) {
                newSet.clear();
            } else {
                if (newSet.has(value)) newSet.delete(value);
                else newSet.add(value);
            }
            return { ...prev, [category]: newSet };
        });
    };

    const selectAllMatchingModels = () => {
        // Get all models that match current filters
        const matchingModels = data.filter(d => {
            const source = d.source || 'local';
            if (!selectedSources.has(source)) return false;

            if (activeFilters.models.size > 0 && !activeFilters.models.has(getCleanModelName(d.model_name))) return false;
            if (activeFilters.hardware.size > 0 && !activeFilters.hardware.has(d.hardware)) return false;
            if (activeFilters.precisions.size > 0 && !activeFilters.precisions.has(d.precision)) return false;
            if (activeFilters.isl.size > 0 && !activeFilters.isl.has(getBucket(d.isl))) return false;
            if (activeFilters.osl.size > 0 && !activeFilters.osl.has(getBucket(d.osl))) return false;

            if (activeFilters.ratio.size > 0) {
                const r = getRatioType(d.isl, d.osl);
                if (!activeFilters.ratio.has(r)) return false;
            }

            if (activeFilters.acc_count.size > 0 && !activeFilters.acc_count.has(getAcceleratorCount(d))) return false;
            if (activeFilters.modelServer.size > 0) {
                const ms = d.model_server || d.backend || d.metadata?.model_server || d.metadata?.backend;
                if (!ms || !activeFilters.modelServer.has(ms)) return false;
            }

            return true;
        }).map(d => d.model);

        setSelectedBenchmarks(new Set(matchingModels));
    };

    const clearAllSelections = () => {
        setSelectedBenchmarks(new Set());
    };

    const fetchBucketDelta = async (bucket, currentProfile) => {
        const cleanBucketName = bucket.replace(/^gs:\/\//, '');
        let usingProxy = false;

        try {
            let response = await fetch(`https://storage.googleapis.com/storage/v1/b/${cleanBucketName}/o`);

            // Fallback to Proxy
            if (response.status === 401 || response.status === 403) {
                response = await fetch(`/api/gcs/storage/v1/b/${cleanBucketName}/o`);
                if (response.ok) usingProxy = true;
            }

            if (!response.ok) throw new Error(`Failed to access bucket (${response.status}).`);

            const json = await response.json();
            if (!json.items) return { newEntries: [], newFiles: [] };

            const filesToProcess = json.items.filter(item => !item.name.endsWith('/'));

            // Find new files
            const existingFiles = new Set((currentProfile?.files || []).map(f => f.name));
            const newFilesToFetch = filesToProcess.filter(f => !existingFiles.has(f.name));

            if (newFilesToFetch.length === 0) return { newEntries: [], newFiles: [] };

            const newEntries = [];
            const newFileMetadata = [];

            await Promise.all(newFilesToFetch.map(async (file) => {
                try {
                    let fileUrl = file.mediaLink;
                    if (usingProxy && fileUrl.startsWith('https://storage.googleapis.com/')) {
                        const path = fileUrl.replace('https://storage.googleapis.com/', '');
                        fileUrl = `/api/gcs/${path}`;
                    }

                    const fileRes = await fetch(fileUrl);
                    if (!fileRes.ok) throw new Error(`Fetch failed: ${fileRes.status}`);

                    const content = await fileRes.text();
                    let entries = [];
                    try {
                        const jsonContent = JSON.parse(content);
                        if (jsonContent.metrics || jsonContent.load_summary) {
                            const entry = parseJsonEntry({ ...jsonContent, source: `gcs:${cleanBucketName}` }, file.name);
                            entries = [entry];
                        }
                    } catch { } // Log parsing fail?

                    if (entries.length === 0) entries = parseLogFile(content, file.name);

                    if (entries.length > 0) {
                        entries.forEach(e => {
                            e.source = `gcs:${cleanBucketName}`;

                            // Determine display type
                            let type = 'storage';

                            if (e.source_info) {
                                e.source_info.origin = `gcs:${cleanBucketName}`;
                                e.source_info.type = type;
                            } else {
                                e.source_info = {
                                    type: type,
                                    origin: `gcs:${cleanBucketName}`,
                                    file_identifier: file.name,
                                    raw_url: file.mediaLink
                                };
                            }
                            e.raw_url = `https://storage.googleapis.com/${cleanBucketName}/${file.name}`;
                            // Normalization Heuristics
                            if (e.latency?.mean && e.latency.mean < 100) {
                                e.latency.mean *= 1000;
                                if (e.latency.p50) e.latency.p50 *= 1000;
                                if (e.latency.p99) e.latency.p99 *= 1000;
                            }
                            if (e.ttft?.mean && e.ttft.mean < 100) {
                                e.ttft.mean *= 1000;
                                if (e.ttft.p50) e.ttft.p50 *= 1000;
                            }
                            newEntries.push(e);
                        });
                        newFileMetadata.push({ name: file.name, entryCount: entries.length });
                    }
                } catch (e) {
                    console.warn(`Failed to process new file ${file.name}:`, e);
                }
            }));

            return { newEntries, newFiles: newFileMetadata };

        } catch (e) {
            console.error("Delta fetch failed", e);
            throw e;
        }
    };

    const refreshSource = async (sourceType, id, mode = 'full') => {
        setGcsLoading(true);
        try {
            if (sourceType === 'gcs') {
                if (mode === 'delta') {
                    const currentProfile = gcsProfiles.find(p => p.bucketName === id);
                    if (!currentProfile) throw new Error("Profile not found for comparison");

                    const { newEntries, newFiles } = await fetchBucketDelta(id, currentProfile);

                    if (newEntries.length > 0) {
                        updateSourceData(`gcs:${id}`, newEntries, {
                            ...currentProfile,
                            files: [...(currentProfile.files || []), ...newFiles],
                            entryCount: (currentProfile.entryCount || 0) + newEntries.length,
                            loadedAt: new Date().toISOString()
                        }, 'append');
                        setGcsSuccess(`Added ${newEntries.length} new benchmarks.`);
                    } else {
                        setGcsSuccess(`No new data found in ${id}.`);
                    }
                } else {
                    // Full Refresh
                    const result = await fetchBucketData(id, true);
                    if (result.profile.error) {
                        setGcsError(result.profile.error);
                    } else {
                        updateSourceData(`gcs:${id}`, result.entries, result.profile, 'replace');
                        setGcsSuccess(`Refreshed bucket: ${id}`);
                    }
                }
            } else if (sourceType === 'giq') {
                let token = apiConfigs.find(c => c.projectId === id)?.token;
                if (!token) token = localStorage.getItem(`giq_token_${id}`);

                // If no token, proceed anyway (Backend will fallback to ADC)
                // if (!token) { ... }

                // User Request: Explicitly invalidate cache to trigger fresh fetch logic
                await CacheManager.remove('giq', id);

                let result = await fetchGiqData(id, token, false); // forceRefresh=false, relies on (now empty) cache check

                // Auto-Retry Logic: If User Token Expired (401/403), retry with ADC (matches initial load logic)
                if (result.profile.error && token && (result.profile.error.includes('401') || result.profile.error.includes('403'))) {
                    console.log(`[Refresh] Token expired for ${id}. Retrying with ADC...`);
                    const retryRes = await fetchGiqData(id, '', true);
                    if (!retryRes.profile.error) {
                        result = retryRes;
                        // Optional: Clear invalid token? localStorage.removeItem(`giq_token_${id}`);
                    }
                }

                if (result.profile.error) {
                    setApiError(result.profile.error);
                } else {
                    // API Delta simply merges unique entries based on Timestamp/Model
                    updateSourceData(`giq:${id}`, result.entries, { ...result.profile, rawResponse: result.rawResponse }, mode === 'delta' ? 'merge' : 'replace');
                    setGcsSuccess(`Refreshed GIQ: Found ${result.rawResponse?.list?.profile?.length || '?'} profiles, Loaded ${result.entries.length} benchmarks.`);
                }
            }
            setTimeout(() => setGcsSuccess(null), 3000);
        } catch (e) {
            console.error("Refresh failed", e);
            setGcsError(`Refresh failed: ${e.message}`);
        }
        setGcsLoading(false);
    };

    const updateSourceData = (sourceKey, newEntries, newProfile, mode = 'replace') => {
        let newData = [];

        // Normalize new entries first
        const normalizedEntries = newEntries.map(e => {
            const hw = normalizeHardware(e.hardware);
            return { ...e, hardware: hw, metadata: { ...e.metadata, hardware: hw } };
        });

        if (mode === 'replace') {
            const cleanData = data.filter(d => d.source !== sourceKey);
            newData = [...cleanData, ...normalizedEntries];
        } else if (mode === 'append') {
            newData = [...data, ...normalizedEntries];
        } else if (mode === 'merge') {
            // For API: Filter out existing entries that match new entries (by some key) or just blindly add unique ones?
            // Simple merge: Exclude exact duplicates based on timestamp+model
            const existingMap = new Set(data.filter(d => d.source === sourceKey).map(d => `${d.model}|${d.timestamp}`));
            const uniqueNew = normalizedEntries.filter(d => !existingMap.has(`${d.model}|${d.timestamp}`));
            newData = [...data, ...uniqueNew];
        }

        // Re-index
        setData(newData.map((d, i) => ({ ...d, id: i })));

        // Update Profile
        // If appending/merging, simply replace the profile object for that source with the updated state passed in
        const cleanProfiles = gcsProfiles.filter(p => `giq:${p.bucketName}` !== sourceKey && `gcs:${p.bucketName}` !== sourceKey);
        setGcsProfiles([...cleanProfiles, newProfile]);
    };

    // Handler for adding a new bucket
    const handleAddBucket = async (alias = null, bucketNameOverride = null) => {
        const nameToUse = bucketNameOverride || newBucketName;
        if (!nameToUse) return;
        const cleanName = nameToUse.replace(/^gs:\/\//, '');

        // Check duplicates (by name)
        const exists = bucketConfigs.some(b => {
            const bName = typeof b === 'string' ? b : b.bucket;
            return bName === cleanName;
        });

        if (exists) {
            setGcsError('Bucket already configured.');
            return;
        }

        setGcsLoading(true);
        const result = await fetchBucketData(cleanName);
        setGcsLoading(false);

        if (result.profile.error) {
            setGcsError(result.profile.error);
        } else {
            // Store as object if alias provided, or string for back-compat/simplicity
            // Actually, let's normalize to objects internally if we can, OR keep mix.
            // Mix is safest for now.
            const newEntry = alias ? { bucket: cleanName, alias } : cleanName;

            const newConfigs = [...bucketConfigs, newEntry];
            setBucketConfigs(newConfigs);

            // Add to selected sources
            setSelectedSources(prev => new Set([...prev, `gcs:${cleanName}`]));
            setAvailableSources(prev => new Set([...prev, `gcs:${cleanName}`]));

            // Inject alias into profile if needed for UI
            const finalProfile = { ...result.profile, alias: alias || cleanName, type: 'gcs' };

            // Update source data call needs to know about the profile alias? 
            // updateSourceData updates gcsProfiles.
            updateSourceData(`gcs:${cleanName}`, result.entries, finalProfile);

            // Update models
            const newModels = [...new Set(result.entries.map(d => d.model).filter(m => m !== 'Unknown'))];
            setSelectedBenchmarks(prev => {
                const next = new Set(prev);
                // If user has no models selected, select just one to show *something* is working
                if (prev.size === 0 && newModels.length > 0) {
                    // Try to pick a reasonable default (e.g. Llama 3 or 70b) if possible, else first
                    const candidate = newModels.find(m => m.toLowerCase().includes('llama')) || newModels[0];
                    next.add(candidate);
                }
                // If user already has selections, do NOT add new ones to avoid clutter
                return next;
            });

            setNewBucketName('');
            setGcsSuccess(`Added bucket: ${alias || cleanName}`);
            setTimeout(() => setGcsSuccess(null), 3000);
        }
    };

    const removeBucket = (bucketName) => {
        // Check if it's an API config (projectId)
        const apiConfigMatch = apiConfigs.find(c => (typeof c === 'string' ? c : c.projectId) === bucketName);
        if (apiConfigMatch) {
            const newConfigs = apiConfigs.filter(b => (typeof b === 'string' ? b : b.projectId) !== bucketName);
            setApiConfigs(newConfigs);
            const sourceKey = `giq:${bucketName}`;
            // Remove from selected sources
            const newSources = new Set(selectedSources);
            newSources.delete(sourceKey);
            setSelectedSources(newSources);
            setAvailableSources(prev => {
                const n = new Set(prev);
                n.delete(sourceKey);
                return n;
            });
            setData(prev => prev.filter(d => d.source !== sourceKey).map((d, i) => ({ ...d, id: i })));
            setGcsProfiles(prev => prev.filter(p => `giq:${p.bucketName}` !== sourceKey));
        } else {
            // Bucket
            const newConfigs = bucketConfigs.filter(b => {
                const bName = typeof b === 'string' ? b : b.bucket;
                return bName !== bucketName;
            });
            setBucketConfigs(newConfigs);

            const sourceKey = `gcs:${bucketName}`;
            const newSources = new Set(selectedSources);
            newSources.delete(sourceKey);
            setSelectedSources(newSources);
            setAvailableSources(prev => {
                const n = new Set(prev);
                n.delete(sourceKey);
                return n;
            });

            setData(prev => prev.filter(d => d.source !== sourceKey).map((d, i) => ({ ...d, id: i })));
            setGcsProfiles(prev => prev.filter(p => `gcs:${p.bucketName}` !== sourceKey));
        }
    };


    const handleAddApiSource = async () => {
        if (!newProjectId) return;

        // Remove check for existing project to allow updates/token refresh
        // if (apiConfigs.some(config => (typeof config === 'string' ? config : config.projectId) === newProjectId)) {
        //    setApiError('Project already configured.');
        //    return;
        // }

        const validToken = newAuthToken.trim();
        const projectConfig = { projectId: newProjectId, token: validToken };

        setGcsLoading(true);
        // Pass token to fetchGiqData, force refresh to bypass cache on explicit connect
        const result = await fetchGiqData(newProjectId, validToken, true);
        setGcsLoading(false);

        if (result.profile.error) {
            let errorMsg = result.profile.error;
            if (errorMsg.includes('401')) {
                errorMsg = `API Error 401: Unauthorized. Token may be expired. (Details: ${errorMsg})`;
            }
            setApiError(errorMsg);
        } else {
            // Success
            setApiError(null);

            // Enforce Single Tenant: Replace existing config
            const newConfigs = [projectConfig];
            setApiConfigs(newConfigs);

            // Store token securely (locally) for persistence
            localStorage.setItem(`giq_token_${newProjectId}`, validToken);

            // Update Selected/Available Sources: Remove ANY existing GIQ sources
            const updateSet = (prev) => {
                const next = new Set([...prev]);
                Array.from(next).forEach(s => {
                    if (s.startsWith('giq:')) next.delete(s);
                });
                next.add(`giq:${newProjectId}`);
                return next;
            };

            setSelectedSources(prev => updateSet(prev));
            setAvailableSources(prev => updateSet(prev));

            // Manually update data to ensure atomic replacement of all GIQ data
            const newProfileWithDebug = { ...result.profile, rawResponse: result.rawResponse };

            // Normalize new entries
            const normalizedEntries = result.entries.map(e => {
                const hw = normalizeHardware(e.hardware);
                return { ...e, hardware: hw, metadata: { ...e.metadata, hardware: hw } };
            });

            setData(prevData => {
                // Remove ALL existing GIQ data
                const cleanData = prevData.filter(d => !d.source.startsWith('giq:'));
                return [...cleanData, ...normalizedEntries];
            });

            // Update profiles map
            // setApiProfiles(prev => ({ ...prev, [`giq:${newProjectId}`]: newProfileWithDebug }));

            // Update models
            const newModels = [...new Set(result.entries.map(d => d.model).filter(m => m !== 'Unknown'))];
            setSelectedBenchmarks(prev => {
                const next = new Set(prev);
                if (prev.size === 0 && newModels.length > 0) {
                    next.add(newModels[0]);
                }
                return next;
            });

            setNewProjectId('');
            setNewAuthToken(''); // Clear token input
            setGcsSuccess(`Connected: ${result.profile.profileCount} profiles, ${result.entries.length} benchmarks found.`);
            setTimeout(() => setGcsSuccess(null), 5000);
        }
    };


    // ... (rest of the component)

    // Helper to handle chart hover
    const handleChartHover = (state) => {
        if (state && state.activePayload && state.activePayload.length > 0) {
            setHoveredDataPoint(state.activePayload[0].payload);
        } else {
            setHoveredDataPoint(null);
        }
    };



    // ...

    // In ChartCard render:
    // <LineChart onMouseMove={handleChartHover} onMouseLeave={() => setHoveredDataPoint(null)} ...>
    //   ...
    //   {hoveredDataPoint && (
    //      <ReferenceDot x={hoveredDataPoint.latency.mean} y={hoveredDataPoint.throughput} r={6} fill="#ef4444" stroke="#fff" strokeWidth={2} />
    //   )}
    // </LineChart>

    // In Table render:
    // <tr 
    //    key={idx} 
    //    className={`transition-colors cursor-pointer ${hoveredDataPoint && hoveredDataPoint.id === row.id ? 'bg-blue-900/50' : 'hover:bg-slate-700/30'}`}
    //    onMouseEnter={() => setHoveredDataPoint(row)}
    //    onMouseLeave={() => setHoveredDataPoint(null)}
    // >




    // Calculate summary stats
    const maxThroughput = Math.max(...data.map(d => d.throughput));
    const minLatency = Math.min(...data.map(d => d.latency?.mean).filter(l => (l || 0) > 0));
    const totalRuns = data.length;
    const totalErrors = data.reduce((acc, curr) => acc + curr.error_count, 0);

    // Aggregate error details
    const errorBreakdown = {};
    data.forEach(d => {
        if (d.error_details) {
            Object.entries(d.error_details).forEach(([type, count]) => {
                errorBreakdown[type] = (errorBreakdown[type] || 0) + count;
            });
        }
    });

    // Base data filtered by source only
    const baseData = useMemo(() => {
        return data.filter(d => {
            const source = d.source || 'local';
            return selectedSources.has(source);
        });
    }, [data, selectedSources]);

    // Compute Facet Counts for Dropdowns (Dynamic Filtering)
    const facetCounts = useMemo(() => {
        // We use Sets to count UNIQUE models (configurations) rather than total runs (entries).
        // This ensures the numbers in the dropdowns match the visible rows in the table.
        const tempCounts = {
            models: {},
            hardware: {},
            machines: {},
            precisions: {},
            tp: {},
            isl: {},
            osl: {},
            ratio: {},
            acc_count: {},
            modelServer: {},
            useCase: {},
            servingStack: {},
            optimizations: {},
            origins: {},
            components: {},
            pdRatio: {}
        };

        const canonicalModelMap = {};
        baseData.forEach(d => {
            if (d.model_name) {
                const clean = getCleanModelName(d.model_name);
                const cleanLower = clean.toLowerCase();
                if (!canonicalModelMap[cleanLower]) {
                    canonicalModelMap[cleanLower] = clean;
                }
            }
        });

        // Helper to check if item satisfies all active filters EXCEPT the ignored category
        const check = (d, ignoreKey) => {
            if (ignoreKey !== 'models' && activeFilters.models.size > 0) {
                const modelNameLower = getCleanModelName(d.model_name).toLowerCase();
                const hasMatch = [...activeFilters.models].some(m => m.toLowerCase() === modelNameLower);
                if (!hasMatch) return false;
            }
            if (ignoreKey !== 'hardware' && activeFilters.hardware.size > 0 && !activeFilters.hardware.has(d.hardware)) return false;
            if (ignoreKey !== 'machines' && activeFilters.machines.size > 0 && !activeFilters.machines.has(d.machine_type)) return false;
            if (ignoreKey !== 'precisions' && activeFilters.precisions.size > 0 && !activeFilters.precisions.has(d.precision)) return false;

            if (ignoreKey !== 'tp' && activeFilters.tp.size > 0) {
                const tp = getEffectiveTp(d);
                if (!tp || !activeFilters.tp.has(tp)) return false;
            }

            if (ignoreKey !== 'isl' && activeFilters.isl.size > 0 && !activeFilters.isl.has(getBucket(d.isl))) return false;
            if (ignoreKey !== 'osl' && activeFilters.osl.size > 0 && !activeFilters.osl.has(getBucket(d.osl))) return false;

            if (ignoreKey !== 'ratio' && activeFilters.ratio.size > 0) {
                const r = getRatioType(d.isl, d.osl);
                if (!activeFilters.ratio.has(r)) return false;
            }

            if (ignoreKey !== 'modelServer' && activeFilters.modelServer.size > 0) {
                const ms = d.model_server || d.backend || d.metadata?.model_server || d.metadata?.backend || 'Unknown';
                if (!activeFilters.modelServer.has(ms)) return false;
            }

            if (ignoreKey !== 'acc_count' && activeFilters.acc_count.size > 0 && !activeFilters.acc_count.has(getAcceleratorCount(d))) return false;

            if (ignoreKey !== 'useCase' && activeFilters.useCase.size > 0 && !activeFilters.useCase.has(d.use_case)) return false;

            if (ignoreKey !== 'servingStack' && activeFilters.servingStack.size > 0) {
                const ss = d.serving_stack || d.metadata?.serving_stack;
                if (!ss || !activeFilters.servingStack.has(ss)) return false;
            }

            if (ignoreKey !== 'optimizations' && activeFilters.optimizations.size > 0) {
                let hasMet = false;
                const isPD = d.architecture === 'disaggregated' || (d.pd_ratio && d.pd_ratio !== 'Aggregated' && d.pd_ratio !== 'N/A' && d.pd_ratio !== 'N/A:N/A');
                if (activeFilters.optimizations.has("P/D Disaggregation") && isPD) hasMet = true;
                if (activeFilters.optimizations.has("Approximate prefix aware routing")) {
                    const ss = d.serving_stack || d.metadata?.serving_stack || '';
                    if (ss.includes('llm-d') && d.source?.startsWith('giq:')) hasMet = true;
                }
                // Handle other optimizations if they have data indicators
                if (!hasMet) return false;
            }

            if (ignoreKey !== 'origins' && activeFilters.origins && activeFilters.origins.size > 0) {
                const origin = d.source_info?.origin || d.source;
                if (!activeFilters.origins.has(origin)) return false;
            }

            if (ignoreKey !== 'components' && activeFilters.components && activeFilters.components.size > 0) {
                const comps = d.components || d.metadata?.components;
                if (!comps || !Array.isArray(comps) || comps.length === 0) return false;
                const hasMatchingComp = comps.some(c => activeFilters.components.has(c));
                if (!hasMatchingComp) return false;
            }

            return true;
        };

        // Helper to add unique model to the set
        const add = (category, key, modelId) => {
            if (!tempCounts[category][key]) {
                tempCounts[category][key] = new Set();
            }
            tempCounts[category][key].add(modelId);
        };

        baseData.forEach(d => {
            const modelId = getBenchmarkKey(d); // Unique identifier for the benchmark config

            if (check(d, 'models')) {
                const cleanLower = getCleanModelName(d.model_name).toLowerCase();
                const canonicalName = canonicalModelMap[cleanLower] || getCleanModelName(d.model_name);
                add('models', canonicalName, modelId);
            }

            if (check(d, 'hardware')) add('hardware', d.hardware, modelId);

            if (check(d, 'machines')) add('machines', d.machine_type, modelId);

            if (check(d, 'precisions')) add('precisions', d.precision, modelId);

            const tp = getEffectiveTp(d);
            if (tp && check(d, 'tp')) add('tp', tp, modelId);

            const islBucket = getBucket(d.isl);
            if (check(d, 'isl')) add('isl', islBucket, modelId);

            const oslBucket = getBucket(d.osl);
            if (check(d, 'osl')) add('osl', oslBucket, modelId);

            const rType = getRatioType(d.isl, d.osl);
            if (check(d, 'ratio')) add('ratio', rType, modelId);

            if (check(d, 'acc_count')) add('acc_count', getAcceleratorCount(d), modelId);

            const ms = d.model_server || d.backend || d.metadata?.model_server || d.metadata?.backend;
            if (ms && ms !== 'Unknown' && check(d, 'modelServer')) add('modelServer', ms, modelId);

            if (d.use_case && d.use_case !== 'Unknown' && check(d, 'useCase')) add('useCase', d.use_case, modelId);

            const ss = d.serving_stack || d.metadata?.serving_stack;
            if (ss && ss !== 'Unknown' && check(d, 'servingStack')) add('servingStack', ss, modelId);

            // Optimization: Manual Mapping
            if (check(d, 'optimizations')) {
                if (ss && ss.includes('llm-d') && d.source?.startsWith('giq:')) {
                    add('optimizations', "Approximate prefix aware routing", modelId);
                }
                if (d.architecture === 'disaggregated' || (d.pd_ratio && d.pd_ratio !== 'Aggregated' && d.pd_ratio !== 'N/A' && d.pd_ratio !== 'N/A:N/A')) {
                    add('optimizations', "P/D Disaggregation", modelId);
                }
            }

            // P/D Node Ratio
            const pdRatio = d.pd_ratio || d.metadata?.pd_ratio;
            // Ensure it's a valid string and check cross-filters
            if (pdRatio && pdRatio !== 'N/A' && check(d, 'pdRatio')) {
                add('pdRatio', pdRatio, modelId);
            }

            const origin = d.source_info?.origin || d.source;
            if (origin && check(d, 'origins')) {
                add('origins', origin, modelId);
            }

            const comps = d.components || d.metadata?.components || [];
            if (comps.length > 0 && check(d, 'components')) {
                comps.forEach(c => add('components', c, modelId));
            }
        });

        // Convert Sets to counts
        const finalCounts = {
            models: {}, hardware: {}, machines: {}, precisions: {}, tp: {}, isl: {}, osl: {}, ratio: {}, acc_count: {}, modelServer: {}, useCase: {}, servingStack: {}, optimizations: {}, origins: {},
            components: {},
            pdRatio: tempCounts.pdRatio
        };
        ['models', 'hardware', 'machines', 'precisions', 'tp', 'isl', 'osl', 'ratio', 'acc_count', 'modelServer', 'useCase', 'servingStack', 'optimizations', 'pdRatio', 'origins', 'components'].forEach(cat => {
            Object.keys(tempCounts[cat]).forEach(key => {
                finalCounts[cat][key] = tempCounts[cat][key].size;
            });
        });

        console.log('FacetCounts Debug:', finalCounts);
        return finalCounts;
    }, [baseData, activeFilters, getBenchmarkKey]);

    // Filter data by all active filters
    const filteredBySource = useMemo(() => {
        console.log("[Dashboard] recalculating filteredBySource. baseData length:", baseData.length, "activeFilters:", activeFilters);
        const filtered = baseData.filter(d => {
            // Check modal filters
            if (activeFilters.models.size > 0 && !activeFilters.models.has(getCleanModelName(d.model_name))) return false;
            if (activeFilters.hardware.size > 0 && !activeFilters.hardware.has(d.hardware)) return false;
            if (activeFilters.machines.size > 0 && !activeFilters.machines.has(d.machine_type)) return false;
            if (activeFilters.precisions.size > 0 && !activeFilters.precisions.has(d.precision)) return false;

            // Check TP filter
            if (activeFilters.tp.size > 0) {
                const tpVal = getEffectiveTp(d);
                if (!tpVal || !activeFilters.tp.has(tpVal)) return false;
            }

            if (activeFilters.isl.size > 0 && !activeFilters.isl.has(getBucket(d.isl))) return false;
            if (activeFilters.osl.size > 0 && !activeFilters.osl.has(getBucket(d.osl))) return false;

            if (activeFilters.ratio.size > 0) {
                const r = getRatioType(d.isl, d.osl);
                if (!activeFilters.ratio.has(r)) return false;
            }

            if (activeFilters.acc_count.size > 0 && !activeFilters.acc_count.has(String(getAcceleratorCount(d)))) return false;

            if (activeFilters.modelServer.size > 0) {
                const ms = d.model_server || d.backend || d.metadata?.model_server || d.metadata?.backend;
                if (!ms || !activeFilters.modelServer.has(ms)) return false;
            }

            if (activeFilters.useCase.size > 0 && !activeFilters.useCase.has(d.use_case)) return false;

            if (activeFilters.servingStack.size > 0) {
                const ss = d.serving_stack || d.metadata?.serving_stack;
                if (!ss || !activeFilters.servingStack.has(ss)) return false;
            }

            if (activeFilters.optimizations.size > 0) {
                let hasMet = false;
                const isPD = d.architecture === 'disaggregated' || (d.pd_ratio && d.pd_ratio !== 'Aggregated' && d.pd_ratio !== 'N/A' && d.pd_ratio !== 'N/A:N/A');
                if (activeFilters.optimizations.has("P/D Disaggregation") && isPD) hasMet = true;
                if (activeFilters.optimizations.has("Approximate prefix aware routing")) {
                    const ss = d.serving_stack || d.metadata?.serving_stack || '';
                    if (ss.includes('llm-d') && d.source?.startsWith('giq:')) hasMet = true;
                }
                if (!hasMet) return false;
            }

            if (activeFilters.pdRatio.size > 0) {
                const ratio = d.pd_ratio || d.metadata?.pd_ratio || 'Aggregated';
                if (!activeFilters.pdRatio.has(ratio)) return false;
            }

            if (activeFilters.components && activeFilters.components.size > 0) {
                const comps = d.components || d.metadata?.components;
                if (!comps || !Array.isArray(comps) || comps.length === 0) return false;
                const hasMatchingComp = comps.some(c => activeFilters.components.has(c));
                if (!hasMatchingComp) return false;
            }

            if (activeFilters.origins.size > 0) {
                const origin = d.source_info?.origin || d.source;
                if (!activeFilters.origins.has(origin)) return false;
            }

            return true;
        });

        console.log("[Dashboard] filteredBySource result length:", filtered.length);

        if (!showPerChip) return filtered;

        return filtered.map(d => {
            const count = getAcceleratorCount(d) || 1;
            return {
                ...d,
                throughput: (d.throughput || 0) / count,
                qps: (d.qps || 0) / count,
                metrics: d.metrics ? {
                    ...d.metrics,
                    input_tput: (d.metrics.input_tput || 0) / count,
                    output_tput: (d.metrics.output_tput || 0) / count,
                    total_tput: (d.metrics.total_tput || 0) / count,
                    request_rate: (d.metrics.request_rate || 0) / count
                } : d.metrics
            };
        });
    }, [baseData, activeFilters, showPerChip]);

    // Extract unique metadata for filters - Derived from Base Data (Source Filtered Only) to ensure ALL options are visible
    // This allows specific filters (e.g. Model) to match 0 items in other categories (e.g. Hardware) but still be visible.
    const filterOptions = useMemo(() => {
        const options = {
            models: new Set(),
            hardware: new Set(),
            machines: new Set(),
            precisions: new Set(),
            tp: new Set(),
            isl: new Set(),
            osl: new Set(),
            ratio: new Set(),
            acc_count: new Set(),
            modelServer: new Set(),
            useCase: new Set(),
            servingStack: new Set(),
            optimizations: new Set(),
            pdRatio: new Set(),
            origins: new Set()
        };

        const seenModelsLower = new Set();
        baseData.forEach(d => {
            if (d.model_name) {
                const clean = getCleanModelName(d.model_name);
                const cleanLower = clean.toLowerCase();
                if (!seenModelsLower.has(cleanLower)) {
                    seenModelsLower.add(cleanLower);
                    options.models.add(clean);
                }
            }
            if (d.hardware && d.hardware !== 'Unknown') {
                options.hardware.add(d.hardware);
                options.acc_count.add(getAcceleratorCount(d));
            }
            // Use model_server if available, fallback to backend, extract from metadata if needed
            const ms = d.model_server || d.backend || d.metadata?.model_server || d.metadata?.backend;
            if (ms && ms !== 'Unknown') options.modelServer.add(ms);

            const ss = d.serving_stack || d.metadata?.serving_stack;
            if (ss && ss !== 'Unknown') options.servingStack.add(ss);

            if (d.machine_type && d.machine_type !== 'Unknown') options.machines.add(d.machine_type);
            if (d.precision && d.precision !== 'Unknown') options.precisions.add(d.precision);

            // Extract TP
            const tpVal = getEffectiveTp(d);
            if (tpVal) options.tp.add(tpVal);

            if (d.isl > 0) options.isl.add(getBucket(d.isl));
            if (d.osl > 0) options.osl.add(getBucket(d.osl));

            if (d.use_case && d.use_case !== 'Unknown') options.useCase.add(d.use_case);

            if (d.isl > 0 && d.osl > 0) {
                options.ratio.add(getRatioType(d.isl, d.osl));
            }

            if (ss && ss.includes('llm-d') && d.source?.startsWith('giq:')) {
                options.optimizations.add("Approximate prefix aware routing");
            }

            // Add P:D Ratio
            const pd = d.pd_ratio || d.metadata?.pd_ratio || 'Aggregated';
            options.pdRatio.add(pd);

            // Extract Origin (Folder/Bucket/Upload Name)
            const origin = d.source_info?.origin || d.source;
            if (origin && origin !== 'Unknown') options.origins.add(origin);
        });

        return {
            models: [...options.models].sort(),
            hardware: [...options.hardware].sort(),
            machines: [...options.machines].sort(),
            precisions: [...options.precisions].sort(),
            tp: [...options.tp].sort((a, b) => {
                // Sort TP numerically if possible (e.g. TP1, TP2, TP4)
                const numA = parseInt(a.replace('TP', '')) || 0;
                const numB = parseInt(b.replace('TP', '')) || 0;
                return numA - numB;
            }),
            isl: sortBuckets([...options.isl]),
            osl: sortBuckets([...options.osl]),
            ratio: [...options.ratio].sort(),
            acc_count: [...options.acc_count].sort((a, b) => Number(a) - Number(b)),
            modelServer: [...options.modelServer].sort(),
            useCase: [...options.useCase].sort(),
            servingStack: [...options.servingStack].sort(),
            optimizations: [...options.optimizations].sort(),
            pdRatio: [...options.pdRatio].sort((a, b) => {
                if (a === 'Aggregated') return -1;
                if (b === 'Aggregated') return 1;
                // Parse "P:D" format
                const parse = s => String(s).split(':').map(Number);
                const [pa, da] = parse(a);
                const [pb, db] = parse(b);
                if (isNaN(pa) || isNaN(pb)) return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
                if (pa !== pb) return pa - pb;
                return da - db;
            }),
            origins: [...options.origins].sort()
        };
    }, [baseData]);

    const allModels = [...new Set(filteredBySource.map(d => d.model).filter(m => m !== 'Unknown'))];
    const backends = [...new Set(data.map(d => d.backend).filter(b => b !== 'Unknown'))];

    // Sanitize activeFilters on load to remove stale filters that are not in the dataset
    useEffect(() => {
        if (loading || baseData.length === 0) return;

        setActiveFilters(prev => {
            const next = { ...prev };
            let changed = false;

            if (prev.models.size > 0 && filterOptions.models.length > 0) {
                const validModels = new Set();
                const availableModels = new Set(filterOptions.models);
                prev.models.forEach(m => {
                    if (availableModels.has(m)) {
                        validModels.add(m);
                    } else {
                        changed = true;
                    }
                });
                if (changed) {
                    next.models = validModels;
                }
            }
            return changed ? next : prev;
        });
    }, [loading, baseData, filterOptions.models]);


    // Unified Synchronization & Migration Effect
    // 1. Converts legacy/portable wildcards to concrete keys.
    // 2. Drops invisible/stale selections when filters change.
    // 3. Auto-selects fallback data if nothing matched.
    useEffect(() => {
        const isAnySourceLoading = gcsProfiles.some(p => p.loading);
        console.log("[Sync Effect] Running. loading:", loading, "isRestoringConnections:", isRestoringConnections, "isAnySourceLoading:", isAnySourceLoading, "filteredBySource length:", filteredBySource.length);
        if (loading || isRestoringConnections || isAnySourceLoading || filteredBySource.length === 0) return;

        const currentKeys = filteredBySource.map(d => getBenchmarkKey(d));
        const validKeys = new Set(currentKeys);

        setSelectedBenchmarks(prev => {
            const next = new Set();
            let changed = false;
            let matchedAny = false;

            // Match function for portable wildcard keys
            const matchesWildcard = (key, pattern) => {
                const kParts = key.split('::');
                const pParts = pattern.split('::');
                if (kParts.length !== pParts.length) return false;
                return pParts.every((p, i) => p === '*' || p === kParts[i]);
            };

            prev.forEach(k => {
                if (typeof k === 'string' && k.includes('*')) {
                    // Portable wildcard key — resolve to actual keys
                    const matching = currentKeys.filter(validKey => matchesWildcard(validKey, k));
                    if (matching.length > 0) {
                        matching.forEach(mk => next.add(mk));
                        matchedAny = true;
                        changed = true; // State changed, wildcard replaced
                    } else {
                        // Keep wildcard in state ONLY IF it hasn't matched anything yet
                        next.add(k);
                    }
                } else if (validKeys.has(k)) {
                    // Concrete key is visible
                    next.add(k);
                    matchedAny = true;
                } else {
                    // Stale or invisible key — drop it
                    changed = true;
                    console.log(`[Sync] Dropped invisible or stale selection: ${k}`);
                }
            });

            // Auto-fallback if we had intent but no matches
            const hadIntent = (prev && prev.size > 0);
            if (hadIntent && !matchedAny) {
                console.log("[Sync] Previous intent found but no matches. Auto-selecting first-per-source fallback.");
                const initialSelection = new Set();
                const sourcesInNext = new Set(filteredBySource.map(d => d.source || 'local'));
                sourcesInNext.forEach(src => {
                    const sourceEntries = filteredBySource.filter(d => (d.source || 'local') === src);
                    const sorted = sourceEntries.sort((a, b) => {
                        if (!a.timestamp) return 1;
                        if (!b.timestamp) return -1;
                        return new Date(b.timestamp) - new Date(a.timestamp);
                    });
                    if (sorted.length > 0) initialSelection.add(getBenchmarkKey(sorted[0]));
                });
                return initialSelection;
            }

            return changed ? next : prev;
        });
    }, [loading, isRestoringConnections, gcsProfiles, filteredBySource, getBenchmarkKey]);

    // Clear baseline if its benchmark is no longer present in the visible
    // dataset (e.g., the user removed an upload or filtered out its source).
    useEffect(() => {
        if (!baselineBenchmarkKey) return;
        if (loading || isRestoringConnections) return;
        if (filteredBySource.length === 0) return;
        const stillVisible = filteredBySource.some(d => getBenchmarkKey(d) === baselineBenchmarkKey);
        if (!stillVisible) setBaselineBenchmarkKey(null);
    }, [baselineBenchmarkKey, filteredBySource, loading, isRestoringConnections]);

    // Derive selectedModels for compatibility with Header/components
    const selectedModels = useMemo(() => {
        const models = new Set();
        selectedBenchmarks.forEach(k => {
            if (k.includes('::')) {
                models.add(k.split('::')[2]);
            } else if (k.startsWith('inference-perf:') || k.startsWith('file:')) {
                // Enhanced lookup to handle both legacy lpg: and new file: keys
                // We find the entry that generated this key to get its model name
                const d = filteredBySource.find(x => getBenchmarkKey(x) === k);
                if (d) models.add(d.model);
            } else {
                models.add(k);
            }
        });
        return models;
    }, [selectedBenchmarks, filteredBySource]);

    // Filter data based on selected sources, models (via benchmarks), and x-axis filter
    let filteredData = filteredBySource
        .filter(d => selectedBenchmarks.has(getBenchmarkKey(d)))
        .filter(d => {
            if (xAxisMax === Infinity) return true;
            if (chartMode === 'tpot') return d.time_per_output_token <= xAxisMax;
            if (chartMode === 'qps') return (d.qps || d.metrics?.request_rate || 0) <= xAxisMax;
            if (chartMode === 'ntpot') return (d.metrics?.ntpot || 0) <= xAxisMax;
            if (chartMode === 'ttft') return (d.metrics?.ttft?.mean || 0) <= xAxisMax;
            if (chartMode === 'itl') return (d.metrics?.itl || 0) <= xAxisMax;
            return (d.latency?.mean || 0) <= xAxisMax;
        });

    const toggleBenchmark = (key) => {
        console.log("[toggleBenchmark] Toggling key:", key);
        const newSelected = new Set(selectedBenchmarks);
        if (newSelected.has(key)) {
            newSelected.delete(key);
            console.log("[toggleBenchmark] Removed key. New size:", newSelected.size);
        } else {
            newSelected.add(key);
            console.log("[toggleBenchmark] Added key. New size:", newSelected.size);
        }
        setSelectedBenchmarks(newSelected);
    };

    const toggleModel = (model) => {
        // Mass toggle all benchmarks for this model
        const keys = filteredBySource
            .filter(d => d.model === model)
            .map(d => getBenchmarkKey(d));

        const newSelected = new Set(selectedBenchmarks);
        const allSelected = keys.every(k => newSelected.has(k));

        keys.forEach(k => {
            if (allSelected) newSelected.delete(k);
            else newSelected.add(k);
        });
        setSelectedBenchmarks(newSelected);
    };



    // Calculate per-benchmark stats for the summary table
    // For LPG sources: each source is a distinct benchmark
    // For other sources: group by model (existing behavior)
    // Calculate per-benchmark stats for the summary table
    const benchmarkStats = useMemo(() => {
        const stats = [];
        const groups = new Map();

        // 1. Group data by key using getBenchmarkKey
        filteredBySource.forEach(d => {
            const key = getBenchmarkKey(d);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(d);

            // Debugging Key Generation (Temporary)
            if (d.model_name.toLowerCase().includes('llama-3.1-70b')) {
                console.log(`Key: ${key} | Folder: ${d.source_info?.file_identifier || d.filename}`);
            }
        });

        // 2. Process groups
        groups.forEach((groupingData, benchmarkKey) => {
            const model = groupingData[0].model_name || groupingData[0].model;

            const maxTput = Math.max(0, ...groupingData.map(x => Number(x.throughput || 0)).filter(t => !isNaN(t)));
            const minLatEntries = groupingData.map(x => Number(x.latency?.mean || 0)).filter(l => !isNaN(l) && l > 0);
            const minLat = minLatEntries.length > 0 ? Math.min(...minLatEntries) : 0;
            const errCount = groupingData.reduce((acc, curr) => acc + Number(curr.error_count || 0), 0);

            // Get hardware info from the first entry (or look for one with hardware if unavailable)
            const hardware = groupingData.find(x => x.hardware && x.hardware !== 'Unknown' && x.hardware !== 'Unknown Hardware')?.hardware ||
                groupingData.find(x => x.metadata?.hardware && x.metadata.hardware !== 'Unknown' && x.metadata.hardware !== 'Unknown Hardware')?.metadata?.hardware ||
                'Unknown Hardware';

            // Get accelerator count
            const accelerator_count = groupingData.find(x => x.accelerator_count > 0)?.accelerator_count ||
                groupingData.find(x => x.metadata?.accelerator_count > 0)?.metadata?.accelerator_count ||
                1;

            const tensor_parallelism = groupingData.find(x => x.tensor_parallelism > 0)?.tensor_parallelism ||
                groupingData.find(x => x.metadata?.tensor_parallelism > 0)?.metadata?.tensor_parallelism ||
                1;

            // node_count: how many nodes based on accelerator_count and per-node TP 
            const node_count = accelerator_count > 1 && tensor_parallelism > 1
                ? Math.max(1, Math.round(accelerator_count / tensor_parallelism))
                : accelerator_count;

            // Get Configuration from first entry if available (for display)
            // Note: Since we grouped by Key, and Key includes configuration for local, all items in group share configuration.
            // We can attach it to the stat object for rendering.
            const configuration = groupingData[0].metadata?.configuration || groupingData[0].configuration || 'Unknown';

            // Get sources and URLs
            const sources = [...new Set(groupingData.map(x => x.source))];
            const sourceLinks = sources.map(source => {
                const sourceEntries = groupingData.filter(x => x.source === source);
                const fileCount = sourceEntries.length;
                const fileNames = [...new Set(sourceEntries.map(x => x.filename || 'unknown'))];

                let url = '#';
                let name = source;

                if (source === 'local') {
                    name = 'Sample';
                    url = '/data.json';

                } else if (source?.startsWith('gcs:')) {
                    const bucketName = source.replace('gcs:', '');
                    name = `gs://${bucketName}`;
                    url = `https://console.cloud.google.com/storage/browser/${bucketName}`;
                } else if (source?.startsWith('giq:')) {
                    const projectName = source.replace('giq:', '');
                    name = `GIQ (${projectName})`;
                    url = `https://console.cloud.google.com/welcome?project=${projectName}`;
                } else if (source?.startsWith('inference-perf:')) {
                    const filename = source.replace('inference-perf:', '');
                    name = filename.length > 30 ? filename.slice(0, 30) + '...' : filename;
                    url = '#';
                }

                return { name, url, fileCount, fileNames };
            });

            stats.push({
                benchmarkKey,
                model,
                configuration, // Explicitly pass configuration
                maxTput,
                minLat,
                errCount,
                hardware,
                accelerator_count,
                tensor_parallelism,
                node_count, // Pre-computed: accelerator_count / tensor_parallelism
                tp: tensor_parallelism,
                sourceLinks,
                // Store reference to the actual data for this benchmark
                // Fix Duplicates & Sort by QPS
                data: (() => {
                    const uniqueMap = new Map();
                    groupingData.forEach(d => {
                        const qps = d.metrics?.request_rate || d.qps || 0;
                        const tput = d.throughput || 0;
                        const lat = d.latency?.mean || 0;
                        const key = `${qps.toFixed(4)}_${tput.toFixed(4)}_${lat.toFixed(4)}`;
                        if (!uniqueMap.has(key)) uniqueMap.set(key, d);
                    });

                    return Array.from(uniqueMap.values()).sort((a, b) => {
                        const qpsA = a.metrics?.request_rate || a.qps || 0;
                        const qpsB = b.metrics?.request_rate || b.qps || 0;
                        return qpsA - qpsB;
                    });
                })()
            });
        });

        return stats;
    }, [filteredBySource, getBenchmarkKey, chartColorMode]);

    // Keep modelStats as an alias for backwards compatibility with other parts of the code
    const modelStats = benchmarkStats;

    // Helper to find "Pareto/Knee" point using Distance to Ideal (Utopia Point)
    // minimizeX: true for Latency/TTFT, false for QPS/Throughput
    // maximizeY: true for Throughput/QPS, false for Latency/TTFT
    const findParetoPoint = (dataset, xKey, yKey, minimizeX, maximizeY) => {
        if (!dataset || dataset.length === 0) return null;

        const xValues = dataset.map(d => {
            const val = d[xKey.split('.')[0]]?.[xKey.split('.')[1]] ?? d[xKey];
            return val;
        });
        const yValues = dataset.map(d => {
            const val = d[yKey.split('.')[0]]?.[yKey.split('.')[1]] ?? d[yKey];
            return val;
        });

        const minX = Math.min(...xValues);
        const maxX = Math.max(...xValues);
        const minY = Math.min(...yValues);
        const maxY = Math.max(...yValues);

        let bestPoint = null;
        let minDistance = Infinity;

        dataset.forEach(d => {
            const xVal = d[xKey.split('.')[0]]?.[xKey.split('.')[1]] ?? d[xKey];
            const yVal = d[yKey.split('.')[0]]?.[yKey.split('.')[1]] ?? d[yKey];

            // Normalize to 0-1
            const normX = (xVal - minX) / (maxX - minX || 1);
            const normY = (yVal - minY) / (maxY - minY || 1);

            // Ideal: X=0 (if min) or 1 (if max), Y=1 (if max) or 0 (if min)
            const targetX = minimizeX ? 0 : 1;
            const targetY = maximizeY ? 1 : 0;

            const distance = Math.sqrt(Math.pow(normX - targetX, 2) + Math.pow(normY - targetY, 2));

            if (distance < minDistance) {
                minDistance = distance;
                bestPoint = { x: xVal, y: yVal, ...d };
            }
        });

        return bestPoint;
    };

    const getParetoFrontier = (dataset, minimizeX, maximizeY) => {
        if (!dataset || dataset.length === 0) return [];

        // Sort by X (primary objective)
        // If minimizing X, sort Ascending. If maximizing X, sort Descending.
        const sorted = [...dataset].sort((a, b) => minimizeX ? a.vx - b.vx : b.vx - a.vx);

        const frontier = [];
        // Track best Y seen so far. 
        // If maximizing Y, anything with Y <= bestY is dominated (since X is already 'worse' or equal due to sort)
        let bestY = maximizeY ? -Infinity : Infinity;

        sorted.forEach(d => {
            const isImprovement = maximizeY ? (d.vy > bestY) : (d.vy < bestY);
            if (isImprovement) {
                frontier.push(d);
                bestY = d.vy;
            }
        });

        return frontier;
    };



    // Check if ANY selected model has known chip counts (explicit (xN) format or metadata)
    const canShowPerChip = useMemo(() => {
        if (selectedModels.size === 0) return false;
        return [...selectedModels].some(m => {
            const stat = modelStats.find(s => s.model === m);
            // Check if accelerator_count is available (>1) OR if hardware string has (xN)
            return stat && ((stat.accelerator_count && Number(stat.accelerator_count) > 1) || (stat.hardware && /\(x\d+\)/.test(stat.hardware)));
        });
    }, [selectedModels, modelStats]);

    // Reset per-chip toggle if not applicable
    useEffect(() => {
        if (!canShowPerChip && showPerChip) {
            setShowPerChip(false);
        }
    }, [canShowPerChip, showPerChip]);

    // Check availability of other metrics
    const metricAvailability = useMemo(() => {
        if (selectedModels.size === 0) return { input: false, total: false, qps: false };
        // Only check successful runs to avoid falsy negatives from failed requests
        // Check if ANY valid run for the selected models has the metric? No, we want consistency.
        // But if we select multiple models, and one is missing input tokens (e.g. generation only), should we disable it for all?
        // Let's use strict logic: All selected models MUST support the metric.
        // Group by model first

        const models = [...selectedModels];
        const hasInput = models.every(m => {
            const mData = filteredBySource.filter(d => d.model === m && d.throughput > 0);
            if (mData.length === 0) return true; // No valid data for this model, ignore? Or fail? Let's say pass (neutral)
            return mData.every(d => (d.metrics?.input_tput || 0) > 0);
        });

        const hasTotal = models.every(m => {
            const mData = filteredBySource.filter(d => d.model === m && d.throughput > 0);
            if (mData.length === 0) return true;
            return mData.every(d => (d.metrics?.total_tput || 0) > 0);
        });

        const hasQPS = models.every(m => {
            const mData = filteredBySource.filter(d => d.model === m && d.throughput > 0);
            if (mData.length === 0) return true;
            return mData.every(d => (d.qps || d.metrics?.request_rate || 0) > 0);
        });

        const hasCost = models.some(m => {
            const mData = filteredBySource.filter(d => d.model === m);
            if (mData.length === 0) return false;
            return mData.some(d => d.metrics?.cost && (
                (d.metrics.cost.spot || 0) > 0 ||
                (d.metrics.cost.on_demand || 0) > 0 ||
                (d.metrics.cost.cud_1y || 0) > 0 ||
                (d.metrics.cost.cud_3y || 0) > 0
            ));
        });

        // X-Axis Availability
        const hasNTPOT = models.every(m => {
            const mData = filteredBySource.filter(d => d.model === m);
            if (mData.length === 0) return true;
            return mData.some(d => (d.metrics?.ntpot || 0) > 0);
        });

        const hasTTFT = models.every(m => {
            const mData = filteredBySource.filter(d => d.model === m);
            if (mData.length === 0) return true;
            return mData.some(d => (d.metrics?.ttft?.mean || 0) > 0);
        });

        const hasITL = models.every(m => {
            const mData = filteredBySource.filter(d => d.model === m);
            if (mData.length === 0) return true;
            return mData.some(d => (d.metrics?.itl || 0) > 0);
        });

        const hasTokensPerSec = models.every(m => {
            const mData = filteredBySource.filter(d => d.model === m);
            if (mData.length === 0) return true;
            return mData.some(d => (d.tokens_per_second || 0) > 0);
        });

        return { input: hasInput, total: hasTotal, qps: hasQPS, cost: hasCost, ntpot: hasNTPOT, ttft: hasTTFT, itl: hasITL, tokens_per_sec: hasTokensPerSec };
    }, [selectedModels, filteredBySource]);

    // Reset selections if metric becomes unavailable
    useEffect(() => {
        if (!metricAvailability.input && tputType === 'input') setTputType('output');
        if (!metricAvailability.total && tputType === 'total') setTputType('output');
        if (!metricAvailability.qps && tputType === 'qps') setTputType('output');
        if (!metricAvailability.cost && tputType === 'cost') setTputType('output');

        if (!metricAvailability.ntpot && chartMode === 'ntpot') setChartMode('tpot');
        if (!metricAvailability.ttft && chartMode === 'ttft') setChartMode('tpot');
        if (!metricAvailability.tokens_per_sec && chartMode === 'tokens_per_sec') setChartMode('tpot');
        if (!metricAvailability.itl && chartMode === 'itl') setChartMode('tpot');
    }, [metricAvailability, tputType, chartMode]);

    // Auto-Upgrade to NTPOT if available (and currently on default TPOT)
    // Only runs when availability changes to avoid locking user choice
    useEffect(() => {
        if (metricAvailability.ntpot) {
            setChartMode(prev => prev === 'tpot' ? 'ntpot' : prev);
        }
    }, [metricAvailability.ntpot]);


    // Reset axis filter and zoom when mode changes
    useEffect(() => {
        setXAxisMax(Infinity);
        setZoomDomain(null);
    }, [chartMode, tputType]);

    const hasLocalBenchmarks = Array.from(selectedSources || []).some(source => source === 'local' || source.startsWith('brv02:'));

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased relative overflow-x-hidden pt-16">
            {/* Toast Stack */}
            <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
                {toasts.map(t => (
                    <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all animate-in slide-in-from-right duration-300 flex items-center justify-between gap-4 ${t.type === 'error' ? 'bg-red-500/90 backdrop-blur' :
                        t.type === 'success' ? 'bg-green-500/90 backdrop-blur' : 'bg-blue-600/90 backdrop-blur'
                        }`}>
                        <span>{t.message}</span>
                        <button onClick={() => removeToast(t.id)} className="hover:bg-white/20 rounded-full p-1 opacity-75 hover:opacity-100">
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
            <header className="w-full h-16 border-b border-slate-800 flex justify-between items-center px-6 bg-slate-900 fixed top-0 left-0 right-0 z-[9999]">
                <div className="flex items-center gap-4">
                    {onNavigateBack && (
                        <button onClick={onNavigateBack} className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                    )}
                    
                    {/* Compact Prism Logo & Name */}
                    <div className="flex items-center gap-2.5 border-r border-slate-500 pr-4">
                        <img src="https://llm-d.ai/img/llm-d-logotype-and-icon.png" alt="llm-d Logo" className="h-6 object-contain" />
                        <span className="text-lg font-bold tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">
                            Prism
                        </span>
                    </div>

                    <div className="flex items-center">
                        <h1 className="text-lg font-bold text-white tracking-wide">Benchmark browser</h1>
                        <span className="ml-3 px-2 py-0.5 rounded text-xs font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                            Expert mode
                        </span>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    <button
                        onClick={() => onNavigate && onNavigate('manage-benchmarks')}
                        className="px-4 py-2 text-sm font-medium rounded-md border text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700 transition-colors flex items-center"
                    >
                        <Database className="w-4 h-4 mr-2" /> Manage
                    </button>

                    <a 
                        href="https://llm-d.ai/docs/community" 
                        target="_blank" 
                        rel="noreferrer"
                        className="px-4 py-2 text-sm font-medium rounded-md text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors flex items-center border border-slate-700"
                    >
                        <MessageCircle className="w-4 h-4 mr-2" /> Contact us
                    </a>

                    <div className="relative group flex">
                        <button 
                            onClick={() => { 
                                if (hasLocalBenchmarks) return;
                                const shareUrl = generateShareUrl(bucketConfigs, apiConfigs, selectedSources);
                                navigator.clipboard.writeText(shareUrl).then(() => {
                                    setShareToast(true); 
                                    setToastMessage('Link copied to clipboard!'); 
                                    setTimeout(() => setShareToast(false), 2000); 
                                }).catch(err => {
                                    setShareToast(true); 
                                    setToastMessage('Failed to copy link'); 
                                    setTimeout(() => setShareToast(false), 2000); 
                                });
                            }} 
                            className={`px-4 py-2 text-sm font-medium rounded-md flex items-center border relative transition-colors ${hasLocalBenchmarks ? 'text-slate-500 bg-slate-800 border-slate-700 cursor-not-allowed' : 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700'}`}
                        >
                            <Share2 className="w-4 h-4 mr-2" /> Share view 
                            {shareToast && !hasLocalBenchmarks && (
                                <div className="absolute -bottom-10 right-0 bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded shadow-lg z-50 flex items-center whitespace-nowrap">
                                    {toastMessage}
                                </div>
                            )}
                        </button>
                        {hasLocalBenchmarks && (
                            <div className="absolute -bottom-10 right-0 bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium px-3 py-1.5 rounded shadow-lg z-50 flex items-center whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                Local benchmark results cannot be shared yet.
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <main className="w-full px-8 py-6 pl-28 flex flex-col transition-colors duration-200">

            {/* Helper to generate config object */}
            {(() => {
                // Define copy config handler in render scope (or move to component body if preferred, but this works for inserting button code later)
                // Actually, let's just use an inline function for the button below.
            })()}

            {/* Configuration Area */}
            <div className="space-y-4 mb-4">

                {/* Data Connections Section - Moved to Slide-over */}


                {/* Integrated Benchmark Explorer */}
                <FilterPanel
                    {...{
                        showFilterPanel, filterOptions, activeFilters, facetCounts, toggleFilter,
                        selectedModels, modelStats, filteredBySource, showSelectedOnly, setShowSelectedOnly,
                        selectedBenchmarks, setSelectedBenchmarks, setActiveFilters, expandedModels,
                        toggleBenchmark, toggleModelExpansion,
                        baselineBenchmarkKey, setBaselineBenchmarkKey,
                        UnifiedDataTable
                    }}
                />










                <ThroughputCostChart
                    {...{
                        tputType, setTputType, yQualityMode, setYQualityMode, chartMode, setChartMode,
                        xQualityMode, setXQualityMode, costMode, setCostMode, showPerChip, setShowPerChip,
                        showLabels, setShowLabels, showDataLabels, setShowDataLabels, showPareto, setShowPareto,
                        qualityMetrics, allModels, selectedModels, filteredData, getBenchmarkKey, theme,
                        isZoomEnabled, setIsZoomEnabled, zoomDomain, setZoomDomain, chartContainerRef,
                        isDragging, setIsDragging, lastMouseRef, chartColorMode, setChartColorMode,
                        metricAvailability, filteredBySource, xAxisMax, setXAxisMax, setDebugInfo,
                        isLogScaleX, setIsLogScaleX, setLatType, selectedBenchmarks,
                        baselineBenchmarkKey
                    }}
                />

                <RunComparisonChart
                    filteredBySource={filteredBySource}
                    selectedBenchmarks={selectedBenchmarks}
                    getBenchmarkKey={getBenchmarkKey}
                    baselineBenchmarkKey={baselineBenchmarkKey}
                    brv02CustomLabels={brv02CustomLabels}
                    theme={theme}
                />






                {/* Debug Info Modal */}
                {debugInfo && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                        <div className="bg-slate-900 rounded-xl border border-slate-700 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-white font-mono">{debugInfo.title}</h3>
                                <button onClick={() => setDebugInfo(null)} className="text-slate-400 hover:text-white">
                                    <X size={20} />
                                </button>
                            </div>
                            {debugInfo.url && (
                                <div className="bg-slate-800/50 px-4 py-2 border-b border-slate-700 flex items-center gap-2">
                                    <span className="text-xs text-slate-400">Source:</span>
                                    <a
                                        href={debugInfo.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-400 hover:text-blue-300 underline truncate"
                                    >
                                        {debugInfo.url}
                                    </a>
                                    <ExternalLink size={10} className="text-slate-500" />
                                </div>
                            )}
                            <div className="p-0 overflow-auto flex-1 bg-slate-950">
                                <pre className="text-xs font-mono text-green-400 p-4 whitespace-pre-wrap">
                                    {debugInfo.content}
                                </pre>
                            </div>
                            <div className="p-4 border-t border-slate-800 bg-slate-800/50 text-right">
                                <button
                                    onClick={() => setDebugInfo(null)}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Debug Data Inspector */}
                <DataInspector
                    data={data}
                    qualityMetrics={qualityMetrics}
                    isOpen={isInspectorOpen}
                    onClose={() => setIsInspectorOpen(false)}
                />

                {/* Application Layer */}

            </div>
            </main>

            {/* Data Connections Panel — rendered outside <main> so flex/overflow
                inside main cannot affect its fixed positioning or stacking context */}
                {showDataPanel && (
                    <div
                        className="fixed inset-0 bg-black/50 z-[55] backdrop-blur-sm transition-opacity"
                        onClick={() => setShowDataPanel(false)}
                    />
                )}
                <DataConnectionsPanel
                    {...dashboardData}
                    addToast={addToast}
                    showDataPanel={showDataPanel}
                    setShowDataPanel={setShowDataPanel}
                    INTEGRATIONS={INTEGRATIONS}
                    availableSources={availableSources}
                    showSampleData={showSampleData}
                    enableLLMDResults={enableLLMDResults}
                    setEnableLLMDResults={setEnableLLMDResults}
                    expandedIntegration={expandedIntegration}
                    setExpandedIntegration={setExpandedIntegration}
                    setApiError={setApiError}
                    setGcsError={setGcsError}
                    setLpgError={setLpgError}
                    removeSampleData={removeSampleData}
                    removeLLMDData={removeLLMDData}
                    restoreSampleData={restoreSampleData}
                    driveLoading={driveLoading}
                    driveStatus={driveStatus}
                    driveProgress={driveProgress}
                    driveError={driveError}
                    refreshSource={refreshSource}
                    setApiConfigs={setApiConfigs}
                    setData={setData}
                    setSelectedSources={setSelectedSources}
                    setAvailableSources={setAvailableSources}
                    newProjectId={newProjectId}
                    setNewProjectId={setNewProjectId}
                    newAuthToken={newAuthToken}
                    setNewAuthToken={setNewAuthToken}
                    handleAddApiSource={handleAddApiSource}
                    gcsLoading={gcsLoading}
                    gcsError={gcsError}
                    apiError={apiError}
                    lpgError={lpgError}
                    handleLpgFileUpload={handleLpgFileUpload}
                    handleLpgGcsScan={handleLpgGcsScan}
                    handleLpgGcsLoad={handleLpgGcsLoad}
                    lpgLoading={lpgLoading}
                    lpgPasteText={lpgPasteText}
                    setLpgPasteText={setLpgPasteText}
                    setLpgLoading={setLpgLoading}
                    parseLogFile={parseLogFile}
                    gcsSuccess={gcsSuccess}
                    setGcsSuccess={setGcsSuccess}
                    connectionType={connectionType}
                    setConnectionType={setConnectionType}
                    gcsProfiles={gcsProfiles}
                    selectedSources={selectedSources}
                    removeBucket={removeBucket}
                    newBucketAlias={newBucketAlias}
                    setNewBucketAlias={setNewBucketAlias}
                    newBucketName={newBucketName}
                    setNewBucketName={setNewBucketName}
                    handleAddBucket={handleAddBucket}
                    chartMode={chartMode}
                    tputType={tputType}
                    costMode={costMode}
                    latType={latType}
                    selectedModels={selectedBenchmarks}
                    activeFilters={activeFilters}
                    xAxisMax={xAxisMax}
                    showPerChip={showPerChip}
                    showSelectedOnly={showSelectedOnly}
                    showPareto={showPareto}
                    showLabels={showLabels}
                    showDataLabels={showDataLabels}
                    setIsInspectorOpen={setIsInspectorOpen}
                    qualityMetrics={qualityMetrics}
                    setQualityInspectOpen={setQualityInspectOpen}
                    fetchQualityData={fetchQualityData}
                    state={dashboardState}
                    awsBucketConfigs={awsBucketConfigs}
                    handleAddAWSBucket={handleAddAWSBucket}
                    removeAWSBucket={removeAWSBucket}
                />
        </div>

    );
};




export default Dashboard;
