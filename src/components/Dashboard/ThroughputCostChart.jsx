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

import React from 'react';
import { ResponsiveContainer, LineChart, CartesianGrid, Tooltip, Line } from 'recharts';
import { RotateCcw, Maximize, Minimize } from 'lucide-react';
import { CustomLabel, CustomChartTooltip, CustomXAxis, CustomYAxis, ChartCard } from '../common';
import { getBucket, getEffectiveTp, getParetoFrontier } from '../../utils/dashboardHelpers';
import { normalizeQualityModelName } from '../../utils/qualityParser';

export const ThroughputCostChart = (props) => {
    const {
        tputType, setTputType, yQualityMode, setYQualityMode, chartMode, setChartMode,
        xQualityMode, setXQualityMode, costMode, setCostMode, showPerChip, setShowPerChip,
        showLabels, setShowLabels, showDataLabels, setShowDataLabels, showPareto, setShowPareto,
        qualityMetrics, allModels, selectedModels, filteredData, getBenchmarkKey, theme,
        isZoomEnabled, setIsZoomEnabled, zoomDomain, setZoomDomain, chartContainerRef,
        isDragging, setIsDragging, lastMouseRef, chartColorMode, setChartColorMode,
        metricAvailability, filteredBySource, xAxisMax, setXAxisMax, setDebugInfo,
        isLogScaleX, setIsLogScaleX, setLatType, selectedBenchmarks
    } = props;

    // We can infer canShowPerChip
    const validData = filteredBySource.filter(d => selectedModels.has(d.model));
    const canShowPerChip = validData.every(d => d.accelerator_count > 0);

    return (
      <div className="grid grid-cols-1 gap-4 mb-4">
        {(() => {
            // Determine Y-Axis based on Tput Type
            let yKey = 'throughput';
            let yLabel = 'Output Tokens/sec';
            
            // Priority selection for Y-Axis
            if (tputType === 'quality') {
                if (yQualityMode === 'mmlu_pro') {
                    yKey = 'quality.mmlu_pro';
                    yLabel = 'MMLU-Pro (%)';
                } else if (yQualityMode === 'arena_score_text') {
                    yKey = 'quality.arena';
                    yLabel = 'Arena Score (Text)';
                } else if (yQualityMode === 'live_code_bench') {
                    yKey = 'quality.live_code_bench';
                    yLabel = 'LiveCodeBench (%)';
                }
            } else if (tputType === 'input') {
                yKey = 'metrics.input_tput';
                yLabel = 'Input Tokens/sec';
            } else if (tputType === 'total') {
                yKey = 'metrics.total_tput';
                yLabel = 'Total Tokens/sec';
            } else if (tputType === 'qps') {
                yKey = 'metrics.request_rate';
                yLabel = 'Queries Per Second (QPS)';
            } else if (tputType === 'cost') {
                yKey = `metrics.cost.${costMode}`;
                yLabel = `Cost ($/1M Tokens) - ${costMode.replace('_', ' ').toUpperCase()}`;
            }

            // Compatibility fix if coming from old URL
            if (tputType === 'mmlu' || tputType === 'arena') {
                setTputType('quality');
                setYQualityMode(tputType === 'mmlu' ? 'mmlu_pro' : 'arena_score_text');
            }
            if (chartMode === 'mmlu' || chartMode === 'arena') {
                setChartMode('quality');
                setXQualityMode(chartMode === 'mmlu' ? 'mmlu_pro' : 'arena_score_text');
            }
            
            if (tputType !== 'cost' && tputType !== 'quality' && showPerChip) yLabel += ' per Chip';

            // Determine X-Axis based on Chart Mode
            let xKey = "time_per_output_token";
            let xLabel = "Time Per Output Token (ms)";
            
            if (chartMode === 'quality') {
                if (xQualityMode === 'mmlu_pro') {
                    xKey = 'quality.mmlu_pro';
                    xLabel = 'MMLU-Pro (%)';
                } else if (xQualityMode === 'arena_score_text') {
                    xKey = 'quality.arena';
                    xLabel = 'Arena Score (Text)';
                } else if (xQualityMode === 'live_code_bench') {
                    xKey = 'quality.live_code_bench';
                    xLabel = 'LiveCodeBench (%)';
                }
            } else if (chartMode === 'ntpot') {
                xKey = 'metrics.ntpot';
                xLabel = 'Normalized TPOT (ms)';
            } else if (chartMode === 'ttft') {
                xKey = 'metrics.ttft.mean';
                xLabel = 'Mean TTFT (ms)';
            } else if (chartMode === 'itl') {
                xKey = 'metrics.itl';
                xLabel = 'Inter-Token Latency (ms)';
            } else if (chartMode === 'tokens_per_sec') {
                xKey = 'tokens_per_second';
                xLabel = 'Throughput (Tokens/sec)';
            } else if (chartMode === 'lat') {
                xKey = 'metrics.e2e_latency';
                xLabel = 'E2E Latency (ms)';
            }
            // 1. Calculate Data Bounds
            const getVal = (obj, key) => {
                if (key.startsWith('quality.')) {
                    const normModel = normalizeQualityModelName(obj.model);
                    if (!qualityMetrics?.data?.[normModel]) return undefined;
                    const qData = qualityMetrics.data[normModel];
                    if (key === 'quality.mmlu_pro') return qData.mmlu_pro;
                    if (key === 'quality.arena') return qData.arena_score_text;
                    if (key === 'quality.arena_code') return qData.arena_score_code;
                    if (key === 'quality.live_code_bench') return qData.live_code_bench;
                }
                return key.split('.').reduce((o, i) => o?.[i], obj);
            };

            // Filter Function Builder
            // Enforce that BOTH X and Y values are present (> 0) to avoid plotting "0" for missing cost data
            const createFilter = (xKey) => (d) => {
                 const xVal = Number(getVal(d, xKey));
                 const yVal = Number(getVal(d, yKey));
                 return (!isNaN(xVal) && xVal > 0) && (!isNaN(yVal) && yVal > 0);
            };

            let filterFn = createFilter(xKey);

            if (chartMode === 'lat') {
                xKey = "metrics.e2e_latency";
                xLabel = "E2E Latency (ms)";
                filterFn = createFilter(xKey);
            } else if (chartMode === 'ntpot') {
                xKey = "metrics.ntpot";
                xLabel = "Normalized TPOT (ms)";
                filterFn = createFilter(xKey);
            } else if (chartMode === 'ttft') {
                xKey = "metrics.ttft.mean";
                xLabel = "Time To First Token (ms)";
                filterFn = createFilter(xKey);
            } else if (chartMode === 'itl') {
                xKey = "metrics.itl";
                xLabel = "Inter Token Latency (ms)";
                filterFn = createFilter(xKey);
            } else if (chartMode === 'tokens_per_sec') {
                xKey = "tokens_per_second";
                xLabel = "Tokens / Sec (1 / ITL)";
                filterFn = createFilter(xKey);
            } else if (chartMode === 'mmlu') {
                xKey = "quality.mmlu_pro";
                xLabel = "MMLU-Pro (%)";
                filterFn = createFilter(xKey);
            } else if (chartMode === 'arena') {
                xKey = "quality.arena";
                xLabel = "Arena Score (Text)";
                filterFn = createFilter(xKey);
            }

            const config = {
                title: `${yLabel.replace(' per Chip', '')} vs ${xLabel.replace(' (ms)', '')}`,
                xKey,
                xLabel,
                yKey,
                yLabel,
                filterFn
            };

            // 1. Calculate Data Bounds (getVal already defined above)
            
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            const visibleDataPoints = []; // Flattened
            
            // Directly iterate filteredData (already filtered by selectedBenchmarks)
            // This avoids the brittle allModels × filteredData double-loop where
            // d.model === model matching could fail due to normalization differences.
            filteredData.forEach(d => {
                if (config.filterFn(d)) {
                    const vx = Number(getVal(d, config.xKey));
                    const vy = Number(getVal(d, config.yKey));
                    if (!isNaN(vx) && !isNaN(vy)) {
                        const benchmarkKey = getBenchmarkKey(d);
                        const model = d.model_name || d.model || 'Unknown';
                        visibleDataPoints.push({ ...d, vx, vy, model, benchmarkKey });
                        if (vx < minX) minX = vx;
                        if (vx > maxX) maxX = vx;
                        if (vy < minY) minY = vy;
                        if (vy > maxY) maxY = vy;
                    }
                }
            });
            
            // Get unique benchmark keys (each upload becomes a distinct line)
            const uniqueBenchmarks = [...new Set(visibleDataPoints.map(d => d.benchmarkKey))];

            // Calculate Pareto Frontier if enabled
            let paretoData = [];
            if (showPareto && visibleDataPoints.length > 0) {
                 // Determine optimization directions
                 // Y-Axis:
                 // Tput/QPS -> Maximize
                 // Cost -> Minimize
                 const maximizeY = tputType !== 'cost';
                 
                 // X-Axis:
                 // Time/Latency -> Minimize
                 // (Currently all X modes are time-based)
                 const minimizeX = true;

                 paretoData = getParetoFrontier(visibleDataPoints, minimizeX, maximizeY);
            }

            // Handle empty data case
            if (minX === Infinity) { minX=0; maxX=100; minY=0; maxY=100; }
            
            // Add padding if using auto-bounds
            // Add padding if using auto-bounds
            const xPad = (maxX - minX) * 0.05 || (isLogScaleX ? minX*0.1 : 1);
            const yPad = (maxY - minY) * 0.05 || 1;
            
            let minXBound = Math.max(0, minX - xPad);
            let maxXBound = maxX + xPad;

            if (isLogScaleX) {
                  // Snap to powers of 10 for cleaner log scale
                  // Example: 12 -> 10, 856 -> 1000
                  const logMin = Math.floor(Math.log10(minX > 0 ? minX : 0.1));
                  const logMax = Math.ceil(Math.log10(maxX > 0 ? maxX : 100));
                  
                  minXBound = Math.pow(10, logMin);
                  maxXBound = Math.pow(10, logMax);
            }
            const autoX = [minXBound, maxXBound]; 
            const autoY = [Math.max(0, minY - yPad), maxY + yPad];

            const curX = zoomDomain?.x || autoX;
            const curY = zoomDomain?.y || autoY;

            // 2. Interaction Handlers
            const handleWheel = (e) => {
                if (!isZoomEnabled || !chartContainerRef.current) return;
                e.preventDefault();
                
                const { left, top, width, height } = chartContainerRef.current.getBoundingClientRect();
                const chartMargin = { left: 60, right: 30, top: 45, bottom: 45 };
                const chartWidth = width - chartMargin.left - chartMargin.right;
                const chartHeight = height - chartMargin.top - chartMargin.bottom;

                if (chartWidth <= 0 || chartHeight <= 0) return;

                // Mouse relative to chart area (0..1)
                const mx = Math.min(Math.max((e.clientX - left - chartMargin.left) / chartWidth, 0), 1);
                const my = Math.min(Math.max((e.clientY - top - chartMargin.top) / chartHeight, 0), 1);
                
                // Invert Y because SVG Y is top-down but chart value Y is bottom-up
                const myValRatio = 1 - my;

                const scale = e.deltaY > 0 ? 1.1 : 0.9; // Zoom out / in

                const xLen = curX[1] - curX[0];
                const yLen = curY[1] - curY[0];
                
                // Focus point value
                const focusX = curX[0] + mx * xLen;
                const focusY = curY[0] + myValRatio * yLen;
                
                const newXLen = xLen * scale;
                const newYLen = yLen * scale;

                let newX = [focusX - mx * newXLen, focusX + (1 - mx) * newXLen];
                let newY = [focusY - myValRatio * newYLen, focusY + (1 - myValRatio) * newYLen];
                
                // Clamp to 0
                if (newX[0] < 0) newX = [0, newX[1] - newX[0]]; // Maintain zoom scale but strict 0
                if (newY[0] < 0) newY = [0, newY[1] - newY[0]];
                
                setZoomDomain({ x: newX, y: newY });
            };

            const handleMouseDown = (e) => {
                if (!isZoomEnabled) return;
                e.preventDefault(); // Stop text selection
                setIsDragging(true);
                lastMouseRef.current = { x: e.clientX, y: e.clientY };
            };

            const handleMouseMove = (e) => {
                if (!isZoomEnabled || !isDragging || !lastMouseRef.current || !chartContainerRef.current) return;
                e.preventDefault();

                const { width, height } = chartContainerRef.current.getBoundingClientRect();
                const chartMargin = { left: 60, right: 30, top: 45, bottom: 45 };
                const chartWidth = width - chartMargin.left - chartMargin.right;
                const chartHeight = height - chartMargin.top - chartMargin.bottom;
                
                const dxPx = e.clientX - lastMouseRef.current.x;
                const dyPx = e.clientY - lastMouseRef.current.y;
                
                lastMouseRef.current = { x: e.clientX, y: e.clientY };

                const xLen = curX[1] - curX[0];
                const yLen = curY[1] - curY[0];
                
                const dxVal = -(dxPx / chartWidth) * xLen;
                const dyVal = (dyPx / chartHeight) * yLen; // Y is inverted in pixels

                let newX0 = curX[0] + dxVal;
                let newX1 = curX[1] + dxVal;
                
                let newY0 = curY[0] + dyVal;
                let newY1 = curY[1] + dyVal;

                // Stop at 0
                if (newX0 < 0) {
                    newX1 = newX1 - newX0;
                    newX0 = 0;
                }
                if (newY0 < 0) {
                    newY1 = newY1 - newY0;
                    newY0 = 0;
                }

                setZoomDomain({
                    x: [newX0, newX1],
                    y: [newY0, newY1]
                });
            };

            const handleMouseUp = () => {
                setIsDragging(false);
                lastMouseRef.current = null;
            };

            // 3. Color Logic (Spectrum)
            const colorPalettes = {
                'h100': ['#3b82f6', '#60a5fa', '#93c5fd', '#2563eb', '#1d4ed8'], // Blue
                'a100': ['#10b981', '#34d399', '#6ee7b7', '#059669', '#047857'], // Emerald
                'h200': ['#f43f5e', '#fb7185', '#fda4af', '#e11d48', '#be123c'], // Rose (Red-ish)
                'b200': ['#06b6d4', '#22d3ee', '#67e8f9', '#0891b2', '#155e75'], // Cyan (Distinct from H200)
                'gb200':['#ec4899', '#f472b6', '#fbcfe8', '#db2777', '#be185d'], // Pink
                
                // TPUs - Analogous Colors (Purples/Violets/Indigos) - Google Hardware Group
                'tpu':    ['#d946ef', '#e879f9', '#f0abfc', '#c026d3', '#a21caf'], // Fuchsia (v7 fallback)
                'tpu_v5': ['#6366f1', '#818cf8', '#a5b4fc', '#4f46e5', '#4338ca'], // Indigo (v5)
                'tpu_v6': ['#8b5cf6', '#a78bfa', '#c4b5fd', '#7c3aed', '#6d28d9'], // Violet (v6) - Slightly warmer than Indigo
                'tpu_v7': ['#d946ef', '#e879f9', '#f0abfc', '#c026d3', '#a21caf'], // Fuchsia (v7) - Distinctive Pink/Purple
                
                'l4':   ['#f59e0b', '#fbbf24', '#fcd34d', '#d97706', '#b45309'], // Amber
                'rtx':  ['#71717a', '#a1a1aa', '#d4d4d8', '#52525b', '#3f3f46'], // Zinc
                'mi300':['#14b8a6', '#5eead4', '#99f6e4', '#0d9488', '#0f766e'], // Teal
                'other':['#94a3b8', '#cbd5e1', '#64748b', '#475569', '#e2e8f0']  // Slate
            };

            // Helper to generate a palette from a base color (varying lightness)
            // We'll use a simple approach: if base is hex, we might just use a pre-defined set of categorical palettes that are arrays
            const categoricalPalettes = [
                 ['#3b82f6', '#60a5fa', '#93c5fd', '#2563eb', '#1d4ed8'], // Blue
                 ['#ef4444', '#f87171', '#fca5a5', '#dc2626', '#b91c1c'], // Red
                 ['#10b981', '#34d399', '#6ee7b7', '#059669', '#047857'], // Emerald
                 ['#f59e0b', '#fbbf24', '#fcd34d', '#d97706', '#b45309'], // Amber
                 ['#8b5cf6', '#a78bfa', '#c4b5fd', '#7c3aed', '#6d28d9'], // Violet
                 ['#ec4899', '#f472b6', '#fbcfe8', '#db2777', '#be185d'], // Pink
                 ['#06b6d4', '#22d3ee', '#67e8f9', '#0891b2', '#155e75'], // Cyan
                 ['#84cc16', '#a3e635', '#bef264', '#65a30d', '#4d7c0f'], // Lime
                 ['#6366f1', '#818cf8', '#a5b4fc', '#4f46e5', '#4338ca'], // Indigo
                 ['#14b8a6', '#5eead4', '#99f6e4', '#0d9488', '#0f766e'], // Teal
            ];

            const getHwKey = (s) => {
                const v = String(s).toLowerCase();
                // Specific Matches First
                if (v.includes('h200') || v.includes('a3-ultra')) return 'h200';
                if (v.includes('gb200')) return 'gb200';
                if (v.includes('b200')) return 'b200'; 
                
                if (v.includes('tpu-v5') || v.includes('v5')) return 'tpu_v5';
                if (v.includes('tpu-v6') || v.includes('v6')) return 'tpu_v6';
                if (v.includes('tpu-v7') || v.includes('v7')) return 'tpu_v7';
                if (v.includes('tpu')) return 'tpu'; // Fallback for v4/generic
                
                if (v.includes('h100') || v.includes('a3')) return 'h100';
                if (v.includes('a100') || v.includes('a2')) return 'a100';
                if (v.includes('l4') || v.includes('g2')) return 'l4';
                if (v.includes('rtx')) return 'rtx';
                if (v.includes('mi3')) return 'mi300';
                return 'other';
            };

            const modelColorMap = new Map();
            const benchmarkColorMap = new Map();
            const colorGroups = {}; // groupKey -> [benchmarkKeys]
            const groupLabels = {}; // groupKey -> Label String
            
            // Group benchmarks
            uniqueBenchmarks.forEach(benchmarkKey => {
                const bData = visibleDataPoints.filter(d => d.benchmarkKey === benchmarkKey);
                if (!bData.length) return;
                
                const sample = bData[0];
                let groupKey = 'other';
                let groupLabel = 'Other';

                if (chartColorMode === 'hardware') {
                     const candidates = [
                        sample.metadata?.hardware,
                        sample.hardware,
                        sample.metadata?.machine_type,
                        sample.machine_type
                     ].filter(val => val && val !== 'Unknown');
                     
                     let hwKey = 'other';
                     for (const s of candidates) {
                         const k = getHwKey(s);
                         if (k !== 'other') {
                             hwKey = k;
                             break;
                         }
                     }
                     groupKey = hwKey;
                     // We don't strictly need a custom label map for HW because we look it up in the predefined list later
                     // But for consistency:
                     groupLabel = groupKey; 

                 } else if (chartColorMode === 'model') {
                    // Group by clean model name, but use full model string for groupKey to keep individual colors if desired
                    // Actually, if user wants it by Model, we should group by model_name
                    groupKey = sample.metadata?.model_name || sample.model || 'Unknown';
                    groupLabel = groupKey;

                } else if (chartColorMode === 'node_config') {
                    // Optimized: Use pre-computed configuration string if available (matches chart labels)
                    if (sample.metadata?.configuration && sample.metadata.configuration !== 'Unknown') {
                        groupKey = sample.metadata.configuration;
                    } else if (sample.configuration && sample.configuration !== 'Unknown') {
                         groupKey = sample.configuration;
                    } else {
                        // Fallback: Reconstruct from metadata (legacy/raw data)
                        const tp = getEffectiveTp(sample);
                        const isDisaggregated = sample.metadata?.roles;
                        let numNodes = sample.num_nodes || 1;
                        
                        if (isDisaggregated) {
                            try {
                                const prefill = sample.metadata.roles.find(r => r.type === 'prefill');
                                const decode = sample.metadata.roles.find(r => r.type === 'decode');
                                const pNodes = prefill?.count || 0;
                                const dNodes = decode?.count || 0;
                                const pTp = prefill?.tp ? `TP${prefill.tp}` : (tp || '');
                                const dTp = decode?.tp ? `TP${decode.tp}` : (tp || '');
                                
                                // Normalize to "Nodes: ..." format
                                groupKey = `Nodes: ${pNodes}P-${pTp} ${dNodes}D-${dTp}`;
                            } catch (e) {
                                 groupKey = `${numNodes} Disagg`;
                            }
                        } else {
                            // Aggregated
                            // Normalize to "Nodes: ..." format
                            groupKey = `Nodes: ${numNodes} ${tp || ''}`.trim();
                        }
                    }
                    groupLabel = groupKey;
                }

                if (!colorGroups[groupKey]) colorGroups[groupKey] = [];
                colorGroups[groupKey].push(benchmarkKey);
                groupLabels[groupKey] = groupLabel;
            });

            // Assign Colors
            // If Hardware: key matches keys in 'colorPalettes'
            // If Other: assign from categoricalPalettes dynamically
            
            // Stable sort keys to ensure color stability
            const sortedGroupKeys = Object.keys(colorGroups).sort((a, b) => {
                if (chartColorMode === 'node_config') {
                    // Helper to parse total node count from string
                    const getNodesAndType = (s) => {
                        // Pattern 1: Disaggregated "4: 1P-TP4 3D-TP4"
                        // New format includes total nodes at the start
                        const disaggMatch = s.match(/^(\d+):\s+/);
                        if (disaggMatch) {
                            return { nodes: parseInt(disaggMatch[1]), type: 'disaggregated' };
                        }
                        
                        // Legacy Disaggregated (just in case): "1P-TP4 3D-TP4"
                        const legacyDisagg = s.match(/(\d+)P(?:-TP\d+)?\s+(\d+)D(?:-TP\d+)?/);
                        if (legacyDisagg) {
                             return { nodes: parseInt(legacyDisagg[1]) + parseInt(legacyDisagg[2]), type: 'disaggregated' };
                        }
                        
                        // Pattern 2: Aggregated "1 TP8" or "1"
                        const aggMatch = s.match(/^(\d+)/);
                        if (aggMatch) {
                            return { nodes: parseInt(aggMatch[1]), type: 'aggregated' };
                        }
                        
                        // Fallback
                        return { nodes: 0, type: 'unknown' };
                    };
                    
                    const aInfo = getNodesAndType(a);
                    const bInfo = getNodesAndType(b);
                    
                    // 1. Sort by Total Node Count (Ascending)
                    if (aInfo.nodes !== bInfo.nodes) {
                        return aInfo.nodes - bInfo.nodes;
                    }
                    
                    // 2. Tie-breaker: Aggregated before Disaggregated
                    if (aInfo.type !== bInfo.type) {
                        if (aInfo.type === 'aggregated') return -1;
                        if (bInfo.type === 'aggregated') return 1;
                    }
                    
                    // 3. Final Tie-breaker: Alphabetical
                    return a.localeCompare(b);
                }
                
                // Default alphabetical sort for other modes
                return a.localeCompare(b);
            });
            
            sortedGroupKeys.forEach((key, groupIndex) => {
                let palette;
                
                if (chartColorMode === 'hardware') {
                    palette = colorPalettes[key] || colorPalettes['other'];
                } else {
                    // Cycle through categorical palettes
                    palette = categoricalPalettes[groupIndex % categoricalPalettes.length];
                }

                colorGroups[key].forEach((benchmarkKey, i) => {
                    const color = palette[i % palette.length];
                    benchmarkColorMap.set(benchmarkKey, color);
                    const sample = visibleDataPoints.find(d => d.benchmarkKey === benchmarkKey);
                    if (sample) modelColorMap.set(sample.model, color);
                });
            });

            // 4. Smart Label Generation
            // -------------------------
            const smartLabels = {};
            
            if (uniqueBenchmarks.length > 0) {
                 // 1. Gather Attributes
                 const attrs = uniqueBenchmarks.map(bk => {
                     const sample = visibleDataPoints.find(d => d.benchmarkKey === bk);
                     if (!sample) return { id: bk, family: 'Unknown', parts: {} };
                     
                     // Helper to clean TP
                     let tp = sample.metadata?.tensor_parallelism || sample.metadata?.tp || '';
                     if (tp && !String(tp).startsWith('TP')) tp = `TP${tp}`;

                     const isl = sample.metadata?.input_seq_len || sample.isl;
                     const osl = sample.metadata?.output_seq_len || sample.osl;
                     const workload = (isl && osl) ? `${getBucket(isl)}/${getBucket(osl)}` : '';
                     
                     // Extract filename if LPG
                     let filename = '';
                     if (bk.startsWith('inference-perf:')) {
                         filename = bk.replace('inference-perf:', '').replace(/\.[^.]+$/, '');
                     }

                     return {
                         id: bk,
                         family: sample.metadata?.model_name || sample.model || 'Unknown',
                         hardware: sample.metadata?.hardware || 'Unknown',
                         precision: sample.metadata?.precision || 'Unknown',
                         tp: tp,
                         configuration: sample.metadata?.configuration || '',
                         workload: workload,
                         backend: sample.metadata?.backend || sample.source || '',
                         filename: filename
                     };
                 });

                 // 2. Find Constants (only if we have multiple lines)
                 const isConst = (key) => {
                     if (uniqueBenchmarks.length < 2) return false; // Show full details if single line
                     const first = attrs[0][key];
                     return attrs.every(a => a[key] === first);
                 };
                 
                 const constFamily = isConst('family');
                 const constHw = isConst('hardware');
                 const constPrec = isConst('precision');
                 const constTp = isConst('tp');
                 const constConfiguration = isConst('configuration');
                 const constWorkload = isConst('workload');
                 // For backend, if it's constant OR if it's 'lpg', we might want to hide it if explicit filenames are used?
                 // Let's stick to standard diff logic
                 const constBackend = isConst('backend');
                 // const constFilename = isConst('filename');
                 
                 // 3. Build Labels
                 // First pass: Build core labels without source/filename info
                 const coreLabels = new Map(); // id -> label string
                 const labelCounts = new Map(); // label string -> count

                 attrs.forEach(a => {
                     const parts = [];
                     
                     // Show Model Name (family) ONLY if:
                     // 1. It differs across benchmarks (!constFamily)
                     // 2. OR there is only one benchmark total (so the user knows what they are looking at)
                     if (!constFamily || uniqueBenchmarks.length === 1) {
                        parts.push(a.family);
                     }
                     
                     const variants = [];
                     // Add Configuration (Node Config) if meaningful and not constant
                     if (!constConfiguration && a.configuration && a.configuration !== 'Unknown') {
                         variants.push(a.configuration);
                     }
                     
                     if (!constHw && a.hardware !== 'Unknown') variants.push(a.hardware);
                     if (!constPrec && a.precision !== 'Unknown') variants.push(a.precision);
                     
                     // Don't show generic TP if we already showed a configuration (which includes TP info)
                     const hasConfig = !constConfiguration && a.configuration && a.configuration !== 'Unknown';
                     if (!hasConfig && !constTp && a.tp) variants.push(a.tp);
                     
                     if (!constWorkload && a.workload) variants.push(a.workload);
                     
                     if (variants.length > 0) {
                         parts.push(variants.join(', '));
                     }
                     
                     const label = parts.join(' ');
                     coreLabels.set(a.id, label);
                     labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
                 });

                 // Second pass: Finalize labels, adding source only if ambiguous
                 attrs.forEach(a => {
                     let label = coreLabels.get(a.id);
                     const isAmbiguous = labelCounts.get(label) > 1;

                     // Fallback check: if label is empty (e.g. constant family and no variants), it's ambiguous by definition relative to "nothing"
                     if (!label || label === '()' || label === '') {
                        label = a.family; 
                         // Check ambiguity again with family included if it wasn't before
                         // (Actually, logic above ensures family is included if not constant, or if single line. 
                         // If family IS constant and we have >1 lines, empty variants implies they are identical clones)
                     }

                     if (isAmbiguous) {
                         // Must verify if filename/backend actually helps differentiate
                         if (a.filename) {
                             label += ` (${a.filename})`;
                         } else if (!constBackend && a.backend && a.backend !== 'Unknown') {
                             label += ` (${a.backend})`;
                         }
                     }
                     
                     smartLabels[a.id] = label;
                 });
            }

            return (
                <ChartCard title={config.title}>
                  {/* Y-Axis Controls - Connected Sticky within Card */}
                  <div className="sticky top-[60px] z-30 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700/50 pb-2 mb-2 -mx-2 px-2 flex items-center justify-between gap-4 flex-wrap">
                       <div className="flex-1 flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700/50">
                          {/* Y-Axis Group */}
                          <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-700 dark:text-slate-500 font-bold uppercase tracking-wider">Y-Axis</span>
                              <div className="h-4 w-px bg-slate-300 dark:bg-slate-700"/>
                              <button onClick={() => setTputType('output')} className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${tputType === 'output' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`}>Output</button>
                              <button onClick={() => metricAvailability.input && setTputType('input')} disabled={!metricAvailability.input} className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${!metricAvailability.input ? 'text-slate-600 cursor-not-allowed opacity-50' : tputType === 'input' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`} title={metricAvailability.input ? "Input Tokens per Second" : "Available only when input token stats are reported"}>Input</button>
                              <button onClick={() => metricAvailability.total && setTputType('total')} disabled={!metricAvailability.total} className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${!metricAvailability.total ? 'text-slate-600 cursor-not-allowed opacity-50' : tputType === 'total' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`} title={metricAvailability.total ? "Total Tokens per Second" : "Available only when total token stats are reported"}>Total</button>
                              <button onClick={() => metricAvailability.qps && setTputType('qps')} disabled={!metricAvailability.qps} className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${!metricAvailability.qps ? 'text-slate-600 cursor-not-allowed opacity-50' : tputType === 'qps' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`} title={metricAvailability.qps ? "Queries Per Second (QPS)" : "Available only when QPS is reported"}>QPS</button>
                              <button onClick={() => metricAvailability.cost && setTputType('cost')} disabled={!metricAvailability.cost} className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${!metricAvailability.cost ? 'text-slate-600 cursor-not-allowed opacity-50' : tputType === 'cost' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`} title={metricAvailability.cost ? "Cost per 1M Tokens" : "Available only when cost data is reported"}>Cost</button>
                          </div>
                      
                      <div className="h-4 w-px bg-slate-300 dark:bg-slate-700"/>
                      
                      {tputType === 'cost' && (
                          <select 
                                value={costMode} 
                                onChange={(e) => setCostMode(e.target.value)}
                                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-xs px-2 py-1 text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500"
                          >
                              <option value="spot">Spot</option>
                              <option value="on_demand">On Demand</option>
                              <option value="cud_1y">CUD 1y</option>
                              <option value="cud_3y">CUD 3y</option>
                          </select>
                      )}

                      {tputType !== 'cost' && (
                          <button onClick={() => canShowPerChip && setShowPerChip(!showPerChip)} disabled={!canShowPerChip} className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${!canShowPerChip ? 'text-slate-600 cursor-not-allowed opacity-50' : showPerChip ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`} title={canShowPerChip ? "Normalize metric per chip" : "Available only when all selected benchmarks have known chip counts"}>Per Chip</button>
                      )}
                      
                      <div className="h-4 w-px bg-slate-300 dark:bg-slate-700"/>
                      
                      <button 
                          onClick={() => setShowLabels(!showLabels)} 
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${showLabels ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`}
                      >
                          Labels
                      </button>
                      
                      <button 
                          onClick={() => setShowDataLabels(!showDataLabels)} 
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${showDataLabels ? 'bg-pink-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`}
                          title="Show TP data points"
                      >
                          Points
                      </button>

                      <div className="h-4 w-px bg-slate-300 dark:bg-slate-700"/>

                      <button 
                          onClick={() => setShowPareto(!showPareto)} 
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${showPareto ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`}
                          title={`Pareto Frontier \n\nImplementation Model:\nCalculates the Pareto Efficiency Frontier by identifying the set of non-dominated configurations (e.g. highest throughput for a given latency) and connecting them linearly.`}
                      >
                          Pareto
                      </button>
                    </div>
                  </div>
                  <div 
                      ref={chartContainerRef}
                      className={`relative w-full min-h-[450px] h-[60vh] select-none ${isZoomEnabled ? (isDragging ? 'cursor-grabbing' : 'cursor-default') : 'cursor-default'}`}
                      onWheel={handleWheel}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                  >
                      {zoomDomain && (
                          <button 
                              onClick={() => setZoomDomain(null)}
                              className="absolute top-2 right-2 z-10 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded border border-slate-600 shadow-sm flex items-center gap-1"
                          >
                              <RotateCcw size={10} /> Reset Zoom
                          </button>
                      )}
                      
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart margin={{ top: 45, right: 30, left: 60, bottom: 45 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                          <CustomXAxis 
                            type="number" 
                            dataKey="vx" 
                            label={config.xLabel} 
                            domain={curX}
                            scale={isLogScaleX ? 'log' : 'auto'}
                            allowDataOverflow={true}
                            theme={theme}
                            ticks={isLogScaleX ? (() => {
                                // Generating power-of-10 ticks within the current domain
                                const min = curX[0];
                                const max = curX[1];
                                const ticks = [];
                                let current = Math.pow(10, Math.ceil(Math.log10(min)));
                                while (current <= max) {
                                    ticks.push(current);
                                    current *= 10;
                                }
                                // Ensure bounds are included for context if they are significant
                                return ticks;
                            })() : undefined}
                            tickFormatter={(val) => {
                                const v = Number(val);
                                return Math.abs(v) >= 100 ? v.toFixed(0) : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
                            }}
                          />
                          <CustomYAxis 
                            label={config.yLabel} 
                            domain={curY}
                            allowDataOverflow={true}
                            theme={theme}
                            tickFormatter={(val) => {
                                const v = Number(val);
                                return Math.abs(v) >= 100 ? v.toFixed(0) : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
                            }}
                          />
                          <Tooltip 
                            content={<CustomChartTooltip xLabel={config.xLabel} yLabel={config.yLabel} costMode={costMode} qualityMetrics={qualityMetrics} />}
                            wrapperStyle={{ outline: 'none', zIndex: 100 }}
                            cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                            animationDuration={200}
                          />
    
                          {uniqueBenchmarks.map((benchmarkKey) => {
                              // Get the model for this benchmark (for label display)
                              const sample = visibleDataPoints.find(d => d.benchmarkKey === benchmarkKey);
                              if (!sample) return null;
                              const model = sample.model;
                              
                              // Visibility Check: Must check benchmarkKey directly for file-based benchmarks
                              if (!selectedBenchmarks.has(benchmarkKey)) return null;
                              
                              const color = benchmarkColorMap.get(benchmarkKey) || modelColorMap.get(model);
                              if (!color) return null;

                              const lineData = visibleDataPoints
                                  .filter(d => d.benchmarkKey === benchmarkKey)
                                  .sort((a, b) => {
                                      // Sort by QPS (request_rate) first to ensure logical line tracing through load points
                                      const qpsA = Number(getVal(a, 'metrics.request_rate')) || 0;
                                      const qpsB = Number(getVal(b, 'metrics.request_rate')) || 0;
                                      
                                      if (qpsA !== qpsB) return qpsA - qpsB;

                                      // Fallback: Sort by current X-axis value to prevent Recharts from drawing backtracking lines
                                      // 'vx' represents the computed X coordinate for this data point
                                      return a.vx - b.vx;
                                  });
                               
                              if (!lineData.length) return null;
                              
                              // Create a display name for the legend
                              // Use workload info if available, otherwise source
                              let displayName = model;
                              if (sample.metadata?.workload_id) {
                                  displayName = `${model} (${sample.metadata.workload_id})`;
                              } else if (benchmarkKey.startsWith('inference-perf:')) {
                                  // Re-add file extension logic if needed, but often lpg relies on name
                                  const filename = benchmarkKey.replace('inference-perf:', '').replace(/\.[^.]+$/, '');
                                  displayName = `${model} (${filename})`;
                              } else if (benchmarkKey.startsWith('file:')) {
                                  // Extract filename from file:source:filename key
                                  const parts = benchmarkKey.split(':');
                                  const filename = parts[parts.length - 1]; // Last part is filename
                                  displayName = `${model} (${filename})`;
                              }

                              return (
                              <Line 
                                key={benchmarkKey}
                                data={lineData}
                                type="monotone" 
                                dataKey="vy" 
                                name={displayName} 
                                stroke={color} 
                                strokeDasharray="0"
                                strokeWidth={2} 
                                dot={true} 
                                isAnimationActive={false}
                                label={(props) => <CustomLabel {...props} lastIndex={lineData.length - 1} text={smartLabels[benchmarkKey] || displayName} stroke={color} showLineLabel={showLabels} showDataLabels={showDataLabels} dataPoint={lineData[props.index]} />}
                                activeDot={{
                                    r: 6,
                                    fill: "#ef4444",
                                    stroke: "#fff",
                                    strokeWidth: 2,
                                    style: { cursor: 'pointer' },
                                    onClick: (_, payload) => {
                                        const d = payload.payload;
                                        setDebugInfo({
                                            title: `Data Inspector: ${d.model}`,
                                            url: d.raw_url,
                                            content: `=== NORMALIZED DATA ===\n${JSON.stringify(d, (key, value) => {
                                                if (['vx', 'vy'].includes(key)) return undefined;
                                                return key === '_raw' ? undefined : value;
                                            }, 2)}\n\n=== ORIGINAL SOURCE ===\n${JSON.stringify(d._raw || "Original source not available", null, 2)}`
                                        });
                                    }
                                }}
                              />
                              );
                          })}

                          {showPareto && paretoData.length > 1 && (
                               <Line
                                   data={paretoData}
                                   type="linear"
                                   dataKey="vy"
                                   name="Pareto Frontier"
                                   stroke="#f59e0b" // Amber-500
                                   strokeWidth={3}
                                   strokeDasharray="5 5"
                                   dot={false}
                                   activeDot={false}
                                   style={{ opacity: 0.8 }}
                                   isAnimationActive={false}
                               />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                  </div>
                  
                   {/* Hardware / Color Legend */}
                   <div className="mt-1 border-t border-slate-700/50 pt-1 px-2">
                       <div className="flex items-center justify-between mb-2">
                           <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                               {chartColorMode === 'hardware' ? 'Hardware / Machine Types' : 
                                chartColorMode === 'model' ? 'Models' : 'Node Configurations'}
                           </h4>
                           
                           {/* Color Mode Selector */}
                           <div className="flex items-center gap-2">
                               <span className="text-[10px] text-slate-500 font-medium">Color By:</span>
                               <select 
                                   value={chartColorMode}
                                   onChange={(e) => setChartColorMode(e.target.value)}
                                   className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-[10px] px-1 py-0.5 text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500"
                               >
                                   <option value="hardware">Hardware</option>
                                   <option value="node_config">Node Config</option>
                                   <option value="model">Model</option>
                               </select>
                           </div>
                       </div>
                       
                       <div className="flex flex-wrap gap-x-8 gap-y-3">
                           {sortedGroupKeys.map(key => {
                               // Get first color of the group to show representation
                               // If hardware, we have a palette. If categorical, we have a palette.
                               // Just show 5-stop gradient or single color block? 
                               // Let's show the palette strips like before.
                               
                               let palette;
                               if (chartColorMode === 'hardware') {
                                   palette = colorPalettes[key] || colorPalettes['other'];
                               } else {
                                   const groupIndex = sortedGroupKeys.indexOf(key);
                                   palette = categoricalPalettes[groupIndex % categoricalPalettes.length];
                               }
                               
                               // Label resolution
                               let label = groupLabels[key] || key;
                               if (chartColorMode === 'hardware') {
                                    // Map codes to nice names
                                    const hwMap = {
                                        'h100': 'H100',
                                        'a100': 'A100',
                                        'h200': 'H200',
                                        'tpu_v5': 'TPU v5',
                                        'tpu_v6': 'TPU v6',
                                        'tpu_v7': 'TPU v7',
                                        'tpu': 'TPU v7',
                                        'l4': 'L4',
                                        'gb200': 'GB200',
                                        'b200': 'B200',
                                        'mi300': 'MI300',
                                        'rtx': 'RTX PRO 6K',
                                        'other': 'Other'
                                    };
                                    label = hwMap[key] || key;
                               }

                               return (
                                   <div key={key} className="flex flex-col gap-1">
                                       <div className="flex rounded overflow-hidden shadow-sm">
                                           {palette.map(c => (
                                               <div key={c} className="w-4 h-3" style={{ backgroundColor: c }} />
                                           ))}
                                       </div>
                                       <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight max-w-[200px] truncate" title={label}>{label}</span>
                                   </div>
                               );
                           })}
                       </div>
                  </div>

                  {/* X-Axis Controls & Zoom */}
                  <div className="mt-1 border-t border-slate-200 dark:border-slate-700/50 pt-1 px-2 flex items-center justify-between gap-4 flex-wrap">
                       <div className="flex-1 flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700/50">
                           {/* X-Axis Controls */}
                           <div className="flex items-center gap-2">
                               <span className="text-[10px] text-slate-700 dark:text-slate-500 font-bold uppercase tracking-wider">X-Axis</span>
                               <div className="h-4 w-px bg-slate-300 dark:bg-slate-700"/>
                               <button onClick={() => setChartMode('tpot')} className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${chartMode === 'tpot' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`}>TPOT</button>
                               <button 
                                   onClick={() => metricAvailability.ntpot && setChartMode('ntpot')} 
                                   disabled={!metricAvailability.ntpot}
                                   className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${!metricAvailability.ntpot ? 'text-slate-600 cursor-not-allowed opacity-50' : chartMode === 'ntpot' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`}
                                   title={metricAvailability.ntpot ? "Normalized Time Per Output Token" : "Available only when NTPOT data is reported"}
                                >NTPOT</button>
                               <button 
                                   onClick={() => metricAvailability.ttft && setChartMode('ttft')} 
                                   disabled={!metricAvailability.ttft}
                                   className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${!metricAvailability.ttft ? 'text-slate-600 cursor-not-allowed opacity-50' : chartMode === 'ttft' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`}
                                   title={metricAvailability.ttft ? "Time To First Token" : "Available only when TTFT data is reported"}
                                >TTFT</button>
                               <button 
                                   onClick={() => metricAvailability.itl && setChartMode('itl')} 
                                   disabled={!metricAvailability.itl}
                                   className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${!metricAvailability.itl ? 'text-slate-600 cursor-not-allowed opacity-50' : chartMode === 'itl' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`}
                                   title={metricAvailability.itl ? "Inter Token Latency" : "Available only when ITL data is reported"}
                                >ITL</button>
                               <button 
                                   onClick={() => metricAvailability.tokens_per_sec && setChartMode('tokens_per_sec')} 
                                   disabled={!metricAvailability.tokens_per_sec}
                                   className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${!metricAvailability.tokens_per_sec ? 'text-slate-600 cursor-not-allowed opacity-50' : chartMode === 'tokens_per_sec' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`}
                                   title={metricAvailability.tokens_per_sec ? "Tokens Per Second (Reciprocal of ITL)" : "Available only when Tokens/Sec data is derived/reported"}
                                >Tokens/Sec</button>
                               <button onClick={() => { setChartMode('lat'); setLatType('e2e'); }} className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${chartMode === 'lat' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`}>E2E Latency</button>
                           </div>
                           
                           {/* Max Slider */}
                           {(() => {
                                let xKey = 'time_per_output_token';
                                 if (chartMode === 'qps') xKey = 'metrics.request_rate';
                                 else if (chartMode === 'ntpot') xKey = 'metrics.ntpot';
                                 else if (chartMode === 'ttft') xKey = 'metrics.ttft.mean';
                                 else if (chartMode === 'itl') xKey = 'metrics.itl';
                                 else if (chartMode === 'tokens_per_sec') xKey = 'tokens_per_second';
                                 else if (chartMode === 'lat') xKey = 'metrics.e2e_latency';

                                 const getVal = (obj, key) => {
                                     return key.split('.').reduce((o, i) => o?.[i], obj);
                                 };
                                const validData = filteredBySource.filter(d => selectedModels.has(d.model));
                                const dataMax = validData.length > 0 ? Math.max(...validData.map(d => Number(getVal(d, xKey)) || 0)) : (Math.max(...filteredBySource.map(d => Number(getVal(d, xKey)) || 0)) || 100);
                                const step = Math.max(0.01, dataMax / 100);
                                const currentMax = xAxisMax === Infinity ? dataMax : xAxisMax;
                                return (
                                    <div className="flex-1 flex items-center gap-2 border-l border-slate-300 dark:border-slate-700 pl-4">
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400">Max:</span>
                                        <input type="range" min={0} max={dataMax} step={step} value={currentMax} onChange={(e) => { const val = parseFloat(e.target.value); if (val >= dataMax * 0.99) setXAxisMax(Infinity); else setXAxisMax(val); }} className="w-full h-1 bg-slate-300 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                                        <input type="number" value={xAxisMax === Infinity ? '' : xAxisMax} placeholder={dataMax.toFixed(chartMode === 'tpot' ? 2 : 0)} onChange={(e) => { const val = parseFloat(e.target.value); if (!val || isNaN(val)) setXAxisMax(Infinity); else setXAxisMax(val); }} className="w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-xs px-1 py-0.5 text-slate-800 dark:text-slate-200 focus:border-blue-500 outline-none placeholder:text-slate-500 dark:placeholder:text-slate-600 text-right" />
                                        <span className="text-[10px] text-slate-500 w-4">{chartMode === 'tpot' || chartMode === 'lat' ? 'ms' : ''}</span>
                                    </div>
                                );
                           })()}
                       </div>

                       {/* Zoom Toggle */}
                       <div className="flex items-center gap-2">
                            {/* Log X Toggle */}
                            <button 
                                onClick={() => setIsLogScaleX(!isLogScaleX)} 
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${isLogScaleX ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`}
                                title="Toggle Logarithmic Scale for X-Axis"
                            >
                                Log X
                            </button>

                           <div className="h-4 w-px bg-slate-700"/>
                           <button onClick={() => { const newValue = !isZoomEnabled; setIsZoomEnabled(newValue); if (!newValue) setZoomDomain(null); }} className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${isZoomEnabled ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`} title="Enable mouse wheel zoom and drag pan">
                               {isZoomEnabled ? 'Zoom: ON' : 'Zoom: OFF'}
                           </button>
                       </div>
                  </div>
                </ChartCard>
            );
        })()}
      </div>
    );
};
