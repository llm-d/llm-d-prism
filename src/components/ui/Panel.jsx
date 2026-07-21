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

const PADDING = {
    none: 'p-0',
    sm: 'p-4',
    md: 'p-6',
};

// The standard card surface. Replaces hand-rolled
// "bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700" shells.
export function Panel({ title, actions, padding = 'md', className, children, ...props }) {
    return (
        <div
            className={cn(
                'bg-theme-card border border-theme-border rounded-xl shadow-lg transition-colors',
                PADDING[padding],
                className
            )}
            {...props}
        >
            {(title || actions) && (
                <div className={cn('flex items-center justify-between gap-4 mb-4', padding === 'none' && 'p-4 mb-0 border-b border-theme-border')}>
                    {title && (
                        <h3 className="text-sm font-bold text-theme-text">{title}</h3>
                    )}
                    {actions && <div className="flex items-center gap-2">{actions}</div>}
                </div>
            )}
            {children}
        </div>
    );
}
