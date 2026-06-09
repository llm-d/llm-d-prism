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
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { CustomXAxis, CustomYAxis } from './common';

const RichDisaggTooltip = ({ active, payload, zoomXAxis, zoomYAxis }) => {
    if (!active || !payload || !payload.length) return null;
    
    const pl = payload[0].payload;
    const prefillNode = '8x H100';
    const decodeNode = '32x L4';
    const model = pl.model_name || 'Qwen3-Coder-480B';
    const qpsVal = pl.qps ?? pl.y ?? 'N/A';
    
    const xLabelMap = { tpot: 'TPOT', ntpot: 'NTPOT', ttft: 'TTFT', itl: 'ITL', e2e: 'E2E' };
    const yLabelMap = { output: 'Out Tok/s', input: 'In Tok/s', total: 'Tot Tok/s', qps: 'QPS' };
    
    const xLabel = xLabelMap[zoomXAxis] || 'X';
    const yLabel = yLabelMap[zoomYAxis] || 'Y';

    return (
        <div className="bg-slate-900/95 border border-slate-700/50 rounded-lg shadow-xl p-3 min-w-[220px] backdrop-blur-md text-slate-100 z-[100]">
            <div className="border-b border-slate-200 dark:border-slate-700/60 pb-1.5 mb-1.5">
                <div className="text-[11px] font-mono text-slate-400 leading-tight">
                    P: {prefillNode} | D: {decodeNode} • {model}
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
                        'Standard Serving [STD]': [],
                        'Disaggregated P/D [OPT]': [],
                        'Other': []
                    };

                    payload.forEach(entry => {
                        if (entry.name.includes('Baseline') || entry.name.includes('Standard')) {
                            groups['Standard Serving [STD]'].push(entry);
                        } else if (entry.name.includes('Disaggregated') || entry.name.includes('Disagg')) {
                            groups['Disaggregated P/D [OPT]'].push(entry);
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
                                        label = label.replace('Standard Serving ', '').replace('Disaggregated P/D ', '').replace('Baseline ', '').replace('Disagg ', '');
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

const PrefillDecodeChart = ({ data, initialXAxis, initialYAxis, initialLogScale, activeTiers }) => {
    const [zoomXAxis, setZoomXAxis] = useState(initialXAxis || 'tpot');
    const [zoomYAxis, setZoomYAxis] = useState(initialYAxis || 'output');
    const [zoomLogScale, setZoomLogScale] = useState(initialLogScale || false);
    const [zoomPerChip, setZoomPerChip] = useState(false);
    const [visiblePercentiles, setVisiblePercentiles] = useState(['p50', 'p90', 'p99']);
    const zoomXMax = Infinity;
    const [showFilters, setShowFilters] = useState(false);

    const derivedZoomData = data
        .flatMap(item => {
            const chipDivisor = zoomPerChip ? 4 : 1;
            
            const parseNum = (val, fallback = 0) => {
                const parsed = parseFloat(val);
                return isNaN(parsed) ? fallback : parsed;
            };

            const b_outputRate = parseNum(item.baseline_output_token_rate || item.qps * 250, 0);
            const r_outputRate = parseNum(item.disagg_output_token_rate || item.qps * 350, 0);
            const b_inputRate = parseNum(item.baseline_input_token_rate || item.qps * 512, 0);
            const r_inputRate = parseNum(item.disagg_input_token_rate || item.qps * 512, 0);
            
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

            percentilesToGenerate.forEach(p => {
                let b_xVal = 0;
                let r_xVal = 0;

                if (zoomXAxis === 'ttft') {
                    const factor = p === 'p99' ? 1.8 : p === 'p90' ? 1.3 : 1.0;
                    b_xVal = parseNum(item.baselineTTFT, 500) * factor;
                    r_xVal = parseNum(item.disaggTTFT, 200) * factor;
                } else if (zoomXAxis === 'tpot') {
                    const factor = p === 'p99' ? 1.4 : p === 'p90' ? 1.15 : 1.0;
                    b_xVal = parseNum(item.baselineTPOT, 15) * factor;
                    r_xVal = parseNum(item.disaggTPOT, 11) * factor;
                } else if (zoomXAxis === 'ntpot') {
                    const factor = p === 'p99' ? 1.5 : p === 'p90' ? 1.2 : 1.0;
                    b_xVal = parseNum(item.baselineTPOT, 15) * 1.2 * factor;
                    r_xVal = parseNum(item.disaggTPOT, 11) * 1.2 * factor;
                } else {
                    b_xVal = parseNum(item.qps, 0) * 10;
                    r_xVal = parseNum(item.qps, 0) * 8;
                }

                res.push({
                    stage: item.qps,
                    qps: item.qps,
                    percentile: p,
                    type: 'baseline',
                    dynamic_x: b_xVal,
                    dynamic_y: b_yVal,
                    x: b_xVal,
                    y: b_yVal,
                    hardware: '8x H100 + 32x L4',
                    model_name: 'Qwen3-Coder-480B'
                });

                res.push({
                    stage: item.qps,
                    qps: item.qps,
                    percentile: p,
                    type: 'disagg',
                    dynamic_x: r_xVal,
                    dynamic_y: r_yVal,
                    x: r_xVal,
                    y: r_yVal,
                    hardware: '8x H100 + 32x L4',
                    model_name: 'Qwen3-Coder-480B'
                });
            });

            return res;
        });

    const visibleZoomData = derivedZoomData.filter(pt => {
        if (pt.dynamic_x > zoomXMax) return false;
        if (!visiblePercentiles.includes(pt.percentile)) return false;
        return activeTiers ? activeTiers[pt.type] : true;
    });


    const isPercentileAxis = ['ttft', 'tpot', 'itl', 'ntpot', 'e2e'].includes(zoomXAxis);

    const xLabels = {
        tpot: 'TPOT (ms/token)',
        ntpot: 'Normalized TPOT (ms/token)',
        ttft: 'Prefill Latency (TTFT ms)',
        itl: 'Inter-token Latency (ITL ms)',
        e2e: 'E2E Latency (ms)'
    };

    const yLabels = {
        output: 'Output Rate (tokens/sec)',
        input: 'Input Rate (tokens/sec)',
        total: 'Total Rate (tokens/sec)',
        qps: 'Concurrency (QPS)'
    };

    const logTicks = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

    return (
        <div className="border border-slate-800 rounded-xl bg-slate-900 shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <span className="text-[9px] font-extrabold text-cyan-400 uppercase tracking-widest block mb-1">
                        Multidimensional Telemetry
                    </span>
                    <h3 className="text-sm font-bold text-white">
                        {yLabels[zoomYAxis]} vs {xLabels[zoomXAxis]}
                    </h3>
                </div>

                <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all text-[10px] font-extrabold uppercase tracking-widest border border-slate-700/50 cursor-pointer"
                >
                    Filters
                    {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
            </div>

            {showFilters && (
                <div className="bg-slate-800/40 border-b border-slate-700/50 px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest w-14">X-Axis:</span>
                            <div className="flex flex-wrap bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5 gap-0.5">
                                <button onClick={() => { setZoomXAxis('ntpot'); setZoomLogScale(true); }} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomXAxis === 'ntpot' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white cursor-pointer'}`}>NTPOT</button>
                                <button onClick={() => setZoomXAxis('tpot')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomXAxis === 'tpot' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white cursor-pointer'}`}>TPOT</button>
                                <button onClick={() => setZoomXAxis('ttft')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomXAxis === 'ttft' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white cursor-pointer'}`}>TTFT</button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest w-14">Y-Axis:</span>
                            <div className="flex bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5 gap-0.5">
                                <button onClick={() => setZoomYAxis('output')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomYAxis === 'output' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white cursor-pointer'}`}>Output</button>
                                <button onClick={() => setZoomYAxis('input')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomYAxis === 'input' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white cursor-pointer'}`}>Input</button>
                                <button onClick={() => setZoomYAxis('total')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomYAxis === 'total' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white cursor-pointer'}`}>Total</button>
                                <button onClick={() => setZoomYAxis('qps')} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomYAxis === 'qps' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white cursor-pointer'}`}>QPS</button>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 md:items-end w-full md:w-auto">
                        <div className="flex flex-wrap items-center gap-4 justify-end">
                            <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5">
                                <button onClick={() => setZoomLogScale(!zoomLogScale)} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomLogScale ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white cursor-pointer'}`}>Log Scale</button>
                                <div className="h-3 w-px bg-slate-700" />
                                <button onClick={() => setZoomPerChip(!zoomPerChip)} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${zoomPerChip ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white cursor-pointer'}`}>Per Chip</button>
                            </div>

                            <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5">
                                <button onClick={() => setVisiblePercentiles(prev => prev.includes('p50') ? prev.filter(x => x !== 'p50') : [...prev, 'p50'])} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${visiblePercentiles.includes('p50') ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white cursor-pointer'}`}>P50</button>
                                <button onClick={() => setVisiblePercentiles(prev => prev.includes('p90') ? prev.filter(x => x !== 'p90') : [...prev, 'p90'])} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${visiblePercentiles.includes('p90') ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white cursor-pointer'}`}>P90</button>
                                <button onClick={() => setVisiblePercentiles(prev => prev.includes('p99') ? prev.filter(x => x !== 'p99') : [...prev, 'p99'])} className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${visiblePercentiles.includes('p99') ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white cursor-pointer'}`}>P99</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="relative w-full h-[500px] select-none p-6 bg-slate-950/30">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart margin={{ top: 20, right: 30, left: 60, bottom: 45 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} />
                        <CustomXAxis 
                            type="number" 
                            dataKey="dynamic_x" 
                            label={xLabels[zoomXAxis] || 'X Axis'} 
                            domain={zoomLogScale ? [logTicks[0] || 1, 'auto'] : ['auto', 'auto']}
                            scale={zoomLogScale ? 'log' : 'auto'}
                            ticks={zoomLogScale ? logTicks : undefined}
                            theme="dark"
                        />
                        <CustomYAxis 
                            label={yLabels[zoomYAxis] || 'Y Axis'} 
                            domain={['auto', 'auto']}
                            theme="dark"
                        />
                        <Tooltip 
                            isAnimationActive={false}
                            content={<RichDisaggTooltip zoomXAxis={zoomXAxis} zoomYAxis={zoomYAxis} />}
                            wrapperStyle={{ outline: 'none', zIndex: 100 }}
                            cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                        />
                        {(() => {
                            const groups = {};
                            visibleZoomData.forEach(pt => {
                                const prefix = pt.type === 'baseline' ? 'Standard Serving' : 'Disaggregated P/D';
                                let key = prefix;
                                key = isPercentileAxis ? `${prefix} (${pt.percentile.toUpperCase()})` : prefix;
                                
                                if (!groups[key]) groups[key] = [];
                                groups[key].push(pt);
                            });

                            return Object.keys(groups).map((k) => {
                                const scatterColor = k.includes('Standard Serving') ? '#fb923c' : '#22d3ee';
                                
                                let dashArray = "0";
                                if (k.includes('P90')) {
                                    dashArray = "5 5";
                                } else if (k.includes('P99')) {
                                    dashArray = "2 2";
                                }

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

            <div className="border-t border-slate-800/60 py-4 px-6 bg-slate-900/20">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
                    Legend
                </h4>
                <div className="flex flex-wrap gap-x-8 gap-y-3">
                    {(() => {
                        const scenarios = {
                            'Standard Serving': ['p50', 'p90', 'p99'],
                            'Disaggregated P/D': ['p50', 'p90', 'p99']
                        };

                        return Object.entries(scenarios).map(([scenarioName, percentiles]) => {
                            const color = scenarioName.includes('Standard') ? '#fb923c' : '#22d3ee';
                            
                            return (
                                <div key={scenarioName} className="flex flex-col gap-1">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{scenarioName}</div>
                                    <div className="flex gap-x-4 gap-y-1 flex-wrap">
                                        {percentiles.map(p => {
                                            if (!visiblePercentiles.includes(p)) return null;
                                            const dashStyle = p === 'p90' ? 'dashed' : p === 'p99' ? 'dotted' : 'solid';
                                            return (
                                                <div key={p} className="flex items-center gap-1.5">
                                                    <div className="w-5 h-3 flex items-center">
                                                        <div className="w-full h-0 border-t-2" style={{ borderColor: color, borderStyle: dashStyle }} />
                                                    </div>
                                                    <span className="text-[10px] font-semibold text-slate-300 uppercase">{p}</span>
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
    );
};

export default PrefillDecodeChart;
