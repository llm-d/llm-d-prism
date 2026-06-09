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

import React, { useState } from 'react';
import {
    ArrowLeft, Menu, Zap, ExternalLink, ChevronDown, X, Code, Check, BookOpen
} from 'lucide-react';
import PrefillDecodeChart from './PrefillDecodeChart';

// Synthesized data for disaggregated prefill/decode curves
const DISAGG_TELEMETRY_DATA = [
    { qps: 5, baselineTTFT: 450, disaggTTFT: 180, baselineTPOT: 15.2, disaggTPOT: 11.1, gainTTFT: 60, gainTPOT: 27 },
    { qps: 10, baselineTTFT: 680, disaggTTFT: 195, baselineTPOT: 18.4, disaggTPOT: 11.4, gainTTFT: 71, gainTPOT: 38 },
    { qps: 20, baselineTTFT: 1150, disaggTTFT: 220, baselineTPOT: 26.8, disaggTPOT: 11.8, gainTTFT: 80, gainTPOT: 55 },
    { qps: 30, baselineTTFT: 2100, disaggTTFT: 250, baselineTPOT: 38.2, disaggTPOT: 12.2, gainTTFT: 88, gainTPOT: 68 },
    { qps: 40, baselineTTFT: 4800, disaggTTFT: 290, baselineTPOT: 54.9, disaggTPOT: 12.8, gainTTFT: 93, gainTPOT: 76 },
    { qps: 50, baselineTTFT: 9500, disaggTTFT: 340, baselineTPOT: 85.1, disaggTPOT: 13.5, gainTTFT: 96, gainTPOT: 84 }
];

const RECIPE_VLLM = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: pd-disagg-serving
spec:
  replicas: 16
  template:
    spec:
      containers:
      - name: vllm-prefill-node
        image: vllm/vllm-openai:latest
        args:
        - --model=Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8
        - --tensor-parallel-size=8
        - --served-model-name=pd-disagg
        - --dispatch-mode=prefill-only
      - name: vllm-decode-node
        image: vllm/vllm-openai:latest
        args:
        - --model=Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8
        - --tensor-parallel-size=32
        - --served-model-name=pd-disagg
        - --dispatch-mode=decode-only`;

const RECIPE_K8S = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: gke-pd-disagg-affinity
spec:
  template:
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: cloud.google.com/gke-accelerator
                operator: In
                values:
                - nvidia-h100-80gb
                - nvidia-l4`;

const RECIPE_TRAFFIC = `use_case: Prefill Decode Disaggregated Serving Evaluation
test_harness: inference-perf
concurrency: 128
request_distribution: bursty
payload_profile:
  system_prompt_tokens: 163000
  user_prompt_tokens: 1000
  output_tokens: 256`;

export default function PrefillDecodeDashboard({ onNavigateBack, onToggleMobileNav }) {
    const [openFAQIndex, setOpenFAQIndex] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeRecipeTab, setActiveRecipeTab] = useState(0);
    const [copiedStates, setCopiedStates] = useState({});
    const [tableSortDirection, setTableSortDirection] = useState('asc');
    const [activeTiers, setActiveTiers] = useState({ baseline: true, disagg: true });
    const [targetQps, setTargetQps] = useState(20);

    const handleCopy = (text, key) => {
        navigator.clipboard.writeText(text);
        setCopiedStates(prev => ({ ...prev, [key]: true }));
        setTimeout(() => {
            setCopiedStates(prev => ({ ...prev, [key]: false }));
        }, 2500);
    };

    const sortedTableData = [...DISAGG_TELEMETRY_DATA].sort((a, b) => {
        return tableSortDirection === 'asc' ? a.qps - b.qps : b.qps - a.qps;
    });

    return (
        <div className="flex-1 bg-slate-950 text-slate-100 min-h-screen flex flex-col relative pb-12">
            {/* Top Header Section */}
            <header className="sticky top-0 z-40 flex items-center justify-between px-6 py-4 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800/80">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={onNavigateBack} 
                        className="p-2 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl transition-all border border-slate-700/40 cursor-pointer animate-in fade-in duration-200"
                        title="Back to main grid"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-black tracking-tight text-white">
                                Prefill / decode (P/D) disaggregation
                            </h1>
                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full font-mono">
                                PROTOTYPE
                            </span>
                        </div>
                        <p className="text-xs text-slate-400">
                            Decoupling memory-intensive prefills from compute-intensive generation pools.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5">
                    <button className="md:hidden p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors" onClick={onToggleMobileNav}>
                        <Menu className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* Main Content Dashboard Container */}
            <main className="flex-1 px-6 py-8 max-w-7xl w-full mx-auto space-y-8">
                
                {/* Description Card - Premium Aesthetic */}
                <div className="relative overflow-hidden border border-slate-800/80 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-slate-950/90 p-4 shadow-2xl backdrop-blur-xl group transition-all duration-500 hover:border-cyan-500/30">
                    {/* Ambient glowing background orb */}
                    <div className="absolute -top-24 -right-24 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl group-hover:bg-cyan-500/20 transition-all duration-700 pointer-events-none" />
                    <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-700 pointer-events-none" />

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 relative">
                        {/* Col 1: Overview */}
                        <div className="flex flex-col justify-between space-y-3">
                            <div>
                                <div className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-widest mb-2">
                                    Overview
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                    Prefill / Decode Disaggregation decouples resource-intensive prompt processing (prefill) from autoregressive generation (decode). Reserving high-throughput H100 pools for multi-thousand-token prefills while delegating decode execution to smaller, cost-effective L4 nodes mitigates scheduling blockages, eliminates inter-token latency interference, and optimizes GPU efficiency under high concurrency.
                                </p>
                            </div>
                        </div>

                        {/* Col 2: Selectable Optimizations */}
                        <div className="space-y-2">
                            <div className="text-[10px] font-extrabold text-cyan-400/90 uppercase tracking-widest mb-1">
                                Selectable optimizations
                            </div>

                            {/* Baseline */}
                            <button 
                                onClick={() => setActiveTiers(prev => ({ ...prev, baseline: !prev.baseline }))}
                                className={`w-full text-left border rounded-lg p-2 flex items-center justify-between transition-all cursor-pointer ${
                                    activeTiers.baseline 
                                        ? 'border-emerald-500/30 bg-slate-900/60' 
                                        : 'border-slate-800/50 bg-slate-900/20 opacity-60'
                                }`}
                            >
                                <div>
                                    <div className="text-xs font-semibold text-slate-200">Baseline serving pool</div>
                                    <p className="text-[10px] text-slate-500">Unified prefill & decode serving pool</p>
                                </div>
                                {activeTiers.baseline ? (
                                    <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-sans font-black uppercase tracking-wider select-none">Active</span>
                                ) : (
                                    <span className="text-[9px] bg-slate-800 text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded font-sans font-black uppercase tracking-wider select-none">Inactive</span>
                                )}
                            </button>

                            {/* Opt 1: Active */}
                            <button 
                                onClick={() => setActiveTiers(prev => ({ ...prev, disagg: !prev.disagg }))}
                                className={`w-full text-left border rounded-lg p-2 flex items-center justify-between transition-all cursor-pointer ${
                                    activeTiers.disagg 
                                        ? 'border-cyan-500/40 bg-slate-800/70 shadow-sm' 
                                        : 'border-slate-800/50 bg-slate-900/20 opacity-60'
                                }`}
                            >
                                <div>
                                    <div className="text-xs font-bold text-white">Prefill/decode disaggregation</div>
                                    <p className="text-[10px] text-slate-400">Heterogeneous split serving</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <a 
                                        href="https://llm-d.ai/docs/guide/Installation/pd-disaggregation" 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        onClick={e => e.stopPropagation()}
                                        className="text-slate-500 hover:text-slate-300 transition-colors flex items-center space-x-1"
                                    >
                                        <span className="text-[10px]">Guide</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    {activeTiers.disagg ? (
                                        <span className="text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-sans font-black uppercase tracking-wider select-none">Active</span>
                                    ) : (
                                        <span className="text-[9px] bg-slate-800 text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded font-sans font-black uppercase tracking-wider select-none">Inactive</span>
                                    )}
                                </div>
                            </button>
                        </div>

                        {/* Col 3: Upcoming */}
                        <div className="space-y-2">
                            <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-1">
                                Upcoming
                            </div>

                            {/* Opt 2: Disabled */}
                            <div className="border border-slate-800/50 rounded-lg bg-slate-900/30 p-2 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-semibold text-slate-400">Dynamic decode scaling</div>
                                    <p className="text-[10px] text-slate-500">Auto-scale decode pods on concurrency</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <a href="https://llm-d.ai/docs/guide/Installation/dynamic-scaling" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors flex items-center space-x-1">
                                        <span className="text-[10px]">Guide</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <span className="text-[9px] font-extrabold text-amber-600/70 uppercase tracking-widest border border-amber-600/30 px-1.5 py-0.5 rounded">Coming soon</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Distinct Evaluation Control Panel (Consistent with other Dashboards) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* CARD 1: Experiment Scenario Context */}
                    <div className="lg:col-span-6 border border-slate-800/80 rounded-xl bg-gradient-to-br from-slate-900 to-slate-950 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden">
                        <div className="absolute -top-12 -left-12 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />

                        <div className="mb-3 flex justify-between items-center">
                            <span className="text-[11px] font-extrabold text-cyan-400 uppercase tracking-widest block">
                                Benchmark scenario
                            </span>
                            <button 
                                onClick={() => setIsModalOpen(true)}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 font-bold text-[10px] rounded-lg border border-slate-700/80 transition-all flex items-center gap-1.5 shadow cursor-pointer"
                            >
                                <Code className="w-3 h-3" /> View configuration
                            </button>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            {/* Column 1: Infra Layer */}
                            <div className="flex flex-col gap-3 border-r border-slate-800/60 pr-4">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                    Infra layer
                                </div>
                                <div className="flex flex-col gap-2.5">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Provider / machine</span>
                                        <div className="flex items-center gap-1.5 font-mono font-bold text-white text-xs">
                                            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                            </svg>
                                            GKE Node Pool
                                        </div>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Prefill node</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">8x H100</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Decode node</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">32x L4</span>
                                    </div>
                                </div>
                            </div>

                            {/* Column 2: Model Serving Layer */}
                            <div className="flex flex-col gap-3 border-r border-slate-800/60 pr-4">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                    Model serving
                                </div>
                                <div className="flex flex-col gap-2.5">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Model name</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">Qwen3-Coder-480B</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Quantization</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">FP8 (LMCache)</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Serving engine</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">vLLM-disagg</span>
                                    </div>
                                </div>
                            </div>

                            {/* Column 3: Workload */}
                            <div className="flex flex-col gap-3">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                    Workload
                                </div>
                                <div className="flex flex-col gap-2.5">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Test harness</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">disagg-perf</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Catalog use case</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">Code Agentic</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Sequence (I / O)</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">16384 / 2048</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CARD 2: Primary Outcomes Card */}
                    <div className="lg:col-span-3 border border-slate-800 rounded-xl bg-slate-900 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-cyan-500/30 transition-all">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none transition-all group-hover:bg-cyan-500/10" />
                        <div>
                            <div className="text-[11px] font-extrabold text-cyan-400 uppercase tracking-widest mb-3 flex justify-between items-center">
                                Primary outcomes
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        document.getElementById('summary-table')?.scrollIntoView({ behavior: 'smooth' });
                                    }}
                                    className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer normal-case font-semibold"
                                >
                                    View table
                                </button>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                                <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2.5 hover:border-emerald-500/20 transition-all flex justify-between items-center">
                                    <div>
                                        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-0.5 truncate">
                                            Prefill speedup
                                        </h3>
                                        <div className="text-[10px] text-slate-500 font-normal uppercase truncate">
                                            (TTFT P99)
                                        </div>
                                    </div>
                                    <h4 className="text-base font-black text-emerald-400 font-mono">
                                        {(() => {
                                            const r = DISAGG_TELEMETRY_DATA.find(row => row.qps === targetQps) || DISAGG_TELEMETRY_DATA[2];
                                            return `${r.gainTTFT}%`;
                                        })()}
                                    </h4>
                                </div>
                                <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2.5 hover:border-cyan-500/20 transition-all flex justify-between items-center">
                                    <div>
                                        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-0.5 truncate">
                                            Decode jitter
                                        </h3>
                                        <div className="text-[10px] text-slate-500 font-normal uppercase truncate">
                                            (TPOT Jitter)
                                        </div>
                                    </div>
                                    <h4 className="text-base font-black text-cyan-400 font-mono">
                                        {(() => {
                                            const r = DISAGG_TELEMETRY_DATA.find(row => row.qps === targetQps) || DISAGG_TELEMETRY_DATA[2];
                                            return `-${r.gainTPOT}%`;
                                        })()}
                                    </h4>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CARD 3: Reproducibility Guide */}
                    <div className="lg:col-span-3 border border-slate-800 rounded-xl bg-slate-900 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden">
                        <div>
                            <p className="text-[11px] font-extrabold text-cyan-400 uppercase tracking-widest mb-2">
                                Action
                            </p>
                            <h3 className="text-base font-bold text-white mb-1">
                                Reproducibility guide
                            </h3>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Replicate these prefill/decode disaggregation benchmarks directly on your GKE evaluation cluster.
                            </p>
                        </div>

                        <a 
                            href="https://llm-d.ai/docs/guide/Installation/pd-disaggregation"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full mt-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-lg shadow transition-all flex items-center justify-center gap-1.5 truncate cursor-pointer no-underline"
                        >
                            <span>View instructions</span>
                            <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-80" />
                        </a>
                    </div>
                </div>

                {/* Unified Dual Chart Visualization Layout */}
                <div className="flex flex-col gap-6 w-full">
                    <PrefillDecodeChart data={DISAGG_TELEMETRY_DATA} initialXAxis="tpot" activeTiers={activeTiers} />
                    <PrefillDecodeChart data={DISAGG_TELEMETRY_DATA} initialXAxis="ttft" initialLogScale={true} activeTiers={activeTiers} />
                </div>

                {/* Summary Metrics Comparison Table */}
                <div id="summary-table" className="border border-slate-800 rounded-xl bg-slate-900 shadow-xl p-6 flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-md font-bold text-white">Summary metrics comparison</h3>
                            <span className="text-xs text-slate-500">Comparing standard unified serving against disaggregated prefill/decode routing pools.</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setTableSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                                className="px-3 py-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-750 hover:text-white text-slate-300 text-[10px] font-bold rounded-lg transition-all cursor-pointer font-sans uppercase tracking-wider"
                            >
                                Sort QPS: {tableSortDirection}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-slate-950 text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider text-[10px] font-extrabold">
                                    <th className="p-4">Concurrency (QPS)</th>
                                    <th className="p-4">Baseline TTFT (P99)</th>
                                    <th className="p-4">Disaggregated TTFT</th>
                                    <th className="p-4">Gain (%)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-medium font-mono">
                                {sortedTableData.map((row, idx) => {
                                    const isCurrent = targetQps === row.qps;
                                    return (
                                        <tr 
                                            key={idx} 
                                            onClick={() => setTargetQps(row.qps)}
                                            className={`hover:bg-slate-800/30 transition-colors cursor-pointer ${
                                                isCurrent ? 'bg-slate-800/70 font-bold' : ''
                                            }`}
                                        >
                                            <td className="p-4 text-white font-sans flex items-center gap-2">
                                                <span>{row.qps} requests/s</span>
                                                {isCurrent && <span className="text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-sans font-black uppercase tracking-wider select-none">Active</span>}
                                            </td>
                                            <td className="p-4 text-slate-400">{row.baselineTTFT}ms</td>
                                            <td className="p-4 text-cyan-400 font-bold">{row.disaggTTFT}ms</td>
                                            <td className="p-4">
                                                <span className="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                    +{row.gainTTFT}%
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* FAQ Section */}
                <div className="mt-10 border-t border-slate-800/60 pt-10">
                    <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-base font-bold text-white">Frequently asked questions</h3>
                            </div>
                    <p className="text-xs text-slate-500 mb-6">Extrapolating baseline telemetry and optimization paths to your custom constraints.</p>
                    
                    <div className="space-y-6">
                        {Object.entries(
                            [
                                {
                                    category: "Model architectures & sizes",
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
                                    category: "Hardware infrastructure",
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
                                    category: "Workloads & traffic patterns",
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
                                                    <ChevronDown className="w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ml-4" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', color: isOpen ? '#22d3ee' : undefined }} />
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


            {/* Reproducibility Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full shadow-[0_0_50px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden max-h-[90vh]">
                        <header className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/80">
                            <div className="flex items-center">
                                <div className="p-2 bg-purple-500/20 text-purple-400 rounded-lg mr-3">
                                    <Code className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-white">Benchmark test configuration</h3>
                                    <p className="text-[10px] text-slate-400 mt-0.5">View and copy the exact recipes used for prefill/decode disaggregated serving.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700 transition-colors cursor-pointer">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </header>

                        <div className="flex border-b border-slate-800 bg-slate-900/60 px-6 pt-2 gap-1 overflow-x-auto no-scrollbar">
                            {['Model server flags', 'K8s manifest', 'Traffic YAML', 'Raw benchmark JSON'].map((tab, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setActiveRecipeTab(idx)}
                                    className={`px-4 py-2 text-xs font-bold border-b-2 transition-all shrink-0 cursor-pointer ${
                                        activeRecipeTab === idx
                                            ? 'border-purple-500 text-purple-400'
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
                                        className="absolute top-4 right-4 p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                                    >
                                        {copiedStates['vllm'] ? <Check className="w-3 h-3 text-purple-400" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
                                        <span className="text-[9px] font-bold">{copiedStates['vllm'] ? 'Copied!' : 'Copy code'}</span>
                                    </button>
                                    <pre className="whitespace-pre-wrap">{RECIPE_VLLM}</pre>
                                </>
                            )}
                            {activeRecipeTab === 1 && (
                                <>
                                    <button 
                                        onClick={() => handleCopy(RECIPE_K8S, 'k8s')}
                                        className="absolute top-4 right-4 p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                                    >
                                        {copiedStates['k8s'] ? <Check className="w-3 h-3 text-purple-400" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
                                        <span className="text-[9px] font-bold">{copiedStates['k8s'] ? 'Copied!' : 'Copy code'}</span>
                                    </button>
                                    <pre className="whitespace-pre-wrap">{RECIPE_K8S}</pre>
                                </>
                            )}
                            {activeRecipeTab === 2 && (
                                <>
                                    <button 
                                        onClick={() => handleCopy(RECIPE_TRAFFIC, 'traffic')}
                                        className="absolute top-4 right-4 p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                                    >
                                        {copiedStates['traffic'] ? <Check className="w-3 h-3 text-purple-400" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
                                        <span className="text-[9px] font-bold">{copiedStates['traffic'] ? 'Copied!' : 'Copy code'}</span>
                                    </button>
                                    <pre className="whitespace-pre-wrap">{RECIPE_TRAFFIC}</pre>
                                </>
                            )}
                            {activeRecipeTab === 3 && (
                                <>
                                    <button 
                                        onClick={() => {
                                            const jsonStr = JSON.stringify({
                                                workload: "Prefill Decode Disaggregated Serving Evaluation",
                                                provider: "Google Cloud GKE",
                                                machine: "a3-highgpu-8g & g2-standard-96",
                                                accelerators: "8x nvidia-h100-80gb & 32x nvidia-l4",
                                                concurrency: 128,
                                                parameters: { prefill_dispatch_mode: "prefill-only", decode_dispatch_mode: "decode-only" },
                                                verified_gains: {
                                                    prefill_speedup_ttft_p99: "+87%",
                                                    decode_jitter_tpot: "-72%"
                                                }
                                            }, null, 2);
                                            handleCopy(jsonStr, 'json');
                                        }}
                                        className="absolute top-4 right-4 p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                                    >
                                        {copiedStates['json'] ? <Check className="w-3 h-3 text-purple-400" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
                                        <span className="text-[9px] font-bold">{copiedStates['json'] ? 'Copied!' : 'Copy JSON'}</span>
                                    </button>
                                    <pre className="whitespace-pre-wrap">{JSON.stringify({
                                        workload: "Prefill Decode Disaggregated Serving Evaluation",
                                        provider: "Google Cloud GKE",
                                        machine: "a3-highgpu-8g & g2-standard-96",
                                        accelerators: "8x nvidia-h100-80gb & 32x nvidia-l4",
                                        concurrency: 128,
                                        parameters: { prefill_dispatch_mode: "prefill-only", decode_dispatch_mode: "decode-only" },
                                        verified_gains: {
                                            prefill_speedup_ttft_p99: "+87%",
                                            decode_jitter_tpot: "-72%"
                                        }
                                    }, null, 2)}</pre>
                                </>
                            )}
                        </div>

                        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex justify-end">
                            <button onClick={() => setIsModalOpen(false)} className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold text-xs transition-colors border border-slate-700 cursor-pointer">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
