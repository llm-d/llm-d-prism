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

// KPI / stat tile. Supersedes common/Card and the hand-rolled Results Store
// summary cards. Pass onClick + active to use it as a filter toggle. Dark mode
// uses the translucent well-lit "glass" surface (matches old common/Card
// brightness while letting the page background bleed through).
export function StatCard({ icon, title, value, details, onClick, active = false, className, children }) {
    const Root = onClick ? 'button' : 'div';
    return (
        <Root
            onClick={onClick}
            type={onClick ? 'button' : undefined}
            className={cn(
                'bg-theme-card dark:bg-slate-800/60 border border-theme-border dark:border-slate-700/60',
                'backdrop-blur-xl rounded-xl shadow-lg p-6 flex items-start gap-4 text-left transition-all',
                onClick &&
                    'cursor-pointer hover:border-slate-400 dark:hover:border-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50',
                active && 'border-emerald-500/50 ring-1 ring-emerald-500/40',
                className
            )}
        >
            {icon && (
                <div className="p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg mt-1 shrink-0">{icon}</div>
            )}
            <div className="flex-1 min-w-0">
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">{title}</p>
                <h3 className="text-2xl font-bold text-theme-text mb-2">{value}</h3>
                {details && (
                    <div className="space-y-1">
                        {details.map((detail, idx) => (
                            <div key={idx} className="text-xs text-slate-500 dark:text-slate-400 flex justify-between gap-4">
                                <span>{detail.label}:</span>
                                <span className="font-mono text-slate-800 dark:text-slate-200">{detail.value}</span>
                            </div>
                        ))}
                    </div>
                )}
                {children}
            </div>
        </Root>
    );
}
