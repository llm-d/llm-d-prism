// Copyright 2026 The llm-d Authors
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
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { TimeSeriesLineChart } from './TimeSeriesLineChart.jsx';

describe('TimeSeriesLineChart', () => {
    it.each([false, true])('renders large series with clampPercent=%s', (clampPercent) => {
        const series = [{
            id: 'gpu-0',
            label: 'GPU 0',
            color: '#000000',
            points: Array.from({ length: 200000 }, (_, i) => ({ tSec: i, value: i % 100 })),
        }];

        const html = renderToStaticMarkup(
            <TimeSeriesLineChart series={series} clampPercent={clampPercent} yLabel="GPU utilization" />,
        );

        expect(html).toContain('GPU utilization over elapsed time, 1 series');
    });
});
