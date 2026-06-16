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

import React, { useState, useEffect } from 'react';
import { Filter, ChevronDown, ChevronUp, Check, ArrowDown01, ArrowDown10 } from 'lucide-react';
import { MultiSelectDropdown } from '../common';
import { USE_CASE_META, formatOriginLabel } from '../../utils/dashboardHelpers';

export const FilterPanel = ({
    showFilterPanel,
    filterOptions,
    activeFilters,
    facetCounts,
    toggleFilter,
    selectedModels,
    modelStats,
    filteredBySource,
    showSelectedOnly,
    setShowSelectedOnly,
    selectedBenchmarks,
    setSelectedBenchmarks,
    setActiveFilters,
    expandedModels,
    toggleBenchmark,
    toggleModelExpansion,
    baselineBenchmarkKey,
    setBaselineBenchmarkKey,
    UnifiedDataTable,
    hideShowSelectedOnly,
    renameClearToUnselectAll,
    brv02Runs, brv02CustomLabels, setBrv02CustomLabels, removeBrv02Run
}) => {
    const [groupBy, setGroupBy] = useState(() => {
        try {
            const saved = localStorage.getItem('prism_manage_group_by');
            return saved || 'Model';
        } catch { return 'Model'; }
    });
    
    const [sortByField, setSortByField] = useState(() => {
        try {
            const saved = localStorage.getItem('prism_manage_sort_by');
            return saved || 'timestamp';
        } catch { return 'timestamp'; }
    });

    const [sortDirection, setSortDirection] = useState(() => {
        try {
            const saved = localStorage.getItem('prism_manage_sort_dir');
            return saved || 'desc';
        } catch { return 'desc'; }
    });

    const [isFiltersExpanded, setIsFiltersExpanded] = useState(() => {
        try {
            const saved = localStorage.getItem('prism_manage_filters_expanded');
            return saved !== null ? saved === 'true' : false;
        } catch { return false; }
    });

    const [visibleSpecs, setVisibleSpecs] = useState(() => {
        const defaults = {
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
        };
        try {
            const saved = localStorage.getItem('prism_manage_visible_specs');
            if (saved) {
                return { ...defaults, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.warn("Failed to load visible specs from local storage", e);
        }
        return defaults;
    });

    useEffect(() => {
        try {
            localStorage.setItem('prism_manage_group_by', groupBy);
        } catch (e) { console.warn(e); }
    }, [groupBy]);

    useEffect(() => {
        try {
            localStorage.setItem('prism_manage_sort_by', sortByField);
        } catch (e) { console.warn(e); }
    }, [sortByField]);

    useEffect(() => {
        try {
            localStorage.setItem('prism_manage_sort_dir', sortDirection);
        } catch (e) { console.warn(e); }
    }, [sortDirection]);

    useEffect(() => {
        try {
            localStorage.setItem('prism_manage_filters_expanded', isFiltersExpanded.toString());
        } catch (e) { console.warn(e); }
    }, [isFiltersExpanded]);

    useEffect(() => {
        try {
            localStorage.setItem('prism_manage_visible_specs', JSON.stringify(visibleSpecs));
        } catch (e) { console.warn(e); }
    }, [visibleSpecs]);

    if (!showFilterPanel) return null;

    return (
        <div className="flex flex-col mb-4">
            {/* Header & Controls */}
            <div className="flex justify-end mb-2">
        <button 
            onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors font-medium cursor-pointer"
        >
            {isFiltersExpanded ? (
                <><ChevronUp size={14} /> Hide Filters</>
            ) : (
                <><ChevronDown size={14} /> Show Filters</>
            )}
        </button>
    </div>

            {/* Filter Groups - Collapsible Layout */}
            {isFiltersExpanded && (
                <div className="flex flex-col gap-4 border-t border-slate-200 dark:border-slate-700/50 pt-3">
                    {/* Origin filter & custom visible info options container */}
                    <div className="flex flex-col gap-4 border-b border-slate-200 dark:border-slate-700/50 pb-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="w-full sm:w-64 flex-shrink-0 flex flex-col gap-3">
                                <MultiSelectDropdown 
                                    label="Connection / Source"
                                    options={filterOptions.connectionNames || []}
                                    selected={activeFilters.connectionNames || new Set()}
                                    onChange={(val) => toggleFilter('connectionNames', val)}
                                    counts={facetCounts.connectionNames || {}}
                                />
                                <MultiSelectDropdown 
                                    label="Origin / Folder"
                                    options={filterOptions.origins || []}
                                    selected={activeFilters.origins}
                                    onChange={(val) => toggleFilter('origins', val)}
                                    counts={facetCounts.origins || {}}
                                    formatLabel={formatOriginLabel}
                                />
                            </div>
                        </div>

                        {/* Visible Information Selection on its own dedicated line */}
                        <div className="flex flex-col gap-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700/50 pb-2 mb-2">
                                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 select-none">Visible Specs & Detailed Performance Metrics:</span>
                                
                                <div className="flex items-center gap-2">
                                    
                                    <div className="flex items-center gap-2 mr-4 border-r border-slate-300 dark:border-slate-600 pr-4">
                                        <span className="text-xs text-slate-500 font-medium">Group by:</span>
                                        <select 
                                            className="text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                                            value={groupBy}
                                            onChange={(e) => setGroupBy(e.target.value)}
                                        >
                                            <option value="None">None</option>
                                            <option value="Model">Model</option>
                                            <option value="Hardware">Hardware</option>
                                            <option value="Origin">Source Connections</option>
                                            <option value="OriginFolder">Origin/Folder</option>
                                        </select>
                                    </div>
                                    <span className="text-xs text-slate-500 font-medium">Sort by:</span>
                                    <select 
                                        className="text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                                        value={sortByField}
                                        onChange={(e) => setSortByField(e.target.value)}
                                    >
                                        <option value="timestamp">Timestamp</option>
                                        <option value="maxTput">Max Throughput</option>
                                        <option value="minLat">Min Latency</option>
                                        <option value="model">Model Name</option>
                                        <option value="qps">QPS</option>
                                        <option value="inputTput">Input Tok/s</option>
                                        <option value="outputTput">Output Tok/s</option>
                                        <option value="totalTput">Total Tok/s</option>
                                        <option value="ntpot">NTPOT</option>
                                        <option value="tpot">TPOT</option>
                                        <option value="itl">ITL</option>
                                        <option value="ttft">TTFT</option>
                                        <option value="e2e">E2E Latency</option>
                                        <option value="costIn">Cost/1M In</option>
                                        <option value="costOut">Cost/1M Out</option>
                                    </select>
                                    
                                    <button
                                        onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                                        title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                                        className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer flex items-center justify-center"
                                    >
                                        {sortDirection === 'asc' ? <ArrowDown01 size={14} /> : <ArrowDown10 size={14} />}
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {Object.entries({
                                    hardware: 'Hardware',
                                    timestamp: 'Timestamp',
                                    stage: 'Stage',
                                    nodes: 'Nodes & Parallelism',
                                    islOsl: 'ISL/OSL',
                                    maxTput: 'Max TPUT',
                                    minLat: 'Min LAT',
                                    qps: 'QPS',
                                    inputTput: 'Input Tok/s',
                                    outputTput: 'Output Tok/s',
                                    totalTput: 'Total Tok/s',
                                    ntpot: 'NTPOT (ms)',
                                    tpot: 'TPOT (ms)',
                                    itl: 'ITL (ms)',
                                    ttft: 'TTFT (ms)',
                                    e2e: 'E2E (s)',
                                    costIn: 'Cost/1M In ($)',
                                    costOut: 'Cost/1M Out ($)',
                                    inputLen: 'Input Len',
                                    outputLen: 'Output Len'
                                }).map(([key, label]) => {
                                    const isSelected = visibleSpecs[key];
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => setVisibleSpecs(prev => ({ ...prev, [key]: !prev[key] }))}
                                            className={`px-2.5 py-1 text-xs rounded transition-all flex items-center gap-1.5 font-medium border cursor-pointer select-none ${
                                                isSelected 
                                                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50' 
                                                    : 'bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                                            }`}
                                        >
                                            <div className={`w-2.5 h-2.5 rounded-sm border flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'}`}>
                                                {isSelected && <Check size={8} strokeWidth={4} />}
                                            </div>
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                
                {/* Section 1: Application / Model Server */}
                <div className="flex-1 min-w-[200px]">
                    <h4 className="text-[10px] font-bold uppercase text-slate-400 mb-1 px-1">Application / Model Server</h4>
                    <div className="flex flex-wrap gap-1.5">
                        <div className="flex-1 min-w-[130px] sm:min-w-[150px]">
                            <MultiSelectDropdown 
                                label="Models"
                                options={filterOptions.models}
                                selected={activeFilters.models}
                                onChange={(val) => toggleFilter('models', val)}
                                counts={facetCounts.models}
                            />
                        </div>
                        <div className="flex-1 min-w-[130px] sm:min-w-[150px]">
                            <MultiSelectDropdown 
                                label="Precisions"
                                options={filterOptions.precisions}
                                selected={activeFilters.precisions}
                                onChange={(val) => toggleFilter('precisions', val)}
                                counts={facetCounts.precisions}
                            />
                        </div>
                        <div className="flex-1 min-w-[130px] sm:min-w-[150px]">
                             <MultiSelectDropdown 
                                 label="Model Server"
                                 options={filterOptions.modelServer}
                                 selected={activeFilters.modelServer}
                                 onChange={(val) => toggleFilter('modelServer', val)}
                                 counts={facetCounts.modelServer}
                             />
                        </div>
                        <div className="flex-1 min-w-[130px] sm:min-w-[150px]">
                            <MultiSelectDropdown 
                                label="Tensor Parallelism (TP)"
                                options={filterOptions.tp || []}
                                selected={activeFilters.tp}
                                onChange={(val) => toggleFilter('tp', val)}
                                counts={facetCounts.tp}
                            />
                        </div>
                    </div>
                </div>
                
                {/* Section 2: Hardware Infrastructure */}
                <div className="flex-1 min-w-[200px]">
                    <h4 className="text-[10px] font-bold uppercase text-slate-400 mb-1 px-1">Hardware Infrastructure</h4>
                    <div className="flex flex-wrap gap-1.5">
                        <div className="flex-1 min-w-[130px] sm:min-w-[150px]">
                            <MultiSelectDropdown 
                                label="Machine Type"
                                options={filterOptions.machines}
                                selected={activeFilters.machines}
                                onChange={(val) => toggleFilter('machines', val)}
                                counts={facetCounts.machines}
                            />
                        </div>
                        <div className="flex-1 min-w-[130px] sm:min-w-[150px]">
                            <MultiSelectDropdown 
                                label="Accelerators"
                                options={filterOptions.hardware}
                                selected={activeFilters.hardware}
                                onChange={(val) => toggleFilter('hardware', val)}
                                counts={facetCounts.hardware}
                            />
                        </div>
                        <div className="flex-1 min-w-[130px] sm:min-w-[150px]">
                            <MultiSelectDropdown 
                                label="Accelerator Count"
                                options={filterOptions.acc_count}
                                selected={activeFilters.acc_count}
                                onChange={(val) => toggleFilter('acc_count', val)}
                                counts={facetCounts.acc_count}
                            />
                        </div>
                    </div>
                </div>

                {/* Section 3: Orchestration */}
                <div className="flex-1 min-w-[200px]">
                      <h4 className="text-[10px] font-bold uppercase text-slate-400 mb-1 px-1">Orchestration / Serving Framework</h4>
                      <div className="flex flex-wrap gap-1.5">
                         <div className="flex-1 min-w-[130px] sm:min-w-[150px]">
                             <MultiSelectDropdown 
                                 label="Serving Stack"
                                 options={filterOptions.servingStack || []}
                                 selected={activeFilters.servingStack}
                                 onChange={(val) => toggleFilter('servingStack', val)}
                                 counts={facetCounts.servingStack || {}}
                             />
                         </div>
                         <div className="flex-1 min-w-[130px] sm:min-w-[150px]">
                             <MultiSelectDropdown 
                                 label="Optimizations"
                                 options={[
                                     "Atomic / Gang Scheduling",
                                     "Topology Aware Scheduling",
                                     "P/D Disaggregation",
                                     "Horizontal Pod Autoscaling",
                                     "Body based routing",
                                     "Approximate prefix aware routing",
                                     "Precise prefix aware routing"
                                 ]}
                                 selected={activeFilters.optimizations}
                                 onChange={(val) => toggleFilter('optimizations', val)}
                                 counts={facetCounts.optimizations}
                             />
                         </div>
                         <div className="flex-1 min-w-[130px] sm:min-w-[150px]">
                              <MultiSelectDropdown 
                                 label="Components"
                                 options={["Inference Gateway", "Inference Scheduler", "LeaderWorkerSet"]}
                                 selected={activeFilters.components}
                                 onChange={(val) => toggleFilter('components', val)}
                                 counts={facetCounts.components}
                             />
                         </div>
                         <div className="flex-1 min-w-[130px] sm:min-w-[150px]">
                             <MultiSelectDropdown 
                                 label="P/D Node Ratio"
                                 options={filterOptions.pdRatio}
                                 selected={activeFilters.pdRatio}
                                 onChange={(val) => toggleFilter('pdRatio', val)}
                                 counts={facetCounts.pdRatio}
                             />
                         </div>
                      </div>
                </div>

                {/* Section 4: Benchmark Load */}
                <div className="flex-1 min-w-[200px]">
                     <h4 className="text-[10px] font-bold uppercase text-slate-400 mb-1 px-1">Benchmark Load</h4>
                     <div className="flex flex-wrap gap-1.5">
                         <div className="flex-1 min-w-[130px] sm:min-w-[150px]">
                             <MultiSelectDropdown 
                                 label="Input (ISL)"
                                 options={filterOptions.isl}
                                 selected={activeFilters.isl}
                                 onChange={(val) => toggleFilter('isl', val)}
                                 counts={facetCounts.isl}
                             />
                         </div>
                         <div className="flex-1 min-w-[130px] sm:min-w-[150px]">
                             <MultiSelectDropdown 
                                 label="Output (OSL)"
                                 options={filterOptions.osl}
                                 selected={activeFilters.osl}
                                 onChange={(val) => toggleFilter('osl', val)}
                                 counts={facetCounts.osl}
                             />
                         </div>
                         <div className="flex-1 min-w-[130px] sm:min-w-[150px]">
                             <MultiSelectDropdown 
                                 label="Workload Type"
                                 options={filterOptions.ratio}
                                 selected={activeFilters.ratio}
                                 onChange={(val) => toggleFilter('ratio', val)}
                                 counts={facetCounts.ratio}
                             />
                         </div>
                         <div className="flex-1 min-w-[130px] sm:min-w-[150px]">
                             <MultiSelectDropdown 
                                 label="Use Case"
                                 options={filterOptions.useCase}
                                 selected={activeFilters.useCase}
                                 onChange={(val) => toggleFilter('useCase', val)}
                                 counts={facetCounts.useCase}
                                 formatLabel={(opt) => {
                                     const meta = USE_CASE_META[opt];
                                     return meta ? `${opt} ${meta}` : opt;
                                 }}
                             />
                         </div>
                      </div>
                 </div>
              </div>
            </div>
            )}
            
            {/* Spacer */}
            <div className="h-4" />

             <UnifiedDataTable
                groupBy={groupBy}
                sortByField={sortByField}
                sortDirection={sortDirection}
                visibleSpecs={visibleSpecs}
                modelStats={modelStats} selectedModels={selectedModels} filteredBySource={filteredBySource}
                showSelectedOnly={showSelectedOnly} setShowSelectedOnly={setShowSelectedOnly}
                selectedBenchmarks={selectedBenchmarks} setSelectedBenchmarks={setSelectedBenchmarks}
                setActiveFilters={setActiveFilters} expandedModels={expandedModels}
                toggleBenchmark={toggleBenchmark} toggleModelExpansion={toggleModelExpansion}
                baselineBenchmarkKey={baselineBenchmarkKey}
                setBaselineBenchmarkKey={setBaselineBenchmarkKey}
                hideShowSelectedOnly={hideShowSelectedOnly}
                renameClearToUnselectAll={renameClearToUnselectAll}
                brv02Runs={brv02Runs}
                brv02CustomLabels={brv02CustomLabels}
                setBrv02CustomLabels={setBrv02CustomLabels}
                removeBrv02Run={removeBrv02Run}
            />
        </div>
    );
};
