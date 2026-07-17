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
import { ChevronDown, ChevronUp, Cloud, Eye, EyeOff, Trash2, RefreshCw, Plus, Database } from "lucide-react";
import { getSourceTypeStyle } from "../../utils/dashboardHelpers";
import { Badge, Button, Input, Panel, Spinner, StatusChip, ToggleGroup } from "../ui";
import { cn } from "../../utils/cn";

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
                    <Badge tone="neutral" size="xs" className="rounded-full">
                        {(() => {
                            return [...availableSources].filter(s => {
                                if (s.startsWith('giq:')) return false;
                                if (s === 'local') return false; 
                                return true;
                            }).length;
                        })()}
                    </Badge>
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
                            <Panel key={profile.bucketName} padding="none" className="rounded-lg shadow-sm transition-all duration-200 group">
                                 <div className="p-4">
                                     <div className="flex justify-between items-start mb-2">
                                         <div className="flex items-center gap-2">
                                              <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/20">
                                                  <Cloud size={16} className="text-blue-600 dark:text-blue-400" />
                                              </div>
                                              <div>
                                                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{profile.alias || profile.bucketName}</h4>
                                                  <div className="flex items-center gap-1">
                                                       <Badge tone="neutral" size="sm">Custom GCS</Badge>
                                                       {(() => {
                                                           const style = getSourceTypeStyle('Cloud');
                                                           return (
                                                               <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', style.bg, style.text, style.border)}>
                                                                   Cloud
                                                               </span>
                                                           );
                                                       })()}
                                                       <StatusChip status="active" className="normal-case tracking-normal" />
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
                                            className={cn(
                                                'p-1.5 rounded transition-colors',
                                                selectedSources.has(`gcs:${profile.bucketName}`)
                                                    ? 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                                                    : 'text-slate-300 dark:text-slate-600 hover:text-slate-500'
                                            )}
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
                                                      <Spinner className="w-2.5 h-2.5 text-blue-500 dark:text-blue-500" />
                                                      <span>Restoring...</span>
                                                  </div>
                                              ) : (
                                                  <span>{profile.entryCount} benchmarks loaded</span>
                                              )}
                                          </span>
                                      </div>
                                 </div>
                             </Panel>
                         ))}

                         {gcsProfiles.filter(p => p.type === 'aws').sort((a, b) => {
                             const aActive = selectedSources.has(`aws:${a.bucketName}`);
                             const bActive = selectedSources.has(`aws:${b.bucketName}`);
                             if (aActive && !bActive) return -1;
                             if (!aActive && bActive) return 1;
                             return 0;
                         }).map(profile => (
                            <Panel key={profile.bucketName} padding="none" className="rounded-lg shadow-sm transition-all duration-200 group">
                                 <div className="p-4">
                                     <div className="flex justify-between items-start mb-2">
                                         <div className="flex items-center gap-2">
                                              <div className="p-1.5 rounded-md bg-orange-100 dark:bg-orange-900/20">
                                                  <Cloud size={16} className="text-orange-600 dark:text-orange-400" />
                                              </div>
                                              <div>
                                                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{profile.alias || profile.bucketName}</h4>
                                                  <div className="flex items-center gap-1">
                                                       <Badge tone="neutral" size="sm">Custom AWS</Badge>
                                                       {(() => {
                                                           const style = getSourceTypeStyle('Cloud');
                                                           return (
                                                               <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', style.bg, style.text, style.border)}>
                                                                   Cloud
                                                               </span>
                                                           );
                                                       })()}
                                                       <StatusChip status="active" className="normal-case tracking-normal" />
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
                                            className={cn(
                                                'p-1.5 rounded transition-colors',
                                                selectedSources.has(`aws:${profile.bucketName}`)
                                                    ? 'text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20'
                                                    : 'text-slate-300 dark:text-slate-600 hover:text-slate-500'
                                            )}
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
                                                      <Spinner className="w-2.5 h-2.5 text-orange-500 dark:text-orange-500" />
                                                      <span>Restoring...</span>
                                                  </div>
                                              ) : (
                                                  <span>{profile.entryCount} benchmarks loaded</span>
                                              )}
                                          </span>
                                      </div>
                                 </div>
                             </Panel>
                         ))}
                     </div>

                     {/* Custom Add Form */}
                     <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 space-y-3">
                         <h4 className="text-[10px] font-bold text-slate-500 uppercase">Add New Source</h4>
                         <ToggleGroup
                              fullWidth
                              options={[
                                  { value: 'gcs', label: 'GCS Bucket' },
                                  { value: 'aws', label: 'AWS Bucket' },
                              ]}
                              value={connectionType}
                              onChange={setConnectionType}
                         />

                         {connectionType === 'gcs' && (
                             <div className="space-y-2">
                                 <Input
                                    type="text"
                                    placeholder="Source Name (Optional)"
                                    value={newBucketAlias}
                                    onChange={(e) => setNewBucketAlias(e.target.value)}
                                    className="text-xs"
                                 />
                                 <Input
                                    type="text"
                                    placeholder="gs://bucket-name"
                                    value={newBucketName}
                                    onChange={(e) => setNewBucketName(e.target.value)}
                                    className="text-xs"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddBucket(newBucketAlias)}
                                 />
                                 <Button
                                      variant="secondary"
                                      size="sm"
                                      className="w-full"
                                      onClick={() => handleAddBucket(newBucketAlias)}
                                      disabled={gcsLoading || !newBucketName}
                                      isLoading={gcsLoading}
                                  >
                                      {!gcsLoading && <Plus size={12} />}
                                      Add Bucket
                                  </Button>
                             </div>
                         )}
                          {connectionType === 'aws' && (
                              <div className="space-y-2">
                                  <Input
                                     type="text"
                                     placeholder="Source Name (Optional)"
                                     value={newBucketAlias}
                                     onChange={(e) => setNewBucketAlias(e.target.value)}
                                     className="text-xs"
                                  />
                                  <Input
                                     type="text"
                                     placeholder="s3-bucket-name"
                                     value={newBucketName}
                                     onChange={(e) => setNewBucketName(e.target.value)}
                                     className="text-xs"
                                     onKeyDown={(e) => e.key === 'Enter' && handleAddAWSBucket(newBucketAlias)}
                                  />
                                  <Button
                                       variant="secondary"
                                       size="sm"
                                       className="w-full"
                                       onClick={() => handleAddAWSBucket(newBucketAlias)}
                                       disabled={gcsLoading || !newBucketName}
                                       isLoading={gcsLoading}
                                   >
                                       {!gcsLoading && <Plus size={12} />}
                                       Add Bucket
                                   </Button>
                              </div>
                          )}
                     </div>
                 </div>
             )}
        </div>
    );
};
