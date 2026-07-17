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
import { cn } from '../../utils/cn';

// Segmented control for metric/mode selectors (e.g. TTFT | TPOT | E2E).
// options: [{ value, label, disabled? }]
export function ToggleGroup({ options, value, onChange, size = 'sm', fullWidth = false, className }) {
    return (
        <div
            role="group"
            className={cn(
                'inline-flex items-center rounded-lg border border-theme-border bg-slate-100 dark:bg-slate-900 p-0.5 gap-0.5',
                fullWidth && 'flex w-full',
                className
            )}
        >
            {options.map((opt) => {
                const isActive = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        disabled={opt.disabled}
                        aria-pressed={isActive}
                        onClick={() => onChange(opt.value)}
                        className={cn(
                            'rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50',
                            size === 'xs' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs',
                            fullWidth && 'flex-1',
                            isActive
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
                            opt.disabled && 'opacity-40 pointer-events-none'
                        )}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
