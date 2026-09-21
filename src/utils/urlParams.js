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

export const FILTER_KEYS_MAP = {
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
    models: 'f_models',
    tags: 'f_tags'
};

export const RESULTS_STORE_EXTRA_PARAM_KEYS = [
    'status',
    'kpiFilter',
    'own',
    'unlisted',
    'includeUnlisted',
    'communityOnly',
    'community_only',
    'community',
    'q',
    'search',
    'benchmarks',
    'c_mode',
    't_type',
    'cost_mode',
    'l_type',
    'x_max',
    'per_chip',
    'sel_only',
    'pareto',
    'labels',
    'points',
    'y_qual',
    'x_qual',
    'color_mode',
    'conn_mode'
];

/**
 * Standard default values for Results Store graph filters.
 * Values matching these defaults are omitted from share link URLs to keep URLs short and clean.
 */
export const GRAPH_FILTER_DEFAULTS = {
    c_mode: 'tpot',
    t_type: 'output',
    cost_mode: 'spot',
    l_type: 'e2e',
    x_max: Infinity,
    per_chip: false,
    sel_only: true,
    pareto: false,
    labels: true,
    points: false,
    y_qual: 'mmlu_pro',
    x_qual: 'mmlu_pro',
    color_mode: 'hardware',
    conn_mode: 'stage'
};

/**
 * Appends graph filter parameters to URLSearchParams only if they differ from their default values.
 * Keeps generated share links short and clean.
 * @param {URLSearchParams} params
 * @param {Object} graphFilters
 */
export const appendGraphFilterParams = (params, graphFilters) => {
    if (!graphFilters) return;

    const {
        c_mode,
        t_type,
        cost_mode,
        l_type,
        x_max,
        per_chip,
        sel_only,
        pareto,
        labels,
        points,
        y_qual,
        x_qual,
        color_mode,
        conn_mode
    } = graphFilters;

    if (c_mode && c_mode !== GRAPH_FILTER_DEFAULTS.c_mode) {
        params.set('c_mode', c_mode);
    }
    if (t_type && t_type !== GRAPH_FILTER_DEFAULTS.t_type) {
        params.set('t_type', t_type);
    }
    if (cost_mode && cost_mode !== GRAPH_FILTER_DEFAULTS.cost_mode) {
        params.set('cost_mode', cost_mode);
    }
    if (l_type && l_type !== GRAPH_FILTER_DEFAULTS.l_type) {
        params.set('l_type', l_type);
    }
    if (x_max !== undefined && x_max !== null && x_max !== Infinity && x_max !== GRAPH_FILTER_DEFAULTS.x_max) {
        params.set('x_max', x_max);
    }
    if (per_chip !== undefined && Boolean(per_chip) !== GRAPH_FILTER_DEFAULTS.per_chip) {
        params.set('per_chip', Boolean(per_chip));
    }
    if (sel_only !== undefined && Boolean(sel_only) !== GRAPH_FILTER_DEFAULTS.sel_only) {
        params.set('sel_only', Boolean(sel_only));
    }
    if (pareto !== undefined && Boolean(pareto) !== GRAPH_FILTER_DEFAULTS.pareto) {
        params.set('pareto', Boolean(pareto));
    }
    if (labels !== undefined && Boolean(labels) !== GRAPH_FILTER_DEFAULTS.labels) {
        params.set('labels', Boolean(labels));
    }
    if (points !== undefined && Boolean(points) !== GRAPH_FILTER_DEFAULTS.points) {
        params.set('points', Boolean(points));
    }
    if (y_qual && y_qual !== GRAPH_FILTER_DEFAULTS.y_qual) {
        params.set('y_qual', y_qual);
    }
    if (x_qual && x_qual !== GRAPH_FILTER_DEFAULTS.x_qual) {
        params.set('x_qual', x_qual);
    }
    if (color_mode && color_mode !== GRAPH_FILTER_DEFAULTS.color_mode) {
        params.set('color_mode', color_mode);
    }
    if (conn_mode && conn_mode !== GRAPH_FILTER_DEFAULTS.conn_mode) {
        params.set('conn_mode', conn_mode);
    }
};

/**
 * Removes all Results Store filter params (f_*) and extra params from a URLSearchParams object.
 * @param {URLSearchParams} params
 * @returns {boolean} Whether any params were removed
 */
export const clearResultsStoreParams = (params) => {
    let changed = false;
    const keys = Array.from(params.keys());
    for (const key of keys) {
        if (key.startsWith('f_')) {
            params.delete(key);
            changed = true;
        }
    }
    for (const key of RESULTS_STORE_EXTRA_PARAM_KEYS) {
        if (params.has(key)) {
            params.delete(key);
            changed = true;
        }
    }
    return changed;
};

/**
 * Removes the ?src= parameter from a URLSearchParams object.
 * @param {URLSearchParams} params
 * @returns {boolean} Whether ?src= was present and removed
 */
export const clearSrcParams = (params) => {
    if (params.has('src')) {
        params.delete('src');
        return true;
    }
    return false;
};

/**
 * Synchronizes Results Store state (kpiFilter, includeUnlisted, communityOnly, searchTerm, activeFilters)
 * into a URLSearchParams object, ensuring ?src= is also stripped.
 * @param {URLSearchParams} params
 * @param {Object} state
 */
export const syncResultsStoreParams = (params, { kpiFilter, includeUnlisted, communityOnly, searchTerm, activeFilters }) => {
    if (kpiFilter) {
        params.set('status', kpiFilter);
        params.set('kpiFilter', kpiFilter);
        if (['my-submissions', 'staged', 'unlisted', 'processing', 'in_review', 'approved', 'action'].includes(kpiFilter)) {
            params.set('own', 'true');
        } else {
            params.delete('own');
        }
    } else {
        params.delete('status');
        params.delete('kpiFilter');
        params.delete('own');
    }

    if (includeUnlisted) {
        params.set('unlisted', '1');
        params.set('includeUnlisted', '1');
    } else {
        params.delete('unlisted');
        params.delete('includeUnlisted');
    }

    if (communityOnly) {
        params.set('communityOnly', '1');
    } else {
        params.delete('communityOnly');
        params.delete('community_only');
        params.delete('community');
    }

    if (searchTerm) {
        params.set('q', searchTerm);
    } else {
        params.delete('q');
        params.delete('search');
    }

    // Clear and sync activeFilters
    Object.values(FILTER_KEYS_MAP).forEach(paramKey => params.delete(paramKey));
    if (activeFilters) {
        Object.entries(FILTER_KEYS_MAP).forEach(([filterKey, paramKey]) => {
            const setVal = activeFilters[filterKey];
            if (setVal && setVal.size > 0) {
                Array.from(setVal).forEach(val => params.append(paramKey, val));
            }
        });
    }

    // Always ensure src is not in URL
    params.delete('src');
};
