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

import React, { useState } from 'react';
import { RotateCcw, ChevronDown, ChevronUp, Star, CheckSquare, Square, Check, Pencil, Trash2 } from 'lucide-react';
import { getEffectiveTp, getBucket, getSourceTag, getSourceType, getSourceTypeStyle, formatOriginLabel } from '../../utils/dashboardHelpers';

const getCleanModelName = (name) => {
    if (!name) return '';
    return name.replace(/\s*\[.*?\]/g, '').replace(/\s*\(.*?\)/g, '').trim();
};

export const UnifiedDataTable = (props) => {
    const [editingRunId, setEditingRunId] = useState(null);
    const [editingValue, setEditingValue] = useState('');

    const commitEdit = () => {
        if (editingRunId && setBrv02CustomLabels) {
            const trimmed = editingValue.trim();
            if (trimmed) {
                setBrv02CustomLabels(prev => ({ ...prev, [editingRunId]: trimmed }));
            }
        }
        setEditingRunId(null);
    };

    const cancelEdit = () => {
        setEditingRunId(null);
    };

    const [isDraggingSelection, setIsDraggingSelection] = useState(false);
    const dragStartPagePos = React.useRef({ x: 0, y: 0 });
    const lastPointerPos = React.useRef({ x: 0, y: 0 });
    const [dragBox, setDragBox] = useState(null);
    const dragActionSelect = React.useRef(true);
    const initialSelection = React.useRef(new Set());

    const {
        modelStats, selectedModels, filteredBySource, showSelectedOnly: propShowSelectedOnly, setShowSelectedOnly,
        selectedBenchmarks, setSelectedBenchmarks, setActiveFilters, expandedModels,
        toggleBenchmark, toggleModelExpansion,
        baselineBenchmarkKey, setBaselineBenchmarkKey,
        hideShowSelectedOnly = false,
        renameClearToUnselectAll = false,
        brv02Runs = [], brv02CustomLabels = {}, setBrv02CustomLabels, removeBrv02Run,
        groupBy = 'Model',
        sortByField = 'timestamp',
        sortDirection = 'desc',
        visibleSpecs = {
            hardware: true,
            timestamp: true,
            stage: true,
            nodes: false,
            islOsl: false,
            maxTput: true,
            minLat: true,
            qps: false,
            inputTput: false,
            outputTput: false,
            totalTput: false,
            ntpot: false,
            tpot: false,
            itl: false,
            ttft: false,
            e2e: false,
            costIn: false,
            costOut: false,
            inputLen: false,
            outputLen: false
        }
    } = props;

    const hasNonLocalSelected = React.useMemo(() => {
        if (!selectedBenchmarks || selectedBenchmarks.size === 0) return false;
        return Array.from(selectedBenchmarks).some(key => {
            const stat = modelStats.find(s => s.benchmarkKey === key);
            if (!stat) return false;
            const sourceStr = stat.data?.[0]?.source || '';
            return !sourceStr.startsWith('brv02:');
        });
    }, [selectedBenchmarks, modelStats]);

    const handleDeleteSelected = () => {
        if (!removeBrv02Run) return;
        selectedBenchmarks.forEach(key => {
            const stat = modelStats.find(s => s.benchmarkKey === key);
            if (stat) {
                const benchmarkData = stat.data || [];
                const sourceStr = benchmarkData[0]?.source || '';
                const isBrv02 = sourceStr.startsWith('brv02:');
                const runId = isBrv02 ? sourceStr.replace('brv02:', '') : null;
                if (isBrv02 && runId) {
                    removeBrv02Run(runId);
                }
            }
        });
        setSelectedBenchmarks(new Set());
    };

    React.useEffect(() => {
        if (!isDraggingSelection) return;

        const updateDragSelection = () => {
            const vStartX = dragStartPagePos.current.x - window.scrollX;
            const vStartY = dragStartPagePos.current.y - window.scrollY;
            const vCurrentX = lastPointerPos.current.x;
            const vCurrentY = lastPointerPos.current.y;

            setDragBox({
                startX: vStartX,
                startY: vStartY,
                currentX: vCurrentX,
                currentY: vCurrentY
            });

            const minX = Math.min(vStartX, vCurrentX);
            const maxX = Math.max(vStartX, vCurrentX);
            const minY = Math.min(vStartY, vCurrentY);
            const maxY = Math.max(vStartY, vCurrentY);

            const checkboxes = document.querySelectorAll('.benchmark-checkbox-area');
            const newSelected = new Set(initialSelection.current);

            checkboxes.forEach(cb => {
                const rect = cb.getBoundingClientRect();
                // Check if the checkbox overlaps in 2D with the drag range
                if (rect.bottom >= minY && rect.top <= maxY && rect.right >= minX && rect.left <= maxX) {
                    const key = cb.getAttribute('data-benchmark-key');
                    if (key) {
                        if (dragActionSelect.current) {
                            newSelected.add(key);
                        } else {
                            newSelected.delete(key);
                        }
                    }
                }
            });

            setSelectedBenchmarks(newSelected);
        };

        const handlePointerMove = (e) => {
            lastPointerPos.current = { x: e.clientX, y: e.clientY };
            updateDragSelection();
        };

        const handleScroll = () => {
            updateDragSelection();
        };

        const handlePointerUp = () => {
            setIsDraggingSelection(false);
            setDragBox(null);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
            window.removeEventListener('scroll', handleScroll);
        };
    }, [isDraggingSelection, setSelectedBenchmarks]);

    const handleCheckboxPointerDown = (e, key, isCurrentlySelected) => {
        // Only trigger on left mouse button or touch
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        dragStartPagePos.current = { x: e.clientX + window.scrollX, y: e.clientY + window.scrollY };
        lastPointerPos.current = { x: e.clientX, y: e.clientY };
        setDragBox({
            startX: e.clientX,
            startY: e.clientY,
            currentX: e.clientX,
            currentY: e.clientY
        });

        const willSelect = !isCurrentlySelected;
        dragActionSelect.current = willSelect;
        
        // Take a snapshot of the selection BEFORE this click so that the
        // pointermove loop can cleanly apply additions/deletions onto it.
        initialSelection.current = new Set(selectedBenchmarks);
        
        setIsDraggingSelection(true);
        
        // Immediately toggle the one we pressed on
        setSelectedBenchmarks(prev => {
            const newSelected = new Set(prev);
            if (willSelect) newSelected.add(key);
            else newSelected.delete(key);
            return newSelected;
        });
    };



    const showSelectedOnly = hideShowSelectedOnly ? false : propShowSelectedOnly;

    const toggleBaseline = (key) => {
        if (!setBaselineBenchmarkKey) return;
        setBaselineBenchmarkKey(prev => (prev === key ? null : key));
    };

    const clearFilters = () => {
        setActiveFilters({
            models: new Set(), hardware: new Set(), machines: new Set(), precisions: new Set(),
            tp: new Set(), isl: new Set(), osl: new Set(), ratio: new Set(),
            acc_count: new Set(), modelServer: new Set(), useCase: new Set(),
            servingStack: new Set(), optimizations: new Set(), components: new Set(),
            pdRatio: new Set(), origins: new Set(), connectionNames: new Set()
        });
        setShowSelectedOnly(false);
    };

    const filteredStats = React.useMemo(() => {
        return modelStats.filter(stat => !showSelectedOnly || selectedBenchmarks.has(stat.benchmarkKey));
    }, [modelStats, showSelectedOnly, selectedBenchmarks]);

    const sortedStats = React.useMemo(() => {
        return [...filteredStats].sort((a, b) => {
            let valA, valB;
            
            if (sortByField === 'timestamp') {
                valA = a.timestamp || 0;
                valB = b.timestamp || 0;
            } else if (sortByField === 'maxTput') {
                valA = a.maxTput || 0;
                valB = b.maxTput || 0;
            } else if (sortByField === 'minLat') {
                valA = a.minLat || (sortDirection === 'asc' ? Infinity : -Infinity);
                valB = b.minLat || (sortDirection === 'asc' ? Infinity : -Infinity);
            } else if (sortByField === 'model') {
                valA = a.model || '';
                valB = b.model || '';
            } else {
                const getPeakRunMetric = (stat, field) => {
                    const peakRun = stat.data?.reduce((prev, curr) => (curr?.throughput || 0) > (prev?.throughput || 0) ? curr : prev, stat.data[0]) || {};
                    if (field === 'qps') return peakRun.metrics?.request_rate || peakRun.qps || 0;
                    if (field === 'inputTput') return peakRun.metrics?.input_tput || 0;
                    if (field === 'outputTput') return peakRun.metrics?.output_tput || peakRun.throughput || 0;
                    if (field === 'totalTput') return peakRun.metrics?.total_tput || 0;
                    if (field === 'ntpot') return peakRun.metrics?.ntpot || peakRun.ntpot || 0;
                    if (field === 'tpot') return peakRun.metrics?.tpot || peakRun.time_per_output_token || 0;
                    if (field === 'itl') return peakRun.metrics?.itl || peakRun.itl || 0;
                    if (field === 'ttft') return peakRun.metrics?.ttft?.mean || peakRun.ttft?.mean || 0;
                    if (field === 'e2e') return peakRun.metrics?.e2e_latency || peakRun.latency?.mean || 0;
                    if (field === 'costIn') return peakRun.metrics?.cost?.explicit_input || 0;
                    if (field === 'costOut') return peakRun.metrics?.cost?.explicit_output || 0;
                    return 0;
                };
                valA = getPeakRunMetric(a, sortByField);
                valB = getPeakRunMetric(b, sortByField);
            }
            
            let primaryResult = 0;
            if (typeof valA === 'string' && typeof valB === 'string') {
                primaryResult = sortDirection === 'asc' 
                    ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' }) 
                    : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });
            } else {
                primaryResult = sortDirection === 'asc' ? valA - valB : valB - valA;
            }

            if (primaryResult !== 0 && !isNaN(primaryResult)) {
                return primaryResult;
            }

            // Fallback tie-breaker: Origin/Folder first, then Filename
            const firstA = a.data?.[0];
            const firstB = b.data?.[0];
            
            const originA = firstA?.source_info?.origin || firstA?.source || '';
            const originB = firstB?.source_info?.origin || firstB?.source || '';
            
            const originCmp = originA.localeCompare(originB, undefined, { numeric: true, sensitivity: 'base' });
            if (originCmp !== 0) {
                return originCmp;
            }
            
            const fileA = firstA?.source_info?.file_identifier || firstA?.filename || '';
            const fileB = firstB?.source_info?.file_identifier || firstB?.filename || '';
            
            const fileCmp = fileA.localeCompare(fileB, undefined, { numeric: true, sensitivity: 'base' });
            if (fileCmp !== 0) {
                return fileCmp;
            }

            return (a.benchmarkKey || '').localeCompare(b.benchmarkKey || '', undefined, { numeric: true, sensitivity: 'base' });
        });
    }, [filteredStats, sortByField, sortDirection]);

    const needsExpansion = sortedStats.length > 4;

    const groupedStats = React.useMemo(() => {
        const grouped = {};
        if (groupBy !== 'None') {
            // Build a mapping of lowercase clean model names to their first seen nicely-cased clean name
            const canonicalCasing = {};
            sortedStats.forEach(stat => {
                if (groupBy === 'Model') {
                    const rawName = stat.model_name || stat.model || 'Unknown Model';
                    const clean = getCleanModelName(rawName);
                    const cleanLower = clean.toLowerCase();
                    if (!canonicalCasing[cleanLower]) {
                        canonicalCasing[cleanLower] = clean;
                    }
                }
            });

            sortedStats.forEach(stat => {
                let key = 'Other';
                if (groupBy === 'Model') {
                    const rawName = stat.model_name || stat.model || 'Unknown Model';
                    const clean = getCleanModelName(rawName);
                    key = canonicalCasing[clean.toLowerCase()] || clean;
                }
                if (groupBy === 'Hardware') key = stat.hardware || 'Unknown Hardware';
                if (groupBy === 'Origin') {
                    const origin = stat.data?.[0]?.source_info?.origin || stat.data?.[0]?.source;
                    key = origin ? getSourceTag(stat.data[0]) : 'Unknown Origin';
                }
                if (groupBy === 'OriginFolder') {
                    const origin = stat.data?.[0]?.source_info?.origin || stat.data?.[0]?.source;
                    key = origin ? formatOriginLabel(origin) : 'Unknown Origin/Folder';
                }
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(stat);
            });
        } else {
            grouped['All'] = sortedStats;
        }
        return grouped;
    }, [sortedStats, groupBy]);

    const selectAllVisible = () => {
        const allVisible = new Set(sortedStats.map(s => s.benchmarkKey));
        setSelectedBenchmarks(allVisible);
    };

    const invertSelected = () => {
        const inverted = new Set(sortedStats.map(s => s.benchmarkKey).filter(k => !selectedBenchmarks.has(k)));
        setSelectedBenchmarks(inverted);
    };

    const clearSelected = () => {
        setSelectedBenchmarks(new Set());
    };

    const toggleGroup = (groupStats, isAllSelected) => {
        const newSelected = new Set(selectedBenchmarks);
        if (isAllSelected) {
            groupStats.forEach(s => newSelected.delete(s.benchmarkKey));
        } else {
            groupStats.forEach(s => newSelected.add(s.benchmarkKey));
        }
        setSelectedBenchmarks(newSelected);
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-1 border-b border-slate-200 dark:border-slate-700/50 pb-3">
                <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {modelStats.length} matching benchmarks
                        </span>
                        <span className="text-xs text-slate-500">
                            {selectedBenchmarks.size} selected
                        </span>
                    </div>
                    
                    {!hideShowSelectedOnly && (
                        <>
                            <div className="h-8 w-px bg-slate-300 dark:bg-slate-700" />
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Show selected only</span>
                                <button 
                                    onClick={() => setShowSelectedOnly(!showSelectedOnly)}
                                    className={`w-9 h-5 rounded-full relative transition-colors shadow-inner ${showSelectedOnly ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                                >
                                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${showSelectedOnly ? 'translate-x-4' : 'translate-x-0'}`} />
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {selectedBenchmarks.size === 0 ? (
                        <>
                            <button
                                onClick={selectAllVisible}
                                className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                                Select All Visible
                            </button>
                            <button
                                onClick={clearFilters}
                                className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 border border-transparent text-slate-600 dark:text-slate-400 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
                            >
                                <RotateCcw size={12} /> Clear Filters
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={invertSelected}
                                className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                                Invert Selected
                            </button>
                            <button
                                onClick={clearSelected}
                                className="px-3 py-1.5 text-xs font-medium bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400 rounded hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                            >
                                {renameClearToUnselectAll ? "Unselect All" : "Clear Selected"}
                            </button>
                            <div className="relative group flex items-center">
                                <button
                                    onClick={handleDeleteSelected}
                                    disabled={hasNonLocalSelected}
                                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                                        hasNonLocalSelected
                                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700/50 cursor-not-allowed opacity-50'
                                            : 'bg-red-600 hover:bg-red-500 text-white shadow-sm border border-transparent'
                                    }`}
                                >
                                    Delete Selected
                                </button>
                                {hasNonLocalSelected && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-800 border border-slate-700/80 text-white text-xs font-medium rounded-lg invisible group-hover:visible shadow-xl z-[99999] whitespace-nowrap flex items-center gap-2">
                                        Non-local data sources are read-only.
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Stacked Cards List Container */}
            <div className="relative">
                <div className="flex flex-col gap-4 pr-1">
                    {modelStats.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
                        <span className="mb-3">No benchmarks match your current filters.</span>
                        <button 
                            onClick={clearFilters}
                            className="text-blue-500 hover:text-blue-400 hover:underline text-sm flex items-center gap-1 font-medium"
                        >
                            <RotateCcw size={14} /> Clear all filters
                        </button>
                    </div>
                ) : (
                    Object.entries(groupedStats).map(([groupKey, stats]) => {
                        const isAllSelected = stats.every(s => selectedBenchmarks.has(s.benchmarkKey));
                        return (
                        <div key={groupKey} className="flex flex-col gap-2">
                            {groupBy !== 'None' && (
                                <div className="sticky top-0 z-10 bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur py-1.5 px-3 rounded text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-y border-slate-200 dark:border-slate-700/50 flex items-center gap-3">
                                    <div 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleGroup(stats, isAllSelected);
                                        }}
                                        className="w-5 h-5 flex-shrink-0 flex items-center justify-center cursor-pointer transition-colors"
                                    >
                                        <div className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all ${
                                            isAllSelected ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                                        }`}>
                                            {isAllSelected && <Check size={10} strokeWidth={3} />}
                                        </div>
                                    </div>
                                    {groupKey}
                                </div>
                            )}
                            
                            <div className="flex flex-col gap-2">
                                {stats.map(stat => {
                                    const isSelected = selectedBenchmarks.has(stat.benchmarkKey);
                                    const isExpanded = expandedModels.has(stat.benchmarkKey || stat.model);
                                    const isBaseline = stat.benchmarkKey === baselineBenchmarkKey;
                                    
                                    const benchmarkData = stat.data || [];
                                    const meta = benchmarkData[0]?.metadata || {};
                                    const sourceStr = benchmarkData[0]?.source || '';
                                    const isBrv02 = sourceStr.startsWith('brv02:');
                                    const runId = isBrv02 ? sourceStr.replace('brv02:', '') : null;
                                    const tp = getEffectiveTp(benchmarkData[0]) || '-';
                                    
                                    const uniqueIsl = [...new Set(benchmarkData.map(d => getBucket(d.isl || d.workload?.input_tokens)))];
                                    const uniqueOsl = [...new Set(benchmarkData.map(d => getBucket(d.osl || d.workload?.output_tokens)))];
                                    
                                    const isl = uniqueIsl.length === 1 ? uniqueIsl[0] : (uniqueIsl.length > 1 ? 'Var' : '-');
                                    const osl = uniqueOsl.length === 1 ? uniqueOsl[0] : (uniqueOsl.length > 1 ? 'Var' : '-');

                                    return (
                                        <div 
                                            key={stat.benchmarkKey || stat.model}
                                            className={`flex flex-col bg-white dark:bg-slate-900 border rounded-lg overflow-hidden transition-all shadow-sm ${
                                                isSelected 
                                                    ? 'border-blue-400 dark:border-blue-600 ring-1 ring-blue-400 dark:ring-blue-600/50' 
                                                    : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                                            } ${isBaseline ? 'ring-2 ring-cyan-400/50' : ''}`}
                                        >
                                            {/* Card Main Row (Header) */}
                                            <div className="flex items-stretch min-h-[60px]">
                                                {/* Left Checkbox Area (Dedicated Click Target) */}
                                                <div 
                                                    onPointerDown={(e) => handleCheckboxPointerDown(e, stat.benchmarkKey, isSelected)}
                                                    className={`benchmark-checkbox-area w-12 flex-shrink-0 flex items-center justify-center cursor-pointer border-r transition-colors select-none ${
                                                        isSelected 
                                                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
                                                            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                                                    }`}
                                                    data-benchmark-key={stat.benchmarkKey}
                                                    style={{ touchAction: 'none' }}
                                                >
                                                    <div className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
                                                        isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                                                    }`}>
                                                        {isSelected && <Check size={14} strokeWidth={3} />}
                                                    </div>
                                                </div>

                                                {/* Card Content Area (Expand Toggle) */}
                                                <div 
                                                    onClick={() => toggleModelExpansion(stat.benchmarkKey || stat.model)}
                                                    className="flex-1 flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors gap-3"
                                                >
                                                    {/* Left side info block */}
                                                    <div className="flex-1 flex flex-wrap sm:flex-nowrap items-center gap-4 min-w-0">
                                                        {/* Specs list container */}
                                                        {(() => {
                                                            let nodesAndParallelismText = '';
                                                            if (meta.prefill_node_count > 0 || meta.decode_node_count > 0) {
                                                                const totalNodes = (meta.prefill_node_count || 0) + (meta.decode_node_count || 0);
                                                                const config = meta.configuration || '';
                                                                const pTpMatch = config.match(/(\d+)P-TP(\d+)/i);
                                                                const dTpMatch = config.match(/(\d+)D-TP(\d+)/i);
                                                                const pTp = pTpMatch ? pTpMatch[2] : '?';
                                                                const dTp = dTpMatch ? dTpMatch[2] : '?';
                                                                nodesAndParallelismText = `${totalNodes} nodes (P:${meta.prefill_node_count}-TP${pTp} | D:${meta.decode_node_count}-TP${dTp})`;
                                                            } else {
                                                                const totalNodes = stat.node_count || stat.accelerator_count || 1;
                                                                const displayTp = tp !== '-' ? tp : (getEffectiveTp(stat) || '');
                                                                nodesAndParallelismText = `${totalNodes} node${totalNodes > 1 ? 's' : ''}${displayTp && displayTp !== '-' ? ` (${displayTp})` : ''}`;
                                                            }

                                                            const peakRun = benchmarkData.reduce((prev, curr) => {
                                                                const prevVal = prev?.metrics?.output_tput || prev?.throughput || 0;
                                                                const currVal = curr?.metrics?.output_tput || curr?.throughput || 0;
                                                                return currVal > prevVal ? curr : prev;
                                                            }, benchmarkData[0] || {});

                                                             const specs = [];

                                                             if (visibleSpecs.timestamp) {
                                                                 const timestampVal = benchmarkData[0]?.timestamp;
                                                                 if (timestampVal) {
                                                                     const d = new Date(timestampVal);
                                                                     if (!isNaN(d.getTime())) {
                                                                         specs.push(
                                                                             <span key="timestamp" className="inline-flex items-center gap-1">
                                                                                 <span className="text-slate-400 dark:text-slate-500 font-normal">Date:</span>
                                                                                 <span className="font-semibold text-slate-700 dark:text-slate-300">
                                                                                     {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                                                 </span>
                                                                             </span>
                                                                         );
                                                                     }
                                                                 }
                                                             }

                                                             if (visibleSpecs.stage) {
                                                                 const isBrv02Run = benchmarkData[0]?.source?.startsWith('brv02:');
                                                                 if (isBrv02Run) {
                                                                     const stageCount = benchmarkData.length;
                                                                     specs.push(
                                                                         <span key="stage" className="inline-flex items-center gap-1">
                                                                             <span className="text-slate-400 dark:text-slate-500 font-normal">Stages:</span>
                                                                             <span className="font-semibold text-slate-700 dark:text-slate-300">{stageCount} stages</span>
                                                                         </span>
                                                                     );
                                                                 } else {
                                                                     const stageVal = benchmarkData[0]?.workload?.stage;
                                                                     if (stageVal !== undefined && stageVal !== null && stageVal !== '') {
                                                                         specs.push(
                                                                             <span key="stage" className="inline-flex items-center gap-1">
                                                                                 <span className="text-slate-400 dark:text-slate-500 font-normal">Stage:</span>
                                                                                 <span className="font-semibold text-slate-700 dark:text-slate-300">{stageVal}</span>
                                                                             </span>
                                                                         );
                                                                     }
                                                                 }
                                                             }

                                                             if (visibleSpecs.hardware) {
                                                                specs.push(
                                                                    <span key="hardware" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Hardware:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{stat.accelerator_count}x {stat.hardware}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.nodes) {
                                                                specs.push(
                                                                    <span key="nodes" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Nodes:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{nodesAndParallelismText}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.islOsl) {
                                                                specs.push(
                                                                    <span key="islOsl" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">I/O Load:</span>
                                                                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{isl}/{osl}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.maxTput) {
                                                                specs.push(
                                                                    <span key="maxTput" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Max Tput:</span>
                                                                        <span className="font-bold text-green-600 dark:text-green-400">{stat.maxTput.toFixed(0)} <span className="text-[10px] font-normal opacity-70">tok/s</span></span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.minLat) {
                                                                specs.push(
                                                                    <span key="minLat" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Min Lat:</span>
                                                                        <span className="font-semibold text-amber-600 dark:text-amber-400">{stat.minLat ? `${stat.minLat.toFixed(0)} ms` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.qps) {
                                                                const qpsVal = peakRun.metrics?.request_rate || peakRun.qps;
                                                                specs.push(
                                                                    <span key="qps" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">QPS:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{qpsVal != null ? qpsVal.toFixed(2) : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.inputTput) {
                                                                const inVal = peakRun.metrics?.input_tput;
                                                                specs.push(
                                                                    <span key="inputTput" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Input Tput:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{inVal != null ? `${inVal.toFixed(0)} tok/s` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.outputTput) {
                                                                const outVal = peakRun.metrics?.output_tput || peakRun.throughput;
                                                                specs.push(
                                                                    <span key="outputTput" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Output Tput:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{outVal != null ? `${outVal.toFixed(0)} tok/s` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.totalTput) {
                                                                const totVal = peakRun.metrics?.total_tput;
                                                                specs.push(
                                                                    <span key="totalTput" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Total Tput:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{totVal != null ? `${totVal.toFixed(0)} tok/s` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.ntpot) {
                                                                const ntpotVal = peakRun.metrics?.ntpot || peakRun.ntpot;
                                                                specs.push(
                                                                    <span key="ntpot" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">NTPOT:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{ntpotVal != null ? `${ntpotVal.toFixed(2)} ms` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.tpot) {
                                                                const tpotVal = peakRun.metrics?.tpot || peakRun.time_per_output_token;
                                                                specs.push(
                                                                    <span key="tpot" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">TPOT:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{tpotVal != null ? `${tpotVal.toFixed(2)} ms` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.itl) {
                                                                const itlVal = peakRun.metrics?.itl || peakRun.itl;
                                                                specs.push(
                                                                    <span key="itl" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">ITL:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{itlVal != null ? `${itlVal.toFixed(2)} ms` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.ttft) {
                                                                const ttftVal = peakRun.metrics?.ttft?.mean || peakRun.ttft?.mean;
                                                                specs.push(
                                                                    <span key="ttft" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">TTFT:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{ttftVal != null ? `${ttftVal.toFixed(2)} ms` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.e2e) {
                                                                const e2eVal = (peakRun.metrics?.e2e_latency || peakRun.latency?.mean);
                                                                specs.push(
                                                                    <span key="e2e" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">E2E Latency:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{e2eVal != null ? `${(e2eVal / 1000).toFixed(2)} s` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.costIn) {
                                                                const costInVal = peakRun.metrics?.cost?.explicit_input;
                                                                specs.push(
                                                                    <span key="costIn" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Cost/1M In:</span>
                                                                        <span className="font-semibold text-slate-500">{costInVal > 0 ? `$${costInVal.toFixed(4)}` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.costOut) {
                                                                const costOutVal = peakRun.metrics?.cost?.explicit_output;
                                                                specs.push(
                                                                    <span key="costOut" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Cost/1M Out:</span>
                                                                        <span className="font-semibold text-slate-500">{costOutVal > 0 ? `$${costOutVal.toFixed(4)}` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.inputLen) {
                                                                const inLenVal = peakRun.isl || peakRun.workload?.input_tokens;
                                                                specs.push(
                                                                    <span key="inputLen" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Input Len:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{inLenVal != null ? inLenVal.toFixed(0) : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.outputLen) {
                                                                const outLenVal = peakRun.osl || peakRun.workload?.output_tokens;
                                                                specs.push(
                                                                    <span key="outputLen" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Output Len:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{outLenVal != null ? outLenVal.toFixed(0) : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                             return (
                                                                 <div className="flex-1 flex flex-col min-w-0">
                                                                     {/* Line 1: Model Title on left, Source Tag & Date on right */}
                                                                     <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 w-full">
                                                                         <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                             {editingRunId === runId && isBrv02 ? (
                                                                                 <div className="flex-1 flex flex-col gap-0.5 min-w-0" onClick={e => e.stopPropagation()}>
                                                                                     <input
                                                                                         autoFocus
                                                                                         value={editingValue}
                                                                                         onChange={e => setEditingValue(e.target.value)}
                                                                                         onBlur={commitEdit}
                                                                                         onKeyDown={e => {
                                                                                             if (e.key === 'Enter') commitEdit();
                                                                                             if (e.key === 'Escape') cancelEdit();
                                                                                         }}
                                                                                         className="w-full text-sm font-medium bg-white dark:bg-slate-800 border border-cyan-400 rounded px-1.5 py-0.5 text-slate-800 dark:text-slate-200 focus:outline-none"
                                                                                     />
                                                                                 </div>
                                                                             ) : (
                                                                                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                                                                        <span className="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-100 truncate">
                                                                                            {isBrv02 && brv02CustomLabels && brv02CustomLabels[runId] 
                                                                                                ? brv02CustomLabels[runId] 
                                                                                                : (stat.model_name || stat.model || meta.model_name)}
                                                                                        </span>
                                                                                        {isBrv02 && (
                                                                                            <button
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    setEditingRunId(runId);
                                                                                                    setEditingValue(brv02CustomLabels[runId] || (stat.model_name || stat.model || meta.model_name));
                                                                                                }}
                                                                                               title="Rename run"
                                                                                               className="p-1 text-slate-300 dark:text-slate-600 hover:text-cyan-400 transition-colors flex-shrink-0"
                                                                                            >
                                                                                               <Pencil size={12} />
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                            )}
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    toggleBaseline(stat.benchmarkKey);
                                                                                }}
                                                                                title={isBaseline ? 'Clear baseline' : 'Set as baseline'}
                                                                                className={`p-1 rounded-full transition-colors flex-shrink-0 ${
                                                                                    isBaseline
                                                                                        ? 'text-cyan-500 bg-cyan-50 dark:bg-cyan-900/20'
                                                                                        : 'text-slate-300 dark:text-slate-600 hover:text-cyan-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                                                                                }`}
                                                                            >
                                                                                <Star size={16} fill={isBaseline ? 'currentColor' : 'none'} />
                                                                            </button>
                                                                            {isBrv02 && (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        if (removeBrv02Run) {
                                                                                            removeBrv02Run(runId);
                                                                                        }
                                                                                    }}
                                                                                    title="Delete run"
                                                                                    className="p-1 rounded text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors flex-shrink-0"
                                                                                >
                                                                                    <Trash2 size={14} />
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                                                                             <span className="text-[10px] sm:text-xs bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700/80 text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap">
                                                                                 {getSourceTag(benchmarkData[0])}
                                                                             </span>
                                                                             {(() => {
                                                                                 const type = getSourceType(benchmarkData[0]);
                                                                                 const style = getSourceTypeStyle(type);
                                                                                 return (
                                                                                     <span className={`text-[10px] sm:text-xs font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${style.bg} ${style.text} ${style.border}`}>
                                                                                         {type}
                                                                                     </span>
                                                                                 );
                                                                             })()}
                                                                        </div>
                                                                    </div>

                                                                    {/* Line 2: Dedicated to just selected visible stats */}
                                                                    {specs.length > 0 && (
                                                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                                                                            {specs.map((spec, sIdx) => {
                                                                                const showDot = sIdx > 0;
                                                                                return (
                                                                                    <React.Fragment key={spec.key}>
                                                                                        {showDot && <span className="text-slate-300 dark:text-slate-700 select-none font-bold">·</span>}
                                                                                        {spec}
                                                                                    </React.Fragment>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>

                                                    {/* Right side expand icon */}
                                                    <div className="flex-shrink-0 text-slate-400 flex items-center justify-center w-6 h-6 ml-2">
                                                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                                    </div>
                                                </div>
                                            </div>

                                             {/* Expanded Table Details */}
                                             {isExpanded && (
                                                 <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 p-4">
                                                      <div className="mb-3 px-2 text-[10px] sm:text-xs text-slate-500 font-mono flex flex-wrap gap-x-4 gap-y-1 items-center bg-white dark:bg-slate-800 py-2 px-3 rounded border border-slate-200 dark:border-slate-700 shadow-sm">
                                                          {(() => {
                                                              const displayRunId = (benchmarkData[0]?.run_id !== undefined && benchmarkData[0]?.run_id !== null && benchmarkData[0]?.run_id !== '')
                                                                  ? benchmarkData[0].run_id 
                                                                  : benchmarkData[0]?.id;
                                                              if (displayRunId === undefined || displayRunId === null || displayRunId === '') return null;
                                                              return (
                                                                  <span className="flex items-center gap-1">
                                                                      <b className="text-slate-700 dark:text-slate-300">Run ID:</b> 
                                                                      <span className="select-all opacity-75">{displayRunId}</span>
                                                                  </span>
                                                              );
                                                          })()}
                                                          {benchmarkData[0]?.source_info?.file_identifier && (
                                                             <span className="flex items-center gap-1 ml-auto">
                                                                 <b className="text-slate-700 dark:text-slate-300">File:</b> 
                                                                 <span>{benchmarkData[0].source_info.file_identifier.split('/').pop()}</span>
                                                             </span>
                                                          )}
                                                      </div>

                                                      <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
                                                          <table className="w-full text-left text-slate-600 dark:text-slate-300 text-xs bg-white dark:bg-slate-800">
                                                              <thead className="bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-100 uppercase text-[10px] font-medium border-b border-slate-200 dark:border-slate-700">
                                                                  <tr>
                                                                      {isBrv02 && <th className="px-3 py-2 w-12 text-center">Stage</th>}
                                                                      <th className="px-4 py-2">{isBrv02 ? 'QPS' : 'QPS'}</th>
                                                                      <th className="px-2 py-2">Input Tok/s</th>
                                                                      <th className="px-2 py-2">Output Tok/s</th>
                                                                      <th className="px-2 py-2">Total Tok/s</th>
                                                                      <th className="px-2 py-2">NTPOT (ms)</th>
                                                                      <th className="px-2 py-2">TPOT (ms)</th>
                                                                      <th className="px-2 py-2">ITL (ms)</th>
                                                                      <th className="px-2 py-2">TTFT (ms)</th>
                                                                      <th className="px-2 py-2">E2E (s)</th>
                                                                      <th className="px-2 py-2">Cost/1M In ($)</th>
                                                                      <th className="px-2 py-2">Cost/1M Out ($)</th>
                                                                      <th className="px-2 py-2">Input Len</th>
                                                                      <th className="px-2 py-2">Output Len</th>
                                                                  </tr>
                                                              </thead>
                                                              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                                                  {[...benchmarkData]
                                                                      .sort((a, b) => (a.workload?.stage ?? 0) - (b.workload?.stage ?? 0))
                                                                      .map((d, index) => (
                                                                          <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                                                              {isBrv02 && (
                                                                                  <td className="px-3 py-2 text-center font-mono w-12 text-slate-500 border-r border-slate-100 dark:border-slate-700">
                                                                                      {d.workload?.stage ?? '-'}
                                                                                  </td>
                                                                              )}
                                                                              <td className="px-4 py-2 font-mono">
                                                                                  {(d.metrics?.request_rate?.toFixed(2) || d.qps?.toFixed(2) || '-')}
                                                                              </td>
                                                                              <td className="px-2 py-2 font-mono">{d.metrics?.input_tput?.toFixed(0) || '-'}</td>
                                                                              <td className="px-2 py-2 font-mono">{d.metrics?.output_tput?.toFixed(0) || d.throughput?.toFixed(0) || '-'}</td>
                                                                              <td className="px-2 py-2 font-mono font-medium">{d.metrics?.total_tput?.toFixed(0) || '-'}</td>
                                                                              <td className="px-2 py-2 font-mono text-[10px]">{d.metrics?.ntpot?.toFixed(2) || d.ntpot?.toFixed(2) || '-'}</td>
                                                                              <td className="px-2 py-2 font-mono text-[10px]">{d.metrics?.tpot?.toFixed(2) || d.time_per_output_token?.toFixed(2) || '-'}</td>
                                                                              <td className="px-2 py-2 font-mono text-[10px]">{d.metrics?.itl?.toFixed(2) || d.itl?.toFixed(2) || '-'}</td>
                                                                              <td className="px-2 py-2 font-mono text-[10px]">{d.metrics?.ttft?.mean?.toFixed(2) || d.ttft?.mean?.toFixed(2) || '-'}</td>
                                                                              <td className="px-2 py-2 font-mono text-[10px]">{((d.metrics?.e2e_latency || d.latency?.mean) / 1000)?.toFixed(2) || '-'}</td>
                                                                              <td className="px-2 py-2 font-mono text-[10px] text-slate-500">
                                                                                  {d.metrics?.cost?.explicit_input > 0 ? `$${d.metrics.cost.explicit_input.toFixed(4)}` : '-'}
                                                                              </td>
                                                                              <td className="px-2 py-2 font-mono text-[10px] text-slate-500">
                                                                                  {d.metrics?.cost?.explicit_output > 0 ? `$${d.metrics.cost.explicit_output.toFixed(4)}` : '-'}
                                                                              </td>
                                                                              <td className="px-2 py-2 font-mono text-[10px]">{d.isl?.toFixed(0) || d.workload?.input_tokens?.toFixed(0) || '-'}</td>
                                                                              <td className="px-2 py-2 font-mono text-[10px]">{d.osl?.toFixed(0) || d.workload?.output_tokens?.toFixed(0) || '-'}</td>
                                                                          </tr>
                                                                      ))}
                                                              </tbody>
                                                          </table>
                                                      </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        );
                    })
                )}
                </div>
            </div>
            {dragBox && (
                <div
                    style={{
                        position: 'fixed',
                        left: Math.min(dragBox.startX, dragBox.currentX),
                        top: Math.min(dragBox.startY, dragBox.currentY),
                        width: Math.abs(dragBox.currentX - dragBox.startX),
                        height: Math.abs(dragBox.currentY - dragBox.startY),
                        pointerEvents: 'none',
                        zIndex: 9999,
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.4)',
                        borderRadius: '2px',
                    }}
                />
            )}
        </div>
    );
};