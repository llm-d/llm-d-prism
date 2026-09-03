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

export function unitToSecondsFactor(units) {
    if (!units || typeof units !== 'string') return 1;
    const u = units.trim().toLowerCase().replace(/\s*\/\s*/g, '/');
    if (
        u === 's' ||
        u === 'sec' ||
        u === 'second' ||
        u === 'seconds' ||
        u === 's/token' ||
        u === 'sec/token' ||
        u === 'second/token' ||
        u === 'seconds/token'
    ) {
        return 1;
    }
    if (
        u === 'ms' ||
        u === 'msec' ||
        u === 'millisecond' ||
        u === 'milliseconds' ||
        u === 'ms/token' ||
        u === 'msec/token' ||
        u === 'millisecond/token' ||
        u === 'milliseconds/token'
    ) {
        return 1e-3;
    }
    if (
        u === 'us' ||
        u === 'µs' ||
        u === 'microsecond' ||
        u === 'microseconds' ||
        u === 'us/token' ||
        u === 'µs/token' ||
        u === 'microsecond/token' ||
        u === 'microseconds/token'
    ) {
        return 1e-6;
    }
    if (
        u === 'ns' ||
        u === 'nsec' ||
        u === 'nanosecond' ||
        u === 'nanoseconds' ||
        u === 'ns/token' ||
        u === 'nsec/token' ||
        u === 'nanosecond/token' ||
        u === 'nanoseconds/token'
    ) {
        return 1e-9;
    }
    return 1;
}

export function normalizeLatencyStatistics(statBlock, defaultToken = false) {
    if (!statBlock) return statBlock;
    if (typeof statBlock === 'number' && Number.isFinite(statBlock)) {
        return {
            mean: statBlock,
            units: defaultToken ? 's/token' : 's',
        };
    }
    if (typeof statBlock !== 'object') return statBlock;

    const units = typeof statBlock.units === 'string' ? statBlock.units : null;
    const factor = unitToSecondsFactor(units);
    const hasToken = defaultToken || Boolean(units && units.toLowerCase().includes('/token'));
    const targetUnits = hasToken ? 's/token' : 's';

    const normalized = { ...statBlock, units: targetUnits };
    for (const [key, val] of Object.entries(statBlock)) {
        if (key === 'units') continue;
        const num = safeNum(val);
        if (num !== null) {
            normalized[key] = num * factor;
        }
    }
    return normalized;
}

export function normalizeTimeSeriesLatency(tsData, defaultToken = false) {
    if (!tsData || typeof tsData !== 'object') return tsData;
    const units = typeof tsData.units === 'string' ? tsData.units : null;
    const factor = unitToSecondsFactor(units);
    const hasToken = defaultToken || Boolean(units && units.toLowerCase().includes('/token'));
    const targetUnits = hasToken ? 's/token' : 's';

    const normalized = { ...tsData, units: targetUnits };
    if (Array.isArray(tsData.series)) {
        normalized.series = tsData.series.map(pt => {
            if (!pt || typeof pt !== 'object') return pt;
            const newPt = { ...pt };
            for (const [k, v] of Object.entries(pt)) {
                if (k === 'ts') continue;
                const num = safeNum(v);
                if (num !== null) {
                    newPt[k] = num * factor;
                }
            }
            return newPt;
        });
    }
    return normalized;
}

export const isPerTokenMetric = (key) =>
    Boolean(key && (
        key === 'time_per_output_token' ||
        key === 'normalized_time_per_output_token' ||
        key === 'inter_token_latency' ||
        key.includes('/token') ||
        key.includes('per_output_token') ||
        key.includes('per_token')
    ));

export function hasMetricData(val) {
    if (typeof val === 'number') return Number.isFinite(val);
    if (!val || typeof val !== 'object') return false;
    for (const [k, v] of Object.entries(val)) {
        if (k === 'units') continue;
        if (typeof v === 'number' && Number.isFinite(v)) return true;
        if (typeof v === 'string' && v.trim() !== '' && !isNaN(parseFloat(v))) return true;
        if (Array.isArray(v) && v.length > 0) return true;
    }
    return false;
}

export function isMissingUnits(val) {
    if (!hasMetricData(val)) return false;
    if (typeof val === 'number') return true;
    return !val.units || typeof val.units !== 'string' || val.units.trim() === '';
}

export function detectMissingUnitWarnings(rawReport, filename = '') {
    if (!rawReport) return [];

    let doc = rawReport;
    if (typeof rawReport === 'string') {
        try {
            doc = yaml.load(rawReport);
        } catch {
            return [];
        }
    }
    if (!doc || typeof doc !== 'object') return [];

    const warnings = [];
    const prefix = filename ? `[${filename}] ` : '';

    const addWarning = (path, defaultUnit) => {
        warnings.push(
            `${prefix}Missing units for '${path}'; assumed ${defaultUnit}, but validation is needed since units are missing from original report file.`
        );
    };

    // 1. Aggregate latency metrics
    const aggLat = doc.results?.request_performance?.aggregate?.latency;
    if (aggLat && typeof aggLat === 'object') {
        for (const [key, val] of Object.entries(aggLat)) {
            if (isMissingUnits(val)) {
                const isToken = isPerTokenMetric(key);
                const defaultUnit = isToken ? "'s/token' (seconds per token)" : "'s' (seconds)";
                addWarning(`$.results.request_performance.aggregate.latency.${key}`, defaultUnit);
            }
        }
    }

    // 2. Aggregate throughput metrics
    const aggTput = doc.results?.request_performance?.aggregate?.throughput;
    if (aggTput && typeof aggTput === 'object') {
        for (const [key, val] of Object.entries(aggTput)) {
            if (isMissingUnits(val)) {
                const defaultUnit = key === 'request_rate' ? "'queries/s'" : "'tokens/s'";
                addWarning(`$.results.request_performance.aggregate.throughput.${key}`, defaultUnit);
            }
        }
    }

    // 3. Time series latency metrics
    const tsLat = doc.results?.request_performance?.time_series?.latency;
    if (tsLat && typeof tsLat === 'object') {
        for (const [key, val] of Object.entries(tsLat)) {
            if (isMissingUnits(val)) {
                const isToken = isPerTokenMetric(key);
                const defaultUnit = isToken ? "'s/token' (seconds per token)" : "'s' (seconds)";
                addWarning(`$.results.request_performance.time_series.latency.${key}`, defaultUnit);
            }
        }
    }

    // 4. Pod startup times observability
    const podStartup = doc.results?.observability?.pod_startup_times?.aggregate;
    if (isMissingUnits(podStartup)) {
        addWarning('$.results.observability.pod_startup_times.aggregate', "'s' (seconds)");
    }
    const podStartupByPod = doc.results?.observability?.pod_startup_times?.by_pod;
    if (podStartupByPod && typeof podStartupByPod === 'object') {
        for (const [podName, val] of Object.entries(podStartupByPod)) {
            if (isMissingUnits(val)) {
                addWarning(`$.results.observability.pod_startup_times.by_pod.${podName}`, "'s' (seconds)");
            }
        }
    }

    // 5. Session performance latency
    const sessionLatency = doc.results?.session_performance?.aggregate?.latency;
    if (sessionLatency && typeof sessionLatency === 'object') {
        for (const [key, val] of Object.entries(sessionLatency)) {
            if (isMissingUnits(val)) {
                const isToken = isPerTokenMetric(key);
                const defaultUnit = isToken ? "'s/token' (seconds per token)" : "'s' (seconds)";
                addWarning(`$.results.session_performance.aggregate.latency.${key}`, defaultUnit);
            }
        }
    }

    return warnings;
}

export function normalizeReportUnits(rawReport) {
    if (!rawReport || typeof rawReport !== 'object') return rawReport;

    const newReport = JSON.parse(JSON.stringify(rawReport));

    // 1. Aggregate latency metrics
    const latency = newReport.results?.request_performance?.aggregate?.latency;
    if (latency && typeof latency === 'object') {
        for (const [key, val] of Object.entries(latency)) {
            if (val !== null && val !== undefined) {
                const isPerToken = isPerTokenMetric(key);
                latency[key] = normalizeLatencyStatistics(val, isPerToken);
            }
        }
    }

    // 2. Time series latency metrics
    const tsLatency = newReport.results?.request_performance?.time_series?.latency;
    if (tsLatency && typeof tsLatency === 'object') {
        for (const [key, val] of Object.entries(tsLatency)) {
            if (val !== null && val !== undefined) {
                const isPerToken = isPerTokenMetric(key);
                tsLatency[key] = normalizeTimeSeriesLatency(val, isPerToken);
            }
        }
    }

    // 3. Pod startup times observability
    const podStartup = newReport.results?.observability?.pod_startup_times?.aggregate;
    if (podStartup && typeof podStartup === 'object') {
        newReport.results.observability.pod_startup_times.aggregate = normalizeLatencyStatistics(podStartup, false);
    }
    const podStartupByPod = newReport.results?.observability?.pod_startup_times?.by_pod;
    if (podStartupByPod && typeof podStartupByPod === 'object') {
        for (const [k, v] of Object.entries(podStartupByPod)) {
            if (v && typeof v === 'object') {
                podStartupByPod[k] = normalizeLatencyStatistics(v, false);
            }
        }
    }

    // 4. Session performance latency
    const sessionLatency = newReport.results?.session_performance?.aggregate?.latency;
    if (sessionLatency && typeof sessionLatency === 'object') {
        for (const [key, val] of Object.entries(sessionLatency)) {
            if (val !== null && val !== undefined) {
                const isPerToken = isPerTokenMetric(key);
                sessionLatency[key] = normalizeLatencyStatistics(val, isPerToken);
            }
        }
    }

    // 5. Aggregate throughput metrics
    const throughput = newReport.results?.request_performance?.aggregate?.throughput;
    if (throughput && typeof throughput === 'object') {
        for (const [key, val] of Object.entries(throughput)) {
            if (val && typeof val === 'object' && (!val.units || typeof val.units !== 'string' || val.units.trim() === '')) {
                val.units = key === 'request_rate' ? 'queries/s' : 'tokens/s';
            } else if (typeof val === 'number') {
                throughput[key] = {
                    mean: val,
                    units: key === 'request_rate' ? 'queries/s' : 'tokens/s',
                };
            }
        }
    }

    return newReport;
}

// Convert latency value to milliseconds, respecting declared units (defaults to seconds)
const toMs = (val, units) => {
    const n = safeNum(val);
    if (n === null) return null;
    const factor = unitToSecondsFactor(units);
    return n * (factor * 1000);
};

// vllm cache rates are emitted as fractions for kv_cache_usage but as
// percentages for prefix_cache_hit_rate. Detect and normalize to 0-100.
const pct = (val) => {
    const v = safeNum(val);
    if (v === null) return null;
    return v <= 1 ? v * 100 : v;
};

const deriveRunLabel = (doc) => {
    if (doc.run?.description) return doc.run.description;
    if (doc.run?.label) return doc.run.label;
    return "";
};

// ---------------------------------------------------------------------------
// Zod Schemas for Benchmark Report v0.2
// ---------------------------------------------------------------------------

const numericField = z.preprocess(safeNum, z.number().nullable());
const percentField = z.preprocess(pct, z.number().nullable());

const MetricValuesSchema = z.object({
    units: z.string().optional().nullable(),
    mean: numericField.optional(),
    p50: numericField.optional(),
    p99: numericField.optional(),
}).passthrough().optional().nullable();

const PercentValuesSchema = z.object({
    units: z.string().optional().nullable(),
    mean: percentField.optional(),
    p50: percentField.optional(),
    p99: percentField.optional(),
}).passthrough().optional().nullable();

const ThroughputMetricSchema = z.object({
    units: z.string().optional().nullable(),
    mean: numericField.optional(),
    p50: numericField.optional(),
    p99: numericField.optional(),
}).passthrough().optional().nullable();

const LatencyValuesSchema = z.preprocess((val) => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number' || typeof val === 'string') {
        const ms = toMs(val, null);
        return { mean: ms, p50: ms, p99: ms };
    }
    if (typeof val === 'object') {
        const units = typeof val.units === 'string' ? val.units : null;
        const res = { ...val };
        for (const [k, v] of Object.entries(val)) {
            if (k === 'units') continue;
            const num = safeNum(v);
            if (num !== null) {
                res[k] = toMs(v, units);
            }
        }
        return res;
    }
    return val;
}, z.object({
    units: z.string().optional().nullable(),
    mean: z.number().optional().nullable(),
    p50: z.number().optional().nullable(),
    p99: z.number().optional().nullable(),
}).passthrough().optional().nullable());

const ObservabilityMetricSchema = z.object({
    aggregated: MetricValuesSchema,
}).passthrough().optional().nullable();

const PercentObservabilityMetricSchema = z.object({
    aggregated: PercentValuesSchema,
}).passthrough().optional().nullable();

const PodStartupMetricSchema = z.object({
    aggregate: MetricValuesSchema,
    by_pod: z.record(z.string(), MetricValuesSchema).optional().nullable(),
}).passthrough().optional().nullable();

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
        }).passthrough().nullable().optional(),
        description: z.string().nullable().optional(),
    }).passthrough().nullable().optional(),
    scenario: z.object({
        stack: z.array(z.any()).nullable().optional(),
        load: z.object({
            standardized: z.object({
                stage: numericField.optional(),
                tool: z.string().nullable().optional(),
                input_seq_len: z.object({ value: numericField }).passthrough().nullable().optional(),
                output_seq_len: z.object({ value: numericField }).passthrough().nullable().optional(),
                rate_qps: numericField.optional(),
                concurrency: numericField.optional(),
            }).passthrough().nullable().optional(),
            native: z.object({
                config: z.object({
                    server: z.object({
                        model_name: z.string().nullable().optional(),
                    }).passthrough().nullable().optional(),
                }).passthrough().nullable().optional(),
            }).passthrough().nullable().optional(),
            metadata: z.record(z.string(), z.unknown()).nullable().optional(),
        }).passthrough().nullable().optional(),
    }).passthrough().nullable().optional(),
    results: z.object({
        request_performance: z.object({
            aggregate: z.object({
                throughput: z.object({
                    output_token_rate: ThroughputMetricSchema,
                    input_token_rate: ThroughputMetricSchema,
                    total_token_rate: ThroughputMetricSchema,
                    request_rate: ThroughputMetricSchema,
                }).passthrough().nullable().optional(),
                latency: z.object({
                    time_to_first_token: LatencyValuesSchema,
                    time_per_output_token: LatencyValuesSchema,
                    normalized_time_per_output_token: LatencyValuesSchema,
                    inter_token_latency: LatencyValuesSchema,
                    request_latency: LatencyValuesSchema,
                }).passthrough().nullable().optional(),
                requests: z.object({
                    total: numericField.optional(),
                    failures: numericField.optional(),
                }).passthrough().nullable().optional(),
            }).passthrough().nullable().optional(),
            time_series: z.object({
                latency: z.record(z.string(), z.unknown()).optional().nullable(),
            }).passthrough().optional().nullable(),
        }).passthrough().nullable().optional(),
        session_performance: z.object({
            aggregate: z.object({
                latency: z.record(z.string(), z.unknown()).optional().nullable(),
            }).passthrough().optional().nullable(),
        }).passthrough().optional().nullable(),
        observability: ObservabilitySchema,
    }).passthrough().nullable().optional(),
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
    const ver = String(doc.version || '').trim();
    if (ver !== '0.2' && !ver.startsWith('0.2.') && ver !== 'v0.2' && !ver.startsWith('v0.2.')) return null;

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

    const rawModel = std.model?.name || doc.scenario?.load?.native?.config?.server?.model_name;
    const modelVal = rawModel && rawModel !== 'Unknown' && rawModel !== 'Unknown Model' ? rawModel : '';
    const accelVal = accel.model && accel.model !== 'Unknown' && accel.model !== 'Unknown Hardware' ? accel.model : '';
    const harnessVal = load.tool && load.tool !== 'unknown' ? load.tool : '';

    const scenario = {
        model: modelVal,
        hardware: accelVal,
        acceleratorCount: accel.count ?? null,
        tp: parallelism.tp ?? null,
        role: std.role || 'aggregate',
        harness: harnessVal,
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
        totalTokenRate: tput.total_token_rate?.mean ?? null,
        requestRate: tput.request_rate?.mean ?? null,
        ttftMean: lat.time_to_first_token?.mean ?? null,
        ttftP50: lat.time_to_first_token?.p50 ?? null,
        ttftP99: lat.time_to_first_token?.p99 ?? null,
        tpotMean: lat.time_per_output_token?.mean ?? null,
        tpotP50: lat.time_per_output_token?.p50 ?? null,
        tpotP99: lat.time_per_output_token?.p99 ?? null,
        ntpotMean: lat.normalized_time_per_output_token?.mean ?? null,
        ntpotP50: lat.normalized_time_per_output_token?.p50 ?? null,
        ntpotP99: lat.normalized_time_per_output_token?.p99 ?? null,
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

    const warnings = detectMissingUnitWarnings(rawDoc);

    return {
        runLabel: deriveRunLabel(doc, filename),
        filename,
        runUid: doc.run?.uid || null,
        runEid: doc.run?.eid || null,
        runCid: doc.run?.cid || null,
        runPid: doc.run?.pid || null,
        timestamp: doc.run?.time?.start || null,
        stageIndex: doc.workload?.stage ?? load.stage ?? null,
        loadMetadata: doc.scenario?.load?.metadata || null,
        scenario,
        performance,
        observability,
        components,
        warnings,
        rawReport: rawDoc,
    };
}

export function getOriginalStageIndex(entry) {
    if (!entry) return 0;
    
    const raw = entry.raw_report || entry.rawReport || entry;
    if (raw?.workload?.stage !== undefined && raw?.workload?.stage !== null) {
        const num = Number(raw.workload.stage);
        if (!isNaN(num)) return num;
    }
    if (raw?.stageIndex !== undefined && raw?.stageIndex !== null) {
        const num = Number(raw.stageIndex);
        if (!isNaN(num)) return num;
    }
    const strToMatch = (entry.filename || entry.run_uid || '').split('/').pop();
    const match = strToMatch.match(/stage[_-]?(\d+)/i);
    if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num)) return num;
    }
    return 0;
}

/**
 * Compares two stage entries by original BRV02 stage number or filename.
 */
export function compareOriginalStageOrder(a, b) {
    const filenameA = a.filename || a.run_uid || '';
    const filenameB = b.filename || b.run_uid || '';
    const slashIdxA = filenameA.indexOf('/');
    const slashIdxB = filenameB.indexOf('/');
    const dirA = slashIdxA !== -1 ? filenameA.slice(0, slashIdxA) : '';
    const dirB = slashIdxB !== -1 ? filenameB.slice(0, slashIdxB) : '';
    if (dirA !== dirB) {
        const dirCmp = dirA.localeCompare(dirB, undefined, { numeric: true, sensitivity: 'base' });
        if (dirCmp !== 0) return dirCmp;
    }
    const idxA = getOriginalStageIndex(a);
    const idxB = getOriginalStageIndex(b);
    if (idxA !== idxB) {
        return idxA - idxB;
    }
    return filenameA.localeCompare(filenameB, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Compares two stage entries respecting prism_stage_index first, then original stage number or filename.
 */
export function compareStageOrder(a, b) {
    const idxA = a?.prism_stage_index !== undefined && a?.prism_stage_index !== null ? Number(a.prism_stage_index) : null;
    const idxB = b?.prism_stage_index !== undefined && b?.prism_stage_index !== null ? Number(b.prism_stage_index) : null;
    if (idxA !== null && idxB !== null && !isNaN(idxA) && !isNaN(idxB)) {
        return idxA - idxB;
    }
    return compareOriginalStageOrder(a, b);
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

        // Fallback: Find an existing run that has the same loadMetadata (only if runId is missing).
        // Scanned runs are excluded: a report on disk and an upload can share load
        // metadata, and fusing them would put the upload under a run the next scan
        // rebuilds from disk, destroying it.
        if (!targetRun && !record.runId) {
            targetRun = runsList.find(run => {
                if (isPristineScannedRun(run)) return false;
                const runMetaStr = canonicalStringify(run.stages[0]?.loadMetadata);
                return runMetaStr === recordMetaStr && runMetaStr !== '';
            });
        }

        if (!targetRun) {
            targetRun = {
                runId: record.runId || uuidv4(),
                runLabel: record.runLabel || "",
                stages: [],
                model_name: record.model_name || null,
                hardware: record.hardware || null,
                config: record.config || null,
                summary: record.summary || null,
                wellLitPath: record.wellLitPath || record.well_lit_path || null,
                well_lit_path: record.well_lit_path || record.wellLitPath || null,
                manifests: record.manifests || null,
                evidence: record.evidence || null,
                run_metadata: record.run_metadata || null,
                metadata: record.metadata || null,
                inference_tool: record.inference_tool || null,
                inference_tool_version: record.inference_tool_version || null,
                other_tools: record.other_tools || null,
                payload: record.payload || null,
                bundle: record.bundle || null,
                forked_from: record.forked_from || record.payload?.forked_from || null,
                github_author: record.github_author || record.payload?.github_author || null,
                targetDashboards: record.targetDashboards || [],
                origin: record.origin || null
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
        if (!targetRun.well_lit_path && (record.well_lit_path || record.wellLitPath)) targetRun.well_lit_path = record.well_lit_path || record.wellLitPath;
        if (!targetRun.manifests && record.manifests) targetRun.manifests = record.manifests;
        if (!targetRun.evidence && record.evidence) targetRun.evidence = record.evidence;
        if (!targetRun.run_metadata && record.run_metadata) targetRun.run_metadata = record.run_metadata;
        if (!targetRun.metadata && record.metadata) targetRun.metadata = record.metadata;
        if (!targetRun.inference_tool && record.inference_tool) targetRun.inference_tool = record.inference_tool;
        if (!targetRun.inference_tool_version && record.inference_tool_version) targetRun.inference_tool_version = record.inference_tool_version;
        if (!targetRun.other_tools && record.other_tools) targetRun.other_tools = record.other_tools;
        if (!targetRun.payload && record.payload) targetRun.payload = record.payload;
        if (!targetRun.bundle && record.bundle) targetRun.bundle = record.bundle;
        if (!targetRun.forked_from && (record.forked_from || record.payload?.forked_from)) targetRun.forked_from = record.forked_from || record.payload?.forked_from;
        if (!targetRun.github_author && (record.github_author || record.payload?.github_author)) targetRun.github_author = record.github_author || record.payload?.github_author;
        if (!targetRun.targetDashboards && record.targetDashboards) targetRun.targetDashboards = record.targetDashboards;
        if (!targetRun.origin && record.origin) targetRun.origin = record.origin;
    }
    
    // Sort stages within each run respecting prism_stage_index then original stage index
    for (const run of runsList) {
        run.stages.sort(compareStageOrder);
    }

    // Propagate the runLabel to all stages
    for (const run of runsList) {
        let uniqueLabel = run.runLabel || "";
        run.runLabel = uniqueLabel;
        
        for (const stage of run.stages) {
            stage.runLabel = uniqueLabel;
        }
    }

    return runsList;
}

/**
 * True when a run is still backed by a file in the scanned directory.
 *
 * Keyed on stage filenames because only they survive an edit's re-parse. A null
 * scannedFilenames means no scan succeeded, which is not a scan that found
 * nothing — neither caller may act on it.
 */
export function isFileBackedRun(run, scannedFilenames) {
    if (!scannedFilenames) return false;
    const prefix = run?.runId ? `${run.runId}/` : '';
    return (run?.stages || []).some(stage => {
        const filename = stage.filename || '';
        if (scannedFilenames.has(filename)) return true;
        return prefix && filename.startsWith(prefix)
            && scannedFilenames.has(filename.slice(prefix.length));
    });
}

/**
 * True for a run the scanner produced and nothing has since edited, i.e. one the
 * next scan may safely rebuild from disk.
 *
 * Requires both marks. Grouping by load metadata can fuse an upload into a
 * scanned run and spread origin to it, but never the local: runId.
 */
export function isPristineScannedRun(run) {
    return run?.origin === 'local-scan' && !!run?.runId?.startsWith('local:');
}

/**
 * Convert a parsed stage record into a Prism normalized entry suitable for
 * the main dashboard scatter chart.
 */
export function stageToEntry(stage) {
    const { scenario, performance, runId, timestamp, components, model_name, hardware: rootHardware, config } = stage;

    let modelName = scenario.model;
    if ((!modelName || modelName === 'Unknown') && model_name) {
        modelName = model_name;
    }
    modelName = normalizeModelName(modelName);

    let hardware = scenario.hardware;
    if ((!hardware || hardware === 'Unknown' || hardware === 'TPU' || hardware === 'GPU') && rootHardware?.hardware_name) {
        hardware = rootHardware.hardware_name;
    }
    
    // Fallback to config if needed
    if ((!hardware || hardware === 'Unknown' || hardware === 'TPU' || hardware === 'GPU') && config) {
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
    const ts = timestamp || new Date().toISOString();
    const outputTokenRate = performance.outputTokenRate ?? null;
    const reportedInputTokenRate = performance.inputTokenRate ?? null;
    const reportedTotalTokenRate = performance.totalTokenRate ?? null;
    const inputTokenRate = reportedInputTokenRate ?? (
        reportedTotalTokenRate !== null &&
        outputTokenRate !== null &&
        reportedTotalTokenRate >= outputTokenRate
            ? reportedTotalTokenRate - outputTokenRate
            : null
    );
    const totalTokenRate = reportedTotalTokenRate ?? (
        inputTokenRate !== null && outputTokenRate !== null
            ? inputTokenRate + outputTokenRate
            : null
    );
    const throughput = outputTokenRate;
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

    const harness = scenario.harness && scenario.harness !== 'unknown' ? scenario.harness : '';

    // normalizeModelName strips the bracketed part from model_name, so without this
    // the description never reaches a label.
    const variant = stage.runLabel || '';

    return createEntry({
        payload: stage.payload || null,
        forked_from: stage.forked_from || stage.payload?.forked_from || null,
        run_id: stage.runId,
        runLabel: stage.runLabel || '',
        github_author: stage.github_author,
        model: modelName,
        model_name: modelName,
        hardware: hardware,
        precision: '',
        backend: harness,
        isl: scenario.isl ?? null,
        osl: scenario.osl ?? null,
        timestamp: ts,
        throughput,
        latency,
        ttft,
        components: components || [],
        well_lit_path: stage.well_lit_path || stage.wellLitPath || null,
        wellLitPath: stage.well_lit_path || stage.wellLitPath || null,

        // Hoist key metrics to root for Chart compatibility
        time_per_output_token: performance.tpotMean ?? null,
        tpot: performance.tpotMean ?? null,
        ntpot: performance.ntpotMean ?? performance.tpotMean ?? null,
        itl: performance.itlMean ?? null,

        prism_stage_index: stage.prism_stage_index !== undefined && stage.prism_stage_index !== null
            ? stage.prism_stage_index
            : (stage.stageIndex !== undefined && stage.stageIndex !== null ? stage.stageIndex : null),
        stageIndex: stage.prism_stage_index !== undefined && stage.prism_stage_index !== null
            ? stage.prism_stage_index
            : (stage.stageIndex !== undefined && stage.stageIndex !== null ? stage.stageIndex : null),

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
            backend: harness,
            hardware: hardware,
            accelerator_type: hardware,
            accelerator_count: acceleratorCount,
            precision: '',
            timestamp: ts,
            tp: scenario.tp || 1,
            architecture: scenario.role || 'aggregate',
            components: components || [],
            stage_index: stage.prism_stage_index !== undefined && stage.prism_stage_index !== null
                ? stage.prism_stage_index
                : (stage.stageIndex !== undefined && stage.stageIndex !== null ? stage.stageIndex : null),
            stage: stage.prism_stage_index !== undefined && stage.prism_stage_index !== null
                ? stage.prism_stage_index
                : (stage.stageIndex !== undefined && stage.stageIndex !== null ? stage.stageIndex : null),
            variant,
            configuration: scenario.configuration || '',
        },

        workload: {
            input_tokens: scenario.isl ?? null,
            output_tokens: scenario.osl ?? null,
            target_qps: scenario.rateQps ?? null,
            concurrency: scenario.concurrency ?? null,
            stage: stage.prism_stage_index !== undefined && stage.prism_stage_index !== null
                ? stage.prism_stage_index
                : (stage.stageIndex !== undefined && stage.stageIndex !== null ? stage.stageIndex : null),
        },

        metrics: {
            throughput: throughput ?? null,
            output_tput: outputTokenRate,
            input_tput: inputTokenRate,
            total_tput: totalTokenRate,
            request_rate: performance.requestRate ?? null,
            latency,
            ttft,
            tpot: performance.tpotMean ?? null,
            tpot_ms: performance.tpotMean ?? null,
            tpot_p50: performance.tpotP50 ?? null,
            tpot_p99: performance.tpotP99 ?? null,
            ntpot: performance.ntpotMean ?? performance.tpotMean ?? null,
            ntpot_ms: performance.ntpotMean ?? performance.tpotMean ?? null,
            ntpot_p50: performance.ntpotP50 ?? performance.tpotP50 ?? null,
            ntpot_p99: performance.ntpotP99 ?? performance.tpotP99 ?? null,
            itl: performance.itlMean ?? null,
            itl_ms: performance.itlMean ?? null,
            itl_p50: performance.itlP50 ?? null,
            itl_p99: performance.itlP99 ?? null,
            e2e_latency: performance.e2eMean ?? null,
            error_count: performance.failures ?? 0,
            observability: stage.observability || null,
        },

        rawReport: stage.rawReport || null,
        _diagnostics: { msg: [...(stage.warnings || [])], raw_snapshot: {} },
    });
}

/**
 * Mutates/synchronizes metadata fields (model_name, hardware_name, runLabel) in a BRV02 raw_report.
 * Note: Stage numbers / uids are intentionally untouched.
 */
export function mutateRawReportMetadata(rawReport, { model_name, hardware_name, runLabel, inference_tool } = {}) {
    if (!rawReport || typeof rawReport !== 'object') return rawReport;

    const newReport = normalizeReportUnits(rawReport);

    // 1. Update run description if provided
    if (runLabel) {
        if (!newReport.run) newReport.run = {};
        newReport.run.description = runLabel;
    }

    // 2. Update model name in scenario.stack and load.native
    if (model_name) {
        if (newReport.scenario) {
            if (Array.isArray(newReport.scenario.stack)) {
                newReport.scenario.stack.forEach(comp => {
                    if (comp.standardized) {
                        if (!comp.standardized.model) comp.standardized.model = {};
                        comp.standardized.model.name = model_name;
                    }
                });
            }
            if (newReport.scenario.load?.native?.config?.server) {
                newReport.scenario.load.native.config.server.model_name = model_name;
            }
        }
    }

    // 3. Update hardware name in scenario.stack
    if (hardware_name) {
        if (newReport.scenario && Array.isArray(newReport.scenario.stack)) {
            newReport.scenario.stack.forEach(comp => {
                if (comp.standardized) {
                    if (!comp.standardized.accelerator) comp.standardized.accelerator = {};
                    comp.standardized.accelerator.model = hardware_name;
                }
            });
        }
    }

    // 4. Update inference_tool (serving stack) in scenario.stack
    if (inference_tool) {
        if (newReport.scenario && Array.isArray(newReport.scenario.stack)) {
            const primary = newReport.scenario.stack.find(comp => 
                comp.standardized?.kind === 'inference_engine' ||
                ['vllm', 'tgi', 'tensorrt', 'tensorrt_llm', 'sglang', 'ollama'].includes(String(comp.standardized?.tool || '').toLowerCase())
            ) || newReport.scenario.stack[0];
            if (primary) {
                if (!primary.standardized) primary.standardized = {};
                primary.standardized.tool = inference_tool;
            }
        }
    }

    return newReport;
}
