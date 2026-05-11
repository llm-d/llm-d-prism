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
    ArrowLeft, Zap, Sliders, AlertTriangle, Code, HelpCircle, 
    CheckCircle2, Copy, Download, Cpu, Layers, Terminal, Sparkles, RefreshCw 
} from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, Legend } from 'recharts';
import GuidedWizard from './GuidedWizard';

export default function StackInsightEngine({ onNavigateBack }) {
    // Sliders configuration values
    const [promptLength, setPromptLength] = useState(4000);
    const [batchSize, setBatchSize] = useState(16);
    const [selectedFAQ, setSelectedFAQ] = useState(null);
    const [matrixViewMode, setMatrixViewMode] = useState('guided'); // 'visual' | 'tabular' | 'guided'
    const [pinnedConfig, setPinnedConfig] = useState(null); // Snapshot comparison hook state
    const [copiedState, setCopiedState] = useState(false);
    const [workloadGoal, setWorkloadGoal] = useState(null);
    const [modelScale, setModelScale] = useState(null);
    const [showInsights, setShowInsights] = useState(false);

    // GKE Cluster Deployment Operational Simulation States
    const [isDeploying, setIsDeploying] = useState(false);
    const [deploymentStep, setDeploymentStep] = useState(0);
    const [terminalLogs, setTerminalLogs] = useState([]);

    // AI Copilot Intent prompt bar states
    const [intentInput, setIntentInput] = useState('');
    const [isAgentProcessing, setIsAgentProcessing] = useState(false);
    const [agentNote, setAgentNote] = useState(null);
    const [agentHighlight, setAgentHighlight] = useState(false);

    // Simulation inputs
    const [customModel, setCustomModel] = useState('Qwen-3-Dense');
    const [customQuant, setCustomQuant] = useState('4-bit INT4');
    const [customHardware, setCustomHardware] = useState('4x RTX A6000 (Spot)');

    // Prepopulated trending FAQ Questions
    const faqQuestions = [
        {
            id: 1,
            title: "Llama 3 70B on 4x A6000s vs H100 WLP",
            model: "Llama-3-70B",
            quant: "4-bit INT4",
            hardware: "4x RTX A6000 (Spot)",
            prompt: 4000,
            batch: 16
        },
        {
            id: 2,
            title: "Gemma 4 Ultra (4-bit INT4) vs A100 WLP",
            model: "Gemma-4-Ultra",
            quant: "4-bit INT4",
            hardware: "2x RTX 4090 Heterogeneous",
            prompt: 8000,
            batch: 8
        },
        {
            id: 3,
            title: "Mixtral 8x7B MoE on 4x L40S Spot vs H100 WLP",
            model: "Mixtral-8x7B-MoE",
            quant: "8-bit FP8",
            hardware: "4x L40S (Spot)",
            prompt: 16000,
            batch: 32
        }
    ];

    const handleApplyFAQ = (faq) => {
        setSelectedFAQ(faq.id);
        setCustomModel(faq.model);
        setCustomQuant(faq.quant);
        setCustomHardware(faq.hardware);
        setPromptLength(faq.prompt);
        setBatchSize(faq.batch);
    };

    const handleSubmitIntent = (text) => {
        if (!text.trim()) return;
        setIsAgentProcessing(true);
        setAgentNote(null);
        
        setTimeout(() => {
            setIsAgentProcessing(false);
            const query = text.toLowerCase();
            
            if (query.includes('gemma 4') || query.includes('gemma')) {
                setCustomModel('Gemma-4-Ultra');
                setCustomQuant('4-bit INT4');
                setCustomHardware('2x RTX 4090 Heterogeneous');
                setPromptLength(8000);
                setBatchSize(8);
                setSelectedFAQ(2);
                setAgentNote("Optimized cluster matching your intention thresholds. Auto-selected custom multi-node 2x 4090 nodes serving 4-bit INT4 quantization matrices to successfully sustain SLA sub-100ms metrics indices within a $1.10/hr cost ceiling parameter.");
            } else if (query.includes('qwen') || query.includes('throughput')) {
                setCustomModel('Qwen-3-Dense');
                setCustomQuant('8-bit FP8');
                setCustomHardware('4x L40S (Spot)');
                setPromptLength(16000);
                setBatchSize(32);
                setSelectedFAQ(3);
                setAgentNote("High-throughput scaling intent detected. Auto-tuned architecture to 8-bit FP8 quantization over 4x L40S Spot accelerators to prevent context pipeline latency drift and maximize memory generation density.");
            } else {
                setCustomModel('Qwen-3-Dense');
                setCustomQuant('4-bit INT4');
                setCustomHardware('4x RTX A6000 (Spot)');
                setPromptLength(4000);
                setBatchSize(16);
                setAgentNote("Standard balance intent parsed. Adjusted filters to standard dense weights configuration over economical multi-gpu spot ceilings.");
            }
            
            setAgentHighlight(true);
            setTimeout(() => setAgentHighlight(false), 2000);
        }, 1500);
    };

    // Dynamic Price Performance Calculator Logic
    const computedMetrics = useMemo(() => {
        // Base Constants for Well-Lit Path (WLP) e.g., H100 baseline
        const wlpCostPerHour = 4.76;
        const wlpTPS = Math.round(2400 * (32 / batchSize) * (8000 / promptLength));
        const wlpP99 = Math.round(90 + (promptLength * 0.02));
        const wlpEfficiency = parseFloat((wlpTPS / wlpCostPerHour).toFixed(2));

        // Custom configuration estimation (simulating bottlenecks like PCIe bandwidth constraints)
        let customCostPerHour = 1.80; // Default spot or standard rate
        if (customHardware.includes('L40S')) customCostPerHour = 2.60;
        if (customHardware.includes('4090')) customCostPerHour = 1.10;

        // Quantization vs size scaling adjustments
        const quantFactor = customQuant.includes('4-bit') ? 1.4 : 1.0;
        const hardwarePenalty = customHardware.includes('A6000') ? 0.55 : customHardware.includes('4090') ? 0.40 : 0.85;

        const customTPS = Math.round(wlpTPS * hardwarePenalty * quantFactor * 0.8);
        const customP99 = Math.round(wlpP99 * (1 / hardwarePenalty) * 1.1);
        const customEfficiency = parseFloat((customTPS / customCostPerHour).toFixed(2));

        // Delta bounds computation
        const tpsDelta = Math.round(((customTPS - wlpTPS) / wlpTPS) * 100);
        const costDelta = Math.round(((customCostPerHour - wlpCostPerHour) / wlpCostPerHour) * 100);
        const efficiencyDelta = Math.round(((customEfficiency - wlpEfficiency) / wlpEfficiency) * 100);

        // Physical Constraint Warnings Flag
        const vramTotal = customHardware.includes('A6000') ? 192 : customHardware.includes('4090') ? 48 : 192;
        const requiredVRAM = customModel.includes('70B') ? (70 * (customQuant.includes('4-bit') ? 0.55 : 1.1)) : 40;
        const isMemoryCrash = requiredVRAM > vramTotal;

        return {
            wlpCostPerHour, wlpTPS, wlpP99, wlpEfficiency,
            customCostPerHour, customTPS, customP99, customEfficiency,
            tpsDelta, costDelta, efficiencyDelta, isMemoryCrash, requiredVRAM, vramTotal
        };
    }, [promptLength, batchSize, customModel, customQuant, customHardware]);

    // Progressive Resource Bottleneck Radar Analysis Rules Skill
    const bottleneckInsight = useMemo(() => {
        if (computedMetrics.isMemoryCrash) {
            return { 
                text: 'Physical Ceiling Breached: CUDA Out-of-Memory (OOM) Risk Enforced. Reduce VRAM footprints.', 
                color: 'text-rose-400 bg-rose-950/30 border-rose-500/30',
                actionLabel: '⚡ Auto-Optimize Quantization (INT4)',
                actionType: 'fix-quant'
            };
        }
        if (promptLength > 16000 && customHardware.includes('A6000')) {
            return { 
                text: 'Interconnect Bound: High context length over RTX A6000 PCIe splits saturates slots bandwidth.', 
                color: 'text-amber-400 bg-amber-950/30 border-amber-500/30',
                actionLabel: '⚡ Scale-up Cluster Interconnect (4x L40S)',
                actionType: 'fix-hardware-l40s'
            };
        }
        if (batchSize > 32) {
            return { 
                text: 'Compute Bound: High concurrency stream volume scales thread saturation. Risk of processing delays.', 
                color: 'text-amber-400 bg-amber-950/30 border-amber-500/30',
                actionLabel: '⚡ Set Optimal Concurrency Stream Bound',
                actionType: 'fix-batch'
            };
        }
        return { text: 'Infrastructure Optimized: Active scheduling filters fall within stable execution thresholds boundaries.', color: 'text-emerald-400 bg-emerald-950/30 border-emerald-500/30' };
    }, [computedMetrics.isMemoryCrash, promptLength, batchSize, customHardware]);

    const handleApplyProactiveFix = (type) => {
        if (type === 'fix-quant') {
            setCustomQuant('4-bit INT4');
        } else if (type === 'fix-hardware-l40s') {
            setCustomHardware('4x L40S (Spot)');
        } else if (type === 'fix-batch') {
            setBatchSize(32);
        }
    };

    const handleStartDeployment = () => {
        setIsDeploying(true);
        setTerminalLogs(['[SYSTEM] Starting sandbox deployment pipeline orchestration...']);
        
        const logs = [
            '[INFO] Hooking GKE Sandbox Cluster topology controller instance...',
            `[INFO] Provisioning spot node accelerators configuration: ${customHardware}...`,
            `[INFO] Loading transformer matrices context mapping at ${customQuant} quantization...`,
            `[INFO] Rehydrating container weight volumes targeting: ${customModel}...`,
            `[SUCCESS] Sandbox cluster online! SLA metrics verified floor at ${computedMetrics.customTPS} tok/s. Instance link: gke/sandbox-cluster-${Math.random().toString(36).substr(2, 4).toUpperCase()}`
        ];

        logs.forEach((log, index) => {
            setTimeout(() => {
                setTerminalLogs(prev => [...prev, log]);
            }, (index + 1) * 1000);
        });
    };

    // Copy downstream agent specs block string
    const agentSpecJSON = useMemo(() => {
        return JSON.stringify({
            insightEngineVersion: "1.0.0",
            targetModel: customModel,
            quantization: customQuant,
            clusterTopology: customHardware,
            simulationParameters: { promptLength, batchSize },
            estimatedMetrics: {
                tps: computedMetrics.customTPS,
                p99LatencyMs: computedMetrics.customP99,
                hourlyCostUsd: computedMetrics.customCostPerHour,
                tokensPerDollarEfficiency: computedMetrics.customEfficiency
            },
            deploymentPlanId: `WLP-PLAN-${customModel.toUpperCase()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`
        }, null, 2);
    }, [customModel, customQuant, customHardware, promptLength, batchSize, computedMetrics]);

    const handleCopyAgentSpec = () => {
        navigator.clipboard.writeText(agentSpecJSON);
        setCopiedState(true);
        setTimeout(() => setCopiedState(false), 2000);
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center pt-16 md:pl-24 w-full">
            
            {/* Header Strip Component */}
            <header className="w-full h-16 border-b border-slate-800 flex justify-between items-center px-6 bg-slate-900 fixed top-0 left-0 right-0 z-[9999]">
                <div className="flex items-center gap-4">
                    {onNavigateBack && (
                        <button onClick={onNavigateBack} className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                    )}
                    <div className="flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-sky-400" />
                        <h1 className="text-lg font-bold text-white tracking-wide">Guided Simulator</h1>
                    </div>
                </div>
            </header>

            <main className="w-full max-w-7xl px-6 py-8 flex flex-col space-y-6">

                
                {/* Physical Hardware Memory Constraint Alert Banner */}
                {computedMetrics.isMemoryCrash && (
                    <div className="bg-rose-950/70 border border-rose-500 text-rose-200 p-4 rounded-xl flex items-start gap-3 shadow-lg animate-bounce">
                        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Memory Constraint Warning</h4>
                            <p className="text-xs text-rose-300 mt-0.5">
                                Physically Impossible Allocation. The weights configuration for <span className="font-bold">{customModel}</span> ({customQuant}) requires approximately <span className="font-mono font-bold text-white">{Math.round(computedMetrics.requiredVRAM)}GB</span> VRAM, which exceeds the total target hardware ceiling of <span className="font-mono font-bold text-white">{computedMetrics.vramTotal}GB</span>. High probability of CUDA Out-of-Memory exception.
                            </p>
                        </div>
                    </div>
                )}



                {/* Main Core Workspaces Dashboard Layout Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
                    {/* Sidebar for Controls */}
                    <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col space-y-6 h-full">
                        
                        {/* AI Magic Intent Prompt Input Bar */}
                        <div className={`transition-all flex flex-col space-y-2 ${agentHighlight ? 'bg-sky-950/20 p-2 rounded-lg animate-pulse' : ''}`}>
                            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 select-none">
                                <span className="flex items-center gap-1.5 text-sky-400"><Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" /> Ask Agent</span>
                            </div>
                            <div className="flex flex-col gap-2">
                                <input
                                    type="text"
                                    disabled={isAgentProcessing}
                                    value={intentInput}
                                    onChange={(e) => setIntentInput(e.target.value)}
                                    placeholder="Target latency..."
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-sky-500/60 disabled:opacity-60"
                                />
                                <button
                                    disabled={isAgentProcessing || !intentInput.trim()}
                                    onClick={() => handleSubmitIntent(intentInput)}
                                    className="w-full py-1.5 bg-sky-600 text-white rounded-lg text-[10px] font-extrabold uppercase hover:bg-sky-500 disabled:opacity-40 transition-all cursor-pointer"
                                >
                                    {isAgentProcessing ? 'Processing...' : 'Analyze'}
                                </button>
                            </div>
                        </div>

                        {/* Custom Tuning Controls */}
                        <div className="flex flex-col space-y-4 pt-4 border-t border-slate-800">
                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block border-b border-slate-800 pb-1.5">Configuration</span>
                            
                            {/* Dropdowns */}
                            <div className="space-y-2.5">
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">Model</label>
                                    <select 
                                        value={customModel}
                                        onChange={(e) => setCustomModel(e.target.value)}
                                        className="w-full bg-slate-950 text-slate-200 font-mono font-bold text-[11px] p-1.5 rounded-lg border border-slate-800 outline-none focus:border-sky-500 cursor-pointer"
                                    >
                                        <option value="Qwen-3-Dense">Qwen 3 (Dense)</option>
                                        <option value="Gemma-4-Ultra">Gemma 4 (Ultra)</option>
                                        <option value="Mixtral-8x7B-MoE">Mixtral 8x7B</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">Quantization</label>
                                    <select 
                                        value={customQuant}
                                        onChange={(e) => setCustomQuant(e.target.value)}
                                        className="w-full bg-slate-950 text-slate-200 font-mono font-bold text-[11px] p-1.5 rounded-lg border border-slate-800 outline-none focus:border-sky-500 cursor-pointer"
                                    >
                                        <option value="4-bit INT4">4-bit INT4</option>
                                        <option value="8-bit FP8">8-bit FP8</option>
                                        <option value="16-bit FP16">16-bit FP16</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">Hardware</label>
                                    <select 
                                        value={customHardware}
                                        onChange={(e) => setCustomHardware(e.target.value)}
                                        className="w-full bg-slate-950 text-slate-200 font-mono font-bold text-[11px] p-1.5 rounded-lg border border-slate-800 outline-none focus:border-sky-500 cursor-pointer"
                                    >
                                        <option value="4x RTX A6000 (Spot)">4x A6000 (Spot)</option>
                                        <option value="4x L40S (Spot)">4x L40S (Spot)</option>
                                        <option value="2x RTX 4090 Heterogeneous">2x 4090 Custom</option>
                                    </select>
                                </div>
                            </div>

                            {/* Sliders */}
                            <div className="space-y-3 pt-1 border-t border-slate-800">
                                <div>
                                    <div className="flex justify-between text-[10px] font-medium mb-0.5">
                                        <span className="text-slate-500">Prompt Length:</span>
                                        <span className="font-mono font-bold text-sky-400">{promptLength.toLocaleString()}</span>
                                    </div>
                                    <input 
                                        type="range" min="1000" max="32000" step="1000" value={promptLength} 
                                        onChange={(e) => setPromptLength(parseInt(e.target.value))}
                                        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                                    />
                                </div>
                                <div>
                                    <div className="flex justify-between text-[10px] font-medium mb-0.5">
                                        <span className="text-slate-500">Batch Size:</span>
                                        <span className="font-mono font-bold text-sky-400">{batchSize}</span>
                                    </div>
                                    <input 
                                        type="range" min="1" max="128" step="1" value={batchSize} 
                                        onChange={(e) => setBatchSize(parseInt(e.target.value))}
                                        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Main Canvas for Results */}
                    <div className="lg:col-span-9 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col space-y-4 h-full">
                        {/* View Toggle Switch */}
                        <div className="flex justify-end mb-2">
                            <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5 gap-0.5 font-mono text-[10px]">
                                <button 
                                    onClick={() => setMatrixViewMode('guided')} 
                                    className={`px-2.5 py-1 font-bold rounded transition-all ${matrixViewMode === 'guided' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                                >
                                    Guided
                                </button>
                                <button 
                                    onClick={() => setMatrixViewMode('visual')} 
                                    className={`px-2.5 py-1 font-bold rounded transition-all ${matrixViewMode === 'visual' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                                >
                                    Visual
                                </button>
                                <button 
                                    onClick={() => setMatrixViewMode('tabular')} 
                                    className={`px-2.5 py-1 font-bold rounded transition-all ${matrixViewMode === 'tabular' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                                >
                                    Tabular
                                </button>
                            </div>
                        </div>

                        {matrixViewMode === 'guided' ? (
                            <GuidedWizard 
                                onApplyPath={(path) => {
                                    setCustomModel(path.model);
                                    setCustomHardware(path.hardware);
                                    setBatchSize(path.batch);
                                    setPromptLength(path.prompt);
                                    setMatrixViewMode('visual');
                                }}
                                onSkip={() => setMatrixViewMode('visual')}
                            />
                        ) : (
                            <>

                        {/* UI Architecture Element: The Comparison Matrix Table */}
                            <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-bold text-white">Price-Performance Comparison Matrix</h3>
                                    <p className="text-[11px] text-slate-400">Side-by-side mapping of WLP targets versus your custom infrastructure sandbox.</p>
                                    <p className="text-[10px] text-slate-500 mt-1">📌 Pinning snapshots your configuration so you can continue adjusting variables to compare multiple vectors side-by-side.</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {/* Pin Action Trigger Button skill */}
                                    {!computedMetrics.isMemoryCrash && (
                                        <button
                                            onClick={() => {
                                                if (pinnedConfig) {
                                                    setPinnedConfig(null);
                                                } else {
                                                    setPinnedConfig({
                                                        model: customModel,
                                                        hardware: customHardware.split(' ')[0],
                                                        tps: computedMetrics.customTPS,
                                                        latency: computedMetrics.customP99,
                                                        cost: computedMetrics.customCostPerHour,
                                                        efficiency: computedMetrics.customEfficiency
                                                    });
                                                }
                                            }}
                                            className={`px-2.5 py-1 font-mono font-bold border rounded-lg text-[10px] transition-all uppercase tracking-wide flex items-center gap-1 ${pinnedConfig ? 'bg-purple-600 text-white border-purple-500 hover:bg-purple-500' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'}`}
                                        >
                                            {pinnedConfig ? `❌ Clear Pin: ${pinnedConfig.model}` : '📌 Pin Configuration'}
                                        </button>
                                    )}
                                </div>
                            </div>
                            {matrixViewMode === 'tabular' ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-xs font-mono">
                                        <thead>
                                            <tr className="bg-slate-950 text-slate-500 border-b border-slate-800 text-[10px] uppercase tracking-wider font-bold">
                                                <th className="p-3.5">Evaluation Metric</th>
                                                <th className="p-3.5 text-orange-400 bg-orange-950/5">Well-Lit Path Baseline</th>
                                                {pinnedConfig && <th className="p-3.5 text-purple-400 bg-purple-950/5">Pinned Profile</th>}
                                                <th className="p-3.5 text-sky-400 bg-sky-950/5">User Custom Config</th>
                                                <th className="p-3.5 text-right">Parity Delta</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50 text-slate-200 font-medium">
                                            <tr data-agent-metric="throughput" className="hover:bg-slate-800/20 transition-all">
                                                <td className="p-3.5 font-bold font-sans flex items-center gap-2">
                                                    Throughput Rate (TPS)
                                                    {computedMetrics.customTPS > computedMetrics.wlpTPS && <span className="text-[8px] font-mono bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider animate-pulse">🏆 Max Velocity</span>}
                                                </td>
                                                <td data-agent-value-role="baseline" className="p-3.5 text-slate-400">{computedMetrics.wlpTPS} tok/s</td>
                                                {pinnedConfig && <td className="p-3.5 text-purple-300 font-bold">{pinnedConfig.tps} tok/s</td>}
                                                <td data-agent-value-role="custom" className="p-3.5 font-bold text-white">{computedMetrics.customTPS} tok/s</td>
                                                <td data-agent-value-role="delta" data-agent-delta={computedMetrics.tpsDelta} className="p-3.5 text-right">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${computedMetrics.tpsDelta >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                                        {computedMetrics.tpsDelta >= 0 ? `+${computedMetrics.tpsDelta}%` : `${computedMetrics.tpsDelta}%`}
                                                    </span>
                                                </td>
                                            </tr>
                                            <tr data-agent-metric="latency" className="hover:bg-slate-800/20 transition-all">
                                                <td className="p-3.5 font-bold font-sans flex items-center gap-2">
                                                    Tail Latency drops (P99)
                                                    {computedMetrics.customP99 <= computedMetrics.wlpP99 && <span className="text-[8px] font-mono bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">⚡ Ultra Low Jitter</span>}
                                                </td>
                                                <td data-agent-value-role="baseline" className="p-3.5 text-slate-400">{computedMetrics.wlpP99} ms</td>
                                                {pinnedConfig && <td className="p-3.5 text-purple-300 font-bold">{pinnedConfig.latency} ms</td>}
                                                <td data-agent-value-role="custom" className="p-3.5 font-bold text-white">{computedMetrics.customP99} ms</td>
                                                <td data-agent-value-role="delta" data-agent-delta={Math.round((computedMetrics.customP99-computedMetrics.wlpP99)/computedMetrics.wlpP99*100)} className="p-3.5 text-right">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${computedMetrics.customP99 <= computedMetrics.wlpP99 ? 'bg-green-500/10 text-green-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                                        {computedMetrics.customP99 > computedMetrics.wlpP99 ? `+${Math.round((computedMetrics.customP99-computedMetrics.wlpP99)/computedMetrics.wlpP99*100)}% latency` : `-${Math.round((computedMetrics.wlpP99-computedMetrics.customP99)/computedMetrics.wlpP99*100)}% drop`}
                                                    </span>
                                                </td>
                                            </tr>
                                            <tr data-agent-metric="cost" className="hover:bg-slate-800/20 transition-all">
                                                <td className="p-3.5 font-bold font-sans flex items-center gap-2">
                                                    Hourly Cluster Cost
                                                    {computedMetrics.customCostPerHour < computedMetrics.wlpCostPerHour && <span className="text-[8px] font-mono bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">💎 Budget Champion</span>}
                                                </td>
                                                <td data-agent-value-role="baseline" className="p-3.5 text-slate-400">${computedMetrics.wlpCostPerHour.toFixed(2)}/hr</td>
                                                {pinnedConfig && <td className="p-3.5 text-purple-300 font-bold">${pinnedConfig.cost.toFixed(2)}/hr</td>}
                                                <td data-agent-value-role="custom" className="p-3.5 font-bold text-white">${computedMetrics.customCostPerHour.toFixed(2)}/hr</td>
                                                <td data-agent-value-role="delta" data-agent-delta={computedMetrics.costDelta} className="p-3.5 text-right">
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-400">
                                                        {computedMetrics.costDelta}% savings
                                                    </span>
                                                </td>
                                            </tr>
                                            <tr data-agent-metric="efficiency" className="bg-slate-900/50 hover:bg-slate-800/30 transition-all font-sans">
                                                <td className="p-3.5 font-extrabold text-white flex items-center gap-1.5">
                                                    <Zap className="w-3.5 h-3.5 text-amber-400" /> Price-Performance Efficiency
                                                    {computedMetrics.efficiencyDelta > 0 && <span className="text-[8px] font-mono bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">🔥 Peak ROI Path</span>}
                                                </td>
                                                <td data-agent-value-role="baseline" className="p-3.5 font-mono text-slate-400 font-semibold">{computedMetrics.wlpEfficiency} tokens/$</td>
                                                {pinnedConfig && <td className="p-3.5 font-mono font-bold text-purple-450">{pinnedConfig.efficiency} tokens/$</td>}
                                                <td data-agent-value-role="custom" className="p-3.5 font-mono font-black text-sky-400">{computedMetrics.customEfficiency} tokens/$</td>
                                                <td data-agent-value-role="delta" data-agent-delta={computedMetrics.efficiencyDelta} className="p-3.5 text-right">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${computedMetrics.efficiencyDelta >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                                        {computedMetrics.efficiencyDelta >= 0 ? `+${computedMetrics.efficiencyDelta}% efficiency` : `${computedMetrics.efficiencyDelta}% vs path`}
                                                    </span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                /* Visual View: 2x2 Grid of Mini Bar Charts with live Header Trait Pills */
                                <div className="p-5 bg-slate-950/30 flex flex-col space-y-5">
                                    {/* Visual Header Badges Upgrade Row */}
                                    <div className="flex flex-wrap items-center gap-2 select-none font-mono border-b border-slate-800/50 pb-3">
                                        <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest font-mono">Active Path Characteristics //</span>
                                        {computedMetrics.customTPS > computedMetrics.wlpTPS && (
                                            <span className="text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md">🏆 Max Velocity</span>
                                        )}
                                        {computedMetrics.customP99 <= computedMetrics.wlpP99 && (
                                            <span className="text-[9px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded-md">⚡ Ultra Low Jitter</span>
                                        )}
                                        {computedMetrics.customCostPerHour < computedMetrics.wlpCostPerHour && (
                                            <span className="text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md">💎 Budget Champion</span>
                                        )}
                                        {computedMetrics.efficiencyDelta > 0 && (
                                            <span className="text-[9px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-md">🔥 Peak ROI Path</span>
                                        )}
                                        {computedMetrics.tpsDelta <= 0 && computedMetrics.costDelta >= 0 && (
                                            <span className="text-[9px] font-bold bg-slate-850 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-md">⚖️ Standard Profile Balance</span>
                                        )}
                                    </div>

                                    {/* 2x2 Grid of Bar Charts */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Chart 1: Throughput */}
                                        <div className="p-3 rounded-xl bg-slate-950/50 h-44 flex flex-col">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[10px] font-bold font-sans text-slate-400 uppercase">Throughput Rate (TPS)</span>
                                                <span className={`text-[10px] font-mono font-bold ${computedMetrics.tpsDelta >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                                                    {computedMetrics.tpsDelta >= 0 ? `+${computedMetrics.tpsDelta}%` : `${computedMetrics.tpsDelta}%`}
                                                </span>
                                            </div>
                                            <div className="flex-1 w-full h-full text-[10px]">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={[
                                                        { name: 'Baseline', value: computedMetrics.wlpTPS },
                                                        ...(pinnedConfig ? [{ name: 'Pinned', value: pinnedConfig.tps }] : []),
                                                        { name: 'Custom', value: computedMetrics.customTPS }
                                                    ]} margin={{ top: 10, bottom: 5, left: -25, right: 5 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                                                        <XAxis dataKey="name" stroke="#4b5563" fontSize={9} />
                                                        <YAxis stroke="#4b5563" fontSize={9} />
                                                        <Tooltip cursor={false} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '6px', fontSize: 11 }} itemStyle={{ color: '#cbd5e1' }} labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }} formatter={(value) => [`${value} tok/s`, 'Throughput']} />
                                                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                                            <Cell fill="#fb923c" />
                                                            {pinnedConfig && <Cell fill="#a855f7" />}
                                                            <Cell fill="#38bdf8" />
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>

                                        {/* Chart 2: Latency */}
                                        <div className="p-3 rounded-xl bg-slate-950/50 h-44 flex flex-col">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[10px] font-bold font-sans text-slate-400 uppercase">Tail Latency (P99)</span>
                                                <span className={`text-[10px] font-mono font-bold ${computedMetrics.customP99 <= computedMetrics.wlpP99 ? 'text-green-400' : 'text-rose-400'}`}>
                                                    {computedMetrics.customP99 > computedMetrics.wlpP99 ? `+${Math.round((computedMetrics.customP99-computedMetrics.wlpP99)/computedMetrics.wlpP99*100)}%` : `-${Math.round((computedMetrics.wlpP99-computedMetrics.customP99)/computedMetrics.wlpP99*100)}%`}
                                                </span>
                                            </div>
                                            <div className="flex-1 w-full h-full text-[10px]">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={[
                                                        { name: 'Baseline', value: computedMetrics.wlpP99 },
                                                        ...(pinnedConfig ? [{ name: 'Pinned', value: pinnedConfig.latency }] : []),
                                                        { name: 'Custom', value: computedMetrics.customP99 }
                                                    ]} margin={{ top: 10, bottom: 5, left: -25, right: 5 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                                                        <XAxis dataKey="name" stroke="#4b5563" fontSize={9} />
                                                        <YAxis stroke="#4b5563" fontSize={9} />
                                                        <Tooltip cursor={false} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '6px', fontSize: 11 }} itemStyle={{ color: '#cbd5e1' }} labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }} formatter={(value) => [`${value} ms`, 'Latency']} />
                                                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                                            <Cell fill="#fb923c" />
                                                            {pinnedConfig && <Cell fill="#a855f7" />}
                                                            <Cell fill="#38bdf8" />
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>

                                        {/* Chart 3: Cost */}
                                        <div className="p-3 rounded-xl bg-slate-950/50 h-44 flex flex-col">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[10px] font-bold font-sans text-slate-400 uppercase">Hourly Cluster Cost</span>
                                                <span className="text-[10px] font-mono font-bold text-green-400">
                                                    {computedMetrics.costDelta}% savings
                                                </span>
                                            </div>
                                            <div className="flex-1 w-full h-full text-[10px]">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={[
                                                        { name: 'Baseline', value: computedMetrics.wlpCostPerHour },
                                                        ...(pinnedConfig ? [{ name: 'Pinned', value: pinnedConfig.cost }] : []),
                                                        { name: 'Custom', value: computedMetrics.customCostPerHour }
                                                    ]} margin={{ top: 10, bottom: 5, left: -25, right: 5 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                                                        <XAxis dataKey="name" stroke="#4b5563" fontSize={9} />
                                                        <YAxis stroke="#4b5563" fontSize={9} />
                                                        <Tooltip cursor={false} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '6px', fontSize: 11 }} itemStyle={{ color: '#cbd5e1' }} labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }} formatter={(value) => [`$${value.toFixed(2)}/hr`, 'Cost']} />
                                                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                                            <Cell fill="#fb923c" />
                                                            {pinnedConfig && <Cell fill="#a855f7" />}
                                                            <Cell fill="#38bdf8" />
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>

                                        {/* Chart 4: Efficiency */}
                                        <div className="p-3 rounded-xl bg-slate-950/50 h-44 flex flex-col">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[10px] font-bold font-sans text-slate-400 uppercase flex items-center gap-1">
                                                    <Zap className="w-3 h-3 text-amber-400" /> Price-Perf Efficiency
                                                </span>
                                                <span className={`text-[10px] font-mono font-bold ${computedMetrics.efficiencyDelta >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                                                    {computedMetrics.efficiencyDelta >= 0 ? `+${computedMetrics.efficiencyDelta}%` : `${computedMetrics.efficiencyDelta}%`}
                                                </span>
                                            </div>
                                            <div className="flex-1 w-full h-full text-[10px]">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={[
                                                        { name: 'Baseline', value: computedMetrics.wlpEfficiency },
                                                        ...(pinnedConfig ? [{ name: 'Pinned', value: pinnedConfig.efficiency }] : []),
                                                        { name: 'Custom', value: computedMetrics.customEfficiency }
                                                    ]} margin={{ top: 10, bottom: 5, left: -20, right: 5 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                                                        <XAxis dataKey="name" stroke="#4b5563" fontSize={9} />
                                                        <YAxis stroke="#4b5563" fontSize={9} />
                                                        <Tooltip cursor={false} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '6px', fontSize: 11 }} itemStyle={{ color: '#cbd5e1' }} labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }} formatter={(value) => [`${value} tok/$`, 'Efficiency']} />
                                                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                                            <Cell fill="#fb923c" />
                                                            {pinnedConfig && <Cell fill="#a855f7" />}
                                                            <Cell fill="#38bdf8" />
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            </>
                )}
                    </div>
                </div> {/* Close Main Grid */}

                {matrixViewMode !== 'guided' && (
                    <>
                        <div className="flex justify-center mt-4">
                            <button
                                onClick={() => setShowInsights(!showInsights)}
                                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-700 transition-colors cursor-pointer"
                            >
                                {showInsights ? 'Hide Insights & Actions' : 'Show Insights & Actions'}
                            </button>
                        </div>

                        {showInsights && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mt-4">
                    {/* Card 1: Architecture Tips */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-5 flex flex-col justify-between min-h-[240px]">
                        <div className="space-y-3 text-xs">
                            <div className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                                <Layers className="w-3 h-3" /> Architecture Tips // Specialized Optimization Rules
                            </div>
                            <div className="space-y-2.5">
                                {customHardware.includes('A6000') && (
                                    <div className="bg-slate-950/40 p-2.5 rounded-lg border-l-2 border-amber-500">
                                        <div className="font-bold text-slate-200 mb-0.5">PCIe Interconnect Bottlenecks</div>
                                        <p className="text-slate-400 text-[11px]">RTX A6000 topologies encounter limits over standard PCIe lanes. Limit execution to batch concurrency limits below 32 to prevent context stall.</p>
                                    </div>
                                )}
                                {customQuant.includes('4-bit') && (
                                    <div className="bg-slate-950/40 p-2.5 rounded-lg border-l-2 border-sky-500">
                                        <div className="font-bold text-slate-200 mb-0.5">Quantization Accuracy</div>
                                        <p className="text-slate-400 text-[11px]">4-bit INT4 quantization preserves ~95% accuracy while reducing VRAM footprint by half. Ideal for large models on limited hardware.</p>
                                    </div>
                                )}
                                <div className="bg-slate-950/40 p-2.5 rounded-lg border-l-2 border-emerald-500">
                                    <div className="font-bold text-slate-200 mb-0.5">Activate Flash Attention 2</div>
                                    <p className="text-slate-400 text-[11px]">Switching to Flash Attention 2 kernels nets approximately a <span className="text-green-400 font-bold">15% throughput acceleration</span> on this config by reducing memory copy cycles.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Card 2: Agent Handoff */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-5 flex flex-col justify-between min-h-[240px]">
                        <div className="flex flex-col space-y-2.5 flex-1">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-extrabold text-sky-400 uppercase tracking-wider flex items-center gap-1">
                                    <Code className="w-3 h-3" /> Agent Handoff // Automated Downstream Handoff
                                </span>
                                <button 
                                    onClick={handleCopyAgentSpec}
                                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-all flex items-center gap-1 text-[10px] font-bold"
                                >
                                    {copiedState ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    {copiedState ? 'Copied' : 'Copy Specs'}
                                </button>
                            </div>
                            <textarea 
                                readOnly 
                                value={agentSpecJSON}
                                data-agent-output="spec-json"
                                className="w-full flex-1 h-32 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[10px] p-2 text-slate-400 focus:outline-none resize-none no-scrollbar"
                            />
                        </div>
                    </div>

                    {/* Card 3: Cluster Planner */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-5 flex flex-col justify-between min-h-[240px]">
                        <div className="flex flex-col justify-between flex-1 space-y-3.5 text-xs">
                            <div className="space-y-2">
                                <div className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider flex items-center gap-1 select-none">
                                    <Cpu className="w-3 h-3" /> Cluster Planner // Tiered Cache Spec Template
                                </div>
                                <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-2.5 text-[11px] text-slate-400 space-y-1 font-mono">
                                    <div className="flex justify-between text-slate-300 font-bold border-b border-slate-900 pb-0.5 mb-1"><span className="font-sans text-[10px] uppercase text-slate-500">Document Section</span><span>Metric Target</span></div>
                                    <div className="flex justify-between"><span>1. Node Cluster Topology</span><span className="text-white font-bold">{customHardware.split(' ')[0]} Specs</span></div>
                                    <div className="flex justify-between"><span>2. Weight VRAM Boundaries</span><span className="text-white font-bold">{customQuant} Quant</span></div>
                                    <div className="flex justify-between"><span>3. Throughput Floor Target</span><span className="text-sky-400 font-bold">{computedMetrics.customTPS} tok/s</span></div>
                                    <div className="flex justify-between"><span>4. Cost-Efficiency Ceiling</span><span className="text-emerald-400 font-bold">{computedMetrics.customEfficiency} t/$</span></div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] rounded-xl shadow transition-all flex justify-center items-center gap-1 uppercase tracking-wider border border-slate-700/60">
                                    <Download className="w-3.5 h-3.5" /> Export Blueprint
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => handleStartDeployment()}
                                    className={`flex-1 py-2 font-bold text-[11px] rounded-xl shadow transition-all flex justify-center items-center gap-1 uppercase tracking-wider border cursor-pointer ${isDeploying ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-sky-600 hover:bg-sky-500 text-white border-sky-500'}`}
                                >
                                    <Zap className="w-3.5 h-3.5 text-white" /> {isDeploying ? 'Provisioning Sandbox...' : 'Deploy Cluster'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Card 4: Agent Skills & FAQ */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-5 flex flex-col justify-between min-h-[240px]">
                        <div className="space-y-3 text-xs flex flex-col flex-1">
                            <div className="text-[10px] font-extrabold text-purple-400 uppercase tracking-wider mb-1 flex items-center gap-1 select-none">
                                <HelpCircle className="w-3 h-3" /> Agent Skills & FAQ // Comparison FAQ
                            </div>
                            <div className="space-y-2.5 flex-1 overflow-y-auto pr-1 no-scrollbar max-h-[180px]">
                                <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800">
                                    <span className="font-bold text-slate-200 block mb-1 text-[11px]">Q: When is 4x RTX A6000 Spot preferred over H100 WLP?</span>
                                    <p className="text-slate-400 text-[11px] leading-relaxed">A: For sub-peak concurrency batch sizes (&lt;32) where spot infrastructure cost savings (&gt;60%) outweigh the severe PCIe interconnect bandwidth penalty encountered during text loops.</p>
                                </div>
                                <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800">
                                    <span className="font-bold text-slate-200 block mb-1 text-[11px]">Q: How do Qwen 3 results translate to Gemma 4?</span>
                                    <p className="text-slate-400 text-[11px] leading-relaxed">A: Qwen 3 dense architectures exhibit high initial throughput but scale memory bandwidth bounds more aggressively than Gemma 4 multi-query heads. Under identical sandbox metrics parameters, Gemma 4 sustains a 1.2x parity efficiency acceleration.</p>
                                </div>
                                <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800">
                                    <span className="font-bold text-slate-200 block mb-1 text-[11px]">Q: How does FP8 quantization impact efficiency vs FP16?</span>
                                    <p className="text-slate-400 text-[11px] leading-relaxed">A: Native Transformer 8-bit (FP8) halves model weights size footprints, preventing CUDA out-of-memory crashes at ultra-long sequence bounds while preserving ~98% precision accuracy and doubling active efficiency indices.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                )}
                    </>
                )}

                {/* Live Operational Sandbox Provisioning Terminal Drawer */}
                {isDeploying && (
                    <div className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-2xl font-mono text-[11px] space-y-2 mt-6 text-left animate-fade-in">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-slate-400 select-none text-[10px] font-bold">
                            <span className="flex items-center gap-2 text-emerald-400">
                                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
                                GKE Sandbox Container Provisioning Hub Stream
                            </span>
                            <span>Borg Service Cluster Node V2 // Live telemetry</span>
                        </div>
                        <div className="space-y-1 max-h-[150px] overflow-y-auto no-scrollbar select-text pr-1 text-slate-300">
                            {terminalLogs.map((log, index) => (
                                <div key={index} className={`${log.includes('[SUCCESS]') ? 'text-emerald-400 font-bold' : log.includes('[SYSTEM]') ? 'text-sky-400 font-bold' : 'text-slate-400'}`}>
                                    {log}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </main>
        </div>
    );
}
