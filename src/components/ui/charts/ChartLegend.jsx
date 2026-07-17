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
import { cn } from '../../../utils/cn';

// Swatch legend for multi-series charts. Required whenever a chart renders
// ≥2 series (see skills/style.md); single-series charts are named by their
// title and need none. entries: [{ label, color }]
export function ChartLegend({ entries, className }) {
    return (
        <div className={cn('flex items-center gap-4 flex-wrap', className)}>
            {entries.map((e) => (
                <span key={e.label} className="flex items-center gap-1.5 text-[11px] text-theme-muted font-medium">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: e.color }} aria-hidden="true" />
                    {e.label}
                </span>
            ))}
        </div>
    );
}
