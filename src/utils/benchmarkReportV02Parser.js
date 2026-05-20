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

// Standalone parser for llm-d-benchmark Benchmark Report v0.2 YAML files.
//
// This module is intentionally separate from dataParser.js so it does not
// affect the existing llm-d Results Store or inference-perf integrations.
//
// Schema reference:
//   llm-d-benchmark/docs/analysis/benchmark_report/schema_v0_2.py

import yaml from 'js-yaml';
import { createEntry, normalizeModelName, normalizeHardware } from './dataParser';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const safeNum = (val) => {
    if (val === null || val === undefined) return null;
    const n = typeof val === 'number' ? val : parseFloat(val);
    return isNaN(n) ? null : n;
};

// v0.2 latency values are in seconds — convert to ms for display
const toMs = (val) => {
    const n = safeNum(val);
    return n !== null ? n * 1000 : null;
};

// Derive a stable run ID from a report document.
//
// run.eid and cfg_id are shared across all runs in the same experiment, so
// they cannot distinguish individual runs. run.uid is unique per report file
// and is the only reliable identity key for individual file uploads.
//
// Stage grouping (multiple files → one run) requires the directory name as
// context, which will be available once the directory-picker upload path is
// implemented.
const deriveRunId = (doc) => doc.run?.uid || crypto.randomUUID();

// Derive a human-readable label from scenario context so the user can tell
// runs apart without seeing raw UUIDs or uninformative filenames.
const deriveRunLabel = (doc, filename) => {
    if (doc.run?.description) return doc.run.description;

    // Build label from scenario: model · hardware · QPS · stage
    const stack = doc.scenario?.stack || [];
    const primary = (
        stack.find(c => c.standardized?.role === 'aggregate') ||
        stack.find(c => c.standardized?.role === 'decode') ||
        stack.find(c => c.standardized?.kind === 'inference_engine') ||
        stack[0]
    );
    const model = primary?.standardized?.model?.name;
    const hw = primary?.standardized?.accelerator?.model;
    const qps = doc.scenario?.load?.standardized?.rate_qps;
    const stage = doc.scenario?.load?.standardized?.stage;

    const parts = [];
    if (model) parts.push(model.split('/').pop());
    if (hw) parts.push(hw.replace(/-\d+GB.*/i, ''));
    if (qps != null) parts.push(`${qps} QPS`);
    if (stage != null) parts.push(`stage ${stage}`);
    if (parts.length > 0) return parts.join(' · ');

    // Last resort: filename stripped of the common prefix
    return filename
        .replace(/^benchmark_report_v0\.2,_/, '')
        .replace(/\.yaml$/, '');
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a single benchmark_report_v0.2 YAML file text.
 *
 * Returns a stage record or null if the content is not a valid v0.2 report.
 *
 * Stage record shape:
 * {
 *   runId: string,
 *   runLabel: string,
 *   filename: string,
 *   runUid: string | null,
 *   runEid: string | null,
 *   timestamp: string | null,
 *   stageIndex: number | null,
 *   scenario: {
 *     model: string,
 *     hardware: string,
 *     acceleratorCount: number | null,
 *     tp: number | null,
 *     role: string,
 *     harness: string,
 *     isl: number | null,
 *     osl: number | null,
 *     rateQps: number | null,
 *     concurrency: number | null,
 *   },
 *   performance: {
 *     outputTokenRate: number | null,   // tokens/s
 *     inputTokenRate: number | null,    // tokens/s
 *     requestRate: number | null,       // req/s
 *     ttftMean: number | null,          // ms
 *     ttftP99: number | null,           // ms
 *     tpotMean: number | null,          // ms/token
 *     itlMean: number | null,           // ms/token
 *     e2eMean: number | null,           // ms
 *     e2eP99: number | null,            // ms
 *     totalRequests: number | null,
 *     failures: number | null,
 *   },
 *   observability: {                    // null when not collected
 *     kvCacheUsage: number | null,      // %
 *     prefixCacheHitRate: number | null,// %
 *     eppKvUtilization: number | null,  // %
 *     eppQueueSize: number | null,      // count
 *     podStartupMeanS: number | null,   // s
 *   } | null,
 * }
 */
export function parseReportV02(yamlText, filename) {
    let doc;
    try {
        doc = yaml.load(yamlText);
    } catch (_) {
        return null;
    }
    if (!doc || doc.version !== '0.2') return null;

    // --- Scenario ---
    const stack = doc.scenario?.stack || [];
    const primaryComponent = (
        stack.find(c => c.standardized?.role === 'aggregate') ||
        stack.find(c => c.standardized?.role === 'decode') ||
        stack.find(c => c.standardized?.kind === 'inference_engine') ||
        stack[0] ||
        {}
    );
    const std = primaryComponent.standardized || {};
    const accel = std.accelerator || {};
    const parallelism = accel.parallelism || {};
    const load = doc.scenario?.load?.standardized || {};

    const scenario = {
        model: std.model?.name || doc.scenario?.load?.native?.config?.server?.model_name || 'Unknown',
        hardware: accel.model || 'Unknown',
        acceleratorCount: safeNum(accel.count),
        tp: safeNum(parallelism.tp),
        role: std.role || 'aggregate',
        harness: load.tool || 'unknown',
        isl: safeNum(load.input_seq_len?.value),
        osl: safeNum(load.output_seq_len?.value),
        rateQps: safeNum(load.rate_qps),
        concurrency: isFinite(load.concurrency) ? safeNum(load.concurrency) : null,
    };

    // --- Performance ---
    const agg = doc.results?.request_performance?.aggregate || {};
    const tput = agg.throughput || {};
    const lat = agg.latency || {};
    const reqs = agg.requests || {};

    const performance = {
        outputTokenRate: safeNum(tput.output_token_rate?.mean),
        inputTokenRate: safeNum(tput.input_token_rate?.mean),
        requestRate: safeNum(tput.request_rate?.mean),
        ttftMean: toMs(lat.time_to_first_token?.mean),
        ttftP99: toMs(lat.time_to_first_token?.p99),
        tpotMean: toMs(lat.time_per_output_token?.mean),
        itlMean: toMs(lat.inter_token_latency?.mean),
        e2eMean: toMs(lat.request_latency?.mean),
        e2eP99: toMs(lat.request_latency?.p99),
        totalRequests: safeNum(reqs.total),
        failures: safeNum(reqs.failures),
    };

    // --- Observability (optional) ---
    const obs = doc.results?.observability;
    let observability = null;
    if (obs) {
        const obsComponents = obs.components || [];
        const primaryObs = (
            obsComponents.find(c => c.component_label === primaryComponent.metadata?.label) ||
            obsComponents[0] ||
            {}
        );

        const kvCacheUsage     = safeNum(primaryObs.aggregate?.kv_cache_usage?.mean);
        const prefixCacheHit   = safeNum(obs.vllm_prefix_cache_hit_rate?.components?.[0]?.statistics?.mean);
        const eppKvUtilization = safeNum(obs.epp_pool_avg_kv_cache_utilization?.components?.[0]?.statistics?.mean);
        const eppQueueSize     = safeNum(obs.epp_pool_avg_queue_size?.components?.[0]?.statistics?.mean);
        const podStartupMeanS  = safeNum(obs.pod_startup_times?.aggregate?.mean);

        const hasAny = [kvCacheUsage, prefixCacheHit, eppKvUtilization, eppQueueSize, podStartupMeanS].some(v => v !== null);
        if (hasAny) {
            observability = { kvCacheUsage, prefixCacheHitRate: prefixCacheHit, eppKvUtilization, eppQueueSize, podStartupMeanS };
        }
    }

    return {
        runId: deriveRunId(doc),
        runLabel: deriveRunLabel(doc, filename),
        filename,
        runUid: doc.run?.uid || null,
        runEid: doc.run?.eid || null,
        timestamp: doc.run?.time?.start || null,
        stageIndex: safeNum(load.stage),
        scenario,
        performance,
        observability,
    };
}

/**
 * Merge an array of stage records into grouped runs.
 *
 * Returns:
 * [
 *   {
 *     runId: string,
 *     runLabel: string,
 *     stages: [stageRecord, ...],   // sorted by stageIndex ascending
 *   },
 *   ...
 * ]
 */
export function groupStagesIntoRuns(stageRecords) {
    const map = new Map();
    for (const record of stageRecords) {
        if (!map.has(record.runId)) {
            map.set(record.runId, {
                runId: record.runId,
                runLabel: record.runLabel,
                stages: [],
            });
        }
        map.get(record.runId).stages.push(record);
    }
    // Sort stages within each run
    for (const run of map.values()) {
        run.stages.sort((a, b) => {
            if (a.stageIndex === null) return 1;
            if (b.stageIndex === null) return -1;
            return a.stageIndex - b.stageIndex;
        });
    }
    return Array.from(map.values());
}

/**
 * Convert a parsed stage record into a Prism normalized entry suitable for
 * the main dashboard scatter chart. Uses the same createEntry schema as all
 * other data sources so filters, chart axes, and tooltips work automatically.
 *
 * The source key is `brv02:<runId>` so entries can be bulk-removed when the
 * user removes a run from the comparison panel.
 */
export function stageToEntry(stage) {
    const { scenario, performance, runId, runLabel, timestamp } = stage;

    const modelName  = normalizeModelName(scenario.model);
    const hardware   = normalizeHardware(scenario.hardware);
    const ts         = timestamp || new Date().toISOString();
    const throughput = performance.outputTokenRate || 0;
    const latency    = { mean: performance.e2eMean || 0, p50: 0, p99: performance.e2eP99 || 0 };
    const ttft       = { mean: performance.ttftMean || 0, p50: 0, p99: performance.ttftP99 || 0 };

    return createEntry({
        // Top-level fields read directly by Dashboard / filter logic
        model: modelName,
        model_name: modelName,
        hardware: hardware,
        precision: 'Unknown',
        backend: scenario.harness || 'Unknown',
        isl: scenario.isl || 0,
        osl: scenario.osl || 0,
        timestamp: ts,
        throughput,
        latency,
        ttft,

        source: `brv02:${runId}`,
        source_info: {
            type: 'benchmark_report_v02',
            origin: 'local-upload',
            file_identifier: stage.filename,
            experiment_id: stage.runEid,
        },

        // Also set under metadata for any code that reads metadata.*
        metadata: {
            model_name: modelName,
            backend: scenario.harness || 'Unknown',
            hardware: hardware,
            accelerator_type: hardware,
            accelerator_count: scenario.acceleratorCount || 1,
            precision: 'Unknown',
            timestamp: ts,
            tp: scenario.tp || 1,
            architecture: scenario.role || 'aggregate',
        },

        workload: {
            input_tokens: scenario.isl || 0,
            output_tokens: scenario.osl || 0,
            target_qps: scenario.rateQps || 0,
            concurrency: scenario.concurrency ?? null,
            stage: stage.stageIndex,
        },

        metrics: {
            throughput,
            request_rate: performance.requestRate || 0,
            latency,
            ttft,
            tpot: performance.tpotMean || 0,
            tpot_ms: performance.tpotMean || 0,
            ntpot: performance.tpotMean || 0,
            ntpot_ms: performance.tpotMean || 0,
            itl: performance.itlMean || 0,
            itl_ms: performance.itlMean || 0,
            error_count: performance.failures || 0,
        },

        _diagnostics: { msg: [], raw_snapshot: {} },
    });
}
