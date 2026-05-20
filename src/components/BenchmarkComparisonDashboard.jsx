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
import { ArrowLeft, Star } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, ResponsiveContainer, Cell,
} from 'recharts';

// ---------------------------------------------------------------------------
// Palette — one colour per run (cycles if > 8 runs)
// ---------------------------------------------------------------------------
const RUN_COLORS = [
    '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b',
    '#ef4444', '#06b6d4', '#ec4899', '#84cc16',
];
const runColor = (idx) => RUN_COLORS[idx % RUN_COLORS.length];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmt = (val, dec = 1) =>
    val === null || val === undefined ? '—' : Number(val).toFixed(dec);

const pctDiff = (baseline, value) => {
    if (!baseline || baseline === 0 || value === null) return null;
    return ((value - baseline) / Math.abs(baseline)) * 100;
};

// ---------------------------------------------------------------------------
// Comparison table (same logic as the panel, full width)
// ---------------------------------------------------------------------------
const DiffBadge = ({ diff, higherIsBetter }) => {
    if (diff === null) return null;
    const isImprovement = higherIsBetter ? diff > 0 : diff < 0;
    const isNeutral = Math.abs(diff) < 0.1;
    const color = isNeutral
        ? 'text-slate-400'
        : isImprovement ? 'text-green-500' : 'text-red-400';
    return (
        <span className={`text-[11px] font-medium ml-1 ${color}`}>
            ({diff > 0 ? '+' : ''}{diff.toFixed(1)}%)
        </span>
    );
};

const stageLabel = (stage) => {
    if (!stage) return '—';
    const idx = stage.stageIndex !== null ? `Stage ${stage.stageIndex}` : 'Stage —';
    const qps = stage.scenario?.rateQps != null ? ` · ${stage.scenario.rateQps} QPS` : '';
    return `${idx}${qps}`;
};

// ---------------------------------------------------------------------------
// Bar chart section
// ---------------------------------------------------------------------------
const MetricBarChart = ({ title, unit, data, higherIsBetter, decimals = 1 }) => {
    if (!data || data.every(d => d.value === null)) return null;
    return (
        <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-slate-300">{title}</h4>
                <span className="text-[10px] text-slate-500">{unit} · {higherIsBetter ? '↑ higher is better' : '↓ lower is better'}</span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                    />
                    <Tooltip
                        contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 11 }}
                        formatter={(val) => [fmt(val, decimals) + ' ' + unit]}
                    />
                    <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                        {data.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------
export default function BenchmarkComparisonDashboard({
    runs,
    customLabels,
    baselineRunId,
    selectedStages,
    setBaselineRunId,
    onNavigateBack,
}) {
    const getLabel = (run) => customLabels?.[run.runId] || run.runLabel;

    const columns = React.useMemo(() => {
        const baseline = runs.find(r => r.runId === baselineRunId);
        const rest = runs.filter(r => r.runId !== baselineRunId);
        return [...(baseline ? [baseline] : []), ...rest].map((run, idx) => {
            const stageIdx = selectedStages?.[run.runId] ?? 0;
            const stage = run.stages[stageIdx] || run.stages[0];
            return { run, stage, isBaseline: run.runId === baselineRunId, color: runColor(idx) };
        });
    }, [runs, baselineRunId, selectedStages]);

    if (runs.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3 p-12">
                <p className="text-sm">No benchmark runs uploaded yet.</p>
                <p className="text-xs">Upload <code>benchmark_report_v0.2,_*.yaml</code> files via the Connections panel, then return here.</p>
                <button onClick={onNavigateBack} className="mt-4 text-xs underline text-violet-400 hover:text-violet-300">
                    ← Back to Benchmark Browser
                </button>
            </div>
        );
    }

    const baselineCol = columns.find(c => c.isBaseline);
    const bp = baselineCol?.stage?.performance;
    const bo = baselineCol?.stage?.observability;

    // Build bar chart data: one entry per run, one chart per metric
    const makeBarData = (accessor) =>
        columns.map(col => ({
            label: getLabel(col.run),
            value: accessor(col.stage),
            color: col.color,
        }));

    const perfMetrics = [
        { title: 'Output Throughput',  unit: 'tok/s', dec: 0, higher: true,  fn: s => s?.performance?.outputTokenRate },
        { title: 'TTFT Mean',          unit: 'ms',    dec: 1, higher: false, fn: s => s?.performance?.ttftMean },
        { title: 'TTFT P99',           unit: 'ms',    dec: 1, higher: false, fn: s => s?.performance?.ttftP99 },
        { title: 'TPOT Mean',          unit: 'ms',    dec: 2, higher: false, fn: s => s?.performance?.tpotMean },
        { title: 'ITL Mean',           unit: 'ms',    dec: 2, higher: false, fn: s => s?.performance?.itlMean },
        { title: 'E2E Latency Mean',   unit: 'ms',    dec: 1, higher: false, fn: s => s?.performance?.e2eMean },
    ];

    const obsMetrics = [
        { title: 'KV Cache Utilization',  unit: '%',  dec: 1, higher: null,  fn: s => s?.observability?.kvCacheUsage },
        { title: 'Prefix Cache Hit Rate', unit: '%',  dec: 1, higher: true,  fn: s => s?.observability?.prefixCacheHitRate },
        { title: 'EPP KV Utilization',    unit: '%',  dec: 1, higher: null,  fn: s => s?.observability?.eppKvUtilization },
        { title: 'EPP Queue Size',        unit: '',   dec: 1, higher: false, fn: s => s?.observability?.eppQueueSize },
        { title: 'Pod Startup Mean',      unit: 's',  dec: 1, higher: false, fn: s => s?.observability?.podStartupMeanS },
    ];

    const hasObs = columns.some(c => c.stage?.observability !== null);

    // Table rows
    const allTableRows = [
        ...perfMetrics,
        ...(hasObs ? obsMetrics : []),
    ];

    return (
        <div className="flex-1 flex flex-col min-h-screen bg-slate-950 text-white">
            {/* Header */}
            <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                <button
                    onClick={onNavigateBack}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                >
                    <ArrowLeft size={14} /> Back
                </button>
                <h1 className="text-sm font-semibold text-slate-200">Benchmark Comparison</h1>
                <span className="text-[11px] text-slate-500">{runs.length} runs · ★ = baseline</span>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">

                {/* Run legend */}
                <div className="flex flex-wrap gap-3">
                    {columns.map((col, idx) => (
                        <button
                            key={col.run.runId}
                            onClick={() => setBaselineRunId(col.run.runId)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${col.isBaseline ? 'border-violet-400 bg-violet-900/30 text-violet-300' : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500'}`}
                        >
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col.color }} />
                            {col.isBaseline && <Star size={10} fill="currentColor" className="text-violet-400" />}
                            <span className="truncate max-w-[180px]">{getLabel(col.run)}</span>
                            <span className="text-[10px] text-slate-500">{stageLabel(col.stage)}</span>
                        </button>
                    ))}
                </div>

                {/* Performance bar charts */}
                <section>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Request Performance</h2>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                        {perfMetrics.map(m => (
                            <MetricBarChart
                                key={m.title}
                                title={m.title}
                                unit={m.unit}
                                data={makeBarData(m.fn)}
                                higherIsBetter={m.higher}
                                decimals={m.dec}
                            />
                        ))}
                    </div>
                </section>

                {/* Observability bar charts */}
                {hasObs && (
                    <section>
                        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Observability</h2>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                            {obsMetrics.map(m => {
                                const anyData = columns.some(c => m.fn(c.stage) !== null);
                                if (!anyData) return null;
                                return (
                                    <MetricBarChart
                                        key={m.title}
                                        title={m.title}
                                        unit={m.unit}
                                        data={makeBarData(m.fn)}
                                        higherIsBetter={m.higher}
                                        decimals={m.dec}
                                    />
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* Comparison table */}
                <section>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
                        Detailed Comparison <span className="font-normal text-slate-600 ml-2">green = improvement · red = regression vs baseline</span>
                    </h2>
                    <div className="overflow-x-auto rounded-lg border border-slate-800">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-800 bg-slate-900">
                                    <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase w-48">Metric</th>
                                    {columns.map(col => (
                                        <th key={col.run.runId} className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                                                <span className={`text-[11px] font-semibold truncate max-w-[140px] ${col.isBaseline ? 'text-violet-400' : 'text-slate-300'}`}>
                                                    {col.isBaseline && '★ '}{getLabel(col.run)}
                                                </span>
                                            </div>
                                            <div className="text-[10px] text-slate-500 mt-0.5">{stageLabel(col.stage)}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {/* Performance section */}
                                <tr>
                                    <td colSpan={columns.length + 1} className="px-4 pt-4 pb-1">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Request Performance</span>
                                    </td>
                                </tr>
                                {perfMetrics.map(row => (
                                    <tr key={row.title} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                                        <td className="px-4 py-2 text-[12px] text-slate-400">{row.title}</td>
                                        {columns.map(col => {
                                            const val = row.fn(col.stage);
                                            const diff = col.isBaseline ? null : pctDiff(row.fn(baselineCol?.stage), val);
                                            return (
                                                <td key={col.run.runId} className="px-4 py-2 text-center">
                                                    <span className="text-[12px] font-mono text-slate-200">{fmt(val, row.dec)}</span>
                                                    {row.unit && <span className="text-[10px] text-slate-500 ml-0.5">{row.unit}</span>}
                                                    {diff !== null && <DiffBadge diff={diff} higherIsBetter={row.higher} />}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}

                                {/* Observability section */}
                                {hasObs && (
                                    <>
                                        <tr>
                                            <td colSpan={columns.length + 1} className="px-4 pt-4 pb-1">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Observability</span>
                                            </td>
                                        </tr>
                                        {obsMetrics.map(row => {
                                            const anyData = columns.some(c => row.fn(c.stage) !== null);
                                            if (!anyData) return null;
                                            return (
                                                <tr key={row.title} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                                                    <td className="px-4 py-2 text-[12px] text-slate-400">{row.title}</td>
                                                    {columns.map(col => {
                                                        const val = row.fn(col.stage);
                                                        const diff = col.isBaseline ? null : pctDiff(row.fn(baselineCol?.stage), val);
                                                        return (
                                                            <td key={col.run.runId} className="px-4 py-2 text-center">
                                                                <span className="text-[12px] font-mono text-slate-200">{fmt(val, row.dec)}</span>
                                                                {row.unit && <span className="text-[10px] text-slate-500 ml-0.5">{row.unit}</span>}
                                                                {diff !== null && <DiffBadge diff={diff} higherIsBetter={row.higher} />}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    );
}
