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
import { RefreshCw, X, Plus } from "lucide-react";
import { Input, Spinner } from "../ui";

export const GIQPanel = ({
    apiConfigs, setApiConfigs, setData, setSelectedSources, setAvailableSources,
    refreshSource, newProjectId, setNewProjectId, newAuthToken, setNewAuthToken,
    handleAddApiSource, gcsLoading, apiError, gcsSuccess, setGcsSuccess, gcsError
}) => {
    return (
        <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 p-4 animate-in slide-in-from-top-2 duration-200">
            <div className="space-y-3">
                 {gcsError && gcsError.includes('GIQ') && (
                    <div className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-900/50">
                        {gcsError}
                    </div>
                 )}
                 {gcsSuccess && gcsSuccess.includes('GIQ') && (
                    <div className="text-xs text-green-500 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-2 rounded border border-green-200 dark:border-green-900/50">
                        {gcsSuccess}
                    </div>
                 )}
                 {/* Active Connection Display */}
                 {apiConfigs.length > 0 && (
                     <div className="space-y-2 mb-4">
                         <h5 className="text-[10px] font-bold text-slate-500 uppercase">Active Connection</h5>
                         {(() => {
                             const conf = apiConfigs[0];
                             const pid = typeof conf === 'string' ? conf : conf.projectId;
                             return (
                                 <div className="flex justify-between items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded">
                                     <div className="flex items-center gap-2" title="Active Project">
                                         <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                         <span className="text-xs font-mono font-medium text-slate-700 dark:text-slate-200">{pid}</span>
                                     </div>
                                     <div className="flex items-center gap-1">
                                         <button 
                                            onClick={() => refreshSource('giq', pid, 'full')} 
                                            className="p-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                            title="Refresh Data"
                                         >
                                             <RefreshCw size={12} />
                                         </button>
                                         <button onClick={() => {
                                             setApiConfigs([]);
                                              const sourceKey = `giq:${pid}`;
                                              setData(prev => prev.filter(d => d.source !== sourceKey).map((d, i) => ({...d, id: i})));
                                              const updateSet = (prev) => {
                                                  const next = new Set(prev);
                                                  next.delete(sourceKey);
                                                  return next;
                                              };
                                              setSelectedSources(prev => updateSet(prev));
                                              setAvailableSources(prev => updateSet(prev));
                                         }} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Disconnect">
                                             <X size={12} />
                                         </button>
                                     </div>
                                 </div>
                             );
                         })()}
                     </div>
                 )}

                 {/* Use Single Project Connection Form */}
                    <h5 className="text-[10px] font-bold text-slate-500 uppercase">{apiConfigs.length > 0 ? "Switch Connection" : "Google Cloud Project"}</h5>
                    <div className="space-y-2">
                             <Input
                                type="text"
                                placeholder="Google Cloud Project ID"
                                value={newProjectId}
                                onChange={(e) => setNewProjectId(e.target.value)}
                                className="text-xs"
                             />
                             <Input
                                type="password"
                                placeholder="Access Token (Optional - defaults to ADC)"
                                value={newAuthToken}
                                onChange={(e) => setNewAuthToken(e.target.value)}
                                className="text-xs"
                                onKeyDown={(e) => e.key === 'Enter' && handleAddApiSource()}
                             />
                             <button 
                                  onClick={handleAddApiSource}
                                  disabled={gcsLoading || !newProjectId}
                                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-2 rounded text-xs font-medium flex items-center justify-center gap-2"
                              >
                                  {gcsLoading ? <Spinner className="w-3 h-3 text-white dark:text-white" /> : <Plus size={12} />}
                                  Connect
                              </button>
                         </div>
                 {apiError && (
                   <div className="text-xs text-red-500 dark:text-red-400 mt-2 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-900/50 whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
                       {apiError}
                   </div>
                 )}
            </div>
        </div>
    );
};
