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

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { buildRunLabel, getEntryLabel, stripModelPrefix, stripExperimentIdSuffix, getCustomLabelRunId } from './runLabel.js';

const MODEL = 'qwen3-32b';

describe('run label', () => {
    it('a description that only restates the model does not repeat it', () => {
        assert.equal(buildRunLabel({ model: MODEL, description: 'Qwen/Qwen3-32B' }), MODEL);
        assert.equal(buildRunLabel({ model: MODEL, description: MODEL }), MODEL);
        assert.equal(buildRunLabel({ model: MODEL, description: 'Unknown' }), MODEL);
        assert.equal(buildRunLabel({ model: MODEL, description: '' }), MODEL);
    });

    // normalizeModelName strips bracketed segments, so testing "is this just the
    // model?" through it discarded the concurrency that distinguishes the runs.
    it('a legacy model-prefixed description keeps the part that distinguishes it', () => {
        assert.equal(buildRunLabel({ model: MODEL, description: 'Qwen/Qwen3-32B [conc32]' }), 'Qwen/Qwen3-32B [conc32]');
        assert.equal(buildRunLabel({ model: MODEL, description: 'Qwen/Qwen3-32B [conc64]' }), 'Qwen/Qwen3-32B [conc64]');
    });

    // useDashboardData appends the variant to model_name for some sources.
    it('a description restating the model keeps the case it was written in', () => {
        assert.equal(buildRunLabel({ model: MODEL, description: 'Qwen/Qwen3-32B [conc32]' }), 'Qwen/Qwen3-32B [conc32]');
        // Not applied when the description names a different model.
        assert.equal(buildRunLabel({ model: 'llama-3.1-70b', description: 'sched-none' }), 'llama-3.1-70b [sched-none]');
    });

    it('a model that already carries the variant is not paired with it twice', () => {
        assert.equal(buildRunLabel({ model: `${MODEL} [sched-none]`, description: 'sched-none' }), `${MODEL} [sched-none]`);
        assert.equal(buildRunLabel({ model: `${MODEL} [sched-none]`, description: 'conc32' }), `${MODEL} [sched-none] [conc32]`);
    });

    it('a custom label replaces the pair outright', () => {
        assert.equal(buildRunLabel({ model: MODEL, description: 'conc32', customLabel: 'My Run' }), 'My Run');
    });

    it('a description with no model to pair against stands alone', () => {
        assert.equal(buildRunLabel({ model: '', description: 'conc32' }), 'conc32');
    });

    it('a description that is not the model survives intact', () => {
        assert.equal(stripModelPrefix('sched-none', MODEL), 'sched-none');
        assert.equal(stripModelPrefix('2 Nodes (TP8)', MODEL), '2 Nodes (TP8)');
        assert.equal(stripModelPrefix('conc32', ''), 'conc32');
    });

    // normalizeModelName strips wrapped segments, so comparing a whole description
    // through it dropped exactly the treatment that distinguishes runs.
    it('wrapped segments are neither eaten nor double-wrapped', () => {
        assert.equal(buildRunLabel({ model: MODEL, description: 'Qwen/Qwen3-32B [tp8] [conc32]' }), 'Qwen/Qwen3-32B [tp8] [conc32]');
        assert.equal(buildRunLabel({ model: MODEL, description: '[conc32]' }), `${MODEL} [conc32]`);
        assert.equal(buildRunLabel({ model: MODEL, description: 'qwen3-32b (conc32)' }), `${MODEL} (conc32)`);
    });

    
    // Real PVC descriptions: the epoch+id tail is shared by every stage of a sweep.
    it('a generated experiment ID sheds its shared tail', () => {
        assert.equal(stripExperimentIdSuffix('inference-perf-ctx8k-1786461290-nf4b2a'), 'inference-perf-ctx8k');
        assert.equal(stripExperimentIdSuffix('inference-perf-ctx16k-1786462847-xatigg'), 'inference-perf-ctx16k');
        assert.equal(stripExperimentIdSuffix('inference-perf-1787137671-u6iozt'), 'inference-perf');
        // A trailing number that is not an experiment ID, and a tail a person chose.
        assert.equal(stripExperimentIdSuffix('prefix-cache-1610612736-bytes'), 'prefix-cache-1610612736-bytes');
        assert.equal(stripExperimentIdSuffix('ctx8k-1786461290-final'), 'ctx8k-1786461290-final');
        assert.equal(stripExperimentIdSuffix('sched-none'), 'sched-none');
    });

    it('one sweep yields one label per treatment', () => {
        const labels = [32, 64, 128].map(c =>
            buildRunLabel({ model: MODEL, description: `Qwen/Qwen3-32B [conc${c}]` }));
        assert.deepEqual(labels, [
            'Qwen/Qwen3-32B [conc32]',
            'Qwen/Qwen3-32B [conc64]',
            'Qwen/Qwen3-32B [conc128]',
        ]);
    });

    // A numeric YAML variant reaches these unvalidated.
    it('a non-string description or model does not throw', () => {
        assert.equal(buildRunLabel({ model: MODEL, description: 32 }), `${MODEL} [32]`);
        assert.equal(getEntryLabel({ model_name: 42, runLabel: 'conc32' }), '42 [conc32]');
    });

    it('a runId is read from whichever source can carry a custom label', () => {
        assert.equal(getCustomLabelRunId('brv02:local:exp-1'), 'local:exp-1');
        assert.equal(getCustomLabelRunId('results-store:abc'), 'abc');
        assert.equal(getCustomLabelRunId('gcs:foo'), null);
        assert.equal(
            getCustomLabelRunId({ source_info: { type: 'benchmark_report_v02' }, run_id: 'r9' }), 'r9');
    });
});
