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

import React from "react";
import { FileJson, X, Star, AlertCircle, Pencil } from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (val, decimals = 1) => {
    if (val === null || val === undefined) return '—';
    return Number(val).toFixed(decimals);
};

const pctDiff = (baseline, value) => {
    if (baseline === null || baseline === undefined || baseline === 0) return null;
    if (value === null || value === undefined) return null;
    return ((value - baseline) / Math.abs(baseline)) * 100;
};

// higherIsBetter: true  → positive diff is green
// higherIsBetter: false → negative diff is green
const DiffBadge = ({ baseline, value, higherIsBetter, decimals = 1 }) => {
    const diff = pctDiff(baseline, value);
    if (diff === null) return <span className="text-slate-400 text-[10px]">—</span>;

    const isImprovement = higherIsBetter ? diff > 0 : diff < 0;
    const isNeutral = Math.abs(diff) < 0.1;

    const colorClass = isNeutral
        ? 'text-slate-500'
        : isImprovement
            ? 'text-green-600 dark:text-green-400'
            : 'text-red-500 dark:text-red-400';

    const sign = diff > 0 ? '+' : '';
    return (
        <span className={`text-[10px] font-medium ${colorClass}`}>
            {sign}{diff.toFixed(1)}%
        </span>
    );
};

const MetricCell = ({ value, baseline, higherIsBetter, unit, decimals = 1, isBaseline }) => (
    <td className="px-2 py-1.5 text-center">
        <div className="text-xs text-slate-800 dark:text-slate-200 font-mono">
            {fmt(value, decimals)}{unit ? <span className="text-[9px] text-slate-400 ml-0.5">{unit}</span> : null}
        </div>
        {!isBaseline && (
            <DiffBadge baseline={baseline} value={value} higherIsBetter={higherIsBetter} decimals={decimals} />
        )}
    </td>
);

// ---------------------------------------------------------------------------
// Stage label helper
// ---------------------------------------------------------------------------
const stageLabel = (stage) => {
    const idx = stage.stageIndex !== null ? `Stage ${stage.stageIndex}` : 'Stage —';
    const qps = stage.scenario.rateQps !== null ? ` · ${stage.scenario.rateQps} QPS` : '';
    return `${idx}${qps}`;
};

// ---------------------------------------------------------------------------
// Comparison table
// ---------------------------------------------------------------------------
const ComparisonTable = ({ runs, selectedStages, baselineRunId, customLabels }) => {
    const getLabel = (run) => customLabels?.[run.runId] || run.runLabel;
    // Build ordered columns: baseline first, then the rest in insertion order
    const columns = [
        ...runs.filter(r => r.runId === baselineRunId),
        ...runs.filter(r => r.runId !== baselineRunId),
    ].map(run => {
        const stageIdx = selectedStages[run.runId] ?? 0;
        const stage = run.stages[stageIdx] || run.stages[0];
        return { run, stage, isBaseline: run.runId === baselineRunId };
    });

    if (columns.length < 2) return null;

    const baselineStage = columns[0].stage;
    const bp = baselineStage.performance;
    const bo = baselineStage.observability;

    const hasObs = columns.some(c => c.stage.observability !== null);

    const perfRows = [
        { label: 'Output throughput',  key: p => p.outputTokenRate,  unit: 'tok/s', dec: 0, higher: true },
        { label: 'Request rate',        key: p => p.requestRate,       unit: 'req/s', dec: 2, higher: true },
        { label: 'TTFT mean',           key: p => p.ttftMean,          unit: 'ms',    dec: 1, higher: false },
        { label: 'TTFT p99',            key: p => p.ttftP99,           unit: 'ms',    dec: 1, higher: false },
        { label: 'TPOT mean',           key: p => p.tpotMean,          unit: 'ms',    dec: 2, higher: false },
        { label: 'ITL mean',            key: p => p.itlMean,           unit: 'ms',    dec: 2, higher: false },
        { label: 'E2E latency mean',    key: p => p.e2eMean,           unit: 'ms',    dec: 1, higher: false },
        { label: 'E2E latency p99',     key: p => p.e2eP99,            unit: 'ms',    dec: 1, higher: false },
        { label: 'Failures',            key: p => p.failures,          unit: '',      dec: 0, higher: false },
    ];

    const obsRows = [
        { label: 'KV cache utilization',   key: o => o?.kvCacheUsage,        unit: '%',   dec: 1, higher: null },
        { label: 'Prefix cache hit rate',  key: o => o?.prefixCacheHitRate,   unit: '%',   dec: 1, higher: true  },
        { label: 'EPP KV utilization',     key: o => o?.eppKvUtilization,     unit: '%',   dec: 1, higher: null },
        { label: 'EPP queue size',         key: o => o?.eppQueueSize,         unit: '',    dec: 1, higher: false },
        { label: 'Pod startup (mean)',     key: o => o?.podStartupMeanS,      unit: 's',   dec: 1, higher: false },
    ];

    const colHeader = (col) => (
        <th key={col.run.runId} className={`px-2 py-2 text-center text-[10px] font-semibold max-w-[100px] ${col.isBaseline ? 'text-violet-600 dark:text-violet-400' : 'text-slate-600 dark:text-slate-300'}`}>
            <div className="truncate" title={getLabel(col.run)}>
                {col.isBaseline && <span className="mr-1">★</span>}
                {getLabel(col.run)}
            </div>
            <div className="text-[9px] font-normal text-slate-400">{stageLabel(col.stage)}</div>
        </th>
    );

    const sectionHeader = (label) => (
        <tr>
            <td colSpan={columns.length + 1} className="px-2 pt-3 pb-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</span>
            </td>
        </tr>
    );

    return (
        <div className="overflow-x-auto mt-3">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase">Metric</th>
                        {columns.map(colHeader)}
                    </tr>
                </thead>
                <tbody>
                    {sectionHeader('Request Performance')}
                    {perfRows.map(row => (
                        <tr key={row.label} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                            <td className="px-2 py-1.5 text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">{row.label}</td>
                            {columns.map(col => (
                                <MetricCell
                                    key={col.run.runId}
                                    value={row.key(col.stage.performance)}
                                    baseline={row.key(bp)}
                                    higherIsBetter={row.higher}
                                    unit={row.unit}
                                    decimals={row.dec}
                                    isBaseline={col.isBaseline}
                                />
                            ))}
                        </tr>
                    ))}

                    {hasObs && (
                        <>
                            {sectionHeader('Observability')}
                            {obsRows.map(row => {
                                const anyHasValue = columns.some(c => row.key(c.stage.observability) !== null);
                                if (!anyHasValue) return null;
                                return (
                                    <tr key={row.label} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                        <td className="px-2 py-1.5 text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">{row.label}</td>
                                        {columns.map(col => (
                                            <MetricCell
                                                key={col.run.runId}
                                                value={row.key(col.stage.observability)}
                                                baseline={row.key(bo)}
                                                higherIsBetter={row.higher}
                                                unit={row.unit}
                                                decimals={row.dec}
                                                isBaseline={col.isBaseline}
                                            />
                                        ))}
                                    </tr>
                                );
                            })}
                        </>
                    )}
                </tbody>
            </table>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------
export const BenchmarkReportPanel = ({
    runs, error, setError, onUpload, onRemoveRun,
    customLabels, setCustomLabels,
    baselineRunId, setBaselineRunId,
    selectedStages, setSelectedStages,
    onOpenComparison,
}) => {
    // runId currently being renamed, or null
    const [editingRunId, setEditingRunId] = React.useState(null);
    const [editingValue, setEditingValue] = React.useState('');
    const [collisionEdit, setCollisionEdit] = React.useState(false);

    const getLabel = (run) => customLabels[run.runId] || run.runLabel;

    const startEdit = (run) => {
        setEditingRunId(run.runId);
        setEditingValue(getLabel(run));
    };

    const commitEdit = () => {
        if (editingRunId) {
            const trimmed = editingValue.trim();
            if (trimmed) {
                setCustomLabels(prev => ({ ...prev, [editingRunId]: trimmed }));
            }
        }
        setEditingRunId(null);
        setCollisionEdit(false);
    };

    const cancelEdit = () => {
        setEditingRunId(null);
        setCollisionEdit(false);
    };

    // Track which run IDs were present on the previous render so we can
    // identify newly added runs.
    const prevRunIdsRef = React.useRef(new Set());

    // Auto-select first run as baseline when runs change.
    React.useEffect(() => {
        if (runs.length > 0 && (!baselineRunId || !runs.find(r => r.runId === baselineRunId))) {
            setBaselineRunId(runs[0].runId);
        }
        if (runs.length === 0) setBaselineRunId(null);
    }, [runs, baselineRunId, setBaselineRunId]);

    // When new runs are added, check for label collisions and auto-trigger
    // rename mode on any new run whose label matches an existing one.
    React.useEffect(() => {
        const prevIds = prevRunIdsRef.current;
        const newRuns = runs.filter(r => !prevIds.has(r.runId));

        if (newRuns.length > 0 && !editingRunId) {
            for (const newRun of newRuns) {
                const newLabel = getLabel(newRun);
                const hasCollision = runs.some(
                    r => r.runId !== newRun.runId && getLabel(r) === newLabel
                );
                if (hasCollision) {
                    setEditingRunId(newRun.runId);
                    setEditingValue(newLabel);
                    setCollisionEdit(true);
                    break;
                }
            }
        }

        prevRunIdsRef.current = new Set(runs.map(r => r.runId));
    }, [runs]);

    const setStageForRun = (runId, idx) => {
        setSelectedStages(prev => ({ ...prev, [runId]: idx }));
    };

    const showTable = runs.length >= 2 && baselineRunId;

    return (
        <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 p-4 animate-in slide-in-from-top-2 duration-200">
            <div className="space-y-3">

                {/* Error banner */}
                {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 px-3 py-2 rounded text-xs flex items-start gap-2">
                        <AlertCircle size={12} className="mt-0.5 shrink-0" />
                        <span>{error}</span>
                        <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X size={10} /></button>
                    </div>
                )}

                {/* Drop zone — always visible, additive uploads */}
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Upload Report Files</label>
                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-5 flex flex-col items-center justify-center text-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors relative group cursor-pointer">
                        <input
                            type="file"
                            multiple
                            accept=".yaml,.yml"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={onUpload}
                        />
                        <FileJson size={20} className="text-slate-400 mb-1.5 group-hover:text-violet-500 transition-colors" />
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            Drag & drop files or <span className="text-violet-500">browse</span>
                        </span>
                        <span className="text-[10px] text-slate-400 mt-1">
                            benchmark_report_v0.2,_*.yaml — new files are added to existing
                        </span>
                    </div>
                </div>

                {/* Uploaded runs list */}
                {runs.length > 0 && (
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">
                            Uploaded Runs ({runs.length})
                        </label>
                        {runs.map(run => {
                            const isBaseline = run.runId === baselineRunId;
                            const stageIdx = selectedStages[run.runId] ?? 0;
                            return (
                                <div
                                    key={run.runId}
                                    className={`rounded-md border px-3 py-2 text-xs flex flex-col gap-1.5 ${isBaseline ? 'border-violet-400 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/10' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        {/* Inline label — click to rename */}
                                        {editingRunId === run.runId ? (
                                            <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                                                <input
                                                    autoFocus
                                                    value={editingValue}
                                                    onChange={e => setEditingValue(e.target.value)}
                                                    onBlur={commitEdit}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') commitEdit();
                                                        if (e.key === 'Escape') cancelEdit();
                                                    }}
                                                    className="w-full text-xs font-medium bg-white dark:bg-slate-800 border border-violet-400 rounded px-1.5 py-0.5 text-slate-800 dark:text-slate-200 focus:outline-none"
                                                />
                                                {collisionEdit && (
                                                    <span className="text-[9px] text-amber-500">
                                                        Duplicate name — give this run a unique name
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => startEdit(run)}
                                                title="Click to rename"
                                                className="flex-1 flex items-center gap-1.5 min-w-0 text-left group"
                                            >
                                                <span className="font-medium text-slate-800 dark:text-slate-200 truncate text-xs">
                                                    {getLabel(run)}
                                                </span>
                                                <Pencil size={10} className="shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-violet-400 transition-colors" />
                                            </button>
                                        )}
                                        <div className="flex items-center gap-1 shrink-0">
                                            {/* Baseline toggle */}
                                            <button
                                                onClick={() => setBaselineRunId(run.runId)}
                                                title={isBaseline ? 'Baseline' : 'Set as baseline'}
                                                className={`p-1 rounded transition-colors ${isBaseline ? 'text-violet-500' : 'text-slate-300 hover:text-violet-400 dark:text-slate-600 dark:hover:text-violet-400'}`}
                                            >
                                                <Star size={12} fill={isBaseline ? 'currentColor' : 'none'} />
                                            </button>
                                            {/* Remove */}
                                            <button
                                                onClick={() => {
                                                    onRemoveRun(run.runId);
                                                    setCustomLabels(prev => {
                                                        const next = { ...prev };
                                                        delete next[run.runId];
                                                        return next;
                                                    });
                                                }}
                                                title="Remove run"
                                                className="p-1 rounded text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Stage selector */}
                                    {run.stages.length === 1 ? (
                                        <span className="text-[10px] text-slate-400">{stageLabel(run.stages[0])}</span>
                                    ) : (
                                        <select
                                            value={stageIdx}
                                            onChange={e => setStageForRun(run.runId, Number(e.target.value))}
                                            className="text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-slate-600 dark:text-slate-300 focus:outline-none focus:border-violet-400 w-full"
                                        >
                                            {run.stages.map((s, i) => (
                                                <option key={i} value={i}>{stageLabel(s)}</option>
                                            ))}
                                        </select>
                                    )}

                                    {/* Scenario summary */}
                                    <div className="text-[9px] text-slate-400 flex flex-wrap gap-x-2">
                                        <span>{run.stages[stageIdx]?.scenario.model || '—'}</span>
                                        <span>{run.stages[stageIdx]?.scenario.hardware || '—'}</span>
                                        {run.stages[stageIdx]?.scenario.acceleratorCount != null && (
                                            <span>×{run.stages[stageIdx].scenario.acceleratorCount} GPUs</span>
                                        )}
                                        {run.stages[stageIdx]?.scenario.tp != null && (
                                            <span>TP{run.stages[stageIdx].scenario.tp}</span>
                                        )}
                                        {run.stages[stageIdx]?.timestamp && (
                                            <span className="ml-auto font-mono text-slate-300 dark:text-slate-600">
                                                {new Date(run.stages[stageIdx].timestamp).toLocaleString(undefined, {
                                                    month: 'short', day: 'numeric',
                                                    hour: '2-digit', minute: '2-digit',
                                                })}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Hint when only one run uploaded */}
                {runs.length === 1 && (
                    <p className="text-[10px] text-slate-400 text-center py-1">
                        Upload at least one more run to compare.
                    </p>
                )}

                {/* Open full comparison view */}
                {runs.length >= 2 && (
                    <button
                        onClick={onOpenComparison}
                        className="w-full py-2 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-500 text-white transition-colors flex items-center justify-center gap-2"
                    >
                        Open Comparison View
                    </button>
                )}
            </div>
        </div>
    );
};
