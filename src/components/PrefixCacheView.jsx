import React, { useState, useRef } from 'react';
import { ThroughputCostChart } from './Dashboard/ThroughputCostChart';

export default function PrefixCacheView({ onNavigateBack }) {
    const [tputType, setTputType] = useState('ttft');
    const [chartMode, setChartMode] = useState('tokens_per_sec');
    const [costMode, setCostMode] = useState('spot');
    const [showPerChip, setShowPerChip] = useState(false);
    const [showLabels, setShowLabels] = useState(true);
    const [showDataLabels, setShowDataLabels] = useState(false);
    const [showPareto, setShowPareto] = useState(false);
    const [isZoomEnabled, setIsZoomEnabled] = useState(false);
    const [zoomDomain, setZoomDomain] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [chartColorMode, setChartColorMode] = useState('hardware');
    const [xAxisMax, setXAxisMax] = useState(Infinity);
    const [isLogScaleX, setIsLogScaleX] = useState(false);

    const chartContainerRef = useRef(null);
    const lastMouseRef = useRef(null);

    const mockProps = {
        tputType, setTputType,
        chartMode, setChartMode,
        costMode, setCostMode,
        showPerChip, setShowPerChip,
        showLabels, setShowLabels,
        showDataLabels, setShowDataLabels,
        showPareto, setShowPareto,
        isZoomEnabled, setIsZoomEnabled,
        zoomDomain, setZoomDomain,
        chartContainerRef,
        isDragging, setIsDragging,
        lastMouseRef,
        chartColorMode, setChartColorMode,
        xAxisMax, setXAxisMax,
        isLogScaleX, setIsLogScaleX,
        setLatType: () => {},
        setDebugInfo: () => {},
        filteredBySource: [],
        selectedModels: new Set(),
        filteredData: [],
        selectedBenchmarks: new Set(),
        getBenchmarkKey: (d) => d.tier,
        metricAvailability: { input: true, total: true, qps: true, cost: true },
        qualityMetrics: { data: {} },
        theme: 'dark'
    };

    return (
        <div className="w-full p-6 flex flex-col gap-6 bg-sandbox-surface/50 rounded-2xl border border-slate-800/50">
            <div className="flex justify-between items-center border-b border-slate-800/50 pb-4">
                <div className="flex flex-col gap-1">
                    <h2 className="text-2xl font-bold text-white font-display">Prefix cache offloading</h2>
                    <p className="text-xs text-slate-400 font-sans">Evaluate performance trade-offs of offloading KV cache to CPU RAM and Managed Lustre.</p>
                </div>
                <button onClick={onNavigateBack} className="px-3 py-1.5 rounded bg-black/20 border border-slate-800 text-slate-400 hover:text-white transition-all font-mono text-xs">← Back</button>
            </div>
            <ThroughputCostChart isPrefixCacheMode={true} {...mockProps} />
        </div>
    );
}
