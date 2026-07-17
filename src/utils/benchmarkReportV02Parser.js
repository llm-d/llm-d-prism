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
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { createEntry, normalizeModelName, normalizeHardware } from './dataParser.js';

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
    const model = primary?.standardized?.model?.name || doc.scenario?.load?.native?.config?.server?.model_name;
    if (model) return model.split('/').pop();

    if (filename && filename.includes('/')) {
        const pathParts = filename.split('/');
        pathParts.pop(); // Remove the file name itself
        return pathParts.join('/');
    }

    // Last resort: filename stripped of the common prefix
    return (filename || "upload")
        .replace(/^benchmark_report_v0\.2[,_]*/i, "")
        .replace(/\.ya?ml$/i, "");
};

// ---------------------------------------------------------------------------
// Zod Schemas for Benchmark Report v0.2
// ---------------------------------------------------------------------------

const numericField = z.preprocess(safeNum, z.number().nullable());
const percentField = z.preprocess(pct, z.number().nullable());
const latencyField = z.preprocess(toMs, z.number().nullable());

const MetricValuesSchema = z.object({
    mean: numericField.optional(),
    p50: numericField.optional(),
    p99: numericField.optional(),
}).optional().nullable();

const PercentValuesSchema = z.object({
    mean: percentField.optional(),
    p50: percentField.optional(),
    p99: percentField.optional(),
}).optional().nullable();

const LatencyValuesSchema = z.object({
    mean: latencyField.optional(),
    p50: latencyField.optional(),
    p99: latencyField.optional(),
}).optional().nullable();

const ObservabilityMetricSchema = z.object({
    aggregated: MetricValuesSchema,
}).optional().nullable();

const PercentObservabilityMetricSchema = z.object({
    aggregated: PercentValuesSchema,
}).optional().nullable();

const PodStartupMetricSchema = z.object({
    aggregate: MetricValuesSchema,
}).optional().nullable();

const ObservabilitySchema = z.object({
    vllm_kv_cache_usage_perc: PercentObservabilityMetricSchema,
    vllm_prefix_cache_hit_rate: PercentObservabilityMetricSchema,
    epp_pool_avg_kv_cache_utilization: PercentObservabilityMetricSchema,
    epp_pool_avg_queue_size: ObservabilityMetricSchema,
    epp_pool_avg_running_requests: ObservabilityMetricSchema,
    vllm_num_requests_running: ObservabilityMetricSchema,
    vllm_num_requests_waiting: ObservabilityMetricSchema,
    vllm_num_preemptions_total: ObservabilityMetricSchema,
    pod_startup_times: PodStartupMetricSchema,
}).passthrough().optional().nullable();

const RawBRV02ReportSchema = z.object({
    version: z.string(),
    run: z.object({
        uid: z.string().nullable().optional(),
        eid: z.string().nullable().optional(),
        cid: z.string().nullable().optional(),
        pid: z.string().nullable().optional(),
        time: z.object({
            start: z.string().nullable().optional(),
        }).nullable().optional(),
        description: z.string().nullable().optional(),
    }).nullable().optional(),
    scenario: z.object({
        stack: z.array(z.any()).nullable().optional(),
        load: z.object({
            standardized: z.object({
                stage: numericField.optional(),
                tool: z.string().nullable().optional(),
                input_seq_len: z.object({ value: numericField }).nullable().optional(),
                output_seq_len: z.object({ value: numericField }).nullable().optional(),
                rate_qps: numericField.optional(),
                concurrency: numericField.optional(),
            }).nullable().optional(),
            native: z.object({
                config: z.object({
                    server: z.object({
                        model_name: z.string().nullable().optional(),
                    }).nullable().optional(),
                }).nullable().optional(),
            }).nullable().optional(),
            metadata: z.record(z.string(), z.unknown()).nullable().optional(),
        }).nullable().optional(),
    }).nullable().optional(),
    results: z.object({
        request_performance: z.object({
            aggregate: z.object({
                throughput: z.object({
                    output_token_rate: z.object({ mean: numericField }).nullable().optional(),
                    input_token_rate: z.object({ mean: numericField }).nullable().optional(),
                    request_rate: z.object({ mean: numericField }).nullable().optional(),
                }).nullable().optional(),
                latency: z.object({
                    time_to_first_token: LatencyValuesSchema,
                    time_per_output_token: LatencyValuesSchema,
                    inter_token_latency: LatencyValuesSchema,
                    request_latency: LatencyValuesSchema,
                }).nullable().optional(),
                requests: z.object({
                    total: numericField.optional(),
                    failures: numericField.optional(),
                }).nullable().optional(),
            }).nullable().optional(),
        }).nullable().optional(),
        observability: ObservabilitySchema,
    }).nullable().optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a single benchmark_report_v0.2 YAML file text.
 *
 * Returns a stage record or null if the content is not a valid v0.2 report.
 */
const extractComponents = (stack) => {
    const components = [];
    if (!Array.isArray(stack)) return components;
    for (const c of stack) {
        if (!c) continue;
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
    let rawDoc;
    if (typeof yamlText === 'object' && yamlText !== null) {
        rawDoc = yamlText;
    } else {
        try {
            rawDoc = yaml.load(yamlText);
        } catch {
            return null;
        }
    }
    if (!rawDoc) return null;

    const parseResult = RawBRV02ReportSchema.safeParse(rawDoc);
    if (!parseResult.success) return null;

    const doc = parseResult.data;
    if (doc.version !== '0.2') return null;

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
        acceleratorCount: accel.count ?? null,
        tp: parallelism.tp ?? null,
        role: std.role || 'aggregate',
        harness: load.tool || 'unknown',
        isl: load.input_seq_len?.value ?? null,
        osl: load.output_seq_len?.value ?? null,
        rateQps: load.rate_qps ?? null,
        concurrency: Number.isFinite(load.concurrency) ? load.concurrency : null,
    };

    // --- Performance ---
    const agg = doc.results?.request_performance?.aggregate || {};
    const tput = agg.throughput || {};
    const lat = agg.latency || {};
    const reqs = agg.requests || {};

    const performance = {
        outputTokenRate: tput.output_token_rate?.mean ?? null,
        inputTokenRate: tput.input_token_rate?.mean ?? null,
        requestRate: tput.request_rate?.mean ?? null,
        ttftMean: lat.time_to_first_token?.mean ?? null,
        ttftP50: lat.time_to_first_token?.p50 ?? null,
        ttftP99: lat.time_to_first_token?.p99 ?? null,
        tpotMean: lat.time_per_output_token?.mean ?? null,
        tpotP50: lat.time_per_output_token?.p50 ?? null,
        tpotP99: lat.time_per_output_token?.p99 ?? null,
        itlMean: lat.inter_token_latency?.mean ?? null,
        itlP50: lat.inter_token_latency?.p50 ?? null,
        itlP99: lat.inter_token_latency?.p99 ?? null,
        e2eMean: lat.request_latency?.mean ?? null,
        e2eP50: lat.request_latency?.p50 ?? null,
        e2eP99: lat.request_latency?.p99 ?? null,
        totalRequests: reqs.total ?? null,
        failures: reqs.failures ?? null,
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
            kvCacheUsageMean:    kvAgg.mean ?? null,
            kvCacheUsageP50:     kvAgg.p50 ?? null,
            kvCacheUsageP99:     kvAgg.p99 ?? null,
            prefixCacheHitMean:  prefixAgg.mean ?? null,
            prefixCacheHitP50:   prefixAgg.p50 ?? null,
            prefixCacheHitP99:   prefixAgg.p99 ?? null,
            eppKvMean:           eppKvAgg.mean ?? null,
            eppKvP50:            eppKvAgg.p50 ?? null,
            eppKvP99:            eppKvAgg.p99 ?? null,
            eppQueueMean:        eppQAgg.mean ?? null,
            eppQueueP50:         eppQAgg.p50 ?? null,
            eppQueueP99:         eppQAgg.p99 ?? null,
            eppRunningMean:      eppRunAgg.mean ?? null,
            numRequestsRunningMean: numRunAgg.mean ?? null,
            numRequestsWaitingMean: numWaitAgg.mean ?? null,
            numPreemptionsMean:  preemptAgg.mean ?? null,
            podStartupMeanS:     podStartup.mean ?? null,
            podStartupP50S:      podStartup.p50 ?? null,
            podStartupP99S:      podStartup.p99 ?? null,
        };

        const hasAny = Object.values(obsValues).some(v => v !== null);
        if (hasAny) observability = obsValues;
    }

    return {
        runLabel: deriveRunLabel(doc, filename),
        filename,
        runUid: doc.run?.uid || null,
        runEid: doc.run?.eid || null,
        runCid: doc.run?.cid || null,
        runPid: doc.run?.pid || null,
        timestamp: doc.run?.time?.start || null,
        stageIndex: load.stage ?? null,
        loadMetadata: doc.scenario?.load?.metadata || null,
        scenario,
        performance,
        observability,
        components,
        rawReport: doc,
    };
}

/**
 * Merge an array of stage records into grouped runs.
 */
export const canonicalStringify = (obj) => {
    if (obj === null || obj === undefined) return '';
    if (typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(canonicalStringify).join(',') + ']';
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',') + '}';
};

export function groupStagesIntoRuns(stageRecords) {
    const runsList = [];

    for (const record of stageRecords) {
        const recordMetaStr = canonicalStringify(record.loadMetadata);
        
        // Find an existing run that has the same runId
        let targetRun = null;
        if (record.runId) {
            targetRun = runsList.find(run => run.runId === record.runId);
        }

        // Fallback: Find an existing run that has the same loadMetadata (only if runId is missing)
        if (!targetRun && !record.runId) {
            targetRun = runsList.find(run => {
                const runMetaStr = canonicalStringify(run.stages[0]?.loadMetadata);
                return runMetaStr === recordMetaStr && runMetaStr !== '';
            });
        }

        if (!targetRun) {
            targetRun = {
                runId: record.runId || uuidv4(),
                runLabel: record.runLabel || record.runId || "Unknown Run",
                stages: [],
                model_name: record.model_name || null,
                hardware: record.hardware || null,
                config: record.config || null,
                summary: record.summary || null,
                wellLitPath: record.wellLitPath || record.well_lit_path || null,
                targetDashboards: record.targetDashboards || []
            };
            runsList.push(targetRun);
        }

        // Ensure the stage has the same runId as the group it joined
        record.runId = targetRun.runId;
        targetRun.stages.push(record);
        
        if (!targetRun.model_name && record.model_name) targetRun.model_name = record.model_name;
        if (!targetRun.hardware && record.hardware) targetRun.hardware = record.hardware;
        if (!targetRun.config && record.config) targetRun.config = record.config;
        if (!targetRun.summary && record.summary) targetRun.summary = record.summary;
        if (!targetRun.wellLitPath && (record.wellLitPath || record.well_lit_path)) targetRun.wellLitPath = record.wellLitPath || record.well_lit_path;
        if (!targetRun.targetDashboards && record.targetDashboards) targetRun.targetDashboards = record.targetDashboards;
    }
    
    // Sort stages within each run by stageIndex
    for (const run of runsList) {
        run.stages.sort((a, b) => {
            if (a.stageIndex === null) return 1;
            if (b.stageIndex === null) return -1;
            return a.stageIndex - b.stageIndex;
        });
    }

    // Propagate the runLabel to all stages
    for (const run of runsList) {
        let uniqueLabel = run.runLabel || run.runId || "Unknown Run";
        run.runLabel = uniqueLabel;
        
        for (const stage of run.stages) {
            stage.runLabel = uniqueLabel;
        }
    }

    return runsList;
}

/**
 * Convert a parsed stage record into a Prism normalized entry suitable for
 * the main dashboard scatter chart.
 */
export function stageToEntry(stage) {
    const { scenario, performance, runId, timestamp, components, model_name, hardware: rootHardware, config } = stage;

    let modelName = scenario.model;
    if ((modelName === 'Unknown' || !modelName) && model_name) {
        modelName = model_name;
    }
    modelName = normalizeModelName(modelName);

    let hardware = scenario.hardware;
    if ((hardware === 'Unknown' || hardware === 'TPU' || hardware === 'GPU' || !hardware) && rootHardware?.hardware_name) {
        hardware = rootHardware.hardware_name;
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

    let acceleratorCount = scenario.acceleratorCount || 1;
    if (rootHardware && typeof rootHardware.accelerator_count === 'number') {
        acceleratorCount = rootHardware.accelerator_count;
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
        run_id: stage.runId,
        runLabel: stage.runLabel,
        github_author: stage.github_author,
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
        well_lit_path: stage.well_lit_path || stage.wellLitPath || null,
        wellLitPath: stage.well_lit_path || stage.wellLitPath || null,

        source: `brv02:${runId}`,
        source_info: {
            type: 'benchmark_report_v02',
            origin: 'brv02:' + (stage.runLabel || runId || 'local-upload'),
            file_identifier: stage.filename,
            experiment_id: stage.runEid,
            submission_state: stage.submission_state,
            submitted_at: stage.submitted_at,
            approved_at: stage.approved_at,
        },

        metadata: {
            model_name: modelName,
            backend: scenario.harness || 'Unknown',
            hardware: hardware,
            accelerator_type: hardware,
            accelerator_count: acceleratorCount,
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
            observability: stage.observability || null,
        },

        rawReport: stage.rawReport || null,
        _diagnostics: { msg: [], raw_snapshot: {} },
    });
}
