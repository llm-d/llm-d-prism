import React, { useState, useEffect } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    ScatterChart, Scatter, ComposedChart, ZAxis, Label, ReferenceArea, ReferenceLine
} from 'recharts';
import { Zap, Download, Copy, Check, Info, ArrowLeft, ExternalLink, Settings, ShieldAlert, Cpu, Cloud, Server, Bell, Slack, ChevronDown, Share2, Eye, Maximize2, ArrowDown, X, MessageCircle, Menu } from 'lucide-react';
import { scanInferenceScheduling } from '../utils/gcsScanner';

const RAW_GEMMA_DATA = [
    {
        qps: 1,
        baseline_ttft_p50: 224, baseline_ttft_p90: 248, baseline_ttft_p99: 342,
        baseline_itl_p50: 25.27, baseline_itl_p90: 26.12, baseline_itl_p99: 99.35,
        baseline_tput: 2645,
        optimal_ttft_p50: 271, optimal_ttft_p90: 290, optimal_ttft_p99: 453,
        optimal_itl_p50: 17.49, optimal_itl_p90: 18.54, optimal_itl_p99: 40.10,
        optimal_tput: 2443,
    },
    {
        qps: 5,
        baseline_ttft_p50: 251, baseline_ttft_p90: 3056, baseline_ttft_p99: 6954,
        baseline_itl_p50: 30.12, baseline_itl_p90: 31.25, baseline_itl_p99: 221,
        baseline_tput: 12642,
        optimal_ttft_p50: 280, optimal_ttft_p90: 493, optimal_ttft_p99: 854,
        optimal_itl_p50: 22.53, optimal_itl_p90: 25.50, optimal_itl_p99: 204.63,
        optimal_tput: 12152,
    },
    {
        qps: 8,
        optimal_ttft_p50: 363, optimal_ttft_p90: 863, optimal_ttft_p99: 1409,
        optimal_itl_p50: 29.74, optimal_itl_p90: 198.34, optimal_itl_p99: 437.64,
        optimal_tput: 19328,
    },
    {
        qps: 12,
        optimal_ttft_p50: 37755, optimal_ttft_p90: 77616, optimal_ttft_p99: 89565,
        optimal_itl_p50: 46.95, optimal_itl_p90: 263.23, optimal_itl_p99: 493.96,
        optimal_tput: 22208,
    }
];

const SCATTER_DATA_BASELINE = Array.from({ length: 60 }).map((_, i) => ({
    req_id: i + 1,
    ttft: Math.random() > 0.4 ? 500 + Math.random() * 6500 : 500 + Math.random() * 1000
}));

const SCATTER_DATA_OPTIMAL = Array.from({ length: 60 }).map((_, i) => ({
    req_id: i + 1,
    ttft: 280 + Math.random() * 40
}));

const SCATTER_DATA_OPTIMAL_SHIFTED = Array.from({ length: 60 }).map((_, i) => ({
    req_id: i + 1,
    ttft: 400 + Math.random() * 80
}));


const HISTORICAL_DATA = Array.from({ length: 30 }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    
    let cacheHitTTFT = 280 + Math.random() * 40;
    if (i > 12 && i < 16) {
        cacheHitTTFT += 200 + Math.random() * 150; 
    }
    
    return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        optimal_ttft_p99: cacheHitTTFT,
        baseline_ttft_p99: 6800 + Math.random() * 500,
    };
});


const CustomScatterTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        const isOptimal = payload[0].name.includes("Optimal");
        const version = isOptimal ? "Commit: 4a9f21 (v1.3.0-igw)" : "Commit: d8b3c1 (v1.2.0)";
        const outcome = isOptimal ? "Cache Hit" : "Cache Miss";
        
        return (
            <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl font-mono text-xs z-[100]">
                <p className="font-bold text-white mb-1">Request #{data.req_id} <span className={isOptimal ? "text-emerald-400" : "text-slate-400"}>({outcome})</span></p>
                <p className="text-slate-300">TTFT: <span className="font-semibold text-white">{Math.round(data.ttft)}ms</span></p>
                <p className="text-slate-500 mt-2 pt-2 border-t border-slate-800 flex items-center">
                    <Zap className={`w-3 h-3 mr-1 ${isOptimal ? "text-emerald-500" : "text-slate-500"}`} /> {version}
                </p>
            </div>
        );
    }
    return null;
};

const CustomTputTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length >= 2) {
        // Find optimal & baseline by their name or datakey
        const optimal = payload.find(p => p.dataKey === 'optimal_tput')?.value || 0;
        const baseline = payload.find(p => p.dataKey === 'baseline_tput')?.value || 0;
        const speedup = ((optimal - baseline) / baseline) * 100;
        
        return (
            <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl font-mono text-xs z-[100]">
                <p className="font-bold text-white mb-1">QPS: {label}</p>
                <div className="space-y-1">
                    <p className="text-slate-300">standard Kubernetes service: <span className="font-semibold text-white">{Math.round(baseline)}</span></p>
                    <p className="text-emerald-400">Optimal: <span className="font-semibold text-white">{Math.round(optimal)}</span></p>
                </div>
                {speedup > 0 && (
                    <p className="text-cyan-400 mt-2 pt-2 border-t border-slate-800 flex items-center">
                        <Zap className="w-3 h-3 mr-1 text-cyan-500" /> +{Math.round(speedup)}% speedup
                    </p>
                )}
            </div>
        );
    }
    return null;
};

// Interactive Bell Label for SLA Threshold
const CustomReferenceLabel = (props) => {
    const { viewBox, value, onClickAlert } = props;
    return (
        <g onClick={onClickAlert} className="cursor-pointer group">
            <text x={viewBox.x + 10} y={viewBox.y - 12} fill="#34d399" fontSize="11" fontWeight="bold">
                {value}
            </text>
            <rect x={viewBox.x} y={viewBox.y - 30} width="160" height="30" fill="transparent" />
            <g className="opacity-60 group-hover:opacity-100 transition-opacity">
                <circle cx={viewBox.x + 125} cy={viewBox.y - 15} r="10" fill="#0f172a" stroke="#334155" />
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="#94a3b8" strokeWidth="2" fill="none" transform="translate(115, -23) scale(0.8)" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="#94a3b8" strokeWidth="2" fill="none" transform="translate(115, -23) scale(0.8)" strokeLinecap="round" strokeLinejoin="round"/>
            </g>
        </g>
    );
};

const RichSchedulingTooltip = ({ active, payload, zoomXAxis, zoomYAxis }) => {
    if (!active || !payload || !payload.length) return null;
    
    const pl = payload[0].payload;
    const hw = pl.hardware || 'H100';
    const model = pl.model_name || 'Model';
    const qpsVal = pl.qps ?? pl.y ?? 'N/A';
    
    const xLabelMap = { tpot: 'TPOT', ntpot: 'NTPOT', ttft: 'TTFT', itl: 'ITL', tokens_sec: 'Tokens/sec', e2e: 'E2E' };
    const yLabelMap = { output: 'Out Tok/s', input: 'In Tok/s', total: 'Tot Tok/s', qps: 'QPS', cost: 'Cost' };
    
    const xLabel = xLabelMap[zoomXAxis] || 'X';
    const yLabel = yLabelMap[zoomYAxis] || 'Y';

    return (
        <div className="bg-slate-900/95 border border-slate-700/50 rounded-lg shadow-xl p-3 min-w-[220px] backdrop-blur-md text-slate-100 z-[100]">
            {/* Unified Shared Context Header */}
            <div className="border-b border-slate-200 dark:border-slate-700/60 pb-1.5 mb-1.5">
                <div className="text-[11px] font-mono text-slate-400 leading-tight">
                    {hw} • {model}
                </div>
                <div className="text-xs font-bold text-white mt-1">
                    QPS: {qpsVal}
                </div>
                {pl.interpolated && (
                    <div className="text-[10px] text-amber-500 font-mono mt-0.5">
                        (Interpolated Curve)
                    </div>
                )}
            </div>

            {/* Series Values List */}
            <div className="space-y-3">
                {(() => {
                    const groups = {
                        'Standard Kubernetes [STD]': [],
                        'Approx. prefix aware routing [BENCH]': [],
                        'Other': []
                    };

                    payload.forEach(entry => {
                        if (entry.name.includes('Standard Kubernetes') || entry.name.includes('Baseline')) {
                            groups['Standard Kubernetes [STD]'].push(entry);
                        } else if (entry.name.includes('Prefix-aware') || entry.name.includes('Router')) {
                            groups['Approx. prefix aware routing [BENCH]'].push(entry);
                        } else {
                            groups['Other'].push(entry);
                        }
                    });

                    return Object.entries(groups).map(([groupName, items]) => {
                        if (items.length === 0) return null;

                        return (
                            <div key={groupName} className="space-y-1">
                                {groupName !== 'Other' && (
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-0.5 mb-1 flex items-center justify-between">
                                        <span>{groupName.split(' [')[0]}</span>
                                    </div>
                                )}
                                {items.map((entry, index) => {
                                    const epl = entry.payload;
                                    const xVal = epl.dynamic_x ?? epl.x;
                                    const yVal = epl.dynamic_y ?? epl.y;
                                    
                                    let label = entry.name;
                                    if (groupName !== 'Other') {
                                        label = label.replace('Standard Kubernetes ', '').replace('Approx. prefix aware routing ', '').replace('Baseline ', '').replace('Router ', '');
                                    }

                                    return (
                                        <div key={index} className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-950" style={{ backgroundColor: entry.stroke || entry.fill }} />
                                                <span className="text-[11px] text-slate-200 font-medium">{label}</span>
                                            </div>
                                            <span className="text-[11px] font-mono font-bold text-white">
                                                {xVal !== undefined && yVal !== undefined ? (
                                                    `${xLabel}: ${typeof xVal === 'number' ? xVal.toFixed(1) : xVal} | ${yLabel}: ${typeof yVal === 'number' ? yVal.toFixed(1) : yVal}`
                                                ) : (
                                                    `${Number(entry.value ?? xVal).toFixed(1)} ${entry.name.includes('Rate') ? 'tokens/s' : 'ms'}`
                                                )}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    });
                })()}
            </div>
        </div>
    );
};

const PercentileGroupedLegend = ({ payload }) => {
    if (!payload || !payload.length) return null;

    // Filter out duplicate entries from Line components
    const filteredPayload = payload.filter(entry => !['dynamic_y', 'input', 'output', 'total', 'qps'].includes(entry.value));

    // Group entries by variant
    const baselineItems = filteredPayload.filter(e => e.value.includes('Standard Kubernetes'));
    const routerItems = filteredPayload.filter(e => e.value.includes('Approx. prefix aware routing'));

    const renderItem = (entry, index) => {
        let dashArray = "0";
        if (entry.value.includes('P90')) dashArray = "5 5";
        else if (entry.value.includes('P99')) dashArray = "2 2";

        return (
            <div key={index} className="flex items-center gap-1.5 cursor-pointer group w-max" onClick={entry.onClick}>
                <svg width="16" height="4" className="shrink-0">
                    <line x1="0" y1="2" x2="16" y2="2" stroke={entry.color} strokeWidth="2" strokeDasharray={dashArray} />
                </svg>
                <span className="text-slate-300 font-medium group-hover:text-white transition-colors">{entry.value}</span>
            </div>
        );
    };

    return (
        <div className="w-full flex flex-col gap-2 border-t border-slate-800/60 pt-2 mt-2 px-4 text-[11px]">
            {routerItems.length > 0 && (
                <div className="flex items-center justify-center gap-4 flex-wrap">
                    {routerItems.map(renderItem)}
                </div>
            )}
            {baselineItems.length > 0 && (
                <div className="flex items-center justify-center gap-4 flex-wrap">
                    {baselineItems.map(renderItem)}
                </div>
            )}
        </div>
    );
};

const Milestone1Dashboard = ({ onNavigateBack, onNavigate, onToggleMobileNav }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [gcsData, setGcsData] = useState([]);
    const [reportsMeta, setReportsMeta] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const reports = await scanInferenceScheduling();
            
            const grouped = {};
            reports.forEach(r => {
                const q = parseFloat(r.qps.toFixed(2));
                if (!grouped[q]) {
                    grouped[q] = { qps: q };
                }
                const prefix = r.scenario === 'k8s-service-baseline' ? 'baseline' : 'router';
                grouped[q][`${prefix}_output_token_rate`] = parseFloat(r.output_token_rate.toFixed(2));
                grouped[q][`${prefix}_ttft_p50`] = parseFloat(r.ttft.p50.toFixed(2));
                grouped[q][`${prefix}_ttft_p90`] = parseFloat(r.ttft.p90.toFixed(2));
                grouped[q][`${prefix}_ttft_p99`] = parseFloat(r.ttft.p99.toFixed(2));
                grouped[q][`${prefix}_tpot_p50`] = parseFloat(r.tpot.p50.toFixed(2));
                grouped[q][`${prefix}_tpot_p90`] = parseFloat(r.tpot.p90.toFixed(2));
                grouped[q][`${prefix}_tpot_p99`] = parseFloat(r.tpot.p99.toFixed(2));
                grouped[q][`${prefix}_itl_p50`] = parseFloat(r.itl.p50.toFixed(2));
                grouped[q][`${prefix}_itl_p90`] = parseFloat(r.itl.p90.toFixed(2));
                grouped[q][`${prefix}_itl_p99`] = parseFloat(r.itl.p99.toFixed(2));
            });
            const denseData = Object.values(grouped).sort((a, b) => a.qps - b.qps);
            
            setGcsData(denseData);
            if (reports && reports.length > 0) {
                setReportsMeta(reports[0]);
            }
            setLoading(false);
        };
        fetchData();
    }, []);

    const [copied, setCopied] = useState(false);
    const [timeHorizon, setTimeHorizon] = useState('snapshot');
    const [targetQps, setTargetQps] = useState(5);
    
    const [provider, setProvider] = useState('GCP');
    const [hardware, setHardware] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('hw') || '4x H100 80GB';
    });
    const [showFullProfile, setShowFullProfile] = useState(false);
    const [shareToast, setShareToast] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    const [perfMultiplier, setPerfMultiplier] = useState(1.0);

    const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
    const [alertSaved, setAlertSaved] = useState(false);

    const [latencyScale, setLatencyScale] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('scale') || 'linear';
    });
    const [ttftHistory, setTtftHistory] = useState('snapshot');
    const [itlScale, setItlScale] = useState('linear');
    const [itlHistory, setItlHistory] = useState('snapshot');
    const [tputDisplay, setTputDisplay] = useState('tput_sec');
    const [xUnit, setXUnit] = useState('qps');
    const [hiddenSeries, setHiddenSeries] = useState([]);
    const [zoomedChart, setZoomedChart] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'qps', direction: 'asc' });
    const [tableMetricMode, setTableMetricMode] = useState('ttft');
    const [selectedPercentile, setSelectedPercentile] = useState('P50');
    const [expandedRow, setExpandedRow] = useState(null);
    const [zoomYAxis, setZoomYAxis] = useState('output');
    const [zoomXAxis, setZoomXAxis] = useState('tpot');
    const [zoomCostMode, setZoomCostMode] = useState('spot');
    const [zoomPerChip, setZoomPerChip] = useState(false);
    const [zoomLogScale, setZoomLogScale] = useState(false);
    const [zoomShowPareto, setZoomShowPareto] = useState(false);
    const [zoomXMax, setZoomXMax] = useState(Infinity);
    const [zoomColorMode, setZoomColorMode] = useState('hardware');
    const [zoomViewMode, setZoomViewMode] = useState('standard');
    const [visiblePercentiles, setVisiblePercentiles] = useState(['p50', 'p90', 'p99']);

    const exportToCSV = () => {
        const headers = ['QPS', 'Standard P50 (ms)', 'Prefix-aware P50 (ms)', 'Standard P99 (ms)', 'Prefix-aware P99 (ms)', 'Difference (%)'];
        const rows = tableData.map(row => {
            const base50 = tableMetricMode === 'ttft' ? (row.baseline_ttft_p50 || 0) : (row.baseline_itl_p50 || 0);
            const opt50 = tableMetricMode === 'ttft' ? (row.router_ttft_p50 || 0) : (row.router_itl_p50 || 0);
            const base99 = tableMetricMode === 'ttft' ? (row.baseline_ttft_p99 || 0) : (row.baseline_itl_p99 || 0);
            const opt99 = tableMetricMode === 'ttft' ? (row.router_ttft_p99 || 0) : (row.router_itl_p99 || 0);
            const gain99 = base99 && opt99 ? ((base99 - opt99) / base99) * 100 : 0;
            return [row.qps, Math.round(base50), Math.round(opt50), Math.round(base99), Math.round(opt99), Math.round(gain99)].join(',');
        });
        
        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `prism_cost_efficiency_${tableMetricMode}_report.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const openZoom = (id) => {
        setZoomLogScale(false);
        setZoomPerChip(false);
        setZoomXMax(Infinity);
        setZoomCostMode('spot');
        setZoomColorMode('default');
        setZoomViewMode('explore');
        
        if (id === 1) { setZoomXAxis('ttft'); setZoomYAxis('output'); }
        else if (id === 2) { setZoomXAxis('ttft'); setZoomYAxis('input'); }
        else if (id === 3) { setZoomXAxis('tpot'); setZoomYAxis('output'); }
        else if (id === 4) { setZoomXAxis('ttft'); setZoomYAxis('total'); }
        else if (id === 5) { setZoomXAxis('ttft'); setZoomYAxis('qps'); }
        else if (id === 6) { setZoomXAxis('tpot'); setZoomYAxis('input'); }
        else if (id === 7) { setZoomXAxis('qps'); setZoomYAxis('input'); }
        else if (id === 8) { setZoomXAxis('qps'); setZoomYAxis('output'); }
        
        setZoomedChart(id);
    };
    const handleLegendClick = (e) => {
        const { value } = e;
        setHiddenSeries(prev => 
            prev.includes(value) 
                ? prev.filter(v => v !== value) 
                : [...prev, value]
        );
    };
        const ttftData = React.useMemo(() => {
        const getSeries = (prefix, percentile) => {
            return gcsData
                .filter(d => d[`${prefix}_ttft_${percentile}`] !== undefined)
                .map(d => ({
                    x: d[`${prefix}_ttft_${percentile}`],
                    y: d[xUnit]
                }))
                .sort((a, b) => a.x - b.x);
        };
        return {
            baseline_p50: getSeries('baseline', 'p50'),
            baseline_p90: getSeries('baseline', 'p90'),
            baseline_p99: getSeries('baseline', 'p99'),
            router_p50: getSeries('router', 'p50'),
            router_p90: getSeries('router', 'p90'),
            router_p99: getSeries('router', 'p99'),
        };
    }, [gcsData, xUnit]);

    const tpotData = React.useMemo(() => {
        const getSeries = (prefix, percentile) => {
            return gcsData
                .filter(d => d[`${prefix}_tpot_${percentile}`] !== undefined)
                .map(d => ({
                    x: d[`${prefix}_tpot_${percentile}`],
                    y: d[xUnit]
                }))
                .sort((a, b) => a.x - b.x);
        };
        return {
            baseline_p50: getSeries('baseline', 'p50'),
            baseline_p90: getSeries('baseline', 'p90'),
            baseline_p99: getSeries('baseline', 'p99'),
            router_p50: getSeries('router', 'p50'),
            router_p90: getSeries('router', 'p90'),
            router_p99: getSeries('router', 'p99'),
        };
    }, [gcsData, xUnit]);

    const additionalChartData = React.useMemo(() => {
        return gcsData.map(d => {
            // Only compute input rate if the point belongs to that series
            const baseline_input_token_rate = d.baseline_ttft_p50 !== undefined ? d.qps * 512 : null;
            const router_input_token_rate = d.router_ttft_p50 !== undefined ? d.qps * 512 : null;
            
            const b_out = d.baseline_output_token_rate ?? null;
            const r_out = d.router_output_token_rate ?? null;
            
            return {
                ...d,
                baseline_input_token_rate,
                router_input_token_rate,
                baseline_output_token_rate: b_out,
                router_output_token_rate: r_out,
                baseline_total_token_rate: baseline_input_token_rate ? baseline_input_token_rate + (b_out || 0) : null,
                router_total_token_rate: router_input_token_rate ? router_input_token_rate + (r_out || 0) : null
            };
        }).sort((a, b) => a.qps - b.qps);
    }, [gcsData]);
    const scatterData = React.useMemo(() => {
        const routerPoints = gcsData.filter(d => d.router_ttft_p50 !== undefined);
        const baselinePoints = gcsData.filter(d => d.baseline_ttft_p50 !== undefined);
        
        const pKey = selectedPercentile.toLowerCase();
        
        const baseMapped = baselinePoints.map(d => ({
            qps: d.qps,
            ttft: d[`baseline_ttft_${pKey}`],
            tpot: d[`baseline_tpot_${pKey}`],
            input: d.qps * 512,
            output: d.baseline_output_token_rate,
            total: (d.qps * 512) + (d.baseline_output_token_rate || 0)
        }));
        
        const routerMapped = routerPoints.map(d => ({
            qps: d.qps,
            ttft: d[`router_ttft_${pKey}`],
            tpot: d[`router_tpot_${pKey}`],
            input: d.qps * 512,
            output: d.router_output_token_rate,
            total: (d.qps * 512) + (d.router_output_token_rate || 0)
        }));
        
        return {
            ttft_baseline: [...baseMapped].sort((a, b) => a.ttft - b.ttft),
            ttft_router: [...routerMapped].sort((a, b) => a.ttft - b.ttft),
            tpot_baseline: [...baseMapped].sort((a, b) => a.tpot - b.tpot),
            tpot_router: [...routerMapped].sort((a, b) => a.tpot - b.tpot),
            qps_baseline: [...baseMapped].sort((a, b) => a.qps - b.qps),
            qps_router: [...routerMapped].sort((a, b) => a.qps - b.qps)
        };
    }, [gcsData, selectedPercentile]);

    const tableData = React.useMemo(() => {
        const routerPoints = gcsData.filter(d => d.router_ttft_p50 !== undefined);
        const baselinePoints = gcsData.filter(d => d.baseline_ttft_p50 !== undefined).sort((a, b) => a.qps - b.qps);
        
        const interpolate = (x, points, key) => {
            if (points.length === 0) return { value: null, interpolated: false };
            
            // Find exact match (within small tolerance)
            const exact = points.find(p => Math.abs(p.qps - x) < 0.1);
            if (exact) return { value: exact[key], interpolated: false };
            
            // Find surrounding points
            let lower = null;
            let upper = null;
            for (let i = 0; i < points.length; i++) {
                if (points[i].qps < x) {
                    lower = points[i];
                }
                if (points[i].qps > x) {
                    upper = points[i];
                    break;
                }
            }
            
            if (!lower && !upper) return { value: null, interpolated: false };
            if (!lower) return { value: upper[key], interpolated: true }; // Extrapolation
            if (!upper) return { value: lower[key], interpolated: true }; // Extrapolation
            
            const ratio = (x - lower.qps) / (upper.qps - lower.qps);
            const val = lower[key] + ratio * (upper[key] - lower[key]);
            return { value: val, interpolated: true };
        };

        return routerPoints.map(rp => {
            const qps = rp.qps;
            const ttft99Result = interpolate(qps, baselinePoints, 'baseline_ttft_p99');
            const itl99Result = interpolate(qps, baselinePoints, 'baseline_itl_p99');
            const ttft90Result = interpolate(qps, baselinePoints, 'baseline_ttft_p90');
            const itl90Result = interpolate(qps, baselinePoints, 'baseline_itl_p90');
            const ttft50Result = interpolate(qps, baselinePoints, 'baseline_ttft_p50');
            const itl50Result = interpolate(qps, baselinePoints, 'baseline_itl_p50');
            
            return {
                qps: Math.round(qps * 10) / 10,
                router_ttft_p99: rp.router_ttft_p99,
                router_itl_p99: rp.router_itl_p99,
                router_ttft_p90: rp.router_ttft_p90,
                router_itl_p90: rp.router_itl_p90,
                router_ttft_p50: rp.router_ttft_p50,
                router_itl_p50: rp.router_itl_p50,
                baseline_ttft_p99: ttft99Result.value,
                baseline_ttft_p99_interpolated: ttft99Result.interpolated,
                baseline_itl_p99: itl99Result.value,
                baseline_itl_p99_interpolated: itl99Result.interpolated,
                baseline_ttft_p90: ttft90Result.value,
                baseline_ttft_p90_interpolated: ttft90Result.interpolated,
                baseline_itl_p90: itl90Result.value,
                baseline_itl_p90_interpolated: itl90Result.interpolated,
                baseline_ttft_p50: ttft50Result.value,
                baseline_ttft_p50_interpolated: ttft50Result.interpolated,
                baseline_itl_p50: itl50Result.value,
                baseline_itl_p50_interpolated: itl50Result.interpolated
            };
        }).sort((a, b) => a.qps - b.qps);
    }, [gcsData]);

    const handleCopyHelm = () => {
        const cmd = `helm upgrade prism-router ./chart --set router.policy=intelligent_gateway --set target_qps=${targetQps}`;
        navigator.clipboard.writeText(cmd);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleHardwareChange = (e) => {
        const val = e.target.value;
        setHardware(val);
        // Data Multiplier to simulate infrastructure shift
        if (val.includes("A100")) setPerfMultiplier(1.6);
        else if (val.includes("L4")) setPerfMultiplier(2.5);
        else setPerfMultiplier(1.0); // H100 Baseline
    };

    const handleDownloadCSV = () => {
        let csvContent = "data:text/csv;charset=utf-8,";
        if (timeHorizon === 'snapshot') {
            csvContent += "Request_ID,Outcome,TTFT_ms,Code_Version\n";
            for (let i = 0; i < 60; i++) {
                csvContent += `${SCATTER_DATA_BASELINE[i].req_id},Cache Miss,${Math.round(SCATTER_DATA_BASELINE[i].ttft)},v1.2.0\n`;
                const optData = perfMultiplier > 1.0 ? SCATTER_DATA_OPTIMAL_SHIFTED : SCATTER_DATA_OPTIMAL;
                csvContent += `${optData[i].req_id},Cache Hit,${Math.round(optData[i].ttft)},v1.3.0-igw\n`;
            }
        } else {
            csvContent += "Date,Optimal_P99_TTFT_ms,Baseline_P99_TTFT_ms\n";
            HISTORICAL_DATA.forEach(row => {
                csvContent += `${row.date},${Math.round(row.optimal_ttft_p99 * perfMultiplier)},${Math.round(row.baseline_ttft_p99)}\n`;
            });
        }
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `prism-${timeHorizon}-latency.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleSaveAlert = () => {
        setAlertSaved(true);
        setTimeout(() => {
            setAlertSaved(false);
            setIsAlertModalOpen(false);
        }, 1500);
    };

    // Calculate shifting lines based on selected infrastructure
    const DYNAMIC_GEMMA_DATA = RAW_GEMMA_DATA.map(d => ({
        ...d,
        optimal_ttft_p50: d.optimal_ttft_p50 ? d.optimal_ttft_p50 * perfMultiplier : null,
        optimal_ttft_p90: d.optimal_ttft_p90 ? d.optimal_ttft_p90 * perfMultiplier : null,
        optimal_ttft_p99: d.optimal_ttft_p99 ? d.optimal_ttft_p99 * perfMultiplier : null,
        baseline_ttft_p90: d.baseline_ttft_p99 ? (d.baseline_ttft_p99 * perfMultiplier * 0.88) : null,
        optimal_itl_p99: d.optimal_itl_p99 ? d.optimal_itl_p99 * perfMultiplier : null,
    }));

    // Dynamic scale limit if baseline or optimal exceeds a spike
    const saturationPoint = DYNAMIC_GEMMA_DATA.find(d => (d.optimal_ttft_p99 && d.optimal_ttft_p99 > 2000) || (d.baseline_ttft_p99 && d.baseline_ttft_p99 > 2000));
    const saturationQps = saturationPoint ? saturationPoint.qps : null;

    const DYNAMIC_SCATTER_OPTIMAL = perfMultiplier > 1.0 ? SCATTER_DATA_OPTIMAL_SHIFTED : SCATTER_DATA_OPTIMAL;
    const DYNAMIC_HISTORICAL = HISTORICAL_DATA.map(d => ({ ...d, optimal_ttft_p99: d.optimal_ttft_p99 * perfMultiplier }));

    const DYNAMIC_HISTORICAL_ITL = HISTORICAL_DATA.map(d => ({
        ...d,
        optimal_itl_p99: (d.optimal_ttft_p99 * perfMultiplier) * 0.04, // Fake ITL from shifting TTFT
        baseline_itl_p99: 30 + Math.random() * 20,
    }));

    const maxThroughput = Math.max(...RAW_GEMMA_DATA.map(d => d.optimal_tput || 0));

    const hardwareCosts = {
        '4x H100 80GB': 3.0,
        '8x A100 40GB': 2.0,
        '1x L4': 1.0,
        'p5.48xlarge (H100)': 3.5,
        'p4d.24xlarge (A100)': 2.5,
        'ND H100 v5': 3.2,
    };
    const activeCost = hardwareCosts[hardware] || 2.0;

    const DYNAMIC_TPUT_DATA = RAW_GEMMA_DATA.map(d => ({
        ...d,
        optimal_tput: d.optimal_tput / activeCost,
        baseline_tput: d.baseline_tput / activeCost,
    }));


    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center pt-16">
            
            {/* Top Navigation Bar - Fully Fixed for 100% Scroll Independence */}
            <header className="w-full h-16 border-b border-slate-800 flex justify-between items-center px-6 bg-slate-900 fixed top-0 left-0 right-0 z-[9999]">
                <div className="flex items-center gap-4">
                    {/* Hamburger Menu for Mobile */}
                    <button 
                        onClick={onToggleMobileNav} 
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors md:hidden"
                        title="Toggle Navigation"
                    >
                        <Menu className="h-6 w-6" />
                    </button>

                    {onNavigateBack && (
                        <button onClick={onNavigateBack} className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                    )}
                    
                    {/* Compact Prism Logo & Name */}
                    <div className="flex items-center gap-2.5 border-r border-slate-500 pr-4">
                        <img src="/favicon.png" alt="Prism Logo" className="h-6 w-6 object-contain drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
                        <span className="text-lg font-bold tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-emerald-600 hidden sm:inline">
                            Prism
                        </span>
                    </div>

                    <div className="flex items-center">
                        <h1 className="text-sm sm:text-lg font-bold text-white tracking-wide truncate max-w-[150px] sm:max-w-none">Inference scheduling</h1>
                        <span className="ml-3 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hidden sm:inline">
                            Guided mode
                        </span>
                    </div>
                </div>

                <div className="flex items-center space-x-2 sm:space-x-4">
                    <a 
                        href="https://llm-d.ai/docs/community" 
                        target="_blank" 
                        rel="noreferrer"
                        className="px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-medium rounded-md text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors flex items-center border border-slate-700"
                        title="Contact us"
                    >
                        <MessageCircle className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Contact us</span>
                    </a>
                    <button 
                        onClick={() => { 
                            const params = new URLSearchParams();
                            params.set('share', '1');
                            params.set('view', 'inference-scheduling');
                            params.set('hw', hardware);
                            params.set('scale', latencyScale);
                            const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
                            
                            navigator.clipboard.writeText(shareUrl).then(() => {
                                setShareToast(true); 
                                setToastMessage('Link copied to clipboard!'); 
                                setTimeout(() => setShareToast(false), 2000); 
                            }).catch(err => {
                                setShareToast(true); 
                                setToastMessage('Failed to copy link'); 
                                setTimeout(() => setShareToast(false), 2000); 
                            });
                        }} 
                        className="px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-medium rounded-md text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors flex items-center border border-slate-700 relative"
                        title="Share view"
                    >
                        <Share2 className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Share view</span>
                        {shareToast && (
                            <div className="absolute -bottom-10 right-0 bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded shadow-lg z-50 flex items-center whitespace-nowrap">
                                {toastMessage}
                            </div>
                        )}
                    </button>
                </div>
            </header>

            <main className="w-full max-w-7xl px-6 py-8 flex flex-col space-y-8">
                {/* Description Card - Premium Aesthetic */}
                <div className="relative overflow-hidden border border-slate-800/80 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-slate-950/90 p-4 shadow-2xl backdrop-blur-xl group transition-all duration-500 hover:border-emerald-500/30">
                    {/* Ambient glowing background orb */}
                    <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all duration-700 pointer-events-none" />
                    <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl group-hover:bg-cyan-500/20 transition-all duration-700 pointer-events-none" />
                    
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 relative">
                        {/* Col 1: Overview */}
                        <div className="flex flex-col justify-between space-y-3">
                            <div>
                                <p className="text-sm text-slate-400 leading-relaxed">
                                    These variants of intelligent inference scheduling optimize request routing to maximize performance. By leveraging real-time cache state introspection or machine-learned latency predictions, they reduce tail latency, increase throughput, and improve cache hit rates across distributed model servers.
                                </p>
                            </div>
                        </div>

                        {/* Col 2: Active Configurations */}
                        <div className="space-y-2">
                            <div className="text-[10px] font-extrabold text-cyan-400/90 uppercase tracking-widest mb-1">
                                Active Configurations
                            </div>
                            
                            {/* Baseline */}
                            <div className="border border-emerald-500/20 rounded-lg bg-slate-900/30 p-2 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-semibold text-slate-200">Baseline</div>
                                    <p className="text-[10px] text-slate-500">Standard Kubernetes service endpoint</p>
                                </div>
                                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                            </div>

                            {/* Opt 1: Active */}
                            <div className="border border-emerald-500/20 rounded-lg bg-slate-900/30 p-2 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-semibold text-slate-200">Approximate Prefix Cache Routing</div>
                                    <p className="text-[10px] text-slate-500">Current active scenario</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <a href="https://llm-d.ai/docs/guide/Installation/inference-scheduling" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors flex items-center space-x-1">
                                        <span className="text-[10px]">Guide</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                                </div>
                            </div>
                        </div>

                        {/* Col 3: Upcoming */}
                        <div className="space-y-2">
                            <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-1">
                                Upcoming
                            </div>
                            
                            {/* Opt 2: Disabled */}
                            <div className="border border-slate-800/50 rounded-lg bg-slate-900/30 p-2 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-semibold text-slate-400">Precise Cache Aware Routing</div>
                                    <p className="text-[10px] text-slate-500">More accurate cache tracking</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <a href="https://llm-d.ai/docs/guide/Installation/precise-prefix-cache-aware" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors flex items-center space-x-1">
                                        <span className="text-[10px]">Guide</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <span className="text-[9px] font-extrabold text-amber-600/70 uppercase tracking-widest border border-amber-600/30 px-1.5 py-0.5 rounded">Coming Soon</span>
                                </div>
                            </div>

                            {/* Opt 3: Disabled */}
                            <div className="border border-slate-800/50 rounded-lg bg-slate-900/30 p-2 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-semibold text-slate-400">Predicted Latency Balancing</div>
                                    <p className="text-[10px] text-slate-500">Machine learning guided routing</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <a href="https://llm-d.ai/docs/guide/Installation/predicted-latency-based-scheduling" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors flex items-center space-x-1">
                                        <span className="text-[10px]">Guide</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <span className="text-[9px] font-extrabold text-amber-600/70 uppercase tracking-widest border border-amber-600/30 px-1.5 py-0.5 rounded">Coming Soon</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Evaluation Control Panel (Cards Grid) */}
                {/* Uniform Evaluation Control Panel (Cards Grid) */}
                {/* Distinct Evaluation Control Panel (Cards Grid) with fully identical title typography */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* CARD 1: Experiment Context (Horizontal 3-Column Layout) */}
                    <div className="lg:col-span-6 border border-slate-800/80 rounded-xl bg-gradient-to-br from-slate-900 to-slate-950 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden">
                        <div className="absolute -top-12 -left-12 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
                        
                        <div className="mb-3">
                            <span className="text-[11px] font-extrabold text-emerald-400/90 uppercase tracking-widest block">
                                Benchmark Scenario
                            </span>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            {/* Column 1: Infrastructure */}
                            <div className="flex flex-col gap-3 border-r border-slate-800/60 pr-4">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                    Infrastructure
                                </div>
                                <div className="flex flex-col gap-2.5">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Machine Type</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">{reportsMeta?.machine_type || "g2-standard-96"}</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Accelerator</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">{reportsMeta?.hardware || "NVIDIA L4"}</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Topology</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">1-node / 8-chip</span>
                                    </div>
                                </div>
                            </div>

                            {/* Column 2: Model Server Details */}
                            <div className="flex flex-col gap-3 border-r border-slate-800/60 pr-4">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                    Model Server Details
                                </div>
                                <div className="flex flex-col gap-2.5">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Model Name</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">{reportsMeta?.model || "Gemma-2-27B-IT"}</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Serving Engine</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">vLLM</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Model Precision</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">BF16</span>
                                    </div>
                                </div>
                            </div>

                            {/* Column 3: Deployment Environment */}
                            <div className="flex flex-col gap-3">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                    Deployment Environment
                                </div>
                                <div className="flex flex-col gap-2.5">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Provider</span>
                                        <div className="flex items-center gap-1.5 font-mono font-bold text-white text-xs">
                                            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                            </svg>
                                            Google Cloud
                                        </div>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Cloud Topology</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">1x4 SXM5 (4)</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Workload Catalog</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">High-Load QA</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CARD 2: Primary Outcome Metric */}
                    <div 
                        onClick={() => document.getElementById('summary-table')?.scrollIntoView({ behavior: 'smooth' })}
                        className="lg:col-span-3 border border-slate-800 rounded-xl bg-slate-900 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group cursor-pointer hover:border-emerald-500/30 transition-all"
                    >
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none transition-all group-hover:bg-emerald-500/10" />
                        <div>
                            <p className="text-[11px] font-extrabold text-emerald-400/90 uppercase tracking-widest mb-2 flex justify-between items-center">
                                Primary outcome
                                <span className="text-[8px] px-1 py-0.5 rounded bg-slate-800 text-slate-400 font-mono border border-slate-700 flex items-center gap-1 font-semibold">
                                    <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" /> TTFT (P50)
                                </span>
                            </p>
                            <h3 className="text-base font-bold text-white mb-2">
                                Latency reduction
                            </h3>
                            <h4 className="text-5xl font-black text-emerald-400 flex items-baseline tracking-tight">
                                {(() => {
                                    const validRows = tableData.filter(r => r.baseline_ttft_p50 > 0 && r.router_ttft_p50 > 0);
                                    if (validRows.length === 0) return "41%";
                                    const r = validRows[validRows.length - 1];
                                    const gain = ((r.baseline_ttft_p50 - r.router_ttft_p50) / r.baseline_ttft_p50) * 100;
                                    return `${Math.round(gain)}%`;
                                })()}
                            </h4>
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between">
                            <span className="text-[9px] text-slate-500">
                                Click to jump directly to detailed results table
                            </span>
                            <span className="text-[10px] font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-700/60 border border-slate-700/80 px-2.5 py-1 rounded transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer">
                                View table
                            </span>
                        </div>
                    </div>

                    {/* CARD 3: Reproducibility Guide */}
                    <div className="lg:col-span-3 border border-slate-800 rounded-xl bg-slate-900 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden">
                         <div>
                             <p className="text-[11px] font-extrabold text-emerald-400/90 uppercase tracking-widest mb-2">
                                 Action
                             </p>
                             <h3 className="text-base font-bold text-white mb-1">
                                 Reproducibility guide
                             </h3>
                             <p className="text-[9px] text-slate-500 leading-relaxed">
                                 Replicate this intelligent routing baseline directly on your Kubernetes evaluation cluster.
                             </p>
                         </div>

                         <button onClick={() => setIsModalOpen(true)} className="w-full mt-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg shadow transition-all flex justify-center items-center">
                            <Zap className="w-3.5 h-3.5 mr-1.5" /> View instructions
                         </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Row 1: Primary Latency Metrics (TTFT on Left, ITL on Right) */}
                    
                    {/* Chart 1: TTFT vs Input Tokens/sec */}
                    <div className="border border-slate-800 rounded-xl bg-slate-900/60 backdrop-blur-sm shadow-xl overflow-hidden flex flex-col h-[34rem]">
                        <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-800/20 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-white">TTFT vs Input Tokens/sec ({selectedPercentile})</h3>
                            <button onClick={() => openZoom(2)} className="text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700 p-2 rounded-lg transition-all flex items-center justify-center border border-slate-700/50" title="Expand Chart">
                                <Maximize2 className="w-4 h-4 text-cyan-400" />
                            </button>
                        </div>
                        <div className="flex-1 p-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart margin={{ top: 10, right: 10, left: 10, bottom: 60 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                    <XAxis type="number" dataKey="ttft" name="TTFT" stroke="#64748b" tick={{ fontSize: 12 }}>
                                        <Label value="TTFT (ms)" position="insideBottom" offset={-20} fill="#94a3b8" fontSize={12} />
                                    </XAxis>
                                    <YAxis type="number" dataKey="input" name="Input Tokens/sec" stroke="#64748b" tick={{ fontSize: 12 }}>
                                        <Label value="Input Tokens/sec" angle={-90} position="insideLeft" offset={-5} fill="#94a3b8" fontSize={12} />
                                    </YAxis>
                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<RichSchedulingTooltip />} />
                                    <Legend verticalAlign="bottom" wrapperStyle={{ width: '100%', left: '0px', bottom: '0px' }} content={<PercentileGroupedLegend />} />
                                    {!hiddenSeries.includes(`Baseline ${selectedPercentile}`) && (
                                        <Line type="monotone" dataKey="input" data={scatterData.ttft_baseline} stroke="#fb923c" strokeWidth={2} dot={false} legendType="none" />
                                    )}
                                    {!hiddenSeries.includes(`Baseline ${selectedPercentile}`) && (
                                        <Scatter name={`Standard Kubernetes (${selectedPercentile})`} data={scatterData.ttft_baseline} fill="#fb923c" />
                                    )}
                                    {!hiddenSeries.includes(`Router ${selectedPercentile}`) && (
                                        <Line type="monotone" dataKey="input" data={scatterData.ttft_router} stroke="#38bdf8" strokeWidth={2} dot={false} legendType="none" />
                                    )}
                                    {!hiddenSeries.includes(`Router ${selectedPercentile}`) && (
                                        <Scatter name={`Approx. prefix aware routing (${selectedPercentile})`} data={scatterData.ttft_router} fill="#38bdf8" />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Chart 2: TTFT vs Output Tokens/sec */}
                    <div className="border border-slate-800 rounded-xl bg-slate-900/60 backdrop-blur-sm shadow-xl overflow-hidden flex flex-col h-[34rem]">
                        <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-800/20 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-white">TTFT vs Output Tokens/sec ({selectedPercentile})</h3>
                            <button onClick={() => openZoom(1)} className="text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700 p-2 rounded-lg transition-all flex items-center justify-center border border-slate-700/50" title="Expand Chart">
                                <Maximize2 className="w-4 h-4 text-cyan-400" />
                            </button>
                        </div>
                        <div className="flex-1 p-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart margin={{ top: 10, right: 10, left: 10, bottom: 60 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                    <XAxis type="number" dataKey="ttft" name="TTFT" stroke="#64748b" tick={{ fontSize: 12 }}>
                                        <Label value="TTFT (ms)" position="insideBottom" offset={-20} fill="#94a3b8" fontSize={12} />
                                    </XAxis>
                                    <YAxis type="number" dataKey="output" name="Output Tokens/sec" stroke="#64748b" tick={{ fontSize: 12 }}>
                                        <Label value="Output Tokens/sec" angle={-90} position="insideLeft" offset={-5} fill="#94a3b8" fontSize={12} />
                                    </YAxis>
                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<RichSchedulingTooltip />} />
                                    <Legend verticalAlign="bottom" wrapperStyle={{ width: '100%', left: '0px', bottom: '0px' }} content={<PercentileGroupedLegend />} />
                                    {!hiddenSeries.includes(`Baseline ${selectedPercentile}`) && (
                                        <Line type="monotone" dataKey="output" data={scatterData.ttft_baseline} stroke="#fb923c" strokeWidth={2} dot={false} legendType="none" />
                                    )}
                                    {!hiddenSeries.includes(`Baseline ${selectedPercentile}`) && (
                                        <Scatter name={`Standard Kubernetes (${selectedPercentile})`} data={scatterData.ttft_baseline} fill="#fb923c" />
                                    )}
                                    {!hiddenSeries.includes(`Router ${selectedPercentile}`) && (
                                        <Line type="monotone" dataKey="output" data={scatterData.ttft_router} stroke="#38bdf8" strokeWidth={2} dot={false} legendType="none" />
                                    )}
                                    {!hiddenSeries.includes(`Router ${selectedPercentile}`) && (
                                        <Scatter name={`Approx. prefix aware routing (${selectedPercentile})`} data={scatterData.ttft_router} fill="#38bdf8" />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Row 2: Token Flow Specifics (Input on Left, Output on Right) */}
                    
                    {/* Chart 3: TTFT vs Total Tokens/sec */}
                    <div className="border border-slate-800 rounded-xl bg-slate-900/60 backdrop-blur-sm shadow-xl overflow-hidden flex flex-col h-[34rem]">
                        <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-800/20 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-white">TTFT vs Total Tokens/sec ({selectedPercentile})</h3>
                            <button onClick={() => openZoom(4)} className="text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700 p-2 rounded-lg transition-all flex items-center justify-center border border-slate-700/50" title="Expand Chart">
                                <Maximize2 className="w-4 h-4 text-cyan-400" />
                            </button>
                        </div>
                        <div className="flex-1 p-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart margin={{ top: 10, right: 10, left: 10, bottom: 60 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                    <XAxis type="number" dataKey="ttft" name="TTFT" stroke="#64748b" tick={{ fontSize: 12 }}>
                                        <Label value="TTFT (ms)" position="insideBottom" offset={-20} fill="#94a3b8" fontSize={12} />
                                    </XAxis>
                                    <YAxis type="number" dataKey="total" name="Total Tokens/sec" stroke="#64748b" tick={{ fontSize: 12 }}>
                                        <Label value="Total Tokens/sec" angle={-90} position="insideLeft" offset={-5} fill="#94a3b8" fontSize={12} />
                                    </YAxis>
                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<RichSchedulingTooltip />} />
                                    <Legend verticalAlign="bottom" wrapperStyle={{ width: '100%', left: '0px', bottom: '0px' }} content={<PercentileGroupedLegend />} />
                                    {!hiddenSeries.includes(`Baseline ${selectedPercentile}`) && (
                                        <Line type="monotone" dataKey="total" data={scatterData.ttft_baseline} stroke="#fb923c" strokeWidth={2} dot={false} legendType="none" />
                                    )}
                                    {!hiddenSeries.includes(`Baseline ${selectedPercentile}`) && (
                                        <Scatter name={`Standard Kubernetes (${selectedPercentile})`} data={scatterData.ttft_baseline} fill="#fb923c" />
                                    )}
                                    {!hiddenSeries.includes(`Router ${selectedPercentile}`) && (
                                        <Line type="monotone" dataKey="total" data={scatterData.ttft_router} stroke="#38bdf8" strokeWidth={2} dot={false} legendType="none" />
                                    )}
                                    {!hiddenSeries.includes(`Router ${selectedPercentile}`) && (
                                        <Scatter name={`Approx. prefix aware routing (${selectedPercentile})`} data={scatterData.ttft_router} fill="#38bdf8" />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Chart 4: TTFT vs QPS */}
                    <div className="border border-slate-800 rounded-xl bg-slate-900/60 backdrop-blur-sm shadow-xl overflow-hidden flex flex-col h-[34rem]">
                        <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-800/20 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-white">TTFT vs QPS ({selectedPercentile})</h3>
                            <button onClick={() => openZoom(5)} className="text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700 p-2 rounded-lg transition-all flex items-center justify-center border border-slate-700/50" title="Expand Chart">
                                <Maximize2 className="w-4 h-4 text-cyan-400" />
                            </button>
                        </div>
                        <div className="flex-1 p-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart margin={{ top: 10, right: 10, left: 10, bottom: 60 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                    <XAxis type="number" dataKey="ttft" name="TTFT" stroke="#64748b" tick={{ fontSize: 12 }}>
                                        <Label value="TTFT (ms)" position="insideBottom" offset={-20} fill="#94a3b8" fontSize={12} />
                                    </XAxis>
                                    <YAxis type="number" dataKey="qps" name="Queries Per Second" stroke="#64748b" tick={{ fontSize: 12 }}>
                                        <Label value="Queries Per Second" angle={-90} position="insideLeft" offset={-5} fill="#94a3b8" fontSize={12} />
                                    </YAxis>
                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<RichSchedulingTooltip />} />
                                    <Legend verticalAlign="bottom" wrapperStyle={{ width: '100%', left: '0px', bottom: '0px' }} content={<PercentileGroupedLegend />} />
                                    {!hiddenSeries.includes(`Baseline ${selectedPercentile}`) && (
                                        <Line type="monotone" dataKey="qps" data={scatterData.ttft_baseline} stroke="#fb923c" strokeWidth={2} dot={false} legendType="none" />
                                    )}
                                    {!hiddenSeries.includes(`Baseline ${selectedPercentile}`) && (
                                        <Scatter name={`Standard Kubernetes (${selectedPercentile})`} data={scatterData.ttft_baseline} fill="#fb923c" />
                                    )}
                                    {!hiddenSeries.includes(`Router ${selectedPercentile}`) && (
                                        <Line type="monotone" dataKey="qps" data={scatterData.ttft_router} stroke="#38bdf8" strokeWidth={2} dot={false} legendType="none" />
                                    )}
                                    {!hiddenSeries.includes(`Router ${selectedPercentile}`) && (
                                        <Scatter name={`Approx. prefix aware routing (${selectedPercentile})`} data={scatterData.ttft_router} fill="#38bdf8" />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Row 3: Total Token Flow metrics */}
                    
                    {/* Chart 5: TPOT vs Input Tokens/sec */}
                    <div className="border border-slate-800 rounded-xl bg-slate-900/60 backdrop-blur-sm shadow-xl overflow-hidden flex flex-col h-[34rem]">
                        <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-800/20 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-white">TPOT vs Input Tokens/sec ({selectedPercentile})</h3>
                            <button onClick={() => openZoom(6)} className="text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700 p-2 rounded-lg transition-all flex items-center justify-center border border-slate-700/50" title="Expand Chart">
                                <Maximize2 className="w-4 h-4 text-cyan-400" />
                            </button>
                        </div>
                        <div className="flex-1 p-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart margin={{ top: 10, right: 10, left: 10, bottom: 60 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                    <XAxis type="number" dataKey="tpot" name="TPOT" stroke="#64748b" tick={{ fontSize: 12 }}>
                                        <Label value="TPOT (ms)" position="insideBottom" offset={-20} fill="#94a3b8" fontSize={12} />
                                    </XAxis>
                                    <YAxis type="number" dataKey="input" name="Input Tokens/sec" stroke="#64748b" tick={{ fontSize: 12 }}>
                                        <Label value="Input Tokens/sec" angle={-90} position="insideLeft" offset={-5} fill="#94a3b8" fontSize={12} />
                                    </YAxis>
                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<RichSchedulingTooltip />} />
                                    <Legend verticalAlign="bottom" wrapperStyle={{ width: '100%', left: '0px', bottom: '0px' }} content={<PercentileGroupedLegend />} />
                                    {!hiddenSeries.includes(`Baseline ${selectedPercentile}`) && (
                                        <Line type="monotone" dataKey="input" data={scatterData.tpot_baseline} stroke="#fb923c" strokeWidth={2} dot={false} legendType="none" />
                                    )}
                                    {!hiddenSeries.includes(`Baseline ${selectedPercentile}`) && (
                                        <Scatter name={`Standard Kubernetes (${selectedPercentile})`} data={scatterData.tpot_baseline} fill="#fb923c" />
                                    )}
                                    {!hiddenSeries.includes(`Router ${selectedPercentile}`) && (
                                        <Line type="monotone" dataKey="input" data={scatterData.tpot_router} stroke="#38bdf8" strokeWidth={2} dot={false} legendType="none" />
                                    )}
                                    {!hiddenSeries.includes(`Router ${selectedPercentile}`) && (
                                        <Scatter name={`Approx. prefix aware routing (${selectedPercentile})`} data={scatterData.tpot_router} fill="#38bdf8" />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Chart 6: TPOT vs Output Tokens/sec */}
                    <div className="border border-slate-800 rounded-xl bg-slate-900/60 backdrop-blur-sm shadow-xl overflow-hidden flex flex-col h-[34rem]">
                        <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-800/20 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-white">TPOT vs Output Tokens/sec ({selectedPercentile})</h3>
                            <button onClick={() => openZoom(3)} className="text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700 p-2 rounded-lg transition-all flex items-center justify-center border border-slate-700/50" title="Expand Chart">
                                <Maximize2 className="w-4 h-4 text-cyan-400" />
                            </button>
                        </div>
                        <div className="flex-1 p-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart margin={{ top: 10, right: 10, left: 10, bottom: 60 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                    <XAxis type="number" dataKey="tpot" name="TPOT" stroke="#64748b" tick={{ fontSize: 12 }}>
                                        <Label value="TPOT (ms)" position="insideBottom" offset={-20} fill="#94a3b8" fontSize={12} />
                                    </XAxis>
                                    <YAxis type="number" dataKey="output" name="Output Tokens/sec" stroke="#64748b" tick={{ fontSize: 12 }}>
                                        <Label value="Output Tokens/sec" angle={-90} position="insideLeft" offset={-5} fill="#94a3b8" fontSize={12} />
                                    </YAxis>
                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<RichSchedulingTooltip />} />
                                    <Legend verticalAlign="bottom" wrapperStyle={{ width: '100%', left: '0px', bottom: '0px' }} content={<PercentileGroupedLegend />} />
                                    {!hiddenSeries.includes(`Baseline ${selectedPercentile}`) && (
                                        <Line type="monotone" dataKey="output" data={scatterData.tpot_baseline} stroke="#fb923c" strokeWidth={2} dot={false} legendType="none" />
                                    )}
                                    {!hiddenSeries.includes(`Baseline ${selectedPercentile}`) && (
                                        <Scatter name={`Standard Kubernetes (${selectedPercentile})`} data={scatterData.tpot_baseline} fill="#fb923c" />
                                    )}
                                    {!hiddenSeries.includes(`Router ${selectedPercentile}`) && (
                                        <Line type="monotone" dataKey="output" data={scatterData.tpot_router} stroke="#38bdf8" strokeWidth={2} dot={false} legendType="none" />
                                    )}
                                    {!hiddenSeries.includes(`Router ${selectedPercentile}`) && (
                                        <Scatter name={`Approx. prefix aware routing (${selectedPercentile})`} data={scatterData.tpot_router} fill="#38bdf8" />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Row 4: TPOT Breakdown */}
                    
                    {/* Chart 7: QPS vs Input Tokens/sec */}
                    <div className="border border-slate-800 rounded-xl bg-slate-900/60 backdrop-blur-sm shadow-xl overflow-hidden flex flex-col h-[34rem]">
                        <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-800/20 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-white">QPS vs Input Tokens/sec</h3>
                            <button onClick={() => openZoom(7)} className="text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700 p-2 rounded-lg transition-all flex items-center justify-center border border-slate-700/50" title="Expand Chart">
                                <Maximize2 className="w-4 h-4 text-cyan-400" />
                            </button>
                        </div>
                        <div className="flex-1 p-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart margin={{ top: 10, right: 10, left: 10, bottom: 60 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                    <XAxis type="number" dataKey="qps" name="QPS" stroke="#64748b" tick={{ fontSize: 12 }}>
                                        <Label value="Queries Per Second" position="insideBottom" offset={-20} fill="#94a3b8" fontSize={12} />
                                    </XAxis>
                                    <YAxis type="number" dataKey="input" name="Input Tokens/sec" stroke="#64748b" tick={{ fontSize: 12 }}>
                                        <Label value="Input Tokens/sec" angle={-90} position="insideLeft" offset={-5} fill="#94a3b8" fontSize={12} />
                                    </YAxis>
                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<RichSchedulingTooltip />} />
                                    <Legend verticalAlign="bottom" wrapperStyle={{ width: '100%', left: '0px', bottom: '0px' }} content={<PercentileGroupedLegend />} />
                                    {!hiddenSeries.includes(`Baseline ${selectedPercentile}`) && (
                                        <Line type="monotone" dataKey="input" data={scatterData.qps_baseline} stroke="#fb923c" strokeWidth={2} dot={false} legendType="none" />
                                    )}
                                    {!hiddenSeries.includes(`Baseline ${selectedPercentile}`) && (
                                        <Scatter name="Standard Kubernetes" data={scatterData.qps_baseline} fill="#fb923c" />
                                    )}
                                    {!hiddenSeries.includes(`Router ${selectedPercentile}`) && (
                                        <Line type="monotone" dataKey="input" data={scatterData.qps_router} stroke="#38bdf8" strokeWidth={2} dot={false} legendType="none" />
                                    )}
                                    {!hiddenSeries.includes(`Router ${selectedPercentile}`) && (
                                        <Scatter name="Approx. prefix aware routing" data={scatterData.qps_router} fill="#38bdf8" />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Chart 8: QPS vs Output Tokens/sec */}
                    <div className="border border-slate-800 rounded-xl bg-slate-900/60 backdrop-blur-sm shadow-xl overflow-hidden flex flex-col h-[34rem]">
                        <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-800/20 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-white">QPS vs Output Tokens/sec</h3>
                            <button onClick={() => openZoom(8)} className="text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700 p-2 rounded-lg transition-all flex items-center justify-center border border-slate-700/50" title="Expand Chart">
                                <Maximize2 className="w-4 h-4 text-cyan-400" />
                            </button>
                        </div>
                        <div className="flex-1 p-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart margin={{ top: 10, right: 10, left: 10, bottom: 60 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                    <XAxis type="number" dataKey="qps" name="QPS" stroke="#64748b" tick={{ fontSize: 12 }}>
                                        <Label value="Queries Per Second" position="insideBottom" offset={-20} fill="#94a3b8" fontSize={12} />
                                    </XAxis>
                                    <YAxis type="number" dataKey="output" name="Output Tokens/sec" stroke="#64748b" tick={{ fontSize: 12 }}>
                                        <Label value="Output Tokens/sec" angle={-90} position="insideLeft" offset={-5} fill="#94a3b8" fontSize={12} />
                                    </YAxis>
                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<RichSchedulingTooltip />} />
                                    <Legend verticalAlign="bottom" wrapperStyle={{ width: '100%', left: '0px', bottom: '0px' }} content={<PercentileGroupedLegend />} />
                                    {!hiddenSeries.includes(`Baseline ${selectedPercentile}`) && (
                                        <Line type="monotone" dataKey="output" data={scatterData.qps_baseline} stroke="#fb923c" strokeWidth={2} dot={false} legendType="none" />
                                    )}
                                    {!hiddenSeries.includes(`Baseline ${selectedPercentile}`) && (
                                        <Scatter name="Standard Kubernetes" data={scatterData.qps_baseline} fill="#fb923c" />
                                    )}
                                    {!hiddenSeries.includes(`Router ${selectedPercentile}`) && (
                                        <Line type="monotone" dataKey="output" data={scatterData.qps_router} stroke="#38bdf8" strokeWidth={2} dot={false} legendType="none" />
                                    )}
                                    {!hiddenSeries.includes(`Router ${selectedPercentile}`) && (
                                        <Scatter name="Approx. prefix aware routing" data={scatterData.qps_router} fill="#38bdf8" />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
                
                {/* Summary Metrics Table */}
                <div id="summary-table" className="border border-slate-800 rounded-xl bg-slate-900 shadow-xl p-6 flex flex-col h-[32rem]">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-md font-bold text-white">Summary metrics comparison</h3>
                            <span className="text-xs text-slate-500">Comparing Standard workloads against Approx. prefix aware routing workloads side-by-side.</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex gap-2 bg-slate-950 border border-slate-800 p-1 rounded-lg">
                                <button 
                                    onClick={() => setTableMetricMode('ttft')} 
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${tableMetricMode === 'ttft' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}
                                >
                                    TTFT
                                </button>
                                <button 
                                    onClick={() => setTableMetricMode('itl')} 
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${tableMetricMode === 'itl' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}
                                >
                                    ITL
                                </button>
                            </div>
                            <div className="flex gap-2 bg-slate-950 border border-slate-800 p-1 rounded-lg">
                                <button 
                                    onClick={() => setSelectedPercentile('P50')} 
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${selectedPercentile === 'P50' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}
                                >
                                    P50
                                </button>
                                <button 
                                    onClick={() => setSelectedPercentile('P90')} 
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${selectedPercentile === 'P90' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}
                                >
                                    P90
                                </button>
                                <button 
                                    onClick={() => setSelectedPercentile('P99')} 
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${selectedPercentile === 'P99' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}
                                >
                                    P99
                                </button>
                            </div>
                            <button 
                                onClick={exportToCSV} 
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-md border border-slate-700 transition-colors"
                            >
                                Export CSV
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto rounded-lg border border-slate-800">
                        <table className="w-full text-xs text-left text-slate-300">
                            <thead className="text-[10px] font-extrabold text-white uppercase tracking-widest bg-slate-950 border-b border-slate-800">
                                <tr>
                                    <th scope="col" className="px-4 py-3 cursor-pointer hover:bg-slate-900 transition-colors w-20" onClick={() => setSortConfig(prev => ({ key: 'qps', direction: prev.key === 'qps' && prev.direction === 'asc' ? 'desc' : 'asc' }))}>
                                        <div className="flex items-center gap-1">
                                            QPS {sortConfig.key === 'qps' && <span className="text-cyan-400">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                                        </div>
                                    </th>
                                    <th scope="col" className="px-4 py-3 bg-orange-950/20 border-l border-orange-900/30">
                                        <span className="text-orange-300">Standard K8s ({selectedPercentile})</span>
                                    </th>
                                    <th scope="col" className="px-4 py-3 bg-sky-950/20 border-l border-sky-900/30">
                                        <span className="text-sky-300">Prefix-aware ({selectedPercentile})</span>
                                    </th>
                                    <th scope="col" className="px-4 py-3 border-l border-slate-800 text-right cursor-pointer hover:bg-slate-900" onClick={() => setSortConfig(prev => ({ key: 'gain', direction: prev.key === 'gain' && prev.direction === 'asc' ? 'desc' : 'asc' }))}>
                                        <div className="flex items-center justify-end gap-1 text-emerald-400">
                                            Difference (%) {sortConfig.key === 'gain' && <span className="text-cyan-400">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    const enhancedData = tableData.map(row => {
                                        const base = tableMetricMode === 'ttft' 
                                            ? (selectedPercentile === 'P50' ? row.baseline_ttft_p50 : selectedPercentile === 'P90' ? row.baseline_ttft_p90 : row.baseline_ttft_p99)
                                            : (selectedPercentile === 'P50' ? row.baseline_itl_p50 : selectedPercentile === 'P90' ? row.baseline_itl_p90 : row.baseline_itl_p99);
                                        
                                        const opt = tableMetricMode === 'ttft' 
                                            ? (selectedPercentile === 'P50' ? row.router_ttft_p50 : selectedPercentile === 'P90' ? row.router_ttft_p90 : row.router_ttft_p99)
                                            : (selectedPercentile === 'P50' ? row.router_itl_p50 : selectedPercentile === 'P90' ? row.router_itl_p90 : row.router_itl_p99);
                                        
                                        const gain = base && opt ? ((base - opt) / base) * 100 : 0;

                                        return {
                                            ...row,
                                            val_base: base || 0,
                                            val_opt: opt || 0,
                                            gain: gain
                                        };
                                    });

                                    const sortedData = [...enhancedData].sort((a, b) => {
                                        const valA = a[sortConfig.key] || a.qps;
                                        const valB = b[sortConfig.key] || b.qps;
                                        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
                                    });

                                    return sortedData.map((row, idx) => (
                                        <tr key={idx} className="border-b border-slate-800/60 hover:bg-slate-900/80 transition-colors font-mono">
                                            <td className="px-4 py-4 text-[11px] text-slate-300 font-semibold">{row.qps}</td>
                                            <td className="px-4 py-4 text-[11px] bg-orange-950/10 border-l border-orange-900/20 text-orange-200">
                                                {row.val_base ? `${Math.round(row.val_base)}ms` : 'N/A'}
                                            </td>
                                            <td className="px-4 py-4 text-[11px] bg-sky-950/10 border-l border-sky-900/20 text-sky-200 font-bold">
                                                {row.val_opt ? `${Math.round(row.val_opt)}ms` : 'N/A'}
                                            </td>
                                            <td className="px-4 py-4 border-l border-slate-800/60 text-right">
                                                <span className={`px-2.5 py-1 text-[11px] font-semibold rounded-full ${row.gain > 0 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : row.gain < 0 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-800 text-slate-400'}`}>
                                                    {row.gain > 0 ? `+${Math.round(row.gain)}%` : row.gain < 0 ? `${Math.round(row.gain)}%` : '0%'}
                                                </span>
                                            </td>
                                        </tr>
                                    ));
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* Reproduction Modal Workflow */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                        <header className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/80">
                            <div className="flex items-center">
                                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg mr-3">
                                    <Zap className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Reproducibility Instructions</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">Execute this exact benchmark profile on your cluster.</p>
                                </div>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700 transition-colors">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </header>

                        <div className="p-6">
                            <div className="mb-6">
                                <h4 className="text-sm font-semibold text-slate-300 mb-2">1. Apply Benchmark Definitions</h4>
                                <p className="text-xs text-slate-400 mb-3">Load the specific Kubernetes evaluation service definitions onto your target node.</p>
                                <div className="bg-slate-950 border border-emerald-500/30 rounded-lg p-4 relative group">
                                    <pre className="text-emerald-400 font-mono text-sm whitespace-pre-wrap leading-relaxed">
                                        kubectl apply -f https://llm-d.ai/benchmarks/qwen.yaml
                                    </pre>
                                    <button onClick={() => {
                                        navigator.clipboard.writeText('kubectl apply -f https://llm-d.ai/benchmarks/qwen.yaml');
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 2000);
                                    }} className="absolute top-3 right-3 p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 transition-colors shadow-sm flex items-center">
                                        {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                                {copied && <p className="text-xs text-emerald-500 mt-2 font-medium animate-pulse">Copied to clipboard!</p>}
                            </div>

                            <div className="mb-2">
                                <h4 className="text-sm font-semibold text-slate-300 mb-1">2. Reference Documentation</h4>
                                <p className="text-xs text-slate-400">
                                    For deep architectural specifications, view the full instructions directly on our repository:
                                </p>
                                <a href="https://github.com/llm-d/llm-d/blob/main/guides/inference-scheduling/README.md#benchmarking" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center text-xs font-bold text-cyan-400 hover:underline">
                                    View complete guide <ExternalLink className="w-3.5 h-3.5 ml-1" />
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

            {/* SLA Alert Modal Mock */}
            {isAlertModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                        <header className="px-5 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/80">
                            <div className="flex items-center">
                                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg mr-3">
                                    <Bell className="w-5 h-5 cursor-pointer" />
                                </div>
                                <div>
                                    <h3 className="text-[15px] font-bold text-white">Create SLA Alert</h3>
                                    <p className="text-[11px] text-slate-400 mt-0.5">Notifies your team when performance drops.</p>
                                </div>
                            </div>
                            <button onClick={() => setIsAlertModalOpen(false)} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700 transition-colors">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </header>

                        <div className="p-5 space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Condition</label>
                                <div className="flex items-center space-x-2 text-sm text-slate-300 bg-slate-950 p-2.5 rounded border border-slate-800">
                                    <span className="font-mono text-emerald-400">P99 TTFT</span>
                                    <span> exceeds </span>
                                    <input type="number" defaultValue={450} className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-center text-white outline-none" />
                                    <span>ms</span>
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Duration</label>
                                <div className="flex items-center space-x-2 text-sm text-slate-300">
                                    <span>For</span>
                                    <select className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white outline-none">
                                        <option>2 consecutive days</option>
                                        <option>3 consecutive days</option>
                                        <option>1 week</option>
                                    </select>
                                </div>
                            </div>

                            <div className="pt-2">
                                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Routing</label>
                                <button className="w-full flex items-center justify-between p-3 border border-indigo-500/30 bg-indigo-500/10 rounded-lg hover:bg-indigo-500/20 transition-colors">
                                    <div className="flex items-center">
                                        <Slack className="w-4 h-4 text-indigo-400 mr-2" />
                                        <span className="text-sm font-medium text-slate-200">#ops-alerts-inference</span>
                                    </div>
                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                </button>
                            </div>
                        </div>
                        
                        <div className="px-5 py-3 bg-slate-900 border-t border-slate-800 flex justify-end items-center">
                            {alertSaved && <span className="text-xs font-medium text-emerald-500 mr-4 animate-in fade-in slide-in-from-right-4">Alert Saved!</span>}
                            <button onClick={() => setIsAlertModalOpen(false)} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs transition-colors border border-slate-700 mr-2 font-semibold">Cancel</button>
                            <button onClick={handleSaveAlert} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-xs transition-colors shadow-sm flex items-center border border-indigo-500 line-clamp-1">
                                Save Alert Condition
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Full-Screen Zoom Modal */}
            {zoomedChart !== null && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[1000] flex items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-200">
                    <div className="bg-slate-900/80 border border-slate-700/60 rounded-2xl shadow-2xl flex flex-col w-full max-w-6xl h-[80vh] overflow-hidden backdrop-blur-sm relative">
                        {(() => {
                            const derivedZoomData = additionalChartData
                                .flatMap(item => {
                                    const chipDivisor = zoomPerChip ? 4 : 1;
                                    
                                    // Safely parse numeric values
                                    const parseNum = (val, fallback = 0) => {
                                        const parsed = parseFloat(val);
                                        return isNaN(parsed) ? fallback : parsed;
                                    };

                                    const b_outputRate = parseNum(item.baseline_output_token_rate, 0);
                                    const r_outputRate = parseNum(item.router_output_token_rate, 0);
                                    const b_inputRate = parseNum(item.baseline_input_token_rate, parseNum(item.qps, 0) * 512);
                                    const r_inputRate = parseNum(item.router_input_token_rate, parseNum(item.qps, 0) * 512);
                                    
                                    // Baseline object
                                    let b_yVal = b_outputRate;
                                    if (zoomYAxis === 'input') b_yVal = b_inputRate;
                                    else if (zoomYAxis === 'total') b_yVal = b_inputRate + b_outputRate;
                                    else if (zoomYAxis === 'qps') b_yVal = parseNum(item.qps, 0);
                                    else if (zoomYAxis === 'cost') {
                                        const rates = { spot: 2.89, on_demand: 9.89, cud_1y: 6.54, cud_3y: 4.22 };
                                        b_yVal = ((b_outputRate * rates[zoomCostMode]) / 10000);
                                    }
                                    
                                    // Router object
                                    let r_yVal = r_outputRate;
                                    if (zoomYAxis === 'input') r_yVal = r_inputRate;
                                    else if (zoomYAxis === 'total') r_yVal = r_inputRate + r_outputRate;
                                    else if (zoomYAxis === 'qps') r_yVal = parseNum(item.qps, 0);
                                    else if (zoomYAxis === 'cost') {
                                        const rates = { spot: 2.89, on_demand: 9.89, cud_1y: 6.54, cud_3y: 4.22 };
                                        r_yVal = ((r_outputRate * rates[zoomCostMode]) / 10000);
                                    }
                                    
                                    if (zoomYAxis !== 'cost' && zoomPerChip) {
                                        b_yVal = b_yVal / chipDivisor;
                                        r_yVal = r_yVal / chipDivisor;
                                    }
                                    
                                    const isPercentileAxis = ['ttft', 'tpot', 'itl', 'ntpot', 'e2e'].includes(zoomXAxis);
                                    const percentilesToGenerate = isPercentileAxis ? ['p50', 'p90', 'p99'] : ['p50'];
                                    const res = [];

                                    percentilesToGenerate.forEach(pKey => {
                                        const b_tpotVal = parseNum(item[`baseline_tpot_${pKey}`], 20);
                                        const r_tpotVal = parseNum(item[`router_tpot_${pKey}`], 20);
                                        const b_ttftVal = parseNum(item[`baseline_ttft_${pKey}`], 250);
                                        const r_ttftVal = parseNum(item[`router_ttft_${pKey}`], 250);
                                        const b_itlVal = parseNum(item[`baseline_itl_${pKey}`], 25);
                                        const r_itlVal = parseNum(item[`router_itl_${pKey}`], 25);
                                        
                                        let b_xVal = parseNum(item.qps, 0);
                                        if (zoomXAxis === 'tpot') b_xVal = b_tpotVal;
                                        else if (zoomXAxis === 'ntpot') b_xVal = b_tpotVal * 0.85;
                                        else if (zoomXAxis === 'ttft') b_xVal = b_ttftVal;
                                        else if (zoomXAxis === 'itl') b_xVal = b_itlVal;
                                        else if (zoomXAxis === 'tokens_sec') b_xVal = b_outputRate || 1000;
                                        else if (zoomXAxis === 'e2e') b_xVal = b_ttftVal + b_tpotVal * 128;
                                        
                                        let r_xVal = parseNum(item.qps, 0);
                                        if (zoomXAxis === 'tpot') r_xVal = r_tpotVal;
                                        else if (zoomXAxis === 'ntpot') r_xVal = r_tpotVal * 0.85;
                                        else if (zoomXAxis === 'ttft') r_xVal = r_ttftVal;
                                        else if (zoomXAxis === 'itl') r_xVal = r_itlVal;
                                        else if (zoomXAxis === 'tokens_sec') r_xVal = r_outputRate || 1000;
                                        else if (zoomXAxis === 'e2e') r_xVal = r_ttftVal + r_tpotVal * 128;
                                        
                                        const hasBaseline = item[`baseline_ttft_${pKey}`] !== undefined;
                                        const hasRouter = item[`router_ttft_${pKey}`] !== undefined;

                                        if (hasBaseline) {
                                            res.push({
                                                ...item,
                                                type: 'baseline',
                                                percentile: pKey,
                                                dynamic_x: parseFloat(b_xVal.toFixed(4)),
                                                dynamic_y: parseFloat(b_yVal.toFixed(4))
                                            });
                                        }
                                        if (hasRouter) {
                                            res.push({
                                                ...item,
                                                type: 'router',
                                                percentile: pKey,
                                                dynamic_x: parseFloat(r_xVal.toFixed(4)),
                                                dynamic_y: parseFloat(r_yVal.toFixed(4))
                                            });
                                        }
                                    });

                                    return res;
                                })
                                .filter(d => !isNaN(d.dynamic_x) && !isNaN(d.dynamic_y))
                                .sort((a, b) => a.dynamic_x - b.dynamic_x);

                            const dataMax = derivedZoomData.length > 0 ? Math.max(...derivedZoomData.map(d => d.dynamic_x)) : 100;
                            const step = Math.max(0.01, dataMax / 100);
                            const currentMax = zoomXMax === Infinity ? dataMax : zoomXMax;
                            const isPercentileAxis = ['ttft', 'tpot', 'itl', 'ntpot', 'e2e'].includes(zoomXAxis);
                            const visibleZoomData = derivedZoomData.filter(d => d.dynamic_x <= currentMax && (!isPercentileAxis || visiblePercentiles.includes(d.percentile)));

                            const xLabels = {
                                tpot: 'TPOT (ms)',
                                ntpot: 'Normalized TPOT (ms)',
                                ttft: 'Mean TTFT (ms)',
                                itl: 'Inter-Token Latency (ms)',
                                tokens_sec: 'Tokens/sec',
                                e2e: 'E2E Latency (ms)',
                                quality: 'Quality Score',
                                qps: 'Queries Per Second'
                            };

                            const yLabels = {
                                output: 'Output Tokens/sec',
                                input: 'Input Tokens/sec',
                                total: 'Total Tokens/sec',
                                qps: 'Queries Per Second',
                                cost: 'Cost ($/1M Tokens)'
                            };

                            const hwPalettes = {
                                'H100': ['#3b82f6', '#60a5fa', '#93c5fd', '#2563eb', '#1d4ed8'],
                                'TPU v6': ['#8b5cf6', '#a78bfa', '#c4b5fd', '#7c3aed', '#6d28d9'],
                                'TPU v5': ['#6366f1', '#818cf8', '#a5b4fc', '#4f46e5', '#4338ca'],
                                'L4': ['#f59e0b', '#fbbf24', '#fcd34d', '#d97706', '#b45309'],
                                'A100': ['#10b981', '#34d399', '#6ee7b7', '#059669', '#047857'],
                            };
                            const defaultColors = ['#38bdf8', '#f472b6', '#34d399', '#fbbf24', '#a78bfa'];
                            
                            const groups = {};
                            visibleZoomData.forEach(pt => {
                                let key = 'Other';
                                if (zoomColorMode === 'hardware') {
                                    key = pt.hardware || 'H100';
                                } else if (zoomColorMode === 'node_config') {
                                    key = `Nodes: ${pt.num_nodes || 4}`;
                                } else if (zoomColorMode === 'model') {
                                    key = pt.model_name || 'Model';
                                }
                                if (!groups[key]) groups[key] = [];
                                groups[key].push(pt);
                            });

                            return (
                                <div className="flex flex-col w-full h-full">
                                    <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/80 flex justify-between items-start gap-6 shadow-sm">
                                        <div className="flex flex-col gap-2.5">
                                            <h3 className="text-lg font-bold text-white">
                                                {`${{
                                                    'ttft': 'TTFT',
                                                    'tpot': 'TPOT',
                                                    'ntpot': 'NTPOT',
                                                    'itl': 'ITL',
                                                    'tokens_sec': 'Tokens/sec',
                                                    'e2e': 'E2E Latency'
                                                }[zoomXAxis] || zoomXAxis} vs ${{
                                                    'output': 'Output Tokens/sec',
                                                    'input': 'Input Tokens/sec',
                                                    'total': 'Total Tokens/sec',
                                                    'qps': 'QPS',
                                                    'cost': 'Cost'
                                                }[zoomYAxis] || zoomYAxis}`}
                                            </h3>
                                            
                                            {/* Benchmark Context Parameters */}
                                            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px]">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-slate-500 font-semibold">Model:</span>
                                                    <span className="font-mono font-bold text-slate-200">{reportsMeta?.model || "Unknown"}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-slate-500 font-semibold">Serving Engine:</span>
                                                    <span className="font-mono font-bold text-slate-200">{reportsMeta?.serving_engine || "Unknown"}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-slate-500 font-semibold">Precision:</span>
                                                    <span className="font-mono font-bold text-slate-200">{reportsMeta?.precision || "Unknown"}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-slate-500 font-semibold">Hardware:</span>
                                                    <span className="font-mono font-bold text-slate-200">{reportsMeta?.hardware || "Unknown"}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <button onClick={() => setZoomedChart(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all flex items-center justify-center cursor-pointer" title="Close View">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                        {/* Expert Mode X/Y Axis Selectors Bar */}
                        <div className={`bg-slate-800/40 border-b border-slate-700/50 px-6 py-3 grid grid-cols-1 md:grid-cols-2 gap-6 items-center ${zoomViewMode === 'standard' ? 'hidden' : ''}`}>
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest w-14">X-Axis:</span>
                                    <div className="flex flex-wrap bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5 gap-0.5">
                                        <button onClick={() => setZoomXAxis('tpot')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomXAxis === 'tpot' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>TPOT</button>
                                        <button onClick={() => setZoomXAxis('ntpot')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomXAxis === 'ntpot' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>NTPOT</button>
                                        <button onClick={() => setZoomXAxis('ttft')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomXAxis === 'ttft' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>TTFT</button>
                                        <button onClick={() => setZoomXAxis('itl')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomXAxis === 'itl' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>ITL</button>
                                        <button onClick={() => setZoomXAxis('tokens_sec')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomXAxis === 'tokens_sec' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Tokens/sec</button>
                                        <button onClick={() => setZoomXAxis('e2e')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomXAxis === 'e2e' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>E2E Latency</button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest w-14">Y-Axis:</span>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="flex bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5 gap-0.5">
                                            <button onClick={() => setZoomYAxis('output')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomYAxis === 'output' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Output</button>
                                            <button onClick={() => setZoomYAxis('input')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomYAxis === 'input' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Input</button>
                                            <button onClick={() => setZoomYAxis('total')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomYAxis === 'total' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Total</button>
                                            <button onClick={() => setZoomYAxis('qps')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomYAxis === 'qps' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>QPS</button>
                                            <button onClick={() => setZoomYAxis('cost')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomYAxis === 'cost' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Cost</button>
                                        </div>
                                        {zoomYAxis === 'cost' && (
                                            <select value={zoomCostMode} onChange={(e) => setZoomCostMode(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg text-[10px] px-2 py-1 text-slate-300 outline-none">
                                                <option value="spot">Spot</option>
                                                <option value="on_demand">On Demand</option>
                                                <option value="cud_1y">1-Year CUD</option>
                                                <option value="cud_3y">3-Year CUD</option>
                                            </select>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className={`flex flex-col gap-3 md:items-end w-full md:w-auto ${zoomViewMode === 'standard' ? 'hidden' : ''}`}>


                                <div className="flex flex-wrap items-center gap-4 justify-end">
                                    <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5">
                                        <button onClick={() => setZoomLogScale(!zoomLogScale)} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomLogScale ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Log Scale</button>
                                        <div className="h-3 w-px bg-slate-700" />
                                        <button onClick={() => setZoomPerChip(!zoomPerChip)} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomPerChip ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`} title="Normalize per Chip">Per Chip</button>
                                    </div>

                                    <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5">
                                        <button onClick={() => setVisiblePercentiles(prev => prev.includes('p50') ? prev.filter(x => x !== 'p50') : [...prev, 'p50'])} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${visiblePercentiles.includes('p50') ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>P50</button>
                                        <button onClick={() => setVisiblePercentiles(prev => prev.includes('p90') ? prev.filter(x => x !== 'p90') : [...prev, 'p90'])} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${visiblePercentiles.includes('p90') ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>P90</button>
                                        <button onClick={() => setVisiblePercentiles(prev => prev.includes('p99') ? prev.filter(x => x !== 'p99') : [...prev, 'p99'])} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${visiblePercentiles.includes('p99') ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>P99</button>
                                    </div>

                                    <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 px-3 py-1 rounded-lg">
                                        <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Cap:</span>
                                        <input type="range" min={0} max={dataMax} step={step} value={currentMax} onChange={(e) => { const val = parseFloat(e.target.value); if (val >= dataMax * 0.99) setZoomXMax(Infinity); else setZoomXMax(val); }} className="w-28 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400" />
                                        <input type="number" value={zoomXMax === Infinity ? '' : zoomXMax} placeholder={dataMax.toFixed(1)} onChange={(e) => { const val = parseFloat(e.target.value); if (!val || isNaN(val)) setZoomXMax(Infinity); else setZoomXMax(val); }} className="w-16 bg-transparent text-[10px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 rounded px-1 text-right font-mono font-bold transition-all" />
                                        <span className="text-[9px] text-slate-500 font-mono font-bold">ms</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                                        <div className="flex-1 min-h-[400px] relative bg-slate-950/30 rounded-xl p-2 border border-slate-800/40 m-4">
                                            {/* Branding Attribution Watermark */}
                                            <div className="absolute bottom-3 right-4 z-10 pointer-events-none opacity-40 flex items-center gap-3">
                                                <span className="text-[12px] font-extrabold text-slate-400">*</span>
                                                <span className="text-[9px] font-extrabold tracking-widest uppercase text-slate-400">Generated via llm-d.ai/Prism</span>
                                            </div>

                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart margin={{ top: 10, right: 20, left: 20, bottom: 60 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                                    <XAxis 
                                                        type="number"
                                                        dataKey="dynamic_x" 
                                                        scale={zoomLogScale ? 'log' : 'auto'} 
                                                        domain={zoomLogScale ? [1, 'auto'] : ['auto', 'auto']} 
                                                        stroke="#64748b" 
                                                        tick={{ fontSize: 12 }}
                                                    >
                                                        <Label value={xLabels[zoomXAxis] || 'Queries Per Second'} position="insideBottom" offset={-20} fill="#94a3b8" fontSize={12} />
                                                    </XAxis>
                                                    <YAxis type="number" dataKey="dynamic_y" stroke="#64748b" tick={{ fontSize: 12 }}>
                                                        <Label value={yLabels[zoomYAxis] || 'Tokens/sec'} angle={-90} position="insideLeft" offset={-5} fill="#94a3b8" fontSize={12} />
                                                    </YAxis>
                                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<RichSchedulingTooltip zoomXAxis={zoomXAxis} zoomYAxis={zoomYAxis} />} />
                                                    <Legend verticalAlign="bottom" wrapperStyle={{ width: '100%', left: '0px', bottom: '0px' }} content={<PercentileGroupedLegend />} />
                                                    {(() => {
                                                        const groups = {};
                                                        visibleZoomData.forEach(pt => {
                                                            const prefix = pt.type === 'baseline' ? 'Standard Kubernetes' : 'Approx. prefix aware routing';
                                                            let key = prefix;
                                                            if (zoomColorMode === 'default') {
                                                                const isPercentileAxis = ['ttft', 'tpot', 'itl', 'ntpot', 'e2e'].includes(zoomXAxis);
                                                                key = isPercentileAxis ? `${prefix} (${pt.percentile.toUpperCase()})` : prefix;
                                                            } else if (zoomColorMode === 'hardware') {
                                                                key = `${prefix} - ${pt.hardware || 'H100'}`;
                                                            } else if (zoomColorMode === 'node_config') {
                                                                key = `${prefix} - Nodes: ${pt.num_nodes || 4}`;
                                                            } else if (zoomColorMode === 'model') {
                                                                key = `${prefix} - ${pt.model_name || 'Model'}`;
                                                            }
                                                            if (!groups[key]) groups[key] = [];
                                                            groups[key].push(pt);
                                                        });

                                                        const defaultColors = ['#38bdf8', '#f472b6', '#34d399', '#fbbf24', '#a78bfa'];
                                                        
                                                        return Object.keys(groups).map((k, idx) => {
                                                            let scatterColor = defaultColors[idx % defaultColors.length];
                                                            if (zoomColorMode === 'default') {
                                                                scatterColor = k.includes('Standard Kubernetes') ? '#fb923c' : '#38bdf8';
                                                            }
                                                            
                                                            let opacity = 1.0;
                                                            let dashArray = "0";
                                                            if (k.includes('P90')) {
                                                                opacity = 0.6;
                                                                dashArray = "5 5";
                                                            } else if (k.includes('P99')) {
                                                                opacity = 0.3;
                                                                dashArray = "2 2";
                                                            }

                                                            return (
                                                                <React.Fragment key={k}>
                                                                    <Line type="monotone" dataKey="dynamic_y" data={groups[k]} stroke={scatterColor} strokeWidth={2} strokeOpacity={opacity} strokeDasharray={dashArray} dot={false} legendType="none" />
                                                                    <Scatter name={k} data={groups[k]} fill={scatterColor} fillOpacity={opacity} />
                                                                </React.Fragment>
                                                            );
                                                        });
                                                    })()}
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Milestone1Dashboard;

