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
import { createPortal } from 'react-dom';
import { RotateCcw, ChevronDown, ChevronUp, Star, Pin, CheckSquare, Square, Check, Pencil, Trash2, Code2, Copy, X, Database, Eye, ShieldCheck, AlertCircle, TrendingUp, AlertTriangle, Search, FileText, FileClock, Sliders, Activity, Send, Play, Loader } from 'lucide-react';
import { RunComparisonChart } from '../Dashboard/RunComparisonChart';
import { ThroughputCostChart } from '../Dashboard/ThroughputCostChart';
import { getEffectiveTp, getBucket, getSourceTag, getSourceType, getSourceTypeStyle, formatOriginLabel, getSubmissionStatusDetails, getBenchmarkKey } from '../../utils/dashboardHelpers';
import yaml from 'js-yaml';
import { useGitHubAuth } from '../../hooks/useGitHubAuth';
import { validateBenchmark } from '../../utils/benchmarkValidator';
import { v4 as uuidv4 } from 'uuid';

const getCleanModelName = (name) => {
    if (!name) return '';
    return name.replace(/\s*\[.*?\]/g, '').replace(/\s*\(.*?\)/g, '').trim();
};

const getCardStatusAccent = (isBrv02, runId, submissionsMap, gcsStatus = null) => {
    if (!isBrv02) return {
        borderClass: 'border-slate-200 dark:border-slate-800 hover:border-slate-700',
        accentBar: null
    };

    const sub = submissionsMap ? submissionsMap[runId] : null;
    const status = sub?.status || gcsStatus || 'staged';

    if (status === 'staged') {
        return {
            borderClass: 'border-amber-500/30 dark:border-amber-500/20 hover:border-amber-400/50',
            bgClass: 'bg-amber-500/[0.02]',
            accentBar: <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-500 z-10" />
        };
    }
    
    if (status === 'submitted_pending_processing' || status === 'submitted_pending_review' || status === 'in_review') {
        return {
            borderClass: 'border-purple-500/30 dark:border-purple-500/20 hover:border-purple-400/50',
            bgClass: 'bg-purple-500/[0.02]',
            accentBar: <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-purple-500 z-10" />
        };
    }

    if (status === 'public' || status === 'promoted' || status === 'approved') {
        return {
            borderClass: 'border-emerald-500/30 dark:border-emerald-500/20 hover:border-emerald-400/50',
            bgClass: 'bg-emerald-500/[0.02]',
            accentBar: <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500 z-10" />
        };
    }

    if (status === 'rejected' || status === 'changes_requested') {
        return {
            borderClass: 'border-red-500/30 dark:border-red-500/20 hover:border-red-400/50',
            bgClass: 'bg-red-500/[0.02]',
            accentBar: <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500 z-10" />
        };
    }

    return {
        borderClass: 'border-slate-200 dark:border-slate-800 hover:border-slate-700',
        accentBar: null
    };
};

const getKpiFilterLabel = (filter) => {
    switch (filter) {
        case 'my-submissions': return 'My Benchmarks';
        case 'verified': return 'Production Ready';
        case 'staged': return 'Locally Staged';
        case 'processing': return 'Processing';
        case 'in_review': return 'Under Review';
        case 'approved': return 'Published';
        case 'action': return 'Rejected';
        case 'legacy': return 'Legacy Format';
        case 'pareto': return 'Pareto Frontier';
        case 'regressions': return 'Active Regressions';
        default: return null;
    }
};

export const UnifiedDataTable = (props) => {
    const { dashboardState } = props;
    const { user } = useGitHubAuth();
    const isAdmin = user?.permission === 'admin';
        const [rawYamlContent, setRawYamlContent] = useState(null);
    const [rawYamlTitle, setRawYamlTitle] = useState('');
    const [showComparisonDrawer, setShowComparisonDrawer] = useState(false);
    
    // Read shared graphing state from dashboardState, falling back to local defaults if dashboardState is not present
    const {
        tputType: sharedTputType, setTputType: sharedSetTputType,
        chartMode: sharedChartMode, setChartMode: sharedSetChartMode,
        yQualityMode: sharedYQualityMode, setYQualityMode: sharedSetYQualityMode,
        xQualityMode: sharedXQualityMode, setXQualityMode: sharedSetXQualityMode,
        costMode: sharedCostMode, setCostMode: sharedSetCostMode,
        showPerChip: sharedShowPerChip, setShowPerChip: sharedSetShowPerChip,
        showLabels: sharedShowLabels, setShowLabels: sharedSetShowLabels,
        showDataLabels: sharedShowDataLabels, setShowDataLabels: sharedSetShowDataLabels,
        showPareto: sharedShowPareto, setShowPareto: sharedSetShowPareto,
        isZoomEnabled: sharedIsZoomEnabled, setIsZoomEnabled: sharedSetIsZoomEnabled,
        zoomDomain: sharedZoomDomain, setZoomDomain: sharedSetZoomDomain,
        xAxisMax: sharedXAxisMax, setXAxisMax: sharedSetXAxisMax,
        isLogScaleX: sharedIsLogScaleX, setIsLogScaleX: sharedSetIsLogScaleX,
        latType: sharedLatType, setLatType: sharedSetLatType,
        chartColorMode: sharedChartColorMode, setChartColorMode: sharedSetChartColorMode,
    } = dashboardState || {};

    // Local state fallbacks (if no shared dashboardState is present)
    const [localTputType, localSetTputType] = useState('output');
    const [localChartMode, localSetChartMode] = useState('tpot');
    const [localYQualityMode, localSetYQualityMode] = useState('mmlu_pro');
    const [localXQualityMode, localSetXQualityMode] = useState('mmlu_pro');
    const [localCostMode, localSetCostMode] = useState('spot');
    const [localShowPerChip, localSetShowPerChip] = useState(false);
    const [localShowLabels, localSetShowLabels] = useState(true);
    const [localShowDataLabels, localSetShowDataLabels] = useState(false);
    const [localShowPareto, localSetShowPareto] = useState(true);
    const [localIsZoomEnabled, localSetIsZoomEnabled] = useState(false);
    const [localZoomDomain, localSetZoomDomain] = useState(null);
    const [localXAxisMax, localSetXAxisMax] = useState(Infinity);
    const [localIsLogScaleX, localSetIsLogScaleX] = useState(false);
    const [localLatType, localSetLatType] = useState('e2e');
    const [localChartColorMode, localSetChartColorMode] = useState('hardware');

    const drawerTputType = sharedTputType !== undefined ? sharedTputType : localTputType;
    const setDrawerTputType = sharedSetTputType || localSetTputType;

    const drawerChartMode = sharedChartMode !== undefined ? sharedChartMode : localChartMode;
    const setDrawerChartMode = sharedSetChartMode || localSetChartMode;

    const drawerYQualityMode = sharedYQualityMode !== undefined ? sharedYQualityMode : localYQualityMode;
    const setDrawerYQualityMode = sharedSetYQualityMode || localSetYQualityMode;

    const drawerXQualityMode = sharedXQualityMode !== undefined ? sharedXQualityMode : localXQualityMode;
    const setDrawerXQualityMode = sharedSetXQualityMode || localSetXQualityMode;

    const drawerCostMode = sharedCostMode !== undefined ? sharedCostMode : localCostMode;
    const setDrawerCostMode = sharedSetCostMode || localSetCostMode;

    const drawerShowPerChip = sharedShowPerChip !== undefined ? sharedShowPerChip : localShowPerChip;
    const setDrawerShowPerChip = sharedSetShowPerChip || localSetShowPerChip;

    const drawerShowLabels = sharedShowLabels !== undefined ? sharedShowLabels : localShowLabels;
    const setDrawerShowLabels = sharedSetShowLabels || localSetShowLabels;

    const drawerShowDataLabels = sharedShowDataLabels !== undefined ? sharedShowDataLabels : localShowDataLabels;
    const setDrawerShowDataLabels = sharedSetShowDataLabels || localSetShowDataLabels;

    const drawerShowPareto = sharedShowPareto !== undefined ? sharedShowPareto : localShowPareto;
    const setDrawerShowPareto = sharedSetShowPareto || localSetShowPareto;

    const drawerIsZoomEnabled = sharedIsZoomEnabled !== undefined ? sharedIsZoomEnabled : localIsZoomEnabled;
    const setDrawerIsZoomEnabled = sharedSetIsZoomEnabled || localSetIsZoomEnabled;

    const drawerZoomDomain = sharedZoomDomain !== undefined ? sharedZoomDomain : localZoomDomain;
    const setDrawerZoomDomain = sharedSetZoomDomain || localSetZoomDomain;

    const drawerXAxisMax = sharedXAxisMax !== undefined ? sharedXAxisMax : localXAxisMax;
    const setDrawerXAxisMax = sharedSetXAxisMax || localSetXAxisMax;

    const drawerIsLogScaleX = sharedIsLogScaleX !== undefined ? sharedIsLogScaleX : localIsLogScaleX;
    const setDrawerIsLogScaleX = sharedSetIsLogScaleX || localSetIsLogScaleX;

    const _drawerLatType = sharedLatType !== undefined ? sharedLatType : localLatType;
    const setDrawerLatType = sharedSetLatType || localSetLatType;

    const drawerChartColorMode = sharedChartColorMode !== undefined ? sharedChartColorMode : localChartColorMode;
    const setDrawerChartColorMode = sharedSetChartColorMode || localSetChartColorMode;

    const [drawerIsDragging, setDrawerIsDragging] = useState(false);
    
    const drawerChartContainerRef = React.useRef(null);
    const drawerLastMouseRef = React.useRef({ x: 0, y: 0 });

    const [viewingPayloadRun, setViewingPayloadRun] = useState(null);
    const [rejectingRunId, setRejectingRunId] = useState(null);
    const [rejectionFeedback, setRejectionFeedback] = useState('');
    const [drawerRejectingRunId, setDrawerRejectingRunId] = useState(null);
    const [drawerRejectionFeedback, setDrawerRejectionFeedback] = useState('');

    const actionPendingRef = React.useRef(false);
    const [isLocalActionPending, setIsLocalActionPending] = React.useState(false);

    const handleActionClick = async (actionFn) => {
        if (actionPendingRef.current) return;
        actionPendingRef.current = true;
        setIsLocalActionPending(true);
        try {
            await actionFn();
        } finally {
            actionPendingRef.current = false;
            setIsLocalActionPending(false);
        }
    };


    const [isDraggingSelection, setIsDraggingSelection] = useState(false);
    const dragStartPagePos = React.useRef({ x: 0, y: 0 });
    const lastPointerPos = React.useRef({ x: 0, y: 0 });
    const [dragBox, setDragBox] = useState(null);
    const dragActionSelect = React.useRef(true);
    const initialSelection = React.useRef(new Set());

    const {
        modelStats, selectedModels, filteredBySource, showSelectedOnly: propShowSelectedOnly, setShowSelectedOnly,
        selectedBenchmarks, setSelectedBenchmarks, setActiveFilters, expandedModels,
        toggleBenchmark, toggleModelExpansion,
        baselineBenchmarkKey, setBaselineBenchmarkKey,
        hideShowSelectedOnly = false,
        renameClearToUnselectAll = false,
        brv02Runs = [], brv02CustomLabels = {}, removeBrv02Run,
        setShowDataPanel,
        searchTerm = '',
        setSearchTerm,
        kpiFilter = null,
        setKpiFilter,
        paretoKeys = new Set(),
        submissionsMap = {},
        isLoadingSubmissions = false,
        updateSubmissionStatus,
        bulkUpdateSubmissionStatus,
        qualityMetrics,
        onOpenSubmitDialog,
        isFiltered = false,
        groupBy = 'Model',
        sortByField = 'timestamp',
        sortDirection = 'desc',
        visibleSpecs = {
            hardware: true,
            timestamp: true,
            stage: true,
            nodes: false,
            islOsl: false,
            maxTput: true,
            minLat: true,
            qps: false,
            inputTput: false,
            outputTput: false,
            totalTput: false,
            ntpot: false,
            tpot: false,
            itl: false,
            ttft: false,
            e2e: false,
            costIn: false,
            costOut: false,
            inputLen: false,
            outputLen: false
        },
        loadAllData,
        loadingConnections
    } = props;

    const selectedStagedRuns = React.useMemo(() => {
        const stagedList = [];
        (brv02Runs || []).forEach(run => {
            const key = `brv02:${run.runId}`;
            if (selectedBenchmarks.has(key)) {
                stagedList.push(run);
            }
        });
        return stagedList;
    }, [brv02Runs, selectedBenchmarks]);

    const buildBundleForRun = (run) => {
        const stageFiles = run.stages.map(stage => {
            const content = typeof stage.rawReport === 'object' 
                ? JSON.stringify(stage.rawReport) 
                : (stage.rawReport || '');
            
            const validation = validateBenchmark(content, stage.filename);
            
            return {
                file: { 
                    name: stage.filename, 
                    webkitRelativePath: `${run.runId}/${stage.filename}` 
                },
                content,
                validation
            };
        });

        const metadataFiles = {
            run_metadata: run.run_metadata ? {
                file: { name: 'run_metadata.json' },
                content: JSON.stringify(run.run_metadata),
                parsed: run.run_metadata
            } : null,
            config: run.config ? {
                file: { name: 'config.json' },
                content: JSON.stringify(run.config),
                parsed: run.config
            } : null
        };

        const bundleValidation = {
            format: 'brv02',
            errors: [],
            warnings: [],
            dcoChecked: true
        };

        return {
            id: Math.random().toString(36).substring(7),
            dirKey: run.runId,
            name: run.runLabel,
            stageFiles,
            metadataFiles,
            payload: {
                runId: run.runId,
                format: 'brv02',
                model_name: run.model_name || run.stages[0]?.scenario?.model || 'Unknown Model',
                hardware: { 
                    hardware_name: run.hardware?.hardware_name || run.stages[0]?.scenario?.hardware || 'Unknown Hardware',
                    accelerator_count: run.hardware?.accelerator_count ?? null
                },
                run_metadata: run.run_metadata || null,
                entries: run.stages.map(stage => ({
                    run_id: stage.run_id || uuidv4(),
                    filename: stage.filename,
                    raw_report: stage.rawReport,
                    stage: stage.stageIndex,
                    runUid: stage.runUid
                })),
                well_lit_path: run.wellLitPath
            },
            validation: bundleValidation,
            isExpanded: true,
            isSkipped: false,
            targetDashboards: run.targetDashboards || ['performance-browser']
        };
    };

    const handlePublishSelected = () => {
        if (selectedStagedRuns.length === 0) return;

        const bundles = selectedStagedRuns.map(buildBundleForRun);

        try {
            localStorage.setItem('prism_active_staged_bundles', JSON.stringify(bundles));
            localStorage.setItem('prism_upload_wizard_step', '2');
            localStorage.setItem('prism_submit_intent', 'submit-review');
        } catch (e) {
            console.error('Failed to set wizard state in localStorage:', e);
        }

        onOpenSubmitDialog && onOpenSubmitDialog('submit-review');
    };

    const handleEditStagedRun = (run) => {
        const bundle = buildBundleForRun(run);

        try {
            localStorage.setItem('prism_active_staged_bundles', JSON.stringify([bundle]));
            localStorage.setItem('prism_upload_wizard_step', '2');
            localStorage.setItem('prism_submit_intent', 'stage-locally');
        } catch (e) {
            console.error('Failed to set wizard state in localStorage:', e);
        }

        onOpenSubmitDialog && onOpenSubmitDialog('stage-locally');
    };

    const handleSubmitStagedRunForReview = (run) => {
        const bundle = buildBundleForRun(run);

        try {
            localStorage.setItem('prism_active_staged_bundles', JSON.stringify([bundle]));
            localStorage.setItem('prism_upload_wizard_step', '2');
            localStorage.setItem('prism_submit_intent', 'submit-review');
        } catch (e) {
            console.error('Failed to set wizard state in localStorage:', e);
        }

        onOpenSubmitDialog && onOpenSubmitDialog('submit-review');
    };


    const drawerMetricAvailability = React.useMemo(() => {
        const hasNtpot = filteredBySource?.some(d => d.metrics?.ntpot != null);
        const hasTtft = filteredBySource?.some(d => d.metrics?.ttft?.mean != null || d.ttft?.mean != null);
        const hasTokensPerSec = filteredBySource?.some(d => d.tokens_per_second != null);
        const hasItl = filteredBySource?.some(d => d.metrics?.itl != null || d.itl != null);
        return { ntpot: hasNtpot, ttft: hasTtft, tokens_per_sec: hasTokensPerSec, itl: hasItl };
    }, [filteredBySource]);

    const localSelectedCount = React.useMemo(() => {
        let count = 0;
        selectedBenchmarks.forEach(key => {
            const stat = modelStats.find(s => s.benchmarkKey === key);
            if (stat) {
                const sourceStr = stat.data?.[0]?.source || '';
                if (sourceStr.startsWith('brv02:')) count++;
            }
        });
        return count;
    }, [selectedBenchmarks, modelStats]);

    const hasLocalSelected = localSelectedCount > 0;

    const hasAnyLocalRuns = React.useMemo(() => {
        return modelStats.some(s => {
            const sourceStr = s.data?.[0]?.source || '';
            return sourceStr.startsWith('brv02:');
        });
    }, [modelStats]);

    const handleDeleteSelected = () => {
        if (!removeBrv02Run) return;
        if (localSelectedCount === 0) return;

        const confirmMsg = localSelectedCount === 1 
            ? "Are you sure you want to permanently delete this staged run from your local view?"
            : `Are you sure you want to permanently delete these ${localSelectedCount} staged runs from your local view?`;

        if (!window.confirm(confirmMsg)) return;

        selectedBenchmarks.forEach(key => {
            const stat = modelStats.find(s => s.benchmarkKey === key);
            if (stat) {
                const benchmarkData = stat.data || [];
                const sourceStr = benchmarkData[0]?.source || '';
                const isBrv02 = sourceStr.startsWith('brv02:');
                const runId = isBrv02 ? sourceStr.replace('brv02:', '') : null;
                if (isBrv02 && runId) {
                    removeBrv02Run(runId);
                }
            }
        });
        setSelectedBenchmarks(new Set());
    };

    React.useEffect(() => {
        if (showComparisonDrawer) {
            const originalStyle = window.getComputedStyle(document.body).overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = originalStyle;
            };
        }
    }, [showComparisonDrawer]);

    React.useEffect(() => {
        if (!isDraggingSelection) return;

        const updateDragSelection = () => {
            const vStartX = dragStartPagePos.current.x - window.scrollX;
            const vStartY = dragStartPagePos.current.y - window.scrollY;
            const vCurrentX = lastPointerPos.current.x;
            const vCurrentY = lastPointerPos.current.y;

            setDragBox({
                startX: vStartX,
                startY: vStartY,
                currentX: vCurrentX,
                currentY: vCurrentY
            });

            const minX = Math.min(vStartX, vCurrentX);
            const maxX = Math.max(vStartX, vCurrentX);
            const minY = Math.min(vStartY, vCurrentY);
            const maxY = Math.max(vStartY, vCurrentY);

            const checkboxes = document.querySelectorAll('.benchmark-checkbox-area');
            const newSelected = new Set(initialSelection.current);

            checkboxes.forEach(cb => {
                const rect = cb.getBoundingClientRect();
                // Check if the checkbox overlaps in 2D with the drag range
                if (rect.bottom >= minY && rect.top <= maxY && rect.right >= minX && rect.left <= maxX) {
                    const key = cb.getAttribute('data-benchmark-key');
                    if (key) {
                        if (dragActionSelect.current) {
                            newSelected.add(key);
                        } else {
                            newSelected.delete(key);
                        }
                    }
                }
            });

            setSelectedBenchmarks(newSelected);
        };

        const handlePointerMove = (e) => {
            lastPointerPos.current = { x: e.clientX, y: e.clientY };
            updateDragSelection();
        };

        const handleScroll = () => {
            updateDragSelection();
        };

        const handlePointerUp = () => {
            setIsDraggingSelection(false);
            setDragBox(null);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
            window.removeEventListener('scroll', handleScroll);
        };
    }, [isDraggingSelection, setSelectedBenchmarks]);

    const handleCheckboxPointerDown = (e, key, isCurrentlySelected) => {
        // Only trigger on left mouse button or touch
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        dragStartPagePos.current = { x: e.clientX + window.scrollX, y: e.clientY + window.scrollY };
        lastPointerPos.current = { x: e.clientX, y: e.clientY };
        setDragBox({
            startX: e.clientX,
            startY: e.clientY,
            currentX: e.clientX,
            currentY: e.clientY
        });

        const willSelect = !isCurrentlySelected;
        dragActionSelect.current = willSelect;
        
        // Take a snapshot of the selection BEFORE this click so that the
        // pointermove loop can cleanly apply additions/deletions onto it.
        initialSelection.current = new Set(selectedBenchmarks);
        
        setIsDraggingSelection(true);
        
        // Immediately toggle the one we pressed on
        setSelectedBenchmarks(prev => {
            const newSelected = new Set(prev);
            if (willSelect) newSelected.add(key);
            else newSelected.delete(key);
            return newSelected;
        });
    };



    const showSelectedOnly = hideShowSelectedOnly ? false : propShowSelectedOnly;

    const toggleBaseline = (key) => {
        if (!setBaselineBenchmarkKey) return;
        setBaselineBenchmarkKey(prev => (prev === key ? null : key));
    };

    const clearFilters = () => {
        setActiveFilters({
            models: new Set(), hardware: new Set(), machines: new Set(), precisions: new Set(),
            tp: new Set(), isl: new Set(), osl: new Set(), ratio: new Set(),
            acc_count: new Set(), modelServer: new Set(), useCase: new Set(),
            servingStack: new Set(), optimizations: new Set(), components: new Set(),
            pdRatio: new Set(), origins: new Set(), connectionNames: new Set()
        });
        setShowSelectedOnly(false);
        if (setKpiFilter) setKpiFilter(null);
        if (setSearchTerm) setSearchTerm('');
    };

    const toggleGroup = (stats, isAllSelected) => {
        setSelectedBenchmarks(prev => {
            const next = new Set(prev);
            stats.forEach(s => {
                if (isAllSelected) {
                    next.delete(s.benchmarkKey);
                } else {
                    next.add(s.benchmarkKey);
                }
            });
            return next;
        });
    };

    const filteredStats = React.useMemo(() => {
        let stats = modelStats;

        // Apply show selected only
        if (showSelectedOnly) {
            stats = stats.filter(stat => selectedBenchmarks.has(stat.benchmarkKey));
        }

        // Apply KPI Filter
        if (kpiFilter === 'my-submissions') {
            stats = stats.filter(stat => {
                const firstEntry = stat.data?.[0];
                if (!firstEntry) return false;
                const src = firstEntry.source || '';
                const isBrv02 = src.startsWith('brv02:') || firstEntry.source_info?.type === 'benchmark_report_v02';
                if (!isBrv02) return false;
                const isMine = src.startsWith('brv02:') || (user && firstEntry.github_author?.username === user.username);
                return isMine;
            });
        } else if (kpiFilter === 'verified') {
            stats = stats.filter(stat => {
                const src = stat.data?.[0]?.source || '';
                return src.startsWith('brv02:') || src.startsWith('llm-d:');
            });
        } else if (kpiFilter === 'staged') {
            stats = stats.filter(stat => {
                const firstEntry = stat.data?.[0];
                if (!firstEntry) return false;
                const src = firstEntry.source || '';
                const isBrv02 = src.startsWith('brv02:') || firstEntry.source_info?.type === 'benchmark_report_v02';
                if (!isBrv02) return false;
                const isMine = src.startsWith('brv02:') || (user && firstEntry.github_author?.username === user.username);
                const runId = src.startsWith('brv02:') ? src.replace('brv02:', '') : firstEntry.run_id;
                const sub = runId && submissionsMap ? submissionsMap[runId] : null;
                const status = sub?.status || firstEntry.source_info?.submission_state || 'staged';
                return isMine && status === 'staged';
            });
        } else if (kpiFilter === 'processing') {
            stats = stats.filter(stat => {
                const firstEntry = stat.data?.[0];
                if (!firstEntry) return false;
                const src = firstEntry.source || '';
                const isBrv02 = src.startsWith('brv02:') || firstEntry.source_info?.type === 'benchmark_report_v02';
                if (!isBrv02) return false;
                const isMine = src.startsWith('brv02:') || (user && firstEntry.github_author?.username === user.username);
                const runId = src.startsWith('brv02:') ? src.replace('brv02:', '') : firstEntry.run_id;
                const sub = runId && submissionsMap ? submissionsMap[runId] : null;
                const status = sub?.status || firstEntry.source_info?.submission_state || 'staged';
                return isMine && (status === 'submitted_pending_processing' || status === 'processing');
            });
        } else if (kpiFilter === 'in_review') {
            stats = stats.filter(stat => {
                const firstEntry = stat.data?.[0];
                if (!firstEntry) return false;
                const src = firstEntry.source || '';
                const isBrv02 = src.startsWith('brv02:') || firstEntry.source_info?.type === 'benchmark_report_v02';
                if (!isBrv02) return false;
                const isMine = src.startsWith('brv02:') || (user && firstEntry.github_author?.username === user.username);
                const runId = src.startsWith('brv02:') ? src.replace('brv02:', '') : firstEntry.run_id;
                const sub = runId && submissionsMap ? submissionsMap[runId] : null;
                const status = sub?.status || firstEntry.source_info?.submission_state || 'staged';
                return isMine && (status === 'submitted_pending_review' || status === 'in_review');
            });
        } else if (kpiFilter === 'approved') {
            stats = stats.filter(stat => {
                const firstEntry = stat.data?.[0];
                if (!firstEntry) return false;
                const src = firstEntry.source || '';
                const isBrv02 = src.startsWith('brv02:') || firstEntry.source_info?.type === 'benchmark_report_v02';
                if (!isBrv02) return false;
                const isMine = src.startsWith('brv02:') || (user && firstEntry.github_author?.username === user.username);
                const runId = src.startsWith('brv02:') ? src.replace('brv02:', '') : firstEntry.run_id;
                const sub = runId && submissionsMap ? submissionsMap[runId] : null;
                const status = sub?.status || firstEntry.source_info?.submission_state || 'staged';
                return isMine && (status === 'public' || status === 'promoted' || status === 'approved');
            });
        } else if (kpiFilter === 'action') {
            stats = stats.filter(stat => {
                const firstEntry = stat.data?.[0];
                if (!firstEntry) return false;
                const src = firstEntry.source || '';
                const isBrv02 = src.startsWith('brv02:') || firstEntry.source_info?.type === 'benchmark_report_v02';
                if (!isBrv02) return false;
                const isMine = src.startsWith('brv02:') || (user && firstEntry.github_author?.username === user.username);
                const runId = src.startsWith('brv02:') ? src.replace('brv02:', '') : firstEntry.run_id;
                const sub = runId && submissionsMap ? submissionsMap[runId] : null;
                const status = sub?.status || firstEntry.source_info?.submission_state || 'staged';
                return isMine && (status === 'rejected' || status === 'changes_requested');
            });
        } else if (kpiFilter === 'legacy') {
            stats = stats.filter(stat => {
                const src = stat.data?.[0]?.source || '';
                return !src.startsWith('brv02:');
            });
        } else if (kpiFilter === 'pareto') {
            stats = stats.filter(stat => paretoKeys.has(stat.benchmarkKey));
        } else if (kpiFilter === 'regressions') {
            if (baselineBenchmarkKey) {
                const baselineStat = modelStats.find(s => s.benchmarkKey === baselineBenchmarkKey);
                if (baselineStat && baselineStat.maxTput) {
                    stats = stats.filter(stat => {
                        if (stat.benchmarkKey === baselineBenchmarkKey) return false;
                        if (!stat.maxTput) return false;
                        const tputDelta = ((stat.maxTput - baselineStat.maxTput) / baselineStat.maxTput) * 100;
                        return tputDelta < -5;
                    });
                } else {
                    stats = [];
                }
            } else {
                stats = [];
            }
        }

        // Apply Text Search Term Filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            stats = stats.filter(stat => {
                const modelMatch = (stat.model || '').toLowerCase().includes(term);
                const hwMatch = (stat.hardware || '').toLowerCase().includes(term);
                const confMatch = (stat.configuration || '').toLowerCase().includes(term);
                return modelMatch || hwMatch || confMatch;
            });
        }

        return stats;
    }, [modelStats, showSelectedOnly, selectedBenchmarks, kpiFilter, searchTerm, paretoKeys, baselineBenchmarkKey, submissionsMap, user]);

    const sortedStats = React.useMemo(() => {
        return [...filteredStats].sort((a, b) => {
            let valA, valB;
            
            if (sortByField === 'timestamp') {
                valA = a.timestamp || 0;
                valB = b.timestamp || 0;
            } else if (sortByField === 'maxTput') {
                valA = a.maxTput || 0;
                valB = b.maxTput || 0;
            } else if (sortByField === 'minLat') {
                valA = a.minLat || (sortDirection === 'asc' ? Infinity : -Infinity);
                valB = b.minLat || (sortDirection === 'asc' ? Infinity : -Infinity);
            } else if (sortByField === 'model') {
                valA = a.model || '';
                valB = b.model || '';
            } else {
                const getPeakRunMetric = (stat, field) => {
                    const peakRun = stat.data?.reduce((prev, curr) => (curr?.throughput || 0) > (prev?.throughput || 0) ? curr : prev, stat.data[0]) || {};
                    if (field === 'qps') return peakRun.metrics?.request_rate || peakRun.qps || 0;
                    if (field === 'inputTput') return peakRun.metrics?.input_tput || 0;
                    if (field === 'outputTput') return peakRun.metrics?.output_tput || peakRun.throughput || 0;
                    if (field === 'totalTput') return peakRun.metrics?.total_tput || 0;
                    if (field === 'ntpot') return peakRun.metrics?.ntpot || peakRun.ntpot || 0;
                    if (field === 'tpot') return peakRun.metrics?.tpot || peakRun.time_per_output_token || 0;
                    if (field === 'itl') return peakRun.metrics?.itl || peakRun.itl || 0;
                    if (field === 'ttft') return peakRun.metrics?.ttft?.mean || peakRun.ttft?.mean || 0;
                    if (field === 'e2e') return peakRun.metrics?.e2e_latency || peakRun.latency?.mean || 0;
                    if (field === 'costIn') return peakRun.metrics?.cost?.explicit_input || 0;
                    if (field === 'costOut') return peakRun.metrics?.cost?.explicit_output || 0;
                    return 0;
                };
                valA = getPeakRunMetric(a, sortByField);
                valB = getPeakRunMetric(b, sortByField);
            }
            
            let primaryResult = 0;
            if (typeof valA === 'string' && typeof valB === 'string') {
                primaryResult = sortDirection === 'asc' 
                    ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' }) 
                    : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });
            } else {
                primaryResult = sortDirection === 'asc' ? valA - valB : valB - valA;
            }

            if (primaryResult !== 0 && !isNaN(primaryResult)) {
                return primaryResult;
            }

            // Fallback tie-breaker: Origin/Folder first, then Filename
            const firstA = a.data?.[0];
            const firstB = b.data?.[0];
            
            const originA = firstA?.source_info?.origin || firstA?.source || '';
            const originB = firstB?.source_info?.origin || firstB?.source || '';
            
            const originCmp = originA.localeCompare(originB, undefined, { numeric: true, sensitivity: 'base' });
            if (originCmp !== 0) {
                return originCmp;
            }
            
            const fileA = firstA?.source_info?.file_identifier || firstA?.filename || '';
            const fileB = firstB?.source_info?.file_identifier || firstB?.filename || '';
            
            const fileCmp = fileA.localeCompare(fileB, undefined, { numeric: true, sensitivity: 'base' });
            if (fileCmp !== 0) {
                return fileCmp;
            }

            return (a.benchmarkKey || '').localeCompare(b.benchmarkKey || '', undefined, { numeric: true, sensitivity: 'base' });
        });
    }, [filteredStats, sortByField, sortDirection]);

    const needsExpansion = sortedStats.length > 4;

    const groupedStats = React.useMemo(() => {
        const grouped = {};
        if (groupBy !== 'None') {
            // Build a mapping of lowercase clean model names to their first seen nicely-cased clean name
            const canonicalCasing = {};
            sortedStats.forEach(stat => {
                if (groupBy === 'Model') {
                    const rawName = stat.model_name || stat.model || 'Unknown Model';
                    const clean = getCleanModelName(rawName);
                    const cleanLower = clean.toLowerCase();
                    if (!canonicalCasing[cleanLower]) {
                        canonicalCasing[cleanLower] = clean;
                    }
                }
            });

            sortedStats.forEach(stat => {
                let key = 'Other';
                if (groupBy === 'Model') {
                    const rawName = stat.model_name || stat.model || 'Unknown Model';
                    const clean = getCleanModelName(rawName);
                    key = canonicalCasing[clean.toLowerCase()] || clean;
                }
                if (groupBy === 'Hardware') key = stat.hardware || 'Unknown Hardware';
                if (groupBy === 'Origin') {
                    const origin = stat.data?.[0]?.source_info?.origin || stat.data?.[0]?.source;
                    key = origin ? getSourceTag(stat.data[0]) : 'Unknown Origin';
                }
                if (groupBy === 'OriginFolder') {
                    const origin = stat.data?.[0]?.source_info?.origin || stat.data?.[0]?.source;
                    key = origin ? formatOriginLabel(origin) : 'Unknown Origin/Folder';
                }
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(stat);
            });
        } else {
            grouped['All'] = sortedStats;
        }
        return grouped;
    }, [sortedStats, groupBy]);

    const selectAllVisible = () => {
        const allVisible = new Set(sortedStats.map(s => s.benchmarkKey));
        setSelectedBenchmarks(allVisible);
    };

    const invertSelected = () => {
        const inverted = new Set(sortedStats.map(s => s.benchmarkKey).filter(k => !selectedBenchmarks.has(k)));
        setSelectedBenchmarks(inverted);
    };

    const clearSelected = () => {
        setSelectedBenchmarks(new Set());
    };

    const hasPromotableSelected = React.useMemo(() => {
        return Array.from(selectedBenchmarks).some(key => {
            const stat = modelStats.find(s => s.benchmarkKey === key);
            const src = stat?.data?.[0]?.source || '';
            if (src.startsWith('brv02:')) {
                const runId = src.replace('brv02:', '');
                const sub = submissionsMap ? submissionsMap[runId] : null;
                const status = sub?.status || 'staged';
                return status !== 'public' && status !== 'approved';
            }
            return false;
        });
    }, [selectedBenchmarks, modelStats, submissionsMap]);

    const onlyPendingReviewSelected = React.useMemo(() => {
        if (selectedBenchmarks.size === 0) return false;
        return Array.from(selectedBenchmarks).every(key => {
            const stat = modelStats.find(s => s.benchmarkKey === key);
            const firstEntry = stat?.data?.[0];
            if (!firstEntry) return false;
            const src = firstEntry.source || '';
            const runId = src.startsWith('brv02:') ? src.replace('brv02:', '') : firstEntry.run_id;
            const sub = submissionsMap ? submissionsMap[runId] : null;
            const status = sub?.status || firstEntry.source_info?.submission_state || 'staged';
            return status === 'submitted_pending_review' || status === 'in_review';
        });
    }, [selectedBenchmarks, modelStats, submissionsMap]);

    const handleBulkApprove = async () => {
        if (selectedBenchmarks.size === 0) return;
        if (!confirm(`Are you sure you want to approve the ${selectedBenchmarks.size} selected benchmarks and publish them to the global results store?`)) {
            return;
        }
        
        const runIds = Array.from(selectedBenchmarks).map(key => {
            const stat = modelStats.find(s => s.benchmarkKey === key);
            const firstEntry = stat?.data?.[0];
            const src = firstEntry?.source || '';
            return src.startsWith('brv02:') ? src.replace('brv02:', '') : firstEntry?.run_id;
        }).filter(Boolean);

        if (bulkUpdateSubmissionStatus) {
            await bulkUpdateSubmissionStatus(runIds, 'public');
            clearSelected();
        }
    };

    const handleBulkReject = async () => {
        if (selectedBenchmarks.size === 0) return;
        const feedback = prompt(`Provide rejection reason/feedback for the ${selectedBenchmarks.size} selected benchmarks:`);
        if (feedback === null) return; // cancelled
        if (!feedback.trim()) {
            alert("Rejection feedback is required.");
            return;
        }

        const runIds = Array.from(selectedBenchmarks).map(key => {
            const stat = modelStats.find(s => s.benchmarkKey === key);
            const firstEntry = stat?.data?.[0];
            const src = firstEntry?.source || '';
            return src.startsWith('brv02:') ? src.replace('brv02:', '') : firstEntry?.run_id;
        }).filter(Boolean);

        if (bulkUpdateSubmissionStatus) {
            await bulkUpdateSubmissionStatus(runIds, 'rejected', feedback);
            clearSelected();
        }
    };

    // Computes metric-specific empty state messaging, icons, colors and actions
    const getEmptyStateConfig = () => {
        switch (kpiFilter) {
            case 'my-submissions':
                return {
                    icon: <FileText className="w-8 h-8" />,
                    themeColor: 'cyan',
                    glowClass: 'shadow-[0_0_30px_rgba(34,211,238,0.2)] bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
                    radialGlow: 'bg-cyan-500/10',
                    title: 'No submitted benchmarks found',
                    description: "You have not submitted any benchmark runs to the Results store yet. Staged and submitted benchmarks will appear here.",
                    action: (
                        <button
                            onClick={() => onOpenSubmitDialog && onOpenSubmitDialog('submit-review')}
                            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer mb-2"
                        >
                            Publish to Results store
                        </button>
                    )
                };
            case 'staged':
                return {
                    icon: <FileText className="w-8 h-8" />,
                    themeColor: 'cyan',
                    glowClass: 'shadow-[0_0_30px_rgba(34,211,238,0.2)] bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
                    radialGlow: 'bg-cyan-500/10',
                    title: 'No staged submissions found',
                    description: "You have not staged any local benchmark runs yet. Benchmark runs staged for local review will appear here.",
                    action: (
                        <button
                            onClick={() => onOpenSubmitDialog && onOpenSubmitDialog('stage-locally')}
                            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer mb-2"
                        >
                            Stage locally
                        </button>
                    )
                };
            case 'verified':
                return {
                    icon: <ShieldCheck className="w-8 h-8" />,
                    themeColor: 'emerald',
                    glowClass: 'shadow-[0_0_30px_rgba(16,185,129,0.2)] bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
                    radialGlow: 'bg-emerald-500/10',
                    title: 'No production-ready runs found',
                    description: "No benchmarks currently meet the validation criteria. To publish to the Results store, ensure your runs comply with all validation rules.",
                    action: (
                        <button
                            onClick={clearFilters}
                            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-xl transition-all cursor-pointer mb-2"
                        >
                            Clear filters
                        </button>
                    )
                };
            case 'in_review':
                return {
                    icon: <FileClock className="w-8 h-8" />,
                    themeColor: 'purple',
                    glowClass: 'shadow-[0_0_30px_rgba(168,85,247,0.2)] bg-purple-500/10 border-purple-500/30 text-purple-400',
                    radialGlow: 'bg-purple-500/10',
                    title: 'No submissions in review',
                    description: "There are currently no benchmark submissions pending administrator compliance review.",
                    action: (
                        <button
                            onClick={clearFilters}
                            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-xl transition-all cursor-pointer mb-2"
                        >
                            Clear filters
                        </button>
                    )
                };
            case 'approved':
                return {
                    icon: <ShieldCheck className="w-8 h-8" />,
                    themeColor: 'emerald',
                    glowClass: 'shadow-[0_0_30px_rgba(16,185,129,0.2)] bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
                    radialGlow: 'bg-emerald-500/10',
                    title: 'No approved runs found',
                    description: "No benchmark submissions have been approved for this profile yet. Once review administrators approve staged runs, they will display here.",
                    action: (
                        <button
                            onClick={clearFilters}
                            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-xl transition-all cursor-pointer mb-2"
                        >
                            Clear filters
                        </button>
                    )
                };
            case 'legacy':
                return {
                    icon: <Database className="w-8 h-8" />,
                    themeColor: 'slate',
                    glowClass: 'shadow-[0_0_30px_rgba(148,163,184,0.15)] bg-slate-800/40 border-slate-700/50 text-slate-400',
                    radialGlow: 'bg-slate-800/10',
                    title: 'No legacy runs found',
                    description: "No legacy format benchmark runs match your active filters. Standardize your workflow onto the current layout specification.",
                    action: (
                        <button
                            onClick={clearFilters}
                            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-xl transition-all cursor-pointer mb-2"
                        >
                            Clear filters
                        </button>
                    )
                };
            case 'action':
                return {
                    icon: <Check className="w-8 h-8" />,
                    themeColor: 'emerald',
                    glowClass: 'shadow-[0_0_30px_rgba(16,185,129,0.2)] bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
                    radialGlow: 'bg-emerald-500/10',
                    title: 'All clear, no action required',
                    description: "None of your staged submissions currently require code adjustments, runs, or reviewer actions.",
                    action: (
                        <button
                            onClick={clearFilters}
                            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-xl transition-all cursor-pointer mb-2"
                        >
                            Clear filters
                        </button>
                    )
                };
            case 'pareto':
                return {
                    icon: <TrendingUp className="w-8 h-8" />,
                    themeColor: 'purple',
                    glowClass: 'shadow-[0_0_30px_rgba(168,85,247,0.2)] bg-purple-500/10 border-purple-500/30 text-purple-400',
                    radialGlow: 'bg-purple-500/10',
                    title: 'No Pareto frontier configurations found',
                    description: "No configurations match the cost-performance optimal frontier. Try clearing active filters or uploading multi-node sweeps.",
                    action: (
                        <button
                            onClick={clearFilters}
                            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-xl transition-all cursor-pointer mb-2"
                        >
                            Clear filters
                        </button>
                    )
                };
            case 'regressions':
                return {
                    icon: <AlertTriangle className="w-8 h-8" />,
                    themeColor: 'amber',
                    glowClass: 'shadow-[0_0_30px_rgba(245,158,11,0.2)] bg-amber-500/10 border-amber-500/30 text-amber-400',
                    radialGlow: 'bg-amber-500/10',
                    title: 'No active regressions found',
                    description: "No configurations show a performance or throughput drop of more than 5% relative to the pinned baseline configuration.",
                    action: (
                        <button
                            onClick={clearFilters}
                            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-xl transition-all cursor-pointer mb-2"
                        >
                            Clear filters
                        </button>
                    )
                };
            default:
                if (modelStats.length === 0) {
                    return {
                        icon: <FileText className="w-8 h-8" />,
                        themeColor: 'cyan',
                        glowClass: 'shadow-[0_0_30px_rgba(34,211,238,0.2)] bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
                        radialGlow: 'bg-cyan-500/10',
                        title: 'No benchmarks found',
                        description: "The Results store is currently empty. You can stage your runs locally or publish them to the Results store using the buttons above.",
                        action: null
                    };
                }
                return {
                    icon: <Search className="w-8 h-8" />,
                    themeColor: 'cyan',
                    glowClass: 'shadow-[0_0_30px_rgba(34,211,238,0.2)] bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
                    radialGlow: 'bg-cyan-500/10',
                    title: 'No benchmarks match active filters',
                    description: "No records match your combination of text search and active filters. Adjust your search parameters or start fresh.",
                    action: (
                        <button
                            onClick={clearFilters}
                            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-xl transition-all cursor-pointer mb-2"
                        >
                            Clear filters
                        </button>
                    )
                };
        }
    };

    const emptyConfig = getEmptyStateConfig();

    return (
        <div className="flex flex-col gap-3">
            {/* Action Bar */}
            {/* Action Bar */}
            {selectedBenchmarks.size === 0 ? (
                /* Default State: Display Stats & Simple Filter Clear/Select All options */
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-4 py-2.5 border border-transparent border-b-slate-200 dark:border-b-slate-800/60 select-none min-h-[52px]">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Database size={15} className="text-cyan-400" />
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-350">
                                {filteredStats.length} Matching Runs
                            </span>
                            {kpiFilter && (
                                <span className={`text-[9px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full border flex items-center gap-1.5 transition-all select-none ${
                                    kpiFilter === 'my-submissions' ? 'bg-cyan-550/10 text-cyan-400 border-cyan-550/20 shadow-[0_0_10px_rgba(6,182,212,0.15)]' :
                                    kpiFilter === 'verified' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' :
                                    kpiFilter === 'action' ? 'bg-red-500/10 text-red-400 border-red-500/25' :
                                    kpiFilter === 'staged' ? 'bg-amber-500/10 text-amber-400 border-amber-500/25' :
                                    kpiFilter === 'in_review' ? 'bg-purple-500/10 text-purple-400 border-purple-500/25' :
                                    kpiFilter === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' :
                                    kpiFilter === 'legacy' ? 'bg-slate-800 border-slate-700 text-slate-400' :
                                    kpiFilter === 'pareto' ? 'bg-purple-500/10 text-purple-400 border-purple-500/25' :
                                    kpiFilter === 'regressions' ? 'bg-amber-500/10 text-amber-400 border-amber-500/25' : 'bg-slate-800/60 text-slate-400 border-slate-700'
                                }`}>
                                    <span>{getKpiFilterLabel(kpiFilter)}</span>
                                    {setKpiFilter && (
                                        <button 
                                            onClick={() => setKpiFilter(null)}
                                            className="hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                                            title="Clear filter"
                                        >
                                            <X size={10} strokeWidth={3} />
                                        </button>
                                    )}
                                </span>
                            )}
                        </div>
                        
                        {!hideShowSelectedOnly && (
                            <>
                                <div className="h-5 w-px bg-slate-300 dark:bg-slate-800" />
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Show selected only</span>
                                    <button 
                                        onClick={() => setShowSelectedOnly(!showSelectedOnly)}
                                        className={`w-9 h-5 rounded-full relative transition-colors shadow-inner cursor-pointer ${showSelectedOnly ? 'bg-cyan-500' : 'bg-slate-950 border border-slate-800'}`}
                                    >
                                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${showSelectedOnly ? 'translate-x-4.5 left-0.5' : 'translate-x-0 left-0.5'}`} />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {loadAllData && (
                            <button
                                onClick={() => loadAllData(null, true)}
                                disabled={loadingConnections}
                                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-800 bg-[#070b13] hover:border-slate-700 hover:bg-[#101622] text-slate-300 cursor-pointer transition-all duration-200 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Refetch all configured buckets and APIs"
                            >
                                <RotateCcw size={12} className={loadingConnections ? 'animate-spin' : ''} />
                                <span>Refetch Database</span>
                            </button>
                        )}
                        {sortedStats.length > 0 && (
                            <button
                                onClick={selectAllVisible}
                                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-800 bg-[#070b13] hover:border-slate-700 hover:bg-[#101622] text-slate-300 cursor-pointer transition-all duration-200"
                            >
                                Select All Visible
                            </button>
                        )}
                        {isFiltered && (
                            <button
                                onClick={clearFilters}
                                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-800 bg-[#070b13] hover:border-slate-700 hover:bg-[#101622] text-slate-300 cursor-pointer transition-all duration-200"
                            >
                                Clear Filters
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                /* Selected State: Highlighted context toolbar with primary actions */
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-4 py-2.5 rounded-2xl bg-cyan-950/15 border border-cyan-500/25 animate-in fade-in slide-in-from-top-1.5 duration-200 select-none shadow-md min-h-[52px]">
                    <div className="flex items-center gap-3">
                        <div className="text-xs font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-0.5 rounded-lg">
                            {selectedBenchmarks.size} Selected
                        </div>
                        <button
                            onClick={clearSelected}
                            className="text-xs text-slate-455 hover:text-slate-200 transition-colors underline cursor-pointer font-medium"
                        >
                            Unselect all
                        </button>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-wrap">
                        {isAdmin && onlyPendingReviewSelected && (
                            <>
                                <button
                                    onClick={() => handleActionClick(handleBulkApprove)}
                                    disabled={isLoadingSubmissions || isLocalActionPending}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-500 hover:bg-emerald-450 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center gap-1.5 transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:pointer-events-none cursor-pointer font-bold"
                                >
                                    <Check className="w-3.5 h-3.5 stroke-[3]" /> Approve ({selectedBenchmarks.size})
                                </button>
                                <button
                                    onClick={() => handleActionClick(handleBulkReject)}
                                    disabled={isLoadingSubmissions || isLocalActionPending}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-red-500 hover:bg-red-400 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)] flex items-center gap-1.5 transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:pointer-events-none cursor-pointer font-bold"
                                >
                                    <X className="w-3.5 h-3.5" /> Reject ({selectedBenchmarks.size})
                                </button>
                            </>
                        )}

                        {/* Compare Selected Button */}
                        <button
                            onClick={() => sortedStats.length > 0 && setShowComparisonDrawer(true)}
                            className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_0_15px_rgba(34,211,238,0.4)] flex items-center gap-1.5 transition-all duration-300 hover:scale-105 cursor-pointer"
                        >
                            {hasPromotableSelected ? `Compare & Promote (${selectedBenchmarks.size})` : `Compare & Inspect (${selectedBenchmarks.size})`}
                        </button>

                        {/* Invert Selected */}
                        <button
                            onClick={invertSelected}
                            className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-800 bg-[#070b13] hover:border-slate-700 hover:bg-[#101622] text-slate-300 cursor-pointer transition-all duration-200"
                        >
                            Invert Selection
                        </button>

                        {/* Delete Staged Runs */}
                        {hasAnyLocalRuns && (
                            <button
                                onClick={handleDeleteSelected}
                                disabled={localSelectedCount === 0}
                                className={
                                    localSelectedCount === 0
                                    ? "px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed opacity-50"
                                    : "px-3 py-1.5 text-xs font-semibold rounded-xl bg-red-650/95 hover:bg-red-500 text-white shadow-sm border border-transparent cursor-pointer transition-all duration-200"
                                }
                            >
                                Delete Staged ({localSelectedCount})
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Stacked Cards List Container */}
            <div className="relative">
                <div className="flex flex-col gap-4 pr-1">
                    {filteredStats.length === 0 ? (
                        loadingConnections ? (
                            <div className="w-full py-20 px-8 flex flex-col items-center justify-center text-center bg-slate-900/80 border border-slate-800 rounded-3xl shadow-2xl relative overflow-hidden backdrop-blur-xl mb-6">
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
                                <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(59,130,246,0.2)] bg-blue-500/10 border border-blue-500/30 text-blue-400">
                                    <Loader className="w-8 h-8 animate-spin" />
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-2 tracking-wide">
                                    Loading Benchmark Results...
                                </h3>
                                <p className="text-sm text-slate-400 max-w-md leading-relaxed">
                                    Prism is currently loading benchmark records from connected data sources. They will appear here dynamically.
                                </p>
                            </div>
                        ) : (
                            <div className="w-full py-16 px-8 flex flex-col items-center justify-center text-center bg-slate-900/80 border border-slate-800 rounded-3xl shadow-2xl relative overflow-hidden backdrop-blur-xl mb-6">
                                <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 ${emptyConfig.radialGlow} rounded-full blur-3xl pointer-events-none`} />
                                <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-5 ${emptyConfig.glowClass}`}>
                                    {emptyConfig.icon}
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-2 tracking-wide">
                                    {emptyConfig.title}
                                </h3>
                                <p className="text-sm text-slate-400 max-w-md mb-8 leading-relaxed">
                                    {emptyConfig.description}
                                </p>
                                {emptyConfig.action}

                                {!isFiltered && modelStats.length > 0 && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-4xl mx-auto">
                                        {/* Card 1: Cloud Store */}
                                        <div 
                                            onClick={() => setShowDataPanel && setShowDataPanel(true)}
                                            className="group bg-slate-950/80 border border-slate-800/80 hover:border-cyan-500/50 rounded-2xl p-6 hover:-translate-y-1.5 transition-all duration-300 cursor-pointer flex flex-col items-start text-left relative overflow-hidden shadow-lg hover:shadow-[0_0_30px_rgba(34,211,238,0.15)]"
                                        >
                                            <div className="absolute top-0 right-0 w-20 h-20 bg-cyan-500/5 rounded-full blur-xl group-hover:bg-cyan-500/15 transition-colors" />
                                            <h4 className="text-base font-bold text-white group-hover:text-cyan-400 transition-colors mb-1.5">
                                                Connect Cloud Store
                                            </h4>
                                            <p className="text-xs text-slate-400 leading-relaxed">
                                                Index GCS, AWS S3, or Google Drive shared result archives.
                                            </p>
                                        </div>

                                        {/* Card 2: Upload v0.2 YAML / JSON */}
                                        <label className="group bg-slate-950/80 border border-slate-800/80 hover:border-blue-500/50 rounded-2xl p-6 hover:-translate-y-1.5 transition-all duration-300 cursor-pointer flex flex-col items-start text-left relative overflow-hidden shadow-lg hover:shadow-[0_0_30px_rgba(59,130,246,0.15)]">
                                            <input 
                                                type="file" 
                                                className="hidden" 
                                                accept=".yaml,.yml,.json" 
                                                onChange={(e) => {
                                                    if (e.target.files?.[0]) {
                                                        alert(`Parsed report ${e.target.files[0].name}`);
                                                    }
                                                }} 
                                            />
                                            <h4 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors mb-1.5">
                                                Ingest v0.2 Report
                                            </h4>
                                            <p className="text-xs text-slate-400 leading-relaxed">
                                                Directly parse standalone benchmark YAML/JSON reports.
                                            </p>
                                        </label>

                                        {/* Card 3: Clear Filters / Reset */}
                                        <div 
                                            onClick={clearFilters}
                                            className="group bg-slate-950/80 border border-slate-800/80 hover:border-purple-500/50 rounded-2xl p-6 hover:-translate-y-1.5 transition-all duration-300 cursor-pointer flex flex-col items-start text-left relative overflow-hidden shadow-lg hover:shadow-[0_0_30px_rgba(168,85,247,0.15)]"
                                        >
                                            <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/5 rounded-full blur-xl group-hover:bg-purple-500/15 transition-colors" />
                                            <h4 className="text-base font-bold text-white group-hover:text-purple-400 transition-colors mb-1.5 flex items-center gap-2">
                                                <RotateCcw className="w-4 h-4 text-purple-400 group-hover:rotate-180 transition-transform duration-500" />
                                                Reset Filters
                                            </h4>
                                            <p className="text-xs text-slate-400 leading-relaxed">
                                                Clear all active facet slices to reveal the entire catalog.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    ) : (
                    Object.entries(groupedStats).map(([groupKey, stats]) => {
                        const isAllSelected = stats.every(s => selectedBenchmarks.has(s.benchmarkKey));
                        return (
                        <div key={groupKey} className="flex flex-col gap-2">
                            {groupBy !== 'None' && (
                                <div className="sticky top-0 z-10 bg-slate-150 dark:bg-slate-900 py-1.5 px-3 rounded text-xs font-bold text-slate-550 dark:text-slate-400 uppercase tracking-wider border-y border-slate-200 dark:border-slate-800/60 flex items-center gap-3">
                                    <div 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleGroup(stats, isAllSelected);
                                        }}
                                        className="w-5 h-5 flex-shrink-0 flex items-center justify-center cursor-pointer transition-colors"
                                    >
                                        <div className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all ${
                                            isAllSelected ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                                        }`}>
                                            {isAllSelected && <Check size={10} strokeWidth={3} />}
                                        </div>
                                    </div>
                                    {groupKey}
                                </div>
                            )}
                            
                            <div className="flex flex-col gap-2">
                                {stats.map(stat => {
                                    const isSelected = selectedBenchmarks.has(stat.benchmarkKey);
                                    const isExpanded = expandedModels.has(stat.benchmarkKey || stat.model);
                                    const isBaseline = stat.benchmarkKey === baselineBenchmarkKey;
                                    
                                    const benchmarkData = stat.data || [];
                                    const meta = benchmarkData[0]?.metadata || {};
                                    const sourceStr = benchmarkData[0]?.source || '';
                                    const isBrv02 = sourceStr.startsWith('brv02:') || benchmarkData[0]?.source_info?.type === 'benchmark_report_v02';
                                    const runId = isBrv02 ? (sourceStr.startsWith('brv02:') ? sourceStr.replace('brv02:', '') : benchmarkData[0]?.run_id) : null;
                                    const runSub = runId && submissionsMap ? submissionsMap[runId] : null;
                                    const runStatus = runSub?.status || benchmarkData[0]?.source_info?.submission_state || 'staged';
                                    const isResultsStore = benchmarkData[0]?.source_info?.type === 'benchmark_report_v02';
                                    const isMine = isResultsStore && user && benchmarkData[0]?.github_author?.username === user.username;
                                    const isLocal = sourceStr.startsWith('brv02:');
                                    const canResubmit = isLocal || isMine || isAdmin;
                                    const tp = getEffectiveTp(benchmarkData[0]) || '-';
                                    
                                    const uniqueIsl = [...new Set(benchmarkData.map(d => getBucket(d.isl || d.workload?.input_tokens)))];
                                    const uniqueOsl = [...new Set(benchmarkData.map(d => getBucket(d.osl || d.workload?.output_tokens)))];
                                    
                                    const isl = uniqueIsl.length === 1 ? uniqueIsl[0] : (uniqueIsl.length > 1 ? 'Var' : '-');
                                    const osl = uniqueOsl.length === 1 ? uniqueOsl[0] : (uniqueOsl.length > 1 ? 'Var' : '-');

                                    const statusAccent = getCardStatusAccent(isBrv02, runId, submissionsMap, benchmarkData[0]?.source_info?.submission_state);
                                    const cardBorderClass = isSelected 
                                        ? 'border-blue-400 dark:border-blue-600 ring-1 ring-blue-400 dark:ring-blue-600/50' 
                                        : statusAccent.borderClass;
                                    const cardBgClass = isSelected ? '' : (statusAccent.bgClass || '');

                                    return (
                                        <div 
                                            key={stat.benchmarkKey || stat.model}
                                            className={`flex flex-col bg-white dark:bg-slate-900 border rounded-lg overflow-hidden transition-all shadow-sm relative ${cardBorderClass} ${cardBgClass} ${isBaseline ? 'ring-2 ring-cyan-400/50' : ''}`}
                                        >
                                            {statusAccent.accentBar}
                                            {/* Card Main Row (Header) */}
                                            <div className="flex items-stretch min-h-[60px]">
                                                {/* Left Checkbox Area (Dedicated Click Target) */}
                                                <div 
                                                    onPointerDown={(e) => handleCheckboxPointerDown(e, stat.benchmarkKey, isSelected)}
                                                    className={`benchmark-checkbox-area w-12 flex-shrink-0 flex items-center justify-center cursor-pointer border-r transition-colors select-none ${
                                                        statusAccent.accentBar ? 'pl-1.5' : ''
                                                    } ${
                                                        isSelected 
                                                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
                                                            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                                                    }`}
                                                    data-benchmark-key={stat.benchmarkKey}
                                                    style={{ touchAction: 'none' }}
                                                >
                                                    <div className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
                                                        isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                                                    }`}>
                                                        {isSelected && <Check size={14} strokeWidth={3} />}
                                                    </div>
                                                </div>

                                                {/* Card Content Area (Expand Toggle) */}
                                                <div 
                                                    onClick={() => toggleModelExpansion(stat.benchmarkKey || stat.model)}
                                                    className="flex-1 flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors gap-3"
                                                >
                                                    {/* Left side info block */}
                                                    <div className="flex-1 flex flex-wrap sm:flex-nowrap items-center gap-4 min-w-0">
                                                        {/* Specs list container */}
                                                        {(() => {
                                                            let nodesAndParallelismText = '';
                                                            if (meta.prefill_node_count > 0 || meta.decode_node_count > 0) {
                                                                const totalNodes = (meta.prefill_node_count || 0) + (meta.decode_node_count || 0);
                                                                const config = meta.configuration || '';
                                                                const pTpMatch = config.match(/(\d+)P-TP(\d+)/i);
                                                                const dTpMatch = config.match(/(\d+)D-TP(\d+)/i);
                                                                const pTp = pTpMatch ? pTpMatch[2] : '?';
                                                                const dTp = dTpMatch ? dTpMatch[2] : '?';
                                                                nodesAndParallelismText = `${totalNodes} nodes (P:${meta.prefill_node_count}-TP${pTp} | D:${meta.decode_node_count}-TP${dTp})`;
                                                            } else {
                                                                const totalNodes = stat.node_count || stat.accelerator_count || 1;
                                                                const displayTp = tp !== '-' ? tp : (getEffectiveTp(stat) || '');
                                                                nodesAndParallelismText = `${totalNodes} node${totalNodes > 1 ? 's' : ''}${displayTp && displayTp !== '-' ? ` (${displayTp})` : ''}`;
                                                            }

                                                            const peakRun = benchmarkData.reduce((prev, curr) => {
                                                                const prevVal = prev?.metrics?.output_tput || prev?.throughput || 0;
                                                                const currVal = curr?.metrics?.output_tput || curr?.throughput || 0;
                                                                return currVal > prevVal ? curr : prev;
                                                            }, benchmarkData[0] || {});

                                                             const specs = [];

                                                             if (visibleSpecs.timestamp) {
                                                                 const timestampVal = benchmarkData[0]?.timestamp;
                                                                 if (timestampVal) {
                                                                     const d = new Date(timestampVal);
                                                                     if (!isNaN(d.getTime())) {
                                                                         specs.push(
                                                                             <span key="timestamp" className="inline-flex items-center gap-1">
                                                                                 <span className="text-slate-400 dark:text-slate-500 font-normal">Date:</span>
                                                                                 <span className="font-semibold text-slate-700 dark:text-slate-300">
                                                                                     {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                                                 </span>
                                                                             </span>
                                                                         );
                                                                     }
                                                                 }
                                                             }

                                                             if (visibleSpecs.stage) {
                                                                 const isBrv02Run = benchmarkData[0]?.source?.startsWith('brv02:') || benchmarkData[0]?.source_info?.type === 'benchmark_report_v02';
                                                                 if (isBrv02Run) {
                                                                     const stageCount = benchmarkData.length;
                                                                     specs.push(
                                                                         <span key="stage" className="inline-flex items-center gap-1">
                                                                             <span className="text-slate-400 dark:text-slate-500 font-normal">Stages:</span>
                                                                             <span className="font-semibold text-slate-700 dark:text-slate-300">{stageCount} stage{stageCount === 1 ? '' : 's'}</span>
                                                                         </span>
                                                                     );
                                                                 } else {
                                                                     const stageVal = benchmarkData[0]?.workload?.stage;
                                                                     if (stageVal !== undefined && stageVal !== null && stageVal !== '') {
                                                                         specs.push(
                                                                             <span key="stage" className="inline-flex items-center gap-1">
                                                                                 <span className="text-slate-400 dark:text-slate-500 font-normal">Stage:</span>
                                                                                 <span className="font-semibold text-slate-700 dark:text-slate-300">{stageVal}</span>
                                                                             </span>
                                                                         );
                                                                     }
                                                                 }
                                                             }

                                                             if (visibleSpecs.hardware) {
                                                                specs.push(
                                                                    <span key="hardware" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Hardware:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{stat.accelerator_count}x {stat.hardware}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.nodes) {
                                                                specs.push(
                                                                    <span key="nodes" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Nodes:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{nodesAndParallelismText}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.islOsl) {
                                                                specs.push(
                                                                    <span key="islOsl" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">I/O Load:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{isl}/{osl}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.maxTput) {
                                                                specs.push(
                                                                    <span key="maxTput" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Max Tput:</span>
                                                                        <span className="font-bold text-green-600 dark:text-green-400">{stat.maxTput.toFixed(0)} <span className="text-[10px] font-normal opacity-70">tok/s</span></span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.minLat) {
                                                                specs.push(
                                                                    <span key="minLat" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Min Lat:</span>
                                                                        <span className="font-semibold text-amber-600 dark:text-amber-400">{stat.minLat ? `${stat.minLat.toFixed(0)} ms` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.qps) {
                                                                const qpsVal = peakRun.metrics?.request_rate || peakRun.qps;
                                                                specs.push(
                                                                    <span key="qps" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">QPS:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{qpsVal != null ? qpsVal.toFixed(2) : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.inputTput) {
                                                                const inVal = peakRun.metrics?.input_tput;
                                                                specs.push(
                                                                    <span key="inputTput" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Input Tput:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{inVal != null ? `${inVal.toFixed(0)} tok/s` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.outputTput) {
                                                                const outVal = peakRun.metrics?.output_tput || peakRun.throughput;
                                                                specs.push(
                                                                    <span key="outputTput" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Output Tput:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{outVal != null ? `${outVal.toFixed(0)} tok/s` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.totalTput) {
                                                                const totVal = peakRun.metrics?.total_tput;
                                                                specs.push(
                                                                    <span key="totalTput" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Total Tput:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{totVal != null ? `${totVal.toFixed(0)} tok/s` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.ntpot) {
                                                                const ntpotVal = peakRun.metrics?.ntpot || peakRun.ntpot;
                                                                specs.push(
                                                                    <span key="ntpot" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">NTPOT:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{ntpotVal != null ? `${ntpotVal.toFixed(2)} ms` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.tpot) {
                                                                const tpotVal = peakRun.metrics?.tpot || peakRun.time_per_output_token;
                                                                specs.push(
                                                                    <span key="tpot" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">TPOT:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{tpotVal != null ? `${tpotVal.toFixed(2)} ms` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.itl) {
                                                                const itlVal = peakRun.metrics?.itl || peakRun.itl;
                                                                specs.push(
                                                                    <span key="itl" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">ITL:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{itlVal != null ? `${itlVal.toFixed(2)} ms` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.ttft) {
                                                                const ttftVal = peakRun.metrics?.ttft?.mean || peakRun.ttft?.mean;
                                                                specs.push(
                                                                    <span key="ttft" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">TTFT:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{ttftVal != null ? `${ttftVal.toFixed(2)} ms` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.e2e) {
                                                                const e2eVal = (peakRun.metrics?.e2e_latency || peakRun.latency?.mean);
                                                                specs.push(
                                                                    <span key="e2e" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">E2E Latency:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{e2eVal != null ? `${(e2eVal / 1000).toFixed(2)} s` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.costIn) {
                                                                const costInVal = peakRun.metrics?.cost?.explicit_input;
                                                                specs.push(
                                                                    <span key="costIn" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Cost/1M In:</span>
                                                                        <span className="font-semibold text-slate-500">{costInVal > 0 ? `$${costInVal.toFixed(4)}` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.costOut) {
                                                                const costOutVal = peakRun.metrics?.cost?.explicit_output;
                                                                specs.push(
                                                                    <span key="costOut" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Cost/1M Out:</span>
                                                                        <span className="font-semibold text-slate-500">{costOutVal > 0 ? `$${costOutVal.toFixed(4)}` : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.inputLen) {
                                                                const inLenVal = peakRun.isl || peakRun.workload?.input_tokens;
                                                                specs.push(
                                                                    <span key="inputLen" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Input Len:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{inLenVal != null ? inLenVal.toFixed(0) : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                            if (visibleSpecs.outputLen) {
                                                                const outLenVal = peakRun.osl || peakRun.workload?.output_tokens;
                                                                specs.push(
                                                                    <span key="outputLen" className="inline-flex items-center gap-1">
                                                                        <span className="text-slate-400 dark:text-slate-500 font-normal">Output Len:</span>
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{outLenVal != null ? outLenVal.toFixed(0) : '-'}</span>
                                                                    </span>
                                                                );
                                                            }

                                                             return (
                                                                 <div className="flex-1 flex flex-col min-w-0">
                                                                     {/* Line 1: Model Title on left, Source Tag & Date on right */}
                                                                     <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 w-full">
                                                                         <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                                     <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                                                                         <span className="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-100 truncate">
                                                                                             {isBrv02 
                                                                                                 ? (brv02CustomLabels[runId] || benchmarkData[0]?.runLabel || stat.model_name || stat.model || meta.model_name)
                                                                                                 : (stat.model_name || stat.model || meta.model_name)}
                                                                                         </span>
                                                                                         {isBrv02 && runStatus === 'staged' && (
                                                                                             <button
                                                                                                 onClick={(e) => {
                                                                                                     e.stopPropagation();
                                                                                                     const run = brv02Runs.find(r => r.runId === runId);
                                                                                                     if (run) {
                                                                                                         handleEditStagedRun(run);
                                                                                                     }
                                                                                                 }}
                                                                                                 title="Edit staged benchmark metadata"
                                                                                                 className="p-1 text-slate-300 dark:text-slate-600 hover:text-cyan-400 transition-colors flex-shrink-0 cursor-pointer"
                                                                                             >
                                                                                                 <Pencil size={12} />
                                                                                             </button>
                                                                                         )}
                                                                                     </div>

                                                                            {isBrv02 && (
                                                                                <div className="flex flex-col items-end gap-1.5 relative">
                                                                                    <div className="flex items-center gap-2">
                                                                                        {(() => {
                                                                                            const sub = submissionsMap ? submissionsMap[runId] : null;
                                                                                            const status = sub?.status || benchmarkData[0]?.source_info?.submission_state || 'staged';
                                                                                            
                                                                                            if (canResubmit && status === 'staged') {
                                                                                                return user?.permission === 'none' ? (
                                                                                                    <div className="relative group/tooltip inline-block">
                                                                                                        <button
                                                                                                            disabled
                                                                                                            className="px-2.5 py-1 rounded-xl border border-slate-800 bg-slate-900/40 text-slate-500 text-[9px] font-bold uppercase tracking-wider transition-colors cursor-not-allowed select-none flex items-center gap-1 opacity-60"
                                                                                                        >
                                                                                                            <Send className="w-2.5 h-2.5" /> Submit for Review
                                                                                                        </button>
                                                                                                        <div className="absolute right-0 bottom-full mb-2 px-3 py-2 bg-slate-900 border border-slate-800 text-slate-350 text-xs font-medium rounded-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 shadow-2xl z-[9999] w-64 pointer-events-none leading-relaxed text-center normal-case tracking-normal">
                                                                                                            You are not in the Results Store closed-beta. Check back later once the feature is released.
                                                                                                        </div>
                                                                                                    </div>
                                                                                                ) : (
                                                                                                    <button
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            const run = brv02Runs.find(r => r.runId === runId);
                                                                                                            if (run) {
                                                                                                                handleSubmitStagedRunForReview(run);
                                                                                                            }
                                                                                                        }}
                                                                                                        disabled={isLoadingSubmissions || isLocalActionPending}
                                                                                                        title="Submit this benchmark to staging GCS bucket for automated format checks"
                                                                                                        className="px-2.5 py-1 rounded-xl border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 disabled:opacity-50 disabled:cursor-not-allowed text-purple-400 text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer select-none flex items-center gap-1"
                                                                                                    >
                                                                                                        <Send className="w-2.5 h-2.5" /> Submit for Review
                                                                                                    </button>
                                                                                                );
                                                                                            }
                                                                                            if (canResubmit && status === 'submitted_pending_processing') {
                                                                                                return (
                                                                                                    <button
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            handleActionClick(async () => {
                                                                                                                if (updateSubmissionStatus) {
                                                                                                                    await updateSubmissionStatus(runId, 'submitted_pending_review', '', stat.model, stat.hardware);
                                                                                                                }
                                                                                                            });
                                                                                                        }}
                                                                                                        disabled={isLoadingSubmissions || isLocalActionPending}
                                                                                                        title="Promote benchmark to the admin review queue"
                                                                                                        className="px-2.5 py-1 rounded-xl border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 disabled:opacity-50 disabled:cursor-not-allowed text-purple-400 text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer select-none flex items-center gap-1"
                                                                                                    >
                                                                                                        <Play className="w-2.5 h-2.5 fill-current" /> Promote to Review
                                                                                                    </button>
                                                                                                );
                                                                                            }
                                                                                            if (isAdmin && (status === 'submitted_pending_review' || status === 'in_review')) {
                                                                                                return (
                                                                                                    <>
                                                                                                        <button
                                                                                                            onClick={(e) => {
                                                                                                                e.stopPropagation();
                                                                                                                handleActionClick(async () => {
                                                                                                                    if (updateSubmissionStatus) {
                                                                                                                        await updateSubmissionStatus(runId, 'public', '', stat.model, stat.hardware);
                                                                                                                    }
                                                                                                                });
                                                                                                            }}
                                                                                                            disabled={isLoadingSubmissions || isLocalActionPending}
                                                                                                            title="Approve this run and publish it to the global Results store"
                                                                                                            className="px-2.5 py-1 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed text-emerald-455 text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer select-none flex items-center gap-1"
                                                                                                        >
                                                                                                            <Check className="w-2.5 h-2.5 stroke-[3]" /> Approve
                                                                                                        </button>
                                                                                                        <button
                                                                                                            onClick={(e) => {
                                                                                                                e.stopPropagation();
                                                                                                                setRejectingRunId(runId);
                                                                                                                setRejectionFeedback('');
                                                                                                            }}
                                                                                                            disabled={isLoadingSubmissions || isLocalActionPending}
                                                                                                            title="Reject compliance or request changes with custom feedback"
                                                                                                            className="px-2.5 py-1 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer select-none flex items-center gap-1"
                                                                                                        >
                                                                                                            <X className="w-2.5 h-2.5" /> Reject
                                                                                                        </button>
                                                                                                    </>
                                                                                                );
                                                                                            }
                                                                                            if (canResubmit && (status === 'rejected' || status === 'changes_requested')) {
                                                                                                return (
                                                                                                    <button
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            handleActionClick(async () => {
                                                                                                                if (updateSubmissionStatus) {
                                                                                                                    await updateSubmissionStatus(runId, 'submitted_pending_processing', '', stat.model, stat.hardware);
                                                                                                                }
                                                                                                            });
                                                                                                        }}
                                                                                                        disabled={isLoadingSubmissions || isLocalActionPending}
                                                                                                        title="Resubmit this run for automated verification after corrections"
                                                                                                        className="px-2.5 py-1 rounded-xl border border-purple-500/25 bg-purple-500/10 hover:bg-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-purple-400 text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer select-none flex items-center gap-1"
                                                                                                    >
                                                                                                        <RotateCcw className="w-2.5 h-2.5" /> Resubmit
                                                                                                    </button>
                                                                                                );
                                                                                            }
                                                                                            return null;
                                                                                        })()}
                                                                                    </div>
                                                                                    {rejectingRunId === runId && (
                                                                                        <div onClick={e => e.stopPropagation()} className="p-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-lg shadow-inner w-64 flex flex-col gap-2 mt-1 z-30">
                                                                                            <div className="text-xs font-bold text-red-500 dark:text-red-400 uppercase tracking-wider">Reason for Rejecting Run</div>
                                                                                            <textarea
                                                                                                autoFocus
                                                                                                value={rejectionFeedback}
                                                                                                onChange={e => setRejectionFeedback(e.target.value)}
                                                                                                placeholder="Reason details..."
                                                                                                className="w-full text-xs p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-slate-800 dark:text-slate-200 focus:outline-none focus:border-red-500/50 resize-none h-12 font-sans"
                                                                                            />
                                                                                            <div className="flex justify-end gap-2 text-xs">
                                                                                                <button
                                                                                                    onClick={() => setRejectingRunId(null)}
                                                                                                    className="px-2 py-0.5 text-slate-500 hover:text-slate-750 dark:text-slate-400 dark:hover:text-slate-250 transition-colors uppercase font-bold"
                                                                                                >
                                                                                                    Cancel
                                                                                                </button>
                                                                                                <button
                                                                                                    onClick={() => {
                                                                                                        handleActionClick(async () => {
                                                                                                            if (rejectionFeedback.trim() && updateSubmissionStatus) {
                                                                                                                await updateSubmissionStatus(runId, 'rejected', rejectionFeedback, stat.model, stat.hardware);
                                                                                                                setRejectingRunId(null);
                                                                                                            }
                                                                                                        });
                                                                                                    }}
                                                                                                    disabled={!rejectionFeedback.trim() || isLoadingSubmissions || isLocalActionPending}
                                                                                                    className="px-2.5 py-0.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded font-bold uppercase transition-colors"
                                                                                                >
                                                                                                    Submit
                                                                                                </button>
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                                                                            {(() => {
                                                                                const isResultsStore = benchmarkData[0]?.source_info?.type === 'benchmark_report_v02';
                                                                                const isMine = isResultsStore && user && benchmarkData[0]?.github_author?.username === user.username;
                                                                                if (isMine) {
                                                                                    return (
                                                                                        <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 px-1.5 py-0.5 rounded whitespace-nowrap">
                                                                                            Yours
                                                                                        </span>
                                                                                    );
                                                                                }
                                                                                if (isResultsStore) {
                                                                                    return (
                                                                                        <span className="text-[9px] font-bold uppercase tracking-wider bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 border border-sky-100 dark:border-sky-900/50 px-1.5 py-0.5 rounded whitespace-nowrap">
                                                                                            Community
                                                                                        </span>
                                                                                    );
                                                                                }
                                                                                return null;
                                                                            })()}


                                                                            {(() => {
                                                                                const sub = isBrv02 && submissionsMap ? submissionsMap[runId] : null;
                                                                                
                                                                                if (isBrv02) {
                                                                                    const status = sub?.status || benchmarkData[0]?.source_info?.submission_state || 'staged';
                                                                                    if (status === 'staged') {
                                                                                        return (
                                                                                            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                                                                                                <FileClock className="w-3 h-3 text-amber-400" /> Staged
                                                                                            </span>
                                                                                        );
                                                                                    }
                                                                                    if (status === 'submitted_pending_processing') {
                                                                                        return (
                                                                                            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded border border-yellow-500/20">
                                                                                                <Activity className="w-3 h-3 text-yellow-400" /> Processing
                                                                                            </span>
                                                                                        );
                                                                                    }
                                                                                    if (status === 'submitted_pending_review' || status === 'in_review') {
                                                                                        return (
                                                                                            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded border border-purple-500/20">
                                                                                                <Eye className="w-3 h-3 text-purple-400" /> In Review
                                                                                            </span>
                                                                                        );
                                                                                    }
                                                                                    if (status === 'public' || status === 'promoted' || status === 'approved') {
                                                                                        return (
                                                                                            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                                                                                                <Check className="w-3 h-3 text-emerald-400 font-extrabold" /> Public
                                                                                             </span>
                                                                                        );
                                                                                    }
                                                                                    if (status === 'rejected' || status === 'changes_requested') {
                                                                                        return (
                                                                                            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400 px-2 py-0.5 rounded border border-red-500/20">
                                                                                                <AlertCircle className="w-3 h-3 text-red-400" /> Rejected
                                                                                            </span>
                                                                                        );
                                                                                    }
                                                                                } else {
                                                                                    return (
                                                                                        <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider bg-emerald-500/5 text-emerald-400/80 px-2 py-0.5 rounded border border-emerald-500/10">
                                                                                            Official
                                                                                        </span>
                                                                                    );
                                                                                }
                                                                                return null;
                                                                            })()}


                                                                            <span 
                                                                                title={getSourceTag(benchmarkData[0]) === 'llm-d' ? "Official llm-d benchmark results stored in shared Google Drive store" : `Source: ${getSourceTag(benchmarkData[0])}`}
                                                                                className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700/80 text-slate-500 dark:text-slate-400 whitespace-nowrap cursor-help"
                                                                            >
                                                                                {getSourceTag(benchmarkData[0])}
                                                                            </span>

                                                                            {(() => {
                                                                                const type = getSourceType(benchmarkData[0]);
                                                                                if (type === 'Cloud') return null;
                                                                                const style = getSourceTypeStyle(type);
                                                                                return (
                                                                                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border whitespace-nowrap ${style.bg} ${style.text} ${style.border}`}>
                                                                                        {type}
                                                                                    </span>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                    </div>

                                                                    {(() => {
                                                                        const sub = isBrv02 && submissionsMap ? submissionsMap[runId] : null;
                                                                        if (sub && sub.status === 'changes_requested' && sub.feedback) {
                                                                            return (
                                                                                <div 
                                                                                    onClick={e => e.stopPropagation()}
                                                                                    className="mt-2 text-[11px] bg-red-500/10 text-red-300 border border-red-500/20 rounded-xl p-3 max-w-3xl italic leading-relaxed flex items-start gap-2 shadow-sm font-sans"
                                                                                >
                                                                                    <span className="font-extrabold uppercase text-[9px] not-italic tracking-wider bg-red-500/20 px-1.5 py-0.5 rounded text-red-450 shrink-0 mt-0.5">
                                                                                        Changes Requested:
                                                                                    </span>
                                                                                    <span>"{sub.feedback}"</span>
                                                                                </div>
                                                                            );
                                                                        }
                                                                        return null;
                                                                    })()}

                                                                    {/* Line 2: Dedicated to just selected visible stats */}
                                                                    {specs.length > 0 && (
                                                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                                                                            {specs.map((spec, sIdx) => {
                                                                                const showDot = sIdx > 0;
                                                                                return (
                                                                                    <React.Fragment key={spec.key}>
                                                                                        {showDot && <span className="text-slate-300 dark:text-slate-700 select-none font-bold">·</span>}
                                                                                        {spec}
                                                                                    </React.Fragment>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>

                                                    {/* Right side expand icon */}
                                                    <div className="flex-shrink-0 text-slate-400 flex items-center justify-center w-6 h-6 ml-2">
                                                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                                    </div>
                                                </div>
                                            </div>

                                             {/* Expanded Table Details */}
                                             {isExpanded && (
                                                 <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 p-4">
                                                     <div className="flex justify-between items-stretch gap-4 mb-3 w-full">
                                                         {benchmarkData[0]?.source_info?.type === 'benchmark_report_v02' ? (
                                                             <div className="flex-1 p-2 bg-slate-100 dark:bg-slate-800/40 rounded border border-slate-200 dark:border-slate-700/80 font-sans flex flex-wrap gap-x-6 gap-y-2.5 text-xs text-slate-600 dark:text-slate-400">
                                                             <div className="flex items-center gap-1.5">
                                                                 <span className="font-semibold text-slate-700 dark:text-slate-300">Run UUID:</span>
                                                                 <span className="font-mono bg-slate-200 dark:bg-slate-800/50 px-1.5 py-0.5 rounded text-[11px] select-all">{benchmarkData[0]?.run_id}</span>
                                                             </div>
                                                             <div className="flex items-center gap-1.5">
                                                                 <span className="font-semibold text-slate-700 dark:text-slate-300">Submitted:</span>
                                                                 <span>{benchmarkData[0]?.source_info?.submitted_at ? new Date(benchmarkData[0].source_info.submitted_at).toLocaleString() : 'Unknown'}</span>
                                                                 {benchmarkData[0]?.github_author?.username && (
                                                                     <span className="flex items-center gap-1 bg-slate-200/50 dark:bg-slate-800/50 px-1.5 py-0.5 rounded ml-1">
                                                                         <img 
                                                                             src={`https://github.com/${benchmarkData[0].github_author.username}.png`} 
                                                                             alt={benchmarkData[0].github_author.username} 
                                                                             className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600"
                                                                             onError={(e) => { e.target.style.display = 'none'; }}
                                                                         />
                                                                         <a 
                                                                             href={`https://github.com/${benchmarkData[0].github_author.username}`} 
                                                                             target="_blank" 
                                                                             rel="noopener noreferrer" 
                                                                             className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                                                                         >
                                                                             {benchmarkData[0].github_author.username}
                                                                         </a>
                                                                     </span>
                                                                 )}
                                                             </div>
                                                             <div className="flex items-center gap-1.5">
                                                                 <span className="font-semibold text-slate-700 dark:text-slate-300">Status:</span>
                                                                 {(() => {
                                                                     const details = getSubmissionStatusDetails(benchmarkData[0]?.source_info?.submission_state);
                                                                     return (
                                                                         <span className={`px-1.5 py-0.5 rounded border text-[11px] font-bold ${details.bg} ${details.text} ${details.border}`}>
                                                                             {details.label}
                                                                         </span>
                                                                     );
                                                                 })()}
                                                             </div>
                                                             {(benchmarkData[0]?.source_info?.submission_state === 'public' || benchmarkData[0]?.source_info?.submission_state === 'promoted' || benchmarkData[0]?.source_info?.approved_at) && (
                                                                 <div className="flex items-center gap-1.5">
                                                                     <span className="font-semibold text-slate-700 dark:text-slate-300">Approved:</span>
                                                                     <span>{benchmarkData[0].source_info.approved_at ? new Date(benchmarkData[0].source_info.approved_at).toLocaleString() : (benchmarkData[0].source_info.submitted_at ? new Date(benchmarkData[0].source_info.submitted_at).toLocaleString() : 'Unknown')}</span>
                                                                 </div>
                                                             )}
                                                         </div>
                                                     ) : (
                                                         <div className="flex-1" />
                                                     )}

                                                     <button
                                                         onClick={(e) => {
                                                             e.stopPropagation();
                                                             setViewingPayloadRun(stat);
                                                         }}
                                                         className="flex-shrink-0 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#070b13] hover:border-slate-300 dark:hover:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm whitespace-nowrap animate-in fade-in duration-200"
                                                         title="Inspect Raw YAML / JSON Manifest"
                                                     >
                                                         <Code2 size={13} />
                                                         Inspect Raw Manifest
                                                     </button>
                                                 </div>

                                                     <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
                                                          <table className="w-full text-left text-slate-600 dark:text-slate-300 text-xs bg-white dark:bg-slate-800">
                                                              <thead className="bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-100 uppercase text-[10px] font-medium border-b border-slate-200 dark:border-slate-700">
                                                                  <tr>
                                                                      {isBrv02 && <th className="px-3 py-2 w-12 text-center">Stage</th>}
                                                                      <th className="px-4 py-2">{isBrv02 ? 'QPS' : 'QPS'}</th>
                                                                      <th className="px-2 py-2">Input Tok/s</th>
                                                                      <th className="px-2 py-2">Output Tok/s</th>
                                                                      <th className="px-2 py-2">Total Tok/s</th>
                                                                      <th className="px-2 py-2">NTPOT (ms)</th>
                                                                      <th className="px-2 py-2">TPOT (ms)</th>
                                                                      <th className="px-2 py-2">ITL (ms)</th>
                                                                      <th className="px-2 py-2">TTFT (ms)</th>
                                                                      <th className="px-2 py-2">E2E (s)</th>
                                                                      <th className="px-2 py-2">Cost/1M In ($)</th>
                                                                      <th className="px-2 py-2">Cost/1M Out ($)</th>
                                                                      <th className="px-2 py-2">Input Len</th>
                                                                      <th className="px-2 py-2">Output Len</th>
                                                                      <th className="px-2 py-2 w-16 text-center">Raw</th>
                                                                  </tr>
                                                              </thead>
                                                              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                                                  {[...benchmarkData]
                                                                      .sort((a, b) => (a.workload?.stage ?? 0) - (b.workload?.stage ?? 0))
                                                                      .map((d, index) => (
                                                                          <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                                                              {isBrv02 && (
                                                                                  <td className="px-3 py-2 text-center w-12 text-slate-500 border-r border-slate-100 dark:border-slate-700">
                                                                                      {d.workload?.stage ?? '-'}
                                                                                  </td>
                                                                              )}
                                                                              <td className="px-4 py-2">
                                                                                  {(d.metrics?.request_rate?.toFixed(2) || d.qps?.toFixed(2) || '-')}
                                                                              </td>
                                                                              <td className="px-2 py-2">{d.metrics?.input_tput?.toFixed(0) || '-'}</td>
                                                                              <td className="px-2 py-2">{d.metrics?.output_tput?.toFixed(0) || d.throughput?.toFixed(0) || '-'}</td>
                                                                              <td className="px-2 py-2 font-medium">{d.metrics?.total_tput?.toFixed(0) || '-'}</td>
                                                                              <td className="px-2 py-2 text-[10px]">{d.metrics?.ntpot?.toFixed(2) || d.ntpot?.toFixed(2) || '-'}</td>
                                                                              <td className="px-2 py-2 text-[10px]">{d.metrics?.tpot?.toFixed(2) || d.time_per_output_token?.toFixed(2) || '-'}</td>
                                                                              <td className="px-2 py-2 text-[10px]">{d.metrics?.itl?.toFixed(2) || d.itl?.toFixed(2) || '-'}</td>
                                                                              <td className="px-2 py-2 text-[10px]">{d.metrics?.ttft?.mean?.toFixed(2) || d.ttft?.mean?.toFixed(2) || '-'}</td>
                                                                              <td className="px-2 py-2 text-[10px]">{((d.metrics?.e2e_latency || d.latency?.mean) / 1000)?.toFixed(2) || '-'}</td>
                                                                              <td className="px-2 py-2 text-[10px] text-slate-500">
                                                                                  {d.metrics?.cost?.explicit_input > 0 ? `$${d.metrics.cost.explicit_input.toFixed(4)}` : '-'}
                                                                              </td>
                                                                              <td className="px-2 py-2 text-[10px] text-slate-500">
                                                                                  {d.metrics?.cost?.explicit_output > 0 ? `$${d.metrics.cost.explicit_output.toFixed(4)}` : '-'}
                                                                              </td>
                                                                              <td className="px-2 py-2 text-[10px]">{d.isl?.toFixed(0) || d.workload?.input_tokens?.toFixed(0) || '-'}</td>
                                                                              <td className="px-2 py-2 text-[10px]">{d.osl?.toFixed(0) || d.workload?.output_tokens?.toFixed(0) || '-'}</td>
                                                                              <td className="px-2 py-2 text-center">
                                                                                  <button
                                                                                      disabled={!d.rawReport}
                                                                                      onClick={(e) => {
                                                                                          e.stopPropagation();
                                                                                          try {
                                                                                              setRawYamlContent(d.rawReport ? yaml.dump(d.rawReport, { noRefs: true }) : '');
                                                                                          } catch (err) {
                                                                                              console.error("Failed to dump raw report to YAML:", err);
                                                                                              setRawYamlContent("Error rendering raw report.");
                                                                                          }
                                                                                          setRawYamlTitle(d.source_info?.file_identifier || d.filename || `Stage ${d.workload?.stage}`);
                                                                                      }}
                                                                                      title="Raw"
                                                                                      className={`p-1 rounded transition-colors ${
                                                                                          d.rawReport 
                                                                                              ? 'text-slate-400 hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-400 cursor-pointer' 
                                                                                              : 'text-slate-200 dark:text-slate-800 cursor-not-allowed opacity-50'
                                                                                      }`}
                                                                                  >
                                                                                      <FileText size={14} />
                                                                                  </button>
                                                                              </td>
                                                                          </tr>
                                                                      ))}
                                                              </tbody>
                                                          </table>
                                                      </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        );
                    })
                )}
                </div>
            </div>
            {dragBox && (
                <div
                    style={{
                        position: 'fixed',
                        left: Math.min(dragBox.startX, dragBox.currentX),
                        top: Math.min(dragBox.startY, dragBox.currentY),
                        width: Math.abs(dragBox.currentX - dragBox.startX),
                        height: Math.abs(dragBox.currentY - dragBox.startY),
                        pointerEvents: 'none',
                        zIndex: 9999,
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.4)',
                        borderRadius: '2px',
                    }}
                />
            )}
            {rawYamlContent !== null && createPortal(
                <div className="fixed inset-0 bg-black/60 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setRawYamlContent(null)}>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                            <h3 className="text-sm font-bold text-white truncate">Raw Report: {rawYamlTitle}</h3>
                            <button 
                                onClick={() => setRawYamlContent(null)}
                                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1 font-mono text-xs text-slate-300 bg-slate-950 select-all whitespace-pre-wrap">
                            {rawYamlContent}
                        </div>
                        <div className="p-3 border-t border-slate-800 bg-slate-900/50 flex justify-end">
                            <button
                                onClick={() => setRawYamlContent(null)}
                                className="px-4 py-2 text-xs font-semibold rounded-md text-white bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-700"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Raw Payload Manifest Modal */}
            {viewingPayloadRun && createPortal(
                <div 
                    className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300"
                    onClick={() => setViewingPayloadRun(null)}
                >
                    <div 
                        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800">
                            <div className="flex items-center gap-2">
                                <Code2 className="w-5 h-5 text-cyan-400" />
                                <span className="text-sm font-bold text-white tracking-wide">
                                    Raw Manifest Payload (YAML): {viewingPayloadRun.benchmarkKey || viewingPayloadRun.model || 'Configuration'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        try {
                                            const dataToDump = viewingPayloadRun.data?.[0] || viewingPayloadRun;
                                            const yamlStr = yaml.dump(dataToDump, { noRefs: true });
                                            navigator.clipboard.writeText(yamlStr);
                                            alert('Manifest copied to clipboard');
                                        } catch (err) {
                                            console.error("Failed to copy YAML:", err);
                                            alert('Failed to copy manifest');
                                        }
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg transition-colors cursor-pointer"
                                >
                                    <Copy className="w-3.5 h-3.5" /> Copy YAML
                                </button>
                                <button
                                    onClick={() => setViewingPayloadRun(null)}
                                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        <div className="p-4 overflow-y-auto font-mono text-xs text-cyan-300/90 leading-relaxed bg-slate-950/50 selection:bg-cyan-500 selection:text-black">
                            <pre className="m-0">
                                {(() => {
                                    try {
                                        const dataToDump = viewingPayloadRun.data?.[0] || viewingPayloadRun;
                                        return yaml.dump(dataToDump, { noRefs: true });
                                    } catch (err) {
                                        console.error("Failed to dump to YAML:", err);
                                        return "Error rendering YAML.";
                                    }
                                })()}
                            </pre>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Slide-Over Comparison Drawer Displayed from Right */}
            {showComparisonDrawer && createPortal(
                <div 
                    className="fixed inset-0 bg-black/40 z-[99998] backdrop-blur-[1.5px] cursor-pointer"
                    onClick={() => setShowComparisonDrawer(false)}
                />,
                document.body
            )}
            
            {createPortal(
                <div className={`fixed top-20 right-4 h-[calc(100vh-6rem)] w-full sm:w-[864px] xl:w-[1030px] bg-slate-950/95 border border-slate-900 shadow-2xl z-[99999] flex flex-col rounded-3xl overflow-hidden p-6 transform transition-transform duration-300 pointer-events-auto ${showComparisonDrawer ? 'translate-x-0' : 'translate-x-[calc(100%+2rem)]'}`}>
                        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
                        
                        <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-805 flex-shrink-0">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-cyan-400">
                                        {hasPromotableSelected 
                                            ? `Compare & Promote (${selectedBenchmarks.size} Runs)` 
                                            : `Compare & Inspect (${selectedBenchmarks.size} Runs)`}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setShowComparisonDrawer(false)}
                                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Scrollable Content Container */}
                        <div className="flex-1 overflow-y-auto space-y-8 pr-1 custom-scrollbar">
                            
                            {/* Section 1: Chart Container */}
                            <div className="min-h-[500px] w-full flex flex-col">
                                <ThroughputCostChart
                                    tputType={drawerTputType}
                                    setTputType={setDrawerTputType}
                                    yQualityMode={drawerYQualityMode}
                                    setYQualityMode={setDrawerYQualityMode}
                                    chartMode={drawerChartMode}
                                    setChartMode={setDrawerChartMode}
                                    xQualityMode={drawerXQualityMode}
                                    setXQualityMode={setDrawerXQualityMode}
                                    costMode={drawerCostMode}
                                    setCostMode={setDrawerCostMode}
                                    showPerChip={drawerShowPerChip}
                                    setShowPerChip={setDrawerShowPerChip}
                                    showLabels={drawerShowLabels}
                                    setShowLabels={setDrawerShowLabels}
                                    showDataLabels={drawerShowDataLabels}
                                    setShowDataLabels={setDrawerShowDataLabels}
                                    showPareto={drawerShowPareto}
                                    setShowPareto={setDrawerShowPareto}
                                    qualityMetrics={qualityMetrics}
                                    allModels={modelStats.map(m => m.model)}
                                    selectedModels={selectedModels}
                                    filteredData={filteredBySource}
                                    getBenchmarkKey={getBenchmarkKey}
                                    theme="dark"
                                    isZoomEnabled={drawerIsZoomEnabled}
                                    setIsZoomEnabled={setDrawerIsZoomEnabled}
                                    zoomDomain={drawerZoomDomain}
                                    setZoomDomain={setDrawerZoomDomain}
                                    chartContainerRef={drawerChartContainerRef}
                                    isDragging={drawerIsDragging}
                                    setIsDragging={setDrawerIsDragging}
                                    lastMouseRef={drawerLastMouseRef}
                                    chartColorMode={drawerChartColorMode}
                                    setChartColorMode={setDrawerChartColorMode}
                                    metricAvailability={drawerMetricAvailability}
                                    filteredBySource={filteredBySource}
                                    xAxisMax={drawerXAxisMax}
                                    setXAxisMax={setDrawerXAxisMax}
                                    isLogScaleX={drawerIsLogScaleX}
                                    setIsLogScaleX={setDrawerIsLogScaleX}
                                    setLatType={setDrawerLatType}
                                    selectedBenchmarks={selectedBenchmarks}
                                    baselineBenchmarkKey={baselineBenchmarkKey}
                                />
                            </div>

                            {/* Section 2: Active Submissions Actions */}
                            <div className="space-y-4">

                                {selectedStagedRuns.length > 0 && (
                                    <div className="flex justify-end pt-1 select-none">
                                        {user?.permission === 'none' ? (
                                            <div className="relative group/tooltip inline-block">
                                                <button
                                                    disabled
                                                    className="px-4 py-2 bg-slate-800 text-slate-500 text-xs font-bold uppercase tracking-wider rounded-xl border border-slate-700/50 cursor-not-allowed flex items-center gap-1.5 opacity-60"
                                                >
                                                    <Send size={12} />
                                                    Publish Selected ({selectedStagedRuns.length})
                                                </button>
                                                <div className="absolute right-0 bottom-full mb-2 px-3 py-2 bg-slate-900 border border-slate-800 text-slate-350 text-xs font-medium rounded-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 shadow-2xl z-[9999] w-64 pointer-events-none leading-relaxed text-center normal-case tracking-normal animate-in fade-in slide-in-from-bottom-2 duration-150">
                                                    You are not in the Results Store closed-beta. Check back later once the feature is released.
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                id="drawer-publish-selected-btn"
                                                onClick={handlePublishSelected}
                                                className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-650 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-[0_0_12px_rgba(6,182,212,0.15)] transition-all hover:scale-[1.02] cursor-pointer flex items-center gap-1.5"
                                            >
                                                <Send size={12} />
                                                Publish Selected ({selectedStagedRuns.length})
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div className="flex items-center justify-between border-b border-slate-900 pb-2 select-none">
                                    <span className="text-xs font-black uppercase tracking-wider text-cyan-400/90">
                                        Run Verification & Promotion Pipeline
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                        {modelStats.filter(s => selectedBenchmarks.has(s.benchmarkKey)).length} Selected Runs
                                    </span>
                                </div>
                                
                                <div className="grid grid-cols-1 gap-3.5">
                                    {modelStats.filter(s => selectedBenchmarks.has(s.benchmarkKey)).map(stat => {
                                        const firstEntry = stat.data?.[0];
                                        if (!firstEntry) return null;
                                        const src = firstEntry.source || '';
                                        const isBrv02 = src.startsWith('brv02:') || firstEntry.source_info?.type === 'benchmark_report_v02';
                                        const runId = isBrv02 ? (src.startsWith('brv02:') ? src.replace('brv02:', '') : firstEntry.run_id) : null;
                                        const sub = runId && submissionsMap ? submissionsMap[runId] : null;
                                        const status = sub?.status || firstEntry.source_info?.submission_state || 'staged';
                                        const isResultsStore = firstEntry.source_info?.type === 'benchmark_report_v02';
                                        const isMine = isResultsStore && user && firstEntry.github_author?.username === user.username;
                                        const isLocal = src.startsWith('brv02:');
                                        const canResubmit = isLocal || isMine || isAdmin;
                                        
                                        return (
                                            <div key={stat.benchmarkKey} className="flex flex-col p-4 rounded-2xl border border-slate-800/50 bg-[#0d131f]/20 hover:bg-[#0d131f]/40 hover:border-slate-700/40 transition-all duration-200">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleBaseline(stat.benchmarkKey);
                                                                }}
                                                                title={stat.benchmarkKey === baselineBenchmarkKey ? 'Clear baseline' : 'Set as baseline'}
                                                                className={`p-1.5 rounded-xl border transition-colors flex-shrink-0 cursor-pointer ${
                                                                    stat.benchmarkKey === baselineBenchmarkKey
                                                                        ? 'bg-cyan-500/10 border-cyan-500/35 text-cyan-400'
                                                                        : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-cyan-400 hover:border-cyan-500/20'
                                                                }`}
                                                            >
                                                                <Pin size={11} className={`transition-transform duration-300 ${stat.benchmarkKey === baselineBenchmarkKey ? 'rotate-[45deg]' : '-rotate-45 opacity-65'}`} fill={stat.benchmarkKey === baselineBenchmarkKey ? 'currentColor' : 'none'} />
                                                            </button>
                                                            <span className="text-sm font-semibold text-white tracking-tight truncate max-w-[280px]" title={stat.model}>
                                                                {stat.model}
                                                            </span>
                                                            {isBrv02 ? (
                                                                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-cyan-950/40 text-cyan-400 border border-cyan-900/35">
                                                                    {stat.hardware}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-900/35">
                                                                    Production Results Store
                                                                </span>
                                                            )}
                                                            
                                                            {/* Status Badge */}
                                                            {isBrv02 ? (
                                                                <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                                                                    (status === 'public' || status === 'promoted' || status === 'approved') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                                    status === 'submitted_pending_processing' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 animate-pulse' :
                                                                    (status === 'submitted_pending_review' || status === 'in_review') ? 'bg-purple-500/10 text-purple-400 border-purple-500/20 animate-pulse' :
                                                                    (status === 'rejected' || status === 'changes_requested') ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                                    'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                                }`}>
                                                                    {(status === 'rejected' || status === 'changes_requested') ? 'Changes Requested' :
                                                                     status === 'submitted_pending_processing' ? 'Verifying Format' :
                                                                     (status === 'submitted_pending_review' || status === 'in_review') ? 'Pending Review' :
                                                                     (status === 'public' || status === 'promoted' || status === 'approved') ? 'Public' :
                                                                     status}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/25 flex items-center gap-1">
                                                                    <ShieldCheck className="w-3 h-3 text-emerald-450" /> Verified
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-slate-500 truncate" title={stat.configuration}>
                                                            {stat.configuration || 'Default Settings'}
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Actions */}
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        {isBrv02 && (
                                                            <div className="flex items-center gap-2">
                                                                {canResubmit && status === 'staged' && (
                                                                    <button
                                                                        onClick={() => {
                                                                            const run = brv02Runs.find(r => r.runId === runId);
                                                                            if (run) {
                                                                                handleSubmitStagedRunForReview(run);
                                                                            }
                                                                        }}
                                                                        disabled={isLoadingSubmissions || isLocalActionPending}
                                                                        className="flex items-center gap-1 px-3 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold uppercase tracking-wider rounded-xl shadow transition-all hover:scale-[1.03] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                                                                    >
                                                                        <Play className="w-3 h-3 fill-slate-950 text-slate-950" /> Verify Format
                                                                    </button>
                                                                )}
                                                                {canResubmit && status === 'submitted_pending_processing' && (
                                                                    user?.permission === 'none' ? (
                                                                        <div className="relative group/tooltip inline-block">
                                                                            <button
                                                                                disabled
                                                                                className="flex items-center gap-1 px-3 py-2 bg-slate-800 text-slate-500 text-xs font-bold uppercase tracking-wider rounded-xl border border-slate-700/50 cursor-not-allowed opacity-60"
                                                                            >
                                                                                <Send className="w-3 h-3" /> Submit for Review
                                                                            </button>
                                                                            <div className="absolute right-0 bottom-full mb-2 px-3 py-2 bg-slate-900 border border-slate-800 text-slate-350 text-xs font-medium rounded-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 shadow-2xl z-[9999] w-64 pointer-events-none leading-relaxed text-center normal-case tracking-normal">
                                                                                You are not in the Results Store closed-beta. Check back later once the feature is released.
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => handleActionClick(async () => updateSubmissionStatus && await updateSubmissionStatus(runId, 'submitted_pending_review', '', stat.model, stat.hardware))}
                                                                            disabled={isLoadingSubmissions || isLocalActionPending}
                                                                            className="flex items-center gap-1 px-3 py-2 bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow transition-all hover:scale-[1.03] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                                                                        >
                                                                            <Send className="w-3 h-3" /> Submit for Review
                                                                        </button>
                                                                    )
                                                                )}
                                                                {isAdmin && (status === 'submitted_pending_review' || status === 'in_review') && (
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            onClick={() => handleActionClick(async () => updateSubmissionStatus && await updateSubmissionStatus(runId, 'public', '', stat.model, stat.hardware))}
                                                                            disabled={isLoadingSubmissions || isLocalActionPending}
                                                                            className="flex items-center gap-1 px-3 py-2 bg-emerald-500 hover:bg-emerald-450 text-slate-950 text-xs font-bold uppercase tracking-wider rounded-xl shadow transition-all hover:scale-[1.03] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                                                                        >
                                                                            <Check className="w-3 h-3 stroke-[3]" /> Publish Run
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                setDrawerRejectingRunId(runId);
                                                                                setDrawerRejectionFeedback('');
                                                                            }}
                                                                            disabled={isLoadingSubmissions || isLocalActionPending}
                                                                            className="flex items-center gap-1 px-2.5 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 text-xs font-bold uppercase tracking-wider rounded-xl transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                                                                        >
                                                                            <X className="w-3 h-3" /> Reject
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                {canResubmit && (status === 'rejected' || status === 'changes_requested') && (
                                                                    <button
                                                                        onClick={() => updateSubmissionStatus && updateSubmissionStatus(runId, 'submitted_pending_processing', '', stat.model, stat.hardware)}
                                                                        disabled={isLoadingSubmissions}
                                                                        className="flex items-center gap-1 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold uppercase tracking-wider rounded-xl shadow transition-all hover:scale-[1.03] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                                                                    >
                                                                        <RotateCcw className="w-3.5 h-3.5" /> Resubmit Validation
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                
                                                {/* Drawer Rejection inline input */}
                                                {runId !== null && drawerRejectingRunId === runId && (
                                                    <div className="w-full mt-4 p-4 bg-slate-950/60 border border-red-500/20 rounded-2xl animate-fadeIn flex flex-col gap-3">
                                                        <div className="text-xs font-bold text-red-400 uppercase tracking-widest flex items-center justify-between select-none">
                                                            <span>Provide Revision Feedback</span>
                                                            <button 
                                                                onClick={() => setDrawerRejectingRunId(null)}
                                                                className="text-slate-400 hover:text-white"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                        <textarea
                                                            value={drawerRejectionFeedback}
                                                            onChange={(e) => setDrawerRejectionFeedback(e.target.value)}
                                                            placeholder="Explain why this run is rejected or what changes are required..."
                                                            className="w-full p-3 bg-slate-900/80 border border-slate-800 text-slate-200 text-xs rounded-xl outline-none focus:border-red-500/40 min-h-[70px] resize-y placeholder:text-slate-600"
                                                        />
                                                        <div className="flex justify-end gap-2 mt-1">
                                                            <button
                                                                onClick={() => setDrawerRejectingRunId(null)}
                                                                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold uppercase rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    if (drawerRejectionFeedback.trim() && updateSubmissionStatus) {
                                                                        updateSubmissionStatus(runId, 'rejected', drawerRejectionFeedback, stat.model, stat.hardware);
                                                                        setDrawerRejectingRunId(null);
                                                                    }
                                                                }}
                                                                disabled={!drawerRejectionFeedback.trim() || isLoadingSubmissions}
                                                                className={`px-3 py-1.5 text-xs font-bold uppercase rounded-lg transition-all duration-200 ${
                                                                    (drawerRejectionFeedback.trim() && !isLoadingSubmissions)
                                                                    ? 'bg-red-500 hover:bg-red-400 text-slate-950 cursor-pointer hover:scale-105'
                                                                    : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                                                                }`}
                                                            >
                                                                Confirm Rejection
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Fixed Footer */}
                        <div className="pt-4 mt-6 border-t border-slate-900 flex items-center justify-end gap-3 flex-shrink-0 select-none">
                            <button
                                type="button"
                                onClick={() => setShowComparisonDrawer(false)}
                                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer shadow-md"
                            >
                                Close
                            </button>
                        </div>
                </div>,
                document.body
            )}
            {/* Floating Action Dock when runs are selected */}
            {selectedBenchmarks.size > 0 && createPortal(
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-4 bg-slate-950/90 backdrop-blur-md border border-slate-800/80 px-4 py-3 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom duration-300">
                    <span className="text-xs font-medium text-slate-300">
                        {selectedBenchmarks.size} {selectedBenchmarks.size === 1 ? 'benchmark' : 'benchmarks'} selected
                    </span>
                    <div className="h-4 w-px bg-slate-800" />
                    <button
                        onClick={clearSelected}
                        className="text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                        Unselect All
                    </button>
                    {isAdmin && onlyPendingReviewSelected && (
                        <>
                            <button
                                onClick={() => handleActionClick(handleBulkApprove)}
                                disabled={isLoadingSubmissions || isLocalActionPending}
                                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-450 text-slate-950 text-xs font-semibold rounded-xl shadow-md transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none cursor-pointer hover:scale-105 font-bold flex items-center gap-1.5"
                            >
                                <Check className="w-3.5 h-3.5 stroke-[3]" /> Approve
                            </button>
                            <button
                                onClick={() => handleActionClick(handleBulkReject)}
                                disabled={isLoadingSubmissions || isLocalActionPending}
                                className="px-4 py-2 bg-[#ef4444] hover:bg-red-400 text-white text-xs font-semibold rounded-xl shadow-md transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none cursor-pointer hover:scale-105 font-bold flex items-center gap-1.5"
                            >
                                <X className="w-3.5 h-3.5" /> Reject
                            </button>
                        </>
                    )}
                    <button
                        id="bottom-compare-publish-btn"
                        onClick={() => setShowComparisonDrawer(true)}
                        className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold rounded-xl shadow-md transition-all duration-200 cursor-pointer hover:scale-105"
                    >
                        {hasPromotableSelected ? 'Compare & Promote' : 'Compare & Inspect'}
                    </button>
                </div>,
                document.body
            )}

        </div>
    );
};