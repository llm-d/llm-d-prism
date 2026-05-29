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
import { FileJson, X, AlertCircle, Pencil, Star, Loader, CheckSquare, Square, RefreshCw, Trash2 } from "lucide-react";

const stageSummary = (stage) => {
    if (!stage) return '—';
    const idx = stage.stageIndex !== null ? `Stage ${stage.stageIndex}` : 'Stage —';
    const qps = stage.scenario?.rateQps != null ? ` · ${stage.scenario.rateQps} QPS` : '';
    return `${idx}${qps}`;
};

export const BenchmarkReportPanel = ({
    runs, error, setError, onUpload, onRemoveRun,
    customLabels, setCustomLabels,
    getRunBenchmarkKey, baselineBenchmarkKey, setBaselineBenchmarkKey,
    loading = false,
}) => {
    const [editingRunId, setEditingRunId] = React.useState(null);
    const [editingValue, setEditingValue] = React.useState('');
    const [collisionEdit, setCollisionEdit] = React.useState(false);
    const [selectedRunIds, setSelectedRunIds] = React.useState(new Set());

    const toggleRunSelection = (runId) => {
        setSelectedRunIds(prev => {
            const next = new Set(prev);
            if (next.has(runId)) {
                next.delete(runId);
            } else {
                next.add(runId);
            }
            return next;
        });
    };

    const handleSelectionAction = () => {
        if (selectedRunIds.size > 0) {
            // Invert Selection
            setSelectedRunIds(prev => {
                const next = new Set();
                runs.forEach(run => {
                    if (!prev.has(run.runId)) {
                        next.add(run.runId);
                    }
                });
                return next;
            });
        } else {
            // Select All
            setSelectedRunIds(new Set(runs.map(r => r.runId)));
        }
    };

    const handleDeleteSelected = () => {
        selectedRunIds.forEach(runId => {
            onRemoveRun(runId);
            setCustomLabels(prev => {
                const next = { ...prev };
                delete next[runId];
                return next;
            });
        });
        setSelectedRunIds(new Set());
    };
    const [isDragging, setIsDragging] = React.useState(false);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        setIsDragging(false);
        setError(null);

        const items = e.dataTransfer.items;
        if (!items || items.length === 0) return;

        const files = [];

        const readAllEntries = async (directoryReader) => {
            let allEntries = [];
            const readBatch = async () => {
                const entries = await new Promise((resolve) => directoryReader.readEntries(resolve));
                if (entries.length > 0) {
                    allEntries.push(...entries);
                    await readBatch();
                }
            };
            await readBatch();
            return allEntries;
        };

        const traverseEntry = async (entry) => {
            if (entry.isFile) {
                const file = await new Promise((resolve) => entry.file(resolve));
                files.push(file);
            } else if (entry.isDirectory) {
                const directoryReader = entry.createReader();
                const entries = await readAllEntries(directoryReader);
                for (const subEntry of entries) {
                    await traverseEntry(subEntry);
                }
            }
        };

        const promises = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const entry = item.webkitGetAsEntry();
                if (entry) {
                    promises.push(traverseEntry(entry));
                }
            }
        }

        await Promise.all(promises);
        
        if (files.length > 0) {
            onUpload(files);
        }
    };

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
    }, [runs, editingRunId]);

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
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Upload Report Files / Folder</label>
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-lg p-5 flex flex-col items-center justify-center text-center transition-colors relative group cursor-pointer ${
                            isDragging
                                ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                                : 'border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                    >
                        <input
                            type="file"
                            multiple
                            accept=".yaml,.yml"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={onUpload}
                            disabled={loading}
                        />
                        {loading ? (
                            <Loader size={20} className="animate-spin text-cyan-500 mb-1.5" />
                        ) : (
                            <FileJson size={20} className={`mb-1.5 transition-colors ${isDragging ? 'text-cyan-500' : 'text-slate-400 group-hover:text-cyan-500'}`} />
                        )}
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            {loading ? (
                                <span>Processing files...</span>
                            ) : (
                                <span>Drag & drop files/folders or <span className="text-cyan-500">browse files</span></span>
                            )}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-1">
                            benchmark_report_v0.2,_*.yaml — new files are added to existing
                        </span>
                    </div>
                    {/* Directory Upload Option */}
                    <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 pt-2">
                        <span>Or, upload a whole run directory:</span>
                        {loading ? (
                            <span className="text-slate-400 dark:text-slate-600 font-semibold flex items-center gap-1 cursor-not-allowed">
                                Select Directory
                            </span>
                        ) : (
                            <label className="text-cyan-500 dark:text-cyan-400 hover:text-cyan-600 cursor-pointer font-semibold flex items-center gap-1">
                                <span>Select Directory</span>
                                <input
                                    type="file"
                                    webkitdirectory="true"
                                    directory="true"
                                    multiple
                                    className="hidden"
                                    onChange={onUpload}
                                    disabled={loading}
                                />
                            </label>
                        )}
                    </div>
                </div>

                {/* Uploaded runs list */}
                {runs.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-slate-500 uppercase block">
                                Uploaded Runs ({runs.length})
                            </label>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleSelectionAction}
                                    className="text-[10px] font-semibold text-cyan-600 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 transition-colors flex items-center gap-1"
                                >
                                    {selectedRunIds.size > 0 ? (
                                        <>
                                            <RefreshCw size={10} />
                                            Invert
                                        </>
                                    ) : (
                                        <>
                                            <CheckSquare size={10} />
                                            Select All
                                        </>
                                    )}
                                </button>
                                {selectedRunIds.size > 0 && (
                                    <>
                                        <span className="text-[9px] text-slate-300 dark:text-slate-700">|</span>
                                        <button
                                            onClick={handleDeleteSelected}
                                            className="text-[10px] font-semibold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors flex items-center gap-1"
                                        >
                                            <Trash2 size={10} />
                                            Delete ({selectedRunIds.size})
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                        {runs.map(run => {
                            const runKey = getRunBenchmarkKey ? getRunBenchmarkKey(run.runId) : null;
                            const isBaseline = !!runKey && runKey === baselineBenchmarkKey;
                            const canSetBaseline = !!runKey && !!setBaselineBenchmarkKey;
                            return (
                                <div
                                    key={run.runId}
                                    className={`rounded-md border px-3 py-2 text-xs flex flex-col gap-1.5 ${
                                        isBaseline
                                            ? 'border-purple-400 dark:border-purple-500 ring-1 ring-purple-400/40 bg-purple-50/40 dark:bg-purple-950/30'
                                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            {/* Selection Checkbox */}
                                            <input
                                                type="checkbox"
                                                checked={selectedRunIds.has(run.runId)}
                                                onChange={() => toggleRunSelection(run.runId)}
                                                className="h-3.5 w-3.5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                                            />
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
                                                        className="w-full text-xs font-medium bg-white dark:bg-slate-800 border border-cyan-400 rounded px-1.5 py-0.5 text-slate-800 dark:text-slate-200 focus:outline-none"
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
                                                    <Pencil size={10} className="shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-cyan-400 transition-colors" />
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => {
                                                    if (!canSetBaseline) return;
                                                    setBaselineBenchmarkKey(isBaseline ? null : runKey);
                                                }}
                                                disabled={!canSetBaseline}
                                                title={
                                                    !canSetBaseline
                                                        ? 'Run not yet selected — open Benchmark Browser to enable baseline'
                                                        : isBaseline
                                                            ? 'Click to clear baseline'
                                                            : 'Set as baseline (★) for Δ% comparison'
                                                }
                                                className={`p-1 rounded transition-colors ${
                                                    !canSetBaseline
                                                        ? 'text-slate-200 dark:text-slate-700 cursor-not-allowed'
                                                        : isBaseline
                                                            ? 'text-purple-500 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300'
                                                            : 'text-slate-300 dark:text-slate-600 hover:text-purple-500 dark:hover:text-purple-400'
                                                }`}
                                            >
                                                <Star size={14} fill={isBaseline ? 'currentColor' : 'none'} />
                                            </button>
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

                                    {/* Stage summary — read-only since each stage now renders as its own scatter point */}
                                    <div className="text-[10px] text-slate-400">
                                        {run.stages.length === 1
                                            ? stageSummary(run.stages[0])
                                            : `${run.stages.length} stages plotted on chart`}
                                    </div>

                                    {/* Scenario summary */}
                                    {run.stages[0] && (
                                        <div className="text-[9px] text-slate-400 flex flex-wrap gap-x-2">
                                            <span>{run.stages[0].scenario.model || '—'}</span>
                                            <span>{run.stages[0].scenario.hardware || '—'}</span>
                                            {run.stages[0].scenario.acceleratorCount != null && (
                                                <span>×{run.stages[0].scenario.acceleratorCount} GPUs</span>
                                            )}
                                            {run.stages[0].scenario.tp != null && (
                                                <span>TP{run.stages[0].scenario.tp}</span>
                                            )}
                                            {run.stages[0].timestamp && (
                                                <span className="ml-auto font-mono text-slate-300 dark:text-slate-600">
                                                    {new Date(run.stages[0].timestamp).toLocaleString(undefined, {
                                                        month: 'short', day: 'numeric',
                                                        hour: '2-digit', minute: '2-digit',
                                                    })}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Hint pointing at the chart */}
                {runs.length > 0 && (
                    <p className="text-[10px] text-slate-400 text-center py-1">
                        Open the Benchmark Browser and pick a baseline (★) on a row to compare runs.
                    </p>
                )}
            </div>
        </div>
    );
};
