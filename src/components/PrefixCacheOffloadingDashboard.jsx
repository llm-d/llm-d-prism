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
    LineChart, Line, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { 
    ArrowLeft, Menu, Share2, Zap, Download, Info, 
    ExternalLink, Cpu, Server, Layers, HardDrive, ChevronDown, ChevronUp, Check, MessageCircle
} from 'lucide-react';
import { CustomXAxis, CustomYAxis } from './common';

// Synthesized Curve Datasets (Throughput vs Latency/Cost)
const CURVE_DATASETS = {
    '1k': [
        { throughput: 500, baselineTTFT: 40, cpuTTFT: 50, ssdTTFT: 65, baselineITL: 10, cpuITL: 12, ssdITL: 15, baselineE2E: 250, cpuE2E: 310, ssdE2E: 380 },
        { throughput: 1000, baselineTTFT: 55, cpuTTFT: 65, ssdTTFT: 80, baselineITL: 12, cpuITL: 14, ssdITL: 18, baselineE2E: 320, cpuE2E: 390, ssdE2E: 470 },
        { throughput: 2000, baselineTTFT: 80, cpuTTFT: 95, ssdTTFT: 115, baselineITL: 15, cpuITL: 18, ssdITL: 22, baselineE2E: 450, cpuE2E: 550, ssdE2E: 650 },
        { throughput: 3000, baselineTTFT: 120, cpuTTFT: 145, ssdTTFT: 170, baselineITL: 20, cpuITL: 24, ssdITL: 28, baselineE2E: 650, cpuE2E: 790, ssdE2E: 920 },
        { throughput: 4000, baselineTTFT: 200, cpuTTFT: 230, ssdTTFT: 260, baselineITL: 28, cpuITL: 32, ssdITL: 38, baselineE2E: 1050, cpuE2E: 1250, ssdE2E: 1450 },
    ],
    '5k': [
        { throughput: 500, baselineTTFT: 90, cpuTTFT: 110, ssdTTFT: 130, baselineITL: 12, cpuITL: 15, ssdITL: 18, baselineE2E: 450, cpuE2E: 550, ssdE2E: 650 },
        { throughput: 1000, baselineTTFT: 130, cpuTTFT: 150, ssdTTFT: 175, baselineITL: 15, cpuITL: 18, ssdITL: 22, baselineE2E: 650, cpuE2E: 750, ssdE2E: 880 },
        { throughput: 1500, baselineTTFT: 190, cpuTTFT: 210, ssdTTFT: 240, baselineITL: 20, cpuITL: 23, ssdITL: 27, baselineE2E: 950, cpuE2E: 1050, ssdE2E: 1200 },
        { throughput: 2000, baselineTTFT: 290, cpuTTFT: 280, ssdTTFT: 310, baselineITL: 26, cpuITL: 28, ssdITL: 32, baselineE2E: 1450, cpuE2E: 1400, ssdE2E: 1550 },
        { throughput: 2500, baselineTTFT: 480, cpuTTFT: 370, ssdTTFT: 400, baselineITL: 36, cpuITL: 34, ssdITL: 39, baselineE2E: 2400, cpuE2E: 1850, ssdE2E: 2000 },
        { throughput: 3000, baselineTTFT: null, cpuTTFT: 500, ssdTTFT: 520, baselineITL: null, cpuITL: 42, ssdITL: 48, baselineE2E: null, cpuE2E: 2500, ssdE2E: 2600 },
    ],
    '10k': [
        { throughput: 200, baselineTTFT: 150, cpuTTFT: 180, ssdTTFT: 200, baselineITL: 15, cpuITL: 18, ssdITL: 20, baselineE2E: 600, cpuE2E: 720, ssdE2E: 800 },
        { throughput: 500, baselineTTFT: 200, cpuTTFT: 220, ssdTTFT: 240, baselineITL: 18, cpuITL: 20, ssdITL: 22, baselineE2E: 740, cpuE2E: 820, ssdE2E: 900 },
        { throughput: 800, baselineTTFT: 280, cpuTTFT: 270, ssdTTFT: 290, baselineITL: 22, cpuITL: 23, ssdITL: 25, baselineE2E: 940, cpuE2E: 960, ssdE2E: 1040 },
        { throughput: 1000, baselineTTFT: 380, cpuTTFT: 310, ssdTTFT: 320, baselineITL: 26, cpuITL: 25, ssdITL: 26, baselineE2E: 1160, cpuE2E: 1060, ssdE2E: 1100 },
        { throughput: 1200, baselineTTFT: 650, cpuTTFT: 360, ssdTTFT: 350, baselineITL: 35, cpuITL: 27, ssdITL: 28, baselineE2E: 1700, cpuE2E: 1170, ssdE2E: 1190 },
        { throughput: 1400, baselineTTFT: null, cpuTTFT: 420, ssdTTFT: 390, baselineITL: null, cpuITL: 30, ssdITL: 30, baselineE2E: null, cpuE2E: 1320, ssdE2E: 1290 },
        { throughput: 1600, baselineTTFT: null, cpuTTFT: 520, ssdTTFT: 430, baselineITL: null, cpuITL: 34, ssdITL: 32, baselineE2E: null, cpuE2E: 1540, ssdE2E: 1390 },
        { throughput: 1800, baselineTTFT: null, cpuTTFT: 750, ssdTTFT: 480, baselineITL: null, cpuITL: 42, ssdITL: 35, baselineE2E: null, cpuE2E: 2010, ssdE2E: 1530 },
        { throughput: 2000, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 550, baselineITL: null, cpuITL: null, ssdITL: 38, baselineE2E: null, cpuE2E: null, ssdE2E: 1690 },
        { throughput: 2200, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 700, baselineITL: null, cpuITL: null, ssdITL: 42, baselineE2E: null, cpuE2E: null, ssdE2E: 1960 },
    ],
    '50k': [
        { throughput: 200, baselineTTFT: 850, cpuTTFT: 320, ssdTTFT: 350, baselineITL: 45, cpuITL: 26, ssdITL: 28, baselineE2E: 2200, cpuE2E: 1100, ssdE2E: 1190 },
        { throughput: 400, baselineTTFT: 1800, cpuTTFT: 380, ssdTTFT: 390, baselineITL: 65, cpuITL: 28, ssdITL: 30, baselineE2E: 3750, cpuE2E: 1220, ssdE2E: 1290 },
        { throughput: 500, baselineTTFT: null, cpuTTFT: 420, ssdTTFT: 410, baselineITL: null, cpuITL: 30, ssdITL: 31, baselineE2E: null, cpuE2E: 1320, ssdE2E: 1340 },
        { throughput: 800, baselineTTFT: null, cpuTTFT: 550, ssdTTFT: 480, baselineITL: null, cpuITL: 35, ssdITL: 33, baselineE2E: null, cpuE2E: 1600, ssdE2E: 1470 },
        { throughput: 1000, baselineTTFT: null, cpuTTFT: 720, ssdTTFT: 530, baselineITL: null, cpuITL: 42, ssdITL: 35, baselineE2E: null, cpuE2E: 1980, ssdE2E: 1580 },
        { throughput: 1200, baselineTTFT: null, cpuTTFT: 1100, ssdTTFT: 600, baselineITL: null, cpuITL: 55, ssdITL: 38, baselineE2E: null, cpuE2E: 2750, ssdE2E: 1740 },
        { throughput: 1400, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 690, baselineITL: null, cpuITL: null, ssdITL: 41, baselineE2E: null, cpuE2E: null, ssdE2E: 1920 },
        { throughput: 1600, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 820, baselineITL: null, cpuITL: null, ssdITL: 45, baselineE2E: null, cpuE2E: null, ssdE2E: 2170 },
        { throughput: 1900, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 1150, baselineITL: null, cpuITL: null, ssdITL: 52, baselineE2E: null, cpuE2E: null, ssdE2E: 2710 },
    ],
    '100k': [
        { throughput: 200, baselineTTFT: null, cpuTTFT: 1200, ssdTTFT: 650, baselineITL: null, cpuITL: 58, ssdITL: 38, baselineE2E: null, cpuE2E: 2940, ssdE2E: 1790 },
        { throughput: 400, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 720, baselineITL: null, cpuITL: null, ssdITL: 41, baselineE2E: null, cpuE2E: null, ssdE2E: 1950 },
        { throughput: 600, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 810, baselineITL: null, cpuITL: null, ssdITL: 44, baselineE2E: null, cpuE2E: null, ssdE2E: 2130 },
        { throughput: 800, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 930, baselineITL: null, cpuITL: null, ssdITL: 48, baselineE2E: null, cpuE2E: null, ssdE2E: 2370 },
        { throughput: 1000, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 1100, baselineITL: null, cpuITL: null, ssdITL: 53, baselineE2E: null, cpuE2E: null, ssdE2E: 2690 },
        { throughput: 1200, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 1350, baselineITL: null, cpuITL: null, ssdITL: 60, baselineE2E: null, cpuE2E: null, ssdE2E: 3150 },
        { throughput: 1500, baselineTTFT: null, cpuTTFT: null, ssdTTFT: 1800, baselineITL: null, cpuITL: null, ssdITL: 72, baselineE2E: null, cpuE2E: null, ssdE2E: 3960 },
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

const RichPrefixCacheTooltip = ({ active, payload, xMetric, yMetric, viewMode, workloadSize }) => {
    if (!active || !payload || !payload.length) return null;
    
    const pl = payload[0].payload;
    const unit = viewMode === 'cost' ? '$ per 1M tokens' : 'ms';

    const xLabels = {
        output: 'Output',
        input: 'Input',
        total: 'Total',
        qps: 'QPS'
    };
    
    const yLabels = {
        ntpot: 'NTPOT',
        tpot: 'TPOT',
        ttft: 'TTFT',
        itl: 'ITL',
        e2e: 'E2E'
    };

    const xLabel = xLabels[xMetric] || 'Throughput';
    const yLabel = yLabels[yMetric] || 'Latency';

    return (
        <div className="bg-slate-900/95 border border-slate-700/50 rounded-lg shadow-xl p-3 min-w-[220px] backdrop-blur-md text-slate-100 z-[100]">
            <div className="border-b border-slate-700/60 pb-1.5 mb-1.5">
                <div className="text-[11px] font-mono text-slate-400 leading-tight">
                    g4-standard-384 • gemma4-31B (FP8)
                </div>
                <div className="text-xs font-bold text-white mt-1">
                    Context Scale: {workloadSize}
                </div>
            </div>

            <div className="space-y-3">
                {(() => {
                    const groups = {
                        'Baseline (HBM Only)': [],
                        'Tiered Cache: CPU RAM': [],
                        'Tiered Cache: Managed Lustre / SSD': [],
                        'Other': []
                    };

                    payload.forEach(entry => {
                        if (entry.name.includes('Baseline')) {
                            groups['Baseline (HBM Only)'].push(entry);
                        } else if (entry.name.includes('CPU RAM')) {
                            groups['Tiered Cache: CPU RAM'].push(entry);
                        } else if (entry.name.includes('Lustre') || entry.name.includes('SSD')) {
                            groups['Tiered Cache: Managed Lustre / SSD'].push(entry);
                        } else {
                            groups['Other'].push(entry);
                        }
                    });

                    return Object.entries(groups).map(([groupName, items]) => {
                        if (items.length === 0) return null;

                        return (
                            <div key={groupName} className="space-y-1">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-0.5 mb-1 flex items-center justify-between">
                                    <span>{groupName}</span>
                                </div>
                                {items.map((entry, index) => {
                                    const epl = entry.payload;
                                    const xVal = epl.x ?? epl.throughput;
                                    const yVal = epl.y ?? entry.value;
                                    
                                    let label = entry.name;
                                    // Extract percentile from name
                                    const percentile = label.match(/P\d+/)?.[0] || 'P50';

                                    return (
                                        <div key={index} className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-1.5">
                                                <svg className="w-4 h-2 shrink-0" viewBox="0 0 16 8">
                                                    <line 
                                                        x1="0" y1="4" x2="16" y2="4" 
                                                        stroke={entry.stroke || entry.fill || '#38bdf8'} 
                                                        strokeWidth="2" 
                                                        strokeDasharray={percentile === 'P90' ? '4 3' : percentile === 'P99' ? '2 2' : 'none'} 
                                                    />
                                                </svg>
                                                <span className="text-[11px] text-slate-200 font-medium">{percentile}</span>
                                            </div>
                                            <span className="text-[11px] font-mono font-bold text-white">
                                                {xVal !== undefined && yVal !== undefined ? (
                                                    `${xLabel}: ${typeof xVal === 'number' ? xVal.toFixed(0) : xVal} | ${yLabel}: ${typeof yVal === 'number' ? yVal.toFixed(0) : yVal} ${unit}`
                                                ) : (
                                                    `${Number(entry.value).toFixed(0)} ${unit}`
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

export default function PrefixCacheOffloadingDashboard({ onNavigateBack, onToggleMobileNav }) {
    const [shareToast, setShareToast] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [openFAQIndex, setOpenFAQIndex] = useState(null);
    
    // Primary Controls State
    const [workloadSize, setWorkloadSize] = useState('1k'); // '1k' | '5k' | '10k' | '50k' | '100k'
    const [activeTiers, setActiveTiers] = useState({
        baseline: true,
        cpu: true,
        ssd: true
    });
    const [targetMetric, setTargetMetric] = useState('TTFT'); // 'TTFT' | 'ITL' | 'E2E'
    
    // Progressive Disclosure State
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showSlo, setShowSlo] = useState(false);
    const [sloLimit, setSloLimit] = useState(500);
    const [viewMode, setViewMode] = useState('performance'); // 'performance' | 'cost'
    
    // CUJ 2 AI Integration State
    const [openFaq, setOpenFaq] = useState(0);
    const [agentCopied, setAgentCopied] = useState(false);
    const [agentNote, setAgentNote] = useState('');
    
    // Chart Filters Pattern State
    const [showChartFilters, setShowChartFilters] = useState(true);
    const [tputCap, setTputCap] = useState(4000);
    const [xAxisMode, setXAxisMode] = useState('throughput');
    const [isLogScaleX, setIsLogScaleX] = useState(false);
    const [showPerChip, setShowPerChip] = useState(false);
    const [visiblePercentiles, setVisiblePercentiles] = useState(['P50', 'P90', 'P99']);
    const [xMetric, setXMetric] = useState('output'); // 'output' | 'input' | 'total' | 'qps'
    const [yMetric, setYMetric] = useState('ttft'); // 'ntpot' | 'tpot' | 'ttft' | 'itl' | 'e2e'
    
    // Elite UX Enhancements State
    const [kvQuantization, setKvQuantization] = useState('FP8'); // 'FP16' | 'FP8' | 'INT4'
    const [isAgentPanelOpen, setIsAgentPanelOpen] = useState(false);
    const [showPayloadPreview, setShowPayloadPreview] = useState(false);

    const handleExportData = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(chartData, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `prefix_cache_telemetry_${workloadSize}_${targetMetric}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    };

    const handleShareView = () => {
        navigator.clipboard.writeText(window.location.href);
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2000);
    };

    const handleShareAgent = () => {
        const payload = {
            scenario: "Tiered Prefix Cache Offloading",
            hardware: "g4-standard-384 (8x rtx-pro-6000)",
            model: "gemma4-31B (FP8)",
            workloadSize: workloadSize,
            targetMetric: targetMetric,
            activeOptimizations: Object.keys(activeTiers).filter(k => activeTiers[k]),
            userCustomNote: agentNote,
            engineMetadata: {
                vllmVersion: "v0.7.2-fs",
                plugins: ["LMCache", "tpu-inference"],
                lustreDirectIO: "o_direct",
                ioParallelism: "Tuned 16MB"
            }
        };
        navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        setAgentCopied(true);
        setTimeout(() => setAgentCopied(false), 2500);
    };


    // Process data based on selected metric and view mode (Performance vs Cost)
    // Process data based on selected metric and view mode (Performance vs Cost)
    const { baselineSeries, baselineSeriesP90, baselineSeriesP99, cpuSeries, cpuSeriesP90, cpuSeriesP99, ssdSeries, ssdSeriesP90, ssdSeriesP99, allSeriesData, chartData } = useMemo(() => {
        const rawData = CURVE_DATASETS[workloadSize] || [];
        const bSeries = [];
        const bSeriesP90 = [];
        const bSeriesP99 = [];
        const cSeries = [];
        const cSeriesP90 = [];
        const cSeriesP99 = [];
        const sSeries = [];
        const sSeriesP90 = [];
        const sSeriesP99 = [];
        
        const processed = rawData.map(d => {
            const baseThroughput = d.throughput;
            
            const calcCost = (costPerHour) => {
                if (baseThroughput === 0) return null;
                return Math.round((costPerHour / (baseThroughput * 3600)) * 1000000);
            };

            // Derive X value
            let xVal = baseThroughput;
            if (xMetric === 'input') xVal = baseThroughput * 0.8;
            else if (xMetric === 'total') xVal = baseThroughput * 1.8;
            else if (xMetric === 'qps') xVal = baseThroughput / 100;

            let baselineVal = null;
            let cpuVal = null;
            let ssdVal = null;

            if (viewMode === 'cost') {
                baselineVal = d.baselineTTFT ? calcCost(HOURLY_COST_BASE) : null;
                cpuVal = d.cpuTTFT ? calcCost(HOURLY_COST_BASE) : null;
                ssdVal = d.ssdTTFT ? calcCost(HOURLY_COST_BASE + HOURLY_COST_LUSTRE) : null;
            } else {
                // Map yMetric to data key
                let metricKey = yMetric.toUpperCase();
                if (metricKey === 'TPOT' || metricKey === 'NTPOT') metricKey = 'ITL';
                
                baselineVal = d[`baseline${metricKey}`] ? Math.round(d[`baseline${metricKey}`]) : null;
                cpuVal = d[`cpu${metricKey}`] ? Math.round(d[`cpu${metricKey}`]) : null;
                ssdVal = d[`ssd${metricKey}`] ? Math.round(d[`ssd${metricKey}`]) : null;

                // Apply a slight difference for NTPOT if selected
                if (yMetric === 'ntpot') {
                    if (baselineVal) baselineVal = Math.round(baselineVal * 0.9);
                    if (cpuVal) cpuVal = Math.round(cpuVal * 0.9);
                    if (ssdVal) ssdVal = Math.round(ssdVal * 0.9);
                }
            }

            if (baseThroughput <= tputCap) {
                if (baselineVal !== null) {
                    const p50Val = baselineVal;
                    const p90Val = Math.round(baselineVal * 1.15);
                    const p99Val = Math.round(baselineVal * 1.35);
                    bSeries.push({ x: xVal, y: p50Val, throughput: baseThroughput, val: p50Val });
                    bSeriesP90.push({ x: xVal, y: p90Val, throughput: baseThroughput, val: p90Val });
                    bSeriesP99.push({ x: xVal, y: p99Val, throughput: baseThroughput, val: p99Val });
                }
                if (cpuVal !== null) {
                    const p50Val = cpuVal;
                    const p90Val = Math.round(cpuVal * 1.12);
                    const p99Val = Math.round(cpuVal * 1.28);
                    cSeries.push({ x: xVal, y: p50Val, throughput: baseThroughput, val: p50Val });
                    cSeriesP90.push({ x: xVal, y: p90Val, throughput: baseThroughput, val: p90Val });
                    cSeriesP99.push({ x: xVal, y: p99Val, throughput: baseThroughput, val: p99Val });
                }
                if (ssdVal !== null) {
                    const p50Val = ssdVal;
                    const p90Val = Math.round(ssdVal * 1.08);
                    const p99Val = Math.round(ssdVal * 1.18);
                    sSeries.push({ x: xVal, y: p50Val, throughput: baseThroughput, val: p50Val });
                    sSeriesP90.push({ x: xVal, y: p90Val, throughput: baseThroughput, val: p90Val });
                    sSeriesP99.push({ x: xVal, y: p99Val, throughput: baseThroughput, val: p99Val });
                }
            }

            return {
                throughput: Math.round(baseThroughput),
                baseline: baselineVal,
                baseline_p50: baselineVal,
                baseline_p90: baselineVal ? Math.round(baselineVal * 1.15) : null,
                baseline_p99: baselineVal ? Math.round(baselineVal * 1.35) : null,
                cpu: cpuVal,
                cpu_p50: cpuVal,
                cpu_p90: cpuVal ? Math.round(cpuVal * 1.12) : null,
                cpu_p99: cpuVal ? Math.round(cpuVal * 1.28) : null,
                ssd: ssdVal,
                ssd_p50: ssdVal,
                ssd_p90: ssdVal ? Math.round(ssdVal * 1.08) : null,
                ssd_p99: ssdVal ? Math.round(ssdVal * 1.18) : null,
                baselineOOM: d.baselineTTFT === null,
                cpuOOM: d.cpuTTFT === null,
            };
        });
        
        bSeries.sort((a, b) => a.x - b.x);
        cSeries.sort((a, b) => a.x - b.x);
        sSeries.sort((a, b) => a.x - b.x);
        
        const allSeries = [...bSeries, ...cSeries, ...sSeries].sort((a, b) => a.x - b.x);

        return { baselineSeries: bSeries, baselineSeriesP90: bSeriesP90, baselineSeriesP99: bSeriesP99, cpuSeries: cSeries, cpuSeriesP90: cSeriesP90, cpuSeriesP99: cSeriesP99, ssdSeries: sSeries, ssdSeriesP90: sSeriesP90, ssdSeriesP99: sSeriesP99, allSeriesData: allSeries, chartData: processed };
    }, [workloadSize, xMetric, yMetric, viewMode, tputCap, xAxisMode]);


    // Check if OOM happens in current view to display alert banner
    const hasOOM = useMemo(() => {
        return chartData.some(d => d.baselineOOM || d.cpuOOM);
    }, [chartData]);

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

    const xAxisLabel = xLabels[xMetric] || 'Throughput';
    const yAxisLabel = viewMode === 'cost' ? 'Cost per 1M Tokens ($)' : (yLabels[yMetric] || 'Latency (ms)');

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

                    <div className="flex items-center">
                        <h1 className="text-sm sm:text-lg font-bold text-white tracking-wide truncate">Prefix cache offloading</h1>
                        <span className="ml-3 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hidden sm:inline">
                            Guided path
                        </span>
                    </div>
                </div>

                <div className="flex items-center space-x-3">
                    <a
                        href="https://llm-d.ai/docs/community"
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-1.5 text-xs font-medium rounded-lg text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors flex items-center border border-slate-700 cursor-pointer"
                        title="Contact us"
                    >
                        <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                        <span className="hidden sm:inline">Contact us</span>
                    </a>
                    <button 
                        onClick={() => setIsAgentPanelOpen(true)} 
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

            {/* Main Content */}
            <main className="w-full max-w-7xl px-6 py-8 flex flex-col space-y-6">
                
                {/* ROW 1: Description & Active Config (Aligned with Inference Scheduling) */}
                <div className="relative overflow-hidden border border-slate-800/80 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-slate-950/90 p-5 shadow-2xl backdrop-blur-xl group transition-all duration-500 hover:border-sky-500/30">
                    <div className="absolute -top-24 -right-24 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl group-hover:bg-sky-500/20 transition-all duration-700 pointer-events-none" />
                    
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
                        {/* Col 1: Overview */}
                        <div className="flex flex-col justify-between space-y-3">
                            <div>
                                <div className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-widest mb-2">Overview</div>
                                <p className="text-xs text-slate-300 leading-relaxed">
                                    Evaluates dynamic capacity and saturation boundaries under Tiered Prefix Caching. 
                                    Unlike standard metrics that show static averages, these telemetry charts expose the exact load stage 
                                    where native HBM VRAM hits the <strong>"Memory Wall" (OOM)</strong> on long contexts, proving how offloading to Host CPU RAM 
                                    and Managed Lustre / Local SSD extends serving capacity without latency degradation.
                                </p>
                            </div>
                        </div>

                        {/* Col 2: Selectable Optimizations (Active Overlays) */}
                        <div className="space-y-2">
                            <div className="text-[10px] font-extrabold text-cyan-400/90 uppercase tracking-widest mb-1">
                                Selectable Optimizations
                            </div>

                            {/* Baseline */}
                            <button 
                                onClick={() => setActiveTiers(prev => ({ ...prev, baseline: !prev.baseline }))}
                                className={`w-full text-left border rounded-lg p-2 flex items-center justify-between transition-all cursor-pointer ${
                                    activeTiers.baseline 
                                        ? 'border-orange-500/30 bg-slate-900/60' 
                                        : 'border-slate-800/50 bg-slate-900/20 opacity-60'
                                }`}
                            >
                                <div>
                                    <div className="text-xs font-semibold text-slate-200">Baseline (HBM Only)</div>
                                    <p className="text-[10px] text-slate-500">Native HBM VRAM without offloading</p>
                                </div>
                                <div className={`w-2 h-2 rounded-full ${activeTiers.baseline ? 'bg-orange-500' : 'bg-slate-700'}`}></div>
                            </button>

                            {/* Opt 1: CPU RAM */}
                            <button 
                                onClick={() => setActiveTiers(prev => ({ ...prev, cpu: !prev.cpu }))}
                                className={`w-full text-left border rounded-lg p-2 flex items-center justify-between transition-all cursor-pointer ${
                                    activeTiers.cpu 
                                        ? 'border-sky-500/30 bg-slate-900/60' 
                                        : 'border-slate-800/50 bg-slate-900/20 opacity-60'
                                }`}
                            >
                                <div>
                                    <div className="text-xs font-semibold text-slate-200">Tiered Cache: CPU RAM</div>
                                    <p className="text-[10px] text-slate-500">Host memory offloading layer</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <a 
                                        href="https://llm-d.ai/docs/guide/Installation/tiered-prefix-cache/cpu" 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        onClick={e => e.stopPropagation()}
                                        className="text-slate-500 hover:text-slate-300 transition-colors flex items-center space-x-1"
                                    >
                                        <span className="text-[10px]">Guide</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <div className={`w-2 h-2 rounded-full ${activeTiers.cpu ? 'bg-sky-500' : 'bg-slate-700'}`}></div>
                                </div>
                            </button>

                            {/* Opt 2: CPU + Lustre */}
                            <button 
                                onClick={() => setActiveTiers(prev => ({ ...prev, ssd: !prev.ssd }))}
                                className={`w-full text-left border rounded-lg p-2 flex items-center justify-between transition-all cursor-pointer ${
                                    activeTiers.ssd 
                                        ? 'border-emerald-500/30 bg-slate-900/60' 
                                        : 'border-slate-800/50 bg-slate-900/20 opacity-60'
                                }`}
                            >
                                <div>
                                    <div className="text-xs font-semibold text-slate-200">Tiered Cache: CPU + Lustre</div>
                                    <p className="text-[10px] text-slate-500">Managed Lustre & SSD remote layer</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <a 
                                        href="https://github.com/lmcache/lmcache" 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        onClick={e => e.stopPropagation()}
                                        className="text-slate-500 hover:text-slate-300 transition-colors flex items-center space-x-1"
                                    >
                                        <span className="text-[10px]">Guide</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <div className={`w-2 h-2 rounded-full ${activeTiers.ssd ? 'bg-emerald-500' : 'bg-slate-700'}`}></div>
                                </div>
                            </button>
                        </div>

                        {/* Col 3: Upcoming / Contribute */}
                        <div className="space-y-2">
                            <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-1">
                                <span>Upcoming & Roadmap</span>
                            </div>

                            {/* Opt 3: Local SSD */}
                            <div className="border border-slate-800/50 rounded-lg bg-slate-900/30 p-2 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-semibold text-slate-400">Tiered Cache: Local SSD</div>
                                    <p className="text-[10px] text-slate-500">Direct persistent NVMe offloading</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <a href="https://github.com/lmcache/lmcache" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors flex items-center space-x-1">
                                        <span className="text-[10px]">Specs</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <span className="text-[9px] font-extrabold text-amber-600/70 uppercase tracking-widest border border-amber-600/30 px-1.5 py-0.5 rounded">Coming Soon</span>
                                </div>
                            </div>

                            {/* Opt 4: Cloud Storage */}
                            <div className="border border-slate-800/50 rounded-lg bg-slate-900/30 p-2 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-semibold text-slate-400">Cloud Storage Rapid Cache</div>
                                    <p className="text-[10px] text-slate-500">GCS / Object storage remote layer</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <a href="https://www.coreweave.com/news/coreweave-unveils-ai-object-storage-redefining-how-ai-workloads-access-and-scale-data" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors flex items-center space-x-1">
                                        <span className="text-[10px]">Specs</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <span className="text-[9px] font-extrabold text-amber-600/70 uppercase tracking-widest border border-amber-600/30 px-1.5 py-0.5 rounded">Coming Soon</span>
                                </div>
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

                        <div className="grid grid-cols-12 gap-2">
                            {/* Column 1: Infra Layer (col-span-4) */}
                            <div className="flex flex-col gap-3 col-span-4 border-r border-slate-800/60 pr-2">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate">
                                    Infra Layer
                                </div>
                                <div className="flex flex-col gap-2 text-xs">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Provider / Machine</span>
                                        <span className="font-mono font-bold text-white truncate block">g4-standard-384</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Accelerator</span>
                                        <span className="font-mono font-bold text-white truncate block">RTX-PRO-6000</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Replicas</span>
                                        <span className="font-mono font-bold text-white truncate block">8</span>
                                    </div>
                                </div>
                            </div>

                            {/* Column 2: Model Serving Layer (col-span-4) */}
                            <div className="flex flex-col gap-3 col-span-4 border-r border-slate-800/60 pr-2">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate">
                                    Model Serving
                                </div>
                                <div className="flex flex-col gap-2 text-xs">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Model Name</span>
                                        <span className="font-mono font-bold text-white truncate block">gemma4-31B (FP8)</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Strategy</span>
                                        <span className="font-mono font-bold text-white truncate block">TP: 8</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Engine</span>
                                        <span className="font-mono font-bold text-white truncate block">vLLM v0.7.2-fs</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Plugins</span>
                                        <span className="font-mono font-bold text-white truncate block">o_direct / LMCache</span>
                                    </div>
                                </div>
                            </div>


                            {/* Column 3: Workload (col-span-4) */}
                            <div className="flex flex-col gap-3 col-span-4">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate">
                                    Workload
                                </div>
                                <div className="flex flex-col gap-2 text-xs">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Test Harness</span>
                                        <span className="font-mono font-bold text-white truncate block">inference-perf</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Use Case</span>
                                        <span className="font-mono font-bold text-white truncate block">Shared Prefix</span>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">Context Length</span>
                                        <select 
                                            value={workloadSize} 
                                            onChange={(e) => setWorkloadSize(e.target.value)}
                                            className="bg-slate-950 text-white font-mono font-bold text-[11px] border border-slate-700 rounded-lg p-1.5 w-full outline-none focus:border-sky-500 cursor-pointer truncate"
                                        >
                                            <option value="1k">1k Tokens (Baseline Sweet Spot)</option>
                                            <option value="5k">5k Tokens (CPU RAM Offload)</option>
                                            <option value="10k">10k Tokens (CPU RAM Offload)</option>
                                            <option value="50k">50k Tokens (Lustre / SSD)</option>
                                            <option value="100k">100k Tokens (Lustre / SSD)</option>
                                        </select>
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
                            <div className="grid grid-cols-1 gap-2">
                                <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2.5 hover:border-emerald-500/20 transition-all flex justify-between items-center">
                                    <div>
                                        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-0.5 truncate">
                                            Context Scale
                                        </h3>
                                        <div className="text-[10px] text-slate-500 font-normal truncate">
                                            (total tokens)
                                        </div>
                                    </div>
                                    <h4 className="text-base font-black text-emerald-400 font-mono">
                                        100k Tok
                                    </h4>
                                </div>
                                <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2.5 hover:border-sky-500/20 transition-all flex justify-between items-center">
                                    <div>
                                        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-0.5 truncate">
                                            Throughput Increase
                                        </h3>
                                        <div className="text-[10px] text-slate-500 font-normal truncate">
                                            (output tokens/sec)
                                        </div>
                                    </div>
                                    <h4 className="text-base font-black text-sky-400 font-mono">
                                        +264%
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
                                        -45%
                                    </h4>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CARD 3: Action */}
                    <div className="lg:col-span-3 border border-slate-800 rounded-xl bg-slate-900 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden">
                        <div>
                            <p className="text-[11px] font-extrabold text-cyan-400 uppercase tracking-widest mb-2">
                                Action
                            </p>
                            <h3 className="text-base font-bold text-white mb-1 truncate">
                                Reproducibility guide
                            </h3>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Replicate these tiered caching benchmarks on your hardware.
                            </p>
                        </div>

                        <button onClick={() => setIsModalOpen(true)} className="w-full mt-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-lg shadow transition-all flex justify-center items-center gap-1.5 truncate">
                            <Zap className="w-3.5 h-3.5 mr-1 shrink-0" /> View instructions
                        </button>
                    </div>
                </div>

                {/* OOM Crash Alert Banner & KV Quantization Sensitivity */}
                {hasOOM && workloadSize !== '1k' && workloadSize !== '5k' && workloadSize !== '10k' && (
                    <div className="bg-red-950/40 border border-red-500/40 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 backdrop-blur-sm shadow-xl">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-500/20 text-red-400 rounded-lg shrink-0 animate-pulse">
                                <Zap className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-red-200 uppercase tracking-wider flex items-center gap-2">
                                    <span>Memory Wall Detected</span>
                                    <span className="text-[10px] font-mono bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded border border-red-500/30">Native HBM Exhausted</span>
                                </h4>
                                <p className="text-xs text-red-300/80 mt-0.5 leading-relaxed">
                                    At {workloadSize} context scale under <strong className="text-white">{kvQuantization}</strong> KV Cache precision, native HBM VRAM exceeds capacity resulting in Out-of-Memory (OOM) crashes. 
                                    Notice how the Tiered Cache lines continue serving traffic successfully.
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col items-start md:items-end shrink-0 gap-1">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">KV Cache Quantization Sensitivity:</span>
                            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1">
                                {['FP16', 'FP8', 'INT4'].map(prec => (
                                    <button
                                        key={prec}
                                        onClick={() => setKvQuantization(prec)}
                                        className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded transition-all cursor-pointer ${
                                            kvQuantization === prec 
                                                ? 'bg-red-600 text-white shadow' 
                                                : 'text-slate-400 hover:text-white hover:bg-slate-900'
                                        }`}
                                    >
                                        {prec}
                                    </button>
                                ))}
                            </div>
                            <span className="text-[9px] text-slate-500 font-mono">
                                {kvQuantization === 'INT4' ? 'INT4 halves KV VRAM footprint, shifting OOM right' : kvQuantization === 'FP8' ? 'FP8 standard quantization active' : 'FP16 requires 2x VRAM, hitting OOM earlier'}
                            </span>
                        </div>
                    </div>
                )}

                {/* Detailed Interactive Chart Container (Inference Scheduling Pattern) */}
                <div id="detailed-chart" className="bg-slate-900/80 border border-slate-700/60 rounded-2xl shadow-2xl flex flex-col w-full min-h-[550px] overflow-visible backdrop-blur-sm relative">
                    <div className="flex flex-col w-full h-full">
                        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/80 flex justify-between items-start gap-6 shadow-sm">
                            <div className="flex flex-col gap-2.5">
                                <h3 className="text-lg font-bold text-white">
                                    {xAxisMode === 'throughput' ? `Input Token Throughput vs ${targetMetric === 'TTFT' ? 'TTFT (Prefill Latency)' : targetMetric === 'ITL' ? 'ITL (Decode Latency)' : 'E2E Latency'} ${viewMode === 'cost' ? '[TCO Efficiency ($)]' : ''}` : `${targetMetric === 'TTFT' ? 'TTFT (Prefill Latency)' : targetMetric === 'ITL' ? 'ITL (Decode Latency)' : 'E2E Latency'} vs Input Token Throughput`}
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
                                            <span>g4-standard-384</span>
                                            <span>RTX-PRO-6000</span>
                                            <span className="text-slate-400">(8 replicas)</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-slate-500 font-semibold">Model:</span>
                                        <div className="font-mono text-slate-200">
                                            <span className="font-bold">gemma4-31B</span>
                                            <span className="text-slate-400"> (FP8)</span>
                                            <span className="mx-1">•</span>
                                            <span className="font-bold">vllm v0.7.2-fs</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-slate-500 font-semibold">Prompt:</span>
                                        <div className="font-mono font-bold text-cyan-400">
                                            {workloadSize} Tokens
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={handleExportData} 
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
                            <div className="bg-slate-800/40 border-b border-slate-700/50 px-6 py-3 grid grid-cols-1 xl:grid-cols-12 gap-6 items-center overflow-hidden">
                                <div className="xl:col-span-7 flex flex-col gap-3 xl:border-r border-slate-700/50 xl:pr-6 w-full overflow-hidden">
                                    <div className="flex items-center gap-2 w-full">
                                        <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest w-14 shrink-0">X-Axis:</span>
                                        <div className="flex items-center bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5 gap-0.5 whitespace-nowrap overflow-x-auto no-scrollbar w-full">
                                            {[
                                                { id: 'ntpot', label: 'NTPOT' },
                                                { id: 'tpot', label: 'TPOT' },
                                                { id: 'ttft', label: 'TTFT' },
                                                { id: 'itl', label: 'ITL' },
                                                { id: 'e2e', label: 'E2E Latency' },
                                            ].map(metric => (
                                                <button
                                                    key={metric.id}
                                                    onClick={() => setXMetric(metric.id)}
                                                    className={`px-3 py-1 text-[10px] font-medium rounded-md transition-all cursor-pointer shrink-0 ${
                                                        xMetric === metric.id
                                                            ? 'bg-teal-600 text-white shadow-sm' 
                                                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                                                    }`}
                                                >
                                                    {metric.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 w-full">
                                        <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest w-14 shrink-0">Y-Axis:</span>
                                        <div className="flex items-center bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5 gap-0.5 whitespace-nowrap overflow-x-auto no-scrollbar w-full">
                                            {[
                                                { id: 'output', label: 'Output' },
                                                { id: 'input', label: 'Input' },
                                                { id: 'total', label: 'Total' },
                                                { id: 'qps', label: 'QPS' },
                                            ].map(mode => (
                                                <button
                                                    key={mode.id}
                                                    onClick={() => setYMetric(mode.id)}
                                                    className={`px-3 py-1 text-[10px] font-medium rounded-md transition-all cursor-pointer shrink-0 ${
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
                                </div>

                                <div className="xl:col-span-5 flex flex-col gap-3 xl:items-end w-full overflow-hidden">
                                    <div className="flex flex-wrap items-center gap-4 justify-end w-full">
                                        <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5 shrink-0">
                                            <button 
                                                onClick={() => setIsLogScaleX(!isLogScaleX)} 
                                                className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all cursor-pointer ${isLogScaleX ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                            >
                                                Log Scale
                                            </button>
                                            <div className="h-3 w-px bg-slate-700" />
                                            <button 
                                                onClick={() => setShowPerChip(!showPerChip)} 
                                                className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all cursor-pointer ${showPerChip ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`} 
                                                title="Normalize per Chip"
                                            >
                                                Per Chip
                                            </button>
                                        </div>

                                        <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5 shrink-0">
                                            {['P50', 'P90', 'P99'].map(p => (
                                                <button
                                                    key={p}
                                                    onClick={() => setVisiblePercentiles(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                                                    className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all cursor-pointer ${visiblePercentiles.includes(p) ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 px-3 py-1 rounded-lg shrink-0">
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

                        <div className="bg-slate-950/30 rounded-xl p-4 border border-slate-800/40 my-4 select-none overflow-hidden">
                            <div className="relative w-full h-[450px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    {xAxisMode === 'throughput' ? (
                                        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} />
                                            <CustomXAxis 
                                                dataKey="throughput" 
                                                label={xAxisLabel}
                                                theme="dark"
                                            />
                                            <CustomYAxis 
                                                label={yAxisLabel}
                                                theme="dark"
                                            />
                                            <Tooltip 
                                                isAnimationActive={false}
                                                content={<RichPrefixCacheTooltip xMetric={xMetric} yMetric={yMetric} viewMode={viewMode} workloadSize={workloadSize} />}
                                                wrapperStyle={{ outline: 'none', zIndex: 100 }}
                                                cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                                            />

                                            {activeTiers.baseline && (
                                                <>
                                                    {visiblePercentiles.includes('P50') && <Line type="monotone" dataKey="baseline_p50" name="Baseline (HBM Only) P50" stroke="#fb923c" strokeWidth={3} connectNulls={true} dot={{ r: 4, fill: '#fb923c' }} isAnimationActive={false} />}
                                                    {visiblePercentiles.includes('P90') && <Line type="monotone" dataKey="baseline_p90" name="Baseline (HBM Only) P90" stroke="#fb923c" strokeDasharray="5 5" strokeWidth={2} connectNulls={true} dot={{ r: 3, fill: '#fb923c' }} isAnimationActive={false} />}
                                                    {visiblePercentiles.includes('P99') && <Line type="monotone" dataKey="baseline_p99" name="Baseline (HBM Only) P99" stroke="#fb923c" strokeDasharray="2 2" strokeWidth={2} connectNulls={true} dot={{ r: 3, fill: '#fb923c' }} isAnimationActive={false} />}
                                                </>
                                            )}
                                            {activeTiers.cpu && (
                                                <>
                                                    {visiblePercentiles.includes('P50') && <Line type="monotone" dataKey="cpu_p50" name="Tiered Cache: CPU RAM P50" stroke="#38bdf8" strokeWidth={3} connectNulls={true} dot={{ r: 4, fill: '#38bdf8' }} isAnimationActive={false} />}
                                                    {visiblePercentiles.includes('P90') && <Line type="monotone" dataKey="cpu_p90" name="Tiered Cache: CPU RAM P90" stroke="#38bdf8" strokeDasharray="5 5" strokeWidth={2} connectNulls={true} dot={{ r: 3, fill: '#38bdf8' }} isAnimationActive={false} />}
                                                    {visiblePercentiles.includes('P99') && <Line type="monotone" dataKey="cpu_p99" name="Tiered Cache: CPU RAM P99" stroke="#38bdf8" strokeDasharray="2 2" strokeWidth={2} connectNulls={true} dot={{ r: 3, fill: '#38bdf8' }} isAnimationActive={false} />}
                                                </>
                                            )}
                                            {activeTiers.ssd && (
                                                <>
                                                    {visiblePercentiles.includes('P50') && <Line type="monotone" dataKey="ssd_p50" name="Tiered Cache: Managed Lustre / SSD P50" stroke="#34d399" strokeWidth={3} connectNulls={true} dot={{ r: 4, fill: '#34d399' }} isAnimationActive={false} />}
                                                    {visiblePercentiles.includes('P90') && <Line type="monotone" dataKey="ssd_p90" name="Tiered Cache: Managed Lustre / SSD P90" stroke="#34d399" strokeDasharray="5 5" strokeWidth={2} connectNulls={true} dot={{ r: 3, fill: '#34d399' }} isAnimationActive={false} />}
                                                    {visiblePercentiles.includes('P99') && <Line type="monotone" dataKey="ssd_p99" name="Tiered Cache: Managed Lustre / SSD P99" stroke="#34d399" strokeDasharray="2 2" strokeWidth={2} connectNulls={true} dot={{ r: 3, fill: '#34d399' }} isAnimationActive={false} />}
                                                </>
                                            )}
                                        </LineChart>
                                    ) : (
                                        <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} />
                                            <CustomXAxis 
                                                dataKey="x" 
                                                type="number"
                                                domain={['auto', 'auto']}
                                                label={xAxisLabel}
                                                theme="dark"
                                            />
                                            <CustomYAxis 
                                                dataKey="y" 
                                                type="number"
                                                domain={['auto', 'auto']}
                                                label={yAxisLabel}
                                                theme="dark"
                                            />
                                            <Tooltip 
                                                isAnimationActive={false}
                                                content={<RichPrefixCacheTooltip xMetric={xMetric} yMetric={yMetric} viewMode={viewMode} workloadSize={workloadSize} />}
                                                wrapperStyle={{ outline: 'none', zIndex: 100 }}
                                                cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                                            />
                                            
                                            {activeTiers.baseline && (
                                                <>
                                                    {visiblePercentiles.includes('P50') && <Scatter name="Baseline (HBM Only) P50" data={baselineSeries} fill="#fb923c" line={{ stroke: '#fb923c', strokeWidth: 3 }} isAnimationActive={false} />}
                                                    {visiblePercentiles.includes('P90') && <Scatter name="Baseline (HBM Only) P90" data={baselineSeriesP90} fill="#fb923c" line={{ stroke: '#fb923c', strokeDasharray: '5 5', strokeWidth: 2 }} isAnimationActive={false} />}
                                                    {visiblePercentiles.includes('P99') && <Scatter name="Baseline (HBM Only) P99" data={baselineSeriesP99} fill="#fb923c" line={{ stroke: '#fb923c', strokeDasharray: '2 2', strokeWidth: 2 }} isAnimationActive={false} />}
                                                </>
                                            )}
                                            {activeTiers.cpu && (
                                                <>
                                                    {visiblePercentiles.includes('P50') && <Scatter name="Tiered Cache: CPU RAM P50" data={cpuSeries} fill="#38bdf8" line={{ stroke: '#38bdf8', strokeWidth: 3 }} isAnimationActive={false} />}
                                                    {visiblePercentiles.includes('P90') && <Scatter name="Tiered Cache: CPU RAM P90" data={cpuSeriesP90} fill="#38bdf8" line={{ stroke: '#38bdf8', strokeDasharray: '5 5', strokeWidth: 2 }} isAnimationActive={false} />}
                                                    {visiblePercentiles.includes('P99') && <Scatter name="Tiered Cache: CPU RAM P99" data={cpuSeriesP99} fill="#38bdf8" line={{ stroke: '#38bdf8', strokeDasharray: '2 2', strokeWidth: 2 }} isAnimationActive={false} />}
                                                </>
                                            )}
                                            {activeTiers.ssd && (
                                                <>
                                                    {visiblePercentiles.includes('P50') && <Scatter name="Tiered Cache: Managed Lustre / SSD P50" data={ssdSeries} fill="#34d399" line={{ stroke: '#34d399', strokeWidth: 3 }} isAnimationActive={false} />}
                                                    {visiblePercentiles.includes('P90') && <Scatter name="Tiered Cache: Managed Lustre / SSD P90" data={ssdSeriesP90} fill="#34d399" line={{ stroke: '#34d399', strokeDasharray: '5 5', strokeWidth: 2 }} isAnimationActive={false} />}
                                                    {visiblePercentiles.includes('P99') && <Scatter name="Tiered Cache: Managed Lustre / SSD P99" data={ssdSeriesP99} fill="#34d399" line={{ stroke: '#34d399', strokeDasharray: '2 2', strokeWidth: 2 }} isAnimationActive={false} />}
                                                </>
                                            )}
                                        </ScatterChart>
                                    )}
                                </ResponsiveContainer>
                            </div>

                            {/* Custom Hardware / Color Legend (Inference Scheduling Pattern) */}
                            <div className="mt-4 border-t border-slate-700/50 pt-4 px-2">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                        Legends
                                    </h4>
                                </div>
                                <div className="flex flex-wrap gap-x-8 gap-y-4">
                                    {[
                                        { name: 'Baseline (HBM Only)', color: '#fb923c' },
                                        { name: 'Tiered Cache: CPU RAM', color: '#38bdf8' },
                                        { name: 'Tiered Cache: Managed Lustre / SSD', color: '#34d399' }
                                    ].map(tier => (
                                        <div key={tier.name} className="flex flex-col gap-1.5">
                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{tier.name}</div>
                                            <div className="flex gap-x-4 gap-y-1 flex-wrap">
                                                {[
                                                    { p: 'P50', style: 'solid' },
                                                    { p: 'P90', style: 'dashed' },
                                                    { p: 'P99', style: 'dotted' }
                                                ].map(item => (
                                                    <div key={item.p} className="flex items-center gap-1.5">
                                                        <div className="w-5 h-3 flex items-center">
                                                            <div className="w-full h-0 border-t-2" style={{ borderColor: tier.color, borderStyle: item.style, opacity: visiblePercentiles.includes(item.p) ? 1 : 0.3 }} />
                                                        </div>
                                                        <span className={`text-[10px] font-semibold ${visiblePercentiles.includes(item.p) ? 'text-slate-300' : 'text-slate-600'}`}>{item.p}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Secondary View: Context Length vs Storage Tier Heatmap (Deploy Planner) */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                    <div className="p-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-4">
                        <div>
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <HardDrive className="w-4 h-4 text-cyan-400" />
                                <span>Summary architecture comparison</span>
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Comparing Baseline HBM workloads against Tiered Cache offloading architectures side-by-side across prompt sizes.
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
                                {HEATMAP_DATA.map((row, idx) => {
                                    const isCurrent = workloadSize === row.context;
                                    return (
                                        <tr 
                                            key={idx} 
                                            className={`hover:bg-slate-800/30 transition-colors ${
                                                isCurrent ? 'bg-slate-800/70' : ''
                                            }`}
                                        >
                                            <td className="p-4 text-white font-sans flex items-center gap-2">
                                                <span>{row.context} Tokens</span>
                                                {isCurrent && <span className="text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-sans font-black uppercase tracking-wider">Active</span>}
                                            </td>
                                            <td className="p-4 font-mono text-white">{row.baseline.value}</td>
                                            <td className="p-4 font-mono text-white">{row.cpu.value}</td>
                                            <td className="p-4 font-mono text-white">{row.ssd.value}</td>
                                            <td className="p-4 bg-slate-950/30 text-white font-sans flex items-center gap-1.5 mt-1">
                                                <Check className="w-4 h-4 text-white" /> {row.sweetSpot}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ROW 3: CUJ 2 AI Insight FAQ */}
                <div className="grid grid-cols-1 gap-6">
                    {/* AI Insight FAQ */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                        <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
                            <div className="p-1.5 bg-teal-500/20 text-teal-400 rounded-lg">
                                <Zap className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-white">AI Insight & Custom Comparisons FAQ</h3>
                                <p className="text-xs text-slate-400">Prepopulated guidance for custom model/infrastructure evaluation.</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {[
                                {
                                    q: "How does gemma4-31B perform under custom cluster configurations?",
                                    a: "On g4-standard-384 (8x rtx-pro-6000), Host CPU RAM offloading recovers serving capacity up to 10k context. For 50k+ prompts, extending the KV cache to Managed Lustre / Local SSD eliminates OOM crashes and yields up to +264% throughput gain."
                                },
                                {
                                    q: "How do specific vLLM versions and kernel plugins affect these results?",
                                    a: "This profile requires vLLM configured with FS-connectors and LMCache plugins. Direct I/O (o_direct) bypasses file system cache to minimize TTFT prefill overhead."
                                }
                            ].map((item, i) => (
                                <div key={i} className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/50 transition-all">
                                    <button 
                                        onClick={() => setOpenFaq(openFaq === i ? null : i)} 
                                        className="w-full p-3 text-left flex justify-between items-center font-semibold text-xs text-slate-200 hover:bg-slate-800/30 transition-colors cursor-pointer"
                                    >
                                        <span>{item.q}</span>
                                        {openFaq === i ? <ChevronUp className="w-4 h-4 text-sky-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
                                    </button>
                                    {openFaq === i && (
                                        <div className="p-3 pt-0 text-xs text-slate-400 border-t border-slate-800 bg-slate-900/30 leading-relaxed animate-in fade-in duration-200">
                                            {item.a}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* FAQ Section */}
                <div className="mt-10 border-t border-slate-800/60 pt-10">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-bold text-white">Frequently Asked Questions</h3>
                    </div>
                    <p className="text-xs text-slate-500 mb-6">Extrapolating baseline telemetry and optimization paths to your custom constraints.</p>
                    
                    <div className="space-y-3">
                        {[
                            {
                                category: "Model Architectures & Sizes",
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
                                category: "Hardware Infrastructure",
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
                                category: "Workloads & Traffic Patterns",
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
                        ].map((faq, idx) => {
                            const isOpen = openFAQIndex === idx;
                            return (
                                <div key={idx} className="border border-slate-800/80 rounded-xl bg-slate-900/40 overflow-hidden hover:border-slate-700/50 transition-colors">
                                    <button
                                        onClick={() => setOpenFAQIndex(isOpen ? null : idx)}
                                        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-800/20 transition-colors cursor-pointer"
                                    >
                                        <div>
                                            <span className="text-[8px] font-extrabold uppercase tracking-widest text-cyan-400/80 block mb-1">{faq.category}</span>
                                            <span className="text-xs font-bold text-slate-200">{faq.q}</span>
                                        </div>
                                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ml-4 ${isOpen ? 'rotate-180 text-cyan-400' : ''}`} />
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
            </main>

            {/* Share with AI Agent Drawer Side Panel */}
            {isAgentPanelOpen && (
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
                                        <p className="text-xs text-slate-400 mt-0.5">Transmit multidimensional benchmark context directly to IDE or LLM workspace.</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setIsAgentPanelOpen(false)} 
                                    className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                                >
                                    ✕
                                </button>
                            </header>

                            <div className="space-y-3">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">⚡ One-Click Quick-Task Prompt Presets:</span>
                                <div className="flex flex-col gap-2">
                                    <button 
                                        onClick={() => setAgentNote("Analyze this vLLM benchmark state and draft a 1-page financial ROI summary comparing baseline HBM costs against Managed Lustre offloading savings.")}
                                        className="text-left p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800/50 border border-slate-800 transition-all text-xs text-slate-300 hover:text-white flex items-center gap-2 cursor-pointer group"
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-teal-400 group-hover:scale-125 transition-all shrink-0" />
                                        <span className="font-mono text-teal-300 font-bold shrink-0">[TCO ROI Report]</span>
                                        <span className="truncate text-slate-400">Draft executive ROI summary vs baseline</span>
                                    </button>
                                    <button 
                                        onClick={() => setAgentNote("Generate a production-ready Kubernetes Deployment YAML for vLLM v0.7.2-fs incorporating LMCache volume mounts and tuned 16MB I/O parallelism flags based on this payload.")}
                                        className="text-left p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800/50 border border-slate-800 transition-all text-xs text-slate-300 hover:text-white flex items-center gap-2 cursor-pointer group"
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 group-hover:scale-125 transition-all shrink-0" />
                                        <span className="font-mono text-sky-300 font-bold shrink-0">[K8s Manifest]</span>
                                        <span className="truncate text-slate-400">Generate production vLLM deployment yaml</span>
                                    </button>
                                    <button 
                                        onClick={() => setAgentNote("Explain the exact VRAM saturation mechanics causing native HBM to OOM at 50k tokens under FP8 quantization and recommend optimal chunked prefill configurations.")}
                                        className="text-left p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800/50 border border-slate-800 transition-all text-xs text-slate-300 hover:text-white flex items-center gap-2 cursor-pointer group"
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 group-hover:scale-125 transition-all shrink-0" />
                                        <span className="font-mono text-red-300 font-bold shrink-0">[Diagnose OOM]</span>
                                        <span className="truncate text-slate-400">Explain Memory Wall saturation mechanics</span>
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Custom AI Agent Prompt Instructions:</span>
                                <textarea
                                    value={agentNote}
                                    onChange={(e) => setAgentNote(e.target.value)}
                                    placeholder="Select a preset above or type custom analysis instructions..."
                                    className="w-full h-28 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:border-cyan-500 resize-none placeholder:text-slate-600 font-mono leading-relaxed"
                                />
                            </div>

                            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40 transition-all">
                                <button 
                                    onClick={() => setShowPayloadPreview(!showPayloadPreview)}
                                    className="w-full p-3 text-left flex justify-between items-center font-semibold text-xs text-slate-300 hover:text-white hover:bg-slate-800/30 transition-colors cursor-pointer"
                                >
                                    <span className="flex items-center gap-2">
                                        <Info className="w-3.5 h-3.5 text-cyan-400" />
                                        <span>Inspect Live Serialized JSON Payload</span>
                                    </span>
                                    {showPayloadPreview ? <ChevronUp className="w-4 h-4 text-cyan-400" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                                </button>
                                {showPayloadPreview && (
                                    <div className="p-3 bg-slate-950 border-t border-slate-800 max-h-48 overflow-y-auto font-mono text-[10px] text-cyan-300 leading-relaxed animate-in fade-in duration-200">
                                        <pre>{JSON.stringify({
                                            scenario: "Tiered Prefix Cache Offloading",
                                            hardware: "g4-standard-384 (8x rtx-pro-6000)",
                                            model: "gemma4-31B (FP8)",
                                            workloadSize: workloadSize,
                                            targetMetric: targetMetric,
                                            activeOptimizations: Object.keys(activeTiers).filter(k => activeTiers[k]),
                                            anomalyTag: hasOOM ? "Memory Wall Detected" : "None",
                                            userCustomNote: agentNote,
                                            engineMetadata: {
                                                vllmVersion: "v0.7.2-fs",
                                                plugins: ["LMCache", "tpu-inference"],
                                                lustreDirectIO: "o_direct",
                                                ioParallelism: "Tuned 16MB"
                                            }
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
                                        onClick={(e) => { e.preventDefault(); handleShareAgent(); }}
                                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-center text-[11px] font-bold text-slate-200 hover:text-white border border-slate-700 transition-colors cursor-pointer no-underline block"
                                    >
                                        🚀 Cursor IDE
                                    </a>
                                    <button 
                                        onClick={handleShareAgent}
                                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-center text-[11px] font-bold text-slate-200 hover:text-white border border-slate-700 transition-colors cursor-pointer block"
                                    >
                                        🚀 Vertex AI
                                    </button>
                                    <button 
                                        onClick={handleShareAgent}
                                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-center text-[11px] font-bold text-slate-200 hover:text-white border border-slate-700 transition-colors cursor-pointer block"
                                    >
                                        🚀 GitHub Chat
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={handleShareAgent}
                                className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-900/30 transition-all flex items-center justify-center gap-2 relative cursor-pointer"
                            >
                                <Share2 className="w-4 h-4" />
                                <span>Generate JSON & Copy Payload</span>
                                {agentCopied && (
                                    <div className="absolute inset-0 bg-emerald-600 text-white font-bold flex items-center justify-center rounded-xl shadow-xl animate-in fade-in duration-200">
                                        Payload copied to clipboard!
                                    </div>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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

                            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3 font-mono text-xs text-slate-200 shadow-inner">
                                <div className="text-slate-400 text-[10px] select-none uppercase font-bold tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2">
                                    <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Managed Lustre & Cache Tuning Metadata</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] font-sans">
                                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                                        <span className="font-mono font-bold text-sky-400 block">Direct I/O (o_direct)</span>
                                        <span className="text-slate-400 block leading-tight">Bypasses file system cache to manage host memory and VRAM effectively.</span>
                                    </div>
                                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                                        <span className="font-mono font-bold text-teal-400 block">Tuned I/O Parallelism</span>
                                        <span className="text-slate-400 block leading-tight">Reads KV chunk files with enhanced parallelism to maximize decode throughput.</span>
                                    </div>
                                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                                        <span className="font-mono font-bold text-amber-400 block">vLLM v0.7.2-fs</span>
                                        <span className="text-slate-400 block leading-tight">Engine configured with FS-connectors and LMCache plugins.</span>
                                    </div>
                                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                                        <span className="font-mono font-bold text-emerald-400 block">Storage Tier</span>
                                        <span className="text-slate-400 block leading-tight">Host CPU RAM + Managed Lustre / Local SSD.</span>
                                    </div>
                                </div>
                                <div className="border-t border-slate-800/80 pt-3 mt-3 text-slate-400 text-[10px] select-none uppercase font-bold tracking-wider">
                                    Execute CLI Command:
                                </div>
                                <div className="text-xs bg-slate-900 p-2 rounded border border-slate-800 font-mono text-emerald-300 select-all">
                                    llm-d bench --profile=tiered-prefix-g4 --context-scales=10k,50k,100k --layers=vram,ram,ssd --o-direct --fs-connector
                                </div>
                            </div>

                            <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between border-t border-slate-800/60 pt-4 mt-2">
                                <a href="https://llm-d.ai/docs/guide/Installation/tiered-prefix-cache/cpu" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-bold text-sky-400 hover:text-sky-300 transition-colors text-xs bg-sky-500/10 px-3 py-1.5 rounded-lg border border-sky-500/20">
                                    <span>View llm-d CPU Offloading Guide</span>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                                <a href="https://github.com/llm-d/llm-d" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-bold text-slate-400 hover:text-slate-200 transition-colors text-xs">
                                    <span>Reproduce benchmark on GitHub</span>
                                    <ExternalLink className="w-3.5 h-3.5" />
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
