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
import { RotateCcw, ChevronDown, ChevronUp, Star, Pin, CheckSquare, Square, Check, Pencil, Trash2, Code2, Copy, Share2, X, Database, Eye, EyeOff, ShieldCheck, AlertCircle, TrendingUp, AlertTriangle, Search, FileText, FileClock, Sliders, Activity, Send, Play, Loader, Download, ExternalLink, GitFork, Info } from 'lucide-react';
import { RunComparisonChart } from '../Dashboard/RunComparisonChart';
import { ThroughputCostChart } from '../Dashboard/ThroughputCostChart';
import { Button, Badge, StatusChip, Modal, Textarea } from '../ui';
import { cn } from '../../utils/cn';
import { getSourceTag, getSourceType, getSourceTypeStyle, formatOriginLabel, getSubmissionStatusDetails, getBenchmarkKey } from '../../utils/dashboardHelpers';
import { buildRunLabel } from '../../utils/runLabel';
import yaml from 'js-yaml';
import { useGitHubAuth } from '../../hooks/useGitHubAuth';
import { validateBenchmark } from '../../utils/benchmarkValidator';
import { encodeShareLink, isValidUuid } from '../../utils/shareLinkEncoder';
import { isFileBackedRun } from '../../utils/benchmarkReportV02Parser';
import { v4 as uuidv4 } from 'uuid';
import { downloadRunBRV02, downloadSingleStageYaml, getRawPrismCloudPayload } from '../../utils/brv02Exporter';
import { parseDataUri } from '../../utils/dataParser';
import { forkBenchmark } from '../../utils/benchmarkForker';
import { createGlobMatcher, matchesBenchmarkStat } from '../../utils/globUtils';

const getStatusTooltipText = (status, sub) => {
    switch (status) {
        case 'staged':
            return "Staged locally on your machine. Not yet submitted to the Results Store.";
        case 'submitted_pending_processing':
        case 'processing':
            return "Staged in the GCS bucket. Automated formatting checks are running.";
        case 'submitted_pending_review':
        case 'in_review':
            return "Pending admin review. Check back later once a reviewer approves it.";
        case 'approved':
        case 'approved_pending_publish':
            return "Approved by admins. Waiting for the next scheduled sync to publish.";
        case 'public':
        case 'promoted':
            return "Published in the Public Results Store and visible to all users.";
        case 'rejected':
        case 'changes_requested': {
            const reason = sub?.feedback || sub?.rejectionFeedback;
            return reason 
                ? `Rejected by admins. Reason: "${reason}"`
                : "Rejected by Results Store admins.";
        }
        default:
            return "Status: " + status;
    }
};

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

    if (status === 'unlisted') {
        return {
            borderClass: 'border-cyan-500/30 dark:border-cyan-500/20 hover:border-cyan-400/50',
            bgClass: 'bg-cyan-500/[0.02]',
            accentBar: <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-cyan-500 z-10" />
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

const getKpiFilterLabel = (filter, isPlaygroundMode = false) => {
    switch (filter) {
        case 'my-submissions': return isPlaygroundMode ? 'Pending Benchmarks' : 'My Benchmarks';
        case 'verified': return 'Production Ready';
        case 'staged': return 'Locally Staged';
        case 'unlisted': return 'Unlisted';
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
    const { dashboardState, includeUnlisted = false, addToast, dashboardData } = props;
    const { user, isPlaygroundMode } = useGitHubAuth();
    const isAdmin = user?.permission === 'admin';
        const [rawYamlContent, setRawYamlContent] = useState(null);
    const [rawYamlTitle, setRawYamlTitle] = useState('');
    
    // Read shared graphing state from dashboardState, falling back to local defaults if dashboardState is not present
    const {
        showComparisonDrawer: sharedShowComparisonDrawer,
        setShowComparisonDrawer: sharedSetShowComparisonDrawer,
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
        lineConnectMode: sharedLineConnectMode, setLineConnectMode: sharedSetLineConnectMode,
    } = dashboardState || {};

    const [localShowComparisonDrawer, localSetShowComparisonDrawer] = useState(false);
    const showComparisonDrawer = sharedShowComparisonDrawer !== undefined ? sharedShowComparisonDrawer : localShowComparisonDrawer;
    const setShowComparisonDrawer = sharedSetShowComparisonDrawer || localSetShowComparisonDrawer;

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
    const [localLineConnectMode, localSetLineConnectMode] = useState('stage');

    const drawerLineConnectMode = sharedLineConnectMode !== undefined ? sharedLineConnectMode : localLineConnectMode;
    const setDrawerLineConnectMode = sharedSetLineConnectMode || localSetLineConnectMode;

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
    const [activeExtraFilesPopoverRunId, setActiveExtraFilesPopoverRunId] = useState(null);
    const [inspectFileModalState, setInspectFileModalState] = useState({ isOpen: false, filename: '', content: '' });
    const extraFilesPopoverRef = React.useRef(null);

    React.useEffect(() => {
        const handleOutsideClick = (e) => {
            if (extraFilesPopoverRef.current && !extraFilesPopoverRef.current.contains(e.target)) {
                setActiveExtraFilesPopoverRunId(null);
            }
        };
        if (activeExtraFilesPopoverRunId) {
            document.addEventListener('mousedown', handleOutsideClick);
            return () => document.removeEventListener('mousedown', handleOutsideClick);
        }
    }, [activeExtraFilesPopoverRunId]);

    const [rejectingRunId, setRejectingRunId] = useState(null);
    const [rejectionFeedback, setRejectionFeedback] = useState('');

    const actionPendingRef = React.useRef(false);
    const [isLocalActionPending, setIsLocalActionPending] = React.useState(false);
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');

    React.useEffect(() => {
        if (showToast) {
            const timer = setTimeout(() => setShowToast(false), 2500);
            return () => clearTimeout(timer);
        }
    }, [showToast]);

    const handleActionClick = React.useCallback(async (actionFn) => {
        if (actionPendingRef.current) return;
        actionPendingRef.current = true;
        setIsLocalActionPending(true);
        try {
            await actionFn();
        } finally {
            actionPendingRef.current = false;
            setIsLocalActionPending(false);
        }
    }, []);


    const [isDraggingSelection, setIsDraggingSelection] = useState(false);
    const clickedCheckboxEl = React.useRef(null);
    const clickedCheckboxOffset = React.useRef({ x: 0, y: 0 });
    const dragStartClientPos = React.useRef({ x: 0, y: 0 });
    const initialScrollPos = React.useRef({ x: 0, y: 0 });
    const scrollContainerRef = React.useRef(null);
    const animFrameRef = React.useRef(null);
    const lastPointerPos = React.useRef({ x: 0, y: 0 });
    const [dragBox, setDragBox] = useState(null);
    const dragActionSelect = React.useRef(true);
    const initialSelection = React.useRef(new Set());
    const lastSelectedKeyRef = React.useRef(null);

    const {
        defaultSources = new Set(['llm-d-benchmarks', 'llm-d-benchmarks-staging']),
        modelStats, selectedModels, filteredBySource, showSelectedOnly: propShowSelectedOnly, setShowSelectedOnly,
        selectedBenchmarks, setSelectedBenchmarks, setActiveFilters, expandedModels,
        _toggleBenchmark, toggleModelExpansion,
        baselineBenchmarkKey, setBaselineBenchmarkKey,
        hideShowSelectedOnly = false,
        renameClearToUnselectAll = false,
        brv02Runs = [], brv02CustomLabels = {}, removeBrv02Run, scannedFilenames = null,
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
        deleteSubmission,
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
            nodes: true,
            model: true,
            islOsl: false,
            maxTput: false,
            minLat: false,
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

    const selectionBarRef = React.useRef(null);
    const [isStuck, setIsStuck] = useState(false);

    React.useEffect(() => {
        if (!selectedBenchmarks || selectedBenchmarks.size === 0) {
            setIsStuck(false);
            return;
        }

        const bar = selectionBarRef.current;
        if (!bar) return;

        const scrollParent = bar.closest('.overflow-y-auto') || window;

        const checkSticky = () => {
            if (!selectionBarRef.current) return;
            const rect = selectionBarRef.current.getBoundingClientRect();
            const parentTop = scrollParent === window ? 0 : scrollParent.getBoundingClientRect().top;
            setIsStuck(rect.top <= parentTop + 76);
        };

        scrollParent.addEventListener('scroll', checkSticky, { passive: true });
        checkSticky();

        return () => {
            scrollParent.removeEventListener('scroll', checkSticky);
        };
    }, [selectedBenchmarks]);

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

    const [hiddenBenchmarkKeys, setHiddenBenchmarkKeys] = React.useState(new Set());

    React.useEffect(() => {
        if (!showComparisonDrawer) {
            setHiddenBenchmarkKeys(new Set());
        }
    }, [showComparisonDrawer]);

    const handleToggleGraphVisibility = React.useCallback((key) => {
        setHiddenBenchmarkKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, []);

    const allSelectedKeys = React.useMemo(() => {
        return (modelStats || [])
            .filter(s => selectedBenchmarks.has(s.benchmarkKey))
            .map(s => s.benchmarkKey);
    }, [modelStats, selectedBenchmarks]);

    const handleSoloOrInvertGraphVisibility = React.useCallback((key) => {
        setHiddenBenchmarkKeys(prev => {
            const isOnlyThisVisible = !prev.has(key) && allSelectedKeys.every(k => k === key || prev.has(k));
            if (isOnlyThisVisible) {
                return new Set([key]);
            } else {
                const otherKeys = allSelectedKeys.filter(k => k !== key);
                return new Set(otherKeys);
            }
        });
    }, [allSelectedKeys]);

    const drawerFilteredData = React.useMemo(() => {
        return (filteredBySource || []).filter(d => selectedBenchmarks.has(getBenchmarkKey(d)));
    }, [filteredBySource, selectedBenchmarks]);

    const drawerChartFilteredData = React.useMemo(() => {
        return (filteredBySource || []).filter(d => {
            const key = getBenchmarkKey(d);
            return selectedBenchmarks.has(key) && !hiddenBenchmarkKeys.has(key);
        });
    }, [filteredBySource, selectedBenchmarks, hiddenBenchmarkKeys]);

    const { canShare, shareableUuids, shareForbiddenReason } = React.useMemo(() => {
        if (!selectedBenchmarks || selectedBenchmarks.size === 0) {
            return { canShare: false, shareableUuids: [], shareForbiddenReason: null };
        }

        const selectedStatsList = (modelStats || []).filter(stat => selectedBenchmarks.has(stat.benchmarkKey));

        if (selectedStatsList.length === 0 || selectedStatsList.length !== selectedBenchmarks.size) {
            return {
                canShare: false,
                shareableUuids: [],
                shareForbiddenReason: "Sharing is forbidden: Selection contains invalid or unknown runs."
            };
        }

        const uuids = [];
        for (const stat of selectedStatsList) {
            const firstEntry = stat.data?.[0];
            const sourceStr = firstEntry?.source || stat.source || '';
            const runId = firstEntry?.run_id || stat.runId || (sourceStr.startsWith('brv02:') ? sourceStr.replace('brv02:', '') : null);

            if (!runId || !isValidUuid(runId)) {
                return {
                    canShare: false,
                    shareableUuids: [],
                    shareForbiddenReason: "Sharing is forbidden: Selection contains unsubmitted or local staged runs without public UUIDs."
                };
            }

            const isBrv02 = sourceStr.startsWith('brv02:') || firstEntry?.source_info?.type === 'benchmark_report_v02';
            const sub = isBrv02 && runId && submissionsMap ? submissionsMap[runId] : null;
            const status = sub?.status || firstEntry?.source_info?.submission_state || stat.payload?.submission_state || 'staged';

            if (status !== 'public' && status !== 'unlisted') {
                return {
                    canShare: false,
                    shareableUuids: [],
                    shareForbiddenReason: "Sharing is forbidden: Selection contains staged, pending review, or rejected runs. Only public and unlisted benchmarks can be shared."
                };
            }

            uuids.push(runId);
        }

        return {
            canShare: true,
            shareableUuids: uuids,
            shareForbiddenReason: null
        };
    }, [selectedBenchmarks, modelStats, submissionsMap]);

    const handleCopyShareLink = React.useCallback(() => {
        if (!canShare || shareableUuids.length === 0) return;
        const shareLink = encodeShareLink(shareableUuids);
        const fullUrl = `${window.location.origin}${window.location.pathname}?view=results-store&benchmarks=${shareLink}`;
        navigator.clipboard.writeText(fullUrl);
        if (addToast) {
            addToast('Copied link to clipboard!', 'success');
        } else if (dashboardData?.addToast) {
            dashboardData.addToast('Copied link to clipboard!', 'success');
        } else {
            setToastMessage('Copied link to clipboard!');
            setShowToast(true);
        }
    }, [canShare, shareableUuids, addToast, dashboardData]);

    const buildBundleForRun = React.useCallback((run) => {
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

        const forkedFromVal = run.forked_from 
            || run.payload?.forked_from 
            || run.bundle?.payload?.forked_from 
            || run.stages?.[0]?.forked_from 
            || run.stages?.[0]?.payload?.forked_from 
            || null;

        const githubAuthorVal = run.github_author 
            || run.payload?.github_author 
            || run.bundle?.payload?.github_author 
            || run.stages?.[0]?.github_author 
            || run.stages?.[0]?.payload?.github_author 
            || null;

        const inferenceToolVal = run.inference_tool 
            || run.payload?.inference_tool 
            || run.stages?.[0]?.inference_tool 
            || null;

        const inferenceToolVersionVal = run.inference_tool_version 
            || run.payload?.inference_tool_version 
            || run.stages?.[0]?.inference_tool_version 
            || null;

        const manifestsVal = run.manifests 
            || run.payload?.manifests 
            || run.bundle?.payload?.manifests 
            || null;

        const evidenceVal = run.evidence 
            || run.payload?.evidence 
            || run.bundle?.payload?.evidence 
            || null;

        return {
            id: Math.random().toString(36).substring(7),
            dirKey: run.runId,
            name: run.runLabel,
            stageFiles,
            metadataFiles,
            payload: {
                ...(run.payload || {}),
                runId: run.runId,
                runLabel: run.runLabel,
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
                well_lit_path: run.wellLitPath || run.well_lit_path || null,
                ...(forkedFromVal ? { forked_from: forkedFromVal } : {}),
                ...(githubAuthorVal ? { github_author: githubAuthorVal } : {}),
                ...(inferenceToolVal ? { inference_tool: inferenceToolVal } : {}),
                ...(inferenceToolVersionVal ? { inference_tool_version: inferenceToolVersionVal } : {}),
                ...(manifestsVal ? { manifests: manifestsVal } : {}),
                ...(evidenceVal ? { evidence: evidenceVal } : {})
            },
            validation: bundleValidation,
            isExpanded: true,
            isSkipped: false,
            targetDashboards: run.targetDashboards || ['performance-browser']
        };
    }, []);

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

    const handleEditStagedRun = React.useCallback((run, runId) => {
        if (!run) {
            console.warn('No staged run found for runId', runId);
            setToastMessage('Could not open this benchmark for editing.');
            setShowToast(true);
            return;
        }

        const bundle = buildBundleForRun(run);

        try {
            localStorage.setItem('prism_active_staged_bundles', JSON.stringify([bundle]));
            localStorage.setItem('prism_upload_wizard_step', '2');
            localStorage.setItem('prism_submit_intent', 'stage-locally');
        } catch (e) {
            console.error('Failed to set wizard state in localStorage:', e);
        }

        onOpenSubmitDialog && onOpenSubmitDialog('stage-locally');
    }, [buildBundleForRun, onOpenSubmitDialog]);

    const handleEditSelected = React.useCallback(() => {
        if (selectedStagedRuns.length === 0) return;

        const bundles = selectedStagedRuns.map(buildBundleForRun);

        try {
            localStorage.setItem('prism_active_staged_bundles', JSON.stringify(bundles));
            localStorage.setItem('prism_upload_wizard_step', '2');
            localStorage.setItem('prism_submit_intent', 'stage-locally');
        } catch (e) {
            console.error('Failed to set wizard state in localStorage:', e);
        }

        onOpenSubmitDialog && onOpenSubmitDialog('stage-locally');
    }, [selectedStagedRuns, buildBundleForRun, onOpenSubmitDialog]);

    const handleSubmitStagedRunForReview = React.useCallback((run, runId) => {
        if (!run) {
            console.warn('No staged run found for runId', runId);
            setToastMessage('Could not submit this benchmark for review.');
            setShowToast(true);
            return;
        }

        const bundle = buildBundleForRun(run);

        try {
            localStorage.setItem('prism_active_staged_bundles', JSON.stringify([bundle]));
            localStorage.setItem('prism_upload_wizard_step', '2');
            localStorage.setItem('prism_submit_intent', 'submit-review');
        } catch (e) {
            console.error('Failed to set wizard state in localStorage:', e);
        }

        onOpenSubmitDialog && onOpenSubmitDialog('submit-review');
    }, [buildBundleForRun, onOpenSubmitDialog]);

    const [showPostForkModal, setShowPostForkModal] = useState(false);
    const [lastForkedCount, setLastForkedCount] = useState(1);
    const [metadataModalRun, setMetadataModalRun] = useState(null);

    const handleForkSingle = React.useCallback(async (stat, benchmarkData) => {
        try {
            const { bundle, newRunId } = forkBenchmark(stat, benchmarkData);
            if (dashboardData?.handleValidatedUpload) {
                await dashboardData.handleValidatedUpload([bundle]);
            } else if (props.handleValidatedUpload) {
                await props.handleValidatedUpload([bundle]);
            }

            const stagedKey = `brv02:${newRunId || bundle.payload?.runId}`;
            if (setSelectedBenchmarks) {
                setSelectedBenchmarks(new Set([stagedKey]));
            }
            if (setKpiFilter) {
                setKpiFilter('staged');
            }

            setLastForkedCount(1);
            setShowPostForkModal(true);

            const msg = "Benchmark successfully forked into local staging.";
            if (addToast) addToast(msg, 'success');
            else if (dashboardData?.addToast) dashboardData.addToast(msg, 'success');
        } catch (err) {
            console.error("Failed to fork benchmark:", err);
            const errMsg = "Failed to fork benchmark: " + (err.message || err);
            if (addToast) addToast(errMsg, 'error');
            else if (dashboardData?.addToast) dashboardData.addToast(errMsg, 'error');
            else alert(errMsg);
        }
    }, [dashboardData, props, addToast, setSelectedBenchmarks, setKpiFilter]);

    const handleBulkForkSelected = React.useCallback(async () => {
        if (!selectedBenchmarks || selectedBenchmarks.size === 0) return;

        try {
            const bundles = [];
            const newKeys = new Set();
            for (const key of selectedBenchmarks) {
                const stat = modelStats.find(s => s.benchmarkKey === key);
                if (stat) {
                    const { bundle, newRunId } = forkBenchmark(stat, stat.data || []);
                    bundles.push(bundle);
                    newKeys.add(`brv02:${newRunId || bundle.payload?.runId}`);
                }
            }

            if (bundles.length === 0) {
                const warnMsg = "No valid benchmarks found to fork.";
                if (addToast) addToast(warnMsg, 'warning');
                else if (dashboardData?.addToast) dashboardData.addToast(warnMsg, 'warning');
                return;
            }

            if (dashboardData?.handleValidatedUpload) {
                await dashboardData.handleValidatedUpload(bundles);
            } else if (props.handleValidatedUpload) {
                await props.handleValidatedUpload(bundles);
            }

            if (setSelectedBenchmarks) {
                setSelectedBenchmarks(newKeys);
            }
            if (setKpiFilter) {
                setKpiFilter('staged');
            }

            setLastForkedCount(bundles.length);
            setShowPostForkModal(true);

            const msg = `Successfully forked ${bundles.length} benchmark${bundles.length > 1 ? 's' : ''} into local staging.`;
            if (addToast) addToast(msg, 'success');
            else if (dashboardData?.addToast) dashboardData.addToast(msg, 'success');
        } catch (err) {
            console.error("Failed to bulk fork benchmarks:", err);
            const errMsg = "Failed to bulk fork benchmarks: " + (err.message || err);
            if (addToast) addToast(errMsg, 'error');
            else if (dashboardData?.addToast) dashboardData.addToast(errMsg, 'error');
            else alert(errMsg);
        }
    }, [selectedBenchmarks, modelStats, dashboardData, props, addToast, setSelectedBenchmarks, setKpiFilter]);


    const drawerMetricAvailability = React.useMemo(() => {
        const dataToCheck = drawerFilteredData || [];
        
        const hasNtpot = dataToCheck.some(d => d.metrics?.ntpot != null);
        const hasTtft = dataToCheck.some(d => d.metrics?.ttft?.mean != null || d.ttft?.mean != null);
        const hasTokensPerSec = dataToCheck.some(d => d.tokens_per_second != null);
        const hasItl = dataToCheck.some(d => d.metrics?.itl != null || d.itl != null);
        
        const hasInput = dataToCheck.length > 0 && dataToCheck.every(d => d.throughput <= 0 || (d.metrics?.input_tput || 0) > 0);
        const hasTotal = dataToCheck.length > 0 && dataToCheck.every(d => d.throughput <= 0 || (d.metrics?.total_tput || 0) > 0);
        const hasQPS = dataToCheck.length > 0 && dataToCheck.every(d => d.throughput <= 0 || (d.qps || d.metrics?.request_rate || 0) > 0);
        const hasCost = dataToCheck.some(d => d.metrics?.cost && (
            (d.metrics.cost.spot || 0) > 0 ||
            (d.metrics.cost.on_demand || 0) > 0 ||
            (d.metrics.cost.cud_1y || 0) > 0 ||
            (d.metrics.cost.cud_3y || 0) > 0
        ));
        
        return { 
            ntpot: hasNtpot, 
            ttft: hasTtft, 
            tokens_per_sec: hasTokensPerSec, 
            itl: hasItl,
            input: hasInput,
            total: hasTotal,
            qps: hasQPS,
            cost: hasCost,
            stage: true
        };
    }, [drawerFilteredData]);

    // Uploads and scanned runs share the brv02: prefix, so the prefix alone cannot
    // gate deletion. A run still backed by a file is not deletable here: the next
    // scan would bring it straight back.
    const isDeletableStagedRun = React.useCallback((stat) => {
        const sourceStr = stat?.data?.[0]?.source || '';
        if (!sourceStr.startsWith('brv02:')) return false;
        const runId = sourceStr.replace('brv02:', '');
        const run = brv02Runs?.find(r => r.runId === runId);
        return !isFileBackedRun(run, scannedFilenames);
    }, [brv02Runs, scannedFilenames]);

    const localSelectedCount = React.useMemo(() => {
        let count = 0;
        selectedBenchmarks.forEach(key => {
            const stat = modelStats.find(s => s.benchmarkKey === key);
            if (isDeletableStagedRun(stat)) count++;
        });
        return count;
    }, [selectedBenchmarks, modelStats, isDeletableStagedRun]);

    const hasLocalSelected = localSelectedCount > 0;

    const hasAnyLocalRuns = React.useMemo(() => {
        return modelStats.some(isDeletableStagedRun);
    }, [modelStats, isDeletableStagedRun]);

    const handleDeleteSelected = () => {
        if (!removeBrv02Run) return;
        if (localSelectedCount === 0) return;

        const confirmMsg = localSelectedCount === 1 
            ? "Are you sure you want to permanently delete this staged run from your local view?"
            : `Are you sure you want to permanently delete these ${localSelectedCount} staged runs from your local view?`;

        if (!window.confirm(confirmMsg)) return;

        selectedBenchmarks.forEach(key => {
            const stat = modelStats.find(s => s.benchmarkKey === key);
            if (isDeletableStagedRun(stat)) {
                const runId = stat.data[0].source.replace('brv02:', '');
                if (runId) removeBrv02Run(runId);
            }
        });
        lastSelectedKeyRef.current = null;
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
            let vStartX;
            let vStartY;

            if (clickedCheckboxEl.current && clickedCheckboxEl.current.isConnected) {
                const cbRect = clickedCheckboxEl.current.getBoundingClientRect();
                vStartX = cbRect.left + clickedCheckboxOffset.current.x;
                vStartY = cbRect.top + clickedCheckboxOffset.current.y;
            } else {
                const container = scrollContainerRef.current;
                const currentScrollX = container === window ? window.scrollX : container?.scrollLeft || 0;
                const currentScrollY = container === window ? window.scrollY : container?.scrollTop || 0;
                const deltaX = currentScrollX - initialScrollPos.current.x;
                const deltaY = currentScrollY - initialScrollPos.current.y;
                vStartX = dragStartClientPos.current.x - deltaX;
                vStartY = dragStartClientPos.current.y - deltaY;
            }

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

        const EDGE_THRESHOLD = 80;
        const MAX_SPEED = 25;

        const autoScrollAndSelect = () => {
            const container = scrollContainerRef.current;
            let containerTop = 0;
            let containerBottom = window.innerHeight;

            if (container && container !== window) {
                const containerRect = container.getBoundingClientRect();
                containerTop = containerRect.top;
                containerBottom = containerRect.bottom;
            }

            const currentY = lastPointerPos.current.y;
            let scrollDeltaY = 0;

            if (currentY > containerBottom - EDGE_THRESHOLD) {
                const distance = currentY - (containerBottom - EDGE_THRESHOLD);
                const intensity = Math.min(1, Math.max(0, distance / EDGE_THRESHOLD));
                scrollDeltaY = intensity * MAX_SPEED;
            } else if (currentY < containerTop + EDGE_THRESHOLD) {
                const distance = (containerTop + EDGE_THRESHOLD) - currentY;
                const intensity = Math.min(1, Math.max(0, distance / EDGE_THRESHOLD));
                scrollDeltaY = -intensity * MAX_SPEED;
            }

            if (scrollDeltaY !== 0) {
                if (!container || container === window) {
                    window.scrollBy(0, scrollDeltaY);
                    if (document.documentElement) {
                        document.documentElement.scrollTop += scrollDeltaY;
                    }
                } else {
                    container.scrollTop += scrollDeltaY;
                }
            }

            updateDragSelection();
            animFrameRef.current = requestAnimationFrame(autoScrollAndSelect);
        };

        animFrameRef.current = requestAnimationFrame(autoScrollAndSelect);

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
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
            }
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
        window.addEventListener('scroll', handleScroll, { capture: true, passive: true });

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
            window.removeEventListener('scroll', handleScroll, { capture: true });
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
            }
        };
    }, [isDraggingSelection, setSelectedBenchmarks]);

    const getScrollContainer = (el) => {
        let current = el?.parentElement;
        while (current && current !== document.body && current !== document.documentElement) {
            const style = window.getComputedStyle(current);
            const hasOverflow = style.overflowY === 'auto' || style.overflowY === 'scroll';
            const canScroll = current.scrollHeight - current.clientHeight > 5;
            if (hasOverflow && canScroll) {
                return current;
            }
            current = current.parentElement;
        }
        return window;
    };

    const handleCheckboxPointerDown = (e, key, isCurrentlySelected) => {
        // Only trigger on left mouse button or touch
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const cbEl = e.currentTarget;
        const cbRect = cbEl.getBoundingClientRect();

        clickedCheckboxEl.current = cbEl;
        clickedCheckboxOffset.current = { x: e.clientX - cbRect.left, y: e.clientY - cbRect.top };
        dragStartClientPos.current = { x: e.clientX, y: e.clientY };
        lastPointerPos.current = { x: e.clientX, y: e.clientY };

        const container = getScrollContainer(cbEl);
        scrollContainerRef.current = container;
        initialScrollPos.current = {
            x: container === window ? window.scrollX : container.scrollLeft,
            y: container === window ? window.scrollY : container.scrollTop
        };

        setDragBox({
            startX: e.clientX,
            startY: e.clientY,
            currentX: e.clientX,
            currentY: e.clientY
        });

        const isShift = e.shiftKey;

        // Shift + Click Range Selection (relative to last selected item)
        if (isShift && lastSelectedKeyRef.current) {
            const lastIdx = visibleStatsList.findIndex(s => s.benchmarkKey === lastSelectedKeyRef.current);
            const targetIdx = visibleStatsList.findIndex(s => s.benchmarkKey === key);

            if (lastIdx !== -1 && targetIdx !== -1) {
                const startIdx = Math.min(lastIdx, targetIdx);
                const endIdx = Math.max(lastIdx, targetIdx);
                const rangeKeys = visibleStatsList.slice(startIdx, endIdx + 1).map(s => s.benchmarkKey);

                const willSelect = !isCurrentlySelected;
                const newSelected = new Set(selectedBenchmarks);
                if (willSelect) {
                    rangeKeys.forEach(k => newSelected.add(k));
                } else {
                    rangeKeys.forEach(k => newSelected.delete(k));
                }

                lastSelectedKeyRef.current = key;
                initialSelection.current = new Set(newSelected);
                dragActionSelect.current = willSelect;
                setSelectedBenchmarks(newSelected);
                setIsDraggingSelection(true);
                return;
            }
        }

        // Single click (or Shift + Click when no previous item exists)
        const willSelect = !isCurrentlySelected;
        dragActionSelect.current = willSelect;
        lastSelectedKeyRef.current = key;

        let newSelected = new Set(selectedBenchmarks);
        if (willSelect) {
            newSelected.add(key);
        } else {
            newSelected.delete(key);
        }

        initialSelection.current = new Set(newSelected);
        setSelectedBenchmarks(newSelected);
        setIsDraggingSelection(true);
    };



    const showSelectedOnly = hideShowSelectedOnly ? false : propShowSelectedOnly;

    const toggleBaseline = (key) => {
        if (!setBaselineBenchmarkKey) return;
        setBaselineBenchmarkKey(prev => (prev === key ? null : key));
    };

    const clearFilters = () => {
        lastSelectedKeyRef.current = null;
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
        lastSelectedKeyRef.current = null;
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

        // Default Public Store view (kpiFilter === null)
        if (kpiFilter === null) {
            if (!includeUnlisted) {
                stats = stats.filter(stat => {
                    const firstEntry = stat.data?.[0];
                    if (!firstEntry) return true;
                    const src = firstEntry.source || '';
                    const isBrv02 = src.startsWith('brv02:') || firstEntry.source_info?.type === 'benchmark_report_v02';
                    if (!isBrv02) return true;
                    const runId = src.startsWith('brv02:') ? src.replace('brv02:', '') : firstEntry.run_id;
                    const sub = runId && submissionsMap ? submissionsMap[runId] : null;
                    const status = sub?.status || firstEntry.source_info?.submission_state;
                    return status !== 'unlisted';
                });
            }
        }

        // Apply KPI Filter
        if (kpiFilter === 'my-submissions') {
            stats = stats.filter(stat => {
                const firstEntry = stat.data?.[0];
                if (!firstEntry) return false;
                const src = firstEntry.source || '';
                const isBrv02 = src.startsWith('brv02:') || firstEntry.source_info?.type === 'benchmark_report_v02';
                if (!isBrv02) return false;
                if (isPlaygroundMode) {
                    const runId = src.startsWith('brv02:') ? src.replace('brv02:', '') : firstEntry.run_id;
                    const sub = runId && submissionsMap ? submissionsMap[runId] : null;
                    const status = sub?.status || firstEntry.source_info?.submission_state || 'staged';
                    return status !== 'public' && status !== 'promoted' && status !== 'approved';
                }
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
                const isMine = isPlaygroundMode ? true : (src.startsWith('brv02:') || (user && firstEntry.github_author?.username === user.username));
                const runId = src.startsWith('brv02:') ? src.replace('brv02:', '') : firstEntry.run_id;
                const sub = runId && submissionsMap ? submissionsMap[runId] : null;
                const status = sub?.status || firstEntry.source_info?.submission_state || 'staged';
                return isMine && status === 'staged';
            });
        } else if (kpiFilter === 'unlisted') {
            // Filter inside My Benchmarks: filter user's submissions strictly for unlisted status
            stats = stats.filter(stat => {
                const firstEntry = stat.data?.[0];
                if (!firstEntry) return false;
                const src = firstEntry.source || '';
                const isBrv02 = src.startsWith('brv02:') || firstEntry.source_info?.type === 'benchmark_report_v02';
                if (!isBrv02) return false;
                const isMine = isPlaygroundMode ? true : (src.startsWith('brv02:') || (user && firstEntry.github_author?.username === user.username));
                const runId = src.startsWith('brv02:') ? src.replace('brv02:', '') : firstEntry.run_id;
                const sub = runId && submissionsMap ? submissionsMap[runId] : null;
                const status = sub?.status || firstEntry.source_info?.submission_state || 'staged';
                return isMine && status === 'unlisted';
            });
        } else if (kpiFilter === 'processing') {
            stats = stats.filter(stat => {
                const firstEntry = stat.data?.[0];
                if (!firstEntry) return false;
                const src = firstEntry.source || '';
                const isBrv02 = src.startsWith('brv02:') || firstEntry.source_info?.type === 'benchmark_report_v02';
                if (!isBrv02) return false;
                const isMine = isPlaygroundMode ? true : (src.startsWith('brv02:') || (user && firstEntry.github_author?.username === user.username));
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
                const isMine = isPlaygroundMode ? true : (src.startsWith('brv02:') || (user && firstEntry.github_author?.username === user.username));
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
                const isMine = isPlaygroundMode ? true : (src.startsWith('brv02:') || (user && firstEntry.github_author?.username === user.username));
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
                const isMine = isPlaygroundMode ? true : (src.startsWith('brv02:') || (user && firstEntry.github_author?.username === user.username));
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

        // Apply Text Search Term Filter with globbing (* and ?)
        if (searchTerm && searchTerm.trim()) {
            const matcher = createGlobMatcher(searchTerm);
            stats = stats.filter(stat => matchesBenchmarkStat(stat, matcher));
        }

        return stats;
    }, [modelStats, showSelectedOnly, selectedBenchmarks, kpiFilter, includeUnlisted, searchTerm, paretoKeys, baselineBenchmarkKey, submissionsMap, user, isPlaygroundMode]);

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

    const visibleStatsList = React.useMemo(() => {
        return Object.values(groupedStats).flat();
    }, [groupedStats]);

    const selectAllVisible = () => {
        const allVisible = new Set(sortedStats.map(s => s.benchmarkKey));
        lastSelectedKeyRef.current = null;
        setSelectedBenchmarks(allVisible);
    };

    const invertSelected = () => {
        const inverted = new Set(sortedStats.map(s => s.benchmarkKey).filter(k => !selectedBenchmarks.has(k)));
        lastSelectedKeyRef.current = null;
        setSelectedBenchmarks(inverted);
    };

    const clearSelected = () => {
        lastSelectedKeyRef.current = null;
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

    const onlyRejectedSelected = React.useMemo(() => {
        if (selectedBenchmarks.size === 0) return false;
        return Array.from(selectedBenchmarks).every(key => {
            const stat = modelStats.find(s => s.benchmarkKey === key);
            const firstEntry = stat?.data?.[0];
            if (!firstEntry) return false;
            const src = firstEntry.source || '';
            const runId = src.startsWith('brv02:') ? src.replace('brv02:', '') : firstEntry.run_id;
            const sub = submissionsMap ? submissionsMap[runId] : null;
            const status = sub?.status || firstEntry.source_info?.submission_state || 'staged';
            return status === 'rejected';
        });
    }, [selectedBenchmarks, modelStats, submissionsMap]);

    const handleBulkDeleteRejected = async () => {
        if (selectedBenchmarks.size === 0) return;
        if (!confirm(`Are you sure you want to permanently delete the ${selectedBenchmarks.size} selected rejected benchmarks from the Results Store? This action cannot be undone.`)) {
            return;
        }

        const runIds = Array.from(selectedBenchmarks).map(key => {
            const stat = modelStats.find(s => s.benchmarkKey === key);
            const firstEntry = stat?.data?.[0];
            const src = firstEntry?.source || '';
            return src.startsWith('brv02:') ? src.replace('brv02:', '') : firstEntry?.run_id;
        }).filter(Boolean);

        if (deleteSubmission) {
            for (let i = 0; i < runIds.length; i++) {
                const isLast = i === runIds.length - 1;
                await deleteSubmission(runIds[i], isLast);
            }
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
                    title: isPlaygroundMode ? 'No pending benchmarks found' : 'No submitted benchmarks found',
                    description: isPlaygroundMode 
                        ? 'There are currently no benchmark runs in pending, staged, or review states.'
                        : "You have not submitted any benchmark runs to the Results store yet. Staged and submitted benchmarks will appear here.",
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
                        <Button variant="secondary" size="sm" className="mb-2" onClick={clearFilters}>
                            Clear filters
                        </Button>
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
                        <Button variant="secondary" size="sm" className="mb-2" onClick={clearFilters}>
                            Clear filters
                        </Button>
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
                        <Button variant="secondary" size="sm" className="mb-2" onClick={clearFilters}>
                            Clear filters
                        </Button>
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
                        <Button variant="secondary" size="sm" className="mb-2" onClick={clearFilters}>
                            Clear filters
                        </Button>
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
                        <Button variant="secondary" size="sm" className="mb-2" onClick={clearFilters}>
                            Clear filters
                        </Button>
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
                        <Button variant="secondary" size="sm" className="mb-2" onClick={clearFilters}>
                            Clear filters
                        </Button>
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
                        <Button variant="secondary" size="sm" className="mb-2" onClick={clearFilters}>
                            Clear filters
                        </Button>
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
                        <Button variant="secondary" size="sm" className="mb-2" onClick={clearFilters}>
                            Clear filters
                        </Button>
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
                                <span className={cn(
                                    'text-[9px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full border flex items-center gap-1.5 transition-all select-none',
                                    kpiFilter === 'my-submissions' ? 'bg-cyan-550/10 text-cyan-400 border-cyan-550/20 shadow-[0_0_10px_rgba(6,182,212,0.15)]' :
                                    kpiFilter === 'verified' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' :
                                    kpiFilter === 'action' ? 'bg-red-500/10 text-red-400 border-red-500/25' :
                                    kpiFilter === 'staged' ? 'bg-amber-500/10 text-amber-400 border-amber-500/25' :
                                    kpiFilter === 'in_review' ? 'bg-purple-500/10 text-purple-400 border-purple-500/25' :
                                    kpiFilter === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' :
                                    kpiFilter === 'legacy' ? 'bg-slate-800 border-slate-700 text-slate-400' :
                                    kpiFilter === 'pareto' ? 'bg-purple-500/10 text-purple-400 border-purple-500/25' :
                                    kpiFilter === 'regressions' ? 'bg-amber-500/10 text-amber-400 border-amber-500/25' : 'bg-slate-800/60 text-slate-400 border-slate-700'
                                )}>
                                    <span>{getKpiFilterLabel(kpiFilter, isPlaygroundMode)}</span>
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
                                        className={cn('w-9 h-5 rounded-full relative transition-colors shadow-inner cursor-pointer', showSelectedOnly ? 'bg-cyan-500' : 'bg-slate-950 border border-slate-800')}
                                    >
                                        <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200', showSelectedOnly ? 'translate-x-4.5 left-0.5' : 'translate-x-0 left-0.5')} />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {loadAllData && (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => loadAllData(null, true)}
                                isLoading={loadingConnections}
                                title="Refetch all configured buckets and APIs"
                            >
                                {!loadingConnections && <RotateCcw size={12} />}
                                <span>Refetch Database</span>
                            </Button>
                        )}
                        {sortedStats.length > 0 && (
                            <Button variant="secondary" size="sm" onClick={selectAllVisible}>
                                Select All Visible
                            </Button>
                        )}
                        {isFiltered && (
                            <Button variant="secondary" size="sm" onClick={clearFilters}>
                                Clear Filters
                            </Button>
                        )}
                    </div>
                </div>
            ) : (
                /* Selected State: Sticky context toolbar with primary actions */
                <div
                    ref={selectionBarRef}
                    className={cn(
                        "sticky top-[72px] z-40 transition-all duration-150 ease-out select-none flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-4 py-2.5 rounded-2xl border min-h-[52px]",
                        isStuck
                            ? "bg-slate-950/95 backdrop-blur-2xl border-cyan-400/80 scale-[1.015] shadow-[0_8px_20px_rgba(0,0,0,0.4),0_0_12px_rgba(6,182,212,0.15)]"
                            : "bg-slate-950/85 backdrop-blur-xl border-cyan-500/60 hover:border-cyan-400/80 scale-100 shadow-md"
                    )}
                >
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-cyan-400">
                            {selectedBenchmarks.size} {selectedBenchmarks.size === 1 ? 'Benchmark' : 'Benchmarks'} Selected
                        </span>
                        <button
                            onClick={clearSelected}
                            className="text-xs text-slate-400 hover:text-slate-200 transition-colors underline cursor-pointer font-medium"
                        >
                            Unselect all
                        </button>
                        <span className="text-slate-600 text-xs select-none">•</span>
                        <button
                            onClick={invertSelected}
                            className="text-xs text-slate-400 hover:text-slate-200 transition-colors underline cursor-pointer font-medium"
                        >
                            Invert selection
                        </button>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-wrap">
                        {isAdmin && onlyPendingReviewSelected && (
                            <>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => handleActionClick(handleBulkApprove)}
                                    disabled={isLoadingSubmissions || isLocalActionPending}
                                >
                                    <Check className="w-3.5 h-3.5 stroke-[3]" /> Approve ({selectedBenchmarks.size})
                                </Button>
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => handleActionClick(handleBulkReject)}
                                    disabled={isLoadingSubmissions || isLocalActionPending}
                                >
                                    <X className="w-3.5 h-3.5" /> Reject ({selectedBenchmarks.size})
                                </Button>
                            </>
                        )}

                        {isAdmin && onlyRejectedSelected && (
                            <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleActionClick(handleBulkDeleteRejected)}
                                disabled={isLoadingSubmissions || isLocalActionPending}
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedBenchmarks.size})
                            </Button>
                        )}

                        {/* Compare Selected Button */}
                        <button
                            id="top-compare-publish-btn"
                            onClick={() => sortedStats.length > 0 && setShowComparisonDrawer(true)}
                            className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_0_15px_rgba(34,211,238,0.4)] flex items-center gap-1.5 transition-all duration-300 hover:scale-105 cursor-pointer whitespace-nowrap"
                        >
                            {hasPromotableSelected ? `Compare & Promote (${selectedBenchmarks.size})` : `Compare & Inspect (${selectedBenchmarks.size})`}
                        </button>

                        {/* Fork Selected Benchmarks */}
                        <div className="relative group/fork-selected-btn">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleActionClick(handleBulkForkSelected)}
                                disabled={selectedBenchmarks.size === 0 || isLocalActionPending}
                                className="gap-1.5"
                            >
                                <GitFork className="w-3.5 h-3.5" />
                                <span>Fork ({selectedBenchmarks.size})</span>
                            </Button>
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-slate-900 border border-slate-800 text-slate-350 text-xs font-medium rounded-xl opacity-0 invisible group-hover/fork-selected-btn:opacity-100 group-hover/fork-selected-btn:visible transition-all duration-200 shadow-2xl z-[9999] w-64 pointer-events-none leading-relaxed text-center normal-case tracking-normal animate-in fade-in slide-in-from-top-2 duration-150">
                                Clone selected benchmarks into local staging to modify, coalesce, or republish.
                            </div>
                        </div>

                        {/* Copy Link Button */}
                        <div className="relative group/share-link">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleCopyShareLink}
                                disabled={!canShare}
                                className={cn("gap-1.5", !canShare && "opacity-50 cursor-not-allowed")}
                            >
                                <Share2 size={12} />
                                <span>Share Link</span>
                            </Button>
                            {!canShare && shareForbiddenReason && (
                                <div className="absolute right-0 top-full mt-2 px-3 py-2 bg-slate-900 border border-slate-800 text-slate-350 text-xs font-medium rounded-xl opacity-0 invisible group-hover/share-link:opacity-100 group-hover/share-link:visible transition-all duration-200 shadow-2xl z-[9999] w-64 pointer-events-none leading-relaxed text-center normal-case tracking-normal animate-in fade-in slide-in-from-top-2 duration-150">
                                    {shareForbiddenReason}
                                </div>
                            )}
                        </div>

                        {/* Edit Selected Staged Runs */}
                        {hasAnyLocalRuns && (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleEditSelected}
                                disabled={selectedStagedRuns.length === 0}
                                title={selectedStagedRuns.length === 0 ? "Select staged benchmarks to edit" : "Edit selected staged benchmarks"}
                            >
                                <Pencil className="w-3.5 h-3.5" /> Edit Selected
                            </Button>
                        )}



                        {/* Delete Staged Runs */}
                        {hasAnyLocalRuns && (
                            <Button
                                variant="danger"
                                size="sm"
                                onClick={handleDeleteSelected}
                                disabled={localSelectedCount === 0}
                            >
                                Delete Staged ({localSelectedCount})
                            </Button>
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
                                <div className={cn('absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96', emptyConfig.radialGlow, 'rounded-full blur-3xl pointer-events-none')} />
                                <div className={cn('w-16 h-16 rounded-3xl flex items-center justify-center mb-5', emptyConfig.glowClass)}>
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
                                        <div className={cn(
                                            'w-4 h-4 rounded-full flex items-center justify-center border transition-all',
                                            isAllSelected ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                                        )}>
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
                                    return (
                                        <BenchmarkRow
                                            key={stat.benchmarkKey || stat.model}
                                            stat={stat}
                                            isSelected={isSelected}
                                            isExpanded={isExpanded}
                                            isBaseline={isBaseline}
                                            user={user}
                                            isAdmin={isAdmin}
                                            isPlaygroundMode={isPlaygroundMode}
                                            submissionsMap={submissionsMap}
                                            brv02Runs={brv02Runs}
                                            visibleSpecs={visibleSpecs}
                                            isLoadingSubmissions={isLoadingSubmissions}
                                            isLocalActionPending={isLocalActionPending}
                                            rejectingRunId={rejectingRunId}
                                            rejectionFeedback={rejectionFeedback}
                                            setRejectingRunId={setRejectingRunId}
                                            setRejectionFeedback={setRejectionFeedback}
                                            activeExtraFilesPopoverRunId={activeExtraFilesPopoverRunId}
                                            setActiveExtraFilesPopoverRunId={setActiveExtraFilesPopoverRunId}
                                            extraFilesPopoverRef={extraFilesPopoverRef}
                                            setInspectFileModalState={setInspectFileModalState}
                                            setViewingPayloadRun={setViewingPayloadRun}
                                            setRawYamlContent={setRawYamlContent}
                                            setRawYamlTitle={setRawYamlTitle}
                                            handleSubmitStagedRunForReview={handleSubmitStagedRunForReview}
                                            handleActionClick={handleActionClick}
                                            updateSubmissionStatus={updateSubmissionStatus}
                                            deleteSubmission={deleteSubmission}
                                            toggleModelExpansion={toggleModelExpansion}
                                            handleCheckboxPointerDown={handleCheckboxPointerDown}
                                            brv02CustomLabels={brv02CustomLabels}
                                            handleEditStagedRun={handleEditStagedRun}
                                            handleForkSingle={handleForkSingle}
                                            onOpenMetadataModal={(s, d) => setMetadataModalRun({ stat: s, data: d })}
                                            defaultSources={defaultSources}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                        );
                    })
                )}
                </div>
            </div>
            {dragBox && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        left: Math.min(dragBox.startX, dragBox.currentX),
                        top: Math.min(dragBox.startY, dragBox.currentY),
                        width: Math.abs(dragBox.currentX - dragBox.startX),
                        height: Math.abs(dragBox.currentY - dragBox.startY),
                        pointerEvents: 'none',
                        zIndex: 99999,
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        border: '1.5px solid rgba(59, 130, 246, 0.6)',
                        borderRadius: '2px',
                        boxSizing: 'border-box'
                    }}
                />,
                document.body
            )}
            {rawYamlContent !== null && createPortal(
                <Modal
                    isOpen
                    onClose={() => setRawYamlContent(null)}
                    title={`Raw Report: ${rawYamlTitle}`}
                    className="max-w-3xl"
                    footer={
                        <div className="flex items-center gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                    try {
                                        downloadSingleStageYaml(rawYamlContent, rawYamlTitle);
                                    } catch (err) {
                                        console.error("Failed to download stage YAML:", err);
                                        alert("Failed to download stage YAML: " + (err.message || err));
                                    }
                                }}
                                className="flex items-center gap-1.5"
                            >
                                <Download size={13} /> Download YAML
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setRawYamlContent(null)}>
                                Close
                            </Button>
                        </div>
                    }
                >
                    <div className="font-mono text-xs select-all whitespace-pre-wrap">
                        {rawYamlContent}
                    </div>
                </Modal>,
                document.body
            )}

            {/* Raw Payload Manifest Modal */}
            {viewingPayloadRun && createPortal(
                <Modal
                    isOpen
                    onClose={() => setViewingPayloadRun(null)}
                    title={
                        <span className="flex items-center gap-2">
                            <Code2 className="w-5 h-5 text-cyan-400" />
                            Raw Manifest Payload (YAML): {viewingPayloadRun.benchmarkKey || viewingPayloadRun.model || 'Configuration'}
                        </span>
                    }
                    className="max-w-4xl"
                    footer={
                        <div className="flex items-center gap-2">
                            {(() => {
                                const isViewBrv02 =
                                    viewingPayloadRun?.payload?.format === 'brv02' ||
                                    viewingPayloadRun?.source?.startsWith('brv02:') ||
                                    viewingPayloadRun?.data?.[0]?.source_info?.type === 'benchmark_report_v02' ||
                                    viewingPayloadRun?.data?.[0]?.source?.startsWith('brv02:');

                                return isViewBrv02 ? (
                                    <button
                                        onClick={() => {
                                            try {
                                                downloadRunBRV02(viewingPayloadRun);
                                            } catch (err) {
                                                console.error("Failed to download BRV0.2:", err);
                                                alert("Failed to download benchmark: " + (err.message || err));
                                            }
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-colors cursor-pointer"
                                    >
                                        <Download className="w-3.5 h-3.5" /> Download BRV0.2
                                    </button>
                                ) : null;
                            })()}
                            <button
                                onClick={() => {
                                    try {
                                        const dataToDump = getRawPrismCloudPayload(viewingPayloadRun);
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
                        </div>
                    }
                >
                    <pre className="m-0 p-4 font-mono text-xs leading-relaxed whitespace-pre overflow-scroll regular-scrollbar max-h-[65vh] bg-slate-950 text-slate-200 border border-slate-800 rounded-lg select-text">
                        {(() => {
                            try {
                                const dataToDump = getRawPrismCloudPayload(viewingPayloadRun);
                                return yaml.dump(dataToDump, { noRefs: true });
                            } catch (err) {
                                console.error("Failed to dump to YAML:", err);
                                return "Error rendering YAML.";
                            }
                        })()}
                    </pre>
                </Modal>,
                document.body
            )}

            {/* Individual Attached File Inspection Modal */}
            {inspectFileModalState.isOpen && createPortal(
                <Modal
                    isOpen
                    onClose={() => setInspectFileModalState({ isOpen: false, filename: '', content: '' })}
                    title={
                        <span className="flex items-center gap-2 text-slate-100 font-semibold">
                            <FileText className="w-5 h-5 text-cyan-400" />
                            Inspect File: {inspectFileModalState.filename}
                        </span>
                    }
                    className="max-w-4xl"
                    footer={
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(inspectFileModalState.content);
                                alert('File content copied to clipboard');
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg transition-colors cursor-pointer"
                        >
                            <Copy className="w-3.5 h-3.5" /> Copy Content
                        </button>
                    }
                >
                    <pre className="m-0 p-4 font-mono text-xs leading-relaxed whitespace-pre overflow-scroll regular-scrollbar max-h-[65vh] bg-slate-950 text-slate-200 border border-slate-800 rounded-lg select-text">
                        {inspectFileModalState.content}
                    </pre>
                </Modal>,
                document.body
            )}

            {/* Post-Fork Educational Dialog */}
            {showPostForkModal && createPortal(
                <Modal
                    isOpen
                    onClose={() => setShowPostForkModal(false)}
                    title={
                        <span className="flex items-center gap-2 text-slate-100 font-semibold">
                            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                                <GitFork className="w-4 h-4" />
                            </div>
                            Benchmark{lastForkedCount > 1 ? 's' : ''} Forked to Local Staging
                        </span>
                    }
                    className="max-w-xl"
                    footer={
                        <div className="flex items-center justify-between w-full">
                            <div className="text-xs text-slate-400">
                                Ready to curate or coalesce.
                            </div>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => setShowPostForkModal(false)}
                                className="px-5 font-semibold bg-blue-600 hover:bg-blue-500 text-white"
                            >
                                Got it
                            </Button>
                        </div>
                    }
                >
                    <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
                        <p>
                            {lastForkedCount > 1 
                                ? `${lastForkedCount} benchmarks have been successfully copied into your browser's local staging workspace with fresh identifiers.`
                                : "The benchmark has been successfully copied into your browser's local staging workspace with a fresh identifier."}
                        </p>

                        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                            <div className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                                What you can do next
                            </div>
                            <ul className="space-y-2 text-xs text-slate-300">
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 font-bold">•</span>
                                    <span><strong>Edit Metadata:</strong> Adjust model names, tags, configurations, or hardware descriptions without modifying the original source.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 font-bold">•</span>
                                    <span><strong>Coalesce Stages:</strong> Combine disjoint multi-stage benchmark runs into unified performance curves.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-400 font-bold">•</span>
                                    <span><strong>Republish:</strong> Submit the refined benchmarks to your writable Results Store bucket with original author provenance preserved.</span>
                                </li>
                            </ul>
                        </div>

                        <p className="text-xs text-slate-400 italic">
                            Note: The forked run remains in your browser's local staging workspace until you submit it.
                        </p>
                    </div>
                </Modal>,
                document.body
            )}

            {/* Benchmark Run Metadata Dialog */}
            {metadataModalRun && createPortal(
                <Modal
                    isOpen
                    onClose={() => setMetadataModalRun(null)}
                    title={
                        <span className="flex items-center gap-2 text-slate-100 font-semibold">
                            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                                <Info className="w-4 h-4" />
                            </div>
                            <span>Benchmark Run Metadata</span>
                        </span>
                    }
                    className="max-w-2xl"
                    footer={
                        <div className="flex items-center justify-between w-full">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                    const runIdToCopy = metadataModalRun.data?.[0]?.run_id || metadataModalRun.stat?.runId || metadataModalRun.data?.[0]?.source_info?.run_id;
                                    if (runIdToCopy) {
                                        navigator.clipboard.writeText(runIdToCopy);
                                        const copyMsg = 'Run UUID copied to clipboard';
                                        if (addToast) addToast(copyMsg, 'info');
                                        else if (dashboardData?.addToast) dashboardData.addToast(copyMsg, 'info');
                                        else alert(copyMsg);
                                    }
                                }}
                                className="gap-1.5"
                            >
                                <Copy size={12} />
                                <span>Copy Run UUID</span>
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => setMetadataModalRun(null)}
                                className="px-5 font-semibold bg-cyan-600 hover:bg-cyan-500 text-white"
                            >
                                Close
                            </Button>
                        </div>
                    }
                >
                    {(() => {
                        const mStat = metadataModalRun.stat || metadataModalRun;
                        const mData = metadataModalRun.data || mStat.data || [];
                        const mFirst = mData[0] || {};
                        const mPayload = getRawPrismCloudPayload(mStat, mData);
                        const mSourceInfo = mFirst.source_info || {};
                        const mRunId = mFirst.run_id || mStat.runId || mPayload?.runId;
                        const mSourceStr = mFirst.source || mStat.source || "";
                        const mIsBrv02 = mSourceStr.startsWith("brv02:") || mFirst.source_info?.type === "benchmark_report_v02";
                        const mSub = mIsBrv02 && mRunId && submissionsMap ? submissionsMap[mRunId] : null;
                        const mStatus = mSub?.status || mSourceInfo.submission_state || mPayload?.submission_state || 'staged';
                        const mStatusDetails = getSubmissionStatusDetails(mStatus);
                        const mStatusTooltip = getStatusTooltipText(mStatus, mSub);

                        const mSubmittedAt = mSourceInfo.submitted_at || mFirst.timestamp || mStat.timestamp || mPayload?.submitted_at;
                        const mApprovedAt = mSourceInfo.approved_at || mPayload?.approved_at;
                        const mAuthorObj = mFirst.github_author || mStat.github_author || mPayload?.github_author || mSourceInfo.github_user;
                        const mAuthorUsername = typeof mAuthorObj === 'object' ? mAuthorObj?.username : (typeof mAuthorObj === 'string' ? mAuthorObj : null);
                        const mAuthorName = typeof mAuthorObj === 'object' ? mAuthorObj?.name : null;

                        const mForkedFrom = mPayload?.forked_from || mStat.payload?.forked_from || mStat.forked_from || mFirst.payload?.forked_from || mFirst.forked_from || mSub?.forked_from;
                        const mForkList = mForkedFrom ? (Array.isArray(mForkedFrom) ? mForkedFrom : [mForkedFrom]) : [];

                        const mSourceBucket = mSourceInfo.bucket || (mSourceStr.startsWith('gcs:') ? mSourceStr.split(':')[1] : (mSourceStr.startsWith('brv02:') ? 'Browser Local Staging' : mSourceStr)) || 'Unknown';

                        return (
                            <div className="space-y-4 text-xs font-sans text-slate-300">
                                {/* Header Summary Card */}
                                <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5">
                                    <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-semibold text-white truncate text-sm">
                                                {mStat.model || mPayload?.model_name || 'Benchmark Run'}
                                            </span>
                                            {mStat.hardware && (
                                                <span className="text-slate-400 font-mono text-[11px] bg-slate-800/80 px-1.5 py-0.5 rounded shrink-0">
                                                    {mStat.accelerator_count ? `${mStat.accelerator_count}x ` : ''}{mStat.hardware}
                                                </span>
                                            )}
                                        </div>
                                        <span className={cn('px-2 py-0.5 rounded-md border text-[11px] font-bold whitespace-nowrap shrink-0', mStatusDetails.bg, mStatusDetails.text, mStatusDetails.border)}>
                                            {mStatusDetails.label}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                        <div className="space-y-1">
                                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Run UUID</div>
                                            <div className="font-mono text-[11px] bg-slate-950/80 border border-slate-800/80 px-2 py-1 rounded-lg text-slate-200 select-all break-all">
                                                {mRunId || 'N/A'}
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Status Details</div>
                                            <div className="text-[11px] text-slate-300 bg-slate-950/80 border border-slate-800/80 px-2 py-1 rounded-lg">
                                                {mStatusTooltip}
                                            </div>
                                        </div>
                                    </div>

                                    {mSub?.feedback && (
                                        <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-[11px]">
                                            <span className="font-bold uppercase tracking-wider text-[9px] mr-1 text-red-400">Rejection Feedback:</span>
                                            <span>"{mSub.feedback}"</span>
                                        </div>
                                    )}
                                </div>

                                {/* Metadata Details Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {/* Submission Info */}
                                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
                                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                            <FileClock size={12} className="text-cyan-400" />
                                            <span>Submission Details</span>
                                        </div>
                                        <div className="space-y-1.5 text-[11px]">
                                            <div className="flex items-center justify-between text-slate-400">
                                                <span>Submitted At:</span>
                                                <span className="text-slate-200 font-medium">
                                                    {mSubmittedAt ? new Date(mSubmittedAt).toLocaleString() : 'Unknown'}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-slate-400">
                                                <span>Author / Submitter:</span>
                                                {mAuthorUsername ? (
                                                    <span className="flex items-center gap-1.5 text-slate-200">
                                                        <img
                                                            src={isPlaygroundMode
                                                                ? `/api/avatar/${encodeURIComponent(mAuthorUsername)}`
                                                                : `https://github.com/${mAuthorUsername}.png`}
                                                            alt={mAuthorUsername}
                                                            className="w-3.5 h-3.5 rounded-full border border-slate-700 shrink-0"
                                                            onError={(e) => { e.target.style.display = 'none'; }}
                                                        />
                                                        {isPlaygroundMode ? (
                                                            <span className="font-semibold text-indigo-400">{mAuthorUsername}</span>
                                                        ) : (
                                                            <a
                                                                href={`https://github.com/${mAuthorUsername}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="font-semibold text-indigo-400 hover:underline"
                                                            >
                                                                {mAuthorUsername}
                                                            </a>
                                                        )}
                                                        {mAuthorName && <span className="text-slate-400 text-[10px]">({mAuthorName})</span>}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400 italic">Unknown</span>
                                                )}
                                            </div>
                                            {(mStatus === 'public' || mStatus === 'promoted' || mApprovedAt) && (
                                                <div className="flex items-center justify-between text-slate-400 pt-1 border-t border-slate-800/60">
                                                    <span>Approved At:</span>
                                                    <span className="text-emerald-400 font-medium">
                                                        {mApprovedAt ? new Date(mApprovedAt).toLocaleString() : (mSubmittedAt ? new Date(mSubmittedAt).toLocaleString() : 'Unknown')}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Storage Location & Source Info */}
                                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
                                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                            <Database size={12} className="text-purple-400" />
                                            <span>Storage & Location</span>
                                        </div>
                                        <div className="space-y-1.5 text-[11px]">
                                            <div className="flex items-center justify-between text-slate-400">
                                                <span>GCS Bucket / Origin:</span>
                                                <span className="font-mono text-cyan-300 font-medium truncate max-w-[170px]" title={mSourceBucket}>
                                                    {mSourceBucket.startsWith('gs://') ? mSourceBucket : (mSourceBucket === 'Browser Local Staging' ? mSourceBucket : `gs://${mSourceBucket}`)}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-slate-400">
                                                <span>Source Format:</span>
                                                <span className="font-mono text-slate-200">
                                                    {mPayload?.format || (mSourceStr.startsWith('brv02:') ? 'brv02' : 'BRV0.2')}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-slate-400">
                                                <span>Total Stages:</span>
                                                <span className="text-slate-200 font-medium">
                                                    {mData.length} stage{mData.length === 1 ? '' : 's'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Forked Lineage Provenance (if forked) */}
                                {mForkList.length > 0 ? (
                                    <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-2">
                                        <div className="text-[10px] font-black uppercase tracking-wider text-blue-400 flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <GitFork size={12} className="text-blue-400" />
                                                <span>Forked Provenance Lineage</span>
                                            </div>
                                            <span className="text-[10px] text-blue-300 font-normal">
                                                {mForkList.length} origin{mForkList.length === 1 ? '' : 's'}
                                            </span>
                                        </div>
                                        <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                                            {mForkList.map((f, i) => (
                                                <div key={i} className="text-[11px] space-y-1 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                                                    <div className="text-white font-semibold flex items-center justify-between">
                                                        <span>{f.original_run_label || 'Original Benchmark Run'}</span>
                                                        <span className="font-mono text-[10px] text-slate-400 select-all">{f.original_run_id}</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 text-slate-400 text-[10px]">
                                                        <div>
                                                            <span>Author: </span>
                                                            <span className="text-slate-200 font-mono">
                                                                {typeof f.original_author === 'object' ? f.original_author?.username || 'Unknown' : f.original_author || 'Unknown'}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <span>Bucket: </span>
                                                            <span className="text-blue-300 font-mono truncate">{f.source_bucket || 'Unknown'}</span>
                                                        </div>
                                                    </div>
                                                    {f.forked_at && (
                                                        <div className="text-[10px] text-slate-400">
                                                            <span>Forked at: </span>
                                                            <span className="text-slate-300">{new Date(f.forked_at).toLocaleString()}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (mForkedFrom && (
                                    <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-1">
                                        <div className="text-[10px] font-black uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                                            <GitFork size={12} className="text-blue-400" />
                                            <span>Forked Benchmark Run</span>
                                        </div>
                                        <div className="text-[11px] text-slate-300">
                                            This benchmark was forked and cloned into this Results Store.
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </Modal>,
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
                <div className={cn(
                    'fixed top-20 right-4 h-[calc(100vh-6rem)] w-full sm:w-[864px] xl:w-[1030px] bg-slate-950/95 border border-slate-900 shadow-2xl z-[99999] flex flex-col rounded-3xl overflow-hidden p-6 transform transition-transform duration-300 pointer-events-auto',
                    showComparisonDrawer ? 'translate-x-0' : 'translate-x-[calc(100%+2rem)]'
                )}>
                        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
                        
                        <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-900 flex-shrink-0">
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
                        <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-8 pr-1 custom-scrollbar">
                            
                            {/* Section 1: Chart Container */}
                            <div className="min-h-[450px] w-full flex flex-col">
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
                                    filteredData={drawerChartFilteredData}
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
                                    filteredBySource={drawerChartFilteredData}
                                    xAxisMax={drawerXAxisMax}
                                    setXAxisMax={setDrawerXAxisMax}
                                    isLogScaleX={drawerIsLogScaleX}
                                    setIsLogScaleX={setDrawerIsLogScaleX}
                                    setLatType={setDrawerLatType}
                                    selectedBenchmarks={selectedBenchmarks}
                                    baselineBenchmarkKey={baselineBenchmarkKey}
                                    lineConnectMode={drawerLineConnectMode}
                                    setLineConnectMode={setDrawerLineConnectMode}
                                />
                            </div>

                            <div className="space-y-4 pt-2 pb-6">
                                <div className="flex items-center justify-between border-b border-slate-900 pb-2 select-none">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black uppercase tracking-wider text-cyan-400/90">
                                            Selected Benchmark Runs
                                        </span>
                                        <span className="text-[10px] text-slate-500">
                                            ({modelStats.filter(s => selectedBenchmarks.has(s.benchmarkKey)).length})
                                        </span>
                                    </div>
                                    <div className="relative group/share-link">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={handleCopyShareLink}
                                            disabled={!canShare}
                                            className={cn("gap-1.5", !canShare && "opacity-50 cursor-not-allowed")}
                                        >
                                            <Share2 size={12} />
                                            <span>Share Link</span>
                                        </Button>
                                        {!canShare && shareForbiddenReason && (
                                            <div className="absolute right-0 bottom-full mb-2 px-3 py-2 bg-slate-900 border border-slate-800 text-slate-350 text-xs font-medium rounded-xl opacity-0 invisible group-hover/share-link:opacity-100 group-hover/share-link:visible transition-all duration-200 shadow-2xl z-[9999] w-64 pointer-events-none leading-relaxed text-center normal-case tracking-normal animate-in fade-in slide-in-from-bottom-2 duration-150">
                                                {shareForbiddenReason}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-1 gap-3.5">
                                    {modelStats.filter(s => selectedBenchmarks.has(s.benchmarkKey)).map(stat => {
                                        const isOnlyThisVisible = !hiddenBenchmarkKeys.has(stat.benchmarkKey) &&
                                            allSelectedKeys.length > 1 &&
                                            allSelectedKeys.every(k => k === stat.benchmarkKey || hiddenBenchmarkKeys.has(k));
                                        return (
                                            <BenchmarkRow
                                                key={stat.benchmarkKey || stat.model}
                                                stat={stat}
                                                isSelected={true}
                                                isExpanded={expandedModels.has(stat.benchmarkKey || stat.model)}
                                                isBaseline={stat.benchmarkKey === baselineBenchmarkKey}
                                                user={user}
                                                isAdmin={isAdmin}
                                                isPlaygroundMode={isPlaygroundMode}
                                                submissionsMap={submissionsMap}
                                                brv02Runs={brv02Runs}
                                                visibleSpecs={visibleSpecs}
                                                isLoadingSubmissions={isLoadingSubmissions}
                                                isLocalActionPending={isLocalActionPending}
                                                rejectingRunId={rejectingRunId}
                                                rejectionFeedback={rejectionFeedback}
                                                setRejectingRunId={setRejectingRunId}
                                                setRejectionFeedback={setRejectionFeedback}
                                                activeExtraFilesPopoverRunId={activeExtraFilesPopoverRunId}
                                                setActiveExtraFilesPopoverRunId={setActiveExtraFilesPopoverRunId}
                                                extraFilesPopoverRef={extraFilesPopoverRef}
                                                setInspectFileModalState={setInspectFileModalState}
                                                setViewingPayloadRun={setViewingPayloadRun}
                                                setRawYamlContent={setRawYamlContent}
                                                setRawYamlTitle={setRawYamlTitle}
                                                handleSubmitStagedRunForReview={handleSubmitStagedRunForReview}
                                                handleActionClick={handleActionClick}
                                                updateSubmissionStatus={updateSubmissionStatus}
                                                deleteSubmission={deleteSubmission}
                                                toggleModelExpansion={toggleModelExpansion}
                                                handleCheckboxPointerDown={handleCheckboxPointerDown}
                                                brv02CustomLabels={brv02CustomLabels}
                                                handleEditStagedRun={handleEditStagedRun}
                                                handleForkSingle={handleForkSingle}
                                                onOpenMetadataModal={(s, d) => setMetadataModalRun({ stat: s, data: d })}
                                                defaultSources={defaultSources}
                                                readOnly={true}
                                                canViewRaw={false}
                                                isHiddenOnGraph={hiddenBenchmarkKeys.has(stat.benchmarkKey)}
                                                isOnlyThisVisibleOnGraph={isOnlyThisVisible}
                                                onToggleGraphVisibility={handleToggleGraphVisibility}
                                                onSoloOrInvertGraphVisibility={handleSoloOrInvertGraphVisibility}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Fixed Footer */}
                        <div className="pt-4 border-t border-slate-900 flex items-center justify-end gap-3 flex-shrink-0 select-none">
                            {selectedStagedRuns.length > 0 && (
                                user?.permission === 'none' ? (
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
                                        className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-[0_0_12px_rgba(6,182,212,0.15)] transition-all hover:scale-[1.02] cursor-pointer flex items-center gap-1.5"
                                    >
                                        <Send size={12} />
                                        Publish Selected ({selectedStagedRuns.length})
                                    </button>
                                )
                            )}
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="uppercase tracking-wider"
                                onClick={() => setShowComparisonDrawer(false)}
                            >
                                Close
                            </Button>
                        </div>
                </div>,
                document.body
            )}
            {showToast && createPortal(
                <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[10000] bg-cyan-950/90 border border-cyan-500/40 text-cyan-200 px-4 py-2 rounded-xl text-xs font-semibold shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200 flex items-center gap-2">
                    <Check size={14} className="text-cyan-400" />
                    <span>{toastMessage}</span>
                </div>,
                document.body
            )}


        </div>
    );
};
const BenchmarkRow = React.memo(({
    stat,
    isSelected,
    isExpanded,
    isBaseline,
    user,
    isAdmin,
    isPlaygroundMode = false,
    submissionsMap,
    brv02Runs,
    visibleSpecs,
    isLoadingSubmissions,
    isLocalActionPending,
    rejectingRunId,
    rejectionFeedback,
    setRejectingRunId,
    setRejectionFeedback,
    activeExtraFilesPopoverRunId,
    setActiveExtraFilesPopoverRunId,
    extraFilesPopoverRef,
    setInspectFileModalState,
    setViewingPayloadRun,
    setRawYamlContent,
    setRawYamlTitle,
    handleSubmitStagedRunForReview,
    handleActionClick,
    updateSubmissionStatus,
    deleteSubmission,
    toggleModelExpansion,
    handleCheckboxPointerDown,
    brv02CustomLabels,
    handleEditStagedRun,
    handleForkSingle,
    onOpenMetadataModal,
    defaultSources,
    readOnly = false,
    canViewRaw = true,
    isHiddenOnGraph = false,
    isOnlyThisVisibleOnGraph = false,
    onToggleGraphVisibility,
    onSoloOrInvertGraphVisibility,
}) => {
    const benchmarkData = stat.data || [];
    const meta = benchmarkData[0]?.metadata || {};

    const isDefaultSource = (src) => {
        if (!src) return true;
        if (src === 'local') return true;
        if (src.startsWith('brv02:')) return true;
        if (src === 'llm-d-results:google_drive') return true;
        
        if (src.startsWith('gcs:') || src.startsWith('aws:') || src.startsWith('lpg:')) {
            const bucketName = src.split(':')[1];
            return defaultSources.has(bucketName);
        }
        
        return defaultSources.has(src);
    };

    const getSourceTooltipText = (src) => {
        if (!src || src === 'local') {
            return "Loaded from your local staging directory or files.";
        }
        if (src.startsWith('brv02:')) {
            return "Staged locally in your browser cache.";
        }
        if (src === 'llm-d-results:google_drive') {
            return "Loaded from the archived Google Drive folder.";
        }
        if (src.startsWith('gcs:')) {
            return `Loaded from the Google Cloud Storage bucket: gs://${src.split(':')[1]}`;
        }
        if (src.startsWith('aws:')) {
            return `Loaded from the Amazon S3 bucket: s3://${src.split(':')[1]}`;
        }
        if (src.startsWith('giq:')) {
            return `Loaded from the Google Cloud Project: ${src.split(':')[1]}`;
        }
        if (src.startsWith('lpg:')) {
            return `Loaded from the Google Cloud Storage bucket (LPG): gs://${src.split(':')[1]}`;
        }
        return `Source: ${src}`;
    };


    const sourceStr = benchmarkData[0]?.source || '';
    const isBrv02 = sourceStr.startsWith('brv02:') || benchmarkData[0]?.source_info?.type === 'benchmark_report_v02';
    const runId = isBrv02 ? (sourceStr.startsWith('brv02:') ? sourceStr.replace('brv02:', '') : benchmarkData[0]?.run_id) : null;
    const runStatus = (runId && submissionsMap && submissionsMap[runId])?.status || benchmarkData[0]?.source_info?.submission_state || 'staged';
    const isResultsStore = benchmarkData[0]?.source_info?.type === 'benchmark_report_v02';
    const isMine = isResultsStore && user && benchmarkData[0]?.github_author?.username === user.username;
    const isLocal = sourceStr.startsWith('brv02:');
    const canResubmit = isLocal || isMine || isAdmin;

    const uniqueIsl = stat.uniqueIsl || [];
    const uniqueOsl = stat.uniqueOsl || [];
    const peakRun = stat.peakRun || {};
    
    const isl = uniqueIsl.length === 1 ? uniqueIsl[0] : (uniqueIsl.length > 1 ? 'Var' : '-');
    const osl = uniqueOsl.length === 1 ? uniqueOsl[0] : (uniqueOsl.length > 1 ? 'Var' : '-');

    const statusAccent = getCardStatusAccent(isBrv02, runId, submissionsMap, benchmarkData[0]?.source_info?.submission_state);
    const cardBorderClass = isSelected 
        ? 'border-blue-400 dark:border-blue-600 ring-1 ring-blue-400 dark:ring-blue-600/50' 
        : statusAccent.borderClass;
    const cardBgClass = statusAccent.bgClass || '';
    const popoverTargetId = runId || stat.benchmarkKey || stat.model || 'row';
    const rawPayload = getRawPrismCloudPayload(stat, benchmarkData);
    const manifestsObj = rawPayload?.manifests || stat.manifests || {};
    const evidenceObj = rawPayload?.evidence || stat.evidence || {};

    const manifestItems = Object.entries(manifestsObj).filter(([k, v]) => k && v);
    const evidenceItems = Object.entries(evidenceObj).filter(([k, v]) => k && v);
    const hasExtraFiles = manifestItems.length > 0 || evidenceItems.length > 0;
    const isExtraFilesPopoverOpen = !!(popoverTargetId && activeExtraFilesPopoverRunId === popoverTargetId);

    const renderSubmissionActions = () => {
        if (!isBrv02 || readOnly) return null;
        const sub = submissionsMap ? submissionsMap[runId] : null;
        const status = sub?.status || benchmarkData[0]?.source_info?.submission_state || 'staged';
        
        if (canResubmit && status === 'staged') {
            return user?.permission === 'none' ? (
                <div className="relative group/tooltip inline-block">
                    <button
                        disabled
                        className="px-2.5 py-1 rounded-xl border border-slate-800 bg-slate-900/40 text-slate-500 text-[9px] font-bold uppercase tracking-wider transition-colors cursor-not-allowed select-none flex items-center gap-1 opacity-60 whitespace-nowrap"
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
                        handleSubmitStagedRunForReview(brv02Runs.find(r => r.runId === runId), runId);
                    }}
                    disabled={isLoadingSubmissions || isLocalActionPending}
                    title="Submit this benchmark to staging GCS bucket for automated format checks"
                    className="px-2.5 py-1 rounded-xl border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 disabled:opacity-50 disabled:cursor-not-allowed text-purple-400 text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer select-none flex items-center gap-1 whitespace-nowrap"
                >
                    <Send className="w-2.5 h-2.5" /> Submit for Review
                </button>
            );
        }
        if (status === 'unlisted') {
            const authorUsername = sub?.github_author?.username || benchmarkData[0]?.github_author?.username || benchmarkData[0]?.source_info?.github_user;
            const isOwner = !!(user?.username && authorUsername && authorUsername.toLowerCase() === user.username.toLowerCase());
            const canPromote = isOwner;
            const canDelete = isOwner || isAdmin;

            if (!canPromote && !canDelete) return null;

            return (
                <div className="flex items-center gap-1.5">
                    {canPromote && (
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
                            title="Promote unlisted benchmark to the admin review queue"
                            className="px-2.5 py-1 rounded-xl border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 disabled:opacity-50 disabled:cursor-not-allowed text-purple-400 text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer select-none flex items-center gap-1 whitespace-nowrap"
                        >
                            <Play className="w-2.5 h-2.5 fill-current" /> Promote to Review
                        </button>
                    )}
                    {canDelete && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleActionClick(async () => {
                                    if (window.confirm(`Are you sure you want to permanently delete unlisted benchmark ${runId} from the Results Store? This action cannot be undone.`)) {
                                        if (deleteSubmission) {
                                            await deleteSubmission(runId);
                                        }
                                    }
                                });
                            }}
                            disabled={isLoadingSubmissions || isLocalActionPending}
                            title="Permanently delete this unlisted benchmark off GCS storage"
                            className="px-2.5 py-1 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer select-none flex items-center gap-1 whitespace-nowrap"
                        >
                            <Trash2 className="w-2.5 h-2.5" /> Delete
                        </button>
                    )}
                </div>
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
                    className="px-2.5 py-1 rounded-xl border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 disabled:opacity-50 disabled:cursor-not-allowed text-purple-400 text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer select-none flex items-center gap-1 whitespace-nowrap"
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
                        className="px-2.5 py-1 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed text-emerald-455 text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer select-none flex items-center gap-1 whitespace-nowrap"
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
                        className="px-2.5 py-1 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer select-none flex items-center gap-1 whitespace-nowrap"
                    >
                        <X className="w-2.5 h-2.5" /> Reject
                    </button>
                </>
            );
        }
        if (status === 'rejected' || status === 'changes_requested') {
            const showResubmit = canResubmit;
            const showDelete = isAdmin && status === 'rejected';

            if (!showResubmit && !showDelete) return null;

            return (
                <div className="flex items-center gap-1.5">
                    {showResubmit && (
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
                            className="px-2.5 py-1 rounded-xl border border-purple-500/25 bg-purple-500/10 hover:bg-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-purple-400 text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer select-none flex items-center gap-1 whitespace-nowrap"
                        >
                            <RotateCcw className="w-2.5 h-2.5" /> Resubmit
                        </button>
                    )}
                    {showDelete && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleActionClick(async () => {
                                    if (window.confirm(`Are you sure you want to permanently delete rejected benchmark ${runId} from the Results Store? This action cannot be undone.`)) {
                                        if (deleteSubmission) {
                                            await deleteSubmission(runId);
                                        }
                                    }
                                });
                            }}
                            disabled={isLoadingSubmissions || isLocalActionPending}
                            title="Permanently delete this rejected benchmark from cloud storage"
                            className="px-2.5 py-1 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer select-none flex items-center gap-1 whitespace-nowrap"
                        >
                            <Trash2 className="w-2.5 h-2.5" /> Delete
                        </button>
                    )}
                </div>
            );
        }
        return null;
    };

    return (
                                        <div className="flex items-center gap-3 w-full group/benchmark-row">
                                            {readOnly && onToggleGraphVisibility && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onToggleGraphVisibility(stat.benchmarkKey);
                                                    }}
                                                    className={cn(
                                                        "p-2.5 rounded-xl border transition-all cursor-pointer flex-shrink-0 select-none shadow-sm",
                                                        !isHiddenOnGraph
                                                            ? "bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30 text-cyan-400"
                                                            : "bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400 opacity-60"
                                                    )}
                                                    title={!isHiddenOnGraph ? "Hide line from graph plot" : "Show line on graph plot"}
                                                >
                                                    {!isHiddenOnGraph ? <Eye size={16} /> : <EyeOff size={16} />}
                                                </button>
                                            )}
                                            <div 
                                                key={stat.benchmarkKey || stat.model}
                                                className={cn(
                                                    'flex-1 min-w-0 flex flex-col bg-white dark:bg-slate-900 border rounded-lg transition-colors duration-150 shadow-sm relative',
                                                cardBorderClass,
                                                cardBgClass,
                                                isBaseline && 'ring-2 ring-cyan-400/50'
                                            )}
                                        >
                                            {!readOnly && statusAccent.accentBar}
                                            {/* Card Main Row (Header) */}
                                            <div className="flex items-stretch min-h-[60px] min-w-0">
                                                {/* Left Checkbox Area (Dedicated Click Target) */}
                                                {!readOnly && (
                                                    <div 
                                                        onPointerDown={(e) => handleCheckboxPointerDown(e, stat.benchmarkKey, isSelected)}
                                                        className={cn(
                                                            'benchmark-checkbox-area w-12 flex-shrink-0 flex items-center justify-center cursor-pointer border-r transition-colors select-none',
                                                            statusAccent.accentBar && 'pl-1.5',
                                                            isSelected
                                                                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                                                                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                                                        )}
                                                        data-benchmark-key={stat.benchmarkKey}
                                                        style={{ touchAction: 'none' }}
                                                    >
                                                        <div className={cn(
                                                            'w-5 h-5 rounded flex items-center justify-center border transition-all',
                                                            isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                                                        )}>
                                                            {isSelected && <Check size={14} strokeWidth={3} />}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Card Content Area (Expand Toggle) */}
                                                <div 
                                                    onClick={() => toggleModelExpansion(stat.benchmarkKey || stat.model)}
                                                    className={cn(
                                                        'flex-1 min-w-0 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors gap-3 overflow-hidden',
                                                        readOnly ? 'p-3.5 sm:p-4' : 'p-3'
                                                    )}
                                                >
                                                    {/* Left side info block */}
                                                    <div className="flex-1 flex flex-wrap sm:flex-nowrap items-center gap-4 min-w-0">
                                                        {/* Specs list container */}
                                                        {(() => {
                                                            const nodesAndParallelismText = stat.nodesAndParallelismText || '';

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

                                                            if (visibleSpecs.model) {
                                                                const modelVal = stat.model_name || stat.model || meta.model_name;
                                                                if (modelVal) {
                                                                    specs.push(
                                                                        <span key="model" className="inline-flex items-center gap-1">
                                                                            <span className="text-slate-400 dark:text-slate-500 font-normal">Model:</span>
                                                                            <span className="font-semibold text-slate-700 dark:text-slate-300">{modelVal}</span>
                                                                        </span>
                                                                    );
                                                                }
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
                                                                     <div className="flex items-center justify-between gap-x-4 gap-y-1 w-full min-w-0">
                                                                        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                                                                                    {(() => {
                                                                                        const model = stat.model_name || stat.model || meta.model_name;
                                                                                        const titleText = isBrv02
                                                                                            ? buildRunLabel({
                                                                                                model,
                                                                                                description: benchmarkData[0]?.runLabel,
                                                                                                customLabel: brv02CustomLabels[runId],
                                                                                            })
                                                                                            : model;
                                                                                        return (
                                                                                            <div className="flex items-center gap-1.5 min-w-0 flex-shrink overflow-hidden">
                                                                                                <span className="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-100 truncate block min-w-0" title={titleText}>
                                                                                                    {titleText}
                                                                                                </span>
                                                                                                {isBrv02 && runStatus === 'staged' && !readOnly && (
                                                                                                    <button
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            handleEditStagedRun(brv02Runs.find(r => r.runId === runId), runId);
                                                                                                        }}
                                                                                                        title="Edit staged benchmark metadata"
                                                                                                        className="p-1 text-slate-300 dark:text-slate-600 hover:text-cyan-400 transition-colors flex-shrink-0 cursor-pointer whitespace-nowrap"
                                                                                                    >
                                                                                                        <Pencil size={12} />
                                                                                                    </button>
                                                                                                )}
                                                                                            </div>
                                                                                        );
                                                                                    })()}
                                                                                      {onSoloOrInvertGraphVisibility && (
                                                                                          <button
                                                                                              type="button"
                                                                                              onClick={(e) => {
                                                                                                  e.stopPropagation();
                                                                                                  onSoloOrInvertGraphVisibility(stat.benchmarkKey);
                                                                                              }}
                                                                                              className={cn(
                                                                                                  "opacity-0 group-hover/benchmark-row:opacity-100 transition-opacity duration-150 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md border select-none cursor-pointer flex-shrink-0 ml-1.5 shadow-sm",
                                                                                                  isOnlyThisVisibleOnGraph
                                                                                                      ? "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-400 hover:text-amber-300"
                                                                                                      : "bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30 text-cyan-400 hover:text-cyan-300"
                                                                                              )}
                                                                                              title={isOnlyThisVisibleOnGraph ? "Show all other selected benchmarks on graph" : "Show only this benchmark on graph"}
                                                                                          >
                                                                                              {isOnlyThisVisibleOnGraph ? "Invert" : "Solo"}
                                                                                          </button>
                                                                                      )}

                                                                            {isBrv02 && !readOnly && (
                                                                                <div className="flex flex-col items-end gap-1.5 relative flex-shrink-0">
                                                                                    <div className="flex items-center gap-2">
                                                                                        {renderSubmissionActions()}
                                                                                    </div>
                                                                                    {Boolean(rejectingRunId) && rejectingRunId === runId && (
                                                                                        <div onClick={e => e.stopPropagation()} className="p-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-lg shadow-inner w-64 flex flex-col gap-2 mt-1 z-30">
                                                                                            <div className="text-xs font-bold text-red-500 dark:text-red-400 uppercase tracking-wider">Reason for Rejecting Run</div>
                                                                                            <Textarea
                                                                                                autoFocus
                                                                                                value={rejectionFeedback}
                                                                                                onChange={e => setRejectionFeedback(e.target.value)}
                                                                                                placeholder="Reason details..."
                                                                                                className="p-1.5 rounded h-12 resize-none font-sans focus:border-red-500/50 focus:ring-red-500/40"
                                                                                            />
                                                                                            <div className="flex justify-end gap-2 text-xs">
                                                                                                <Button
                                                                                                    variant="ghost"
                                                                                                    size="xs"
                                                                                                    className="uppercase font-bold"
                                                                                                    onClick={() => setRejectingRunId(null)}
                                                                                                >
                                                                                                    Cancel
                                                                                                </Button>
                                                                                                <Button
                                                                                                    variant="danger"
                                                                                                    size="xs"
                                                                                                    className="uppercase font-bold"
                                                                                                    onClick={() => {
                                                                                                        handleActionClick(async () => {
                                                                                                            if (rejectionFeedback.trim() && updateSubmissionStatus) {
                                                                                                                await updateSubmissionStatus(runId, 'rejected', rejectionFeedback, stat.model, stat.hardware);
                                                                                                                setRejectingRunId(null);
                                                                                                            }
                                                                                                        });
                                                                                                    }}
                                                                                                    disabled={!rejectionFeedback.trim() || isLoadingSubmissions || isLocalActionPending}
                                                                                                >
                                                                                                    Submit
                                                                                                </Button>
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                                </div>
                                                                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                                                                            {(() => {
                                                                                const forkedFrom = stat.payload?.forked_from || stat.forked_from || benchmarkData[0]?.payload?.forked_from || benchmarkData[0]?.forked_from || (runId && submissionsMap ? (submissionsMap[runId]?.forked_from || submissionsMap[runId]?.forked) : null);
                                                                                if (!forkedFrom) return null;
                                                                                const forkList = Array.isArray(forkedFrom) ? forkedFrom : (typeof forkedFrom === 'object' && forkedFrom !== null ? [forkedFrom] : []);
                                                                                return (
                                                                                    <div className="relative group/forked-badge inline-flex items-center">
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={(e) => e.stopPropagation()}
                                                                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 transition-colors cursor-help"
                                                                                        >
                                                                                            <GitFork className="w-2.5 h-2.5" />
                                                                                            <span>Forked</span>
                                                                                        </button>
                                                                                        {forkList.length > 0 ? (
                                                                                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-3 py-2.5 bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-medium rounded-xl opacity-0 invisible group-hover/forked-badge:opacity-100 group-hover/forked-badge:visible transition-all duration-150 shadow-2xl z-[9999] w-72 pointer-events-none leading-relaxed text-left normal-case tracking-normal space-y-2">
                                                                                                <div className="text-[10px] font-black uppercase tracking-wider text-blue-400 border-b border-slate-800 pb-1 flex items-center justify-between">
                                                                                                    <span>Forked Benchmark Provenance</span>
                                                                                                    <span className="text-slate-500">{forkList.length} {forkList.length === 1 ? 'origin' : 'origins'}</span>
                                                                                                </div>
                                                                                                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                                                                                                    {forkList.map((f, i) => (
                                                                                                        <div key={i} className="text-[10px] space-y-0.5 border-b border-slate-800/50 pb-1.5 last:border-0 last:pb-0">
                                                                                                            <div className="text-white font-semibold truncate">{f.original_run_label || f.original_run_id}</div>
                                                                                                            <div className="text-slate-400 flex items-center justify-between">
                                                                                                                <span>Author:</span>
                                                                                                                <span className="text-slate-200 font-mono">
                                                                                                                    {typeof f.original_author === 'object' ? f.original_author?.username || 'Unknown' : f.original_author || 'Unknown'}
                                                                                                                </span>
                                                                                                            </div>
                                                                                                            <div className="text-slate-400 flex items-center justify-between">
                                                                                                                <span>Source Bucket:</span>
                                                                                                                <span className="text-blue-300 font-mono truncate max-w-[140px]">{f.source_bucket || 'Unknown'}</span>
                                                                                                            </div>
                                                                                                            {f.forked_at && (
                                                                                                                <div className="text-slate-400 flex items-center justify-between">
                                                                                                                    <span>Forked At:</span>
                                                                                                                    <span className="text-slate-300">{f.forked_at ? new Date(f.forked_at).toLocaleString() : 'Unknown'}</span>
                                                                                                                </div>
                                                                                                            )}
                                                                                                        </div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            </div>
                                                                                        ) : (
                                                                                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2.5 py-1 bg-slate-900 border border-slate-800 text-[10px] text-slate-300 font-medium rounded-lg opacity-0 invisible group-hover/forked-badge:opacity-100 group-hover/forked-badge:visible transition-all duration-150 shadow-xl z-[9999] whitespace-nowrap pointer-events-none">
                                                                                                Forked benchmark run
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })()}

                                                                            {(() => {
                                                                                const isResultsStore = benchmarkData[0]?.source_info?.type === 'benchmark_report_v02';
                                                                                const isMine = isResultsStore && user && benchmarkData[0]?.github_author?.username === user.username;
                                                                                if (isMine) {
                                                                                    return (
                                                                                        <Badge tone="success" size="xs">
                                                                                            Yours
                                                                                        </Badge>
                                                                                    );
                                                                                }
                                                                                if (isResultsStore && isDefaultSource(sourceStr) && !isLocal) {
                                                                                    return (
                                                                                        <div className="relative group/community-row-tooltip inline-flex items-center">
                                                                                            <Badge tone="info" size="xs" className="cursor-help">
                                                                                                Community
                                                                                            </Badge>
                                                                                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2.5 py-1.5 bg-slate-900 border border-slate-800 text-[10px] text-slate-300 font-medium rounded-lg opacity-0 invisible group-hover/community-row-tooltip:opacity-100 group-hover/community-row-tooltip:visible transition-all duration-150 shadow-2xl z-[9999] w-48 pointer-events-none leading-relaxed text-center normal-case tracking-normal">
                                                                                                Contains community-submitted benchmarks stored in the official Prism Cloud bucket.
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                }
                                                                                return null;
                                                                            })()}


                                                                            {(() => {
                                                                                const sub = isBrv02 && submissionsMap ? submissionsMap[runId] : null;
                                                                                
                                                                                if (isBrv02) {
                                                                                    const status = sub?.status || benchmarkData[0]?.source_info?.submission_state || 'staged';
                                                                                    let chipStatus = 'staged';
                                                                                    let chipLabel = undefined;
                                                                                    if (status === 'submitted_pending_processing') {
                                                                                        chipStatus = 'processing';
                                                                                    } else if (status === 'submitted_pending_review' || status === 'in_review') {
                                                                                        chipStatus = 'in_review';
                                                                                    } else if (status === 'public' || status === 'promoted' || status === 'approved') {
                                                                                        chipStatus = 'approved';
                                                                                        chipLabel = 'Public';
                                                                                    } else if (status === 'rejected' || status === 'changes_requested') {
                                                                                        chipStatus = 'rejected';
                                                                                    }
                                                                                    
                                                                                    const tooltipText = getStatusTooltipText(status, sub);
                                                                                    
                                                                                    return (
                                                                                        <div className="relative group/status-tooltip inline-flex items-center">
                                                                                            <StatusChip status={chipStatus} label={chipLabel} className="cursor-help" />
                                                                                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2.5 py-1.5 bg-slate-900 border border-slate-800 text-[10px] text-slate-300 font-medium rounded-lg opacity-0 invisible group-hover/status-tooltip:opacity-100 group-hover/status-tooltip:visible transition-all duration-150 shadow-2xl z-[9999] w-48 pointer-events-none leading-relaxed text-center normal-case tracking-normal">
                                                                                                {tooltipText}
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                } else {
                                                                                    return (
                                                                                        <div className="relative group/status-tooltip inline-flex items-center">
                                                                                            <Badge tone="success" size="xs" className="cursor-help">
                                                                                                Official
                                                                                            </Badge>
                                                                                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2.5 py-1.5 bg-slate-900 border border-slate-800 text-[10px] text-slate-300 font-medium rounded-lg opacity-0 invisible group-hover/status-tooltip:opacity-100 group-hover/status-tooltip:visible transition-all duration-150 shadow-2xl z-[9999] w-48 pointer-events-none leading-relaxed text-center normal-case tracking-normal">
                                                                                                Official baseline benchmark run verified by Results Store admins.
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                }
                                                                            })()}


                                                                            {getSourceTag(benchmarkData[0]) !== 'BRV02' && (
                                                                                <Badge
                                                                                    tone="neutral"
                                                                                    size="xs"
                                                                                    className="cursor-help"
                                                                                    title={getSourceTag(benchmarkData[0]) === 'llm-d' ? "Official llm-d benchmark results stored in shared Google Drive store" : `Source: ${getSourceTag(benchmarkData[0])}`}
                                                                                >
                                                                                    {getSourceTag(benchmarkData[0])}
                                                                                </Badge>
                                                                            )}

                                                                            {(() => {
                                                                                const type = getSourceType(benchmarkData[0]);
                                                                                if (type === 'Cloud') return null;
                                                                                const style = getSourceTypeStyle(type);
                                                                                const tooltipText = getSourceTooltipText(sourceStr);
                                                                                return (
                                                                                    <div className="relative group/source-type-tooltip inline-flex items-center">
                                                                                        <span className={cn('text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border whitespace-nowrap cursor-help', style.bg, style.text, style.border)}>
                                                                                            {type}
                                                                                        </span>
                                                                                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2.5 py-1.5 bg-slate-900 border border-slate-800 text-[10px] text-slate-300 font-medium rounded-lg opacity-0 invisible group-hover/source-type-tooltip:opacity-100 group-hover/source-type-tooltip:visible transition-all duration-150 shadow-2xl z-[9999] w-48 pointer-events-none leading-relaxed text-center normal-case tracking-normal">
                                                                                            {tooltipText}
                                                                                        </div>
                                                                                    </div>
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
                                                                                    <span className="font-extrabold uppercase text-[9px] not-italic tracking-wider bg-red-500/20 px-1.5 py-0.5 rounded text-red-450 shrink-0 mt-0.5 whitespace-nowrap">
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
                                                 <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 p-4 rounded-b-lg">
                                                    <div className="flex justify-between items-center gap-4 mb-3 w-full">
                                                        {(() => {
                                                            const firstItem = benchmarkData[0] || {};
                                                            const sourceInfo = firstItem.source_info || {};
                                                            const rawSubmittedAt = sourceInfo.submitted_at || firstItem.timestamp || stat.timestamp;
                                                            const formattedDate = (() => {
                                                                if (!rawSubmittedAt) return null;
                                                                const d = new Date(rawSubmittedAt);
                                                                if (!isNaN(d.getTime())) {
                                                                    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                                                                }
                                                                const m = String(rawSubmittedAt).match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
                                                                if (m) {
                                                                    const parsedD = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`);
                                                                    if (!isNaN(parsedD.getTime())) {
                                                                        return parsedD.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                                                                    }
                                                                }
                                                                return String(rawSubmittedAt);
                                                            })();

                                                            const authorObj = firstItem.github_author || stat.github_author || sourceInfo.github_user;
                                                            const authorUsername = typeof authorObj === 'object' ? authorObj?.username : (typeof authorObj === 'string' ? authorObj : null);

                                                            return (
                                                                <div className="inline-flex items-stretch rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/60 text-xs text-slate-600 dark:text-slate-400 font-sans shadow-sm overflow-hidden h-8 flex-shrink-0">
                                                                    <div className="px-2.5 py-1 flex items-center gap-2 whitespace-nowrap">
                                                                        {formattedDate ? (
                                                                            <span className="flex items-center gap-1">
                                                                                <span className="text-slate-400 dark:text-slate-500 font-medium">Submitted</span>
                                                                                <span className="font-semibold text-slate-700 dark:text-slate-300">{formattedDate}</span>
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-slate-400 dark:text-slate-500 font-medium">Benchmark Run</span>
                                                                        )}

                                                                        {authorUsername && (
                                                                            <span className="flex items-center gap-1 bg-slate-200/60 dark:bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-300/40 dark:border-slate-700/60">
                                                                                <img 
                                                                                    src={isPlaygroundMode
                                                                                        ? `/api/avatar/${encodeURIComponent(authorUsername)}`
                                                                                        : `https://github.com/${authorUsername}.png`} 
                                                                                    alt={authorUsername} 
                                                                                    className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0"
                                                                                    onError={(e) => { e.target.style.display = 'none'; }}
                                                                                />
                                                                                {isPlaygroundMode ? (
                                                                                    <span className="text-indigo-600 dark:text-indigo-400 font-semibold text-[11px]">
                                                                                        {authorUsername}
                                                                                    </span>
                                                                                ) : (
                                                                                    <a 
                                                                                        href={`https://github.com/${authorUsername}`}
                                                                                        target="_blank" 
                                                                                        rel="noopener noreferrer" 
                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                        className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold text-[11px]"
                                                                                    >
                                                                                        {authorUsername}
                                                                                    </a>
                                                                                )}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            onOpenMetadataModal && onOpenMetadataModal(stat, benchmarkData);
                                                                        }}
                                                                        title="View full benchmark run metadata and lineage"
                                                                        className="px-2.5 border-l border-slate-200 dark:border-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition-colors flex items-center justify-center cursor-pointer"
                                                                    >
                                                                        <Info size={13} />
                                                                    </button>
                                                                </div>
                                                            );
                                                        })()}

                                                     {canViewRaw && (
                                                         <div className="flex items-stretch gap-2 flex-shrink-0">
                                                             <div className="w-px bg-slate-300/70 dark:bg-slate-700/80 self-stretch my-0.5 mr-0.5" />
                                                             {isBrv02 && (
                                                                 <div className="relative group/fork-row-btn">
                                                                     <Button
                                                                         variant="secondary"
                                                                         size="sm"
                                                                         onClick={(e) => {
                                                                             e.stopPropagation();
                                                                             handleActionClick(() => handleForkSingle(stat, benchmarkData));
                                                                         }}
                                                                         disabled={isLocalActionPending}
                                                                         className="h-full whitespace-nowrap animate-in fade-in duration-200 gap-1.5 flex items-center justify-center"
                                                                     >
                                                                         <GitFork size={13} />
                                                                         Fork
                                                                     </Button>
                                                                     <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-slate-900 border border-slate-800 text-slate-350 text-xs font-medium rounded-xl opacity-0 invisible group-hover/fork-row-btn:opacity-100 group-hover/fork-row-btn:visible transition-all duration-200 shadow-2xl z-[9999] w-64 pointer-events-none leading-relaxed text-center normal-case tracking-normal animate-in fade-in slide-in-from-bottom-2 duration-150">
                                                                         Clone this benchmark into local staging to modify, coalesce, or republish.
                                                                     </div>
                                                                 </div>
                                                             )}
                                                             {isBrv02 && (
                                                                 <Button
                                                                     variant="secondary"
                                                                     size="sm"
                                                                     onClick={(e) => {
                                                                         e.stopPropagation();
                                                                         try {
                                                                             downloadRunBRV02(stat, benchmarkData);
                                                                         } catch (err) {
                                                                             console.error("Failed to download BRV0.2 benchmark:", err);
                                                                             alert("Failed to download benchmark: " + (err.message || err));
                                                                         }
                                                                     }}
                                                                     className="h-full whitespace-nowrap animate-in fade-in duration-200 gap-1.5 flex items-center justify-center"
                                                                     title={benchmarkData.length > 1 ? "Download BRV0.2 Stage Reports (ZIP Archive)" : "Download BRV0.2 Report (YAML File)"}
                                                                 >
                                                                     <Download size={13} />
                                                                     {benchmarkData.length > 1 ? "Download BRV0.2 (ZIP)" : "Download BRV0.2 (YAML)"}
                                                                 </Button>
                                                             )}
                                                             <div className="relative flex items-center h-full">
                                                                 <Button
                                                                     variant="secondary"
                                                                     size="sm"
                                                                     onClick={(e) => {
                                                                         e.stopPropagation();
                                                                         setViewingPayloadRun(stat);
                                                                     }}
                                                                     className={cn(
                                                                         "h-full whitespace-nowrap animate-in fade-in duration-200 gap-1.5 flex items-center justify-center",
                                                                         hasExtraFiles && "rounded-r-none border-r-0"
                                                                     )}
                                                                     title="Inspect Raw YAML / JSON Manifest"
                                                                 >
                                                                     <Code2 size={13} />
                                                                     Inspect Raw Manifest
                                                                 </Button>
                                                                 {hasExtraFiles && (
                                                                     <Button
                                                                         variant="secondary"
                                                                         size="sm"
                                                                         onClick={(e) => {
                                                                             e.stopPropagation();
                                                                             setActiveExtraFilesPopoverRunId(isExtraFilesPopoverOpen ? null : popoverTargetId);
                                                                         }}
                                                                         className="h-full px-1.5 rounded-l-none border-l border-slate-700/60 flex items-center justify-center hover:bg-slate-700/50 text-slate-300"
                                                                         title="View attached manifest & evidence files"
                                                                     >
                                                                         <ChevronDown size={13} className={cn("transition-transform duration-200", isExtraFilesPopoverOpen && "rotate-180")} />
                                                                     </Button>
                                                                 )}

                                                                 {isExtraFilesPopoverOpen && (
                                                                             <div
                                                                                 ref={extraFilesPopoverRef}
                                                                                 onClick={(e) => e.stopPropagation()}
                                                                                 className="absolute right-0 bottom-full mb-2 w-80 bg-slate-950/95 border border-slate-800 rounded-2xl p-3 shadow-2xl backdrop-blur-xl z-[100] animate-in fade-in slide-in-from-bottom-2 duration-150 text-left space-y-3"
                                                                             >
                                                                                 <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                                                                                     <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400">
                                                                                         Attached Files & Evidence
                                                                                     </span>
                                                                                     <button
                                                                                         onClick={() => setActiveExtraFilesPopoverRunId(null)}
                                                                                         className="p-1 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-900 transition-colors cursor-pointer"
                                                                                     >
                                                                                         <X size={13} />
                                                                                     </button>
                                                                                 </div>

                                                                                 {manifestItems.length > 0 && (
                                                                                     <div className="space-y-1.5">
                                                                                         <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 px-1">
                                                                                             Manifests ({manifestItems.length})
                                                                                         </div>
                                                                                         <div className="space-y-1">
                                                                                             {manifestItems.map(([filename, val]) => {
                                                                                                 const textContent = typeof val === 'string' && val.startsWith('data:') ? (parseDataUri(val) || val) : String(val);
                                                                                                 return (
                                                                                                     <button
                                                                                                         key={filename}
                                                                                                         onClick={() => {
                                                                                                             setActiveExtraFilesPopoverRunId(null);
                                                                                                             setInspectFileModalState({
                                                                                                                 isOpen: true,
                                                                                                                 filename,
                                                                                                                 content: textContent
                                                                                                             });
                                                                                                         }}
                                                                                                         className="w-full flex items-center gap-2 p-2 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/60 hover:border-cyan-500/30 text-xs text-slate-200 transition-all cursor-pointer group text-left"
                                                                                                     >
                                                                                                         <FileText size={13} className="text-cyan-400 shrink-0 group-hover:scale-110 transition-transform" />
                                                                                                         <span className="truncate flex-1 font-mono text-[11px] text-cyan-200">{filename}</span>
                                                                                                         <span className="text-[9px] font-medium text-slate-500 bg-slate-800/80 px-1.5 py-0.5 rounded">View</span>
                                                                                                     </button>
                                                                                                 );
                                                                                             })}
                                                                                         </div>
                                                                                     </div>
                                                                                 )}

                                                                                 {evidenceItems.length > 0 && (
                                                                                     <div className="space-y-1.5">
                                                                                         <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 px-1">
                                                                                             Evidence ({evidenceItems.length})
                                                                                         </div>
                                                                                         <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                                                                                             {evidenceItems.map(([filename, val]) => {
                                                                                                 const valStr = String(val);
                                                                                                 const isExternal = valStr.startsWith('http://') || valStr.startsWith('https://') || valStr.startsWith('gs://');

                                                                                                 if (isExternal) {
                                                                                                     const resolvedUrl = valStr.startsWith('gs://') 
                                                                                                         ? `https://console.cloud.google.com/storage/browser/_details/${valStr.substring(5)}`
                                                                                                         : valStr;

                                                                                                     return (
                                                                                                         <a
                                                                                                             key={filename}
                                                                                                             href={resolvedUrl}
                                                                                                             target="_blank"
                                                                                                             rel="noopener noreferrer"
                                                                                                             onClick={() => setActiveExtraFilesPopoverRunId(null)}
                                                                                                             className="w-full flex items-center gap-2 p-2 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/60 hover:border-amber-500/30 text-xs text-slate-200 transition-all cursor-pointer group text-left"
                                                                                                         >
                                                                                                             <ExternalLink size={13} className="text-amber-400 shrink-0 group-hover:scale-110 transition-transform" />
                                                                                                             <div className="truncate flex-1 min-w-0">
                                                                                                                 <div className="font-mono text-[11px] text-amber-200 truncate">{filename}</div>
                                                                                                                 <div className="text-[9px] text-slate-500 truncate">{valStr}</div>
                                                                                                             </div>
                                                                                                             <span className="text-[9px] font-medium text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 shrink-0">Open</span>
                                                                                                         </a>
                                                                                                     );
                                                                                                 }

                                                                                                 const textContent = valStr.startsWith('data:') ? (parseDataUri(valStr) || valStr) : valStr;

                                                                                                 return (
                                                                                                     <button
                                                                                                         key={filename}
                                                                                                         onClick={() => {
                                                                                                             setActiveExtraFilesPopoverRunId(null);
                                                                                                             setInspectFileModalState({
                                                                                                                 isOpen: true,
                                                                                                                 filename,
                                                                                                                 content: textContent
                                                                                                             });
                                                                                                         }}
                                                                                                         className="w-full flex items-center gap-2 p-2 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/60 hover:border-purple-500/30 text-xs text-slate-200 transition-all cursor-pointer group text-left"
                                                                                                     >
                                                                                                         <FileText size={13} className="text-purple-400 shrink-0 group-hover:scale-110 transition-transform" />
                                                                                                         <span className="truncate flex-1 font-mono text-[11px] text-purple-200">{filename}</span>
                                                                                                         <span className="text-[9px] font-medium text-slate-500 bg-slate-800/80 px-1.5 py-0.5 rounded">View</span>
                                                                                                     </button>
                                                                                                 );
                                                                                             })}
                                                                                         </div>
                                                                                     </div>
                                                                                 )}
                                                                             </div>
                                                                         )}
                                                                     </div>
                                                         </div>
                                                     )}
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
                                                                      {canViewRaw && <th className="px-2 py-2 w-16 text-center">Raw</th>}
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
                                                                              <td className="px-2 py-2 text-[10px]">
                                                                                  {(() => {
                                                                                      const val = d.isl ?? d.workload?.input_tokens;
                                                                                      if (val == null || isNaN(Number(val))) return '-';
                                                                                      const n = Number(val);
                                                                                      return Number.isInteger(n) ? n.toString() : Number(n.toFixed(2)).toString();
                                                                                  })()}
                                                                              </td>
                                                                              <td className="px-2 py-2 text-[10px]">
                                                                                  {(() => {
                                                                                      const val = d.osl ?? d.workload?.output_tokens;
                                                                                      if (val == null || isNaN(Number(val))) return '-';
                                                                                      const n = Number(val);
                                                                                      return Number.isInteger(n) ? n.toString() : Number(n.toFixed(2)).toString();
                                                                                  })()}
                                                                              </td>
                                                                              {canViewRaw && (
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
                                                                                          className={cn(
                                                                                              'p-1 rounded transition-colors',
                                                                                              d.rawReport
                                                                                                  ? 'text-slate-400 hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-400 cursor-pointer whitespace-nowrap'
                                                                                                  : 'text-slate-200 dark:text-slate-800 cursor-not-allowed opacity-50'
                                                                                          )}
                                                                                      >
                                                                                          <FileText size={14} />
                                                                                      </button>
                                                                                  </td>
                                                                              )}
                                                                          </tr>
                                                                      ))}
                                                              </tbody>
                                                           </table>
                                                       </div>
                                                   </div>
                                               )}
                                           </div>
                                       </div>
                                   );
});
