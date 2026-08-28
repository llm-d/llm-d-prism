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

import { describe, it, afterEach } from 'vitest';
import { scanLocalBenchmarks } from './gcsScanner.js';
import { groupStagesIntoRuns, isFileBackedRun, isPristineScannedRun, stageToEntry } from './benchmarkReportV02Parser.js';
import assert from 'node:assert';

// The reconcile expression from useDashboardData's local scan step.
const reconcile = (prev, scanRuns) => [
    ...prev.filter(r => !isPristineScannedRun(r)),
    ...scanRuns.filter(s => !prev.some(r => r.runId === s.runId && !isPristineScannedRun(r))),
];

// A minimal v0.2 report. run.eid is shared across an experiment's stages;
// run.uid is per-report, which is why grouping keys on eid.
const report = (eid, uid, concurrency) => `
version: '0.2'
run:
${uid ? `  uid: ${uid}` : ''}
${eid ? `  eid: ${eid}` : ''}
  description: Qwen/Qwen3-32B [conc${concurrency}]
scenario:
  model:
    name: Qwen/Qwen3-32B
  load:
    name: guidellm
    type: concurrent
    concurrency: ${concurrency}
metrics:
  requests:
    output_tokens: {mean: 100}
    input_tokens: {mean: 200}
    total: {successful: 10, incomplete: 0, errored: 0}
  latency:
    request_latency: {mean: 1.0, p50: 1.0, p90: 1.5, p95: 1.6, p99: 1.9}
    time_to_first_token: {mean: 0.1, p50: 0.1, p90: 0.2, p95: 0.2, p99: 0.3}
    inter_token_latency: {mean: 0.01}
    time_per_output_token: {mean: 0.02}
  throughput:
    output_tokens_per_second: {mean: 50}
    total_tokens_per_second: {mean: 100}
    requests_per_second: {mean: 2}
`;

// Stubs /api/local/list plus one /api/local/file/* response per report.
const stubFetch = (files) => {
    globalThis.fetch = async (url) => {
        if (url === '/api/local/list') {
            return {
                ok: true,
                json: async () => ({
                    items: Object.keys(files).map(name => ({
                        name,
                        mediaLink: `/api/local/file/${encodeURIComponent(name)}`
                    }))
                })
            };
        }
        const name = decodeURIComponent(url.replace('/api/local/file/', ''));
        if (files[name] === undefined) return { ok: false };
        return { ok: true, text: async () => files[name] };
    };
};

describe('local benchmark scan', () => {
    const origFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = origFetch;
    });

    it('groups stages sharing run.eid into one run keyed local:<eid>', async () => {
        // 1. Stages sharing run.eid group into one run keyed local:<eid>. The producer
        // emits a fresh uuid4 per report, so keying on uid would split every sweep.
        stubFetch({
            'a_benchmark_report_v0.2.yaml': report('exp-1', 'report-a', 8),
            'b_benchmark_report_v0.2.yaml': report('exp-1', 'report-b', 16),
        });
        const sweep = await scanLocalBenchmarks();
        assert.strictEqual(sweep.ok, true);
        assert.strictEqual(sweep.runs.length, 1);
        assert.strictEqual(sweep.runs[0].runId, 'local:exp-1');
        assert.strictEqual(sweep.runs[0].stages.length, 2);
    });

    it('keeps distinct run.eid distinct even when load metadata is identical', async () => {
        // 2. Distinct run.eid stays distinct even when load metadata is identical, so a
        // producer that does not vary cfg_id per treatment cannot fuse two of them.
        stubFetch({
            'a_benchmark_report_v0.2.yaml': report('exp-1', 'report-a', 8),
            'b_benchmark_report_v0.2.yaml': report('exp-2', 'report-b', 8),
        });
        const treatments = await scanLocalBenchmarks();
        assert.strictEqual(treatments.runs.length, 2);
        assert.deepStrictEqual(treatments.runs.map(r => r.runId), ['local:exp-1', 'local:exp-2']);

        // 3. A successful scan reports the filenames it saw.
        assert.ok(treatments.filenames instanceof Set);
        assert.strictEqual(treatments.filenames.size, 2);
        assert.ok(treatments.filenames.has('a_benchmark_report_v0.2.yaml'));
    });

    it('distinguishes a failed scan from a clean scan that found nothing', async () => {
        // 4. A failed scan is distinguishable from a clean scan that found nothing.
        // Both used to return [], so reconciling would drop every local run on failure.
        globalThis.fetch = async () => { throw new Error('endpoint unreachable'); };
        const failed = await scanLocalBenchmarks();
        assert.strictEqual(failed.ok, false);
        assert.strictEqual(failed.filenames, null);
        assert.deepStrictEqual(failed.runs, []);

        globalThis.fetch = async (url) => url === '/api/local/list'
            ? { ok: true, json: async () => ({ items: [] }) }
            : { ok: false };
        const empty = await scanLocalBenchmarks();
        assert.strictEqual(empty.ok, true);
        assert.strictEqual(empty.runs.length, 0);
        assert.strictEqual(empty.filenames.size, 0);
    });

    it('preserves origin marker across regroups', async () => {
        // 5. The origin marker survives a regroup. Any upload or edit re-runs
        // groupStagesIntoRuns, whose closed field list used to drop the marker for good.
        stubFetch({
            'a_benchmark_report_v0.2.yaml': report('exp-1', 'report-a', 8),
            'b_benchmark_report_v0.2.yaml': report('exp-2', 'report-b', 16),
        });
        const scanned = await scanLocalBenchmarks();
        scanned.runs.forEach(r => assert.strictEqual(r.origin, 'local-scan'));

        const regrouped = groupStagesIntoRuns(scanned.runs.flatMap(r => r.stages));
        assert.strictEqual(regrouped.length, 2);
        regrouped.forEach(r => assert.strictEqual(r.origin, 'local-scan'));
    });

    it('keys isFileBackedRun on stage filenames', async () => {
        // 6. isFileBackedRun keys on stage filenames, the one identifier the scan
        // supplies that survives the wizard rebuilding a run from its raw reports.
        stubFetch({
            'a_benchmark_report_v0.2.yaml': report('exp-1', 'report-a', 8),
            'b_benchmark_report_v0.2.yaml': report('exp-2', 'report-b', 16),
        });
        const scanned = await scanLocalBenchmarks();
        const regrouped = groupStagesIntoRuns(scanned.runs.flatMap(r => r.stages));
        const [runA, runB] = regrouped;
        assert.strictEqual(isFileBackedRun(runA, scanned.filenames), true);

        assert.strictEqual(isFileBackedRun(runB, new Set(['a_benchmark_report_v0.2.yaml'])), false);

        const uploaded = groupStagesIntoRuns([
            { filename: 'uploaded.yaml', runId: 'upload-1', loadMetadata: {}, stageIndex: 0 }
        ]);
        assert.strictEqual(isFileBackedRun(uploaded[0], scanned.filenames), false);

        // With no successful scan there is no evidence either way.
        assert.strictEqual(isFileBackedRun(runA, null), false);
    });

    it('considers edited runs file-backed when original files match', async () => {
        // 7. A run that has been through the edit wizard is still file-backed. The
        // wizard prefixes the filename with `<runId>/`, and comparing the re-parsed name
        // verbatim called every edited local run deletable.
        stubFetch({
            'a_benchmark_report_v0.2.yaml': report('exp-1', 'report-a', 8),
        });
        const scanned = await scanLocalBenchmarks();
        const runA = scanned.runs[0];

        const edited = groupStagesIntoRuns(runA.stages.map(stage => ({
            ...stage,
            filename: `${runA.runId}/${stage.filename}`,
            origin: undefined,
        })));
        assert.strictEqual(isFileBackedRun(edited[0], scanned.filenames), true);

        assert.strictEqual(isFileBackedRun(edited[0], new Set(['other.yaml'])), false);

        // Only the run's own `<runId>/` prefix is stripped. Scanned names are relative
        // paths, so matching on basename would keep a deleted run alive off a sibling's
        // file and would call a same-named upload file-backed.
        const nested = groupStagesIntoRuns([
            { filename: 'run-b/benchmark_report_v0.2.yaml', runId: 'local:exp-b', loadMetadata: {}, stageIndex: 0 }
        ]);
        assert.strictEqual(isFileBackedRun(nested[0], new Set(['run-b/benchmark_report_v0.2.yaml'])), true);
        assert.strictEqual(isFileBackedRun(nested[0], new Set(['run-a/benchmark_report_v0.2.yaml'])), false);

        const collidingUpload = groupStagesIntoRuns([
            { filename: 'benchmark_report_v0.2.yaml', runId: 'upload-2', loadMetadata: {}, stageIndex: 0 }
        ]);
        assert.strictEqual(isFileBackedRun(collidingUpload[0], new Set(['run-a/benchmark_report_v0.2.yaml'])), false);
    });

    it('keeps uploads sharing load metadata with scanned runs separate', () => {
        // 8. An upload sharing load metadata with a scanned run must not join it. The
        // runId-less fallback would otherwise put it under a run the next scan rebuilds
        // from disk, and the reconcile would delete a file that never existed.
        const withUpload = groupStagesIntoRuns([
            { filename: 'a.yaml', runId: 'local:exp-1', origin: 'local-scan', loadMetadata: { cfg_id: 'A' }, stageIndex: 0 },
            { filename: 'upload.yaml', loadMetadata: { cfg_id: 'A' }, stageIndex: 0 },
        ]);
        assert.strictEqual(withUpload.length, 2);
        assert.strictEqual(reconcile(withUpload, []).length, 1);

        // Uploads still group with each other by load metadata.
        const twoUploads = groupStagesIntoRuns([
            { filename: 'u1.yaml', loadMetadata: { cfg_id: 'Z' }, stageIndex: 0 },
            { filename: 'u2.yaml', loadMetadata: { cfg_id: 'Z' }, stageIndex: 1 },
        ]);
        assert.strictEqual(twoUploads.length, 1);
        assert.strictEqual(twoUploads[0].stages.length, 2);
    });

    it('requires both marks for isPristineScannedRun', () => {
        // 9. Both marks are required, so a run that lost either one is never rebuilt
        // from disk. Only the scanner mints a local: runId; origin can spread.
        assert.strictEqual(isPristineScannedRun({ runId: 'local:e1', origin: 'local-scan' }), true);
        assert.strictEqual(isPristineScannedRun({ runId: 'upload-1', origin: 'local-scan' }), false);
        assert.strictEqual(isPristineScannedRun({ runId: 'local:e1', origin: null }), false);
        assert.strictEqual(isPristineScannedRun({}), false);
    });

    it('reconciles local scans properly against user edits and vanished files', () => {
        // 10. Reconcile: a vanished file drops its run, an edit survives, a rescan does
        // not duplicate, and a failed scan drops nothing.
        const pristine = groupStagesIntoRuns([
            { filename: 'gone.yaml', runId: 'local:exp-9', origin: 'local-scan', loadMetadata: { cfg_id: 'C' }, stageIndex: 0 },
        ]);
        assert.strictEqual(reconcile(pristine, []).length, 0);

        // An edit re-parses from raw reports, keeping the runId but losing origin.
        const editedRun = groupStagesIntoRuns([
            { filename: 'a.yaml', runId: 'local:exp-1', loadMetadata: { cfg_id: 'A' }, stageIndex: 0 },
        ]);
        assert.strictEqual(reconcile(editedRun, []).length, 1);
        assert.strictEqual(reconcile(pristine, pristine).length, 1);

        // A rescan re-offering the edited run's own id keeps the edit, not the file.
        const rescanOfEdited = groupStagesIntoRuns([
            { filename: 'a.yaml', runId: 'local:exp-1', origin: 'local-scan', loadMetadata: { cfg_id: 'A' }, stageIndex: 0 },
        ]);
        const afterRescan = reconcile(editedRun, rescanOfEdited);
        assert.strictEqual(afterRescan.length, 1);
        assert.strictEqual(afterRescan[0].origin, null);
    });

    it('back-fills origin to runs when first stage predates the marker', () => {
        // 11. The back-fill stamps a run whose first stage predates the marker. Without
        // it a multi-stage scanned run reconciles only when stage order cooperates.
        const backFilled = groupStagesIntoRuns([
            { filename: 'x.yaml', runId: 'local:exp-2', loadMetadata: { cfg_id: 'D' }, stageIndex: 0 },
            { filename: 'y.yaml', runId: 'local:exp-2', origin: 'local-scan', loadMetadata: { cfg_id: 'D' }, stageIndex: 1 },
        ]);
        assert.strictEqual(backFilled.length, 1);
        assert.strictEqual(backFilled[0].origin, 'local-scan');
    });

    it('ensures unkeyed scanned reports do not spread origin via load-metadata fallback', async () => {
        // 12. Scanned records carry origin only alongside a runId, so an eid-less report
        // cannot spread the marker through the load-metadata fallback.
        stubFetch({
            'keyed_benchmark_report_v0.2.yaml': report('exp-1', 'report-a', 8),
            'unkeyed_benchmark_report_v0.2.yaml': report(null, null, 8),
        });
        const mixed = await scanLocalBenchmarks();
        const unkeyed = mixed.runs.find(r => !String(r.runId).startsWith('local:'));
        assert.ok(unkeyed);
        assert.strictEqual(unkeyed.origin, null);
        assert.strictEqual(mixed.runs.filter(r => isPristineScannedRun(r)).length, 1);
    });

    it('backfills the variant from the run description but never configuration', () => {
        // 13. configuration is a node-topology string the compare chart colors by.
        const labelled = stageToEntry({ runLabel: 'Qwen/Qwen3-32B [conc32]', scenario: {}, performance: {} });
        assert.strictEqual(labelled.metadata.variant, 'Qwen/Qwen3-32B [conc32]');
        assert.strictEqual(labelled.metadata.configuration, '');

        const stated = stageToEntry({
            runLabel: 'Qwen/Qwen3-32B [conc32]',
            scenario: { configuration: '2 Nodes (TP8)' },
            performance: {},
        });
        assert.strictEqual(stated.metadata.configuration, '2 Nodes (TP8)');
    });
});
