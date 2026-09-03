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
import {
    parseReportV02,
    stageToEntry,
    unitToSecondsFactor,
    normalizeReportUnits,
    detectMissingUnitWarnings,
} from './benchmarkReportV02Parser.js';
import { validateBenchmark, validatePrismUploadStructure } from './benchmarkValidator.js';

const createReport = (throughput) => ({
    version: '0.2',
    scenario: {
        stack: [{
            standardized: {
                role: 'aggregate',
                model: { name: 'test-model' },
                accelerator: { model: 'H100', count: 1 },
            },
        }],
        load: { standardized: { tool: 'vllm' } },
    },
    results: {
        request_performance: {
            aggregate: { throughput },
        },
    },
});

const parseRates = (throughput) => {
    const stage = parseReportV02(createReport(throughput), 'report.yaml');
    expect(stage).toBeDefined();
    return { stage, entry: stageToEntry(stage) };
};

describe('benchmarkReportV02Parser token rates', () => {
    it('preserves and normalizes reported token rates in BR v0.2', () => {
        const { stage, entry } = parseRates({
            input_token_rate: { mean: 80 },
            output_token_rate: { mean: 20 },
            total_token_rate: { mean: 105 },
        });

        expect(stage.performance.totalTokenRate).toBe(105);
        expect(entry.metrics.input_tput).toBe(80);
        expect(entry.metrics.output_tput).toBe(20);
        expect(entry.metrics.total_tput).toBe(105);
    });

    it('derives total token rate when it is absent in BR v0.2', () => {
        const { entry } = parseRates({
            input_token_rate: { mean: 80 },
            output_token_rate: { mean: 20 },
        });

        expect(entry.metrics.total_tput).toBe(100);
    });

    it('derives input token rate from total and output rates in BR v0.2', () => {
        const { entry } = parseRates({
            output_token_rate: { mean: 20 },
            total_token_rate: { mean: 100 },
        });

        expect(entry.metrics.input_tput).toBe(80);
    });

    it('leaves rates null when fallback inputs are insufficient or invalid in BR v0.2', () => {
        const missingTotal = parseRates({ output_token_rate: { mean: 20 } });
        expect(missingTotal.entry.metrics.input_tput).toBe(null);
        expect(missingTotal.entry.metrics.total_tput).toBe(null);

        const inconsistent = parseRates({
            output_token_rate: { mean: 20 },
            total_token_rate: { mean: 10 },
        });
        expect(inconsistent.entry.metrics.input_tput).toBe(null);
        expect(inconsistent.entry.metrics.total_tput).toBe(10);
    });

    it('preserves zero and coerces numeric strings in token-rate normalization', () => {
        const { stage, entry } = parseRates({
            input_token_rate: { mean: '0' },
            output_token_rate: { mean: '20.5' },
        });

        expect(stage.performance.inputTokenRate).toBe(0);
        expect(stage.performance.outputTokenRate).toBe(20.5);
        expect(entry.metrics.input_tput).toBe(0);
        expect(entry.metrics.total_tput).toBe(20.5);
    });
});

describe('unitToSecondsFactor', () => {
    it('handles seconds and variations', () => {
        expect(unitToSecondsFactor('s')).toBe(1);
        expect(unitToSecondsFactor('sec')).toBe(1);
        expect(unitToSecondsFactor('seconds')).toBe(1);
        expect(unitToSecondsFactor('s/token')).toBe(1);
        expect(unitToSecondsFactor('s / token')).toBe(1);
        expect(unitToSecondsFactor('SECONDS')).toBe(1);
    });

    it('handles milliseconds and variations', () => {
        expect(unitToSecondsFactor('ms')).toBe(1e-3);
        expect(unitToSecondsFactor('msec')).toBe(1e-3);
        expect(unitToSecondsFactor('milliseconds')).toBe(1e-3);
        expect(unitToSecondsFactor('ms/token')).toBe(1e-3);
        expect(unitToSecondsFactor('ms / token')).toBe(1e-3);
        expect(unitToSecondsFactor('MS')).toBe(1e-3);
    });

    it('handles microseconds and variations', () => {
        expect(unitToSecondsFactor('us')).toBe(1e-6);
        expect(unitToSecondsFactor('µs')).toBe(1e-6);
        expect(unitToSecondsFactor('microseconds')).toBe(1e-6);
        expect(unitToSecondsFactor('us/token')).toBe(1e-6);
    });

    it('handles nanoseconds and variations', () => {
        expect(unitToSecondsFactor('ns')).toBe(1e-9);
        expect(unitToSecondsFactor('nsec')).toBe(1e-9);
        expect(unitToSecondsFactor('nanoseconds')).toBe(1e-9);
        expect(unitToSecondsFactor('ns/token')).toBe(1e-9);
    });

    it('defaults to 1 for undefined, null, or unknown units', () => {
        expect(unitToSecondsFactor(undefined)).toBe(1);
        expect(unitToSecondsFactor(null)).toBe(1);
        expect(unitToSecondsFactor('')).toBe(1);
        expect(unitToSecondsFactor('unknown_unit')).toBe(1);
    });
});

describe('normalizeReportUnits', () => {
    it('normalizes milliseconds to seconds and sets units: s / s/token', () => {
        const report = {
            version: '0.2',
            results: {
                request_performance: {
                    aggregate: {
                        latency: {
                            time_to_first_token: { mean: 300, p50: 250, p99: 500, units: 'ms' },
                            time_per_output_token: { mean: 40, p50: 35, p99: 60, units: 'ms' },
                            normalized_time_per_output_token: { mean: 30, p50: 28, p99: 50, units: 'ms/token' },
                            request_latency: { mean: 3000, p50: 2800, p99: 3500, stddev: 200, units: 'ms' },
                        },
                    },
                },
            },
        };

        const normalized = normalizeReportUnits(report);
        const lat = normalized.results.request_performance.aggregate.latency;

        expect(lat.time_to_first_token.mean).toBeCloseTo(0.3);
        expect(lat.time_to_first_token.p50).toBeCloseTo(0.25);
        expect(lat.time_to_first_token.p99).toBeCloseTo(0.5);
        expect(lat.time_to_first_token.units).toBe('s');

        expect(lat.time_per_output_token.mean).toBeCloseTo(0.04);
        expect(lat.time_per_output_token.units).toBe('s/token');

        expect(lat.normalized_time_per_output_token.mean).toBeCloseTo(0.03);
        expect(lat.normalized_time_per_output_token.units).toBe('s/token');

        expect(lat.request_latency.mean).toBeCloseTo(3.0);
        expect(lat.request_latency.stddev).toBeCloseTo(0.2);
        expect(lat.request_latency.units).toBe('s');
    });

    it('normalizes nanoseconds to seconds', () => {
        const report = {
            version: '0.2',
            results: {
                request_performance: {
                    aggregate: {
                        latency: {
                            request_latency: { mean: 2500000000, units: 'nanoseconds' },
                        },
                    },
                },
            },
        };

        const normalized = normalizeReportUnits(report);
        const lat = normalized.results.request_performance.aggregate.latency;
        expect(lat.request_latency.mean).toBeCloseTo(2.5);
        expect(lat.request_latency.units).toBe('s');
    });

    it('ensures units: s / s/token are set when units were omitted', () => {
        const report = {
            version: '0.2',
            results: {
                request_performance: {
                    aggregate: {
                        latency: {
                            time_to_first_token: { mean: 0.3 },
                            normalized_time_per_output_token: { mean: 0.03 },
                        },
                    },
                },
            },
        };

        const normalized = normalizeReportUnits(report);
        const lat = normalized.results.request_performance.aggregate.latency;
        expect(lat.time_to_first_token.mean).toBe(0.3);
        expect(lat.time_to_first_token.units).toBe('s');
        expect(lat.normalized_time_per_output_token.mean).toBe(0.03);
        expect(lat.normalized_time_per_output_token.units).toBe('s/token');
    });

    it('handles reports with unknown or custom units without modifying numbers and normalizes unit strings', () => {
        const report = {
            version: '0.2',
            results: {
                request_performance: {
                    aggregate: {
                        latency: {
                            time_to_first_token: { mean: 1.25, p50: 1.0, units: 'custom_ticks' },
                            time_per_output_token: { mean: 0.045, units: 'custom_tokens/token' },
                            inter_token_latency: { mean: 0.04, units: 'arbitrary_unit/token' },
                            request_latency: { mean: 15.5, units: 'unknown_timer' },
                        },
                    },
                    time_series: {
                        latency: {
                            request_latency: {
                                units: 'unknown_time_unit',
                                series: [
                                    { ts: '2026-08-31T07:44:02Z', mean: 12.5 },
                                    { ts: '2026-08-31T07:44:03Z', mean: 14.0 },
                                ],
                            },
                        },
                    },
                },
                observability: {
                    pod_startup_times: {
                        aggregate: { mean: 42.0, units: 'clock_ticks' },
                    },
                },
            },
        };

        const normalized = normalizeReportUnits(report);
        const lat = normalized.results.request_performance.aggregate.latency;

        // Numbers preserved as-is with factor 1
        expect(lat.time_to_first_token.mean).toBe(1.25);
        expect(lat.time_to_first_token.p50).toBe(1.0);
        expect(lat.time_to_first_token.units).toBe('s');

        expect(lat.time_per_output_token.mean).toBe(0.045);
        expect(lat.time_per_output_token.units).toBe('s/token');

        expect(lat.inter_token_latency.mean).toBe(0.04);
        expect(lat.inter_token_latency.units).toBe('s/token');

        expect(lat.request_latency.mean).toBe(15.5);
        expect(lat.request_latency.units).toBe('s');

        // Time series with unknown units preserved and canonicalized to 's'
        const tsLat = normalized.results.request_performance.time_series.latency.request_latency;
        expect(tsLat.units).toBe('s');
        expect(tsLat.series[0].mean).toBe(12.5);
        expect(tsLat.series[1].mean).toBe(14.0);

        // Pod startup times
        const podStartup = normalized.results.observability.pod_startup_times.aggregate;
        expect(podStartup.mean).toBe(42.0);
        expect(podStartup.units).toBe('s');
    });

    it('normalizes throughput metrics when units are missing or formatted as numbers', () => {
        const report = {
            version: '0.2',
            results: {
                request_performance: {
                    aggregate: {
                        throughput: {
                            output_token_rate: { mean: 250 }, // object missing units
                            request_rate: 10, // bare number
                            total_token_rate: { mean: 500, units: 'tokens/s' }, // already has units
                        },
                    },
                },
            },
        };

        const normalized = normalizeReportUnits(report);
        const tput = normalized.results.request_performance.aggregate.throughput;

        expect(tput.output_token_rate.mean).toBe(250);
        expect(tput.output_token_rate.units).toBe('tokens/s');

        expect(tput.request_rate.mean).toBe(10);
        expect(tput.request_rate.units).toBe('queries/s');

        expect(tput.total_token_rate.mean).toBe(500);
        expect(tput.total_token_rate.units).toBe('tokens/s');
    });
});

describe('NTPOT extraction and issue #144 resolution', () => {
    it('parses distinct TPOT and NTPOT metrics without overwriting NTPOT with TPOT', () => {
        const report = {
            version: '0.2',
            scenario: {
                stack: [{ standardized: { role: 'aggregate', model: { name: 'test-model' }, accelerator: { model: 'H100' } } }],
                load: { standardized: { tool: 'vllm' } },
            },
            results: {
                request_performance: {
                    aggregate: {
                        latency: {
                            time_per_output_token: { mean: 0.04, p50: 0.038, p99: 0.06, units: 's' },
                            normalized_time_per_output_token: { mean: 0.025, p50: 0.022, p99: 0.04, units: 's/token' },
                            request_latency: { mean: 2.0, units: 's' },
                        },
                    },
                },
            },
        };

        const stage = parseReportV02(report, 'test.yaml');
        expect(stage.performance.tpotMean).toBe(40);
        expect(stage.performance.ntpotMean).toBe(25);

        const entry = stageToEntry(stage);
        expect(entry.tpot).toBe(40);
        expect(entry.ntpot).toBe(25);
        expect(entry.metrics.tpot).toBe(40);
        expect(entry.metrics.ntpot).toBe(25);
        expect(entry.metrics.ntpot_p50).toBe(22);
    });

    it('falls back to TPOT for NTPOT when normalized_time_per_output_token is absent', () => {
        const report = {
            version: '0.2',
            scenario: {
                stack: [{ standardized: { role: 'aggregate', model: { name: 'test-model' }, accelerator: { model: 'H100' } } }],
                load: { standardized: { tool: 'vllm' } },
            },
            results: {
                request_performance: {
                    aggregate: {
                        latency: {
                            time_per_output_token: { mean: 0.04, units: 's' },
                            request_latency: { mean: 2.0, units: 's' },
                        },
                    },
                },
            },
        };

        const stage = parseReportV02(report, 'test.yaml');
        expect(stage.performance.ntpotMean).toBe(null);

        const entry = stageToEntry(stage);
        expect(entry.tpot).toBe(40);
        expect(entry.ntpot).toBe(40);
        expect(entry.metrics.ntpot).toBe(40);
    });
});

describe('parseReportV02 latency unit parsing', () => {
    it('correctly converts declared milliseconds to milliseconds internally', () => {
        const report = {
            version: '0.2',
            scenario: {
                stack: [{ standardized: { role: 'aggregate', model: { name: 'test-model' }, accelerator: { model: 'H100' } } }],
                load: { standardized: { tool: 'vllm' } },
            },
            results: {
                request_performance: {
                    aggregate: {
                        latency: {
                            time_to_first_token: { mean: 350, p50: 300, p99: 500, units: 'ms' },
                            time_per_output_token: { mean: 25, units: 'ms/token' },
                            request_latency: { mean: 2500, units: 'ms' },
                        },
                    },
                },
            },
        };

        const stage = parseReportV02(report, 'test.yaml');
        expect(stage.performance.ttftMean).toBeCloseTo(350);
        expect(stage.performance.tpotMean).toBeCloseTo(25);
        expect(stage.performance.e2eMean).toBeCloseTo(2500);

        const entry = stageToEntry(stage);
        expect(entry.ttft.mean).toBeCloseTo(350);
        expect(entry.tpot).toBeCloseTo(25);
        expect(entry.latency.mean).toBeCloseTo(2500);
    });

    it('correctly converts declared nanoseconds to milliseconds internally', () => {
        const report = {
            version: '0.2',
            scenario: {
                stack: [{ standardized: { role: 'aggregate', model: { name: 'test-model' }, accelerator: { model: 'H100' } } }],
                load: { standardized: { tool: 'vllm' } },
            },
            results: {
                request_performance: {
                    aggregate: {
                        latency: {
                            time_to_first_token: { mean: 200000000, units: 'nanoseconds' },
                            request_latency: { mean: 5000000000, units: 'nanoseconds' },
                        },
                    },
                },
            },
        };

        const stage = parseReportV02(report, 'test.yaml');
        expect(stage.performance.ttftMean).toBeCloseTo(200); // 200,000,000 ns = 200 ms
        expect(stage.performance.e2eMean).toBeCloseTo(5000);  // 5,000,000,000 ns = 5,000 ms
    });

    it('defaults unknown units to seconds and converts to milliseconds internally', () => {
        const report = {
            version: '0.2',
            scenario: {
                stack: [{ standardized: { role: 'aggregate', model: { name: 'test-model' }, accelerator: { model: 'H100' } } }],
                load: { standardized: { tool: 'custom-harness' } },
            },
            results: {
                request_performance: {
                    aggregate: {
                        latency: {
                            time_to_first_token: { mean: 1.5, p50: 1.2, p99: 2.0, units: 'unknown_unit' },
                            time_per_output_token: { mean: 0.025, units: 'custom_unit/token' },
                            request_latency: { mean: 12.0, units: 'unrecognized_metric' },
                        },
                    },
                },
            },
        };

        const stage = parseReportV02(report, 'unknown_units.yaml');
        expect(stage).toBeDefined();

        // 1.5s -> 1500ms
        expect(stage.performance.ttftMean).toBeCloseTo(1500);
        expect(stage.performance.ttftP50).toBeCloseTo(1200);
        expect(stage.performance.ttftP99).toBeCloseTo(2000);

        // 0.025s/token -> 25ms
        expect(stage.performance.tpotMean).toBeCloseTo(25);

        // 12s -> 12000ms
        expect(stage.performance.e2eMean).toBeCloseTo(12000);

        const entry = stageToEntry(stage);
        expect(entry.ttft.mean).toBeCloseTo(1500);
        expect(entry.tpot).toBeCloseTo(25);
        expect(entry.latency.mean).toBeCloseTo(12000);
    });

    it('triggers high latency validation warning when unknown unit value is large', () => {
        // If an engine emitted raw milliseconds or nanoseconds under an unknown unit label
        const rawReport = {
            version: '0.2',
            scenario: {
                stack: [{ standardized: { role: 'aggregate', model: { name: 'test-model' }, accelerator: { model: 'H100' } } }],
                load: { standardized: { tool: 'custom-harness' } },
            },
            results: {
                request_performance: {
                    aggregate: {
                        throughput: { output_token_rate: { mean: 50 } },
                        latency: {
                            request_latency: { mean: 5000, units: 'custom_timer' }, // 5000s > 1 hour (3600s)
                        },
                    },
                },
            },
        };

        const fileVal = validateBenchmark(JSON.stringify(rawReport), 'custom_timer.json');
        expect(fileVal.warnings.some(w => w.includes('E2E latency is unusually high') && w.includes('> 1 hour'))).toBe(true);
    });
});

describe('high latency warning hints during staging', () => {
    it('flags warning hint when E2E latency > 1 hour (3600s)', () => {
        const rawReport = {
            version: '0.2',
            scenario: {
                stack: [{ standardized: { role: 'aggregate', model: { name: 'meta-llama/Llama-3.1-8B-Instruct' }, accelerator: { model: 'H100' } } }],
                load: { standardized: { tool: 'vllm' } },
            },
            results: {
                request_performance: {
                    aggregate: {
                        throughput: { output_token_rate: { mean: 50 } },
                        latency: {
                            request_latency: { mean: 20867 }, // 20,867s without units
                        },
                    },
                },
            },
        };

        // File validation
        const fileVal = validateBenchmark(JSON.stringify(rawReport), 'stage_0.json');
        expect(fileVal.warnings.some(w => w.includes('E2E latency is unusually high') && w.includes('> 1 hour'))).toBe(true);

        // Upload structure validation
        const uploadData = {
            runId: '11111111-1111-4111-8111-111111111111',
            format: 'brv02',
            runLabel: 'High Latency Test',
            model_name: 'meta-llama/Llama-3.1-8B-Instruct',
            hardware: { hardware_name: 'H100', accelerator_count: 8 },
            entries: [{
                run_id: '22222222-2222-4222-8222-222222222222',
                run_description: 'High Latency Test',
                filename: 'stage_0.json',
                raw_report: rawReport,
            }],
        };

        const structVal = validatePrismUploadStructure(uploadData, { isUpload: false });
        expect(structVal.isValid).toBe(true); // Warnings do not invalidate the upload
        expect(structVal.warnings.some(w => w.includes('E2E latency') && w.includes('> 1 hour'))).toBe(true);
    });

    it('does not flag warning hint when latency units are declared in ms even with large raw value', () => {
        const rawReport = {
            version: '0.2',
            scenario: {
                stack: [{ standardized: { role: 'aggregate', model: { name: 'meta-llama/Llama-3.1-8B-Instruct' }, accelerator: { model: 'H100' } } }],
                load: { standardized: { tool: 'vllm' } },
            },
            results: {
                request_performance: {
                    aggregate: {
                        throughput: { output_token_rate: { mean: 50 } },
                        latency: {
                            request_latency: { mean: 20867, units: 'ms' }, // 20.867 seconds
                            time_to_first_token: { mean: 1366, units: 'ms' }, // 1.366 seconds
                        },
                    },
                },
            },
        };

        const fileVal = validateBenchmark(JSON.stringify(rawReport), 'stage_0.json');
        expect(fileVal.warnings.some(w => w.includes('unusually high'))).toBe(false);

        const uploadData = {
            runId: '11111111-1111-4111-8111-111111111111',
            format: 'brv02',
            runLabel: 'Normal Latency Test',
            model_name: 'meta-llama/Llama-3.1-8B-Instruct',
            hardware: { hardware_name: 'H100', accelerator_count: 8 },
            entries: [{
                run_id: '22222222-2222-4222-8222-222222222222',
                run_description: 'Normal Latency Test',
                filename: 'stage_0.json',
                raw_report: rawReport,
            }],
        };

        const structVal = validatePrismUploadStructure(uploadData, { isUpload: false });
        expect(structVal.warnings.some(w => w.includes('unusually high'))).toBe(false);
    });
});

describe('real-world TPU baseline report parsing and unit normalization', () => {
    // Raw report numbers extracted from /tmp/run-20260831-tpu-optimized-baseline.zip
    // (run-20260831-tpu-optimized-baseline/benchmark_report_v0.2,_stage_2_lifecycle_metrics.json.yaml)
    const tpuBaselineStage2Raw = {
        version: '0.2',
        run: {
            cid: 'bb4b7a47-0e6e-5c02-82b7-b7eb107c5bad',
            eid: '1b4db7eb-4057-5ddf-91e0-36dec72071f5',
            pid: 'fcf406c9-d3ff-4129-bbdc-ad2a98882311',
            uid: 'b6717d51-83a4-48a4-a31d-b7db8ac3454b',
            time: {
                start: '2026-08-31T07:44:02Z',
                end: '2026-08-31T08:58:01Z',
                duration: 'PT4438.150105771S',
            },
        },
        scenario: {
            stack: [{
                standardized: {
                    role: 'decode',
                    model: { name: 'google/gemma-4-31b-it' },
                    accelerator: { count: 1, model: '' },
                },
            }],
            load: {
                standardized: {
                    stage: 2,
                    tool: 'inference-perf',
                    tool_version: 'v0.6.0',
                    concurrency: 20,
                    rate_qps: 400.0,
                    input_seq_len: { value: 14064.6, distribution: 'gaussian', min: 128, max: 32541 },
                    output_seq_len: { value: 477.065, distribution: 'gaussian', min: 1, max: 4912 },
                },
            },
        },
        results: {
            request_performance: {
                aggregate: {
                    latency: {
                        request_latency: {
                            mean: 21.558331447382503,
                            p50: 8.664949262999926,
                            p99: 137.07469749930002,
                            units: 's',
                        },
                        time_to_first_token: {
                            mean: 0.5040531363233116,
                            p50: 0.17924734400003217,
                            p99: 2.453011269560101,
                            units: 's',
                        },
                        time_per_output_token: {
                            mean: 0.012653682549065053,
                            p50: 0.01175792287499943,
                            p99: 0.026852995707660653,
                            units: 's/token',
                        },
                        inter_token_latency: {
                            mean: 0.012488129844540485,
                            p50: 0.010950863500170271,
                            p99: 0.05323104488002405,
                            units: 's/token',
                        },
                        normalized_time_per_output_token: {
                            mean: 0.14493545478724867,
                            p50: 0.037196199899328986,
                            p99: 1.6600611027258,
                            units: 's/token',
                        },
                    },
                    throughput: {
                        output_token_rate: { mean: 222.21616933689222, units: 'tokens/s' },
                        request_rate: { mean: 0.4657985166316796, units: 'queries/s' },
                        total_token_rate: { mean: 6773.485986354813, units: 'tokens/s' },
                    },
                    requests: {
                        total: 400,
                        failures: 0,
                    },
                },
            },
        },
    };

    it('correctly parses raw TPU benchmark numbers and converts seconds to milliseconds', () => {
        const stage = parseReportV02(tpuBaselineStage2Raw, 'benchmark_report_v0.2,_stage_2_lifecycle_metrics.json.yaml');
        expect(stage).toBeDefined();

        // Scenario & metadata
        expect(stage.scenario.model).toBe('google/gemma-4-31b-it');
        expect(stage.scenario.harness).toBe('inference-perf');
        expect(stage.scenario.role).toBe('decode');
        expect(stage.scenario.concurrency).toBe(20);
        expect(stage.scenario.rateQps).toBe(400.0);
        expect(stage.scenario.isl).toBe(14064.6);
        expect(stage.scenario.osl).toBe(477.065);
        expect(stage.stageIndex).toBe(2);
        expect(stage.runUid).toBe('b6717d51-83a4-48a4-a31d-b7db8ac3454b');
        expect(stage.timestamp).toBe('2026-08-31T07:44:02Z');

        // Latencies converted from s (and s/token) to ms
        expect(stage.performance.e2eMean).toBeCloseTo(21558.3314, 2);
        expect(stage.performance.e2eP50).toBeCloseTo(8664.9493, 2);
        expect(stage.performance.e2eP99).toBeCloseTo(137074.6975, 2);

        expect(stage.performance.ttftMean).toBeCloseTo(504.0531, 2);
        expect(stage.performance.ttftP50).toBeCloseTo(179.2473, 2);
        expect(stage.performance.ttftP99).toBeCloseTo(2453.0113, 2);

        expect(stage.performance.tpotMean).toBeCloseTo(12.6537, 3);
        expect(stage.performance.tpotP50).toBeCloseTo(11.7579, 3);
        expect(stage.performance.tpotP99).toBeCloseTo(26.8530, 3);

        expect(stage.performance.itlMean).toBeCloseTo(12.4881, 3);
        expect(stage.performance.itlP50).toBeCloseTo(10.9509, 3);
        expect(stage.performance.itlP99).toBeCloseTo(53.2310, 3);

        expect(stage.performance.ntpotMean).toBeCloseTo(144.9355, 3);
        expect(stage.performance.ntpotP50).toBeCloseTo(37.1962, 3);
        expect(stage.performance.ntpotP99).toBeCloseTo(1660.0611, 3);

        // Throughput & requests
        expect(stage.performance.outputTokenRate).toBe(222.21616933689222);
        expect(stage.performance.requestRate).toBe(0.4657985166316796);
        expect(stage.performance.totalTokenRate).toBe(6773.485986354813);
        expect(stage.performance.totalRequests).toBe(400);
        expect(stage.performance.failures).toBe(0);

        // Confirm warnings are empty and rawReport preserves throughput units
        expect(stage.warnings).toHaveLength(0);
        expect(stage.rawReport.results.request_performance.aggregate.throughput.output_token_rate.units).toBe('tokens/s');
        expect(stage.rawReport.results.request_performance.aggregate.throughput.request_rate.units).toBe('queries/s');
    });

    it('maps TPU stage record into a valid entry with expected derived metrics', () => {
        const stage = parseReportV02(tpuBaselineStage2Raw, 'stage_2.yaml');
        const entry = stageToEntry(stage);

        expect(entry.model).toBe('gemma-4-31b-it');
        expect(entry.model_name).toBe('gemma-4-31b-it');
        expect(entry.backend).toBe('inference-perf');
        expect(entry.metadata.architecture).toBe('decode');

        // Workload
        expect(entry.workload.input_tokens).toBe(14064.6);
        expect(entry.workload.output_tokens).toBe(477.065);
        expect(entry.workload.target_qps).toBe(400.0);
        expect(entry.workload.concurrency).toBe(20);
        expect(entry.workload.stage).toBe(2);

        // Metrics
        expect(entry.metrics.throughput).toBe(222.21616933689222);
        expect(entry.metrics.output_tput).toBe(222.21616933689222);
        expect(entry.metrics.total_tput).toBe(6773.485986354813);
        // Derived input_tput: total - output
        expect(entry.metrics.input_tput).toBeCloseTo(6551.2698, 2);
        expect(entry.metrics.request_rate).toBe(0.4657985166316796);
        expect(entry.metrics.error_count).toBe(0);

        // Latencies in ms
        expect(entry.metrics.latency.mean).toBeCloseTo(21558.3314, 2);
        expect(entry.metrics.latency.p50).toBeCloseTo(8664.9493, 2);
        expect(entry.metrics.latency.p99).toBeCloseTo(137074.6975, 2);
        expect(entry.metrics.e2e_latency).toBeCloseTo(21558.3314, 2);

        expect(entry.metrics.ttft.mean).toBeCloseTo(504.0531, 2);
        expect(entry.metrics.ttft.p50).toBeCloseTo(179.2473, 2);
        expect(entry.metrics.ttft.p99).toBeCloseTo(2453.0113, 2);

        expect(entry.metrics.tpot).toBeCloseTo(12.6537, 3);
        expect(entry.metrics.tpot_ms).toBeCloseTo(12.6537, 3);
        expect(entry.metrics.tpot_p50).toBeCloseTo(11.7579, 3);
        expect(entry.metrics.tpot_p99).toBeCloseTo(26.8530, 3);

        expect(entry.metrics.ntpot).toBeCloseTo(144.9355, 3);
        expect(entry.metrics.ntpot_ms).toBeCloseTo(144.9355, 3);
        expect(entry.metrics.ntpot_p50).toBeCloseTo(37.1962, 3);
        expect(entry.metrics.ntpot_p99).toBeCloseTo(1660.0611, 3);

        expect(entry.metrics.itl).toBeCloseTo(12.4881, 3);
        expect(entry.metrics.itl_ms).toBeCloseTo(12.4881, 3);
        expect(entry.metrics.itl_p50).toBeCloseTo(10.9509, 3);
        expect(entry.metrics.itl_p99).toBeCloseTo(53.2310, 3);
    });

    it('validates normalizeReportUnits properly attaches and preserves canonical units for TPU report', () => {
        const normalized = normalizeReportUnits(tpuBaselineStage2Raw);
        const lat = normalized.results.request_performance.aggregate.latency;

        // Raw numbers already in seconds should remain exact
        expect(lat.request_latency.mean).toBe(21.558331447382503);
        expect(lat.request_latency.units).toBe('s');

        expect(lat.time_to_first_token.mean).toBe(0.5040531363233116);
        expect(lat.time_to_first_token.units).toBe('s');

        expect(lat.time_per_output_token.mean).toBe(0.012653682549065053);
        expect(lat.time_per_output_token.units).toBe('s/token');

        expect(lat.inter_token_latency.mean).toBe(0.012488129844540485);
        expect(lat.inter_token_latency.units).toBe('s/token');

        expect(lat.normalized_time_per_output_token.mean).toBe(0.14493545478724867);
        expect(lat.normalized_time_per_output_token.units).toBe('s/token');
    });

    it('correctly canonicalizes TPU metrics if reported in milliseconds into seconds and parses to matching ms', () => {
        const rawLat = tpuBaselineStage2Raw.results.request_performance.aggregate.latency;
        const msVariant = {
            ...tpuBaselineStage2Raw,
            results: {
                request_performance: {
                    aggregate: {
                        latency: {
                            request_latency: {
                                mean: rawLat.request_latency.mean * 1000,
                                p50: rawLat.request_latency.p50 * 1000,
                                p99: rawLat.request_latency.p99 * 1000,
                                units: 'ms',
                            },
                            time_to_first_token: {
                                mean: rawLat.time_to_first_token.mean * 1000,
                                p50: rawLat.time_to_first_token.p50 * 1000,
                                p99: rawLat.time_to_first_token.p99 * 1000,
                                units: 'ms',
                            },
                            time_per_output_token: {
                                mean: rawLat.time_per_output_token.mean * 1000,
                                p50: rawLat.time_per_output_token.p50 * 1000,
                                p99: rawLat.time_per_output_token.p99 * 1000,
                                units: 'ms/token',
                            },
                            inter_token_latency: {
                                mean: rawLat.inter_token_latency.mean * 1000,
                                p50: rawLat.inter_token_latency.p50 * 1000,
                                p99: rawLat.inter_token_latency.p99 * 1000,
                                units: 'ms/token',
                            },
                            normalized_time_per_output_token: {
                                mean: rawLat.normalized_time_per_output_token.mean * 1000,
                                p50: rawLat.normalized_time_per_output_token.p50 * 1000,
                                p99: rawLat.normalized_time_per_output_token.p99 * 1000,
                                units: 'ms/token',
                            },
                        },
                        throughput: tpuBaselineStage2Raw.results.request_performance.aggregate.throughput,
                        requests: tpuBaselineStage2Raw.results.request_performance.aggregate.requests,
                    },
                },
            },
        };

        // 1. Check unit normalization to seconds
        const normalized = normalizeReportUnits(msVariant);
        const lat = normalized.results.request_performance.aggregate.latency;

        expect(lat.request_latency.mean).toBeCloseTo(21.558331447382503, 6);
        expect(lat.request_latency.units).toBe('s');

        expect(lat.time_to_first_token.mean).toBeCloseTo(0.5040531363233116, 6);
        expect(lat.time_to_first_token.units).toBe('s');

        expect(lat.time_per_output_token.mean).toBeCloseTo(0.012653682549065053, 6);
        expect(lat.time_per_output_token.units).toBe('s/token');

        expect(lat.inter_token_latency.mean).toBeCloseTo(0.012488129844540485, 6);
        expect(lat.inter_token_latency.units).toBe('s/token');

        expect(lat.normalized_time_per_output_token.mean).toBeCloseTo(0.14493545478724867, 6);
        expect(lat.normalized_time_per_output_token.units).toBe('s/token');

        // 2. Check parseReportV02 directly on msVariant yields the exact expected milliseconds
        const stage = parseReportV02(msVariant, 'ms_stage.yaml');
        expect(stage.performance.e2eMean).toBeCloseTo(21558.3314, 2);
        expect(stage.performance.ttftMean).toBeCloseTo(504.0531, 2);
        expect(stage.performance.tpotMean).toBeCloseTo(12.6537, 3);
        expect(stage.performance.itlMean).toBeCloseTo(12.4881, 3);
        expect(stage.performance.ntpotMean).toBeCloseTo(144.9355, 3);
    });
});

describe('missing units detection and warning generation', () => {
    it('detects missing units across latency and throughput metrics with JSON paths and assumed defaults', () => {
        const report = {
            version: '0.2',
            results: {
                request_performance: {
                    aggregate: {
                        latency: {
                            request_latency: { mean: 21.5 }, // missing units -> assumed 's'
                            time_to_first_token: { mean: 0.5 }, // missing units -> assumed 's'
                            time_per_output_token: { mean: 0.012 }, // missing units -> assumed 's/token'
                            inter_token_latency: { mean: 0.011 }, // missing units -> assumed 's/token'
                            normalized_time_per_output_token: { mean: 0.14 }, // missing units -> assumed 's/token'
                        },
                        throughput: {
                            output_token_rate: { mean: 200 }, // missing units -> assumed 'tokens/s'
                            request_rate: { mean: 5 }, // missing units -> assumed 'queries/s'
                        },
                    },
                    time_series: {
                        latency: {
                            request_latency: {
                                series: [{ ts: '2026-08-31T07:44:02Z', mean: 12.5 }],
                            },
                        },
                    },
                },
                observability: {
                    pod_startup_times: {
                        aggregate: { mean: 42.0 },
                        by_pod: {
                            'vllm-0': { mean: 40.0 },
                        },
                    },
                },
                session_performance: {
                    aggregate: {
                        latency: {
                            time_to_first_token: { mean: 1.0 },
                        },
                    },
                },
            },
        };

        const warnings = detectMissingUnitWarnings(report, 'stage_0.json');
        expect(warnings).toHaveLength(11);

        // Check each warning contains path, assumed unit, and filename prefix
        expect(warnings).toContain(
            "[stage_0.json] Missing units for '$.results.request_performance.aggregate.latency.request_latency'; assumed 's' (seconds), but validation is needed since units are missing from original report file."
        );
        expect(warnings).toContain(
            "[stage_0.json] Missing units for '$.results.request_performance.aggregate.latency.time_to_first_token'; assumed 's' (seconds), but validation is needed since units are missing from original report file."
        );
        expect(warnings).toContain(
            "[stage_0.json] Missing units for '$.results.request_performance.aggregate.latency.time_per_output_token'; assumed 's/token' (seconds per token), but validation is needed since units are missing from original report file."
        );
        expect(warnings).toContain(
            "[stage_0.json] Missing units for '$.results.request_performance.aggregate.latency.inter_token_latency'; assumed 's/token' (seconds per token), but validation is needed since units are missing from original report file."
        );
        expect(warnings).toContain(
            "[stage_0.json] Missing units for '$.results.request_performance.aggregate.latency.normalized_time_per_output_token'; assumed 's/token' (seconds per token), but validation is needed since units are missing from original report file."
        );
        expect(warnings).toContain(
            "[stage_0.json] Missing units for '$.results.request_performance.aggregate.throughput.output_token_rate'; assumed 'tokens/s', but validation is needed since units are missing from original report file."
        );
        expect(warnings).toContain(
            "[stage_0.json] Missing units for '$.results.request_performance.aggregate.throughput.request_rate'; assumed 'queries/s', but validation is needed since units are missing from original report file."
        );
        expect(warnings).toContain(
            "[stage_0.json] Missing units for '$.results.request_performance.time_series.latency.request_latency'; assumed 's' (seconds), but validation is needed since units are missing from original report file."
        );
        expect(warnings).toContain(
            "[stage_0.json] Missing units for '$.results.observability.pod_startup_times.aggregate'; assumed 's' (seconds), but validation is needed since units are missing from original report file."
        );
        expect(warnings).toContain(
            "[stage_0.json] Missing units for '$.results.observability.pod_startup_times.by_pod.vllm-0'; assumed 's' (seconds), but validation is needed since units are missing from original report file."
        );
        expect(warnings).toContain(
            "[stage_0.json] Missing units for '$.results.session_performance.aggregate.latency.time_to_first_token'; assumed 's' (seconds), but validation is needed since units are missing from original report file."
        );
    });

    it('attaches missing unit warnings to stage and entry diagnostics on parseReportV02 and stageToEntry', () => {
        const report = {
            version: '0.2',
            scenario: {
                stack: [{ standardized: { role: 'aggregate', model: { name: 'test-model' }, accelerator: { model: 'H100' } } }],
                load: { standardized: { tool: 'vllm' } },
            },
            results: {
                request_performance: {
                    aggregate: {
                        latency: {
                            request_latency: { mean: 2.5 },
                        },
                    },
                },
            },
        };

        const stage = parseReportV02(report, 'stage_missing.yaml');
        expect(stage.warnings).toHaveLength(1);
        expect(stage.warnings[0]).toContain("Missing units for '$.results.request_performance.aggregate.latency.request_latency'; assumed 's' (seconds)");

        const entry = stageToEntry(stage);
        expect(entry._diagnostics.msg).toHaveLength(1);
        expect(entry._diagnostics.msg[0]).toBe(stage.warnings[0]);
    });

    it('surfaces missing unit warnings in validateBenchmark and validatePrismUploadStructure', () => {
        const rawReport = {
            version: '0.2',
            scenario: {
                stack: [{ standardized: { role: 'aggregate', model: { name: 'test-model' }, accelerator: { model: 'H100' } } }],
                load: { standardized: { tool: 'vllm' } },
            },
            results: {
                request_performance: {
                    aggregate: {
                        throughput: { output_token_rate: { mean: 50, units: 'tokens/s' } },
                        latency: {
                            request_latency: { mean: 2.5 }, // Missing units
                            time_to_first_token: { mean: 0.5, units: 's' },
                        },
                    },
                },
            },
        };

        // File validation
        const fileVal = validateBenchmark(JSON.stringify(rawReport), 'stage_0.json');
        expect(fileVal.warnings.some(w => w.includes("Missing units for '$.results.request_performance.aggregate.latency.request_latency'"))).toBe(true);

        // Upload structure validation
        const uploadData = {
            runId: '11111111-1111-4111-8111-111111111111',
            format: 'brv02',
            runLabel: 'Missing Units Test',
            model_name: 'test-model',
            hardware: { hardware_name: 'H100', accelerator_count: 1 },
            entries: [{
                run_id: '22222222-2222-4222-8222-222222222222',
                run_description: 'Missing Units Test',
                filename: 'stage_0.json',
                raw_report: rawReport,
            }],
        };

        const structVal = validatePrismUploadStructure(uploadData, { isUpload: false });
        expect(structVal.isValid).toBe(true); // Warnings do not block upload
        expect(structVal.warnings.some(w =>
            w.includes('[stage_0.json]') &&
            w.includes("Missing units for '$.results.request_performance.aggregate.latency.request_latency'") &&
            w.includes("assumed 's' (seconds)")
        )).toBe(true);
    });

    it('does not emit missing unit warnings when all units are explicitly declared', () => {
        const report = {
            version: '0.2',
            results: {
                request_performance: {
                    aggregate: {
                        latency: {
                            request_latency: { mean: 21.5, units: 's' },
                            time_to_first_token: { mean: 0.5, units: 's' },
                            time_per_output_token: { mean: 0.012, units: 's/token' },
                        },
                        throughput: {
                            output_token_rate: { mean: 200, units: 'tokens/s' },
                            request_rate: { mean: 5, units: 'queries/s' },
                        },
                    },
                },
            },
        };

        const warnings = detectMissingUnitWarnings(report);
        expect(warnings).toHaveLength(0);
    });

    it('ensures parseReportV02 preserves units and does not emit warnings when throughput and latency declare units', () => {
        const report = {
            version: '0.2',
            results: {
                request_performance: {
                    aggregate: {
                        latency: {
                            request_latency: { mean: 21.5, units: 's' },
                            time_to_first_token: { mean: 0.5, units: 's' },
                            time_per_output_token: { mean: 0.012, units: 's/token' },
                        },
                        throughput: {
                            output_token_rate: { mean: 200, units: 'tokens/s' },
                            request_rate: { mean: 5, units: 'queries/s' },
                        },
                    },
                },
            },
        };

        const stage = parseReportV02(report, 'stage_with_units.json');
        expect(stage.warnings).toHaveLength(0);
        expect(stage.rawReport.results.request_performance.aggregate.throughput.output_token_rate.units).toBe('tokens/s');
    });
});
