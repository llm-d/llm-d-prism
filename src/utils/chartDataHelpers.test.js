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
import { getAcceleratorCount, extractAcceleratorCount } from './dashboardHelpers';
import { computeThroughputChartData, getVal } from './chartDataHelpers';

describe('getAcceleratorCount and extractAcceleratorCount', () => {
    it('extracts count from hardware string with (xN) format', () => {
        expect(extractAcceleratorCount('NVIDIA H100 (x8)')).toBe(8);
        expect(extractAcceleratorCount('TPU v6e (x4)')).toBe(4);
        expect(extractAcceleratorCount('L4 (x1)')).toBe(1);
        expect(extractAcceleratorCount('NVIDIA A100')).toBe(1);
        expect(extractAcceleratorCount(null)).toBe(1);
        expect(extractAcceleratorCount({ hardware_name: 'H100' })).toBe(1);
    });

    it('resolves accelerator count from root, metadata, hardware object, or hardware string', () => {
        // Root accelerator_count
        expect(getAcceleratorCount({ accelerator_count: 8, hardware: 'H100' })).toBe(8);

        // Metadata accelerator_count
        expect(getAcceleratorCount({ metadata: { accelerator_count: 8 }, hardware: 'H100' })).toBe(8);

        // Hardware object accelerator_count
        expect(getAcceleratorCount({ hardware: { hardware_name: 'H100', accelerator_count: 8 } })).toBe(8);

        // Hardware string (x8) when metadata default is 1
        expect(getAcceleratorCount({ metadata: { accelerator_count: 1 }, hardware: 'H100 (x8)' })).toBe(8);

        // Explicit multi-node count > 1 takes precedence over single node (x8)
        expect(getAcceleratorCount({ accelerator_count: 16, hardware: 'H100 (x8)' })).toBe(16);

        // Payload hardware accelerator_count
        expect(getAcceleratorCount({ payload: { hardware: { hardware_name: 'H200', accelerator_count: 8 } }, hardware: 'H200' })).toBe(8);

        // Bundle payload hardware accelerator_count
        expect(getAcceleratorCount({ bundle: { payload: { hardware: { hardware_name: 'H200', accelerator_count: 8 } } }, hardware: 'H200' })).toBe(8);

        // Fallback to 1 if no info
        expect(getAcceleratorCount({})).toBe(1);
        expect(getAcceleratorCount(null)).toBe(1);
    });
});

describe('computeThroughputChartData - Per Chip scaling logic', () => {
    const mockRun8Chips = {
        model: 'Qwen-2.5-72B',
        model_name: 'Qwen-2.5-72B',
        benchmarkKey: 'run-8chips',
        time_per_output_token: 25.0,
        throughput: 1600.0,
        accelerator_count: 8,
        metrics: {
            tpot: 25.0,
            output_tput: 1600.0,
            input_tput: 800.0,
            total_tput: 2400.0,
            request_rate: 40.0,
            cost: { spot: 1.25 }
        }
    };

    const mockRun4ChipsBrv02 = {
        model: 'Llama-3.1-8B',
        model_name: 'Llama-3.1-8B',
        benchmarkKey: 'run-4chips-brv02',
        time_per_output_token: 15.0,
        throughput: 1200.0,
        // Chip count stored strictly in metadata (standard for BRV0.2 parser)
        metadata: {
            accelerator_count: 4,
            hardware: 'TPU v6e'
        },
        hardware: 'TPU v6e',
        metrics: {
            tpot: 15.0,
            output_tput: 1200.0,
            input_tput: 600.0,
            total_tput: 1800.0,
            request_rate: 60.0,
            cost: { spot: 0.80 }
        }
    };

    const baseConfig = {
        xKey: 'time_per_output_token',
        yKey: 'throughput',
        filterFn: (d) => getVal(d, 'time_per_output_token') != null && getVal(d, 'throughput') != null
    };

    it('preserves raw throughput when showPerChip is false', () => {
        const result = computeThroughputChartData({
            filteredData: [mockRun8Chips, mockRun4ChipsBrv02],
            config: baseConfig,
            showPerChip: false,
            tputType: 'output'
        });

        expect(result.visibleDataPoints).toHaveLength(2);
        const point8 = result.visibleDataPoints.find(p => p.benchmarkKey === 'run-8chips');
        const point4 = result.visibleDataPoints.find(p => p.benchmarkKey === 'run-4chips-brv02');

        expect(point8.vy).toBe(1600.0);
        expect(point4.vy).toBe(1200.0);
    });

    it('divides output throughput by chip count when showPerChip is true', () => {
        const result = computeThroughputChartData({
            filteredData: [mockRun8Chips, mockRun4ChipsBrv02],
            config: baseConfig,
            showPerChip: true,
            tputType: 'output'
        });

        expect(result.visibleDataPoints).toHaveLength(2);
        const point8 = result.visibleDataPoints.find(p => p.benchmarkKey === 'run-8chips');
        const point4 = result.visibleDataPoints.find(p => p.benchmarkKey === 'run-4chips-brv02');

        // 1600 / 8 = 200
        expect(point8.vy).toBe(200.0);
        // 1200 / 4 = 300
        expect(point4.vy).toBe(300.0);

        // Auto Y bounds adjust to normalized values (minY = 200, maxY = 300)
        expect(result.autoY[0]).toBeLessThanOrEqual(200);
        expect(result.autoY[1]).toBeGreaterThanOrEqual(300);
    });

    it('scales queries per second (QPS) when showPerChip is true', () => {
        const qpsConfig = {
            xKey: 'time_per_output_token',
            yKey: 'metrics.request_rate',
            filterFn: () => true
        };

        const result = computeThroughputChartData({
            filteredData: [mockRun8Chips, mockRun4ChipsBrv02],
            config: qpsConfig,
            showPerChip: true,
            tputType: 'qps'
        });

        const point8 = result.visibleDataPoints.find(p => p.benchmarkKey === 'run-8chips');
        const point4 = result.visibleDataPoints.find(p => p.benchmarkKey === 'run-4chips-brv02');

        // 40 / 8 = 5 QPS per chip
        expect(point8.vy).toBe(5.0);
        // 60 / 4 = 15 QPS per chip
        expect(point4.vy).toBe(15.0);
    });

    it('scales input and total throughput per chip', () => {
        const inputConfig = {
            xKey: 'time_per_output_token',
            yKey: 'metrics.input_tput',
            filterFn: () => true
        };

        const resultInput = computeThroughputChartData({
            filteredData: [mockRun8Chips],
            config: inputConfig,
            showPerChip: true,
            tputType: 'input'
        });
        // 800 / 8 = 100
        expect(resultInput.visibleDataPoints[0].vy).toBe(100.0);

        const totalConfig = {
            xKey: 'time_per_output_token',
            yKey: 'metrics.total_tput',
            filterFn: () => true
        };
        const resultTotal = computeThroughputChartData({
            filteredData: [mockRun8Chips],
            config: totalConfig,
            showPerChip: true,
            tputType: 'total'
        });
        // 2400 / 8 = 300
        expect(resultTotal.visibleDataPoints[0].vy).toBe(300.0);
    });

    it('does NOT scale cost metrics when showPerChip is true', () => {
        const costConfig = {
            xKey: 'time_per_output_token',
            yKey: 'metrics.cost.spot',
            filterFn: () => true
        };

        const result = computeThroughputChartData({
            filteredData: [mockRun8Chips],
            config: costConfig,
            showPerChip: true,
            tputType: 'cost'
        });

        // Cost remains $1.25, NOT divided by 8
        expect(result.visibleDataPoints[0].vy).toBe(1.25);
    });

    it('recalculates Pareto frontier based on per-chip normalized coordinates', () => {
        // Point A: 25ms, raw throughput 1600 on 8 chips -> 200/chip
        // Point B: 20ms, raw throughput 1000 on 4 chips -> 250/chip
        // With showPerChip=false, Point A (1600) beats Point B (1000) on throughput.
        // With showPerChip=true, Point B (250/chip @ 20ms) dominates Point A (200/chip @ 25ms)!
        const resultRaw = computeThroughputChartData({
            filteredData: [mockRun8Chips, {
                ...mockRun4ChipsBrv02,
                time_per_output_token: 20.0,
                throughput: 1000.0
            }],
            config: baseConfig,
            showPareto: true,
            showPerChip: false,
            tputType: 'output'
        });
        expect(resultRaw.paretoData.map(p => p.benchmarkKey)).toContain('run-8chips');

        const resultPerChip = computeThroughputChartData({
            filteredData: [mockRun8Chips, {
                ...mockRun4ChipsBrv02,
                time_per_output_token: 20.0,
                throughput: 1000.0
            }],
            config: baseConfig,
            showPareto: true,
            showPerChip: true,
            tputType: 'output'
        });
        // Point B has lower latency (20ms vs 25ms) and higher throughput per chip (250 vs 200),
        // so Point A (run-8chips) is no longer on the Pareto frontier!
        expect(resultPerChip.paretoData.map(p => p.benchmarkKey)).toEqual(['run-4chips-brv02']);
    });

    it('divides bar chart data by chip count when in stage mode', () => {
        const stageConfig = {
            xKey: 'stage',
            yKey: 'throughput',
            filterFn: () => true
        };

        const result = computeThroughputChartData({
            filteredData: [{
                ...mockRun8Chips,
                workload: { stage: 1 }
            }],
            config: stageConfig,
            isBarMode: true,
            isVerticalLayout: false,
            selectedBenchmarks: new Set(['run-8chips']),
            showPerChip: true,
            tputType: 'output'
        });

        expect(result.barChartData).toHaveLength(1);
        // Stage 1 average for run-8chips should be 1600 / 8 = 200
        expect(result.barChartData[0]['run-8chips']).toBe(200);
    });

    it('scales throughput for submitted run payload with hardware.accelerator_count = 8', () => {
        const submittedRunEntry = {
            run_id: 'ce18398b-6ebc-424f-aa9b-d1851eddaf39',
            model: 'Qwen3 32B',
            hardware: 'H200',
            accelerator_count: 8,
            payload: {
                hardware: { hardware_name: 'H200', accelerator_count: 8 }
            },
            time_per_output_token: 15.22,
            throughput: 297.69,
            benchmarkKey: 'ce18398b'
        };

        const result = computeThroughputChartData({
            filteredData: [submittedRunEntry],
            config: baseConfig,
            showPerChip: true,
            tputType: 'output'
        });

        expect(result.visibleDataPoints).toHaveLength(1);
        expect(result.visibleDataPoints[0].vy).toBeCloseTo(297.69 / 8, 2);
    });
});

describe('computeThroughputChartData - Pareto metric directions', () => {
    it('maximizes tokens per second on the X axis', () => {
        const result = computeThroughputChartData({
            filteredData: [
                { benchmarkKey: 'slow', tokens_per_second: 40, throughput: 100 },
                { benchmarkKey: 'fast', tokens_per_second: 80, throughput: 100 },
            ],
            config: { xKey: 'tokens_per_second', yKey: 'throughput' },
            showPareto: true,
        });
        expect(result.paretoData.map(p => p.benchmarkKey)).toEqual(['fast']);
    });

    it.each(['quality.mmlu_pro', 'quality.arena', 'quality.live_code_bench'])(
        'maximizes %s on the X axis while minimizing cost', (xKey) => {
            const result = computeThroughputChartData({
                filteredData: [
                    { benchmarkKey: 'low', model: 'Low', metrics: { cost: 1 } },
                    { benchmarkKey: 'high', model: 'High', metrics: { cost: 1 } },
                ],
                qualityMetrics: { data: {
                    low: { mmlu_pro: 50, arena_score_text: 1000, live_code_bench: 40 },
                    high: { mmlu_pro: 80, arena_score_text: 1200, live_code_bench: 70 },
                } },
                config: { xKey, yKey: 'metrics.cost' },
                tputType: 'cost',
                showPareto: true,
            });
            expect(result.paretoData.map(p => p.benchmarkKey)).toEqual(['high']);
        }
    );

    it('keeps both points when higher quality costs more', () => {
        const result = computeThroughputChartData({
            filteredData: [
                { benchmarkKey: 'low', model: 'Low', metrics: { cost: 1 } },
                { benchmarkKey: 'high', model: 'High', metrics: { cost: 2 } },
            ],
            qualityMetrics: { data: {
                low: { mmlu_pro: 50 }, high: { mmlu_pro: 80 },
            } },
            config: { xKey: 'quality.mmlu_pro', yKey: 'metrics.cost' },
            tputType: 'cost',
            showPareto: true,
        });
        expect(result.paretoData.map(p => p.benchmarkKey)).toEqual(['high', 'low']);
    });

    it('minimizes latency on the X axis', () => {
        const result = computeThroughputChartData({
            filteredData: [
                { benchmarkKey: 'slow', time_per_output_token: 80, throughput: 100 },
                { benchmarkKey: 'fast', time_per_output_token: 40, throughput: 100 },
            ],
            config: { xKey: 'time_per_output_token', yKey: 'throughput' },
            showPareto: true,
        });
        expect(result.paretoData.map(p => p.benchmarkKey)).toEqual(['fast']);
    });
});

describe('computeThroughputChartData - equal-coordinate dominance', () => {
    it.each([
        { maximizeX: false, maximizeY: false },
        { maximizeX: false, maximizeY: true },
        { maximizeX: true, maximizeY: false },
        { maximizeX: true, maximizeY: true },
    ])('excludes dominated ties with directions %j', ({ maximizeX, maximizeY }) => {
        const points = [
            { benchmarkKey: 'a', x: 10, y: maximizeY ? 20 : 30 },
            { benchmarkKey: 'b', x: 10, y: maximizeY ? 30 : 20 },
            { benchmarkKey: 'c', x: 20, y: maximizeY ? 20 : 30 },
            { benchmarkKey: 'd', x: 20, y: maximizeY ? 30 : 20 },
        ];
        const expected = points.filter(point => !points.some(other => {
            const xBetterOrEqual = maximizeX ? other.x >= point.x : other.x <= point.x;
            const yBetterOrEqual = maximizeY ? other.y >= point.y : other.y <= point.y;
            return xBetterOrEqual && yBetterOrEqual && (other.x !== point.x || other.y !== point.y);
        }));
        const xKey = maximizeX ? 'tokens_per_second' : 'time_per_output_token';
        const result = computeThroughputChartData({
            filteredData: points.map(point => ({ ...point, [xKey]: point.x })),
            config: { xKey, yKey: 'y' },
            tputType: maximizeY ? 'output' : 'cost',
            showPareto: true,
        });
        expect(result.paretoData.map(p => p.benchmarkKey).sort()).toEqual(
            expected.map(p => p.benchmarkKey).sort()
        );
    });
});
