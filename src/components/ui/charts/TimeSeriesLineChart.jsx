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
import {
    LineChart, Line, CartesianGrid, ResponsiveContainer, Tooltip,
} from 'recharts';
import { ChartXAxis, ChartYAxis } from './Axis';
import { ChartTooltip, ChartTooltipRow } from './ChartTooltip';
import { ChartLegend } from './ChartLegend';
import { getAxisConfig } from './utils';
import { lineTooltipProps, gridProps } from './theme';

// Generic elapsed-time line chart. One line per series, numeric X axis in
// seconds (mm:ss ticks).
//
// series: [{ id, label, color, points: [{ tSec, value }] }]
//
// Callers assign colors, because color has to follow the entity across metric
// and filter changes (see skills/style.md) and this component cannot see that
// wider selection. Past MAX_SERIES lines one axis stops being readable, so the
// caller splits into small multiples rather than having the tail dropped here.

export const MAX_SERIES = 5;

const fmtElapsedMMSS = (sec) => {
    const s = Math.max(0, Math.round(Number(sec)));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
};

// One mode for the whole axis, chosen from its span, so ticks stay in a
// consistent format instead of varying per tick.
const elapsedAxisMode = (maxSec) => {
    if (maxSec < 100) return 'sec';
    if (maxSec > 15 * 60) return 'min';
    return 'mmss';
};
const ELAPSED_FORMATTERS = {
    sec: (sec) => `${Math.max(0, Math.round(Number(sec)))}s`,
    min: (sec) => `${Math.round(Math.max(0, Number(sec)) / 60)}m`,
    mmss: fmtElapsedMMSS,
};
const ELAPSED_AXIS_LABELS = {
    sec: 'Elapsed (s)',
    min: 'Elapsed (min)',
    mmss: 'Elapsed (mm:ss)',
};

// Recharts resolves each line's tooltip entry by exact x match, so series that
// sample on different offsets -- the normal case once pods join a run at
// different times -- would contribute a row only on the ticks they happen to
// share, and the tooltip would show one series instead of all of them. Build
// the rows from the series directly, snapping to the nearest sample within a
// tolerance derived from that series' own cadence.
const nearestPoint = (points, t) => {
    if (!Array.isArray(points) || points.length === 0) return null;
    let best = null;
    let bestDist = Infinity;
    for (const p of points) {
        const dist = Math.abs(p.tSec - t);
        if (dist < bestDist) { bestDist = dist; best = p; }
    }
    if (!best) return null;
    // Don't invent a reading for a series with no sample near the hovered
    // instant, e.g. one that had already stopped reporting.
    const span = points[points.length - 1].tSec - points[0].tSec;
    const cadence = points.length > 1 ? span / (points.length - 1) : span;
    return bestDist <= Math.max(cadence, 1) * 1.5 ? best : null;
};

const TimeSeriesTooltip = ({ active, payload, unit, series }) => {
    if (!active || !payload || payload.length === 0) return null;
    const tSec = payload[0]?.payload?.tSec;
    if (!Number.isFinite(tSec)) return null;
    const rows = series
        .map(s => ({ s, point: nearestPoint(s.points, tSec) }))
        .filter(r => r.point !== null);
    if (rows.length === 0) return null;
    return (
        <ChartTooltip title={fmtElapsedMMSS(tSec)}>
            {rows.map(({ s, point }) => (
                <ChartTooltipRow
                    key={s.id}
                    color={s.color}
                    opacity={s.opacity ?? 1}
                    label={s.label}
                    value={Number(point.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    unit={unit}
                />
            ))}
        </ChartTooltip>
    );
};

export function TimeSeriesLineChart({
    series, yLabel, unit, xLabel, height = 288,
    showLegend = true, clampPercent = false, ariaLabel,
}) {
    const shown = (series || []).filter(s => Array.isArray(s.points) && s.points.length > 0);

    if (shown.length === 0) return null;

    const values = shown.flatMap(s => s.points.map(p => p.value)).filter(Number.isFinite);
    // A percent axis is pinned to 0-100 so the same metric stays comparable
    // across small multiples instead of every panel auto-fitting its own range.
    const axis = clampPercent
        ? { domain: [0, 100], ticks: [0, 20, 40, 60, 80, 100] }
        : getAxisConfig(values.length ? Math.min(...values) : 0, values.length ? Math.max(...values) : 1);

    // A one-sample series has no segment to draw, so without a dot it renders as
    // nothing at all.
    const maxLen = Math.max(...shown.map(s => s.points.length));

    // A folded tail shares one label and hue across many lines, so collapse it
    // to a single legend entry.
    const legendEntries = [];
    const seenLabels = new Set();
    for (const s of shown) {
        if (seenLabels.has(s.label)) continue;
        seenLabels.add(s.label);
        legendEntries.push({ id: s.id, label: s.label, color: s.color, opacity: s.opacity });
    }

    const tSecs = shown.flatMap(s => s.points.map(p => p.tSec)).filter(Number.isFinite);
    const axisMode = elapsedAxisMode(tSecs.length ? Math.max(...tSecs) : 0);
    const fmtTick = ELAPSED_FORMATTERS[axisMode];
    const resolvedXLabel = xLabel ?? ELAPSED_AXIS_LABELS[axisMode];

    return (
        <div>
            {showLegend && shown.length >= 2 && (
                <ChartLegend
                    className="mb-3 justify-center"
                    entries={legendEntries}
                />
            )}
            <div
                style={{ height }}
                role="img"
                aria-label={ariaLabel || `${yLabel || 'Metric'} over elapsed time, ${shown.length} series`}
            >
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        // Recharts keeps stale <Line> paths on screen when the series set
                        // changes without a key change (e.g. switching metric or run
                        // selection) -- re-key on series identity to force a clean remount.
                        key={shown.map(s => s.id).join(',')}
                        margin={{ top: 8, right: 20, left: 30, bottom: 24 }}
                    >
                        <CartesianGrid {...gridProps()} vertical={false} />
                        <ChartXAxis
                            dataKey="tSec"
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            label={resolvedXLabel}
                            tickFormatter={fmtTick}
                        />
                        <ChartYAxis
                            label={yLabel}
                            width={68}
                            domain={axis.domain}
                            ticks={axis.ticks}
                        />
                        <Tooltip
                            {...lineTooltipProps()}
                            content={<TimeSeriesTooltip unit={unit} series={shown} />}
                        />
                        {shown.map((s) => (
                            <Line
                                key={s.id}
                                data={s.points}
                                name={s.label}
                                dataKey="value"
                                stroke={s.color}
                                strokeOpacity={s.opacity ?? 1}
                                strokeWidth={2}
                                dot={maxLen <= 2 ? { r: 3 } : false}
                                activeDot={{ r: 4 }}
                                isAnimationActive={false}
                                connectNulls
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
