import React, { useState, useEffect } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    ScatterChart, Scatter, ComposedChart, ZAxis, Label, ReferenceArea, ReferenceLine
} from 'recharts';
import IntelligentRoutingChart from './IntelligentRoutingChart';
import { Zap, Download, Copy, Check, Info, ExternalLink, Settings, ShieldAlert, Cpu, Cloud, Server, Bell, Slack, ChevronDown, ChevronUp, Eye, Maximize2, ArrowDown, X, BarChart2, Table } from 'lucide-react';
import { scanInferenceScheduling } from '../utils/gcsScanner';
import { getLocalDashboardRuns } from '../utils/dashboardHelpers';
import { WellLitHeader, Badge, Button, ChartTooltip, ChartTooltipRow, Input, Label as FieldLabel, Modal, Panel, Select, ToggleGroup } from './ui';
import { cn } from '../utils/cn';

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
            <ChartTooltip
                className="font-mono"
                title={<>Request #{data.req_id} <span className={isOptimal ? "text-emerald-400" : "text-slate-400"}>({outcome})</span></>}
            >
                <ChartTooltipRow label="TTFT" value={`${Math.round(data.ttft)}ms`} />
                <p className="text-theme-muted text-[11px] mt-2 pt-2 border-t border-theme-border flex items-center">
                    <Zap className={cn('w-3 h-3 mr-1', isOptimal ? 'text-emerald-500' : 'text-slate-500')} /> {version}
                </p>
            </ChartTooltip>
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
            <ChartTooltip className="font-mono" title={`QPS: ${label}`}>
                <ChartTooltipRow label="standard Kubernetes service" value={Math.round(baseline)} />
                <ChartTooltipRow label="Optimal" value={Math.round(optimal)} />
                {speedup > 0 && (
                    <p className="text-cyan-400 text-[11px] mt-2 pt-2 border-t border-theme-border flex items-center">
                        <Zap className="w-3 h-3 mr-1 text-cyan-500" /> +{Math.round(speedup)}% speedup
                    </p>
                )}
            </ChartTooltip>
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
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="#94a3b8" strokeWidth="2" fill="none" transform="translate(115, -23) scale(0.8)" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="#94a3b8" strokeWidth="2" fill="none" transform="translate(115, -23) scale(0.8)" strokeLinecap="round" strokeLinejoin="round" />
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
        <ChartTooltip
            className="min-w-[220px]"
            title={
                <div className="border-b border-theme-border pb-1.5 mb-1.5">
                    <div className="text-[11px] font-mono font-normal text-theme-muted leading-tight">
                        {hw} • {model}
                    </div>
                    <div className="text-xs font-bold text-theme-text mt-1">
                        QPS: {qpsVal}
                    </div>
                    {pl.interpolated && (
                        <div className="text-[10px] font-normal text-amber-500 font-mono mt-0.5">
                            (Interpolated Curve)
                        </div>
                    )}
                </div>
            }
        >
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
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted border-b border-theme-border pb-0.5 mb-1 flex items-center justify-between">
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
                                        <ChartTooltipRow
                                            key={index}
                                            color={entry.stroke || entry.fill}
                                            label={label}
                                            value={xVal !== undefined && yVal !== undefined ? (
                                                `${xLabel}: ${typeof xVal === 'number' ? xVal.toFixed(1) : xVal} | ${yLabel}: ${typeof yVal === 'number' ? yVal.toFixed(1) : yVal}`
                                            ) : (
                                                `${Number(entry.value ?? xVal).toFixed(1)} ${entry.name.includes('Rate') ? 'tokens/s' : 'ms'}`
                                            )}
                                        />
                                    );
                                })}
                            </div>
                        );
                    });
                })()}
            </div>
        </ChartTooltip>
    );
};



const Milestone1Dashboard = ({ onNavigateBack, onNavigate, onToggleMobileNav, dashboardData }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [gcsData, setGcsData] = useState([]);
    const [reportsMeta, setReportsMeta] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showFilters, setShowFilters] = useState(false);
    const [workloadConfig, setWorkloadConfig] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const reports = await scanInferenceScheduling();
            
            // Get local runs targeting intelligent-routing
            const localRuns = dashboardData?.brv02Runs 
                ? getLocalDashboardRuns(dashboardData.brv02Runs, 'inference-scheduling')
                : [];
            
            const combinedReports = [...reports, ...localRuns];

            const grouped = {};
            combinedReports.forEach(r => {
                if (r.stage === 0) return; // Skip stage 0
                const q = parseFloat(r.qps.toFixed(2));
                if (!grouped[q]) {
                    grouped[q] = { qps: q, stage: r.stage };
                }
                const prefix = r.scenario === 'k8s-service-baseline' ? 'baseline' : 'router';
                grouped[q][`${prefix}_output_token_rate`] = parseFloat(r.output_token_rate.toFixed(2));
                grouped[q][`${prefix}_ttft_p50`] = parseFloat(r.ttft.p50.toFixed(2));
                grouped[q][`${prefix}_ttft_p90`] = parseFloat(r.ttft.p90.toFixed(2));
                grouped[q][`${prefix}_ttft_p99`] = parseFloat(r.ttft.p99.toFixed(2));
                grouped[q][`${prefix}_tpot_p50`] = parseFloat(r.tpot.p50.toFixed(2));
                grouped[q][`${prefix}_tpot_p90`] = parseFloat(r.tpot.p90.toFixed(2));
                grouped[q][`${prefix}_tpot_p99`] = parseFloat(r.tpot.p99.toFixed(2));
                grouped[q][`${prefix}_ntpot_p50`] = parseFloat(r.ntpot.p50.toFixed(2));
                grouped[q][`${prefix}_ntpot_p90`] = parseFloat(r.ntpot.p90.toFixed(2));
                grouped[q][`${prefix}_ntpot_p99`] = parseFloat(r.ntpot.p99.toFixed(2));
                grouped[q][`${prefix}_itl_p50`] = parseFloat(r.itl.p50.toFixed(2));
                grouped[q][`${prefix}_itl_p90`] = parseFloat(r.itl.p90.toFixed(2));
                grouped[q][`${prefix}_itl_p99`] = parseFloat(r.itl.p99.toFixed(2));
            });
            const denseData = Object.values(grouped).sort((a, b) => a.qps - b.qps);

            setGcsData(denseData);
            if (combinedReports && combinedReports.length > 0) {
                setReportsMeta(combinedReports[0]);
            }

            try {
                const configRes = await fetch('https://raw.githubusercontent.com/kubernetes-sigs/inference-perf/main/workload-catalog/interactive-chat/config.json');
                if (configRes.ok) {
                    const config = await configRes.json();
                    setWorkloadConfig(config);
                }
            } catch (e) {
                console.warn('Failed to fetch interactive-chat config:', e);
            }

            setLoading(false);
        };
        fetchData();
    }, [dashboardData?.brv02Runs]);

    const [copied, setCopied] = useState(false);
    const [timeHorizon, setTimeHorizon] = useState('snapshot');
    const [targetQps, setTargetQps] = useState(5);

    const [provider, setProvider] = useState('GCP');
    const [hardware, setHardware] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('hw') || '4x H100 80GB';
    });
    const [showFullProfile, setShowFullProfile] = useState(false);
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
    const [zoomColorMode, setZoomColorMode] = useState('default');
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
            const ntpot99Result = interpolate(qps, baselinePoints, 'baseline_ntpot_p99');
            const tpot99Result = interpolate(qps, baselinePoints, 'baseline_tpot_p99');

            const ttft90Result = interpolate(qps, baselinePoints, 'baseline_ttft_p90');
            const itl90Result = interpolate(qps, baselinePoints, 'baseline_itl_p90');
            const ntpot90Result = interpolate(qps, baselinePoints, 'baseline_ntpot_p90');
            const tpot90Result = interpolate(qps, baselinePoints, 'baseline_tpot_p90');

            const ttft50Result = interpolate(qps, baselinePoints, 'baseline_ttft_p50');
            const itl50Result = interpolate(qps, baselinePoints, 'baseline_itl_p50');
            const ntpot50Result = interpolate(qps, baselinePoints, 'baseline_ntpot_p50');
            const tpot50Result = interpolate(qps, baselinePoints, 'baseline_tpot_p50');

            const outputRateResult = interpolate(qps, baselinePoints, 'baseline_output_token_rate');

            return {
                qps: Math.round(qps * 10) / 10,

                router_ttft_p99: rp.router_ttft_p99,
                router_itl_p99: rp.router_itl_p99,
                router_ntpot_p99: rp.router_ntpot_p99,
                router_tpot_p99: rp.router_tpot_p99,

                router_ttft_p90: rp.router_ttft_p90,
                router_itl_p90: rp.router_itl_p90,
                router_ntpot_p90: rp.router_ntpot_p90,
                router_tpot_p90: rp.router_tpot_p90,

                router_ttft_p50: rp.router_ttft_p50,
                router_itl_p50: rp.router_itl_p50,
                router_ntpot_p50: rp.router_ntpot_p50,
                router_tpot_p50: rp.router_tpot_p50,

                router_output_token_rate: rp.router_output_token_rate,

                baseline_ttft_p99: ttft99Result.value,
                baseline_ttft_p99_interpolated: ttft99Result.interpolated,
                baseline_itl_p99: itl99Result.value,
                baseline_itl_p99_interpolated: itl99Result.interpolated,
                baseline_ntpot_p99: ntpot99Result.value,
                baseline_ntpot_p99_interpolated: ntpot99Result.interpolated,
                baseline_tpot_p99: tpot99Result.value,
                baseline_tpot_p99_interpolated: tpot99Result.interpolated,

                baseline_ttft_p90: ttft90Result.value,
                baseline_ttft_p90_interpolated: ttft90Result.interpolated,
                baseline_itl_p90: itl90Result.value,
                baseline_itl_p90_interpolated: itl90Result.interpolated,
                baseline_ntpot_p90: ntpot90Result.value,
                baseline_ntpot_p90_interpolated: ntpot90Result.interpolated,
                baseline_tpot_p90: tpot90Result.value,
                baseline_tpot_p90_interpolated: tpot90Result.interpolated,

                baseline_ttft_p50: ttft50Result.value,
                baseline_ttft_p50_interpolated: ttft50Result.interpolated,
                baseline_itl_p50: itl50Result.value,
                baseline_itl_p50_interpolated: itl50Result.interpolated,
                baseline_ntpot_p50: ntpot50Result.value,
                baseline_ntpot_p50_interpolated: ntpot50Result.interpolated,
                baseline_tpot_p50: tpot50Result.value,
                baseline_tpot_p50_interpolated: tpot50Result.interpolated,

                baseline_output_token_rate: outputRateResult.value
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
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center pt-16 md:pl-24 w-full font-sans relative overflow-hidden bg-[radial-gradient(#334155_1.2px,transparent_1.2px)] bg-[size:24px_24px] bg-repeat">
            {/* Pulsing Vibrant Neon Glow Background Shapes */}
            <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-blue-600/25 rounded-full blur-3xl pointer-events-none animate-pulse" />
            <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-emerald-600/25 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />

            {/* Top Navigation Bar - Fully Fixed for 100% Scroll Independence */}
            <WellLitHeader
                pageTitle="Intelligent routing"
                onNavigateBack={onNavigateBack}
                onToggleMobileNav={onToggleMobileNav}
                getShareUrl={() => {
                    const params = new URLSearchParams();
                    params.set('share', '1');
                    params.set('view', 'intelligent-routing');
                    params.set('hw', hardware);
                    params.set('scale', latencyScale);
                    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
                }}
            />

            <main className="w-full max-w-7xl px-6 py-8 flex flex-col space-y-8 z-10 relative">
                {/* Description Card - Premium Aesthetic */}
                <div className="relative overflow-hidden border border-slate-800/80 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-slate-950/90 p-4 shadow-2xl backdrop-blur-xl group transition-all duration-500 hover:border-emerald-500/30">
                    {/* Ambient glowing background orb */}
                    <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all duration-700 pointer-events-none" />
                    <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl group-hover:bg-cyan-500/20 transition-all duration-700 pointer-events-none" />

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 relative">
                        {/* Col 1: Overview */}
                        <div className="flex flex-col justify-between space-y-3">
                            <div>
                                <div className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-widest mb-2">Overview</div>
                                <p className="text-sm text-slate-400 leading-relaxed">
                                    These variants of Intelligent Routing optimize request routing to maximize performance. By leveraging GKE Inference Gateway, real-time cache state introspection or machine-learned latency predictions, they reduce tail latency, increase throughput, and improve cache hit rates across distributed model servers.
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
                                    <div className="text-xs font-semibold text-slate-200">K8s Service (Reference)</div>
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
                                    <a href="https://github.com/llm-d/llm-d/tree/main/guides/optimized-baseline" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors flex items-center space-x-1">
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
                                    <a href="https://github.com/llm-d/llm-d/tree/main/guides/precise-prefix-cache-routing" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors flex items-center space-x-1">
                                        <span className="text-[10px]">Guide</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <Badge tone="warning" size="xs">Coming Soon</Badge>
                                </div>
                            </div>

                            {/* Opt 3: Disabled */}
                            <div className="border border-slate-800/50 rounded-lg bg-slate-900/30 p-2 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-semibold text-slate-400">Predicted Latency Balancing</div>
                                    <p className="text-[10px] text-slate-500">Machine learning guided routing</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <a href="https://github.com/llm-d/llm-d/tree/main/guides/predicted-latency-routing" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors flex items-center space-x-1">
                                        <span className="text-[10px]">Guide</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <Badge tone="warning" size="xs">Coming Soon</Badge>
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
                            {/* Column 1: Infra Layer */}
                            <div className="flex flex-col gap-3 border-r border-slate-800/60 pr-4">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                    Infra Layer
                                </div>
                                <div className="flex flex-col gap-2.5">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Provider / Machine Type</span>
                                        <div className="flex items-center gap-1.5 font-mono font-bold text-white text-xs">
                                            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                            </svg>
                                            a3-highgpu-8g
                                        </div>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Accelerator</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">H100</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Replicas</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">8</span>
                                    </div>
                                </div>
                            </div>

                            {/* Column 2: Model Serving Layer */}
                            <div className="flex flex-col gap-3 border-r border-slate-800/60 pr-4">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                    Model Serving Layer
                                </div>
                                <div className="flex flex-col gap-2.5">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Model Name</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">qwen3-32B (BF16)</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Parallelism Strategy</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">TP: 2</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Serving Engine</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">vLLM</span>
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
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Test Harness</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">inference-perf</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Catalog Use Case</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">Interactive Chat</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Input / Output Sequence Length</span>
                                        <span className="font-mono font-bold text-white truncate block text-xs">
                                            {workloadConfig 
                                                ? `${workloadConfig.input_sequence_length.mean} / ${workloadConfig.output_sequence_length.max}`
                                                : "7200 / 1000"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CARD 2: Primary Outcomes Metric */}
                    <div
                        className="lg:col-span-3 border border-slate-800 rounded-xl bg-slate-900 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-emerald-500/30 transition-all"
                    >
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none transition-all group-hover:bg-emerald-500/10" />
                        <div>
                            <div className="text-[11px] font-extrabold text-emerald-400/90 uppercase tracking-widest mb-3 flex justify-between items-center">
                                Primary Outcomes
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        document.getElementById('summary-table')?.scrollIntoView({ behavior: 'smooth' });
                                    }}
                                    className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer normal-case font-semibold"
                                >
                                    View Table
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-1.5 hover:border-emerald-500/20 transition-all grid grid-rows-[55px_1fr] h-[140px]">
                                    <div className="flex flex-col justify-start">
                                        <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">
                                            Latency Reduction
                                        </h3>
                                        <div className="text-[10px] text-slate-400 font-normal uppercase">
                                            (TTFT P50)
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-center">
                                        <h4 className="text-4xl font-black text-emerald-400 flex items-baseline tracking-tight">
                                            {(() => {
                                                const validRows = tableData.filter(r => r.baseline_ttft_p50 > 0 && r.router_ttft_p50 > 0);
                                                if (validRows.length === 0) return "41%";
                                                const r = validRows[validRows.length - 1];
                                                const gain = ((r.baseline_ttft_p50 - r.router_ttft_p50) / r.baseline_ttft_p50) * 100;
                                                return `${Math.floor(gain)}%`;
                                            })()}
                                        </h4>
                                    </div>
                                </div>
                                <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-1.5 hover:border-cyan-500/20 transition-all grid grid-rows-[55px_1fr] h-[140px]">
                                    <div className="flex flex-col justify-start">
                                        <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">
                                            Throughput Increase
                                        </h3>
                                        <div className="text-[10px] text-slate-400 font-normal uppercase">
                                            (Output Tokens/sec)
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-center">
                                        <h4 className="text-4xl font-black text-cyan-400 flex items-baseline tracking-tight">
                                            {(() => {
                                                const validRows = tableData.filter(r => r.baseline_output_token_rate > 0 && r.router_output_token_rate > 0);
                                                if (validRows.length === 0) return "0%";
                                                const r = validRows[validRows.length - 1];
                                                const gain = ((r.router_output_token_rate - r.baseline_output_token_rate) / r.baseline_output_token_rate) * 100;
                                                return `${Math.floor(gain)}%`;
                                            })()}
                                        </h4>
                                    </div>
                                </div>
                            </div>
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
                            <p className="text-sm text-slate-500 leading-relaxed">
                                Replicate these Intelligent Routing benchmarks directly on your Kubernetes evaluation cluster.
                            </p>
                        </div>

                        <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)} className="w-full mt-3 py-2 font-semibold">
                            <Zap className="w-3.5 h-3.5" /> View instructions
                        </Button>
                    </div>
                </div>

                <div className="flex flex-col gap-6 w-full">
                    <IntelligentRoutingChart data={additionalChartData} initialXAxis="ntpot" />
                    <IntelligentRoutingChart data={additionalChartData} initialXAxis="ttft" initialLogScale={true} />
                </div>

                {/* Summary Metrics Table */}
                <Panel id="summary-table" className="flex flex-col h-[32rem]">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-md font-bold text-white">Summary metrics comparison</h3>
                            <span className="text-xs text-slate-500">Comparing Standard workloads against Approx. prefix aware routing workloads side-by-side.</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <ToggleGroup
                                options={[
                                    { value: 'ttft', label: 'TTFT' },
                                    { value: 'itl', label: 'ITL' },
                                    { value: 'ntpot', label: 'NTPOT' },
                                    { value: 'tpot', label: 'TPOT' },
                                ]}
                                value={tableMetricMode}
                                onChange={setTableMetricMode}
                            />
                            <ToggleGroup
                                options={[
                                    { value: 'P50', label: 'P50' },
                                    { value: 'P90', label: 'P90' },
                                    { value: 'P99', label: 'P99' },
                                ]}
                                value={selectedPercentile}
                                onChange={setSelectedPercentile}
                            />
                            <Button variant="secondary" size="sm" onClick={exportToCSV}>
                                Export CSV
                            </Button>
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
                                        let base, opt;
                                        if (tableMetricMode === 'ttft') {
                                            base = selectedPercentile === 'P50' ? row.baseline_ttft_p50 : selectedPercentile === 'P90' ? row.baseline_ttft_p90 : row.baseline_ttft_p99;
                                            opt = selectedPercentile === 'P50' ? row.router_ttft_p50 : selectedPercentile === 'P90' ? row.router_ttft_p90 : row.router_ttft_p99;
                                        } else if (tableMetricMode === 'itl') {
                                            base = selectedPercentile === 'P50' ? row.baseline_itl_p50 : selectedPercentile === 'P90' ? row.baseline_itl_p90 : row.baseline_itl_p99;
                                            opt = selectedPercentile === 'P50' ? row.router_itl_p50 : selectedPercentile === 'P90' ? row.router_itl_p90 : row.router_itl_p99;
                                        } else if (tableMetricMode === 'ntpot') {
                                            base = selectedPercentile === 'P50' ? row.baseline_ntpot_p50 : selectedPercentile === 'P90' ? row.baseline_ntpot_p90 : row.baseline_ntpot_p99;
                                            opt = selectedPercentile === 'P50' ? row.router_ntpot_p50 : selectedPercentile === 'P90' ? row.router_ntpot_p90 : row.router_ntpot_p99;
                                        } else if (tableMetricMode === 'tpot') {
                                            base = selectedPercentile === 'P50' ? row.baseline_tpot_p50 : selectedPercentile === 'P90' ? row.baseline_tpot_p90 : row.baseline_tpot_p99;
                                            opt = selectedPercentile === 'P50' ? row.router_tpot_p50 : selectedPercentile === 'P90' ? row.router_tpot_p90 : row.router_tpot_p99;
                                        }

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
                                                <Badge
                                                    tone={row.gain > 0 ? 'success' : row.gain < 0 ? 'danger' : 'neutral'}
                                                    size="md"
                                                    className="text-[11px] rounded-full"
                                                >
                                                    {row.gain > 0 ? `+${Math.round(row.gain)}%` : row.gain < 0 ? `${Math.round(row.gain)}%` : '0%'}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ));
                                })()}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            </main>

            {/* Reproduction Modal Workflow */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                closeOnBackdrop={false}
                closeOnEscape={false}
                size="lg"
                title={
                    <span className="flex items-center">
                        <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg mr-3">
                            <Zap className="w-5 h-5" />
                        </span>
                        Reproducibility Instructions
                    </span>
                }
                subtitle="Execute this exact benchmark profile on your cluster."
                footer={
                    <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
                        Close
                    </Button>
                }
            >
                <div className="mb-2">
                    <h4 className="text-sm font-semibold text-slate-300 mb-1">Reference Documentation</h4>
                    <p className="text-xs text-slate-400">
                        For deep architectural specifications, view the full instructions directly on our repository:
                    </p>
                    <a href="https://github.com/llm-d/llm-d/tree/main/guides/optimized-baseline" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center text-xs font-bold text-cyan-400 hover:underline">
                        View complete guide <ExternalLink className="w-3.5 h-3.5 ml-1" />
                    </a>
                </div>
            </Modal>

            {/* SLA Alert Modal Mock */}
            <Modal
                isOpen={isAlertModalOpen}
                onClose={() => setIsAlertModalOpen(false)}
                closeOnBackdrop={false}
                closeOnEscape={false}
                size="md"
                title={
                    <span className="flex items-center">
                        <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg mr-3">
                            <Bell className="w-5 h-5 cursor-pointer" />
                        </span>
                        Create SLA Alert
                    </span>
                }
                subtitle="Notifies your team when performance drops."
                footer={
                    <>
                        {alertSaved && <span className="text-xs font-medium text-emerald-500 mr-2 animate-in fade-in slide-in-from-right-4">Alert Saved!</span>}
                        <Button variant="secondary" size="sm" onClick={() => setIsAlertModalOpen(false)}>Cancel</Button>
                        <button onClick={handleSaveAlert} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-xs transition-colors shadow-sm flex items-center border border-indigo-500 line-clamp-1">
                            Save Alert Condition
                        </button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div>
                        <FieldLabel>Condition</FieldLabel>
                        <div className="flex items-center space-x-2 text-sm text-slate-300 bg-slate-950 p-2.5 rounded border border-slate-800">
                            <span className="font-mono text-emerald-400">P99 TTFT</span>
                            <span> exceeds </span>
                            <Input type="number" defaultValue={450} className="w-16 px-2 py-0.5 text-center" />
                            <span>ms</span>
                        </div>
                    </div>

                    <div>
                        <FieldLabel>Duration</FieldLabel>
                        <div className="flex items-center space-x-2 text-sm text-slate-300">
                            <span>For</span>
                            <Select className="w-auto px-2 py-1">
                                <option>2 consecutive days</option>
                                <option>3 consecutive days</option>
                                <option>1 week</option>
                            </Select>
                        </div>
                    </div>

                    <div className="pt-2">
                        <FieldLabel>Routing</FieldLabel>
                        <button className="w-full flex items-center justify-between p-3 border border-indigo-500/30 bg-indigo-500/10 rounded-lg hover:bg-indigo-500/20 transition-colors">
                            <div className="flex items-center">
                                <Slack className="w-4 h-4 text-indigo-400 mr-2" />
                                <span className="text-sm font-medium text-slate-200">#ops-alerts-inference</span>
                            </div>
                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        </button>
                    </div>
                </div>
            </Modal>

        </div>
    );
};

export default Milestone1Dashboard;

