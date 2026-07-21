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

// Multi-select pill group for chart stat/percentile visibility
// ("Stats: Mean P90", "Percentiles: P50 P90 P99"). Unlike ToggleGroup
// (single-select), every pill toggles independently. options: string[].
export function StatPills({ options, active, onToggle, className }) {
    return (
        <div className={cn('flex items-center gap-0.5 bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5 shrink-0', className)}>
            {options.map((p) => (
                <button
                    key={p}
                    type="button"
                    aria-pressed={active.includes(p)}
                    onClick={() => onToggle(p)}
                    className={cn(
                        'px-2.5 py-1 text-[10px] font-medium rounded-md transition-all cursor-pointer',
                        active.includes(p) ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                    )}
                >
                    {p}
                </button>
            ))}
        </div>
    );
}
