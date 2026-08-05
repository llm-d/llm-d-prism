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
import { XAxis, YAxis } from 'recharts';
import { getChartTheme } from './theme';

// Theme-aware recharts axes. Successors to common/CustomAxis: same tick
// formatting, but ink comes from the theme tokens instead of hardcoded hex.

const formatTick = (threshold) => (val) => {
    const v = Number(val);
    if (isNaN(v)) return val;
    return Math.abs(v) >= threshold ? v.toFixed(0) : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const labelStyle = (t, extra = {}) => ({
    fill: t.label,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontFamily: 'sans-serif',
    ...extra,
});

export const ChartXAxis = ({ label, ticks, interval, ...props }) => {
    const t = getChartTheme();
    // When an explicit tick list is supplied (e.g. from getAxisConfig), render
    // every tick. Recharts otherwise auto-hides "overlapping" ticks, which turns
    // an evenly-spaced list into a sparse, uneven-looking axis.
    const resolvedInterval = interval ?? (ticks ? 0 : undefined);
    return (
        <XAxis
            stroke={t.axis}
            tick={{ fill: t.tick, fontSize: 10, fontFamily: 'monospace' }}
            tickLine={{ stroke: t.grid }}
            axisLine={{ stroke: t.grid }}
            label={label && { value: label, position: 'bottom', offset: 0, style: labelStyle(t) }}
            tickFormatter={formatTick(100)}
            ticks={ticks}
            interval={resolvedInterval}
            {...props}
        />
    );
};

export const ChartYAxis = ({ label, width, ...props }) => {
    const t = getChartTheme();
    return (
        <YAxis
            stroke={t.axis}
            width={width ?? 68}
            tick={{ fill: t.tick, fontSize: 10, fontFamily: 'monospace' }}
            tickLine={{ stroke: t.grid }}
            axisLine={{ stroke: t.grid }}
            label={
                label && {
                    value: label,
                    angle: -90,
                    position: 'insideLeft',
                    offset: 0,
                    style: labelStyle(t, { textAnchor: 'middle' }),
                }
            }
            tickFormatter={formatTick(1000)}
            {...props}
        />
    );
};
