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
// multiSelect: value is a Set and onChange still receives only the clicked
// value, so the caller owns toggling and the signature is the same either way.
// variant 'fill' is the visibility-toggle look StatPills wraps.
export function ToggleGroup({ options, value, onChange, size = 'sm', variant = 'segmented', fullWidth = false, multiSelect = false, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy }) {
    const fill = variant === 'fill';
    return (
        <div
            role="group"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            className={cn(
                'inline-flex items-center rounded-lg p-0.5 gap-0.5',
                fill
                    ? 'bg-slate-100 dark:bg-slate-900/50 border border-theme-border shrink-0'
                    : 'border border-theme-border bg-slate-100 dark:bg-slate-900',
                fullWidth && 'flex w-full',
                className
            )}
        >
            {options.map((opt) => {
                const isActive = multiSelect ? value?.has(opt.value) : opt.value === value;
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
                            fill && 'px-2.5 py-1 text-[10px]',
                            fullWidth && 'flex-1',
                            isActive
                                ? (fill
                                    ? 'bg-indigo-600 text-white shadow'
                                    : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm')
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
