import React, { useState, useEffect } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    ScatterChart, Scatter, ComposedChart, ZAxis, Label, ReferenceArea, ReferenceLine
} from 'recharts';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { CustomXAxis, CustomYAxis, CustomLabel, CustomChartTooltip, ChartCard } from './common';

const RichSchedulingTooltip = ({ active, payload, zoomXAxis, zoomYAxis }) => {
    if (!active || !payload || !payload.length) return null;
    
    const pl = payload[0].payload;
    const hw = pl.hardware || 'H100';
    const model = pl.model_name || 'Model';
    const qpsVal = pl.qps ?? pl.y ?? 'N/A';
    
    const xLabelMap = { tpot: 'TPOT', ntpot: 'NTPOT', ttft: 'TTFT', itl: 'ITL', e2e: 'E2E' };
    const yLabelMap = { output: 'Out Tok/s', input: 'In Tok/s', total: 'Tot Tok/s', qps: 'QPS' };
    
    const xLabel = xLabelMap[zoomXAxis] || 'X';
    const yLabel = yLabelMap[zoomYAxis] || 'Y';

    return (
        <div className="bg-slate-900/95 border border-slate-700/50 rounded-lg shadow-xl p-3 min-w-[220px] backdrop-blur-md text-slate-100 z-[100]">
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

const InferenceSchedulingChart = ({ data, initialXAxis, initialYAxis, initialLogScale }) => {
    const [zoomXAxis, setZoomXAxis] = useState(initialXAxis || 'tpot');
    const [zoomYAxis, setZoomYAxis] = useState(initialYAxis || 'output');
    const [zoomColorMode, setZoomColorMode] = useState('default');
    const [zoomLogScale, setZoomLogScale] = useState(initialLogScale || false);
    const [zoomPerChip, setZoomPerChip] = useState(false);
    const [visiblePercentiles, setVisiblePercentiles] = useState(['p50', 'p90', 'p99']);
    const [zoomXMax, setZoomXMax] = useState(Infinity);
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        if (zoomXAxis === 'ntpot') {
            setZoomLogScale(true);
        }
    }, [zoomXAxis]);

    const derivedZoomData = data
        .flatMap(item => {
            const chipDivisor = zoomPerChip ? 4 : 1;
            
            const parseNum = (val, fallback = 0) => {
                const parsed = parseFloat(val);
                return isNaN(parsed) ? fallback : parsed;
            };

            const b_outputRate = parseNum(item.baseline_output_token_rate, 0);
            const r_outputRate = parseNum(item.router_output_token_rate, 0);
            const b_inputRate = parseNum(item.baseline_input_token_rate, parseNum(item.qps, 0) * 512);
            const r_inputRate = parseNum(item.router_input_token_rate, parseNum(item.qps, 0) * 512);
            
            let b_yVal = b_outputRate;
            if (zoomYAxis === 'input') b_yVal = b_inputRate;
            else if (zoomYAxis === 'total') b_yVal = b_inputRate + b_outputRate;
            else if (zoomYAxis === 'qps') b_yVal = parseNum(item.qps, 0);
            
            let r_yVal = r_outputRate;
            if (zoomYAxis === 'input') r_yVal = r_inputRate;
            else if (zoomYAxis === 'total') r_yVal = r_inputRate + r_outputRate;
            else if (zoomYAxis === 'qps') r_yVal = parseNum(item.qps, 0);
            
            if (zoomPerChip) {
                b_yVal = b_yVal / chipDivisor;
                r_yVal = r_yVal / chipDivisor;
            }
            
            const isPercentileAxis = ['ttft', 'tpot', 'itl', 'ntpot', 'e2e'].includes(zoomXAxis);
            const percentilesToGenerate = isPercentileAxis ? ['p50', 'p90', 'p99'] : ['p50'];
            const res = [];

            percentilesToGenerate.forEach(pKey => {
                const b_tpotVal = parseNum(item[`baseline_tpot_${pKey}`], 20);
                const r_tpotVal = parseNum(item[`router_tpot_${pKey}`], 20);
                const b_ntpotVal = parseNum(item[`baseline_ntpot_${pKey}`], 20);
                const r_ntpotVal = parseNum(item[`router_ntpot_${pKey}`], 20);
                const b_ttftVal = parseNum(item[`baseline_ttft_${pKey}`], 250);
                const r_ttftVal = parseNum(item[`router_ttft_${pKey}`], 250);
                const b_itlVal = parseNum(item[`baseline_itl_${pKey}`], 25);
                const r_itlVal = parseNum(item[`router_itl_${pKey}`], 25);
                
                let b_xVal = parseNum(item.qps, 0);
                if (zoomXAxis === 'tpot') b_xVal = b_tpotVal;
                else if (zoomXAxis === 'ntpot') b_xVal = b_ntpotVal;
                else if (zoomXAxis === 'ttft') b_xVal = b_ttftVal;
                else if (zoomXAxis === 'itl') b_xVal = b_itlVal;
                else if (zoomXAxis === 'tokens_sec') b_xVal = b_outputRate || 1000;
                else if (zoomXAxis === 'e2e') b_xVal = b_ttftVal + b_tpotVal * 128;
                
                let r_xVal = parseNum(item.qps, 0);
                if (zoomXAxis === 'tpot') r_xVal = r_tpotVal;
                else if (zoomXAxis === 'ntpot') r_xVal = r_ntpotVal;
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
    const dataMin = derivedZoomData.length > 0 ? Math.min(...derivedZoomData.filter(d => d.dynamic_x > 0).map(d => d.dynamic_x)) : 1;
    const step = Math.max(0.01, dataMax / 100);
    const currentMax = zoomXMax === Infinity ? dataMax : zoomXMax;
    const isPercentileAxis = ['ttft', 'tpot', 'itl', 'ntpot', 'e2e'].includes(zoomXAxis);
    const visibleZoomData = derivedZoomData.filter(d => d.dynamic_x <= currentMax && (!isPercentileAxis || visiblePercentiles.includes(d.percentile)));

    let logTicks = [];
    if (zoomLogScale) {
        let current = Math.pow(10, Math.floor(Math.log10(Math.max(1, dataMin))));
        const end = Math.pow(10, Math.ceil(Math.log10(dataMax)));
        while (current <= end) {
            logTicks.push(current);
            current *= 10;
        }
    }

    const xLabels = {
        tpot: 'TPOT (ms)',
        ntpot: 'Normalized TPOT (ms)',
        ttft: 'Mean TTFT (ms)',
        itl: 'Inter-Token Latency (ms)',
        e2e: 'E2E Latency (ms)',
        quality: 'Quality Score',
        qps: 'Queries Per Second'
    };

    const yLabels = {
        output: 'Output Tokens/sec',
        input: 'Input Tokens/sec',
        total: 'Total Tokens/sec',
        qps: 'Queries Per Second'
    };

    return (
        <div id="detailed-chart" className="bg-slate-900/80 border border-slate-700/60 rounded-2xl shadow-2xl flex flex-col w-full min-h-[550px] overflow-visible backdrop-blur-sm relative">
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
                                'qps': 'QPS'
                            }[zoomYAxis] || zoomYAxis}`}
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
                                    <span>a3-highgpu-8g</span>
                                    <span>H100</span>
                                    <span className="text-slate-400">(8 replicas)</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-slate-500 font-semibold">Model:</span>
                                <div className="font-mono text-slate-200">
                                    <span className="font-bold">qwen3-32b</span>
                                    <span className="text-slate-400"> (BF16)</span>
                                    <span className="mx-1">•</span>
                                    <span className="font-bold">vllm</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={() => setShowFilters(!showFilters)} 
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all text-[10px] font-extrabold uppercase tracking-widest border border-slate-700/50"
                    >
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
                                <button onClick={() => setZoomXAxis('ntpot')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomXAxis === 'ntpot' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>NTPOT</button>
                                <button onClick={() => setZoomXAxis('tpot')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomXAxis === 'tpot' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>TPOT</button>
                                <button onClick={() => setZoomXAxis('ttft')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomXAxis === 'ttft' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>TTFT</button>
                                <button onClick={() => setZoomXAxis('itl')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomXAxis === 'itl' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>ITL</button>
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
                                </div>
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
                )}

                <div className="flex-1 min-h-[550px] relative bg-slate-950/30 rounded-xl p-2 border border-slate-800/40 m-4 overflow-visible flex flex-col">


                    <div className="relative w-full h-[500px] select-none">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart margin={{ top: 20, right: 30, left: 60, bottom: 45 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} />
                                <CustomXAxis 
                                    type="number" 
                                    dataKey="dynamic_x" 
                                    label={xLabels[zoomXAxis] || 'Queries Per Second'} 
                                    domain={zoomLogScale ? [logTicks[0] || 1, 'auto'] : ['auto', 'auto']}
                                    scale={zoomLogScale ? 'log' : 'auto'}
                                    ticks={zoomLogScale ? logTicks : undefined}
                                    theme="dark"
                                />
                                <CustomYAxis 
                                    label={yLabels[zoomYAxis] || 'Tokens/sec'} 
                                    domain={['auto', 'auto']}
                                    theme="dark"
                                />
                                <Tooltip 
                                    content={<RichSchedulingTooltip zoomXAxis={zoomXAxis} zoomYAxis={zoomYAxis} />}
                                    wrapperStyle={{ outline: 'none', zIndex: 100 }}
                                    cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                                />
                                {(() => {
                                    const groups = {};
                                    visibleZoomData.forEach(pt => {
                                        const prefix = pt.type === 'baseline' ? 'Standard Kubernetes' : 'Approx. prefix aware routing';
                                        let key = prefix;
                                        if (zoomColorMode === 'default') {
                                            key = isPercentileAxis ? `${prefix} (${pt.percentile.toUpperCase()})` : prefix;
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
                                        
                                        let dashArray = "0";
                                        if (k.includes('P90')) {
                                            dashArray = "5 5";
                                        } else if (k.includes('P99')) {
                                            dashArray = "2 2";
                                        }

                                        // Ensure points are in order of Stage
                                        groups[k].sort((a, b) => a.stage - b.stage);

                                        return (
                                            <Line 
                                                key={k}
                                                data={groups[k]}
                                                type="monotone" 
                                                dataKey="dynamic_y" 
                                                name={k} 
                                                stroke={scatterColor} 
                                                strokeDasharray={dashArray}
                                                strokeWidth={2} 
                                                dot={true} 
                                                isAnimationActive={false}
                                            />
                                        );
                                    });
                                })()}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="mt-2 border-t border-slate-700/50 pt-2 px-2">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                Legend
                            </h4>
                        </div>
                        
                        <div className="flex flex-wrap gap-x-8 gap-y-3">
                            {(() => {
                                const groups = {};
                                visibleZoomData.forEach(pt => {
                                    const prefix = pt.type === 'baseline' ? 'Standard Kubernetes' : 'Approx. prefix aware routing';
                                    let key = prefix;
                                    if (zoomColorMode === 'default') {
                                        key = isPercentileAxis ? `${prefix} (${pt.percentile.toUpperCase()})` : prefix;
                                    }
                                    if (!groups[key]) groups[key] = [];
                                    groups[key].push(pt);
                                });

                                const sortedKeys = Object.keys(groups).sort();
                                
                                const scenarios = {
                                    'Approx. prefix aware routing': [],
                                    'Standard Kubernetes': []
                                };
                                
                                sortedKeys.forEach(key => {
                                    if (key.includes('Standard Kubernetes')) {
                                        scenarios['Standard Kubernetes'].push(key);
                                    } else if (key.includes('Approx. prefix aware routing')) {
                                        scenarios['Approx. prefix aware routing'].push(key);
                                    }
                                });

                                return Object.entries(scenarios).map(([scenarioName, keys]) => {
                                    if (keys.length === 0) return null;
                                    
                                    const color = scenarioName.includes('Standard Kubernetes') ? '#fb923c' : '#38bdf8';
                                    
                                    return (
                                        <div key={scenarioName} className="flex flex-col gap-1">
                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{scenarioName}</div>
                                            <div className="flex gap-x-4 gap-y-1 flex-wrap">
                                                {keys.map(key => {
                                                    let percentile = 'P50';
                                                    let dashStyle = 'solid';
                                                    if (key.includes('P90')) { percentile = 'P90'; dashStyle = 'dashed'; }
                                                    else if (key.includes('P99')) { percentile = 'P99'; dashStyle = 'dotted'; }
                                                    
                                                    return (
                                                        <div key={key} className="flex items-center gap-1.5">
                                                            <div className="w-5 h-3 flex items-center">
                                                                <div className="w-full h-0 border-t-2" style={{ borderColor: color, borderStyle: dashStyle }} />
                                                            </div>
                                                            <span className="text-[10px] font-semibold text-slate-300">{percentile}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InferenceSchedulingChart;
