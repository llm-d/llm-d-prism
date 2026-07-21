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

const fieldBase =
    'w-full rounded-lg border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 ' +
    'px-3 py-2 text-sm text-theme-text placeholder:text-theme-muted transition-colors ' +
    'focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

export function Label({ className, children, ...props }) {
    return (
        <label
            className={cn('block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5', className)}
            {...props}
        >
            {children}
        </label>
    );
}

export const Input = React.forwardRef(function Input({ className, error, ...props }, ref) {
    return (
        <input
            ref={ref}
            className={cn(fieldBase, error && 'border-red-500 focus:border-red-500 focus:ring-red-500/40', className)}
            {...props}
        />
    );
});

export const Select = React.forwardRef(function Select({ className, error, children, ...props }, ref) {
    return (
        <select
            ref={ref}
            className={cn(fieldBase, 'pr-8', error && 'border-red-500 focus:border-red-500 focus:ring-red-500/40', className)}
            {...props}
        >
            {children}
        </select>
    );
});

export const Textarea = React.forwardRef(function Textarea({ className, error, rows = 4, ...props }, ref) {
    return (
        <textarea
            ref={ref}
            rows={rows}
            className={cn(fieldBase, 'font-mono text-xs leading-relaxed', error && 'border-red-500 focus:border-red-500 focus:ring-red-500/40', className)}
            {...props}
        />
    );
});

export const Checkbox = React.forwardRef(function Checkbox({ className, label, ...props }, ref) {
    const box = (
        <input
            ref={ref}
            type="checkbox"
            className={cn(
                'h-4 w-4 shrink-0 rounded border-slate-300 dark:border-slate-600 accent-emerald-600',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40',
                className
            )}
            {...props}
        />
    );
    if (!label) return box;
    return (
        <label className="inline-flex items-center gap-2 text-sm text-theme-text cursor-pointer select-none">
            {box}
            <span>{label}</span>
        </label>
    );
});
