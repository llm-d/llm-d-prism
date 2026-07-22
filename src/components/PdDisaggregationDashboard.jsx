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

// Prefill/Decode Disaggregation well-lit path dashboard.
// Design spec: specs/changes/pd-disaggregation-dashboard/proposal.md
// (approved at Gate A). Six benchmark runs sweeping the prefill:decode
// replica ratio at a fixed total of 8 replicas; data served from GCS via
// /api/pd-disaggregation/data.

import React, { useState, useMemo, useEffect } from 'react';
import {
    BarChart, Bar, Cell, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Split, ChevronDown, ChevronUp } from 'lucide-react';
import {
    WellLitHeader, Badge, Button, Panel, SectionLabel, ToggleGroup, StatPills,
    FactCell, LoadingState, EmptyState, ChartContainer, ChartTooltip,
    ChartTooltipRow, ChartXAxis, ChartYAxis, gridProps, tooltipProps, seriesColor
} from './ui';
import { cn } from '../utils/cn';

const THROUGHPUT_LABELS = {
    output: 'Output Tokens/sec',
    input: 'Input Tokens/sec',
    total: 'Total Tokens/sec',
};

const LATENCY_LABELS = {
    ttft: 'Time To First Token (s)',
    itl: 'Inter-Token Latency (ms/token)',
    e2e: 'E2E Latency (s)',
};

const fmtTok = (v) => Math.round(v).toLocaleString();
const fmtSec = (ms) => (ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 });

const ThroughputTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <ChartTooltip title={`P:D ratio ${d.ratio}`}>
            <ChartTooltipRow color={d.fill} label={d.metricLabel} value={fmtTok(d.value)} unit=" tok/s" />
        </ChartTooltip>
    );
};

const LatencyTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <ChartTooltip title={`P:D ratio ${d.ratio} — ${d.metricLabel}`}>
            {payload.map(entry => (
                <ChartTooltipRow
                    key={entry.name}
                    color={d.fill}
                    opacity={entry.name === 'Mean' ? 1 : 0.6}
                    label={entry.name}
                    value={typeof entry.value === 'number' ? entry.value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : entry.value}
                    unit={d.unit}
                />
            ))}
        </ChartTooltip>
    );
};

export default function PdDisaggregationDashboard({ onNavigateBack, onToggleMobileNav }) {
    const [runs, setRuns] = useState(null);
    const [loadFailed, setLoadFailed] = useState(false);

    // Chart controls (canonical selector sets trimmed to what the data
    // supports: no QPS, no NTPOT/TPOT, no P50/P99 — see the design spec).
    const [thruMetric, setThruMetric] = useState('total'); // 'output' | 'input' | 'total'
    const [latMetric, setLatMetric] = useState('ttft'); // 'ttft' | 'itl' | 'e2e'
    const [visibleStats, setVisibleStats] = useState(['Mean', 'P90']);
    const [showChartFilters, setShowChartFilters] = useState(true);
    // Hero "Selectable ratios" toggles — hidden ratios are excluded from both charts.
    const [hiddenRatios, setHiddenRatios] = useState([]);

    useEffect(() => {
        let active = true;
        fetch('/api/pd-disaggregation/data')
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                if (active) setRuns(Array.isArray(data) ? data : []);
            })
            .catch(err => {
                console.error('Failed to load P/D disaggregation reports:', err);
                if (active) {
                    setLoadFailed(true);
                    setRuns([]);
                }
            });
        return () => { active = false; };
    }, []);

    const outcomes = useMemo(() => {
        if (!runs || runs.length === 0) return null;
        const byTotal = [...runs].sort((a, b) => b.throughput.total - a.throughput.total);
        const bestTotal = byTotal[0];
        const worstTotal = byTotal[byTotal.length - 1];
        const bestMeanTtft = runs.reduce((acc, r) => (r.ttft.mean < acc.ttft.mean ? r : acc), runs[0]);
        const bestP90Ttft = runs.reduce((acc, r) => (r.ttft.p90 < acc.ttft.p90 ? r : acc), runs[0]);
        const bestItl = runs.reduce((acc, r) => (r.itl.mean < acc.itl.mean ? r : acc), runs[0]);
        const worstItl = runs.reduce((acc, r) => (r.itl.mean > acc.itl.mean ? r : acc), runs[0]);
        // The "best config" is the run winning the most of the six reported
        // metrics (TTFT mean/p90, E2E mean/p90, ITL, total throughput).
        const wins = new Map(runs.map(r => [r.ratio, 0]));
        const winnersOf = [
            runs.reduce((a, r) => (r.ttft.mean < a.ttft.mean ? r : a), runs[0]),
            bestP90Ttft,
            runs.reduce((a, r) => (r.e2e.mean < a.e2e.mean ? r : a), runs[0]),
            runs.reduce((a, r) => (r.e2e.p90 < a.e2e.p90 ? r : a), runs[0]),
            bestItl,
            bestTotal,
        ];
        winnersOf.forEach(r => wins.set(r.ratio, wins.get(r.ratio) + 1));
        const bestConfig = runs.reduce((a, r) => (wins.get(r.ratio) > wins.get(a.ratio) ? r : a), runs[0]);
        return {
            bestConfig,
            bestConfigWins: wins.get(bestConfig.ratio),
            bestTotal,
            worstTotal,
            spread: worstTotal.throughput.total > 0 ? bestTotal.throughput.total / worstTotal.throughput.total : 0,
            bestMeanTtft,
            bestP90Ttft,
            bestItl,
            worstItl,
        };
    }, [runs]);

    const scenario = runs && runs.length > 0 ? runs[0] : null;
    const visibleRuns = useMemo(
        () => (runs || []).filter(r => !hiddenRatios.includes(r.ratio)),
        [runs, hiddenRatios]
    );

    const throughputChartData = useMemo(() => {
        if (!runs) return [];
        return visibleRuns.map(r => ({
            ratio: r.ratio,
            value: r.throughput[thruMetric],
            metricLabel: THROUGHPUT_LABELS[thruMetric],
            fill: seriesColor(0),
        }));
    }, [runs, visibleRuns, thruMetric]);

    const latencyChartData = useMemo(() => {
        if (!runs) return [];
        return visibleRuns.map(r => {
            const isItl = latMetric === 'itl';
            return {
                ratio: r.ratio,
                // Plotted values: seconds for TTFT/E2E, ms/token for ITL (mean only).
                mean: isItl ? r.itl.mean : r[latMetric].mean / 1000,
                p90: isItl ? null : r[latMetric].p90 / 1000,
                unit: isItl ? ' ms/tok' : ' s',
                metricLabel: LATENCY_LABELS[latMetric].replace(/ \(.*\)$/, ''),
                fill: seriesColor(0),
            };
        });
    }, [runs, visibleRuns, latMetric]);

    // Best (lowest for latency, highest for throughput) value per results-table
    // metric column, for highlighting.
    const columnBests = useMemo(() => {
        if (!runs || runs.length === 0) return null;
        return {
            ttftMean: Math.min(...runs.map(r => r.ttft.mean)),
            ttftP90: Math.min(...runs.map(r => r.ttft.p90)),
            e2eMean: Math.min(...runs.map(r => r.e2e.mean)),
            e2eP90: Math.min(...runs.map(r => r.e2e.p90)),
            itlMean: Math.min(...runs.map(r => r.itl.mean)),
            output: Math.max(...runs.map(r => r.throughput.output)),
            input: Math.max(...runs.map(r => r.throughput.input)),
            total: Math.max(...runs.map(r => r.throughput.total)),
        };
    }, [runs]);

    if (runs === null) {
        return <LoadingState fullPage label="Loading P/D disaggregation benchmarks..." />;
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center pt-16 md:pl-24 w-full font-sans relative overflow-hidden bg-[radial-gradient(#334155_1.2px,transparent_1.2px)] bg-[size:24px_24px] bg-repeat">
            {/* Pulsing Vibrant Neon Glow Background Shapes */}
            <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-blue-600/25 rounded-full blur-3xl pointer-events-none animate-pulse" />
            <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-emerald-600/25 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />

            <WellLitHeader
                pageTitle="Prefill/Decode Disaggregation"
                onNavigateBack={onNavigateBack}
                onToggleMobileNav={onToggleMobileNav}
            />

            <main className="w-full max-w-7xl px-6 py-8 flex flex-col space-y-6">
                {runs.length === 0 ? (
                    <ChartContainer>
                        <EmptyState
                            icon={<Split className="w-8 h-8" />}
                            title={loadFailed ? 'Benchmark data unavailable' : 'No benchmark runs found'}
                            message={loadFailed
                                ? 'The P/D disaggregation reports could not be loaded from GCS. Check server credentials and try again.'
                                : 'No reports were found under gs://llm-d-benchmarks/pd-disaggregation/.'}
                        />
                    </ChartContainer>
                ) : (
                    <>
                        {/* Hero panel */}
                        <div className="relative overflow-hidden border border-slate-800/80 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-slate-950/90 p-5 shadow-2xl backdrop-blur-xl group transition-all duration-500 hover:border-violet-500/30">
                            <div className="absolute -top-24 -right-24 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl group-hover:bg-violet-500/20 transition-all duration-700 pointer-events-none" />

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
                                {/* Col 1: Overview */}
                                <div>
                                    <SectionLabel tone="cyan">Overview</SectionLabel>
                                    <p className="text-xs text-slate-300 leading-relaxed">
                                        Prefill/decode disaggregation splits serving into separate pools of
                                        replicas: a <strong>prefill</strong> pool that processes incoming
                                        context and streams KV cache to a <strong>decode</strong> pool that
                                        generates tokens. This sweep probes the split for a long-context
                                        agentic workload: decode-heavy wins on nearly every metric (P90 TTFT
                                        is the lone exception — 3:5 edges 2:6, likely tail smoothing from a
                                        third prefill replica). Per-replica rates show why: decode replicas
                                        run saturated (~42–49 output tok/s each) at <em>every</em> tested
                                        ratio, so throughput scales with decode count while extra prefill
                                        replicas sit increasingly idle. The sweep stops at 2:6 — the balance
                                        point was not reached, and decode-heavier splits may do better still.
                                    </p>
                                </div>

                                {/* Col 2: Selectable ratios (toggles filter the charts) */}
                                <div className="space-y-2">
                                    <SectionLabel tone="cyan" className="mb-1">Selectable ratios</SectionLabel>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {(runs || []).map(r => {
                                            const isActive = !hiddenRatios.includes(r.ratio);
                                            return (
                                                <button
                                                    key={r.ratio}
                                                    onClick={() => setHiddenRatios(prev => isActive ? [...prev, r.ratio] : prev.filter(x => x !== r.ratio))}
                                                    className={cn(
                                                        'w-full text-left border rounded-lg p-2 flex items-center justify-between gap-2 transition-all cursor-pointer',
                                                        isActive ? 'border-violet-500/30 bg-slate-900/60' : 'border-slate-800/50 bg-slate-900/20 opacity-60'
                                                    )}
                                                >
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-semibold text-slate-200 font-mono">{r.ratio}</div>
                                                        <p className="text-[10px] text-slate-500 truncate">{r.prefill}P · {r.decode}D</p>
                                                    </div>
                                                    <span className={cn(
                                                        'w-1.5 h-1.5 rounded-full shrink-0',
                                                        isActive ? 'bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]' : 'bg-slate-700'
                                                    )} aria-hidden="true" />
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="text-[10px] text-slate-500">Toggle ratios to include in the charts below.</p>
                                </div>

                                {/* Col 3: Roadmap */}
                                <div>
                                    <SectionLabel tone="slate">Upcoming & roadmap</SectionLabel>
                                    <div className="border border-slate-800/50 rounded-lg bg-slate-900/30 p-2 flex items-center justify-between">
                                        <div>
                                            <div className="text-xs font-semibold text-slate-400">Aggregated baseline comparison</div>
                                            <p className="text-[10px] text-slate-500">Same workload on co-located (non-disaggregated) replicas</p>
                                        </div>
                                        <Badge tone="warning" size="xs">Coming soon</Badge>
                                    </div>
                                    <div className="border border-slate-800/50 rounded-lg bg-slate-900/30 p-2 mt-2 flex items-center justify-between">
                                        <div>
                                            <div className="text-xs font-semibold text-slate-400">Decode-heavy extension</div>
                                            <p className="text-[10px] text-slate-500">Sweep beyond 2:6 (e.g. 1:7) to find the balance point</p>
                                        </div>
                                        <Badge tone="warning" size="xs">Coming soon</Badge>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ROW 2: Benchmark scenario, Primary outcomes & Action */}
                        {outcomes && (
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                                {/* Benchmark scenario (col-span-6) */}
                                <div className="lg:col-span-8 border border-slate-800/80 rounded-xl bg-gradient-to-br from-slate-900 to-slate-950 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden">
                                    <div className="absolute -top-12 -left-12 w-32 h-32 bg-sky-500/5 rounded-full blur-2xl pointer-events-none" />
                                    <SectionLabel tone="sky" className="text-[11px]">Benchmark scenario</SectionLabel>
                                    <div className="grid grid-cols-12 gap-2">
                                        {/* Column 1: Infra layer */}
                                        <div className="flex flex-col gap-3 col-span-4 border-r border-slate-800/60 pr-2">
                                            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate">Infra layer</div>
                                            <div className="flex flex-col gap-2 text-xs">
                                                <FactCell label="Accelerator" value={<>TPU v7x (Ironwood)</>} />
                                                <FactCell label="Replicas" value={<>{scenario?.totalReplicas ?? 8} x 8 chips, TP={scenario?.tp ?? 8}</>} />
                                                <FactCell label="Sweep" value={<>P:D ratio 2:6 → 7:1</>} />
                                            </div>
                                        </div>

                                        {/* Column 2: Model serving */}
                                        <div className="flex flex-col gap-3 col-span-4 border-r border-slate-800/60 pr-2">
                                            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate">Model serving</div>
                                            <div className="flex flex-col gap-2 text-xs">
                                                <FactCell label="Model name" title={scenario?.model} value={<>Qwen3-Coder-480B-FP8</>} />
                                                <FactCell label="Engine" value={<>vLLM — TPUConnector</>} />
                                                <FactCell label="KV cache" value={<>fp8, prefix caching off</>} />
                                            </div>
                                        </div>

                                        {/* Column 3: Workload */}
                                        <div className="flex flex-col gap-3 col-span-4">
                                            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate">Workload</div>
                                            <div className="flex flex-col gap-2 text-xs">
                                                <FactCell label="Type" value={<>Agentic multi-turn</>} />
                                                <FactCell label="Load" value={<>800 req @ conc. 40</>} />
                                                <FactCell label="Context" value={<>160k sys + 1.5k/turn</>} />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Primary outcomes (col-span-3) */}
                                <Panel padding="sm" className="lg:col-span-4 flex flex-col relative overflow-hidden group hover:border-violet-500/30 transition-all">
                                    <SectionLabel tone="emerald" className="text-[11px]">Primary outcomes</SectionLabel>
                                    <div className="grid grid-cols-1 gap-2 font-sans text-xs">
                                        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2.5 flex justify-between items-center transition-all hover:border-violet-500/40">
                                            <div className="min-w-0 pr-2">
                                                <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-0.5 truncate">Best ratio</h3>
                                                <div className="text-[10px] text-slate-500 font-normal uppercase truncate">(prefill : decode)</div>
                                            </div>
                                            <h4 className="text-base font-black font-mono text-violet-400 shrink-0">{outcomes.bestConfig.ratio}</h4>
                                        </div>
                                        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2.5 flex justify-between items-center transition-all hover:border-emerald-500/40">
                                            <div className="min-w-0 pr-2">
                                                <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-0.5 truncate">Peak throughput</h3>
                                                <div className="text-[10px] text-slate-500 font-normal uppercase truncate">(total tok/s)</div>
                                            </div>
                                            <h4 className="text-base font-black font-mono text-emerald-400 shrink-0">{fmtTok(outcomes.bestTotal.throughput.total)}</h4>
                                        </div>
                                        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2.5 flex justify-between items-center transition-all hover:border-sky-500/40">
                                            <div className="min-w-0 pr-2">
                                                <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-0.5 truncate">Best TTFT</h3>
                                                <div className="text-[10px] text-slate-500 font-normal uppercase truncate">(mean, s)</div>
                                            </div>
                                            <h4 className="text-base font-black font-mono text-sky-400 shrink-0">{fmtSec(outcomes.bestMeanTtft.ttft.mean)} s</h4>
                                        </div>
                                    </div>
                                </Panel>
                            </div>
                        )}

                        {/* Throughput chart */}
                        <ChartContainer
                            title="Throughput vs. P:D ratio"
                            subtitle="Higher is better. Mean token rate per prefill:decode replica split (tokens/s)."
                            actions={
                                <ToggleGroup
                                    options={[
                                        { value: 'output', label: 'Output' },
                                        { value: 'input', label: 'Input' },
                                        { value: 'total', label: 'Total' },
                                    ]}
                                    value={thruMetric}
                                    onChange={setThruMetric}
                                />
                            }
                        >
                            <div className="relative w-full h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={throughputChartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }} barCategoryGap="25%">
                                        <CartesianGrid {...gridProps()} vertical={false} />
                                        <ChartXAxis dataKey="ratio" tickLine={false} interval={0} />
                                        <ChartYAxis tickLine={false} width={70} />
                                        <Tooltip
                                            {...tooltipProps()}
                                            content={<ThroughputTooltip />}
                                        />
                                        <Bar dataKey="value" fill={seriesColor(0)} radius={[6, 6, 0, 0]} maxBarSize={80} isAnimationActive={false} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2">{THROUGHPUT_LABELS[thruMetric]}, by prefill:decode replica ratio (8 replicas total).</p>
                        </ChartContainer>

                        {/* Latency chart */}
                        <ChartContainer
                            title="Latency vs. P:D ratio"
                            subtitle="Lower is better. TTFT/E2E in seconds; ITL in ms/token. ITL plateaus at prefill-heavy ratios (≥ 5:3) — the decode-saturation ceiling."
                            actions={
                                <Button variant="secondary" size="sm" onClick={() => setShowChartFilters(!showChartFilters)}>
                                    Filters
                                    {showChartFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </Button>
                            }
                        >
                            {showChartFilters && (
                                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-slate-800/60 bg-slate-900/40 rounded-lg px-4 py-2.5 mb-4">
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest shrink-0">Latency:</span>
                                        <ToggleGroup
                                            options={[
                                                { value: 'ttft', label: 'TTFT' },
                                                { value: 'itl', label: 'ITL' },
                                                { value: 'e2e', label: 'E2E' },
                                            ]}
                                            value={latMetric}
                                            onChange={setLatMetric}
                                        />
                                    </div>
                                    {latMetric !== 'itl' && (
                                        <div className="flex items-center gap-2 ml-auto">
                                            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest shrink-0">Stats:</span>
                                            <StatPills
                                                options={['Mean', 'P90']}
                                                active={visibleStats}
                                                onToggle={(p) => setVisibleStats(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="relative w-full h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={latencyChartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }} barCategoryGap="25%">
                                        <CartesianGrid {...gridProps()} vertical={false} />
                                        <ChartXAxis dataKey="ratio" tickLine={false} interval={0} />
                                        <ChartYAxis tickLine={false} width={70} unit={latMetric === 'itl' ? ' ms' : ' s'} />
                                        <Tooltip
                                            {...tooltipProps()}
                                            content={<LatencyTooltip />}
                                        />
                                        <Bar dataKey="mean" name="Mean" radius={[6, 6, 0, 0]} maxBarSize={50} isAnimationActive={false} hide={!visibleStats.includes('Mean')}>
                                            {latencyChartData.map((entry, index) => (
                                                <Cell key={index} fill={entry.fill} fillOpacity={1} />
                                            ))}
                                        </Bar>
                                        <Bar dataKey="p90" name="P90" radius={[6, 6, 0, 0]} maxBarSize={50} isAnimationActive={false} hide={latMetric === 'itl' || !visibleStats.includes('P90')}>
                                            {latencyChartData.map((entry, index) => (
                                                <Cell key={index} fill={entry.fill} fillOpacity={0.6} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2">
                                {LATENCY_LABELS[latMetric]}{latMetric === 'itl' ? ', mean' : ' — Mean (solid), P90 (translucent)'}, by prefill:decode replica ratio (8 replicas total).
                            </p>
                        </ChartContainer>

                        {/* Results table */}
                        {columnBests && (
                            <ChartContainer
                                title="Full results — all runs, all reported metrics"
                                subtitle="TTFT/E2E in seconds; ITL in ms/token; throughput in tokens/s. Best value per column highlighted; lower is better for latency, higher for throughput."
                            >
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="bg-slate-950 text-slate-400 font-mono uppercase tracking-wider text-[10px]">
                                                <th className="p-3">P:D ratio</th>
                                                <th className="p-3">Prefill</th>
                                                <th className="p-3">Decode</th>
                                                <th className="p-3">TTFT mean (s)</th>
                                                <th className="p-3">TTFT P90 (s)</th>
                                                <th className="p-3">E2E mean (s)</th>
                                                <th className="p-3">E2E P90 (s)</th>
                                                <th className="p-3">ITL mean (ms/tok)</th>
                                                <th className="p-3">Output tok/s</th>
                                                <th className="p-3">Input tok/s</th>
                                                <th className="p-3">Total tok/s</th>
                                                <th className="p-3">Requests</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/60 font-mono">
                                            {runs.map(r => {
                                                const isWinner = outcomes && r.ratio === outcomes.bestConfig.ratio;
                                                return (
                                                    <tr key={r.ratio} className={cn(isWinner && 'bg-emerald-900/20')}>
                                                        <td className="p-3 text-white font-sans font-bold">
                                                            <span className="flex items-center gap-2">
                                                                {r.ratio}
                                                                {isWinner && <Badge tone="success" size="xs">Best observed</Badge>}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-slate-300">{r.prefill}</td>
                                                        <td className="p-3 text-slate-300">{r.decode}</td>
                                                        <td className={cn('p-3', r.ttft.mean === columnBests.ttftMean ? 'text-emerald-300 font-bold' : 'text-slate-300')}>{fmtSec(r.ttft.mean)}</td>
                                                        <td className={cn('p-3', r.ttft.p90 === columnBests.ttftP90 ? 'text-emerald-300 font-bold' : 'text-slate-300')}>{fmtSec(r.ttft.p90)}</td>
                                                        <td className={cn('p-3', r.e2e.mean === columnBests.e2eMean ? 'text-emerald-300 font-bold' : 'text-slate-300')}>{fmtSec(r.e2e.mean)}</td>
                                                        <td className={cn('p-3', r.e2e.p90 === columnBests.e2eP90 ? 'text-emerald-300 font-bold' : 'text-slate-300')}>{fmtSec(r.e2e.p90)}</td>
                                                        <td className={cn('p-3', r.itl.mean === columnBests.itlMean ? 'text-emerald-300 font-bold' : 'text-slate-300')}>{r.itl.mean.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                                                        <td className={cn('p-3', r.throughput.output === columnBests.output ? 'text-emerald-300 font-bold' : 'text-slate-300')}>{fmtTok(r.throughput.output)}</td>
                                                        <td className={cn('p-3', r.throughput.input === columnBests.input ? 'text-emerald-300 font-bold' : 'text-slate-300')}>{fmtTok(r.throughput.input)}</td>
                                                        <td className={cn('p-3', r.throughput.total === columnBests.total ? 'text-emerald-300 font-bold' : 'text-slate-300')}>{fmtTok(r.throughput.total)}</td>
                                                        <td className="p-3 text-slate-300">{r.requests.toLocaleString()}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </ChartContainer>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
