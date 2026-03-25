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

import { useState, useEffect, useRef, useCallback } from 'react';
import { CacheManager } from '../utils/cacheManager';
import { QualityParser } from '../utils/qualityParser';
import { normalizeHardware, normalizeModelName } from '../utils/dataParser';
import { parseJsonEntry, parseLogFile, parseLpgManifest, parseLpgConfig } from '../utils/dataParser';
import { useGCS } from './useGCS';
import { useGIQ } from './useGIQ';
import { useLLMD } from './useLLMD';
import { useAWS } from './useAWS';
import { getBenchmarkKey } from '../utils/dashboardHelpers';

export const useDashboardData = (initialState, dashboardState) => {
    const { selectedBenchmarks, setSelectedBenchmarks, xAxisMax, setXAxisMax } = dashboardState;
    const pendingRequests = useRef(new Map());
    const [data, setData] = useState([]);
    const dataRef = useRef(data);
    useEffect(() => { dataRef.current = data; }, [data]);
    const [loading, setLoading] = useState(true);
    const [gcsLoading, setGcsLoading] = useState(false);
    const [gcsError, setGcsError] = useState(null);
    const [gcsSuccess, setGcsSuccess] = useState(null);
    const [lpgLoading, setLpgLoading] = useState(false);
    const [lpgError, setLpgError] = useState(null);
    const [lpgPasteText, setLpgPasteText] = useState("");
    const [driveLoading, setDriveLoading] = useState(false);
    const [driveStatus, setDriveStatus] = useState("");
    const [driveProgress, setDriveProgress] = useState(0);
    const [driveError, setDriveError] = useState(null);
    const [qualityMetrics, setQualityMetrics] = useState(null);
    const [availableSources, setAvailableSources] = useState(() => {
        try {
            const savedSourcesStr = localStorage.getItem('selectedSources');
            if (savedSourcesStr) return new Set(JSON.parse(savedSourcesStr));
        } catch { }
        return new Set(['local']);
    });
    const [selectedSources, setSelectedSources] = useState(() => {
        try {
            const savedSourcesStr = localStorage.getItem('selectedSources');
            if (savedSourcesStr) return new Set(JSON.parse(savedSourcesStr));
        } catch { }
        return initialState?.sources || new Set(['local']);
    });
    const [bucketConfigs, setBucketConfigs] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('prism_saved_sources') || '{}');
            return saved.buckets || initialState?.buckets || [];
        } catch { return initialState?.buckets || []; }
    });
    const [awsBucketConfigs, setAwsBucketConfigs] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('prism_saved_sources') || '{}');
            return saved.awsBuckets || initialState?.awsBuckets || [];
        } catch { return initialState?.awsBuckets || []; }
    });
    const [apiConfigs, setApiConfigs] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('prism_saved_sources') || '{}');
            const projects = saved.giqProjects || saved.apis || initialState?.giqProjects || [];
            if (projects.length > 0) {
                return projects.map(p => ({ projectId: p, token: localStorage.getItem(`giq_token_${p}`) || '' }));
            }
        } catch { }
        return [];
    });
    const [gcsProfiles, setGcsProfiles] = useState([]);
    const [enableLLMDResults, setEnableLLMDResults] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('prism_saved_sources') || '{}');
            if (saved.llmdEnabled !== undefined) return saved.llmdEnabled;
        } catch { }
        return initialState?.enableLLMDResults ?? false;
    });
    const [toasts, setToasts] = useState([]);
    const [siteName, setSiteName] = useState("");
    const [contactUrl, setContactUrl] = useState("");
    const [newBucketName, setNewBucketName] = useState("");
    const [newBucketAlias, setNewBucketAlias] = useState("");
    const [connectionType, setConnectionType] = useState("gcs");
    const [newProjectId, setNewProjectId] = useState("");
    const [newAuthToken, setNewAuthToken] = useState("");
    const [showSampleData, setShowSampleData] = useState(true);
    const [expandedModels, setExpandedModels] = useState(new Set());
    const [debugInfo, setDebugInfo] = useState(null);
    const [qualityInspectOpen, setQualityInspectOpen] = useState(false);
    const [expandedIntegration, setExpandedIntegration] = useState(null);
    const isRestored = useRef(false);

    // True while restoreConnections is running — keeps the loading spinner active
    // until all saved GCS/GIQ sources have been fetched. Initialized to true if there
    // are any saved connections (determined synchronously from localStorage).
    const hasSavedConnections = (() => {
        try {
            const s = JSON.parse(localStorage.getItem('prism_saved_sources') || '{}');
            return (s.buckets?.length > 0) || (s.awsBuckets?.length > 0) ||
                (s.giqProjects?.length > 0) || (s.apis?.length > 0);
        } catch { return false; }
    })();
    const [isRestoringConnections, setIsRestoringConnections] = useState(hasSavedConnections);

    const API_KEY = window.env?.GOOGLE_API_KEY || import.meta.env.VITE_GOOGLE_API_KEY || import.meta.env.REACT_APP_GOOGLE_API_KEY || '';

    useEffect(() => {
        if (!isRestored.current) return;
        localStorage.setItem('enableLLMDResults', JSON.stringify(enableLLMDResults));
    }, [enableLLMDResults]);

    useEffect(() => {
        if (!isRestored.current) return;
        localStorage.setItem('bucketConfigs', JSON.stringify(bucketConfigs));
    }, [bucketConfigs]);

    useEffect(() => {
        if (!isRestored.current) return;
        const toSave = {
            buckets: bucketConfigs,
            awsBuckets: awsBucketConfigs,
            giqProjects: apiConfigs.map(c => typeof c === 'string' ? c : c.projectId),
            qualityScoresEnabled: selectedSources.has('quality_scores'),
            llmdEnabled: enableLLMDResults
        };
        localStorage.setItem('prism_saved_sources', JSON.stringify(toSave));
    }, [bucketConfigs, awsBucketConfigs, apiConfigs, selectedSources, enableLLMDResults]);

    const removeToast = (id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const addToast = (message, type = 'info') => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 8000); // 8 Seconds
    };

    // --- Extracted Block ---
    // Drive Sync Function
    // [useLLMD hook injected]
    const { syncDriveData } = useLLMD({ setData, setSelectedSources, setAvailableSources, setDriveLoading, setDriveStatus, setDriveProgress, setDriveError, enableLLMDResults, setSelectedBenchmarks, API_KEY });

    // Trigger sync when enabled, but wait for initial load
    useEffect(() => {
        if (loading) return;

        if (enableLLMDResults) {
            syncDriveData();
        } else {
            // Remove data if disabled
            setData(prev => prev.filter(d => d.source !== 'llmd_drive'));
        }
    }, [enableLLMDResults, loading]);

    // --- Extracted Block ---
    const fetchConfig = async () => {
        try {
            console.log("[useDashboardData] fetchConfig START");
            const response = await fetch('/api/config');
            console.log(`[useDashboardData] fetchConfig Response Status: ${response.status}`);
            if (response.ok) {
                const { buckets, projects, hostProject, siteName, gaTrackingId, contactUrl } = await response.json();
                console.log(`[useDashboardData] fetchConfig DATA: buckets=${buckets?.length}, projects=${projects?.length}, host=${hostProject}`);

                if (siteName) {
                    setSiteName(siteName);
                    document.title = `Prism ${siteName}`;
                }

                if (contactUrl) {
                    setContactUrl(contactUrl);
                }

                // Initialize Google Analytics if ID is provided
                if (gaTrackingId && !window.gtag) {
                    const script = document.createElement('script');
                    script.async = true;
                    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaTrackingId}`;
                    document.head.appendChild(script);

                    window.dataLayer = window.dataLayer || [];
                    function gtag() { window.dataLayer.push(arguments); }
                    gtag('js', new Date());
                    gtag('config', gaTrackingId);

                    window.gtag = gtag; // Prevent re-initialization
                }

                if (buckets && buckets.length > 0) {
                    setBucketConfigs(prev => {
                        const newSet = new Set(prev);
                        buckets.forEach(b => newSet.add(b));
                        return Array.from(newSet);
                    });
                    // Auto-select these default buckets
                    setSelectedSources(prev => {
                        const next = new Set(prev);
                        buckets.forEach(b => next.add(`gcs:${b}`));
                        return next;
                    });
                }

                if (projects && projects.length > 0) {
                    setApiConfigs(prev => {
                        // Avoid duplicates based on projectId
                        const existingIds = new Set(prev.map(c => c.projectId));
                        const newConfigs = [...prev];
                        projects.forEach(p => {
                            if (!existingIds.has(p)) {
                                newConfigs.push({ projectId: p, token: '' });
                            }
                        });
                        return newConfigs;
                    });
                }

                // Auto-Connect Host Project
                if (hostProject) {
                    const sourceKey = `giq:${hostProject}`;

                    // Check if this project is already being restored from saved settings
                    const savedJson = localStorage.getItem('prism_saved_sources');
                    const saved = savedJson ? JSON.parse(savedJson) : null;
                    const alreadyRestored = saved?.giqProjects?.includes(hostProject) || saved?.apis?.includes(hostProject);

                    // Ensure it's selected
                    setAvailableSources(s => new Set([...s, sourceKey]));
                    setSelectedSources(s => new Set([...s, sourceKey]));

                    console.log(`[Auto-Discover] hostProject=${hostProject}, alreadyRestored=${alreadyRestored}`);

                    // Always ensure it's in apiConfigs safely using prev to prevent race conditions
                    setApiConfigs(prev => {
                        if (prev.some(c => (typeof c === 'string' ? c : c.projectId) === hostProject)) return prev;
                        const storedToken = localStorage.getItem(`giq_token_${hostProject}`) || '';
                        return [...prev, { projectId: hostProject, token: storedToken }];
                    });

                    // Pre-populate gcsProfiles with loading:true
                    setGcsProfiles(p => {
                        if (p.some(x => x.bucketName === hostProject && x.type === 'giq')) return p;
                        return [...p, { bucketName: hostProject, loading: true, type: 'giq' }];
                    });
                }
                return { buckets, projects, hostProject };
            }
            return null;
        } catch (e) {
            console.error("Failed to fetch config", e);
            return null;
        }
    };

    // --- Extracted Block ---
    // [useGCS hook injected]
    const { fetchBucketData } = useGCS({ pendingRequests, addToast });

    // --- Extracted Block ---
    // [useAWS hook injected]
    const { fetchAWSBucketData } = useAWS({ pendingRequests, addToast });

    // --- Extracted Block ---
    // [useGIQ hook injected]
    const { fetchGiqData } = useGIQ({ pendingRequests, addToast, setLoading });

    // --- Extracted Block ---
    const fetchQualityData = async (forceRefresh = false) => {
        setLoading(true);
        try {
            // Rely on QualityParser's internal caching which handles versioning/bumping
            const data = await QualityParser.getAggregatedQualityProfile(forceRefresh);
            setQualityMetrics(data);
            setLoading(false);
            return data;
        } catch (error) {
            console.error("Quality Fetch Error:", error);
            addToast(`[Error] Failed to fetch Quality Scores: ${error.message}`, 'error');
            setLoading(false);
            return null;
        }
    };

    // --- Extracted Block ---
    useEffect(() => {
        const restoreConnections = async () => {
            const savedJson = localStorage.getItem('prism_saved_sources');
            isRestored.current = true; // Safe to allow saves now
            if (!savedJson) return;

            try {
                const saved = JSON.parse(savedJson);
                const restoredBuckets = saved.buckets || [];
                const restoredAwsBuckets = saved.awsBuckets || [];
                const restoredApis = saved.giqProjects || saved.apis || [];
                const restoredLlmd = saved.llmdEnabled || false;

                if (restoredBuckets.length === 0 && restoredAwsBuckets.length === 0 && restoredApis.length === 0 && !saved.qualityScoresEnabled && !restoredLlmd) return;

                // 1. Instant Feedback: Render Cards in Loading State
                setBucketConfigs(prev => Array.from(new Set([...prev, ...restoredBuckets])));
                setAwsBucketConfigs(prev => Array.from(new Set([...prev, ...restoredAwsBuckets])));
                setApiConfigs(prev => {
                    const existingIds = new Set(prev.map(c => typeof c === 'string' ? c : c.projectId));
                    const newConfigs = [...prev];
                    restoredApis.forEach(pid => {
                        if (!existingIds.has(pid)) {
                            newConfigs.push({ projectId: pid, token: localStorage.getItem(`giq_token_${pid}`) || '' });
                        }
                    });
                    return newConfigs;
                });
                setEnableLLMDResults(restoredLlmd);

                setGcsProfiles(prev => {
                    const existingGcs = new Set(prev.filter(p => p.type === 'gcs').map(p => p.bucketName));
                    const existingAws = new Set(prev.filter(p => p.type === 'aws').map(p => p.bucketName));
                    const existingGiq = new Set(prev.filter(p => p.type === 'giq').map(p => p.bucketName));

                    const newProfiles = [
                        ...restoredBuckets.filter(b => !existingGcs.has(typeof b === 'string' ? b : b.bucket)).map(b => ({ bucketName: typeof b === 'string' ? b : b.bucket, loading: true, type: 'gcs' })),
                        ...restoredAwsBuckets.filter(b => !existingAws.has(typeof b === 'string' ? b : b.bucket)).map(b => ({ bucketName: typeof b === 'string' ? b : b.bucket, loading: true, type: 'aws' })),
                        ...restoredApis.filter(pid => !existingGiq.has(pid)).map(pid => ({ bucketName: pid, loading: true, type: 'giq' }))
                    ];
                    return [...prev, ...newProfiles];
                });

                const allResults = [];

                // Fetch Buckets
                for (const b of restoredBuckets) {
                    const bName = typeof b === 'string' ? b : b.bucket;
                    try {
                        const res = await fetchBucketData(bName);
                        if (!res.profile.error) {
                            allResults.push({ type: 'gcs', id: bName, ...res });
                        } else {
                            // Update individual profile error
                            setGcsProfiles(prev => prev.map(p =>
                                p.bucketName === bName && p.type === 'gcs'
                                    ? { ...p, loading: false, error: res.profile.error }
                                    : p
                            ));
                        }
                    } catch (err) {
                        setGcsProfiles(prev => prev.map(p =>
                            p.bucketName === bName && p.type === 'gcs'
                                ? { ...p, loading: false, error: "Failed to connect" }
                                : p
                        ));
                    }
                }

                // Fetch AWS Buckets
                for (const b of restoredAwsBuckets) {
                    const bName = typeof b === 'string' ? b : b.bucket;
                    try {
                        const res = await fetchAWSBucketData(bName);
                        if (!res.profile.error) {
                            allResults.push({ type: 'aws', id: bName, ...res });
                        } else {
                            setGcsProfiles(prev => prev.map(p =>
                                p.bucketName === bName && p.type === 'aws'
                                    ? { ...p, loading: false, error: res.profile.error }
                                    : p
                            ));
                        }
                    } catch (err) {
                        setGcsProfiles(prev => prev.map(p =>
                            p.bucketName === bName && p.type === 'aws'
                                ? { ...p, loading: false, error: "Failed to connect" }
                                : p
                        ));
                    }
                }

                // Fetch APIs
                for (const pid of restoredApis) {
                    const token = localStorage.getItem(`giq_token_${pid}`) || '';
                    try {
                        let res = await fetchGiqData(pid, token);

                        // Auto-Retry Logic: If User Token Expired (401/403), retry with ADC
                        if (res.profile.error && token && (res.profile.error.includes('401') || res.profile.error.includes('403'))) {
                            console.log(`[Persistence] Token expired for ${pid}. Retrying with ADC...`);
                            const retryRes = await fetchGiqData(pid, '');
                            if (!retryRes.profile.error) {
                                res = retryRes; // Success! Use retry result
                            }
                        }

                        console.log(`[Persistence] GIQ Fetch for ${pid} returned ${res?.entries?.length || 0} entries.`);

                        if (!res.profile.error) {
                            allResults.push({ type: 'giq', id: pid, ...res });
                        } else {
                            // If backend returns error (e.g. 401/403 despite ADC), show it
                            setGcsProfiles(prev => prev.map(p =>
                                p.bucketName === pid && p.type === 'giq'
                                    ? { ...p, loading: false, error: res.profile.error }
                                    : p
                            ));
                        }
                    } catch (err) {
                        setGcsProfiles(prev => prev.map(p =>
                            p.bucketName === pid && p.type === 'giq'
                                ? { ...p, loading: false, error: "Connection Failed" }
                                : p
                        ));
                    }
                }

                if (allResults.length > 0) {
                    // Batch update data
                    setData(prev => {
                        let next = [...prev];
                        allResults.forEach((r) => {
                            const sourceKey = `${r.type}:${r.id}`;
                            const normalized = r.entries.map(e => {
                                const hw = normalizeHardware(e.hardware);
                                return { ...e, hardware: hw, metadata: { ...e.metadata, hardware: hw }, source: sourceKey };
                            });
                            next = [...next, ...normalized];
                        });
                        return next.map((d, i) => ({ ...d, id: i }));
                    });

                    // Update Profiles with Success
                    setGcsProfiles(prev => {
                        const updated = [...prev];
                        allResults.forEach(r => {
                            const idx = updated.findIndex(p => p.bucketName === r.id && p.type === r.type);
                            if (idx !== -1) {
                                updated[idx] = { ...updated[idx], ...r.profile, rawResponse: r.rawResponse, loading: false, type: r.type, bucketName: r.id };
                            } else {
                                updated.push({ ...r.profile, rawResponse: r.rawResponse, loading: false, type: r.type, bucketName: r.id });
                            }
                        });
                        return updated;
                    });

                    const newSources = allResults.map(r => `${r.type}:${r.id}`);
                    setAvailableSources(prev => new Set([...prev, ...newSources]));
                    setSelectedSources(prev => new Set([...prev, ...newSources]));

                    // Update models
                    const allKeys = new Set();
                    allResults.forEach(r => {
                        const sourceKey = `${r.type}:${r.id}`;
                        r.entries.forEach(e => {
                            allKeys.add(getBenchmarkKey({ ...e, source: sourceKey }));
                        });
                    });

                    setSelectedBenchmarks(prev => {
                        if (prev.size > 0) return prev;
                        return allKeys;
                    });
                }

                if (saved.qualityScoresEnabled) {
                    fetchQualityData(false);
                    setSelectedSources(prev => { const n = new Set(prev); n.add('quality_scores'); return n; });
                    setAvailableSources(prev => { const n = new Set(prev); n.add('quality_scores'); return n; });
                }
            } catch (e) {
                console.error("Failed to restore connections", e);
            } finally {
                setIsRestoringConnections(false);
            }
        };

        if (isRestoringConnections) {
            restoreConnections();
        } else {
            isRestored.current = true;
        }
    }, []);

    // --- Extracted Block ---
    useEffect(() => {
        if (loading) {
            const t = setTimeout(() => {
                console.warn("Loading took too long. Forcing completion.");
                setLoading(false);
                setGcsLoading(false);
            }, 60000);
            return () => clearTimeout(t);
        }
    }, [loading]);

    const updateSourceData = (sourceKey, newEntries, profile) => {
        const normalized = newEntries.map(e => ({ ...e, source: sourceKey }));

        setData(prev => {
            // Remove existing entries for this source
            const filtered = prev.filter(d => d.source !== sourceKey);
            // Add new entries, ensuring unique IDs
            const next = [...filtered, ...normalized].map((d, i) => ({ ...d, id: i }));
            return next;
        });

        setGcsProfiles(prev => {
            const existing = prev.filter(p => `${p.type}:${p.bucketName}` !== sourceKey);
            return [...existing, profile];
        });

        setAvailableSources(prev => new Set([...prev, sourceKey]));
        setSelectedSources(prev => new Set([...prev, sourceKey]));

        const newKeys = normalized.map(d => getBenchmarkKey(d));
        setSelectedBenchmarks(prev => {
            const next = new Set(prev);
            if (prev.size === 0 && newKeys.length > 0) {
                // Auto-select a representative if none selected
                const llama = newKeys.find(k => k.toLowerCase().includes('llama'));
                next.add(llama || newKeys[0]);
            }
            return next;
        });
    };

    const handleAddGCSBucket = async (alias = null, bucketNameOverride = null) => {
        const nameToUse = bucketNameOverride || newBucketName;
        if (!nameToUse) return;
        const cleanName = nameToUse.replace(/^gs:\/\//, '').replace(/\/$/, '');

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
            setGcsError(`GCS Error: ${result.profile.error}`);
        } else {
            const newEntry = alias ? { bucket: cleanName, alias } : cleanName;
            setBucketConfigs(prev => [...prev, newEntry]);

            const finalProfile = { ...result.profile, alias: alias || cleanName, type: 'gcs' };
            updateSourceData(`gcs:${cleanName}`, result.entries, finalProfile);

            setNewBucketName('');
            setGcsSuccess(`Added bucket: ${alias || cleanName}`);
            setTimeout(() => setGcsSuccess(null), 3000);
        }
    };

    const handleAddAWSBucket = async (alias = null, bucketNameOverride = null) => {
        const nameToUse = bucketNameOverride || newBucketName;
        if (!nameToUse) return;
        const cleanName = nameToUse.replace(/^s3:\/\//, '').replace(/\/$/, '');

        const exists = awsBucketConfigs.some(b => {
            const bName = typeof b === 'string' ? b : b.bucket;
            return bName === cleanName;
        });

        if (exists) {
            setGcsError('AWS Bucket already configured.');
            return;
        }

        setGcsLoading(true);
        const result = await fetchAWSBucketData(cleanName);
        setGcsLoading(false);

        if (result.profile.error) {
            setGcsError(`AWS Error: ${result.profile.error}`);
        } else {
            const newEntry = alias ? { bucket: cleanName, alias } : cleanName;

            setAwsBucketConfigs(prev => [...prev, newEntry]);

            setSelectedSources(prev => new Set([...prev, `aws:${cleanName}`]));
            setAvailableSources(prev => new Set([...prev, `aws:${cleanName}`]));

            const finalProfile = { ...result.profile, alias: alias || cleanName, type: 'aws' };

            updateSourceData(`aws:${cleanName}`, result.entries, finalProfile);

            const newModels = [...new Set(result.entries.map(d => d.model).filter(m => m !== 'Unknown'))];
            setSelectedBenchmarks(prev => {
                const next = new Set(prev);
                if (prev.size === 0 && newModels.length > 0) {
                    const candidate = newModels.find(m => m.toLowerCase().includes('llama')) || newModels[0];
                    next.add(candidate);
                }
                return next;
            });

            setNewBucketName('');
            setGcsSuccess(`Added AWS bucket: ${alias || cleanName}`);
            setTimeout(() => setGcsSuccess(null), 3000);
        }
    };

    const handleAddGIQProject = async (projectIdOverride = null, tokenOverride = null) => {
        const idToUse = projectIdOverride || newProjectId;
        const tokenToUse = tokenOverride || newAuthToken;
        if (!idToUse) return;

        const exists = apiConfigs.some(c => c.projectId === idToUse);
        if (exists) {
            setGcsError('Project ID already configured.');
            return;
        }

        setGcsLoading(true);
        const result = await fetchGiqData(idToUse, tokenToUse);
        setGcsLoading(false);

        if (result.profile.error) {
            setGcsError(`GIQ Error: ${result.profile.error}`);
        } else {
            setApiConfigs(prev => [...prev, { projectId: idToUse, token: tokenToUse }]);
            localStorage.setItem(`giq_token_${idToUse}`, tokenToUse); // Persist token

            const finalProfile = { ...result.profile, bucketName: idToUse, type: 'giq' };
            updateSourceData(`giq:${idToUse}`, result.entries, finalProfile);

            setNewProjectId('');
            setNewAuthToken('');
            setGcsSuccess(`Added GIQ Project: ${idToUse}`);
            setTimeout(() => setGcsSuccess(null), 3000);
        }
    };

    const removeGCSBucket = (bucketName) => {
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
    };

    const removeAWSBucket = (bucketName) => {
        const newConfigs = awsBucketConfigs.filter(b => {
            const bName = typeof b === 'string' ? b : b.bucket;
            return bName !== bucketName;
        });
        setAwsBucketConfigs(newConfigs);

        const sourceKey = `aws:${bucketName}`;
        const newSources = new Set(selectedSources);
        newSources.delete(sourceKey);
        setSelectedSources(newSources);
        setAvailableSources(prev => {
            const n = new Set(prev);
            n.delete(sourceKey);
            return n;
        });

        setData(prev => prev.filter(d => d.source !== sourceKey).map((d, i) => ({ ...d, id: i })));
        setGcsProfiles(prev => prev.filter(p => `aws:${p.bucketName}` !== sourceKey));
    };

    const removeGIQProject = (projectId) => {
        const newConfigs = apiConfigs.filter(c => c.projectId !== projectId);
        setApiConfigs(newConfigs);
        localStorage.removeItem(`giq_token_${projectId}`); // Remove persisted token

        const sourceKey = `giq:${projectId}`;
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
    };

    // --- Extracted Block ---
    const fetchLocalData = async () => {
        try {
            const results = [];
            let hasDataJson = false;

            // 1. Fetch data.json (Standard Local Sample)
            try {
                const res = await fetch('/data.json');
                if (res.ok) {
                    const contentType = res.headers.get("content-type");
                    if (contentType && contentType.indexOf("application/json") !== -1) {
                        const json = await res.json();
                        if (Array.isArray(json)) {
                            results.push(...json);
                            hasDataJson = true;
                        }
                    }
                }
            } catch (e) {
                console.warn("Could not load /data.json", e);
            }

            // Note: llm-d-benchmarks.json is now loaded via fetchArchivedData as part of the LLM-D Results Store integration.

            if (results.length === 0) {
                console.warn("No local data found (checked /data.json and /data/llm-d-benchmarks.json)");
                return [];
            }

            return results.map((d, i) => {
                const newD = { ...d, _raw: d._raw || d, source: d.source || 'local' };

                // Allow extraction of ISL/OSL from model string if needed
                // Format: "... (..., 8000/1000, ...)"
                if (newD.model && newD.model.includes('/') && (!newD.isl || !newD.osl)) {
                    const match = newD.model.match(/, (\d+)\/(\d+),/);
                    if (match) {
                        newD.isl = parseInt(match[1]);
                        newD.osl = parseInt(match[2]);
                    }
                }

                // Hoist Nested Metrics (Crucial for llm-d-benchmarks.json compatibility)
                if (newD.metrics) {
                    if (newD.throughput === undefined) newD.throughput = newD.metrics.throughput || newD.metrics.total_token_throughput || 0;
                    if (newD.latency === undefined || !newD.latency.mean) newD.latency = newD.metrics.latency || newD.latency;
                    if (newD.ttft === undefined || !newD.ttft.mean) newD.ttft = newD.metrics.ttft || newD.ttft;
                    // Fix for missing TPOT on chart
                    if (newD.time_per_output_token === undefined) newD.time_per_output_token = newD.metrics.tpot || newD.metrics.mean_tpot_ms || 0;
                }

                // Robust Metadata Backfill
                newD.metadata = newD.metadata || {};
                newD.metadata.model_name = newD.metadata.model_name || newD.model_name || newD.model?.split('(')[0]?.trim() || 'Unknown';
                newD.metadata.hardware = newD.metadata.hardware || newD.hardware || 'Unknown';
                newD.metadata.precision = newD.metadata.precision || newD.precision || 'Unknown';
                newD.metadata.backend = newD.metadata.backend || newD.backend || 'Unknown';
                newD.metadata.configuration = newD.metadata.configuration || newD.configuration || 'Unknown';
                newD.metadata.tensor_parallelism = newD.metadata.tensor_parallelism || newD.tensor_parallelism || newD.tp || 8; // Default to 8 if missing/legacy
                newD.metadata.prefill_node_count = newD.prefill_node_count;
                newD.metadata.decode_node_count = newD.decode_node_count;

                if (newD.isl) newD.metadata.input_seq_len = newD.isl;
                if (newD.osl) newD.metadata.output_seq_len = newD.osl;

                // Normalize model names
                if (newD.model_name) newD.model_name = normalizeModelName(newD.model_name);
                if (newD.metadata?.model_name) newD.metadata.model_name = normalizeModelName(newD.metadata.model_name);

                // Normalize Hardware/Accelerator
                newD.hardware = normalizeHardware(newD.hardware);
                if (newD.metadata) newD.metadata.hardware = newD.hardware;

                // Add Source Info if missing (Critical for Inspector)
                if (!newD.source_info) {
                    newD.source_info = {
                        type: newD.source === 'local' ? 'local' : 'file',
                        origin: newD.source || 'file',
                        file_identifier: newD.filename || 'data.json',
                        raw_url: newD.raw_url || null
                    };
                }

                // Add Diagnostics if missing
                if (!newD._diagnostics) {
                    newD._diagnostics = {
                        msg: [],
                        raw_snapshot: d // Use original d as snapshot
                    };
                }

                // ms to us conversion for legacy reasons if needed, but keeping standard
                if (newD.latency?.mean && newD.latency.mean < 100) {
                    newD.latency.mean *= 1000;
                    if (newD.latency.p50) newD.latency.p50 *= 1000;
                    if (newD.latency.p99) newD.latency.p99 *= 1000;
                    if (newD.latency.min) newD.latency.min *= 1000;
                    if (newD.latency.max) newD.latency.max *= 1000;
                }
                if (newD.ttft?.mean && newD.ttft.mean < 100) {
                    newD.ttft.mean *= 1000;
                    if (newD.ttft.p50) newD.ttft.p50 *= 1000;
                    if (newD.ttft.p99) newD.ttft.p99 *= 1000;
                    if (newD.ttft.min) newD.ttft.min *= 1000;
                    if (newD.ttft.max) newD.ttft.max *= 1000;
                }
                return newD;
            });
        } catch (e) {
            console.error("Failed to load local data", e);
            throw e;
        }
    };

    // --- Extracted Block ---
    async function fetchArchivedData() {
        try {
            const files = [
                '/data/archive/llmd_results/archived_drive_data.json',
                '/data/archive/llmd_results/llm-d-benchmarks.json'
            ];

            const results = await Promise.all(files.map(async (file) => {
                try {
                    const res = await fetch(`${file}?t=${Date.now()}`);
                    if (!res.ok) return [];
                    const json = await res.json();
                    if (!Array.isArray(json)) return [];

                    const filename = file.split('/').pop();
                    return json.map(j => ({ ...j, _source_file: filename }));
                } catch (e) {
                    console.warn(`Failed to load ${file}`, e);
                    return [];
                }
            }));

            const allBenchmarks = results.flat();
            console.log(`Loaded ${allBenchmarks.length} unified archived benchmarks from ${files.length} files.`);

            return allBenchmarks.map((d, i) => {
                const newD = { ...d, _raw: d, source: 'llm-d-results:google_drive' };
                // Extract Sweep ID from run_id (e.g., prefix before -run_ or -vllm-)
                const runId = d.run_id || 'unknown';
                let sweepId = runId;
                if (runId.includes('-run_')) sweepId = runId.split('-run_')[0];
                else if (runId.includes('-vllm-')) sweepId = runId.split('-vllm-')[0];
                else if (runId.includes('-setup_')) sweepId = runId.split('-setup_')[0];

                // Ensure valid source info
                newD.source_info = {
                    type: 'drive_archive',
                    origin: sweepId !== 'unknown' ? sweepId : 'llm-d Results Store', // Fallback for fixed static files
                    run_id: runId,   // Keep original run_id
                    file_identifier: d._source_file || d.filename || 'archived_data'
                };

                // Robust Configuration Parsing from Folder Structure (User Requirement)
                // Matches patterns like: pd-disaggregation.setup_standalone_1_2_NA_NA_NA_NA
                const pathString = (d.id || '') + (d.source_info?.origin || '') + (d.source_info?.file_identifier || '') + (d.filename || '');

                // Standalone Parser: setup_standalone_<Nodes>_<TP>_...
                const stdMatch = pathString.match(/setup_standalone_(\d+)_(\d+)_/);
                if (stdMatch) {
                    const nodes = parseInt(stdMatch[1], 10);
                    const tp = parseInt(stdMatch[2], 10);
                    newD.accelerator_count = nodes * tp;
                    newD.architecture = 'aggregated';
                    newD.metadata = newD.metadata || {};
                    newD.metadata.accelerator_count = newD.accelerator_count; // Sync for grouping logic
                    newD.metadata.tensor_parallelism = tp;
                    newD.metadata.node_count = nodes;
                    newD.metadata.configuration = `${nodes} Node${nodes > 1 ? 's' : ''} (TP${tp})`;
                    newD.pd_ratio = 'Aggregated';
                    // Ensure Model Name in Table reflects this config if multiple exist (though ideally clean)
                    // We rely on the "Nodes" and "Chips" columns to distinguish them.
                }

                // Disaggregated Parser: setup_modelservice_NA_NA_<P_Node>_<P_TP>_<D_Node>_<D_TP>
                const disaggMatch = pathString.match(/setup_modelservice_NA_NA_(\d+)_(\d+)_(\d+)_(\d+)/);
                if (disaggMatch) {
                    const pNode = parseInt(disaggMatch[1], 10);
                    const pTp = parseInt(disaggMatch[2], 10);
                    const dNode = parseInt(disaggMatch[3], 10);
                    const dTp = parseInt(disaggMatch[4], 10);

                    newD.accelerator_count = (pNode * pTp) + (dNode * dTp);
                    newD.architecture = 'disaggregated';
                    newD.metadata = newD.metadata || {};
                    newD.metadata.accelerator_count = newD.accelerator_count; // Sync for grouping logic
                    newD.metadata.prefill_node_count = pNode;
                    newD.metadata.prefill_tp = pTp;
                    newD.metadata.decode_node_count = dNode;
                    newD.metadata.decode_tp = dTp;

                    // Enforce Standard Configuration Format
                    const totalNodes = pNode + dNode;
                    newD.metadata.configuration = `${totalNodes}: ${pNode}P-TP${pTp} ${dNode}D-TP${dTp}`;
                    newD.pd_ratio = `${pNode}:${dNode}`;
                }

                // Setup Inf Parser: inference-perf_...-setup_inf_sche_...-run_...
                // Matches patterns like: setup_inf_sche_none_yaml
                const infMatch = pathString.match(/setup_inf_sche_([a-z0-9_]+)/i);
                if (infMatch && !newD.metadata.configuration) {
                    newD.metadata = newD.metadata || {};
                    newD.metadata.variant = infMatch[1].replace(/_yaml$/i, '');
                    newD.metadata.configuration = `Serving: ${newD.metadata.variant}`;
                    newD.architecture = 'aggregated';
                    newD.pd_ratio = 'Aggregated';
                }

                // Robust Metadata Backfill (Copied from fetchLocalData to ensure compatibility)
                newD.metadata = newD.metadata || {};
                newD.metadata.model_name = normalizeModelName(newD.metadata.model_name || newD.model_name || 'Unknown');
                newD.metadata.hardware = normalizeHardware(newD.metadata.hardware || newD.hardware || 'Unknown');
                newD.metadata.configuration = newD.metadata.configuration || newD.configuration || 'Unknown';
                newD.metadata.tensor_parallelism = newD.metadata.tensor_parallelism || newD.tensor_parallelism || newD.tp || 8;

                // Precision extraction from path/id
                let precision = 'Unknown';
                const lowerPath = pathString.toLowerCase();
                if (lowerPath.includes('fp4')) precision = 'FP4';
                else if (lowerPath.includes('fp8')) precision = 'FP8';
                else if (lowerPath.includes('int8')) precision = 'INT8';
                else if (lowerPath.includes('fp16')) precision = 'FP16';
                else if (lowerPath.includes('bf16') || lowerPath.includes('bfloat16')) precision = 'BF16';

                newD.precision = precision;
                newD.metadata.precision = precision;

                // FLATTEN METRICS for Dashboard Compatibility
                if (newD.metrics) {
                    newD.throughput = Number(newD.metrics.throughput || newD.metrics.total_token_throughput || 0);
                    newD.tokens_per_second = newD.throughput; // Chart compatibility

                    newD.latency = newD.metrics.latency || newD.latency || { mean: 0, p50: 0, p99: 0 };
                    // Ensure mean is a number
                    if (newD.latency && typeof newD.latency.mean !== 'number') newD.latency.mean = Number(newD.latency.mean || 0);

                    newD.ttft = newD.metrics.ttft || newD.ttft || { mean: 0, p50: 0 };
                    if (newD.ttft && typeof newD.ttft.mean !== 'number') newD.ttft.mean = Number(newD.ttft.mean || 0);

                    newD.qps = Number(newD.workload?.target_qps || newD.metrics.request_rate || 0);
                    // Critical for chart filtering/plotting (chartMode === 'tpot')
                    newD.time_per_output_token = Number(newD.metrics.time_per_output_token || newD.metrics.tpot || newD.metrics.mean_tpot_ms || 0);
                    newD.tpot = newD.time_per_output_token;
                    newD.ntpot = newD.time_per_output_token;

                    // Ensure nested metrics match for chart getVal(metrics.ntpot)
                    newD.metrics.ntpot = newD.ntpot;
                    newD.metrics.throughput = newD.throughput;
                    newD.metrics.tokens_per_second = newD.throughput;
                }

                // FLATTEN WORKLOAD
                if (newD.workload) {
                    newD.isl = newD.workload.input_tokens || newD.isl || 0;
                    newD.osl = newD.workload.output_tokens || newD.osl || 0;
                    newD.prompt_len = newD.workload.input_tokens || newD.isl || 0;
                    newD.output_len = newD.workload.output_tokens || newD.osl || 0;
                }

                // FLATTEN DISAGGREGATED CONFIG (Critical for Table/Chart Display)
                newD.metadata.prefill_node_count = newD.metadata.prefill_node_count || newD.prefill_node_count || 0;
                newD.metadata.decode_node_count = newD.metadata.decode_node_count || newD.decode_node_count || 0;
                newD.metadata.prefill_tp = newD.metadata.prefill_tp || newD.prefill_tp || 0;
                newD.metadata.decode_tp = newD.metadata.decode_tp || newD.decode_tp || 0;

                // FLATTEN METADATA
                newD.model = newD.metadata.model_name;

                // Consistently append variant/configuration to model name for separation in UI
                let suffix = '';
                if (newD.metadata?.variant) {
                    suffix = ` [${newD.metadata.variant}]`;
                } else if (newD.metadata?.configuration && newD.metadata.configuration !== 'Unknown') {
                    // Use hardware config (e.g. from standalone/modelservice parser)
                    suffix = ` [${newD.metadata.configuration}]`;
                } else if (newD.configuration && newD.configuration !== 'Unknown') {
                    suffix = ` [${newD.configuration}]`;
                }

                if (suffix) {
                    newD.model += suffix;
                    console.log(`[fetchArchivedData] Appended config suffix to model: ${newD.model}`);
                }

                newD.model_name = normalizeModelName(newD.metadata.model_name || newD.model_name || 'Unknown'); // Critical for filter dropdowns
                newD.hardware = normalizeHardware(newD.metadata.hardware || newD.hardware || 'Unknown');
                newD.accelerator_count = newD.metadata.accelerator_count || newD.accelerator_count || 1;
                newD.metadata.tensor_parallelism = newD.metadata.tensor_parallelism || 8;
                newD.tensor_parallelism = newD.metadata.tensor_parallelism;
                newD.tp = newD.tensor_parallelism; // Sync for helpers

                newD.backend = newD.metadata.backend || 'Unknown';
                // Map variant to configuration for specialized grouping in Dashboard.jsx
                if (newD.metadata.variant) {
                    newD.configuration = newD.metadata.variant;
                }

                // Associate all results store benchmarks with llm-d serving stack
                newD.serving_stack = 'llm-d';
                newD.metadata.serving_stack = 'llm-d';

                return newD;
            });
        } catch (e) {
            console.warn("Failed to load archived drive data", e);
            return [];
        }
    };

    // --- Extracted Block ---
    const restoreSampleData = async () => {
        setGcsLoading(true);
        try {
            const localEntries = await fetchLocalData();

            if (!localEntries || localEntries.length === 0) {
                setGcsLoading(false);
                return false;
            }

            // Add to data
            setData(prev => {
                const next = [...prev, ...localEntries].map((d, i) => ({ ...d, id: i }));
                return next;
            });

            // Update Sources
            setAvailableSources(prev => new Set([...prev, 'local']));
            setSelectedSources(prev => new Set([...prev, 'local'])); // Auto-select
            setShowSampleData(true);

            // Re-populate models for local data
            const localModels = new Set(localEntries.map(d => d.model).filter(m => m !== 'Unknown'));
            setSelectedBenchmarks(prev => {
                const next = new Set(prev);
                localModels.forEach(m => next.add(m));
                return next;
            });

            setGcsLoading(false);
            return true;
        } catch (e) {
            setGcsError(`Failed to restore sample data: ${e.message}`);
            setGcsLoading(false);
            return false;
        }
    };

    const removeSampleData = () => {
        // Remove 'local' source entries from data
        setData(prev => prev.filter(d => d.source !== 'local'));

        // Remove 'local' from selected and available sources
        setSelectedSources(prev => {
            const next = new Set(prev);
            next.delete('local');
            return next;
        });
        setAvailableSources(prev => {
            const next = new Set(prev);
            next.delete('local');
            return next;
        });

        setShowSampleData(false);
    };

    const removeLLMDData = () => {
        // Remove 'llmd_drive' (live syncs) and 'llm-d-results:google_drive' (archive) from data
        setData(prev => prev.filter(d => d.source !== 'llmd_drive' && d.source !== 'llm-d-results:google_drive'));

        // Remove from selected and available sources
        setSelectedSources(prev => {
            const next = new Set(prev);
            next.delete('llmd_drive');
            next.delete('llm-d-results:google_drive');
            return next;
        });
        setAvailableSources(prev => {
            const next = new Set(prev);
            next.delete('llmd_drive');
            next.delete('llm-d-results:google_drive');
            return next;
        });

        // Also clean up any lingering local data if needed, but the main two cover the standard flows.
        setEnableLLMDResults(false);
    };

    // --- Extracted Block ---
    const loadAllData = async (fetchedConfig = null) => {
        console.log("[useDashboardData] loadAllData START");
        setLoading(true);
        setGcsLoading(true);
        setGcsError(null);

        const failedSources = [];

        try {
            // 1. Fetch Local Data
            let allData = [];
            try {
                const localEntries = await fetchLocalData();
                allData = [...localEntries];

                // If we explicitly fetched local data but it's empty, 
                // ensure the toggle reflects that it's not active by default.
                if (localEntries.length === 0) {
                    setShowSampleData(false);
                }
            } catch (e) {
                console.error("Failed to load local data", e);
                failedSources.push(`Sample Data (${e.message})`);
            }

            // 1c. Fetch Archived Drive Data
            try {
                if (enableLLMDResults) {
                    const archivedEntries = await fetchArchivedData();
                    if (archivedEntries.length > 0) {
                        allData = [...allData, ...archivedEntries];
                        setAvailableSources(prev => new Set([...prev, 'llm-d-results:google_drive']));
                        // Force select archived_drive if locally available
                        setSelectedSources(prev => new Set([...prev, 'llm-d-results:google_drive']));
                    }
                }
            } catch (e) {
                console.warn("Failed to load archived data", e);
            }



            // 2. Fetch All Configured Buckets
            const bucketResults = await Promise.all(bucketConfigs.map(b => {
                const bName = typeof b === 'string' ? b : b.bucket;
                return fetchBucketData(bName).then(res => ({ ...res, config: b }));
            }));

            const newProfiles = [];
            bucketResults.forEach(res => {
                if (res) {
                    if (res.profile.error) {
                        failedSources.push(res.bucketName);
                    }

                    const normalizedEntries = (res.entries || []).map(e => {
                        const hw = normalizeHardware(e.hardware);
                        return {
                            ...e,
                            hardware: hw,
                            metadata: { ...e.metadata, hardware: hw },
                            source: `gcs:${res.bucketName}`
                        };
                    });

                    if (normalizedEntries.length > 0) {
                        allData = [...allData, ...normalizedEntries];
                    }

                    const alias = typeof res.config === 'object' ? res.config.alias : null;

                    newProfiles.push({
                        bucketName: res.bucketName,
                        alias: alias || res.bucketName, // Default to bucket name if no alias
                        files: res.profile.files,
                        entryCount: (res.entries || []).length,
                        visible: true,
                        error: res.profile.error || null,
                        loadedAt: res.profile.loadedAt,
                        type: 'gcs'
                    });
                }
            });

            // 3. Fetch API Sources
            const apiProfiles = [];

            // Build a list of APIs to fetch, combining apiConfigs and any discovered projects from fetchConfig
            const apisToFetch = [...apiConfigs];
            if (fetchedConfig && fetchedConfig.projects) {
                fetchedConfig.projects.forEach(p => {
                    if (!apisToFetch.some(c => (typeof c === 'string' ? c : c.projectId) === p)) {
                        apisToFetch.push({ projectId: p, token: '' });
                    }
                });
            }
            if (fetchedConfig && fetchedConfig.hostProject && !apisToFetch.some(c => (typeof c === 'string' ? c : c.projectId) === fetchedConfig.hostProject)) {
                apisToFetch.push({ projectId: fetchedConfig.hostProject, token: '' });
            }

            for (const config of apisToFetch) {
                // Backward compatibility check
                const projectId = typeof config === 'string' ? config : config.projectId;
                const token = typeof config === 'string' ? '' : config.token;

                // Allow empty token for shared configuration (Backend Proxy handles auth)
                // if (!token) ... check removed.

                try {
                    const apiData = await fetchGiqData(projectId, token);

                    // Check for profile error from fetchGiqData
                    if (apiData.profile.error) {
                        failedSources.push(`GIQ:${projectId}`);
                    }

                    apiProfiles.push({
                        bucketName: projectId,
                        files: [],
                        entryCount: apiData.entries.length,
                        visible: true,
                        error: apiData.entries.length === 0 ? (apiData.profile.error || "No data found") : null,
                        rawResponse: apiData.rawResponse,
                        profileCount: apiData.profile ? apiData.profile.profileCount : (apiData.rawResponse?.profile?.length || 0),
                        loadedAt: apiData.profile.loadedAt || new Date().toISOString(),
                        type: 'giq'
                    });

                    // We need to push entries, not the result object
                    if (apiData.entries) {
                        const normalizedEntries = apiData.entries.map(e => {
                            const hw = normalizeHardware(e.hardware);
                            return { ...e, hardware: hw, metadata: { ...e.metadata, hardware: hw }, source: `giq:${projectId}` };
                        });
                        allData.push(...normalizedEntries);
                    }
                } catch (e) {
                    console.warn(`Failed to fetch for project ${projectId}`, e);
                    failedSources.push(`GIQ:${projectId}`);
                    apiProfiles.push({
                        bucketName: projectId,
                        files: [],
                        entryCount: 0,
                        visible: true,
                        error: "Failed to connect",
                        type: 'giq',
                        rawResponse: { error: e.message }
                    });
                }
            }

            // Assign IDs
            const dataWithIds = allData.map((d, i) => ({ ...d, id: i }));

            console.log(`[useDashboardData] loadAllData FINISHED. Found ${dataWithIds.length} total benchmarks.`);

            setData(prev => {
                // Keep entries from prev that were NOT fetched by loadAllData to preserve concurrent fetches
                const loadedSources = new Set(dataWithIds.map(d => d.source));

                // For GIQ specifically, we need to be careful as they can fetch the same source.
                // If this is a fresh loadAllData, we generally want its data to take precedence for the sources it *did* fetch.
                const retainedPrev = prev.filter(p => !loadedSources.has(p.source));

                // Merge and recalculate IDs
                const merged = [...retainedPrev, ...dataWithIds];
                return merged.map((d, i) => ({ ...d, id: i }));
            });

            setGcsProfiles(prev => {
                const updated = [...prev];
                [...newProfiles, ...apiProfiles].forEach(newProf => {
                    const idx = updated.findIndex(p => p.bucketName === newProf.bucketName && p.type === newProf.type);
                    if (idx !== -1) {
                        updated[idx] = { ...updated[idx], ...newProf };
                    } else {
                        updated.push(newProf);
                    }
                });
                return updated;
            });

            // Extract unique sources from MERGED data
            setData(prev => {
                const currentSources = new Set(prev.map(d => d.source || 'local'));
                const validSources = new Set([...currentSources, ...dataWithIds.map(d => d.source || 'local')]);

                if (selectedSources.has('quality_scores')) {
                    validSources.add('quality_scores');
                }

                setAvailableSources(validSources);

                if (initialState.sources && initialState.sources.size > 0 && !initialState.sources.has('local')) {
                    const allowed = new Set();
                    validSources.forEach(vs => {
                        if (initialState.sources.has(vs)) {
                            allowed.add(vs);
                        } else if (vs.startsWith('giq') && initialState.sources.has('giq')) {
                            allowed.add(vs);
                        } else if (vs === 'llm-d-results:google_drive' || vs === 'quality_scores') {
                            allowed.add(vs);
                        }
                    });
                    setSelectedSources(prevSources => new Set([...prevSources, ...allowed]));
                } else {
                    setSelectedSources(prevSources => new Set([...prevSources, ...validSources]));
                }

                return prev; // We don't modify data here
            });

            // Trigger auto-selection if current state is empty AND no initial defaults provided
            const hasInitialModels = initialState.selectedModels && initialState.selectedModels.size > 0;
            if (selectedBenchmarks.size === 0 && !hasInitialModels && dataWithIds.length > 0) {
                const initialSelection = new Set();
                const sourcesInNext = new Set(dataWithIds.map(d => d.source || 'local'));

                sourcesInNext.forEach(src => {
                    const sourceEntries = dataWithIds.filter(d => (d.source || 'local') === src);
                    const sorted = sourceEntries.sort((a, b) => {
                        if (!a.timestamp) return 1;
                        if (!b.timestamp) return -1;
                        return new Date(b.timestamp) - new Date(a.timestamp);
                    });
                    if (sorted.length > 0) initialSelection.add(getBenchmarkKey(sorted[0]));
                });
                setSelectedBenchmarks(initialSelection);
            }

            // Update max latency (using xAxisMax state)
            const latencies = dataWithIds.map(d => d.latency?.mean).filter(l => l > 0);
            if (latencies.length > 0) {
                // Only update if it seems like a default (Infinity) or user hasn't set a specific low value
                if (xAxisMax === Infinity) {
                    setXAxisMax(Math.max(...latencies));
                }
            }

            if (failedSources.length > 0) {
                setGcsError(`Failed to load data from: ${failedSources.join(', ')}`);
            }

        } catch (err) {
            console.error("Global Load Error:", err);
            setGcsError(`Application Error: ${err.message}.`);
        } finally {
            setLoading(false);
            setGcsLoading(false);
        }
    };

    // --- Extracted Block ---
    const handleLpgGcsScan = async (bucketUri) => {
        const cleanUri = bucketUri.replace(/^gs:\/\//, '').replace(/\/$/, '');
        const firstSlashIndex = cleanUri.indexOf('/');

        let bucketName = cleanUri;
        let prefix = '';
        if (firstSlashIndex !== -1) {
            bucketName = cleanUri.substring(0, firstSlashIndex);
            prefix = cleanUri.substring(firstSlashIndex + 1);
        }

        let usingProxy = false;
        let allItems = [];
        let nextPageToken = null;

        // Build base URL with optional prefix
        let url = `https://storage.googleapis.com/storage/v1/b/${bucketName}/o`;
        let proxyUrl = `/api/gcs/storage/v1/b/${bucketName}/o`;

        const params = new URLSearchParams();
        if (prefix) {
            params.append('prefix', prefix.endsWith('/') ? prefix : prefix + '/');
        }

        try {
            do {
                let fetchUrl = url;
                let fetchProxyUrl = proxyUrl;

                const currentParams = new URLSearchParams(params);
                if (nextPageToken) {
                    currentParams.append('pageToken', nextPageToken);
                }

                const queryStr = currentParams.toString();
                if (queryStr) {
                    fetchUrl += `?${queryStr}`;
                    fetchProxyUrl += `?${queryStr}`;
                }

                let response = await fetch(fetchUrl);

                if (response.status === 401 || response.status === 403) {
                    response = await fetch(fetchProxyUrl);
                    if (response.ok) {
                        usingProxy = true;
                    }
                }

                if (response.status === 404) {
                    throw new Error(`Bucket '${bucketName}' not found or does not exist.`);
                } else if (!response.ok) {
                    throw new Error(`Failed to access bucket: HTTP ${response.status}`);
                }

                const json = await response.json();
                if (json.items) {
                    allItems = allItems.concat(json.items);
                }

                nextPageToken = json.nextPageToken;
            } while (nextPageToken);
        } catch (error) {
            throw error;
        }

        if (allItems.length === 0) throw new Error('No files found in bucket or folder.');

        const prefixDir = prefix ? (prefix.endsWith('/') ? prefix : prefix + '/') : '';

        // Determine if the prefix itself is a leaf node benchmark
        // A leaf node contains the actual metric files we want to parse.
        const isLeafNode = prefixDir !== '' && allItems.some(item => {
            const relName = item.name.substring(prefixDir.length);
            return relName.endsWith('lifecycle_metrics.json') ||
                relName.endsWith('manifest.yaml') ||
                relName === 'metadata.json' ||
                relName === 'params.json' ||
                relName.startsWith('output/') ||
                relName.startsWith('logs/') ||
                relName.startsWith('results/') ||
                (relName.indexOf('/') === -1 && relName.endsWith('.json'));
        });

        // Group files by relative top-level folder
        const folders = {};

        if (isLeafNode) {
            const singleFolderName = prefix.split('/').filter(Boolean).pop() || prefixDir;
            folders[singleFolderName] = allItems;
        } else {
            allItems.forEach(item => {
                let relativeName = item.name;
                if (prefixDir && relativeName.startsWith(prefixDir)) {
                    relativeName = relativeName.substring(prefixDir.length);
                }

                const parts = relativeName.split('/');

                let folder;
                if (parts.length > 1) {
                    folder = parts[0];
                } else {
                    folder = prefix ? prefix.split('/').filter(Boolean).pop() : 'root';
                }

                if (!folders[folder]) folders[folder] = [];
                folders[folder].push(item);
            });
        }

        let folderNames = Object.keys(folders);
        if (folderNames.length === 0) throw new Error('No files found.');

        // Sort folders by most recent 'updated' timestamp of any file inside them
        folderNames = folderNames.sort((a, b) => {
            const latestA = Math.max(...folders[a].map(f => new Date(f.updated || 0).getTime()));
            const latestB = Math.max(...folders[b].map(f => new Date(f.updated || 0).getTime()));
            return latestB - latestA; // descending
        });

        return { folders, folderNames, cleanBucketName: bucketName, usingProxy };
    };

    const handleLpgGcsLoad = async (bucketUri, foldersToLoad, foldersMap, usingProxy) => {
        console.log("handleLpgGcsLoad CALLED with:", bucketUri);
        if (!bucketUri) return;
        setLpgLoading(true);
        setLpgError(null);

        const cleanUri = bucketUri.replace(/^gs:\/\//, '').replace(/\/$/, '');
        const firstSlashIndex = cleanUri.indexOf('/');
        const cleanBucketName = firstSlashIndex !== -1 ? cleanUri.substring(0, firstSlashIndex) : cleanUri;
        let allNewEntries = [];
        let folderCount = 0;

        try {
            console.log("handleLpgGcsLoad STARTING TRY BLOCK for:", cleanBucketName);

            await Promise.all(foldersToLoad.map(async (folder) => {
                try {
                    const files = foldersMap[folder];

                    // Relaxed search: find manifest and metrics ANYWHERE within this logical leaf node folder
                    // i.e., "config/manifest.yaml" or "stage_4_lifecycle_metrics.json"
                    const manifestFile = files.find(f => f.name.endsWith('manifest.yaml'));
                    const configFile = files.find(f => f.name.endsWith('config.yaml'));
                    const metricFiles = files.filter(f => f.name.endsWith('lifecycle_metrics.json') && !f.name.endsWith('summary_lifecycle_metrics.json'));

                    if (!metricFiles.length) return;

                    let syntheticMetadata = "";
                    let model = 'Unknown';
                    let hw = 'Unknown';
                    let count = 1;
                    let tp = 1;
                    let backend = 'vllm';
                    let precision = 'bfloat16'; // Usually bfloat16 for these tests

                    if (manifestFile) {
                        let manifestUrl = manifestFile.mediaLink;
                        if (usingProxy && manifestUrl.startsWith('https://storage.googleapis.com/')) {
                            manifestUrl = `/api/gcs/${manifestUrl.replace('https://storage.googleapis.com/', '')}`;
                        }
                        const manifestRes = await fetch(manifestUrl);
                        if (manifestRes.ok) {
                            const yamlTxt = await manifestRes.text();
                            const meta = parseLpgManifest(yamlTxt);
                            model = meta.model;
                            hw = meta.hw;
                            count = meta.count;
                            tp = meta.tp;
                            backend = meta.backend;
                        }
                    }

                    // Fallback to config.yaml for model name if manifest didn't provide it
                    if (model === 'Unknown' && configFile) {
                        let configUrl = configFile.mediaLink;
                        if (usingProxy && configUrl.startsWith('https://storage.googleapis.com/')) {
                            configUrl = `/api/gcs/${configUrl.replace('https://storage.googleapis.com/', '')}`;
                        }
                        const configRes = await fetch(configUrl);
                        if (configRes.ok) {
                            const configTxt = await configRes.text();
                            const meta = parseLpgConfig(configTxt);
                            if (meta.model && meta.model !== 'Unknown') {
                                model = meta.model;
                            }
                        }
                    }

                    if (manifestFile || configFile) {
                        syntheticMetadata = JSON.stringify({
                            config: { model, tensor_parallel: tp, backend, precision },
                            infrastructure: { accelerator_type: hw, accelerator_count: count }
                        }) + "\n";
                    }

                    for (const metricFile of metricFiles) {
                        let metricUrl = metricFile.mediaLink;
                        if (usingProxy && metricUrl.startsWith('https://storage.googleapis.com/')) {
                            metricUrl = `/api/gcs/${metricUrl.replace('https://storage.googleapis.com/', '')}`;
                        }
                        const metricRes = await fetch(metricUrl);
                        if (metricRes.ok) {
                            const metricTxt = await metricRes.text();
                            const combinedText = syntheticMetadata + metricTxt;
                            const entries = parseLogFile(combinedText, `${folder}/${metricFile.name}`);

                            if (entries.length > 0) {
                                entries.forEach(e => {
                                    e.source = `lpg:${cleanBucketName}`;
                                    e.source_info = {
                                        type: 'lpg',
                                        origin: `lpg:${cleanUri}`,
                                        file_identifier: `${folder}/${metricFile.name}`,
                                        raw_url: metricFile.mediaLink
                                    };
                                });
                                allNewEntries.push(...entries);
                            }
                        }
                    }
                    if (allNewEntries.length > 0) folderCount++;
                } catch (e) {
                    console.error(`Failed parsing folder ${folder}`, e);
                }
            }));

            if (allNewEntries.length > 0) {
                const sourceKey = `lpg:${cleanBucketName}`;
                // Keep data array clean, filter out ONLY the specific folders (origins) we are loading right now
                // so we don't accidentally wipe out other folders loaded from the exact same bucket.
                const loadingOrigins = new Set(allNewEntries.map(e => e.source_info?.origin));
                const filteredData = data.filter(d => !loadingOrigins.has(d.source_info?.origin));

                const startId = filteredData.length;
                const dataWithIds = allNewEntries.map((d, i) => ({
                    ...d, id: startId + i
                }));

                setData([...filteredData, ...dataWithIds]);
                setSelectedSources(prev => new Set([...prev, sourceKey]));
                setAvailableSources(prev => new Set([...prev, sourceKey]));
                setGcsSuccess(`Loaded ${allNewEntries.length} metrics from ${folderCount} ${folderCount === 1 ? 'folder' : 'folders'} in ${cleanBucketName}.`);
            } else {
                setLpgError("No valid benchmark metrics could be parsed from the bucket folders.");
            }
        } catch (e) {
            console.error("LPG GCS Load Error:", e);
            setLpgError(`Failed to load from GCS: ${e.message}`);
        } finally {
            setLpgLoading(false);
        }
    };

    const handleLpgFileUpload = async (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        setLpgLoading(true);
        setLpgError(null);
        let allNewEntries = [];
        let errors = 0;
        const newSourceKeys = [];

        try {
            // Process files sequentially to avoid freezing UI
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const text = await file.text();
                const entries = parseLogFile(text, file.name);

                if (entries.length > 0) {
                    // Use filename as unique source key for this upload
                    const sourceKey = `infperf:${file.name}`;
                    newSourceKeys.push(sourceKey);

                    // Tag each entry with this specific source
                    entries.forEach(e => {
                        e.source = sourceKey;
                        e.source_info = {
                            ...e.source_info,
                            type: 'lpg',
                            file_identifier: file.name
                        };
                    });
                    allNewEntries.push(...entries);
                } else {
                    errors++;
                }
            }

            if (allNewEntries.length > 0) {
                // Assign unique IDs
                const startId = data.length;
                const dataWithIds = allNewEntries.map((d, i) => ({
                    ...d,
                    id: startId + i
                }));

                setData(prev => [...prev, ...dataWithIds]);

                // Add all new source keys to selection
                setSelectedSources(prev => {
                    const newSet = new Set(prev);
                    newSourceKeys.forEach(k => newSet.add(k));
                    return newSet;
                });
                setAvailableSources(prev => {
                    const newSet = new Set(prev);
                    newSourceKeys.forEach(k => newSet.add(k));
                    return newSet;
                });

                setGcsSuccess(`Successfully loaded ${allNewEntries.length} LPG metrics from ${newSourceKeys.length} file(s).`);
            } else {
                setLpgError("No valid LPG metrics found in selected files.");
            }
        } catch (err) {
            console.error("LPG Parse Error:", err);
            setLpgError("Failed to parse log files.");
        } finally {
            setLpgLoading(false);
            // Reset input
            event.target.value = '';
        }
    };

    return {
        data, setData,
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
        qualityInspectOpen, setQualityInspectOpen,
        expandedIntegration, setExpandedIntegration,
        awsBucketConfigs, setAwsBucketConfigs,
        fetchAWSBucketData, handleAddAWSBucket, removeAWSBucket
    };
};
