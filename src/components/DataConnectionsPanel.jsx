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
import { Activity, X, Cloud, FileJson, CheckCircle, AlertCircle, Loader, ChevronDown, ChevronUp, Eye, EyeOff, Trash2, RefreshCw, Plus, Target, Database, Check, Share2 } from "lucide-react";
import { GIQPanel } from "./DataConnections/GIQPanel";
import { LPGPanel } from "./DataConnections/LPGPanel";
import { CustomGCSPanel } from "./DataConnections/CustomGCSPanel";

const DataConnectionsPanel = (props) => {
  const [localSampleError, setLocalSampleError] = React.useState(false);
  const [localSampleColor, setLocalSampleColor] = React.useState(null);
    const { showDataPanel, setShowDataPanel, INTEGRATIONS, apiConfigs, data, bucketConfigs, availableSources, showSampleData, enableLLMDResults, setEnableLLMDResults, expandedIntegration, setExpandedIntegration, setApiError, setGcsError, setLpgError, removeSampleData, removeLLMDData, restoreSampleData, driveLoading, driveStatus, driveProgress, driveError, refreshSource, setApiConfigs, setData, setSelectedSources, setAvailableSources, newProjectId, setNewProjectId, newAuthToken, setNewAuthToken, handleAddApiSource, gcsLoading, gcsError, apiError, lpgError, handleLpgFileUpload, handleLpgGcsScan, handleLpgGcsLoad, hostProject, lpgLoading, lpgPasteText, setLpgPasteText, setLpgLoading, parseLogFile, gcsSuccess, setGcsSuccess, connectionType, setConnectionType, gcsProfiles, selectedSources, removeBucket, newBucketAlias, setNewBucketAlias, newBucketName, setNewBucketName, handleAddBucket, chartMode, tputType, costMode, latType, selectedModels, activeFilters, xAxisMax, showPerChip, showSelectedOnly, showPareto, showLabels, showDataLabels, setIsInspectorOpen, qualityMetrics, setQualityInspectOpen, fetchQualityData, state, awsBucketConfigs, handleAddAWSBucket, removeAWSBucket, addToast } = props;
  const activationOrderRef = React.useRef(null);
  const prevActiveIdsRef = React.useRef(new Set());
  
    const handleClearCache = async () => {
        try {
            // GCS relies on IndexedDB caching
            const dbRequest = window.indexedDB.deleteDatabase('PrismCache');
            dbRequest.onsuccess = () => {
                addToast('Cache cleared successfully. Please reload the page.', 'success');
                setTimeout(() => window.location.reload(), 1500);
            };
            dbRequest.onerror = () => {
                addToast('Failed to clear cache.', 'error');
            };
        } catch (e) {
            console.error(e);
        }
    };

  if (!activationOrderRef.current && INTEGRATIONS) {
      activationOrderRef.current = INTEGRATIONS.map(i => i.id);
  }

  // Helper to count logical benchmarks (unique curves) instead of raw data points
  const countLogicalBenchmarks = React.useCallback((items) => {
      const uniqueKeys = new Set();
      items.forEach(d => {
          // For LPG/File-based sources, unique file is a benchmark unless it's a grouped GCS folder
          if (d.source && (d.source === 'infperf' || d.source === 'inference-perf' || d.source.startsWith('lpg:') || (d.source.startsWith('gcs:') && d.source_info?.type !== 'inferencemax'))) {
              if (d.source_info?.type === 'lpg' && d.source_info?.origin && !d.source_info.origin.includes('drag-and-drop')) {
                  uniqueKeys.add(`lpg-folder:${d.source_info.origin}::${d.model}`);
              } else {
                  const filename = d.source_info?.file_identifier || d.filename || 'unknown';
                  uniqueKeys.add(`file:${d.source}:${filename}`);
              }
              return;
          }
          
          // For Standard sources (GIQ, Drive, InferenceMax), group by logical configuration
          // Key: Model + Hardware + Chips + TP + Precision + Backend
          const key = [
              d.model,
              d.hardware,
              d.metadata?.accelerator_count || 1,
              d.precision,
              d.tp,
              d.backend || d.model_server
          ].join('::');
          uniqueKeys.add(key);
      });
      return uniqueKeys.size;
  }, []);

  const currentActiveIds = new Set();
  const mappedIntegrations = INTEGRATIONS.map(integ => {
      let isConnected = false;
      let matchCount = 0;
      let connectedBucket = null;

      const uniqueSources = Array.from(new Set(data.map(d => d.source || 'undefined')));
      console.log("[DataConnections] Unique Sources in 'data':", uniqueSources);

      if (integ.id === 'google_giq') {
          isConnected = apiConfigs.length > 0;
           const projectId = apiConfigs[0]?.projectId || (typeof apiConfigs[0] === 'string' ? apiConfigs[0] : null);
           const pInfo = projectId ? gcsProfiles.find(p => p.bucketName === projectId) : null;

           if (pInfo && pInfo.profileCount !== undefined) {
               matchCount = pInfo.profileCount;
           } else {
               const filtered = data.filter(d => d.source && d.source.startsWith('giq:'));
               const uniqueProfiles = new Set(filtered.map(d => d.profile_id).filter(Boolean));
               matchCount = uniqueProfiles.size;
           }
       } else if (integ.id === 'inferencemax') {
          const config = bucketConfigs.find(b => {
              if (typeof b === 'object' && b.alias === 'InferenceMax') return true;
              const bName = typeof b === 'string' ? b : b.bucket;
              return bName === 'seanhorgan-prism-inferencemax';
          });
          connectedBucket = config ? (typeof config === 'string' ? config : config.bucket) : null;
          isConnected = !!connectedBucket;
          if (connectedBucket) {
              const filtered = data.filter(d => d.source === `gcs:${connectedBucket}`);
              matchCount = countLogicalBenchmarks(filtered);
          }
      } else if (integ.id === 'lpg_lifecycle') {
          const filtered = data.filter(d => d.source && (d.source === 'infperf' || d.source === 'inference-perf' || d.source.startsWith('lpg:')));
          matchCount = countLogicalBenchmarks(filtered);
          isConnected = matchCount > 0;
      } else if (integ.id === 'local_sample') {
          const filtered = data.filter(d => d.source === 'local');
          matchCount = countLogicalBenchmarks(filtered);
          isConnected = showSampleData && matchCount > 0;
      } else if (integ.id === 'llmd_results') {
          const filtered = data.filter(d => d.source === 'llm-d-results:google_drive' || d.source === 'llmd_drive');
          matchCount = countLogicalBenchmarks(filtered);
          isConnected = enableLLMDResults || matchCount > 0;
          integ.isArchive = matchCount > 0 && !enableLLMDResults;
      } else if (integ.id === 'quality_scores') {
          isConnected = selectedSources.has('quality_scores');
          matchCount = qualityMetrics && isConnected ? qualityMetrics.modelCount || Object.keys(qualityMetrics.data).length : 0;
      }

      if (isConnected) currentActiveIds.add(integ.id);
      return { ...integ, isConnected, matchCount, connectedBucket };
  });

  currentActiveIds.forEach(id => {
      if (!prevActiveIdsRef.current.has(id)) {
          activationOrderRef.current = activationOrderRef.current.filter(x => x !== id);
          activationOrderRef.current.push(id);
      }
  });
  prevActiveIdsRef.current = currentActiveIds;

  const sortedIntegrations = mappedIntegrations.sort((a, b) => {
      // 1. Active (Connected) first
      if (a.isConnected && !b.isConnected) return -1;
      if (!a.isConnected && b.isConnected) return 1;
      
      // 2. Both active: sort by activation order
      if (a.isConnected && b.isConnected) {
          return activationOrderRef.current.indexOf(a.id) - activationOrderRef.current.indexOf(b.id);
      }
      
      // 3. Both inactive: sort by default order
      const defA = INTEGRATIONS.findIndex(i => i.id === a.id);
      const defB = INTEGRATIONS.findIndex(i => i.id === b.id);
      return defA - defB;
  });

  return (
            <div className={`fixed inset-y-0 right-0 w-96 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-2xl transform transition-transform duration-300 z-[60] flex flex-col ${showDataPanel ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 backdrop-blur-sm">
                    <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                        <Activity size={14} />
                        Data Connections
                    </h2>
                    <button onClick={() => setShowDataPanel(false)} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-6">

                    {/* Section 1: Integrations Catalog */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Integrations</h3>
                        <div className="grid grid-cols-1 gap-3">
                            {sortedIntegrations.map(integ => {
                                const { isConnected, matchCount, connectedBucket } = integ;
                                const Icon = integ.icon;
                                const isExpanded = expandedIntegration === integ.id;

                                return (
                                    <div key={integ.id} className={`bg-slate-50 dark:bg-slate-800 rounded-lg border transition-all duration-200 ${isConnected ? 'border-blue-500/30 dark:border-blue-500/30 shadow-sm' : 'border-slate-200 dark:border-slate-700'}`}>
                                        <div className="p-4">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className={`p-1.5 rounded-md ${isConnected ? 'bg-blue-100 dark:bg-blue-900/20' : 'bg-slate-200 dark:bg-slate-700'}`}>
                                                        <Icon size={16} className={integ.color} />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{integ.name}</h4>
                                                        <div className="flex items-center gap-2">
                                                             <span className="text-[10px] font-bold text-slate-500 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">{integ.type}</span>
                                                             {isConnected && (
                                                                 matchCount > 0 
                                                                 ? <span className="text-[10px] text-green-600 dark:text-green-400 font-medium flex items-center gap-1">● Active</span>
                                                                 : <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">● Empty</span>
                                                             )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {!integ.disabled ? (
                                                        <button
                                                            onClick={async (e) => {
                                                                e.stopPropagation();
                                                                const isConfigurable = ['google_giq', 'inferencemax', 'lpg_lifecycle'].includes(integ.id);
                                                                if (integ.id === 'llmd_results') {
                                                                    if (isConnected) {
                                                                        removeLLMDData();
                                                                    } else {
                                                                        setEnableLLMDResults(true);
                                                                    }
                                                                } else if (integ.id === 'local_sample') {
                                                                    if (isConnected) {
                                                                        removeSampleData();
                                                                        setLocalSampleError(false);
                                                                    } else {
                                                                        const success = await restoreSampleData();
                                                                        if (!success) {
                                                                            setLocalSampleColor('local_sample');
                                                                            setLocalSampleError(true);
                                                                            setTimeout(() => setLocalSampleColor(null), 500);
                                                                            setTimeout(() => setLocalSampleError(false), 4000);
                                                                        }
                                                                    }
                                                                } else if (integ.id === 'quality_scores') {
                                                                    const sourceKey = 'quality_scores';
                                                                    if (isConnected) {
                                                                        setSelectedSources(prev => { const n = new Set(prev); n.delete(sourceKey); return n; });
                                                                        setAvailableSources(prev => { const n = new Set(prev); n.delete(sourceKey); return n; });
                                                                    } else {
                                                                        fetchQualityData(true);
                                                                        setSelectedSources(prev => { const n = new Set(prev); n.add(sourceKey); return n; });
                                                                        setAvailableSources(prev => { const n = new Set(prev); n.add(sourceKey); return n; });
                                                                    }
                                                                } else if (isConfigurable) {
                                                                    if (isConnected) {
                                                                        if (integ.id === 'google_giq') {
                                                                            setApiConfigs([]);
                                                                            setData(prev => prev.filter(d => !d.source?.startsWith('giq:')).map((d, i) => ({...d, id: i})));
                                                                            const updateSet = (prev) => { const next = new Set(prev); [...next].forEach(s => { if(s.startsWith('giq:')) next.delete(s) }); return next; };
                                                                            setSelectedSources(prev => updateSet(prev));
                                                                            setAvailableSources(prev => updateSet(prev));
                                                                        } else if (integ.id === 'inferencemax') {
                                                                             if (connectedBucket) removeBucket(connectedBucket);
                                                                        } else if (integ.id === 'lpg_lifecycle') {
                                              setData(prev => prev.filter(d => !d.source?.startsWith('lpg:') && d.source !== 'infperf' && d.source !== 'inference-perf'));
                                              setSelectedSources(prev => {
                                                  const newSet = new Set([...prev].filter(s => !s.startsWith('lpg:') && s !== 'infperf' && s !== 'inference-perf'));
                                                  return newSet;
                                              });
                                              setAvailableSources(prev => {
                                                  const newSet = new Set([...prev].filter(s => !s.startsWith('lpg:') && s !== 'infperf' && s !== 'inference-perf'));
                                                  return newSet;
                                              });
                                          }
                                                                        if (isExpanded) setExpandedIntegration(null);
                                                                    } else {
                                                                        setExpandedIntegration(isExpanded ? null : integ.id);
                                                                        if (integ.id === 'google_giq') setApiError(null);
                                                                        if (integ.id === 'inferencemax') setGcsError(null);
                                                                        if (integ.id === 'lpg_lifecycle') setLpgError(null);
                                                                    }
                                                                }
                                                            }}
                                                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 ${isConnected ? 'bg-blue-600' : (localSampleColor === integ.id ? 'bg-red-500' : 'bg-slate-200 dark:bg-slate-700')}`}
                                                        >
                                                            <span className="sr-only">Toggle Connection</span>
                                                            <span
                                                                aria-hidden="true"
                                                                className={`${isConnected ? 'translate-x-4' : 'translate-x-0'} pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out`}
                                                            />
                                                        </button>
                                                    ) : (
                                                        <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-500 px-2 py-1 rounded cursor-not-allowed opacity-80">Coming Soon</span>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
                                                {integ.description}
                                            </p>
                                            
                                            {integ.id === 'local_sample' && localSampleError && (
                                                <div className="mb-2 text-xs flex items-center gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 p-2 rounded animate-pulse">
                                                    <AlertCircle size={12} />
                                                    <span>No sample data found (public/data.json is missing or invalid).</span>
                                                </div>
                                            )}
                                            
                                            {integ.id === 'local_sample' && !isConnected && showSampleData && !localSampleError && (
                                                <div className="mb-2 text-xs flex items-center gap-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 p-2 rounded">
                                                    <AlertCircle size={12} />
                                                    <span>No benchmarks found in local storage (data.json).</span>
                                                </div>
                                            )}
                                            
                                            {/* Drive Sync Status */}
                                            {integ.id === 'llmd_results' && (isConnected || driveLoading || driveStatus) && (
                                                <div className="mt-2 text-xs">
                                                    {driveLoading && (
                                                        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10 p-2 rounded animate-pulse">
                                                            <Loader size={12} className="animate-spin" />
                                                            <span>{driveStatus || (driveProgress > 0 ? `syncing... (${driveProgress} files)` : "Initializing...")}</span>
                                                        </div>
                                                    )}
                                                    
                                                    {/* Archive Loaded State */}
                                                    {integ.isArchive && !driveLoading && (
                                                        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/10 p-2 rounded">
                                                            <Database size={12} />
                                                            <span>Loaded from Local Archive ({matchCount} {matchCount === 1 ? 'benchmark' : 'benchmarks'})</span>
                                                        </div>
                                                    )}

                                                    {/* Live Sync Status */}
                                                    {!integ.isArchive && !driveLoading && driveStatus && !driveError && (
                                                        <div className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/10 p-2 rounded">
                                                            <CheckCircle size={12} />
                                                            <span>{driveStatus} ({matchCount} {matchCount === 1 ? 'benchmark' : 'benchmarks'})</span>
                                                        </div>
                                                    )}
                                                    {driveError && (
                                                        <div className="flex items-start gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 p-2 rounded mt-1">
                                                            <AlertCircle size={12} className="mt-0.5" />
                                                            <span className="whitespace-pre-wrap">{driveError}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Generic Status for other integrations */}
                                            {integ.id !== 'llmd_results' && isConnected && (
                                                <div className="mt-2 text-xs">
                                                    {(() => {
                                                        const pErrorId = integ.id === 'google_giq' ? apiConfigs[0]?.projectId : connectedBucket;
                                                        const profileError = pErrorId ? gcsProfiles.find(p => p.bucketName === pErrorId)?.error : null;
                                                        const isLoading = pErrorId ? gcsProfiles.find(p => p.bucketName === pErrorId)?.loading : false;

                                                        if (isLoading) {
                                                            return (
                                                                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10 p-2 rounded">
                                                                    <Loader size={12} className="animate-spin" />
                                                                    <span>Connecting...</span>
                                                                </div>
                                                            );
                                                        }

                                                        if (profileError) {
                                                            return (
                                                                <div className="flex items-start gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 p-2 rounded mt-1">
                                                                    <AlertCircle size={12} className="mt-0.5" />
                                                                    <span className="whitespace-pre-wrap">{profileError} (Match count: {matchCount})</span>
                                                                </div>
                                                            );
                                                        }

                                                        return (
                                                            <div className="flex items-center justify-between text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/10 p-2 rounded">
                                                                <div className="flex items-center gap-2">
                                                                    <CheckCircle size={12} />
                                                                    <span>Active ({matchCount} {integ.id === 'quality_scores' ? (matchCount === 1 ? 'model' : 'models') :
                                                                        integ.id === 'google_giq' ? (matchCount === 1 ? 'profile' : 'profiles') :
                                                                            (matchCount === 1 ? 'benchmark' : 'benchmarks')})</span>
                                                                </div>
                                                                {integ.id === 'lpg_lifecycle' && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setData(prev => prev.filter(d => !d.source?.startsWith('lpg:') && d.source !== 'infperf' && d.source !== 'inference-perf'));
                                                          setSelectedSources(prev => new Set([...prev].filter(s => !s.startsWith('lpg:') && s !== 'infperf' && s !== 'inference-perf')));
                                                          setAvailableSources(prev => new Set([...prev].filter(s => !s.startsWith('lpg:') && s !== 'infperf' && s !== 'inference-perf')));
                                                                            if (setGcsSuccess) setGcsSuccess(null);
                                                                        }}
                                                                        className="text-red-600 dark:text-red-400 hover:underline px-1 py-0.5"
                                                                    >
                                                                        Clear
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            )}

                                        {/* Integration Configuration Panel (GIQ) */}

                                        {isExpanded && integ.id === 'google_giq' && (
                                            <GIQPanel 
                                                apiConfigs={apiConfigs} setApiConfigs={setApiConfigs} setData={setData} 
                                                setSelectedSources={setSelectedSources} setAvailableSources={setAvailableSources}
                                                refreshSource={refreshSource} newProjectId={newProjectId} setNewProjectId={setNewProjectId}
                                                newAuthToken={newAuthToken} setNewAuthToken={setNewAuthToken} handleAddApiSource={handleAddApiSource}
                                                gcsLoading={gcsLoading} apiError={apiError}
                                                gcsSuccess={gcsSuccess} setGcsSuccess={setGcsSuccess} gcsError={gcsError}
                                            />
                                        )}

                                        {/* Integration Configuration Panel (LPG Lifecycle) */}
                                        {isExpanded && integ.id === 'lpg_lifecycle' && (
                                            <LPGPanel
                                                lpgError={lpgError} handleLpgFileUpload={handleLpgFileUpload} lpgLoading={lpgLoading}
                                                lpgPasteText={lpgPasteText} setLpgPasteText={setLpgPasteText} setLpgLoading={setLpgLoading}
                                                setLpgError={setLpgError} parseLogFile={parseLogFile} data={data} setData={setData}
                                                setSelectedSources={setSelectedSources} setAvailableSources={setAvailableSources}
                                                setGcsSuccess={setGcsSuccess} setExpandedIntegration={setExpandedIntegration}
                                                availableSources={availableSources}
                                                handleLpgGcsScan={handleLpgGcsScan} handleLpgGcsLoad={handleLpgGcsLoad}
                                                hostProject={hostProject}
                                                lpgMatchCount={matchCount}
                                                gcsSuccess={gcsSuccess} // Now passed as prop
                                            />
                                        )}
                                    </div>
                                </div>
                            );

                            })}
                        </div>
                    </div>



                    <div className="h-px bg-slate-200 dark:bg-slate-700/50 my-4" />

                    {/* Section 2: Custom Connections */}
                    <CustomGCSPanel
                        connectionType={connectionType} setConnectionType={setConnectionType}
                        availableSources={availableSources} gcsProfiles={gcsProfiles}
                        selectedSources={selectedSources} setSelectedSources={setSelectedSources}
                        removeBucket={removeBucket} refreshSource={refreshSource}
                        newBucketAlias={newBucketAlias} setNewBucketAlias={setNewBucketAlias}
                        newBucketName={newBucketName} setNewBucketName={setNewBucketName}
                        handleAddBucket={handleAddBucket} gcsLoading={gcsLoading}
                        awsBucketConfigs={awsBucketConfigs}
                        handleAddAWSBucket={handleAddAWSBucket}
                        removeAWSBucket={removeAWSBucket}
                        gcsSuccess={gcsSuccess}
                        gcsError={gcsError}
                    />


                    
                    {/* Admin: Global Config */}
                    <div className="pt-6 pb-2 border-t border-slate-200 dark:border-slate-700">
                         <div className="flex justify-center">
                             <button 
                                 onClick={() => {
                                     // Generate Config JSON
                                     const config = {
                                         chartMode,
                                         tputType,
                                         costMode,
                                         latType,
                                         selectedModels: [...selectedModels].map(k => {
                                             if (k.includes('::') && !k.startsWith('file:') && !k.startsWith('inference-perf:')) {
                                                 const parts = k.split('::');
                                                 if (parts.length >= 3) {
                                                     // Convert to portable format: *::*::model::...
                                                     return ['*', '*', ...parts.slice(2)].join('::');
                                                 }
                                             }
                                             return k;
                                         }), // Array for JSON
                                         modelsFilter: [...activeFilters.models],
                                         hwFilter: [...activeFilters.hardware],
                                         precFilter: [...activeFilters.precisions],
                                         tpFilter: [...activeFilters.tp],
                                         islFilter: [...activeFilters.isl],
                                         oslFilter: [...activeFilters.osl],
                                         ratioFilter: [...activeFilters.ratio],
                                         sources: [...selectedSources],
                                         buckets: bucketConfigs.map(b => typeof b === 'string' ? b : b.bucket),
                                         apis: apiConfigs.map(c => typeof c === 'string' ? c : c.projectId),
                                         xAxisMax: isFinite(xAxisMax) ? xAxisMax : "Infinity",
                                         showPerChip,
                                         showSelectedOnly,
                                         showPareto,
                                         showLabels,
                                         showDataLabels
                                     };
                                     
                                     const jsContent = `export const defaultState = {
    chartMode: "${config.chartMode}",
    tputType: "${config.tputType}",
    costMode: "${config.costMode}",
    latType: "${config.latType}",
    selectedModels: new Set(${JSON.stringify(config.selectedModels)}),
    modelsFilter: new Set(${JSON.stringify(config.modelsFilter)}),
    hwFilter: new Set(${JSON.stringify(config.hwFilter)}),
    precFilter: new Set(${JSON.stringify(config.precFilter)}),
    tpFilter: new Set(${JSON.stringify(config.tpFilter)}),
    islFilter: new Set(${JSON.stringify(config.islFilter)}),
    oslFilter: new Set(${JSON.stringify(config.oslFilter)}),
    ratioFilter: new Set(${JSON.stringify(config.ratioFilter)}),
    sources: new Set(${JSON.stringify(config.sources)}),
    buckets: ${JSON.stringify(config.buckets)},
    apis: ${JSON.stringify(config.apis)},
    xAxisMax: ${config.xAxisMax === "Infinity" ? "Infinity" : config.xAxisMax},
    showPerChip: ${config.showPerChip},
    showSelectedOnly: ${config.showSelectedOnly},
    showPareto: ${config.showPareto},
    showLabels: ${config.showLabels},
    showDataLabels: ${config.showDataLabels}
};`;
                                     navigator.clipboard.writeText(jsContent);
                                     setGcsSuccess("Configuration copied! Paste into src/config/defaultState.js");
                                     setTimeout(() => setGcsSuccess(null), 4000);
                                 }}
                                 className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 underline flex items-center gap-1.5 transition-colors"
                             >
                                 <Share2 size={10} />
                                 Copy Current View as Default Config
                             </button>
                         </div>
                    </div>
                </div>
                
                {/* Footer Inspector Link */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                  <button
                      onClick={handleClearCache}
                      className="w-1/2 flex items-center justify-center gap-2 text-xs text-rose-500 hover:text-white py-2 border border-rose-200 hover:border-rose-500 hover:bg-rose-500 dark:border-rose-900/50 dark:hover:bg-rose-600 dark:hover:border-rose-600 rounded transition-colors"
                  >
                      <Trash2 size={12} />
                      Clear Local Cache
                  </button>
                  <button
                      onClick={() => { setIsInspectorOpen(true); setShowDataPanel(false); }}
                      className="w-1/2 flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white py-2 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                      <Database size={12} />
                      Open Data Inspector
                  </button>
              </div>
                </div>
            </div>
  );
};

export default DataConnectionsPanel;
