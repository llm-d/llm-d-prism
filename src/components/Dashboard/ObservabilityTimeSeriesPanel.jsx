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

import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
    ChartContainer, EmptyState, ToggleGroup, TimeSeriesLineChart, seriesColor, MAX_SERIES,
    CHART_SERIES_OTHER,
} from '../ui';
import { getEntryLabel } from '../../utils/runLabel';
import { buildStageSuffix } from '../../utils/dashboardHelpers';
import { resolveUnitFamily } from '../../utils/benchmarkReportV02Parser';

// Opacity steps for lines sharing a metric's hue, following the stat-bar
// convention in skills/style.md. The tail repeats rather than fading out, since
// past this many lines the shades stop being tellable apart anyway.
const SHADES = [1, 0.65, 0.4, 0.25];

// Elapsed-time observability charts for the browser-upload comparison view.
// Co-selected metrics must share a unit family -- percent and fraction scale
// onto one axis, but a percent and a count on one axis would misrepresent both.

export function ObservabilityTimeSeriesPanel({
    filteredBySource,
    selectedBenchmarks,
    getBenchmarkKey,
    brv02CustomLabels,
}) {
    // Runs in the current comparison that carry embedded time series. A run/stage
    // can have more than one BRv0.2 report file (e.g. lifecycle vs session-lifecycle
    // metrics) -- they describe the same pods over the same window, so keep one per
    // (run, stage) rather than plotting the same series twice under colliding ids.
    const runs = useMemo(() => {
        const matched = (filteredBySource || []).filter(d => selectedBenchmarks.has(getBenchmarkKey(d)));
        const seen = new Set();
        const deduped = matched.filter(d => {
            const dedupeKey = `${getBenchmarkKey(d)}::${d.workload?.stage ?? 0}`;
            if (seen.has(dedupeKey)) return false;
            seen.add(dedupeKey);
            return true;
        });
        return deduped
            .map(d => ({ d, ts: d.metrics?.observability?.timeSeries }))
            .filter(r => r.ts && typeof r.ts === 'object');
    }, [filteredBySource, selectedBenchmarks, getBenchmarkKey]);

    // Stable order so the toggle row and colors don't reshuffle on selection.
    const metricOptions = useMemo(() => {
        const seen = new Map();
        for (const { ts } of runs) {
            for (const [key, entry] of Object.entries(ts)) {
                if (!seen.has(key)) seen.set(key, entry.label || key);
            }
        }
        return Array.from(seen, ([value, label]) => ({ value, label }));
    }, [runs]);

    // Gate on the unit family, not the raw string: percent and fraction measure
    // the same thing and can share an axis once scaled, so refusing them by
    // string mismatch would disable most of the selector. undefined = absent.
    const familyOf = useCallback((key) => {
        for (const { ts } of runs) {
            const entry = ts[key];
            if (entry) return resolveUnitFamily(entry.units ?? null).family;
        }
        return undefined;
    }, [runs]);

    const [metricKeys, setMetricKeys] = useState(() => new Set());
    const activeKeys = useMemo(() => (
        metricKeys.size > 0
            ? Array.from(metricKeys).filter(k => metricOptions.some(o => o.value === k))
            : (metricOptions[0] ? [metricOptions[0].value] : [])
    ), [metricKeys, metricOptions]);
    // metricOptions order, not click order, so colors don't depend on it.
    const orderedActiveKeys = useMemo(() => (
        metricOptions.map(o => o.value).filter(k => activeKeys.includes(k))
    ), [metricOptions, activeKeys]);

    // The implicit default is a fallback, not a choice, so it must not
    // constrain the first click.
    const selectionFamily = metricKeys.size > 0 && orderedActiveKeys.length > 0
        ? familyOf(orderedActiveKeys[0])
        : undefined;
    const toggleMetric = useCallback((key) => {
        setMetricKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    // getBenchmarkKey collapses a sweep's stages onto one key by design, so the
    // stage and metric have to join the id or distinct lines share an identity.
    const seriesId = useCallback(
        (d, pod, metricKey) => `${getBenchmarkKey(d)}::${d.workload?.stage ?? 0}::${pod || 'agg'}::${metricKey}`,
        [getBenchmarkKey],
    );

    // Color follows the entity (see skills/style.md). With one metric the hue
    // separates its lines; with several, the hue identifies the metric and the
    // lines inside it separate by opacity (the stat-bar convention), so a run's
    // stages read as one group instead of spending the whole palette.
    const colorOf = useMemo(() => {
        const map = new Map();
        const multi = orderedActiveKeys.length > 1;
        const nextIndex = new Map();
        for (const [metricIdx, metricKey] of orderedActiveKeys.entries()) {
            for (const { d, ts } of runs) {
                const entry = ts[metricKey];
                if (!entry) continue;
                const scope = multi ? `${getBenchmarkKey(d)}::${metricKey}` : getBenchmarkKey(d);
                const pods = (entry.components || []).map(c => c.pod || 'agg').sort();
                for (const pod of pods) {
                    const i = nextIndex.get(scope) ?? 0;
                    nextIndex.set(scope, i + 1);
                    map.set(seriesId(d, pod, metricKey), multi
                        ? { color: seriesColor(metricIdx), opacity: SHADES[Math.min(i, SHADES.length - 1)] }
                        : { color: i < MAX_SERIES ? seriesColor(i) : null, opacity: 1 });
                }
            }
        }
        return (id) => map.get(id) ?? { color: null, opacity: 1 };
    }, [runs, orderedActiveKeys, seriesId, getBenchmarkKey]);

    const { series, unit, yLabel, unitsConflict } = useMemo(() => {
        if (orderedActiveKeys.length === 0) return { series: [], unit: '', yLabel: '', unitsConflict: false };
        const out = [];
        // Seeding with null would let the next metric's units win unflagged.
        let units;
        let conflict = false;
        const labels = [];
        for (const metricKey of orderedActiveKeys) {
            let metricLabel = metricKey;
            for (const { d, ts } of runs) {
                const entry = ts[metricKey];
                if (!entry) continue;
                // Units belong to the metric, not to a run. Same-family units are
                // scaled onto one axis; anything from another family must not be
                // co-plotted, so flag it rather than silently keeping the first.
                const resolved = resolveUnitFamily(entry.units ?? null);
                if (units === undefined) units = resolved.axisUnits;
                else if (resolved.axisUnits !== units) conflict = true;
                if (entry.unitsConflict) conflict = true;
                metricLabel = entry.label || metricLabel;
                const key = getBenchmarkKey(d);
                // Must match the label the run is selected under in the benchmark
                // picker -- the bare model name repeats across sweeps of the same
                // model and doesn't say which run this panel is.
                const runTitle = brv02CustomLabels?.[key.replace(/^brv02:/, '')] || getEntryLabel(d);
                const comps = entry.components || [];
                const multiPod = comps.length > 1;
                // The panel already shows the run title, so the legend carries only
                // what varies inside it -- including the stage, which getBenchmarkKey
                // collapses away.
                const stagePart = buildStageSuffix(d);
                for (const comp of comps) {
                    const metricPart = orderedActiveKeys.length > 1 ? (entry.label || metricKey) : null;
                    const podPart = multiPod && comp.pod ? comp.pod : null;
                    const label = [metricPart, stagePart, podPart]
                        .filter(Boolean).join(' · ') || (entry.label || metricKey);
                    const id = seriesId(d, comp.pod, metricKey);
                    out.push({
                        id,
                        runKey: key,
                        runTitle,
                        label,
                        ...colorOf(id),
                        points: resolved.factor === 1
                            ? comp.points
                            : comp.points?.map(pt => (
                                typeof pt.value === 'number'
                                    ? { ...pt, value: pt.value * resolved.factor }
                                    : pt
                            )),
                    });
                }
            }
            labels.push(metricLabel);
        }
        const pct = !conflict && typeof units === 'string' && units.toLowerCase() === 'percent';
        // Joining every metric name overflows the rotated axis label, and the
        // legend already names each line.
        const combinedLabel = labels.length > 1 ? 'Value' : labels.join(', ');
        return {
            series: out,
            unitsConflict: conflict,
            unit: pct ? '%' : (units && !conflict ? ` ${units}` : ''),
            yLabel: conflict
                ? `${combinedLabel} (mixed units)`
                : (pct ? `${combinedLabel} (%)` : (units ? `${combinedLabel} (${units})` : combinedLabel)),
        };
    }, [runs, orderedActiveKeys, getBenchmarkKey, brv02CustomLabels, colorOf, seriesId]);

    // The chart drops series with no points, so gate the empty state on the same
    // basis -- otherwise a metric that is present but empty for every run renders
    // a blank plot instead of the empty state.
    const drawable = useMemo(
        () => series.filter(s => Array.isArray(s.points) && s.points.length > 0),
        [series],
    );

    // One panel per run, so every selected metric overlays on a shared axis --
    // that is the point of the overlay. Insertion order follows drawable, so
    // panel order is stable across metric switches.
    const panels = useMemo(() => {
        const byRun = new Map();
        for (const s of drawable) {
            if (!byRun.has(s.runKey)) byRun.set(s.runKey, []);
            byRun.get(s.runKey).push(s);
        }
        // Only a single selected metric can outrun the palette (see colorOf);
        // that tail carries no hue of its own and folds onto one neutral.
        return Array.from(byRun.values(), (group) => {
            const folded = group.filter(x => x.color === null);
            if (folded.length === 0) return group;
            return group.map(x => (
                x.color === null
                    ? { ...x, color: CHART_SERIES_OTHER, label: `Other (${folded.length})` }
                    : x
            ));
        });
    }, [drawable]);
    const smallMultiples = panels.length > 1;
    const isPercent = unit === '%';

    // A selected metric is never disabled, so it stays deselectable.
    const toggleOptions = useMemo(() => metricOptions.map((o) => {
        if (activeKeys.includes(o.value)) return o;
        const mismatched = selectionFamily !== undefined && familyOf(o.value) !== selectionFamily;
        return mismatched ? { ...o, disabled: true } : o;
    }), [metricOptions, selectionFamily, activeKeys, familyOf]);

    if (selectedBenchmarks.size < 1) return null;

    return (
        <ChartContainer title="Observability Time Series">
            {metricOptions.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap mb-4">
                    <span id="obs-ts-metric-label" className="text-[10px] text-theme-muted font-bold uppercase tracking-wider">Metric</span>
                    <ToggleGroup
                        options={toggleOptions}
                        value={new Set(activeKeys)}
                        onChange={toggleMetric}
                        multiSelect
                        className="flex-wrap"
                        aria-labelledby="obs-ts-metric-label"
                    />
                </div>
            )}

            {unitsConflict && (
                <div className="flex items-start gap-2 mb-3 text-xs text-amber-700 dark:text-amber-500">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
                    <span>
                        The selected metrics are reported in different units. Values are
                        shown as reported and are not directly comparable.
                    </span>
                </div>
            )}

            {drawable.length > 0 ? (
                <>
                    {smallMultiples ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {panels.map((p) => (
                                <div key={p[0].runKey}>
                                    <p className="text-[11px] text-theme-muted font-medium mb-1 truncate" title={p[0].runTitle}>
                                        {p[0].runTitle}
                                    </p>
                                    <TimeSeriesLineChart
                                        series={p}
                                        yLabel={yLabel}
                                        unit={unit}
                                        height={200}
                                        clampPercent={isPercent}
                                        ariaLabel={`${yLabel} over elapsed time for ${p[0].runTitle}, ${p.length} series`}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <TimeSeriesLineChart
                            series={panels[0] || drawable}
                            yLabel={yLabel}
                            unit={unit}
                            clampPercent={isPercent}
                        />
                    )}
                    <p className="text-[10px] text-theme-muted mt-2 text-center">
                        One line per{orderedActiveKeys.length > 1 ? ' metric ×' : ''} sweep stage
                        (per pod when a stack has multiple) · elapsed time rebased to each
                        metric's first sample
                        {smallMultiples && ' · one chart per run'}
                    </p>
                </>
            ) : (
                <EmptyState
                    className="h-72 py-0"
                    title="No time-series data"
                    message="The selected benchmarks don't include embedded per-timestamp metrics. Time series are only present in v0.2 reports produced with time-series embedding enabled."
                />
            )}
        </ChartContainer>
    );
}
