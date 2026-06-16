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

// vllm cache rates are emitted as fractions for kv_cache_usage but as
// percentages for prefix_cache_hit_rate. Detect and normalize to 0-100.
const pct = (val) => {
    const v = safeNum(val);
    if (v === null) return null;
    return v <= 1 ? v * 100 : v;
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
const deriveRunId = (doc, filename) => {
    if (!filename || !filename.includes('/')) {
        return doc.run?.uid || crypto.randomUUID();
    }
    
    const parts = filename.split('/');
    parts.pop(); // Remove the file name itself
    return parts.join('/');
};

// Derive a human-readable label from scenario context so the user can tell
// runs apart without seeing raw UUIDs or uninformative filenames.
const deriveRunLabel = (doc, filename) => {
    if (doc.run?.description) return doc.run.description;

    if (filename && filename.includes('/')) {
        const pathParts = filename.split('/');
        pathParts.pop(); // Remove the file name itself
        return pathParts.join('/');
    }

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
    return (filename || "upload")
        .replace(/^benchmark_report_v0\.2[,_]*/i, "")
        .replace(/\.ya?ml$/i, "");
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
const extractComponents = (stack) => {
    const components = [];
    if (!Array.isArray(stack)) return components;
    for (const c of stack) {
        const label = String(c.metadata?.label || '');
        const tool = String(c.standardized?.tool || '');
        const kind = String(c.standardized?.kind || '');
        
        const isGateway = label.toLowerCase().includes('gateway') || tool.toLowerCase().includes('gateway') || kind.toLowerCase().includes('gateway');
        const isScheduler = label.toLowerCase().includes('scheduler') || tool.toLowerCase().includes('scheduler') || kind.toLowerCase().includes('scheduler');
        const isLws = label.toLowerCase().includes('lws') || label.toLowerCase().includes('leaderworkerset') || tool.toLowerCase().includes('lws') || tool.toLowerCase().includes('leaderworkerset');
        
        if (isGateway && !components.includes("Inference Gateway")) {
            components.push("Inference Gateway");
        }
        if (isScheduler && !components.includes("Inference Scheduler")) {
            components.push("Inference Scheduler");
        }
        if (isLws && !components.includes("LeaderWorkerSet")) {
            components.push("LeaderWorkerSet");
        }
    }
    return components;
};

export function parseReportV02(yamlText, filename) {
    let doc;
    if (typeof yamlText === 'object' && yamlText !== null) {
        doc = yamlText;
    } else {
        try {
            doc = yaml.load(yamlText);
        } catch {
            return null;
        }
    }
    if (!doc || doc.version !== '0.2') return null;

    // --- Scenario ---
    const stack = doc.scenario?.stack || [];
    const components = extractComponents(stack);
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
        concurrency: Number.isFinite(load.concurrency) ? safeNum(load.concurrency) : null,
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
        ttftP50: toMs(lat.time_to_first_token?.p50),
        ttftP99: toMs(lat.time_to_first_token?.p99),
        tpotMean: toMs(lat.time_per_output_token?.mean),
        tpotP50: toMs(lat.time_per_output_token?.p50),
        tpotP99: toMs(lat.time_per_output_token?.p99),
        itlMean: toMs(lat.inter_token_latency?.mean),
        itlP50: toMs(lat.inter_token_latency?.p50),
        itlP99: toMs(lat.inter_token_latency?.p99),
        e2eMean: toMs(lat.request_latency?.mean),
        e2eP50: toMs(lat.request_latency?.p50),
        e2eP99: toMs(lat.request_latency?.p99),
        totalRequests: safeNum(reqs.total),
        failures: safeNum(reqs.failures),
    };

    // --- Observability (optional) ---
    const obs = doc.results?.observability;
    let observability = null;
    if (obs) {
        // Prefer the aggregated stats (across components/pods) when available.
        const kvAgg     = obs.vllm_kv_cache_usage_perc?.aggregated || {};
        const prefixAgg = obs.vllm_prefix_cache_hit_rate?.aggregated || {};
        const eppKvAgg  = obs.epp_pool_avg_kv_cache_utilization?.aggregated || {};
        const eppQAgg   = obs.epp_pool_avg_queue_size?.aggregated || {};
        const eppRunAgg = obs.epp_pool_avg_running_requests?.aggregated || {};
        const numRunAgg = obs.vllm_num_requests_running?.aggregated || {};
        const numWaitAgg = obs.vllm_num_requests_waiting?.aggregated || {};
        const preemptAgg = obs.vllm_num_preemptions_total?.aggregated || {};
        const podStartup = obs.pod_startup_times?.aggregate || {};

        const obsValues = {
            kvCacheUsageMean:    pct(kvAgg.mean),
            kvCacheUsageP50:     pct(kvAgg.p50),
            kvCacheUsageP99:     pct(kvAgg.p99),
            prefixCacheHitMean:  pct(prefixAgg.mean),
            prefixCacheHitP50:   pct(prefixAgg.p50),
            prefixCacheHitP99:   pct(prefixAgg.p99),
            eppKvMean:           pct(eppKvAgg.mean),
            eppKvP50:            pct(eppKvAgg.p50),
            eppKvP99:            pct(eppKvAgg.p99),
            eppQueueMean:        safeNum(eppQAgg.mean),
            eppQueueP50:         safeNum(eppQAgg.p50),
            eppQueueP99:         safeNum(eppQAgg.p99),
            eppRunningMean:      safeNum(eppRunAgg.mean),
            numRequestsRunningMean: safeNum(numRunAgg.mean),
            numRequestsWaitingMean: safeNum(numWaitAgg.mean),
            numPreemptionsMean:  safeNum(preemptAgg.mean),
            podStartupMeanS:     safeNum(podStartup.mean),
            podStartupP50S:      safeNum(podStartup.p50),
            podStartupP99S:      safeNum(podStartup.p99),
        };

        const hasAny = Object.values(obsValues).some(v => v !== null);
        if (hasAny) observability = obsValues;
    }

    return {
        runId: deriveRunId(doc, filename),
        runLabel: deriveRunLabel(doc, filename),
        filename,
        runUid: doc.run?.uid || null,
        runEid: doc.run?.eid || null,
        runCid: doc.run?.cid || null,
        runPid: doc.run?.pid || null,
        timestamp: doc.run?.time?.start || null,
        stageIndex: safeNum(load.stage),
        scenario,
        performance,
        observability,
        components,
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
                runLabel: record.runLabel || record.runId || "Unknown Run",
                stages: [],
                run_metadata: record.run_metadata || null,
                config: record.config || null,
                summary: record.summary || null
            });
        }
        const runObj = map.get(record.runId);
        runObj.stages.push(record);
        
        if (!runObj.run_metadata && record.run_metadata) runObj.run_metadata = record.run_metadata;
        if (!runObj.config && record.config) runObj.config = record.config;
        if (!runObj.summary && record.summary) runObj.summary = record.summary;
    }
    
    // Sort stages within each run
    const runsList = Array.from(map.values());
    for (const run of runsList) {
        run.stages.sort((a, b) => {
            if (a.stageIndex === null) return 1;
            if (b.stageIndex === null) return -1;
            return a.stageIndex - b.stageIndex;
        });
    }

    // Since we're grouping stages by runId (which is the directory name)
    // we no longer want to automatically append numeric suffixes. 
    // They are unique inherently by their runId.
    for (const run of runsList) {
        let uniqueLabel = run.runLabel || run.runId || "Unknown Run";
        run.runLabel = uniqueLabel;
        
        // Propagate unique runLabel to all stage records of this run
        for (const stage of run.stages) {
            stage.runLabel = uniqueLabel;
        }
    }

    return runsList;
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
    const { scenario, performance, runId, timestamp, components, run_metadata, config } = stage;

    let modelName = scenario.model;
    if ((modelName === 'Unknown' || !modelName) && run_metadata) {
        modelName = run_metadata.model || modelName;
    }
    modelName = normalizeModelName(modelName);

    let hardware = scenario.hardware;
    if ((hardware === 'Unknown' || hardware === 'TPU' || hardware === 'GPU' || !hardware) && run_metadata) {
        if (run_metadata.accelerator) {
            hardware = run_metadata.accelerator;
        } else if (run_metadata.namespace) {
            const ns = String(run_metadata.namespace).toLowerCase();
            if (ns.includes('tpu')) {
                hardware = 'TPU';
            } else if (ns.includes('gpu')) {
                hardware = 'GPU';
            }
        }
    }
    
    // Fallback to config if needed
    if ((hardware === 'Unknown' || hardware === 'TPU' || hardware === 'GPU' || !hardware) && config) {
        const accBackend = config.kustomize?.acceleratorBackend;
        let inferredHw = null;
        if (accBackend) {
            const match = accBackend.match(/^(tpu-v\d+|h100|a100|l4)/i);
            if (match) {
                const accel = match[1].toLowerCase();
                if (accel.includes('v6')) inferredHw = 'TPU v6e';
                else if (accel.includes('v7')) inferredHw = 'TPU v7';
                else if (accel.includes('v5')) inferredHw = 'TPU v5e';
                else if (accel.includes('h100')) inferredHw = 'H100';
                else if (accel.includes('a100')) inferredHw = 'A100';
                else if (accel.includes('l4')) inferredHw = 'L4';
            }
        }
        if (!inferredHw) {
            const stdType = config.standalone?.acceleratorType?.labelValue || config.prefill?.acceleratorType?.labelValue;
            if (stdType) {
                const match = stdType.match(/(h100|a100|l4|tpu-v\d+)/i);
                if (match) {
                    const accel = match[1].toLowerCase();
                    if (accel.includes('v6')) inferredHw = 'TPU v6e';
                    else if (accel.includes('v7')) inferredHw = 'TPU v7';
                    else if (accel.includes('v5')) inferredHw = 'TPU v5e';
                    else if (accel.includes('h100')) inferredHw = 'H100';
                    else if (accel.includes('a100')) inferredHw = 'A100';
                    else if (accel.includes('l4')) inferredHw = 'L4';
                }
            }
        }
        if (inferredHw) {
            hardware = inferredHw;
        }
    }

    hardware = normalizeHardware(hardware);
    const ts         = timestamp || new Date().toISOString();
    const throughput = performance.outputTokenRate ?? null;
    const latency    = {
        mean: performance.e2eMean ?? null,
        p50: performance.e2eP50 ?? null,
        p99: performance.e2eP99 ?? null,
    };
    const ttft       = {
        mean: performance.ttftMean ?? null,
        p50: performance.ttftP50 ?? null,
        p99: performance.ttftP99 ?? null,
    };

    return createEntry({
        // Top-level fields read directly by Dashboard / filter logic
        run_id: stage.runId,
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
        components: components || [],

        source: `brv02:${runId}`,
        source_info: {
            type: 'benchmark_report_v02',
            origin: 'brv02:' + (stage.runLabel || runId || 'local-upload'),
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
            components: components || [],
        },

        workload: {
            input_tokens: scenario.isl || 0,
            output_tokens: scenario.osl || 0,
            target_qps: scenario.rateQps || 0,
            concurrency: scenario.concurrency ?? null,
            stage: stage.stageIndex,
        },

        metrics: {
            throughput: throughput ?? null,
            output_tput: throughput ?? null,
            input_tput: performance.inputTokenRate ?? null,
            request_rate: performance.requestRate ?? null,
            latency,
            ttft,
            tpot: performance.tpotMean ?? null,
            tpot_ms: performance.tpotMean ?? null,
            tpot_p50: performance.tpotP50 ?? null,
            tpot_p99: performance.tpotP99 ?? null,
            ntpot: performance.tpotMean ?? null,
            ntpot_ms: performance.tpotMean ?? null,
            itl: performance.itlMean ?? null,
            itl_ms: performance.itlMean ?? null,
            itl_p50: performance.itlP50 ?? null,
            itl_p99: performance.itlP99 ?? null,
            e2e_latency: performance.e2eMean ?? null,
            error_count: performance.failures ?? 0,
            // Observability metrics (only present for v0.2 reports that
            // include the observability section).
            observability: stage.observability || null,
        },

        _diagnostics: { msg: [], raw_snapshot: {} },
    });
}
