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

// Tooltip shell + row for recharts custom tooltips. The colored swatch carries
// series identity; text always wears text tokens, never the series color.
//
//   const MyTooltip = ({ active, payload }) => {
//       if (!active || !payload?.length) return null;
//       return (
//           <ChartTooltip title={payload[0].payload.name}>
//               {payload.map((p) => (
//                   <ChartTooltipRow key={p.dataKey} color={p.color} label={p.name} value={p.value} unit=" ms" />
//               ))}
//           </ChartTooltip>
//       );
//   };
export function ChartTooltip({ title, className, children }) {
    return (
        <div
            className={cn(
                'bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700/50',
                'rounded-lg shadow-xl p-3 min-w-[180px] backdrop-blur-md z-[100]',
                className
            )}
        >
            {title && <div className="text-[11px] font-bold text-theme-text mb-1.5">{title}</div>}
            <div className="space-y-1">{children}</div>
        </div>
    );
}

export function ChartTooltipRow({ color, label, value, unit = '' }) {
    return (
        <div className="flex items-center justify-between gap-4 text-[11px]">
            <div className="flex items-center gap-1.5 min-w-0">
                {color && <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />}
                <span className="text-theme-muted font-medium truncate">{label}</span>
            </div>
            <span className="font-mono font-bold text-theme-text whitespace-nowrap">
                {typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value}
                {unit}
            </span>
        </div>
    );
}
