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
import { normalizeHardware, parseLpgLifecycleMetrics, parseLpgRequestLog } from './dataParser.js';
import { parseReportV02, stageToEntry } from './benchmarkReportV02Parser.js';
import { normalizeHardware as normalizeGcsHardware, parseFromUri } from './gcsScanner.js';

describe('Overlapping accelerator names', () => {
    it.each(['L4', 'L40', 'L40S'])('preserves %s through benchmark import paths', (hardware) => {
        expect(normalizeHardware(`NVIDIA ${hardware}`)).toBe(hardware);
        expect(normalizeHardware(`nvidia-${hardware.toLowerCase()}`)).toBe(hardware);
        expect(normalizeGcsHardware(`NVIDIA ${hardware}`)).toBe(`NVIDIA ${hardware}`);

        const report = {
            version: '0.2',
            scenario: {
                stack: [{ standardized: {
                    role: 'aggregate',
                    model: { name: 'test-model' },
                    accelerator: { model: `NVIDIA ${hardware}`, count: 1 },
                } }],
                load: { standardized: { tool: 'vllm' } },
            },
            results: { request_performance: { aggregate: { throughput: {} } } },
        };
        const stage = parseReportV02(report, 'report.yaml');
        expect(stageToEntry(stage).hardware).toBe(hardware);

        const path = `benchmark/standalone/model/${hardware}-1/run/report.yaml`;
        expect(parseFromUri(path).hardware).toBe(`NVIDIA ${hardware}`);

        const lifecycle = { load_summary: {}, successes: { count: 0 } };
        expect(parseLpgLifecycleMetrics(lifecycle, `${hardware}/lifecycle_metrics.json`)[0].hardware).toBe(hardware);
        expect(parseLpgRequestLog([{ metrics: {} }], `${hardware}/request_log.json`)[0].hardware).toBe(hardware);
    });

    it.each(['L4', 'L40', 'L40S'])('preserves %s inferred from benchmark configuration', (hardware) => {
        const configurations = [
            { kustomize: { acceleratorBackend: `${hardware.toLowerCase()}-standalone` } },
            { standalone: { acceleratorType: { labelValue: `nvidia-${hardware.toLowerCase()}` } } },
            { prefill: { acceleratorType: { labelValue: `NVIDIA-${hardware}` } } },
        ];
        for (const config of configurations) {
            const stage = {
                scenario: { model: 'test-model', hardware: 'GPU' },
                performance: {},
                config,
            };
            expect(stageToEntry(stage).hardware).toBe(hardware);
        }
    });
});
