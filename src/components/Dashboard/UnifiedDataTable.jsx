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
import { RotateCcw, ChevronDown, ChevronUp, Star, Pin } from 'lucide-react';
import { Badge, Button, EmptyState, Panel } from '../ui';
import { cn } from '../../utils/cn';
import { getEffectiveTp, getBucket, getSourceTag, getSubmissionStatusDetails } from '../../utils/dashboardHelpers';
import { useGitHubAuth } from '../../hooks/useGitHubAuth';

export const UnifiedDataTable = (props) => {
    const { user } = useGitHubAuth();
    const {
        modelStats, selectedModels, filteredBySource, showSelectedOnly, setShowSelectedOnly,
        selectedBenchmarks, setSelectedBenchmarks, setActiveFilters, expandedModels,
        toggleBenchmark, toggleModelExpansion,
        baselineBenchmarkKey, setBaselineBenchmarkKey,
        brv02CustomLabels
    } = props;

    const getRunIdFromKey = (key) => {
        if (!key) return null;
        if (key.startsWith('brv02:')) return key.substring(6);
        if (key.startsWith('results-store:')) return key.substring(14);
        return null;
    };

    const toggleBaseline = (key) => {
        if (!setBaselineBenchmarkKey) return;
        setBaselineBenchmarkKey(prev => (prev === key ? null : key));
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center mb-2 px-1">
                  <div className="flex items-center gap-4">
                       <span className="text-xs text-slate-500">
                           {(() => {
                               const selectedCount = modelStats.filter(s => selectedBenchmarks.has(s.benchmarkKey)).length;
                               return `${modelStats.length} matching benchmarks, ${selectedCount} selected`;
                           })()}
                       </span>
                      
                      <div className="h-4 w-px bg-slate-300 dark:bg-slate-700" />
                      
                      <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">Only show selected</span>
                          <button
                              onClick={() => setShowSelectedOnly(!showSelectedOnly)}
                              className={cn('w-8 h-4 rounded-full relative transition-colors', showSelectedOnly ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600')}
                          >
                              <div className={cn('absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform', showSelectedOnly ? 'translate-x-4' : 'translate-x-0')} />
                          </button>
                      </div>
                  </div>

                  {selectedModels.size > 0 && (
                      <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setSelectedBenchmarks(new Set())}
                      >
                          Clear All
                      </Button>
                  )}
            </div>
                          {/* Unified Data Table */}
              <Panel padding="none" className="bg-slate-50 dark:bg-slate-900/50 rounded-lg shadow-none overflow-hidden text-xs">
                   <div className="max-h-[500px] overflow-y-auto">
                       <table className="w-full text-left text-slate-600 dark:text-slate-300">
                           <thead className="bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-100 uppercase text-[10px] font-medium sticky top-0 z-10 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-700/50">
                               <tr>
                                   <th className="px-3 py-3 w-10 text-center">
                                       <span className="sr-only">Select</span>
                                       {selectedBenchmarks.size > 0 && selectedBenchmarks.size === modelStats.length ? (
                                           <div className="w-2.5 h-2.5 bg-blue-500 rounded-sm mx-auto cursor-pointer" onClick={() => setSelectedBenchmarks(new Set())}/>
                                       ) : (
                                            <div className="w-2.5 h-2.5 border border-slate-500 rounded-sm mx-auto cursor-pointer" onClick={() => {
                                                const all = new Set(modelStats.map(s => s.benchmarkKey));
                                                setSelectedBenchmarks(all);
                                            }} />
                                       )}
                                   </th>
                                   <th className="px-1 py-3 w-8 text-center" title="Baseline — click 📌 on a row to compare other selected runs against it">
                                       <Pin size={11} className="mx-auto text-slate-400" />
                                   </th>
                                   <th className="px-2 py-3">Model</th>
                                   <th className="px-2 py-3">Accelerator</th>
                                   <th className="px-2 py-3 text-right">Chips</th>
                                    <th className="px-2 py-3">Nodes & Parallelism</th>
                                   <th className="px-2 py-3 text-right">ISL / OSL</th>
                                   <th className="px-2 py-3 text-right">Max Tput</th>
                                    <th className="px-2 py-3 text-right">Min Lat</th>
                                   <th className="px-2 py-3 text-center">Src</th>
                               </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-700/50">
                               {modelStats.length === 0 ? (
                                   <tr>
                                <td colSpan="100%">
                                    <EmptyState
                                        message="No benchmarks match your current filters."
                                        action={
                                            <button
                                                onClick={() => {
                                                    setActiveFilters({
                                                        models: new Set(),
                                                        hardware: new Set(),
                                                        machines: new Set(),
                                                        precisions: new Set(),
                                                        tp: new Set(),
                                                        isl: new Set(),
                                                        osl: new Set(),
                                                        ratio: new Set(),
                                                        acc_count: new Set(),
                                                        modelServer: new Set(),
                                                        useCase: new Set(),
                                                        servingStack: new Set(),
                                                        optimizations: new Set(),
                                                        components: new Set(),
                                                        pdRatio: new Set(),
                                                        origins: new Set()
                                                    });
                                                    setShowSelectedOnly(false);

                                                }}
                                                className="text-blue-400 hover:text-blue-300 hover:underline text-sm flex items-center gap-1"
                                            >
                                                <RotateCcw size={12} /> Clear all filters
                                            </button>
                                        }
                                    />
                                </td>
                            </tr>
                               ) : (
                                   modelStats
                                    .filter(stat => !showSelectedOnly || selectedBenchmarks.has(stat.benchmarkKey))
                                    .map((stat) => {
                                      const isSelected = selectedBenchmarks.has(stat.benchmarkKey);
                                      // Use stat.data which contains the benchmark-specific data
                                      const benchmarkData = stat.data || [];
                                      // Extract metadata from the first entry to populate columns
                                      const meta = benchmarkData[0]?.metadata || {};
                                      const tp = getEffectiveTp(benchmarkData[0]) || '-';
                                      
                                      // Use buckets to avoid "Var" for slightly different lengths
                                      const uniqueIsl = [...new Set(benchmarkData.map(d => getBucket(d.isl || d.workload?.input_tokens)))];
                                      const uniqueOsl = [...new Set(benchmarkData.map(d => getBucket(d.osl || d.workload?.output_tokens)))];
                                      
                                      const isl = uniqueIsl.length === 1 ? uniqueIsl[0] : (uniqueIsl.length > 1 ? 'Var' : '-');
                                      const osl = uniqueOsl.length === 1 ? uniqueOsl[0] : (uniqueOsl.length > 1 ? 'Var' : '-');

                                      // Use benchmarkKey for expansion state (allows multiple benchmarks of same model to expand independently)
                                      const isExpanded = expandedModels.has(stat.benchmarkKey || stat.model);

                                      return (
                                       <React.Fragment key={stat.benchmarkKey || stat.model}>
                                       <tr
                                           className={cn(
                                               'transition-colors hover:bg-slate-100 dark:hover:bg-slate-700/30 cursor-pointer border-b border-slate-100 dark:border-slate-800/50',
                                               isSelected && 'bg-blue-50 dark:bg-blue-900/10',
                                               stat.benchmarkKey === baselineBenchmarkKey && 'ring-1 ring-inset ring-cyan-400/40'
                                           )}
                                           onClick={(e) => {
                                               // Prevent toggling if clicking specific action buttons if any
                                               toggleBenchmark(stat.benchmarkKey);
                                           }}
                                       >
                                           <td className="px-3 py-2 text-center">
                                               <div className={cn(
                                                   'w-3.5 h-3.5 rounded border flex items-center justify-center transition-all mx-auto',
                                                   isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                                               )}>
                                                   {isSelected && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                               </div>
                                           </td>
                                           <td className="px-1 py-2 text-center">
                                                {(() => {
                                                    const isBaseline = stat.benchmarkKey === baselineBenchmarkKey;
                                                    return (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleBaseline(stat.benchmarkKey);
                                                            }}
                                                            title={isBaseline ? 'Clear baseline' : 'Set as baseline'}
                                                            className={cn(
                                                                'p-0.5 rounded transition-colors',
                                                                isBaseline
                                                                    ? 'text-cyan-500 dark:text-cyan-400'
                                                                    : 'text-slate-300 dark:text-slate-600 hover:text-cyan-500 dark:hover:text-cyan-400'
                                                            )}
                                                        >
                                                            <Pin size={11} className={cn('transition-transform duration-300', isBaseline ? 'rotate-[45deg]' : '-rotate-45 opacity-60')} fill={isBaseline ? 'currentColor' : 'none'} />
                                                        </button>
                                                    );
                                                })()}
                                           </td>
                                           <td className="px-2 py-2 font-medium text-slate-800 dark:text-slate-200">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                          onClick={(e) => {
                                                              e.stopPropagation();
                                                              toggleModelExpansion(stat.benchmarkKey || stat.model);
                                                          }}
                                                          className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                                                          title={isExpanded ? 'Collapse details' : 'Expand details'}
                                                      >
                                                          {isExpanded ? (
                                                              <ChevronUp size={12} />
                                                          ) : (
                                                              <ChevronDown size={12} />
                                                          )}
                                                      </button>
                                                    <div>
                                                        {(() => {
                                                            const runId = getRunIdFromKey(stat.benchmarkKey);
                                                            const customLabel = runId ? brv02CustomLabels?.[runId] : null;
                                                            return customLabel || benchmarkData[0]?.runLabel || (stat.model_name || stat.model || meta.model_name);
                                                        })()}
                                                    </div>
                                                </div>
                                           </td>
                                           <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{stat.hardware}</td>
                                            <td className="px-2 py-2 text-right text-slate-600 dark:text-slate-300">{stat.accelerator_count}</td>
                                            <td className="px-2 py-2 text-slate-500 dark:text-slate-400 font-mono text-xs">
                                                {(meta.prefill_node_count > 0 || meta.decode_node_count > 0) ? (
                                                    // Disaggregated Display: Total (P:1-TPx | D:3-TPy)
                                                    (() => {
                                                        const totalNodes = (meta.prefill_node_count || 0) + (meta.decode_node_count || 0);
                                                        // Parse TP from config string "1P-TP4 3D-TP4"
                                                        const config = meta.configuration || '';
                                                        const pTpMatch = config.match(/(\d+)P-TP(\d+)/i);
                                                        const dTpMatch = config.match(/(\d+)D-TP(\d+)/i);
                                                        const pTp = pTpMatch ? pTpMatch[2] : '?';
                                                        const dTp = dTpMatch ? dTpMatch[2] : '?';

                                                        return (
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-bold text-slate-700 dark:text-slate-300">{totalNodes}</span>
                                                                <span className="text-slate-400 dark:text-slate-500">(</span>
                                                                <div className="flex items-center gap-1.5 opacity-90">
                                                                    <span className="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1 rounded whitespace-nowrap">
                                                                        P:{meta.prefill_node_count}-TP{pTp}
                                                                    </span>
                                                                    <span className="text-slate-300">|</span>
                                                                    <span className="text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-1 rounded whitespace-nowrap">
                                                                        D:{meta.decode_node_count}-TP{dTp}
                                                                    </span>
                                                                </div>
                                                                <span className="text-slate-400 dark:text-slate-500">)</span>
                                                            </div>
                                                        );
                                                    })()
                                                ) : (
                                                    // Aggregated Display: Total nodes TP
                                                    (() => {
                                                        // Use pre-computed node_count from benchmarkStats (accelerator_count / tp)
                                                        // This avoids unreliable regex extraction from configuration strings 
                                                        const totalNodes = stat.node_count || stat.accelerator_count || 1;
                                                        
                                                        // Use the standard TP extracted earlier
                                                        const displayTp = tp !== '-' ? tp : (getEffectiveTp(stat) || '');
                                                        
                                                        return (
                                                            <div className="flex items-center gap-1.5">
                                                                 <span className="font-bold text-slate-700 dark:text-slate-300">{totalNodes}</span>
                                                                 {displayTp && displayTp !== '-' && <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{displayTp}</span>}
                                                            </div>
                                                        );
                                                    })()
                                                )}
                                            </td>
                                            <td className="px-2 py-2 text-right font-mono text-slate-500 dark:text-slate-400">
                                                {isl} / {osl}
                                           </td>
                                           <td className="px-2 py-2 text-right font-mono text-slate-800 dark:text-slate-200">
                                                {stat.maxTput.toFixed(0)}
                                           </td>
                                           <td className="px-2 py-2 text-right font-mono text-slate-800 dark:text-slate-200">
                                                {stat.minLat.toFixed(0)} <span className="text-[10px] text-slate-500">ms</span>
                                           </td>
                                            <td className="px-2 py-2 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    {(() => {
                                                        const isResultsStore = benchmarkData[0]?.source_info?.type === 'benchmark_report_v02';
                                                        const isMine = isResultsStore && user && benchmarkData[0]?.github_author?.username === user.username;
                                                        if (isMine) {
                                                            return (
                                                                <Badge tone="success" size="sm" className="normal-case tracking-normal font-semibold">
                                                                    Yours
                                                                </Badge>
                                                            );
                                                        }
                                                        if (isResultsStore) {
                                                            return (
                                                                <Badge tone="info" size="sm" className="normal-case tracking-normal font-semibold">
                                                                    Community
                                                                </Badge>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                    <Badge tone="neutral" size="sm" className="normal-case tracking-normal font-semibold max-w-[100px]" title={benchmarkData[0]?.source_info?.origin || benchmarkData[0]?.source}>
                                                        <span className="truncate">{getSourceTag(benchmarkData[0])}</span>
                                                    </Badge>
                                                </div>
                                            </td>
                                       </tr>
                                       {isExpanded && (
                                              <tr>
                                                  <td colSpan="10" className="p-0">
                                                      <div className="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 p-2">
                                                          {/* Run Metadata Header */}
                                                          {benchmarkData[0]?.source_info?.type === 'benchmark_report_v02' ? (
                                                              <div className="mb-2 p-2 bg-slate-100 dark:bg-slate-800/40 rounded border border-slate-200 dark:border-slate-700/80 font-sans flex flex-wrap gap-x-6 gap-y-2.5 text-xs text-slate-600 dark:text-slate-400">
                                                                  <div className="flex items-center gap-1.5">
                                                                      <span className="font-semibold text-slate-700 dark:text-slate-300">Run UUID:</span>
                                                                      <span className="font-mono bg-slate-200 dark:bg-slate-800/50 px-1.5 py-0.5 rounded text-[11px] select-all">{benchmarkData[0]?.run_id}</span>
                                                                  </div>
                                                                  <div className="flex items-center gap-1.5">
                                                                      <span className="font-semibold text-slate-700 dark:text-slate-300">Submitted:</span>
                                                                      <span>{benchmarkData[0]?.source_info?.submitted_at ? new Date(benchmarkData[0].source_info.submitted_at).toLocaleString() : 'Unknown'}</span>
                                                                      {benchmarkData[0]?.github_author?.username && (
                                                                          <span className="flex items-center gap-1 bg-slate-200/50 dark:bg-slate-800/50 px-1.5 py-0.5 rounded ml-1">
                                                                              <img 
                                                                                  src={`https://github.com/${benchmarkData[0].github_author.username}.png`} 
                                                                                  alt={benchmarkData[0].github_author.username} 
                                                                                  className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600"
                                                                                  onError={(e) => { e.target.style.display = 'none'; }}
                                                                              />
                                                                              <a 
                                                                                  href={`https://github.com/${benchmarkData[0].github_author.username}`} 
                                                                                  target="_blank" 
                                                                                  rel="noopener noreferrer" 
                                                                                  className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                                                                              >
                                                                                  {benchmarkData[0].github_author.username}
                                                                              </a>
                                                                          </span>
                                                                      )}
                                                                  </div>
                                                                  <div className="flex items-center gap-1.5">
                                                                      <span className="font-semibold text-slate-700 dark:text-slate-300">Status:</span>
                                                                      {(() => {
                                                                          const details = getSubmissionStatusDetails(benchmarkData[0]?.source_info?.submission_state);
                                                                          return (
                                                                              <span className={cn('px-1.5 py-0.5 rounded border text-[11px] font-bold', details.bg, details.text, details.border)}>
                                                                                  {details.label}
                                                                              </span>
                                                                          );
                                                                      })()}
                                                                  </div>
                                                                  {(benchmarkData[0]?.source_info?.submission_state === 'public' || benchmarkData[0]?.source_info?.submission_state === 'promoted' || benchmarkData[0]?.source_info?.approved_at) && (
                                                                      <div className="flex items-center gap-1.5">
                                                                          <span className="font-semibold text-slate-700 dark:text-slate-300">Approved:</span>
                                                                          <span>{benchmarkData[0].source_info.approved_at ? new Date(benchmarkData[0].source_info.approved_at).toLocaleString() : (benchmarkData[0].source_info.submitted_at ? new Date(benchmarkData[0].source_info.submitted_at).toLocaleString() : 'Unknown')}</span>
                                                                      </div>
                                                                  )}
                                                              </div>
                                                          ) : (
                                                              <div className="mb-2 px-2 text-[10px] sm:text-xs text-slate-500 font-mono flex flex-wrap gap-x-4 gap-y-1 items-center bg-slate-100 dark:bg-slate-800/50 py-1.5 rounded">
                                                                  {benchmarkData[0]?.timestamp && (
                                                                      <span className="flex items-center gap-1">
                                                                          <b className="text-slate-700 dark:text-slate-300">Date:</b> 
                                                                          <span>{(() => {
                                                                              const ts = benchmarkData[0].timestamp;
                                                                              const d = new Date(ts);
                                                                              if (!isNaN(d.getTime())) return d.toLocaleString();
                                                                              const m = String(ts).match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
                                                                              if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`).toLocaleString();
                                                                              return ts;
                                                                          })()}</span>
                                                                      </span>
                                                                  )}
                                                              </div>
                                                          )}

                                                          <div className="overflow-x-auto">
                                                            <table className="w-full text-left text-slate-600 dark:text-slate-300 text-xs shadow-inner rounded-sm overflow-hidden">
                                                                <thead className="bg-slate-200 dark:bg-slate-700/40 text-slate-700 dark:text-slate-100 uppercase text-[10px] font-medium border-b border-slate-300 dark:border-slate-600">
                                                                    <tr>
                                                                        <th className="px-4 py-2">QPS</th>
                                                                        <th className="px-2 py-1">Input Tok/s</th>
                                                                        <th className="px-2 py-1">Output Tok/s</th>
                                                                        <th className="px-2 py-1">Total Tok/s</th>
                                                                        <th className="px-2 py-1">NTPOT (ms)</th>
                                                                        <th className="px-2 py-1">TPOT (ms)</th>
                                                                        <th className="px-2 py-1">ITL (ms)</th>
                                                                        <th className="px-2 py-1">TTFT (ms)</th>
                                                                        <th className="px-2 py-1">E2E (s)</th>
                                                                        <th className="px-2 py-1">Cost/1M In ($)</th>
                                                                        <th className="px-2 py-1">Cost/1M Out ($)</th>
                                                                        <th className="px-2 py-1">Input Len</th>
                                                                        <th className="px-2 py-1">Output Len</th>
                                                                        <th className="px-2 py-1">Date</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-200 dark:divide-slate-700/50">
                                                                    {benchmarkData.map((d, index) => (
                                                                       <tr key={index} className="hover:bg-slate-100 dark:hover:bg-slate-800/50">
                                                                           {index === 0 && console.log('Row 0 Data:', d)}
                                                                           <td className="px-4 py-1.5 font-mono">{d.metrics?.request_rate?.toFixed(2) || d.qps?.toFixed(2) || '-'}</td>
                                                                           <td className="px-2 py-1 font-mono">{d.metrics?.input_tput?.toFixed(0) || '-'}</td>
                                                                           <td className="px-2 py-1 font-mono">{d.metrics?.output_tput?.toFixed(0) || d.throughput?.toFixed(0) || '-'}</td>
                                                                           <td className="px-2 py-1 font-mono">{d.metrics?.total_tput?.toFixed(0) || '-'}</td>
                                                                           <td className="px-2 py-1 font-mono text-xs">{d.metrics?.ntpot?.toFixed(2) || d.ntpot?.toFixed(2) || '-'}</td>
                                                                           <td className="px-2 py-1 font-mono text-xs">{d.metrics?.tpot?.toFixed(2) || d.time_per_output_token?.toFixed(2) || '-'}</td>
                                                                           <td className="px-2 py-1 font-mono text-xs">{d.metrics?.itl?.toFixed(2) || d.itl?.toFixed(2) || '-'}</td>
                                                                           <td className="px-2 py-1 font-mono text-xs">{d.metrics?.ttft?.mean?.toFixed(2) || d.ttft?.mean?.toFixed(2) || '-'}</td>
                                                                           <td className="px-2 py-1 font-mono text-xs">{((d.metrics?.e2e_latency || d.latency?.mean) / 1000)?.toFixed(2) || '-'}</td>
                                                                           <td className="px-2 py-1 font-mono text-xs text-slate-500">
                                                                                {d.metrics?.cost?.explicit_input > 0 ? `$${d.metrics.cost.explicit_input.toFixed(4)}` : '-'}
                                                                           </td>
                                                                           <td className="px-2 py-1 font-mono text-xs text-slate-500">
                                                                                {d.metrics?.cost?.explicit_output > 0 ? `$${d.metrics.cost.explicit_output.toFixed(4)}` : '-'}
                                                                           </td>
                                                                           <td className="px-2 py-1 font-mono text-xs">{d.isl?.toFixed(0) || d.workload?.input_tokens?.toFixed(0) || '-'}</td>
                                                                           <td className="px-2 py-1 font-mono text-xs">{d.osl?.toFixed(0) || d.workload?.output_tokens?.toFixed(0) || '-'}</td>
                                                                           <td className="px-2 py-1 font-mono text-[10px] text-slate-400 whitespace-nowrap">
                                                                               {(() => {
                                                                                   const ts = d.timestamp;
                                                                                   if (!ts) return '-';
                                                                                   const date = new Date(ts);
                                                                                   if (!isNaN(date.getTime())) return date.toLocaleString();
                                                                                   const m = String(ts).match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
                                                                                   if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`).toLocaleString();
                                                                                   return ts;
                                                                               })()}
                                                                           </td>
                                                                       </tr>
                                                                   ))}
                                                               </tbody>
                                                           </table>
                                                       </div>
                                                       </div>
                                                  </td>
                                              </tr>
                                          )}
                                       </React.Fragment>
                                      );
                                   })
                               )}
                           </tbody>
                       </table>
                   </div>
              </Panel>
        </div>
    );
};
