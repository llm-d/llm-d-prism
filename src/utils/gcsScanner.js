import yaml from 'js-yaml';

const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

// Target GCS Bucket for Milestone 1
const MILESTONE1_BUCKET = 'llm-d-benchmarks-m1';

/**
 * Normalizes hardware names using standard conventions.
 */
export const normalizeHardware = (hw) => {
    if (!hw) return 'Unknown';
    const s = String(hw).toUpperCase();
    if (s.includes('H100')) return 'NVIDIA H100';
    if (s.includes('A100')) return 'NVIDIA A100';
    if (s.includes('L4')) return 'NVIDIA L4';
    if (s.includes('T4')) return 'NVIDIA T4';
    if (s.includes('B200')) return 'NVIDIA B200';
    if (s.includes('GB200')) return 'NVIDIA GB200';
    return hw;
};

/**
 * Scans the GCS bucket for benchmark reports.
 * Falls back to URI-based extraction if YAML parsing fails or is missing.
 */
export const scanGcsBucket = async () => {
    try {
        // 1. List objects in bucket
        const listUrl = `/api/gcs/storage/v1/b/${MILESTONE1_BUCKET}/o`;
        const response = await fetch(listUrl);
        if (!response.ok) {
            throw new Error(`Failed to list GCS bucket objects: ${response.status}`);
        }

        const data = await response.json();
        if (!data.items) return [];

        // 2. Filter for report folders (or files ending in report_v0.2.yaml)
        const reports = [];

        // In parallel, fetch and parse each report
        await Promise.all(data.items.map(async (item) => {
            if (!item.name.endsWith('report_v0.2.yaml')) return;

            try {
                // Fetch report content
                const mediaUrl = `/api/gcs/storage/v1/b/${MILESTONE1_BUCKET}/o/${encodeURIComponent(item.name)}?alt=media`;
                const fileRes = await fetch(mediaUrl);
                if (!fileRes.ok) return;

                const content = await fileRes.text();
                const parsed = parseReport(content, item.name);
                if (parsed) reports.push(parsed);
            } catch (e) {
                console.warn(`Failed to parse file ${item.name}:`, e);
                // Fallback to URI parsing if fetch/parse failed but file exists
                const fallback = parseFromUri(item.name);
                if (fallback) reports.push(fallback);
            }
        }));

        return reports;

    } catch (e) {
        console.error('GCS Scan Error:', e);
        return [];
    }
};

/**
 * Parses report content using js-yaml.
 */
export const parseReport = (content, filePath) => {
    try {
        const doc = yaml.load(content);
        if (!doc) return null;

        const aggregate = doc.results?.request_performance?.aggregate || {};
        const metadata = doc.metadata || {};

        // Extract recipe & config overrides for reproduction
        const recipeUrl = doc.recipe_url || doc.metadata?.recipe_url || '';
        const configOverrides = doc.config_overrides || doc.metadata?.config_overrides || {};

        return {
            id: generateUUID(),
            filePath,
            ...parseFromUri(filePath), // Merge URI fallback defaults
            // Override with YAML data if available
            model_name: metadata.model_name || metadata.model || parseFromUri(filePath).model_name,
            hardware: normalizeHardware(metadata.accelerator_type || metadata.hardware || parseFromUri(filePath).hardware),
            accelerator_type: normalizeHardware(metadata.accelerator_type || parseFromUri(filePath).accelerator_type),
            chip_count: parseInt(metadata.chip_count || parseFromUri(filePath).chip_count || 1),
            scenario_config: metadata.scenario_config || parseFromUri(filePath).scenario_config,
            
            metrics: {
                throughput: aggregate.throughput || 0,
                qps: aggregate.request_rate || 0,
                ttft_mean: aggregate.ttft_mean || aggregate.mean_ttft_ms || 0,
                itl: aggregate.itl || aggregate.mean_itl_ms || 0,
                latency_mean: aggregate.mean_e2el_ms || 0,
                error_rate: aggregate.error_rate || 0
            },
            reproduction: {
                recipeUrl,
                configOverrides
            }
        };
    } catch (e) {
        console.warn(`YAML Parsing failed for ${filePath}, falling back to URI parsing.`);
        return parseFromUri(filePath);
    }
};

/**
 * Fallback parser based on URI structure.
 * [well-lit-path]/[scenario-config]/[model_name]/[accelerator]-[count]/[run_id]
 */
export const parseFromUri = (filePath) => {
    const parts = filePath.split('/');
    if (parts.length < 5) return null;

    // Remove the file name itself if it's pointing to the file
    const pathParts = parts[parts.length - 1].endsWith('.yaml') ? parts.slice(0, -1) : parts;

    // Expected: [well-lit-path, scenario-config, model_name, accelerator-count, run_id]
    // Reversing to find segments relative to the end if depth varies
    const len = pathParts.length;
    if (len < 5) return null;

    const runId = pathParts[len - 1];
    const accCountPart = pathParts[len - 2];
    const modelName = pathParts[len - 3];
    const scenarioConfig = pathParts[len - 4];
    const wellLitPath = pathParts[len - 5];

    let hardware = 'Unknown';
    let chipCount = 1;

    if (accCountPart.includes('-')) {
        const [acc, count] = accCountPart.split('-');
        hardware = normalizeHardware(acc);
        chipCount = parseInt(count) || 1;
    } else {
        hardware = normalizeHardware(accCountPart);
    }

    return {
        id: generateUUID(),
        filePath,
        well_lit_path: wellLitPath,
        scenario_config: scenarioConfig,
        model_name: modelName,
        hardware: hardware,
        accelerator_type: hardware,
        chip_count: chipCount,
        run_id: runId,
        metrics: {
            throughput: 0,
            qps: 0,
            ttft_mean: 0,
            itl: 0,
            latency_mean: 0,
            error_rate: 0
        },
        reproduction: {
            recipeUrl: '',
            configOverrides: {}
        }
    };
};

const INFERENCE_SCHEDULING_BUCKET = 'llm-d-benchmarks';

export const scanInferenceScheduling = async () => {
    try {
        const listUrl = `/api/gcs/storage/v1/b/${INFERENCE_SCHEDULING_BUCKET}/o?prefix=inference-scheduling/`;
        const response = await fetch(listUrl);
        if (!response.ok) {
            throw new Error(`Failed to list GCS bucket objects: ${response.status}`);
        }

        const data = await response.json();
        if (!data.items) return [];

        const reports = [];

        await Promise.all(data.items.map(async (item) => {
            if (!item.name.endsWith('.yaml')) return;
            if (!item.name.includes('lifecycle_metrics')) return;

            try {
                const mediaUrl = `/api/gcs/storage/v1/b/${INFERENCE_SCHEDULING_BUCKET}/o/${encodeURIComponent(item.name)}?alt=media`;
                const fileRes = await fetch(mediaUrl);
                if (!fileRes.ok) return;

                const content = await fileRes.text();
                const parsed = parseInferenceSchedulingReport(content, item.name);
                if (parsed) reports.push(parsed);
            } catch (e) {
                console.warn(`Failed to parse file ${item.name}:`, e);
            }
        }));

        return reports;

    } catch (e) {
        console.error('Inference Scheduling GCS Scan Error:', e);
        return [];
    }
};

export const parseInferenceSchedulingReport = (content, filePath) => {
    try {
        const doc = yaml.load(content);
        if (!doc) return null;

        const aggregate = doc.results?.request_performance?.aggregate || {};
        const config = doc.config || {};
        const latency = aggregate.latency || {};
        const throughput = aggregate.throughput || {};

        const ttft = latency.time_to_first_token || {};
        const tpot = latency.time_per_output_token || {};
        const ntpot = latency.normalized_time_per_output_token || {};
        const itl = latency.inter_token_latency || {};

        const parts = filePath.split('/');
        const scenario = config.scenario || parts[1] || 'Unknown';
        const model = config.model || parts[2] || 'Unknown';
        const hardware = config.hardware || parts[3] || 'Unknown';
        const machine_type = config.machine_type || 'Unknown';
        const runId = parts[4] || 'Unknown';
        
        const rawNameLower = filePath.toLowerCase();
        let precision = config.precision || 'Unknown';
        if (precision === 'Unknown') {
            if (rawNameLower.includes('fp8')) precision = 'FP8';
            else if (rawNameLower.includes('fp16')) precision = 'FP16';
            else if (rawNameLower.includes('bf16')) precision = 'BF16';
        }

        let serving_engine = config.serving_engine || config.backend || 'Unknown';
        if (serving_engine === 'Unknown') {
            if (rawNameLower.includes('vllm')) serving_engine = 'vLLM';
            else if (rawNameLower.includes('tgi')) serving_engine = 'TGI';
            else if (rawNameLower.includes('tensorrt')) serving_engine = 'TensorRT-LLM';
        }

        const prefill_node_count = doc.prefill_node_count || config.prefill_node_count || 0;
        const decode_node_count = doc.decode_node_count || config.decode_node_count || 0;
        const num_nodes = prefill_node_count + decode_node_count;
        
        const stageMatch = filePath.match(/_stage_(\d+)_/);
        const stage = stageMatch ? parseInt(stageMatch[1], 10) : (doc.scenario?.load?.standardized?.stage || 0);

        return {
            id: generateUUID(),
            filePath,
            scenario,
            model,
            model_name: model,
            hardware,
            machine_type,
            precision,
            serving_engine,
            num_nodes: num_nodes || 4,
            runId,
            stage,
            qps: throughput.request_rate?.mean || 0,
            output_token_rate: throughput.output_token_rate?.mean || 0,
            ttft: {
                p50: (ttft.p50 || 0) * 1000,
                p90: (ttft.p90 || 0) * 1000,
                p99: (ttft.p99 || 0) * 1000,
            },
            tpot: {
                p50: (tpot.p50 || 0) * 1000,
                p90: (tpot.p90 || 0) * 1000,
                p99: (tpot.p99 || 0) * 1000,
            },
            ntpot: {
                p50: (ntpot.p50 || 0) * 1000,
                p90: (ntpot.p90 || 0) * 1000,
                p99: (ntpot.p99 || 0) * 1000,
            },
            itl: {
                p50: (itl.p50 || 0) * 1000,
                p90: (itl.p90 || 0) * 1000,
                p99: (itl.p99 || 0) * 1000,
            }
        };
    } catch (e) {
        console.warn(`YAML Parsing failed for ${filePath}:`, e);
        return null;
    }
};

export const scanRegressions = async () => {
    try {
        const response = await fetch('/api/regressions');
        if (!response.ok) {
            throw new Error(`Failed to load regressions from server API: ${response.status}`);
        }
        return await response.json();
    } catch (e) {
        console.error('Regressions GCS Scan Error:', e);
        return [];
    }
};

export const parseRegressionReport = (content, filePath, metadataContent, jsonContent) => {
    try {
        const doc = yaml.load(content);
        if (!doc) return null;

        const aggregate = doc.results?.request_performance?.aggregate || {};
        
        const requests = aggregate.requests || {};
        const totalReqs = requests.total || 0;
        const failures = requests.failures || 0;
        const successRate = totalReqs > 0 ? ((totalReqs - failures) / totalReqs) * 100 : 100;
        
        const throughput = aggregate.throughput || {};

        const config = doc.config || {};
        const latency = aggregate.latency || {};

        const ttft = latency.time_to_first_token || {};
        const tpot = latency.time_per_output_token || {};
        const ntpot = latency.normalized_time_per_output_token || {};
        const itl = latency.inter_token_latency || {};

        const parts = filePath.split('/');
        const stageMatch = filePath.match(/_stage_(\d+)_/);
        const stage = stageMatch ? parseInt(stageMatch[1], 10) : 0;

        let durationSeconds = 0;
        if (jsonContent && (jsonContent.benchmark_time_seconds !== undefined || jsonContent.load_summary?.send_duration !== undefined)) {
            durationSeconds = jsonContent.benchmark_time_seconds || jsonContent.load_summary?.send_duration || 0;
        } else {
            const durationStr = doc.run?.time?.duration || '';
            const durationMatch = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);
            if (durationMatch) {
                const h = parseFloat(durationMatch[1] || 0);
                const m = parseFloat(durationMatch[2] || 0);
                const s = parseFloat(durationMatch[3] || 0);
                durationSeconds = h * 3600 + m * 60 + s;
            }
        }

        const requestRate = doc.scenario?.load?.standardized?.rate_qps || doc.scenario?.load?.rate_qps || doc.config?.rate_qps || 0;
        
        let date = 'Unknown';
        let runId = 'Unknown';
        let suite = 'Unknown';

        if (parts[1] === 'optimized-baseline') {
            date = parts[4] || 'Unknown';
            runId = parts[5] || 'Unknown';
            suite = `${parts[1]}/${parts[2]}/${parts[3]}`;
        } else {
            date = parts[3] || 'Unknown';
            runId = parts[4] || 'Unknown';
            suite = `${parts[1] || 'gke'}/${parts[2] || 'standalone'}`;
        }

        console.log('parseRegressionReport diagnostic - file:', filePath, 'parts[1]:', parts[1], 'suite:', suite);

        let model = 'Unknown';
        let githubRunId = null;
        if (metadataContent) {
            try {
                const metaDoc = yaml.load(metadataContent);
                if (metaDoc) {
                    if (metaDoc.model) {
                        model = metaDoc.model;
                    }
                    if (metaDoc.github_run_id) {
                        githubRunId = String(metaDoc.github_run_id);
                    }
                }
            } catch (e) {
                console.warn('Failed to parse metadataContent:', e);
            }
        }

        if (model === 'Unknown') {
            model = config.model || (parts[1] === 'optimized-baseline' ? 'Qwen/Qwen3-32B' : parts[6]) || 'Unknown';
        }
        
        const rawNameLower = filePath.toLowerCase();
        let precision = config.precision || 'Unknown';
        if (precision === 'Unknown') {
            if (rawNameLower.includes('fp8')) precision = 'FP8';
            else if (rawNameLower.includes('fp16')) precision = 'FP16';
            else if (rawNameLower.includes('bf16')) precision = 'BF16';
        }

        let serving_engine = config.serving_engine || config.backend || 'Unknown';
        if (serving_engine === 'Unknown') {
            if (rawNameLower.includes('vllm')) serving_engine = 'vLLM';
            else if (rawNameLower.includes('tgi')) serving_engine = 'TGI';
            else if (rawNameLower.includes('tensorrt')) serving_engine = 'TensorRT-LLM';
        }

        return {
            id: generateUUID(),
            filePath,
            date,
            runId,
            suite,
            model,
            model_name: model,
            github_run_id: githubRunId,
            precision,
            serving_engine,
            stage,
            duration: durationSeconds,
            request_rate: requestRate,
            success_rate: successRate,
            qps: throughput.request_rate?.mean || 0,
            output_token_rate: throughput.output_token_rate?.mean || 0,
            total_token_rate: throughput.total_token_rate?.mean || 0,
            input_token_rate: (throughput.total_token_rate?.mean || 0) - (throughput.output_token_rate?.mean || 0),
            ttft: {
                p50: (ttft.p50 || 0) * 1000,
                p90: (ttft.p90 || 0) * 1000,
                p99: (ttft.p99 || 0) * 1000,
            },
            tpot: {
                p50: (tpot.p50 || 0) * 1000,
                p90: (tpot.p90 || 0) * 1000,
                p99: (tpot.p99 || 0) * 1000,
            },
            ntpot: {
                p50: (ntpot.p50 || 0) * 1000,
                p90: (ntpot.p90 || 0) * 1000,
                p99: (ntpot.p99 || 0) * 1000,
            },
            itl: {
                p50: (itl.p50 || 0) * 1000,
                p90: (itl.p90 || 0) * 1000,
                p99: (itl.p99 || 0) * 1000,
            }
        };
    } catch (e) {
        console.warn(`YAML Parsing failed for ${filePath}:`, e);
        return null;
    }
};
