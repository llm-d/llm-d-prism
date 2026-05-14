import React, { useState, useMemo } from 'react';
import { 
    Activity, Zap, BarChart2, ArrowLeft, Menu, Share2, Shield, CheckCircle, AlertTriangle, 
    ExternalLink, FileCode, GitCommit, Clock, Cpu, Server, Info, ChevronDown, ChevronUp, Download, Layers 
} from 'lucide-react';
import { 
    ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine 
} from 'recharts';
import { CustomXAxis, CustomYAxis } from './common';

// Mock Nightly Build Regression Data (Last 30 days)
const NIGHTLY_RUNS = [
    { build: 'b120', date: 'Apr 12', ttft: 185, itl: 14.2, qps: 3100, p90Latency: 205, cacheHitPct: 84, status: 'stable', commit: 'c1a2b3c', pr: '#4010', author: '@shorgan' },
    { build: 'b121', date: 'Apr 13', ttft: 184, itl: 14.1, qps: 3150, p90Latency: 202, cacheHitPct: 85, status: 'stable', commit: 'd2b3c4d', pr: '#4012', author: '@rajithal' },
    { build: 'b122', date: 'Apr 14', ttft: 186, itl: 14.3, qps: 3120, p90Latency: 208, cacheHitPct: 83, status: 'stable', commit: 'e3c4d5e', pr: '#4015', author: '@sean' },
    { build: 'b123', date: 'Apr 15', ttft: 182, itl: 14.0, qps: 3200, p90Latency: 200, cacheHitPct: 86, status: 'stable', commit: 'f4d5e6f', pr: '#4019', author: '@rli' },
    { build: 'b124', date: 'Apr 16', ttft: 185, itl: 14.2, qps: 3110, p90Latency: 206, cacheHitPct: 84, status: 'stable', commit: 'a5e6f7a', pr: '#4021', author: '@ming' },
    { build: 'b125', date: 'Apr 17', ttft: 183, itl: 14.1, qps: 3180, p90Latency: 201, cacheHitPct: 85, status: 'stable', commit: 'b6f7a8b', pr: '#4025', author: '@wwei' },
    { build: 'b126', date: 'Apr 18', ttft: 185, itl: 14.3, qps: 3090, p90Latency: 207, cacheHitPct: 83, status: 'stable', commit: 'c7a8b9c', pr: '#4028', author: '@shorgan' },
    { build: 'b127', date: 'Apr 19', ttft: 184, itl: 14.2, qps: 3140, p90Latency: 204, cacheHitPct: 84, status: 'stable', commit: 'd8b9c0d', pr: '#4030', author: '@rajithal' },
    { build: 'b128', date: 'Apr 20', ttft: 187, itl: 14.4, qps: 3080, p90Latency: 210, cacheHitPct: 82, status: 'stable', commit: 'e9c0d1e', pr: '#4035', author: '@sean' },
    { build: 'b129', date: 'Apr 21', ttft: 183, itl: 14.1, qps: 3160, p90Latency: 202, cacheHitPct: 85, status: 'stable', commit: 'f0d1e2f', pr: '#4040', author: '@rli' },
    { build: 'b130', date: 'Apr 22', ttft: 186, itl: 14.3, qps: 3100, p90Latency: 208, cacheHitPct: 83, status: 'stable', commit: 'a1e2f3a', pr: '#4042', author: '@ming' },
    { build: 'b131', date: 'Apr 23', ttft: 184, itl: 14.1, qps: 3150, p90Latency: 203, cacheHitPct: 84, status: 'stable', commit: 'b2f3a4b', pr: '#4045', author: '@wwei' },
    { build: 'b132', date: 'Apr 24', ttft: 185, itl: 14.2, qps: 3120, p90Latency: 206, cacheHitPct: 84, status: 'stable', commit: 'c3a4b5c', pr: '#4050', author: '@shorgan' },
    { build: 'b133', date: 'Apr 25', ttft: 182, itl: 14.0, qps: 3210, p90Latency: 199, cacheHitPct: 86, status: 'stable', commit: 'd4b5c6d', pr: '#4055', author: '@rajithal' },
    { build: 'b134', date: 'Apr 26', ttft: 186, itl: 14.3, qps: 3090, p90Latency: 209, cacheHitPct: 82, status: 'stable', commit: 'e5c6d7e', pr: '#4060', author: '@sean' },
    { build: 'b135', date: 'Apr 27', ttft: 184, itl: 14.1, qps: 3170, p90Latency: 203, cacheHitPct: 85, status: 'stable', commit: 'f6d7e8f', pr: '#4065', author: '@rli' },
    { build: 'b136', date: 'Apr 28', ttft: 185, itl: 14.2, qps: 3130, p90Latency: 205, cacheHitPct: 84, status: 'stable', commit: 'a7e8f9a', pr: '#4070', author: '@ming' },
    { build: 'b137', date: 'Apr 29', ttft: 183, itl: 14.1, qps: 3190, p90Latency: 201, cacheHitPct: 85, status: 'stable', commit: 'b8f9a0b', pr: '#4072', author: '@wwei' },
    { build: 'b138', date: 'Apr 30', ttft: 186, itl: 14.3, qps: 3100, p90Latency: 208, cacheHitPct: 83, status: 'stable', commit: 'c9a0b1c', pr: '#4075', author: '@shorgan' },
    { build: 'b139', date: 'May 01', ttft: 184, itl: 14.2, qps: 3140, p90Latency: 204, cacheHitPct: 84, status: 'stable', commit: 'd0b1c2d', pr: '#4080', author: '@rajithal' },
    { build: 'b140', date: 'May 02', ttft: 185, itl: 14.2, qps: 3110, p90Latency: 206, cacheHitPct: 84, status: 'stable', commit: 'e1c2d3e', pr: '#4085', author: '@sean' },
    { build: 'b141', date: 'May 03', ttft: 183, itl: 14.0, qps: 3200, p90Latency: 200, cacheHitPct: 86, status: 'stable', commit: 'f2d3e4f', pr: '#4090', author: '@rli' },
    { build: 'b142', date: 'May 04', ttft: 345, itl: 28.4, qps: 1850, p90Latency: 410, cacheHitPct: 42, status: 'regression', commit: 'a8f91c2', pr: '#4101', author: '@shorgan', note: 'LMCache plugin mutex lock contention' },
    { build: 'b143', date: 'May 05', ttft: 350, itl: 29.1, qps: 1800, p90Latency: 425, cacheHitPct: 39, status: 'regression', commit: 'b9f01d3', pr: '#4101', author: '@shorgan', note: 'Investigating vLLM v0.7.2 commit hash' },
    { build: 'b144', date: 'May 06', ttft: 342, itl: 28.0, qps: 1880, p90Latency: 405, cacheHitPct: 44, status: 'regression', commit: 'c0g12e4', pr: '#4102', author: '@rajithal', note: 'PR #4102 merged (o_direct bypass fix)' },
    { build: 'b145', date: 'May 07', ttft: 184, itl: 14.1, qps: 3160, p90Latency: 202, cacheHitPct: 85, status: 'fixed', commit: 'd1h23f5', pr: '#4105', author: '@sean', note: 'Regression fully resolved' },
    { build: 'b146', date: 'May 08', ttft: 183, itl: 14.0, qps: 3190, p90Latency: 201, cacheHitPct: 85, status: 'stable', commit: 'e2i34g6', pr: '#4108', author: '@rli' },
    { build: 'b147', date: 'May 09', ttft: 185, itl: 14.2, qps: 3120, p90Latency: 206, cacheHitPct: 84, status: 'stable', commit: 'f3j45h7', pr: '#4110', author: '@ming' },
    { build: 'b148', date: 'May 10', ttft: 182, itl: 14.1, qps: 3210, p90Latency: 199, cacheHitPct: 86, status: 'stable', commit: 'a4k56i8', pr: '#4115', author: '@wwei' },
    { build: 'b149', date: 'May 11', ttft: 184, itl: 14.2, qps: 3150, p90Latency: 203, cacheHitPct: 85, status: 'stable', commit: 'b5l67j9', pr: '#4120', author: '@shorgan' },
];

const WELL_LIT_PATHS = [
    { id: 'gemma4-31B', sig: 'SIG-Serving', owner: '@shorgan, @rajithal', infra: 'g4-standard-384 (8x RTX-PRO-6000)', status: 'Stable', lastRun: 'b149 (Passed)', gain: '+264% vs HBM' },
    { id: 'Llama3-70B', sig: 'SIG-Serving', owner: '@sean, @rli', infra: 'a3-highgpu-8g (8x H100)', status: 'Stable', lastRun: 'b149 (Passed)', gain: '+185% vs HBM' },
    { id: 'DeepSeek-R1', sig: 'SIG-Scale', owner: '@ming, @wwei', infra: 'a3-mega (16x H100 MoE)', status: 'Regression Resolved', lastRun: 'b149 (Passed)', gain: 'Fixed in b145' },
    { id: 'Mistral-Large', sig: 'SIG-Serving', owner: '@alex, @cindy', infra: 'g4-standard-192 (4x L40S)', status: 'Stable', lastRun: 'b149 (Passed)', gain: '+140% vs HBM' },
];

export default function RegressionsAnalysisDashboard({ onNavigateBack, onToggleMobileNav }) {
    const [shareToast, setShareToast] = useState(false);
    const [selectedPath, setSelectedPath] = useState('gemma4-31B');
    const [activeMetric, setActiveMetric] = useState('ttft'); // 'ttft' | 'itl' | 'qps' | 'p90Latency' | 'cacheHitPct'
    const [chartType, setChartType] = useState('line'); // 'line' | 'bar'
    const [timeWindow, setTimeWindow] = useState('30d'); // '7d' | '14d' | '30d' | 'custom'
    const [customLookbackCount, setCustomLookbackCount] = useState(20); // 5 - 30
    const [selectedRunMenu, setSelectedRunMenu] = useState('optimized-baseline');
    const [regressionThreshold, setRegressionThreshold] = useState(10); // 5% - 30%
    const [xAxisMode, setXAxisMode] = useState('output'); // 'build' | 'date' | 'output' | 'input' | 'total' | 'qps'
    const [yMetric, setYMetric] = useState('ntpot'); // 'ntpot' | 'tpot' | 'ttft' | 'itl' | 'e2e'
    const [isLogScaleX, setIsLogScaleX] = useState(true);
    const [showPerChip, setShowPerChip] = useState(false);
    const [visiblePercentiles, setVisiblePercentiles] = useState(['P50', 'P90', 'P99']);
    const [tputCap, setTputCap] = useState(4000);
    const [showChartFilters, setShowChartFilters] = useState(true);
    const [bugLoggedToast, setBugLoggedToast] = useState(false);
    const [viewSavedToast, setViewSavedToast] = useState(false);
    const [showFaq, setShowFaq] = useState(0);
    const [isCopilotOpen, setIsCopilotOpen] = useState(false);
    const [copilotNote, setCopilotNote] = useState('');
    const [copilotCopied, setCopilotCopied] = useState(false);
    const [showJsonPreview, setShowJsonPreview] = useState(false);
    const [selectedBuild, setSelectedBuild] = useState(null);


    const xLabels = {
        output: 'Output Tokens/sec',
        input: 'Input Tokens/sec',
        total: 'Total Tokens/sec',
        qps: 'Queries Per Second (QPS)'
    };
    
    const yLabels = {
        ntpot: 'Normalized TPOT (ms)',
        tpot: 'Time Per Output Token (ms)',
        ttft: 'Time To First Token (ms)',
        itl: 'Inter-Token Latency (ms)',
        e2e: 'E2E Latency (ms)'
    };

    const filteredRuns = useMemo(() => {
        let baseData = [];
        if (timeWindow === '7d') baseData = NIGHTLY_RUNS.slice(-7);
        else if (timeWindow === '14d') baseData = NIGHTLY_RUNS.slice(-14);
        else if (timeWindow === 'custom') baseData = NIGHTLY_RUNS.slice(-customLookbackCount);
        else baseData = NIGHTLY_RUNS; // 30d view

        // Map and derive metrics
        const processed = baseData.map(d => {
            // Derive X value
            let xVal = d.qps;
            if (xAxisMode === 'build' || xAxisMode === 'date') {
                xVal = d[xAxisMode];
            } else if (xAxisMode === 'input') {
                xVal = d.qps * 0.8;
            } else if (xAxisMode === 'total') {
                xVal = d.qps * 1.8;
            } else if (xAxisMode === 'output') {
                xVal = d.qps;
            }
            
            // Derive Y value
            let yVal = d.ttft;
            if (yMetric === 'itl') yVal = d.itl;
            else if (yMetric === 'e2e') yVal = d.ttft + d.itl * 10; // Mock E2E
            else if (yMetric === 'tpot') yVal = d.itl;
            else if (yMetric === 'ntpot') yVal = d.itl * 0.9;

            // Apply Per Chip scaling
            if (showPerChip) {
                yVal = yVal / 8; // Assume 8 chips
            }

            // Derive percentiles
            const yVal_p50 = yVal;
            const yVal_p90 = yVal * 1.2;
            const yVal_p99 = yVal * 1.5;

            return {
                ...d,
                xVal,
                yVal,
                yVal_p50,
                yVal_p90,
                yVal_p99
            };
        });

        const filtered = processed.filter(d => {
            if (typeof d.xVal === 'number') return d.xVal <= tputCap;
            return true;
        });

        if (xAxisMode === 'build' || xAxisMode === 'date') {
            return filtered; // Keep original time order
        } else {
            return filtered.sort((a, b) => a.xVal - b.xVal); // Sort by metric value
        }
    }, [timeWindow, selectedRunMenu, customLookbackCount, xAxisMode, yMetric, showPerChip, tputCap]);

    const selectedRunData = useMemo(() => filteredRuns.find(d => d.build === selectedBuild), [filteredRuns, selectedBuild]);

    const handleShareView = () => {
        navigator.clipboard.writeText(window.location.href);
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2000);
    };

    const handleExportJson = () => {
        const payload = JSON.stringify({ selectedPath, activeMetric, runs: NIGHTLY_RUNS }, null, 2);
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(payload);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `nightly_regression_${selectedPath}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    };

    const handleCopyCopilot = () => {
        const payload = JSON.stringify({
            dashboard: "Regressions & Analysis Testing Dashboard",
            wellLitPath: selectedPath,
            metricFocus: activeMetric,
            recentAnomaly: "Builds b142-b144 exhibited +85% TTFT regression due to LMCache mutex contention. Resolved in b145 via o_direct bypass.",
            userPrompt: copilotNote
        }, null, 2);
        navigator.clipboard.writeText(payload);
        setCopilotCopied(true);
        setTimeout(() => setCopilotCopied(false), 2500);
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center pt-16 md:pl-24 w-full font-sans">
            
            {/* Top Navigation Bar */}
            <header className="w-full h-16 border-b border-slate-800 flex justify-between items-center px-6 bg-slate-900 fixed top-0 left-0 right-0 z-[9999]">
                <div className="flex items-center gap-4">
                    <button onClick={onToggleMobileNav} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors md:hidden cursor-pointer">
                        <Menu className="h-6 w-6" />
                    </button>

                    {onNavigateBack && (
                        <button onClick={onNavigateBack} className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer">
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
                        <h1 className="text-sm sm:text-lg font-bold text-white tracking-wide truncate">Regressions & Analysis Suite</h1>
                    </div>
                </div>

                <div className="flex items-center space-x-3">
                    <button 
                        onClick={() => setIsCopilotOpen(true)} 
                        className="px-3.5 py-1.5 text-xs font-bold rounded-lg text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 transition-all flex items-center shadow-lg shadow-cyan-900/20 border border-cyan-400/30 cursor-pointer"
                    >
                        <Share2 className="w-3.5 h-3.5 mr-1.5 text-cyan-200" />
                        <span>Share with AI Agent</span>
                    </button>
                    <button onClick={handleShareView} className="px-3.5 py-1.5 text-xs font-medium rounded-lg text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors flex items-center border border-slate-700 relative cursor-pointer">
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

            {/* Main Dashboard Body */}
            <main className="w-full max-w-7xl px-6 py-8 flex flex-col space-y-8">
                
                {/* HERO HEADER */}
                <div className="relative overflow-hidden border border-slate-800 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/50 to-slate-950 p-6 shadow-2xl backdrop-blur-xl">
                    <div className="absolute -top-24 -right-24 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="max-w-4xl">
                        <div className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5" />
                            <span>Prism Utility Suite • Nightly Regression Tracking</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                            <h2 className="text-2xl font-extrabold text-white tracking-tight m-0">
                                Solidified End-to-End Well-Lit Path Lifecycle
                            </h2>
                            <a 
                                href="https://github.com/llm-d/llm-d-benchmark" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-slate-500 hover:text-slate-300 transition-colors flex items-center space-x-1 no-underline cursor-pointer font-sans font-medium mt-1"
                            >
                                <span className="text-[10px]">Guide</span>
                                <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                            Automatically produce nightly benchmark runs for llm-d well-lit paths using the <code className="bg-slate-800 px-1.5 py-0.5 rounded font-mono text-cyan-300">llmdbenchmark</code> package, 
                            with telemetry stored in the central Results Store and surfaced through this regression dashboard. 
                            Designed for SIG owners to guarantee zero surprises come release time.
                        </p>
                    </div>
                </div>

                {/* CORE WORKSPACE LAYOUT: TEST RUN SIDEBAR & RECHARTS SUITE */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
                    {/* Left Column: Dedicated Test Run Menu Suite */}
                    <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col h-full shadow-xl">
                        <div className="border-b border-slate-800 pb-3 mb-4">
                            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                                <Layers className="w-4 h-4 text-cyan-400" />
                                <span>Defined Test Runs</span>
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                                Select a nightly CI regression pipeline to load historical telemetry.
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-1 pb-4 space-y-2 max-h-[700px] no-scrollbar">
                            {[
                                { id: 'optimized-baseline', title: 'Optimized Baseline', sig: 'SIG-Serving', desc: 'Core stability & baseline latency vectors' },
                                { id: 'prefix-cache-routing', title: 'Prefix Cache Routing', sig: 'SIG-Serving', desc: 'Shared prefix routing & KV hit efficiency' },
                                { id: 'disaggregated-pd', title: 'Disaggregated P/D Worker', sig: 'SIG-Scale', desc: 'Separated prefill and decode scaling' },
                                { id: 'wide-ep-moe', title: 'Wide-EP MoE Scale', sig: 'SIG-Compute', desc: 'Mixtral/DeepSeek expert parallelism' },
                                { id: 'chunked-prefill', title: 'Chunked Prefill Matrix', sig: 'SIG-Serving', desc: 'Dynamic prefill chunking & TTFT variance' },
                                { id: 'speculative-dec', title: 'Speculative Decoding Engine', sig: 'SIG-Serving', desc: 'Draft token verification & acceptance' },
                                { id: 'kv-cache-quant', title: 'KV Cache Quantization (FP8)', sig: 'SIG-Serving', desc: 'Memory footprint reduction & accuracy drift' },
                                { id: 'tensor-parallel-comm', title: 'TP Ring Comm Overhead', sig: 'SIG-Scale', desc: 'NCCL all-reduce latency across NVLink nodes' },
                                { id: 'context-extension-rope', title: 'RoPE Context Extension (128k)', sig: 'SIG-Compute', desc: 'Long-context perplexity & attention scaling' },
                                { id: 'lookahead-decoding', title: 'Lookahead Decoding N-Gram', sig: 'SIG-Serving', desc: 'Verification-free speculative decoding branch' },
                                { id: 'pipeline-parallel-bubble', title: 'PP Bubble Schedule Optimization', sig: 'SIG-Scale', desc: '1F1B microbatch scheduling efficiency' },
                            ].map(run => {
                                const isSelected = selectedRunMenu === run.id;
                                return (
                                    <div 
                                        key={run.id}
                                        className={`w-full text-left p-3 rounded-xl border transition-all flex flex-col gap-1.5 ${
                                            isSelected 
                                                ? 'bg-slate-800 border-cyan-500 shadow-md shadow-cyan-950/50 text-white' 
                                                : 'bg-slate-950/50 border-slate-800/80 text-slate-300 hover:bg-slate-850 hover:border-slate-700'
                                        }`}
                                    >
                                        <div 
                                            onClick={() => setSelectedRunMenu(run.id)}
                                            className="cursor-pointer flex flex-col gap-0.5 w-full"
                                        >
                                            <div className="flex items-center justify-between w-full gap-2">
                                                <span className="font-bold text-xs font-sans truncate">{run.title}</span>
                                                <span className="text-[9px] font-mono bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800 shrink-0">{run.sig}</span>
                                            </div>
                                            <span className="text-[10px] text-slate-400 leading-snug line-clamp-2 font-sans">{run.desc}</span>
                                            {isSelected && (
                                                <div className="flex items-center justify-start gap-3 text-[8px] text-slate-400 pt-0.5">
                                                    <div className="flex items-center gap-0.5" title="Regression Detected">
                                                        <AlertTriangle className="w-2.5 h-2.5 text-red-500" />
                                                        <span>Regression</span>
                                                    </div>
                                                    <div className="flex items-center gap-0.5" title="Regression Resolved">
                                                        <CheckCircle className="w-2.5 h-2.5 text-emerald-500" />
                                                        <span>Fixed</span>
                                                    </div>
                                                    <div className="flex items-center gap-0.5" title="Stable Performance">
                                                        <Shield className="w-2.5 h-2.5 text-blue-500" />
                                                        <span>Stable</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {isSelected && (
                                            <div className="mt-2 pt-2 border-t border-slate-700/50 space-y-2 max-h-[220px] overflow-y-auto no-scrollbar">
                                                {filteredRuns.map(runPoint => {
                                                    const isRunSelected = selectedBuild === runPoint.build;
                                                    return (
                                                        <div 
                                                            key={runPoint.build} 
                                                            onClick={() => setSelectedBuild(runPoint.build)}
                                                            className={`flex items-center justify-between text-[10px] p-2 rounded-lg border transition-all cursor-pointer ${
                                                                isRunSelected 
                                                                    ? 'bg-slate-800 border-cyan-500 shadow-md shadow-cyan-950/50 text-white' 
                                                                    : 'bg-slate-900/80 hover:bg-slate-900 border-slate-800/50 text-slate-300'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                {runPoint.status === 'regression' ? (
                                                                    <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                                                                ) : runPoint.status === 'fixed' ? (
                                                                    <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                                                                ) : (
                                                                    <Shield className="w-3 h-3 text-blue-500 shrink-0" />
                                                                )}
                                                                <span className="font-mono font-bold text-slate-200">{runPoint.build}</span>
                                                                <span className="text-slate-500 font-mono text-[9px] truncate max-w-[40px]">{runPoint.commit}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-slate-400">{runPoint.date}</span>
                                                                <a 
                                                                    href={`https://github.com/llm-d/llm-d/actions/runs/${runPoint.build.replace('b', '')}`} 
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer"
                                                                    onClick={(e) => e.stopPropagation()} // Prevent selecting run when clicking link
                                                                    className="text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 font-semibold"
                                                                >
                                                                    <span>View</span>
                                                                    <ExternalLink className="w-2.5 h-2.5" />
                                                                </a>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Column: The Core Recharts Suite & Filters */}
                    <div className="lg:col-span-9 bg-slate-900/80 border border-slate-700/60 rounded-2xl shadow-2xl flex flex-col w-full min-h-[550px] overflow-visible backdrop-blur-sm relative overflow-hidden">
                        <div className="flex flex-col w-full h-full">
                            <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/80 flex justify-between items-start gap-6 shadow-sm">
                                <div className="flex flex-col gap-2.5">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2 font-sans">
                                        <Activity className="w-5 h-5 text-cyan-400" />
                                        <span>Nightly Regression Tracker • {selectedPath}</span>
                                        <span className="text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded font-mono uppercase tracking-wider font-bold">Active Focus</span>
                                    </h3>
                                    
                                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px]">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-slate-500 font-semibold">Infra:</span>
                                            <div className="flex items-center gap-1.5 font-mono font-bold text-slate-200">
                                                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                                </svg>
                                                <span>{WELL_LIT_PATHS.find(p => p.id === selectedPath)?.infra || 'Cluster Hardware'}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-slate-500 font-semibold">SIG:</span>
                                            <div className="font-mono text-slate-200 font-bold">
                                                {WELL_LIT_PATHS.find(p => p.id === selectedPath)?.sig || 'SIG-Serving'}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-slate-500 font-semibold">Test Run:</span>
                                            <div className="font-mono text-cyan-400 font-bold">
                                                {selectedRunMenu === 'optimized-baseline' ? 'Optimized Baseline' : selectedRunMenu === 'prefix-cache-routing' ? 'Prefix Cache Routing' : selectedRunMenu === 'disaggregated-pd' ? 'Disaggregated P/D Worker' : selectedRunMenu === 'wide-ep-moe' ? 'Wide-EP MoE Scale' : selectedRunMenu === 'chunked-prefill' ? 'Chunked Prefill Matrix' : 'Speculative Decoding Engine'}
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1">
                                        Inspecting historical performance across nightly builds. Notice the automated anomaly detection at build b142.
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <button 
                                        onClick={handleExportJson} 
                                        title="Export Raw Telemetry JSON"
                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all text-[10px] font-extrabold uppercase tracking-widest border border-slate-700/50 cursor-pointer"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        <span>Export</span>
                                    </button>
                                    <button 
                                        onClick={() => setShowChartFilters(!showChartFilters)} 
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all text-[10px] font-extrabold uppercase tracking-widest border border-slate-700/50 cursor-pointer"
                                    >
                                        Filters
                                        {showChartFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            </div>

                        {showChartFilters && (
                            <div className="bg-slate-800/40 border-b border-slate-700/50 px-6 py-4 flex flex-col gap-4 overflow-hidden shadow-inner">
                                {/* Row 1 */}
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 w-full">
                                    <div className="flex items-center gap-2 w-full lg:w-[60%]">
                                        <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest w-14 shrink-0">X-Axis:</span>
                                        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 gap-0.5 font-bold whitespace-nowrap overflow-x-auto no-scrollbar w-full">
                                            {[
                                                { id: 'output', label: 'Output' },
                                                { id: 'input', label: 'Input' },
                                                { id: 'total', label: 'Total' },
                                                { id: 'qps', label: 'QPS' },
                                            ].map(metric => (
                                                <button
                                                    key={metric.id}
                                                    onClick={() => setXAxisMode(metric.id)}
                                                    className={`px-3 py-1 text-[10px] font-semibold rounded-md transition-all cursor-pointer shrink-0 ${
                                                        xAxisMode === metric.id
                                                            ? 'bg-purple-600 text-white shadow-sm' 
                                                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                                                    }`}
                                                >
                                                    {metric.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 lg:justify-end shrink-0">
                                        <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/50 rounded-lg p-0.5 shrink-0">
                                            <button 
                                                onClick={() => setIsLogScaleX(!isLogScaleX)} 
                                                className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all cursor-pointer ${isLogScaleX ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                            >
                                                Log Scale
                                            </button>
                                            <div className="h-3 w-px bg-slate-700" />
                                            <button 
                                                onClick={() => setShowPerChip(!showPerChip)} 
                                                className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all cursor-pointer ${showPerChip ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                            >
                                                Per Chip
                                            </button>
                                        </div>

                                        <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/50 rounded-lg p-0.5 shrink-0">
                                            {['P50', 'P90', 'P99'].map(p => (
                                                <button
                                                    key={p}
                                                    onClick={() => setVisiblePercentiles(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                                                    className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all cursor-pointer ${visiblePercentiles.includes(p) ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Row 2 */}
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 w-full">
                                    <div className="flex items-center gap-2 w-full lg:w-[60%]">
                                        <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest w-14 shrink-0">Y-Axis:</span>
                                        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 gap-0.5 font-bold whitespace-nowrap overflow-x-auto no-scrollbar w-full">
                                            {[
                                                { id: 'ntpot', label: 'NTPOT' },
                                                { id: 'tpot', label: 'TPOT' },
                                                { id: 'ttft', label: 'TTFT' },
                                                { id: 'itl', label: 'ITL' },
                                                { id: 'e2e', label: 'E2E Latency' },
                                            ].map(mode => (
                                                <button
                                                    key={mode.id}
                                                    onClick={() => setYMetric(mode.id)}
                                                    className={`px-3 py-1 text-[10px] font-semibold rounded-md transition-all cursor-pointer shrink-0 ${
                                                        yMetric === mode.id
                                                            ? 'bg-indigo-600 text-white shadow' 
                                                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                                    }`}
                                                >
                                                    {mode.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 lg:justify-end shrink-0">
                                        <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/50 px-3 py-1 rounded-lg shrink-0">
                                            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Cap:</span>
                                            <input 
                                                type="range" 
                                                min={500} 
                                                max={4000} 
                                                step={100} 
                                                value={tputCap} 
                                                onChange={(e) => setTputCap(Number(e.target.value))} 
                                                className="w-28 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400" 
                                            />
                                            <input 
                                                type="number" 
                                                value={tputCap} 
                                                onChange={(e) => setTputCap(Number(e.target.value))} 
                                                className="w-16 bg-transparent text-[10px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 rounded px-1 text-right font-mono font-bold transition-all" 
                                            />
                                            <span className="text-[9px] text-slate-500 font-mono font-bold">tok/s</span>
                                        </div>

                                        {/* Regression Sensitivity Slider */}
                                        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg shrink-0">
                                            <span className="text-[10px] text-slate-400 font-mono uppercase font-bold">Drift &gt;</span>
                                            <input 
                                                type="range" 
                                                min={5} 
                                                max={30} 
                                                step={5} 
                                                value={regressionThreshold} 
                                                onChange={(e) => setRegressionThreshold(Number(e.target.value))}
                                                className="w-14 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400" 
                                            />
                                            <span className="text-xs text-cyan-300 font-mono font-bold w-7 text-right">{regressionThreshold}%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="p-6 flex flex-col space-y-6 flex-1 overflow-visible">
                            {/* Interactive Chart Container */}
                            <div className="w-full h-[380px] bg-slate-950/50 border border-slate-800/60 rounded-xl p-4 select-none relative overflow-visible flex flex-col">
                            {/* Chart Header */}
                            <div className="flex items-center justify-end mb-4">
                                <div className="flex items-center gap-3">
                                    {/* Line / Bar Chart Toggle (Icons) */}
                                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs font-bold shrink-0">
                                        <button 
                                            onClick={() => setChartType('line')}
                                            className={`p-1 rounded-md transition-all cursor-pointer ${chartType === 'line' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                            title="Line Chart"
                                        >
                                            <Activity className="w-3.5 h-3.5" />
                                        </button>
                                        <button 
                                            onClick={() => setChartType('bar')}
                                            className={`p-1 rounded-md transition-all cursor-pointer ${chartType === 'bar' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                            title="Bar Chart"
                                        >
                                            <BarChart2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    {/* Time Window Presets */}
                                    <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs font-bold shrink-0 whitespace-nowrap overflow-x-auto no-scrollbar">
                                        {[
                                            { id: '7d', label: '7D' },
                                            { id: '14d', label: '14D' },
                                            { id: '30d', label: '30D' },
                                        ].map(tab => (
                                            <button 
                                                key={tab.id}
                                                onClick={() => setTimeWindow(tab.id)}
                                                className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all cursor-pointer shrink-0 ${timeWindow === tab.id ? 'bg-blue-600 text-white font-semibold shadow' : 'text-slate-400 hover:text-white hover:bg-slate-850'}`}
                                            >
                                                {tab.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <ResponsiveContainer width="100%" height="100%">
                                {chartType === 'line' ? (
                                    <LineChart data={filteredRuns} margin={{ top: 25, right: 20, left: 0, bottom: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} />
                                        <CustomXAxis 
                                            dataKey="xVal" 
                                            type={xAxisMode === 'build' || xAxisMode === 'date' ? 'category' : 'number'}
                                            label={xAxisMode === 'build' ? 'Nightly Regression Build ID' : xAxisMode === 'date' ? 'Calendar Date' : (xLabels[xAxisMode] || 'Throughput')}
                                            theme="dark"
                                            scale={isLogScaleX ? 'log' : 'linear'}
                                            domain={isLogScaleX ? ['auto', 'auto'] : [0, 'auto']}
                                            strokeWidth={1}
                                        />
                                        <CustomYAxis 
                                            label={yLabels[yMetric] || 'Latency'}
                                            theme="dark"
                                            strokeWidth={1}
                                        />
                                        <Tooltip 
                                            isAnimationActive={false}
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    const d = payload[0].payload;
                                                    return (
                                                        <div className="bg-slate-900/95 border border-slate-700/50 rounded-lg shadow-xl p-3 min-w-[220px] backdrop-blur-md text-slate-100 z-[100]">
                                                            <div className="border-b border-slate-700/60 pb-1.5 mb-1.5">
                                                                <div className="text-[11px] font-mono text-slate-400 leading-tight">
                                                                    Build: {d.build} • {d.date}
                                                                </div>
                                                                <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                                                                    Commit: {d.commit} | PR: {d.pr} | Auth: {d.author}
                                                                </div>
                                                                <div className="text-xs font-bold text-white mt-1 flex justify-between items-center">
                                                                    <span>Status:</span>
                                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-mono ${
                                                                        d.status === 'regression' ? 'bg-red-950 text-red-400 border border-red-500/40' : 
                                                                        d.status === 'fixed' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40' : 
                                                                        'bg-blue-950 text-blue-400 border border-blue-500/40'
                                                                    }`}>
                                                                        {d.status}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="space-y-2 pt-1">
                                                                {payload.map((entry, index) => {
                                                                    const epl = entry.payload;
                                                                    const xVal = epl.xVal;
                                                                    const yVal = entry.value;
                                                                    
                                                                    return (
                                                                        <div key={index} className="flex items-center justify-between gap-4">
                                                                            <div className="flex items-center gap-1.5">
                                                                                <svg className="w-4 h-2 shrink-0" viewBox="0 0 16 8">
                                                                                    <line 
                                                                                        x1="0" y1="4" x2="16" y2="4" 
                                                                                        stroke={entry.stroke || '#22d3ee'} 
                                                                                        strokeWidth="2" 
                                                                                        strokeDasharray={entry.name.includes('P90') ? '4 3' : entry.name.includes('P99') ? '2 2' : 'none'} 
                                                                                    />
                                                                                </svg>
                                                                                <span className="text-[11px] text-slate-200 font-medium">{entry.name}</span>
                                                                            </div>
                                                                            <span className="text-[11px] font-mono font-bold text-white">
                                                                                {xVal !== undefined && yVal !== undefined ? (
                                                                                    `X: ${typeof xVal === 'number' ? xVal.toFixed(0) : xVal} | Y: ${typeof yVal === 'number' ? yVal.toFixed(0) : yVal}`
                                                                                ) : (
                                                                                    `${Number(entry.value).toFixed(0)}`
                                                                                )}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                            {d.note && (
                                                                <div className="mt-2 pt-1 border-t border-slate-800 text-[11px] text-amber-300 font-sans leading-normal">
                                                                    ⚠️ {d.note}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                        
                                        {/* Reference Lines for Anomaly Event & Stable Release Baselines */}
                                        {selectedRunData && (
                                            <ReferenceLine 
                                                x={selectedRunData.xVal} 
                                                stroke="#eab308" 
                                                strokeDasharray="3 3" 
                                                label={{ value: `Selected: ${selectedBuild}`, fill: '#eab308', fontSize: 10, position: 'top' }} 
                                            />
                                        )}
                                        <ReferenceLine x="b142" stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Regression Spike', fill: '#ef4444', fontSize: 10, position: 'top' }} />
                                        <ReferenceLine x="b145" stroke="#34d399" strokeDasharray="4 4" label={{ value: 'Mutex Contention Fixed', fill: '#34d399', fontSize: 10, position: 'top' }} />
                                        <ReferenceLine y={180} stroke="#3b82f6" strokeDasharray="3 3" label={{ value: 'v0.7.1 Stable Release Baseline (180ms)', fill: '#3b82f6', fontSize: 10, position: 'right' }} />

                                        {visiblePercentiles.includes('P50') && (
                                            <Line 
                                                type="monotone" 
                                                dataKey="yVal_p50" 
                                                name="P50" 
                                                stroke="#22d3ee" 
                                                strokeWidth={3} 
                                                dot={{ r: 4, fill: '#22d3ee' }} 
                                                activeDot={{ r: 6, fill: '#38bdf8' }}
                                                isAnimationActive={false} 
                                            />
                                        )}
                                        {visiblePercentiles.includes('P90') && (
                                            <Line 
                                                type="monotone" 
                                                dataKey="yVal_p90" 
                                                name="P90" 
                                                stroke="#22d3ee" 
                                                strokeDasharray="5 5"
                                                strokeWidth={2} 
                                                dot={{ r: 3, fill: '#22d3ee' }} 
                                                activeDot={{ r: 5, fill: '#38bdf8' }}
                                                isAnimationActive={false} 
                                            />
                                        )}
                                        {visiblePercentiles.includes('P99') && (
                                            <Line 
                                                type="monotone" 
                                                dataKey="yVal_p99" 
                                                name="P99" 
                                                stroke="#22d3ee" 
                                                strokeDasharray="2 2"
                                                strokeWidth={2} 
                                                dot={{ r: 3, fill: '#22d3ee' }} 
                                                activeDot={{ r: 5, fill: '#38bdf8' }}
                                                isAnimationActive={false} 
                                            />
                                        )}
                                    </LineChart>
                                ) : (
                                    <BarChart data={filteredRuns} margin={{ top: 25, right: 20, left: 0, bottom: 10 }}>
                                        <defs>
                                            <pattern id="stripe-p90" width="6" height="6" patternUnits="userSpaceOnUse">
                                                <rect width="6" height="6" fill="#1e293b" />
                                                <path d="M 0,6 l 6,-6 M -1,1 l 2,-2 M 5,7 l 2,-2" stroke="#38bdf8" strokeWidth="1.5" />
                                            </pattern>
                                            <pattern id="dots-p99" width="6" height="6" patternUnits="userSpaceOnUse">
                                                <rect width="6" height="6" fill="#1e293b" />
                                                <circle cx="3" cy="3" r="1.5" fill="#06b6d4" />
                                            </pattern>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} />
                                        <CustomXAxis 
                                            dataKey="xVal" 
                                            type="category"
                                            label={xAxisMode === 'build' ? 'Nightly Regression Build ID' : xAxisMode === 'date' ? 'Calendar Date' : (xLabels[xAxisMode] || 'Throughput')}
                                            theme="dark"
                                            strokeWidth={1}
                                        />
                                        <CustomYAxis 
                                            label={yLabels[yMetric] || 'Latency'}
                                            theme="dark"
                                            strokeWidth={1}
                                        />
                                        <Tooltip 
                                            isAnimationActive={false}
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    const d = payload[0].payload;
                                                    return (
                                                        <div className="bg-slate-900/95 border border-slate-700/50 rounded-lg shadow-xl p-3 min-w-[220px] backdrop-blur-md text-slate-100 z-[100]">
                                                            <div className="border-b border-slate-700/60 pb-1.5 mb-1.5">
                                                                <div className="text-[11px] font-mono text-slate-400 leading-tight">
                                                                    Build: {d.build} • {d.date}
                                                                </div>
                                                                <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                                                                    Commit: {d.commit} | PR: {d.pr} | Auth: {d.author}
                                                                </div>
                                                                <div className="text-xs font-bold text-white mt-1 flex justify-between items-center">
                                                                    <span>Status:</span>
                                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-mono ${
                                                                        d.status === 'regression' ? 'bg-red-950 text-red-400 border border-red-500/40' : 
                                                                        d.status === 'fixed' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40' : 
                                                                        'bg-blue-950 text-blue-400 border border-blue-500/40'
                                                                    }`}>
                                                                        {d.status}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="space-y-2 pt-1">
                                                                {payload.map((entry, index) => {
                                                                    const epl = entry.payload;
                                                                    const xVal = epl.xVal;
                                                                    const yVal = entry.value;
                                                                    
                                                                    return (
                                                                        <div key={index} className="flex items-center justify-between gap-4">
                                                                            <div className="flex items-center gap-1.5">
                                                                                <svg className="w-3 h-3 shrink-0 rounded-sm overflow-hidden" viewBox="0 0 12 12">
                                                                                    <rect width="12" height="12" fill={entry.fill || entry.stroke || '#22d3ee'} />
                                                                                </svg>
                                                                                <span className="text-[11px] text-slate-200 font-medium">{entry.name}</span>
                                                                            </div>
                                                                            <span className="text-[11px] font-mono font-bold text-white">
                                                                                {xVal !== undefined && yVal !== undefined ? (
                                                                                    `X: ${typeof xVal === 'number' ? xVal.toFixed(0) : xVal} | Y: ${typeof yVal === 'number' ? yVal.toFixed(0) : yVal}`
                                                                                ) : (
                                                                                    `${Number(entry.value).toFixed(0)}`
                                                                                )}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                            {d.note && (
                                                                <div className="mt-2 pt-1 border-t border-slate-800 text-[11px] text-amber-300 font-sans  leading-normal">
                                                                    ⚠️ {d.note}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                            cursor={false}
                                        />
                                        
                                        {/* Reference Lines for Anomaly Event & Stable Release Baselines */}
                                        {selectedRunData && (
                                            <ReferenceLine 
                                                x={selectedRunData.xVal} 
                                                stroke="#eab308" 
                                                strokeDasharray="3 3" 
                                                label={{ value: `Selected: ${selectedBuild}`, fill: '#eab308', fontSize: 10, position: 'top' }} 
                                            />
                                        )}
                                        <ReferenceLine x="b142" stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Regression Spike', fill: '#ef4444', fontSize: 10, position: 'top' }} />
                                        <ReferenceLine x="b145" stroke="#34d399" strokeDasharray="4 4" label={{ value: 'Mutex Contention Fixed', fill: '#34d399', fontSize: 10, position: 'top' }} />
                                        <ReferenceLine y={180} stroke="#3b82f6" strokeDasharray="3 3" label={{ value: 'v0.7.1 Stable Release Baseline (180ms)', fill: '#3b82f6', fontSize: 10, position: 'right' }} />

                                        {visiblePercentiles.includes('P50') && <Bar dataKey="yVal_p50" name="P50" fill="#22d3ee" radius={[4, 4, 0, 0]} isAnimationActive={false} />}
                                        {visiblePercentiles.includes('P90') && <Bar dataKey="yVal_p90" name="P90" fill="url(#stripe-p90)" radius={[4, 4, 0, 0]} isAnimationActive={false} />}
                                        {visiblePercentiles.includes('P99') && <Bar dataKey="yVal_p99" name="P99" fill="url(#dots-p99)" radius={[4, 4, 0, 0]} isAnimationActive={false} />}
                                    </BarChart>
                                )}
                            </ResponsiveContainer>

                            {/* Custom Legend */}
                            <div className="mt-4 border-t border-slate-700/50 pt-4 px-2">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                        Legends
                                    </h4>
                                </div>
                                <div className="flex flex-wrap gap-x-8 gap-y-4">
                                    <div className="flex flex-col gap-1.5">
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Nightly Performance</div>
                                        <div className="flex gap-x-4 gap-y-1 flex-wrap">
                                            {[
                                                { p: 'P50', style: 'solid' },
                                                { p: 'P90', style: 'dashed' },
                                                { p: 'P99', style: 'dotted' }
                                            ].map(item => (
                                                <div key={item.p} className="flex items-center gap-1.5">
                                                    <div className="w-5 h-3 flex items-center">
                                                        <div className="w-full h-0 border-t-2" style={{ borderColor: '#22d3ee', borderStyle: item.style, opacity: visiblePercentiles.includes(item.p) ? 1 : 0.3 }} />
                                                    </div>
                                                    <span className={`text-[10px] font-semibold ${visiblePercentiles.includes(item.p) ? 'text-slate-300' : 'text-slate-600'}`}>{item.p}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* WELL-LIT PATH STATUS MATRIX */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                    <div className="p-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-4">
                        <div>
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <FileCode className="w-4 h-4 text-cyan-400" />
                                <span>Active Well-Lit Paths & SIG Ownership Matrix</span>
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Select any well-lit path below to instantly load its nightly regression history into the charts above.
                            </p>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <a 
                                href="https://github.com/llm-d-incubation/llm-d-planner" 
                                target="_blank" 
                                rel="noreferrer"
                                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-lg shadow-cyan-900/30"
                            >
                                <span>Launch llm-d Deploy Planner</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs font-mono">
                            <thead>
                                <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                                    <th className="p-4 font-sans">Well-Lit Path ID</th>
                                    <th className="p-4 font-sans">SIG Ownership</th>
                                    <th className="p-4 font-sans">Maintainers (OWNERS.md)</th>
                                    <th className="p-4 font-sans">Target Infrastructure</th>
                                    <th className="p-4 font-sans">Nightly Status</th>
                                    <th className="p-4 font-sans">Latest Build Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
                                {WELL_LIT_PATHS.map((path, idx) => {
                                    const isCurrent = selectedPath === path.id;
                                    return (
                                        <tr 
                                            key={idx} 
                                            onClick={() => setSelectedPath(path.id)}
                                            className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${
                                                isCurrent ? 'bg-slate-800/70' : ''
                                            }`}
                                        >
                                            <td className="p-4 text-white font-sans flex items-center gap-2">
                                                <span>{path.id}</span>
                                                {isCurrent && <span className="text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-sans font-black uppercase tracking-wider">Active</span>}
                                            </td>
                                            <td className="p-4 font-sans text-white">{path.sig}</td>
                                            <td className="p-4 text-white">{path.owner}</td>
                                            <td className="p-4 text-white">{path.infra}</td>
                                            <td className="p-4 font-sans text-white">
                                                {path.status}
                                            </td>
                                            <td className="p-4 text-white">{path.lastRun}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* FAQ SECTION */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
                        <div className="p-1.5 bg-purple-500/20 text-purple-400 rounded-lg">
                            <Zap className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-white">Regressions & Analysis Governance FAQ</h3>
                            <p className="text-xs text-slate-400">Prepopulated guidelines for SIG syncs and release criteria.</p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {[
                            {
                                q: "How are well-lit paths maintained across SIG organizations?",
                                a: "Each well-lit path is explicitly owned by at least one core contributor defined in an OWNERS.md file. SIG members are responsible for provisioning required cluster networking and hardware driver compatibility before nightly test execution."
                            },
                            {
                                q: "What happens when a nightly regression is detected during weekly syncs?",
                                a: "If performance drifts beyond established thresholds (e.g., >10% TTFT increase), an automated GitHub issue is tagged to the path owner. Maintainers review the regression charts during weekly syncs to guarantee zero release surprises."
                            }
                        ].map((item, i) => (
                            <div key={i} className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/50 transition-all">
                                <button 
                                    onClick={() => setShowFaq(showFaq === i ? null : i)} 
                                    className="w-full p-3 text-left flex justify-between items-center font-semibold text-xs text-slate-200 hover:bg-slate-800/30 transition-colors cursor-pointer"
                                >
                                    <span>{item.q}</span>
                                    {showFaq === i ? <ChevronUp className="w-4 h-4 text-cyan-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
                                </button>
                                {showFaq === i && (
                                    <div className="p-3 pt-0 text-xs text-slate-400 border-t border-slate-800 bg-slate-900/30 leading-relaxed animate-in fade-in duration-200">
                                        {item.a}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

            </main>

            {/* Share with AI Agent Drawer Side Panel */}
            {isCopilotOpen && (
                <div className="fixed inset-0 z-[10000] flex justify-end bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-lg bg-slate-900 border-l border-slate-800 p-6 shadow-2xl flex flex-col justify-between h-full overflow-y-auto animate-in slide-in-from-right duration-300">
                        <div className="space-y-6">
                            <header className="flex items-center justify-between border-b border-slate-800 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl shadow-inner">
                                        <Share2 className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                            <span>AI Agent Connector</span>
                                            <span className="text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">Webhook Active</span>
                                        </h3>
                                        <p className="text-xs text-slate-400 mt-0.5">Transmit regression telemetry and anomaly state directly to AI workspace.</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setIsCopilotOpen(false)} 
                                    className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                                >
                                    ✕
                                </button>
                            </header>

                            <div className="space-y-3">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">⚡ One-Click Anomaly & Workflow Prompts:</span>
                                <div className="flex flex-col gap-2">
                                    <button 
                                        onClick={() => setCopilotNote(`Analyze the nightly regression spike on build b142 for ${selectedPath} and draft a root-cause summary for the weekly SIG sync.`)}
                                        className="text-left p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800/50 border border-slate-800 transition-all text-xs text-slate-300 hover:text-white flex items-center gap-2 cursor-pointer group"
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 group-hover:scale-125 transition-all shrink-0" />
                                        <span className="font-mono text-purple-300 font-bold shrink-0">[SIG Sync Report]</span>
                                        <span className="truncate text-slate-400">Draft regression report for weekly SIG sync</span>
                                    </button>
                                    <button 
                                        onClick={() => setCopilotNote("Generate a Kustomize patch to enforce o_direct bypass flags and eliminate LMCache mutex lock contention based on this regression log.")}
                                        className="text-left p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800/50 border border-slate-800 transition-all text-xs text-slate-300 hover:text-white flex items-center gap-2 cursor-pointer group"
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 group-hover:scale-125 transition-all shrink-0" />
                                        <span className="font-mono text-sky-300 font-bold shrink-0">[Kustomize Patch]</span>
                                        <span className="truncate text-slate-400">Generate Kustomize patch for o_direct fix</span>
                                    </button>
                                    <button 
                                        onClick={() => setCopilotNote("Explain how llmdbenchmark standup automates cluster provisioning across SIG well-lit paths and recommend optimal GitHub Actions polling intervals.")}
                                        className="text-left p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800/50 border border-slate-800 transition-all text-xs text-slate-300 hover:text-white flex items-center gap-2 cursor-pointer group"
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 group-hover:scale-125 transition-all shrink-0" />
                                        <span className="font-mono text-emerald-300 font-bold shrink-0">[Workflow Docs]</span>
                                        <span className="truncate text-slate-400">Explain llmdbenchmark standup lifecycle</span>
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Custom AI Agent Prompt Instructions:</span>
                                <textarea
                                    value={copilotNote}
                                    onChange={(e) => setCopilotNote(e.target.value)}
                                    placeholder="Select a preset above or type custom analysis instructions..."
                                    className="w-full h-28 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:border-cyan-500 resize-none placeholder:text-slate-600 font-mono leading-relaxed"
                                />
                            </div>

                            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40 transition-all">
                                <button 
                                    onClick={() => setShowJsonPreview(!showJsonPreview)}
                                    className="w-full p-3 text-left flex justify-between items-center font-semibold text-xs text-slate-300 hover:text-white hover:bg-slate-800/30 transition-colors cursor-pointer"
                                >
                                    <span className="flex items-center gap-2">
                                        <Info className="w-3.5 h-3.5 text-cyan-400" />
                                        <span>Inspect Live Serialized JSON Payload</span>
                                    </span>
                                    {showJsonPreview ? <ChevronUp className="w-4 h-4 text-cyan-400" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                                </button>
                                {showJsonPreview && (
                                    <div className="p-3 bg-slate-950 border-t border-slate-800 max-h-48 overflow-y-auto font-mono text-[10px] text-cyan-300 leading-relaxed animate-in fade-in duration-200">
                                        <pre>{JSON.stringify({
                                            dashboard: "Regressions & Analysis Testing Dashboard",
                                            wellLitPath: selectedPath,
                                            metricFocus: activeMetric,
                                            recentAnomaly: "Builds b142-b144 exhibited +85% TTFT regression due to LMCache mutex contention. Resolved in b145 via o_direct bypass.",
                                            userPrompt: copilotNote
                                        }, null, 2)}</pre>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4 pt-6 border-t border-slate-800 mt-6">
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Direct Webhook Connectors:</span>
                                <div className="grid grid-cols-3 gap-2">
                                    <a 
                                        href="cursor://open?url=window.location.href"
                                        onClick={(e) => { e.preventDefault(); handleCopyCopilot(); }}
                                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-center text-[11px] font-bold text-slate-200 hover:text-white border border-slate-700 transition-colors cursor-pointer no-underline block"
                                    >
                                        🚀 Cursor IDE
                                    </a>
                                    <button 
                                        onClick={handleCopyCopilot}
                                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-center text-[11px] font-bold text-slate-200 hover:text-white border border-slate-700 transition-colors cursor-pointer block"
                                    >
                                        🚀 Vertex AI
                                    </button>
                                    <button 
                                        onClick={handleCopyCopilot}
                                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-center text-[11px] font-bold text-slate-200 hover:text-white border border-slate-700 transition-colors cursor-pointer block"
                                    >
                                        🚀 GitHub Chat
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={handleCopyCopilot}
                                className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-900/30 transition-all flex items-center justify-center gap-2 relative cursor-pointer"
                            >
                                <Share2 className="w-4 h-4" />
                                <span>Generate JSON & Copy Payload</span>
                                {copilotCopied && (
                                    <div className="absolute inset-0 bg-emerald-600 text-white font-bold flex items-center justify-center rounded-xl shadow-xl animate-in fade-in duration-200">
                                        Payload copied to clipboard!
                                    </div>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
