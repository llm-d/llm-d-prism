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
import { Filter, ChevronUp, ChevronDown } from 'lucide-react';
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
    brv02CustomLabels
}) => {
    const [isFiltersExpanded, setIsFiltersExpanded] = useState(true);

    if (!showFilterPanel) return null;

    return (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 shadow-sm mb-4 transition-colors">
            {/* Header & Controls */}
            <div className={`flex flex-col ${isFiltersExpanded ? 'gap-3 mb-3' : ''}`}>
                <div className={`flex justify-between items-center ${!isFiltersExpanded ? 'py-1.5' : ''}`}>
                    <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                        <Filter size={14} />
                        Benchmark Filter
                        <button
                            onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                            className="ml-1 p-0.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            title={isFiltersExpanded ? "Collapse filters" : "Expand filters"}
                        >
                            {isFiltersExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                    </h2>
                    {isFiltersExpanded && (
                        <div className="w-56 opacity-60 hover:opacity-100 transition-opacity">
                            <MultiSelectDropdown 
                                label="Origin / Folder"
                                options={filterOptions.origins || []}
                                selected={activeFilters.origins}
                                onChange={(val) => toggleFilter('origins', val)}
                                counts={facetCounts.origins || {}}
                                formatLabel={formatOriginLabel}
                            />
                        </div>
                    )}
                </div>
                {/* Filter Groups - Compact Layout */}
                {isFiltersExpanded && (
                    <>
                        <div className="flex flex-col md:flex-row gap-4 border-t border-slate-200 dark:border-slate-700/50 pt-2">
                    
                    {/* Section 1: Application / Model Server */}
                    <div className="flex-1 min-w-[200px]">
                        <h4 className="text-[10px] font-bold uppercase text-slate-400 mb-1 px-1">Application / Model Server</h4>
                        <div className="grid grid-cols-2 gap-1">
                            <MultiSelectDropdown 
                                label="Models"
                                options={filterOptions.models}
                                selected={activeFilters.models}
                                onChange={(val) => toggleFilter('models', val)}
                                counts={facetCounts.models}
                            />
                            <MultiSelectDropdown 
                                label="Precisions"
                                options={filterOptions.precisions}
                                selected={activeFilters.precisions}
                                onChange={(val) => toggleFilter('precisions', val)}
                                counts={facetCounts.precisions}
                            />
                             <MultiSelectDropdown 
                                 label="Model Server"
                                 options={filterOptions.modelServer}
                                 selected={activeFilters.modelServer}
                                 onChange={(val) => toggleFilter('modelServer', val)}
                                 counts={facetCounts.modelServer}
                             />
                            <MultiSelectDropdown 
                                label="Tensor Parallelism (TP)"
                                options={filterOptions.tp || []}
                                selected={activeFilters.tp}
                                onChange={(val) => toggleFilter('tp', val)}
                                counts={facetCounts.tp}
                            />
                        </div>
                    </div>

                    <div className="hidden md:block w-px bg-slate-200 dark:bg-slate-700 mx-1" />
                    
                    {/* Section 2: Hardware Infrastructure */}
                    <div className="flex-1 min-w-[200px]">
                        <h4 className="text-[10px] font-bold uppercase text-slate-400 mb-1 px-1">Hardware Infrastructure</h4>
                        <div className="grid grid-cols-2 gap-1">
                            <MultiSelectDropdown 
                                label="Machine Type"
                                options={filterOptions.machines}
                                selected={activeFilters.machines}
                                onChange={(val) => toggleFilter('machines', val)}
                                counts={facetCounts.machines}
                            />
                            <MultiSelectDropdown 
                                label="Accelerators"
                                options={filterOptions.hardware}
                                selected={activeFilters.hardware}
                                onChange={(val) => toggleFilter('hardware', val)}
                                counts={facetCounts.hardware}
                            />
                            <MultiSelectDropdown 
                                label="Accelerator Count"
                                options={filterOptions.acc_count}
                                selected={activeFilters.acc_count}
                                onChange={(val) => toggleFilter('acc_count', val)}
                                counts={facetCounts.acc_count}
                            />
                        </div>
                    </div>

                    <div className="hidden md:block w-px bg-slate-200 dark:bg-slate-700 mx-1" />

                    {/* Section 3: Orchestration */}
                    <div className="flex-1 min-w-[200px]">
                          <h4 className="text-[10px] font-bold uppercase text-slate-400 mb-1 px-1">Orchestration / Serving Framework</h4>
                          <div className="grid grid-cols-2 gap-1">
                             <MultiSelectDropdown 
                                 label="Serving Stack"
                                 options={filterOptions.servingStack || []}
                                 selected={activeFilters.servingStack}
                                 onChange={(val) => toggleFilter('servingStack', val)}
                                 counts={facetCounts.servingStack || {}}
                             />
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
                              <MultiSelectDropdown 
                                 label="Components"
                                 options={["Inference Gateway", "Inference Scheduler", "LeaderWorkerSet"]}
                                 selected={activeFilters.components}
                                 onChange={(val) => toggleFilter('components', val)}
                                 counts={facetCounts.components}
                             />
                             <MultiSelectDropdown 
                                 label="P/D Node Ratio"
                                 options={filterOptions.pdRatio}
                                 selected={activeFilters.pdRatio}
                                 onChange={(val) => toggleFilter('pdRatio', val)}
                                 counts={facetCounts.pdRatio}
                             />
                          </div>

                    </div>

                    <div className="hidden md:block w-px bg-slate-200 dark:bg-slate-700 mx-1" />

                    {/* Section 4: Benchmark Load */}
                    <div className="flex-1 min-w-[200px]">
                         <h4 className="text-[10px] font-bold uppercase text-slate-400 mb-1 px-1">Benchmark Load</h4>
                         <div className="grid grid-cols-2 gap-1">
                             <MultiSelectDropdown 
                                 label="Input (ISL)"
                                 options={filterOptions.isl}
                                 selected={activeFilters.isl}
                                 onChange={(val) => toggleFilter('isl', val)}
                                 counts={facetCounts.isl}
                             />
                             <MultiSelectDropdown 
                                 label="Output (OSL)"
                                 options={filterOptions.osl}
                                 selected={activeFilters.osl}
                                 onChange={(val) => toggleFilter('osl', val)}
                                 counts={facetCounts.osl}
                             />
                             <MultiSelectDropdown 
                                 label="Workload Type"
                                 options={filterOptions.ratio}
                                 selected={activeFilters.ratio}
                                 onChange={(val) => toggleFilter('ratio', val)}
                                 counts={facetCounts.ratio}
                             />
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
                
                {/* Spacer */}
                <div className="h-2" />

            <UnifiedDataTable
                modelStats={modelStats} selectedModels={selectedModels} filteredBySource={filteredBySource}
                showSelectedOnly={showSelectedOnly} setShowSelectedOnly={setShowSelectedOnly}
                selectedBenchmarks={selectedBenchmarks} setSelectedBenchmarks={setSelectedBenchmarks}
                setActiveFilters={setActiveFilters} expandedModels={expandedModels}
                toggleBenchmark={toggleBenchmark} toggleModelExpansion={toggleModelExpansion}
                baselineBenchmarkKey={baselineBenchmarkKey}
                setBaselineBenchmarkKey={setBaselineBenchmarkKey}
                brv02CustomLabels={brv02CustomLabels}
            />
            </>
            )}
        </div>
      </div>
    );
};
