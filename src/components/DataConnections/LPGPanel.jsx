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
import { FileJson, Plus, Check } from "lucide-react";
import { Button, Input, Label, Spinner, Textarea } from "../ui";

export const LPGPanel = ({
    lpgError, handleLpgFileUpload, lpgLoading, lpgPasteText, setLpgPasteText,
    setLpgLoading, setLpgError, parseLogFile, data, setData, setSelectedSources,
    setAvailableSources, setGcsSuccess, setExpandedIntegration, availableSources,
    handleLpgGcsScan, handleLpgGcsLoad, hostProject, lpgMatchCount, gcsSuccess
}) => {
    const [gcsInput, setGcsInput] = React.useState('');
    const [gcsScanResult, setGcsScanResult] = React.useState(null);
    const [isLoadingRecent, setIsLoadingRecent] = React.useState(false);
    const [isLoadingAll, setIsLoadingAll] = React.useState(false);
    const serviceAccount = hostProject ? `${hostProject}-compute@developer.gserviceaccount.com` : 'the default Compute Engine service account';

    const performScan = async () => {
        setLpgLoading(true);
        setLpgError(null);
        setGcsScanResult(null);
        let scanInput = gcsInput.trim();
        if (scanInput && !scanInput.startsWith('gs://')) {
            scanInput = 'gs://' + scanInput;
            setGcsInput(scanInput);
        }
        try {
            const result = await handleLpgGcsScan(scanInput);
            setGcsScanResult(result);
        } catch (err) {
            console.error('GCS Scan Error:', err);
            setLpgError(err.message || 'Failed to scan bucket.');
        } finally {
            setLpgLoading(false);
        }
    };

    const performLoad = async (foldersToLoad, isRecent = false) => {
        if (!gcsScanResult) return;
        if (isRecent) setIsLoadingRecent(true);
        else setIsLoadingAll(true);
        let loadInput = gcsInput.trim();
        if (loadInput && !loadInput.startsWith('gs://')) {
            loadInput = 'gs://' + loadInput;
        }
        try {
            await handleLpgGcsLoad(loadInput, foldersToLoad, gcsScanResult.folders, gcsScanResult.usingProxy);
            setGcsScanResult(null); // Reset after successful load
            // Don't clear gcsInput here so user sees what was loaded, or leave it clear?
            // Actually previous code had `setGcsInput('');` which we'll keep.
            setGcsInput('');
        } catch (err) {
            console.error('GCS Load Error:', err);
            // Error is handled by outer hook usually, but we can reset state if desired
        } finally {
            if (isRecent) setIsLoadingRecent(false);
            else setIsLoadingAll(false);
        }
    };

    return (
        <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 p-4 animate-in slide-in-from-top-2 duration-200">
            <div className="space-y-3">
                {lpgError && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 px-3 py-2 rounded text-xs flex items-center gap-2">
                        <span className="font-bold">Error:</span> {lpgError}
                    </div>
                )}
                {gcsSuccess && (gcsSuccess.includes('LPG') || gcsSuccess.includes('metrics')) && (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-300 px-3 py-2 rounded text-xs flex items-center gap-2">
                        <Check size={12} />
                        <span>{gcsSuccess}</span>
                    </div>
                )}

                <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase text-slate-500 mb-0">Load from GCS</Label>
                    <div className="flex flex-col gap-2">
                        {/* GCS Bucket Load */}
                        <div className="space-y-2">
                            <Input
                                type="text"
                                placeholder="gs://bucket-name/optional/folder"
                                value={gcsInput}
                                onChange={(e) => setGcsInput(e.target.value)}
                                className="text-xs font-mono"
                                disabled={lpgLoading}
                                onBlur={(e) => {
                                    let val = e.target.value.trim();
                                    if (val && !val.startsWith('gs://')) {
                                        setGcsInput('gs://' + val);
                                    }
                                }}
                            />
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                The bucket must be public or accessible by <span className="font-mono text-[9px] bg-slate-200 dark:bg-slate-700 px-1 rounded">{serviceAccount}</span> (needs Storage Object Viewer).
                            </div>
                            {!gcsScanResult ? (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="w-full"
                                    onClick={performScan}
                                    disabled={lpgLoading || !gcsInput.trim()}
                                    isLoading={lpgLoading}
                                >
                                    {!lpgLoading && <Plus size={12} />}
                                    Scan Bucket
                                </Button>
                            ) : (
                                <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded p-3 space-y-3 mt-2">
                                    <div className="flex items-center justify-between text-xs">
                                         <span className="font-medium text-slate-700 dark:text-slate-300">Found {gcsScanResult.folderNames.length} folder{gcsScanResult.folderNames.length !== 1 ? 's' : ''}</span>
                                         <button 
                                             onClick={() => setGcsScanResult(null)} 
                                             className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline"
                                             disabled={lpgLoading}
                                         >
                                             Cancel
                                         </button>
                                    </div>
                                    {gcsScanResult.folderNames.length === 1 ? (
                                        <button
                                            onClick={() => performLoad(gcsScanResult.folderNames, false)}
                                            disabled={lpgLoading || isLoadingRecent || isLoadingAll}
                                            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold px-2 py-1.5 rounded transition-colors shadow-sm flex items-center justify-center gap-1"
                                        >
                                            {isLoadingAll ? <Spinner className="w-3 h-3 text-white dark:text-white" /> : null}
                                            Load Folder
                                        </button>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => performLoad(gcsScanResult.folderNames.slice(0, 1), true)}
                                                disabled={lpgLoading || isLoadingRecent || isLoadingAll}
                                                className="w-full bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold px-2 py-1.5 rounded transition-colors shadow-sm flex items-center justify-center gap-1"
                                            >
                                                {isLoadingRecent ? <Spinner className="w-3 h-3 text-white dark:text-white" /> : null}
                                                Load Most Recent (1)
                                            </button>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="w-full"
                                                onClick={() => performLoad(gcsScanResult.folderNames, false)}
                                                disabled={lpgLoading || isLoadingRecent || isLoadingAll}
                                                isLoading={isLoadingAll}
                                            >
                                                Load All
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Or upload log files */}
                        <div className="relative mt-2">
                            <div className="absolute inset-x-0 top-0 flex items-center justify-center -mt-2">
                                <span className="bg-slate-100 dark:bg-slate-800/50 px-2 text-[10px] text-slate-400 border border-slate-200 dark:border-slate-700 rounded-full font-medium tracking-wide uppercase">or submit log files</span>
                            </div>
                            
                            <div className="pt-4 flex flex-col gap-2">
                                {/* Drag and Drop */}
                                <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors relative group cursor-pointer">
                                    <input 
                                        type="file" 
                                        multiple 
                                        accept=".txt,.log,.json"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        onChange={handleLpgFileUpload}
                                        disabled={lpgLoading}
                                    />
                                    {lpgLoading ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <Spinner className="w-5 h-5 text-blue-500 dark:text-blue-500" />
                                            <span className="text-xs text-slate-500">Parsing logs...</span>
                                        </div>
                                    ) : (
                                        <>
                                            <FileJson size={24} className="text-slate-400 mb-2 group-hover:text-blue-500 transition-colors" />
                                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                                Drag & drop files or <span className="text-blue-500">browse</span>
                                            </span>
                                            <span className="text-[10px] text-slate-400 mt-1">
                                                Supports .txt, .log, .json (LPG Format)
                                            </span>
                                        </>
                                    )}
                                </div>
                                
                                {/* Or paste text */}
                                <div className="relative">
                                    <div className="absolute inset-x-0 top-0 flex items-center justify-center -mt-2">
                                        <span className="bg-slate-100 dark:bg-slate-800/50 px-2 text-[10px] text-slate-400 uppercase">or paste text</span>
                                    </div>
                                    <Textarea
                                        placeholder="Paste LPG log output here..."
                                        value={lpgPasteText}
                                        onChange={(e) => setLpgPasteText(e.target.value)}
                                        className="h-24 mt-3 resize-none"
                                        disabled={lpgLoading}
                                    />
                                    {lpgPasteText && lpgPasteText.trim() !== '' && (
                                        <button
                                            onClick={() => {
                                                setLpgLoading(true);
                                                setLpgError(null);
                                                try {
                                                    const entries = parseLogFile(lpgPasteText, 'pasted_lpg_data');
                                                    if (entries.length > 0) {
                                                        const sourceKey = `lpg:paste_${Date.now()}`;
                                                        const startId = data.length;
                                                        const dataWithIds = entries.map((d, i) => ({
                                                            ...d,
                                                            id: startId + i,
                                                            source: sourceKey,
                                                            source_info: { ...d.source_info, type: 'lpg', file_identifier: 'pasted' }
                                                        }));
                                                        setData(prev => [...prev, ...dataWithIds]);
                                                        setSelectedSources(prev => new Set([...prev, sourceKey]));
                                                        setAvailableSources(prev => new Set([...prev, sourceKey]));
                                                        setGcsSuccess(`Successfully loaded ${entries.length} LPG metrics.`);
                                                        setLpgPasteText('');
                                                        setExpandedIntegration(null);
                                                    } else {
                                                        setLpgError('No valid LPG metrics found in pasted text.');
                                                    }
                                                } catch (err) {
                                                    console.error('LPG Paste Error:', err);
                                                    setLpgError('Failed to parse pasted text.');
                                                } finally {
                                                    setLpgLoading(false);
                                                }
                                            }}
                                            disabled={lpgLoading}
                                            className="mt-2 w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded transition-colors shadow-sm flex items-center justify-center gap-2"
                                        >
                                            {lpgLoading ? <Spinner className="w-3 h-3 text-white dark:text-white" /> : <Plus size={12} />}
                                            Parse Pasted Text
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
