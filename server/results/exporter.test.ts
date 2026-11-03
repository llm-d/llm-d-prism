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
import yaml from 'js-yaml';
import {
    syncPayloadMetadataToRawReport,
    serializeRawReportToYaml,
    createRunZipBuffer,
} from './exporter.ts';
import { PrismResultPayload } from './api.ts';

interface ParsedExportReport {
    scenario: {
        stack: Array<{
            standardized: {
                accelerator: {
                    model: string;
                    count: number;
                };
            };
        }>;
    };
}

describe('server exporter syncPayloadMetadataToRawReport', () => {
    it('exports a .v1.json payload where hardware: { hardware_name: "TPU v7x", accelerator_count: 4 } and raw_report has no accelerator.count, producing YAML with accelerator.count: 4 and accelerator.model: "TPU v7x"', () => {
        const payload: PrismResultPayload = {
            runId: '11111111-1111-4111-8111-111111111111',
            runLabel: 'Run TPU v7x Explicit Count',
            model_name: 'qwen3-32b',
            format: 'brv02',
            hardware: { hardware_name: 'TPU v7x', accelerator_count: 4 },
            entries: [{
                run_id: '11111111-1111-4111-8111-111111111112',
                filename: 'stage_0.yaml',
                raw_report: {
                    version: '0.2',
                    scenario: {
                        stack: [{
                            standardized: {
                                role: 'aggregate',
                                model: { name: 'qwen3-32b' },
                                accelerator: { model: 'Unknown' },
                            },
                        }],
                    },
                },
            }],
        };

        const synced = syncPayloadMetadataToRawReport(payload.entries[0].raw_report, payload);
        const yamlStr = serializeRawReportToYaml(synced);
        const parsedBack = yaml.load(yamlStr) as ParsedExportReport;

        expect(parsedBack.scenario.stack[0].standardized.accelerator.model).toBe('TPU v7x');
        expect(parsedBack.scenario.stack[0].standardized.accelerator.count).toBe(4);
    });

    it('exports a payload where hardware: { hardware_name: "TPU v7x" } (no accelerator_count) and raw_report has accelerator: { model: "tpu7x-2x2x1" }, preserving/setting accelerator.count: 4 in exported YAML', () => {
        const payload = {
            runId: '22222222-2222-4222-8222-222222222222',
            runLabel: 'Run TPU v7x Topology Count',
            model_name: 'qwen3-32b',
            format: 'brv02' as const,
            hardware: { hardware_name: 'TPU v7x' },
            entries: [{
                run_id: '22222222-2222-4222-8222-222222222223',
                filename: 'stage_0.yaml',
                raw_report: {
                    version: '0.2',
                    scenario: {
                        stack: [{
                            standardized: {
                                role: 'aggregate',
                                model: { name: 'qwen3-32b' },
                                accelerator: { model: 'tpu7x-2x2x1' },
                            },
                        }],
                    },
                },
            }],
        } as unknown as PrismResultPayload;

        const synced = syncPayloadMetadataToRawReport(payload.entries[0].raw_report, payload);
        const yamlStr = serializeRawReportToYaml(synced);
        const parsedBack = yaml.load(yamlStr) as ParsedExportReport;

        expect(parsedBack.scenario.stack[0].standardized.accelerator.model).toBe('TPU v7x');
        expect(parsedBack.scenario.stack[0].standardized.accelerator.count).toBe(4);
    });

    it('createRunZipBuffer syncs payload metadata into constituent entries', () => {
        const payload: PrismResultPayload = {
            runId: '33333333-3333-4333-8333-333333333333',
            runLabel: 'Run TPU Zip',
            model_name: 'qwen3-32b',
            format: 'brv02',
            hardware: { hardware_name: 'TPU v7x', accelerator_count: 4 },
            entries: [{
                run_id: '33333333-3333-4333-8333-333333333334',
                filename: 'stage_0.yaml',
                prism_stage_index: 0,
                raw_report: {
                    version: '0.2',
                    scenario: {
                        stack: [{
                            standardized: {
                                role: 'aggregate',
                                model: { name: 'qwen3-32b' },
                                accelerator: { model: 'Unknown' },
                            },
                        }],
                    },
                },
            }],
        };

        const { buffer, filename } = createRunZipBuffer(payload);
        expect(filename).toContain('.zip');
        expect(buffer.length).toBeGreaterThan(0);
    });
});
