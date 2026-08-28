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

import React, { useEffect, useMemo, useState } from 'react';
import {
    BarChart, Bar, Cell, CartesianGrid, ReferenceLine,
    ResponsiveContainer, LabelList, Tooltip,
} from 'recharts';
import { AlertTriangle } from 'lucide-react';
import {
    ChartContainer, ChartTooltip, ChartTooltipRow, ChartXAxis, ChartYAxis,
    CHART_SERIES, EmptyState, ToggleGroup, gridProps,
} from '../ui';
import { cn } from '../../utils/cn';
import { getEntryLabel, getCustomLabelRunId } from '../../utils/runLabel';

// One-bar-per-run comparison chart. Metrics are grouped into families
// (TTFT / TPOT / ITL / E2E / observability) so the user picks the family
// once and then chooses any combination of mean / p50 / p99 — selected
// stats render as side-by-side grouped bars in the same plot.

const METRICS = [
    // Throughput family — single stat each
    { id: 'output_tput', label: 'Output Tput', unit: 'tok/s', dec: 0, higher: true,
      stats: [{ id: 'mean', label: 'mean',
                fn: d => d.metrics?.output_tput ?? d.throughput }] },
    { id: 'input_tput',  label: 'Input Tput',  unit: 'tok/s', dec: 0, higher: true,
      stats: [{ id: 'mean', label: 'mean',
                fn: d => d.metrics?.input_tput }] },
    { id: 'request_rate', label: 'Request rate', unit: 'req/s', dec: 2, higher: true,
      stats: [{ id: 'mean', label: 'mean',
                fn: d => d.metrics?.request_rate ?? d.qps }] },

    // Latency family — mean / p50 / p99 sub-toggles
    { id: 'ttft', label: 'TTFT', unit: 'ms', dec: 1, higher: false,
      stats: [
        { id: 'mean', label: 'mean', fn: d => d.metrics?.ttft?.mean ?? d.ttft?.mean },
        { id: 'p50',  label: 'p50',  fn: d => d.metrics?.ttft?.p50  ?? d.ttft?.p50 },
        { id: 'p99',  label: 'p99',  fn: d => d.metrics?.ttft?.p99  ?? d.ttft?.p99 },
      ] },
    { id: 'tpot', label: 'TPOT', unit: 'ms', dec: 2, higher: false,
      stats: [
        { id: 'mean', label: 'mean', fn: d => d.metrics?.tpot ?? d.time_per_output_token },
        { id: 'p50',  label: 'p50',  fn: d => d.metrics?.tpot_p50 },
        { id: 'p99',  label: 'p99',  fn: d => d.metrics?.tpot_p99 },
      ] },
    { id: 'itl', label: 'ITL', unit: 'ms', dec: 2, higher: false,
      stats: [
        { id: 'mean', label: 'mean', fn: d => d.metrics?.itl ?? d.itl },
        { id: 'p50',  label: 'p50',  fn: d => d.metrics?.itl_p50 },
        { id: 'p99',  label: 'p99',  fn: d => d.metrics?.itl_p99 },
      ] },
    { id: 'e2e', label: 'E2E', unit: 'ms', dec: 1, higher: false,
      stats: [
        { id: 'mean', label: 'mean', fn: d => d.metrics?.e2e_latency ?? d.latency?.mean },
        { id: 'p50',  label: 'p50',  fn: d => d.latency?.p50 ?? d.metrics?.latency?.p50 },
        { id: 'p99',  label: 'p99',  fn: d => d.latency?.p99 ?? d.metrics?.latency?.p99 },
      ] },

    // Observability — only present in v0.2 reports
    { id: 'kv_cache_usage', label: 'KV cache usage', unit: '%', dec: 1, higher: false,
      stats: [
        { id: 'mean', label: 'mean', fn: d => d.metrics?.observability?.kvCacheUsageMean },
        { id: 'p50',  label: 'p50',  fn: d => d.metrics?.observability?.kvCacheUsageP50 },
        { id: 'p99',  label: 'p99',  fn: d => d.metrics?.observability?.kvCacheUsageP99 },
      ] },
    { id: 'prefix_cache_hit', label: 'Prefix cache hit', unit: '%', dec: 1, higher: true,
      stats: [
        { id: 'mean', label: 'mean', fn: d => d.metrics?.observability?.prefixCacheHitMean },
        { id: 'p50',  label: 'p50',  fn: d => d.metrics?.observability?.prefixCacheHitP50 },
        { id: 'p99',  label: 'p99',  fn: d => d.metrics?.observability?.prefixCacheHitP99 },
      ] },
    { id: 'epp_queue', label: 'EPP queue size', unit: '', dec: 1, higher: false,
      stats: [
        { id: 'mean', label: 'mean', fn: d => d.metrics?.observability?.eppQueueMean },
        { id: 'p50',  label: 'p50',  fn: d => d.metrics?.observability?.eppQueueP50 },
        { id: 'p99',  label: 'p99',  fn: d => d.metrics?.observability?.eppQueueP99 },
      ] },
    { id: 'pod_startup', label: 'Pod startup', unit: 's', dec: 1, higher: false,
      stats: [
        { id: 'mean', label: 'mean', fn: d => d.metrics?.observability?.podStartupMeanS },
        { id: 'p50',  label: 'p50',  fn: d => d.metrics?.observability?.podStartupP50S },
        { id: 'p99',  label: 'p99',  fn: d => d.metrics?.observability?.podStartupP99S },
      ] },
];

// Stable colors per stat — used for both bar fill and the legend.
// Fixed slots from the shared chart palette, keyed by stat id so each stat
// keeps its color no matter which stats are toggled on (hue-continuous with
// the old blue/amber/violet hexes).
const STAT_COLORS = {
    mean: CHART_SERIES[1], // sky
    p50:  CHART_SERIES[2], // amber
    p99:  CHART_SERIES[3], // violet
};

// Stage bars of one run share the run's hue and separate by lightness, so a
// sweep reads as one family. skills/style.md caps the palette at five hues and
// forbids cycling, so beyond five runs the hue repeats and the axis label is
// what distinguishes them.
const shade = (hex, factor) => {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c) => Math.round(c + (255 - c) * factor).toString(16).padStart(2, '0');
    return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
};

// Only a genuine sweep has distinct stage indices; repeated stage numbers mean
// the entries are something else (a rerun, a coalesced upload) and stay one bar.
const splitStages = (entries) => {
    const byStage = new Map();
    entries.forEach(d => {
        const stage = d.workload?.stage;
        if (stage == null || byStage.has(stage)) return;
        byStage.set(stage, d);
    });
    return byStage.size === entries.length && byStage.size > 1
        ? [...byStage.entries()].sort((a, b) => a[0] - b[0]).map(([, d]) => d)
        : [];
};

const stageKey = (key, entry) => `${key}#stage${entry.workload?.stage}`;
const runKeyOf = (key) => key.split('#stage')[0];

// A sweep's stages are separate operating points, so taking the best value of
// each metric independently reports a configuration that never ran: peak
// throughput from the last stage beside the first stage's latency. One stage
// represents the run instead, the one that reached peak throughput, and every
// stat on the bar is read from it.
const representativeEntry = (entries) => {
    if (entries.length <= 1) return entries[0] ?? null;
    const tput = d => d.metrics?.total_tput ?? d.metrics?.output_tput ?? d.throughput;
    let best = null;
    let bestVal = -Infinity;
    entries.forEach(d => {
        const v = tput(d);
        if (v !== null && v !== undefined && !isNaN(v) && v > bestVal) {
            bestVal = v;
            best = d;
        }
    });
    return best ?? entries[0];
};

const statValue = (entry, statFn) => {
    if (!entry) return null;
    const v = statFn(entry);
    return v === null || v === undefined || isNaN(v) ? null : v;
};

const formatVal = (v, dec) => {
    if (v === null || v === undefined) return '—';
    return Number(v).toLocaleString(undefined, { maximumFractionDigits: dec });
};

const clip = (s, n) => (s.length <= n ? s : `${s.slice(0, Math.max(1, n - 1))}…`);

// Runs in a sweep share their model name and differ inside the bracket, so the
// bracket is kept whole and the model name and trailing ` · stage N · QPS` context
// are clipped around it. Runs that differ only inside that context can still clip
// to the same string; the caller's dedup suffix keeps them hoverable.
const truncateLabel = (s, n = 22, keepHead = false) => {
    if (!s || s.length <= n) return s;
    // A stage bar's leading text is the only part that differs between its
    // siblings, so it is kept whole and the shared remainder gives way.
    if (keepHead) {
        const cut = s.indexOf(' · ');
        if (cut > 0 && cut <= n - 2) return `${s.slice(0, cut)} ·${clip(s.slice(cut + 2), n - cut - 2)}`;
    }
    const m = s.match(/^(.*?)(\s*)\[(.+)\](.*)$/);
    if (m) {
        const [, head, gap, inner, tail] = m;
        const sep = head ? gap : '';
        const room = n - inner.length - 2 - sep.length;
        if (room >= (head ? 2 : 0)) {
            const keptTail = clip(tail, Math.max(0, room - Math.min(head.length, 12)));
            const keptHead = clip(head, room - keptTail.length);
            return `${keptHead}${sep}[${inner}]${keptTail}`;
        }
        const budget = n - 2;
        if (budget >= 4) return `[…${inner.slice(inner.length - budget + 1)}]`;
    }
    return clip(s, n);
};

const buildBenchmarkLabel = (key, sample, brv02CustomLabels, isStageBar) => {
    const runId = getCustomLabelRunId(sample);
    if (runId !== null) {
        const customLabel = brv02CustomLabels?.[runId];
        const stage = sample.workload?.stage;
        const conc = sample.workload?.concurrency;
        const qps = sample.workload?.target_qps;
        const run = customLabel || getEntryLabel(sample) || 'run';

        // Stage bars of one run share every leading character, so the knob that
        // differs leads and the run name follows; the tooltip keeps the full text.
        if (isStageBar) {
            const load = conc != null ? `conc ${conc}` : qps != null ? `${qps} QPS` : `stage ${stage}`;
            return `${load} · ${run}`;
        }

        if (customLabel) return customLabel;
        const parts = [run];
        if (stage != null) parts.push(`stage ${stage}`);
        if (qps != null) parts.push(`${qps} QPS`);
        return parts.join(' · ');
    }
    return sample?.model_name || sample?.model || key.slice(0, 30);
};

// Tooltip: list every selected stat for the hovered benchmark, with the
// raw value and (if baseline set) %diff.
const BarTooltip = ({ active, payload, metric, activeStats, baselineSet }) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0].payload;
    return (
        <ChartTooltip
            className="min-w-[220px]"
            title={
                <span className="flex items-center gap-2">
                    <span className="truncate">{d.fullLabel}</span>
                    {d.stageCount > 1 && d.stage != null && (
                        <span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal shrink-0">
                            stage {d.stage} of {d.stageCount}
                        </span>
                    )}
                    {d.isBaseline && <span className="text-cyan-500 dark:text-cyan-400 text-[10px] font-normal shrink-0">📌 baseline</span>}
                </span>
            }
        >
            {activeStats.map(s => {
                const raw = d[`raw_${s.id}`];
                const diff = d[`diff_${s.id}`];
                const isImp = d[`imp_${s.id}`];
                const statLabel = `${metric.label}${metric.stats.length > 1 ? ` ${s.label}` : ''}`;
                return (
                    <ChartTooltipRow
                        key={s.id}
                        color={STAT_COLORS[s.id]}
                        label={statLabel}
                        value={
                            <span className="flex items-baseline gap-2">
                                <span>{formatVal(raw, metric.dec)}
                                    {metric.unit && (
                                        <span className="text-theme-muted text-[10px] ml-1 font-normal">{metric.unit}</span>
                                    )}
                                </span>
                                {baselineSet && diff !== null && diff !== undefined && (
                                    <span className={cn(
                                        'font-bold',
                                        isImp === null ? 'text-slate-400'
                                            : isImp ? 'text-emerald-500 dark:text-emerald-400'
                                            : 'text-red-500 dark:text-red-400'
                                    )}>
                                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                                    </span>
                                )}
                            </span>
                        }
                    />
                );
            })}
            {!baselineSet && (
                <div className="text-[10px] text-slate-400 pt-1">no baseline · select 📌 on a run to compare</div>
            )}
        </ChartTooltip>
    );
};

export const RunComparisonChart = ({
    filteredBySource,
    selectedBenchmarks,
    getBenchmarkKey,
    baselineBenchmarkKey,
    brv02CustomLabels,
    theme,
}) => {
    const [metricId, setMetricId] = useState('output_tput');
    // Multi-select: any combination of {'mean','p50','p99'} for the active metric.
    const [statIds, setStatIds] = useState(() => new Set(['mean']));
    const [viewOverride, setViewOverride] = useState(null);
    const [hiddenStages, setHiddenStages] = useState(() => new Set());
    const [collapsedRuns, setCollapsedRuns] = useState(() => new Set());

    useEffect(() => {
        if (!baselineBenchmarkKey) setViewOverride(null);
    }, [baselineBenchmarkKey]);

    const canDiff = !!baselineBenchmarkKey;
    const view = viewOverride ?? (canDiff ? 'diff' : 'absolute');

    const metric = METRICS.find(m => m.id === metricId) || METRICS[0];

    // Stats actually visible on the chart: intersection of the user's selection
    // with the stats this metric supports. Always at least one; default 'mean'.
    const activeStats = useMemo(() => {
        const visible = metric.stats.filter(s => statIds.has(s.id));
        return visible.length > 0 ? visible : [metric.stats[0]];
    }, [metric, statIds]);

    // When the user changes metric, drop selected stat ids that the new metric
    // doesn't expose; if nothing remains, default back to mean.
    useEffect(() => {
        const supported = new Set(metric.stats.map(s => s.id));
        setStatIds(prev => {
            const next = new Set([...prev].filter(id => supported.has(id)));
            if (next.size === 0) next.add('mean');
            return next;
        });
    }, [metricId]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggleStat = (id) => {
        setStatIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                if (next.size > 1) next.delete(id); // never empty
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Build chart data once per render, computing values and diffs for EVERY
    // stat the metric supports (cheap; lets us re-render without recomputing
    // when the user toggles stat visibility).
    // Runs that actually sweep, so the UI can offer a toggle per stage.
    const sweeps = useMemo(() => {
        const byKey = new Map();
        filteredBySource.forEach(d => {
            const key = getBenchmarkKey(d);
            if (!selectedBenchmarks.has(key)) return;
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(d);
        });
        const out = [];
        byKey.forEach((entries, key) => {
            const stages = splitStages(entries);
            if (stages.length > 1) out.push({ key, entries, stages });
        });
        return out;
    }, [filteredBySource, selectedBenchmarks, getBenchmarkKey]);

    const chartData = useMemo(() => {
        if (selectedBenchmarks.size < 2) return [];

        const byKey = new Map();
        filteredBySource.forEach(d => {
            const key = getBenchmarkKey(d);
            if (!selectedBenchmarks.has(key)) return;
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(d);
        });

        // A run's stages are separate operating points, so each gets its own bar
        // unless the user has collapsed the run back to one. Stage keys stay local
        // to this chart: getBenchmarkKey still identifies the run, so selections
        // and baselines saved elsewhere keep working.
        const groups = new Map();
        byKey.forEach((entries, key) => {
            const stages = splitStages(entries);
            if (stages.length < 2 || collapsedRuns.has(key)) {
                groups.set(key, entries);
                return;
            }
            stages.forEach(entry => {
                const sk = stageKey(key, entry);
                if (hiddenStages.has(sk)) return;
                groups.set(sk, [entry]);
            });
        });

        // One hue per run so a sweep's stage bars read as a family.
        const runHues = new Map();
        [...groups.keys()].forEach(k => {
            const rk = runKeyOf(k);
            if (!runHues.has(rk)) runHues.set(rk, CHART_SERIES[runHues.size % CHART_SERIES.length]);
        });
        const stageOrder = new Map();   // group key -> its position within its run
        const runStageCount = new Map(); // run key -> how many bars it has
        [...groups.keys()].forEach(k => {
            const rk = runKeyOf(k);
            const seen = runStageCount.get(rk) || 0;
            stageOrder.set(k, seen);
            runStageCount.set(rk, seen + 1);
        });

        const list = [];
        const usedLabels = new Set();
        groups.forEach((entries, key) => {
            // The bar's values come from this stage, so its label must too.
            const sample = representativeEntry(entries);
            const isStageBar = key !== runKeyOf(key);
            const fullLabel = buildBenchmarkLabel(key, sample, brv02CustomLabels, isStageBar);
            const isBaseline = runKeyOf(key) === baselineBenchmarkKey;
            // Recharts keys bars on `label`, so a collision makes both unhoverable.
            const prefix = isBaseline ? '📌 ' : '';
            let label = prefix + truncateLabel(fullLabel, 22, isStageBar);
            for (let n = 2; usedLabels.has(label); n++) {
                const suffix = ` (${n})`;
                label = prefix + truncateLabel(fullLabel, 22 - suffix.length, isStageBar) + suffix;
            }
            usedLabels.add(label);
            const row = {
                key,
                fullLabel,
                // 📌 on the x-axis tick marks the whole benchmark group as
                // baseline — each bar's %diff is computed vs the same-stat
                // value of THIS benchmark, so the marker belongs to the
                // group, not any single bar.
                label,
                isBaseline,
            };
            row.stage = sample?.workload?.stage ?? null;
            row.stageCount = entries.length;
            const rk = runKeyOf(key);
            const total = runStageCount.get(rk) || 1;
            // Later stages sit lighter within the run's hue; a lone bar keeps it pure.
            row.color = shade(runHues.get(rk), total > 1 ? (stageOrder.get(key) / total) * 0.55 : 0);
            metric.stats.forEach(s => {
                row[`raw_${s.id}`] = statValue(sample, s.fn);
            });
            list.push(row);
        });

        // Compute %diff vs baseline for each stat.
        const baselineRow = list.find(r => r.isBaseline);
        list.forEach(r => {
            metric.stats.forEach(s => {
                const v = r[`raw_${s.id}`];
                const bv = baselineRow ? baselineRow[`raw_${s.id}`] : null;
                if (r.isBaseline) {
                    r[`diff_${s.id}`] = 0;
                    r[`imp_${s.id}`] = null;
                } else if (v === null || bv === null || bv === 0) {
                    r[`diff_${s.id}`] = null;
                    r[`imp_${s.id}`] = null;
                } else {
                    const diff = ((v - bv) / Math.abs(bv)) * 100;
                    r[`diff_${s.id}`] = diff;
                    r[`imp_${s.id}`] = Math.abs(diff) < 0.1 ? null
                        : (metric.higher ? diff > 0 : diff < 0);
                }
            });
        });

        // Stable order: baseline first, then by mean (or first available stat) desc.
        const sortStat = metric.stats.find(s => statIds.has(s.id))?.id ?? metric.stats[0].id;
        return list.sort((a, b) => {
            if (a.isBaseline && !b.isBaseline) return -1;
            if (b.isBaseline && !a.isBaseline) return 1;
            return (b[`raw_${sortStat}`] ?? 0) - (a[`raw_${sortStat}`] ?? 0);
        });
    }, [filteredBySource, selectedBenchmarks, getBenchmarkKey, metric, baselineBenchmarkKey, brv02CustomLabels, statIds, hiddenStages, collapsedRuns]);

    if (selectedBenchmarks.size < 2) return null;

    // Drop benchmarks where ALL active stats are null — they have nothing to render.
    const plotData = chartData.filter(r =>
        activeStats.some(s => r[`raw_${s.id}`] !== null && r[`raw_${s.id}`] !== undefined)
    );

    // Build bar dataKey/value pairs for the active view.
    const barKey = (statId) => view === 'diff' ? `diff_${statId}` : `raw_${statId}`;
    const hasPlotData = plotData.length >= 2;

    // Single-stat selection keeps the rich on-bar labels (abs + %diff stacked);
    // grouped bars get just the absolute value above each bar to avoid clutter.
    const showRichLabels = activeStats.length === 1;

    const ABS_COLOR_DARK   = '#f8fafc';
    const ABS_COLOR_LIGHT  = '#0f172a';
    const BL_COLOR_DARK    = '#22d3ee';
    const BL_COLOR_LIGHT   = '#0e7490';
    const POS_COLOR        = '#34d399';
    const NEG_COLOR        = '#f87171';

    // LabelList content factory — bound to a specific stat so we know which
    // value to render and which row metadata to pull for 📌 baseline / %diff.
    const makeLabelRenderer = (statId) => (props) => {
        const { x, y, width, index } = props;
        if (x == null || y == null || width == null) return null;
        const entry = plotData[index];
        if (!entry) return null;

        const raw = entry[`raw_${statId}`];
        const diff = entry[`diff_${statId}`];
        const imp = entry[`imp_${statId}`];
        if (raw === null || raw === undefined) return null;

        const cx = x + width / 2;
        const isAbove = view === 'diff'
            ? ((diff ?? 0) >= 0)
            : true;

        if (view === 'diff') {
            const cy = isAbove ? y - 8 : y + 16;
            // Baseline bar is the 0% reference — no label needed; 📌 marker
            // is on the x-axis tick.
            if (entry.isBaseline || diff === null) return null;
            const sign = diff > 0 ? '+' : '';
            const fill = imp === null ? (theme === 'dark' ? '#cbd5e1' : '#475569')
                : imp ? POS_COLOR : NEG_COLOR;
            return (
                <text x={cx} y={cy} textAnchor="middle" fontSize={showRichLabels ? 13 : 10}
                      fontWeight={800} fill={fill}>
                    {sign}{diff.toFixed(1)}%
                </text>
            );
        }

        // Absolute view
        const valStr = formatVal(raw, metric.dec);
        const absFill = theme === 'dark' ? ABS_COLOR_DARK : ABS_COLOR_LIGHT;

        if (showRichLabels) {
            const TOP_Y = y - 22;
            const ABS_Y = y - 6;
            return (
                <g>
                    {canDiff && !entry.isBaseline && diff !== null && (
                        <text x={cx} y={TOP_Y} textAnchor="middle" fontSize={12} fontWeight={800}
                              fill={imp === null ? (theme === 'dark' ? '#cbd5e1' : '#475569')
                                  : imp ? POS_COLOR : NEG_COLOR}>
                            {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                        </text>
                    )}
                    <text x={cx} y={ABS_Y} textAnchor="middle" fontSize={12} fontWeight={700}
                          fill={absFill}>
                        {valStr}
                    </text>
                </g>
            );
        }

        // Grouped: small abs value + small %diff above each sub-bar.
        const showDiffLabel = canDiff && !entry.isBaseline && diff !== null;
        return (
            <g>
                {showDiffLabel && (
                    <text x={cx} y={y - 16} textAnchor="middle" fontSize={10} fontWeight={800}
                          fill={imp === null ? (theme === 'dark' ? '#cbd5e1' : '#475569')
                              : imp ? POS_COLOR : NEG_COLOR}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                    </text>
                )}
                <text x={cx} y={y - 4} textAnchor="middle" fontSize={10} fontWeight={700}
                      fill={absFill}>
                    {valStr}
                </text>
            </g>
        );
    };

    const activeStatsLabel = activeStats.map(s => s.label).join(', ');
    const metricLabelFull = metric.stats.length > 1
        ? `${metric.label} (${activeStatsLabel})`
        : metric.label;
    const yLabel = view === 'diff'
        ? `Δ ${metricLabelFull} vs baseline (%)`
        : `${metric.label}${metric.unit ? ` (${metric.unit})` : ''}`;

    const activeClass = (kind) => kind === 'cyan'
        ? 'bg-cyan-600 text-white shadow-sm'
        : kind === 'emerald'
            ? 'bg-emerald-600 text-white shadow-sm'
            : kind === 'purple'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-blue-600 text-white shadow-sm';

    const baseTogglesClass = 'px-3 py-1 text-xs font-medium rounded-md transition-all';
    const inactiveToggleClass = 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50';

    return (
        <ChartContainer title="Run Comparison">
            {plotData.length > 20 && (
                <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs flex items-start gap-2.5 leading-relaxed font-sans">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                        <span className="font-bold">Visual Density Warning:</span> Comparing {plotData.length} runs. Bar charts are optimized for comparing fewer than 20 runs. For larger datasets, we recommend using the <span className="font-semibold text-cyan-400">Scatter Trade-offs</span> view to identify Pareto-optimal configurations.
                    </div>
                </div>
            )}
            {/* Toggle row */}
            <div className="flex items-center gap-3 flex-wrap mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-700 dark:text-slate-500 font-bold uppercase tracking-wider">Metric</span>
                    <ToggleGroup
                        options={METRICS.map(opt => ({ value: opt.id, label: opt.label }))}
                        value={metricId}
                        onChange={setMetricId}
                        className="flex-wrap"
                    />
                </div>

                {sweeps.map(({ key, stages }) => {
                    const collapsed = collapsedRuns.has(key);
                    const shown = stages.filter(e => !hiddenStages.has(stageKey(key, e))).length;
                    return (
                        <div key={key} className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700/50">
                            <span className="text-[10px] text-slate-700 dark:text-slate-500 font-bold uppercase tracking-wider mr-1">Stages</span>
                            <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mr-1" />
                            <button
                                onClick={() => setCollapsedRuns(prev => {
                                    const next = new Set(prev);
                                    if (next.has(key)) next.delete(key); else next.add(key);
                                    return next;
                                })}
                                title={collapsed ? 'Show each stage as its own bar' : 'Combine the stages into one bar'}
                                className={cn(baseTogglesClass, collapsed ? activeClass('purple') : inactiveToggleClass)}
                            >
                                {collapsed ? 'Combined' : 'Split'}
                            </button>
                            {!collapsed && stages.map(entry => {
                                const sk = stageKey(key, entry);
                                const isOn = !hiddenStages.has(sk);
                                const load = entry.workload?.concurrency ?? entry.workload?.target_qps;
                                return (
                                    <button
                                        key={sk}
                                        onClick={() => setHiddenStages(prev => {
                                            const next = new Set(prev);
                                            if (next.has(sk)) next.delete(sk);
                                            else if (shown > 1) next.add(sk);
                                            return next;
                                        })}
                                        title={isOn && shown === 1 ? 'Keep at least one stage' : `Stage ${entry.workload?.stage}${load != null ? ` · ${load}` : ''}`}
                                        className={cn(baseTogglesClass, isOn ? activeClass('cyan') : inactiveToggleClass)}
                                    >
                                        {entry.workload?.stage}
                                    </button>
                                );
                            })}
                        </div>
                    );
                })}

                {metric.stats.length > 1 && (
                    <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700/50">
                        <span className="text-[10px] text-slate-700 dark:text-slate-500 font-bold uppercase tracking-wider mr-1">Stat</span>
                        <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mr-1" />
                        {metric.stats.map(opt => {
                            const isOn = statIds.has(opt.id);
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => toggleStat(opt.id)}
                                    title={isOn && statIds.size === 1 ? 'Keep at least one stat' : ''}
                                    className={cn(
                                        baseTogglesClass,
                                        'flex items-center gap-1.5',
                                        isOn ? activeClass('purple') : inactiveToggleClass
                                    )}
                                >
                                    <span
                                        className="w-2 h-2 rounded-sm"
                                        style={{ background: STAT_COLORS[opt.id], opacity: isOn ? 1 : 0.45 }}
                                    />
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700/50">
                    <span className="text-[10px] text-slate-700 dark:text-slate-500 font-bold uppercase tracking-wider mr-1">View</span>
                    <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mr-1" />
                    <button
                        onClick={() => setViewOverride('absolute')}
                        className={cn(baseTogglesClass, view === 'absolute' ? activeClass('emerald') : inactiveToggleClass)}
                    >
                        Absolute
                    </button>
                    <button
                        onClick={() => canDiff && setViewOverride('diff')}
                        disabled={!canDiff}
                        title={canDiff ? '' : 'Set a baseline (📌) on a row in the table to enable Δ% view'}
                        className={cn(
                            baseTogglesClass,
                            !canDiff
                                ? 'text-slate-600 cursor-not-allowed opacity-50'
                                : view === 'diff'
                                    ? activeClass('cyan')
                                    : inactiveToggleClass
                        )}
                    >
                        Δ% vs baseline
                    </button>
                </div>
            </div>

            <div className="h-[260px] overflow-x-auto overflow-y-hidden">
                {hasPlotData ? (
                    <div style={{ minWidth: `${Math.max(680, plotData.length * 48)}px`, height: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                // Recharts caches per-bar layout by registration order, so
                                // toggling a stat on/off after others were registered can leave
                                // the new bar appended at the right of every group regardless
                                // of JSX order. Re-keying on the active stat set forces a clean
                                // remount that always renders bars in metric.stats order.
                                key={activeStats.map(s => s.id).join(',')}
                                data={plotData}
                                margin={{ top: 44, right: 20, left: 30, bottom: 60 }}
                                barGap={2}
                            >
                                <CartesianGrid {...gridProps()} opacity={0.3} vertical={false} />
                                <ChartXAxis
                                    dataKey="label"
                                    type="category"
                                    interval={0}
                                    height={60}
                                    angle={-15}
                                    textAnchor="end"
                                    label={null}
                                    // ChartXAxis defaults to a numeric tickFormatter, which turns
                                    // category strings into NaN. Override with identity.
                                    tickFormatter={(v) => v}
                                />
                                <ChartYAxis
                                    label={yLabel}
                                    width={68}
                                    tickFormatter={(v) => view === 'diff'
                                        ? `${v > 0 ? '+' : ''}${v}%`
                                        : (Math.abs(v) >= 1000
                                            ? Number(v).toFixed(0)
                                            : Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 }))}
                                />
                                <Tooltip
                                    cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                                    content={<BarTooltip metric={metric} activeStats={activeStats} baselineSet={canDiff} />}
                                />
                                {view === 'diff' && (
                                    <ReferenceLine
                                        y={0}
                                        stroke={theme === 'dark' ? '#22d3ee' : '#0891b2'}
                                        strokeWidth={1.5}
                                        strokeDasharray="4 4"
                                    />
                                )}
                                {activeStats.map(s => (
                                    <Bar
                                        key={s.id}
                                        dataKey={barKey(s.id)}
                                        fill={STAT_COLORS[s.id]}
                                        radius={[4, 4, 0, 0]}
                                        maxBarSize={72}
                                    >
                                        {plotData.map((entry, i) => (
                                            <Cell
                                                key={i}
                                                fill={activeStats.length > 1 ? STAT_COLORS[s.id] : (entry.color || STAT_COLORS[s.id])}
                                                stroke={entry.isBaseline ? (theme === 'dark' ? '#67e8f9' : '#0e7490') : 'none'}
                                                strokeWidth={entry.isBaseline ? 1.5 : 0}
                                            />
                                        ))}
                                        <LabelList dataKey={barKey(s.id)} content={makeLabelRenderer(s.id)} />
                                    </Bar>
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <EmptyState
                        className="h-full py-0"
                        title={`No data for ${metric.label}`}
                        message="The selected benchmarks don't include this metric. Try a different metric (observability metrics like KV cache usage and pod startup are only available in v0.2 reports), or select more benchmarks."
                    />
                )}
            </div>

            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 text-center">
                One bar per selected benchmark{activeStats.length > 1 ? ` × ${activeStats.length} stats` : ''} ·
                multi-stage runs are shown at their peak-throughput stage
                {canDiff
                    ? ' · Δ% in green = improvement, red = regression'
                    : ' · set a baseline (📌) on a run to enable Δ% comparison'}
            </p>
        </ChartContainer>
    );
};
