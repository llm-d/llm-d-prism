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

// Data Normalization & Parsing Logic
// ----------------------------------------------------------------------------
// This module converts disparate benchmark formats (GIQ API, Log Files)
// into a single "NormalizedBenchmarkEntry" schema for the visualization layer.

/**
 * Normalizes raw input data into a consistent internal schema.
 * 
 * Target Schema:
 * {
 *   id: string,
 *   source: { type, origin, file_identifier, raw_url },
 *   metadata: { model_name, backend, hardware, precision, timestamp },
 *   workload: { input_tokens, output_tokens, target_qps },
 *   metrics: { throughput, request_rate, latency: { mean, p50, p99 }, ttft: { mean, p50 }, error_count },
 *   _diagnostics: { msg: [], raw_snapshot: {} }
 * }
 */

export const createEntry = (base) => ({
    id: crypto.randomUUID(),
    source: 'unknown',
    source_info: {
        type: 'unknown',
        origin: 'unknown',
        file_identifier: 'unknown',
        raw_url: '#'
    },
    metadata: {
        model_name: 'Unknown',
        backend: 'Unknown',
        hardware: 'Unknown',
        machine_type: 'Unknown',
        accelerator_count: 1,
        accelerator_type: 'Unknown',
        precision: 'Unknown',
        timestamp: new Date().toISOString()
    },
    workload: {
        input_tokens: 0,
        output_tokens: 0,
        target_qps: 0
    },
    metrics: {
        throughput: 0,
        request_rate: 0,
        latency: { mean: 0, p50: 0, p99: 0 },
        ttft: { mean: 0, p50: 0 },
        error_count: 0,
        cost: {
            spot: 0,
            on_demand: 0,
            cud_1y: 0,
            cud_3y: 0,
            source: 'none' // 'explicit' or 'derived'
        }
    },
    _diagnostics: {
        msg: [],
        raw_snapshot: {}
    },
    ...base
});

// Helper for safe number parsing
const parseNum = (val, label, diagnostics) => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) return parsed;
    }
    if (diagnostics) diagnostics.push(`Missing or invalid value for ${label}: ${val}`);
    return null;
};

// Helper for normalizing model names
// e.g. "openai/gpt-oss-120b" -> "gpt-oss-120b"
export const normalizeModelName = (name) => {
    if (!name) return 'unknown';

    // 1. If it's a path or org prefixed, take the last segment
    const parts = name.split('/');
    let clean = parts[parts.length - 1];

    // 2. Aggressively strip metadata in parentheses (...) or brackets [...]
    // Example: "llama-3-70b (vllm, FP8, H100)" -> "llama-3-70b"
    // Example: "qwen3-0.6b [kv]" -> "qwen3-0.6b"
    clean = clean.replace(/\s*\(.*?\)/g, '').replace(/\s*\[.*?\]/g, '').trim();

    // 3. Normalize precision suffixes (e.g. -bf16) that cause duplicates
    clean = clean.replace(/-(?:bf16|fp16|int8|fp8|fp4)$/i, '');

    return clean.toLowerCase();
};

export const normalizeHardware = (hw) => {
    if (!hw) return 'Unknown';
    let s = String(hw).toLowerCase();

    // Specific Mappings (Priority)
    if (s.includes('gb200')) return 'GB200';
    if (s.includes('b200')) return 'B200';
    if (s.includes('h200')) return 'H200';
    if (s.includes('h100')) return 'H100';
    if (s.includes('a100')) return 'A100';
    if (s.includes('l4')) return 'L4';
    if (s.includes('t4')) return 'T4';

    if (s.includes('mi300x')) return 'MI300X';
    if (s.includes('mi325x')) return 'MI325X';
    if (s.includes('mi355x')) return 'MI355X';

    // Generic Strip "nvidia-" prefix
    if (s.startsWith('nvidia-')) {
        s = s.replace('nvidia-', '');
    }

    // Rename TPU suffixes
    s = s.replace('-slice', '').replace('-podslice', '');

    // Return uppercased remaining string (e.g. "b200" -> "B200")
    if (s !== 'unknown') {
        return s.toUpperCase();
    }

    return 'Unknown';
};

export const normalizeServingStack = (ss) => {
    if (!ss) return 'Unknown';
    const s = String(ss).toLowerCase();
    if (s.includes('llm-d')) return 'llm-d';
    return ss;
};


// ============================================================================
// GIQ API Parser
// ============================================================================

export function parseGiqData(json, projectName) {
    const rawProfiles = json.profile || json.benchmarkingData;
    if (!rawProfiles || !Array.isArray(rawProfiles)) return [];

    const entries = [];

    rawProfiles.forEach(p => {
        const profileEntries = parseGiqProfileEntry(p, projectName);
        entries.push(...profileEntries);
    });

    return entries;
}

// ============================================================================
// GIQ Profile Entry Parser (Shared)
// ============================================================================
/**
 * Parses a single GIQ Profile object (containing performanceStats).
 * Returns an array of normalized entries (usually one per profile, but potentially more).
 */
export function parseGiqProfileEntry(p, projectName = 'unknown') {
    const diags = [];
    const entries = [];

    // 1. Extract Model Information
    const rawModelServer = (p.modelServerInfo?.modelServer) ||
        (p.modelSettings?.backend) ||
        (p.modelSettings?.model_server) ||
        (p.backend) ||
        (p.inference_server) ||
        'Unknown';

    let modelServer = rawModelServer;
    const lowerServer = String(rawModelServer).toLowerCase();
    if (lowerServer.includes('sglang')) modelServer = 'SGLang';
    else if (lowerServer.includes('vllm')) modelServer = 'vllm';
    else if (lowerServer.includes('trt') || lowerServer.includes('tensorrt')) modelServer = 'TensorRT-LLM';
    else if (lowerServer.includes('tgi')) modelServer = 'TGI';
    else if (lowerServer.includes('sax')) modelServer = 'Sax';
    else if (lowerServer.includes('jetstream')) modelServer = 'JetStream';

    const rawModelName = (p.modelServerInfo?.model) ||
        (p.modelSettings?.model) ||
        (p.model) ||
        (p.modelName) ||
        (p.model_name) ||
        'Unknown Model';

    const modelInfo = {
        modelServer: modelServer,
        model: rawModelName
    };
    const modelName = normalizeModelName(modelInfo.model);

    // 2. Resolve Performance Stats List
    let perfList = p.performanceStats || [];
    if (!Array.isArray(perfList)) perfList = [perfList];

    // Dynamic Discovery: Check if there's a larger results list
    Object.keys(p).forEach(key => {
        if (key !== 'performanceStats' && Array.isArray(p[key]) && p[key].length > perfList.length) {
            const sample = p[key][0];
            if (sample && typeof sample === 'object' && (sample.performanceMetrics || sample.outputTokensPerSecond || sample.metrics)) {
                perfList = p[key];
            }
        }
    });

    // Ensure we always generate at least a fallback entry for visibility if details timed out
    if (perfList.length === 0) {
        perfList.push({});
    }

    // 3. Cost Derivation Helper
    const getDollar = (valObj) => {
        if (!valObj) return 0;
        const units = valObj.units ? Number(valObj.units) : 0;
        const nanos = valObj.nanos ? Number(valObj.nanos) : 0;
        return Number((units + (nanos / 1e9)).toFixed(4));
    };

    const extractCosts = (source) => {
        if (!source || !source.cost || !Array.isArray(source.cost)) return null;

        const extracted = { spot: 0, on_demand: 0, cud_1y: 0, cud_3y: 0, explicit_input: 0, explicit_output: 0 };
        source.cost.forEach(c => {
            const model = (c.pricingModel || '').toLowerCase();
            let valOut = getDollar(c.costPerMillionOutputTokens) || getDollar(c.costPerMillionTokens) || getDollar(c.totalCost);
            let valIn = getDollar(c.costPerMillionInputTokens);

            if (model.includes('spot') || model.includes('preemptible')) extracted.spot = valOut;
            else if (model.includes('demand') || model.includes('standard')) {
                extracted.on_demand = valOut;
                if (valIn) extracted.explicit_input = valIn;
                if (valOut) extracted.explicit_output = valOut;
            }
            else if (model.includes('1y') || model.includes('1-y')) extracted.cud_1y = valOut;
            else if (model.includes('3y') || model.includes('3-y')) extracted.cud_3y = valOut;

            // Fallback for explicitly capturing costs if on-demand block missed it
            if (valIn && !extracted.explicit_input) extracted.explicit_input = valIn;
            if (valOut && !extracted.explicit_output) extracted.explicit_output = valOut;
        });
        return extracted;
    };

    // Calculate Average Cost Factors (K) for derivation
    const costFactors = { spot: [], on_demand: [], cud_1y: [], cud_3y: [] };
    const addK = (costs, tput) => {
        if (!costs || tput <= 0) return;
        if (costs.spot > 0) costFactors.spot.push(costs.spot * tput);
        if (costs.on_demand > 0) costFactors.on_demand.push(costs.on_demand * tput);
        if (costs.cud_1y > 0) costFactors.cud_1y.push(costs.cud_1y * tput);
        if (costs.cud_3y > 0) costFactors.cud_3y.push(costs.cud_3y * tput);
    };

    perfList.forEach(stat => {
        const perf = stat.performanceMetrics || stat;
        const tput = parseNum(perf.outputTokensPerSecond) || parseNum(perf.outputTokenThroughputTokensPerSecond);
        addK(extractCosts(stat), tput);
    });

    const K = {};
    Object.keys(costFactors).forEach(m => {
        if (costFactors[m].length > 0) K[m] = costFactors[m].reduce((a, b) => a + b, 0) / costFactors[m].length;
    });

    // 4. Transform Stats to Entries
    perfList.forEach(stat => {
        const perf = stat.performanceMetrics || stat;
        const resources = stat.resources || p.resourcesUsed;

        // Metrics
        const outputTput = parseNum(perf.outputTokensPerSecond) || parseNum(perf.outputTokenThroughputTokensPerSecond) || parseNum(perf.throughputTokensPerSecond);
        const inputTput = parseNum(perf.inputTokensPerSecond);
        const totalTput = parseNum(perf.totalTokensPerSecond);
        const reqRate = parseNum(perf.queriesPerSecond) || parseNum(perf.requestThroughput);
        const isl = parseNum(p.workloadSpec?.averageInputLength);
        const osl = parseNum(p.workloadSpec?.averageOutputLength);
        const ntpot = parseNum(perf.ntpotMilliseconds);
        const rawTtft = parseNum(perf.ttftMilliseconds) || parseNum(perf.meanTimeToFirstTokenMilliseconds) || parseNum(perf.timeToFirstTokenMilliseconds);

        let latMean = (ntpot > 0 && osl > 0) ? (ntpot * osl) : (parseNum(perf.meanLatencyMilliseconds) || (perf.latency?.mean) || null);
        const tpot = parseNum(perf.meanTimePerOutputTokenMilliseconds) || parseNum(perf.interTokenLatency) || ((osl > 0 && latMean !== null) ? Math.max(0, latMean - (rawTtft || 0)) / osl : null);

        // Hardware
        let hardware = normalizeHardware(p.acceleratorType || resources?.acceleratorType || 'Unknown');
        let acceleratorCount = p.resourcesUsed?.acceleratorCount || resources?.acceleratorCount || 1;
        const tpOverride = parseNum(p.modelSettings?.tp) || parseNum(perf.tensorParallelism);
        if (tpOverride > 1) acceleratorCount = tpOverride;
        const machineType = p.resourcesUsed?.machineType || p.machineType || 'Unknown';

        // Additional Metadata
        const rawNameLower = (modelInfo.model || '').toLowerCase();
        let precision = 'Unknown';
        if (rawNameLower.includes('fp8')) precision = 'FP8';
        else if (rawNameLower.includes('fp16')) precision = 'FP16';
        else if (rawNameLower.includes('bf16')) precision = 'BF16';

        const servingStack = normalizeServingStack(p.servingStack?.name || 'Unknown');

        // Costs
        const statCost = extractCosts(stat);
        const getDerived = (m) => (statCost?.[m] || (K[m] && outputTput > 0 ? K[m] / outputTput : 0));

        const entry = createEntry({
            model: modelName,
            model_name: modelName,
            hardware: hardware,
            machine_type: machineType,
            use_case: p.workloadSpec?.useCase,
            backend: modelServer,
            precision: precision,
            serving_stack: servingStack,
            throughput: outputTput,
            qps: reqRate,
            latency: { mean: latMean, p99: parseNum(perf.p99LatencyMilliseconds), p50: latMean },
            ttft: { mean: rawTtft, p50: rawTtft },
            timestamp: p.createTime || p.updateTime || p.time || new Date().toISOString(),
            time_per_output_token: tpot,
            itl: tpot,
            ntpot: ntpot,
            isl: isl,
            osl: osl,
            profile_id: p.name || p.id || `profile-${modelName}`, // CRITICAL FIX: Ensure profile_id is included
            tokens_per_second: tpot > 0 ? 1000 / tpot : null
        });

        entry.metrics = {
            ...entry.metrics,
            throughput: outputTput,
            input_tput: inputTput,
            output_tput: outputTput,
            total_tput: totalTput,
            ntpot: ntpot,
            tpot: tpot,
            itl: tpot,
            ttft: { mean: rawTtft, p50: rawTtft },
            request_rate: reqRate,
            e2e_latency: latMean
        };

        entry.source = `giq:${projectName}`;
        entry.source_info = {
            type: 'giq',
            origin: `giq:${projectName}`,
            file_identifier: `giq-${modelName}`,
            raw_url: `https://console.cloud.google.com/welcome?project=${projectName}`
        };

        entry.metadata = {
            ...entry.metadata,
            model_name: modelName,
            backend: modelServer,
            hardware: hardware,
            accelerator_count: acceleratorCount,
            machine_type: machineType,
            precision: precision,
            serving_stack: servingStack
        };

        entry.metrics.cost = {
            spot: getDerived('spot'),
            on_demand: getDerived('on_demand'),
            cud_1y: getDerived('cud_1y'),
            cud_3y: getDerived('cud_3y'),
            source: statCost ? 'explicit_stat' : (K.spot || K.on_demand ? 'derived' : 'none'),
            explicit_input: statCost?.explicit_input || 0,
            explicit_output: statCost?.explicit_output || 0
        };

        entry._diagnostics = { msg: diags, raw_snapshot: { p, stat } };
        entries.push(entry);
    });

    return entries;
}





// ============================================================================
// LLM-D Benchmark Parser (Disaggregated Support)
// ============================================================================

export function parseLlmDBenchmark(json, folderName, runName) {
    // 1. Parse Architecture from Folder Name
    // modelservice: ...setup_modelservice_NA_NA_<P>_<P_TP>_<D>_<D_TP>
    // standalone: ...setup_standalone_<N>_<TP>_NA_NA_NA_NA

    let architecture = 'unknown';
    let pdRatio = 'N/A';
    let hardware = 'H100'; // Default assumption based on user context
    let acceleratorCount = 0;

    const parts = folderName.split('_');

    // Disaggregated
    if (folderName.includes('setup_modelservice')) {
        architecture = 'disaggregated';
        // Find index of 'modelservice' to be safe against prefix changes
        const idx = parts.indexOf('modelservice');
        if (idx !== -1 && parts.length > idx + 6) {
            const pNode = parseInt(parts[idx + 3], 10);
            const dNode = parseInt(parts[idx + 5], 10);
            pdRatio = `${pNode}:${dNode}`;

            // Calculate total chips: (P * P_TP) + (D * D_TP)
            const pTp = parseInt(parts[idx + 4], 10) || 8;
            const dTp = parseInt(parts[idx + 6], 10) || 8;
            acceleratorCount = (pNode * pTp) + (dNode * dTp);
        }
    }
    // Aggregated
    else if (folderName.includes('setup_standalone')) {
        architecture = 'aggregated';
        const idx = parts.indexOf('standalone');
        if (idx !== -1 && parts.length > idx + 2) {
            const nodes = parseInt(parts[idx + 1], 10);
            const tp = parseInt(parts[idx + 2], 10);
            acceleratorCount = nodes * tp;
            pdRatio = 'Aggregated';
        }
    }

    // 2. Metrics Mapping
    const metrics = {
        throughput: json.total_token_throughput || json.output_throughput || 0,
        request_rate: (json.request_rate === 'inf') ? (json.request_throughput || 0) : parseFloat(json.request_rate),
        latency: {
            mean: json.mean_e2el_ms || 0,
            p50: json.median_e2el_ms || 0,
            p99: 0
        },
        ttft: {
            mean: json.mean_ttft_ms || 0,
            p50: json.median_ttft_ms || 0
        },
        tpot: json.mean_tpot_ms || 0,
        itl: json.mean_itl_ms || 0,
        error_count: 0
    };

    // 3. Metadata
    const isl = (json.total_input_tokens && json.completed) ? Math.round(json.total_input_tokens / json.completed) : 0;
    const osl = (json.total_output_tokens && json.completed) ? Math.round(json.total_output_tokens / json.completed) : 0;
    const modelName = normalizeModelName(json.model_id || 'Unknown');

    // standard entry creation
    return createEntry({
        model: modelName,
        model_name: modelName,
        hardware: hardware,
        accelerator_count: acceleratorCount,
        accelerator_type: hardware,
        timestamp: json.date || new Date().toISOString(),

        // Custom Benchmark Fields
        architecture: architecture,
        pd_ratio: pdRatio,

        metrics: {
            ...metrics,
            // Ensure compat with old keys
            throughput: metrics.throughput,
            ttft: metrics.ttft,
            ttft_ms: metrics.ttft.mean,
            tpot: metrics.tpot,
            tpot_ms: metrics.tpot,
            itl: metrics.itl,
            itl_ms: metrics.itl,
            e2e_latency: metrics.latency.mean,
        },

        workload: {
            input_tokens: isl,
            output_tokens: osl,
            target_qps: metrics.request_rate,
            concurrency: json.max_concurrency || 0
        },

        source: 'llm-d-benchmark',
        serving_stack: 'llm-d',
        source_info: {
            type: 'local_file',
            origin: `llm-d:${folderName}`,
            file_identifier: runName
        },
        filename: runName
    });
}


// ============================================================================
// Generic JSON / Local File Parser
// ============================================================================

export function parseJsonEntry(json, filename) {
    // Check for GIQ Profile Structure FIRST
    if (json.performanceStats) {
        // Use the shared robust parser
        const results = parseGiqProfileEntry(json, 'local-file');
        // Return first entry if available, or create empty fallback
        if (results.length > 0) {
            results[0].filename = filename; // Override filename for display
            return results[0];
        }
        // Fallback if parsing failed but stats existed (unlikely)
    }

    const diags = [];

    // Attempt extract timestamp from filename
    const dateMatch = filename.match(/(\d{8})-(\d{6})/);
    const timestamp = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}` : new Date().toISOString();

    // Workload QPS from filename
    const qpsMatch = filename.match(/(\d+\.?\d*)qps/);
    const targetQps = qpsMatch ? parseFloat(qpsMatch[1]) : 0;

    let metrics = {};
    let metadata = {};

    // Check Structure variants
    if (json.metrics) {
        // Structure A
        metrics = {
            tput: json.metrics.throughput,
            rate: json.metrics.request_rate,
            lat_mean: json.metrics.avg_latency_ms,
            lat_p50: json.metrics.median_latency_ms,
            lat_p99: json.metrics.p99_latency_ms,
            ttft_mean: json.metrics.avg_time_to_first_token_ms,
            err: Object.values(json.metrics).filter(k => typeof k === 'number' && k > 0 && String(k).includes('Error')).reduce((a, b) => a + b, 0) // rough heuristic
        };
        metadata = {
            model: json.dimensions?.model_id,
            backend: json.dimensions?.backend
        };
    } else {
        // Structure B - Lifecycle Metrics / Standard JSON
        metrics = {
            tput: json.metrics?.throughput || json.throughput?.output_tokens_per_sec || json.successes?.throughput?.output_tokens_per_sec,
            rate: json.metrics?.request_rate || json.load_summary?.achieved_rate || json.successes?.rate,

            // Latency (Check both nested and flat structures)
            lat_mean: json.metrics?.avg_latency_ms ||
                json.successes?.latency?.request_latency?.mean ||
                json.successes?.request_latency?.mean, // Prometheus flat
            lat_p50: json.metrics?.median_latency_ms ||
                json.successes?.latency?.request_latency?.median ||
                json.successes?.request_latency?.median,
            lat_p99: json.metrics?.p99_latency_ms ||
                json.successes?.latency?.request_latency?.p99 ||
                json.successes?.request_latency?.p99,

            // TTFT
            ttft_mean: json.metrics?.avg_time_to_first_token_ms ||
                json.successes?.time_to_first_token?.mean ||
                json.successes?.latency?.time_to_first_token?.mean,

            err: json.failures?.count || 0,

            // Workload (Log extraction)
            isl: json.successes?.prompt_len?.mean || json.prompt_len?.mean,
            osl: json.successes?.output_len?.mean || json.output_len?.mean
        };
    }


    // Heuristic: Estimate Throughput for Prometheus blocks if missing but Rate & OSL exist
    if (!metrics.tput && metrics.rate && metrics.osl) {
        metrics.tput = metrics.rate * metrics.osl;
    }

    // Fallback for flat keys (sometimes appearing in raw dumps)
    if (!metrics.tput && json.outputTokensPerSecond) {
        metrics.tput = json.outputTokensPerSecond;
    }

    const throughput = parseNum(metrics.tput, 'Throughput', diags);
    const latMean = parseNum(metrics.lat_mean, 'Latency Mean', diags);
    const modelId = normalizeModelName(metadata.model || 'Unknown');

    // Advanced Metrics Extraction (NTPOT, ITL, TTFT)
    // Ensure we look deep into successes.latency for LPG-like structures if falling back
    const latencyObj = json.successes?.latency || json.latency || {};

    let ntpot = parseNum(json.normalized_time_per_output_token?.mean) ||
        parseNum(latencyObj.normalized_time_per_output_token?.mean) ||
        parseNum(metrics.ntpot);

    let itl = parseNum(json.inter_token_latency?.mean) ||
        parseNum(latencyObj.inter_token_latency?.mean) ||
        parseNum(metrics.itl);

    const ttftMean = parseNum(metrics.ttft_mean) || parseNum(latencyObj.time_to_first_token?.mean);

    let tpot = parseNum(json.time_per_output_token?.mean) ||
        parseNum(latencyObj.time_per_output_token?.mean) ||
        parseNum(metrics.tpot);

    // Heuristic: Normalize TPOT/NTPOT/ITL to ms
    // If the data comes from "successes" (Lifecycle/Prometheus logs), it is ALWAYS in Seconds -> Convert to ms.
    const isSeconds = !!json.successes;

    if (isSeconds) {
        if (tpot > 0) tpot = tpot * 1000;
        if (ntpot > 0) ntpot = ntpot * 1000;
        if (itl > 0) itl = itl * 1000;
        if (ttftMean > 0 && ttftMean < 100) {
        // TTFT likely seconds too if small
        // Note: TTFT is not reassigned here, need to fix
        }
    } else {
        // Fallback or Summary Stats (already ms)
        if (tpot > 0 && tpot < 1.0) tpot = tpot * 1000;
        if (ntpot > 0 && ntpot < 1.0) ntpot = ntpot * 1000;
        if (itl > 0 && itl < 1.0) itl = itl * 1000;
    }

    // Heuristics for Hardware/Precision
    // usually not in simple json, parsed from filename or assumed
    let precision = 'Unknown';
    const lowerFile = filename.toLowerCase();
    if (lowerFile.includes('fp4')) precision = 'FP4';
    else if (lowerFile.includes('fp8')) precision = 'FP8';
    else if (lowerFile.includes('int8')) precision = 'INT8';
    else if (lowerFile.includes('fp16')) precision = 'FP16';
    else if (lowerFile.includes('bf16')) precision = 'BF16';

    // Composite Name construction
    // ... Simplified for this refactor ...
    const compositeModel = `${modelId} (${precision})`;

    const entry = createEntry({
        model: modelId,
        model_name: modelId,
        throughput: throughput,
        latency: { mean: latMean, p50: parseNum(metrics.lat_p50), p99: parseNum(metrics.lat_p99) },
        ttft: { mean: isSeconds ? ttftMean * 1000 : ttftMean, p50: 0 },

        // Explicitly populate metrics object for Dashboard compatibility
        metrics: {
            throughput: throughput,
            ntpot: ntpot,
            ntpot_ms: ntpot, // Fresh Key
            tpot: tpot,
            tpot_ms: tpot,   // Fresh Key
            itl: itl,
            itl_ms: itl,     // Fresh Key
            latency: { mean: latMean, p50: parseNum(metrics.lat_p50), p99: parseNum(metrics.lat_p99) },
            ttft: { mean: isSeconds ? ttftMean * 1000 : ttftMean },
            ttft_ms: isSeconds ? ttftMean * 1000 : ttftMean, // Fresh Key
            error_count: metrics.err || 0,
            request_rate: parseNum(metrics.rate) // Ensure QPS is passed
        },

        // Keep root hoists for safety
        ntpot: ntpot,
        tpot: tpot,
        itl: itl,
        error_count: metrics.err || 0,
        filename: filename,
        timestamp: timestamp,
        source: json.source || 'local',
        tokens_per_second: (itl > 0) ? (1000 / itl) : ((tpot > 0) ? (1000 / tpot) : 0),
        _raw: json
    });

    entry.source = 'local';
    entry.source_info = {
        type: 'local', // or gcs if mapped later
        origin: 'file',
        file_identifier: filename,
        raw_url: `/results/${filename}`
    };

    entry.metrics = {
        throughput: throughput,
        request_rate: parseNum(metrics.rate),
        latency: entry.latency,
        ttft: entry.ttft,
        ntpot: ntpot,
        itl: itl,
        tpot: tpot,
        time_per_output_token: tpot, // Alias
        cost: metrics.cost, // GIQ / Cost Data
        time_per_output_token: tpot, // Alias
        cost: metrics.cost, // GIQ / Cost Data
        error_count: metrics.err || 0,
        tokens_per_second: entry.tokens_per_second
    };

    // Hoist key metrics to root for Chart compatibility
    entry.time_per_output_token = tpot;
    entry.ntpot = ntpot;
    entry.itl = itl;
    entry.itl = itl;
    entry.ttft_mean = ttftMean;
    entry.tokens_per_second = entry.tokens_per_second; // Hoist

    entry.workload = {
        input_tokens: parseNum(metrics.isl),
        output_tokens: parseNum(metrics.osl),
        target_qps: targetQps || parseNum(metrics.rate)
    };

    entry.metadata = {
        model_name: modelId,
        backend: metadata.backend || 'Unknown',
        hardware: 'Unknown',
        machine_type: json.dimensions?.machine_type || 'Unknown',
        precision: precision,
        timestamp: timestamp
    };

    entry._diagnostics = {
        msg: diags,
        raw_snapshot: json
    };

    return entry;
}

// ============================================================================
// Log File Parser
// ============================================================================
export function parseLogFile(content, filename) {
    const candidates = extractJsonFromText(content);
    let allEntries = [];

    // 1. Scan for Global Metadata (from Full Profile/Config JSON)
    // The user states metadata is in the "generated latency profile" (Full Profile)
    let globalMetadata = {
        model: 'Unknown',
        hardware: 'Unknown',
        accelerator_count: 1,
        backend: 'Unknown',
        precision: 'Unknown',
        timestamp: new Date().toISOString()
    };

    const metadataJson = candidates.find(json => json.config && (json.infrastructure || json.summary_stats));
    if (metadataJson) {
        const infra = metadataJson.infrastructure || {};
        const config = metadataJson.config || {};

        const acc = infra.accelerator_type || 'Unknown';
        const count = infra.accelerator_count || 1;

        globalMetadata.hardware = normalizeHardware(acc);
        globalMetadata.accelerator_count = count;
        globalMetadata.model = normalizeModelName(config.model || 'Unknown');
        globalMetadata.backend = config.model_server || 'Unknown';
        globalMetadata.backend_version = config.model_server_version || '';
        globalMetadata.dataset = config.input_dataset_name || 'unknown';

        // Precision Extraction
        const vllmArgs = config.model_server_runtime_config?.ModelServerConfig?.Vllm?.args || [];
        for (const arg of vllmArgs) {
            if (arg.includes('fp4')) globalMetadata.precision = 'FP4';
            else if (arg.includes('fp8')) globalMetadata.precision = 'FP8';
            else if (arg.includes('int8')) globalMetadata.precision = 'INT8';
            else if (arg.includes('fp16') || arg.includes('float16')) globalMetadata.precision = 'FP16';
            else if (arg.includes('bf16') || arg.includes('bfloat16')) globalMetadata.precision = 'BF16';
        }
    }

    // 2. Identify and Parse "Lifecycle Metric" Blocks (Priority Data Source)
    // Look for JSONs with the specific structure described in PRD
    const lifecycleBlocks = candidates.filter(json =>
        json.successes?.latency?.normalized_time_per_output_token ||
        (json.successes?.throughput && json.load_summary)
    );

    if (lifecycleBlocks.length > 0) {
        // Use Lifecycle Blocks as primary source
        lifecycleBlocks.forEach((json, idx) => {
            allEntries.push(...parseLpgLifecycleMetrics(json, filename, globalMetadata));
        });
    } else if (metadataJson && metadataJson.summary_stats?.stats) {
        // Fallback: If no individual lifecycle blocks found, but we have a full profile with stats
        allEntries.push(...parseLpgLatencyProfile(metadataJson, filename));
    } else {
        // Fallback: Generic
        candidates.forEach((json) => {
            // Already handled above?
            if (json === metadataJson) return;
            if (lifecycleBlocks.includes(json)) return;

            if (json.metrics || json.load_summary || json.performanceStats) {
                if (json.load_summary && Object.keys(json.load_summary).length === 0) return;
                const entry = parseJsonEntry(json, filename);
                if (entry.metrics.throughput > 0) allEntries.push(entry);
            }
        });
    }

    return allEntries;
}

const parseKVal = (val) => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        if (val.toLowerCase().endsWith('k')) {
            return parseFloat(val) * 1000;
        }
        return parseFloat(val) || 0;
    }
    return 0;
};


// LPG "Generated Latency Profile" Parser (Full Profile with Metadata)
// ============================================================================
export function parseLpgLatencyProfile(json, filename) {
    // This parser handles the complete LPG output with config + infrastructure + summary_stats
    if (!json.config || !json.summary_stats?.stats) return [];

    const config = json.config || {};
    const infra = json.infrastructure || {};
    const stats = json.summary_stats?.stats || [];

    // Extract metadata from the profile
    const modelName = normalizeModelName(config.model || 'Unknown Model');
    const modelServer = config.model_server || 'unknown';
    const modelServerVersion = config.model_server_version || '';
    const datasetName = config.input_dataset_name || 'unknown';

    // Infrastructure
    const machineType = infra.machine_type || 'Unknown';
    let accelerator = normalizeHardware(infra.accelerator_type || 'Unknown');
    const acceleratorCount = infra.accelerator_count || 1;

    // Derive hardware label
    // User requested "B200" not "B200x8"
    let hardware = accelerator !== 'Unknown' ? accelerator : machineType;

    // Try to determine precision from config
    let precision = 'Unknown';
    const vllmArgs = config.model_server_runtime_config?.ModelServerConfig?.Vllm?.args || [];
    for (const arg of vllmArgs) {
        if (arg.includes('fp4')) precision = 'FP4';
        else if (arg.includes('fp8')) precision = 'FP8';
        else if (arg.includes('int8')) precision = 'INT8';
        else if (arg.includes('fp16') || arg.includes('float16')) precision = 'FP16';
        else if (arg.includes('bf16') || arg.includes('bfloat16')) precision = 'BF16';
    }

    // Extract workload identifier from filename or generate one
    // Examples: "Qwen3-235B-A22B-b200-code-completion-20251212.txt" -> "code-completion"
    //           "Qwen3-235B-A22B-b200-text-summarization-20251206.txt" -> "text-summarization"
    let workloadId = '';
    if (filename && filename !== 'pasted_lpg_data') {
        const workloadPatterns = [
            /code[-_]?completion/i,
            /text[-_]?summarization/i,
            /customer[-_]?support/i,
            /chat/i,
            /reasoning/i,
            /qa/i,
        ];
        for (const pattern of workloadPatterns) {
            const match = filename.match(pattern);
            if (match) {
                workloadId = match[0].toLowerCase().replace(/_/g, '-');
                break;
            }
        }
        if (!workloadId) {
            const parts = filename.replace(/\.[^.]+$/, '').split(/[-_]/);
            for (const part of parts) {
                if (!/^\d+$/.test(part) && // not just numbers (dates)
                    !/^[a-z]\d+[a-z]?$/i.test(part) && // not hardware (b200, tpu, v6e)
                    !/^qwen|llama|gemma|mistral/i.test(part) && // not model families
                    part.length > 3) {
                    workloadId = part.toLowerCase();
                    break;
                }
            }
        }
    }

    if (!workloadId) {
        workloadId = `run-${Date.now().toString(36)}`;
    }

    const benchmarkId = `${modelName}|${workloadId}`;
    const displayModelName = workloadId ? `${modelName} (${workloadId})` : modelName;

    const timestamp = new Date().toISOString();
    const entries = [];

    stats.forEach((stage, idx) => {
        const reqRate = parseNum(stage.request_rate, 'Req Rate', null);
        const tputOutput = parseNum(stage.throughput?.mean, 'Output Tput', null);
        const tputInput = parseNum(stage.input_throughput?.mean, 'Input Tput', null);
        const tputTotal = tputOutput + tputInput;

        // Latency Metrics
        const e2eLatency = parseNum(stage.request_latency?.mean, 'E2E Latency', null) * 1000; // s -> ms
        const ttftMs = parseNum(stage.ttft?.mean, 'TTFT', null); // ms

        // In summary_stats, "tpot" is actually NTPOT (Normalized Time Per Output Token)
        const ntpotMs = parseNum(stage.tpot?.mean, 'NTPOT', null);

        // Extract Real TPOT from model_server_metrics if available
        let tpotMs = 0;
        if (stage.model_server_metrics && Array.isArray(stage.model_server_metrics)) {
            const tpotMetric = stage.model_server_metrics.find(m => m.name === 'time_per_output_token');
            if (tpotMetric) {
                // model_server_metrics are usually in seconds
                tpotMs = parseNum(tpotMetric.mean) * 1000;
            }
        }

        // Fallback or override if missing
        if (tpotMs === 0) {
            // Unfortunate fallback, but better than 0
            tpotMs = ntpotMs;
        }

        const itlMs = parseNum(stage.itl?.mean, 'ITL', null); // ms

        const isl = parseNum(stage.input_length?.mean, 'ISL', null);
        const osl = parseNum(stage.output_length?.mean, 'OSL', null);

        const entry = createEntry({
            model: modelName,
            model_name: modelName,
            hardware: hardware,
            timestamp: timestamp,
            source: 'infperf',
            throughput: tputOutput,

            latency: { mean: e2eLatency, p50: 0, p99: 0 },
            ttft: { mean: ttftMs, p50: 0 },

            metrics: {
                throughput: tputOutput,
                output_tput: tputOutput,
                input_tput: tputInput,
                total_tput: tputTotal,
                request_rate: reqRate,

                latency: { mean: e2eLatency, p50: 0, p99: 0 },
                e2e_latency: e2eLatency,

                ntpot: ntpotMs,
                ntpot_ms: ntpotMs,
                tpot: tpotMs,
                tpot_ms: tpotMs,
                time_per_output_token: tpotMs,

                ttft: { mean: ttftMs, p50: 0 },
                ttft_ms: ttftMs,
                itl: itlMs,
                itl_ms: itlMs,

                itl_ms: itlMs,

                error_count: 0,
                tokens_per_second: (itlMs > 0) ? (1000 / itlMs) : 0
            },

            workload: {
                input_tokens: isl,
                output_tokens: osl,
                target_qps: reqRate
            },

            metadata: {
                model_name: modelName,
                display_model: displayModelName,
                workload_id: workloadId,
                benchmark_id: benchmarkId,
                backend: modelServer,
                backend_version: modelServerVersion,
                hardware: hardware,
                accelerator_count: acceleratorCount, // Added Correct Chip Count
                precision: precision,
                dataset: datasetName,
                timestamp: timestamp,
                stage_index: idx
            },

            time_per_output_token: tpotMs,
            ntpot: ntpotMs,
            itl: itlMs,
            ttft_mean: ttftMs,
            isl: isl,
            osl: osl,

            osl: osl,

            tokens_per_second: (itlMs > 0) ? (1000 / itlMs) : 0,
            _raw: stage
        });

        entry.source_info = {
            type: 'lpg',
            origin: 'lifecycle_metrics',
            file_identifier: filename,
            raw_url: json.GcsUri || null
        };

        if (tputOutput > 0) {
            entries.push(entry);
        }
    });

    return entries;
}

// ============================================================================
// LPG Lifecycle Metrics Parser
// ============================================================================
// ============================================================================
// LPG Lifecycle Metrics Parser
// ============================================================================
export function parseLpgLifecycleMetrics(json, filename, metadataOverride = {}) {
    // Structural Validation: Must have the specific nested latency objects OR failure records
    // PRD says: "successfully unmarshalled lifecycle metrics for stage N"
    // If a run failed completely (0 successes), successes.latency might exist but have null values.
    if (!json.load_summary) return [];

    const latency = json.successes?.latency || {};

    const diags = [];
    const throughput = json.successes.throughput || {}; // Throughput metrics usually in successes.throughput

    // PRD: "The request rate, or Queries Per Sec (QPS) can be found in the achieved_rate key of the load_summary JSON object."
    const loadSummary = json.load_summary || {};

    // Workload lengths
    const lens = json.successes.prompt_len ? json.successes : (json.prompt_len ? json : {});

    // Metrics Extraction (Seconds -> ms for LPG Lifecycle)
    // "Note: the latency metrics in the LPG output are recorded in seconds."
    const toMs = (val) => {
        const num = Number(val);
        return !isNaN(num) ? num * 1000 : 0;
    };

    // Determine the source of latency and length metrics.
    // If there are 0 successes but recorded failures, fall back to extracting what we can from failures.
    const hasSuccesses = json.successes?.count > 0 || (json.successes?.count !== 0 && latency.request_latency);

    // In successes, latency is nested: successes.latency.request_latency
    // In failures, latency is direct: failures.request_latency
    const reqLatSource = hasSuccesses ? latency.request_latency : json.failures?.request_latency;
    const promptLenSource = hasSuccesses ? (lens.prompt_len || lens.prompt_len) : json.failures?.prompt_len;

    // Extract Mean Values as per PRD
    // request_latency (end-to-end/E2E latency)
    const latMean = toMs(reqLatSource?.mean);
    const latP50 = toMs(reqLatSource?.median);
    const latP99 = toMs(reqLatSource?.p99);

    // The following metrics only exist on successful runs
    // normalized_time_per_output_token
    const ntpotMs = hasSuccesses ? toMs(latency.normalized_time_per_output_token?.mean) : 0;

    // time_per_output_token
    const tpotMs = hasSuccesses ? toMs(latency.time_per_output_token?.mean) : 0;

    // time_to_first_token
    const ttftMs = hasSuccesses ? toMs(latency.time_to_first_token?.mean) : 0;

    // inter_token_latency
    const itlMs = hasSuccesses ? toMs(latency.inter_token_latency?.mean) : 0;

    // Throughput Metrics
    const tputInput = parseNum(throughput.input_tokens_per_sec, 'Input Tput', null);
    let tputOutput = parseNum(throughput.output_tokens_per_sec, 'Output Tput', null);
    const tputTotal = parseNum(throughput.total_tokens_per_sec, 'Total Tput', null);

    // requests_per_sec (Measured)
    const measuredReqRate = parseNum(throughput.requests_per_sec, 'Measured Rate', null);

    // QPS: "achieved_rate key of the load_summary JSON object"
    // If not present, fallback to measured
    const qps = parseNum(loadSummary.achieved_rate, 'Achieved Rate', null);
    const reqRate = qps > 0 ? qps : measuredReqRate;

    // Derivation: If Output is missing but Total/Input exist, calculate it
    if ((!tputOutput || tputOutput === 0) && tputTotal > 0 && tputInput > 0) {
        tputOutput = tputTotal - tputInput;
    }

    // Workload
    const isl = parseNum(promptLenSource?.mean, 'ISL', null);
    const osl = hasSuccesses ? parseNum(lens.output_len?.mean, 'OSL', null) : 0;

    // Error Count
    const errCount = parseNum(json.failures?.count, 'Failures', null);

    // Metadata Inferencing
    // Priority: MetadataOverride (from Full Profile) -> Filename Inference -> Defaults
    // This allows us to correctly label B200 and Chip Count=8
    let modelName = metadataOverride.model && metadataOverride.model !== 'Unknown' ? metadataOverride.model : 'Unknown Model';
    let hardware = metadataOverride.hardware && metadataOverride.hardware !== 'Unknown' ? metadataOverride.hardware : 'Unknown';
    let acceleratorCount = metadataOverride.accelerator_count || 1;
    let backend = metadataOverride.backend || 'LPG';
    let precision = metadataOverride.precision || 'Unknown';

    // Filename Fallback if still unknown
    if (modelName === 'Unknown Model') {
        const parts = filename.split('/');
        let base = parts[parts.length - 1];

        // Use directory name if the filename is generic
        if (parts.length > 1 && (base.includes('lifecycle_metrics') || base === 'metrics.json' || base === 'data.json' || base.startsWith('stage_'))) {
            base = parts[parts.length - 2];
        }

        if (base) {
            modelName = base;
        }
    }

    if (hardware === 'Unknown') {
        const lowerName = filename.toLowerCase();
        // Check for common accelerators in filename
        if (lowerName.includes('gb200')) { hardware = 'GB200'; acceleratorCount = 8; }
        else if (lowerName.includes('b200')) { hardware = 'B200'; acceleratorCount = 8; }
        else if (lowerName.includes('h200')) hardware = 'H200';
        else if (lowerName.includes('h100')) hardware = 'H100';
        else if (lowerName.includes('a100')) hardware = 'A100';
        else if (lowerName.includes('l4')) hardware = 'L4';
        else if (lowerName.includes('tpu') && lowerName.includes('v6e')) hardware = 'TPU v6e';
        else if (lowerName.includes('tpu') && lowerName.includes('v5e')) hardware = 'TPU v5e';
    }

    if (precision === 'Unknown') {
        const lowerName = filename.toLowerCase();
        if (lowerName.includes('fp4')) precision = 'FP4';
        else if (lowerName.includes('fp8')) precision = 'FP8';
        else if (lowerName.includes('int8')) precision = 'INT8';
        else if (lowerName.includes('fp16')) precision = 'FP16';
        else if (lowerName.includes('bf16')) precision = 'BF16';
    }

    const timestamp = new Date().toISOString();

    const entry = createEntry({
        model: modelName,
        model_name: modelName,
        hardware: hardware,
        timestamp: timestamp,
        source: 'infperf',
        throughput: tputOutput, // Ensure root property is set

        latency: { mean: latMean, p50: latP50, p99: latP99 },
        ttft: { mean: ttftMs, p50: 0 },

        metrics: {
            throughput: tputOutput,
            output_tput: tputOutput,
            input_tput: tputInput,
            total_tput: tputTotal,
            request_rate: reqRate,

            latency: { mean: latMean, p50: latP50, p99: latP99 },
            e2e_latency: latMean,

            ntpot: ntpotMs,
            ntpot_ms: ntpotMs,
            tpot: tpotMs,
            tpot_ms: tpotMs,
            time_per_output_token: tpotMs,

            ttft: { mean: ttftMs, p50: 0 },
            ttft_ms: ttftMs,
            itl: itlMs,
            itl_ms: itlMs,

            itl_ms: itlMs,

            error_count: errCount,
            tokens_per_second: (itlMs > 0) ? (1000 / itlMs) : 0
        },

        workload: {
            input_tokens: isl,
            output_tokens: osl,
            target_qps: reqRate
        },

        metadata: {
            model_name: modelName,
            backend: backend,
            hardware: hardware,
            accelerator_count: acceleratorCount,
            precision: precision,
            timestamp: timestamp
        },

        // Hoisted for tables
        time_per_output_token: tpotMs,
        ntpot: ntpotMs,
        itl: itlMs,
        ttft_mean: ttftMs,
        isl: isl,
        isl: isl,
        osl: osl,
        tokens_per_second: (itlMs > 0) ? (1000 / itlMs) : 0,

        _raw: json
    });

    entry.source_info = {
        type: 'lpg',
        origin: filename, // Use filename as default origin, allow override in hook
        file_identifier: filename,
        raw_url: null
    };

    return [entry];
}


// ============================================================================
// LPG Request Log Parser (Array of Request Objects)
// ============================================================================
export function parseLpgRequestLog(jsonArray, filename, metadataOverride = {}) {
    if (!Array.isArray(jsonArray) || jsonArray.length === 0) return [];

    // Quick validation: Check for request/response/info/metrics in first item
    const first = jsonArray[0];
    if (!first.info && !first.response && !first.metrics) return [];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalDurationMs = 0;
    let totalTpot = 0;
    let tpotCount = 0;

    let minStart = Infinity;
    let maxEnd = -Infinity;

    // Aggregation Loop
    for (const req of jsonArray) {
        // Tokens
        const inTok = Number(req.info?.input_tokens || req.request?.prompt_len || 0);
        const outTok = Number(req.info?.output_tokens || req.response?.output_len || 0);

        totalInputTokens += inTok;
        totalOutputTokens += outTok;

        // Timestamps (Assume seconds if small < 1e11, else ms)
        // Adjust logic if needed based on actual data
        let s = req.start_time;
        let e = req.end_time;

        if (s && e) {
            if (s < minStart) minStart = s;
            if (e > maxEnd) maxEnd = e;

            let duration = (e - s);
            // Normalize to ms
            if (duration < 10000 && duration > 0) duration *= 1000; // Likely seconds

            if (duration > 0) {
                totalDurationMs += duration;
                if (outTok > 0) {
                    totalTpot += (duration / outTok);
                    tpotCount++;
                }
            }
        }
    }

    const count = jsonArray.length;

    // Averages
    const avgInputLen = count ? totalInputTokens / count : 0;
    const avgOutputLen = count ? totalOutputTokens / count : 0;
    const avgTpot = tpotCount ? totalTpot / tpotCount : 0; // ms per token

    // Throughput (Wall Clock)
    let wallTimeSec = 0;
    if (minStart !== Infinity && maxEnd !== -Infinity) {
        // Check units
        let diff = maxEnd - minStart;
        if (minStart > 1e11) { // ms
            wallTimeSec = diff / 1000;
        } else { // seconds
            wallTimeSec = diff;
        }
    }

    const outputTput = (wallTimeSec > 0) ? (totalOutputTokens / wallTimeSec) : 0;

    // Use createEntry to ensure schema compliance
    let modelName = metadataOverride.model_name || metadataOverride.model || "Unknown Model";
    let hardware = metadataOverride.hardware || "Unknown";
    let accelerator_type = metadataOverride.accelerator_type || "Unknown";
    let backend = metadataOverride.backend || "LPG";

    // Filename Fallback for Hardware/Model if unknown
    if (modelName === 'Unknown Model' || modelName === 'Unknown') {
        const parts = filename.split('/');
        const base = parts[parts.length - 1];
        if (base) {
            // Try to extract from run string if available
            // e.g. inference-perf_...-run_100_100_llama-2-7b
            const runParts = base.split('-run_');
            if (runParts.length > 1) {
                const runSegments = runParts[1].split('_');
                if (runSegments.length >= 3) {
                    modelName = runSegments.slice(2).join('_');
                }
            }
        }
    }

    if (hardware === 'Unknown') {
        const lowerName = filename.toLowerCase();
        if (lowerName.includes('gb200')) { hardware = 'GB200'; }
        else if (lowerName.includes('b200')) { hardware = 'B200'; }
        else if (lowerName.includes('h200')) { hardware = 'H200'; }
        else if (lowerName.includes('h100')) { hardware = 'H100'; }
        else if (lowerName.includes('a100')) { hardware = 'A100'; }
        else if (lowerName.includes('l4')) { hardware = 'L4'; }
        else if (lowerName.includes('tpu') && lowerName.includes('v6e')) { hardware = 'TPU v6e'; }
        else if (lowerName.includes('tpu') && lowerName.includes('v5e')) { hardware = 'TPU v5e'; }
        else if (lowerName.includes('tpu')) { hardware = 'TPU'; }
    }

    const entry = createEntry({
        model_name: modelName,
        run_id: filename,
        timestamp: new Date().toISOString(),
        source: 'lpg_request_log',

        metrics: {
            throughput: outputTput,
            output_tput: outputTput,
            input_tput: (wallTimeSec > 0) ? totalInputTokens / wallTimeSec : 0,

            tpot: avgTpot,
            time_per_output_token: avgTpot,

            latency: {
                mean: totalDurationMs / count, // Avg Latency per request
                p50: 0,
                p99: 0
            },

            error_count: 0
        },

        workload: {
            input_tokens: avgInputLen,
            output_tokens: avgOutputLen,
            request_count: count
        },

        metadata: {
            model_name: modelName,
            is_aggregated: true,
            note: "Aggregated from per-request logs",
            hardware: hardware,
            backend: backend,
            accelerator_type: hardware
        },

        // Hoisted
        time_per_output_token: avgTpot,
        tokens_per_second: outputTput,
        isl: avgInputLen,
        osl: avgOutputLen,
        hardware: hardware,

        raw_data: jsonArray
    });

    entry.source_info = {
        type: 'lpg',
        origin: 'request_log',
        file_identifier: filename
    };

    return [entry];
}


/**
 * Scans a text blob for potential JSON objects. 
 * Useful for pasting "messy" terminal output or log files containing JSONs.
 */
export function extractJsonFromText(text) {
    if (!text || typeof text !== 'string') return [];
    const candidates = [];
    let braceCount = 0;
    let startIndex = -1;
    let inString = false;
    let escape = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '"' && !escape) {
            inString = !inString;
        }

        if (char === '\\' && !escape) {
            escape = true;
        } else {
            escape = false;
        }

        if (!inString) {
            if (char === '{') {
                if (braceCount === 0) startIndex = i;
                braceCount++;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0 && startIndex !== -1) {
                    const candidate = text.substring(startIndex, i + 1);
                    try {
                        const parsed = JSON.parse(candidate);
                        // Heuristic: Check for common benchmark keys to reduce false positives
                        // e.g. empty objects {} or random config jsons
                        if (parsed.successes || parsed.metrics || parsed.throughput || parsed.results || parsed.benchmarkingData || parsed.profile || parsed.config || parsed.summary_stats || parsed.performanceStats || parsed.cost) {
                            // Extra metadata for filters
                            // The following lines were provided in the instruction's code edit.
                            // They are syntactically incorrect as direct insertions here.
                            // Assuming the intent was to add properties to the 'parsed' object,
                            // but without a clear 'tp' or 'modelServer' context in this function,
                            // and to maintain syntactic correctness, this specific part of the edit
                            // cannot be applied as written.
                            // If 'tp' refers to 'throughput' and 'modelServer' refers to a server name,
                            // these would need to be defined or derived within this function's scope.
                            // As the instruction is to "Set accelerator_count in metadata to TP value",
                            // and the provided code edit is within this function, but refers to
                            // 'accelerator_count: tp || 1', which is not defined here,
                            // and the structure 'metadata: { ... }' is not a valid statement here,
                            // I am unable to apply this part of the edit faithfully and syntactically correctly.
                            // The original instruction seems to refer to the 'lifecycle_metrics' function,
                            // where 'accelerator_count' is already defined.
                            // To avoid breaking the code, I will not insert the malformed snippet.
                            // If the intent was to add these properties to the 'parsed' object,
                            // it would look something like:
                            // parsed.metadata = { is_aggregated: false, accelerator_count: tp || 1, engine: modelServer };
                            // However, 'tp' and 'modelServer' are undefined in this scope.
                            candidates.push(parsed);
                        }
                    } catch (e) {
                        // Ignore
                    }
                    startIndex = -1;
                }
            }
        }
    }
    return candidates;
}

// Extractor for manifest.yaml text
export const parseLpgManifest = (yamlTxt) => {
    let model = 'Unknown';
    let hw = 'Unknown';
    let count = 1;
    let tp = 1;
    let backend = 'vllm';

    const modelMatch = yamlTxt.match(/model:\s*([^\s]+)/) || yamlTxt.match(/--model=([^\s]+)/);
    const hwMatch = yamlTxt.match(/cloud\.google\.com\/gke-accelerator:\s*([^\s]+)/) || yamlTxt.match(/cloud\.google\.com\/gke-tpu-accelerator:\s*([^\s]+)/);
    const countMatch = yamlTxt.match(/nvidia\.com\/gpu:\s*(\d+)/i) || yamlTxt.match(/google\.com\/tpu:\s*(\d+)/i);
    const topologyMatch = yamlTxt.match(/cloud\.google\.com\/gke-tpu-topology:\s*([^\s]+)/);
    const tpMatch = yamlTxt.match(/tensor-parallel-size:\s*['"]?(\d+)['"]?/i) || yamlTxt.match(/--tensor-parallel-size[=\s]+(\d+)/i);
    const backendMatch = yamlTxt.match(/backend:\s*([^\s]+)/i);

    model = modelMatch ? modelMatch[1].replace(/['"]/g, '').split('/').pop() : 'Unknown';
    hw = hwMatch ? hwMatch[1] : 'Unknown';
    count = countMatch ? parseInt(countMatch[1]) : 1;

    if (!countMatch && topologyMatch) {
        const dims = topologyMatch[1].split('x').map(d => parseInt(d)).filter(n => !isNaN(n));
        if (dims.length > 0) {
            count = dims.reduce((a, b) => a * b, 1);
        }
    }

    tp = tpMatch ? parseInt(tpMatch[1]) : 1;
    backend = backendMatch ? backendMatch[1].replace(/['"]/g, '') : 'vllm';
    if (backend.toLowerCase().includes('trt')) backend = 'trtllm';

    return { model, hw, count, tp, backend };
};

// Extractor for config.yaml text
export const parseLpgConfig = (configTxt) => {
    let model = 'Unknown';
    const pathMatch = configTxt.match(/"pretrained_model_name_or_path"\s*:\s*"?([^",\s]+)"?/i);
    if (pathMatch) {
        model = pathMatch[1].split('/').pop();
    }
    return { model };
};
