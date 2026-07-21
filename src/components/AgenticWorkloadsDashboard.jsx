import React, { useState, useMemo, useEffect } from 'react';
import {
    ScatterChart, Scatter, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
    ExternalLink, ChevronDown, ChevronUp, Check, Code,
} from 'lucide-react';
import { WellLitHeader, Button, Badge, Modal, Panel, ToggleGroup, Spinner, ChartTooltip, ChartXAxis, ChartYAxis, seriesColor, gridProps, getChartTheme } from './ui';
import { cn } from '../utils/cn';
import { scanAgenticWorkloads } from '../utils/gcsScanner';
import { getLocalDashboardRuns } from '../utils/dashboardHelpers';

const SCENARIOS = [
    { id: 0, name: 'K8s Service (Reference)', label: 'Reference', description: 'Standard K8s round-robin pod routing' },
    { id: 1, name: 'llm-d Routing', label: 'Opt 1: Intelligent Routing', description: 'Prefix & KV-cache-aware cluster gateway routing' },
    { id: 2, name: 'Combined Optimizations', label: 'Opt 2: Combined', description: 'Pallas kernels + stream-load + FP8' }
];

// Shared chart palette slots, assigned stably by scenario id with hue-family
// continuity to the old per-dashboard hexes (orange→amber, cyan→sky, emerald→emerald).
const SCENARIO_COLORS = {
    0: seriesColor(2), // amber — K8s Service (Reference)
    1: seriesColor(1), // sky — llm-d Routing
    2: seriesColor(0), // emerald — Combined Optimizations
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

const X_METRIC_KEYS = { ntpot: 'ntpot', tpot: 'tpot', ttft: 'ttft', itl: 'itl', e2e: 'e2e' };
const Y_METRIC_KEYS = { output: 'output', input: 'input', total: 'total', qps: 'qps' };

const X_LABELS = { ntpot: 'Normalized TPOT (ms)', tpot: 'Time Per Output Token (ms)', ttft: 'Time To First Token (ms)', itl: 'Inter-Token Latency (ms)', e2e: 'End-to-End Latency (ms)' };
const Y_LABELS = { output: 'Output Tokens/sec', input: 'Input Tokens/sec', total: 'Total Tokens/sec', qps: 'Queries Per Second' };

const RichAgentWorkloadTooltip = ({ active, payload, metadata }) => {
    if (!active || !payload || !payload.length) return null;

    const groups = {};
    payload.forEach(entry => {
        const groupName = entry.name.split(' (')[0] || entry.name;
        if (!groups[groupName]) groups[groupName] = [];
        groups[groupName].push(entry);
    });

    return (
        <ChartTooltip className="min-w-[220px] text-slate-100 font-mono">
            <div className="border-b border-slate-700/60 pb-1.5 mb-1.5">
                {payload[0]?.payload?.scenarioName && (
                    <div className="text-[11px] font-bold text-white mb-0.5">
                        {payload[0].payload.scenarioName}
                    </div>
                )}
                <div className="text-[10px] font-mono text-slate-400 leading-tight">
                    {metadata?.machineType || 'tpu7x-standard'} {metadata?.model ? `• ${metadata.model.split('/').pop()?.split('-Instruct')[0]}` : ''}
                </div>
                <div className="flex items-center gap-3 mt-1">
                    {payload[0]?.payload?.concurrency != null && (
                        <div className="text-[10px] font-bold text-cyan-400">
                            Concurrency: {payload[0].payload.concurrency}
                        </div>
                    )}
                    <div className="text-[10px] text-slate-400">
                        Context: {metadata?.inputLengthMean ? `${Math.round(metadata.inputLengthMean / 1000)}k Tokens` : 'N/A'}
                    </div>
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
                                const yVal = entry.value;
                                const percentile = entry.name.match(/P\d+/)?.[0] || 'P50';

                                return (
                                    <div key={index} className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-1.5">
                                            <svg className="w-4 h-2 shrink-0" viewBox="0 0 16 8">
                                                <line
                                                    x1="0" y1="4" x2="16" y2="4"
                                                    stroke={entry.stroke || entry.fill || seriesColor(1)}
                                                    strokeWidth="2"
                                                    strokeDasharray={percentile === 'P90' ? '4 3' : percentile === 'P99' ? '2 2' : 'none'}
                                                />
                                            </svg>
                                            <span className="text-[10px] text-slate-200 font-medium">{percentile}</span>
                                        </div>
                                        <span className="text-[10px] font-mono font-bold text-white">
                                            {typeof yVal === 'number' ? yVal < 1 ? yVal.toFixed(3) : Math.round(yVal).toLocaleString() : yVal}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </ChartTooltip>
    );
};

const getLatencyValue = (report, metric, percentile) => {
    const pKey = percentile.toLowerCase();
    return report[metric]?.[pKey] || 0;
};

const getThroughputValue = (report, metric) => {
    return report.throughput?.[metric] || 0;
};

export default function AgenticWorkloadsDashboard({ onNavigateBack, onNavigate, onToggleMobileNav, dashboardData }) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeRecipeTab, setActiveRecipeTab] = useState(0);
    const [copiedStates, setCopiedStates] = useState({});

    const [showFilters, setShowFilters] = useState(true);
    const [zoomXAxis, setZoomXAxis] = useState('ntpot');
    const [zoomYAxis, setZoomYAxis] = useState('total');
    const [zoomLogScale, setZoomLogScale] = useState(true);
    const [zoomPerChip, setZoomPerChip] = useState(false);
    const [visiblePercentiles, setVisiblePercentiles] = useState(['P50']);
    const [zoomXMax, setZoomXMax] = useState(null);
    const [tableMetricMode, setTableMetricMode] = useState('ntpot');
    const [tableThroughputMode, setTableThroughputMode] = useState('total');
    const [showTableFilters, setShowTableFilters] = useState(false);
    const [selectedPercentile, setSelectedPercentile] = useState('P50');
    const [sortConfig, setSortConfig] = useState({ key: 'qps', direction: 'asc' });
    const [openFAQIndex, setOpenFAQIndex] = useState(null);
    const [selectedConcurrency, setSelectedConcurrency] = useState(null);

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const reports = await scanAgenticWorkloads();

                // Get local runs targeting agentic-serving
                const localRuns = dashboardData?.brv02Runs
                    ? getLocalDashboardRuns(dashboardData.brv02Runs, 'agentic-serving')
                    : [];

                const combinedReports = [...reports, ...localRuns];
                setData(combinedReports);

                if (combinedReports.length > 0) {
                    const concurrencies = [...new Set(combinedReports.map(r => r.concurrency))].sort((a, b) => a - b);
                    setSelectedConcurrency(concurrencies[concurrencies.length - 1]);
                    const maxLatency = Math.max(...combinedReports.flatMap(r => [r.ttft.p99, r.tpot.p99, r.ntpot.p99, r.itl.p99, r.e2e.p99]));
                    setZoomXMax(Math.ceil(maxLatency / 1000) * 1000);
                }
            } catch (e) {
                console.error('Failed to load agentic workloads data:', e);
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [dashboardData?.brv02Runs]);

    const metadata = useMemo(() => {
        if (!data.length) return null;
        const first = data[0];
        return {
            model: first.model,
            accelerator: first.accelerator,
            machineType: first.machineType,
            replicas: first.replicas,
            inputLengthMean: first.inputLengthMean,
            outputLengthMean: first.outputLengthMean,
        };
    }, [data]);

    const concurrencyLevels = useMemo(() => {
        return [...new Set(data.map(r => r.concurrency))].sort((a, b) => a - b);
    }, [data]);

    const [activeTiers, setActiveTiers] = useState({ 0: true, 1: true, 2: true, 3: false });

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

    const buildChartLines = useMemo(() => {
        const lines = [];
        const xMetric = zoomXAxis;
        const yMetric = zoomYAxis;

        SCENARIOS.forEach(s => {
            if (!activeTiers[s.id] || s.comingSoon) return;
            const scenarioData = data.filter(d => d.scenarioId === s.id);
            if (!scenarioData.length) return;

            ['P50', 'P90', 'P99'].forEach(p => {
                if (!visiblePercentiles.includes(p)) return;
                const pKey = p.toLowerCase();
                const dash = p === 'P90' ? '4 3' : p === 'P99' ? '2 2' : 'none';

                const points = scenarioData.map(d => ({
                    x: d[xMetric]?.[pKey] || 0,
                    y: getThroughputValue(d, yMetric),
                    concurrency: d.concurrency,
                    scenarioName: s.name,
                })).filter(pt => pt.x > 0 && pt.y > 0);

                if (points.length) {
                    lines.push({
                        id: `${s.id}-${pKey}`,
                        name: `${s.name} (${p})`,
                        color: SCENARIO_COLORS[s.id],
                        dash,
                        data: points,
                    });
                }
            });
        });
        return lines;
    }, [data, activeTiers, visiblePercentiles, zoomXAxis, zoomYAxis]);

    const outcomes = useMemo(() => {
        if (!data.length || selectedConcurrency === null) return null;
        const refData = data.find(d => d.scenarioId === 0 && d.concurrency === selectedConcurrency);
        if (!refData) return null;

        const combinedData = data.find(d => d.scenarioId === 2 && d.concurrency === selectedConcurrency);
        if (!combinedData) return null;

        const tputGain = ((combinedData.throughput.total - refData.throughput.total) / refData.throughput.total) * 100;
        const ttftRef = refData.ttft.p50;
        const ttftOpt = combinedData.ttft.p50;
        const latencyReduction = ttftRef > 0 ? ((ttftRef - ttftOpt) / ttftRef) * 100 : 0;

        return {
            throughput: `${tputGain > 0 ? '+' : ''}${tputGain.toFixed(1)}%`,
            latency: `${latencyReduction > 0 ? '-' : '+'}${Math.abs(latencyReduction).toFixed(1)}%`,
            concurrency: selectedConcurrency,
        };
    }, [data, selectedConcurrency]);

    const tableRows = useMemo(() => {
        return concurrencyLevels.map(conc => {
            const refReport = data.find(d => d.scenarioId === 0 && d.concurrency === conc);
            const bestReport = data.find(d => d.scenarioId === 2 && d.concurrency === conc);

            const pKey = selectedPercentile.toLowerCase();
            const metricKey = tableMetricMode;

            const refVal = refReport ? getLatencyValue(refReport, metricKey, pKey) : 0;
            const optVal = bestReport ? getLatencyValue(bestReport, metricKey, pKey) : 0;
            const latencyGain = refVal > 0 && optVal > 0 ? ((refVal - optVal) / refVal) * 100 : 0;

            const refThroughput = refReport?.throughput?.[tableThroughputMode] || 0;
            const optThroughput = bestReport?.throughput?.[tableThroughputMode] || 0;
            const throughputGain = refThroughput > 0 && optThroughput > 0 ? ((optThroughput - refThroughput) / refThroughput) * 100 : 0;

            return {
                concurrency: conc,
                qps: refReport?.throughput?.qps || 0,
                refVal,
                optVal,
                latencyGain,
                refThroughput,
                optThroughput,
                throughputGain,
                optScenario: bestReport?.scenarioId,
                isCurrent: selectedConcurrency === conc,
            };
        });
    }, [data, concurrencyLevels, selectedPercentile, tableMetricMode, tableThroughputMode, selectedConcurrency]);

    const exportToCSV = () => {
        const pKey = selectedPercentile.toLowerCase();
        const headers = ['Concurrency', `Ref ${selectedPercentile} (${tableMetricMode.toUpperCase()})`, `Ref Throughput (${tableThroughputMode === 'qps' ? 'qps' : 'tok/s'})`, `Combined ${selectedPercentile} (${tableMetricMode.toUpperCase()})`, `Combined Throughput (${tableThroughputMode === 'qps' ? 'qps' : 'tok/s'})`, 'Latency Δ (%)', 'Throughput Δ (%)'];
        const rows = tableRows.map(row => [row.concurrency, row.refVal.toFixed(1), row.refThroughput.toFixed(1), row.optVal.toFixed(1), row.optThroughput.toFixed(1), row.latencyGain.toFixed(1), row.throughputGain.toFixed(1)].join(','));
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

    const xAxisLabel = X_LABELS[zoomXAxis] || 'Latency';
    const yAxisLabel = Y_LABELS[zoomYAxis] || 'Throughput';

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center pt-16 md:pl-24 w-full font-sans">
                <Spinner size="lg" />
                <div className="text-lg font-semibold text-slate-200 mt-4">Loading Agentic Serving Data...</div>
                <p className="text-xs text-slate-500 mt-2">Scanning GCS benchmark results</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center pt-16 md:pl-24 w-full font-sans">
                <div className="text-lg font-semibold text-red-400 mt-4">Error loading data</div>
                <p className="text-xs text-slate-500 mt-2">{error}</p>
            </div>
        );
    }


    const renderChart = (chartId, title) => (
        <div id={chartId} className="bg-slate-900/80 border border-slate-700/60 rounded-2xl shadow-xl flex flex-col w-full min-h-[550px] overflow-visible backdrop-blur-sm relative">
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/80 flex justify-between items-start gap-6 shadow-sm">
                <div className="flex flex-col gap-2.5">
                    <h3 className="text-lg font-bold text-white">{title}</h3>
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
                                <span>{metadata?.machineType || 'tpu7x-standard'}</span>
                                <span>{metadata?.accelerator?.toUpperCase() || 'TPU7x'}</span>
                                <span className="text-slate-400">({metadata?.replicas || 8} replicas)</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-slate-500 font-semibold">Model:</span>
                            <div className="font-mono text-slate-200">
                                <span className="font-bold">{metadata?.model?.split('/').pop()?.split('-Instruct')[0] || 'Qwen3-Coder-480B'}</span>
                                <span className="text-slate-400"> (FP8)</span>
                                <span className="mx-1">{'•'}</span>
                                <span className="font-bold">vLLM</span>
                            </div>
                        </div>
                    </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setShowFilters(!showFilters)} className="uppercase tracking-widest text-[10px] font-extrabold">
                    Filters
                    {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
            </div>

            {showFilters && (
                <div className="bg-slate-800/40 border-b border-slate-700/50 px-6 py-3 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest w-14">X-Axis:</span>
                            <ToggleGroup
                                size="xs"
                                options={[['ntpot', 'NTPOT'], ['tpot', 'TPOT'], ['ttft', 'TTFT'], ['itl', 'ITL'], ['e2e', 'E2E Latency']].map(([value, label]) => ({ value, label }))}
                                value={zoomXAxis}
                                onChange={setZoomXAxis}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest w-14">Y-Axis:</span>
                            <ToggleGroup
                                size="xs"
                                options={[['output', 'Output'], ['input', 'Input'], ['total', 'Total'], ['qps', 'QPS']].map(([value, label]) => ({ value, label }))}
                                value={zoomYAxis}
                                onChange={setZoomYAxis}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 md:items-end w-full md:w-auto">
                        <div className="flex flex-wrap items-center gap-4 justify-end">
                            <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5">
                                <button onClick={() => setZoomLogScale(!zoomLogScale)} className={cn('px-2.5 py-1 text-[10px] font-medium rounded-md transition-all cursor-pointer', zoomLogScale ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white')}>Log Scale</button>
                                <div className="h-3 w-px bg-slate-700" />
                                <button onClick={() => setZoomPerChip(!zoomPerChip)} className={cn('px-2.5 py-1 text-[10px] font-medium rounded-md transition-all cursor-pointer', zoomPerChip ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white')} title="Normalize per Chip">Per Chip</button>
                            </div>

                            <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5">
                                {['P50', 'P90', 'P99'].map(p => (
                                    <button key={p} onClick={() => togglePercentile(p)} className={cn('px-2.5 py-1 text-[10px] font-medium rounded-md transition-all cursor-pointer', visiblePercentiles.includes(p) ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white')}>{p}</button>
                                ))}
                            </div>

                            <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 px-3 py-1 rounded-lg">
                                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Cap:</span>
                                <input type="range" min={100} max={zoomXMax || 200000} step={100} value={zoomXMax || 200000} onChange={(e) => setZoomXMax(Number(e.target.value))} className="w-28 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400" />
                                <input type="number" value={zoomXMax || ''} onChange={(e) => setZoomXMax(Number(e.target.value))} className="w-16 bg-transparent text-[10px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 rounded px-1 text-right font-mono font-bold transition-all" />
                                <span className="text-[9px] text-slate-500 font-mono font-bold">ms</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-slate-950/30 rounded-xl p-4 border border-slate-800/40 m-4 flex flex-col flex-1 select-none">
                <div className="relative w-full h-[380px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                            <CartesianGrid {...gridProps()} opacity={0.4} />
                            <ChartXAxis dataKey="x" type="number" name={zoomXAxis.toUpperCase()} label={xAxisLabel} domain={['auto', 'auto']} scale={zoomLogScale ? 'log' : 'auto'} />
                            <ChartYAxis dataKey="y" type="number" name="Throughput" label={yAxisLabel} domain={['auto', 'auto']} />
                            <Tooltip
                                content={<RichAgentWorkloadTooltip metadata={metadata} />}
                                wrapperStyle={{ outline: 'none', zIndex: 100 }}
                                cursor={{ stroke: getChartTheme().tick, strokeWidth: 1, strokeDasharray: '4 4' }}
                            />
                            {buildChartLines.map(line => (
                                <Scatter
                                    key={line.id}
                                    name={line.name}
                                    data={zoomXMax ? line.data.filter(pt => pt.x <= zoomXMax) : line.data}
                                    fill={line.color}
                                    line={{ stroke: line.color, strokeWidth: line.id.includes('-p50') ? 3 : 2, strokeDasharray: line.dash === 'none' ? undefined : line.dash }}
                                    isAnimationActive={false}
                                />
                            ))}
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>

                <div className="mt-4 border-t border-slate-700/50 pt-3 px-2">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Legend</h4>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-3">
                        {SCENARIOS.map((s) => activeTiers[s.id] && !s.comingSoon && (
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
    );

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center pt-16 md:pl-24 w-full font-sans relative overflow-hidden bg-[radial-gradient(#334155_1.2px,transparent_1.2px)] bg-[size:24px_24px] bg-repeat">
            {/* Pulsing Vibrant Neon Glow Background Shapes */}
            <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-blue-600/25 rounded-full blur-3xl pointer-events-none animate-pulse" />
            <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-emerald-600/25 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />

            <WellLitHeader
                pageTitle="Agentic serving"
                onNavigateBack={onNavigateBack}
                onToggleMobileNav={onToggleMobileNav}
            />

            <main className="w-full max-w-7xl px-6 py-8 flex flex-col space-y-6 z-10 relative">

                <div className="relative overflow-hidden border border-slate-800/80 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-slate-950/90 p-5 shadow-2xl backdrop-blur-xl group transition-all duration-500 hover:border-amber-500/30">
                    <div className="absolute -top-24 -right-24 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl group-hover:bg-amber-500/20 transition-all duration-700 pointer-events-none" />

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
                        <div className="flex flex-col justify-between space-y-3">
                            <div>
                                <div className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-widest mb-2">Overview</div>
                                <p className="text-xs text-slate-300 leading-relaxed">
                                    Analyzes performance for long-context, multi-turn conversations featuring tool-calling delays and prefix-cache dependencies. Plots optimal <strong>llm-d</strong> optimizations (prefix-aware routing, CPU DRAM KV cache offloading, and queue depth load balancing) running <strong>{metadata?.model?.split('/').pop()?.split('-Instruct')[0] || 'Qwen3-Coder-480B-A35B'}</strong> over {metadata?.replicas || 8} {metadata?.accelerator?.toUpperCase() || 'TPU'} replicas.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2 lg:col-span-2">
                            <div className="text-[10px] font-extrabold text-cyan-400/90 uppercase tracking-widest mb-1">
                                Selectable optimizations
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {SCENARIOS.map((s) => (
                                    <button
                                        key={s.id}
                                        onClick={() => !s.comingSoon && setActiveTiers(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                                        className={cn(
                                            'w-full text-left border rounded-lg p-2 flex items-center justify-between transition-all',
                                            s.comingSoon ? 'cursor-not-allowed' : 'cursor-pointer',
                                            activeTiers[s.id] && !s.comingSoon
                                                ? 'bg-slate-900/60'
                                                : 'border-slate-800/50 bg-slate-900/20 opacity-60'
                                        )}
                                        style={{ borderColor: activeTiers[s.id] && !s.comingSoon ? `${SCENARIO_COLORS[s.id]}50` : undefined }}
                                    >
                                        <div>
                                            <div className="text-xs font-semibold text-slate-200">{s.name}</div>
                                            <p className="text-[10px] text-slate-500">{s.description}</p>
                                        </div>
                                        {s.comingSoon ? (
                                            <Badge tone="warning" size="xs">Coming soon</Badge>
                                        ) : activeTiers[s.id] ? (
                                            <span className="text-[9px] border px-1.5 py-0.5 rounded font-sans font-black uppercase tracking-wider select-none" style={{ backgroundColor: `${SCENARIO_COLORS[s.id]}20`, color: SCENARIO_COLORS[s.id], borderColor: `${SCENARIO_COLORS[s.id]}40` }}>Active</span>
                                        ) : (
                                            <Badge tone="neutral" size="xs">Inactive</Badge>
                                        )}
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
                                Benchmark scenario
                            </span>
                            <Button variant="secondary" size="xs" onClick={() => setIsModalOpen(true)} className="font-bold">
                                <Code className="w-3 h-3" /> View configuration
                            </Button>
                        </div>

                        <div className="grid grid-cols-12 gap-2">
                            <div className="flex flex-col gap-3 col-span-4 border-r border-slate-800/60 pr-2">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate">
                                    Infra layer
                                </div>
                                <div className="flex flex-col gap-2 text-xs">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Provider / machine</span>
                                        <span className="font-mono font-bold text-white truncate block flex items-center gap-1">
                                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                            </svg>
                                            tpu7x-standard-8
                                        </span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Accelerator</span>
                                        <span className="font-mono font-bold text-white truncate block">{metadata?.accelerator?.toUpperCase() || 'TPU7x'}</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Replicas</span>
                                        <span className="font-mono font-bold text-white truncate block">{metadata?.replicas || 8}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 col-span-4 border-r border-slate-800/60 pr-2">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate">
                                    Model serving
                                </div>
                                <div className="flex flex-col gap-2 text-xs">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Model name</span>
                                        <span className="font-mono font-bold text-white truncate block" title={metadata?.model || ''}>{metadata?.model?.split('/').pop()?.substring(0, 20) || 'Qwen3-Coder-480B'}...</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Parallelism strategy</span>
                                        <span className="font-mono font-bold text-white truncate block">TP: 8</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Engine</span>
                                        <span className="font-mono font-bold text-white truncate block">vLLM</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 col-span-4">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate">
                                    Workload
                                </div>
                                <div className="flex flex-col gap-2 text-xs">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Test harness</span>
                                        <span className="font-mono font-bold text-white truncate block">inference-perf</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Catalog use case</span>
                                        <button onClick={() => onNavigate?.('workload-catalog')} className="font-mono font-bold text-white hover:text-slate-200 truncate flex items-center gap-1 transition-colors cursor-pointer">
                                            Agentic Code Gen
                                            <ExternalLink className="w-3 h-3 text-slate-400" />
                                        </button>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">I/OSL (Mean)</span>
                                        <span className="font-mono font-bold text-white truncate block">{metadata ? `${Math.round(metadata.inputLengthMean).toLocaleString()} / ${Math.round(metadata.outputLengthMean).toLocaleString()}` : '... / ...'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-3 border border-slate-800 rounded-xl bg-slate-900 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-emerald-500/30 transition-all">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none transition-all group-hover:bg-emerald-500/10" />
                        <div>
                            <div className="text-[11px] font-extrabold text-emerald-400/90 uppercase tracking-widest mb-3 flex justify-between items-center">
                                Primary outcomes {outcomes?.concurrency ? `@ ${outcomes.concurrency} concurrency` : ''}
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
                            <div className="grid grid-cols-1 gap-4 mt-2">
                                <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2.5 hover:border-sky-500/20 transition-all flex justify-between items-center">
                                    <div>
                                        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-0.5 truncate">
                                            Throughput increase
                                        </h3>
                                        <div className="text-[10px] text-slate-500 font-normal truncate">
                                            (total tokens/sec)
                                        </div>
                                    </div>
                                    <h4 className="text-base font-black text-sky-400 font-mono">
                                        {outcomes?.throughput || 'N/A'}
                                    </h4>
                                </div>
                                <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2.5 hover:border-amber-500/20 transition-all flex justify-between items-center">
                                    <div>
                                        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-0.5 truncate">
                                            Latency reduction
                                        </h3>
                                        <div className="text-[10px] text-slate-500 font-normal truncate">
                                            (TTFT P50)
                                        </div>
                                    </div>
                                    <h4 className="text-base font-black text-amber-400 font-mono">
                                        {outcomes?.latency || 'N/A'}
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

                        <a
                            href="https://github.com/llm-d/llm-d/tree/main/guides/agentic-serving"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full mt-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-lg shadow transition-all flex items-center justify-center gap-1.5 truncate cursor-pointer no-underline"
                        >
                            <span>View instructions</span>
                            <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-80" />
                        </a>
                    </div>
                </div>

                <div className="flex flex-col gap-6 w-full">
                    {renderChart('detailed-chart-1', `${yAxisLabel} vs. ${xAxisLabel}`)}
                </div>

                {/* Summary Metrics Table */}
                <Panel
                    id="summary-table"
                    className="bg-slate-900 border-slate-800 shadow-xl flex flex-col"
                    title={
                        <span className="block">
                            <span className="block text-md font-bold">Summary metrics comparison</span>
                            <span className="block text-xs text-slate-500 font-normal">Comparing Reference configuration vs. Combined Optimizations side-by-side across concurrency levels.</span>
                        </span>
                    }
                    actions={
                        <>
                            <Button variant="secondary" size="sm" onClick={() => setShowTableFilters(!showTableFilters)} className="uppercase tracking-widest text-[10px] font-extrabold">
                                Filters
                                {showTableFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={exportToCSV}>
                                Export CSV
                            </Button>
                        </>
                    }
                >
                    {showTableFilters && (
                        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Latency:</span>
                                <ToggleGroup
                                    size="xs"
                                    options={['ntpot', 'tpot', 'ttft', 'itl', 'e2e'].map((mode) => ({ value: mode, label: mode.toUpperCase() }))}
                                    value={tableMetricMode}
                                    onChange={setTableMetricMode}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Percentile:</span>
                                <ToggleGroup
                                    size="xs"
                                    options={['P50', 'P90', 'P99'].map((p) => ({ value: p, label: p }))}
                                    value={selectedPercentile}
                                    onChange={setSelectedPercentile}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Throughput:</span>
                                <ToggleGroup
                                    size="xs"
                                    options={[['output', 'Output'], ['input', 'Input'], ['total', 'Total'], ['qps', 'QPS']].map(([value, label]) => ({ value, label }))}
                                    value={tableThroughputMode}
                                    onChange={setTableThroughputMode}
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-auto rounded-lg border border-slate-800">
                        <table className="w-full text-xs text-left text-slate-300">
                            <thead className="text-[10px] font-extrabold text-white uppercase tracking-widest bg-slate-950 border-b border-slate-800">
                                <tr>
                                    <th rowSpan="2" className="px-3 py-2 border-r border-slate-800 w-24 align-bottom">Concurrency</th>
                                    <th colSpan="2" className="px-3 py-1.5 border-r border-slate-800 text-center border-b border-slate-700/50 text-orange-400/80">Reference</th>
                                    <th colSpan="2" className="px-3 py-1.5 border-r border-slate-800 text-center border-b border-slate-700/50 text-cyan-400/80">Combined Optimizations</th>
                                    <th colSpan="2" className="px-3 py-1.5 text-center border-b border-slate-700/50 text-emerald-400/80">Delta</th>
                                </tr>
                                <tr>
                                    <th className="px-3 py-1.5 border-r border-slate-800/50 text-[9px]">{tableMetricMode.toUpperCase()} {selectedPercentile}</th>
                                    <th className="px-3 py-1.5 border-r border-slate-800 text-[9px]">Throughput</th>
                                    <th className="px-3 py-1.5 border-r border-slate-800/50 text-[9px]">{tableMetricMode.toUpperCase()} {selectedPercentile}</th>
                                    <th className="px-3 py-1.5 border-r border-slate-800 text-[9px]">Throughput</th>
                                    <th className="px-3 py-1.5 border-r border-slate-800/50 text-[9px] text-center">Latency</th>
                                    <th className="px-3 py-1.5 text-[9px] text-center">Throughput</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/80 font-mono">
                                {tableRows.map((row, rIdx) => (
                                    <tr
                                        key={rIdx}
                                        onClick={() => setSelectedConcurrency(row.concurrency)}
                                        className={cn(
                                            'hover:bg-slate-800/20 transition-colors cursor-pointer',
                                            row.isCurrent && 'bg-slate-800/70 font-bold'
                                        )}
                                    >
                                        <td className="px-3 py-2.5 border-r border-slate-800 font-bold text-white font-sans flex items-center gap-2">
                                            <span>{row.concurrency}</span>
                                            {row.isCurrent && <Badge tone="info" size="xs" className="font-sans">Active</Badge>}
                                        </td>
                                        <td className="px-3 py-2.5 border-r border-slate-800/50 text-slate-400">
                                            {row.refVal > 0 ? `${row.refVal.toFixed(1)} ms` : 'N/A'}
                                        </td>
                                        <td className="px-3 py-2.5 border-r border-slate-800 text-slate-400">
                                            {row.refThroughput > 0 ? `${row.refThroughput.toFixed(0)} ${tableThroughputMode === 'qps' ? 'qps' : 'tok/s'}` : 'N/A'}
                                        </td>
                                        <td className="px-3 py-2.5 border-r border-slate-800/50 text-cyan-400 font-bold">
                                            {row.optVal > 0 ? `${row.optVal.toFixed(1)} ms` : 'N/A'}
                                        </td>
                                        <td className="px-3 py-2.5 border-r border-slate-800 text-cyan-400 font-bold">
                                            {row.optThroughput > 0 ? `${row.optThroughput.toFixed(0)} ${tableThroughputMode === 'qps' ? 'qps' : 'tok/s'}` : 'N/A'}
                                        </td>
                                        <td className={cn('px-3 py-2.5 border-r border-slate-800/50 text-center font-bold', row.latencyGain > 0 ? 'text-emerald-400' : 'text-red-400')}>
                                            {row.latencyGain !== 0 ? `${row.latencyGain > 0 ? '-' : '+'}${Math.abs(row.latencyGain).toFixed(1)}%` : 'N/A'}
                                        </td>
                                        <td className={cn('px-3 py-2.5 text-center font-bold', row.throughputGain > 0 ? 'text-emerald-400' : 'text-red-400')}>
                                            {row.throughputGain !== 0 ? `${row.throughputGain > 0 ? '+' : ''}${row.throughputGain.toFixed(1)}%` : 'N/A'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            </main>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                closeOnBackdrop={false}
                closeOnEscape={false}
                size="lg"
                className="max-w-3xl"
                title={
                    <span className="flex items-center">
                        <span className="p-2 bg-cyan-500/20 text-cyan-400 rounded-lg mr-3 inline-flex">
                            <Code className="w-5 h-5" />
                        </span>
                        <span>
                            <span className="block text-base font-bold">Benchmark test configuration</span>
                            <span className="block text-[10px] text-slate-400 mt-0.5 font-normal">View and copy the exact recipes used for this workload replay.</span>
                        </span>
                    </span>
                }
                footer={
                    <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
                        Close
                    </Button>
                }
            >
                <div className="flex border-b border-slate-800 bg-slate-900/60 px-6 pt-2 gap-1 overflow-x-auto no-scrollbar">
                    {['Model server flags', 'K8s manifest', 'Traffic YAML', 'Raw benchmark JSON'].map((tab, idx) => (
                        <button
                            key={idx}
                            onClick={() => setActiveRecipeTab(idx)}
                            className={cn(
                                'px-4 py-2 text-xs font-bold border-b-2 transition-all shrink-0 cursor-pointer',
                                activeRecipeTab === idx
                                    ? 'border-cyan-500 text-cyan-400'
                                    : 'border-transparent text-slate-400 hover:text-slate-200'
                            )}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                <div className="p-6 flex-1 overflow-y-auto bg-slate-950 font-mono text-[10px] text-slate-300 relative">
                    {activeRecipeTab === 0 && (
                        <>
                            <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => handleCopy(RECIPE_VLLM, 'vllm')}
                                className="absolute top-4 right-4"
                            >
                                {copiedStates['vllm'] ? <Check className="w-3 h-3 text-emerald-400" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
                                <span className="text-[9px] font-bold">{copiedStates['vllm'] ? 'Copied!' : 'Copy code'}</span>
                            </Button>
                            <pre className="whitespace-pre-wrap">{RECIPE_VLLM}</pre>
                        </>
                    )}
                    {activeRecipeTab === 1 && (
                        <>
                            <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => handleCopy(RECIPE_K8S, 'k8s')}
                                className="absolute top-4 right-4"
                            >
                                {copiedStates['k8s'] ? <Check className="w-3 h-3 text-emerald-400" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
                                <span className="text-[9px] font-bold">{copiedStates['k8s'] ? 'Copied!' : 'Copy code'}</span>
                            </Button>
                            <pre className="whitespace-pre-wrap">{RECIPE_K8S}</pre>
                        </>
                    )}
                    {activeRecipeTab === 2 && (
                        <>
                            <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => handleCopy(RECIPE_TRAFFIC, 'traffic')}
                                className="absolute top-4 right-4"
                            >
                                {copiedStates['traffic'] ? <Check className="w-3 h-3 text-emerald-400" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
                                <span className="text-[9px] font-bold">{copiedStates['traffic'] ? 'Copied!' : 'Copy code'}</span>
                            </Button>
                            <pre className="whitespace-pre-wrap">{RECIPE_TRAFFIC}</pre>
                        </>
                    )}
                    {activeRecipeTab === 3 && (
                        <>
                            <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => {
                                    const jsonData = {};
                                    data.forEach(d => {
                                        const key = `${d.scenario}_c${d.concurrency}`;
                                        jsonData[key] = {
                                            scenario: d.scenario,
                                            concurrency: d.concurrency,
                                            throughput: d.throughput,
                                            ttft_p50_ms: d.ttft.p50,
                                            tpot_p50_ms: d.tpot.p50,
                                        };
                                    });
                                    handleCopy(JSON.stringify(jsonData, null, 2), 'json');
                                }}
                                className="absolute top-4 right-4"
                            >
                                {copiedStates['json'] ? <Check className="w-3 h-3 text-emerald-400" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
                                <span className="text-[9px] font-bold">{copiedStates['json'] ? 'Copied!' : 'Copy JSON'}</span>
                            </Button>
                            <pre className="whitespace-pre-wrap">
                                {JSON.stringify(
                                    Object.fromEntries(data.map(d => [
                                        `${d.scenario}_c${d.concurrency}`,
                                        { scenario: d.scenario, concurrency: d.concurrency, throughput: d.throughput, ttft_p50_ms: d.ttft.p50, tpot_p50_ms: d.tpot.p50 }
                                    ])),
                                    null, 2
                                )}
                            </pre>
                        </>
                    )}
                </div>
            </Modal>
        </div>
    );
}
