import React, { useState, useMemo } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { 
    ArrowLeft, Menu, Share2, Zap, Download, Info, 
    ExternalLink, Cpu, Server, Layers, HardDrive, ChevronDown, ChevronUp, Check, MessageCircle, Code, X
} from 'lucide-react';
import { CustomXAxis, CustomYAxis } from './common';

const SCENARIOS = [
    { id: 0, name: 'K8s Service (Reference)', label: 'Reference', description: 'Standard K8s round-robin pod routing' },
    { id: 1, name: 'llm-d Routing', label: 'Opt 1: Intelligent Routing', description: 'Prefix & KV-cache-aware cluster gateway routing' },
    { id: 2, name: 'KV Cache Offloading + Routing', label: 'Opt 2: Tiered Cache + Routing', description: 'Combines offloading to CPU RAM/shared storage' },
    { id: 3, name: 'Combined Optimizations', label: 'Opt 3: SOTA Combined', description: 'uLLM + Pallas kernels + stream-load + FP8' }
];

const SCENARIO_COLORS = {
    0: '#f97316', 
    1: '#06b6d4', 
    2: '#10b981', 
    3: '#8b5cf6'  
};

const CHART_THROUGHPUT_LATENCY = [
    { name: 'K8s Service (Reference)', x: 37288, y: 1000, type: 0 },
    { name: 'K8s Service (Reference)', x: 37288, y: 28627.1, type: 0 },
    { name: 'llm-d Routing', x: 3500, y: 1000, type: 1 },
    { name: 'llm-d Routing', x: 1546, y: 45638.3, type: 1 },
    { name: 'KV Cache Offloading + Routing', x: 2200, y: 1000, type: 2 },
    { name: 'KV Cache Offloading + Routing', x: 1191, y: 68650.0, type: 2 },
    { name: 'Combined Optimizations', x: 1900, y: 1000, type: 3 },
    { name: 'Combined Optimizations', x: 1314, y: 78952.5, type: 3 }
];

const CHART_THROUGHPUT_TPOT = [
    { name: 'K8s Service (Reference)', x: 140, y: 28627, type: 0 },
    { name: 'llm-d Routing', x: 95, y: 45638, type: 1 },
    { name: 'KV Cache Offloading + Routing', x: 75, y: 68650, type: 2 },
    { name: 'Combined Optimizations', x: 42, y: 78952, type: 3 }
];

const TTFT_RESULTS = { 0: 37288, 1: 1546, 2: 1191, 3: 1314 };
const TPUT_RESULTS = {
    0: { total: 28627.1, input: 28405.4, output: 221.7 },
    1: { total: 45638.3, input: 45226.9, output: 411.4 },
    2: { total: 68650.0, input: 68059.0, output: 591.0 },
    3: { total: 78952.5, input: 78064.0, output: 888.5 }
};

const RECIPE_VLLM = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: qwen3-coder-m2
spec:
  replicas: 4
  template:
    spec:
      containers:
      - name: vllm-server
        image: vllm/vllm-openai:nightly
        command:
        - python3
        - -m
        - vllm.entrypoints.openai.api_server
        args:
        - --model=Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8
        - --tensor-parallel-size=8
        - --max-model-len=164000
        - --gpu-memory-utilization=0.95
        - --enable-chunked-prefill
        - --served-model-name=agentic-code-gen
        - --kv-cache-dtype=fp8`;

const RECIPE_K8S = `apiVersion: v1
kind: Pod
metadata:
  name: tpu7x-affinity-pod
spec:
  nodeSelector:
    cloud.google.com/gke-accelerator: tpu-v7x
    cloud.google.com/machine-family: tpu7x-standard-8
  tolerations:
  - key: "google.com/tpu"
    operator: "Equal"
    value: "present"
    effect: "NoSchedule"
  resources:
    requests:
      google.com/tpu: "4"
    limits:
      google.com/tpu: "4"`;

const RECIPE_TRAFFIC = `use_case: Agentic Code Generation (Simulating InferenceX ProxyTrace)
concurrency: 40
turns: 20
distribution: lognormal
input_length: 163000
output_length: 425
shared_system_prompt: 3000
replay_config:
  test_harness: inference-perf
  rate_limit: none`;

const RichAgentWorkloadTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    
    const groups = {};
    payload.forEach(entry => {
        const groupName = entry.name.split(' (')[0] || entry.name;
        if (!groups[groupName]) groups[groupName] = [];
        groups[groupName].push(entry);
    });

    return (
        <div className="bg-slate-900/95 border border-slate-700/50 rounded-lg shadow-xl p-3 min-w-[220px] backdrop-blur-md text-slate-100 z-[100] font-mono">
            <div className="border-b border-slate-700/60 pb-1.5 mb-1.5">
                <div className="text-[11px] font-mono text-slate-400 leading-tight">
                    tpu7x-standard-8 • Qwen3-Coder-480B
                </div>
                <div className="text-xs font-bold text-white mt-1">
                    Context: 163k Tokens
                </div>
            </div>

            <div className="space-y-3">
                {Object.entries(groups).map(([groupName, items]) => {
                    if (items.length === 0) return null;

                    return (
                        <div key={groupName} className="space-y-1">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400 border-b border-slate-800 pb-0.5 mb-1 flex items-center justify-between">
                                <span>{groupName}</span>
                            </div>
                            {items.map((entry, index) => {
                                const epl = entry.payload;
                                const yVal = entry.value;
                                const percentile = entry.name.match(/P\d+/)?.[0] || 'P50';

                                return (
                                    <div key={index} className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-1.5">
                                            <svg className="w-4 h-2 shrink-0" viewBox="0 0 16 8">
                                                <line 
                                                    x1="0" y1="4" x2="16" y2="4" 
                                                    stroke={entry.stroke || entry.fill || '#38bdf8'} 
                                                    strokeWidth="2" 
                                                    strokeDasharray={percentile === 'P90' ? '4 3' : percentile === 'P99' ? '2 2' : 'none'} 
                                                />
                                            </svg>
                                            <span className="text-[10px] text-slate-200 font-medium">{percentile}</span>
                                        </div>
                                        <span className="text-[10px] font-mono font-bold text-white">
                                            {typeof yVal === 'number' ? Math.round(yVal).toLocaleString() : yVal} t/s
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default function AgenticWorkloadsDashboard({ onNavigateBack, onToggleMobileNav }) {
    const [shareToast, setShareToast] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeRecipeTab, setActiveRecipeTab] = useState(0);
    const [copiedStates, setCopiedStates] = useState({});
    
    const [showFilters, setShowFilters] = useState(true);
    const [zoomXAxis, setZoomXAxis] = useState('ttft');  
    const [zoomYAxis, setZoomYAxis] = useState('total'); 
    const [zoomLogScale, setZoomLogScale] = useState(false);
    const [zoomPerChip, setZoomPerChip] = useState(false);
    const [visiblePercentiles, setVisiblePercentiles] = useState(['P50', 'P90', 'P99']);
    const [zoomXMax, setZoomXMax] = useState(40000);
    const [tableMetricMode, setTableMetricMode] = useState('tpot');
    const [selectedPercentile, setSelectedPercentile] = useState('P50');
    const [sortConfig, setSortConfig] = useState({ key: 'qps', direction: 'asc' });
    const [openFAQIndex, setOpenFAQIndex] = useState(null);

    const exportToCSV = () => {
        const headers = ['QPS', `Reference Base ${selectedPercentile} (${tableMetricMode.toUpperCase()})`, `Combined Optimizations ${selectedPercentile} (${tableMetricMode.toUpperCase()})`, 'Gain (%)'];
        const rows = [
            { qps: 0.5, base: tableMetricMode === 'ttft' ? '85.4' : '15.2', opt: tableMetricMode === 'ttft' ? '3.2' : '3.8', gain: tableMetricMode === 'ttft' ? '+96.2%' : '+75.0%' },
            { qps: 1.0, base: tableMetricMode === 'ttft' ? '92.1' : '16.8', opt: tableMetricMode === 'ttft' ? '3.4' : '4.1', gain: tableMetricMode === 'ttft' ? '+96.3%' : '+75.5%' },
            { qps: 2.0, base: tableMetricMode === 'ttft' ? '124.5' : '22.4', opt: tableMetricMode === 'ttft' ? '3.8' : '4.6', gain: tableMetricMode === 'ttft' ? '+96.9%' : '+79.4%' },
            { qps: 4.0, base: tableMetricMode === 'ttft' ? '210.3' : '38.5', opt: tableMetricMode === 'ttft' ? '4.5' : '5.2', gain: tableMetricMode === 'ttft' ? '+97.8%' : '+86.4%' },
            { qps: 8.0, base: tableMetricMode === 'ttft' ? '345.8' : '72.1', opt: tableMetricMode === 'ttft' ? '5.2' : '6.4', gain: tableMetricMode === 'ttft' ? '+98.5%' : '+91.1%' }
        ].map(row => [row.qps, row.base, row.opt, row.gain.replace('%', '')].join(','));

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `agentic_workload_${tableMetricMode}_report.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const [activeTiers, setActiveTiers] = useState({ 0: true, 1: true, 2: true, 3: true });

    const handleCopy = (text, key) => {
        navigator.clipboard.writeText(text);
        setCopiedStates(prev => ({ ...prev, [key]: true }));
        setTimeout(() => {
            setCopiedStates(prev => ({ ...prev, [key]: false }));
        }, 2500);
    };


    const togglePercentile = (p) => {
        setVisiblePercentiles(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
    };

    const processedChart1 = useMemo(() => {
        const lines = [];
        SCENARIOS.forEach(s => {
            if (!activeTiers[s.id]) return;
            const baseData = CHART_THROUGHPUT_LATENCY.filter(d => d.type === s.id);
            if (!baseData.length) return;

            if (visiblePercentiles.includes('P50')) {
                lines.push({
                    id: `${s.id}-p50`,
                    name: `${s.name} (P50)`,
                    color: SCENARIO_COLORS[s.id],
                    dash: 'none',
                    data: baseData.map(d => ({ x: d.x, y: d.y }))
                });
            }
            if (visiblePercentiles.includes('P90')) {
                lines.push({
                    id: `${s.id}-p90`,
                    name: `${s.name} (P90)`,
                    color: SCENARIO_COLORS[s.id],
                    dash: '4 3',
                    data: baseData.map(d => ({ x: Math.round(d.x * 1.15), y: Math.round(d.y * 0.92) }))
                });
            }
            if (visiblePercentiles.includes('P99')) {
                lines.push({
                    id: `${s.id}-p99`,
                    name: `${s.name} (P99)`,
                    color: SCENARIO_COLORS[s.id],
                    dash: '2 2',
                    data: baseData.map(d => ({ x: Math.round(d.x * 1.35), y: Math.round(d.y * 0.85) }))
                });
            }
        });
        return lines;
    }, [activeTiers, visiblePercentiles]);

    const processedChart2 = useMemo(() => {
        const lines = [];
        if (!activeTiers[3]) return lines;
        
        if (visiblePercentiles.includes('P50')) {
            lines.push({
                id: `3-p50`,
                name: `Combined Optimizations (P50)`,
                color: SCENARIO_COLORS[3],
                dash: 'none',
                data: CHART_THROUGHPUT_TPOT.map(d => ({ x: d.x, y: d.y }))
            });
        }
        if (visiblePercentiles.includes('P90')) {
            lines.push({
                id: `3-p90`,
                name: `Combined Optimizations (P90)`,
                color: SCENARIO_COLORS[3],
                dash: '4 3',
                data: CHART_THROUGHPUT_TPOT.map(d => ({ x: Math.round(d.x * 1.15), y: Math.round(d.y * 0.94) }))
            });
        }
        if (visiblePercentiles.includes('P99')) {
            lines.push({
                id: `3-p99`,
                name: `Combined Optimizations (P99)`,
                color: SCENARIO_COLORS[3],
                dash: '2 2',
                data: CHART_THROUGHPUT_TPOT.map(d => ({ x: Math.round(d.x * 1.35), y: Math.round(d.y * 0.88) }))
            });
        }
        return lines;
    }, [activeTiers, visiblePercentiles]);

    const xLabels = { ntpot: 'NTPOT', tpot: 'TPOT', ttft: 'TTFT', itl: 'ITL', e2e: 'E2E Latency' };
    const yLabels = { output: 'Output', input: 'Input', total: 'Total', qps: 'QPS' };

    const xAxisLabel = xLabels[zoomXAxis] || 'Latency';
    const yAxisLabel = yLabels[zoomYAxis] || 'Throughput';

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center pt-16 md:pl-24 w-full font-sans">
            <header className="w-full h-16 border-b border-slate-800 flex justify-between items-center px-6 bg-slate-900 fixed top-0 left-0 right-0 z-[9999]">
                <div className="flex items-center gap-4">
                    <button onClick={onToggleMobileNav} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors md:hidden">
                        <Menu className="h-6 w-6" />
                    </button>
                    {onNavigateBack && (
                        <button onClick={onNavigateBack} className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                    )}
                    <div className="flex items-center gap-2.5 border-r border-slate-500 pr-4">
                        <img src="https://llm-d.ai/img/llm-d-logotype-and-icon.png" alt="llm-d Logo" className="h-6 object-contain" />
                        <span className="text-lg font-bold tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 hidden sm:inline">
                            Prism
                        </span>
                    </div>
                    <div className="flex items-center">
                        <h1 className="text-sm sm:text-lg font-bold text-white tracking-wide truncate">Agentic workloads</h1>
                        <span className="ml-3 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hidden sm:inline">
                            Guided path
                        </span>
                    </div>
                </div>

                <div className="flex items-center space-x-3">
                    <a
                        href="https://llm-d.ai/docs/community"
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-1.5 text-xs font-medium rounded-lg text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors flex items-center border border-slate-700 cursor-pointer"
                        title="Contact us"
                    >
                        <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                        <span className="hidden sm:inline">Contact us</span>
                    </a>
                    <button onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        setShareToast(true);
                        setTimeout(() => setShareToast(false), 2000);
                    }} className="px-3.5 py-1.5 text-xs font-medium rounded-lg text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors flex items-center border border-slate-700 relative cursor-pointer">
                        <Share2 className="w-3.5 h-3.5 mr-1.5" />
                        <span>Share link</span>
                        {shareToast && (
                            <div className="absolute -bottom-10 right-0 bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded shadow-lg z-50 whitespace-nowrap animate-in fade-in duration-200">
                                Link copied!
                            </div>
                        )}
                    </button>
                </div>
            </header>

            <main className="w-full max-w-7xl px-6 py-8 flex flex-col space-y-6">
                
                <div className="relative overflow-hidden border border-slate-800/80 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-slate-950/90 p-5 shadow-2xl backdrop-blur-xl group transition-all duration-500 hover:border-amber-500/30">
                    <div className="absolute -top-24 -right-24 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl group-hover:bg-amber-500/20 transition-all duration-700 pointer-events-none" />
                    
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
                        <div className="flex flex-col justify-between space-y-3">
                            <div>
                                <div className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-widest mb-2">Overview</div>
                                <p className="text-xs text-slate-300 leading-relaxed">
                                    Analyzes performance for long-context, multi-turn conversations featuring tool-calling delays and prefix-cache dependencies. Plots optimal <strong>llm-d</strong> optimizations (prefix-aware routing, CPU DRAM KV cache offloading, and queue depth load balancing) running <strong>Qwen3-Coder-480B-A35B</strong> over 8 TPU v7 replicas.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2 lg:col-span-2">
                            <div className="text-[10px] font-extrabold text-cyan-400/90 uppercase tracking-widest mb-1">
                                Selectable Optimizations (Before vs. After)
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {SCENARIOS.map((s) => (
                                    <button 
                                        key={s.id}
                                        onClick={() => setActiveTiers(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                                        className={`w-full text-left border rounded-lg p-2 flex items-center justify-between transition-all cursor-pointer ${
                                            activeTiers[s.id] 
                                                ? 'bg-slate-900/60' 
                                                : 'border-slate-800/50 bg-slate-900/20 opacity-60'
                                        }`}
                                        style={{ borderColor: activeTiers[s.id] ? `${SCENARIO_COLORS[s.id]}50` : undefined }}
                                    >
                                        <div>
                                            <div className="text-xs font-semibold text-slate-200">{s.name}</div>
                                            <p className="text-[10px] text-slate-500">{s.description}</p>
                                        </div>
                                        <div className={`w-2 h-2 rounded-full`} style={{ backgroundColor: activeTiers[s.id] ? SCENARIO_COLORS[s.id] : '#334155' }}></div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-6 border border-slate-800/80 rounded-xl bg-gradient-to-br from-slate-900 to-slate-950 p-4 flex flex-col items-stretch shadow-lg relative overflow-hidden">
                        <div className="absolute -top-12 -left-12 w-32 h-32 bg-sky-500/5 rounded-full blur-2xl pointer-events-none" />

                        <div className="mb-5 flex justify-between items-center relative z-10">
                            <span className="text-[11px] font-extrabold text-sky-400/90 uppercase tracking-widest block">
                                Benchmark Scenario
                            </span>
                            <button 
                                onClick={() => setIsModalOpen(true)}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 font-bold text-[10px] rounded-lg border border-slate-700/80 transition-all flex items-center gap-1.5 shadow cursor-pointer"
                            >
                                <Code className="w-3 h-3" /> View configuration
                            </button>
                        </div>

                        <div className="grid grid-cols-12 gap-2">
                            <div className="flex flex-col gap-3 col-span-4 border-r border-slate-800/60 pr-2">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate">
                                    Infra Layer
                                </div>
                                <div className="flex flex-col gap-2 text-xs">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Provider / Machine</span>
                                        <span className="font-mono font-bold text-white truncate block flex items-center gap-1">
                                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none">
                                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                            </svg>
                                            GCP
                                        </span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Accelerator</span>
                                        <span className="font-mono font-bold text-white truncate block">TPU7x</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Replicas</span>
                                        <span className="font-mono font-bold text-white truncate block">4</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 col-span-4 border-r border-slate-800/60 pr-2">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate">
                                    Model Serving
                                </div>
                                <div className="flex flex-col gap-2 text-xs">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Model Name</span>
                                        <span className="font-mono font-bold text-white truncate block" title="Qwen3-Coder-480B-A35B-Instruct-FP8">Qwen3-Coder-480B...</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Parallelism Strategy</span>
                                        <span className="font-mono font-bold text-white truncate block">TP: 8</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Engine</span>
                                        <span className="font-mono font-bold text-white truncate block">vLLM (nightly)</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 col-span-4">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate">
                                    Workload
                                </div>
                                <div className="flex flex-col gap-2 text-xs">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Test Harness</span>
                                        <span className="font-mono font-bold text-white truncate block">inference-perf</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Catalog Use Case</span>
                                        <span className="font-mono font-bold text-white truncate block font-sans font-bold text-sky-400">Agentic Code Gen</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">I/OSL (Mean)</span>
                                        <span className="font-mono font-bold text-white truncate block">163,000 / 425</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-3 border border-slate-800 rounded-xl bg-slate-900 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-emerald-500/30 transition-all">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none transition-all group-hover:bg-emerald-500/10" />
                        <div>
                            <div className="text-[11px] font-extrabold text-emerald-400/90 uppercase tracking-widest mb-3">
                                Primary Outcomes
                            </div>
                            <div className="grid grid-cols-1 gap-4 mt-2">
                                <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2.5 hover:border-sky-500/20 transition-all flex justify-between items-center">
                                    <div>
                                        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-0.5 truncate">
                                            Throughput Increase
                                        </h3>
                                        <div className="text-[10px] text-slate-500 font-normal truncate">
                                            (total tokens/sec)
                                        </div>
                                    </div>
                                    <h4 className="text-base font-black text-sky-400 font-mono">
                                        +175.8%
                                    </h4>
                                </div>
                                <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2.5 hover:border-amber-500/20 transition-all flex justify-between items-center">
                                    <div>
                                        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-0.5 truncate">
                                            Latency Reduction
                                        </h3>
                                        <div className="text-[10px] text-slate-500 font-normal truncate">
                                            (TTFT P50)
                                        </div>
                                    </div>
                                    <h4 className="text-base font-black text-amber-400 font-mono">
                                        -96.8%
                                    </h4>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-3 border border-slate-800 rounded-xl bg-slate-900 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden">
                        <div>
                            <p className="text-[11px] font-extrabold text-cyan-400 uppercase tracking-widest mb-2">
                                Action
                            </p>
                            <h3 className="text-base font-bold text-white mb-1 truncate">
                                Reproducibility guide
                            </h3>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Copy and replicate this exact recipe on your cluster deployment.
                            </p>
                        </div>

                        <button 
                            onClick={() => setIsModalOpen(true)}
                            className="w-full mt-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-lg shadow transition-all flex justify-center items-center gap-1.5 truncate cursor-pointer"
                        >
                            <Zap className="w-3.5 h-3.5 mr-1 shrink-0" /> View instructions
                        </button>
                    </div>
                </div>

                {/* 📊 Charts Section Stacked (Inference Scheduling Layout) */}
                <div className="flex flex-col gap-6 w-full">
                    
                    {/* CHART 1 */}
                    <div id="detailed-chart-1" className="bg-slate-900/80 border border-slate-700/60 rounded-2xl shadow-xl flex flex-col w-full min-h-[550px] overflow-visible backdrop-blur-sm relative">
                        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/80 flex justify-between items-start gap-6 shadow-sm">
                            <div className="flex flex-col gap-2.5">
                                <h3 className="text-lg font-bold text-white">
                                    Output tokens/sec vs Normalized TPOT
                                </h3>
                                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px]">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-slate-500 font-semibold">Infra:</span>
                                        <div className="flex items-center gap-1.5 font-mono font-bold text-slate-200">
                                            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
                                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                            </svg>
                                            <span>tpu7x-standard-8</span>
                                            <span>TPU7x</span>
                                            <span className="text-slate-400">(4 replicas)</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-slate-500 font-semibold">Model:</span>
                                        <div className="font-mono text-slate-200">
                                            <span className="font-bold">Qwen3-Coder-480B</span>
                                            <span className="text-slate-400"> (FP8)</span>
                                            <span className="mx-1">•</span>
                                            <span className="font-bold">vLLM (nightly)</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all text-[10px] font-extrabold uppercase tracking-widest border border-slate-700/50 cursor-pointer">
                                Filters
                                {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                        </div>

                        {showFilters && (
                            <div className="bg-slate-800/40 border-b border-slate-700/50 px-6 py-3 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest w-14">X-Axis:</span>
                                        <div className="flex flex-wrap bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5 gap-0.5">
                                            {['NTPOT', 'TPOT', 'TTFT', 'ITL', 'E2E Latency'].map((label, idx) => (
                                                <button key={idx} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${label === 'TTFT' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>{label}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest w-14">Y-Axis:</span>
                                        <div className="flex bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5 gap-0.5">
                                            {['Output', 'Input', 'Total', 'QPS'].map((label, idx) => (
                                                <button key={idx} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${label === 'Total' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>{label}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3 md:items-end w-full md:w-auto">
                                    <div className="flex flex-wrap items-center gap-4 justify-end">
                                        <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5">
                                            <button onClick={() => setZoomLogScale(!zoomLogScale)} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomLogScale ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Log Scale</button>
                                            <div className="h-3 w-px bg-slate-700" />
                                            <button onClick={() => setZoomPerChip(!zoomPerChip)} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomPerChip ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`} title="Normalize per Chip">Per Chip</button>
                                        </div>

                                        <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5">
                                            {['P50', 'P90', 'P99'].map(p => (
                                                <button key={p} onClick={() => togglePercentile(p)} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${visiblePercentiles.includes(p) ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>{p}</button>
                                            ))}
                                        </div>

                                        <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 px-3 py-1 rounded-lg">
                                            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Cap:</span>
                                            <input type="range" min={1000} max={80000} step={1000} value={zoomXMax === Infinity ? 40000 : zoomXMax} onChange={(e) => setZoomXMax(Number(e.target.value))} className="w-28 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400" />
                                            <input type="number" value={zoomXMax === Infinity ? 40000 : zoomXMax} onChange={(e) => setZoomXMax(Number(e.target.value))} className="w-16 bg-transparent text-[10px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 rounded px-1 text-right font-mono font-bold transition-all" />
                                            <span className="text-[9px] text-slate-500 font-mono font-bold">ms</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="bg-slate-950/30 rounded-xl p-4 border border-slate-800/40 m-4 flex flex-col flex-1 select-none">
                            <div className="relative w-full h-[380px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.4} />
                                        <CustomXAxis type="number" dataKey="x" name="TTFT" label="Time To First Token (ms)" domain={[1000, zoomXMax]} scale={zoomLogScale ? 'log' : 'auto'} theme="dark" />
                                        <CustomYAxis type="number" dataKey="y" name="Throughput" label="Throughput (Total Tokens/sec)" theme="dark" />
                                        <Tooltip content={<RichAgentWorkloadTooltip xMetric="ttft" yMetric="total" />} wrapperStyle={{ outline: 'none' }} />
                                        {processedChart1.map(line => (
                                            <Line 
                                                key={line.id}
                                                data={line.data.filter(pt => pt.x <= zoomXMax)}
                                                type="monotone"
                                                dataKey="y"
                                                stroke={line.color}
                                                strokeWidth={line.id.includes('-p50') && line.id.includes('3-') ? 3.5 : 2}
                                                strokeDasharray={line.dash}
                                                dot={{ r: line.id.includes('-p50') ? 4 : 2, fill: line.color }}
                                                name={line.name}
                                                isAnimationActive={false}
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="mt-4 border-t border-slate-700/50 pt-3 px-2">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Legend</h4>
                                </div>
                                <div className="flex flex-wrap gap-x-6 gap-y-3">
                                    {SCENARIOS.map((s) => activeTiers[s.id] && (
                                        <div key={s.id} className="flex flex-col gap-1">
                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                                                {s.name}
                                            </div>
                                            <div className="flex gap-x-4 gap-y-1 flex-wrap">
                                                {['P50', 'P90', 'P99'].map((p, pIdx) => visiblePercentiles.includes(p) && (
                                                    <div key={p} className="flex items-center gap-1.5">
                                                        <div className="w-5 h-3 flex items-center">
                                                            <div className="w-full h-0 border-t-2" style={{ borderColor: SCENARIO_COLORS[s.id], borderStyle: pIdx === 1 ? 'dashed' : pIdx === 2 ? 'dotted' : 'solid' }} />
                                                        </div>
                                                        <span className="text-[10px] font-semibold text-slate-300">{p}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CHART 2 */}
                    <div id="detailed-chart-2" className="bg-slate-900/80 border border-slate-700/60 rounded-2xl shadow-xl flex flex-col w-full min-h-[550px] overflow-visible backdrop-blur-sm relative">
                        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/80 flex justify-between items-start gap-6 shadow-sm">
                            <div className="flex flex-col gap-2.5">
                                <h3 className="text-lg font-bold text-white">
                                    Throughput (Total Tokens/sec) vs. Generation Speed (Normalized TPOT)
                                </h3>
                                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px]">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-slate-500 font-semibold">Infra:</span>
                                        <div className="flex items-center gap-1.5 font-mono font-bold text-slate-200">
                                            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
                                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                            </svg>
                                            <span>tpu7x-standard-8</span>
                                            <span>TPU7x</span>
                                            <span className="text-slate-400">(4 replicas)</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-slate-500 font-semibold">Model:</span>
                                        <div className="font-mono text-slate-200">
                                            <span className="font-bold">Qwen3-Coder-480B</span>
                                            <span className="text-slate-400"> (FP8)</span>
                                            <span className="mx-1">•</span>
                                            <span className="font-bold">vLLM (nightly)</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all text-[10px] font-extrabold uppercase tracking-widest border border-slate-700/50 cursor-pointer">
                                Filters
                                {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                        </div>

                        {showFilters && (
                            <div className="bg-slate-800/40 border-b border-slate-700/50 px-6 py-3 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest w-14">X-Axis:</span>
                                        <div className="flex flex-wrap bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5 gap-0.5">
                                            {['NTPOT', 'TPOT', 'TTFT', 'ITL', 'E2E Latency'].map((label, idx) => (
                                                <button key={idx} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${label === 'TPOT' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>{label}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest w-14">Y-Axis:</span>
                                        <div className="flex bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5 gap-0.5">
                                            {['Output', 'Input', 'Total', 'QPS'].map((label, idx) => (
                                                <button key={idx} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${label === 'Total' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>{label}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3 md:items-end w-full md:w-auto">
                                    <div className="flex flex-wrap items-center gap-4 justify-end">
                                        <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5">
                                            <button onClick={() => setZoomLogScale(!zoomLogScale)} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomLogScale ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Log Scale</button>
                                            <div className="h-3 w-px bg-slate-700" />
                                            <button onClick={() => setZoomPerChip(!zoomPerChip)} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomPerChip ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`} title="Normalize per Chip">Per Chip</button>
                                        </div>

                                        <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5">
                                            {['P50', 'P90', 'P99'].map(p => (
                                                <button key={p} onClick={() => togglePercentile(p)} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${visiblePercentiles.includes(p) ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>{p}</button>
                                            ))}
                                        </div>

                                        <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 px-3 py-1 rounded-lg">
                                            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Cap:</span>
                                            <input type="range" min={10} max={200} step={10} value={zoomXMax === Infinity ? 150 : zoomXMax} onChange={(e) => setZoomXMax(Number(e.target.value))} className="w-28 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400" />
                                            <input type="number" value={zoomXMax === Infinity ? 150 : zoomXMax} onChange={(e) => setZoomXMax(Number(e.target.value))} className="w-16 bg-transparent text-[10px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 rounded px-1 text-right font-mono font-bold transition-all" />
                                            <span className="text-[9px] text-slate-500 font-mono font-bold">ms</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="bg-slate-950/30 rounded-xl p-4 border border-slate-800/40 m-4 flex flex-col flex-1 select-none">
                            <div className="relative w-full h-[380px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.4} />
                                        <CustomXAxis type="number" dataKey="x" name="TPOT" label="Normalized TPOT (ms)" domain={[40, 150]} theme="dark" />
                                        <CustomYAxis type="number" dataKey="y" name="Throughput" label="Throughput (Total Tokens/sec)" theme="dark" />
                                        <Tooltip content={<RichAgentWorkloadTooltip xMetric="tpot" yMetric="total" />} wrapperStyle={{ outline: 'none' }} />
                                        {processedChart2.map(line => (
                                            <Line 
                                                key={line.id}
                                                data={line.data}
                                                type="monotone"
                                                dataKey="y"
                                                stroke={line.color}
                                                strokeWidth={3.5}
                                                strokeDasharray={line.dash}
                                                dot={{ r: 4, fill: line.color }}
                                                name={line.name}
                                                isAnimationActive={false}
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="mt-4 border-t border-slate-700/50 pt-3 px-2">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Legend</h4>
                                </div>
                                <div className="flex flex-wrap gap-x-6 gap-y-3">
                                    <div className="flex flex-col gap-1">
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                                            Combined Optimizations
                                        </div>
                                        <div className="flex gap-x-4 gap-y-1 flex-wrap">
                                            {['P50', 'P90', 'P99'].map((p, pIdx) => visiblePercentiles.includes(p) && (
                                                <div key={p} className="flex items-center gap-1.5">
                                                    <div className="w-5 h-3 flex items-center">
                                                        <div className="w-full h-0 border-t-2" style={{ borderColor: '#8b5cf6', borderStyle: pIdx === 1 ? 'dashed' : pIdx === 2 ? 'dotted' : 'solid' }} />
                                                    </div>
                                                    <span className="text-[10px] font-semibold text-slate-300">{p}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    </div>

                {/* Summary Metrics Table */}
                <div id="summary-table" className="border border-slate-800 rounded-xl bg-slate-900 shadow-xl p-6 flex flex-col h-[32rem]">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-md font-bold text-white">Summary metrics comparison</h3>
                            <span className="text-xs text-slate-500">Comparing Base configuration vs. Optimized routing + tiered offloading side-by-side.</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex gap-2 bg-slate-950 border border-slate-800 p-1 rounded-lg">
                                {['tpot', 'ttft'].map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setTableMetricMode(mode)}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all uppercase ${tableMetricMode === mode ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-2 bg-slate-950 border border-slate-800 p-1 rounded-lg">
                                {['P50', 'P90', 'P99'].map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => setSelectedPercentile(p)}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${selectedPercentile === p ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={exportToCSV}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-md border border-slate-700 transition-colors cursor-pointer"
                            >
                                Export CSV
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-auto rounded-lg border border-slate-800">
                        <table className="w-full text-xs text-left text-slate-300">
                            <thead className="text-[10px] font-extrabold text-white uppercase tracking-widest bg-slate-950 border-b border-slate-800">
                                <tr>
                                    <th scope="col" className="px-4 py-3 border-r border-slate-800 w-20">
                                        QPS
                                    </th>
                                    <th scope="col" className="px-4 py-3 border-r border-slate-800">
                                        Reference Base ({selectedPercentile})
                                    </th>
                                    <th scope="col" className="px-4 py-3 border-r border-slate-800">
                                        Combined Optimizations ({selectedPercentile})
                                    </th>
                                    <th scope="col" className="px-4 py-3 text-right">
                                        Gain
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/80 font-mono">
                                {[
                                    { qps: 0.5, base: tableMetricMode === 'ttft' ? '85.4 ms' : '15.2 ms', opt: tableMetricMode === 'ttft' ? '3.2 ms' : '3.8 ms', gain: tableMetricMode === 'ttft' ? '+96.2%' : '+75.0%' },
                                    { qps: 1.0, base: tableMetricMode === 'ttft' ? '92.1 ms' : '16.8 ms', opt: tableMetricMode === 'ttft' ? '3.4 ms' : '4.1 ms', gain: tableMetricMode === 'ttft' ? '+96.3%' : '+75.5%' },
                                    { qps: 2.0, base: tableMetricMode === 'ttft' ? '124.5 ms' : '22.4 ms', opt: tableMetricMode === 'ttft' ? '3.8 ms' : '4.6 ms', gain: tableMetricMode === 'ttft' ? '+96.9%' : '+79.4%' },
                                    { qps: 4.0, base: tableMetricMode === 'ttft' ? '210.3 ms' : '38.5 ms', opt: tableMetricMode === 'ttft' ? '4.5 ms' : '5.2 ms', gain: tableMetricMode === 'ttft' ? '+97.8%' : '+86.4%' },
                                    { qps: 8.0, base: tableMetricMode === 'ttft' ? '345.8 ms' : '72.1 ms', opt: tableMetricMode === 'ttft' ? '5.2 ms' : '6.4 ms', gain: tableMetricMode === 'ttft' ? '+98.5%' : '+91.1%' }
                                ].map((row, rIdx) => (
                                    <tr key={rIdx} className="hover:bg-slate-800/20 transition-colors">
                                        <td className="px-4 py-2.5 border-r border-slate-800 font-bold text-white">
                                            {row.qps}
                                        </td>
                                        <td className="px-4 py-2.5 border-r border-slate-800 text-slate-400">
                                            {row.base}
                                        </td>
                                        <td className="px-4 py-2.5 border-r border-slate-800 text-cyan-400 font-bold">
                                            {row.opt}
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-bold text-emerald-400">
                                            {row.gain}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
 
                {/* FAQ Section */}
                <div className="mt-10 border-t border-slate-800/60 pt-10">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-bold text-white">Frequently Asked Questions</h3>
                    </div>
                    <p className="text-xs text-slate-500 mb-6">Extrapolating baseline telemetry and optimization paths to your custom constraints.</p>
                    
                    <div className="space-y-6">
                        {Object.entries(
                            [
                            {
                                category: "Model Architectures & Sizes",
                                q: "The benchmarks show Qwen 3 32B. How do the benefits of cache-aware routing scale to smaller models like Gemma 4 (9B/26B) or Qwen 3.5 (27B)?",
                                a: (
                                    <div className="space-y-2 text-slate-300 text-[11px] leading-relaxed">
                                        <p><strong>TTFT Overhead:</strong> Smaller models have significantly lower baseline prefill times. Because the absolute time saved by hitting a cache is smaller, the relative benefit of routing to a warm cache is reduced for low-concurrency workloads.</p>
                                        <p><strong>Throughput Gains:</strong> Under high QPS, cache-aware routing remains highly beneficial even for smaller models. By preventing redundant prefill computations, it frees up GPU compute cycles, increasing overall system throughput and preventing queue buildup.</p>
                                        <p><strong>Recommendation:</strong> If your average Input Sequence Length (ISL) is &lt; 2k tokens, standard round-robin routing may suffice for small models. If ISL &gt; 4k or you experience bursty traffic, cache-aware routing is still recommended.</p>
                                    </div>
                                )
                            },
                            {
                                category: "Model Architectures & Sizes",
                                q: "How does Intelligent Routing handle massive models or Mixture of Experts (MoE) like Qwen 3 Coder (480B-A35B-Instruct)?",
                                a: (
                                    <div className="space-y-2 text-slate-300 text-[11px] leading-relaxed">
                                        <p><strong>Memory Footprint:</strong> Large models and MoEs require high Tensor Parallelism (TP) and Pipeline Parallelism (PP), often spanning multiple nodes.</p>
                                        <p><strong>Routing Complexity:</strong> For a 480B MoE, the routing decision must align with the model replica boundaries (e.g., routing to the master node of a specific TP/PP group).</p>
                                        <p><strong>Latency Sensitivity:</strong> Prefill cost (TTFT) for a 480B model is extremely high. A cache miss on a large prefix is highly penalized. Therefore, precise cache-aware routing (e.g., tracking exact prefix matches) is critical to avoid multi-second TTFT spikes.</p>
                                        <p><strong>Recommendation:</strong> For models &gt; 100B parameters, default load balancing is highly inefficient. We recommend using Precise Cache Aware Routing or Predicted Latency Balancing to ensure requests with shared prompts are strictly routed to the same replica group.</p>
                                    </div>
                                )
                            },
                            {
                                category: "Model Architectures & Sizes",
                                q: "How do long-context models like Kimi K2.5 or GLM 5.1 impact routing decisions?",
                                a: (
                                    <div className="space-y-2 text-slate-300 text-[11px] leading-relaxed">
                                        <p><strong>Cache Volatility:</strong> Long-context models can ingest 100k+ tokens. The KV cache for a single request can easily consume gigabytes of VRAM, leading to rapid cache eviction on the serving nodes.</p>
                                        <p><strong>Routing Strategy:</strong> Heuristic routing that only checks prefix matches might fail if the cache has already been evicted due to memory pressure. Here, the router must combine prefix awareness with real-time KV cache capacity tracking from the pods to avoid routing to a node that has the prefix but must evict it to process the new request.</p>
                                    </div>
                                )
                            },
                            {
                                category: "Hardware Infrastructure",
                                q: "We don't use H100s. How does cache-aware routing perform on lower-tier hardware like RTX-PRO-6000 or L4 GPUs?",
                                a: (
                                    <div className="space-y-2 text-slate-300 text-[11px] leading-relaxed">
                                        <p><strong>Compute Constraints:</strong> Slower GPUs take longer to process prefills. This means the penalty for a cache miss (recomputation) is much higher in absolute latency. Cache-aware routing actually provides a larger relative latency improvement on lower-tier hardware.</p>
                                        <p><strong>VRAM Constraints:</strong> RTX-PRO-6000 (48GB) and L4 (24GB) have much smaller VRAM capacity than H100 (80GB). The KV cache pool is smaller, leading to frequent evictions.</p>
                                        <p><strong>Recommendation:</strong> On constrained hardware, you must pair cache-aware routing with aggressive KV Cache Offloading (to CPU or Local SSD) to keep prefixes warm longer. The router should be configured to prioritize nodes where the prefix is at least in CPU RAM, as fetching from CPU is still faster than full recomputation on a slower GPU.</p>
                                    </div>
                                )
                            },
                            {
                                category: "Hardware Infrastructure",
                                q: "What is the expected behavior on next-gen hardware like NVIDIA Blackwell (B200) or TPU v7?",
                                a: (
                                    <div className="space-y-2 text-slate-300 text-[11px] leading-relaxed">
                                        <p><strong>High Bandwidth Interconnects:</strong> Next-gen architectures feature faster NVLink or TPU ICI, significantly accelerating memory transfers. Prefill computation times are vastly reduced, but cache-aware routing is still key under massive concurrency to preserve high-bandwidth memory (HBM) capacity.</p>
                                        <p><strong>Dynamic Capacity Allocation:</strong> Newer platforms support hardware-level virtualization and dynamic partitioning. Cache-aware routing must align with dynamic slices to maintain high cache hits without fragmenting HBM pools across partitioned instances.</p>
                                    </div>
                                )
                            },
                            {
                                category: "Workloads & Traffic Patterns",
                                q: "How does traffic burstiness affect the performance of prefix caching and intelligent scheduling?",
                                a: (
                                    <div className="space-y-2 text-slate-300 text-[11px] leading-relaxed">
                                        <p><strong>Queue Demands:</strong> High burstiness causes spikes in concurrent requests, leading to queuing delays at target replicas. Standard routers struggle because queue depths spike uniformly.</p>
                                        <p><strong>Optimized Mitigation:</strong> Pair queue-depth routing with prefix caching. By ensuring that bursty requests sharing a system prompt are routed to prefix-warm replicas, you reduce the compute footprint of the burst by up to 90%, quickly draining queue backlogs.</p>
                                    </div>
                                )
                            },
                            {
                                category: "Workloads & Traffic Patterns",
                                q: "When is prefix caching NOT recommended for inference workloads?",
                                a: (
                                    <div className="space-y-2 text-slate-300 text-[11px] leading-relaxed">
                                        <p><strong>Zero Prefix Overlap:</strong> If requests are fully unique and do not share common system prompts, few-shot examples, or document contexts, the cache hit rate will approach 0%.</p>
                                        <p><strong>System Overhead:</strong> Maintaining and checking prefix trees at the router introduces a microsecond routing latency overhead. While negligible for long prompts, it offers no benefit if prefix reuse is absent.</p>
                                        <p><strong>Recommendation:</strong> Default to simple load-balanced scheduling if average prefix length is &lt; 100 tokens and prompt reuse is &lt; 5%.</p>
                                    </div>
                                )
                            }
                        ].reduce((acc, faq) => {
                            if (!acc[faq.category]) {
                                acc[faq.category] = [];
                            }
                            acc[faq.category].push(faq);
                            return acc;
                        }, {})
                    ).map(([category, faqs], catIdx) => (
                        <div key={catIdx} className="space-y-3">
                            <h4 className="text-xs font-extrabold uppercase tracking-widest text-cyan-400/80 border-b border-slate-800/80 pb-2 mb-3 mt-6">
                                {category}
                            </h4>
                            <div className="space-y-3">
                                {faqs.map((faq, faqIdx) => {
                                    const uniqueKey = `${catIdx}-${faqIdx}`;
                                    const isOpen = openFAQIndex === uniqueKey;
                                    return (
                                        <div key={faqIdx} className="border border-slate-800/80 rounded-xl bg-slate-900/40 overflow-hidden hover:border-slate-700/50 transition-colors">
                                            <button
                                                onClick={() => setOpenFAQIndex(isOpen ? null : uniqueKey)}
                                                className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-800/20 transition-colors cursor-pointer"
                                            >
                                                <span className="text-xs font-bold text-slate-200">{faq.q}</span>
                                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ml-4 ${isOpen ? 'rotate-180 text-cyan-400' : ''}`} />
                                            </button>
                                            {isOpen && (
                                                <div className="px-4 pb-4 pt-1 border-t border-slate-800/60 bg-slate-950/10">
                                                    {faq.a}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    </div>
                </div>
            </main>

            {isModalOpen && (
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full shadow-[0_0_50px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden max-h-[90vh]">
                        <header className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/80">
                            <div className="flex items-center">
                                <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-lg mr-3">
                                    <Code className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-white">Benchmark Test Configuration</h3>
                                    <p className="text-[10px] text-slate-400 mt-0.5">View and copy the exact recipes used for this workload replay.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700 transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </header>

                        <div className="flex border-b border-slate-800 bg-slate-900/60 px-6 pt-2 gap-1 overflow-x-auto no-scrollbar">
                            {['Model Server flags', 'K8s Manifest', 'Traffic YAML', 'Raw Benchmark JSON'].map((tab, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setActiveRecipeTab(idx)}
                                    className={`px-4 py-2 text-xs font-bold border-b-2 transition-all shrink-0 ${
                                        activeRecipeTab === idx
                                            ? 'border-cyan-500 text-cyan-400'
                                            : 'border-transparent text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        <div className="p-6 flex-1 overflow-y-auto bg-slate-950 font-mono text-[10px] text-slate-300 relative">
                            {activeRecipeTab === 0 && (
                                <>
                                    <button 
                                        onClick={() => handleCopy(RECIPE_VLLM, 'vllm')}
                                        className="absolute top-4 right-4 p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
                                    >
                                        {copiedStates['vllm'] ? <Check className="w-3 h-3 text-emerald-400" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
                                        <span className="text-[9px] font-bold">{copiedStates['vllm'] ? 'Copied!' : 'Copy Code'}</span>
                                    </button>
                                    <pre className="whitespace-pre-wrap">{RECIPE_VLLM}</pre>
                                </>
                            )}
                            {activeRecipeTab === 1 && (
                                <>
                                    <button 
                                        onClick={() => handleCopy(RECIPE_K8S, 'k8s')}
                                        className="absolute top-4 right-4 p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
                                    >
                                        {copiedStates['k8s'] ? <Check className="w-3 h-3 text-emerald-400" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
                                        <span className="text-[9px] font-bold">{copiedStates['k8s'] ? 'Copied!' : 'Copy Code'}</span>
                                    </button>
                                    <pre className="whitespace-pre-wrap">{RECIPE_K8S}</pre>
                                </>
                            )}
                            {activeRecipeTab === 2 && (
                                <>
                                    <button 
                                        onClick={() => handleCopy(RECIPE_TRAFFIC, 'traffic')}
                                        className="absolute top-4 right-4 p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
                                    >
                                        {copiedStates['traffic'] ? <Check className="w-3 h-3 text-emerald-400" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
                                        <span className="text-[9px] font-bold">{copiedStates['traffic'] ? 'Copied!' : 'Copy Code'}</span>
                                    </button>
                                    <pre className="whitespace-pre-wrap">{RECIPE_TRAFFIC}</pre>
                                </>
                            )}
                            {activeRecipeTab === 3 && (
                                <>
                                    <button 
                                        onClick={() => {
                                            const jsonStr = JSON.stringify({
                                                workload: "Agentic Code Generation Replay",
                                                parameters: { concurrency: 40, turns: 20 },
                                                verified_latency_ttft_p50: TTFT_RESULTS,
                                                verified_throughput_tps: TPUT_RESULTS
                                            }, null, 2);
                                            handleCopy(jsonStr, 'json');
                                        }}
                                        className="absolute top-4 right-4 p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
                                    >
                                        {copiedStates['json'] ? <Check className="w-3 h-3 text-emerald-400" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
                                        <span className="text-[9px] font-bold">{copiedStates['json'] ? 'Copied!' : 'Copy JSON'}</span>
                                    </button>
                                    <pre className="whitespace-pre-wrap">
                                        {JSON.stringify({
                                            workload: "Agentic Code Generation Replay",
                                            parameters: { concurrency: 40, turns: 20 },
                                            verified_latency_ttft_p50: TTFT_RESULTS,
                                            verified_throughput_tps: TPUT_RESULTS
                                        }, null, 2)}
                                    </pre>
                                </>
                            )}
                        </div>

                        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex justify-end">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold text-xs transition-colors border border-slate-700">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
