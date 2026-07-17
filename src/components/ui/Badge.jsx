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

const TONES = {
    neutral:
        'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700',
    brand:
        'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 dark:border-emerald-500/40',
    success:
        'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 dark:border-emerald-500/40',
    info:
        'bg-sky-500/10 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/30 dark:border-sky-500/40',
    warning:
        'bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30 dark:border-amber-500/40',
    danger:
        'bg-red-500/10 dark:bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30 dark:border-red-500/40',
    violet:
        'bg-violet-500/10 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/30 dark:border-violet-500/40',
};

const SIZES = {
    xs: 'px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider',
    sm: 'px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
    md: 'px-2.5 py-1 text-xs font-semibold',
};

export function Badge({ tone = 'neutral', size = 'sm', className, children, ...props }) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded border select-none whitespace-nowrap',
                TONES[tone],
                SIZES[size],
                className
            )}
            {...props}
        >
            {children}
        </span>
    );
}

// Canonical submission/run lifecycle states. Keys cover both snake_case and
// kebab-case spellings seen in Results Store data.
const STATUS_MAP = {
    staged: { tone: 'neutral', label: 'Staged' },
    draft: { tone: 'neutral', label: 'Draft' },
    processing: { tone: 'info', label: 'Processing' },
    in_review: { tone: 'warning', label: 'In Review' },
    'in-review': { tone: 'warning', label: 'In Review' },
    pending: { tone: 'warning', label: 'Pending' },
    approved: { tone: 'success', label: 'Approved' },
    verified: { tone: 'success', label: 'Verified' },
    ready: { tone: 'success', label: 'Ready' },
    rejected: { tone: 'danger', label: 'Rejected' },
    failed: { tone: 'danger', label: 'Failed' },
    invalid: { tone: 'danger', label: 'Invalid' },
    warnings: { tone: 'warning', label: 'Warnings' },
    active: { tone: 'brand', label: 'Active' },
    inactive: { tone: 'neutral', label: 'Inactive' },
};

// Status is never conveyed by color alone: the chip always carries a dot + label.
export function StatusChip({ status, label, size = 'sm', className, ...props }) {
    const meta = STATUS_MAP[status] || { tone: 'neutral', label: status };
    return (
        <Badge tone={meta.tone} size={size} className={className} {...props}>
            <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
            {label || meta.label}
        </Badge>
    );
}
