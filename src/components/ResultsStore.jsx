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

import React, { useMemo, useCallback } from 'react';
import { Database, Eye, ArrowLeft, ArrowRight, MessageCircle, X, Loader, HelpCircle, Upload, UploadCloud, CheckCircle, Send, AlertCircle, Github, Shield, LogOut, ChevronDown } from 'lucide-react';
import { FilterPanel } from './ManageBenchmarks/FilterPanel';
import { UnifiedDataTable } from './ManageBenchmarks/UnifiedDataTable';
import { INTEGRATIONS, getSourceTag, getBenchmarkKey, getBucket, getRatioType, getAcceleratorCount, getEffectiveTp, sortBuckets } from '../utils/dashboardHelpers';
import { useGitHubAuth } from '../hooks/useGitHubAuth.js';



const getCleanModelName = (name) => {
    if (!name) return '';
    return name.replace(/\s*\[.*?\]/g, '').replace(/\s*\(.*?\)/g, '').trim();
};



export default function ResultsStore({ onNavigate, onNavigateBack, dashboardState, dashboardData }) {
    const {
        showFilterPanel,
        showSelectedOnly,
        setShowSelectedOnly,
        selectedBenchmarks,
        setSelectedBenchmarks,
        activeFilters,
        setActiveFilters,
        showDataPanel,
        setShowDataPanel,
        baselineBenchmarkKey,
        setBaselineBenchmarkKey
    } = dashboardState;

    const { isAuthenticated, user, login, logout, isConfigured, isLoading: authLoading } = useGitHubAuth();
    const [showUserDropdown, setShowUserDropdown] = React.useState(false);
    const userDropdownRef = React.useRef(null);

    React.useEffect(() => {
        const handleClickOutside = (event) => {
            if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
                setShowUserDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const {
        data,
        selectedSources,
        toasts,
        removeToast,
        addToast,
        brv02Runs,
        brv02CustomLabels,
        setBrv02CustomLabels,
        removeBrv02Run,
        promoteStagedRunId,
        expandedModels,
        setExpandedModels,
        handleValidatedUpload,
        qualityMetrics,
        submissions,
        isLoadingSubmissions,
        loadSubmissions,
        updateSubmissionStatus,
        bulkUpdateSubmissionStatus,
        submissionsMap,
        loadAllData
    } = dashboardData;


    const [postUploadType, setPostUploadType] = React.useState(() => {
        try {
            return localStorage.getItem('prism_show_post_upload_dialog') || null;
        } catch { return null; }
    });

    React.useEffect(() => {
        if (postUploadType) {
            try {
                localStorage.removeItem('prism_show_post_upload_dialog');
            } catch {}
        }
    }, [postUploadType]);

    const [dontShowAgain, setDontShowAgain] = React.useState(false);

    const handleCloseDialog = () => {
        if (dontShowAgain && postUploadType === 'staged') {
            try {
                localStorage.setItem('prism_hide_post_staged_dialog', 'true');
            } catch {}
        }
        setPostUploadType(null);
    };

    const [stagedBundles, setStagedBundles] = React.useState(() => {
        try {
            const saved = localStorage.getItem('prism_active_staged_bundles');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const [activeTab, setActiveTab] = React.useState('all'); // 'all' or 'submissions'
    const [searchTerm, setSearchTerm] = React.useState('');

    const [kpiFilter, setKpiFilter] = React.useState(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            const urlKpi = params.get('kpiFilter');
            if (urlKpi) return urlKpi;

            if (params.get('own') === 'true') {
                return 'my-submissions';
            }

            const triggerStaged = localStorage.getItem('prism_activate_staged_filter');
            if (triggerStaged === 'true') {
                return 'staged';
            }

            const triggerMySubs = localStorage.getItem('prism_activate_my_submissions_filter');
            if (triggerMySubs === 'true') {
                return 'my-submissions';
            }
        } catch {}
        return null;
    });

    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (kpiFilter) {
            params.set('kpiFilter', kpiFilter);
            if (['my-submissions', 'staged', 'processing', 'in_review', 'approved', 'action'].includes(kpiFilter)) {
                params.set('own', 'true');
            } else {
                params.delete('own');
            }
        } else {
            params.delete('kpiFilter');
            params.delete('own');
        }
        
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        if (window.location.search !== `?${params.toString()}`) {
            window.history.replaceState(null, '', newUrl);
        }
    }, [kpiFilter]);

    React.useEffect(() => {
        const showSubmitFlow = sessionStorage.getItem('prism_show_submit_dialog_after_login');
        if (showSubmitFlow === 'true' && isAuthenticated) {
            sessionStorage.removeItem('prism_show_submit_dialog_after_login');
            onNavigate('submit-benchmarks', { intent: 'submit-review' });
        }
    }, [isAuthenticated, onNavigate]);

    React.useEffect(() => {
        if (setSelectedBenchmarks) {
            setSelectedBenchmarks(new Set());
        }
    }, [setSelectedBenchmarks]);

    React.useEffect(() => {
        const triggerStaged = localStorage.getItem('prism_activate_staged_filter');
        const triggerMySubs = localStorage.getItem('prism_activate_my_submissions_filter');
        
        if (triggerStaged === 'true' || triggerMySubs === 'true') {
            localStorage.removeItem('prism_activate_staged_filter');
            localStorage.removeItem('prism_activate_my_submissions_filter');
            if (setShowSelectedOnly) {
                setShowSelectedOnly(false);
            }
            if (setActiveFilters) {
                setActiveFilters({
                    models: new Set(),
                    hardware: new Set(),
                    machines: new Set(),
                    tp: new Set(),
                    precisions: new Set(),
                    isl: new Set(),
                    osl: new Set(),
                    ratio: new Set(),
                    modelServer: new Set(),
                    servingStack: new Set(),
                    components: new Set(),
                    origins: new Set(),
                    pdRatio: new Set(),
                    acc_count: new Set(),
                    useCase: new Set(),
                    optimizations: new Set(),
                    connectionNames: new Set()
                });
            }
        }
    }, [setActiveFilters, setShowSelectedOnly]);





// Filtered by source
    const filteredBySource = useMemo(() => {
        const res = data.filter(d => {

            // Apply Connection/Source filter
            if (activeFilters.connectionNames && activeFilters.connectionNames.size > 0) {
                const connName = getSourceTag(d);
                if (!activeFilters.connectionNames.has(connName)) return false;
            }

            // Apply Origin/Folder filter
            if (activeFilters.origins && activeFilters.origins.size > 0) {
                const origin = d.source_info?.origin || d.source;
                if (!activeFilters.origins.has(origin)) return false;
            }

            // Apply Model filter
            if (activeFilters.models && activeFilters.models.size > 0) {
                const modelNameLower = getCleanModelName(d.model_name || d.model).toLowerCase();
                const hasMatch = [...activeFilters.models].some(m => m.toLowerCase() === modelNameLower);
                if (!hasMatch) return false;
            }

            // Apply Hardware filter
            if (activeFilters.hardware && activeFilters.hardware.size > 0) {
                if (!activeFilters.hardware.has(d.hardware)) return false;
            }

            // Apply Machine Type filter
            if (activeFilters.machines && activeFilters.machines.size > 0) {
                if (!activeFilters.machines.has(d.machine_type)) return false;
            }

            // Apply Precisions filter
            if (activeFilters.precisions && activeFilters.precisions.size > 0) {
                if (!activeFilters.precisions.has(d.precision)) return false;
            }
            
            // Apply TP filter
            if (activeFilters.tp && activeFilters.tp.size > 0) {
                const tpVal = getEffectiveTp(d);
                if (!tpVal || !activeFilters.tp.has(tpVal)) return false;
            }

            // Apply ISL filter
            if (activeFilters.isl && activeFilters.isl.size > 0) {
                if (!activeFilters.isl.has(getBucket(d.isl))) return false;
            }

            // Apply OSL filter
            if (activeFilters.osl && activeFilters.osl.size > 0) {
                if (!activeFilters.osl.has(getBucket(d.osl))) return false;
            }

            // Apply Ratio filter
            if (activeFilters.ratio && activeFilters.ratio.size > 0) {
                const r = getRatioType(d.isl, d.osl);
                if (!activeFilters.ratio.has(r)) return false;
            }

            // Apply Accelerator Count filter
            if (activeFilters.acc_count && activeFilters.acc_count.size > 0) {
                const count = getAcceleratorCount(d);
                if (!activeFilters.acc_count.has(count) && !activeFilters.acc_count.has(String(count)) && !activeFilters.acc_count.has(Number(count))) {
                    return false;
                }
            }

            // Apply Model Server filter
            if (activeFilters.modelServer && activeFilters.modelServer.size > 0) {
                const ms = d.model_server || d.backend || d.metadata?.model_server || d.metadata?.backend;
                if (!ms || !activeFilters.modelServer.has(ms)) return false;
            }

            // Apply Use Case filter
            if (activeFilters.useCase && activeFilters.useCase.size > 0) {
                if (!activeFilters.useCase.has(d.use_case)) return false;
            }

            // Apply Serving Stack filter
            if (activeFilters.servingStack && activeFilters.servingStack.size > 0) {
                const ss = d.serving_stack || d.metadata?.serving_stack;
                if (!ss || !activeFilters.servingStack.has(ss)) return false;
            }

            // Apply Optimizations filter
            if (activeFilters.optimizations && activeFilters.optimizations.size > 0) {
                let hasMet = false;
                const isPD = d.architecture === 'disaggregated' || (d.pd_ratio && d.pd_ratio !== 'Aggregated' && d.pd_ratio !== 'N/A' && d.pd_ratio !== 'N/A:N/A');
                if (activeFilters.optimizations.has("P/D Disaggregation") && isPD) hasMet = true;
                if (activeFilters.optimizations.has("Approximate prefix aware routing")) {
                    const ss = d.serving_stack || d.metadata?.serving_stack || '';
                    if (ss.includes('llm-d') && d.source?.startsWith('giq:')) hasMet = true;
                }
                if (!hasMet) return false;
            }

            // Apply PD Ratio filter
            if (activeFilters.pdRatio && activeFilters.pdRatio.size > 0) {
                const ratio = d.pd_ratio || d.metadata?.pd_ratio || 'Aggregated';
                if (!activeFilters.pdRatio.has(ratio)) return false;
            }

            // Apply Components filter
            if (activeFilters.components && activeFilters.components.size > 0) {
                const comps = d.components || d.metadata?.components;
                if (!comps || !Array.isArray(comps) || comps.length === 0) return false;
                const hasMatchingComp = comps.some(c => activeFilters.components.has(c));
                if (!hasMatchingComp) return false;
            }

            return true;
        });
        return res;
    }, [data, activeFilters]);

    // Local copy of modelStats computation
    const modelStats = useMemo(() => {
        const stats = [];
        const groups = new Map();

        // Group filtered data by key
        const baseData = filteredBySource;

        baseData.forEach(d => {
            const key = d.benchmarkKey || getBenchmarkKey(d);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(d);
        });

        groups.forEach((groupingData, benchmarkKey) => {
            const model = groupingData[0].model_name || groupingData[0].model;
            const maxTput = Math.max(0, ...groupingData.map(x => Number(x.throughput || 0)).filter(t => !isNaN(t)));
            const minLatEntries = groupingData.map(x => Number(x.latency?.mean || 0)).filter(l => !isNaN(l) && l > 0);
            const minLat = minLatEntries.length > 0 ? Math.min(...minLatEntries) : 0;
            const errCount = groupingData.reduce((acc, curr) => acc + Number(curr.error_count || 0), 0);
            const hardware = groupingData.find(x => x.hardware && x.hardware !== 'Unknown' && x.hardware !== 'Unknown Hardware')?.hardware || 'Unknown Hardware';
            const accelerator_count = groupingData.find(x => x.accelerator_count > 0)?.accelerator_count || 1;
            const tensor_parallelism = groupingData.find(x => x.tensor_parallelism > 0)?.tensor_parallelism || 1;
            const node_count = accelerator_count > 1 && tensor_parallelism > 1 ? Math.max(1, Math.round(accelerator_count / tensor_parallelism)) : accelerator_count;
            const configuration = groupingData[0].metadata?.configuration || groupingData[0].configuration || 'Unknown';
            const timestamps = groupingData.map(x => x.timestamp ? new Date(x.timestamp).getTime() : 0).filter(t => t > 0);
            const latestTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : 0;

            stats.push({
                benchmarkKey,
                model,
                configuration,
                maxTput,
                minLat,
                errCount,
                hardware,
                accelerator_count,
                tensor_parallelism,
                node_count,
                tp: tensor_parallelism,
                timestamp: latestTimestamp,
                data: groupingData
            });
        });

        return stats;
    }, [filteredBySource]);

    // Compute facet options and counts for filtering
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
            pdRatio: new Set(),
            origins: new Set(),
            connectionNames: new Set()
        };

        const baseData = data;

        const seenModelsLower = new Set();
        baseData.forEach(d => {
            const modelVal = d.model_name || d.model;
            if (modelVal) {
                const clean = getCleanModelName(modelVal);
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
            const ms = d.model_server || d.backend || d.metadata?.model_server || d.metadata?.backend;
            if (ms && ms !== 'Unknown') options.modelServer.add(ms);

            const ss = d.serving_stack || d.metadata?.serving_stack;
            if (ss && ss !== 'Unknown') options.servingStack.add(ss);

            if (d.machine_type && d.machine_type !== 'Unknown') options.machines.add(d.machine_type);
            if (d.precision && d.precision !== 'Unknown') options.precisions.add(d.precision);

            const tpVal = getEffectiveTp(d);
            if (tpVal) options.tp.add(tpVal);

            if (d.isl > 0) options.isl.add(getBucket(d.isl));
            if (d.osl > 0) options.osl.add(getBucket(d.osl));

            if (d.use_case && d.use_case !== 'Unknown') options.useCase.add(d.use_case);

            if (d.isl > 0 && d.osl > 0) {
                options.ratio.add(getRatioType(d.isl, d.osl));
            }

            const pd = d.pd_ratio || d.metadata?.pd_ratio || 'Aggregated';
            options.pdRatio.add(pd);

            const origin = d.source_info?.origin || d.source;
            if (origin && origin !== 'Unknown') options.origins.add(origin);

            const connName = getSourceTag(d);
            if (connName && connName !== 'UNK') options.connectionNames.add(connName);
        });

        return {
            models: [...options.models].sort(),
            hardware: [...options.hardware].sort(),
            machines: [...options.machines].sort(),
            precisions: [...options.precisions].sort(),
            tp: [...options.tp].sort((a, b) => {
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
            pdRatio: [...options.pdRatio].sort((a, b) => {
                if (a === 'Aggregated') return -1;
                if (b === 'Aggregated') return 1;
                const parse = s => String(s).split(':').map(Number);
                const [pa, da] = parse(a);
                const [pb, db] = parse(b);
                if (isNaN(pa) || isNaN(pb)) return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
                if (pa !== pb) return pa - pb;
                return da - db;
            }),
            origins: [...options.origins].sort(),
            connectionNames: [...options.connectionNames].sort()
        };
    }, [data]);

    const facetCounts = useMemo(() => {
        // We use Sets of unique row benchmarkKeys so that the numbers shown in the
        // dropdowns represent unique configurations (visible rows) rather than raw entries.
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
            connectionNames: {},
            components: {},
            pdRatio: {}
        };

        const baseData = data;

        const canonicalModelMap = {};
        if (filterOptions && filterOptions.models) {
            filterOptions.models.forEach(m => {
                canonicalModelMap[m.toLowerCase()] = m;
            });
        }

        // Helper to check if item satisfies all active filters EXCEPT the ignored category
        const check = (d, ignoreKey) => {
            if (ignoreKey !== 'connectionNames' && activeFilters.connectionNames && activeFilters.connectionNames.size > 0) {
                const connName = getSourceTag(d);
                if (!activeFilters.connectionNames.has(connName)) return false;
            }

            if (ignoreKey !== 'origins' && activeFilters.origins && activeFilters.origins.size > 0) {
                const origin = d.source_info?.origin || d.source;
                if (!activeFilters.origins.has(origin)) return false;
            }

            if (ignoreKey !== 'models' && activeFilters.models && activeFilters.models.size > 0) {
                const modelNameLower = getCleanModelName(d.model_name || d.model).toLowerCase();
                const hasMatch = [...activeFilters.models].some(m => m.toLowerCase() === modelNameLower);
                if (!hasMatch) return false;
            }

            if (ignoreKey !== 'hardware' && activeFilters.hardware && activeFilters.hardware.size > 0) {
                if (!activeFilters.hardware.has(d.hardware)) return false;
            }

            if (ignoreKey !== 'machines' && activeFilters.machines && activeFilters.machines.size > 0) {
                if (!activeFilters.machines.has(d.machine_type)) return false;
            }

            if (ignoreKey !== 'precisions' && activeFilters.precisions && activeFilters.precisions.size > 0) {
                if (!activeFilters.precisions.has(d.precision)) return false;
            }
            
            if (ignoreKey !== 'tp' && activeFilters.tp && activeFilters.tp.size > 0) {
                const tpVal = getEffectiveTp(d);
                if (!tpVal || !activeFilters.tp.has(tpVal)) return false;
            }

            if (ignoreKey !== 'isl' && activeFilters.isl && activeFilters.isl.size > 0) {
                if (!activeFilters.isl.has(getBucket(d.isl))) return false;
            }

            if (ignoreKey !== 'osl' && activeFilters.osl && activeFilters.osl.size > 0) {
                if (!activeFilters.osl.has(getBucket(d.osl))) return false;
            }

            if (ignoreKey !== 'ratio' && activeFilters.ratio && activeFilters.ratio.size > 0) {
                const r = getRatioType(d.isl, d.osl);
                if (!activeFilters.ratio.has(r)) return false;
            }

            if (ignoreKey !== 'acc_count' && activeFilters.acc_count && activeFilters.acc_count.size > 0) {
                const count = getAcceleratorCount(d);
                if (!activeFilters.acc_count.has(count) && !activeFilters.acc_count.has(String(count)) && !activeFilters.acc_count.has(Number(count))) {
                    return false;
                }
            }

            if (ignoreKey !== 'modelServer' && activeFilters.modelServer && activeFilters.modelServer.size > 0) {
                const ms = d.model_server || d.backend || d.metadata?.model_server || d.metadata?.backend;
                if (!ms || !activeFilters.modelServer.has(ms)) return false;
            }

            if (ignoreKey !== 'useCase' && activeFilters.useCase && activeFilters.useCase.size > 0) {
                if (!activeFilters.useCase.has(d.use_case)) return false;
            }

            if (ignoreKey !== 'servingStack' && activeFilters.servingStack && activeFilters.servingStack.size > 0) {
                const ss = d.serving_stack || d.metadata?.serving_stack;
                if (!ss || !activeFilters.servingStack.has(ss)) return false;
            }

            if (ignoreKey !== 'optimizations' && activeFilters.optimizations && activeFilters.optimizations.size > 0) {
                let hasMet = false;
                const isPD = d.architecture === 'disaggregated' || (d.pd_ratio && d.pd_ratio !== 'Aggregated' && d.pd_ratio !== 'N/A' && d.pd_ratio !== 'N/A:N/A');
                if (activeFilters.optimizations.has("P/D Disaggregation") && isPD) hasMet = true;
                if (activeFilters.optimizations.has("Approximate prefix aware routing")) {
                    const ss = d.serving_stack || d.metadata?.serving_stack || '';
                    if (ss.includes('llm-d') && d.source?.startsWith('giq:')) hasMet = true;
                }
                if (!hasMet) return false;
            }

            if (ignoreKey !== 'pdRatio' && activeFilters.pdRatio && activeFilters.pdRatio.size > 0) {
                const ratio = d.pd_ratio || d.metadata?.pd_ratio || 'Aggregated';
                if (!activeFilters.pdRatio.has(ratio)) return false;
            }

            if (ignoreKey !== 'components' && activeFilters.components && activeFilters.components.size > 0) {
                const comps = d.components || d.metadata?.components;
                if (!comps || !Array.isArray(comps) || comps.length === 0) return false;
                const hasMatchingComp = comps.some(c => activeFilters.components.has(c));
                if (!hasMatchingComp) return false;
            }

            return true;
        };

        const add = (category, key, modelId) => {
            if (!tempCounts[category][key]) {
                tempCounts[category][key] = new Set();
            }
            tempCounts[category][key].add(modelId);
        };

        baseData.forEach(d => {
            const modelId = getBenchmarkKey(d);

            const mVal = d.model_name || d.model;
            if (mVal && check(d, 'models')) {
                const cleanLower = getCleanModelName(mVal).toLowerCase();
                const canonicalName = canonicalModelMap[cleanLower] || getCleanModelName(mVal);
                add('models', canonicalName, modelId);
            }
            if (d.hardware && check(d, 'hardware')) add('hardware', d.hardware, modelId);
            if (d.machine_type && check(d, 'machines')) add('machines', d.machine_type, modelId);
            if (d.precision && check(d, 'precisions')) add('precisions', d.precision, modelId);

            const tp = getEffectiveTp(d);
            if (tp && check(d, 'tp')) add('tp', tp, modelId);

            const connName = getSourceTag(d);
            if (connName && connName !== 'UNK' && check(d, 'connectionNames')) add('connectionNames', connName, modelId);

            const origin = d.source_info?.origin || d.source;
            if (origin && origin !== 'Unknown' && check(d, 'origins')) add('origins', origin, modelId);

            const ms = d.model_server || d.backend || d.metadata?.model_server || d.metadata?.backend;
            if (ms && ms !== 'Unknown' && check(d, 'modelServer')) add('modelServer', ms, modelId);

            const ss = d.serving_stack || d.metadata?.serving_stack;
            if (ss && ss !== 'Unknown' && check(d, 'servingStack')) add('servingStack', ss, modelId);

            if (d.use_case && d.use_case !== 'Unknown' && check(d, 'useCase')) add('useCase', d.use_case, modelId);

            if (d.isl > 0 && check(d, 'isl')) add('isl', getBucket(d.isl), modelId);
            if (d.osl > 0 && check(d, 'osl')) add('osl', getBucket(d.osl), modelId);
            if (d.isl > 0 && d.osl > 0 && check(d, 'ratio')) add('ratio', getRatioType(d.isl, d.osl), modelId);

            const pd = d.pd_ratio || d.metadata?.pd_ratio || 'Aggregated';
            if (check(d, 'pdRatio')) add('pdRatio', pd, modelId);

            const comps = d.components || d.metadata?.components || [];
            if (comps.length > 0 && check(d, 'components')) {
                comps.forEach(c => add('components', c, modelId));
            }

            const accCount = getAcceleratorCount(d);
            if (accCount && check(d, 'acc_count')) add('acc_count', accCount, modelId);
        });

        // Convert Sets of unique modelIds to numeric counts
        const finalCounts = {
            models: {}, hardware: {}, machines: {}, precisions: {}, tp: {}, isl: {}, osl: {}, ratio: {}, acc_count: {}, modelServer: {}, useCase: {}, servingStack: {}, optimizations: {}, origins: {}, connectionNames: {},
            components: {}, pdRatio: {}
        };

        const categories = ['models', 'hardware', 'machines', 'precisions', 'tp', 'isl', 'osl', 'ratio', 'acc_count', 'modelServer', 'useCase', 'servingStack', 'optimizations', 'pdRatio', 'origins', 'connectionNames', 'components'];
        categories.forEach(cat => {
            Object.keys(tempCounts[cat]).forEach(key => {
                finalCounts[cat][key] = tempCounts[cat][key].size;
            });
        });

        return finalCounts;
    }, [data, activeFilters, filterOptions]);

    const toggleFilter = (category, value) => {
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

    const toggleBenchmark = (key) => {
        const newSelected = new Set(selectedBenchmarks);
        if (newSelected.has(key)) {
            newSelected.delete(key);
        } else {
            newSelected.add(key);
        }
        setSelectedBenchmarks(newSelected);
    };

    const selectedModels = useMemo(() => {
        const models = new Set();
        selectedBenchmarks.forEach(k => {
            if (k.includes('::')) {
                models.add(k.split('::')[2]);
            } else if (k.startsWith('inference-perf:') || k.startsWith('file:')) {
                const d = filteredBySource.find(x => getBenchmarkKey(x) === k);
                if (d) models.add(d.model);
            } else {
                models.add(k);
            }
        });
        return models;
    }, [selectedBenchmarks, filteredBySource]);

    const toggleModelExpansion = (key) => {
        setExpandedModels(prev => {
            const newExpanded = new Set(prev);
            if (newExpanded.has(key)) {
                newExpanded.delete(key);
            } else {
                newExpanded.add(key);
            }
            return newExpanded;
        });
    };


    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased relative overflow-x-hidden pt-0 bg-[radial-gradient(#334155_1.2px,transparent_1.2px)] bg-[size:24px_24px] bg-repeat tabular-nums">
            {/* Pulsing Vibrant Neon Glow Background Shapes */}
            <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-blue-600/20 rounded-full blur-3xl pointer-events-none animate-pulse" />
            <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-emerald-600/20 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />
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

            <header className="w-full h-16 border-b border-slate-900/65 flex justify-between items-center px-6 bg-slate-950/20 backdrop-blur-md sticky top-0 z-[49]">
                <div className="flex items-center gap-4">
                    {onNavigateBack && (
                        <button onClick={onNavigateBack} className="p-1.5 rounded-xl hover:bg-slate-900/60 text-slate-400 hover:text-white transition-colors cursor-pointer border border-transparent hover:border-slate-800/60">
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                    )}
                    
                    <div className="flex items-center gap-2.5 border-r border-slate-800 pr-4">
                        <img src="https://llm-d.ai/img/llm-d-logotype-and-icon.png" alt="llm-d Logo" className="h-6 object-contain" />
                        <span className="text-lg font-bold tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 select-none inline-block pl-0.5 py-0.5">
                            Prism
                        </span>
                    </div>

                    <div className="flex items-center">
                        <h1 className="text-sm font-semibold text-slate-200 tracking-wide select-none">Results Store</h1>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    {/* User Auth Section */}
                    {authLoading ? (
                        <div className="flex items-center justify-center w-8 h-8 rounded-full border border-slate-850 bg-slate-900/40">
                            <Loader className="w-4 h-4 animate-spin text-slate-400" />
                        </div>
                    ) : !isConfigured ? (
                        <div className="relative group/tooltip inline-block">
                            <button
                                disabled
                                className="px-3.5 py-2 text-xs font-semibold rounded-xl text-slate-500 bg-slate-900/20 flex items-center gap-2 border border-slate-900 cursor-not-allowed opacity-50 select-none"
                            >
                                <Github size={14} />
                                Sign in with GitHub
                            </button>
                            <div className="absolute right-0 top-full mt-2 px-3 py-2 bg-slate-900 border border-slate-800 text-slate-200 text-xs font-medium rounded-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 shadow-2xl z-[9999] w-64 pointer-events-none leading-relaxed text-center">
                                GitHub Login is not configured yet.
                            </div>
                        </div>
                    ) : !isAuthenticated ? (
                        <button
                            onClick={login}
                            className="px-3.5 py-2 text-xs font-semibold rounded-xl text-slate-300 bg-slate-900/40 hover:bg-slate-900/80 transition-all flex items-center gap-2 border border-slate-800 hover:border-slate-700 cursor-pointer shadow-sm hover:text-white"
                        >
                            <Github size={14} />
                            Sign in with GitHub
                        </button>
                    ) : (
                        <div className="relative" ref={userDropdownRef}>
                            <button
                                id="user-profile-badge"
                                onClick={() => setShowUserDropdown(!showUserDropdown)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/80 hover:border-slate-700 transition-all cursor-pointer select-none text-slate-300 hover:text-white"
                            >
                                {user?.avatarUrl ? (
                                    <img 
                                        src={user.avatarUrl} 
                                        alt={user.username} 
                                        className="w-5 h-5 rounded-full border border-slate-700 object-cover shrink-0"
                                    />
                                ) : (
                                    <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center font-bold text-white shrink-0 border border-slate-700 text-[9px]">
                                        {user?.username ? user.username.substring(0, 2).toUpperCase() : 'GH'}
                                    </div>
                                )}
                                <span className="text-xs font-semibold truncate max-w-[120px]">{user?.username}</span>
                                <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${showUserDropdown ? 'rotate-180' : ''}`} />
                            </button>

                            {showUserDropdown && (
                                <div className="absolute right-0 mt-2 w-48 bg-slate-950 border border-slate-900 rounded-xl shadow-xl z-[100] py-1 animate-in fade-in slide-in-from-top-2 duration-150">
                                    <div className="px-4 py-2 border-b border-slate-900 text-slate-400 select-none">
                                        <p className="text-xs">Signed in as</p>
                                        <a
                                            href={`https://github.com/${user?.username}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs font-semibold text-slate-200 hover:text-cyan-400 hover:underline truncate mt-0.5 block transition-colors"
                                        >
                                            {user?.username}
                                        </a>
                                        {user?.permission === 'none' ? (
                                            <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] rounded-lg flex items-start gap-1.5 leading-normal font-medium">
                                                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                                                <span>You are not in the Results Store closed-beta. Check back later once the feature is released.</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500">
                                                <Shield size={10} className="text-cyan-400" />
                                                <span>Role: {user?.permission}</span>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        id="sign-out-button"
                                        onClick={() => {
                                            setShowUserDropdown(false);
                                            logout();
                                        }}
                                        className="w-full text-left px-4 py-2 text-xs font-semibold text-red-400 hover:bg-slate-900/60 hover:text-red-300 transition-colors flex items-center gap-2 cursor-pointer"
                                    >
                                        <LogOut size={12} />
                                        Sign out
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <a 
                        href="https://llm-d.ai/community" 
                        target="_blank" 
                        rel="noreferrer"
                        className="px-3.5 py-2 text-xs font-semibold rounded-xl text-slate-300 bg-slate-900/40 hover:bg-slate-900/80 transition-all flex items-center border border-slate-800 hover:border-slate-700 cursor-pointer"
                    >
                        Contact us
                    </a>
                </div>
            </header>

            <main className="w-full px-8 py-6 pl-28 flex flex-col space-y-8 z-10 relative">
                <FilterPanel
                    {...{
                        showFilterPanel, filterOptions, activeFilters, facetCounts, toggleFilter,
                        selectedModels: selectedModels, modelStats, filteredBySource, showSelectedOnly, setShowSelectedOnly,
                        selectedBenchmarks, setSelectedBenchmarks, setActiveFilters, expandedModels,
                        toggleBenchmark, toggleModelExpansion,
                        baselineBenchmarkKey, setBaselineBenchmarkKey,
                        UnifiedDataTable,
                        hideShowSelectedOnly: true,
                        renameClearToUnselectAll: true,
                        brv02Runs, brv02CustomLabels, setBrv02CustomLabels, removeBrv02Run,
                        searchTerm, setSearchTerm, kpiFilter, setKpiFilter,
                        submissionsMap,
                        isLoadingSubmissions,
                        updateSubmissionStatus,
                        bulkUpdateSubmissionStatus,
                        qualityMetrics,
                        gcsProfiles: dashboardData.gcsProfiles,
                        loadingConnections: dashboardData.gcsProfiles?.some(p => p.loading) || dashboardData.loading,
                        onOpenSubmitDialog: (intent) => onNavigate('submit-benchmarks', { intent }),
                        showDataPanel,
                        setShowDataPanel,
                        loadAllData,
                        dashboardState
                    }}
                />
            </main>

            {/* Post-Upload Guided Action Dialog */}
            {postUploadType && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div 
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity" 
                        onClick={handleCloseDialog}
                    />
                    {/* Modal Container */}
                    <div className="relative bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl z-10 flex flex-col space-y-4 text-left overflow-hidden bg-gradient-to-b from-[#0e172a] to-[#090d16] animate-in zoom-in-95 duration-200">
                        {/* Header Glowing Accent */}
                        <div className={`absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r ${
                            postUploadType === 'staged' 
                            ? 'from-amber-500 via-orange-400 to-yellow-500' 
                            : 'from-emerald-500 via-cyan-400 to-blue-500'
                        }`} />

                        {/* Close Button */}
                        <button 
                            onClick={handleCloseDialog}
                            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                            <X size={18} />
                        </button>

                        {/* Icon and Title */}
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg ${
                                postUploadType === 'staged' 
                                ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-amber-500/5' 
                                : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-emerald-500/5'
                            }`}>
                                {postUploadType === 'staged' ? <UploadCloud size={20} /> : <CheckCircle size={20} />}
                            </div>
                            <div>
                                 <h3 className="text-lg font-bold text-white tracking-wide">
                                    {postUploadType === 'staged' ? 'Runs Staged Successfully!' : 'Benchmark Submitted for Review!'}
                                </h3>
                                <span className="text-[10px] text-slate-500">
                                    {postUploadType === 'staged' ? 'LOCAL SESSION STAGING' : 'SUBMISSION QUEUED'}
                                </span>
                            </div>
                        </div>

                        {/* Description */}
                        <p className="text-xs text-slate-300 leading-relaxed pt-1">
                            {postUploadType === 'staged' 
                                ? "Your benchmark files have been validated and staged locally in your browser session. They are currently visible only to you and ready for analysis."
                                : "Your runs have been successfully posted to the validation server and are currently in the maintainer review queue. A public preview is available in your catalog."
                            }
                        </p>

                        {/* Steps / Guide */}
                        <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-4 space-y-3">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-900 pb-1.5">
                                Recommended Next Steps
                            </div>
                            
                            {postUploadType === 'staged' ? (
                                <div className="space-y-3.5">
                                    <div className="flex items-start gap-2.5">
                                        <span className="w-5 h-5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-slate-200">Compare & Inspect</span>
                                            <span className="text-[11px] text-slate-400 mt-0.5 leading-normal">
                                                Select the staged run in the table (marked in <span className="text-amber-400 font-medium">amber</span>) along with public runs, and click <span className="text-cyan-400 font-medium">Compare & Inspect</span> to compare their performance curves.
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2.5">
                                        <span className="w-5 h-5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-slate-200">Add Metadata & Manifests</span>
                                            <span className="text-[11px] text-slate-400 mt-0.5 leading-normal">
                                                Expand the run row in the table, verify details, and upload manifests or evidence files to make your benchmark review-ready.
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2.5">
                                        <span className="w-5 h-5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-slate-200">Publish Globally</span>
                                            <span className="text-[11px] text-slate-400 mt-0.5 leading-normal">
                                                When you're ready to share the benchmarks, select them in the table and click <span className="text-cyan-400 font-medium">Compare & Publish</span> in the action bar or bottom dock to submit them for review.
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3.5">
                                    <div className="flex items-start gap-2.5">
                                        <span className="w-5 h-5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-slate-200">Track Ingestion Status</span>
                                            <span className="text-[11px] text-slate-400 mt-0.5 leading-normal">
                                                Your run is listed as <span className="text-purple-400 font-semibold">Under Review</span>. Click this status step on the tracker timeline above to filter the catalog.
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2.5">
                                        <span className="w-5 h-5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-slate-200">Public Preview Validation</span>
                                            <span className="text-[11px] text-slate-400 mt-0.5 leading-normal">
                                                View how your submitted runs perform compared to existing baseline models right in the registry.
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className={`flex ${postUploadType === 'staged' ? 'justify-between' : 'justify-end'} items-center gap-3 pt-2`}>
                            {postUploadType === 'staged' && (
                                <label className="flex items-center gap-2 text-[11px] text-slate-400 select-none cursor-pointer">
                                    <input 
                                        type="checkbox"
                                        checked={dontShowAgain}
                                        onChange={(e) => setDontShowAgain(e.target.checked)}
                                        className="rounded text-amber-500 focus:ring-amber-500 h-3.5 w-3.5 border-slate-800 bg-slate-950/40"
                                    />
                                    <span>Don't show again</span>
                                </label>
                            )}
                            <button
                                id="post-upload-dialog-dismiss-btn"
                                onClick={handleCloseDialog}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                    postUploadType === 'staged'
                                    ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-500/10'
                                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/10'
                                }`}
                            >
                                {postUploadType === 'staged' ? "Got it, show staged runs" : "Got it"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
