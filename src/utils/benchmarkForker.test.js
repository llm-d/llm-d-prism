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
import { v4 as uuidv4 } from 'uuid';
import { forkBenchmarkPayload, forkBenchmark } from './benchmarkForker.js';
import { getRawPrismCloudPayload } from './brv02Exporter.js';
import { PrismResultPayloadSchema, PrismResultContextSchema } from '../../server/results/api.ts';
import { validatePrismUploadStructure } from './benchmarkValidator.js';
import { groupStagesIntoRuns, stageToEntry } from './benchmarkReportV02Parser.js';

describe('benchmarkForker', () => {
    it('forks a single benchmark into staged state with fresh UUIDs and provenance metadata', () => {
        const originalRunId = uuidv4();
        const originalEntryRunId = uuidv4();
        const sampleStat = {
            benchmarkKey: `gcs:team-bucket:${originalRunId}`,
            model: "meta-llama/Llama-3.1-70B-Instruct",
            hardware: "H100",
            accelerator_count: 8,
            data: [
                {
                    run_id: originalRunId,
                    model: "meta-llama/Llama-3.1-70B-Instruct",
                    source: "gcs:team-bucket",
                    source_info: {
                        type: "benchmark_report_v02",
                        bucket: "team-bucket",
                        submission_state: "public",
                        submitted_at: "2026-08-01T10:00:00Z"
                    },
                    github_author: {
                        username: "octocat",
                        name: "Mona Lisa Octocat"
                    },
                    payload: {
                        runId: originalRunId,
                        runLabel: "Team Benchmark Baseline",
                        model_name: "meta-llama/Llama-3.1-70B-Instruct",
                        hardware: {
                            hardware_name: "H100",
                            accelerator_count: 8
                        },
                        format: "brv02",
                        submission_state: "public",
                        submitted_at: "2026-08-01T10:00:00Z",
                        github_author: {
                            username: "octocat",
                            name: "Mona Lisa Octocat"
                        },
                        requested_reviewers: ["alice", "bob"],
                        entries: [
                            {
                                run_id: originalEntryRunId,
                                run_description: "Team Benchmark Baseline",
                                filename: "stage_0_report.yaml",
                                prism_stage_index: 0,
                                raw_report: {
                                    version: "0.2",
                                    workload: { stage: 0 },
                                    scenario: { model: "meta-llama/Llama-3.1-70B-Instruct" },
                                    results: {
                                        request_performance: {
                                            aggregate: {
                                                throughput: { output_token_rate: { mean: 128.5 } },
                                                latency: { request_latency: { mean: 0.25 }, time_to_first_token: { mean: 0.05 } }
                                            }
                                        }
                                    }
                                }
                            }
                        ]
                    }
                }
            ]
        };

        const { payload: forkedPayload, newRunId, forkDetail: singleForkDetail } = forkBenchmarkPayload(sampleStat, sampleStat.data);

        // Fresh UUIDs
        expect(forkedPayload.runId).toBeDefined();
        expect(forkedPayload.runId).toBe(newRunId);
        expect(forkedPayload.runId).not.toBe(originalRunId);
        expect(forkedPayload.entries[0].run_id).toBeDefined();
        expect(forkedPayload.entries[0].run_id).not.toBe(originalEntryRunId);

        // State reset to local staging
        expect(forkedPayload.submission_state).toBe("staged");
        expect(forkedPayload.submitted_at).toBeUndefined();
        expect(forkedPayload.github_author).toBeUndefined();
        expect(forkedPayload.review).toBeUndefined();
        expect(forkedPayload.feedback).toBeUndefined();
        expect(forkedPayload.requested_reviewers).toBeUndefined();

        // Provenance metadata populated
        expect(forkedPayload.forked_from).toBeDefined();
        const forkDetail = Array.isArray(forkedPayload.forked_from) ? forkedPayload.forked_from[0] : forkedPayload.forked_from;
        expect(forkDetail.original_run_id).toBe(originalRunId);
        expect(forkDetail.original_run_label).toBe("Team Benchmark Baseline");
        expect(forkDetail.source_bucket).toBe("team-bucket");
        expect(forkDetail.original_author).toEqual({ username: "octocat", name: "Mona Lisa Octocat" });
        expect(forkDetail.forked_at).toBeDefined();
        expect(forkDetail).toEqual(singleForkDetail);

        // Raw reports remain intact
        expect(forkedPayload.entries[0].raw_report).toEqual(sampleStat.data[0].payload.entries[0].raw_report);

        // Zod validation
        const zodResult = PrismResultPayloadSchema.safeParse(forkedPayload);
        expect(zodResult.success).toBe(true);

        const structValidation = validatePrismUploadStructure(forkedPayload, { isUpload: false });
        expect(structValidation.isValid).toBe(true);
    });

    it('chains lineage when re-forking an already forked benchmark', () => {
        const originalRunId = uuidv4();
        const sampleStat = {
            benchmarkKey: `gcs:team-bucket:${originalRunId}`,
            data: [{
                run_id: originalRunId,
                payload: {
                    runId: originalRunId,
                    runLabel: "Baseline",
                    model_name: "meta-llama/Llama-3.1-70B-Instruct",
                    hardware: { hardware_name: "H100", accelerator_count: 8 },
                    format: "brv02",
                    entries: [{ filename: "stage_0.yaml", raw_report: { version: "0.2" } }]
                }
            }]
        };

        const { payload: firstFork } = forkBenchmarkPayload(sampleStat, sampleStat.data);

        const secondStat = {
            benchmarkKey: `brv02:${firstFork.runId}`,
            payload: firstFork,
            data: [{
                run_id: firstFork.runId,
                source: `brv02:${firstFork.runId}`,
                source_info: { type: "benchmark_report_v02", bucket: "custom-writable-bucket" },
                github_author: { username: "contributor2" },
                payload: firstFork
            }]
        };

        const { payload: secondFork } = forkBenchmarkPayload(secondStat, secondStat.data);

        expect(Array.isArray(secondFork.forked_from)).toBe(true);
        expect(secondFork.forked_from.length).toBe(2);
        expect(secondFork.forked_from[0].original_run_id).toBe(originalRunId);
        expect(secondFork.forked_from[1].original_run_id).toBe(firstFork.runId);

        const zodResult = PrismResultPayloadSchema.safeParse(secondFork);
        expect(zodResult.success).toBe(true);
    });

    it('builds bundles with forkBenchmark and preserves forked_from', () => {
        const originalRunId = uuidv4();
        const sampleStat = {
            benchmarkKey: `gcs:team-bucket:${originalRunId}`,
            data: [{
                run_id: originalRunId,
                payload: {
                    runId: originalRunId,
                    runLabel: "Baseline",
                    model_name: "meta-llama/Llama-3.1-70B-Instruct",
                    hardware: { hardware_name: "H100", accelerator_count: 8 },
                    format: "brv02",
                    entries: [{
                        filename: "stage_0.yaml",
                        raw_report: {
                            version: "0.2",
                            workload: { stage: 0 },
                            results: {
                                request_performance: {
                                    aggregate: {
                                        throughput: { output_token_rate: { mean: 100, units: "tokens/s" } },
                                        latency: { request_latency: { mean: 1.5, units: "s" } }
                                    }
                                }
                            }
                        }
                    }]
                }
            }]
        };

        const { bundle, payload: resultPayload } = forkBenchmark(sampleStat, sampleStat.data);
        expect(bundle).toBeDefined();
        expect(resultPayload).toBeDefined();
        expect(bundle.payload.runId).toBe(resultPayload.runId);
        expect(bundle.validation.isValid).toBe(true);

        const reconstructed = getRawPrismCloudPayload(sampleStat, sampleStat.data);
        expect(reconstructed).toBeDefined();
    });

    it('preserves forked_from in parser groupStagesIntoRuns and stageToEntry', () => {
        const runId = uuidv4();
        const forkedFromObj = { original_run_id: uuidv4(), original_run_label: "Original" };

        const groupedRuns = groupStagesIntoRuns([
            {
                runId,
                runLabel: "Forked Run",
                filename: "stage_0_report.yaml",
                model_name: "meta-llama/Llama-3.1-70B-Instruct",
                forked_from: forkedFromObj,
                github_author: { username: "author1" },
                scenario: { model: "meta-llama/Llama-3.1-70B-Instruct", hardware: "H100" },
                performance: { outputTokenRate: 100, e2eMean: 0.2, ttftMean: 0.05 },
                rawReport: {}
            }
        ]);
        expect(groupedRuns.length).toBe(1);
        expect(groupedRuns[0].forked_from).toEqual(forkedFromObj);

        const entry = stageToEntry(groupedRuns[0].stages[0]);
        expect(entry.forked_from).toEqual(forkedFromObj);
    });

    it('validates PrismResultContextSchema accepting forked flag', () => {
        const contextValidation = PrismResultContextSchema.safeParse({
            submission_state: { value: "submitted_pending_review" },
            github_user: { value: "octocat" },
            run_id: { value: uuidv4() },
            hardware_name: { value: "H100" },
            model_name: { value: "meta-llama/Llama-3.1-70B-Instruct" },
            run_label: { value: "Forked Run" },
            forked: { value: "true" }
        });
        expect(contextValidation.success).toBe(true);
    });
});
