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

import React, { useState, useMemo } from 'react';
import { X, Search, AlertTriangle, CheckCircle, Database, FileJson, ArrowRight } from 'lucide-react';
import { normalizeQualityModelName } from '../utils/qualityParser';
import { Badge, Checkbox, EmptyState, Input, Select } from './ui';
import { cn } from '../utils/cn';

const DataInspector = ({ data, qualityMetrics, isOpen, onClose, initialSelectionId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProblematic, setFilterProblematic] = useState(false);
  const [filterSource, setFilterSource] = useState('all'); // NEW
  const [selectedEntry, setSelectedEntry] = useState(null);

  // Auto-select initial entry if provided
  React.useEffect(() => {
    if (isOpen && initialSelectionId && data) {
        const entry = data.find(d => d.id === initialSelectionId);
        if (entry) {
            setSelectedEntry(entry);
        }
    } else if (!isOpen) {
        // Reset when closed
        setSelectedEntry(null);
    }
  }, [isOpen, initialSelectionId, data]);

  const filteredData = useMemo(() => {
    let result = data;

    // Source Filter
    if (filterSource !== 'all') {
        result = result.filter(d => {
            const origin = (d.source_info?.origin || 'Unknown');
            return origin === filterSource;
        });
    }

    if (filterProblematic) {
      result = result.filter(d => 
        !d.metrics || 
        d.metrics.throughput === 0 || 
        d.metrics.latency?.mean === 0 || 
        d.metrics.error_count > 0 ||
        (d._diagnostics?.msg && d._diagnostics.msg.length > 0)
      );
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(d => 
        (d.metadata?.model_name || '').toLowerCase().includes(term) ||
        (d.source_info?.origin || '').toLowerCase().includes(term) ||
        (d.source_info?.file_identifier || '').toLowerCase().includes(term)
      );
    }

    return result;
  }, [data, searchTerm, filterProblematic, filterSource]);

  if (!isOpen) return null;

  return (
    <div className="dark fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      {/* The inspector is deliberately dark regardless of app theme; the `dark`
          class scopes the theme tokens so the ui/ primitives inside follow suit. */}
      <div className="bg-slate-900 border border-slate-700 w-full max-w-6xl h-[90vh] rounded-xl flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-800/50">
          <div className="flex items-center gap-3">
            <Database className="text-blue-400" size={20} />
            <div>
              <h2 className="text-lg font-bold text-slate-100">Data Ingestion Inspector</h2>
              <p className="text-xs text-slate-400">
                Debugging {data.length} total entries | {filteredData.length} visible
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* content */}
        <div className="flex-1 flex min-h-0">
          
          {/* List View */}
          <div className="w-1/3 border-r border-slate-700 flex flex-col">
            <div className="p-3 border-b border-slate-700 space-y-3 bg-slate-800/20">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
                <Input
                  type="text"
                  placeholder="Search models, files..."
                  className="pl-9 text-xs"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="flex gap-2">
                 <Select
                    value={filterSource}
                    onChange={(e) => setFilterSource(e.target.value)}
                    className="flex-1 px-2 py-1.5 text-xs appearance-none"
                    style={{ backgroundImage: 'none' }}
                 >
                     <option value="all">All Sources</option>
                     {Array.from(new Set(data.map(d => d.source_info?.origin || 'Unknown')))
                        .sort()
                        .map(source => (
                            <option key={source} value={source}>{source}</option>
                        ))
                     }
                 </Select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={filterProblematic}
                  onChange={(e) => setFilterProblematic(e.target.checked)}
                />
                <span className="text-xs text-slate-300 font-medium">Show problematic only</span>
              </label>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredData.map(entry => {
                const isProblematic = !entry.metrics || entry.metrics.throughput === 0 || entry.metrics.latency?.mean === 0;
                const isSelected = selectedEntry?.id === entry.id;
                
                return (
                  <div 
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className={cn(
                      'p-3 border-b border-slate-700/50 cursor-pointer transition-colors',
                      isSelected ? 'bg-blue-900/40 border-l-2 border-l-blue-400' : 'hover:bg-slate-800/50 border-l-2 border-l-transparent'
                    )}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-200 truncate pr-2" title={entry.metadata?.model_name}>
                        {entry.metadata?.model_name || 'Unknown'}
                      </span>
                      {isProblematic && <AlertTriangle size={12} className="text-amber-400 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mb-1">
                        <Badge tone="neutral" size="xs">{entry.source_info?.type || 'UNK'}</Badge>
                        <span className="truncate max-w-[120px]">{entry.source_info?.origin || 'Unknown'}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                        <span className={!entry.metrics || entry.metrics.throughput === 0 ? "text-red-400" : "text-slate-500"}>
                            Tput: {entry.metrics?.throughput?.toFixed(0) ?? 'N/A'}
                        </span>
                         <span className={!entry.metrics || entry.metrics.latency?.mean === 0 ? "text-red-400" : "text-slate-500"}>
                            Lat: {entry.metrics?.latency?.mean?.toFixed(2) ?? 'N/A'}
                        </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Details View */}
          <div className="flex-1 overflow-y-auto bg-slate-950 p-6">
            {selectedEntry ? (
              <div className="space-y-6">
                
                {/* Status Banner */}
                <div className="flex items-center justify-between">
                   <h3 className="text-xl font-medium text-white">{selectedEntry.metadata?.model_name || 'Unknown Model'}</h3>
                   <div className="flex gap-2">
                      <Badge tone="neutral" size="md" className="font-mono">
                        ID: {selectedEntry.id}
                      </Badge>
                   </div>
                </div>

                {/* Diagnostics Panel */}
                {selectedEntry._diagnostics?.msg?.length > 0 && (
                  <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-amber-400 mb-2 flex items-center gap-2">
                       <AlertTriangle size={16} />
                       Ingestion Warnings
                    </h4>
                    <ul className="list-disc list-inside text-xs text-amber-200 space-y-1">
                      {selectedEntry._diagnostics.msg.map((msg, i) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Source Details Card */}
                <div className="bg-slate-900 rounded-lg border border-slate-700 p-4 grid grid-cols-2 gap-4">
                     <div>
                        <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Source Origin</span>
                        <div className="text-sm text-slate-300 font-mono mt-1 break-all">
                            {selectedEntry.source_info?.origin || 'Unknown Origin'}
                        </div>
                     </div>
                     <div>
                        <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">File Identifier / Path</span>
                        <div className="text-sm text-slate-300 font-mono mt-1 break-all">
                            {selectedEntry.source_info?.file_identifier || 'Unknown File'}
                        </div>
                     </div>
                     {selectedEntry.source_info?.raw_url && (
                        <div className="col-span-2 border-t border-slate-800 pt-3 mt-1">
                            <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Raw URL</span>
                            <a 
                                href={selectedEntry.source_info.raw_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1 truncate"
                            >
                                {selectedEntry.source_info.raw_url}
                                <ArrowRight size={10} />
                            </a>
                        </div>
                     )}
                </div>

                {/* Mapped Data */}
                <div className="grid grid-cols-2 gap-4">
                  
                  {/* Normalized Column */}
                  <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden flex flex-col">
                    <div className="px-3 py-2 bg-slate-800 border-b border-slate-700 font-medium text-xs text-slate-300 flex items-center gap-2">
                       <CheckCircle size={14} className="text-green-400" />
                       Normalized Schema (App State)
                    </div>
                    <div className="p-3 overflow-x-auto flex-1 h-[400px]">
                        <pre className="text-[10px] font-mono text-green-300 leading-relaxed">
                          {JSON.stringify({
                              metadata: selectedEntry.metadata,
                              metrics: selectedEntry.metrics,
                              workload: selectedEntry.workload,
                              source: selectedEntry.source_info
                          }, null, 2)}
                        </pre>
                    </div>
                  </div>

                  {/* Raw Source Column */}
                  <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden flex flex-col">
                    <div className="px-3 py-2 bg-slate-800 border-b border-slate-700 font-medium text-xs text-slate-300 flex items-center gap-2">
                       <FileJson size={14} className="text-blue-400" />
                       Raw Source Snapshot
                    </div>
                    <div className="p-3 overflow-x-auto relative group flex-1 h-[400px]">
                        <pre className="text-[10px] font-mono text-blue-300 leading-relaxed whitespace-pre-wrap break-all">
                          {selectedEntry?._diagnostics?.raw_snapshot 
                            ? JSON.stringify(selectedEntry._diagnostics.raw_snapshot, null, 2)
                            : "// No raw snapshot available in entry._diagnostics"
                          }
                        </pre>
                    </div>
                  </div>

                </div>

                {/* Quality Metrics Profile */}
                {(() => {
                    const normModel = normalizeQualityModelName(selectedEntry?.model || selectedEntry?.metadata?.model_name);
                    const qData = qualityMetrics?.data?.[normModel];
                    if (!qData) return null;

                    return (
                        <div className="bg-indigo-950/30 rounded-lg border border-indigo-500/30 p-4 mt-6">
                            <h4 className="text-sm font-semibold text-indigo-300 mb-3 flex items-center gap-2">
                                <Database size={16} />
                                Quality Scores (Merged)
                            </h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {Object.entries(qData).map(([key, value]) => {
                                    if (key === 'timestamp' || key === 'id') return null;
                                    
                                    const formatLabel = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).replace('Mmlu', 'MMLU').replace('Bench', 'Benchmark');
                                    const isPercentage = key.toLowerCase().includes('mmlu') || key.toLowerCase().includes('bench');
                                    const displayValue = isPercentage ? `${value}%` : value;

                                    return (
                                        <div key={key} className="bg-indigo-900/40 border border-indigo-500/20 p-3 rounded flex flex-col">
                                            <span className="text-[10px] uppercase text-indigo-400 font-bold tracking-wider mb-1">{formatLabel(key)}</span>
                                            <span className="text-xl font-bold text-indigo-100 font-mono">{displayValue || 'N/A'}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-2 text-[10px] text-indigo-500 italic">
                                Normalized model ID: {normModel}
                            </div>
                        </div>
                    );
                })()}

              </div>
            ) : (
              <EmptyState
                className="h-full"
                icon={<Database size={48} className="opacity-50" />}
                message="Select an entry to inspect normalization details"
              />
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default DataInspector;
