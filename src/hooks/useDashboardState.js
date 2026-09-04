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

import { useState, useCallback, useEffect, useRef } from 'react';
import { defaultState } from '../config/defaultState';

export const getSharedState = () => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    if (Array.from(params.keys()).length === 0) return null;

    try {
        const parseSet = (key) => new Set(params.getAll(key));
        const parseNum = (key, def) => params.has(key) ? Number(params.get(key)) : def;
        const parseBool = (key, def) => params.has(key) ? params.get(key) === 'true' : def;

        return {
            status: params.get('status') || params.get('kpiFilter') || null,
            own: params.has('own') ? params.get('own') === 'true' : null,
            q: params.get('q') || params.get('search') || null,
            unlisted: params.has('unlisted') ? params.get('unlisted') === 'true' || params.get('unlisted') === '1' : (params.has('includeUnlisted') ? params.get('includeUnlisted') === 'true' || params.get('includeUnlisted') === '1' : null),
            communityOnly: params.has('communityOnly') ? params.get('communityOnly') === 'true' || params.get('communityOnly') === '1' : (params.has('community_only') ? params.get('community_only') === 'true' || params.get('community_only') === '1' : null),
            chartMode: params.get('c_mode') || 'tpot',
            tputType: params.get('t_type') || 'output',
            costMode: params.get('cost_mode') || 'spot',
            latType: params.get('l_type') || 'e2e',
            // Normalize Aggregated keys to use double colons (only if not already double)
            selectedModels: params.has('models') ? new Set([...parseSet('models')].map(k => k.includes('::Aggregated') ? k : k.replace(':Aggregated', '::Aggregated'))) : null,
            modelsFilter: params.has('f_models') ? parseSet('f_models') : null,
            hwFilter: params.has('f_hw') ? parseSet('f_hw') : null,
            machFilter: params.has('f_mach') ? parseSet('f_mach') : null,
            precFilter: params.has('f_prec') ? parseSet('f_prec') : null,
            tpFilter: params.has('f_tp') ? parseSet('f_tp') : null,
            islFilter: params.has('f_isl') ? parseSet('f_isl') : null,
            oslFilter: params.has('f_osl') ? parseSet('f_osl') : null,
            ratioFilter: params.has('f_ratio') ? parseSet('f_ratio') : null,
            pdRatioFilter: params.has('f_pd_ratio') ? parseSet('f_pd_ratio') : null,
            msFilter: params.has('f_ms') ? parseSet('f_ms') : null,
            ssFilter: params.has('f_ss') ? parseSet('f_ss') : null,
            originFilter: params.has('f_origin') ? parseSet('f_origin') : null,
            accFilter: params.has('f_acc') ? parseSet('f_acc') : null,
            ucFilter: params.has('f_uc') ? parseSet('f_uc') : null,
            optFilter: params.has('f_opt') ? parseSet('f_opt') : null,
            compFilter: params.has('f_comp') ? parseSet('f_comp') : null,
            sources: params.has('src') ? parseSet('src') : null,
            buckets: params.getAll('buckets'),
            giqProjects: params.getAll('apis'),
            baselineKey: params.get('baseline') || null,
            xAxisMax: parseNum('x_max', Infinity),
            showPerChip: parseBool('per_chip', false),
            showSelectedOnly: parseBool('sel_only', true),
            showPareto: parseBool('pareto', false),
            showLabels: parseBool('labels', true),
            showDataLabels: parseBool('points', false),
            yQualityMode: params.get('y_qual') || 'mmlu_pro',
            xQualityMode: params.get('x_qual') || 'mmlu_pro',
        };
    } catch (e) {
        console.error("Failed to parse shared state", e);
        return null;
    }
};

export const useDashboardState = () => {
    const initialState = getSharedState() || defaultState;

    // View States
    const [chartColorMode, setChartColorMode] = useState('hardware');
    const [chartMode, setChartMode] = useState(initialState.chartMode);
    const [tputType, setTputType] = useState(initialState.tputType);
    const [costMode, setCostMode] = useState(initialState.costMode);
    const [latType, setLatType] = useState(initialState.latType);
    
    // Quality mode
    const [xQualityMode, setXQualityMode] = useState(initialState.xQualityMode);
    const [yQualityMode, setYQualityMode] = useState(initialState.yQualityMode);
    const [lineConnectMode, setLineConnectMode] = useState('stage');

    // Chart configs
    const [xAxisMax, setXAxisMax] = useState(initialState.xAxisMax);
    const [showPerChip, setShowPerChip] = useState(initialState.showPerChip);
    const [showSelectedOnly, setShowSelectedOnly] = useState(() => {
        if (initialState.showSelectedOnly !== undefined && initialState.showSelectedOnly !== defaultState.showSelectedOnly) {
            return initialState.showSelectedOnly;
        }
        try {
            const saved = localStorage.getItem('prism_show_selected_only');
            return saved !== null ? saved === 'true' : initialState.showSelectedOnly;
        } catch { return initialState.showSelectedOnly; }
    });

    useEffect(() => {
        try {
            localStorage.setItem('prism_show_selected_only', showSelectedOnly.toString());
        } catch (e) { console.warn(e); }
    }, [showSelectedOnly]);

    const [showPareto, setShowPareto] = useState(initialState.showPareto);
    const [showLabels, setShowLabels] = useState(initialState.showLabels);
    const [showDataLabels, setShowDataLabels] = useState(initialState.showDataLabels);
    
    const [isZoomEnabled, setIsZoomEnabled] = useState(false);
    const [isLogScaleX, setIsLogScaleX] = useState(false);
    const [zoomDomain, setZoomDomain] = useState(null);

    // Panels
    const [showDataPanel, setShowDataPanel] = useState(false);
    const [showFilterPanel, setShowFilterPanel] = useState(true);
    const [showComparisonDrawer, setShowComparisonDrawer] = useState(false);
    const [isInspectorOpen, setIsInspectorOpen] = useState(false);
    const [qualityInspectOpen, setQualityInspectOpen] = useState(false);

    // Benchmark selection
    const [selectedBenchmarks, setSelectedBenchmarks] = useState(() => {
        if (initialState.selectedModels && initialState.selectedModels.size > 0) return initialState.selectedModels;
        try {
            const saved = localStorage.getItem('prism_selected_benchmarks');
            if (saved) {
                return new Set(JSON.parse(saved));
            }
        } catch (e) {
            console.warn("Failed to load selected benchmarks from local storage", e);
        }
        return initialState.selectedModels || new Set();
    });

    const isInitialMountSelection = useRef(true);

    useEffect(() => {
        if (isInitialMountSelection.current) {
            isInitialMountSelection.current = false;
            try {
                const saved = localStorage.getItem('prism_selected_benchmarks');
                if (saved === null && selectedBenchmarks.size === 0) return;
            } catch (e) {
                console.warn(e);
            }
        }
        try {
            localStorage.setItem('prism_selected_benchmarks', JSON.stringify(Array.from(selectedBenchmarks)));
        } catch (e) {
            console.warn("Failed to save selected benchmarks to local storage", e);
        }
    }, [selectedBenchmarks]);

    // Baseline key — when set, the matching benchmark is highlighted on the
    // scatter chart and other points show a %diff badge in the tooltip.
    const [baselineBenchmarkKey, setBaselineBenchmarkKey] = useState(() => {
        if (initialState.baselineKey) return initialState.baselineKey;
        try {
            const saved = localStorage.getItem('baselineBenchmarkKey');
            return saved || null;
        } catch { return null; }
    });

    useEffect(() => {
        try {
            if (baselineBenchmarkKey) {
                localStorage.setItem('baselineBenchmarkKey', baselineBenchmarkKey);
            } else {
                localStorage.removeItem('baselineBenchmarkKey');
            }
        } catch { /* ignore */ }
    }, [baselineBenchmarkKey]);

    // Derive initial modelsFilter from selectedModels if modelsFilter is empty
    const deriveInitialModelsFilter = () => {
        if (initialState.modelsFilter && initialState.modelsFilter.size > 0) {
            return initialState.modelsFilter;
        }

        const models = new Set();
        if (initialState.selectedModels) {
            initialState.selectedModels.forEach(k => {
                if (typeof k === 'string') {
                    if (k.includes('::')) {
                        models.add(k.split('::')[2]); // index 2 is the model name in the new key format
                    } else if (k.startsWith('inference-perf:') || k.startsWith('file:')) {
                        // For legacy/file keys we can't easily extract the model without the data,
                        // so we just rely on the user explicitly setting modelsFilter if they want to filter
                    } else {
                        models.add(k); // Old format where key was just the model name
                    }
                }
            });
        }
        return models;
    };

    // Active Filters
    const [activeFilters, setActiveFilters] = useState(() => {
        let savedFilters = {};
        try {
            const savedStr = localStorage.getItem('prism_active_filters');
            if (savedStr) {
                savedFilters = JSON.parse(savedStr);
            }
        } catch (e) {
            console.warn("Failed to load active filters from local storage", e);
        }

        const resolveFilterSet = (urlFilterSet, savedArray) => {
            if (urlFilterSet && urlFilterSet.size > 0) {
                return urlFilterSet;
            }
            if (Array.isArray(savedArray)) {
                return new Set(savedArray);
            }
            return new Set();
        };

        return {
            models: initialState.modelsFilter && initialState.modelsFilter.size > 0 ? initialState.modelsFilter : resolveFilterSet(null, savedFilters.models),
            hardware: resolveFilterSet(initialState.hwFilter, savedFilters.hardware),
            machines: resolveFilterSet(initialState.machFilter, savedFilters.machines),
            tp: resolveFilterSet(initialState.tpFilter, savedFilters.tp),
            precisions: resolveFilterSet(initialState.precFilter, savedFilters.precisions),
            isl: resolveFilterSet(initialState.islFilter, savedFilters.isl),
            osl: resolveFilterSet(initialState.oslFilter, savedFilters.osl),
            ratio: resolveFilterSet(initialState.ratioFilter, savedFilters.ratio),
            modelServer: resolveFilterSet(initialState.msFilter, savedFilters.modelServer),
            servingStack: resolveFilterSet(initialState.ssFilter, savedFilters.servingStack),
            components: resolveFilterSet(initialState.compFilter, savedFilters.components),
            origins: resolveFilterSet(initialState.originFilter, savedFilters.origins),
            connectionNames: new Set(),
            pdRatio: resolveFilterSet(initialState.pdRatioFilter, savedFilters.pdRatio),
            acc_count: resolveFilterSet(initialState.accFilter, savedFilters.acc_count),
            useCase: resolveFilterSet(initialState.ucFilter, savedFilters.useCase),
            optimizations: resolveFilterSet(initialState.optFilter, savedFilters.optimizations)
        };
    });

    useEffect(() => {
        try {
            const filtersToSave = {};
            for (const key of Object.keys(activeFilters)) {
                filtersToSave[key] = Array.from(activeFilters[key]);
            }
            localStorage.setItem('prism_active_filters', JSON.stringify(filtersToSave));

            if (typeof window !== 'undefined') {
                const params = new URLSearchParams(window.location.search);
                const filterKeysMap = {
                    hardware: 'f_hw',
                    machines: 'f_mach',
                    tp: 'f_tp',
                    precisions: 'f_prec',
                    isl: 'f_isl',
                    osl: 'f_osl',
                    ratio: 'f_ratio',
                    pdRatio: 'f_pd_ratio',
                    modelServer: 'f_ms',
                    servingStack: 'f_ss',
                    origins: 'f_origin',
                    acc_count: 'f_acc',
                    useCase: 'f_uc',
                    optimizations: 'f_opt',
                    components: 'f_comp',
                    models: 'f_models'
                };

                Object.values(filterKeysMap).forEach(paramKey => params.delete(paramKey));

                Object.entries(filterKeysMap).forEach(([filterKey, paramKey]) => {
                    const setVal = activeFilters[filterKey];
                    if (setVal && setVal.size > 0) {
                        Array.from(setVal).forEach(val => params.append(paramKey, val));
                    }
                });

                const newSearch = params.toString();
                const newUrl = `${window.location.pathname}${newSearch ? '?' + newSearch : ''}${window.location.hash || ''}`;
                if (window.location.search !== (newSearch ? `?${newSearch}` : '')) {
                    window.history.replaceState(null, '', newUrl);
                }
            }
        } catch (e) {
            console.warn("Failed to save active filters to local storage or sync URL", e);
        }
    }, [activeFilters]);

    const generateShareUrl = useCallback((
        bucketConfigs,
        apiConfigs,
        selectedSources
    ) => {
        const params = new URLSearchParams();
        params.set('share', '1');
        params.set('view', 'benchmark-browser');
        params.set('c_mode', chartMode);
        params.set('t_type', tputType);
        params.set('cost_mode', costMode);
        params.set('l_type', latType);
        if (xAxisMax !== Infinity) params.set('x_max', xAxisMax);
        params.set('per_chip', showPerChip);
        params.set('sel_only', showSelectedOnly);
        params.set('pareto', showPareto);
        params.set('labels', showLabels);
        params.set('points', showDataLabels);
        
        if (selectedBenchmarks.size > 0) [...selectedBenchmarks].forEach(v => params.append('models', v));
        if (baselineBenchmarkKey) params.set('baseline', baselineBenchmarkKey);
        if (activeFilters.models.size > 0) [...activeFilters.models].forEach(v => params.append('f_models', v));
        if (activeFilters.hardware.size > 0) [...activeFilters.hardware].forEach(v => params.append('f_hw', v));
        if (activeFilters.tp.size > 0) [...activeFilters.tp].forEach(v => params.append('f_tp', v));
        if (activeFilters.precisions.size > 0) [...activeFilters.precisions].forEach(v => params.append('f_prec', v));
        if (activeFilters.isl.size > 0) [...activeFilters.isl].forEach(v => params.append('f_isl', v));
        if (activeFilters.osl.size > 0) [...activeFilters.osl].forEach(v => params.append('f_osl', v));
        if (activeFilters.ratio.size > 0) [...activeFilters.ratio].forEach(v => params.append('f_ratio', v));
        if (activeFilters.pdRatio && activeFilters.pdRatio.size > 0) [...activeFilters.pdRatio].forEach(v => params.append('f_pd_ratio', v));
        if (activeFilters.modelServer.size > 0) [...activeFilters.modelServer].forEach(v => params.append('f_ms', v));
        if (activeFilters.servingStack.size > 0) [...activeFilters.servingStack].forEach(v => params.append('f_ss', v));
        if (activeFilters.origins.size > 0) [...activeFilters.origins].forEach(v => params.append('f_origin', v));
        if (activeFilters.acc_count.size > 0) [...activeFilters.acc_count].forEach(v => params.append('f_acc', v));
        if (activeFilters.useCase.size > 0) [...activeFilters.useCase].forEach(v => params.append('f_uc', v));
        if (activeFilters.optimizations.size > 0) [...activeFilters.optimizations].forEach(v => params.append('f_opt', v));
        if (activeFilters.components.size > 0) [...activeFilters.components].forEach(v => params.append('f_comp', v));
        
        [...selectedSources].forEach(v => params.append('src', v));
        
        bucketConfigs.forEach(b => params.append('buckets', typeof b === 'string' ? b : b.bucket));
        apiConfigs.forEach(c => params.append('apis', typeof c === 'string' ? c : c.projectId));

        return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    }, [
        chartMode, tputType, costMode, latType, xAxisMax, showPerChip,
        showSelectedOnly, showPareto, showLabels, showDataLabels,
        selectedBenchmarks, activeFilters, baselineBenchmarkKey
    ]);

    return {
        initialState,
        // View States
        chartColorMode, setChartColorMode,
        chartMode, setChartMode,
        tputType, setTputType,
        costMode, setCostMode,
        latType, setLatType,
        xQualityMode, setXQualityMode,
        yQualityMode, setYQualityMode,
        lineConnectMode, setLineConnectMode,

        // Chart Configs
        xAxisMax, setXAxisMax,
        showPerChip, setShowPerChip,
        showSelectedOnly, setShowSelectedOnly,
        showPareto, setShowPareto,
        showLabels, setShowLabels,
        showDataLabels, setShowDataLabels,
        isZoomEnabled, setIsZoomEnabled,
        isLogScaleX, setIsLogScaleX,
        zoomDomain, setZoomDomain,

        // Panels
        showDataPanel, setShowDataPanel,
        showFilterPanel, setShowFilterPanel,
        showComparisonDrawer, setShowComparisonDrawer,
        isInspectorOpen, setIsInspectorOpen,
        qualityInspectOpen, setQualityInspectOpen,

        // Selection
        selectedBenchmarks, setSelectedBenchmarks,
        baselineBenchmarkKey, setBaselineBenchmarkKey,
        activeFilters, setActiveFilters,

        generateShareUrl
    };
};
