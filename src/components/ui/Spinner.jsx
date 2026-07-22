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

const SIZES = {
    xs: 'w-3.5 h-3.5',
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-10 h-10',
};

export function Spinner({ size = 'sm', className }) {
    return (
        <Loader2
            aria-label="Loading"
            className={cn('animate-spin text-emerald-600 dark:text-emerald-400', SIZES[size], className)}
        />
    );
}

// Centered spinner + label for section/page level loading. fullPage renders
// the well-lit dark full-viewport shell around it (pre-data dashboard state).
export function LoadingState({ label = 'Loading…', size = 'lg', fullPage = false, className }) {
    const body = (
        <div className={cn('flex-1 flex flex-col items-center justify-center gap-4 py-16', className)}>
            <Spinner size={size} />
            {label && <div className="text-sm font-semibold text-theme-muted">{label}</div>}
        </div>
    );
    if (!fullPage) return body;
    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center w-full">
            {body}
        </div>
    );
}
