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

import React from 'react';
import { Row } from './Row';
import { normalizeQualityModelName } from '../../utils/qualityParser';
import { getAcceleratorCount } from '../../utils/dashboardHelpers';

// Find the baseline Y at the nearest baseline point to a target X. Used to
// compute %diff for non-baseline points hovered on the scatter chart.
const baselineYNearX = (baselineSeries, targetX) => {
    if (!baselineSeries || baselineSeries.length === 0 || targetX == null) return null;
    let best = baselineSeries[0];
    let bestDelta = Math.abs(best.vx - targetX);
    for (let i = 1; i < baselineSeries.length; i++) {
        const d = Math.abs(baselineSeries[i].vx - targetX);
        if (d < bestDelta) {
            best = baselineSeries[i];
            bestDelta = d;
        }
    }
    return best.vy;
};

const yMetricIsHigherBetter = (yLabel) => {
    if (!yLabel) return null;
    const l = yLabel.toLowerCase();
    if (l.includes('cost')) return false;
    if (l.includes('latency') || l.includes('time') || l.includes('ttft') || l.includes('tpot') || l.includes('itl')) return false;
    // Throughput, QPS, quality scores — higher is better.
    return true;
};

export const CustomChartTooltip = ({ active, payload, label, xLabel, yLabel, costMode, qualityMetrics, baselineBenchmarkKey, baselineSeries }) => {
    if (!active || !payload || !payload.length) return null;

    // Sort payload by value (descending)
    const sortedPayload = [...payload].sort((a, b) => b.value - a.value);
    const higherIsBetter = yMetricIsHigherBetter(yLabel);

    return (
        <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700/50 rounded-xl shadow-2xl p-4 min-w-[320px] backdrop-blur-md text-slate-900 dark:text-slate-100 z-[100]">
            <div className="space-y-6">
                {sortedPayload.map((entry, index) => {
                     const d = entry.payload;
                     const meta = d.metadata || {};
                     const config = meta.configuration || d.configuration;
                     const hardware = d.hardware || meta.hardware;
                     const machine = d.machine_type || meta.machine_type;
                     const accelerator = d.accelerator_type || meta.accelerator_type || meta.accelerator;
                     const chips = meta.accelerator_count || d.accelerator_count || getAcceleratorCount(d);
                     const tp = d.tp || meta.tensor_parallelism || d.tensor_parallelism;
                     const precision = d.precision || meta.precision;
                     const isl = d.workload?.input_tokens ?? d.isl ?? meta.input_seq_len;
                     const osl = d.workload?.output_tokens ?? d.osl ?? meta.output_seq_len;
                     const seqLen = (isl && osl) ? `${isl} / ${osl}` : null;
                     const source = d.source_info?.type || d.source;
                     const qps = d.qps ?? meta.qps ?? d.workload?.qps;
                     const isInterpolated = !!(d.interpolated || meta.interpolated);
                     const ttft = d.ttft ?? meta.ttft ?? (d.metrics?.ttft?.value || null);
                     const itl = d.itl ?? meta.itl ?? (d.metrics?.itl?.value || null);
                     
                     // Format X-Value logic
                     const formattedXValue = (() => {
                        const val = Number(label);
                        if (isNaN(val)) return label;
                        const isMs = xLabel.toLowerCase().includes('time') || xLabel.toLowerCase().includes('lat');
                         if (isMs && Math.abs(val) >= 1000) {
                              return (val / 1000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' s';
                         }
                        return val.toLocaleString(undefined, { maximumFractionDigits: 2 }) + (isMs ? ' ms' : '');
                    })();

                     // Determine if Disaggregated
                     const isDisaggregated = (meta.prefill_node_count > 0 || meta.decode_node_count > 0);

                    return (
                        <div key={index} className="flex flex-col gap-2">
                             {/* Series Header */}
                            <div className="flex items-start gap-3 mb-1">
                                 <div className="w-3 h-3 rounded-full mt-1.5 shrink-0 shadow-sm" style={{ backgroundColor: entry.color, boxShadow: `0 0 6px ${entry.color}60` }} />
                                 <div className="flex-1 overflow-hidden">
                                     <h4 className="font-bold text-lg leading-tight truncate" title={d.model}>
                                        {d.model_name || d.model}
                                     </h4>
                                     <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono truncate">
                                        {hardware !== 'Unknown' ? hardware : ''} 
                                        {machine && machine !== hardware ? ` • ${machine}` : ''}
                                     </div>
                                     <div className="text-[10px] text-orange-500/90 dark:text-orange-400 mt-0.5 font-mono font-medium">
                                        Source: {source}
                                     </div>
                                 </div>
                            </div>

                            {/* Divider */}
                            <div className="border-b border-slate-100 dark:border-slate-800/60 my-1"></div>

                            {/* Content Grid */}
                            <div className="space-y-1 mb-2">
                                 <Row label="Accelerator" value={accelerator || hardware} />
                                 {isDisaggregated ? (
                                    <>
                                        <Row label="Nodes (P/D)" value={`P:${meta.prefill_node_count}(TP${meta.prefill_tp}) | D:${meta.decode_node_count}(TP${meta.decode_tp})`} />
                                    </>
                                 ) : (
                                    <>
                                        <Row label="Chips" value={chips} />
                                        <Row label="TP" value={tp} />
                                        {config && config !== 'Unknown' && <Row label="Config" value={config} />}
                                    </>
                                 )}
                                 <Row label="Seq Len (I/O)" value={seqLen} />
                                 <Row label="Source" value={source} />
                            </div>

                             {/* Metrics */}
                            <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                                {/* X-Axis Metric */}
                                <div className="flex justify-between items-baseline">
                                     <span className="text-slate-500 dark:text-slate-400 font-bold text-sm">{xLabel}:</span>
                                     <span className="text-slate-900 dark:text-white font-bold font-mono text-lg">
                                        {formattedXValue}
                                     </span>
                                </div>
                                {/* Y-Axis Metric */}
                                <div className="flex justify-between items-baseline">
                                    <span className="text-slate-500 dark:text-slate-400 font-bold text-sm">{yLabel}:</span>
                                    <span className="text-slate-900 dark:text-white font-bold font-mono text-xl">
                                        {Number(entry.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                        {yLabel.includes('Cost') && d.metrics?.cost?.source === 'derived_constant_product' && (
                                            <span className="text-[10px] text-amber-500 ml-1 font-normal align-top">(Est)</span>
                                        )}
                                    </span>
                                </div>

                                {/* %diff vs baseline (when set, and this point isn't the baseline itself) */}
                                {(() => {
                                    if (!baselineBenchmarkKey || !baselineSeries || baselineSeries.length === 0) return null;
                                    if (d.benchmarkKey === baselineBenchmarkKey) {
                                        return (
                                            <div className="flex justify-between items-baseline">
                                                <span className="text-cyan-500 dark:text-cyan-400 font-bold text-xs uppercase tracking-wider">★ Baseline</span>
                                            </div>
                                        );
                                    }
                                    const baseY = baselineYNearX(baselineSeries, d.vx);
                                    if (baseY == null || baseY === 0) return null;
                                    const diff = ((Number(entry.value) - baseY) / Math.abs(baseY)) * 100;
                                    const isNeutral = Math.abs(diff) < 0.1;
                                    const isImprovement = higherIsBetter === null ? null : (higherIsBetter ? diff > 0 : diff < 0);
                                    const color = isNeutral
                                        ? 'text-slate-400'
                                        : isImprovement === null
                                            ? 'text-slate-400'
                                            : isImprovement
                                                ? 'text-emerald-500 dark:text-emerald-400'
                                                : 'text-red-500 dark:text-red-400';
                                    return (
                                        <div className="flex justify-between items-baseline">
                                            <span className="text-slate-400 dark:text-slate-500 font-medium text-xs">vs baseline:</span>
                                            <span className={`font-mono text-sm font-bold ${color}`}>
                                                {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                                            </span>
                                        </div>
                                    );
                                })()}
                            </div>
                            
                            {/* Quality Metrics */}
                            {(() => {
                                const normModel = normalizeQualityModelName(d.model);
                                const qData = qualityMetrics?.data?.[normModel];
                                if (!qData) return null;

                                const formatLabel = (key) => {
                                    return key
                                        .replace(/_/g, ' ')
                                        .replace(/\b\w/g, l => l.toUpperCase())
                                        .replace('Mmlu', 'MMLU')
                                        .replace('Live Code Bench', 'LiveCodeBench');
                                };

                                return (
                                    <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800/60 mt-2">
                                        {Object.entries(qData).map(([key, value]) => {
                                            if (key === 'timestamp' || key === 'id') return null;
                                            
                                            const isPercentage = key.includes('mmlu') || key.includes('bench');
                                            const displayValue = isPercentage ? `${value}%` : value;

                                            return (
                                                <div key={key} className="flex justify-between items-baseline">
                                                    <span className="text-indigo-500 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider">{formatLabel(key)}:</span>
                                                    <span className="text-slate-900 dark:text-white font-bold font-mono text-sm">
                                                        {displayValue || 'N/A'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
