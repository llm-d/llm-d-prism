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
import {
    parseReportV02,
    normalizeTags,
    groupStagesIntoRuns,
    stageToEntry,
    unitToSecondsFactor,
    resolveUnitFamily,
    normalizeReportUnits,
    detectMissingUnitWarnings,
    forwardBundleMetadata,
    mutateRawReportMetadata,
    LEGACY_EMPTY_RUN_EID,
    isValidRunEid,
    groupStandaloneBRV02Stages,
    mergeStagedBundlesByRunEid,
    stripDerivedTimeSeries,
    rehydrateDerivedTimeSeries,
} from './benchmarkReportV02Parser.js';
import { validateBenchmark, validatePrismUploadStructure, formatZodIssuePath } from './benchmarkValidator.js';

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

    it('validates upload payload when entries omit run_description without throwing undefined string errors', () => {
        const validDoc = {
            version: '0.2',
            run: { id: 'test-run-1', description: 'Test' },
            scenario: { model: 'meta-llama/Llama-3-8B-Instruct', hardware: 'H100' },
            results: {
                request_performance: {
                    aggregate: {
                        throughput: { output_token_rate: { mean: 100, units: 'tokens/s' } },
                        latency: { request_latency: { mean: 1.5, units: 's' } }
                    }
                }
            }
        };

        const uploadData = {
            runId: '11111111-1111-4111-8111-111111111111',
            runLabel: 'Staged Benchmark Run',
            model_name: 'meta-llama/Llama-3-8B-Instruct',
            hardware: { hardware_name: 'H100', accelerator_count: 8 },
            format: 'brv02',
            entries: [
                {
                    run_id: '22222222-2222-4222-8222-222222222222',
                    filename: 'stage_1.yaml',
                    raw_report: validDoc,
                    prism_stage_index: 0
                    // run_description intentionally omitted
                },
                {
                    run_id: '33333333-3333-4333-8333-333333333333',
                    filename: 'stage_2.yaml',
                    raw_report: validDoc,
                    prism_stage_index: 1
                    // run_description intentionally omitted
                }
            ]
        };

        const validation = validatePrismUploadStructure(uploadData, { isUpload: false });
        expect(validation.isValid).toBe(true);
        expect(validation.errors).toHaveLength(0);
        expect(validation.errors.some(e => e.includes('expected string, received undefined'))).toBe(false);

        // Simulate moving sub-runs around: swapping entries and re-indexing prism_stage_index
        const [moved] = uploadData.entries.splice(0, 1);
        uploadData.entries.splice(1, 0, moved);
        uploadData.entries.forEach((e, idx) => {
            e.prism_stage_index = idx;
        });

        const movedValidation = validatePrismUploadStructure(uploadData, { isUpload: false });
        expect(movedValidation.isValid).toBe(true);
        expect(movedValidation.errors).toHaveLength(0);
    });

    describe('formatZodIssuePath and detailed Zod error reporting', () => {
        it('formats simple and nested object paths correctly', () => {
            expect(formatZodIssuePath([])).toBe('');
            expect(formatZodIssuePath(null)).toBe('');
            expect(formatZodIssuePath(undefined)).toBe('');
            expect(formatZodIssuePath(['model_name'])).toBe('model_name');
            expect(formatZodIssuePath(['hardware', 'hardware_name'])).toBe('hardware.hardware_name');
            expect(formatZodIssuePath(['entries', 0, 'run_id'])).toBe('entries[0].run_id');
            expect(formatZodIssuePath(['entries', 1, 'raw_report', 'scenario', 'load', 'tool'])).toBe('entries[1].raw_report.scenario.load.tool');
            expect(formatZodIssuePath(['manifests', 'deployment.yaml'])).toBe('manifests["deployment.yaml"]');
            expect(formatZodIssuePath([0, 'nested', 2])).toBe('[0].nested[2]');
        });

        it('includes the object path in errors and fieldErrors when Zod schema validation fails', () => {
            const invalidPayload = {
                runId: 'not-a-valid-uuid',
                format: 'brv02',
                runLabel: 'Invalid Payload Test',
                model_name: '',
                hardware: {
                    hardware_name: 'H100',
                    accelerator_count: 0 // invalid count
                },
                entries: [
                    {
                        run_id: 'invalid-stage-uuid',
                        filename: 'stage_0.json',
                        // missing raw_report
                    }
                ]
            };

            const result = validatePrismUploadStructure(invalidPayload, { isUpload: false });
            expect(result.isValid).toBe(false);

            // Verify runId error includes path
            expect(result.errors.some(e => e.startsWith('runId:'))).toBe(true);
            expect(result.fieldErrors['runId']).toBeDefined();

            // Verify model_name error includes path
            expect(result.errors.some(e => e.startsWith('model_name:'))).toBe(true);
            expect(result.fieldErrors['model_name']).toBeDefined();

            // Verify hardware.accelerator_count error includes path
            expect(result.errors.some(e => e.startsWith('hardware.accelerator_count:'))).toBe(true);
            expect(result.fieldErrors['hardware.accelerator_count']).toBeDefined();

            // Verify nested entry errors include array index and field path
            expect(result.errors.some(e => e.startsWith('entries[0].run_id:'))).toBe(true);
            expect(result.fieldErrors['entries.0.run_id']).toBeDefined();
            expect(result.fieldErrors['entries[0].run_id']).toBeDefined();

            expect(result.errors.some(e => e.startsWith('entries[0].raw_report:'))).toBe(true);
            expect(result.fieldErrors['entries.0.raw_report']).toBeDefined();
            expect(result.fieldErrors['entries[0].raw_report']).toBeDefined();
        });
    });

    describe('stageToEntry hardware and accelerator_count propagation', () => {
        it('resolves hardware and accelerator_count from stage.payload.hardware when stage.hardware is absent', () => {
            const stage = {
                scenario: { model: 'Qwen3 32B', hardware: 'H200', acceleratorCount: null },
                performance: { outputTokenRate: 297.69 },
                payload: {
                    hardware: { hardware_name: 'H200', accelerator_count: 8 }
                }
            };
            const entry = stageToEntry(stage);
            expect(entry.hardware).toBe('H200');
            expect(entry.accelerator_count).toBe(8);
            expect(entry.metadata.accelerator_count).toBe(8);
        });

        it('resolves accelerator_count from stage.hardware object', () => {
            const stage = {
                scenario: { model: 'Qwen3 32B', hardware: 'H200', acceleratorCount: null },
                performance: { outputTokenRate: 297.69 },
                hardware: { hardware_name: 'H200', accelerator_count: 8 }
            };
            const entry = stageToEntry(stage);
            expect(entry.hardware).toBe('H200');
            expect(entry.accelerator_count).toBe(8);
            expect(entry.metadata.accelerator_count).toBe(8);
        });

        it('forwards all root metadata fields into stage via forwardBundleMetadata', () => {
            const stage = {
                scenario: { model: 'Unknown', hardware: 'Unknown' },
                performance: { outputTokenRate: 100 },
                metadata: { customField: 'original' },
            };
            const payload = {
                runId: 'run-123',
                runLabel: 'test-run',
                model_name: 'Qwen3 32B',
                hardware: { hardware_name: 'H200', accelerator_count: 8 },
                inference_tool: 'vllm',
                inference_tool_version: 'v0.6.0',
                benchmark_harness: 'inference-perf',
                benchmark_harness_version: 'v1.2.0',
                other_tools: ['prometheus'],
                manifests: { 'deploy.yaml': 'kind: Deployment' },
                evidence: { 'log.txt': 'logs' },
                run_metadata: { cluster: 'gke-prod' },
                forked_from: [{ original_run_id: 'orig-1' }],
                github_author: { username: 'diamond' },
                metadata: { extraKey: 'value' },
            };

            forwardBundleMetadata(stage, payload);

            expect(stage.runId).toBe('run-123');
            expect(stage.runLabel).toBe('test-run');
            expect(stage.model_name).toBe('Qwen3 32B');
            expect(stage.hardware).toEqual({ hardware_name: 'H200', accelerator_count: 8 });
            expect(stage.accelerator_count).toBe(8);
            expect(stage.inference_tool).toBe('vllm');
            expect(stage.inference_tool_version).toBe('v0.6.0');
            expect(stage.benchmark_harness).toBe('inference-perf');
            expect(stage.benchmark_harness_version).toBe('v1.2.0');
            expect(stage.other_tools).toEqual(['prometheus']);
            expect(stage.manifests).toEqual({ 'deploy.yaml': 'kind: Deployment' });
            expect(stage.evidence).toEqual({ 'log.txt': 'logs' });
            expect(stage.run_metadata).toEqual({ cluster: 'gke-prod' });
            expect(stage.forked_from).toEqual([{ original_run_id: 'orig-1' }]);
            expect(stage.github_author).toEqual({ username: 'diamond' });
            expect(stage.metadata).toEqual({ customField: 'original', extraKey: 'value' });

            const entry = stageToEntry(stage);
            expect(entry.model_name).toBe('qwen3 32b');
            expect(entry.hardware).toBe('H200');
            expect(entry.accelerator_count).toBe(8);
            expect(entry.inference_tool).toBe('vllm');
            expect(entry.manifests).toEqual({ 'deploy.yaml': 'kind: Deployment' });
            expect(entry.evidence).toEqual({ 'log.txt': 'logs' });
            expect(entry.metadata.customField).toBe('original');
            expect(entry.metadata.extraKey).toBe('value');
        });

        it('propagates bundle hardware and accelerator_count down through groupStagesIntoRuns', async () => {
            const rawReport = {
                version: '0.2',
                run: { uid: 'stage-1', description: 'test' },
                scenario: {
                    stack: [{
                        standardized: {
                            model: { name: 'Qwen3 32B' },
                            accelerator: { model: 'H200', parallelism: { tp: null } },
                        }
                    }]
                },
                results: {
                    request_performance: {
                        aggregate: {
                            throughput: { output_token_rate: { mean: 1600 } },
                            latency: { request_latency: { mean: 10 } }
                        }
                    }
                }
            };

            const rootPayload = {
                runId: 'ce18398b-6ebc-424f-aa9b-d1851eddaf39',
                runLabel: 'ubench-7muezv3y',
                model_name: 'Qwen3 32B',
                hardware: { hardware_name: 'H200', accelerator_count: 8 },
                entries: [{ run_id: 'stage-1', filename: 'report.json', raw_report: rawReport }]
            };

            const stage = await parseReportV02(rawReport, 'report.json');
            stage.runId = rootPayload.runId;
            stage.runLabel = rootPayload.runLabel;
            forwardBundleMetadata(stage, rootPayload);

            const runs = groupStagesIntoRuns([stage]);

            expect(runs).toHaveLength(1);
            const run = runs[0];
            expect(run.accelerator_count).toBe(8);
            expect(run.hardware).toEqual({ hardware_name: 'H200', accelerator_count: 8 });

            expect(run.stages).toHaveLength(1);
            const runStage = run.stages[0];
            expect(runStage.accelerator_count).toBe(8);

            const entry = stageToEntry(runStage);
            expect(entry.accelerator_count).toBe(8);
            expect(entry.hardware).toBe('H200');
            expect(entry.metadata.accelerator_count).toBe(8);
        });

        it('mutates raw_report accelerator count and inference tool correctly in mutateRawReportMetadata', () => {
            const rawReport = {
                version: '0.2',
                scenario: {
                    stack: [{
                        standardized: {
                            kind: 'inference_engine',
                            tool: 'old-engine',
                            accelerator: { model: 'H200' },
                        }
                    }]
                }
            };

            const mutated = mutateRawReportMetadata(rawReport, {
                hardware_name: 'H200',
                accelerator_count: 8,
                inference_tool: 'vllm'
            });

            expect(mutated.scenario.stack[0].standardized.accelerator.count).toBe(8);
            expect(mutated.scenario.stack[0].standardized.tool).toBe('vllm');
        });

        it('does not conflate benchmark harness with serving stack when validating or mutating BRV02 reports', () => {
            const rawStageReport = {
                version: '0.2',
                run: { uid: 'a35b33a3-425c-4deb-8fc9-189ed16e5887', description: 'run-20260831-precise-prefix' },
                scenario: {
                    stack: [{
                        standardized: {
                            kind: 'inference_engine',
                            role: 'decode',
                            model: { name: 'gemma-4-31b-it' },
                            accelerator: { model: 'TPU v6e', count: 1 },
                            tool: '',
                            tool_version: '//:'
                        }
                    }],
                    load: {
                        standardized: {
                            stage: 0,
                            tool: 'inference-perf'
                        }
                    }
                },
                results: {
                    request_performance: {
                        aggregate: {
                            throughput: { output_token_rate: { mean: 65.18 } },
                            latency: { request_latency: { mean: 20.8 } }
                        }
                    }
                }
            };

            // 1. Parse stage and verify inference_tool is not conflated with benchmark harness ('inference-perf')
            const parsedStage = parseReportV02(rawStageReport, 'stage_0.yaml');
            expect(parsedStage.inference_tool).toBe(null);
            expect(parsedStage.benchmark_harness).toBe('inference-perf');

            const normalizedEntry = stageToEntry(parsedStage);
            expect(normalizedEntry.inference_tool).toBe('');
            expect(normalizedEntry.benchmark_harness).toBe('inference-perf');

            // 2. When user sets Serving Stack to 'vLLM', mutateRawReportMetadata updates stack tool and validation has 0 warnings
            const mutatedReport = mutateRawReportMetadata(rawStageReport, {
                inference_tool: 'vLLM',
                inference_tool_version: 'v0.6.3',
                benchmark_harness: 'inference-perf'
            });
            expect(mutatedReport.scenario.stack[0].standardized.tool).toBe('vLLM');
            expect(mutatedReport.scenario.stack[0].standardized.tool_version).toBe('v0.6.3');
            expect(mutatedReport.scenario.load.standardized.tool).toBe('inference-perf');

            const uploadPayload = {
                runId: '11111111-1111-4111-8111-111111111111',
                runLabel: 'run-20260831-precise-prefix',
                model_name: 'gemma-4-31b-it',
                hardware: { hardware_name: 'TPU v6e', accelerator_count: 1 },
                format: 'brv02',
                inference_tool: 'vLLM',
                inference_tool_version: 'v0.6.3',
                benchmark_harness: 'inference-perf',
                manifests: { 'config.yaml': 'data:text/plain;base64,Cg==' },
                evidence: { 'log.txt': 'data:text/plain;base64,Cg==' },
                entries: [{
                    run_id: '22222222-2222-4222-8222-222222222222',
                    run_description: 'run-20260831-precise-prefix',
                    filename: 'stage_0.yaml',
                    prism_stage_index: 0,
                    raw_report: mutatedReport
                }]
            };

            const validation = validatePrismUploadStructure(uploadPayload, { isUpload: false });
            expect(validation.isValid).toBe(true);
            expect(validation.warnings.filter(w => w.includes('mismatching serving stack'))).toHaveLength(0);

            // 3. Clearing Serving Stack back to empty string properly clears stack tool
            const clearedReport = mutateRawReportMetadata(mutatedReport, {
                inference_tool: ''
            });
            expect(clearedReport.scenario.stack[0].standardized.tool).toBe('');

            // 4. Changing Benchmark Harness updates scenario.load.standardized.tool
            const harnessUpdatedReport = mutateRawReportMetadata(clearedReport, {
                benchmark_harness: 'guidellm',
                benchmark_harness_version: 'v0.2.0'
            });
            expect(harnessUpdatedReport.scenario.load.standardized.tool).toBe('guidellm');
            expect(harnessUpdatedReport.scenario.load.standardized.tool_version).toBe('v0.2.0');
        });
    });
});

describe('BRV0.2 run.eid grouping and standalone stage coalescing', () => {
    it('validates run.eid properly and rejects legacy empty-string UUID5 hash', () => {
        expect(isValidRunEid(null)).toBe(false);
        expect(isValidRunEid(undefined)).toBe(false);
        expect(isValidRunEid('')).toBe(false);
        expect(isValidRunEid('   ')).toBe(false);
        expect(isValidRunEid('unknown')).toBe(false);
        expect(isValidRunEid('UNKNOWN')).toBe(false);
        expect(isValidRunEid(LEGACY_EMPTY_RUN_EID)).toBe(false);

        expect(isValidRunEid('a4f9d123-8888-5555-9999-123456789abc')).toBe(true);
        expect(isValidRunEid('exp-custom-id')).toBe(true);
    });

    it('coalesces standalone stages in groupStagesIntoRuns only when sharing a valid runEid', () => {
        const sharedEid = 'a4f9d123-8888-5555-9999-123456789abc';
        const stagesWithSameEid = [
            { filename: 'stage0.yaml', runUid: 'uid-1', runEid: sharedEid, loadMetadata: { cfg_id: 'cfg-1' }, stageIndex: 0 },
            { filename: 'stage1.yaml', runUid: 'uid-2', runEid: sharedEid, loadMetadata: { cfg_id: 'cfg-1' }, stageIndex: 1 },
        ];
        const runs = groupStagesIntoRuns(stagesWithSameEid);
        expect(runs).toHaveLength(1);
        expect(runs[0].stages).toHaveLength(2);
        expect(runs[0].runEid).toBe(sharedEid);

        // Stages sharing loadMetadata and runUid but lacking valid runEid remain separate
        const stagesWithoutValidEid = [
            { filename: 's0.yaml', runUid: 'same-uid', runEid: LEGACY_EMPTY_RUN_EID, loadMetadata: { cfg_id: 'same-cfg' }, stageIndex: 0 },
            { filename: 's1.yaml', runUid: 'same-uid', runEid: null, loadMetadata: { cfg_id: 'same-cfg' }, stageIndex: 1 },
        ];
        const ungroupedRuns = groupStagesIntoRuns(stagesWithoutValidEid);
        expect(ungroupedRuns).toHaveLength(2);
    });

    it('groups standalone uploaded BRV0.2 files by valid run.eid and keeps legacy/distinct files separate', () => {
        const sharedEid = 'e9012345-6789-5abc-def0-1234567890ab';
        const reportA = {
            version: '0.2',
            run: { uid: 'uid-a', eid: sharedEid },
            scenario: { load: { metadata: { cfg_id: 'hash-a' } } },
        };
        const reportB = {
            version: '0.2',
            run: { uid: 'uid-b', eid: sharedEid },
            scenario: { load: { metadata: { cfg_id: 'hash-b' } } },
        };
        const reportLegacy1 = {
            version: '0.2',
            run: { uid: 'same-uid', eid: LEGACY_EMPTY_RUN_EID },
            scenario: { load: { metadata: { cfg_id: 'same-cfg-hash' } } },
        };
        const reportLegacy2 = {
            version: '0.2',
            run: { uid: 'same-uid', eid: LEGACY_EMPTY_RUN_EID },
            scenario: { load: { metadata: { cfg_id: 'same-cfg-hash' } } },
        };

        let idCounter = 0;
        const makeId = () => `bundle-${++idCounter}`;
        const getFilePath = (f) => f.name;

        const standaloneFiles = [
            { file: { name: 'stage0.yaml' }, content: reportA, validation: { format: 'brv02' } },
            { file: { name: 'stage1.yaml' }, content: reportB, validation: { format: 'brv02' } },
            { file: { name: 'legacy0.yaml' }, content: reportLegacy1, validation: { format: 'brv02' } },
            { file: { name: 'legacy1.yaml' }, content: reportLegacy2, validation: { format: 'brv02' } },
        ];

        const grouped = groupStandaloneBRV02Stages(standaloneFiles, getFilePath, makeId);
        // reportA + reportB coalesce into 1 bundle; reportLegacy1 and reportLegacy2 stay separate (total 3 bundles)
        expect(grouped).toHaveLength(3);
        expect(grouped[0].files).toHaveLength(2);
        expect(grouped[0].parsedStages).toHaveLength(2);
        expect(grouped[0].runEid).toBe(sharedEid);
        expect(grouped[1].files).toHaveLength(1);
        expect(grouped[1].runEid).toBe(null);
        expect(grouped[2].files).toHaveLength(1);
        expect(grouped[2].runEid).toBe(null);
    });

    it('merges staged standalone bundles across multiple drops when sharing a valid run.eid', () => {
        const sharedEid = 'f1122334-5566-5778-99aa-bbccddeeff00';
        const existingBundles = [
            {
                id: 'bundle-1',
                dirKey: sharedEid,
                isDirUpload: false,
                runEid: sharedEid,
                stageFiles: [{ file: { name: 'stage0.yaml' }, filename: 'stage0.yaml' }],
                payload: { entries: [{ filename: 'stage0.yaml', prism_stage_index: 0 }] },
                validation: { entries: [{ filename: 'stage0.yaml' }], errors: [], warnings: [] },
            },
            {
                id: 'bundle-dir',
                dirKey: 'folder',
                isDirUpload: true,
                runEid: sharedEid,
                stageFiles: [{ file: { name: 'folder/stage0.yaml' }, filename: 'folder/stage0.yaml' }],
                payload: { entries: [{ filename: 'folder/stage0.yaml', prism_stage_index: 0 }] },
                validation: { entries: [{ filename: 'folder/stage0.yaml' }], errors: [], warnings: [] },
            },
        ];

        const newBundles = [
            {
                id: 'bundle-2',
                dirKey: sharedEid,
                isDirUpload: false,
                runEid: sharedEid,
                stageFiles: [{ file: { name: 'stage1.yaml' }, filename: 'stage1.yaml' }],
                payload: { entries: [{ filename: 'stage1.yaml', prism_stage_index: 0 }] },
                validation: { entries: [{ filename: 'stage1.yaml' }], errors: [], warnings: [] },
            },
            {
                id: 'bundle-no-eid',
                dirKey: 'staged-no-eid',
                isDirUpload: false,
                runEid: null,
                stageFiles: [{ file: { name: 'other.yaml' }, filename: 'other.yaml' }],
                payload: { entries: [{ filename: 'other.yaml', prism_stage_index: 0 }] },
                validation: { entries: [{ filename: 'other.yaml' }], errors: [], warnings: [] },
            },
        ];

        const merged = mergeStagedBundlesByRunEid(existingBundles, newBundles);
        // bundle-2 merges into bundle-1; bundle-dir is untouched; bundle-no-eid is appended
        expect(merged).toHaveLength(3);
        const mergedStandalone = merged.find(b => b.id === 'bundle-1');
        expect(mergedStandalone.stageFiles).toHaveLength(2);
        expect(mergedStandalone.payload.entries).toHaveLength(2);
        expect(mergedStandalone.payload.entries[0].filename).toBe('stage0.yaml');
        expect(mergedStandalone.payload.entries[0].prism_stage_index).toBe(0);
        expect(mergedStandalone.payload.entries[1].filename).toBe('stage1.yaml');
        expect(mergedStandalone.payload.entries[1].prism_stage_index).toBe(1);

        const dirBundle = merged.find(b => b.id === 'bundle-dir');
        expect(dirBundle.stageFiles).toHaveLength(1);
    });
});



// parseReportV02 accepts a pre-parsed object, so these build docs directly.
const observabilityReport = (observability) => ({
    version: '0.2',
    run: { uid: 'u1', time: { start: '2026-01-01T00:00:00Z' } },
    results: { observability },
});

// startSec offsets from RUN_START, matching the literal timestamps used below,
// so cross-component alignment can be asserted meaningfully.
const RUN_START = Date.parse('2026-01-01T00:00:00Z');

const seriesOf = (units, values, startSec = 0) => ({
    units,
    series: values.map((value, i) => ({
        ts: new Date(RUN_START + (startSec + i * 15) * 1000).toISOString(),
        value,
    })),
});

// v0.2 shape: results.observability.components[] holds ComponentObservability
// entries whose time_series is a TimeSeriesResourceMetrics (named fields).
const comps = (...components) => ({ components });

const comp = (replicaId, timeSeries, componentLabel = 'decode-engine') => ({
    component_label: componentLabel,
    replica_id: replicaId,
    time_series: timeSeries,
});

const tsOf = (doc, field) => parseReportV02(doc, 'f.yaml').observability.timeSeries[field];

describe('extractTimeSeries', () => {
    it('scales a fraction series once, uniformly, to 0-100', () => {
        const entry = tsOf(observabilityReport(comps(
            comp('p1', { kv_cache_usage: seriesOf('fraction', [0.008, 0.01, 0.5, 1]) }),
        )), 'kv_cache_usage');
        expect(entry.components[0].points.map(p => p.value)).toEqual([0.8, 1, 50, 100]);
        expect(entry.units).toBe('percent');
    });

    it('passes an already-percent series through unscaled even when it dips below 1', () => {
        const entry = tsOf(observabilityReport(comps(
            comp('p1', { gpu_utilization: seriesOf('percent', [0.8, 1.2, 55, 99]) }),
        )), 'gpu_utilization');
        expect(entry.components[0].points.map(p => p.value)).toEqual([0.8, 1.2, 55, 99]);
    });

    it('never scales non-portion units', () => {
        const entry = tsOf(observabilityReport(comps(
            comp('p1', { gpu_memory_usage: seriesOf('bytes', [0.25, 0.5, 3]) }),
        )), 'gpu_memory_usage');
        expect(entry.components[0].points.map(p => p.value)).toEqual([0.25, 0.5, 3]);
        expect(entry.units).toBe('bytes');
    });

    it('rebases tSec to the field earliest sample across all components, order normalized', () => {
        const entry = tsOf(observabilityReport(comps(
            comp('p1', { gpu_memory_usage: seriesOf('bytes', [1, 2, 3], 600) }),
            comp('p2', {
                gpu_memory_usage: {
                    units: 'bytes',
                    series: [
                        { ts: '2026-01-01T00:00:30Z', value: 9 },
                        { ts: '2026-01-01T00:00:00Z', value: 7 },
                    ],
                },
            }),
        )), 'gpu_memory_usage');
        expect(entry.components[0].points.map(p => p.tSec)).toEqual([600, 615, 630]);
        expect(entry.components[1].points.map(p => p.tSec)).toEqual([0, 30]);
        expect(entry.components[1].points.map(p => p.value)).toEqual([7, 9]);
    });

    it('parses large time series without exceeding the argument limit', () => {
        const pointCount = 100000;
        const entry = tsOf(observabilityReport(comps(
            comp('late', { gpu_memory_usage: seriesOf('bytes', Array(pointCount).fill(2), 30) }),
            comp('early', { gpu_memory_usage: seriesOf('bytes', Array(pointCount).fill(1)) }),
        )), 'gpu_memory_usage');

        expect(entry.components.map(c => c.points.length)).toEqual([pointCount, pointCount]);
        expect(entry.components[0].points[0]).toEqual({ tSec: 30, value: 2 });
        expect(entry.components[1].points[0]).toEqual({ tSec: 0, value: 1 });
        expect(entry.components[1].points.at(-1)).toEqual({
            tSec: (pointCount - 1) * 15,
            value: 1,
        });
    });

    it('drops unparsable timestamps and null values instead of turning them into NaN', () => {
        const entry = tsOf(observabilityReport(comps(
            comp('p1', {
                gpu_memory_usage: {
                    units: 'bytes',
                    series: [
                        { ts: 'not-a-date', value: 5 },
                        { ts: '2026-01-01T00:00:00Z', value: 4 },
                        { ts: '2026-01-01T00:00:15Z', value: null },
                        { ts: '2026-01-01T00:00:30Z', value: 6 },
                    ],
                },
            }),
        )), 'gpu_memory_usage');
        expect(entry.components[0].points).toEqual([
            { tSec: 0, value: 4 },
            { tSec: 30, value: 6 },
        ]);
    });

    it('omits components with no usable points and drops a field left with none', () => {
        const doc = observabilityReport({
            ...comps(
                comp('empty', { gpu_memory_usage: { units: 'bytes', series: [] } }),
                comp('bad', { gpu_memory_usage: { units: 'bytes', series: [{ ts: 'nope', value: 1 }] } }),
            ),
            vllm_num_requests_running: { aggregated: { mean: 2 } },
        });
        const parsed = parseReportV02(doc, 'f.yaml');
        expect(parsed.observability.timeSeries).toBe(null);
        expect(parsed.observability.numRequestsRunningMean).toBe(2);
    });

    it('humanizes a field with no curated label', () => {
        const entry = tsOf(observabilityReport(comps(
            comp('p1', { some_future_field: seriesOf('count', [3, 4]) }),
        )), 'some_future_field');
        expect(entry.label).toBe('Some Future Field');
        expect(entry.units).toBe('count');
    });

    it('uses the curated label for a known field', () => {
        const entry = tsOf(observabilityReport(comps(
            comp('p1', { kv_cache_usage: seriesOf('fraction', [0.5]) }),
        )), 'kv_cache_usage');
        expect(entry.label).toBe('KV Cache Usage');
    });

    it('yields an observability object with every aggregate null when only series are present', () => {
        const parsed = parseReportV02(observabilityReport(comps(
            comp('p1', { kv_cache_usage: seriesOf('fraction', [0.25, 0.75]) }),
        )), 'f.yaml');
        expect(parsed.observability).not.toBe(null);
        expect(parsed.observability.kvCacheUsageMean).toBe(null);
        expect(parsed.observability.timeSeries.kv_cache_usage.components.length).toBe(1);
    });

    it('leaves observability null when neither aggregates nor series are present', () => {
        const parsed = parseReportV02(observabilityReport({
            vllm_kv_cache_usage_perc: { aggregated: {} },
        }), 'f.yaml');
        expect(parsed.observability).toBe(null);
    });

    it('fans one component carrying several fields into one entry per field', () => {
        const parsed = parseReportV02(observabilityReport(comps(
            comp('decode-1', {
                kv_cache_usage: seriesOf('fraction', [0.2, 0.4]),
                gpu_utilization: seriesOf('percent', [40, 80]),
                power_consumption: seriesOf('Watts', [250.5, 310]),
            }),
        )), 'f.yaml');
        const ts = parsed.observability.timeSeries;
        expect(Object.keys(ts).sort()).toEqual(['gpu_utilization', 'kv_cache_usage', 'power_consumption']);
        expect(ts.power_consumption.units).toBe('Watts');
        expect(ts.kv_cache_usage.components[0].pod).toBe('decode-1');
        expect(ts.kv_cache_usage.components[0].role).toBe('decode-engine');
    });

    it('keeps multiple replicas of one field as distinct components, in order', () => {
        const entry = tsOf(observabilityReport(comps(
            comp('decode-1', { kv_cache_usage: seriesOf('fraction', [0.1]) }, 'decode-engine'),
            comp('prefill-1', { kv_cache_usage: seriesOf('fraction', [0.9]) }, 'prefill-engine'),
        )), 'kv_cache_usage');
        expect(entry.components.map(c => c.pod)).toEqual(['decode-1', 'prefill-1']);
        expect(entry.components.map(c => c.role)).toEqual(['decode-engine', 'prefill-engine']);
    });

    it('decides fraction-vs-percent over every component of a field so pods never end up 100x apart', () => {
        const entry = tsOf(observabilityReport(comps(
            comp('p1', { kv_cache_usage: seriesOf('fraction', [0.2, 0.9]) }),
            comp('p2', { kv_cache_usage: seriesOf('fraction', [0.2, 1.0000001]) }),
        )), 'kv_cache_usage');
        expect(entry.components[0].points.map(p => p.value)).toEqual([0.2, 0.9]);
        expect(entry.components[1].points.map(p => p.value)).toEqual([0.2, 1.0000001]);
        expect(entry.units).toBe('fraction');
    });

    it('keeps fraction units when one glitch sample exceeds 1', () => {
        const entry = tsOf(observabilityReport(comps(
            comp('p1', { kv_cache_usage: seriesOf('fraction', [0.2, 0.4, 1.05, 0.6]) }),
        )), 'kv_cache_usage');
        expect(entry.components[0].points.map(p => p.value)).toEqual([0.2, 0.4, 1.05, 0.6]);
        expect(entry.units).toBe('fraction');
    });

    it('flags components disagreeing on units instead of silently co-plotting them', () => {
        const entry = tsOf(observabilityReport(comps(
            comp('p1', { power_consumption: seriesOf('Watts', [300]) }),
            comp('p2', { power_consumption: seriesOf('milliwatts', [300000]) }),
        )), 'power_consumption');
        expect(entry.unitsConflict).toBe(true);
        expect(entry.components.length).toBe(2);
    });

    it('sets no conflict flag when units agree, ignoring surrounding whitespace', () => {
        const entry = tsOf(observabilityReport(comps(
            comp('p1', { kv_cache_usage: seriesOf(' fraction ', [0.5]) }),
            comp('p2', { kv_cache_usage: seriesOf('fraction', [0.25]) }),
        )), 'kv_cache_usage');
        expect(entry.unitsConflict).toBeUndefined();
        expect(entry.units).toBe('percent');
        expect(entry.components.map(c => c.points[0].value)).toEqual([50, 25]);
    });

    it('collapses repeated timestamps to the first reading', () => {
        const entry = tsOf(observabilityReport(comps(
            comp('p1', {
                gpu_memory_usage: {
                    units: 'bytes',
                    series: [
                        { ts: '2026-01-01T00:00:00Z', value: 10 },
                        { ts: '2026-01-01T00:00:00Z', value: 90 },
                        { ts: '2026-01-01T00:00:15Z', value: 20 },
                    ],
                },
            }),
        )), 'gpu_memory_usage');
        expect(entry.components[0].points).toEqual([
            { tSec: 0, value: 10 },
            { tSec: 15, value: 20 },
        ]);
    });

    it('strips time series before persisting and rebuilds them from rawReport on load', () => {
        const doc = observabilityReport(comps(
            comp('p1', { kv_cache_usage: seriesOf('fraction', [0.2, 0.4]) }),
        ));
        const stage = parseReportV02(doc, 'f.yaml');
        expect(stage.observability.timeSeries).not.toBe(null);

        const runs = [{ runId: 'r1', stages: [stage] }];
        const stripped = stripDerivedTimeSeries(runs);
        expect(stripped[0].stages[0].observability.timeSeries).toBeUndefined();
        expect('timeSeries' in stripped[0].stages[0].observability).toBe(false);
        expect(stripped[0].stages[0].rawReport).not.toBeUndefined();
        expect(runs[0].stages[0].observability.timeSeries).not.toBeUndefined();

        const roundTripped = rehydrateDerivedTimeSeries(JSON.parse(JSON.stringify(stripped)));
        expect(roundTripped[0].stages[0].observability.timeSeries).toEqual(
            stage.observability.timeSeries,
        );
    });
});

describe('unit families', () => {
    it('scales portion units onto one axis and keeps other families apart', () => {
        expect(resolveUnitFamily('fraction')).toEqual({ family: 'portion', axisUnits: 'percent', factor: 100 });
        expect(resolveUnitFamily('percent')).toEqual({ family: 'portion', axisUnits: 'percent', factor: 1 });
        // the spec keeps RATIO out of the portion group: it is unbounded
        expect(resolveUnitFamily('ratio').family).toBe('ratio');
        expect(resolveUnitFamily('count').family).toBe('count');
        expect(resolveUnitFamily(null)).toEqual({ family: 'unitless', axisUnits: null, factor: 1 });
        // memory units are case-sensitive in the spec and must not be conflated
        expect(resolveUnitFamily('MB').family).toBe('MB');
        expect(resolveUnitFamily('MiB').family).toBe('MiB');
    });
});

describe('tags', () => {
    it('normalizes casing, padding and duplicates', () => {
        expect(normalizeTags(['  Baseline ', 'baseline', 'Latency', '', null, 3])).toEqual(['baseline', 'latency']);
        expect(normalizeTags(null)).toEqual([]);
        expect(normalizeTags('baseline')).toEqual([]);
    });

    const reportWithKeywords = (keywords) => ({
        version: '0.2',
        run: { uid: 'tag-uid-1', eid: 'e5a2b5d0-0000-4000-8000-000000000001', description: 'tagged', keywords },
        scenario: {
            stack: [{ standardized: { model: { name: 'meta/llama-3-8b' }, accelerator: { count: 1, model: 'H100' } } }],
            load: { standardized: { rate: 1 } },
        },
        results: { performance: { requests: { total: 1 } } },
    });

    it('reads run.keywords', () => {
        expect(parseReportV02(reportWithKeywords(['Baseline', 'baseline', ' latency '])).tags).toEqual(['baseline', 'latency']);
        expect(parseReportV02(reportWithKeywords(undefined)).tags).toEqual([]);
    });

    it('exposes tags on the entry', () => {
        const stage = parseReportV02(reportWithKeywords(['baseline']));
        const entry = stageToEntry(stage);
        expect(entry.tags).toEqual(['baseline']);
        expect(entry.metadata.tags).toEqual(['baseline']);
    });

    it('tolerates malformed keywords without dropping the report', () => {
        for (const kw of ['baseline,latency', ['ok', 3], [['a']], 42]) {
            const parsed = parseReportV02(reportWithKeywords(kw));
            expect(parsed).not.toBeNull();
            expect(parsed.performance).toBeTruthy();
        }
        expect(parseReportV02(reportWithKeywords(['ok', 3])).tags).toEqual(['ok']);
    });

    it('forwards payload tags onto the stage', () => {
        const stage = parseReportV02(reportWithKeywords(['fromreport']));
        expect(forwardBundleMetadata(stage, { tags: ['FromPayload'] }).tags).toEqual(['frompayload']);
    });

    it('writes back to run.keywords', () => {
        const mutated = mutateRawReportMetadata(reportWithKeywords(['old']), { tags: ['New', 'new'] });
        expect(mutated.run.keywords).toEqual(['new']);
        expect(mutateRawReportMetadata(reportWithKeywords(['old']), {}).run.keywords).toEqual(['old']);
    });
});

describe('session performance and request counts', () => {
    const sessionReport = {
        version: '0.2.1',
        scenario: {
            stack: [{ standardized: { role: 'decode', model: { name: 'test-model' }, accelerator: { model: 'H200' } } }],
            load: { standardized: { tool: 'inference-perf', stage: 0 } },
        },
        results: {
            session_performance: {
                sessions: {
                    total: 22,
                    succeeded: 22,
                    failed: 0,
                    session_duration: {
                        mean: 2158.9936878356066,
                        p50: 1076.757747888565,
                        p99: 6866.580248386859,
                        units: 's',
                    },
                    session_rate: { mean: 0.0027579513872681605, units: 'queries/s' },
                },
            },
        },
    };

    it('extracts session counts and keeps durations in seconds', () => {
        const stage = parseReportV02(sessionReport, 'stage_0_session_lifecycle_metrics.json.yaml');

        expect(stage.sessionStats.sessionsTotal).toBe(22);
        expect(stage.sessionStats.sessionsCompleted).toBe(22);
        expect(stage.sessionStats.sessionsFailed).toBe(0);
        expect(stage.sessionStats.sessionDurationMeanS).toBeCloseTo(2158.9937, 3);
        expect(stage.sessionStats.sessionDurationP50S).toBeCloseTo(1076.7577, 3);
        expect(stage.sessionStats.sessionDurationP99S).toBeCloseTo(6866.5802, 3);
        expect(stage.sessionStats.sessionRateMean).toBeCloseTo(0.0027579, 6);

        expect(stageToEntry(stage).metrics.sessions.sessionsCompleted).toBe(22);
    });

    it('derives completed sessions when only total and failed are reported', () => {
        const report = JSON.parse(JSON.stringify(sessionReport));
        delete report.results.session_performance.sessions.succeeded;
        report.results.session_performance.sessions.failed = 2;

        const stage = parseReportV02(report, 'stage_0_session_lifecycle_metrics.json.yaml');
        expect(stage.sessionStats.sessionsCompleted).toBe(20);
        expect(stage.sessionStats.sessionsFailed).toBe(2);
    });

    const requestReport = {
        version: '0.2.1',
        scenario: {
            stack: [{ standardized: { role: 'decode', model: { name: 'test-model' }, accelerator: { model: 'H200' } } }],
            load: { standardized: { tool: 'inference-perf', stage: 0 } },
        },
        results: {
            request_performance: {
                aggregate: {
                    requests: { total: 400, failures: 3 },
                },
            },
        },
    };

    it('reports no sessions for a request-only report', () => {
        const stage = parseReportV02(requestReport, 'stage_0_lifecycle_metrics.json.yaml');
        expect(stage.sessionStats).toBeNull();
        expect(stageToEntry(stage).metrics.sessions).toBeNull();
    });

    it('derives completed requests and keeps absent counts null', () => {
        const stage = parseReportV02(requestReport, 'stage_0_lifecycle_metrics.json.yaml');
        const entry = stageToEntry(stage);
        expect(entry.metrics.requests_total).toBe(400);
        expect(entry.metrics.requests_completed).toBe(397);
        expect(entry.metrics.requests_failed).toBe(3);

        const sessionEntry = stageToEntry(parseReportV02(sessionReport, 'stage_0.yaml'));
        expect(sessionEntry.metrics.requests_total).toBeNull();
        expect(sessionEntry.metrics.requests_completed).toBeNull();
        expect(sessionEntry.metrics.requests_failed).toBeNull();
        expect(sessionEntry.metrics.error_count).toBe(0);
    });

    it('converts session durations to seconds using the declared units', () => {
        const report = JSON.parse(JSON.stringify(sessionReport));
        report.results.session_performance.sessions.session_duration = {
            mean: 2000, p50: 1000, p99: 4000, units: 'ms',
        };

        const stage = parseReportV02(report, 'stage_0.yaml');
        expect(stage.sessionStats.sessionDurationMeanS).toBe(2);
        expect(stage.sessionStats.sessionDurationP50S).toBe(1);
        expect(stage.sessionStats.sessionDurationP99S).toBe(4);
    });

    it('warns when session durations carry no units', () => {
        const report = JSON.parse(JSON.stringify(sessionReport));
        delete report.results.session_performance.sessions.session_duration.units;

        const stage = parseReportV02(report, 'stage_0.yaml');
        expect(stage.warnings.some(w => w.includes('sessions.session_duration'))).toBe(true);
    });

    it('keeps the report when the session block is malformed', () => {
        for (const sessions of [5, 'many', [], { session_duration: 42 }, { session_duration: { mean: 1, units: 7 } }]) {
            const report = JSON.parse(JSON.stringify(requestReport));
            report.results.session_performance = { sessions };

            const stage = parseReportV02(report, 'stage_0.yaml');
            expect(stage).not.toBeNull();
            expect(stageToEntry(stage).metrics.requests_total).toBe(400);
        }
    });

    it('nulls counts that cannot happen in a real run', () => {
        const sessions = JSON.parse(JSON.stringify(sessionReport));
        sessions.results.session_performance.sessions = { total: 3, failed: 5 };
        expect(parseReportV02(sessions, 'stage_0.yaml').sessionStats.sessionsCompleted).toBeNull();

        const requests = JSON.parse(JSON.stringify(requestReport));
        requests.results.request_performance.aggregate.requests = { total: 3, failures: 5 };
        expect(stageToEntry(parseReportV02(requests, 'stage_0.yaml')).metrics.requests_completed).toBeNull();
    });
});
