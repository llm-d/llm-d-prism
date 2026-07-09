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

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export const MultiSelectDropdown = ({ label, options, selected = new Set(), onChange, counts, formatLabel, labelSuffix }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const safeSelected = selected || new Set();
    const selectedCount = safeSelected.size;
    
    return (
        <div className="relative" ref={containerRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-[#0b0f17] border border-slate-800/40 text-slate-300 text-xs rounded-xl px-3 py-2 flex items-center justify-between hover:border-slate-700/45 hover:bg-[#101622] transition-all duration-200"
                title={`${label}: ${selectedCount > 0 ? [...safeSelected].join(', ') : 'All'}`}
            >
                <div className="flex items-center gap-2 truncate pr-2">
                    <span className="font-semibold text-slate-500">{label}</span>
                    {labelSuffix}
                    <span className="truncate text-slate-200">
                        {selectedCount === 0 ? 'All' : `${selectedCount} selected`}
                    </span>
                </div>
                <ChevronDown size={12} className={`text-slate-500 transition-transform duration-350 ${isOpen ? 'rotate-180 text-cyan-400' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 max-h-80 overflow-y-auto bg-[#0b0f17]/95 border border-slate-800/40 rounded-xl shadow-2xl z-[100] p-2.5 space-y-1.5 backdrop-blur-md">
                    <div 
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer hover:bg-slate-800/80 transition-all ${selectedCount === 0 ? 'bg-cyan-500/10 text-cyan-400 font-semibold' : 'text-slate-300 hover:text-slate-200'}`}
                        onClick={() => { onChange(''); setIsOpen(false); }}
                    >
                         <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${selectedCount === 0 ? 'bg-cyan-500 border-cyan-500 text-white' : 'border-slate-800/40 bg-slate-950'}`}>
                            {selectedCount === 0 && <Check size={10} className="text-white" strokeWidth={3} />}
                         </div>
                         <span className="text-xs">All {label}</span>
                         <span className="text-[10px] text-slate-500 ml-auto font-mono">{options.length}</span>
                    </div>
                    
                    <div className="h-px bg-slate-800/30 my-1.5 mx-1" />

                    {options.map(opt => {
                        const count = (counts && counts[opt]) || 0;
                        const isSelected = safeSelected.has(opt);
                        return (
                            <div 
                                key={opt} 
                                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all ${count === 0 ? 'opacity-45 hover:bg-slate-800/30' : 'hover:bg-slate-800/80'} ${isSelected ? 'bg-cyan-500/10 text-cyan-400 font-semibold' : 'text-slate-300 hover:text-slate-200'}`}
                                onClick={() => onChange(opt)}
                                title={formatLabel ? formatLabel(opt) : opt}
                            >
                                 <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-cyan-500 border-cyan-500 text-white' : 'border-slate-800/40 bg-slate-950'}`}>
                                    {isSelected && <Check size={10} className="text-white" strokeWidth={3} />}
                                 </div>
                                 <span className={`text-xs truncate flex-1 ${isSelected ? 'text-cyan-400 font-semibold' : 'text-slate-300'}`}>
                                     {formatLabel ? formatLabel(opt) : opt}
                                 </span>
                                 <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono ml-auto">{count}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
