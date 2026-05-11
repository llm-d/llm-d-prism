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

import React, { useState, useMemo } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { 
    ArrowLeft, Menu, Share2, Zap, Download, Info, 
    ExternalLink, Cpu, Server, Layers, HardDrive, ChevronDown, ChevronUp, Check
} from 'lucide-react';

// Synthesized Curve Datasets (Throughput vs Latency/Cost)
const CURVE_DATASETS = {
    '10k': [
        { throughput: 200, baselineTTFT: 150, cpuTTFT: 180, ssdTTFT: 200, baselineITL: 15, cpuITL: 18, ssdITL: 20 },
        { throughput: 500, baselineTTFT: 200, cpuTTFT: 220, ssdTTFT: 240, baselineITL: 18, cpuITL: 20, ssdITL: 22 },
        { throughput: 800, baselineTTFT: 280, cpuTTFT: 270, ssdTTFT: 290, baselineITL: 22, cpuITL: 23, ssdITL: 25 },
        { throughput: 1000, baselineTTFT: 380, cpuTTFT: 310, ssdTTFT: 320, baselineITL: 26, cpuITL: 25, ssdITL: 26 },
        { throughput: 1200, baselineTTFT: 650, cpuTTFT: 360, ssdTTFT: 350, baselineITL: 35, cpuITL: 27, ssdITL: 28 },
        { throughput: 1400, baselineTTFT: null, cpuTTFT: 420, ssdTTFT: 390, baselineITL: null, cpuITL: 30, ssdITL: 30 },
        { throughput: 1600, baselineTTFT: null, cpuTTFT: 520, ssdTTFT: 430, baselineITL: null, cpuITL: 34, ssdITL: 32 },
        { throughput: 1800, baselineTTFT: null, cpuTTFT: 750, ssdTTFT: 480, baselineITL: null, cpuITL: 42, ssdITL: 35 },
        { throughput: 2000, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 550, baselineITL: null, cpuITL: null, ssdITL: 38 },
        { throughput: 2200, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 700, baselineITL: null, cpuITL: null, ssdITL: 42 },
    ],
    '50k': [
        { throughput: 200, baselineTTFT: 850, cpuTTFT: 320, ssdTTFT: 350, baselineITL: 45, cpuITL: 26, ssdITL: 28 },
        { throughput: 400, baselineTTFT: 1800, cpuTTFT: 380, ssdTTFT: 390, baselineITL: 65, cpuITL: 28, ssdITL: 30 },
        { throughput: 500, baselineTTFT: null, cpuTTFT: 420, ssdTTFT: 410, baselineITL: null, cpuITL: 30, ssdITL: 31 },
        { throughput: 800, baselineTTFT: null, cpuTTFT: 550, ssdTTFT: 480, baselineITL: null, cpuITL: 35, ssdITL: 33 },
        { throughput: 1000, baselineTTFT: null, cpuTTFT: 720, ssdTTFT: 530, baselineITL: null, cpuITL: 42, ssdITL: 35 },
        { throughput: 1200, baselineTTFT: null, cpuTTFT: 1100, ssdTTFT: 600, baselineITL: null, cpuITL: 55, ssdITL: 38 },
        { throughput: 1400, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 690, baselineITL: null, cpuITL: null, ssdITL: 41 },
        { throughput: 1600, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 820, baselineITL: null, cpuITL: null, ssdITL: 45 },
        { throughput: 1900, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 1150, baselineITL: null, cpuITL: null, ssdITL: 52 },
    ],
    '100k': [
        { throughput: 200, baselineTTFT: null, cpuTTFT: 1200, ssdTTFT: 650, baselineITL: null, cpuITL: 58, ssdITL: 38 },
        { throughput: 400, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 720, baselineITL: null, cpuITL: null, ssdITL: 41 },
        { throughput: 600, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 810, baselineITL: null, cpuITL: null, ssdITL: 44 },
        { throughput: 800, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 930, baselineITL: null, cpuITL: null, ssdITL: 48 },
        { throughput: 1000, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 1100, baselineITL: null, cpuITL: null, ssdITL: 53 },
        { throughput: 1200, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 1350, baselineITL: null, cpuITL: null, ssdITL: 60 },
        { throughput: 1500, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 1800, baselineITL: null, cpuITL: null, ssdITL: 72 },
    ]
};

// Heatmap Data (Context vs Storage Tier ROI)
const HEATMAP_DATA = [
    { context: '1k', baseline: { value: '0% change', color: 'bg-slate-800 text-slate-400' }, cpu: { value: '-5% (overhead)', color: 'bg-red-950/50 text-red-400' }, ssd: { value: '-15% (overhead)', color: 'bg-red-950 text-red-400' }, sweetSpot: 'Baseline HBM' },
    { context: '5k', baseline: { value: 'OOM Risk', color: 'bg-amber-950/50 text-amber-400' }, cpu: { value: '+35% throughput', color: 'bg-sky-900/50 text-sky-300 font-bold border border-sky-500/30' }, ssd: { value: '+10% throughput', color: 'bg-emerald-950/30 text-emerald-400' }, sweetSpot: 'CPU RAM' },
    { context: '10k', baseline: { value: 'OOM Crash', color: 'bg-red-900/50 text-red-300 font-bold' }, cpu: { value: '+50% throughput', color: 'bg-sky-900 text-sky-200 font-bold border border-sky-500/50' }, ssd: { value: '+25% throughput', color: 'bg-emerald-900/40 text-emerald-300' }, sweetSpot: 'CPU RAM' },
    { context: '50k', baseline: { value: 'OOM Crash', color: 'bg-red-900/50 text-red-300 font-bold' }, cpu: { value: 'OOM Crash', color: 'bg-red-900/50 text-red-300 font-bold' }, ssd: { value: '+180% throughput', color: 'bg-emerald-800 text-emerald-100 font-bold border border-emerald-500/50 shadow-lg shadow-emerald-900/50' }, sweetSpot: 'Lustre / Local SSD' },
    { context: '100k', baseline: { value: 'OOM Crash', color: 'bg-red-900/50 text-red-300 font-bold' }, cpu: { value: 'OOM Crash', color: 'bg-red-900/50 text-red-300 font-bold' }, ssd: { value: '+264% throughput', color: 'bg-emerald-700 text-white font-black border border-emerald-400 shadow-xl shadow-emerald-900/50' }, sweetSpot: 'Lustre / Local SSD' },
];

const HOURLY_COST_BASE = 3.50; // g4-standard-384 approx
const HOURLY_COST_LUSTRE = 1.20; // Managed Lustre overhead

export default function PrefixCacheOffloadingDashboard({ onNavigateBack, onToggleMobileNav }) {
    const [shareToast, setShareToast] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [optimizationChoice, setOptimizationChoice] = useState('approximate');
    
    // Primary Controls State
    const [workloadSize, setWorkloadSize] = useState('50k'); // '10k' | '50k' | '100k'
    const [activeTiers, setActiveTiers] = useState({
        baseline: true,
        cpu: true,
        ssd: true
    });
    const [targetMetric, setTargetMetric] = useState('TTFT'); // 'TTFT' | 'ITL'
    
    // Progressive Disclosure State
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showSlo, setShowSlo] = useState(false);
    const [sloLimit, setSloLimit] = useState(500);
    const [viewMode, setViewMode] = useState('performance'); // 'performance' | 'cost'

    const handleShareView = () => {
        navigator.clipboard.writeText(window.location.href);
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2000);
    };

    const multiplier = useMemo(() => {
        if (optimizationChoice === 'standard') return 0.7;
        if (optimizationChoice === 'approximate') return 1.0;
        if (optimizationChoice === 'precise') return 1.25;
        if (optimizationChoice === 'predicted') return 1.45;
        return 1.0;
    }, [optimizationChoice]);

    // Process data based on selected metric and view mode (Performance vs Cost)
    const chartData = useMemo(() => {
        const rawData = CURVE_DATASETS[workloadSize] || [];
        return rawData.map(d => {
            const baseThroughput = d.throughput * multiplier;
            
            // Helper to calc cost per 1M tokens
            const calcCost = (costPerHour) => {
                if (baseThroughput === 0) return null;
                return Math.round((costPerHour / (baseThroughput * 3600)) * 1000000);
            };

            let baselineVal = null;
            let cpuVal = null;
            let ssdVal = null;

            if (viewMode === 'cost') {
                baselineVal = d.baselineTTFT ? calcCost(HOURLY_COST_BASE) : null;
                cpuVal = d.cpuTTFT ? calcCost(HOURLY_COST_BASE) : null;
                ssdVal = d.ssdTTFT ? calcCost(HOURLY_COST_BASE + HOURLY_COST_LUSTRE) : null;
            } else {
                const metricKey = targetMetric === 'TTFT' ? 'TTFT' : 'ITL';
                baselineVal = d[`baseline${metricKey}`] ? Math.round(d[`baseline${metricKey}`] / multiplier) : null;
                cpuVal = d[`cpu${metricKey}`] ? Math.round(d[`cpu${metricKey}`] / multiplier) : null;
                ssdVal = d[`ssd${metricKey}`] ? Math.round(d[`ssd${metricKey}`] / multiplier) : null;
            }

            return {
                throughput: Math.round(baseThroughput),
                baseline: baselineVal,
                cpu: cpuVal,
                ssd: ssdVal,
                // Flags for OOM detection
                baselineOOM: d.baselineTTFT === null,
                cpuOOM: d.cpuTTFT === null,
            };
        });
    }, [workloadSize, targetMetric, viewMode, multiplier]);

    // Check if OOM happens in current view to display alert banner
    const hasOOM = useMemo(() => {
        return chartData.some(d => d.baselineOOM || d.cpuOOM);
    }, [chartData]);

    const yAxisLabel = viewMode === 'cost' ? 'Cost per 1M Tokens ($)' : `${targetMetric} Latency (ms)`;

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center pt-16 md:pl-24 w-full">
            
            {/* Top Navigation Bar */}
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

                    <div>
                        <h1 className="text-sm sm:text-lg font-bold text-white tracking-wide truncate">Prefix cache offloading</h1>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    <button onClick={handleShareView} className="px-4 py-2 text-sm font-medium rounded-md text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors flex items-center border border-slate-700 relative">
                        <Share2 className="w-4 h-4 mr-2" />
                        <span>Share view</span>
                        {shareToast && (
                            <div className="absolute -bottom-10 right-0 bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded shadow-lg z-50">
                                Link copied!
                            </div>
                        )}
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="w-full max-w-7xl px-6 py-8 flex flex-col space-y-6">
                
                {/* ROW 1: Description & Active Config (Aligned with Inference Scheduling) */}
                <div className="relative overflow-hidden border border-slate-800/80 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-slate-950/90 p-5 shadow-2xl backdrop-blur-xl group transition-all duration-500 hover:border-sky-500/30">
                    <div className="absolute -top-24 -right-24 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl group-hover:bg-sky-500/20 transition-all duration-700 pointer-events-none" />
                    
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
                        {/* Col 1: Overview */}
                        <div className="flex flex-col justify-between space-y-3">
                            <div>
                                <div className="text-[10px] font-extrabold text-sky-400 uppercase tracking-widest mb-2">Overview</div>
                                <p className="text-xs text-slate-300 leading-relaxed">
                                    Evaluates dynamic capacity and saturation boundaries under Tiered Prefix Caching. 
                                    Unlike standard metrics that show static averages, these telemetry charts expose the exact load stage 
                                    where native HBM VRAM hits the <strong>"Memory Wall" (OOM)</strong> on long contexts, proving how offloading to Host CPU RAM 
                                    and Managed Lustre / Local SSD extends serving capacity without latency degradation.
                                </p>
                            </div>
                        </div>

                        {/* Col 2: Active Configuration (Algorithm Mode) */}
                        <div className="space-y-2">
                            <div className="text-[10px] font-extrabold text-cyan-400/90 uppercase tracking-widest mb-2">
                                Active Configuration
                            </div>
                            <div className="border border-sky-500/20 rounded-lg bg-slate-900/30 p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-200">Algorithm Mode</span>
                                    <div className="w-1.5 h-1.5 bg-sky-400 rounded-full"></div>
                                </div>
                                <select 
                                    value={optimizationChoice} 
                                    onChange={(e) => setOptimizationChoice(e.target.value)}
                                    className="bg-slate-950 text-sky-400 font-mono font-bold text-xs border border-slate-700 rounded-lg p-2 w-full outline-none focus:border-sky-500 cursor-pointer"
                                >
                                    <option value="standard">Standard Naive Lookup</option>
                                    <option value="approximate">Approximate Prefix Match (Active)</option>
                                    <option value="precise">Precise Mesh Sync (Aggressive)</option>
                                    <option value="predicted">Predicted ML Routing (Max)</option>
                                </select>
                            </div>
                        </div>

                        {/* Col 3: Storage Tier Overlay (Moved from controls) */}
                        <div className="space-y-2">
                            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2">
                                Storage Tier Overlay
                            </div>
                            <div className="border border-slate-800/50 rounded-lg bg-slate-900/30 p-3 space-y-2">
                                <label className="flex items-center gap-2.5 text-xs cursor-pointer text-slate-300 hover:text-white">
                                    <input 
                                        type="checkbox" 
                                        checked={activeTiers.baseline} 
                                        onChange={(e) => setActiveTiers({...activeTiers, baseline: e.target.checked})}
                                        className="rounded border-slate-700 text-orange-500 focus:ring-0 bg-slate-950 w-4 h-4 cursor-pointer"
                                    />
                                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />
                                    <span>Baseline (HBM Only)</span>
                                </label>
                                <label className="flex items-center gap-2.5 text-xs cursor-pointer text-slate-300 hover:text-white">
                                    <input 
                                        type="checkbox" 
                                        checked={activeTiers.cpu} 
                                        onChange={(e) => setActiveTiers({...activeTiers, cpu: e.target.checked})}
                                        className="rounded border-slate-700 text-sky-500 focus:ring-0 bg-slate-950 w-4 h-4 cursor-pointer"
                                    />
                                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0" />
                                    <span>Tiered Cache: CPU RAM</span>
                                </label>
                                <label className="flex items-center gap-2.5 text-xs cursor-pointer text-slate-300 hover:text-white">
                                    <input 
                                        type="checkbox" 
                                        checked={activeTiers.ssd} 
                                        onChange={(e) => setActiveTiers({...activeTiers, ssd: e.target.checked})}
                                        className="rounded border-slate-700 text-emerald-500 focus:ring-0 bg-slate-950 w-4 h-4 cursor-pointer"
                                    />
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                                    <span>Tiered Cache: CPU + Lustre</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ROW 2: Benchmark Scenario, Primary Outcomes & Action */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* CARD 1: Benchmark Scenario */}
                    <div className="lg:col-span-6 border border-slate-800/80 rounded-xl bg-gradient-to-br from-slate-900 to-slate-950 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden">
                        <div className="absolute -top-12 -left-12 w-32 h-32 bg-sky-500/5 rounded-full blur-2xl pointer-events-none" />

                        <div className="mb-3">
                            <span className="text-[11px] font-extrabold text-sky-400/90 uppercase tracking-widest block">
                                Benchmark Scenario
                            </span>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            {/* System Context */}
                            <div className="flex flex-col gap-3 border-r border-slate-800/60 pr-4">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                    System Context
                                </div>
                                <div className="flex flex-col gap-2.5 text-xs">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Hardware</span>
                                        <span className="font-mono font-bold text-white truncate block">g4-standard-384</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Engine</span>
                                        <span className="font-mono font-bold text-white truncate block">vLLM</span>
                                    </div>
                                </div>
                            </div>

                            {/* Model Layer */}
                            <div className="flex flex-col gap-3 border-r border-slate-800/60 pr-4">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                    Model Layer
                                </div>
                                <div className="flex flex-col gap-2.5 text-xs">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Model Name</span>
                                        <span className="font-mono font-bold text-white truncate block">gemma4-31B (FP8)</span>
                                    </div>
                                </div>
                            </div>

                            {/* Workload Size (Moved Control here!) */}
                            <div className="flex flex-col gap-3">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                    Workload Size
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Context Length</span>
                                    <div className="flex flex-col gap-1">
                                        {['10k', '50k', '100k'].map((size) => (
                                            <button
                                                key={size}
                                                onClick={() => setWorkloadSize(size)}
                                                className={`py-1 px-2 rounded font-mono font-bold text-[11px] text-left transition-all flex justify-between items-center ${
                                                    workloadSize === size 
                                                        ? 'bg-sky-600 text-white shadow-sm' 
                                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80 border border-slate-800/50'
                                                }`}
                                            >
                                                <span>{size} Tokens</span>
                                                {workloadSize === size && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CARD 2: Primary Outcomes */}
                    <div className="lg:col-span-3 border border-slate-800 rounded-xl bg-slate-900 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-emerald-500/30 transition-all">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none transition-all group-hover:bg-emerald-500/10" />
                        <div>
                            <div className="text-[11px] font-extrabold text-emerald-400/90 uppercase tracking-widest mb-3">
                                Primary Outcomes
                            </div>
                            <div className="grid grid-cols-1 gap-3">
                                <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2.5 hover:border-emerald-500/20 transition-all flex justify-between items-center">
                                    <div>
                                        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-0.5">
                                            Max Capacity
                                        </h3>
                                        <div className="text-[10px] text-slate-500 font-normal">
                                            (Without OOM)
                                        </div>
                                    </div>
                                    <h4 className="text-xl font-black text-emerald-400 font-mono">
                                        100k Tok
                                    </h4>
                                </div>
                                <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2.5 hover:border-sky-500/20 transition-all flex justify-between items-center">
                                    <div>
                                        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-0.5">
                                            Throughput Gain
                                        </h3>
                                        <div className="text-[10px] text-slate-500 font-normal">
                                            (SSD vs Baseline)
                                        </div>
                                    </div>
                                    <h4 className="text-xl font-black text-sky-400 font-mono">
                                        +264%
                                    </h4>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CARD 3: Action */}
                    <div className="lg:col-span-3 border border-slate-800 rounded-xl bg-slate-900 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden">
                        <div>
                            <p className="text-[11px] font-extrabold text-sky-400/90 uppercase tracking-widest mb-2">
                                Action
                            </p>
                            <h3 className="text-base font-bold text-white mb-1">
                                Reproducibility guide
                            </h3>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Replicate these tiered caching benchmarks on your hardware.
                            </p>
                        </div>

                        <button onClick={() => setIsModalOpen(true)} className="w-full mt-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs rounded-lg shadow transition-all flex justify-center items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5" /> View instructions
                        </button>
                    </div>
                </div>

                {/* Remaining Controls (Target Metric & Advanced) placed above chart */}
                <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-wrap">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Target Metric:</span>
                        <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1">
                            {['TTFT', 'ITL'].map((metric) => (
                                <button
                                    key={metric}
                                    onClick={() => { setTargetMetric(metric); setViewMode('performance'); }}
                                    className={`py-1 px-3 rounded font-mono font-bold text-xs transition-all ${
                                        targetMetric === metric && viewMode === 'performance'
                                            ? 'bg-purple-600 text-white shadow-sm' 
                                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                                    }`}
                                >
                                    {metric === 'TTFT' ? 'TTFT (Prefill)' : 'ITL (Decode)'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">View Mode:</span>
                        <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1">
                            <button
                                onClick={() => setViewMode('performance')}
                                className={`py-1 px-3 rounded text-xs font-medium transition-all ${
                                    viewMode === 'performance' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                Performance
                            </button>
                            <button
                                onClick={() => setViewMode('cost')}
                                className={`py-1 px-3 rounded text-xs font-medium transition-all ${
                                    viewMode === 'cost' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                Cost-to-Serve
                            </button>
                        </div>
                        
                        <button 
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="text-xs font-bold text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-1"
                        >
                            <span>SLO Config</span>
                            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                    </div>

                    {showAdvanced && (
                        <div className="w-full pt-3 border-t border-slate-800/60 flex items-center gap-4 animate-in fade-in duration-200">
                            <label className="flex items-center gap-2 text-xs cursor-pointer text-slate-400 hover:text-slate-200">
                                <input 
                                    type="checkbox" 
                                    checked={showSlo} 
                                    onChange={(e) => setShowSlo(e.target.checked)}
                                    className="rounded border-slate-700 text-sky-500 focus:ring-0 bg-slate-950 w-4 h-4"
                                />
                                <span>Enable SLO Limit line</span>
                            </label>
                            {showSlo && (
                                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                                    <input 
                                        type="number" 
                                        value={sloLimit} 
                                        onChange={(e) => setSloLimit(Number(e.target.value))}
                                        className="w-16 bg-transparent text-white font-mono font-bold text-xs outline-none text-center"
                                    />
                                    <span className="text-xs text-slate-500">ms</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* OOM Crash Alert Banner */}
                {hasOOM && workloadSize !== '10k' && (
                    <div className="bg-red-950/40 border border-red-500/40 p-4 rounded-xl flex items-center justify-between animate-pulse backdrop-blur-sm">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-500/20 text-red-400 rounded-lg">
                                <Zap className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-red-200 uppercase tracking-wider">Memory Wall Detected</h4>
                                <p className="text-xs text-red-300/80 mt-0.5">
                                    At {workloadSize} context scale, native HBM VRAM exceeds capacity resulting in Out-of-Memory (OOM) crashes. 
                                    Notice how the Tiered Cache lines continue serving traffic successfully.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Primary View: Latency vs Throughput Curve Chart */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-800 pb-4">
                        <div>
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <span>System Saturation & Elasticity Curve</span>
                                <span className="text-xs bg-sky-500/20 text-sky-400 font-mono px-2 py-0.5 rounded border border-sky-500/30">
                                    {workloadSize} Workload
                                </span>
                            </h3>
                            <p className="text-xs text-slate-400 mt-1">
                                X-Axis: Throughput Load (tokens/s) | Y-Axis: {yAxisLabel}
                            </p>
                        </div>
                        <div className="text-xs text-slate-500 font-mono">
                            {viewMode === 'cost' ? 'Showing TCO efficiency curves' : 'Showing "Hockey Stick" saturation curves'}
                        </div>
                    </div>

                    <div className="h-80 w-full pt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis 
                                    dataKey="throughput" 
                                    stroke="#64748b" 
                                    fontSize={11}
                                    label={{ value: 'Input Token Throughput (tokens/s)', position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 11 }}
                                />
                                <YAxis 
                                    stroke="#64748b" 
                                    fontSize={11} 
                                    label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
                                />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '11px' }} 
                                    formatter={(val) => [val ? `${val} ${viewMode === 'cost' ? '$' : 'ms'}` : 'OOM / Crash', '']}
                                />
                                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11 }} />
                                
                                {/* SLO Reference Line */}
                                {showSlo && viewMode === 'performance' && (
                                    <ReferenceLine y={sloLimit} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `SLO Limit (${sloLimit}ms)`, fill: '#ef4444', fontSize: 10, position: 'top' }} />
                                )}

                                {activeTiers.baseline && (
                                    <Line 
                                        type="monotone" 
                                        dataKey="baseline" 
                                        name="Baseline (HBM Only)" 
                                        stroke="#fb923c" 
                                        strokeWidth={3} 
                                        connectNulls={false} 
                                        dot={{ r: 4, fill: '#fb923c' }}
                                    />
                                )}
                                {activeTiers.cpu && (
                                    <Line 
                                        type="monotone" 
                                        dataKey="cpu" 
                                        name="Tiered Cache: CPU RAM" 
                                        stroke="#38bdf8" 
                                        strokeWidth={3} 
                                        connectNulls={false} 
                                        dot={{ r: 4, fill: '#38bdf8' }}
                                    />
                                )}
                                {activeTiers.ssd && (
                                    <Line 
                                        type="monotone" 
                                        dataKey="ssd" 
                                        name="Tiered Cache: Managed Lustre / SSD" 
                                        stroke="#34d399" 
                                        strokeWidth={3} 
                                        connectNulls={false} 
                                        dot={{ r: 4, fill: '#34d399' }}
                                    />
                                )}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Secondary View: Context Length vs Storage Tier Heatmap (Deploy Planner) */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                    <div className="p-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-4">
                        <div>
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <HardDrive className="w-4 h-4 text-emerald-400" />
                                <span>Deploy Planner: Storage Tier "Sweet Spots" Heatmap</span>
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Matrix matching prompt size to optimal architecture based on throughput ROI (CUJ 2).
                            </p>
                        </div>
                        <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded uppercase tracking-wider">
                            Interactive ROI Guide
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-slate-950 text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider text-[10px]">
                                    <th className="p-4">Context Scale</th>
                                    <th className="p-4">Baseline (HBM Only)</th>
                                    <th className="p-4">Host CPU RAM Offload</th>
                                    <th className="p-4">Managed Lustre / Local SSD</th>
                                    <th className="p-4 bg-slate-950/50">Recommended Tier</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-medium font-mono">
                                {HEATMAP_DATA.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="p-4 font-bold text-white font-sans">{row.context} Tokens</td>
                                        <td className="p-4"><span className={`px-3 py-1.5 rounded-lg block text-center ${row.baseline.color}`}>{row.baseline.value}</span></td>
                                        <td className="p-4"><span className={`px-3 py-1.5 rounded-lg block text-center ${row.cpu.color}`}>{row.cpu.value}</span></td>
                                        <td className="p-4"><span className={`px-3 py-1.5 rounded-lg block text-center ${row.ssd.color}`}>{row.ssd.value}</span></td>
                                        <td className="p-4 bg-slate-950/30 font-bold text-emerald-400 font-sans flex items-center gap-1.5 mt-1">
                                            <Check className="w-4 h-4 text-emerald-500" /> {row.sweetSpot}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

            </main>

            {/* Reproducibility Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full shadow-2xl flex flex-col overflow-hidden">
                        <header className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/80">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-sky-500/20 text-sky-400 rounded-lg">
                                    <Zap className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Reproducibility Profile</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">Validate tiered cache offloading boundaries natively.</p>
                                </div>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700 transition-colors">
                                ✕
                            </button>
                        </header>

                        <div className="p-6 space-y-4 text-xs text-slate-300 leading-relaxed">
                            <div>
                                <h4 className="text-xs font-extrabold text-sky-400 uppercase tracking-wider mb-1">Direct Reproducibility Action</h4>
                                <p className="text-slate-400">
                                    Manual benchmarks on G4 hardware are time-consuming due to small HBM ceilings. Replicate this exact profile seamlessly using the `llm-d` engine framework.
                                </p>
                            </div>

                            <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg font-mono text-[11px] text-slate-200 select-all">
                                <div className="text-slate-500 mb-1 text-[9px] select-none uppercase font-bold tracking-wider">Execute CLI Command:</div>
                                llm-d bench --profile=tiered-prefix-g4 --context-scales=10k,50k,100k --layers=vram,ram,ssd
                            </div>

                            <div className="pt-2">
                                <a href="https://github.com/llm-d/llm-d" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-sky-400 hover:underline text-xs">
                                    Reproduce this benchmark with llm-d <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex justify-end">
                            <button onClick={() => setIsModalOpen(false)} className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold text-xs transition-colors border border-slate-700">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
