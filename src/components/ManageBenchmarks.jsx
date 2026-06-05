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

import React, { useMemo } from 'react';
import { Database, Eye, ArrowLeft, MessageCircle, X, Loader } from 'lucide-react';
import { FilterPanel } from './ManageBenchmarks/FilterPanel';
import { UnifiedDataTable } from './ManageBenchmarks/UnifiedDataTable';
import DataConnectionsPanel from './DataConnectionsPanel';
import { INTEGRATIONS, getSourceTag, getBenchmarkKey, getBucket, getRatioType, getAcceleratorCount, getEffectiveTp, sortBuckets } from '../utils/dashboardHelpers';

const getCleanModelName = (name) => {
    if (!name) return '';
    return name.replace(/\s*\[.*?\]/g, '').replace(/\s*\(.*?\)/g, '').trim();
};

export default function ManageBenchmarks({ onNavigate, onNavigateBack, dashboardState, dashboardData }) {
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
        expandedModels,
        setExpandedModels
    } = dashboardData;

// Filtered by source
    const filteredBySource = useMemo(() => {
        return data.filter(d => {
            if (!selectedSources.has(d.source || 'local')) return false;

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
    }, [data, selectedSources, activeFilters]);

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

        const baseData = data.filter(d => selectedSources.has(d.source || 'local'));

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
    }, [data, selectedSources]);

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

        const baseData = data.filter(d => selectedSources.has(d.source || 'local'));

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
    }, [data, selectedSources, activeFilters, filterOptions]);

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
                    
                    <div className="flex items-center gap-2.5 border-r border-slate-500 pr-4">
                        <img src="https://llm-d.ai/img/llm-d-logotype-and-icon.png" alt="llm-d Logo" className="h-6 object-contain" />
                        <span className="text-lg font-bold tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">
                            Prism
                        </span>
                    </div>

                    <div className="flex items-center">
                        <h1 className="text-lg font-bold text-white tracking-wide">Manage Benchmarks</h1>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    {/* View Selected Button */}
                    <button
                        onClick={() => onNavigate('benchmark-browser')}
                        className="px-4 py-2 text-sm font-semibold rounded-md text-white bg-blue-600 hover:bg-blue-500 transition-colors flex items-center shadow-lg border border-blue-500/20"
                    >
                        <Eye className="w-4 h-4 mr-2" /> View Selected ({selectedBenchmarks.size})
                    </button>

                    <button
                        onClick={() => setShowDataPanel(!showDataPanel)}
                        className={`px-4 py-2 text-sm font-medium rounded-md border transition-colors flex items-center ${showDataPanel ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700'}`}
                    >
                        <Database className="w-4 h-4 mr-2" /> Connections
                    </button>

                    <a 
                        href="https://llm-d.ai/docs/community" 
                        target="_blank" 
                        rel="noreferrer"
                        className="px-4 py-2 text-sm font-medium rounded-md text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors flex items-center border border-slate-700"
                    >
                        <MessageCircle className="w-4 h-4 mr-2" /> Contact us
                    </a>
                </div>
            </header>

            <main className="w-full px-8 py-6 pl-28 flex flex-col transition-colors duration-200">
                <div className="space-y-4 mb-4 relative">
                    <FilterPanel
                        {...{
                            showFilterPanel, filterOptions, activeFilters, facetCounts, toggleFilter,
                            selectedModels: selectedBenchmarks, modelStats, filteredBySource, showSelectedOnly, setShowSelectedOnly,
                            selectedBenchmarks, setSelectedBenchmarks, setActiveFilters, expandedModels,
                            toggleBenchmark, toggleModelExpansion,
                            baselineBenchmarkKey, setBaselineBenchmarkKey,
                            UnifiedDataTable,
                            hideShowSelectedOnly: true,
                            renameClearToUnselectAll: true,
                            brv02Runs, brv02CustomLabels, setBrv02CustomLabels, removeBrv02Run
                        }}
                    />
                </div>
            </main>

            {/* Data Connections Panel */}
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
                selectedModels={selectedBenchmarks}
                activeFilters={activeFilters}
                showSelectedOnly={showSelectedOnly}
                state={dashboardState}
            />
        </div>
    );
}
