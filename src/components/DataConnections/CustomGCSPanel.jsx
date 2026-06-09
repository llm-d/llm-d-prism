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
import { ChevronDown, ChevronUp, Cloud, Eye, EyeOff, Trash2, RefreshCw, Loader, Plus, Database } from "lucide-react";
import { getSourceTypeStyle } from "../../utils/dashboardHelpers";

export const CustomGCSPanel = ({
    connectionType, setConnectionType, availableSources, gcsProfiles, 
    selectedSources, setSelectedSources, removeBucket, refreshSource, 
    newBucketAlias, setNewBucketAlias, newBucketName, setNewBucketName, 
    handleAddBucket, gcsLoading, awsBucketConfigs, handleAddAWSBucket, removeAWSBucket,
    gcsSuccess, gcsError
}) => {
    return (
        <div className="space-y-3">
             <div 
                className="flex items-center justify-between cursor-pointer hover:opacity-80"
                onClick={() => setConnectionType(connectionType === 'custom_hidden' ? 'gcs' : 'custom_hidden')}
             >
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-2">
                    Custom Connections 
                    <span className="bg-slate-200 dark:bg-slate-800 text-slate-500 rounded-full px-1.5 py-0.5 text-[9px]">
                        {(() => {
                            return [...availableSources].filter(s => {
                                if (s.startsWith('giq:')) return false;
                                if (s === 'local') return false; 
                                return true;
                            }).length;
                        })()}
                    </span>
                </h3>
                {connectionType === 'custom_hidden' ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronUp size={14} className="text-slate-400" />}
             </div>
             
             {connectionType !== 'custom_hidden' && (
                 <div className="animate-in slide-in-from-top-2 duration-200 space-y-4">
                     {gcsError && (
                         <div className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-900/50">
                             {gcsError}
                         </div>
                     )}
                     {gcsSuccess && (gcsSuccess.includes('bucket') || gcsSuccess.includes('Bucket')) && (
                         <div className="text-xs text-green-500 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-2 rounded border border-green-200 dark:border-green-900/50">
                             {gcsSuccess}
                         </div>
                     )}
                     {/* Active Custom List */}
                     <div className="space-y-3">
                         {gcsProfiles.filter(p => p.type === 'gcs').sort((a, b) => {
                             const aActive = selectedSources.has(`gcs:${a.bucketName}`);
                             const bActive = selectedSources.has(`gcs:${b.bucketName}`);
                             if (aActive && !bActive) return -1;
                             if (!aActive && bActive) return 1;
                             return 0;
                         }).map(profile => (
                            <div key={profile.bucketName} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-all duration-200 group">
                                 <div className="p-4">
                                     <div className="flex justify-between items-start mb-2">
                                         <div className="flex items-center gap-2">
                                              <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/20">
                                                  <Cloud size={16} className="text-blue-600 dark:text-blue-400" />
                                              </div>
                                              <div>
                                                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{profile.alias || profile.bucketName}</h4>
                                                  <div className="flex items-center gap-1">
                                                       <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">Custom GCS</span>
                                                       {(() => {
                                                           const style = getSourceTypeStyle('Cloud');
                                                           return (
                                                               <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${style.bg} ${style.text} ${style.border}`}>
                                                                   Cloud
                                                               </span>
                                                           );
                                                       })()}
                                                       <span className="text-[10px] text-green-600 dark:text-green-400 font-medium flex items-center gap-1">● Active</span>
                                                  </div>
                                              </div>
                                         </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                                        <button
                                            onClick={() => {
                                                const sourceKey = `gcs:${profile.bucketName}`;
                                                const newSet = new Set(selectedSources);
                                                if (newSet.has(sourceKey)) {
                                                    newSet.delete(sourceKey);
                                                } else {
                                                    newSet.add(sourceKey);
                                                }
                                                setSelectedSources(newSet);
                                            }}
                                            className={`p-1.5 rounded transition-colors ${selectedSources.has(`gcs:${profile.bucketName}`) 
                                                ? 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20' 
                                                : 'text-slate-300 dark:text-slate-600 hover:text-slate-500'}`}
                                            title={selectedSources.has(`gcs:${profile.bucketName}`) ? "Hide Data" : "Show Data"}
                                        >
                                            {selectedSources.has(`gcs:${profile.bucketName}`) ? <Eye size={14} /> : <EyeOff size={14} />}
                                        </button>
                                        <button 
                                            onClick={() => removeBucket(profile.bucketName)}
                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                            title="Disconnect Source"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                     </div>
                                     
                                     <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed font-mono">
                                         gs://{profile.bucketName}
                                     </p>

                                     <div className="flex items-center gap-2 justify-between">
                                         <div className="flex gap-2">
                                             <span className="text-[10px] text-slate-500 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded-full">Storage</span>
                                             <button 
                                                 onClick={() => refreshSource('gcs', profile.bucketName)}
                                                 className="text-[10px] text-blue-500 hover:underline flex items-center gap-1"
                                             >
                                                 <RefreshCw size={10} /> Refresh
                                             </button>
                                         </div>
                                          <span className="text-[10px] text-slate-400">
                                              {profile.loading ? (
                                                  <div className="flex items-center gap-1.5 text-blue-500">
                                                      <Loader size={10} className="animate-spin" />
                                                      <span>Restoring...</span>
                                                  </div>
                                              ) : (
                                                  <span>{profile.entryCount} benchmarks loaded</span>
                                              )}
                                          </span>
                                      </div>
                                 </div>
                             </div>
                         ))}

                         {gcsProfiles.filter(p => p.type === 'aws').sort((a, b) => {
                             const aActive = selectedSources.has(`aws:${a.bucketName}`);
                             const bActive = selectedSources.has(`aws:${b.bucketName}`);
                             if (aActive && !bActive) return -1;
                             if (!aActive && bActive) return 1;
                             return 0;
                         }).map(profile => (
                            <div key={profile.bucketName} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-all duration-200 group">
                                 <div className="p-4">
                                     <div className="flex justify-between items-start mb-2">
                                         <div className="flex items-center gap-2">
                                              <div className="p-1.5 rounded-md bg-orange-100 dark:bg-orange-900/20">
                                                  <Cloud size={16} className="text-orange-600 dark:text-orange-400" />
                                              </div>
                                              <div>
                                                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{profile.alias || profile.bucketName}</h4>
                                                  <div className="flex items-center gap-1">
                                                       <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">Custom AWS</span>
                                                       {(() => {
                                                           const style = getSourceTypeStyle('Cloud');
                                                           return (
                                                               <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${style.bg} ${style.text} ${style.border}`}>
                                                                   Cloud
                                                               </span>
                                                           );
                                                       })()}
                                                       <span className="text-[10px] text-green-600 dark:text-green-400 font-medium flex items-center gap-1">● Active</span>
                                                  </div>
                                              </div>
                                         </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                                        <button
                                            onClick={() => {
                                                const sourceKey = `aws:${profile.bucketName}`;
                                                const newSet = new Set(selectedSources);
                                                if (newSet.has(sourceKey)) {
                                                    newSet.delete(sourceKey);
                                                } else {
                                                    newSet.add(sourceKey);
                                                }
                                                setSelectedSources(newSet);
                                            }}
                                            className={`p-1.5 rounded transition-colors ${selectedSources.has(`aws:${profile.bucketName}`) 
                                                ? 'text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20' 
                                                : 'text-slate-300 dark:text-slate-600 hover:text-slate-500'}`}
                                            title={selectedSources.has(`aws:${profile.bucketName}`) ? "Hide Data" : "Show Data"}
                                        >
                                            {selectedSources.has(`aws:${profile.bucketName}`) ? <Eye size={14} /> : <EyeOff size={14} />}
                                        </button>
                                        <button 
                                            onClick={() => removeAWSBucket(profile.bucketName)}
                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                            title="Disconnect Source"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                     </div>
                                     
                                     <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed font-mono">
                                         s3://{profile.bucketName}
                                     </p>

                                     <div className="flex items-center gap-2 justify-between">
                                         <div className="flex gap-2">
                                             <span className="text-[10px] text-slate-500 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded-full">Storage</span>
                                             <button 
                                                 onClick={() => refreshSource('aws', profile.bucketName)}
                                                 className="text-[10px] text-orange-500 hover:underline flex items-center gap-1"
                                             >
                                                 <RefreshCw size={10} /> Refresh
                                             </button>
                                         </div>
                                          <span className="text-[10px] text-slate-400">
                                              {profile.loading ? (
                                                  <div className="flex items-center gap-1.5 text-orange-500">
                                                      <Loader size={10} className="animate-spin" />
                                                      <span>Restoring...</span>
                                                  </div>
                                              ) : (
                                                  <span>{profile.entryCount} benchmarks loaded</span>
                                              )}
                                          </span>
                                      </div>
                                 </div>
                             </div>
                         ))}
                     </div>

                     {/* Custom Add Form */}
                     <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 space-y-3">
                         <h4 className="text-[10px] font-bold text-slate-500 uppercase">Add New Source</h4>
                         <div className="flex gap-2 p-1 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 text-xs">
                              <button onClick={() => setConnectionType('gcs')} className={`flex-1 py-1 rounded text-center transition-colors ${connectionType === 'gcs' ? 'bg-slate-200 dark:bg-slate-700 font-medium' : 'text-slate-500'}`}>GCS Bucket</button>
                              <button onClick={() => setConnectionType('aws')} className={`flex-1 py-1 rounded text-center transition-colors ${connectionType === 'aws' ? 'bg-slate-200 dark:bg-slate-700 font-medium' : 'text-slate-500'}`}>AWS Bucket</button>
                         </div>

                         {connectionType === 'gcs' && (
                             <div className="space-y-2">
                                 <input 
                                    type="text" 
                                    placeholder="Source Name (Optional)" 
                                    value={newBucketAlias}
                                    onChange={(e) => setNewBucketAlias(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-xs px-3 py-2 text-slate-800 dark:text-slate-300 focus:border-blue-500 outline-none"
                                 />
                                 <input 
                                    type="text" 
                                    placeholder="gs://bucket-name" 
                                    value={newBucketName}
                                    onChange={(e) => setNewBucketName(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-xs px-3 py-2 text-slate-800 dark:text-slate-300 focus:border-blue-500 outline-none"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddBucket(newBucketAlias)}
                                 />
                                 <button 
                                      onClick={() => handleAddBucket(newBucketAlias)}
                                      disabled={gcsLoading || !newBucketName}
                                      className="w-full bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white px-3 py-2 rounded text-xs font-medium flex items-center justify-center gap-2"
                                  >
                                      {gcsLoading ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />}
                                      Add Bucket
                                  </button>
                             </div>
                         )}
                          {connectionType === 'aws' && (
                              <div className="space-y-2">
                                  <input 
                                     type="text" 
                                     placeholder="Source Name (Optional)" 
                                     value={newBucketAlias}
                                     onChange={(e) => setNewBucketAlias(e.target.value)}
                                     className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-xs px-3 py-2 text-slate-800 dark:text-slate-300 focus:border-blue-500 outline-none"
                                  />
                                  <input 
                                     type="text" 
                                     placeholder="s3-bucket-name" 
                                     value={newBucketName}
                                     onChange={(e) => setNewBucketName(e.target.value)}
                                     className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-xs px-3 py-2 text-slate-800 dark:text-slate-300 focus:border-blue-500 outline-none"
                                     onKeyDown={(e) => e.key === 'Enter' && handleAddAWSBucket(newBucketAlias)}
                                  />
                                  <button 
                                       onClick={() => handleAddAWSBucket(newBucketAlias)}
                                       disabled={gcsLoading || !newBucketName}
                                       className="w-full bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white px-3 py-2 rounded text-xs font-medium flex items-center justify-center gap-2"
                                   >
                                       {gcsLoading ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />}
                                       Add Bucket
                                   </button>
                              </div>
                          )}
                     </div>
                 </div>
             )}
        </div>
    );
};
