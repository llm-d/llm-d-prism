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

import React from 'react';
import { Zap, Cloud, FileJson, Target, ExternalLink, GitCompare } from 'lucide-react';

export const USE_CASE_META = {
    "Advanced Customer Support": "(~9k/256)",
    "Chatbot (ShareGPT)": "(~128/128)",
    "Code Completion": "(~512/32)",
    "Deep Research": "(~256/4k)",
    "Multi Agent Large Document Summarization": "(~8k/64)",
    "Text Generation": "(~512/2k)",
    "Text Summarization": "(~1k/128)"
};

export const INTEGRATIONS = [
    {
        id: 'google_giq',
        name: 'GIQ',
        type: 'GIQ',
        tags: ['Performance', 'Cost'],
        description: (
            <span>
                GKE Inference Quickstart (GIQ) for optimized AI inference stack benchmarks, provided by Google.{' '}
                <a 
                    href="https://docs.cloud.google.com/kubernetes-engine/docs/how-to/machine-learning/inference/inference-quickstart" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-blue-500 hover:underline inline-flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                >
                    Docs <ExternalLink size={10} />
                </a>
            </span>
        ),
        icon: Zap,
        color: 'text-yellow-500'
    },
    {
        id: 'llmd_results',
        name: 'llm-d Results Store',
        type: 'llm-d',
        tags: ['Performance', 'Official'],
        description: (
            <span>
                Official llm-d benchmark results parsed from their public{' '}
                <a 
                    href="https://drive.google.com/drive/folders/1r2Z2Xp1L0KonUlvQHvEzed8AO9Xj8IPm?usp=drive_link" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-blue-500 hover:underline inline-flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                >
                     Google Drive folder <ExternalLink size={10} />
                </a>.
            </span>
        ),
        icon: Cloud,
        color: 'text-blue-600'
    },
    {
        id: 'lpg_lifecycle',
        name: 'inference-perf',
        type: 'infperf',
        tags: ['Latency', 'Throughput'],
        description: 'Output from orchestrated inference-perf runs. Experimental feature.',
        icon: FileJson,
        color: 'text-green-500'
    },
    {
        id: 'local_sample',
        name: 'Local Sample Data',
        type: 'LOCAL',
        tags: ['Debug'],
        description: 'Local benchmarks and static development data.',
        icon: FileJson,
        color: 'text-slate-500'
    },
    {
        id: 'quality_scores',
        name: 'Quality Scores',
        type: 'Quality',
        tags: ['Quality', 'Benchmark'],
        description: 'Aggregate quality metrics from open quality leaderboards (Arena.ai, Simple Benchmark Viewer).',
        icon: Target,
        color: 'text-indigo-500'
    },
    {
        id: 'benchmark_report_v02',
        name: 'Local Benchmark Comparison',
        type: 'v0.2',
        tags: ['Local', 'Compare'],
        description: 'Upload local benchmark_report_v0.2 YAML files from llm-d-benchmark runs. Select a baseline and compare performance and observability metrics across runs.',
        icon: GitCompare,
        color: 'text-violet-500',
        alwaysExpanded: true,
    }
];

export const extractAcceleratorCount = (hardware) => {
    if (!hardware) return 1;
    const match = hardware.match(/\(x(\d+)\)/);
    return match ? parseInt(match[1]) : 1;
};

export const getAcceleratorCount = (d) => {
    if (d.metadata?.accelerator_count && d.metadata.accelerator_count > 1) return d.metadata.accelerator_count;
    return extractAcceleratorCount(d.hardware);
};

export const getBucket = (val) => {
    if (!val || val <= 0) return 'Unknown';
    if (val < 160) return '~128';
    if (val < 384) return '~256';
    if (val < 768) return '~512';
    if (val < 1536) return '~1k';
    if (val < 3072) return '~2k';
    if (val < 6144) return '~4k';
    if (val < 12288) return '~8k';
    if (val < 24576) return '~16k';
    if (val < 49152) return '~32k';
    if (val < 98304) return '~64k';
    return '~128k+';
};

export const getRatioType = (isl, osl) => {
    if (!isl || !osl) return 'Unknown';
    if (osl < 5) return "Pure Prefill";
    if (isl < 5) return "Pure Decode";
    
    const r = isl / osl;
    if (r >= 0.8 && r <= 1.25) return "Balanced (~1:1)";
    
    if (r > 1.25) {
        if (r > 32) return "Extreme Prefill (>32:1)";
        if (r > 10) return "Heavy Prefill (>10:1)";
        if (r > 2) return "Prefill Biased (>2:1)";
        return "Slightly Prefill Biased (>1.25:1)";
    } else {
        const inv = osl / isl;
        if (inv > 32) return "Extreme Decode (>1:32)";
        if (inv > 10) return "Heavy Decode (>1:10)";
        if (inv > 2) return "Decode Biased (>1:2)";
        return "Slightly Decode Biased (>1:1.25)";
    }
};

export const getEffectiveTp = (d) => {
    let val = d.metadata?.tensor_parallelism || d.metadata?.tp || d.tensor_parallelism || d.tp;
    
    if (!val && d.metadata?.configuration) {
        const config = d.metadata.configuration;
        const match = config.match(/TP(\d+)/i);
        if (match) val = match[1];
    }

    if (!val && d.model) {
        const match = d.model.match(/TP(\d+)/i);
        if (match) val = match[1];
    }
    
    if (!val) return null;
    
    const str = String(val);
    if (str.toUpperCase().startsWith('TP')) return str.toUpperCase();
    return `TP${str}`;
};

export const sortBuckets = (buckets) => {
    return buckets.sort((a, b) => {
        const parse = (s) => {
            let n = parseInt(s.replace('~', '').replace('k', '000').replace('+', ''));
            if (s.includes('k')) n = n; 
            const numeric = parseFloat(s.replace(/[^0-9.]/g, ''));
            if (s.includes('k')) return numeric * 1000;
            return numeric;
        };
        return parse(a) - parse(b);
    });
};

export const findParetoPoint = (dataset, xKey, yKey, minimizeX, maximizeY) => {
    if (!dataset || dataset.length === 0) return null;

    const xValues = dataset.map(d => {
        const val = d[xKey.split('.')[0]]?.[xKey.split('.')[1]] ?? d[xKey];
        return val;
    });
    const yValues = dataset.map(d => {
        const val = d[yKey.split('.')[0]]?.[yKey.split('.')[1]] ?? d[yKey];
        return val;
    });

    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);

    let bestPoint = null;
    let minDistance = Infinity;

    dataset.forEach(d => {
        const xVal = d[xKey.split('.')[0]]?.[xKey.split('.')[1]] ?? d[xKey];
        const yVal = d[yKey.split('.')[0]]?.[yKey.split('.')[1]] ?? d[yKey];

        const normX = (xVal - minX) / (maxX - minX || 1);
        const normY = (yVal - minY) / (maxY - minY || 1);

        const targetX = minimizeX ? 0 : 1;
        const targetY = maximizeY ? 1 : 0;

        const distance = Math.sqrt(Math.pow(normX - targetX, 2) + Math.pow(normY - targetY, 2));

        if (distance < minDistance) {
            minDistance = distance;
            bestPoint = { x: xVal, y: yVal, ...d };
        }
    });

    return bestPoint;
};

export const getParetoFrontier = (dataset, minimizeX, maximizeY) => {
    if (!dataset || dataset.length === 0) return [];
    
    const sorted = [...dataset].sort((a, b) => minimizeX ? a.vx - b.vx : b.vx - a.vx);
    
    const frontier = [];
    let bestY = maximizeY ? -Infinity : Infinity;
    
    sorted.forEach(d => {
        const isImprovement = maximizeY ? (d.vy > bestY) : (d.vy < bestY);
        if (isImprovement) {
            frontier.push(d);
            bestY = d.vy;
        }
    });
    
    return frontier;
};

export const getNodesAndType = (s) => {
    const disaggMatch = s.match(/^(\d+):\s+/);
    if (disaggMatch) {
        return { nodes: parseInt(disaggMatch[1]), type: 'disaggregated' };
    }
    
    const legacyDisagg = s.match(/(\d+)P(?:-TP\d+)?\s+(\d+)D(?:-TP\d+)?/);
    if (legacyDisagg) {
            return { nodes: parseInt(legacyDisagg[1]) + parseInt(legacyDisagg[2]), type: 'disaggregated' };
    }
    
    const aggMatch = s.match(/^(\d+)/);
    if (aggMatch) {
        return { nodes: parseInt(aggMatch[1]), type: 'aggregated' };
    }
    
    return { nodes: 0, type: 'unknown' };
};

export const getSourceTag = (d) => {
    if (!d || !d.source) return 'UNK';
    const s = d.source;
    if (s === 'local') return 'LOCAL';
    if (s.startsWith('giq:')) return 'GIQ';
    if (s.startsWith('gcs:')) return 'GCS';
    if (s.startsWith('lpg:') || s === 'infperf' || s === 'inference-perf') return 'infperf';
    if (s === 'llm-d-results:google_drive' || s === 'llmd_drive') return 'llm-d';
    if (s === 'quality_scores') return 'Quality';
    return s.split(':')[0].toUpperCase();
};

export const getSourceType = (d) => {
    if (!d) return 'Built-in';
    const s = typeof d === 'string' ? d : d.source;
    if (!s) return 'Built-in';
    
    if (s === 'local') return 'Built-in';
    if (s.startsWith('giq:')) return 'Cloud';
    if (s.startsWith('gcs:') || s.startsWith('aws:')) return 'Cloud';
    if (s.startsWith('lpg:') || s === 'infperf' || s === 'inference-perf') return 'Local';
    if (s.startsWith('brv02:')) return 'Local';
    if (s === 'llm-d-results:google_drive' || s === 'llmd_drive') return 'Built-in';
    if (s === 'quality_scores') return 'Built-in';
    
    return 'Built-in';
};

export const getIntegrationSourceType = (id) => {
    switch (id) {
        case 'google_giq':
            return 'Cloud';
        case 'llmd_results':
            return 'Built-in';
        case 'lpg_lifecycle':
            return 'Local';
        case 'local_sample':
            return 'Built-in';
        case 'quality_scores':
            return 'Built-in';
        case 'benchmark_report_v02':
            return 'Local';
        default:
            return 'Built-in';
    }
};

export const getSourceTypeStyle = (type) => {
    switch (type) {
        case 'Local':
            return {
                bg: 'bg-amber-100 dark:bg-amber-950/40',
                text: 'text-amber-800 dark:text-amber-400',
                border: 'border-amber-200 dark:border-amber-900/30'
            };
        case 'Cloud':
            return {
                bg: 'bg-cyan-100 dark:bg-cyan-950/40',
                text: 'text-cyan-800 dark:text-cyan-400',
                border: 'border-cyan-200 dark:border-cyan-900/30'
            };
        case 'Built-in':
        default:
            return {
                bg: 'bg-emerald-100 dark:bg-emerald-950/40',
                text: 'text-emerald-800 dark:text-emerald-400',
                border: 'border-emerald-200 dark:border-emerald-900/30'
            };
    }
};

export const formatOriginLabel = (origin) => {
    if (!origin) return 'Unknown Origin';
    if (origin === 'local_disk') return 'LOCAL: local_disk';
    if (origin === 'drag-and-drop') return 'LOCAL: drag-and-drop';
    if (origin.startsWith('lpg:')) return `infperf: ${origin.substring(4)}`;
    if (origin.startsWith('infperf:')) return origin; 
    if (origin === 'llm-d-results:google_drive' || origin === 'llmd_drive') return 'llm-d Results Store';
    if (origin.startsWith('gcs:')) return `GCS: ${origin.substring(4)}`;
    if (origin.startsWith('brv02:')) return `BRV0.2: ${origin.substring(6)}`;

    if (origin.startsWith('giq:')) return `GIQ: ${origin.substring(4)}`;
    if (origin === 'quality_scores') return 'Quality: Leaderboards';
    return origin;
};

export const getBenchmarkKey = (d) => {
    if (!d) return 'unknown';
    
    // For local BRV02 benchmark runs, group them as a single run instead of by stage.
    if (d.source && d.source.startsWith('brv02:')) {
        return d.source;
    }
    
    // For raw ad-hoc file imports (like drag and drop), keep them separated by filename
    if (d.source === 'local' && (d.source_info?.origin === 'drag-and-drop' || d.source_info?.origin === 'local_disk')) {
        const filename = d.source_info?.file_identifier || d.filename || 'unknown';
        return `file:${d.source}:${filename}`;
    }
    
    const source = d.source || 'unknown';
    const origin = d.source_info?.origin || 'unknown';
    const model = d.model_name || d.model || 'unknown';
    const hardware = d.hardware || d.metadata?.hardware || 'unknown';
    const tp = getEffectiveTp(d) || 'TP1';
    // For disaggregated benchmarks, pd_ratio differentiates configs like 3:1, 2:1, 2:2, etc.
    // For standard benchmarks it's 'Aggregated', keeping grouping unchanged.
    const pdRatio = d.pd_ratio || d.metadata?.pd_ratio || 'Aggregated';
    // accelerator_count distinguishes 1-node vs 2-node vs 3-node configs with the same per-node TP
    // e.g. 1xTP8 (8 chips) vs 2xTP8 (16 chips) have same tp='TP8' but different chip counts
    const chips = d.accelerator_count || d.metadata?.accelerator_count || 1;
    const isl = d.workload?.input_tokens || d.isl || 0;
    const osl = d.workload?.output_tokens || d.osl || 0;

    // Use binned tokens for the key to handle noisy ISL/OSL
    const bucketedIsl = getBucket(isl);
    const bucketedOsl = getBucket(osl);

    // Return the final grouping key: source::origin::model::hardware::chips::tp::pdRatio::islxosl
    // - Model at index [2]: required for selectedModels derivation via split('::')[2]
    // - chips: total accelerator count, distinguishes multi-node configs with same per-node TP
    // - tp: per-node tensor parallelism
    // - pdRatio: differentiates disaggregated P/D node split configurations
    return `${source}::${origin}::${model}::${hardware}::${chips}::${tp}::${pdRatio}::${bucketedIsl}x${bucketedOsl}`;
};
