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
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

const VARIANTS = {
    primary:
        'bg-emerald-600 hover:bg-emerald-500 text-white border border-transparent shadow-sm',
    secondary:
        'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
    ghost:
        'bg-transparent hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent',
    danger:
        'bg-red-600 hover:bg-red-500 text-white border border-transparent shadow-sm',
    outline:
        'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600',
    dangerOutline:
        'bg-transparent text-red-600 dark:text-rose-400 border border-red-300 dark:border-rose-500/40 hover:bg-red-50 dark:hover:bg-rose-500/10',
    link:
        'bg-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 underline underline-offset-2 border border-transparent px-0 py-0',
};

const SIZES = {
    xs: 'px-2.5 py-1 text-[11px] rounded-md gap-1',
    sm: 'px-3.5 py-1.5 text-xs rounded-lg gap-1.5',
    md: 'px-4 py-2 text-sm rounded-lg gap-2',
    icon: 'p-1.5 rounded-lg',
};

export const Button = React.forwardRef(function Button(
    { variant = 'primary', size = 'sm', isLoading = false, disabled, className, children, ...props },
    ref
) {
    return (
        <button
            ref={ref}
            disabled={disabled || isLoading}
            className={cn(
                'inline-flex items-center justify-center font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50',
                'disabled:opacity-50 disabled:pointer-events-none',
                VARIANTS[variant],
                SIZES[size],
                className
            )}
            {...props}
        >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            {children}
        </button>
    );
});
