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
import { FileJson, X, AlertCircle, Loader } from "lucide-react";

export const BenchmarkReportPanel = ({
    error, setError, onUpload,
    loading = false,
}) => {
    const [isDragging, setIsDragging] = React.useState(false);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        setIsDragging(false);
        setError(null);

        const items = e.dataTransfer.items;
        if (!items || items.length === 0) return;

        const files = [];

        const readAllEntries = async (directoryReader) => {
            let allEntries = [];
            const readBatch = async () => {
                const entries = await new Promise((resolve) => directoryReader.readEntries(resolve));
                if (entries.length > 0) {
                    allEntries.push(...entries);
                    await readBatch();
                }
            };
            await readBatch();
            return allEntries;
        };

        const traverseEntry = async (entry) => {
            if (entry.isFile) {
                const file = await new Promise((resolve) => entry.file(resolve));
                files.push(file);
            } else if (entry.isDirectory) {
                const directoryReader = entry.createReader();
                const entries = await readAllEntries(directoryReader);
                for (const subEntry of entries) {
                    await traverseEntry(subEntry);
                }
            }
        };

        const promises = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const entry = item.webkitGetAsEntry();
                if (entry) {
                    promises.push(traverseEntry(entry));
                }
            }
        }

        await Promise.all(promises);
        
        if (files.length > 0) {
            onUpload(files);
        }
    };

    return (
        <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 p-4 animate-in slide-in-from-top-2 duration-200">
            <div className="space-y-3">

                {/* Error banner */}
                {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 px-3 py-2 rounded text-xs flex items-start gap-2">
                        <AlertCircle size={12} className="mt-0.5 shrink-0" />
                        <span>{error}</span>
                        <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X size={10} /></button>
                    </div>
                )}

                {/* Drop zone — always visible, additive uploads */}
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Submit Report Files / Folder</label>
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-lg p-5 flex flex-col items-center justify-center text-center transition-colors relative group cursor-pointer ${
                            isDragging
                                ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                                : 'border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                    >
                        <input
                            type="file"
                            multiple
                            accept=".yaml,.yml"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={onUpload}
                            disabled={loading}
                        />
                        {loading ? (
                            <Loader size={20} className="animate-spin text-cyan-500 mb-1.5" />
                        ) : (
                            <FileJson size={20} className={`mb-1.5 transition-colors ${isDragging ? 'text-cyan-500' : 'text-slate-400 group-hover:text-cyan-500'}`} />
                        )}
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            {loading ? (
                                <span>Processing files...</span>
                            ) : (
                                <span>Drag & drop files/folders or <span className="text-cyan-500">browse files</span></span>
                            )}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-1">
                            benchmark_report_v0.2,_*.yaml — new files are added to existing
                        </span>
                    </div>
                    {/* Directory Upload Option */}
                    <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 pt-2">
                        <span>Or, submit a whole run directory:</span>
                        {loading ? (
                            <span className="text-slate-400 dark:text-slate-600 font-semibold flex items-center gap-1 cursor-not-allowed">
                                Select Directory
                            </span>
                        ) : (
                            <label className="text-cyan-500 dark:text-cyan-400 hover:text-cyan-600 cursor-pointer font-semibold flex items-center gap-1">
                                <span>Select Directory</span>
                                <input
                                    type="file"
                                    webkitdirectory="true"
                                    directory="true"
                                    multiple
                                    className="hidden"
                                    onChange={onUpload}
                                    disabled={loading}
                                />
                            </label>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};
