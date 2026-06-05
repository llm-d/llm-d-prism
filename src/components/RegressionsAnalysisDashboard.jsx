import React, { useState, useEffect, useMemo } from 'react';
const RUN_COLORS = [
    { p50: '#22d3ee', p90: '#0891b2', p99: '#0e7490' }, // Cyan (P50 bright, P90 mid, P99 dark)
    { p50: '#c084fc', p90: '#a855f7', p99: '#7e22ce' }, // Purple
    { p50: '#fb7185', p90: '#f43f5e', p99: '#be123c' }, // Rose/Red
    { p50: '#34d399', p90: '#10b981', p99: '#047857' }, // Emerald/Green
    { p50: '#fbbf24', p90: '#f59e0b', p99: '#b45309' }, // Amber/Yellow
];

const CustomizedDot = (props) => {
    const { cx, cy, stroke, payload } = props;
    if (!cx || !cy) return null;
    
    const isFailed = payload && payload.success_rate < 90;
    if (isFailed) {
        return (
            <circle 
                cx={cx} 
                cy={cy} 
                r={6} 
                fill="#ef4444" 
                stroke="#fca5a5" 
                strokeWidth={2} 
                className="animate-pulse"
                style={{ cursor: 'pointer' }}
            />
        );
    }
    return (
        <circle 
            cx={cx} 
            cy={cy} 
            r={props.r || 4} 
            fill={stroke} 
            stroke={stroke} 
            style={{ cursor: 'pointer' }}
        />
    );
};

const WELL_LIT_PATH_METADATA = {
    'optimized-baseline': {
        sig: 'SIG Router',
        owners: '@liu-cong, @vMaroon',
        infra: 'GKE Standard Cluster'
    },
    'pd-disaggregation': {
        sig: 'SIG PD-Disaggregation',
        owners: '@tlrmchlsmth',
        infra: 'GKE Standalone Cluster'
    },
    'precise-prefix-cache-routing': {
        sig: 'SIG KV-Disaggregation',
        owners: '@vMaroon, @liu-cong',
        infra: 'GKE Standalone Cluster'
    },
    'tiered-prefix-cache': {
        sig: 'SIG KV-Disaggregation',
        owners: '@kfirtoledo, @liu-cong, @vMaroon',
        infra: 'GKE Standalone Cluster'
    },
    'workload-autoscaling': {
        sig: 'SIG Autoscaling',
        owners: '@lionelvillard',
        infra: 'GKE Standalone Cluster'
    },
    'asynchronous-processing': {
        sig: 'SIG Router',
        owners: '@shimib',
        infra: 'GKE Standalone Cluster'
    },
    'batch-gateway': {
        sig: 'SIG Router',
        owners: '@lioraron',
        infra: 'GKE Standalone Cluster'
    },
    'flow-control': {
        sig: 'SIG Router',
        owners: '@LukeAVanDrie',
        infra: 'GKE Standalone Cluster'
    },
    'no-kubernetes-deployment': {
        sig: 'SIG Installation',
        owners: '@ezrasilvera',
        infra: 'Bare Metal / VM'
    },
    'recipes': {
        sig: 'SIG Installation',
        owners: '@ahg-g, @robertgshaw2-redhat, @liu-cong, @Gregory-Pereira',
        infra: 'GKE Standalone Cluster'
    },
    'rollouts': {
        sig: 'SIG Router',
        owners: '@ahg-g',
        infra: 'GKE Standalone Cluster'
    },
    'wide-ep-lws': {
        sig: 'SIG PD-Disaggregation',
        owners: '@robertgshaw2-redhat, @tlrmchlsmth',
        infra: 'GKE Multi-Node Cluster'
    }
};

const formatBuildId = (buildId) => {
    if (!buildId) return 'Unknown Run';
    const match = buildId.match(/^runner-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
    if (match) {
        const [_, year, month, day, hour, minute, second] = match;
        return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    }
    return buildId;
};

import { 
    Activity, Zap, BarChart2, ArrowLeft, Menu, Share2, Shield, CheckCircle, AlertTriangle, 
    ExternalLink, FileCode, GitCommit, Clock, Cpu, Server, Info, ChevronDown, ChevronUp, Download, Layers 
} from 'lucide-react';
import { 
    ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine 
} from 'recharts';
import { CustomXAxis, CustomYAxis } from './common';
import { scanRegressions } from '../utils/gcsScanner';

export default function RegressionsAnalysisDashboard({ onNavigateBack, onToggleMobileNav }) {
    const [shareToast, setShareToast] = useState(false);
    const [selectedPath, setSelectedPath] = useState('');
    const [activeMetric, setActiveMetric] = useState('ttft'); // 'ttft' | 'itl' | 'qps' | 'p90Latency' | 'cacheHitPct'
    const [selectedRunMenu, setSelectedRunMenu] = useState('optimized-baseline/gke/kustomize');
    const [xAxisMode, setXAxisMode] = useState('output'); // 'build' | 'date' | 'output' | 'input' | 'total' | 'qps'
    const [yMetric, setYMetric] = useState('ntpot'); // 'ntpot' | 'tpot' | 'ttft' | 'itl' | 'e2e'
    const [isLogScaleX, setIsLogScaleX] = useState(false);
    const [showPerChip, setShowPerChip] = useState(false);
    const [visiblePercentiles, setVisiblePercentiles] = useState(['P50', 'P90', 'P99']);
    const [tputCap, setTputCap] = useState(4000);
    const [showChartFilters, setShowChartFilters] = useState(true);
    const [bugLoggedToast, setBugLoggedToast] = useState(false);
    const [viewSavedToast, setViewSavedToast] = useState(false);
    const [showFaq, setShowFaq] = useState(0);
    const [selectedBuilds, setSelectedBuilds] = useState([]);

    const handleToggleBuild = (build) => {
        setSelectedBuilds(prev => {
            if (prev.includes(build)) {
                return prev.filter(b => b !== build);
            } else {
                return [...prev, build];
            }
        });
    };

    const [runs, setRuns] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const loadData = async () => {
            try {
                const gcsRuns = await scanRegressions();
                if (!active) return;
                if (gcsRuns && gcsRuns.length > 0) {
                    const mapped = gcsRuns.map((d, idx) => {
                        const status = (d.ttft?.p50 || 0) > 250 ? 'regression' : 'stable';
                        const modelName = d.model || 'openai-infqps-concurrency1-opt-125m';
                        return {
                            build: d.runId || `gcs-${idx}`,
                            date: d.date || 'Unknown',
                            qps: d.qps || 0,
                            outputTokenRate: d.output_token_rate || 0,
                            totalTokenRate: d.total_token_rate || 0,
                            inputTokenRate: d.input_token_rate || 0,
                            cacheHitPct: d.cacheHitPercent || 85,
                            status: status,
                            stage: d.stage !== undefined ? d.stage : 0,
                            duration: d.duration || 0,
                            request_rate: d.request_rate || 0,
                            success_rate: d.success_rate !== undefined ? d.success_rate : 100,
                            commit: d.commit?.slice(0, 7) || d.runId?.slice(0, 7) || 'gcs-run',
                            pr: d.pr || '#N/A',
                            author: d.author || '@gke-runner',
                            note: d.note || (status === 'regression' ? 'High latency anomaly caught on nightly run' : undefined),
                            model: modelName,
                            suite: d.suite || 'gke/standalone',
                            github_run_id: d.github_run_id || null,
                            github_repository: d.github_repository || null,
                            hardware: d.hardware || 'Unknown',
                            // Parse actual percentiles from GCS
                            ttft_p50: d.ttft?.p50 || 0,
                            ttft_p90: d.ttft?.p90 || d.tpot?.p90 || 0,
                            ttft_p99: d.ttft?.p99 || d.tpot?.p99 || 0,
                            itl_p50: d.itl?.p50 || 0,
                            itl_p90: d.itl?.p90 || 0,
                            itl_p99: d.itl?.p99 || 0,
                            ntpot_p50: d.ntpot?.p50 || 0,
                            ntpot_p90: d.ntpot?.p90 || 0,
                            ntpot_p99: d.ntpot?.p99 || 0,
                            tpot_p50: d.tpot?.p50 || 0,
                            tpot_p90: d.tpot?.p90 || 0,
                            tpot_p99: d.tpot?.p99 || 0
                        };
                    });
                    setRuns(mapped);
                    const optRun = mapped.find(r => r.suite.includes('optimized-baseline'));
                    if (optRun) {
                        setSelectedPath(optRun.model);
                        setSelectedRunMenu(optRun.suite);
                    } else if (mapped.length > 0) {
                        setSelectedPath(mapped[0].model);
                        setSelectedRunMenu(mapped[0].suite);
                    }
                }
            } catch (e) {
                console.error('Failed to scan GCS regressions', e);
            } finally {
                if (active) setIsLoading(false);
            }
        };
        loadData();
        return () => { active = false; };
    }, []);

    useEffect(() => {
        const suiteRuns = runs.filter(r => 
            r.model === selectedPath && 
            r.suite === selectedRunMenu
        );
        if (suiteRuns.length > 0) {
            const uniqueBuilds = Array.from(new Set(suiteRuns.map(r => r.build)));
            setSelectedBuilds([uniqueBuilds[uniqueBuilds.length - 1] || null].filter(Boolean));
        } else {
            setSelectedBuilds([]);
        }
    }, [selectedPath, selectedRunMenu, runs]);

    const derivedPaths = useMemo(() => {
        const uniqueSuites = Array.from(new Set(runs.map(r => r.suite).filter(Boolean)));
        if (uniqueSuites.length === 0) {
            return [
                { 
                    id: 'optimized-baseline/gke/kustomize', 
                    name: 'Optimized-baseline Gke Kustomize', 
                    sig: 'SIG Router', 
                    owner: '@liu-cong, @vMaroon', 
                    infra: 'GKE Standard Cluster', 
                    status: 'Stable' 
                }
            ];
        }
        return uniqueSuites.map(s => {
            const formattedName = s.split('/')
                .map(part => part.charAt(0).toUpperCase() + part.slice(1))
                .join(' ');
            
            const pathKey = s.split('/')[0];
            const meta = WELL_LIT_PATH_METADATA[pathKey] || {
                sig: 'SIG Router',
                owners: '@gke-runner',
                infra: 'GKE Cluster'
            };
            
            const suiteRuns = runs.filter(r => r.suite === s);
            const hasRegression = suiteRuns.some(r => r.status === 'regression');
            
            return {
                id: s,
                name: formattedName,
                sig: meta.sig,
                owner: meta.owners,
                infra: meta.infra,
                status: hasRegression ? 'Regression Detected' : 'Stable'
            };
        });
    }, [runs]);

    const derivedSuites = useMemo(() => {
        const uniqueSuites = Array.from(new Set(runs.map(r => r.suite).filter(Boolean)))
            .filter(s => s.includes('optimized-baseline'));
        if (uniqueSuites.length === 0) {
            return [
                { 
                    id: 'optimized-baseline/gke/kustomize', 
                    title: 'Optimized Baseline', 
                    infraTag: 'GKE',
                    methodTag: 'Kustomize',
                    sig: 'SIG Router', 
                    desc: 'Baseline optimization regressions tracking' 
                }
            ];
        }
        return uniqueSuites.map(s => {
            const parts = s.split('/');
            const scenarioName = parts[0] ? parts[0].split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : 'Unknown Scenario';
            const infra = parts[1] ? parts[1].toUpperCase() : null;
            const method = parts[2] ? parts[2].charAt(0).toUpperCase() + parts[2].slice(1) : null;
            
            const pathKey = parts[0];
            const meta = WELL_LIT_PATH_METADATA[pathKey] || {
                sig: 'SIG Router',
                owners: '@gke-runner',
                infra: 'GKE Cluster'
            };
            return {
                id: s,
                title: scenarioName,
                infraTag: infra,
                methodTag: method,
                sig: meta.sig,
                desc: `Telemetry suite for benchmark scenario: ${s}`
            };
        });
    }, [runs]);

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
        const modelRuns = runs.filter(r => 
            r.model === (selectedPath || 'openai-infqps-concurrency1-opt-125m') &&
            r.suite === (selectedRunMenu || 'optimized-baseline/gke/kustomize')
        );
        const baseData = modelRuns;

        // Map and derive metrics
        const processed = baseData.map(d => {
            // Derive X values (Latency percentiles)
            let xVal_p50 = d.ttft_p50;
            let xVal_p90 = d.ttft_p90;
            let xVal_p99 = d.ttft_p99;

            if (yMetric === 'itl') {
                xVal_p50 = d.itl_p50;
                xVal_p90 = d.itl_p90;
                xVal_p99 = d.itl_p99;
            } else if (yMetric === 'ntpot') {
                xVal_p50 = d.ntpot_p50;
                xVal_p90 = d.ntpot_p90;
                xVal_p99 = d.ntpot_p99;
            } else if (yMetric === 'tpot') {
                xVal_p50 = d.tpot_p50;
                xVal_p90 = d.tpot_p90;
                xVal_p99 = d.tpot_p99;
            } else if (yMetric === 'e2e') {
                xVal_p50 = d.ttft_p50 + d.itl_p50 * 10;
                xVal_p90 = d.ttft_p90 + d.itl_p90 * 10;
                xVal_p99 = d.ttft_p99 + d.itl_p99 * 10;
            }

            // Apply Per Chip scaling to Latency (X-axis)
            if (showPerChip) {
                xVal_p50 = xVal_p50 / 8; // Assume 8 chips
                xVal_p90 = xVal_p90 / 8;
                xVal_p99 = xVal_p99 / 8;
            }

            // Derive Y value (Throughput/QPS)
            let yVal = d.qps;
            if (xAxisMode === 'input') {
                yVal = d.inputTokenRate;
            } else if (xAxisMode === 'total') {
                yVal = d.totalTokenRate;
            } else if (xAxisMode === 'output') {
                yVal = d.outputTokenRate;
            } else if (xAxisMode === 'qps') {
                yVal = d.qps;
            }

            return {
                ...d,
                xVal_p50,
                xVal_p90,
                xVal_p99,
                yVal
            };
        });

        const filtered = processed.filter(d => {
            if (typeof d.yVal === 'number') {
                return d.yVal <= tputCap;
            }
            return true;
        });

        return filtered;
    }, [selectedRunMenu, xAxisMode, yMetric, showPerChip, tputCap, runs, selectedPath]);

    const uniqueRunsForSidebar = useMemo(() => {
        const seen = new Set();
        const unique = [];
        for (const r of filteredRuns) {
            if (!seen.has(r.build)) {
                seen.add(r.build);
                unique.push(r);
            }
        }
        return unique.sort((a, b) => {
            const dateA = a.date || '';
            const dateB = b.date || '';
            if (dateA !== dateB) {
                return dateB.localeCompare(dateA);
            }
            return (b.build || '').localeCompare(a.build || '');
        });
    }, [filteredRuns]);

    const selectedRunsData = useMemo(() => {
        return filteredRuns.filter(r => selectedBuilds.includes(r.build));
    }, [filteredRuns, selectedBuilds]);

    const xDomain = useMemo(() => {
        if (selectedRunsData.length === 0) return [0.1, 100];
        const xVals = selectedRunsData.flatMap(d => [d.xVal_p50, d.xVal_p90, d.xVal_p99]).filter(x => typeof x === 'number');
        if (xVals.length === 0) return [0.1, 100];
        const minX = Math.min(...xVals);
        const maxX = Math.max(...xVals);

        if (isLogScaleX) {
            const logMin = Math.floor(Math.log10(minX > 0 ? minX : 0.1));
            const logMax = Math.ceil(Math.log10(maxX > 0 ? maxX : 100));
            return [Math.pow(10, logMin), Math.pow(10, logMax)];
        } else {
            const pad = (maxX - minX) * 0.05 || 1;
            return [Math.max(0, minX - pad), maxX + pad];
        }
    }, [selectedRunsData, isLogScaleX]);

    const handleShareView = () => {
        navigator.clipboard.writeText(window.location.href);
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2000);
    };

    const handleExportJson = () => {
        const payload = JSON.stringify({ selectedPath, activeMetric, runs: runs }, null, 2);
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(payload);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `nightly_regression_${selectedPath}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
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
                <div className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-widest">
                    Prism Utility Suite • Nightly Regression Tracking
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
                            {derivedSuites.map(run => {
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
                                            className="cursor-pointer flex flex-col gap-1 w-full"
                                        >
                                            <span className="font-bold text-xs font-sans text-slate-100 truncate">{run.title}</span>
                                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                                {run.infraTag && (
                                                    <span className="px-1.5 py-0.5 text-[8px] font-extrabold rounded-sm uppercase tracking-wide border bg-slate-950 text-cyan-400 border-cyan-950/50 shrink-0">
                                                        {run.infraTag}
                                                    </span>
                                                )}
                                                {run.methodTag && (
                                                    <span className="px-1.5 py-0.5 text-[8px] font-extrabold rounded-sm uppercase tracking-wide border bg-slate-950 text-slate-400 border-slate-800 shrink-0">
                                                        {run.methodTag}
                                                    </span>
                                                )}
                                                <span className="text-[8px] font-mono bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800 shrink-0">
                                                    {run.sig}
                                                </span>
                                            </div>
                                        </div>

                                        {isSelected && (
                                            <div className="mt-2 pt-2 border-t border-slate-700/50 space-y-2 max-h-[220px] overflow-y-auto no-scrollbar">
                                                {uniqueRunsForSidebar.map(runPoint => {
                                                    const isRunSelected = selectedBuilds.includes(runPoint.build);
                                                    return (
                                                        <div 
                                                            key={runPoint.build} 
                                                            onClick={() => handleToggleBuild(runPoint.build)}
                                                            className={`flex items-center justify-between text-[10px] p-2 rounded-lg border transition-all cursor-pointer ${
                                                                isRunSelected 
                                                                    ? 'bg-slate-800 border-cyan-500 shadow-md shadow-cyan-950/50 text-white' 
                                                                    : 'bg-slate-900/80 hover:bg-slate-900 border-slate-800/50 text-slate-300'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all ${
                                                                    isRunSelected 
                                                                        ? 'bg-cyan-500 border-cyan-400 text-slate-950 font-black' 
                                                                        : 'border-slate-700 bg-slate-950'
                                                                }`}>
                                                                    {isRunSelected && '✓'}
                                                                </div>
                                                                <div className="flex flex-col flex-1 min-w-0">
                                                                    <a 
                                                                        href={runPoint.github_run_id 
                                                                            ? `https://github.com/${runPoint.github_repository || 'llm-d/llm-d'}/actions/runs/${runPoint.github_run_id}` 
                                                                            : `https://github.com/llm-d/llm-d/actions/runs/${runPoint.build.replace('b', '')}`
                                                                        }
                                                                        target="_blank" 
                                                                        rel="noopener noreferrer"
                                                                        onClick={(e) => e.stopPropagation()} // Prevent selecting run when clicking link
                                                                        className="font-mono font-bold text-slate-200 hover:text-cyan-400 hover:underline flex items-center gap-1.5 transition-colors w-fit"
                                                                        title="View GitHub Action Run"
                                                                    >
                                                                        <span>{formatBuildId(runPoint.build)}</span>
                                                                        <ExternalLink className="w-2.5 h-2.5 opacity-60 shrink-0" />
                                                                    </a>
                                                                    {runPoint.hardware && runPoint.hardware !== 'Unknown' && (
                                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                                            <span className={`px-1 py-0.5 text-[8px] font-extrabold rounded-sm uppercase tracking-wide border ${
                                                                                runPoint.hardware.startsWith('TPU') 
                                                                                    ? 'bg-purple-950/60 text-purple-300 border-purple-800/40' 
                                                                                    : 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40'
                                                                            }`}>
                                                                                {runPoint.hardware}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                </div>
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
                                                <span>{derivedPaths.find(p => p.id === selectedRunMenu)?.infra || 'Cluster Hardware'}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-slate-500 font-semibold">SIG:</span>
                                            <div className="font-mono text-slate-200 font-bold">
                                                {derivedPaths.find(p => p.id === selectedRunMenu)?.sig || 'SIG-Serving'}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                                {derivedSuites.find(s => s.id === selectedRunMenu)?.title || selectedRunMenu || 'Default Scenario'}
                                        </div>
                                    </div>

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
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="p-6 flex flex-col space-y-6 flex-1 overflow-visible">
                            {/* Interactive Chart Container */}
                            <div className="w-full h-[460px] bg-slate-950/50 border border-slate-800/60 rounded-xl p-4 select-none relative overflow-visible flex flex-col">
                                <ResponsiveContainer width="100%" height="100%">
                                <LineChart margin={{ top: 25, right: 20, left: 0, bottom: 10 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} />
                                    <CustomXAxis 
                                        dataKey="xVal" 
                                        type="number"
                                        label={yLabels[yMetric] || 'Latency'}
                                        theme="dark"
                                        scale={isLogScaleX ? 'log' : 'auto'}
                                        domain={xDomain}
                                        allowDataOverflow={true}
                                        ticks={isLogScaleX ? (() => {
                                            const min = xDomain[0];
                                            const max = xDomain[1];
                                            const ticks = [];
                                            let current = Math.pow(10, Math.ceil(Math.log10(min)));
                                            while (current <= max) {
                                                ticks.push(current);
                                                current *= 10;
                                            }
                                            return ticks;
                                        })() : undefined}
                                        strokeWidth={1}
                                    />
                                    <CustomYAxis 
                                        label={xLabels[xAxisMode] || 'Throughput'}
                                        theme="dark"
                                        strokeWidth={1}
                                    />
                                    <Tooltip 
                                        isAnimationActive={false}
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const d = payload[0].payload;
                                                return (
                                                    <div className="bg-slate-900/95 border border-slate-700/50 rounded-lg shadow-xl p-3 min-w-[240px] backdrop-blur-md text-slate-100 z-[100]">
                                                        <div className="border-b border-slate-700/60 pb-1.5 mb-1.5">
                                                            <div className="text-[11px] font-mono text-cyan-400 font-bold leading-tight flex justify-between">
                                                                <span>Run: {formatBuildId(d.build)}</span>
                                                                <span className="text-purple-400">Stage {d.stage}</span>
                                                            </div>
                                                            <div className="text-[9px] text-slate-400 mt-0.5">
                                                                Date: {d.date} | Model: {d.model}
                                                            </div>
                                                            <div className="text-[9px] text-slate-500 font-mono mt-1.5 flex flex-col gap-0.5">
                                                                <div className="flex justify-between">
                                                                    <span className="text-slate-500">Target Rate:</span>
                                                                    <span className="text-white font-bold">{d.request_rate ? `${d.request_rate} QPS` : 'N/A'}</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-slate-500">Achieved Rate:</span>
                                                                    <span className="text-white font-bold">{d.qps !== undefined ? `${Number(d.qps).toFixed(1)} QPS` : 'N/A'}</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-slate-500">Duration:</span>
                                                                    <span className="text-white font-bold">{d.duration ? `${Number(d.duration).toFixed(0)}s` : 'N/A'}</span>
                                                                </div>
                                                            </div>
                                                            <div className="text-[9px] font-mono mt-1 flex justify-between items-center border-t border-slate-800/40 pt-1">
                                                                <span className="text-slate-500">Request Success Rate:</span>
                                                                <span className={`font-bold ${d.success_rate < 90 ? 'text-red-400' : 'text-emerald-400'}`}>
                                                                    {d.success_rate.toFixed(1)}%
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-2 pt-1">
                                                            {payload.map((entry, index) => {
                                                                const throughputVal = entry.payload.xVal;
                                                                const latencyVal = entry.value;
                                                                const tputUnit = xAxisMode === 'qps' ? 'qps' : 'tok/s';
                                                                
                                                                return (
                                                                    <div key={index} className="flex flex-col gap-0.5 border-b border-slate-800/40 pb-1.5 last:border-0 last:pb-0">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.stroke }} />
                                                                            <span className="text-[10px] text-slate-200 font-bold">{entry.name}</span>
                                                                        </div>
                                                                        <div className="flex items-center justify-between text-[10px] font-mono pl-4">
                                                                            <span className="text-slate-500">Latency:</span>
                                                                            <span className="text-white font-bold">{latencyVal !== undefined ? `${Number(latencyVal).toFixed(1)} ms` : 'N/A'}</span>
                                                                        </div>
                                                                        <div className="flex items-center justify-between text-[10px] font-mono pl-4">
                                                                            <span className="text-slate-500">Throughput:</span>
                                                                            <span className="text-white font-bold">{throughputVal !== undefined ? `${Number(throughputVal).toFixed(1)} ${tputUnit}` : 'N/A'}</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        {d.note && (
                                                            <div className="mt-2 pt-1 border-t border-slate-800 text-[10px] text-amber-300 font-sans leading-normal">
                                                                ⚠️ {d.note}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    
                                    {selectedBuilds.map((build, buildIdx) => {
                                        const colors = RUN_COLORS[buildIdx % RUN_COLORS.length];
                                        const runData = filteredRuns.filter(r => r.build === build);
                                        
                                        const p50Data = runData.map(r => ({ ...r, xVal: r.xVal_p50 })).sort((a, b) => a.stage - b.stage);
                                        const p90Data = runData.map(r => ({ ...r, xVal: r.xVal_p90 })).sort((a, b) => a.stage - b.stage);
                                        const p99Data = runData.map(r => ({ ...r, xVal: r.xVal_p99 })).sort((a, b) => a.stage - b.stage);
                                        
                                        return (
                                            <React.Fragment key={build}>
                                                {visiblePercentiles.includes('P50') && (
                                                    <Line 
                                                        type="monotone" 
                                                        data={p50Data}
                                                        dataKey="yVal" 
                                                        name={`${formatBuildId(build)} P50`} 
                                                        stroke={colors.p50} 
                                                        strokeWidth={3} 
                                                        dot={<CustomizedDot />} 
                                                        activeDot={<CustomizedDot r={6} />}
                                                        isAnimationActive={false} 
                                                    />
                                                )}
                                                {visiblePercentiles.includes('P90') && (
                                                    <Line 
                                                        type="monotone" 
                                                        data={p90Data}
                                                        dataKey="yVal" 
                                                        name={`${formatBuildId(build)} P90`} 
                                                        stroke={colors.p90} 
                                                        strokeDasharray="5 5"
                                                        strokeWidth={2} 
                                                        dot={<CustomizedDot />} 
                                                        activeDot={<CustomizedDot r={5} />}
                                                        isAnimationActive={false} 
                                                    />
                                                )}
                                                {visiblePercentiles.includes('P99') && (
                                                    <Line 
                                                        type="monotone" 
                                                        data={p99Data}
                                                        dataKey="yVal" 
                                                        name={`${formatBuildId(build)} P99`} 
                                                        stroke={colors.p99} 
                                                        strokeDasharray="2 2"
                                                        strokeWidth={2} 
                                                        dot={<CustomizedDot />} 
                                                        activeDot={<CustomizedDot r={5} />}
                                                        isAnimationActive={false} 
                                                    />
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </LineChart>
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
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Percentile Lines</div>
                                        <div className="flex gap-x-4 gap-y-1 flex-wrap">
                                            {[
                                                { p: 'P50', style: 'solid', desc: 'Median Latency' },
                                                { p: 'P90', style: 'dashed', desc: 'Tail Latency' },
                                                { p: 'P99', style: 'dotted', desc: 'Max Outliers' }
                                            ].map(item => (
                                                <div key={item.p} className="flex items-center gap-1.5">
                                                    <div className="w-5 h-3 flex items-center">
                                                        <div className="w-full h-0 border-t-2" style={{ borderColor: '#cbd5e1', borderStyle: item.style, opacity: visiblePercentiles.includes(item.p) ? 1 : 0.3 }} />
                                                    </div>
                                                    <span className={`text-[10px] font-semibold ${visiblePercentiles.includes(item.p) ? 'text-slate-300' : 'text-slate-600'}`}>{item.p}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Selected Nightly Runs</div>
                                        <div className="flex gap-x-6 gap-y-1.5 flex-wrap">
                                            {selectedBuilds.map((build, idx) => {
                                                const colors = RUN_COLORS[idx % RUN_COLORS.length];
                                                return (
                                                    <div key={build} className="flex items-center gap-2">
                                                        <div className="w-3 h-3 rounded" style={{ backgroundColor: colors.p50 }} />
                                                        <span className="text-[10px] font-mono font-bold text-slate-300">{formatBuildId(build)}</span>
                                                    </div>
                                                );
                                            })}
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
                                Select any well-lit path below to load its nightly regression history into the charts above.
                            </p>
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
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
                                {derivedPaths.map((path, idx) => {
                                    const isCurrent = selectedRunMenu === path.id;
                                    return (
                                        <tr 
                                            key={idx} 
                                            onClick={() => {
                                                setSelectedRunMenu(path.id);
                                                const suiteRuns = runs.filter(r => r.suite === path.id);
                                                if (suiteRuns.length > 0) {
                                                    setSelectedPath(suiteRuns[0].model);
                                                }
                                            }}
                                            className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${
                                                isCurrent ? 'bg-slate-800/70' : ''
                                            }`}
                                        >
                                            <td className="p-4 text-white font-sans flex items-center gap-2">
                                                <span>{path.name}</span>
                                                {isCurrent && <span className="text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-sans font-black uppercase tracking-wider">Active</span>}
                                            </td>
                                            <td className="p-4 font-sans text-white">{path.sig}</td>
                                            <td className="p-4 text-white">{path.owner}</td>
                                            <td className="p-4 text-white">{path.infra}</td>
                                            <td className="p-4 font-sans text-white">
                                                {path.status}
                                            </td>
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



        </div>
    );
}
