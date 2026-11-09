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

/**
 * Isomorphic Kubernetes Manifest, Helm Values, and Config Metadata Extractor.
 *
 * Extracts model_name, hardware_name, accelerator_count, inference_tool,
 * inference_tool_version, well_lit_path, and serving stack values from K8s workloads
 * (Deployment, StatefulSet, Job, Pod, LeaderWorkerSet, InferenceService, InferencePool),
 * Helm values.yaml, config.yaml, and run_metadata.yaml.
 */

import yaml from 'js-yaml';

/**
 * Normalizes a raw hardware or accelerator string into a canonical Prism hardware name,
 * while preserving unknown non-empty hardware identifiers.
 *
 * @param {string} rawHw
 * @returns {string|null}
 */
export function normalizeManifestHardware(rawHw) {
    if (!rawHw || typeof rawHw !== 'string') return null;
    const trimmed = rawHw.trim();
    if (!trimmed || trimmed.toLowerCase() === 'unknown' || trimmed.toLowerCase() === 'unknown hardware') {
        return null;
    }

    const lower = trimmed.toLowerCase();

    if (lower.includes('gb200')) return 'GB200';
    if (lower.includes('b200')) return 'B200';
    if (lower.includes('h200')) return 'H200';
    if (lower.includes('h100')) return 'H100';
    if (lower.includes('a100')) return 'A100';
    if (lower.includes('l40s')) return 'L40S';
    if (lower.includes('l40')) return 'L40';
    if (lower.includes('l4')) return 'L4';
    if (lower.includes('t4')) return 'T4';
    if (lower.includes('mi355x')) return 'MI355X';
    if (lower.includes('mi325x')) return 'MI325X';
    if (lower.includes('mi300x')) return 'MI300X';

    if (lower.includes('v6e') || lower.includes('trillium')) return 'TPU v6e';
    if (lower.includes('v7')) return 'TPU v7';
    if (lower.includes('v5p')) return 'TPU v5p';
    if (lower.includes('v5e') || lower.includes('v5litepod')) return 'TPU v5e';
    if (lower.includes('v4')) return 'TPU v4';

    return trimmed;
}

/**
 * Parses a TPU topology string like "2x4" or "2x2x4" into a total chip count.
 *
 * @param {string} topology
 * @returns {number|null}
 */
function parseTopologyCount(topology) {
    if (!topology || typeof topology !== 'string') return null;
    const match = topology.trim().match(/^(\d+(?:x\d+)+)$/i);
    if (!match) return null;
    const dims = match[1].toLowerCase().split('x').map((d) => parseInt(d, 10));
    if (dims.length > 0 && dims.every((n) => Number.isFinite(n) && n > 0)) {
        return dims.reduce((a, b) => a * b, 1);
    }
    return null;
}

/**
 * Extracts inference_tool and inference_tool_version from a container image string.
 *
 * @param {string} imageStr
 * @returns {{ tool: string|null, version: string|null }}
 */
export function parseContainerImageMetadata(imageStr) {
    if (!imageStr || typeof imageStr !== 'string') {
        return { tool: null, version: null };
    }
    const trimmed = imageStr.trim();
    const lower = trimmed.toLowerCase();

    let tool = null;
    if (lower.includes('vllm')) tool = 'vLLM';
    else if (lower.includes('sglang')) tool = 'SGLang';
    else if (lower.includes('tritonserver') || lower.includes('triton')) tool = 'Triton';
    else if (lower.includes('tensorrt') || lower.includes('trt-llm') || lower.includes('trtllm')) tool = 'TensorRT-LLM';
    else if (lower.includes('text-generation-inference') || lower.includes('/tgi:') || lower.includes('/tgi@') || lower.endsWith('/tgi') || lower === 'tgi' || lower.startsWith('tgi:')) tool = 'TGI';
    else if (lower.includes('jetstream')) tool = 'JetStream';
    else if (lower.includes('ollama')) tool = 'Ollama';

    let version = null;
    // Strip digest if present (e.g. image:tag@sha256:...)
    const withoutDigest = trimmed.split('@')[0];
    const lastColonIdx = withoutDigest.lastIndexOf(':');
    const lastSlashIdx = withoutDigest.lastIndexOf('/');
    if (lastColonIdx > lastSlashIdx && lastColonIdx !== -1) {
        const tag = withoutDigest.slice(lastColonIdx + 1).trim();
        if (tag && tag.toLowerCase() !== 'latest') {
            version = tag;
        }
    }

    return { tool, version };
}

/**
 * Tokenizes CLI args array or command string to extract `--model`, `--tensor-parallel-size`, etc.
 *
 * @param {Array<string>|string} rawArgs
 * @returns {{ model: string|null, tp: number|null, pp: number|null, dp: number|null }}
 */
function parseContainerArgs(rawArgs) {
    if (!rawArgs) return { model: null, tp: null, pp: null, dp: null };

    const tokens = [];
    if (Array.isArray(rawArgs)) {
        for (const item of rawArgs) {
            if (item === null || item === undefined) continue;
            // Support shell command strings passed inside args like ["bash", "-c", "vllm serve --model foo --tp 4"]
            const s = String(item).trim();
            if (s.includes(' ') && (s.includes('--') || s.includes('vllm') || s.includes('sglang') || s.includes('python'))) {
                tokens.push(...s.split(/\s+/));
            } else {
                tokens.push(s);
            }
        }
    } else if (typeof rawArgs === 'string') {
        tokens.push(...rawArgs.trim().split(/\s+/));
    }

    let model = null;
    let tp = null;
    let pp = null;
    let dp = null;

    const cleanVal = (v) => (v ? String(v).replace(/^["']|["']$/g, '').trim() : null);

    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (!tok) continue;

        // Handle --flag=value
        if (tok.startsWith('--model=') || tok.startsWith('--model-name=') || tok.startsWith('--served-model-name=') || tok.startsWith('--model-id=') || tok.startsWith('--model-path=')) {
            const val = cleanVal(tok.slice(tok.indexOf('=') + 1));
            if (val && !model) model = val;
            continue;
        }
        if (tok.startsWith('--tensor-parallel-size=') || tok.startsWith('--tp=')) {
            const val = parseInt(tok.slice(tok.indexOf('=') + 1), 10);
            if (Number.isFinite(val) && val > 0) tp = val;
            continue;
        }
        if (tok.startsWith('--pipeline-parallel-size=') || tok.startsWith('--pp=')) {
            const val = parseInt(tok.slice(tok.indexOf('=') + 1), 10);
            if (Number.isFinite(val) && val > 0) pp = val;
            continue;
        }
        if (tok.startsWith('--data-parallel-size=') || tok.startsWith('--dp=')) {
            const val = parseInt(tok.slice(tok.indexOf('=') + 1), 10);
            if (Number.isFinite(val) && val > 0) dp = val;
            continue;
        }

        // Handle --flag value
        if (
            tok === '--model' ||
            tok === '--model-name' ||
            tok === '--served-model-name' ||
            tok === '--model-id' ||
            tok === '--model-path' ||
            tok === '-m'
        ) {
            const prevTok = i > 0 ? String(tokens[i - 1] || '') : '';
            const isPythonModuleFlag = tok === '-m' && /^python\d*(?:\.\d+)?$/i.test(prevTok);
            const next = cleanVal(tokens[i + 1]);
            if (next && !next.startsWith('-')) {
                const looksLikeEntrypoint = tok === '-m' && /\b(?:entrypoints|api_server|launch_server)\b/i.test(next);
                if (!isPythonModuleFlag && !looksLikeEntrypoint && !model) {
                    model = next;
                }
                i++;
            }
            continue;
        }

        // Positional `vllm serve <model>`
        if (tok === 'serve' && i > 0 && tokens[i - 1]?.includes('vllm')) {
            const next = cleanVal(tokens[i + 1]);
            if (next && !next.startsWith('-') && !model) {
                model = next;
            }
        }

        if (tok === '--tensor-parallel-size' || tok === '--tp' || tok === '-tp') {
            const next = parseInt(tokens[i + 1], 10);
            if (Number.isFinite(next) && next > 0) {
                tp = next;
                i++;
            }
            continue;
        }

        if (tok === '--pipeline-parallel-size' || tok === '--pp') {
            const next = parseInt(tokens[i + 1], 10);
            if (Number.isFinite(next) && next > 0) {
                pp = next;
                i++;
            }
            continue;
        }

        if (tok === '--data-parallel-size' || tok === '--dp') {
            const next = parseInt(tokens[i + 1], 10);
            if (Number.isFinite(next) && next > 0) {
                dp = next;
                i++;
            }
            continue;
        }
    }

    return { model, tp, pp, dp };
}

/**
 * Extracts metadata from a single parsed YAML/JSON document.
 *
 * @param {object} doc
 * @returns {object}
 */
function extractFromSingleDoc(doc) {
    if (!doc || typeof doc !== 'object') {
        return {};
    }

    let model_name = null;
    let hardware_name = null;
    let accelerator_count = null;
    let inference_tool = null;
    let inference_tool_version = null;
    let well_lit_path = null;
    let helm_ServingStack_values = null;

    const kind = typeof doc.kind === 'string' ? doc.kind.trim() : '';
    const isK8sWorkload = Boolean(
        kind &&
        [
            'Deployment',
            'StatefulSet',
            'DaemonSet',
            'Job',
            'Pod',
            'ReplicaSet',
            'LeaderWorkerSet',
            'InferenceService',
            'InferencePool',
            'InferenceModel',
        ].includes(kind)
    ) || Boolean(doc.spec?.template?.spec || doc.spec?.leaderWorkerTemplate);

    // 1. Collect podSpecs and replica multipliers from K8s workloads
    const podEntries = [];

    if (kind === 'Pod' && doc.spec) {
        podEntries.push({ podSpec: doc.spec, multiplier: 1, annotations: doc.metadata?.annotations });
    } else if (kind === 'LeaderWorkerSet' || doc.spec?.leaderWorkerTemplate) {
        const replicas = Number(doc.spec?.replicas) > 0 ? Number(doc.spec.replicas) : 1;
        const size = Number(doc.spec?.leaderWorkerTemplate?.size) > 0 ? Number(doc.spec.leaderWorkerTemplate.size) : 1;
        const workerTpl = doc.spec?.leaderWorkerTemplate?.workerTemplate;
        const leaderTpl = doc.spec?.leaderWorkerTemplate?.leaderTemplate;
        if (workerTpl?.spec) {
            podEntries.push({
                podSpec: workerTpl.spec,
                multiplier: replicas * size,
                annotations: { ...(doc.metadata?.annotations || {}), ...(workerTpl.metadata?.annotations || {}) },
            });
        }
        if (leaderTpl?.spec && !workerTpl?.spec) {
            podEntries.push({
                podSpec: leaderTpl.spec,
                multiplier: replicas * size,
                annotations: { ...(doc.metadata?.annotations || {}), ...(leaderTpl.metadata?.annotations || {}) },
            });
        }
    } else if (kind === 'InferenceService' && doc.spec?.predictor) {
        const predictor = doc.spec.predictor;
        const replicas = Number(predictor.minReplicas || predictor.replicas) > 0 ? Number(predictor.minReplicas || predictor.replicas) : 1;
        if (predictor.model) {
            if (predictor.model.modelFormat?.name && !inference_tool) {
                const { tool } = parseContainerImageMetadata(predictor.model.modelFormat.name);
                if (tool) inference_tool = tool;
            }
            if (predictor.model.runtimeVersion && !inference_tool_version) {
                inference_tool_version = String(predictor.model.runtimeVersion);
            }
            if (predictor.model.storageUri && !model_name) {
                model_name = String(predictor.model.storageUri).replace(/^(?:hf|gs|s3):\/\//, '');
            }
        }
        podEntries.push({
            podSpec: predictor,
            multiplier: replicas,
            annotations: doc.metadata?.annotations,
        });
    } else if (kind === 'InferenceModel' && doc.spec) {
        if (doc.spec.modelName && !model_name) {
            model_name = String(doc.spec.modelName);
        }
    } else if (doc.spec?.template?.spec) {
        const replicas = Number(doc.spec?.replicas) > 0 ? Number(doc.spec.replicas) : 1;
        podEntries.push({
            podSpec: doc.spec.template.spec,
            multiplier: replicas,
            annotations: { ...(doc.metadata?.annotations || {}), ...(doc.spec?.template?.metadata?.annotations || {}) },
        });
    }

    for (const { podSpec, multiplier, annotations } of podEntries) {
        const containers = Array.isArray(podSpec.containers) ? podSpec.containers : [];
        let perPodAccCount = null;

        for (const c of containers) {
            if (!c || typeof c !== 'object') continue;

            // Image -> inference_tool & version
            if (c.image) {
                const { tool, version } = parseContainerImageMetadata(c.image);
                if (tool && !inference_tool) inference_tool = tool;
                if (version && !inference_tool_version) inference_tool_version = version;
            }

            // Command + Args -> model_name & TP
            const combinedArgs = [
                ...(Array.isArray(c.command) ? c.command : (c.command ? [c.command] : [])),
                ...(Array.isArray(c.args) ? c.args : (c.args ? [c.args] : [])),
            ];
            const parsedArgs = parseContainerArgs(combinedArgs);
            if (parsedArgs.model && !model_name) {
                model_name = parsedArgs.model;
            }

            // Environment variables -> MODEL_ID / MODEL_NAME / VLLM_MODEL
            const envMap = {};
            if (Array.isArray(c.env)) {
                for (const envVar of c.env) {
                    if (!envVar || typeof envVar !== 'object') continue;
                    const envName = String(envVar.name || '').trim();
                    if (envName && envVar.value !== undefined && envVar.value !== null) {
                        envMap[envName] = String(envVar.value).trim();
                    }
                }
            }

            if (model_name && /^\$\(?\{?[A-Za-z_][A-Za-z0-9_]*\}?\)?$/.test(model_name)) {
                const refKey = model_name.replace(/^\$\(?\{?|\}?\)?$/g, '');
                model_name = envMap[refKey] || null;
            }

            if (!model_name) {
                for (const key of ['MODEL_ID', 'MODEL_NAME', 'MODEL', 'SERVED_MODEL_NAME', 'HF_MODEL_ID']) {
                    if (envMap[key]) {
                        model_name = envMap[key];
                        break;
                    }
                }
            }

            // Resources limits / requests -> accelerator count
            const limits = c.resources?.limits || c.resources?.requests || {};
            const gpuLimit =
                limits['nvidia.com/gpu'] ??
                limits['amd.com/gpu'] ??
                limits['google.com/tpu'] ??
                limits['tpu'];
            if (gpuLimit !== undefined && gpuLimit !== null) {
                const parsedLimit = parseInt(String(gpuLimit), 10);
                if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
                    perPodAccCount = (perPodAccCount || 0) + parsedLimit;
                }
            } else if (parsedArgs.tp) {
                const pp = parsedArgs.pp || 1;
                const dp = parsedArgs.dp || 1;
                perPodAccCount = parsedArgs.tp * pp * dp;
            }
        }

        // NodeSelector / Labels / Annotations -> hardware_name & TPU topology
        const nodeSelector = podSpec.nodeSelector || {};
        const rawSelectorAcc =
            nodeSelector['cloud.google.com/gke-accelerator'] ||
            nodeSelector['nvidia.com/gpu.product'] ||
            nodeSelector['accelerator'] ||
            nodeSelector['gpu-type'] ||
            annotations?.['cloud.google.com/gke-accelerator'];
        if (rawSelectorAcc && !hardware_name) {
            hardware_name = normalizeManifestHardware(String(rawSelectorAcc));
        }

        const topologyStr =
            nodeSelector['cloud.google.com/gke-tpu-topology'] ||
            annotations?.['cloud.google.com/gke-tpu-topology'] ||
            annotations?.['tpu-topology'];
        const topoCount = parseTopologyCount(topologyStr);
        if (topoCount && topoCount > 0) {
            accelerator_count = topoCount;
        } else if (perPodAccCount && perPodAccCount > 0) {
            accelerator_count = perPodAccCount * (multiplier || 1);
        }
    }

    // 2. Non-K8s or Helm values.yaml / config.yaml / run_metadata.yaml extraction
    if (!isK8sWorkload || !model_name || !hardware_name || !accelerator_count || !inference_tool) {
        // Model name candidates
        const rawConfigModel =
            doc.model_name ||
            doc.modelName ||
            doc.model_id ||
            doc.modelId ||
            (typeof doc.model === 'string' ? doc.model : (doc.model?.name || doc.model?.model_name || doc.model?.id)) ||
            doc.server?.model_name ||
            doc.servingStack?.model?.name ||
            doc.vllm?.model ||
            doc.standalone?.model?.name ||
            doc.prefill?.model?.name ||
            doc.decode?.model?.name;
        if (rawConfigModel && typeof rawConfigModel === 'string' && !model_name) {
            const trimmedModel = rawConfigModel.trim();
            if (trimmedModel && trimmedModel.toLowerCase() !== 'unknown' && trimmedModel.toLowerCase() !== 'unknown model') {
                model_name = trimmedModel;
            }
        }

        // Hardware candidates
        const rawConfigHw =
            (typeof doc.hardware === 'string' ? doc.hardware : doc.hardware?.hardware_name || doc.hardware?.name || doc.hardware?.model) ||
            doc.hardware_name ||
            doc.accelerator ||
            doc.accelerator_type ||
            doc.device ||
            doc.kustomize?.acceleratorBackend ||
            doc.standalone?.acceleratorType?.labelValue ||
            doc.prefill?.acceleratorType?.labelValue ||
            doc.decode?.acceleratorType?.labelValue ||
            doc.nodeSelector?.['cloud.google.com/gke-accelerator'] ||
            doc.nodeSelector?.['nvidia.com/gpu.product'];
        if (rawConfigHw && typeof rawConfigHw === 'string' && !hardware_name) {
            hardware_name = normalizeManifestHardware(rawConfigHw);
        }

        // Accelerator count candidates
        const rawConfigCount =
            doc.accelerator_count ??
            doc.hardware?.accelerator_count ??
            doc.gpus ??
            doc.gpu_count ??
            doc.chip_count ??
            doc.chips ??
            doc.tensor_parallel_size ??
            doc.tp ??
            doc.standalone?.tp ??
            doc.vllm?.tensorParallelSize;
        if (rawConfigCount !== undefined && rawConfigCount !== null && !accelerator_count) {
            const parsedCount = parseInt(String(rawConfigCount), 10);
            if (Number.isFinite(parsedCount) && parsedCount > 0) {
                accelerator_count = parsedCount;
            }
        }

        // Inference tool & version candidates
        const rawTool =
            doc.inference_tool ||
            doc.engine ||
            doc.serving_engine ||
            doc.backend ||
            doc.servingStack?.engine;
        if (rawTool && typeof rawTool === 'string' && !inference_tool) {
            const { tool } = parseContainerImageMetadata(rawTool);
            inference_tool = tool || rawTool.trim();
        }

        const rawToolVer =
            doc.inference_tool_version ??
            doc.engine_version ??
            doc.serving_engine_version ??
            doc.servingStack?.version;
        if (
            rawToolVer !== undefined &&
            rawToolVer !== null &&
            (typeof rawToolVer === 'string' || typeof rawToolVer === 'number') &&
            !inference_tool_version
        ) {
            const verStr = String(rawToolVer).trim();
            if (verStr && verStr.toLowerCase() !== 'unknown') {
                inference_tool_version = verStr;
            }
        }

        // Container image inside Helm values (e.g. image.repository + image.tag or vllm.image)
        const helmImage =
            (typeof doc.image === 'string'
                ? doc.image
                : doc.image?.repository
                    ? `${doc.image.repository}${doc.image.tag ? `:${doc.image.tag}` : ''}`
                    : null) ||
            (typeof doc.vllm?.image === 'string' ? doc.vllm.image : null) ||
            (typeof doc.servingStack?.image === 'string' ? doc.servingStack.image : null);
        if (helmImage) {
            const { tool, version } = parseContainerImageMetadata(helmImage);
            if (tool && !inference_tool) inference_tool = tool;
            if (version && !inference_tool_version) inference_tool_version = version;
        }

        // Well-lit path
        const rawWellLit = doc.well_lit_path || doc.wellLitPath;
        if (rawWellLit && typeof rawWellLit === 'string' && !well_lit_path) {
            well_lit_path = rawWellLit.trim();
        }

        // Capture Helm serving stack values if present
        if (doc.servingStack || doc.vllm || doc.modelservice || doc.standalone || doc.prefill || doc.decode) {
            helm_ServingStack_values = doc.servingStack || {
                ...(doc.vllm ? { vllm: doc.vllm } : {}),
                ...(doc.modelservice ? { modelservice: doc.modelservice } : {}),
                ...(doc.standalone ? { standalone: doc.standalone } : {}),
                ...(doc.prefill ? { prefill: doc.prefill } : {}),
                ...(doc.decode ? { decode: doc.decode } : {}),
            };
        }
    }

    return {
        model_name,
        hardware_name,
        accelerator_count,
        inference_tool,
        inference_tool_version,
        well_lit_path,
        helm_ServingStack_values,
        kind: kind || null,
    };
}

/**
 * Extracts benchmark metadata from a K8s manifest, Helm values.yaml, config.yaml, or run_metadata.yaml.
 * Supports multi-document YAML streams (`---`).
 *
 * @param {string} filename
 * @param {string|object} content
 * @returns {{
 *   model_name: string|null,
 *   hardware_name: string|null,
 *   accelerator_count: number|null,
 *   inference_tool: string|null,
 *   inference_tool_version: string|null,
 *   well_lit_path: string|null,
 *   helm_ServingStack_values: object|null,
 *   manifests_extracted: Array<{ filename: string, kind: string|null }>
 * }}
 */
export function extractMetadataFromManifest(filename, content) {
    const emptyResult = {
        model_name: null,
        hardware_name: null,
        accelerator_count: null,
        inference_tool: null,
        inference_tool_version: null,
        well_lit_path: null,
        helm_ServingStack_values: null,
        manifests_extracted: [],
    };

    if (!content) return emptyResult;

    let docs = [];
    if (typeof content === 'object' && content !== null) {
        docs = Array.isArray(content) ? content : [content];
    } else if (typeof content === 'string') {
        const trimmed = content.trim();
        if (!trimmed) return emptyResult;
        try {
            if (filename && filename.toLowerCase().endsWith('.json')) {
                docs = [JSON.parse(trimmed)];
            } else {
                docs = yaml.loadAll(trimmed).filter(Boolean);
            }
        } catch {
            try {
                docs = [yaml.load(trimmed)].filter(Boolean);
            } catch {
                return emptyResult;
            }
        }
    }

    let model_name = null;
    let hardware_name = null;
    let accelerator_count = null;
    let inference_tool = null;
    let inference_tool_version = null;
    let well_lit_path = null;
    let helm_ServingStack_values = null;
    const manifests_extracted = [];

    for (const doc of docs) {
        if (!doc || typeof doc !== 'object') continue;
        const extracted = extractFromSingleDoc(doc);
        if (extracted.model_name && !model_name) model_name = extracted.model_name;
        if (extracted.hardware_name && !hardware_name) hardware_name = extracted.hardware_name;
        if (extracted.accelerator_count && !accelerator_count) accelerator_count = extracted.accelerator_count;
        if (extracted.inference_tool && !inference_tool) inference_tool = extracted.inference_tool;
        if (extracted.inference_tool_version && !inference_tool_version) {
            inference_tool_version = extracted.inference_tool_version;
        }
        if (extracted.well_lit_path && !well_lit_path) well_lit_path = extracted.well_lit_path;
        if (extracted.helm_ServingStack_values && !helm_ServingStack_values) {
            helm_ServingStack_values = extracted.helm_ServingStack_values;
        }
        manifests_extracted.push({
            filename: filename || 'manifest.yaml',
            kind: extracted.kind || 'Config',
        });
    }

    return {
        model_name,
        hardware_name,
        accelerator_count,
        inference_tool,
        inference_tool_version,
        well_lit_path,
        helm_ServingStack_values,
        manifests_extracted,
    };
}
