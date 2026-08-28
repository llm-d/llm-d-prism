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
import { ResponsiveContainer, LineChart, CartesianGrid, Tooltip, Line, BarChart, Bar, LabelList } from 'recharts';
import { RotateCcw, Maximize, Minimize, ChevronUp, ChevronDown } from 'lucide-react';
import { CustomLabel, CustomChartTooltip } from '../common';
import { Button, ChartContainer, ChartXAxis, ChartYAxis, Input, Select, gridProps } from '../ui';
import { cn } from '../../utils/cn';
import { getBucket, getEffectiveTp, getParetoFrontier } from '../../utils/dashboardHelpers';
import { stripModelPrefix, stripExperimentIdSuffix } from '../../utils/runLabel';
const getStageIdx = (d) => {
    const raw = d.workload?.stage ?? d.prism_stage_index ?? d.stageIndex ?? d.stage ?? d.metadata?.stage_index ?? d.metadata?.stage;
    if (raw !== null && raw !== undefined && raw !== '') {
        const num = Number(raw);
        if (!isNaN(num)) return num;
    }
    return null;
};

const CONNECT_MODES = [
    {
        id: 'stage',
        name: 'Stage Sequence',
        subtitle: 'Connect points in stage order (0 → 1 → 2)',
    },
    {
        id: 'x',
        name: 'Increasing X-Value',
        subtitle: 'Connect points by increasing X-axis value',
    },
    {
        id: 'y',
        name: 'Increasing Y-Value',
        subtitle: 'Connect points by increasing Y-axis value',
    },
];

const CONNECT_MODE_LABELS = {
    stage: 'Stage',
    x: 'X-Value',
    y: 'Y-Value',
};

const LineConnectPopover = ({ lineConnectMode, setLineConnectMode, size = 'normal' }) => {
    const [open, setOpen] = React.useState(false);
    const popoverRef = React.useRef(null);

    React.useEffect(() => {
        if (!open) return;
        const handleOutsideClick = (e) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [open]);

    const activeLabel = CONNECT_MODE_LABELS[lineConnectMode] || 'Stage';

    return (
        <div className="relative inline-block" ref={popoverRef}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-[10px] font-extrabold uppercase tracking-wider border cursor-pointer',
                    open || lineConnectMode !== 'stage'
                        ? 'bg-slate-800 text-cyan-400 border-slate-700 shadow-sm'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white border-slate-800 hover:border-slate-700'
                )}
                title="Choose how chart lines connect data points"
            >
                <span>Lines: {activeLabel}</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-80" />
            </button>

            {open && (
                <div className="absolute right-0 mt-1.5 w-72 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2.5 z-[200] flex flex-col gap-1.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                    <div className="text-[9.5px] uppercase tracking-wider font-extrabold text-slate-400 px-1 py-1 border-b border-slate-800 flex items-center justify-between">
                        <span>Line Connection Mode</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        {CONNECT_MODES.map((option) => {
                            const isSelected = lineConnectMode === option.id;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => {
                                        setLineConnectMode(option.id);
                                        setOpen(false);
                                    }}
                                    className={cn(
                                        "flex flex-col items-start p-2 rounded-lg text-left transition-all border cursor-pointer",
                                        isSelected
                                            ? "bg-cyan-950/50 border-cyan-800/80 text-cyan-300 shadow-sm"
                                            : "bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-800/60 hover:border-slate-700"
                                    )}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <span className="text-xs font-bold text-slate-200">{option.name}</span>
                                        {isSelected && <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />}
                                    </div>
                                    <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">{option.subtitle}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

const metricIsHigherBetter = (label) => {
    if (!label) return true;
    const l = String(label).toLowerCase();
    if (l.includes('cost')) return false;
    if (l.includes('latency') || l.includes('time') || l.includes('ttft') || l.includes('tpot') || l.includes('itl')) return false;
    return true;
};

const BarCustomTooltip = ({
    active,
    payload,
    label,
    metricLabel,
    smartLabels,
    baselineBenchmarkKey,
    theme = 'dark',
}) => {
    if (!active || !payload || !payload.length) return null;

    const baselineItem = payload.find(p => p.dataKey === baselineBenchmarkKey);
    const baselineVal = baselineItem ? baselineItem.value : null;
    const isHigherBetter = metricIsHigherBetter(metricLabel);

    return (
        <div className={cn(
            "p-3 rounded-xl border shadow-2xl backdrop-blur-md z-[100000] min-w-[220px] max-w-sm flex flex-col gap-2 font-sans select-none animate-in fade-in zoom-in-95 duration-100",
            theme === 'dark' 
                ? "bg-slate-900/95 border-slate-700/80 text-slate-200" 
                : "bg-white/95 border-slate-200 text-slate-800 shadow-slate-300"
        )}>
            <div className="flex items-center justify-between border-b border-slate-700/50 pb-1.5 mb-1">
                <span className="text-xs font-black uppercase tracking-wider text-cyan-400">
                    {label}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                    {metricLabel}
                </span>
            </div>

            <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto custom-scrollbar">
                {payload.filter(p => p.value !== undefined && p.value !== null).map((item) => {
                    const benchmarkKey = item.dataKey;
                    const isBaseline = benchmarkKey === baselineBenchmarkKey;
                    const displayName = smartLabels?.[benchmarkKey] || item.name || benchmarkKey;
                    const raw = item.payload?.[`_raw_${benchmarkKey}`];
                    const val = Number(item.value);
                    const formattedVal = Math.abs(val) >= 100 ? val.toFixed(1) : val.toLocaleString(undefined, { maximumFractionDigits: 2 });

                    let diffPercent = null;
                    if (!isBaseline && baselineVal != null && baselineVal > 0) {
                        diffPercent = ((val - baselineVal) / baselineVal) * 100;
                    }

                    return (
                        <div key={benchmarkKey} className="flex flex-col gap-0.5 py-1 border-b border-slate-800/40 last:border-0">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.fill || item.color }} />
                                    <span className={cn(
                                        "text-xs truncate font-semibold",
                                        isBaseline ? "text-amber-300 font-bold" : (theme === 'dark' ? "text-slate-200" : "text-slate-800")
                                    )} title={displayName}>
                                        {isBaseline ? `★ ${displayName}` : displayName}
                                    </span>
                                </div>
                                <span className={cn("text-xs font-mono font-bold flex-shrink-0", theme === 'dark' ? "text-white" : "text-slate-900")}>
                                    {formattedVal}
                                </span>
                            </div>

                            {diffPercent !== null && (
                                <div className="flex items-center justify-end gap-1 text-[10px] font-mono">
                                    <span className="text-slate-500">vs baseline:</span>
                                    <span className={cn(
                                        "font-bold",
                                        diffPercent === 0 
                                            ? "text-slate-400" 
                                            : (isHigherBetter 
                                                ? (diffPercent > 0 ? "text-emerald-400" : "text-rose-400")
                                                : (diffPercent < 0 ? "text-emerald-400" : "text-rose-400")
                                            )
                                    )}>
                                        {diffPercent > 0 ? `+${diffPercent.toFixed(1)}%` : `${diffPercent.toFixed(1)}%`}
                                    </span>
                                </div>
                            )}

                            {raw && (raw.metadata?.hardware || raw.hardware || raw.metadata?.machine_type) && (
                                <div className="text-[9.5px] text-slate-400/80 truncate pl-4">
                                    {raw.metadata?.hardware || raw.hardware || raw.metadata?.machine_type}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const ThroughputCostChart = (props) => {
    const {
        tputType, setTputType, yQualityMode, setYQualityMode, chartMode, setChartMode,
        xQualityMode, setXQualityMode, costMode, setCostMode, showPerChip, setShowPerChip,
        showLabels, setShowLabels, showDataLabels, setShowDataLabels, showPareto, setShowPareto,
        qualityMetrics, allModels, selectedModels, filteredData, getBenchmarkKey, theme,
        isZoomEnabled, setIsZoomEnabled, zoomDomain, setZoomDomain, chartContainerRef,
        isDragging, setIsDragging, lastMouseRef, chartColorMode, setChartColorMode,
        metricAvailability, filteredBySource, xAxisMax, setXAxisMax,
        isLogScaleX, setIsLogScaleX, setLatType, selectedBenchmarks,
        baselineBenchmarkKey
    } = props;

    // We can infer canShowPerChip
    const [internalLineConnectMode, setInternalLineConnectMode] = React.useState('stage');
    const lineConnectMode = props.lineConnectMode ?? internalLineConnectMode;
    const setLineConnectMode = props.setLineConnectMode ?? setInternalLineConnectMode;

    const [showFilters, setShowFilters] = React.useState(false);
    const localContainerRef = React.useRef(null);
    const containerRef = chartContainerRef || localContainerRef;
    const [pinnedPopover, setPinnedPopover] = React.useState(null);
    const [hoveredPointCoord, setHoveredPointCoord] = React.useState(null);
    const pinnedPopoverRef = React.useRef(null);

    const handlePointClick = (e, payloadInfo, benchmarkKey, color, currentXLabel, currentYLabel, chartId) => {
        if (e && e.stopPropagation) {
            e.stopPropagation();
        }
        const d = payloadInfo?.payload;
        if (!d) return;

        const cx = payloadInfo?.cx ?? 0;
        const cy = payloadInfo?.cy ?? 0;
        const pointColor = color || payloadInfo?.fill || payloadInfo?.stroke || '#38bdf8';
        const containerWidth = containerRef.current?.offsetWidth || 800;

        setPinnedPopover({
            d,
            payload: [{ payload: d, color: pointColor, value: d.vy ?? payloadInfo?.value }],
            label: d.vx ?? d.time_per_output_token,
            xLabel: currentXLabel,
            yLabel: currentYLabel,
            coordinate: { x: cx, y: cy },
            containerWidth,
            chartId
        });
    };

    const isPointPinned = (d, key, chartId) => {
        if (!pinnedPopover || pinnedPopover.chartId !== chartId || !pinnedPopover.d) return false;
        const p = pinnedPopover.d;
        if (p === d) return true;
        return (
            p.vx === d.vx &&
            p.vy === d.vy &&
            (p.benchmarkKey || p.model) === (d.benchmarkKey || key || d.model)
        );
    };

    const renderCustomDot = (dotProps, benchmarkKey, color, currentXLabel, currentYLabel, chartId, isBaseline) => {
        const { cx, cy, payload: d, key } = dotProps;
        if (cx == null || cy == null || !d) return null;

        const isPinned = isPointPinned(d, benchmarkKey, chartId);

        if (isPinned) {
            if (isBaseline) {
                const r = 7.5;
                const points = [];
                for (let i = 0; i < 10; i++) {
                    const angle = (Math.PI / 5) * i - Math.PI / 2;
                    const radius = i % 2 === 0 ? r : r / 2.4;
                    points.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
                }
                return (
                    <g key={key} style={{ cursor: 'pointer' }} onClick={(e) => handlePointClick(e, dotProps, benchmarkKey, color, currentXLabel, currentYLabel, chartId)}>
                        <circle cx={cx} cy={cy} r={11} fill="#ef4444" fillOpacity={0.35} />
                        <polygon
                            points={points.join(' ')}
                            fill="#ef4444"
                            stroke="#ffffff"
                            strokeWidth={1.8}
                        />
                    </g>
                );
            }

            return (
                <g key={key} style={{ cursor: 'pointer' }} onClick={(e) => handlePointClick(e, dotProps, benchmarkKey, color, currentXLabel, currentYLabel, chartId)}>
                    <circle cx={cx} cy={cy} r={9} fill="#ef4444" fillOpacity={0.35} />
                    <circle cx={cx} cy={cy} r={6} fill="#ef4444" stroke="#ffffff" strokeWidth={2} />
                </g>
            );
        }

        if (isBaseline) {
            const r = 6.5;
            const points = [];
            for (let i = 0; i < 10; i++) {
                const angle = (Math.PI / 5) * i - Math.PI / 2;
                const radius = i % 2 === 0 ? r : r / 2.4;
                points.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
            }
            return (
                <polygon
                    key={key}
                    points={points.join(' ')}
                    fill={color}
                    stroke={theme === 'dark' ? '#0f172a' : '#ffffff'}
                    strokeWidth={1.2}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => handlePointClick(e, dotProps, benchmarkKey, color, currentXLabel, currentYLabel, chartId)}
                />
            );
        }

        if (showDataLabels) {
            return (
                <circle
                    key={key}
                    cx={cx}
                    cy={cy}
                    r={3.5}
                    fill={color}
                    strokeWidth={0}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => handlePointClick(e, dotProps, benchmarkKey, color, currentXLabel, currentYLabel, chartId)}
                />
            );
        }

        return (
            <circle
                key={key}
                cx={cx}
                cy={cy}
                r={4}
                fill={color}
                fillOpacity={0.45}
                stroke={color}
                strokeWidth={1}
                style={{ cursor: 'pointer' }}
                onClick={(e) => handlePointClick(e, dotProps, benchmarkKey, color, currentXLabel, currentYLabel, chartId)}
            />
        );
    };

    const renderActiveDot = (props, benchmarkKey, color, currentXLabel, currentYLabel, chartId) => {
        const { cx, cy, payload: d, key } = props;
        if (cx == null || cy == null || !d) return null;

        if (hoveredPointCoord?.x !== cx || hoveredPointCoord?.y !== cy || hoveredPointCoord?.chartId !== chartId) {
            setHoveredPointCoord({ x: cx, y: cy, chartId });
        }

        const isPinned = isPointPinned(d, benchmarkKey, chartId);

        if (pinnedPopover && pinnedPopover.chartId === chartId) {
            if (isPinned) {
                return (
                    <g key={key} style={{ cursor: 'pointer' }} onClick={(e) => handlePointClick(e, props, benchmarkKey, color, currentXLabel, currentYLabel, chartId)}>
                        <circle cx={cx} cy={cy} r={9} fill="#ef4444" fillOpacity={0.35} />
                        <circle cx={cx} cy={cy} r={6} fill="#ef4444" stroke="#ffffff" strokeWidth={2} />
                    </g>
                );
            }
            return (
                <circle
                    key={key}
                    cx={cx}
                    cy={cy}
                    r={5}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => handlePointClick(e, props, benchmarkKey, color, currentXLabel, currentYLabel, chartId)}
                />
            );
        }

        return (
            <circle
                key={key}
                cx={cx}
                cy={cy}
                r={6}
                fill="#ef4444"
                stroke="#ffffff"
                strokeWidth={2}
                style={{ cursor: 'pointer' }}
                onClick={(e) => handlePointClick(e, props, benchmarkKey, color, currentXLabel, currentYLabel, chartId)}
            />
        );
    };

    React.useEffect(() => {
        if (!pinnedPopover) return;

        const handleClickOutside = (event) => {
            if (pinnedPopoverRef.current && pinnedPopoverRef.current.contains(event.target)) {
                return;
            }
            if (event.target.closest && event.target.closest('.recharts-active-dot, .recharts-dot, svg circle, svg polygon, svg path')) {
                return;
            }
            setPinnedPopover(null);
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setPinnedPopover(null);
            }
        };

        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('click', handleClickOutside);
            document.addEventListener('keydown', handleKeyDown);
        }, 0);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('click', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [pinnedPopover]);

    const validData = filteredBySource.filter(d => selectedModels.has(d.model));
    const canShowPerChip = validData.every(d => d.accelerator_count > 0);

    return (
      <div className="grid grid-cols-1 gap-4 mb-4">
        {(() => {
            // Determine Y-Axis based on Tput Type
            let yKey = 'throughput';
            let yLabel = 'Output Tokens/sec';
            
            // Priority selection for Y-Axis
            if (tputType === 'stage') {
                yKey = 'stage';
                yLabel = 'Stage';
            } else if (tputType === 'quality') {
                if (yQualityMode === 'mmlu_pro') {
                    yKey = 'quality.mmlu_pro';
                    yLabel = 'MMLU-Pro (%)';
                } else if (yQualityMode === 'arena_score_text') {
                    yKey = 'quality.arena';
                    yLabel = 'Arena Score (Text)';
                } else if (yQualityMode === 'live_code_bench') {
                    yKey = 'quality.live_code_bench';
                    yLabel = 'LiveCodeBench (%)';
                }
            } else if (tputType === 'input') {
                yKey = 'metrics.input_tput';
                yLabel = 'Input Tokens/sec';
            } else if (tputType === 'total') {
                yKey = 'metrics.total_tput';
                yLabel = 'Total Tokens/sec';
            } else if (tputType === 'qps') {
                yKey = 'metrics.request_rate';
                yLabel = 'Queries Per Second (QPS)';
            } else if (tputType === 'cost') {
                yKey = `metrics.cost.${costMode}`;
                yLabel = `Cost ($/1M Tokens) - ${costMode.replace('_', ' ').toUpperCase()}`;
            }

            // Compatibility fix if coming from old URL
            if (tputType === 'mmlu' || tputType === 'arena') {
                setTputType('quality');
                setYQualityMode(tputType === 'mmlu' ? 'mmlu_pro' : 'arena_score_text');
            }
            if (chartMode === 'mmlu' || chartMode === 'arena') {
                setChartMode('quality');
                setXQualityMode(chartMode === 'mmlu' ? 'mmlu_pro' : 'arena_score_text');
            }
            
            if (tputType !== 'cost' && tputType !== 'quality' && tputType !== 'stage' && showPerChip) yLabel += ' per Chip';

            // Determine X-Axis based on Chart Mode
            let xKey = "time_per_output_token";
            let xLabel = "Time Per Output Token (ms)";
            
            if (chartMode === 'stage') {
                xKey = 'stage';
                xLabel = 'Stage';
            } else if (chartMode === 'quality') {
                if (xQualityMode === 'mmlu_pro') {
                    xKey = 'quality.mmlu_pro';
                    xLabel = 'MMLU-Pro (%)';
                } else if (xQualityMode === 'arena_score_text') {
                    xKey = 'quality.arena';
                    xLabel = 'Arena Score (Text)';
                } else if (xQualityMode === 'live_code_bench') {
                    xKey = 'quality.live_code_bench';
                    xLabel = 'LiveCodeBench (%)';
                }
            } else if (chartMode === 'ntpot') {
                xKey = 'metrics.ntpot';
                xLabel = 'Normalized TPOT (ms)';
            } else if (chartMode === 'ttft') {
                xKey = 'metrics.ttft.mean';
                xLabel = 'Mean TTFT (ms)';
            } else if (chartMode === 'itl') {
                xKey = 'metrics.itl';
                xLabel = 'Inter-Token Latency (ms)';
            } else if (chartMode === 'tokens_per_sec') {
                xKey = 'tokens_per_second';
                xLabel = 'Throughput (Tokens/sec)';
            } else if (chartMode === 'lat') {
                xKey = 'metrics.e2e_latency';
                xLabel = 'E2E Latency (ms)';
            }
            // 1. Calculate Data Bounds
            const getVal = (obj, key) => {
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
                if (key.startsWith('quality.')) {
                    const normModel = normalizeQualityModelName(obj.model);
                    if (!qualityMetrics?.data?.[normModel]) return undefined;
                    const qData = qualityMetrics.data[normModel];
                    if (key === 'quality.mmlu_pro') return qData.mmlu_pro;
                    if (key === 'quality.arena') return qData.arena_score_text;
                    if (key === 'quality.arena_code') return qData.arena_score_code;
                    if (key === 'quality.live_code_bench') return qData.live_code_bench;
                }
                return key.split('.').reduce((o, i) => o?.[i], obj);
            };

            // Filter Function Builder
            // Allow 0 for valid baseline/stage-0 metrics (e.g. 0 QPS or 0 ms) while excluding missing/null/negative data
            const createFilter = (xKey) => (d) => {
                 const rawX = getVal(d, xKey);
                 const rawY = getVal(d, yKey);
                 const isStageZero = d.workload?.stage === 0 || d.prism_stage_index === 0 || d.stageIndex === 0 || d.stage === 0 || d.metadata?.stage_index === 0;
                 const valX = rawX ?? (isStageZero ? 0 : null);
                 const valY = rawY ?? (isStageZero ? 0 : null);
                 if (valX === null || valX === undefined || valY === null || valY === undefined) return false;
                 const xVal = Number(valX);
                 const yVal = Number(valY);
                 return !isNaN(xVal) && xVal >= 0 && !isNaN(yVal) && yVal >= 0;
            };

            const isBarMode = chartMode === 'stage' || tputType === 'stage';
            const isVerticalLayout = tputType === 'stage';

            let filterFn = createFilter(xKey);

            if (chartMode === 'lat') {
                xKey = "metrics.e2e_latency";
                xLabel = "E2E Latency (ms)";
                filterFn = createFilter(xKey);
            } else if (chartMode === 'ntpot') {
                xKey = "metrics.ntpot";
                xLabel = "Normalized TPOT (ms)";
                filterFn = createFilter(xKey);
            } else if (chartMode === 'ttft') {
                xKey = "metrics.ttft.mean";
                xLabel = "Time To First Token (ms)";
                filterFn = createFilter(xKey);
            } else if (chartMode === 'itl') {
                xKey = "metrics.itl";
                xLabel = "Inter Token Latency (ms)";
                filterFn = createFilter(xKey);
            } else if (chartMode === 'tokens_per_sec') {
                xKey = "tokens_per_second";
                xLabel = "Tokens / Sec (1 / ITL)";
                filterFn = createFilter(xKey);
            } else if (chartMode === 'mmlu') {
                xKey = "quality.mmlu_pro";
                xLabel = "MMLU-Pro (%)";
                filterFn = createFilter(xKey);
            } else if (chartMode === 'arena') {
                xKey = "quality.arena";
                xLabel = "Arena Score (Text)";
                filterFn = createFilter(xKey);
            } else if (chartMode === 'stage') {
                xKey = "stage";
                xLabel = "Stage";
                filterFn = createFilter(xKey);
            }

            const chartTitle = isBarMode
                ? (isVerticalLayout ? `${xLabel} by Stage` : `${yLabel} by Stage`)
                : `${yLabel.replace(' per Chip', '')} vs ${xLabel.replace(' (ms)', '')}`;

            const config = {
                title: chartTitle,
                xKey,
                xLabel,
                yKey,
                yLabel,
                filterFn
            };

            // 1. Calculate Data Bounds (getVal already defined above)
            const { visibleDataPoints, uniqueBenchmarks, baselineSeries, paretoData, autoX, autoY, barChartData } = useMemo(() => {
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                const visibleDataPoints = []; // Flattened
                
                filteredData.forEach(d => {
                    if (config.filterFn(d)) {
                        const vx = Number(getVal(d, config.xKey));
                        const vy = Number(getVal(d, config.yKey));
                        if (!isNaN(vx) && !isNaN(vy)) {
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
                     const minimizeX = true;
                     paretoData = getParetoFrontier(visibleDataPoints, minimizeX, maximizeY);
                }

                if (minX === Infinity) { minX=0; maxX=100; minY=0; maxY=100; }
                
                const xPad = (maxX - minX) * 0.05 || (isLogScaleX ? minX*0.1 : 1);
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
                        if (!selectedBenchmarks.has(benchmarkKey)) return;

                        const rawMetric = getVal(d, metricKey);
                        if (rawMetric === null || rawMetric === undefined) return;
                        let numVal = Number(rawMetric);
                        if (isNaN(numVal) || numVal < 0) return;

                        if (!isVerticalLayout && showPerChip && tputType !== 'cost' && tputType !== 'quality' && tputType !== 'stage' && d.accelerator_count > 0) {
                            numVal = numVal / d.accelerator_count;
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
                            if (!selectedBenchmarks.has(benchmarkKey)) return;
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
            }, [filteredData, config, getBenchmarkKey, baselineBenchmarkKey, showPareto, tputType, isLogScaleX, xAxisMax, isBarMode, isVerticalLayout, selectedBenchmarks, showPerChip]);

            const curX = zoomDomain?.x || autoX;
            const curY = zoomDomain?.y || autoY;

            // 2. Interaction Handlers
            const handleWheel = (e) => {
                if (!isZoomEnabled || !chartContainerRef.current) return;
                e.preventDefault();
                
                const { left, top, width, height } = chartContainerRef.current.getBoundingClientRect();
                const chartMargin = { left: 60, right: 30, top: 45, bottom: 45 };
                const chartWidth = width - chartMargin.left - chartMargin.right;
                const chartHeight = height - chartMargin.top - chartMargin.bottom;

                if (chartWidth <= 0 || chartHeight <= 0) return;

                // Mouse relative to chart area (0..1)
                const mx = Math.min(Math.max((e.clientX - left - chartMargin.left) / chartWidth, 0), 1);
                const my = Math.min(Math.max((e.clientY - top - chartMargin.top) / chartHeight, 0), 1);
                
                // Invert Y because SVG Y is top-down but chart value Y is bottom-up
                const myValRatio = 1 - my;

                const scale = e.deltaY > 0 ? 1.1 : 0.9; // Zoom out / in

                const xLen = curX[1] - curX[0];
                const yLen = curY[1] - curY[0];
                
                // Focus point value
                const focusX = curX[0] + mx * xLen;
                const focusY = curY[0] + myValRatio * yLen;
                
                const newXLen = xLen * scale;
                const newYLen = yLen * scale;

                let newX = [focusX - mx * newXLen, focusX + (1 - mx) * newXLen];
                let newY = [focusY - myValRatio * newYLen, focusY + (1 - myValRatio) * newYLen];
                
                // Clamp to 0
                if (newX[0] < 0) newX = [0, newX[1] - newX[0]]; // Maintain zoom scale but strict 0
                if (newY[0] < 0) newY = [0, newY[1] - newY[0]];
                
                setZoomDomain({ x: newX, y: newY });
            };

            const handleMouseDown = (e) => {
                if (!isZoomEnabled) return;
                e.preventDefault(); // Stop text selection
                setIsDragging(true);
                lastMouseRef.current = { x: e.clientX, y: e.clientY };
            };

            const handleMouseMove = (e) => {
                if (!isZoomEnabled || !isDragging || !lastMouseRef.current || !chartContainerRef.current) return;
                e.preventDefault();

                const { width, height } = chartContainerRef.current.getBoundingClientRect();
                const chartMargin = { left: 60, right: 30, top: 45, bottom: 45 };
                const chartWidth = width - chartMargin.left - chartMargin.right;
                const chartHeight = height - chartMargin.top - chartMargin.bottom;
                
                const dxPx = e.clientX - lastMouseRef.current.x;
                const dyPx = e.clientY - lastMouseRef.current.y;
                
                lastMouseRef.current = { x: e.clientX, y: e.clientY };

                const xLen = curX[1] - curX[0];
                const yLen = curY[1] - curY[0];
                
                const dxVal = -(dxPx / chartWidth) * xLen;
                const dyVal = (dyPx / chartHeight) * yLen; // Y is inverted in pixels

                let newX0 = curX[0] + dxVal;
                let newX1 = curX[1] + dxVal;
                
                let newY0 = curY[0] + dyVal;
                let newY1 = curY[1] + dyVal;

                // Stop at 0
                if (newX0 < 0) {
                    newX1 = newX1 - newX0;
                    newX0 = 0;
                }
                if (newY0 < 0) {
                    newY1 = newY1 - newY0;
                    newY0 = 0;
                }

                setZoomDomain({
                    x: [newX0, newX1],
                    y: [newY0, newY1]
                });
            };

            const handleMouseUp = () => {
                setIsDragging(false);
                lastMouseRef.current = null;
            };

            // 3. Color Logic (Spectrum)
            // Pre-defined categorical palettes (array of lightness-varied color series)
            const categoricalPalettes = [
                 ['#3b82f6', '#60a5fa', '#93c5fd', '#2563eb', '#1d4ed8'], // Blue
                 ['#ef4444', '#f87171', '#fca5a5', '#dc2626', '#b91c1c'], // Red
                 ['#10b981', '#34d399', '#6ee7b7', '#059669', '#047857'], // Emerald
                 ['#f59e0b', '#fbbf24', '#fcd34d', '#d97706', '#b45309'], // Amber
                 ['#8b5cf6', '#a78bfa', '#c4b5fd', '#7c3aed', '#6d28d9'], // Violet
                 ['#ec4899', '#f472b6', '#fbcfe8', '#db2777', '#be185d'], // Pink
                 ['#06b6d4', '#22d3ee', '#67e8f9', '#0891b2', '#155e75'], // Cyan
                 ['#84cc16', '#a3e635', '#bef264', '#65a30d', '#4d7c0f'], // Lime
                 ['#6366f1', '#818cf8', '#a5b4fc', '#4f46e5', '#4338ca'], // Indigo
                 ['#14b8a6', '#5eead4', '#99f6e4', '#0d9488', '#0f766e'], // Teal
            ];

            const modelColorMap = new Map();
            const benchmarkColorMap = new Map();
            const colorGroups = {}; // groupKey -> [benchmarkKeys]
            const groupLabels = {}; // groupKey -> Label String
            const hwCanonicalMap = {}; // lowercase -> first-seen hardware name
            
            // Group benchmarks
            uniqueBenchmarks.forEach(benchmarkKey => {
                const bData = visibleDataPoints.filter(d => d.benchmarkKey === benchmarkKey);
                if (!bData.length) return;
                
                const sample = bData[0];
                let groupKey = 'Unknown Hardware';
                let groupLabel = 'Unknown Hardware';

                if (chartColorMode === 'hardware') {
                     const candidates = [
                        sample.metadata?.hardware,
                        sample.hardware,
                        sample.metadata?.machine_type,
                        sample.machine_type
                     ].filter(val => val && val !== 'Unknown' && val !== 'Unknown Hardware' && String(val).trim() !== '');

                     if (candidates.length > 0) {
                         const rawHw = String(candidates[0]).trim();
                         const lower = rawHw.toLowerCase();
                         if (!hwCanonicalMap[lower]) {
                             hwCanonicalMap[lower] = rawHw;
                         }
                         groupKey = hwCanonicalMap[lower];
                         groupLabel = groupKey;
                     } else {
                         groupKey = 'Unknown Hardware';
                         groupLabel = 'Unknown Hardware';
                     }

                 } else if (chartColorMode === 'model') {
                    // Group by clean model name, but use full model string for groupKey to keep individual colors if desired
                    // Actually, if user wants it by Model, we should group by model_name
                    groupKey = sample.metadata?.model_name || sample.model || 'Unknown';
                    groupLabel = groupKey;

                } else if (chartColorMode === 'node_config') {
                    // Optimized: Use pre-computed configuration string if available (matches chart labels)
                    if (sample.metadata?.configuration && sample.metadata.configuration !== 'Unknown') {
                        groupKey = sample.metadata.configuration;
                    } else if (sample.configuration && sample.configuration !== 'Unknown') {
                         groupKey = sample.configuration;
                    } else {
                        // Fallback: Reconstruct from metadata (legacy/raw data)
                        const tp = getEffectiveTp(sample);
                        const isDisaggregated = sample.metadata?.roles;
                        let numNodes = sample.num_nodes || 1;
                        
                        if (isDisaggregated) {
                            try {
                                const prefill = sample.metadata.roles.find(r => r.type === 'prefill');
                                const decode = sample.metadata.roles.find(r => r.type === 'decode');
                                const pNodes = prefill?.count || 0;
                                const dNodes = decode?.count || 0;
                                const pTp = prefill?.tp ? `TP${prefill.tp}` : (tp || '');
                                const dTp = decode?.tp ? `TP${decode.tp}` : (tp || '');
                                
                                // Normalize to "Nodes: ..." format
                                groupKey = `Nodes: ${pNodes}P-${pTp} ${dNodes}D-${dTp}`;
                            } catch {
                                 groupKey = `${numNodes} Disagg`;
                            }
                        } else {
                            // Aggregated
                            // Normalize to "Nodes: ..." format
                            groupKey = `Nodes: ${numNodes} ${tp || ''}`.trim();
                        }
                    }
                    groupLabel = groupKey;
                }

                if (!colorGroups[groupKey]) colorGroups[groupKey] = [];
                colorGroups[groupKey].push(benchmarkKey);
                groupLabels[groupKey] = groupLabel;
            });

            // Assign Colors
            // Cycle through categoricalPalettes dynamically using modulo on sorted group keys
            
            // Stable sort keys to ensure color stability
            const sortedGroupKeys = Object.keys(colorGroups).sort((a, b) => {
                if (chartColorMode === 'node_config') {
                    // Helper to parse total node count from string
                    const getNodesAndType = (s) => {
                        // Pattern 1: Disaggregated "4: 1P-TP4 3D-TP4"
                        // New format includes total nodes at the start
                        const disaggMatch = s.match(/^(\d+):\s+/);
                        if (disaggMatch) {
                            return { nodes: parseInt(disaggMatch[1]), type: 'disaggregated' };
                        }
                        
                        // Legacy Disaggregated (just in case): "1P-TP4 3D-TP4"
                        const legacyDisagg = s.match(/(\d+)P(?:-TP\d+)?\s+(\d+)D(?:-TP\d+)?/);
                        if (legacyDisagg) {
                             return { nodes: parseInt(legacyDisagg[1]) + parseInt(legacyDisagg[2]), type: 'disaggregated' };
                        }
                        
                        // Pattern 2: Aggregated "1 TP8" or "1"
                        const aggMatch = s.match(/^(\d+)/);
                        if (aggMatch) {
                            return { nodes: parseInt(aggMatch[1]), type: 'aggregated' };
                        }
                        
                        // Fallback
                        return { nodes: 0, type: 'unknown' };
                    };
                    
                    const aInfo = getNodesAndType(a);
                    const bInfo = getNodesAndType(b);
                    
                    // 1. Sort by Total Node Count (Ascending)
                    if (aInfo.nodes !== bInfo.nodes) {
                        return aInfo.nodes - bInfo.nodes;
                    }
                    
                    // 2. Tie-breaker: Aggregated before Disaggregated
                    if (aInfo.type !== bInfo.type) {
                        if (aInfo.type === 'aggregated') return -1;
                        if (bInfo.type === 'aggregated') return 1;
                    }
                    
                    // 3. Final Tie-breaker: Alphabetical
                    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
                }

                if (chartColorMode === 'hardware') {
                    if (a === 'Unknown Hardware' || a === 'Unknown') return 1;
                    if (b === 'Unknown Hardware' || b === 'Unknown') return -1;
                }
                
                // Default alphabetical sort for other modes
                return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
            });
            
            sortedGroupKeys.forEach((key, groupIndex) => {
                const palette = categoricalPalettes[groupIndex % categoricalPalettes.length];

                colorGroups[key].forEach((benchmarkKey, i) => {
                    const color = palette[i % palette.length];
                    benchmarkColorMap.set(benchmarkKey, color);
                    const sample = visibleDataPoints.find(d => d.benchmarkKey === benchmarkKey);
                    if (sample) modelColorMap.set(sample.model, color);
                });
            });

            // 4. Smart Label Generation
            // -------------------------
            const smartLabels = {};
            
            if (uniqueBenchmarks.length > 0) {
                 // 1. Gather Attributes
                 const attrs = uniqueBenchmarks.map(bk => {
                     const sample = visibleDataPoints.find(d => d.benchmarkKey === bk);
                     if (!sample) return { id: bk, family: 'Unknown', parts: {} };
                     
                     // Helper to clean TP
                     let tp = sample.metadata?.tensor_parallelism || sample.metadata?.tp || '';
                     if (tp && !String(tp).startsWith('TP')) tp = `TP${tp}`;

                     const isl = sample.metadata?.input_seq_len || sample.isl;
                     const osl = sample.metadata?.output_seq_len || sample.osl;
                     const workload = (isl && osl) ? `${getBucket(isl)}/${getBucket(osl)}` : '';
                     
                     // Extract filename if LPG
                     let filename = '';
                     if (bk.startsWith('inference-perf:')) {
                         filename = bk.replace('inference-perf:', '').replace(/\.[^.]+$/, '');
                     }

                     return {
                         id: bk,
                         family: sample.metadata?.model_name || sample.model || 'Unknown',
                         hardware: sample.metadata?.hardware || 'Unknown',
                         precision: sample.metadata?.precision || 'Unknown',
                         tp: tp,
                         configuration: sample.metadata?.configuration || '',
                         variant: sample.metadata?.variant || '',
                         workload: workload,
                         backend: sample.metadata?.backend || sample.source || '',
                         filename: filename
                     };
                 });

                 // 2. Find Constants (only if we have multiple lines)
                 const isConst = (key) => {
                     if (uniqueBenchmarks.length < 2) return false; // Show full details if single line
                     const first = attrs[0][key];
                     return attrs.every(a => a[key] === first);
                 };
                 
                 const constFamily = isConst('family');
                 const constHw = isConst('hardware');
                 const constPrec = isConst('precision');
                 const constTp = isConst('tp');
                 const constConfiguration = isConst('configuration');
                 const constVariant = isConst('variant');
                 const constWorkload = isConst('workload');
                 // For backend, if it's constant OR if it's 'lpg', we might want to hide it if explicit filenames are used?
                 // Let's stick to standard diff logic
                 const constBackend = isConst('backend');
                 // const constFilename = isConst('filename');
                 
                 // 3. Build Labels
                 // First pass: Build core labels without source/filename info
                 const coreLabels = new Map(); // id -> label string
                 const labelCounts = new Map(); // label string -> count

                 const variantsById = new Map();
                 attrs.forEach(a => {
                     const variants = [];
                     const hasConfig = !constConfiguration && a.configuration && a.configuration !== 'Unknown';
                     if (hasConfig) variants.push(a.configuration);

                     if (!constVariant && a.variant) {
                         // The segments are joined into one outer [...], and the family may
                         // already carry the variant from useDashboardData.
                         const rest = stripExperimentIdSuffix(stripModelPrefix(a.variant, a.family)).replace(/^\[(.*)\]$/, '$1');
                         if (rest && !a.family.endsWith(`[${rest}]`)) variants.push(rest);
                     }

                     if (!constHw && a.hardware !== 'Unknown') variants.push(a.hardware);
                     if (!constPrec && a.precision !== 'Unknown') variants.push(a.precision);

                     // Don't show generic TP if we already showed a configuration (which includes TP info)
                     if (!hasConfig && !constTp && a.tp) variants.push(a.tp);

                     if (!constWorkload && a.workload) variants.push(a.workload);
                     
                     variantsById.set(a.id, variants);
                 });

                 // A series whose variants all collapse to nothing would fall back to the
                 // family alone, reading as a different kind of label than its siblings.
                 const everyHasVariants = attrs.every(a => variantsById.get(a.id).length > 0);

                 attrs.forEach(a => {
                     const parts = [];

                     // Show Model Name (family) ONLY if:
                     // 1. It differs across benchmarks (!constFamily)
                     // 2. OR there is only one benchmark total (so the user knows what they are looking at)
                     if (!constFamily || uniqueBenchmarks.length === 1 || !everyHasVariants) {
                        parts.push(a.family);
                     }

                     const variants = variantsById.get(a.id);
                     if (variants.length > 0) {
                         parts.push(`[${variants.join(', ')}]`);
                     }

                     const label = parts.join(' ');
                     coreLabels.set(a.id, label);
                     labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
                 });

                 // Second pass: Finalize labels, adding source only if ambiguous
                 attrs.forEach(a => {
                     let label = coreLabels.get(a.id);
                     const isAmbiguous = labelCounts.get(label) > 1;

                     // Fallback check: if label is empty (e.g. constant family and no variants), it's ambiguous by definition relative to "nothing"
                     if (!label || label === '()' || label === '') {
                        label = a.family; 
                         // Check ambiguity again with family included if it wasn't before
                         // (Actually, logic above ensures family is included if not constant, or if single line. 
                         // If family IS constant and we have >1 lines, empty variants implies they are identical clones)
                     }

                     if (isAmbiguous) {
                         // Must verify if filename/backend actually helps differentiate
                         if (a.filename) {
                             label += ` (${a.filename})`;
                         } else if (!constBackend && a.backend && a.backend !== 'Unknown') {
                             label += ` (${a.backend})`;
                         }
                     }
                     
                     smartLabels[a.id] = label;
                 });
            }

            if (theme === 'dark') {
                const rawDataMax = validData.length > 0 ? Math.max(...validData.map(d => Number(getVal(d, xKey)) || 0)) : (Math.max(...filteredBySource.map(d => Number(getVal(d, xKey)) || 0)) || 100);
                const dataMax = Math.ceil(rawDataMax * 1.2);
                const step = Math.max(0.01, dataMax / 100);
                const currentMax = xAxisMax === Infinity ? dataMax : xAxisMax;

                const switchMode = (mode) => {
                    if (mode === 'stage' && tputType === 'stage') {
                        setTputType('output');
                    }
                    setChartMode(mode);
                    setXAxisMax(Infinity);
                    setZoomDomain(null);
                };

                const switchTput = (type) => {
                    if (type === 'stage' && chartMode === 'stage') {
                        setChartMode('tpot');
                    }
                    setTputType(type);
                    setXAxisMax(Infinity);
                    setZoomDomain(null);
                };

                return (
                    <div className="bg-slate-900/80 border border-slate-700/60 rounded-2xl shadow-2xl flex flex-col w-full min-h-[495px] overflow-visible backdrop-blur-sm relative">
                        <div className="flex flex-col w-full h-full">
                            {/* Drawer Chart Header */}
                            <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/85 flex justify-between items-center gap-6 shadow-sm rounded-t-2xl">
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-base font-bold text-white font-mono">
                                        {chartTitle}
                                    </h3>
                                    <div className="text-[10px] text-slate-500 font-medium font-sans">
                                        Toggle axis dimensions, normalizations and filters below
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <LineConnectPopover lineConnectMode={lineConnectMode} setLineConnectMode={setLineConnectMode} />
                                    <button 
                                        onClick={() => setShowFilters(!showFilters)} 
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded-lg transition-all text-[10px] font-extrabold uppercase tracking-wider border border-slate-800 hover:border-slate-700"
                                    >
                                        Filters
                                        {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            </div>

                            {/* Drawer Expandable Filter Panel */}
                            {showFilters && (
                                <div className="bg-slate-900/90 border-b border-slate-800 px-6 py-4 grid grid-cols-1 lg:grid-cols-2 gap-6 items-center animate-fadeIn">
                                    <div className="flex flex-col gap-3.5">
                                        {/* X-Axis Group */}
                                        <div className="flex items-center gap-3">
                                             <span className="text-[10px] text-slate-450 font-extrabold uppercase tracking-wider w-16">X-Axis:</span>
                                             <div className="flex flex-wrap bg-slate-950/60 border border-slate-800/80 rounded-lg p-0.5 gap-0.5">
                                                 <button onClick={() => switchMode('tpot')} className={cn('px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider rounded-md transition-all', chartMode === 'tpot' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white')}>TPOT</button>
                                                 <button onClick={() => switchMode('ntpot')} className={cn('px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider rounded-md transition-all', chartMode === 'ntpot' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white')}>NTPOT</button>
                                                 <button onClick={() => switchMode('ttft')} className={cn('px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider rounded-md transition-all', chartMode === 'ttft' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white')}>TTFT</button>
                                                 <button onClick={() => switchMode('itl')} className={cn('px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider rounded-md transition-all', chartMode === 'itl' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white')}>ITL</button>
                                                 <button onClick={() => switchMode('lat')} className={cn('px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider rounded-md transition-all', chartMode === 'lat' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white')}>E2E Latency</button>
                                                 <button onClick={() => switchMode('stage')} className={cn('px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider rounded-md transition-all', chartMode === 'stage' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white')}>Stage</button>
                                             </div>
                                         </div>

                                        {/* Y-Axis Group */}
                                        <div className="flex items-center gap-3">
                                             <span className="text-[10px] text-slate-450 font-extrabold uppercase tracking-wider w-16">Y-Axis:</span>
                                             <div className="flex flex-wrap bg-slate-950/60 border border-slate-800/80 rounded-lg p-0.5 gap-0.5">
                                                 <button onClick={() => switchTput('output')} className={cn('px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider rounded-md transition-all', tputType === 'output' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white')}>Output</button>
                                                 <button onClick={() => metricAvailability?.input !== false && switchTput('input')} disabled={metricAvailability?.input === false} className={cn('px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider rounded-md transition-all', metricAvailability?.input === false ? 'text-slate-700 cursor-not-allowed opacity-40' : tputType === 'input' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white')}>Input</button>
                                                 <button onClick={() => metricAvailability?.total !== false && switchTput('total')} disabled={metricAvailability?.total === false} className={cn('px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider rounded-md transition-all', metricAvailability?.total === false ? 'text-slate-700 cursor-not-allowed opacity-40' : tputType === 'total' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white')}>Total</button>
                                                 <button onClick={() => metricAvailability?.qps !== false && switchTput('qps')} disabled={metricAvailability?.qps === false} className={cn('px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider rounded-md transition-all', metricAvailability?.qps === false ? 'text-slate-700 cursor-not-allowed opacity-40' : tputType === 'qps' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white')}>QPS</button>
                                                 <button onClick={() => metricAvailability?.cost !== false && switchTput('cost')} disabled={metricAvailability?.cost === false} className={cn('px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider rounded-md transition-all', metricAvailability?.cost === false ? 'text-slate-700 cursor-not-allowed opacity-40' : tputType === 'cost' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white')}>Cost</button>
                                                 <button onClick={() => switchTput('stage')} className={cn('px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider rounded-md transition-all', tputType === 'stage' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white')}>Stage</button>
                                             </div>
                                             {tputType === 'cost' && (
                                                 <select 
                                                     value={costMode} 
                                                     onChange={(e) => setCostMode(e.target.value)}
                                                     className="bg-slate-950 border border-slate-800 rounded-md text-[10px] px-2 py-1 text-slate-350 outline-none focus:border-cyan-500 font-mono"
                                                 >
                                                     <option value="spot">Spot</option>
                                                     <option value="on_demand">On Demand</option>
                                                     <option value="cud_1y">CUD 1y</option>
                                                     <option value="cud_3y">CUD 3y</option>
                                                 </select>
                                             )}
                                         </div>
                                    </div>

                                    <div className="flex flex-col gap-3.5 lg:items-end w-full">
                                         <div className="flex flex-wrap items-center gap-3 justify-start lg:justify-end w-full">
                                             {/* Normalization & Scale Options */}
                                             <div className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-800/80 rounded-lg p-0.5">
                                                 <button onClick={() => setIsLogScaleX(!isLogScaleX)} className={cn('px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider rounded-md transition-all', isLogScaleX ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white')}>Log Scale</button>
                                                 <div className="h-3 w-px bg-slate-850" />
                                                 <button onClick={() => canShowPerChip && setShowPerChip(!showPerChip)} disabled={!canShowPerChip} className={cn('px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider rounded-md transition-all', !canShowPerChip ? 'text-slate-700 cursor-not-allowed opacity-40' : showPerChip ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white')} title="Normalize per chip">Per Chip</button>
                                             </div>

                                             {/* Visual Toggles Group */}
                                             <div className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-800/80 rounded-lg p-0.5">
                                                 <button onClick={() => setShowLabels(!showLabels)} className={cn('px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider rounded-md transition-all', showLabels ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white')}>Labels</button>
                                                 <button onClick={() => setShowDataLabels(!showDataLabels)} className={cn('px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider rounded-md transition-all', showDataLabels ? 'bg-pink-600 text-white shadow' : 'text-slate-400 hover:text-white')}>Points</button>
                                                 <button onClick={() => setShowPareto(!showPareto)} className={cn('px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider rounded-md transition-all', showPareto ? 'bg-amber-500 text-white shadow' : 'text-slate-400 hover:text-white')}>Pareto</button>
                                             </div>

                                             {/* Cap Input */}
                                             <div className="flex items-center gap-2 bg-slate-950/60 border border-slate-800/80 px-3 py-1 rounded-lg">
                                                 <span className="text-[10px] text-slate-450 font-extrabold uppercase tracking-wider">Cap:</span>
                                                 <button 
                                                     type="button"
                                                     onClick={() => setXAxisMax(xAxisMax === Infinity ? Math.round(dataMax * 0.8) : Infinity)}
                                                     className={cn(
                                                         'px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider rounded transition-all cursor-pointer',
                                                         xAxisMax === Infinity 
                                                             ? 'bg-cyan-600 text-white shadow' 
                                                             : 'bg-slate-800 text-slate-400 hover:text-white'
                                                     )}
                                                 >
                                                     Auto
                                                 </button>
                                                 <input 
                                                     type="range" 
                                                     min={0} 
                                                     max={dataMax} 
                                                     step={step} 
                                                     value={currentMax} 
                                                     onChange={(e) => {
                                                         const val = parseFloat(e.target.value);
                                                         setXAxisMax(val);
                                                     }} 
                                                     className={cn(
                                                         "w-24 h-1 rounded-lg appearance-none cursor-pointer accent-cyan-400",
                                                         xAxisMax === Infinity ? "bg-slate-850 opacity-40" : "bg-slate-800"
                                                     )} 
                                                 />
                                                 <input 
                                                     type="number" 
                                                     value={xAxisMax === Infinity ? '' : xAxisMax} 
                                                     placeholder={xAxisMax === Infinity ? 'Auto' : dataMax.toFixed(0)} 
                                                     onChange={(e) => {
                                                         const val = parseFloat(e.target.value);
                                                         if (!val || isNaN(val)) setXAxisMax(Infinity);
                                                         else setXAxisMax(val);
                                                     }} 
                                                     className={cn(
                                                         "w-14 bg-transparent text-[10px] focus:outline-none focus:ring-1 focus:ring-cyan-500/50 rounded px-1 text-right font-mono font-extrabold transition-all",
                                                         xAxisMax === Infinity ? "text-slate-500" : "text-slate-200"
                                                     )} 
                                                 />
                                                 <span className="text-[9px] text-slate-500 font-mono font-bold">ms</span>
                                             </div>
                                         </div>
                                     </div>
                                </div>
                            )}

                            {/* Chart Plot Area */}
                            <div className="flex-1 min-h-[432px] p-4 relative overflow-visible flex flex-col bg-slate-950/20 rounded-b-2xl">
                                {zoomDomain && (
                                    <button 
                                        onClick={() => setZoomDomain(null)}
                                        className="absolute top-4 right-4 z-10 bg-slate-800/85 hover:bg-slate-700 text-slate-350 hover:text-white text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-md border border-slate-800 hover:border-slate-700 shadow-lg flex items-center gap-1 cursor-pointer transition-all"
                                    >
                                        <RotateCcw size={10} /> Reset Zoom
                                    </button>
                                )}

                                <div 
                                    ref={containerRef}
                                    className={cn('relative w-full h-[50vh] select-none', isZoomEnabled && isDragging && !isBarMode ? 'cursor-grabbing' : 'cursor-default')}
                                    onWheel={!isBarMode ? handleWheel : undefined}
                                    onMouseDown={!isBarMode ? handleMouseDown : undefined}
                                    onMouseMove={!isBarMode ? handleMouseMove : undefined}
                                    onMouseUp={!isBarMode ? handleMouseUp : undefined}
                                    onMouseLeave={!isBarMode ? handleMouseUp : undefined}
                                 >

                                    {isBarMode ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart
                                                data={barChartData}
                                                layout={isVerticalLayout ? 'vertical' : 'horizontal'}
                                                margin={isVerticalLayout 
                                                    ? { top: 25, right: 30, left: 60, bottom: 25 } 
                                                    : { top: 25, right: 20, left: 45, bottom: 25 }}
                                                barCategoryGap="20%"
                                                barGap={4}
                                            >
                                                <CartesianGrid {...gridProps()} opacity={0.35} horizontal={!isVerticalLayout} vertical={isVerticalLayout} />
                                                {isVerticalLayout ? (
                                                    <>
                                                        <ChartXAxis
                                                            type="number"
                                                            label={xLabel}
                                                            domain={xAxisMax !== Infinity ? [0, xAxisMax] : [0, 'auto']}
                                                            scale={isLogScaleX ? 'log' : 'auto'}
                                                            allowDataOverflow={true}
                                                            tickFormatter={(val) => {
                                                                const v = Number(val);
                                                                return Math.abs(v) >= 100 ? v.toFixed(0) : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
                                                            }}
                                                        />
                                                        <ChartYAxis
                                                            type="category"
                                                            dataKey="stageLabel"
                                                            label="Stage"
                                                            interval={0}
                                                            tickFormatter={(val) => val}
                                                        />
                                                    </>
                                                ) : (
                                                    <>
                                                        <ChartXAxis
                                                            type="category"
                                                            dataKey="stageLabel"
                                                            label="Stage"
                                                            interval={0}
                                                            tickFormatter={(val) => val}
                                                        />
                                                        <ChartYAxis
                                                            type="number"
                                                            label={yLabel}
                                                            domain={[0, 'auto']}
                                                            allowDataOverflow={true}
                                                            tickFormatter={(val) => {
                                                                const v = Number(val);
                                                                return Math.abs(v) >= 100 ? v.toFixed(0) : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
                                                            }}
                                                        />
                                                    </>
                                                )}
                                                <Tooltip
                                                    cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                                                    content={<BarCustomTooltip
                                                        metricLabel={isVerticalLayout ? xLabel : yLabel}
                                                        smartLabels={smartLabels}
                                                        baselineBenchmarkKey={baselineBenchmarkKey}
                                                        theme="dark"
                                                    />}
                                                    wrapperStyle={{ outline: 'none', zIndex: 100000 }}
                                                    animationDuration={0}
                                                    isAnimationActive={false}
                                                />

                                                {uniqueBenchmarks.map((benchmarkKey) => {
                                                    if (!selectedBenchmarks.has(benchmarkKey)) return null;
                                                    const sample = visibleDataPoints.find(d => d.benchmarkKey === benchmarkKey) || filteredData.find(d => getBenchmarkKey(d) === benchmarkKey);
                                                    if (!sample) return null;
                                                    const model = sample.model_name || sample.model || 'Unknown';
                                                    const color = benchmarkColorMap.get(benchmarkKey) || modelColorMap.get(model) || '#38bdf8';
                                                    const isBaseline = benchmarkKey === baselineBenchmarkKey;
                                                    const displayName = smartLabels[benchmarkKey] || model;

                                                    return (
                                                        <Bar
                                                            key={benchmarkKey}
                                                            dataKey={benchmarkKey}
                                                            name={isBaseline ? `★ ${displayName} (baseline)` : displayName}
                                                            fill={color}
                                                            stroke={isBaseline ? '#ffffff' : color}
                                                            strokeWidth={isBaseline ? 1.5 : 0}
                                                            strokeDasharray={isBaseline ? "3 3" : undefined}
                                                            radius={isVerticalLayout ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                                                            maxBarSize={48}
                                                            isAnimationActive={false}
                                                        >
                                                            {showDataLabels && (
                                                                <LabelList
                                                                    dataKey={benchmarkKey}
                                                                    position={isVerticalLayout ? "right" : "top"}
                                                                    formatter={(val) => val != null ? Number(val).toLocaleString(undefined, { maximumFractionDigits: 1 }) : ''}
                                                                    fill="#94a3b8"
                                                                    fontSize={9.5}
                                                                    offset={4}
                                                                />
                                                            )}
                                                        </Bar>
                                                    );
                                                })}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart margin={{ top: 25, right: 20, left: 35, bottom: 25 }} onMouseLeave={() => setHoveredPointCoord(null)}>
                                                <CartesianGrid {...gridProps()} opacity={0.35} />
                                                <ChartXAxis
                                                    type="number"
                                                    dataKey="vx"
                                                    label={xLabel}
                                                    domain={curX}
                                                    scale={isLogScaleX ? 'log' : 'auto'}
                                                    allowDataOverflow={true}
                                                    ticks={isLogScaleX ? (() => {
                                                        const min = curX[0];
                                                        const max = curX[1];
                                                        const ticks = [];
                                                        let current = Math.pow(10, Math.ceil(Math.log10(min)));
                                                        while (current <= max) {
                                                            ticks.push(current);
                                                            current *= 10;
                                                        }
                                                        return ticks;
                                                    })() : undefined}
                                                    tickFormatter={(val) => {
                                                        const v = Number(val);
                                                        return Math.abs(v) >= 100 ? v.toFixed(0) : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
                                                    }}
                                                />
                                                <ChartYAxis
                                                    label={yLabel}
                                                    domain={curY}
                                                    allowDataOverflow={true}
                                                    tickFormatter={(val) => {
                                                        const v = Number(val);
                                                        return Math.abs(v) >= 100 ? v.toFixed(0) : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
                                                    }}
                                                />
                                                <Tooltip
                                                    allowEscapeViewBox={{ x: true, y: true }}
                                                    active={pinnedPopover && pinnedPopover.chartId === 'drawer' ? true : undefined}
                                                    position={pinnedPopover && pinnedPopover.chartId === 'drawer' ? pinnedPopover.coordinate : (hoveredPointCoord && hoveredPointCoord.chartId === 'drawer' ? { x: hoveredPointCoord.x, y: hoveredPointCoord.y } : undefined)}
                                                    content={<CustomChartTooltip
                                                        xLabel={pinnedPopover && pinnedPopover.chartId === 'drawer' ? pinnedPopover.xLabel : xLabel}
                                                        yLabel={pinnedPopover && pinnedPopover.chartId === 'drawer' ? pinnedPopover.yLabel : yLabel}
                                                        qualityMetrics={qualityMetrics}
                                                        baselineBenchmarkKey={baselineBenchmarkKey}
                                                        baselineSeries={baselineSeries}
                                                        isPinned={!!(pinnedPopover && pinnedPopover.chartId === 'drawer')}
                                                        pinnedPayload={pinnedPopover && pinnedPopover.chartId === 'drawer' ? pinnedPopover.payload : undefined}
                                                        pinnedLabel={pinnedPopover && pinnedPopover.chartId === 'drawer' ? pinnedPopover.label : undefined}
                                                        onClose={() => setPinnedPopover(null)}
                                                    />}
                                                    wrapperStyle={{ outline: 'none', zIndex: 100000 }}
                                                    cursor={{ stroke: '#475569', strokeWidth: 1, strokeDasharray: '4 4' }}
                                                    animationDuration={0}
                                                    isAnimationActive={false}
                                                />

                                                {uniqueBenchmarks.map((benchmarkKey) => {
                                                    const sample = visibleDataPoints.find(d => d.benchmarkKey === benchmarkKey);
                                                    if (!sample) return null;
                                                    const model = sample.model;
                                                    if (!selectedBenchmarks.has(benchmarkKey)) return null;
                                                    
                                                    const color = benchmarkColorMap.get(benchmarkKey) || modelColorMap.get(model) || '#38bdf8';
                                                    const lineData = visibleDataPoints
                                                         .filter(d => d.benchmarkKey === benchmarkKey)
                                                         .sort((a, b) => {
                                                             if (lineConnectMode === 'x') {
                                                                 return a.vx - b.vx;
                                                             }
                                                             if (lineConnectMode === 'y') {
                                                                 return a.vy - b.vy;
                                                             }
                                                             const stageA = getStageIdx(a);
                                                             const stageB = getStageIdx(b);
                                                             if (stageA !== null && stageB !== null && stageA !== stageB) {
                                                                 return stageA - stageB;
                                                             }
                                                             const qpsA = Number(getVal(a, 'metrics.request_rate')) || 0;
                                                             const qpsB = Number(getVal(b, 'metrics.request_rate')) || 0;
                                                             if (qpsA !== qpsB) return qpsA - qpsB;
                                                             return a.vx - b.vx;
                                                         });
                                                      
                                                    if (!lineData.length) return null;
                                                    
                                                    let displayName = model;
                                                    if (sample.metadata?.workload_id) {
                                                         displayName = `${model} (${sample.metadata.workload_id})`;
                                                    } else if (benchmarkKey.startsWith('inference-perf:')) {
                                                         const filename = benchmarkKey.replace('inference-perf:', '').replace(/\.[^.]+$/, '');
                                                         displayName = `${model} (${filename})`;
                                                    } else if (benchmarkKey.startsWith('file:')) {
                                                         const parts = benchmarkKey.split(':');
                                                         displayName = `${model} (${parts[parts.length - 1]})`;
                                                    }

                                                    const isBaseline = benchmarkKey === baselineBenchmarkKey;
                                                    
                                                    return (
                                                        <Line 
                                                             key={benchmarkKey}
                                                             data={lineData}
                                                             type="monotone" 
                                                             dataKey="vy" 
                                                             name={displayName} 
                                                             stroke={color} 
                                                             strokeWidth={isBaseline ? 2.5 : 2} 
                                                             strokeDasharray={isBaseline ? "4 4" : "0"}
                                                             dot={(props) => renderCustomDot(props, benchmarkKey, color, xLabel, yLabel, 'drawer', isBaseline)}
                                                             activeDot={(props) => renderActiveDot(props, benchmarkKey, color, xLabel, yLabel, 'drawer')}
                                                             label={(props) => <CustomLabel {...props} lastIndex={lineData.length - 1} text={smartLabels[benchmarkKey] || displayName} stroke={color} showLineLabel={showLabels} showDataLabels={showDataLabels} dataPoint={lineData[props.index]} />}
                                                             isAnimationActive={false}
                                                        />
                                                    );
                                                })}

                                                {showPareto && paretoData.length > 1 && (
                                                    <Line 
                                                        data={paretoData}
                                                        type="monotone"
                                                        dataKey="vy"
                                                        stroke="#f59e0b"
                                                        strokeWidth={2}
                                                        strokeDasharray="5 5"
                                                        dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }}
                                                        name="Pareto Frontier"
                                                        isAnimationActive={false}
                                                    />
                                                )}
                                            </LineChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>

                                {/* Hardware / Color Legend */}
                                <div className="mt-1 border-t border-slate-800 pt-3 px-6 pb-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
                                            {chartColorMode === 'hardware' ? 'Hardware / Machine Types' : 
                                             chartColorMode === 'model' ? 'Models' : 'Node Configurations'}
                                        </h4>
                                        
                                        {/* Color Mode Selector */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-slate-500 font-medium">Color By:</span>
                                            <select 
                                                value={chartColorMode}
                                                onChange={(e) => setChartColorMode(e.target.value)}
                                                className="bg-slate-850 border border-slate-800 rounded text-[10px] px-2 py-1 text-slate-200 outline-none focus:border-cyan-500"
                                            >
                                                <option value="hardware">Hardware</option>
                                                <option value="node_config">Node Config</option>
                                                <option value="model">Model</option>
                                            </select>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-wrap gap-x-8 gap-y-3">
                                        {sortedGroupKeys.map((key, groupIndex) => {
                                            const palette = categoricalPalettes[groupIndex % categoricalPalettes.length];
                                            const label = groupLabels[key] || key;

                                            return (
                                                <div key={key} className="flex flex-col gap-1">
                                                    <div className="flex rounded overflow-hidden shadow-sm">
                                                        {palette.map(c => (
                                                            <div key={c} className="w-4 h-3" style={{ backgroundColor: c }} />
                                                        ))}
                                                    </div>
                                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight max-w-[200px] truncate" title={label}>{label}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            }

            return (
                <ChartContainer title={config.title}>
                  {/* Y-Axis Controls - Connected Sticky within Card */}
                  <div className="sticky top-[60px] z-30 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700/50 pb-2 mb-2 -mx-2 px-2 flex items-center justify-between gap-4 flex-wrap">
                       <div className="flex-1 flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700/50">
                          {/* Y-Axis Group */}
                          <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-700 dark:text-slate-500 font-bold uppercase tracking-wider">Y-Axis</span>
                              <div className="h-4 w-px bg-slate-300 dark:bg-slate-700"/>
                              <button onClick={() => setTputType('output')} className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', tputType === 'output' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')}>Output</button>
                              <button onClick={() => metricAvailability?.input !== false && setTputType('input')} disabled={metricAvailability?.input === false} className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', metricAvailability?.input === false ? 'text-slate-600 cursor-not-allowed opacity-50' : tputType === 'input' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')} title={metricAvailability?.input !== false ? "Input Tokens per Second" : "Available only when input token stats are reported"}>Input</button>
                              <button onClick={() => metricAvailability?.total !== false && setTputType('total')} disabled={metricAvailability?.total === false} className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', metricAvailability?.total === false ? 'text-slate-600 cursor-not-allowed opacity-50' : tputType === 'total' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')} title={metricAvailability?.total !== false ? "Total Tokens per Second" : "Available only when total token stats are reported"}>Total</button>
                              <button onClick={() => metricAvailability?.qps !== false && setTputType('qps')} disabled={metricAvailability?.qps === false} className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', metricAvailability?.qps === false ? 'text-slate-600 cursor-not-allowed opacity-50' : tputType === 'qps' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')} title={metricAvailability?.qps !== false ? "Queries Per Second (QPS)" : "Available only when QPS is reported"}>QPS</button>
                              <button onClick={() => metricAvailability?.cost !== false && setTputType('cost')} disabled={metricAvailability?.cost === false} className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', metricAvailability?.cost === false ? 'text-slate-600 cursor-not-allowed opacity-50' : tputType === 'cost' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')} title={metricAvailability?.cost !== false ? "Cost per 1M Tokens" : "Available only when cost data is reported"}>Cost</button>
                              <button onClick={() => { if (chartMode === 'stage') setChartMode('tpot'); setTputType('stage'); }} className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', tputType === 'stage' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')}>Stage</button>
                          </div>
                      
                      <div className="h-4 w-px bg-slate-300 dark:bg-slate-700"/>
                      
                      {tputType === 'cost' && (
                          <Select
                                value={costMode}
                                onChange={(e) => setCostMode(e.target.value)}
                                className="w-auto text-xs px-2 py-1"
                          >
                              <option value="spot">Spot</option>
                              <option value="on_demand">On Demand</option>
                              <option value="cud_1y">CUD 1y</option>
                              <option value="cud_3y">CUD 3y</option>
                          </Select>
                      )}

                      {tputType !== 'cost' && tputType !== 'stage' && (
                          <button onClick={() => canShowPerChip && setShowPerChip(!showPerChip)} disabled={!canShowPerChip} className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', !canShowPerChip ? 'text-slate-600 cursor-not-allowed opacity-50' : showPerChip ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')} title={canShowPerChip ? "Normalize metric per chip" : "Available only when all selected benchmarks have known chip counts"}>Per Chip</button>
                      )}
                      
                      <div className="h-4 w-px bg-slate-300 dark:bg-slate-700"/>
                      
                      <button
                          onClick={() => setShowLabels(!showLabels)}
                          className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', showLabels ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')}
                      >
                          Labels
                      </button>

                      <button
                          onClick={() => setShowDataLabels(!showDataLabels)}
                          className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', showDataLabels ? 'bg-pink-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')}
                          title="Show TP data points"
                      >
                          Points
                      </button>

                      <div className="h-4 w-px bg-slate-300 dark:bg-slate-700"/>

                      <button
                          onClick={() => setShowPareto(!showPareto)}
                          className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', showPareto ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')}
                          title={`Pareto Frontier \n\nImplementation Model:\nCalculates the Pareto Efficiency Frontier by identifying the set of non-dominated configurations (e.g. highest throughput for a given latency) and connecting them linearly.`}
                      >
                          Pareto
                      </button>

                      <div className="h-4 w-px bg-slate-300 dark:bg-slate-700"/>

                      <LineConnectPopover lineConnectMode={lineConnectMode} setLineConnectMode={setLineConnectMode} size="normal" />
                    </div>
                  </div>
                  <div
                      ref={containerRef}
                      className={cn('relative w-full min-h-[360px] h-[50vh] select-none', isZoomEnabled && isDragging && !isBarMode ? 'cursor-grabbing' : 'cursor-default')}
                      onWheel={!isBarMode ? handleWheel : undefined}
                      onMouseDown={!isBarMode ? handleMouseDown : undefined}
                      onMouseMove={!isBarMode ? handleMouseMove : undefined}
                      onMouseUp={!isBarMode ? handleMouseUp : undefined}
                  >

                      {zoomDomain && (
                          <Button
                              variant="secondary"
                              size="xs"
                              onClick={() => setZoomDomain(null)}
                              className="absolute top-2 right-2 z-10 shadow-sm"
                          >
                              <RotateCcw size={10} /> Reset Zoom
                          </Button>
                      )}
                      
                      {isBarMode ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={barChartData}
                                layout={isVerticalLayout ? 'vertical' : 'horizontal'}
                                margin={isVerticalLayout 
                                    ? { top: 45, right: 30, left: 60, bottom: 45 } 
                                    : { top: 45, right: 30, left: 60, bottom: 45 }}
                                barCategoryGap="20%"
                                barGap={4}
                            >
                                <CartesianGrid {...gridProps()} opacity={0.5} horizontal={!isVerticalLayout} vertical={isVerticalLayout} />
                                {isVerticalLayout ? (
                                    <>
                                        <ChartXAxis
                                            type="number"
                                            label={config.xLabel}
                                            domain={xAxisMax !== Infinity ? [0, xAxisMax] : [0, 'auto']}
                                            scale={isLogScaleX ? 'log' : 'auto'}
                                            allowDataOverflow={true}
                                            tickFormatter={(val) => {
                                                const v = Number(val);
                                                return Math.abs(v) >= 100 ? v.toFixed(0) : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
                                            }}
                                        />
                                        <ChartYAxis
                                            type="category"
                                            dataKey="stageLabel"
                                            label="Stage"
                                            interval={0}
                                            tickFormatter={(val) => val}
                                        />
                                    </>
                                ) : (
                                    <>
                                        <ChartXAxis
                                            type="category"
                                            dataKey="stageLabel"
                                            label="Stage"
                                            interval={0}
                                            tickFormatter={(val) => val}
                                        />
                                        <ChartYAxis
                                            type="number"
                                            label={config.yLabel}
                                            domain={[0, 'auto']}
                                            allowDataOverflow={true}
                                            tickFormatter={(val) => {
                                                const v = Number(val);
                                                return Math.abs(v) >= 100 ? v.toFixed(0) : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
                                            }}
                                        />
                                    </>
                                )}
                                <Tooltip
                                    cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                                    content={<BarCustomTooltip
                                        metricLabel={isVerticalLayout ? config.xLabel : config.yLabel}
                                        smartLabels={smartLabels}
                                        baselineBenchmarkKey={baselineBenchmarkKey}
                                        theme="light"
                                    />}
                                    wrapperStyle={{ outline: 'none', zIndex: 100000 }}
                                    animationDuration={0}
                                    isAnimationActive={false}
                                />

                                {uniqueBenchmarks.map((benchmarkKey) => {
                                    if (!selectedBenchmarks.has(benchmarkKey)) return null;
                                    const sample = visibleDataPoints.find(d => d.benchmarkKey === benchmarkKey) || filteredData.find(d => getBenchmarkKey(d) === benchmarkKey);
                                    if (!sample) return null;
                                    const model = sample.model_name || sample.model || 'Unknown';
                                    const color = benchmarkColorMap.get(benchmarkKey) || modelColorMap.get(model);
                                    if (!color) return null;
                                    const isBaseline = benchmarkKey === baselineBenchmarkKey;
                                    const displayName = smartLabels[benchmarkKey] || model;

                                    return (
                                        <Bar
                                            key={benchmarkKey}
                                            dataKey={benchmarkKey}
                                            name={isBaseline ? `★ ${displayName} (baseline)` : displayName}
                                            fill={color}
                                            stroke={isBaseline ? '#0f172a' : color}
                                            strokeWidth={isBaseline ? 1.5 : 0}
                                            strokeDasharray={isBaseline ? "3 3" : undefined}
                                            radius={isVerticalLayout ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                                            maxBarSize={48}
                                            isAnimationActive={false}
                                        >
                                            {showDataLabels && (
                                                <LabelList
                                                    dataKey={benchmarkKey}
                                                    position={isVerticalLayout ? "right" : "top"}
                                                    formatter={(val) => val != null ? Number(val).toLocaleString(undefined, { maximumFractionDigits: 1 }) : ''}
                                                    fill="#64748b"
                                                    fontSize={9.5}
                                                    offset={4}
                                                />
                                            )}
                                        </Bar>
                                    );
                                })}
                            </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart margin={{ top: 45, right: 30, left: 60, bottom: 45 }} onMouseLeave={() => setHoveredPointCoord(null)}>
                              <CartesianGrid {...gridProps()} opacity={0.5} />
                              <ChartXAxis
                                type="number"
                                dataKey="vx"
                                label={config.xLabel}
                                domain={curX}
                                scale={isLogScaleX ? 'log' : 'auto'}
                                allowDataOverflow={true}
                                ticks={isLogScaleX ? (() => {
                                    // Generating power-of-10 ticks within the current domain
                                    const min = curX[0];
                                    const max = curX[1];
                                    const ticks = [];
                                    let current = Math.pow(10, Math.ceil(Math.log10(min)));
                                    while (current <= max) {
                                        ticks.push(current);
                                        current *= 10;
                                    }
                                    // Ensure bounds are included for context if they are significant
                                    return ticks;
                                })() : undefined}
                                tickFormatter={(val) => {
                                    const v = Number(val);
                                    return Math.abs(v) >= 100 ? v.toFixed(0) : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
                                }}
                              />
                              <ChartYAxis
                                label={config.yLabel}
                                domain={curY}
                                allowDataOverflow={true}
                                tickFormatter={(val) => {
                                    const v = Number(val);
                                    return Math.abs(v) >= 100 ? v.toFixed(0) : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
                                }}
                              />
                              <Tooltip
                                allowEscapeViewBox={{ x: true, y: true }}
                                active={pinnedPopover && pinnedPopover.chartId === 'main' ? true : undefined}
                                position={pinnedPopover && pinnedPopover.chartId === 'main' ? pinnedPopover.coordinate : (hoveredPointCoord && hoveredPointCoord.chartId === 'main' ? { x: hoveredPointCoord.x, y: hoveredPointCoord.y } : undefined)}
                                content={<CustomChartTooltip
                                    xLabel={pinnedPopover && pinnedPopover.chartId === 'main' ? pinnedPopover.xLabel : config.xLabel}
                                    yLabel={pinnedPopover && pinnedPopover.chartId === 'main' ? pinnedPopover.yLabel : config.yLabel}
                                    qualityMetrics={qualityMetrics}
                                    baselineBenchmarkKey={baselineBenchmarkKey}
                                    baselineSeries={baselineSeries}
                                    isPinned={!!(pinnedPopover && pinnedPopover.chartId === 'main')}
                                    pinnedPayload={pinnedPopover && pinnedPopover.chartId === 'main' ? pinnedPopover.payload : undefined}
                                    pinnedLabel={pinnedPopover && pinnedPopover.chartId === 'main' ? pinnedPopover.label : undefined}
                                    onClose={() => setPinnedPopover(null)}
                                />}
                                wrapperStyle={{ outline: 'none', zIndex: 100000 }}
                                cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                                animationDuration={0}
                                isAnimationActive={false}
                              />
        
                              {uniqueBenchmarks.map((benchmarkKey) => {
                                  // Get the model for this benchmark (for label display)
                                  const sample = visibleDataPoints.find(d => d.benchmarkKey === benchmarkKey);
                                  if (!sample) return null;
                                  const model = sample.model;
                                  
                                  // Visibility Check: Must check benchmarkKey directly for file-based benchmarks
                                  if (!selectedBenchmarks.has(benchmarkKey)) return null;
                                  
                                  const color = benchmarkColorMap.get(benchmarkKey) || modelColorMap.get(model);
                                  if (!color) return null;

                                  const lineData = visibleDataPoints
                                      .filter(d => d.benchmarkKey === benchmarkKey)
                                      .sort((a, b) => {
                                          if (lineConnectMode === 'x') {
                                              return a.vx - b.vx;
                                          }
                                          if (lineConnectMode === 'y') {
                                              return a.vy - b.vy;
                                          }
                                          const stageA = getStageIdx(a);
                                          const stageB = getStageIdx(b);
                                          if (stageA !== null && stageB !== null && stageA !== stageB) {
                                              return stageA - stageB;
                                          }

                                          // Sort by QPS (request_rate) first to ensure logical line tracing through load points
                                          const qpsA = Number(getVal(a, 'metrics.request_rate')) || 0;
                                          const qpsB = Number(getVal(b, 'metrics.request_rate')) || 0;
                                          
                                          if (qpsA !== qpsB) return qpsA - qpsB;

                                          // Fallback: Sort by current X-axis value to prevent Recharts from drawing backtracking lines
                                          // 'vx' represents the computed X coordinate for this data point
                                          return a.vx - b.vx;
                                      });
                                   
                                  if (!lineData.length) return null;
                                  
                                  // Create a display name for the legend
                                  // Use workload info if available, otherwise source
                                  let displayName = model;
                                  if (sample.metadata?.workload_id) {
                                      displayName = `${model} (${sample.metadata.workload_id})`;
                                  } else if (benchmarkKey.startsWith('inference-perf:')) {
                                      // Re-add file extension logic if needed, but often lpg relies on name
                                      const filename = benchmarkKey.replace('inference-perf:', '').replace(/\.[^.]+$/, '');
                                      displayName = `${model} (${filename})`;
                                  } else if (benchmarkKey.startsWith('file:')) {
                                      // Extract filename from file:source:filename key
                                      const parts = benchmarkKey.split(':');
                                      const filename = parts[parts.length - 1]; // Last part is filename
                                      displayName = `${model} (${filename})`;
                                  }

                                  const isBaseline = benchmarkKey === baselineBenchmarkKey;

                                  return (
                                  <Line
                                    key={benchmarkKey}
                                    data={lineData}
                                    type="monotone"
                                    dataKey="vy"
                                    name={isBaseline ? `★ ${displayName} (baseline)` : displayName}
                                    stroke={color}
                                    strokeDasharray="0"
                                    strokeWidth={isBaseline ? 3.5 : 2}
                                    dot={(props) => renderCustomDot(props, benchmarkKey, color, config.xLabel, config.yLabel, 'main', isBaseline)}
                                    isAnimationActive={false}
                                    label={(props) => <CustomLabel {...props} lastIndex={lineData.length - 1} text={smartLabels[benchmarkKey] || displayName} stroke={color} showLineLabel={showLabels} showDataLabels={showDataLabels} dataPoint={lineData[props.index]} />}
                                    activeDot={(props) => renderActiveDot(props, benchmarkKey, color, config.xLabel, config.yLabel, 'main')}
                                  />
                                  );
                              })}

                              {showPareto && paretoData.length > 1 && (
                                   <Line
                                       data={paretoData}
                                       type="linear"
                                       dataKey="vy"
                                       name="Pareto Frontier"
                                       stroke="#f59e0b" // Amber-500
                                       strokeWidth={3}
                                       strokeDasharray="5 5"
                                       dot={false}
                                       activeDot={false}
                                       style={{ opacity: 0.8 }}
                                       isAnimationActive={false}
                                   />
                              )}
                            </LineChart>
                        </ResponsiveContainer>
                      )}
                  </div>
                  
                   {/* Hardware / Color Legend */}
                   <div className="mt-1 border-t border-slate-700/50 pt-1 px-2">
                       <div className="flex items-center justify-between mb-2">
                           <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                               {chartColorMode === 'hardware' ? 'Hardware / Machine Types' : 
                                chartColorMode === 'model' ? 'Models' : 'Node Configurations'}
                           </h4>
                           
                           {/* Color Mode Selector */}
                           <div className="flex items-center gap-2">
                               <span className="text-[10px] text-slate-500 font-medium">Color By:</span>
                               <Select
                                   value={chartColorMode}
                                   onChange={(e) => setChartColorMode(e.target.value)}
                                   className="w-auto text-[10px] px-1 py-0.5 rounded"
                               >
                                   <option value="hardware">Hardware</option>
                                   <option value="node_config">Node Config</option>
                                   <option value="model">Model</option>
                               </Select>
                           </div>
                       </div>
                       
                       <div className="flex flex-wrap gap-x-8 gap-y-3">
                           {sortedGroupKeys.map(key => {
                               // Get first color of the group to show representation
                               // If hardware, we have a palette. If categorical, we have a palette.
                               // Just show 5-stop gradient or single color block? 
                               // Let's show the palette strips like before.
                               
                               const groupIndex = sortedGroupKeys.indexOf(key);
                               const palette = categoricalPalettes[groupIndex % categoricalPalettes.length];
                               
                               // Label resolution
                               let label = groupLabels[key] || key;


                               return (
                                   <div key={key} className="flex flex-col gap-1">
                                       <div className="flex rounded overflow-hidden shadow-sm">
                                           {palette.map(c => (
                                               <div key={c} className="w-4 h-3" style={{ backgroundColor: c }} />
                                           ))}
                                       </div>
                                       <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight max-w-[200px] truncate" title={label}>{label}</span>
                                   </div>
                               );
                           })}
                       </div>
                  </div>

                  {/* X-Axis Controls & Zoom */}
                  <div className="mt-1 border-t border-slate-200 dark:border-slate-700/50 pt-1 px-2 flex items-center justify-between gap-4 flex-wrap">
                       <div className="flex-1 flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700/50">
                           {/* X-Axis Controls */}
                           <div className="flex items-center gap-2">
                               <span className="text-[10px] text-slate-700 dark:text-slate-500 font-bold uppercase tracking-wider">X-Axis</span>
                               <div className="h-4 w-px bg-slate-300 dark:bg-slate-700"/>
                               <button onClick={() => setChartMode('tpot')} className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', chartMode === 'tpot' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')}>TPOT</button>
                               <button
                                   onClick={() => metricAvailability.ntpot && setChartMode('ntpot')}
                                   disabled={!metricAvailability.ntpot}
                                   className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', !metricAvailability.ntpot ? 'text-slate-600 cursor-not-allowed opacity-50' : chartMode === 'ntpot' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')}
                                   title={metricAvailability.ntpot ? "Normalized Time Per Output Token" : "Available only when NTPOT data is reported"}
                                >NTPOT</button>
                               <button
                                   onClick={() => metricAvailability.ttft && setChartMode('ttft')}
                                   disabled={!metricAvailability.ttft}
                                   className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', !metricAvailability.ttft ? 'text-slate-600 cursor-not-allowed opacity-50' : chartMode === 'ttft' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')}
                                   title={metricAvailability.ttft ? "Time To First Token" : "Available only when TTFT data is reported"}
                                >TTFT</button>
                               <button
                                   onClick={() => metricAvailability.itl && setChartMode('itl')}
                                   disabled={!metricAvailability.itl}
                                   className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', !metricAvailability.itl ? 'text-slate-600 cursor-not-allowed opacity-50' : chartMode === 'itl' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')}
                                   title={metricAvailability.itl ? "Inter Token Latency" : "Available only when ITL data is reported"}
                                >ITL</button>
                               <button
                                   onClick={() => metricAvailability.tokens_per_sec && setChartMode('tokens_per_sec')}
                                   disabled={!metricAvailability.tokens_per_sec}
                                   className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', !metricAvailability.tokens_per_sec ? 'text-slate-600 cursor-not-allowed opacity-50' : chartMode === 'tokens_per_sec' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')}
                                   title={metricAvailability.tokens_per_sec ? "Tokens Per Second (Reciprocal of ITL)" : "Available only when Tokens/Sec data is derived/reported"}
                                >Tokens/Sec</button>
                               <button onClick={() => { setChartMode('lat'); setLatType('e2e'); }} className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', chartMode === 'lat' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')}>E2E Latency</button>
                               <button onClick={() => { if (tputType === 'stage') setTputType('output'); setChartMode('stage'); }} className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', chartMode === 'stage' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')}>Stage</button>
                           </div>
                           
                           {/* Max Slider */}
                           {(() => {
                                let xKey = 'time_per_output_token';
                                 if (chartMode === 'qps') xKey = 'metrics.request_rate';
                                 else if (chartMode === 'ntpot') xKey = 'metrics.ntpot';
                                 else if (chartMode === 'ttft') xKey = 'metrics.ttft.mean';
                                 else if (chartMode === 'itl') xKey = 'metrics.itl';
                                 else if (chartMode === 'tokens_per_sec') xKey = 'tokens_per_second';
                                 else if (chartMode === 'lat') xKey = 'metrics.e2e_latency';

                                 const getVal = (obj, key) => {
                                     return key.split('.').reduce((o, i) => o?.[i], obj);
                                 };
                                const validData = filteredBySource.filter(d => selectedModels.has(d.model));
                                const dataMax = validData.length > 0 ? Math.max(...validData.map(d => Number(getVal(d, xKey)) || 0)) : (Math.max(...filteredBySource.map(d => Number(getVal(d, xKey)) || 0)) || 100);
                                const step = Math.max(0.01, dataMax / 100);
                                const currentMax = xAxisMax === Infinity ? dataMax : xAxisMax;
                                return (
                                    <div className="flex-1 flex items-center gap-2 border-l border-slate-300 dark:border-slate-700 pl-4">
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400">Max:</span>
                                        <input type="range" min={0} max={dataMax} step={step} value={currentMax} onChange={(e) => { const val = parseFloat(e.target.value); if (val >= dataMax * 0.99) setXAxisMax(Infinity); else setXAxisMax(val); }} className="w-full h-1 bg-slate-300 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                                        <Input type="number" value={xAxisMax === Infinity ? '' : xAxisMax} placeholder={dataMax.toFixed(chartMode === 'tpot' ? 2 : 0)} onChange={(e) => { const val = parseFloat(e.target.value); if (!val || isNaN(val)) setXAxisMax(Infinity); else setXAxisMax(val); }} className="w-16 rounded text-xs px-1 py-0.5 placeholder:text-slate-500 dark:placeholder:text-slate-600 text-right" />
                                        <span className="text-[10px] text-slate-500 w-4">{chartMode === 'tpot' || chartMode === 'lat' ? 'ms' : ''}</span>
                                    </div>
                                );
                           })()}
                       </div>

                       {/* Zoom Toggle */}
                       <div className="flex items-center gap-2">
                            {/* Log X Toggle */}
                            <button
                                onClick={() => setIsLogScaleX(!isLogScaleX)}
                                className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', isLogScaleX ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')}
                                title="Toggle Logarithmic Scale for X-Axis"
                            >
                                Log X
                            </button>

                           <div className="h-4 w-px bg-slate-700"/>
                           <button onClick={() => { const newValue = !isZoomEnabled; setIsZoomEnabled(newValue); if (!newValue) setZoomDomain(null); }} className={cn('px-3 py-1 text-xs font-medium rounded-md transition-all', isZoomEnabled ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50')} title="Enable mouse wheel zoom and drag pan">
                               {isZoomEnabled ? 'Zoom: ON' : 'Zoom: OFF'}
                           </button>
                       </div>
                  </div>
                </ChartContainer>
            );
        })()}
      </div>
    );
};
