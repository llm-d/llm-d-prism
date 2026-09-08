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

import { describe, it, expect } from 'vitest';
import { sortGroupKeys, sortBuckets, buildStageSuffix } from './dashboardHelpers.jsx';
import { CHART_SERIES, CHART_SERIES_OTHER, seriesColor } from '../components/ui/charts/palette.js';
import { MAX_SERIES } from '../components/ui/charts/TimeSeriesLineChart.jsx';

describe('dashboardHelpers sortGroupKeys', () => {
    it('sorts group keys alphabetically using natural numeric sorting', () => {
        const keys = ['Qwen3-32B', 'Llama-3.1-8B', 'Llama-3.1-70B', 'Gemma-2-9B'];
        const sorted = sortGroupKeys(keys);
        expect(sorted).toEqual(['Gemma-2-9B', 'Llama-3.1-8B', 'Llama-3.1-70B', 'Qwen3-32B']);
    });

    it('sorts hardware chip numbers naturally', () => {
        const keys = ['8x H100', '1x H100', '16x H100', '2x H100'];
        const sorted = sortGroupKeys(keys);
        expect(sorted).toEqual(['1x H100', '2x H100', '8x H100', '16x H100']);
    });

    it('places Other and Unknown groups at the end', () => {
        const keys = ['Unknown Hardware', '8x H100', 'Other', '1x H100', 'Unknown Model'];
        const sorted = sortGroupKeys(keys);
        expect(sorted.slice(0, 2)).toEqual(['1x H100', '8x H100']);
        // The remaining 3 should be Other and Unknowns
        expect(sorted.slice(2)).toContain('Other');
        expect(sorted.slice(2)).toContain('Unknown Hardware');
        expect(sorted.slice(2)).toContain('Unknown Model');
    });

    it('supports descending order while keeping special keys at the end', () => {
        const keys = ['Qwen3-32B', 'Other', 'Gemma-2-9B', 'Llama-3.1-70B'];
        const sorted = sortGroupKeys(keys, { isDesc: true });
        expect(sorted).toEqual(['Qwen3-32B', 'Llama-3.1-70B', 'Gemma-2-9B', 'Other']);
    });

    it('sorts multi-item group keys alphabetically and naturally', () => {
        const keys = [
            'MODEL: qwen + HARDWARE: h200',
            'MODEL: gemini + HARDWARE: h100',
            'MODEL: qwen + HARDWARE: h100',
        ];
        const sorted = sortGroupKeys(keys);
        expect(sorted).toEqual([
            'MODEL: gemini + HARDWARE: h100',
            'MODEL: qwen + HARDWARE: h100',
            'MODEL: qwen + HARDWARE: h200',
        ]);
    });

    it('places multi-item group keys with Unknown at the end', () => {
        const keys = [
            'MODEL: Unknown Model + HARDWARE: h100',
            'MODEL: qwen + HARDWARE: h100',
            'MODEL: gemini + HARDWARE: h100',
        ];
        const sorted = sortGroupKeys(keys);
        expect(sorted).toEqual([
            'MODEL: gemini + HARDWARE: h100',
            'MODEL: qwen + HARDWARE: h100',
            'MODEL: Unknown Model + HARDWARE: h100',
        ]);
    });
});

describe('dashboardHelpers sortBuckets', () => {
    it('sorts sequence length buckets numerically', () => {
        const buckets = ['1024', '128', '2048', '512'];
        expect(sortBuckets(buckets)).toEqual(['128', '512', '1024', '2048']);
    });
});

describe('dashboardHelpers getSourceType', () => {
    it('identifies built-in sources correctly', async () => {
        const { getSourceType } = await import('./dashboardHelpers.jsx');
        expect(getSourceType({ source: 'local' })).toBe('Built-in');
        expect(getSourceType({ source: 'llm-d-results:google_drive' })).toBe('Built-in');
        expect(getSourceType({ source: 'llmd_drive' })).toBe('Built-in');
        expect(getSourceType({ source: 'quality_scores' })).toBe('Built-in');
        expect(getSourceType(null)).toBe('Built-in');
    });

    it('identifies cloud and local brv02 sources correctly', async () => {
        const { getSourceType } = await import('./dashboardHelpers.jsx');
        expect(getSourceType({ source: 'gcs:llm-d-benchmarks' })).toBe('Cloud');
        expect(getSourceType({ source: 'gcs:llm-d-benchmarks-staging' })).toBe('Cloud');
        expect(getSourceType({ source: 'aws:my-bucket' })).toBe('Cloud');
        expect(getSourceType({ source: 'brv02:run-123' })).toBe('Local');
    });
});

describe('observability series identity', () => {
    it('appends only the sweep fields the run actually has', () => {
        expect(buildStageSuffix({ workload: { stage: 2, target_qps: 10 } })).toBe('stage 2 · 10 QPS');
        expect(buildStageSuffix({ workload: { stage: 0 } })).toBe('stage 0');
        expect(buildStageSuffix({ workload: {} })).toBe('');
        expect(buildStageSuffix({})).toBe('');
    });

    it('folds series past the hue budget onto one neutral', () => {
        const series = Array.from({ length: 8 }, (_, i) => ({
            color: i < MAX_SERIES ? seriesColor(i) : null,
        }));
        const folded = series.filter(s => s.color === null);
        const resolved = series.map(s => (s.color === null ? CHART_SERIES_OTHER : s.color));
        const branded = resolved.filter(c => c !== CHART_SERIES_OTHER);
        expect(folded).toHaveLength(3);
        expect(new Set(branded).size).toBe(branded.length);
        expect(CHART_SERIES.includes(CHART_SERIES_OTHER)).toBe(false);
    });
});
