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

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReportV02, stageToEntry } from './benchmarkReportV02Parser.js';

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
    assert.ok(stage);
    return { stage, entry: stageToEntry(stage) };
};

test('BR v0.2 preserves and normalizes reported token rates', () => {
    const { stage, entry } = parseRates({
        input_token_rate: { mean: 80 },
        output_token_rate: { mean: 20 },
        total_token_rate: { mean: 105 },
    });

    assert.equal(stage.performance.totalTokenRate, 105);
    assert.equal(entry.metrics.input_tput, 80);
    assert.equal(entry.metrics.output_tput, 20);
    assert.equal(entry.metrics.total_tput, 105);
});

test('BR v0.2 derives total token rate when it is absent', () => {
    const { entry } = parseRates({
        input_token_rate: { mean: 80 },
        output_token_rate: { mean: 20 },
    });

    assert.equal(entry.metrics.total_tput, 100);
});

test('BR v0.2 derives input token rate from total and output rates', () => {
    const { entry } = parseRates({
        output_token_rate: { mean: 20 },
        total_token_rate: { mean: 100 },
    });

    assert.equal(entry.metrics.input_tput, 80);
});

test('BR v0.2 leaves rates null when fallback inputs are insufficient or invalid', () => {
    const missingTotal = parseRates({ output_token_rate: { mean: 20 } });
    assert.equal(missingTotal.entry.metrics.input_tput, null);
    assert.equal(missingTotal.entry.metrics.total_tput, null);

    const inconsistent = parseRates({
        output_token_rate: { mean: 20 },
        total_token_rate: { mean: 10 },
    });
    assert.equal(inconsistent.entry.metrics.input_tput, null);
    assert.equal(inconsistent.entry.metrics.total_tput, 10);
});

test('BR v0.2 token-rate normalization preserves zero and coerces numeric strings', () => {
    const { stage, entry } = parseRates({
        input_token_rate: { mean: '0' },
        output_token_rate: { mean: '20.5' },
    });

    assert.equal(stage.performance.inputTokenRate, 0);
    assert.equal(stage.performance.outputTokenRate, 20.5);
    assert.equal(entry.metrics.input_tput, 0);
    assert.equal(entry.metrics.total_tput, 20.5);
});
