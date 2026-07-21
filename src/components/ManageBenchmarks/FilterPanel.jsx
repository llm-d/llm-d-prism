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

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Filter, ChevronDown, ChevronUp, Check, ArrowDown01, ArrowDown10, Loader, FileText, FileClock, Sliders, Search, Activity, TrendingUp, ShieldCheck, Database, Layout, HelpCircle, Bookmark, Trash2, Settings, X, Pencil, Laptop, CloudUpload, ArrowRight } from 'lucide-react';
import { MultiSelectDropdown } from '../common';
import { Button, Input, Select, Label } from '../ui';
import { cn } from '../../utils/cn';
import { USE_CASE_META, formatOriginLabel } from '../../utils/dashboardHelpers';
import { useGitHubAuth } from '../../hooks/useGitHubAuth';

const SPEC_LABELS = {
    hardware: 'Hardware Spec',
    timestamp: 'Timestamp',
    stage: 'Stage Count',
    nodes: 'Nodes & Parallelism',
    islOsl: 'ISL/OSL',
    maxTput: 'Max Throughput',
    minLat: 'Min Latency',
    qps: 'QPS',
    inputTput: 'Input Tok/s',
    outputTput: 'Output Tok/s',
    totalTput: 'Total Tok/s',
    ntpot: 'NTPOT (ms)',
    tpot: 'TPOT (ms)',
    itl: 'ITL (ms)',
    ttft: 'TTFT (ms)',
    e2e: 'E2E Latency',
    costIn: 'Cost/1M In ($)',
    costOut: 'Cost/1M Out ($)',
    inputLen: 'Input Length',
    outputLen: 'Output Length'
};

const FILTER_FIELD_LABELS = {
    servingStack: 'Serving Stack',
    modelServer: 'Model Server',
    optimizations: 'Optimizations',
    components: 'Components',
    pdRatio: 'P/D Node Ratio',
    isl: 'Input (ISL)',
    osl: 'Output (OSL)',
    ratio: 'Workload Type',
    useCase: 'Use Case',
    hardware: 'Accelerators',
    acc_count: 'Accelerator Count'
};

const getKpiFilterLabel = (filter) => {
    switch (filter) {
        case 'my-submissions': return 'My Benchmarks';
        case 'staged': return 'Locally Staged';
        case 'processing': return 'Processing';
        case 'in_review': return 'Under Review';
        case 'approved': return 'Published';
        case 'action': return 'Rejected';
        default: return filter;
    }
};

export const FilterPanel = ({
    showFilterPanel,
    filterOptions,
    activeFilters,
    facetCounts,
    toggleFilter,
    selectedModels,
    modelStats,
    filteredBySource,
    showSelectedOnly,
    setShowSelectedOnly,
    selectedBenchmarks,
    setSelectedBenchmarks,
    setActiveFilters,
    expandedModels,
    toggleBenchmark,
    toggleModelExpansion,
    baselineBenchmarkKey,
    setBaselineBenchmarkKey,
    UnifiedDataTable,
    hideShowSelectedOnly,
    renameClearToUnselectAll,
    brv02Runs, brv02CustomLabels, setBrv02CustomLabels, removeBrv02Run,
    setShowDataPanel,
    submissionsMap = {},
    isLoadingSubmissions = false,
    loadSubmissions,
    searchTerm, setSearchTerm, kpiFilter, setKpiFilter,
    updateSubmissionStatus,
    bulkUpdateSubmissionStatus,
    onOpenSubmitDialog,
    loadAllData,
    loadingConnections,
    dashboardState
}) => {
    const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);
    const { user } = useGitHubAuth();


    const [draftFilters, setDraftFilters] = useState(null);
    const [openSections, setOpenSections] = useState({
        stack: true,
        infra: false,
        load: false,
        conn: false
    });

    const toggleSection = (section) => {
        setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // Sync draft filters with activeFilters when the drawer opens
    useEffect(() => {
        if (isAdvancedExpanded) {
            const draft = {};
            Object.entries(activeFilters).forEach(([key, val]) => {
                draft[key] = new Set(val);
            });
            setDraftFilters(draft);
        } else {
            setDraftFilters(null);
        }
    }, [isAdvancedExpanded, activeFilters]);

    const toggleDraftFilter = (category, value) => {
        setDraftFilters(prev => {
            if (!prev) return prev;
            const newSet = new Set(prev[category] || []);
            if (value === '' || value === undefined) {
                newSet.clear();
            } else {
                if (newSet.has(value)) newSet.delete(value);
                else newSet.add(value);
            }
            return { ...prev, [category]: newSet };
        });
    };

    const [showSpecsDropdown, setShowSpecsDropdown] = useState(false);
    const [showViewSettings, setShowViewSettings] = useState(false);
    const [showPresetsDropdown, setShowPresetsDropdown] = useState(false);
    const [isTimelineExpanded, setIsTimelineExpanded] = useState(() => {
        try {
            const saved = localStorage.getItem('prism_manage_timeline_expanded');
            return saved !== null ? saved === 'true' : true;
        } catch { return true; }
    });

    const toggleTimelineExpanded = () => {
        setIsTimelineExpanded(prev => {
            const next = !prev;
            try {
                localStorage.setItem('prism_manage_timeline_expanded', String(next));
            } catch (e) {}
            return next;
        });
    };

    // Filter Presets State and Handlers
    const [presets, setPresets] = useState(() => {
        try {
            const saved = localStorage.getItem('prism_manage_presets');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    const [newPresetName, setNewPresetName] = useState('');
    const [editingPreset, setEditingPreset] = useState(null);
    const [editPresetName, setEditPresetName] = useState('');
    const [editPresetFilters, setEditPresetFilters] = useState({});
    const [editPresetKpi, setEditPresetKpi] = useState(null);
    const [editPresetSearch, setEditPresetSearch] = useState('');

    const isPresetActive = (preset) => {
        if ((preset.searchTerm || '') !== (searchTerm || '')) return false;
        if ((preset.kpiFilter || null) !== (kpiFilter || null)) return false;
        
        const allFields = new Set([
            ...Object.keys(activeFilters),
            ...Object.keys(preset.filters || {})
        ]);
        
        for (const field of allFields) {
            const currentSet = activeFilters[field];
            const presetArr = preset.filters?.[field] || [];
            
            const currentSize = currentSet instanceof Set ? currentSet.size : 0;
            const presetSize = presetArr.length;
            
            if (currentSize !== presetSize) return false;
            if (currentSize > 0) {
                for (const val of presetArr) {
                    if (!currentSet.has(val)) return false;
                }
            }
        }
        return true;
    };

    const applyPreset = (preset) => {
        if (isPresetActive(preset)) {
            setSearchTerm('');
            setKpiFilter(null);
            const newFilters = {};
            Object.keys(activeFilters).forEach(key => {
                newFilters[key] = new Set();
            });
            setActiveFilters(newFilters);
        } else {
            setSearchTerm(preset.searchTerm || '');
            setKpiFilter(preset.kpiFilter || null);
            const newFilters = {};
            Object.keys(activeFilters).forEach(key => {
                newFilters[key] = new Set(preset.filters?.[key] || []);
            });
            setActiveFilters(newFilters);
        }
    };

    const hasFiltersToSave = React.useMemo(() => {
        const filtersToUse = draftFilters || activeFilters;
        const hasActiveFilters = Object.values(filtersToUse).some(valSet => valSet instanceof Set && valSet.size > 0);
        return hasActiveFilters || !!searchTerm || !!kpiFilter;
    }, [draftFilters, activeFilters, searchTerm, kpiFilter]);

    const handleSavePreset = (e) => {
        e.preventDefault();
        if (!newPresetName.trim() || !hasFiltersToSave) return;
        
        const filtersToUse = draftFilters || activeFilters;
        const filtersToSave = {};
        Object.entries(filtersToUse).forEach(([key, set]) => {
            if (set instanceof Set && set.size > 0) {
                filtersToSave[key] = Array.from(set);
            }
        });
        
        const newPreset = {
            id: Date.now().toString(),
            name: newPresetName.trim(),
            filters: filtersToSave,
            kpiFilter: kpiFilter || null,
            searchTerm: searchTerm || ''
        };
        
        const updated = [...presets, newPreset];
        setPresets(updated);
        try {
            localStorage.setItem('prism_manage_presets', JSON.stringify(updated));
        } catch (e) { console.warn(e); }
        setNewPresetName('');
    };

    const handleDeletePreset = (presetId) => {
        const updated = presets.filter(p => p.id !== presetId);
        setPresets(updated);
        try {
            localStorage.setItem('prism_manage_presets', JSON.stringify(updated));
        } catch (e) { console.warn(e); }
        if (editingPreset?.id === presetId) {
            setEditingPreset(null);
        }
    };

    const handleUpdatePreset = () => {
        if (!editingPreset || !editPresetName.trim()) return;
        const updated = presets.map(p => {
            if (p.id === editingPreset.id) {
                return {
                    ...p,
                    name: editPresetName.trim(),
                    filters: editPresetFilters,
                    kpiFilter: editPresetKpi,
                    searchTerm: editPresetSearch
                };
            }
            return p;
        });
        setPresets(updated);
        try {
            localStorage.setItem('prism_manage_presets', JSON.stringify(updated));
        } catch (e) { console.warn(e); }
        setEditingPreset(null);
    };

    const openEditPreset = (preset) => {
        setEditingPreset(preset);
        setEditPresetName(preset.name);
        setEditPresetFilters({ ...preset.filters });
        setEditPresetKpi(preset.kpiFilter || null);
        setEditPresetSearch(preset.searchTerm || '');
        setIsAdvancedExpanded(true);
    };

    const activePreset = React.useMemo(() => {
        return presets.find(isPresetActive) || null;
    }, [presets, isPresetActive]);

    const [groupBy, setGroupBy] = useState(() => {
        try {
            const saved = localStorage.getItem('prism_manage_group_by');
            return saved || 'Model';
        } catch { return 'Model'; }
    });
    
    const [sortByField, setSortByField] = useState(() => {
        try {
            const saved = localStorage.getItem('prism_manage_sort_by');
            return saved || 'timestamp';
        } catch { return 'timestamp'; }
    });

    const [sortDirection, setSortDirection] = useState(() => {
        try {
            const saved = localStorage.getItem('prism_manage_sort_dir');
            return saved || 'desc';
        } catch { return 'desc'; }
    });

    const [isFiltersExpanded, setIsFiltersExpanded] = useState(() => {
        try {
            const saved = localStorage.getItem('prism_manage_filters_expanded');
            return saved !== null ? saved === 'true' : true;
        } catch { return true; }
    });

    const [visibleSpecs, setVisibleSpecs] = useState(() => {
        const defaults = {
            hardware: true,
            timestamp: true,
            stage: true,
            nodes: false,
            islOsl: false,
            maxTput: true,
            minLat: true,
            qps: false,
            inputTput: false,
            outputTput: false,
            totalTput: false,
            ntpot: false,
            tpot: false,
            itl: false,
            ttft: false,
            e2e: false,
            costIn: false,
            costOut: false,
            inputLen: false,
            outputLen: false
        };
        try {
            const saved = localStorage.getItem('prism_manage_visible_specs');
            if (saved) {
                return { ...defaults, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.warn("Failed to load visible specs from local storage", e);
        }
        return defaults;
    });

    useEffect(() => {
        try {
            localStorage.setItem('prism_manage_group_by', groupBy);
        } catch (e) { console.warn(e); }
    }, [groupBy]);

    useEffect(() => {
        try {
            localStorage.setItem('prism_manage_sort_by', sortByField);
        } catch (e) { console.warn(e); }
    }, [sortByField]);

    useEffect(() => {
        try {
            localStorage.setItem('prism_manage_sort_dir', sortDirection);
        } catch (e) { console.warn(e); }
    }, [sortDirection]);

    useEffect(() => {
        try {
            localStorage.setItem('prism_manage_filters_expanded', isFiltersExpanded.toString());
        } catch (e) { console.warn(e); }
    }, [isFiltersExpanded]);

    useEffect(() => {
        try {
            localStorage.setItem('prism_manage_visible_specs', JSON.stringify(visibleSpecs));
        } catch (e) { console.warn(e); }
    }, [visibleSpecs]);

    // Calculate totals for KPI category cards
    const totalCount = modelStats.length;
    
    const verifiedCount = modelStats.filter(s => {
        const firstEntry = s.data?.[0];
        if (!firstEntry) return false;
        const src = firstEntry.source || '';
        const isBrv02 = src.startsWith('brv02:') || firstEntry.source_info?.type === 'benchmark_report_v02';
        if (!isBrv02) return false;
        const isMine = src.startsWith('brv02:') || (user && firstEntry.github_author?.username === user.username);
        return isMine;
    }).length;

    const legacyCount = totalCount - verifiedCount;

    const statusCounts = React.useMemo(() => {
        let staged = 0;
        let processing = 0;
        let inReview = 0;
        let approved = 0;
        let rejected = 0;

        modelStats.forEach(s => {
            const firstEntry = s.data?.[0];
            if (!firstEntry) return;
            const src = firstEntry.source || '';
            const isBrv02 = src.startsWith('brv02:') || firstEntry.source_info?.type === 'benchmark_report_v02';
            
            if (isBrv02) {
                const isMine = src.startsWith('brv02:') || (user && firstEntry.github_author?.username === user.username);
                if (!isMine) return;

                const runId = src.startsWith('brv02:') ? src.replace('brv02:', '') : firstEntry.run_id;
                const sub = submissionsMap ? submissionsMap[runId] : null;
                const status = sub?.status || firstEntry.source_info?.submission_state || 'staged';
                
                if (status === 'staged') staged++;
                else if (status === 'submitted_pending_processing' || status === 'processing') processing++;
                else if (status === 'submitted_pending_review' || status === 'in_review') inReview++;
                else if (status === 'public' || status === 'promoted' || status === 'approved') approved++;
                else if (status === 'rejected' || status === 'changes_requested') rejected++;
            }
        });

        return { staged, processing, inReview, approved, rejected };
    }, [modelStats, submissionsMap, user]);

    const allRuns = React.useMemo(() => {
        const runs = [];
        modelStats.forEach(s => {
            if (s.data) {
                s.data.forEach(run => {
                    runs.push(run);
                });
            }
        });
        return runs;
    }, [modelStats]);

    const submissionsOverTime = React.useMemo(() => {
        const countsByDate = {};
        allRuns.forEach(run => {
            const dateVal = run.timestamp || run.source_info?.submitted_at;
            if (!dateVal) return;
            const date = new Date(dateVal);
            if (isNaN(date.getTime())) return;
            const dateStr = date.toISOString().split('T')[0];
            countsByDate[dateStr] = (countsByDate[dateStr] || 0) + 1;
        });

        const data = [];
        const now = new Date();
        for (let i = 14; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            data.push({
                date: dateStr,
                count: countsByDate[dateStr] || 0
            });
        }
        return data;
    }, [allRuns]);

    const sparklinePath = React.useMemo(() => {
        const data = submissionsOverTime;
        if (data.length < 2) return '';
        const width = 140;
        const height = 24;
        const maxVal = Math.max(...data.map(d => d.count), 1);
        const minVal = 0;
        const valRange = maxVal - minVal;
        
        return data.map((d, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - ((d.count - minVal) / valRange) * height;
            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        }).join(' ');
    }, [submissionsOverTime]);

    // Active regressions count
    const regressionCount = React.useMemo(() => {
        if (!baselineBenchmarkKey) return 0;
        let count = 0;
        modelStats.forEach(s => {
            if (s.benchmarkKey === baselineBenchmarkKey) return;
            const baseline = modelStats.find(b => b.benchmarkKey === baselineBenchmarkKey);
            if (!baseline) return;
            const currentTput = s.maxTput || 0;
            const baseTput = baseline.maxTput || 0;
            if (baseTput === 0) return;
            const tputDelta = ((currentTput - baseTput) / baseTput) * 100;
            if (tputDelta < -5) {
                count++;
            }
        });
        return count;
    }, [modelStats, baselineBenchmarkKey]);

    // Pareto frontier runs calculation
    const paretoKeys = React.useMemo(() => {
        const optimal = [];
        modelStats.forEach(stat => {
            if (!stat.maxTput || !stat.minLat) return;
            const isDomDominated = modelStats.some(other => {
                if (other === stat) return false;
                if (!other.maxTput || !other.minLat) return false;
                return other.maxTput >= stat.maxTput && other.minLat <= stat.minLat && (other.maxTput > stat.maxTput || other.minLat < stat.minLat);
            });
            if (!isDomDominated) optimal.push(stat.benchmarkKey);
        });
        return new Set(optimal);
    }, [modelStats]);

    const paretoCount = paretoKeys.size;

    const activeFiltersCount = React.useMemo(() => {
        let count = 0;
        Object.values(activeFilters).forEach(valSet => {
            if (valSet instanceof Set) {
                count += valSet.size;
            }
        });
        return count;
    }, [activeFilters]);

    if (!showFilterPanel) return null;

    return (
        <div className="flex flex-col gap-6 mb-4">
            {/* Top Section: Submission Tracker & Upload Benchmarks */}
            <div className="flex flex-col lg:flex-row gap-4 relative z-40">
                {/* Submission Tracker Card */}
                <div className="flex-1 lg:flex-[7] flex flex-col justify-start p-5 rounded-3xl bg-[#090c15] border border-slate-800/80 hover:border-cyan-500/20 shadow-lg transition-all duration-300 min-h-[128px]">
                            {/* Header */}
                            <div className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider pb-2 border-b border-slate-800/60 flex items-center justify-between select-none mb-2.5">
                                <div className="flex flex-col">
                                    <span className="font-sans tracking-wide">
                                        Submission Tracker
                                    </span>
                                    <span className="text-xs text-slate-400 font-normal normal-case tracking-normal mt-0.5">
                                        Click any pipeline stage below to filter results in the table below
                                    </span>
                                </div>
                                <div className="relative group/tooltip inline-block cursor-help shrink-0">
                                    <HelpCircle className="w-3.5 h-3.5 text-slate-500 hover:text-cyan-400 transition-colors" />
                                    <div className="absolute right-0 top-5 mt-1.5 px-3.5 py-3 bg-slate-900/95 border border-slate-700/50 text-slate-200 text-xs font-medium rounded-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 shadow-2xl z-[9999] w-[300px] pointer-events-none leading-relaxed normal-case tracking-normal backdrop-blur-md space-y-2">
                                        <div className="font-bold text-xs text-white border-b border-slate-800 pb-1 mb-1 font-sans">Submissions & Results Store:</div>
                                        <p className="text-xs pl-3.5 relative select-none"><span className="absolute left-0 top-[5px] w-1.5 h-1.5 rounded-sm bg-cyan-400" /> <strong>Results store</strong>: Total verified runs loaded into public database.</p>
                                        <p className="text-xs pl-3.5 relative select-none"><span className="absolute left-0 top-[5px] w-1.5 h-1.5 rounded-sm bg-amber-500" /> <strong>Locally Staged</strong>: Runs staged locally in browser session.</p>
                                        <p className="text-xs pl-3.5 relative select-none"><span className="absolute left-0 top-[5px] w-1.5 h-1.5 rounded-sm bg-yellow-500" /> <strong>Processing</strong>: Runs uploaded and undergoing automated verification.</p>
                                        <p className="text-xs pl-3.5 relative select-none"><span className="absolute left-0 top-[5px] w-1.5 h-1.5 rounded-sm bg-purple-500" /> <strong>Under Review</strong>: Submissions in queue for maintainer verification.</p>
                                        <p className="text-xs pl-3.5 relative select-none"><span className="absolute left-0 top-[5px]. w-1.5 h-1.5 rounded-sm bg-emerald-500" /> <strong>Published</strong>: Approved runs indexed and globally visible.</p>
                                        <p className="text-xs pl-3.5 relative select-none"><span className="absolute left-0 top-[5px] w-1.5 h-1.5 rounded-sm bg-red-500" /> <strong>Rejected</strong>: Failed verification checks or declined runs.</p>
                                    </div>
                                </div>
                            </div>

                            <div id="manage-tour-summary" className="flex-1 flex flex-row items-stretch gap-4 w-full select-none">
                                {/* Left stacked buttons */}
                                <div className="flex flex-col gap-1.5 w-[140px] shrink-0">
                                    {/* Button 1: Public Store */}
                                    <button
                                        onClick={() => setKpiFilter(null)}
                                        className={cn(
                                            'flex-1 flex items-center justify-between px-3 py-1.5 rounded-lg border text-left transition-all duration-300 cursor-pointer',
                                            kpiFilter === null
                                            ? 'bg-slate-900 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.12)]'
                                            : 'bg-slate-900/40 border-slate-800/60 hover:border-slate-700/60 hover:bg-slate-800/40'
                                        )}
                                    >
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Public Store</span>
                                        <span className={cn('text-sm font-black transition-colors duration-200', kpiFilter === null ? 'text-cyan-400' : 'text-slate-350')}>
                                            {totalCount}
                                        </span>
                                    </button>

                                    {/* Button 2: My Benchmarks */}
                                    <button 
                                        onClick={() => {
                                            if (kpiFilter === 'my-submissions') {
                                                setKpiFilter(null);
                                            } else {
                                                setKpiFilter('my-submissions');
                                            }
                                        }}
                                        className={cn(
                                            'flex-1 flex items-center justify-between px-3 py-1.5 rounded-lg border text-left transition-all duration-300 cursor-pointer',
                                            (kpiFilter === 'my-submissions' || ['staged', 'processing', 'in_review', 'approved', 'action'].includes(kpiFilter))
                                            ? 'bg-slate-900 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.12)]'
                                            : 'bg-slate-900/40 border-slate-800/60 hover:border-slate-700/60 hover:bg-slate-800/40'
                                        )}
                                    >
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">My Benchmarks</span>
                                        <span className={cn(
                                            'text-sm font-black transition-colors duration-200',
                                            (kpiFilter === 'my-submissions' || ['staged', 'processing', 'in_review', 'approved', 'action'].includes(kpiFilter)) ? 'text-cyan-400' : 'text-slate-350'
                                        )}>
                                            {verifiedCount}
                                        </span>
                                    </button>
                                </div>

                                {/* Right Side Stack View */}
                                {(() => {
                                    const isMySubmissionsActive = kpiFilter === 'my-submissions' || ['staged', 'processing', 'in_review', 'approved', 'action'].includes(kpiFilter);
                                    
                                    if (isMySubmissionsActive) {
                                        const { staged, processing, inReview, approved, rejected } = statusCounts;
                                        
                                        return (
                                            <div className="flex-1 flex flex-col justify-between bg-slate-900/40 border border-slate-900/80 px-3 py-2 rounded-xl">
                                                <div className="text-[10px] font-bold text-slate-400/90 uppercase tracking-wider select-none leading-none pt-0.5">
                                                    My Pipeline — Sub-Stage Tracking
                                                </div>
                                                <div className="flex items-center justify-between gap-1 border border-slate-900/60 p-1 rounded-lg select-none">
                                                    
                                                    {/* Step 1: Locally Staged */}
                                                    <button 
                                                        onClick={() => setKpiFilter(kpiFilter === 'staged' ? 'my-submissions' : 'staged')}
                                                        className={cn(
                                                            'relative flex-1 flex items-center pl-3 pr-2 py-1 rounded-md border transition-all duration-300 cursor-pointer overflow-hidden',
                                                            kpiFilter === 'staged'
                                                            ? 'bg-amber-500/5 border-amber-500/35 shadow-[0_0_12px_rgba(245,158,11,0.08)] -translate-y-0.5'
                                                            : 'bg-slate-900/25 border-transparent hover:border-slate-800/60 hover:bg-slate-900/40 hover:-translate-y-0.5'
                                                        )}
                                                    >
                                                        <div className={cn('absolute left-0 top-1 bottom-1 w-0.5 rounded-r transition-all duration-300', kpiFilter === 'staged' ? 'bg-amber-400 h-6' : 'bg-amber-500/55')} />
                                                        <div className="flex flex-col items-start leading-none text-left">
                                                            <span className="text-[8px] font-bold uppercase text-slate-400/90 tracking-wider">Staged</span>
                                                            <span className={cn('text-xs md:text-sm font-extrabold mt-0.5 transition-colors duration-200', kpiFilter === 'staged' ? 'text-amber-400 font-black' : 'text-slate-200')}>{staged}</span>
                                                        </div>
                                                    </button>

                                                    <ArrowRight className="w-3 h-3 text-slate-800 shrink-0" />

                                                    {/* Step 2: Processing */}
                                                    <button 
                                                        onClick={() => setKpiFilter(kpiFilter === 'processing' ? 'my-submissions' : 'processing')}
                                                        className={cn(
                                                            'relative flex-1 flex items-center pl-3 pr-2 py-1 rounded-md border transition-all duration-300 cursor-pointer overflow-hidden',
                                                            kpiFilter === 'processing'
                                                            ? 'bg-yellow-500/5 border-yellow-500/35 shadow-[0_0_12px_rgba(234,179,8,0.08)] -translate-y-0.5'
                                                            : 'bg-slate-900/25 border-transparent hover:border-slate-800/60 hover:bg-slate-900/40 hover:-translate-y-0.5'
                                                        )}
                                                    >
                                                        <div className={cn('absolute left-0 top-1 bottom-1 w-0.5 rounded-r transition-all duration-300', kpiFilter === 'processing' ? 'bg-yellow-400 h-6' : 'bg-yellow-500/55')} />
                                                        <div className="flex flex-col items-start leading-none text-left">
                                                            <span className="text-[8px] font-bold uppercase text-slate-400/90 tracking-wider">Processing</span>
                                                            <span className={cn('text-xs md:text-sm font-extrabold mt-0.5 transition-colors duration-200', kpiFilter === 'processing' ? 'text-yellow-400 font-black' : 'text-slate-200')}>{processing}</span>
                                                        </div>
                                                    </button>

                                                    <ArrowRight className="w-3 h-3 text-slate-800 shrink-0" />

                                                    {/* Step 3: Under Review */}
                                                    <button 
                                                        onClick={() => setKpiFilter(kpiFilter === 'in_review' ? 'my-submissions' : 'in_review')}
                                                        className={cn(
                                                            'relative flex-1 flex items-center pl-3 pr-2 py-1 rounded-md border transition-all duration-300 cursor-pointer overflow-hidden',
                                                            kpiFilter === 'in_review'
                                                            ? 'bg-purple-500/5 border-purple-500/35 shadow-[0_0_12px_rgba(168,85,247,0.08)] -translate-y-0.5'
                                                            : 'bg-slate-900/25 border-transparent hover:border-slate-800/60 hover:bg-slate-900/40 hover:-translate-y-0.5'
                                                        )}
                                                    >
                                                        <div className={cn('absolute left-0 top-1 bottom-1 w-0.5 rounded-r transition-all duration-300', kpiFilter === 'in_review' ? 'bg-purple-400 h-6' : 'bg-purple-500/55')} />
                                                        <div className="flex flex-col items-start leading-none text-left">
                                                            <span className="text-[8px] font-bold uppercase text-slate-400/90 tracking-wider">Review</span>
                                                            <span className={cn('text-xs md:text-sm font-extrabold mt-0.5 transition-colors duration-200', kpiFilter === 'in_review' ? 'text-purple-400 font-black' : 'text-slate-200')}>{inReview}</span>
                                                        </div>
                                                    </button>

                                                    <ArrowRight className="w-3 h-3 text-slate-800 shrink-0" />

                                                    {/* Step 4: Published */}
                                                    <button 
                                                        onClick={() => setKpiFilter(kpiFilter === 'approved' ? 'my-submissions' : 'approved')}
                                                        className={cn(
                                                            'relative flex-1 flex items-center pl-3 pr-2 py-1 rounded-md border transition-all duration-300 cursor-pointer overflow-hidden',
                                                            kpiFilter === 'approved'
                                                            ? 'bg-emerald-500/5 border-emerald-500/35 shadow-[0_0_12px_rgba(16,185,129,0.08)] -translate-y-0.5'
                                                            : 'bg-slate-900/25 border-transparent hover:border-slate-800/60 hover:bg-slate-900/40 hover:-translate-y-0.5'
                                                        )}
                                                    >
                                                        <div className={cn('absolute left-0 top-1 bottom-1 w-0.5 rounded-r transition-all duration-300', kpiFilter === 'approved' ? 'bg-emerald-400 h-6' : 'bg-emerald-500/55')} />
                                                        <div className="flex flex-col items-start leading-none text-left">
                                                            <span className="text-[8px] font-bold uppercase text-slate-400/90 tracking-wider">Published</span>
                                                            <span className={cn('text-xs md:text-sm font-extrabold mt-0.5 transition-colors duration-200', kpiFilter === 'approved' ? 'text-emerald-450 font-black' : 'text-slate-200')}>{approved}</span>
                                                        </div>
                                                    </button>

                                                    {/* Splitter */}
                                                    <div className="w-px h-5 bg-slate-900 self-center mx-1 shrink-0" />

                                                    {/* Step 5: Rejected */}
                                                    <button 
                                                        onClick={() => setKpiFilter(kpiFilter === 'action' ? 'my-submissions' : 'action')}
                                                        className={cn(
                                                            'relative flex-1 flex items-center pl-3 pr-2 py-1 rounded-md border transition-all duration-300 cursor-pointer overflow-hidden',
                                                            kpiFilter === 'action'
                                                            ? 'bg-red-500/5 border-red-500/35 shadow-[0_0_12px_rgba(239,68,68,0.08)] -translate-y-0.5'
                                                            : 'bg-slate-900/25 border-transparent hover:border-slate-800/60 hover:bg-slate-900/40 hover:-translate-y-0.5'
                                                        )}
                                                    >
                                                        <div className={cn('absolute left-0 top-1 bottom-1 w-0.5 rounded-r transition-all duration-300', kpiFilter === 'action' ? 'bg-red-400 h-6' : 'bg-red-500/55')} />
                                                        <div className="flex flex-col items-start leading-none text-left">
                                                            <span className="text-[8px] font-bold uppercase text-slate-400/90 tracking-wider">Rejected</span>
                                                            <span className={cn('text-xs md:text-sm font-extrabold mt-0.5 transition-colors duration-200', kpiFilter === 'action' ? 'text-red-400 font-black' : 'text-slate-200')}>{rejected}</span>
                                                        </div>
                                                    </button>

                                                </div>
                                            </div>
                                        );
                                    } else {
                                        // Public Store Selected
                                        return (
                                            <div className="flex-1 flex flex-row items-center justify-between bg-slate-900/40 border border-slate-900/80 px-4 py-2 rounded-xl select-none">
                                                <div className="flex flex-col justify-center">
                                                    <span className="text-[10px] font-bold text-slate-400/95 uppercase tracking-wider leading-none">Public Store Analytics</span>
                                                    <span className="text-[10px] text-slate-500 mt-1.5 leading-none">Submission activity (last 15 days)</span>
                                                </div>
                                                
                                                <div className="flex items-center gap-4">
                                                    {sparklinePath ? (
                                                        <div className="flex flex-col items-end">
                                                            <svg width="140" height="24" className="overflow-visible">
                                                                <path
                                                                    d={sparklinePath}
                                                                    fill="none"
                                                                    stroke="#06b6d4"
                                                                    strokeWidth="1.5"
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                />
                                                                <path
                                                                    d={`${sparklinePath} L 140 24 L 0 24 Z`}
                                                                    fill="url(#sparkline-grad)"
                                                                    stroke="none"
                                                                />
                                                                <defs>
                                                                    <linearGradient id="sparkline-grad" x1="0" y1="0" x2="0" y2="1">
                                                                        <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.15" />
                                                                        <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                                                                    </linearGradient>
                                                                </defs>
                                                            </svg>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-600">No recent activity</span>
                                                    )}
                                                    
                                                    <div className="flex flex-col items-end border-l border-slate-800/80 pl-4 h-9 justify-center">
                                                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider leading-none">Total Runs</span>
                                                        <span className="text-base font-black text-cyan-400 mt-1 leading-none">{totalCount}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }
                                })()}
                            </div>
                        </div>

                {/* Upload Benchmarks Card */}
                <div className="flex-1 lg:flex-[3] group relative bg-slate-950/70 border border-slate-900 rounded-3xl p-5 shadow-lg hover:border-cyan-500/20 transition-all duration-300 flex flex-col justify-between overflow-hidden min-h-[128px]">
                    <div>
                        {/* Header */}
                        <div className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider pb-2 border-b border-slate-800/60 flex items-center select-none mb-2.5">
                            Upload Benchmarks
                        </div>

                        {/* Descriptions of two distinct scenarios */}
                        <div className="flex flex-col gap-2.5 text-[10px] text-slate-400 leading-normal select-none my-2">
                            <div className="flex flex-col items-start pl-2.5 border-l border-emerald-500/30">
                                <strong className="text-slate-200 text-[10.5px]">1. Stage Benchmarks</strong>
                                <span className="text-slate-400 mt-0.5">Upload run files to validate format and preview curves locally.</span>
                            </div>
                            <div className="flex flex-col items-start pl-2.5 border-l border-cyan-500/30">
                                <strong className="text-slate-200 text-[10.5px]">2. Publish to Results Store</strong>
                                <span className="text-slate-400 mt-0.5">Select staged runs in the grid and click Compare & Publish to publish them.</span>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-2 w-full">
                        <Button
                            id="stage-benchmarks-btn"
                            variant="primary"
                            size="sm"
                            className="w-full font-bold"
                            onClick={(e) => {
                                e.stopPropagation();
                                try {
                                    localStorage.setItem('prism_submit_intent', 'stage-locally');
                                } catch (e) {}
                                onOpenSubmitDialog && onOpenSubmitDialog('stage-locally');
                            }}
                        >
                            Stage Benchmarks
                        </Button>
                    </div>
                </div>
            </div>

            {/* Section 2: Explorer & Registry Catalog */}
            <div className="flex flex-col gap-3.5 bg-[#070b13]/65 border border-slate-900/90 rounded-3xl p-5 shadow-2xl backdrop-blur-md relative z-30">

                    {/* Primary Row Controls (Always Visible) */}
                    <div className="flex flex-wrap items-center gap-3 bg-[#0a0f1d] border border-slate-800/60 p-3 rounded-2xl relative z-30 shadow-md">
                        {/* Search Bar */}
                        <div id="manage-tour-search" className="relative flex-1 min-w-[240px]">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <Input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by model name or hardware..."
                                className="pl-9 pr-4 text-xs rounded-xl font-medium"
                            />
                        </div>

                        {/* Primary Dropdowns */}
                        <div className="w-40 flex-shrink-0">
                            <MultiSelectDropdown 
                                label="Models"
                                options={filterOptions.models}
                                selected={activeFilters.models}
                                onChange={(val) => toggleFilter('models', val)}
                                counts={facetCounts.models}
                            />
                        </div>

                        <div className="w-40 flex-shrink-0 border-r border-slate-800/40 pr-3">
                            <MultiSelectDropdown 
                                label="Accelerators"
                                options={filterOptions.hardware}
                                selected={activeFilters.hardware}
                                onChange={(val) => toggleFilter('hardware', val)}
                                counts={facetCounts.hardware}
                            />
                        </div>

                        {/* View Options Dropdown Popover */}
                        <div className="relative">
                            <button 
                                onClick={() => {
                                    setShowViewSettings(!showViewSettings);
                                    setShowPresetsDropdown(false);
                                }}
                                className={cn(
                                    'px-3 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer flex items-center gap-1.5',
                                    showViewSettings || groupBy !== 'None' || sortByField !== 'timestamp'
                                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 font-bold'
                                    : 'bg-[#070b13] border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-205'
                                )}
                            >
                                <Sliders size={13} />
                                <span>View Options</span>
                            </button>
                            {showViewSettings && (
                                <>
                                    <div className="fixed inset-0 z-20" onClick={() => setShowViewSettings(false)} />
                                    <div className="absolute right-0 mt-2 w-72 bg-[#090d16] border border-slate-800/90 rounded-xl shadow-2xl p-4 z-[100] flex flex-col gap-4 backdrop-blur-md">
                                        <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 pb-1 border-b border-slate-800">Display Options</div>
                                        
                                        {/* Grouping */}
                                        <div className="flex flex-col gap-1.5">
                                            <Label className="mb-0 text-[9px] uppercase font-bold text-slate-400 tracking-wider">Group By</Label>
                                            <Select
                                                className="text-xs rounded-lg px-2.5 py-1.5 cursor-pointer"
                                                value={groupBy}
                                                onChange={(e) => setGroupBy(e.target.value)}
                                            >
                                                <option value="None">None</option>
                                                <option value="Model">Model</option>
                                                <option value="Hardware">Hardware</option>
                                                <option value="Origin">Source Connections</option>
                                                <option value="OriginFolder">Origin/Folder</option>
                                            </Select>
                                        </div>

                                        {/* Sorting */}
                                        <div className="flex flex-col gap-1.5">
                                            <Label className="mb-0 text-[9px] uppercase font-bold text-slate-400 tracking-wider">Sort By</Label>
                                            <div className="flex gap-1.5">
                                                <Select
                                                    className="flex-1 text-xs rounded-lg px-2.5 py-1.5 cursor-pointer"
                                                    value={sortByField}
                                                    onChange={(e) => setSortByField(e.target.value)}
                                                >
                                                    <option value="timestamp">Timestamp</option>
                                                    <option value="maxTput">Max Throughput</option>
                                                    <option value="minLat">Min Latency</option>
                                                    <option value="model">Model Name</option>
                                                    <option value="qps">QPS</option>
                                                    <option value="inputTput">Input Tok/s</option>
                                                    <option value="outputTput">Output Tok/s</option>
                                                    <option value="totalTput">Total Tok/s</option>
                                                    <option value="ntpot">NTPOT</option>
                                                    <option value="tpot">TPOT</option>
                                                    <option value="itl">ITL</option>
                                                    <option value="ttft">TTFT</option>
                                                    <option value="e2e">E2E Latency</option>
                                                    <option value="costIn">Cost/1M In</option>
                                                    <option value="costOut">Cost/1M Out</option>
                                                </Select>
                                                <button
                                                    onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                                                    title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                                                    className="p-1.5 text-slate-400 hover:text-slate-200 bg-[#06080e] rounded-lg border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer flex items-center justify-center"
                                                >
                                                    {sortDirection === 'asc' ? <ArrowDown01 size={13} /> : <ArrowDown10 size={13} />}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Columns (Metrics) */}
                                        <div className="flex flex-col gap-1.5">
                                            <Label className="mb-0 text-[9px] uppercase font-bold text-slate-400 tracking-wider">Metrics Columns</Label>
                                            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto overscroll-contain pr-1 custom-scrollbar">
                                                {Object.entries(SPEC_LABELS).map(([key, label]) => {
                                                    const isColSelected = visibleSpecs[key];
                                                    return (
                                                        <button
                                                            key={key}
                                                            onClick={() => setVisibleSpecs(prev => ({ ...prev, [key]: !prev[key] }))}
                                                            className={cn(
                                                                'text-left px-1.5 py-1 text-[10px] rounded transition-all flex items-center gap-1.5 cursor-pointer',
                                                                isColSelected ? 'bg-cyan-500/10 text-cyan-400 font-semibold' : 'text-slate-450 hover:text-slate-200'
                                                            )}
                                                        >
                                                            <div className={cn(
                                                                'w-3 h-3 rounded-sm border flex items-center justify-center',
                                                                isColSelected ? 'bg-cyan-500 border-cyan-500 text-white' : 'border-slate-800 bg-[#06080e]'
                                                            )}>
                                                                {isColSelected && <Check size={8} strokeWidth={4} />}
                                                            </div>
                                                            <span className="truncate">{label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Presets Dropdown */}
                        <div className="relative">
                            <button 
                                onClick={() => {
                                    setShowPresetsDropdown(!showPresetsDropdown);
                                    setShowViewSettings(false);
                                }}
                                className={cn(
                                    'px-3 py-2 text-xs font-semibold rounded-xl border flex items-center gap-1.5 transition-colors cursor-pointer',
                                    activePreset
                                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 font-bold'
                                    : 'bg-[#070b13] border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-205'
                                )}
                            >
                                <Bookmark size={13} />
                                <span>{activePreset ? activePreset.name : 'Presets'}</span>
                            </button>
                            {showPresetsDropdown && (
                                <>
                                    <div className="fixed inset-0 z-20" onClick={() => setShowPresetsDropdown(false)} />
                                    <div className="absolute right-0 mt-2 w-72 bg-[#090d16] border border-slate-800/90 rounded-xl shadow-2xl p-4 z-[100] flex flex-col gap-3 backdrop-blur-md">
                                        <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 pb-1 border-b border-slate-800">Filter Presets</div>
                                        {/* Presets List */}
                                        <div className="flex flex-col gap-1 max-h-40 overflow-y-auto overscroll-contain pr-1 custom-scrollbar">
                                            {presets.length === 0 ? (
                                                <div className="text-xs text-slate-500 italic p-1 select-none">No saved presets</div>
                                            ) : (
                                                presets.map(preset => {
                                                    const isActive = isPresetActive(preset);
                                                    return (
                                                        <div key={preset.id} className="flex items-center justify-between gap-2 hover:bg-slate-900/50 rounded-lg p-1">
                                                            <button 
                                                                onClick={() => {
                                                                    applyPreset(preset);
                                                                    setShowPresetsDropdown(false);
                                                                }}
                                                                className={cn('flex-1 text-left text-xs font-medium cursor-pointer transition-colors', isActive ? 'text-cyan-400 font-bold' : 'text-slate-450 hover:text-cyan-400')}
                                                            >
                                                                <span className="flex items-center gap-1.5">
                                                                    {isActive && <Check className="w-3 h-3 text-cyan-400 stroke-[2.5]" />}
                                                                    {preset.name}
                                                                </span>
                                                            </button>
                                                            <button 
                                                                onClick={() => {
                                                                    openEditPreset(preset);
                                                                    setIsAdvancedExpanded(true);
                                                                    setShowPresetsDropdown(false);
                                                                }}
                                                                className="text-slate-500 hover:text-cyan-400 p-1 rounded hover:bg-slate-800/40"
                                                                title="Edit Preset"
                                                            >
                                                                <Pencil size={11} />
                                                            </button>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                        {/* Save Preset Form */}
                                        <form 
                                            onSubmit={(e) => {
                                                handleSavePreset(e);
                                                setShowPresetsDropdown(false);
                                            }}
                                            className="flex flex-col gap-2 pt-2 border-t border-slate-800"
                                        >
                                            <div className="text-[9px] uppercase tracking-wider font-bold text-slate-500">Save current filters</div>
                                            <div className="flex gap-1.5">
                                                <Input
                                                    type="text"
                                                    placeholder="Name..."
                                                    value={newPresetName}
                                                    onChange={(e) => setNewPresetName(e.target.value)}
                                                    className="text-xs rounded-lg px-2.5 py-1.5 flex-1 font-medium"
                                                />
                                                <button
                                                    type="submit"
                                                    disabled={!newPresetName.trim() || !hasFiltersToSave}
                                                    className={cn(
                                                        'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer',
                                                        (newPresetName.trim() && hasFiltersToSave)
                                                        ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm'
                                                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800/20'
                                                    )}
                                                >
                                                    Save
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Advanced Toggle */}
                        <Button
                            id="manage-tour-filter-toggle"
                            variant="secondary"
                            size="sm"
                            onClick={() => setIsAdvancedExpanded(!isAdvancedExpanded)}
                        >
                            {isAdvancedExpanded ? "Basic Filters" : `Advanced Filters${activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}`}
                        </Button>
                    </div>

                {/* Advanced Filters Backdrop */}
                {isAdvancedExpanded && createPortal(
                    <div 
                        className="fixed inset-0 bg-black/40 z-[55] backdrop-blur-[1.5px] transition-opacity duration-200 cursor-pointer"
                        onClick={() => setIsAdvancedExpanded(false)}
                    />,
                    document.body
                )}

                {/* Advanced Filters Drawer */}
                {createPortal(
                    <div className={cn(
                        'fixed top-20 right-4 h-[calc(100vh-6rem)] w-[420px] bg-slate-950/95 border border-slate-900 shadow-2xl z-[60] flex flex-col rounded-3xl overflow-hidden transform transition-transform duration-300 backdrop-blur-xl',
                        isAdvancedExpanded ? 'translate-x-0' : 'translate-x-[calc(100%+2rem)]'
                    )}>
                    {/* Header */}
                    <div className="bg-slate-950/40 p-4 border-b border-slate-900/60 flex items-center justify-between select-none">
                        <div className="flex items-center gap-2">
                            <Sliders className="w-4 h-4 text-cyan-400" />
                            <span className="text-sm font-bold text-white tracking-wide">Advanced Filters</span>
                        </div>
                        <button 
                            onClick={() => setIsAdvancedExpanded(false)}
                            className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-900 transition-all cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                        {/* Saved Presets Section */}
                        <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-900/60 shadow-md shadow-slate-950/20 space-y-3.5 mb-2">
                            <h4 className="text-[10px] font-black uppercase tracking-wider text-cyan-400 border-b border-slate-800/60 pb-1.5 flex items-center gap-1.5 select-none">
                                <Bookmark className="w-3.5 h-3.5" /> Saved Filter Presets
                            </h4>
                            
                            {editingPreset ? (
                                /* Edit Preset Inline Mode */
                                <div className="space-y-4 pt-1 animate-in fade-in duration-200">
                                    <div className="flex items-center justify-between border-b border-slate-800/40 pb-1.5 select-none">
                                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-300">
                                            Editing Preset
                                        </span>
                                        <button 
                                            onClick={() => setEditingPreset(null)}
                                            className="text-slate-500 hover:text-white transition-colors cursor-pointer"
                                            title="Cancel editing"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>

                                    {/* Inline Name Input */}
                                    <div className="space-y-1.5">
                                        <Label className="mb-0 text-[8px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Preset Name</Label>
                                        <Input
                                            type="text"
                                            value={editPresetName}
                                            onChange={(e) => setEditPresetName(e.target.value)}
                                            className="py-1.5 text-xs rounded-xl flex-1 font-medium"
                                        />
                                    </div>

                                    {/* Inline Preset Filters List */}
                                    <div className="space-y-1.5">
                                        <Label className="mb-0 text-[8px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Saved Filter Parameters</Label>
                                        <div className="max-h-[140px] overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                                            {editPresetSearch && (
                                                <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800/40 rounded-xl px-2.5 py-1 text-[10px]">
                                                    <div className="flex items-center gap-1.5 truncate">
                                                        <span className="text-[8px] text-slate-500 font-bold uppercase select-none">Search:</span>
                                                        <span className="font-medium text-cyan-400 truncate">"{editPresetSearch}"</span>
                                                    </div>
                                                    <button 
                                                        onClick={() => setEditPresetSearch('')}
                                                        className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                                                    >
                                                        <X size={10} />
                                                    </button>
                                                </div>
                                            )}

                                            {editPresetKpi && (
                                                <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800/40 rounded-xl px-2.5 py-1 text-[10px]">
                                                    <div className="flex items-center gap-1.5 truncate">
                                                        <span className="text-[8px] text-slate-500 font-bold uppercase select-none">KPI Filter:</span>
                                                        <span className="font-medium text-cyan-400 truncate">{getKpiFilterLabel(editPresetKpi)}</span>
                                                    </div>
                                                    <button 
                                                        onClick={() => setEditPresetKpi(null)}
                                                        className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                                                    >
                                                        <X size={10} />
                                                    </button>
                                                </div>
                                            )}

                                            {Object.entries(editPresetFilters).map(([field, values]) => {
                                                if (!Array.isArray(values) || values.length === 0) return null;
                                                const fieldLabel = FILTER_FIELD_LABELS[field] || field;

                                                return values.map(val => (
                                                    <div key={`${field}-${val}`} className="flex items-center justify-between bg-slate-900/60 border border-slate-800/40 rounded-xl px-2.5 py-1 text-[10px]">
                                                        <div className="flex items-center gap-1.5 truncate">
                                                            <span className="text-[8px] text-slate-500 font-bold uppercase select-none">{fieldLabel}:</span>
                                                            <span className="font-medium text-cyan-400 truncate">{field === 'origins' ? val : val}</span>
                                                        </div>
                                                        <button 
                                                            onClick={() => {
                                                                setEditPresetFilters(prev => {
                                                                    const updated = { ...prev };
                                                                    updated[field] = updated[field].filter(x => x !== val);
                                                                    if (updated[field].length === 0) delete updated[field];
                                                                    return updated;
                                                                });
                                                            }}
                                                            className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                                                        >
                                                            <X size={10} />
                                                        </button>
                                                    </div>
                                                ));
                                            })}

                                            {(!editPresetSearch && !editPresetKpi && Object.keys(editPresetFilters).length === 0) && (
                                                <div className="text-center py-4 text-slate-500 text-[10px] select-none italic">
                                                    No filters configured in this preset.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Inline Actions Row */}
                                    <div className="flex items-center justify-between border-t border-slate-800/40 pt-3 mt-1.5">
                                        <Button
                                            type="button"
                                            variant="danger"
                                            size="xs"
                                            className="uppercase font-bold"
                                            onClick={() => handleDeletePreset(editingPreset.id)}
                                        >
                                            <Trash2 size={10} /> Delete
                                        </Button>

                                        <div className="flex gap-1.5">
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="xs"
                                                className="uppercase font-bold"
                                                onClick={() => setEditingPreset(null)}
                                            >
                                                Cancel
                                            </Button>
                                            <button
                                                type="button"
                                                onClick={handleUpdatePreset}
                                                disabled={!editPresetName.trim() || (!editPresetSearch && !editPresetKpi && Object.keys(editPresetFilters).length === 0)}
                                                className={cn(
                                                    'px-3 py-1.5 text-[9px] font-bold uppercase text-white rounded-xl transition-all cursor-pointer',
                                                    (editPresetName.trim() && (editPresetSearch || editPresetKpi || Object.keys(editPresetFilters).length > 0))
                                                    ? 'bg-cyan-600 hover:bg-cyan-500 shadow-md'
                                                    : 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
                                                )}
                                            >
                                                Update
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* Normal List & Save Form Mode */
                                <>
                                    <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto custom-scrollbar">
                                        {presets.length === 0 ? (
                                            <span className="text-xs text-slate-500 italic px-1 select-none">No saved presets</span>
                                        ) : (
                                            presets.map((preset) => {
                                                const isActive = isPresetActive(preset);
                                                return (
                                                    <div
                                                        key={preset.id}
                                                        className={cn(
                                                            'flex items-center gap-1.5 bg-[#0b0f17] border rounded-xl pl-2.5 pr-1.5 py-1 transition-all',
                                                            isActive
                                                            ? 'border-cyan-500/30 bg-cyan-500/5 shadow-sm shadow-cyan-500/5'
                                                            : 'border-slate-800/40'
                                                        )}
                                                    >
                                                        <button
                                                            onClick={() => applyPreset(preset)}
                                                            className={cn(
                                                                'text-[10px] font-semibold cursor-pointer select-none truncate max-w-[110px] transition-colors flex items-center gap-1',
                                                                isActive ? 'text-cyan-400 font-bold' : 'text-slate-350 hover:text-cyan-400'
                                                            )}
                                                            title={`Apply "${preset.name}"`}
                                                        >
                                                            {isActive && <Check className="w-2.5 h-2.5 text-cyan-400 stroke-[2.5] animate-in zoom-in-50 duration-200" />}
                                                            <span>{preset.name}</span>
                                                        </button>
                                                        <button 
                                                            onClick={() => openEditPreset(preset)}
                                                            className="p-1 text-slate-400 hover:text-cyan-400 rounded transition-all cursor-pointer flex items-center justify-center hover:bg-slate-800/40"
                                                            title="Edit Preset"
                                                        >
                                                            <Pencil size={12} className="stroke-[2.5]" />
                                                        </button>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                    <form onSubmit={handleSavePreset} className="flex items-center gap-2 pt-2 border-t border-slate-800/40 mt-1">
                                        <Input
                                            type="text"
                                            placeholder="Preset name..."
                                            value={newPresetName}
                                            onChange={(e) => setNewPresetName(e.target.value)}
                                            className="text-xs rounded-xl py-1.5 flex-1 font-medium"
                                        />
                                        <button
                                            type="submit"
                                            disabled={!newPresetName.trim() || !hasFiltersToSave}
                                            className={cn(
                                                'px-3 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-lg',
                                                (newPresetName.trim() && hasFiltersToSave)
                                                ? 'bg-cyan-600/90 hover:bg-cyan-500 text-white'
                                                : 'bg-slate-800/60 text-slate-500 cursor-not-allowed shadow-none border border-slate-800/20'
                                            )}
                                        >
                                            Save
                                        </button>
                                    </form>
                                </>
                            )}
                        </div>

                        {/* Filter dropdowns stacked vertically inside drawer */}
                        <div className="space-y-5">
                            {/* Section 1: Serving Stack & Framework */}
                            <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-800/40 space-y-3">
                                <button 
                                    onClick={() => toggleSection('stack')}
                                    className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800/30 pb-1.5 cursor-pointer select-none"
                                >
                                    <span className="flex items-center gap-1.5"><Activity className="w-3 h-3 text-cyan-500" /> Serving Stack & Framework</span>
                                    {openSections.stack ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                                {openSections.stack && (
                                    <div className="flex flex-col gap-2 pt-1 animate-in fade-in duration-150">
                                        <MultiSelectDropdown 
                                            label="Serving Stack"
                                            options={filterOptions.servingStack || []}
                                            selected={draftFilters ? draftFilters.servingStack : (activeFilters.servingStack || new Set())}
                                            onChange={(val) => toggleDraftFilter('servingStack', val)}
                                            counts={facetCounts.servingStack || {}}
                                        />
                                        <MultiSelectDropdown 
                                            label="Model Server"
                                            options={filterOptions.modelServer}
                                            selected={draftFilters ? draftFilters.modelServer : (activeFilters.modelServer || new Set())}
                                            onChange={(val) => toggleDraftFilter('modelServer', val)}
                                            counts={facetCounts.modelServer}
                                        />
                                        <MultiSelectDropdown 
                                            label="Optimizations"
                                            options={[
                                                "Atomic / Gang Scheduling",
                                                "Topology Aware Scheduling",
                                                "P/D Disaggregation",
                                                "Horizontal Pod Autoscaling",
                                                "Body based routing",
                                                "Approximate prefix aware routing",
                                                "Precise prefix aware routing"
                                            ]}
                                            selected={draftFilters ? draftFilters.optimizations : (activeFilters.optimizations || new Set())}
                                            onChange={(val) => toggleDraftFilter('optimizations', val)}
                                            counts={facetCounts.optimizations}
                                        />
                                        <MultiSelectDropdown 
                                            label="Precisions"
                                            options={filterOptions.precisions}
                                            selected={draftFilters ? draftFilters.precisions : (activeFilters.precisions || new Set())}
                                            onChange={(val) => toggleDraftFilter('precisions', val)}
                                            counts={facetCounts.precisions}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Section 2: Infrastructure Spec */}
                            <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-800/40 space-y-3">
                                <button 
                                    onClick={() => toggleSection('infra')}
                                    className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800/30 pb-1.5 cursor-pointer select-none"
                                >
                                    <span className="flex items-center gap-1.5"><Database className="w-3 h-3 text-cyan-500" /> Infrastructure Specs</span>
                                    {openSections.infra ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                                {openSections.infra && (
                                    <div className="flex flex-col gap-2 pt-1 animate-in fade-in duration-150">
                                        <MultiSelectDropdown 
                                            label="Machine Type"
                                            options={filterOptions.machines}
                                            selected={draftFilters ? draftFilters.machines : (activeFilters.machines || new Set())}
                                            onChange={(val) => toggleDraftFilter('machines', val)}
                                            counts={facetCounts.machines}
                                        />
                                        <MultiSelectDropdown 
                                            label="Accelerator Count"
                                            options={filterOptions.acc_count}
                                            selected={draftFilters ? draftFilters.acc_count : (activeFilters.acc_count || new Set())}
                                            onChange={(val) => toggleDraftFilter('acc_count', val)}
                                            counts={facetCounts.acc_count}
                                        />
                                        <MultiSelectDropdown 
                                            label="Tensor Parallelism (TP)"
                                            options={filterOptions.tp || []}
                                            selected={draftFilters ? draftFilters.tp : (activeFilters.tp || new Set())}
                                            onChange={(val) => toggleDraftFilter('tp', val)}
                                            counts={facetCounts.tp}
                                        />
                                        <MultiSelectDropdown 
                                            label="P/D Node Ratio"
                                            options={filterOptions.pdRatio}
                                            selected={draftFilters ? draftFilters.pdRatio : (activeFilters.pdRatio || new Set())}
                                            onChange={(val) => toggleDraftFilter('pdRatio', val)}
                                            counts={facetCounts.pdRatio}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Section 3: Benchmark Load */}
                            <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-800/40 space-y-3">
                                <button 
                                    onClick={() => toggleSection('load')}
                                    className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800/30 pb-1.5 cursor-pointer select-none"
                                >
                                    <span className="flex items-center gap-1.5"><TrendingUp className="w-3 h-3 text-cyan-500" /> Benchmark Load</span>
                                    {openSections.load ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                                {openSections.load && (
                                    <div className="flex flex-col gap-2 pt-1 animate-in fade-in duration-150">
                                        <MultiSelectDropdown 
                                            label="Input (ISL)"
                                            options={filterOptions.isl}
                                            selected={draftFilters ? draftFilters.isl : (activeFilters.isl || new Set())}
                                            onChange={(val) => toggleDraftFilter('isl', val)}
                                            counts={facetCounts.isl}
                                        />
                                        <MultiSelectDropdown 
                                            label="Output (OSL)"
                                            options={filterOptions.osl}
                                            selected={draftFilters ? draftFilters.osl : (activeFilters.osl || new Set())}
                                            onChange={(val) => toggleDraftFilter('osl', val)}
                                            counts={facetCounts.osl}
                                        />
                                        <MultiSelectDropdown 
                                            label="Workload Type"
                                            options={filterOptions.ratio}
                                            selected={draftFilters ? draftFilters.ratio : (activeFilters.ratio || new Set())}
                                            onChange={(val) => toggleDraftFilter('ratio', val)}
                                            counts={facetCounts.ratio}
                                        />
                                        <MultiSelectDropdown 
                                            label="Use Case"
                                            options={filterOptions.useCase}
                                            selected={draftFilters ? draftFilters.useCase : (activeFilters.useCase || new Set())}
                                            onChange={(val) => toggleDraftFilter('useCase', val)}
                                            counts={facetCounts.useCase}
                                            formatLabel={(opt) => {
                                                const meta = USE_CASE_META[opt];
                                                return meta ? `${opt} ${meta}` : opt;
                                            }}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Section 4: Connections */}
                            <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-800/40 space-y-3">
                                <button 
                                    onClick={() => toggleSection('conn')}
                                    className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800/30 pb-1.5 cursor-pointer select-none"
                                >
                                    <span className="flex items-center gap-1.5"><Sliders className="w-3 h-3 text-cyan-500" /> Connections</span>
                                    {openSections.conn ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                                {openSections.conn && (
                                    <div className="flex flex-col gap-2 pt-1 animate-in fade-in duration-150">
                                        <div className="space-y-1.5 pt-1">
                                            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider pl-1">
                                                Connection / Source
                                            </div>
                                            <div className="bg-[#0b0f17]/40 border border-slate-800/40 rounded-xl p-2.5 max-h-60 overflow-y-auto space-y-1">
                                                {(() => {
                                                    const selectedConnectionNames = draftFilters ? draftFilters.connectionNames : (activeFilters.connectionNames || new Set());
                                                    const selectedCount = selectedConnectionNames.size;
                                                    const options = filterOptions.connectionNames || [];
                                                    return (
                                                        <>
                                                            <div
                                                                className={cn('flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-slate-800/80 transition-all', selectedCount === 0 ? 'bg-cyan-500/10 text-cyan-400 font-semibold' : 'text-slate-300 hover:text-slate-200')}
                                                                onClick={() => toggleDraftFilter('connectionNames', '')}
                                                            >
                                                                 <div className={cn('w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors', selectedCount === 0 ? 'bg-cyan-500 border-cyan-500 text-white' : 'border-slate-800/40 bg-slate-950')}>
                                                                    {selectedCount === 0 && <Check size={10} className="text-white" strokeWidth={3} />}
                                                                 </div>
                                                                 <span className="text-xs">All Connections</span>
                                                                 <span className="text-[10px] text-slate-500 ml-auto font-mono">{options.length}</span>
                                                            </div>

                                                            <div className="h-px bg-slate-800/30 my-1 mx-1" />

                                                            {options.map(opt => {
                                                                const count = (facetCounts.connectionNames && facetCounts.connectionNames[opt]) || 0;
                                                                const isSelected = selectedConnectionNames.has(opt);
                                                                return (
                                                                    <div
                                                                        key={opt}
                                                                        className={cn(
                                                                            'flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all',
                                                                            count === 0 ? 'opacity-45 hover:bg-slate-800/30' : 'hover:bg-slate-800/80',
                                                                            isSelected ? 'bg-cyan-500/10 text-cyan-400 font-semibold' : 'text-slate-300 hover:text-slate-200'
                                                                        )}
                                                                        onClick={() => toggleDraftFilter('connectionNames', opt)}
                                                                    >
                                                                         <div className={cn('w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors', isSelected ? 'bg-cyan-500 border-cyan-500 text-white' : 'border-slate-800/40 bg-slate-950')}>
                                                                            {isSelected && <Check size={10} className="text-white" strokeWidth={3} />}
                                                                         </div>
                                                                         <span className="text-xs truncate flex-1">
                                                                             {opt}
                                                                         </span>
                                                                         <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono ml-auto">{count}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                        <MultiSelectDropdown 
                                            label="Origin / Folder"
                                            options={filterOptions.origins || []}
                                            selected={draftFilters ? draftFilters.origins : (activeFilters.origins || new Set())}
                                            onChange={(val) => toggleDraftFilter('origins', val)}
                                            counts={facetCounts.origins || {}}
                                            formatLabel={formatOriginLabel}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Drawer Footer Actions */}
                    <div className="p-4 bg-slate-950/80 border-t border-slate-800/80 flex items-center justify-between gap-3 select-none">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="flex-1"
                            onClick={() => setIsAdvancedExpanded(false)}
                        >
                            Cancel
                        </Button>
                        <button
                            type="button"
                            onClick={() => {
                                if (draftFilters) {
                                    setActiveFilters(draftFilters);
                                }
                                setIsAdvancedExpanded(false);
                            }}
                            className="px-4 py-2 text-xs font-bold uppercase text-white bg-cyan-600 hover:bg-cyan-500 rounded-xl transition-all shadow-md cursor-pointer flex-1 text-center"
                        >
                            Apply Filters
                        </button>
                    </div>
                </div>,
                document.body
            )}
            


            <div id="manage-tour-table" className="relative flex flex-col gap-4">
                <UnifiedDataTable
                    groupBy={groupBy}
                    sortByField={sortByField}
                    sortDirection={sortDirection}
                    visibleSpecs={visibleSpecs}
                    modelStats={modelStats} selectedModels={selectedModels} filteredBySource={filteredBySource}
                    showSelectedOnly={showSelectedOnly} setShowSelectedOnly={setShowSelectedOnly}
                    selectedBenchmarks={selectedBenchmarks} setSelectedBenchmarks={setSelectedBenchmarks}
                    setActiveFilters={setActiveFilters} expandedModels={expandedModels}
                    toggleBenchmark={toggleBenchmark} toggleModelExpansion={toggleModelExpansion}
                    baselineBenchmarkKey={baselineBenchmarkKey}
                    setBaselineBenchmarkKey={setBaselineBenchmarkKey}
                    hideShowSelectedOnly={hideShowSelectedOnly}
                    renameClearToUnselectAll={renameClearToUnselectAll}
                    brv02Runs={brv02Runs}
                    brv02CustomLabels={brv02CustomLabels}
                    setBrv02CustomLabels={setBrv02CustomLabels}
                    removeBrv02Run={removeBrv02Run}
                    setShowDataPanel={setShowDataPanel}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    kpiFilter={kpiFilter}
                    setKpiFilter={setKpiFilter}
                    paretoKeys={paretoKeys}
                    submissionsMap={submissionsMap}
                    isLoadingSubmissions={isLoadingSubmissions}
                    updateSubmissionStatus={updateSubmissionStatus}
                    bulkUpdateSubmissionStatus={bulkUpdateSubmissionStatus}
                    onOpenSubmitDialog={onOpenSubmitDialog}
                    isFiltered={hasFiltersToSave}
                    loadAllData={loadAllData}
                    loadingConnections={loadingConnections}
                    dashboardState={dashboardState}
                />
            </div>
        </div>
    </div>
);
};
