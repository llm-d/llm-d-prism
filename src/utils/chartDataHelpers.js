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

import { getParetoFrontier, getAcceleratorCount } from './dashboardHelpers';
import { normalizeQualityModelName } from './qualityParser';

/**
 * Extracts a stage index safely from a benchmark entry.
 */
export const getStageIdx = (d) => {
    if (!d) return null;
    const raw = d.workload?.stage ?? d.prism_stage_index ?? d.stageIndex ?? d.stage ?? d.metadata?.stage_index ?? d.metadata?.stage;
    if (raw !== null && raw !== undefined && raw !== '') {
        const num = Number(raw);
        if (!isNaN(num)) return num;
    }
    return null;
};

/**
 * Resolves a property path from an entry with domain-specific aliases.
 */
export const getVal = (obj, key, qualityMetrics) => {
    if (!obj) return undefined;
    if (key === 'stage') {
        return getStageIdx(obj) ?? 0;
    }
    if (key === 'time_per_output_token') {
        const val = obj.time_per_output_token ?? obj.metrics?.tpot ?? obj.tpot ?? obj.metrics?.tpot_ms ?? obj.metrics?.time_per_output_token;
        if (val !== undefined) return val;
    }
    if (key === 'throughput' || key === 'metrics.output_tput') {
        const val = obj.throughput ?? obj.metrics?.output_tput ?? obj.metrics?.throughput;
        if (val !== undefined) return val;
    }
    if (key === 'metrics.request_rate') {
        const val = obj.metrics?.request_rate ?? obj.qps ?? obj.workload?.target_qps;
        if (val !== undefined) return val;
    }
    if (key && key.startsWith('quality.')) {
        const normModel = normalizeQualityModelName(obj.model || obj.model_name);
        if (!qualityMetrics?.data?.[normModel]) return undefined;
        const qData = qualityMetrics.data[normModel];
        if (key === 'quality.mmlu_pro') return qData.mmlu_pro;
        if (key === 'quality.arena') return qData.arena_score_text;
        if (key === 'quality.arena_code') return qData.arena_score_code;
        if (key === 'quality.live_code_bench') return qData.live_code_bench;
    }
    return key ? key.split('.').reduce((o, i) => o?.[i], obj) : undefined;
};

/**
 * Computes chart data series, bounds, and normalizations for ThroughputCostChart.
 */
export const computeThroughputChartData = ({
    filteredData = [],
    config = {},
    getBenchmarkKey = (d) => d.benchmarkKey || d.source || 'default',
    baselineBenchmarkKey = null,
    showPareto = false,
    tputType = 'output',
    isLogScaleX = false,
    xAxisMax = Infinity,
    isBarMode = false,
    isVerticalLayout = false,
    selectedBenchmarks = new Set(),
    showPerChip = false,
    qualityMetrics = null,
}) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const visibleDataPoints = [];

    const isTputApplicable = tputType !== 'cost' && tputType !== 'quality' && tputType !== 'stage';

    filteredData.forEach(d => {
        if (config.filterFn ? config.filterFn(d) : true) {
            const vx = Number(getVal(d, config.xKey, qualityMetrics));
            let vy = Number(getVal(d, config.yKey, qualityMetrics));
            if (!isNaN(vx) && !isNaN(vy)) {
                if (showPerChip && isTputApplicable) {
                    const chips = getAcceleratorCount(d);
                    if (chips > 0) {
                        vy = vy / chips;
                    }
                }
                const benchmarkKey = getBenchmarkKey(d);
                const model = d.model_name || d.model || 'Unknown';
                visibleDataPoints.push({ ...d, vx, vy, model, benchmarkKey });
                if (vx < minX) minX = vx;
                if (vx > maxX) maxX = vx;
                if (vy < minY) minY = vy;
                if (vy > maxY) maxY = vy;
            }
        }
    });

    const uniqueBenchmarks = [...new Set(visibleDataPoints.map(d => d.benchmarkKey))];

    const baselineSeries = (baselineBenchmarkKey
        ? visibleDataPoints
              .filter(d => d.benchmarkKey === baselineBenchmarkKey)
              .map(d => ({ vx: d.vx, vy: d.vy }))
              .sort((a, b) => a.vx - b.vx)
        : []);

    let paretoData = [];
    if (showPareto && visibleDataPoints.length > 0) {
         const maximizeY = tputType !== 'cost';
         const minimizeX = config.xKey !== 'tokens_per_second' && !config.xKey?.startsWith('quality.');
         paretoData = getParetoFrontier(visibleDataPoints, minimizeX, maximizeY);
    }

    if (minX === Infinity) { minX = 0; maxX = 100; minY = 0; maxY = 100; }
    
    const xPad = (maxX - minX) * 0.05 || (isLogScaleX ? minX * 0.1 : 1);
    const yPad = (maxY - minY) * 0.05 || 1;
    
    let minXBound = Math.max(0, minX - xPad);
    let maxXBound = maxX + xPad;

    if (isLogScaleX) {
          const logMin = Math.floor(Math.log10(minX > 0 ? minX : 0.1));
          const logMax = Math.ceil(Math.log10(maxX > 0 ? maxX : 100));
          minXBound = Math.pow(10, logMin);
          maxXBound = Math.pow(10, logMax);
    }
    const upperX = xAxisMax !== Infinity ? xAxisMax : maxXBound;
    const autoX = [minXBound, upperX]; 
    const autoY = [Math.max(0, minY - yPad), maxY + yPad];

    // Compute Bar Chart data if in Bar mode
    let barChartData = [];
    let allStageIndices = [];
    if (isBarMode) {
        const metricKey = isVerticalLayout ? config.xKey : config.yKey;
        const activePoints = [];

        filteredData.forEach(d => {
            const benchmarkKey = getBenchmarkKey(d);
            if (selectedBenchmarks && selectedBenchmarks.size > 0 && !selectedBenchmarks.has(benchmarkKey)) return;

            const rawMetric = getVal(d, metricKey, qualityMetrics);
            if (rawMetric === null || rawMetric === undefined) return;
            let numVal = Number(rawMetric);
            if (isNaN(numVal) || numVal < 0) return;

            if (!isVerticalLayout && showPerChip && isTputApplicable) {
                const chips = getAcceleratorCount(d);
                if (chips > 0) {
                    numVal = numVal / chips;
                }
            }

            const stageIdx = getStageIdx(d) ?? 0;
            const model = d.model_name || d.model || 'Unknown';
            activePoints.push({
                ...d,
                stageIdx,
                numVal,
                benchmarkKey,
                model
            });
        });

        const stagesSet = new Set(activePoints.map(p => p.stageIdx));
        if (stagesSet.size === 0) stagesSet.add(0);
        allStageIndices = Array.from(stagesSet).sort((a, b) => a - b);

        barChartData = allStageIndices.map(stageIdx => {
            const row = {
                stage: stageIdx,
                stageLabel: `Stage ${stageIdx}`,
            };

            uniqueBenchmarks.forEach(benchmarkKey => {
                if (selectedBenchmarks && selectedBenchmarks.size > 0 && !selectedBenchmarks.has(benchmarkKey)) return;
                const pts = activePoints.filter(p => p.benchmarkKey === benchmarkKey && p.stageIdx === stageIdx);
                if (pts.length > 0) {
                    const avgVal = pts.reduce((acc, p) => acc + p.numVal, 0) / pts.length;
                    row[benchmarkKey] = Number(avgVal.toFixed(2));
                    row[`_raw_${benchmarkKey}`] = pts[0];
                }
            });

            return row;
        });
    }

    return { visibleDataPoints, uniqueBenchmarks, baselineSeries, paretoData, autoX, autoY, barChartData };
};
