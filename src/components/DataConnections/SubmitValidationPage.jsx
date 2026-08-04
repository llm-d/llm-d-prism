import React, { useState } from 'react';
import { X, UploadCloud, CheckCircle, AlertCircle, AlertOctagon, AlertTriangle, FileText, ChevronLeft, ChevronRight, ChevronDown, Trash2, Upload, ShieldAlert, Check, ArrowRight, ArrowLeft, GitCompare, Zap, Cpu, Pencil, Layers, Split, GripVertical, Sparkles, Info } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Scatter } from 'recharts';
import { validateBenchmark, validatePrismUploadStructure } from '../../utils/benchmarkValidator';
import { parseReportV02, stageToEntry, canonicalStringify, mutateRawReportMetadata } from '../../utils/benchmarkReportV02Parser';
import yaml from 'js-yaml';
import IntelligentRoutingChart from '../IntelligentRoutingChart';
import { useGitHubAuth } from '../../hooks/useGitHubAuth';
import { Badge, Button, Checkbox, Input, Label, Panel, Select, Spinner } from '../ui';
import { cn } from '../../utils/cn';
import CoalesceConflictModal from './CoalesceConflictModal';

const checkStageMetrics = (entry, format) => {
    let parsedStage = null;
    let normalized = null;

    const content = entry.raw_report || entry.content;
    if (format === 'inference-perf') {
        try {
            const parsed = typeof content === 'string' ? yaml.load(content) : content;
            parsedStage = parsed;
            const throughput = parsed?.throughput || parsed?.metrics?.throughput || 0;
            let latencyVal = 0;
            if (typeof parsed?.latency === 'number') {
                latencyVal = parsed.latency;
            } else if (parsed?.latency && typeof parsed.latency === 'object') {
                latencyVal = parsed.latency.mean || parsed.latency.request_latency?.mean || 0;
            } else if (parsed?.metrics?.latency) {
                latencyVal = typeof parsed.metrics.latency === 'number' ? parsed.metrics.latency : parsed.metrics.latency.mean || 0;
            }
            normalized = {
                throughput,
                latency: latencyVal,
                model_name: (parsed?.model && parsed.model !== 'Unknown' && parsed.model !== 'Unknown Model') ? parsed.model : "",
                hardware: (parsed?.hardware || parsed?.accelerator) && (parsed.hardware || parsed.accelerator) !== 'Unknown' && (parsed.hardware || parsed.accelerator) !== 'Unknown Hardware' ? (parsed.hardware || parsed.accelerator) : "",
                inference_tool: (parsed?.inference_tool || parsed?.backend) && (parsed.inference_tool || parsed.backend) !== 'Unknown' ? (parsed.inference_tool || parsed.backend) : ""
            };
        } catch {
            // failed
        }
    } else {
        try {
            parsedStage = parseReportV02(content, entry.filename);
            if (parsedStage) {
                normalized = stageToEntry(parsedStage);
            }
        } catch {
            // failed
        }
    }

    const latencyVal = normalized?.latency && typeof normalized.latency === 'object' ? normalized.latency.mean : normalized?.latency;
    const rawTimestamp = entry.raw_report?.run?.time?.start || entry.raw_report?.timestamp || entry.timestamp;
    let formattedTimestamp = 'N/A';
    if (rawTimestamp) {
        const d = new Date(rawTimestamp);
        if (!isNaN(d.getTime())) {
            formattedTimestamp = d.toLocaleString();
        }
    }

    return {
        stageIndex: entry.prism_stage_index ?? (parsedStage?.stageIndex ?? entry.stage ?? 0),
        filename: entry.filename,
        rawTimestamp,
        timestamp: formattedTimestamp,
        throughput: {
            val: normalized?.throughput,
            isValid: typeof normalized?.throughput === 'number' && normalized.throughput > 0
        },
        latency: {
            val: latencyVal,
            isValid: typeof latencyVal === 'number' && latencyVal > 0
        },
        ttft: {
            val: parsedStage?.performance?.ttftMean ?? null,
            isValid: format === 'inference-perf' ? true : (typeof parsedStage?.performance?.ttftMean === 'number' && parsedStage.performance.ttftMean > 0)
        },
        tpot: {
            val: parsedStage?.performance?.tpotMean ?? null,
            isValid: format === 'inference-perf' ? true : (typeof parsedStage?.performance?.tpotMean === 'number' && parsedStage.performance.tpotMean > 0)
        },
        hardware: {
            val: normalized?.hardware || parsedStage?.scenario?.hardware,
            isValid: !!(normalized?.hardware || parsedStage?.scenario?.hardware) && (normalized?.hardware || parsedStage?.scenario?.hardware) !== 'Unknown' && (normalized?.hardware || parsedStage?.scenario?.hardware) !== 'Unknown Hardware'
        },
        stack: {
            val: normalized?.inference_tool || parsedStage?.scenario?.harness || parsedStage?.scenario?.stack?.[0]?.standardized?.tool,
            isValid: !!(normalized?.inference_tool || parsedStage?.scenario?.harness || parsedStage?.scenario?.stack?.[0]?.standardized?.tool)
        }
    };
};

export default function UploadValidationPage({ onNavigateBack, onNavigate, dashboardState, dashboardData, initialIntent }) {
    const {
        baselineBenchmarkKey: _baselineBenchmarkKey,
        setBaselineBenchmarkKey: _setBaselineBenchmarkKey
    } = dashboardState;

    const {
        data: publicBenchmarks = [],
        addToast,
        removeToast,
        toasts = [],
        brv02Runs,
        handleValidatedUpload: onCommit,
        loadSubmissions,
        loadAllData,
        clearAllBrv02Runs,
        promoteStagedRunId,
        removeBrv02Run
    } = dashboardData;

    const _existingRunIds = React.useMemo(() => brv02Runs.map(r => r.runId), [brv02Runs]);

    const [stagedFiles, setStagedFiles] = useState([]);
    const [manifestUrlInputs, setManifestUrlInputs] = useState({});
    const [evidenceUrlInputs, setEvidenceUrlInputs] = useState({});
    const hasInitialized = React.useRef(false);
    const [isDragging, setIsDragging] = useState(false);
    const [uploadIntent, setUploadIntent] = useState(() => {
        if (initialIntent) return initialIntent;
        const params = new URLSearchParams(window.location.search);
        return params.get('intent') || 'submit-review';
    }); // 'stage-locally' or 'submit-review'
    const [ingestionSource, setIngestionSource] = useState('local'); // 'local' or 'cloud'
    const [cloudPath, setCloudPath] = useState('');
    const [cloudProvider, setCloudProvider] = useState('gcs'); // 'gcs' or 's3'



    // Wizard navigation & Attribution states
    const { isAuthenticated, isConfigured, user, login, logout, accessToken } = useGitHubAuth();
    const [wizardStep, setWizardStep] = useState(1);
    const [dcoSigned, setDcoSigned] = useState(false);
    const [selectedReviewers, setSelectedReviewers] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [targetVisibility, setTargetVisibility] = useState('submitted_pending_review');
    const [_comparingBundleId, _setComparingBundleId] = useState(null);

    const [localModelFilter, _setLocalModelFilter] = useState('all');
    const [localHardwareFilter, _setLocalHardwareFilter] = useState('all');
    const [isUploadSidebarCollapsed, setIsUploadSidebarCollapsed] = useState(false);
    const prevStagedCountRef = React.useRef(0);

    // Coalescing & Selection states
    const [selectedBundleIds, setSelectedBundleIds] = useState([]);
    const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
    const [pendingCoalesceBundles, setPendingCoalesceBundles] = useState([]);
    const [draggedStageIndex, setDraggedStageIndex] = useState(null);
    const [stageSortConfig, setStageSortConfig] = useState({});
    const [hoveredFilenameTooltip, setHoveredFilenameTooltip] = useState(null);

    const handleFilenameMouseEnter = (e, filename) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const isNearTop = rect.top < 120;
        setHoveredFilenameTooltip({
            filename,
            x: rect.left + rect.width / 2,
            y: isNearTop ? rect.bottom + 8 : rect.top - 8,
            isNearTop
        });
    };

    const handleFilenameMouseLeave = () => {
        setHoveredFilenameTooltip(null);
    };

    // Selection handlers
    const toggleSelectBundle = (bundleId) => {
        setSelectedBundleIds(prev =>
            prev.includes(bundleId)
                ? prev.filter(id => id !== bundleId)
                : [...prev, bundleId]
        );
    };

    const toggleSelectAllBundles = () => {
        const visibleBundles = stagedFiles.filter(b => !b.isSkipped);
        if (selectedBundleIds.length === visibleBundles.length) {
            setSelectedBundleIds([]);
        } else {
            setSelectedBundleIds(visibleBundles.map(b => b.id));
        }
    };

    // Coalescing handler
    const handleCoalesceSelected = () => {
        const selectedBundles = stagedFiles.filter(b => selectedBundleIds.includes(b.id));
        if (selectedBundles.length < 2) {
            if (addToast) addToast("Select at least 2 staged benchmark runs to coalesce.", "warning");
            return;
        }

        // Check if there are metadata conflicts across selected bundles
        const fieldGetters = [
            b => b.name || b.payload?.runLabel,
            b => b.payload?.model_name,
            b => b.payload?.hardware?.hardware_name,
            b => b.payload?.hardware?.accelerator_count,
            b => b.payload?.inference_tool,
            b => b.payload?.inference_tool_version
        ];

        let hasConflicts = false;
        for (const getter of fieldGetters) {
            const values = new Set();
            selectedBundles.forEach(b => {
                const v = getter(b);
                if (v !== undefined && v !== null && String(v).trim() !== '') {
                    values.add(String(v).trim());
                }
            });
            if (values.size > 1) {
                hasConflicts = true;
                break;
            }
        }

        if (hasConflicts) {
            setPendingCoalesceBundles(selectedBundles);
            setIsConflictModalOpen(true);
        } else {
            // Direct coalesce without conflict modal
            const resolvedMetadata = {
                runLabel: selectedBundles[0].name || selectedBundles[0].payload?.runLabel || 'Coalesced Run',
                model_name: selectedBundles.find(b => b.payload?.model_name)?.payload?.model_name || '',
                hardware_name: selectedBundles.find(b => b.payload?.hardware?.hardware_name)?.payload?.hardware?.hardware_name || '',
                accelerator_count: selectedBundles.find(b => b.payload?.hardware?.accelerator_count)?.payload?.hardware?.accelerator_count || 1,
                inference_tool: selectedBundles.find(b => b.payload?.inference_tool)?.payload?.inference_tool || '',
                inference_tool_version: selectedBundles.find(b => b.payload?.inference_tool_version)?.payload?.inference_tool_version || ''
            };
            executeCoalesce(selectedBundles, resolvedMetadata);
        }
    };

    const executeCoalesce = (targetBundles, resolvedMetadata, isAuto = false) => {
        if (!targetBundles || targetBundles.length < 2) return;

        const coalescedId = uuidv4();
        const combinedEntries = [];
        const combinedStageFiles = [];
        let combinedRunMetadata = null;
        let combinedConfig = null;
        let combinedSummary = null;

        let globalStageIndex = 0;
        targetBundles.forEach(bundle => {
            if (bundle.stageFiles) {
                combinedStageFiles.push(...bundle.stageFiles);
            }
            if (bundle.metadataFiles?.run_metadata?.parsed) {
                combinedRunMetadata = bundle.metadataFiles.run_metadata.parsed;
            }
            if (bundle.metadataFiles?.config?.parsed) {
                combinedConfig = bundle.metadataFiles.config.parsed;
            }
            if (bundle.metadataFiles?.summary?.parsed) {
                combinedSummary = bundle.metadataFiles.summary.parsed;
            }

            const entries = bundle.payload?.entries || [];
            entries.forEach(entry => {
                const mutatedRawReport = mutateRawReportMetadata(entry.raw_report, {
                    model_name: resolvedMetadata.model_name,
                    hardware_name: resolvedMetadata.hardware_name,
                    runLabel: resolvedMetadata.runLabel,
                    inference_tool: resolvedMetadata.inference_tool
                });
                combinedEntries.push({
                    ...entry,
                    prism_stage_index: globalStageIndex++,
                    run_description: resolvedMetadata.runLabel || entry.run_description,
                    raw_report: mutatedRawReport
                });
            });
        });

        const newPayload = {
            runId: coalescedId,
            runLabel: resolvedMetadata.runLabel,
            model_name: resolvedMetadata.model_name,
            hardware: {
                hardware_name: resolvedMetadata.hardware_name,
                accelerator_count: resolvedMetadata.accelerator_count
            },
            attribution: targetBundles[0].payload?.attribution || null,
            manifests: targetBundles.reduce((acc, b) => ({ ...acc, ...(b.payload?.manifests || {}) }), {}),
            evidence: targetBundles.reduce((acc, b) => ({ ...acc, ...(b.payload?.evidence || {}) }), {}),
            format: "brv02",
            run_metadata: combinedRunMetadata || targetBundles[0].payload?.run_metadata || undefined,
            entries: combinedEntries,
            well_lit_path: targetBundles[0].payload?.well_lit_path || null,
            metadata: {},
            inference_tool: resolvedMetadata.inference_tool,
            inference_tool_version: resolvedMetadata.inference_tool_version,
            benchmark_harness: resolvedMetadata.benchmark_harness,
            benchmark_harness_version: resolvedMetadata.benchmark_harness_version,
            other_tools: targetBundles[0].payload?.other_tools || {},
            hardwareInferred: false,
            modelNameInferred: false,
            acceleratorCountInferred: false
        };

        const uploadValidation = validatePrismUploadStructure(newPayload, { isUpload: false });
        const bundleValidation = {
            format: 'brv02',
            hasHardware: !!resolvedMetadata.hardware_name,
            errors: uploadValidation.errors || [],
            warnings: uploadValidation.warnings || [],
            fieldErrors: uploadValidation.fieldErrors || {},
            entries: combinedEntries
        };

        const coalescedBundle = {
            id: coalescedId,
            dirKey: `coalesced-${coalescedId.slice(0, 8)}`,
            name: resolvedMetadata.runLabel,
            stageFiles: combinedStageFiles,
            metadataFiles: {
                run_metadata: combinedRunMetadata ? { parsed: combinedRunMetadata } : null,
                config: combinedConfig ? { parsed: combinedConfig } : null,
                summary: combinedSummary ? { parsed: combinedSummary } : null
            },
            payload: newPayload,
            validation: bundleValidation,
            isExpanded: true,
            isSkipped: false,
            isCoalesced: true,
            isAutoCoalesced: isAuto,
            originalSourceBundles: targetBundles,
            targetDashboards: targetBundles[0].targetDashboards || ['performance-browser']
        };

        const targetIds = new Set(targetBundles.map(b => b.id));
        setStagedFiles(prev => {
            const firstIdx = prev.findIndex(b => targetIds.has(b.id));
            const filtered = prev.filter(b => !targetIds.has(b.id));
            if (firstIdx >= 0) {
                filtered.splice(firstIdx, 0, coalescedBundle);
            } else {
                filtered.push(coalescedBundle);
            }
            return filtered;
        });

        setSelectedBundleIds([]);
        setIsConflictModalOpen(false);
        setPendingCoalesceBundles([]);

        if (addToast) {
            addToast(`Successfully coalesced ${targetBundles.length} runs into '${resolvedMetadata.runLabel}'.`, 'success');
        }
    };

    // Ungroup Handler
    const handleUngroupBundle = (bundleId) => {
        const bundle = stagedFiles.find(b => b.id === bundleId);
        if (!bundle || !bundle.originalSourceBundles || bundle.originalSourceBundles.length === 0) return;

        setStagedFiles(prev => {
            const idx = prev.findIndex(b => b.id === bundleId);
            if (idx < 0) return prev;
            const updated = [...prev];
            updated.splice(idx, 1, ...bundle.originalSourceBundles);
            return updated;
        });

        if (addToast) {
            addToast(`Ungrouped '${bundle.name}' back into ${bundle.originalSourceBundles.length} original runs.`, 'info');
        }
    };

    // Helper to get timestamp in epoch ms from a bundle
    const getBundleTimestamp = (bundle) => {
        if (bundle.payload?.submitted_at) {
            const t = new Date(bundle.payload.submitted_at).getTime();
            if (!isNaN(t) && t > 0) return t;
        }
        const firstReport = bundle.payload?.entries?.[0]?.raw_report;
        if (firstReport?.run?.time?.start) {
            const t = new Date(firstReport.run.time.start).getTime();
            if (!isNaN(t) && t > 0) return t;
        }
        if (firstReport?.timestamp) {
            const t = new Date(firstReport.timestamp).getTime();
            if (!isNaN(t) && t > 0) return t;
        }
        if (bundle.timestamp) {
            const t = new Date(bundle.timestamp).getTime();
            if (!isNaN(t) && t > 0) return t;
        }
        return null;
    };

    // Auto-Group Heuristic Handler
    const handleAutoGroup = () => {
        const uncoalesced = stagedFiles.filter(b => !b.isSkipped && !b.isCoalesced);
        if (uncoalesced.length < 2) {
            if (addToast) addToast("At least 2 un-coalesced runs are needed for auto-grouping.", "info");
            return;
        }

        // Group by normalized model_name + hardware_name + inference_tool
        const groupsMap = new Map();
        uncoalesced.forEach(bundle => {
            const m = (bundle.payload?.model_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const h = (bundle.payload?.hardware?.hardware_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const tool = (bundle.payload?.inference_tool || '').toLowerCase().trim();
            const key = `${m}::${h}::${tool}`;

            if (!groupsMap.has(key)) {
                groupsMap.set(key, [bundle]);
            } else {
                groupsMap.get(key).push(bundle);
            }
        });

        let autoGroupedCount = 0;
        let createdRunsCount = 0;

        const ONE_HOUR_MS = 60 * 60 * 1000;

        groupsMap.forEach((bundlesInGroup) => {
            // Cluster by timestamp proximity (<= 1 hour)
            const timeClusters = [];
            bundlesInGroup.forEach(bundle => {
                const ts = getBundleTimestamp(bundle);
                if (ts === null) {
                    let cluster = timeClusters.find(c => c.timestamp === null);
                    if (!cluster) {
                        cluster = { timestamp: null, bundles: [] };
                        timeClusters.push(cluster);
                    }
                    cluster.bundles.push(bundle);
                } else {
                    let cluster = timeClusters.find(c => c.timestamp !== null && Math.abs(c.timestamp - ts) <= ONE_HOUR_MS);
                    if (!cluster) {
                        cluster = { timestamp: ts, bundles: [] };
                        timeClusters.push(cluster);
                    }
                    cluster.bundles.push(bundle);
                }
            });

            timeClusters.forEach(cluster => {
                if (cluster.bundles.length >= 2) {
                    const bundlesToCoalesce = cluster.bundles;
                    const resolvedMetadata = {
                        runLabel: bundlesToCoalesce[0].name || bundlesToCoalesce[0].payload?.runLabel || 'Auto-Grouped Run',
                        model_name: bundlesToCoalesce.find(b => b.payload?.model_name)?.payload?.model_name || '',
                        hardware_name: bundlesToCoalesce.find(b => b.payload?.hardware?.hardware_name)?.payload?.hardware?.hardware_name || '',
                        accelerator_count: bundlesToCoalesce.find(b => b.payload?.hardware?.accelerator_count)?.payload?.hardware?.accelerator_count || 1,
                        inference_tool: bundlesToCoalesce.find(b => b.payload?.inference_tool)?.payload?.inference_tool || '',
                        inference_tool_version: bundlesToCoalesce.find(b => b.payload?.inference_tool_version)?.payload?.inference_tool_version || ''
                    };
                    executeCoalesce(bundlesToCoalesce, resolvedMetadata, true);
                    autoGroupedCount += bundlesToCoalesce.length;
                    createdRunsCount++;
                }
            });
        });

        if (createdRunsCount > 0) {
            if (addToast) {
                addToast(`Auto-grouped ${autoGroupedCount} runs into ${createdRunsCount} coalesced benchmark run(s).`, 'success');
            }
        } else {
            if (addToast) {
                addToast("No matching candidate runs found for auto-grouping.", "info");
            }
        }
    };

    // Stage Re-ordering Handler
    const handleMoveStage = (bundleId, fromIndex, toIndex) => {
        setStagedFiles(prev => prev.map(bundle => {
            if (bundle.id !== bundleId) return bundle;
            const entries = [...(bundle.payload?.entries || [])];
            if (fromIndex < 0 || fromIndex >= entries.length || toIndex < 0 || toIndex >= entries.length) return bundle;

            const [moved] = entries.splice(fromIndex, 1);
            entries.splice(toIndex, 0, moved);

            const reindexedEntries = entries.map((entry, idx) => ({
                ...entry,
                prism_stage_index: idx
            }));

            const updatedPayload = {
                ...bundle.payload,
                entries: reindexedEntries
            };

            const uploadValidation = validatePrismUploadStructure(updatedPayload, { isUpload: false });
            return {
                ...bundle,
                payload: updatedPayload,
                validation: {
                    ...bundle.validation,
                    errors: uploadValidation.errors || [],
                    warnings: uploadValidation.warnings || [],
                    fieldErrors: uploadValidation.fieldErrors || {}
                }
            };
        }));
    };

    // Stage Column Sorting Handler
    const handleSortStages = (bundleId, column) => {
        setStagedFiles(prev => prev.map(bundle => {
            if (bundle.id !== bundleId || !bundle.payload?.entries || bundle.payload.entries.length < 2) {
                return bundle;
            }

            const currentConfig = stageSortConfig[bundleId] || { column: null, direction: 'asc' };
            const newDirection = (currentConfig.column === column && currentConfig.direction === 'asc') ? 'desc' : 'asc';

            setStageSortConfig(prevConfig => ({
                ...prevConfig,
                [bundleId]: { column, direction: newDirection }
            }));

            const entriesWithMetrics = bundle.payload.entries.map(entry => ({
                entry,
                check: checkStageMetrics(entry, bundle.payload.format)
            }));

            entriesWithMetrics.sort((a, b) => {
                let valA, valB;
                if (column === 'filename') {
                    valA = (a.check.filename || '').split('/').pop();
                    valB = (b.check.filename || '').split('/').pop();
                    const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
                    return newDirection === 'asc' ? cmp : -cmp;
                } else if (column === 'timestamp') {
                    valA = a.check.rawTimestamp ? new Date(a.check.rawTimestamp).getTime() : 0;
                    valB = b.check.rawTimestamp ? new Date(b.check.rawTimestamp).getTime() : 0;
                } else if (column === 'throughput') {
                    valA = a.check.throughput?.val ?? 0;
                    valB = b.check.throughput?.val ?? 0;
                } else if (column === 'latency') {
                    valA = a.check.latency?.val ?? 0;
                    valB = b.check.latency?.val ?? 0;
                } else if (column === 'ttft') {
                    valA = a.check.ttft?.val ?? 0;
                    valB = b.check.ttft?.val ?? 0;
                } else if (column === 'tpot') {
                    valA = a.check.tpot?.val ?? 0;
                    valB = b.check.tpot?.val ?? 0;
                } else if (column === 'hardware') {
                    valA = a.check.hardware?.val || '';
                    valB = b.check.hardware?.val || '';
                    const cmp = valA.localeCompare(valB, undefined, { sensitivity: 'base' });
                    return newDirection === 'asc' ? cmp : -cmp;
                } else if (column === 'stack') {
                    valA = a.check.stack?.val || '';
                    valB = b.check.stack?.val || '';
                    const cmp = valA.localeCompare(valB, undefined, { sensitivity: 'base' });
                    return newDirection === 'asc' ? cmp : -cmp;
                } else {
                    return 0;
                }

                const diff = valA - valB;
                return newDirection === 'asc' ? diff : -diff;
            });

            const sortedEntries = entriesWithMetrics.map(({ entry }, idx) => ({
                ...entry,
                prism_stage_index: idx
            }));

            const updatedPayload = {
                ...bundle.payload,
                entries: sortedEntries
            };

            const uploadValidation = validatePrismUploadStructure(updatedPayload, { isUpload: false });
            return {
                ...bundle,
                payload: updatedPayload,
                validation: {
                    ...bundle.validation,
                    errors: uploadValidation.errors || [],
                    warnings: uploadValidation.warnings || [],
                    fieldErrors: uploadValidation.fieldErrors || {}
                }
            };
        }));
    };

    React.useEffect(() => {
        if (stagedFiles.length === 0) {
            setIsUploadSidebarCollapsed(false);
        }
        prevStagedCountRef.current = stagedFiles.length;
    }, [stagedFiles.length, wizardStep]);

    const getSimilarBenchmarks = (bundle) => {
        if (!bundle || !bundle.payload) return [];
        const model = bundle.payload.model_name;
        const hardware = bundle.payload.hardware?.hardware_name;
        if (!model || !hardware) return [];
        
        const cleanModel = model.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanHw = hardware.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        return publicBenchmarks.filter(b => {
            const bModel = (b.model_name || b.model || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const bHw = (b.hardware_name || b.hardware || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return bModel.includes(cleanModel) && bHw.includes(cleanHw);
        });
    };




    const clearInferredField = (bundleId, inferredKey) => {
        setStagedFiles(prev => prev.map(b => {
            if (b.id === bundleId && b.payload && b.payload[inferredKey]) {
                return {
                    ...b,
                    payload: {
                        ...b.payload,
                        [inferredKey]: false
                    }
                };
            }
            return b;
        }));
    };

    const updateSingleField = (bundleId, key, value) => {
        setStagedFiles(prev => prev.map(b => {
            if (b.id === bundleId) {
                const updatedPayload = { ...b.payload };
                if (key === 'model_name') {
                    updatedPayload.model_name = value;
                    updatedPayload.modelNameInferred = false;
                } else if (key === 'hardware_name') {
                    updatedPayload.hardware = { ...updatedPayload.hardware, hardware_name: value };
                    updatedPayload.hardwareInferred = false;
                } else if (key === 'accelerator_count') {
                    updatedPayload.hardware = { 
                        ...updatedPayload.hardware, 
                        accelerator_count: value !== '' ? parseInt(value, 10) : null 
                    };
                    updatedPayload.acceleratorCountInferred = false;
                } else if (key === 'runLabel') {
                    updatedPayload.runLabel = value;
                } else {
                    updatedPayload[key] = value;
                }

                if (updatedPayload.entries && (key === 'model_name' || key === 'hardware_name' || key === 'runLabel')) {
                    updatedPayload.entries = updatedPayload.entries.map(entry => ({
                        ...entry,
                        run_description: updatedPayload.runLabel || entry.run_description,
                        raw_report: mutateRawReportMetadata(entry.raw_report, {
                            model_name: updatedPayload.model_name,
                            hardware_name: updatedPayload.hardware?.hardware_name,
                            runLabel: updatedPayload.runLabel
                        })
                    }));
                }
                const uploadValidation = validatePrismUploadStructure(updatedPayload, { isUpload: false });
                const updatedValidation = {
                    ...b.validation,
                    hasHardware: !!updatedPayload.hardware?.hardware_name && updatedPayload.hardware.hardware_name.trim() !== '' && updatedPayload.hardware.hardware_name !== 'Unknown' && updatedPayload.hardware.hardware_name !== 'Unknown Hardware',
                    errors: uploadValidation.errors,
                    warnings: uploadValidation.warnings,
                    fieldErrors: uploadValidation.fieldErrors
                };
                const returnObj = { ...b, payload: updatedPayload, validation: updatedValidation };
                if (key === 'runLabel') {
                    returnObj.name = value;
                }
                return returnObj;
            }
            return b;
        }));
    };

    const parseManifestAndFillGaps = (bundleId, fileName, fileContent) => {
        let parsed = null;
        try {
            if (fileName.endsWith('.json')) {
                parsed = JSON.parse(fileContent);
            } else if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
                parsed = yaml.load(fileContent);
            }
        } catch (e) {
            console.error("Failed to parse attached manifest file:", e);
            if (addToast) addToast(`Failed to parse ${fileName}: ${e.message}`, "error");
            return;
        }

        if (!parsed) return;

        setStagedFiles(prev => prev.map(b => {
            if (b.id !== bundleId) return b;

            const updatedPayload = { ...b.payload };
            
            // Auto-fill hardware, model, inference stack, etc. from Kubernetes/manifest/config structures
            let resolvedModel = updatedPayload.model_name;
            let resolvedHw = updatedPayload.hardware?.hardware_name;
            let resolvedCount = updatedPayload.hardware?.accelerator_count;
            let resolvedTool = updatedPayload.inference_tool;
            let resolvedToolVer = updatedPayload.inference_tool_version;
            let resolvedWellLit = updatedPayload.well_lit_path;

            // 1. Check if it is a K8s manifest
            const containers = parsed?.spec?.template?.spec?.containers || [];
            if (containers.length > 0) {
                // Parse container images & specs
                containers.forEach(c => {
                    // Inference tool
                    const img = String(c.image || '').toLowerCase();
                    if (img.includes('vllm')) resolvedTool = 'vLLM';
                    else if (img.includes('sglang')) resolvedTool = 'SGLang';
                    else if (img.includes('tgi')) resolvedTool = 'TGI';
                    else if (img.includes('tensorrt') || img.includes('trt')) resolvedTool = 'TensorRT-LLM';

                    // Model from args
                    if (Array.isArray(c.args)) {
                        const modelIdx = c.args.findIndex(arg => arg === '--model' || arg === '--model-name' || arg === '-m');
                        if (modelIdx !== -1 && c.args[modelIdx + 1]) {
                            resolvedModel = c.args[modelIdx + 1];
                        }
                        const tpIdx = c.args.findIndex(arg => arg === '--tensor-parallel-size' || arg === '--tp');
                        if (tpIdx !== -1 && c.args[tpIdx + 1]) {
                            resolvedCount = parseInt(c.args[tpIdx + 1]) || resolvedCount;
                        }
                    }

                    // Resource limits (GPUs/TPUs)
                    const limits = c.resources?.limits || {};
                    const gpuLimit = limits['nvidia.com/gpu'] || limits['google.com/tpu'] || limits['tpu'];
                    if (gpuLimit) {
                        resolvedCount = parseInt(gpuLimit) || resolvedCount;
                    }
                });

                // Node selector / accelerator label
                const nodeSelector = parsed?.spec?.template?.spec?.nodeSelector || {};
                const gkeAcc = nodeSelector['cloud.google.com/gke-accelerator'] || nodeSelector['accelerator'];
                if (gkeAcc) {
                    const accLower = gkeAcc.toLowerCase();
                    if (accLower.includes('h100')) resolvedHw = 'H100';
                    else if (accLower.includes('a100')) resolvedHw = 'A100';
                    else if (accLower.includes('l4')) resolvedHw = 'L4';
                    else if (accLower.includes('t4')) resolvedHw = 'T4';
                    else resolvedHw = gkeAcc;
                }
            } else {
                // 2. Simple config JSON/YAML file properties
                const hw = parsed.hardware || parsed.hardware_name || parsed.accelerator || parsed.device;
                if (hw) resolvedHw = hw;

                const model = parsed.model || parsed.model_name || parsed.modelId;
                if (model) resolvedModel = model;

                const count = parsed.accelerator_count || parsed.gpus || parsed.gpu_count || parsed.chip_count;
                if (count) resolvedCount = parseInt(count) || resolvedCount;

                const tool = parsed.inference_tool || parsed.engine || parsed.serving_engine;
                if (tool) resolvedTool = tool;

                const ver = parsed.inference_tool_version || parsed.engine_version;
                if (ver) resolvedToolVer = ver;

                const wellLit = parsed.well_lit_path || parsed.wellLitPath || parsed.path;
                if (wellLit) resolvedWellLit = wellLit;
            }

            // Update payload
            updatedPayload.model_name = resolvedModel;
            updatedPayload.hardware = { 
                ...updatedPayload.hardware, 
                hardware_name: resolvedHw, 
                accelerator_count: resolvedCount 
            };
            updatedPayload.inference_tool = resolvedTool;
            updatedPayload.inference_tool_version = resolvedToolVer;
            updatedPayload.well_lit_path = resolvedWellLit;

            // Re-validate structure
            const uploadValidation = validatePrismUploadStructure(updatedPayload, { isUpload: false });

            // Store the manifest file in attachedManifests list
            const attachedManifests = b.attachedManifests || [];
            // Remove duplicate if file with same name was already attached
            const filteredManifests = attachedManifests.filter(m => m.name !== fileName);
            filteredManifests.push({ name: fileName, content: fileContent });

            return {
                ...b,
                payload: updatedPayload,
                attachedManifests: filteredManifests,
                validation: {
                    ...b.validation,
                    errors: uploadValidation.errors,
                    warnings: uploadValidation.warnings,
                    fieldErrors: uploadValidation.fieldErrors,
                    hasHardware: resolvedHw && resolvedHw !== 'Unknown' && resolvedHw !== 'Unknown Hardware'
                }
            };
        }));

        if (addToast) addToast(`Successfully parsed metadata from ${fileName}`, "success");
    };

    const removeAttachedManifest = (bundleId, fileName) => {
        setStagedFiles(prev => prev.map(b => {
            if (b.id !== bundleId) return b;
            const updatedAttached = (b.attachedManifests || []).filter(m => m.name !== fileName);
            return {
                ...b,
                attachedManifests: updatedAttached
            };
        }));
    };

    const getFilenameFromUrl = (url, fallbackPrefix = 'file') => {
        try {
            const u = new URL(url);
            const pathname = u.pathname;
            const name = pathname.substring(pathname.lastIndexOf('/') + 1);
            if (name && name.trim() !== '') return name;
        } catch {
            const lastSlash = url.lastIndexOf('/');
            if (lastSlash !== -1) {
                const name = url.substring(lastSlash + 1);
                if (name && name.trim() !== '') return name;
            }
        }
        return `${fallbackPrefix}_${Math.random().toString(36).substring(7)}`;
    };

    const handleAddManifestUrl = (bundleId) => {
        const url = (manifestUrlInputs[bundleId] || '').trim();
        if (!url) return;
        
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('gs://') && !url.startsWith('s3://')) {
            if (addToast) addToast("URL must start with http://, https://, gs://, or s3://", "error");
            return;
        }

        const name = getFilenameFromUrl(url, 'manifest');
        addManifestToBundle(bundleId, name, url);
        setManifestUrlInputs(prev => ({ ...prev, [bundleId]: '' }));
    };

    const handleAddEvidenceUrl = (bundleId) => {
        const url = (evidenceUrlInputs[bundleId] || '').trim();
        if (!url) return;
        
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('gs://') && !url.startsWith('s3://')) {
            if (addToast) addToast("URL must start with http://, https://, gs://, or s3://", "error");
            return;
        }

        const name = getFilenameFromUrl(url, 'evidence');
        addEvidenceToBundle(bundleId, name, url);
        setEvidenceUrlInputs(prev => ({ ...prev, [bundleId]: '' }));
    };

    const attachEvidenceFile = (bundleId, file) => {
        const reader = new FileReader();
        reader.onload = (evt) => {
            setStagedFiles(prev => prev.map(b => {
                if (b.id !== bundleId) return b;
                const attached = b.attachedEvidence || [];
                const filtered = attached.filter(e => e.name !== file.name);
                filtered.push({ name: file.name, content: evt.target.result });
                return {
                    ...b,
                    attachedEvidence: filtered
                };
            }));
            if (addToast) addToast(`Attached evidence log ${file.name}`, "success");
        };
        reader.readAsText(file);
    };

    const removeAttachedEvidence = (bundleId, fileName) => {
        setStagedFiles(prev => prev.map(b => {
            if (b.id !== bundleId) return b;
            const updated = (b.attachedEvidence || []).filter(e => e.name !== fileName);
            return {
                ...b,
                attachedEvidence: updated
            };
        }));
    };

    const addManifestToBundle = (bundleId, name, url) => {
        setStagedFiles(prev => prev.map(b => {
            if (b.id === bundleId) {
                const manifests = { ...(b.payload.manifests || {}), [name]: url };
                const updatedPayload = { ...b.payload, manifests };
                return { ...b, payload: updatedPayload };
            }
            return b;
        }));
    };

    const removeManifestFromBundle = (bundleId, name) => {
        setStagedFiles(prev => prev.map(b => {
            if (b.id === bundleId) {
                const manifests = { ...(b.payload.manifests || {}) };
                delete manifests[name];
                const updatedPayload = { ...b.payload, manifests };
                return { ...b, payload: updatedPayload };
            }
            return b;
        }));
    };

    const addEvidenceToBundle = (bundleId, name, url) => {
        setStagedFiles(prev => prev.map(b => {
            if (b.id === bundleId) {
                const evidence = { ...(b.payload.evidence || {}), [name]: url };
                const updatedPayload = { ...b.payload, evidence };
                return { ...b, payload: updatedPayload };
            }
            return b;
        }));
    };

    const removeEvidenceFromBundle = (bundleId, name) => {
        setStagedFiles(prev => prev.map(b => {
            if (b.id === bundleId) {
                const evidence = { ...(b.payload.evidence || {}) };
                delete evidence[name];
                const updatedPayload = { ...b.payload, evidence };
                return { ...b, payload: updatedPayload };
            }
            return b;
        }));
    };

    const handleCloudScan = () => {
        if (!cloudPath || (!cloudPath.startsWith('gs://') && !cloudPath.startsWith('s3://'))) {
            if (addToast) addToast("Please enter a valid GCS (gs://...) or S3 (s3://...) path.", "error");
            return;
        }
        
        const runName = cloudPath.split('/').filter(Boolean).pop() || 'cloud-run';
        
        const payload = {
            runId: uuidv4(),
            runLabel: runName,
            model_name: "meta-llama/Llama-3-8B-Instruct",
            hardware: {
                hardware_name: "H100",
                accelerator_count: 8
            },
            attribution: null,
            manifests: {
                "vllm_service": "https://github.com/kubernetes-sigs/inference-perf/blob/main/manifests/vllm.yaml"
            },
            evidence: {
                "run_log": "gs://llm-d-benchmarks/regressions/optimized-baseline/gemma2_9b/run.log"
            },
            format: "brv02",
            entries: [
                {
                    run_id: uuidv4(),
                    run_description: runName,
                    run_uid: `cloud-${runName}-stage-1`,
                    filename: "benchmark_report_v0.2_stage_1.yaml",
                    raw_report: {
                        version: "0.2",
                        run: { uid: `cloud-${runName}-stage-1` },
                        scenario: {
                            model: "meta-llama/Llama-3-8B-Instruct",
                            stack: [
                                { config: { accelerator: { model: "H100" } } },
                                { standardized: { tool: "vllm", tool_version: "v0.4.2" } }
                            ]
                        },
                        results: {
                            request_performance: {
                                aggregate: {
                                    throughput: { request_rate: { mean: 2.5 }, output_token_rate: { mean: 45.2 }, total_token_rate: { mean: 120.0 } },
                                    latency: {
                                        request_latency: { mean: 0.245, p50: 0.24, p99: 0.35 },
                                        time_to_first_token: { mean: 0.15, p50: 0.15, p99: 0.25 },
                                        time_per_output_token: { mean: 0.02, p50: 0.02, p99: 0.04 }
                                    }
                                }
                            }
                        }
                    },
                    prism_cloud: {
                        run: { uid: `${runName}/benchmark_report_v0.2_stage_1.yaml` }
                    }
                }
            ],
            well_lit_path: "optimized-baseline",
            metadata: {},
            inference_tool: "vllm",
            inference_tool_version: "v0.4.2",
            other_tools: {}
        };

        const bundleValidation = {
            format: 'brv02',
            hasHardware: true,
            errors: [],
            warnings: [],
            entries: [{ model_name: "meta-llama/Llama-3-8B-Instruct", stage: 1 }]
        };

        const cloudBundle = {
            id: uuidv4(),
            dirKey: cloudPath.replace(/^(gs:\/\/|s3:\/\/)/, ''),
            name: runName,
            stageFiles: [],
            metadataFiles: {},
            payload,
            validation: bundleValidation,
            isExpanded: true,
            isSkipped: false,
            targetDashboards: ['performance-browser']
        };

        setStagedFiles(prev => {
            const combined = [...prev, cloudBundle];
            combined.sort((a, b) => a.dirKey.localeCompare(b.dirKey, undefined, { numeric: true, sensitivity: 'base' }));
            return combined;
        });

        if (addToast) {
            addToast(`Successfully scanned and staged 1 run bundle from ${cloudPath}.`, 'success');
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const getFilePath = (file) => (file && (file.webkitRelativePath || file.name)) || '';

    const processFiles = async (files) => {
        let uploadedCount = 0;

        const groups = {};
        const standaloneFiles = [];

        for (const file of files) {
            const relPath = getFilePath(file);
            
            // Get parent directory key
            if (relPath.includes('/')) {
                const parts = relPath.split('/');
                parts.pop();
                const dirKey = parts.join('/');
                if (!groups[dirKey]) {
                    groups[dirKey] = {
                        id: uuidv4(),
                        dirKey,
                        name: dirKey.split('/').pop(),
                        isDirUpload: true,
                        files: []
                    };
                }
                groups[dirKey].files.push(file);
            } else {
                standaloneFiles.push(file);
            }
        }

        const standaloneConfigs = [];
        const standaloneMetadata = [];
        const standaloneSummaries = [];
        const standaloneReportFiles = [];

        for (const file of standaloneFiles) {
            const filename = getFilePath(file);
            let content = '';
            try {
                content = await file.text();
            } catch (e) {
                console.warn(`Failed to read file ${filename}:`, e);
                continue;
            }

            if (/run_metadata\.ya?ml$/i.test(filename)) {
                try {
                    const parsed = yaml.load(content);
                    standaloneMetadata.push({ file, content, parsed });
                } catch (e) {
                    console.warn("Failed to parse run_metadata.yaml:", e);
                }
            } else if (/config\.ya?ml$/i.test(filename)) {
                try {
                    const parsed = yaml.load(content);
                    standaloneConfigs.push({ file, content, parsed });
                } catch (e) {
                    console.warn("Failed to parse config.yaml:", e);
                }
            } else if (/summary_lifecycle_metrics\.json$/i.test(filename)) {
                try {
                    const parsed = JSON.parse(content);
                    standaloneSummaries.push({ file, content, parsed });
                } catch (e) {
                    console.warn("Failed to parse summary_lifecycle_metrics.json:", e);
                }
            } else if (/\.(ya?ml|json)$/i.test(filename)) {
                const validation = validateBenchmark(content, filename);
                if (validation.format) {
                    standaloneReportFiles.push({ file, content, validation });
                }
            }
        }

        // Group the standalone report files
        const brv02StandaloneGroups = [];
        for (const item of standaloneReportFiles) {
            if (item.validation.format === 'brv02') {
                const parsedStage = parseReportV02(item.content, getFilePath(item.file));
                if (!parsedStage) {
                    const tempId = uuidv4();
                    brv02StandaloneGroups.push({
                        id: tempId,
                        dirKey: `staged-${tempId}`,
                        name: '',
                        files: [item.file],
                        parsedStages: [{ file: item.file, content: item.content, validation: item.validation }]
                    });
                    continue;
                }

                let targetGroup = null;
                if (parsedStage.runUid) {
                    targetGroup = brv02StandaloneGroups.find(g => g.runUid === parsedStage.runUid);
                }
                if (!targetGroup) {
                    const recordMetaStr = canonicalStringify(parsedStage.loadMetadata);
                    if (recordMetaStr && recordMetaStr !== '') {
                        targetGroup = brv02StandaloneGroups.find(g => {
                            const groupMetaStr = canonicalStringify(g.loadMetadata);
                            return groupMetaStr === recordMetaStr;
                        });
                    }
                }

                if (targetGroup) {
                    targetGroup.files.push(item.file);
                    targetGroup.parsedStages.push({ file: item.file, content: item.content, validation: item.validation });
                } else {
                    const tempId = uuidv4();
                    brv02StandaloneGroups.push({
                        id: tempId,
                        dirKey: parsedStage.runUid || `staged-${tempId}`,
                        name: parsedStage.runLabel || '',
                        runUid: parsedStage.runUid,
                        loadMetadata: parsedStage.loadMetadata,
                        files: [item.file],
                        parsedStages: [{ file: item.file, content: item.content, validation: item.validation }]
                    });
                }
            } else {
                // inference-perf standalone file
                const tempId = uuidv4();
                const baseName = item.file.name.replace(/\.(ya?ml|json)$/i, '');
                brv02StandaloneGroups.push({
                    id: tempId,
                    dirKey: `staged-${tempId}`,
                    name: baseName,
                    files: [item.file],
                    parsedStages: [{ file: item.file, content: item.content, validation: item.validation }]
                });
            }
        }

        const groupsToProcess = [];

        // 1. Add directory-based groups
        for (const groupKey of Object.keys(groups)) {
            groupsToProcess.push({
                ...groups[groupKey],
                preParsedStages: null,
                standaloneMetadata: null,
                standaloneConfigs: null,
                standaloneSummaries: null
            });
        }

        // 2. Add standalone groups
        for (const sg of brv02StandaloneGroups) {
            groupsToProcess.push({
                id: sg.id,
                dirKey: sg.dirKey,
                name: sg.name,
                files: sg.files,
                preParsedStages: sg.parsedStages,
                standaloneMetadata,
                standaloneConfigs,
                standaloneSummaries
            });
        }

        const newStagedBundles = [];

        for (const group of groupsToProcess) {
            const stageFiles = [];
            let runMetadataFile = null;
            let configFile = null;
            let summaryFile = null;

            let runMetadata = null;
            let configParsed = null;
            let summaryParsed = null;

            if (group.preParsedStages) {
                if (group.standaloneMetadata && group.standaloneMetadata.length > 0) {
                    runMetadataFile = group.standaloneMetadata[0].file;
                    runMetadata = group.standaloneMetadata[0].parsed;
                }
                if (group.standaloneConfigs && group.standaloneConfigs.length > 0) {
                    configFile = group.standaloneConfigs[0].file;
                    configParsed = group.standaloneConfigs[0].parsed;
                }
                if (group.standaloneSummaries && group.standaloneSummaries.length > 0) {
                    summaryFile = group.standaloneSummaries[0].file;
                    summaryParsed = group.standaloneSummaries[0].parsed;
                }
            } else {
                for (const file of group.files) {
                    const filename = file.name || '';
                    
                    if (/run_metadata\.ya?ml$/i.test(filename)) {
                        runMetadataFile = file;
                    } else if (/config\.ya?ml$/i.test(filename)) {
                        configFile = file;
                    } else if (/summary_lifecycle_metrics\.json$/i.test(filename)) {
                        summaryFile = file;
                    } else if (/\.(ya?ml|json)$/i.test(filename)) {
                        stageFiles.push(file);
                    }
                }

                if (stageFiles.length === 0 && !runMetadataFile && !configFile) {
                    continue;
                }

                if (runMetadataFile) {
                    try {
                        const text = await runMetadataFile.text();
                        runMetadata = yaml.load(text);
                    } catch (e) {
                        console.warn("Failed to parse run_metadata.yaml:", e);
                    }
                }
                if (configFile) {
                    try {
                        const text = await configFile.text();
                        configParsed = yaml.load(text);
                    } catch (e) {
                        console.warn("Failed to parse config.yaml:", e);
                    }
                }
                if (summaryFile) {
                    try {
                        const text = await summaryFile.text();
                        summaryParsed = JSON.parse(text);
                    } catch (e) {
                        console.warn("Failed to parse summary_lifecycle_metrics.json:", e);
                    }
                }
            }

            const parsedStages = [];
            const bundleErrors = [];
            const bundleWarnings = [];
            let isFormatValid = false;
            let hasHardware = false;
            const entries = [];

            const filesToValidate = [];
            if (group.preParsedStages) {
                for (const sf of group.preParsedStages) {
                    filesToValidate.push({
                        file: sf.file,
                        content: sf.content,
                        validation: sf.validation
                    });
                }
            } else {
                for (const stageFile of stageFiles) {
                    filesToValidate.push({
                        file: stageFile,
                        content: null,
                        validation: null
                    });
                }
            }

            const validationFailures = [];

            for (const item of filesToValidate) {
                const file = item.file;
                const filePath = getFilePath(file);
                const content = item.content !== null ? item.content : await file.text();
                const validation = item.validation || validateBenchmark(content, filePath);

                if (validation.format) {
                    isFormatValid = true;
                    if (validation.hasHardware) hasHardware = true;
                    entries.push(...validation.entries);
                    bundleWarnings.push(...validation.warnings.map(w => `[${filePath}] ${w}`));
                    if (validation.errors.length > 0) {
                        bundleErrors.push(...validation.errors.map(e => `[${filePath}] ${e}`));
                    }
                    parsedStages.push({
                        file,
                        content,
                        validation
                    });
                } else {
                    const errStr = validation.errors[0] || 'Invalid report format.';
                    validationFailures.push({
                        filename: filePath,
                        error: errStr,
                        isUnrecognizedFormat: errStr.includes("Unrecognized benchmark format")
                    });
                }
            }

            const hasSuccessfulStages = parsedStages.length > 0;
            for (const failure of validationFailures) {
                if (hasSuccessfulStages && failure.isUnrecognizedFormat) {
                    continue;
                }
                bundleErrors.push(`[${failure.filename}] ${failure.error}`);
            }

            if (parsedStages.length === 0) {
                bundleErrors.push("No benchmark_report_v0.2 yaml files found in directory.");
            }

            let firstParsedStage = null;
            for (const sf of parsedStages) {
                const sfPath = getFilePath(sf.file);
                if (sf.validation && sf.validation.format) {
                    if (sf.validation.format === 'inference-perf') {
                        const parsed = sf.validation.parsedData || {};
                        const throughput = parsed.throughput || parsed.metrics?.throughput || 0;
                        let latencyVal = 0;
                        if (typeof parsed.latency === 'number') {
                            latencyVal = parsed.latency;
                        } else if (parsed.latency && typeof parsed.latency === 'object') {
                            latencyVal = parsed.latency.mean || parsed.latency.request_latency?.mean || 0;
                        } else if (parsed.metrics?.latency) {
                            latencyVal = typeof parsed.metrics.latency === 'number' ? parsed.metrics.latency : parsed.metrics.latency.mean || 0;
                        }

                        firstParsedStage = {
                            isInferencePerf: true,
                            model_name: parsed.model || "Unknown Model",
                            hardware: parsed.hardware || parsed.accelerator || "Unknown",
                            throughput,
                            latency: latencyVal,
                            runUid: sf.validation.prism_cloud?.original_uid || sfPath,
                            runCid: null,
                            runEid: null,
                            runPid: null
                        };
                        break;
                    } else {
                        const parsed = parseReportV02(sf.content, sfPath);
                        if (parsed) {
                            parsed.run_metadata = runMetadata;
                            parsed.config = configParsed;
                            firstParsedStage = parsed;
                            break;
                        }
                    }
                }
            }

            let resolvedModel = '';
            let resolvedHw = '';
            let resolvedCount = null;

            let hardwareInferred = false;
            let acceleratorCountInferred = false;
            let modelNameInferred = false;

            if (firstParsedStage) {
                if (firstParsedStage.isInferencePerf) {
                    resolvedModel = (firstParsedStage.model_name && firstParsedStage.model_name !== 'Unknown' && firstParsedStage.model_name !== 'Unknown Model') ? firstParsedStage.model_name : '';
                    resolvedHw = (firstParsedStage.hardware && firstParsedStage.hardware !== 'Unknown' && firstParsedStage.hardware !== 'Unknown Hardware') ? firstParsedStage.hardware : '';
                    resolvedCount = firstParsedStage.accelerator_count || 1;
                } else {
                    const normalized = stageToEntry(firstParsedStage);
                    resolvedModel = normalized.model_name || '';
                    resolvedHw = normalized.hardware || '';
                    resolvedCount = firstParsedStage.scenario?.acceleratorCount;

                    const rawHw = firstParsedStage.scenario?.hardware;
                    if (!rawHw || rawHw === 'Unknown' || rawHw === 'TPU' || rawHw === 'GPU') {
                        if (resolvedHw && resolvedHw !== 'Unknown' && resolvedHw !== 'TPU' && resolvedHw !== 'GPU') {
                            hardwareInferred = true;
                        }
                    }

                    const rawModel = firstParsedStage.scenario?.model;
                    if (!rawModel || rawModel === 'Unknown') {
                        if (resolvedModel && resolvedModel !== 'Unknown') {
                            modelNameInferred = true;
                        }
                    }

                    if (resolvedCount === null || resolvedCount === undefined) {
                        resolvedCount = 1;
                        acceleratorCountInferred = true;
                    }
                }
            } else {
                if (resolvedCount === null || resolvedCount === undefined) {
                    resolvedCount = 1;
                    acceleratorCountInferred = true;
                }
            }

            // Order of preference: run label > directory name (if dir upload) > model name
            let runLabelFromStage = '';
            if (firstParsedStage) {
                if (firstParsedStage.validation?.format === 'brv02') {
                    const stageParsed = parseReportV02(firstParsedStage.content, getFilePath(firstParsedStage.file));
                    runLabelFromStage = stageParsed?.runLabel || firstParsedStage.runLabel || '';
                } else {
                    runLabelFromStage = firstParsedStage.runLabel || '';
                }
            }

            const runLabelFromDir = group.isDirUpload ? (group.name || '') : '';
            const runLabelFromModel = resolvedModel || '';

            const groupName = (runLabelFromStage && runLabelFromStage.trim())
                || (runLabelFromDir && runLabelFromDir.trim())
                || (runLabelFromModel && runLabelFromModel.trim())
                || '';

            const payloadEntries = [];
            for (const sf of parsedStages) {
                const sfPath = getFilePath(sf.file);
                let runUid = 'unknown-uid';
                if (sf.validation && sf.validation.format === 'inference-perf') {
                    runUid = sf.validation.prism_cloud?.original_uid || sfPath;
                } else {
                    const stageParsed = parseReportV02(sf.content, sfPath);
                    runUid = stageParsed ? stageParsed.runUid : 'unknown-uid';
                }

                let rawReportObj = null;
                try {
                    rawReportObj = sfPath.endsWith('.json') ? JSON.parse(sf.content) : yaml.load(sf.content);
                } catch (e) {
                    console.error("Failed to parse raw report content into JSON object:", e);
                }

                payloadEntries.push({
                    run_id: uuidv4(),
                    run_description: groupName,
                    run_uid: runUid,
                    filename: sfPath,
                    raw_report: rawReportObj || {},
                    prism_cloud: {
                        run: {
                            uid: `${group.dirKey}/${sfPath}`
                        }
                    }
                });
            }

            let initialInferenceTool = "";
            let initialInferenceToolVersion = "";
            let initialBenchmarkHarness = "";
            let initialBenchmarkHarnessVersion = "";
            const initialOtherTools = {};
            if (firstParsedStage) {
                let rawReport = {};
                let stack = [];
                let inferenceEngine = null;

                if (firstParsedStage.isInferencePerf) {
                    const lowerKey = group.dirKey.toLowerCase();
                    if (lowerKey.includes('vllm')) initialInferenceTool = 'vLLM';
                    else if (lowerKey.includes('tgi')) initialInferenceTool = 'TGI';
                    else if (lowerKey.includes('sglang')) initialInferenceTool = 'SGLang';
                    else if (lowerKey.includes('trt') || lowerKey.includes('tensorrt')) initialInferenceTool = 'TensorRT-LLM';
                    initialInferenceToolVersion = '';
                    initialBenchmarkHarness = 'inference-perf';
                } else {
                    rawReport = parsedStages.find(sf => sf.validation && sf.validation.format === 'brv02')?.validation?.parsedData || {};
                    stack = rawReport?.scenario?.stack || [];
                    inferenceEngine = stack.find(c => 
                        c.standardized?.kind === 'inference_engine' || 
                        c.standardized?.role === 'decode' || 
                        c.standardized?.role === 'prefill' ||
                        c.standardized?.role === 'aggregate'
                    ) || stack.find(c => 
                        ['vllm', 'tgi', 'tensorrt', 'tensorrt_llm', 'sglang', 'ollama'].includes(String(c.standardized?.tool || '').toLowerCase())
                    );
                    if (inferenceEngine) {
                        initialInferenceTool = (inferenceEngine.standardized?.tool && inferenceEngine.standardized.tool !== 'unknown') ? inferenceEngine.standardized.tool : "";
                        initialInferenceToolVersion = (inferenceEngine.standardized?.tool_version && inferenceEngine.standardized.tool_version !== 'unknown') ? inferenceEngine.standardized.tool_version : "";
                    } else if (rawReport?.scenario?.load?.standardized?.tool) {
                        initialInferenceTool = (rawReport.scenario.load.standardized.tool && rawReport.scenario.load.standardized.tool !== 'unknown') ? rawReport.scenario.load.standardized.tool : "";
                        initialInferenceToolVersion = (rawReport.scenario.load.standardized.tool_version && rawReport.scenario.load.standardized.tool_version !== 'unknown') ? rawReport.scenario.load.standardized.tool_version : "";
                    }
                }

                const loadTool = rawReport?.scenario?.load?.standardized?.tool || firstParsedStage.scenario?.harness;
                const loadVer = rawReport?.scenario?.load?.standardized?.tool_version;
                if (loadTool && loadTool !== 'unknown') {
                    initialBenchmarkHarness = loadTool;
                    initialBenchmarkHarnessVersion = loadVer && loadVer !== 'unknown' ? loadVer : '';
                    if (loadTool.toLowerCase() !== initialInferenceTool.toLowerCase()) {
                        initialOtherTools[loadTool] = loadVer && loadVer !== 'unknown' ? loadVer : '';
                    }
                }

                stack.forEach(c => {
                    if (c === inferenceEngine) return;
                    const tool = c.standardized?.tool;
                    const version = c.standardized?.tool_version;
                    if (tool && tool !== 'unknown' && tool !== 'service' && tool.toLowerCase() !== initialInferenceTool.toLowerCase()) {
                        initialOtherTools[tool] = version && version !== 'unknown' ? version : '';
                    }
                });
            }

            const payload = {
                runId: group.id,
                runLabel: groupName,
                model_name: resolvedModel,
                hardware: {
                    hardware_name: resolvedHw,
                    accelerator_count: resolvedCount
                },
                attribution: null,
                manifests: {},
                evidence: {},
                format: "brv02",
                run_metadata: runMetadata || undefined,
                entries: payloadEntries,
                well_lit_path: null,
                metadata: {},
                inference_tool: initialInferenceTool,
                inference_tool_version: initialInferenceToolVersion,
                benchmark_harness: initialBenchmarkHarness,
                benchmark_harness_version: initialBenchmarkHarnessVersion,
                other_tools: initialOtherTools,
                hardwareInferred,
                modelNameInferred,
                acceleratorCountInferred
            };

            const uploadValidation = validatePrismUploadStructure(payload, { isUpload: false });
            if (!uploadValidation.isValid) {
                bundleErrors.push(...uploadValidation.errors);
            }
            if (uploadValidation.warnings && uploadValidation.warnings.length > 0) {
                bundleWarnings.push(...uploadValidation.warnings);
            }

            if (runMetadata && (runMetadata.accelerator || runMetadata.model)) {
                hasHardware = true;
            }
            if (configParsed && configParsed.kustomize?.acceleratorBackend) {
                hasHardware = true;
            }
            if (!resolvedHw || !resolvedHw.trim()) {
                hasHardware = false;
            }

            const bundleValidation = {
                format: isFormatValid ? 'brv02' : false,
                hasHardware,
                errors: bundleErrors,
                warnings: bundleWarnings,
                fieldErrors: uploadValidation.fieldErrors,
                entries
            };

            newStagedBundles.push({
                id: group.id,
                dirKey: group.dirKey,
                name: groupName,
                stageFiles: parsedStages,
                metadataFiles: {
                    run_metadata: runMetadataFile ? { file: runMetadataFile, content: (group.preParsedStages && group.standaloneMetadata && group.standaloneMetadata.length > 0) ? group.standaloneMetadata[0].content : await runMetadataFile.text(), parsed: runMetadata } : null,
                    config: configFile ? { file: configFile, content: (group.preParsedStages && group.standaloneConfigs && group.standaloneConfigs.length > 0) ? group.standaloneConfigs[0].content : await configFile.text(), parsed: configParsed } : null,
                    summary: summaryFile ? { file: summaryFile, content: (group.preParsedStages && group.standaloneSummaries && group.standaloneSummaries.length > 0) ? group.standaloneSummaries[0].content : await summaryFile.text(), parsed: summaryParsed } : null
                },
                payload,
                validation: bundleValidation,
                isExpanded: true,
                isSkipped: false,
                targetDashboards: ['performance-browser']
            });

            uploadedCount += parsedStages.length;
        }

        if (newStagedBundles.length > 0) {
            setStagedFiles(prev => {
                const combined = [...prev, ...newStagedBundles];
                combined.sort((a, b) => {
                    return a.dirKey.localeCompare(b.dirKey, undefined, { numeric: true, sensitivity: 'base' });
                });
                return combined;
            });
        }

        if (addToast) {
            addToast(`${uploadedCount} stage report file${uploadedCount === 1 ? ' is' : 's are'} loaded across ${newStagedBundles.length} run directory bundle${newStagedBundles.length === 1 ? '' : 's'}.`, 'info');
        }
    };

    React.useEffect(() => {
        if (hasInitialized.current) return;
        hasInitialized.current = true;

        // Check if we have a temporary staged redirect cache from GitHub auth flow
        const cached = localStorage.getItem('prism_staged_upload_cache');
        const trigger = localStorage.getItem('prism_trigger_resume_upload');
        const wizardStepSaved = localStorage.getItem('prism_upload_wizard_step');

        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                setStagedFiles(parsed);
                setWizardStep(3);
                setUploadIntent('submit-review');
            } catch (e) {
                console.warn("Failed to load cached staged files", e);
                setStagedFiles([]);
            }
            localStorage.removeItem('prism_staged_upload_cache');
        } else if (trigger === 'true') {
            localStorage.removeItem('prism_trigger_resume_upload');
            setWizardStep(3);
            setUploadIntent('submit-review');
            
            try {
                const savedBundles = localStorage.getItem('prism_active_staged_bundles');
                if (savedBundles) {
                    setStagedFiles(JSON.parse(savedBundles));
                }
            } catch { /* ignore */ }
        } else if (wizardStepSaved) {
            localStorage.removeItem('prism_upload_wizard_step');
            const stepNum = parseInt(wizardStepSaved, 10);
            setWizardStep(stepNum);
            const savedIntent = localStorage.getItem('prism_submit_intent') || 'submit-review';
            localStorage.removeItem('prism_submit_intent');
            setUploadIntent(savedIntent);
            if (savedIntent === 'stage-locally') {
                setIngestionSource('local');
            }
            
            try {
                const savedBundles = localStorage.getItem('prism_active_staged_bundles');
                if (savedBundles) {
                    setStagedFiles(JSON.parse(savedBundles));
                }
            } catch (err) {
                console.error("Failed to parse saved staged bundles:", err);
            }
        } else if (initialIntent) {
            setUploadIntent(initialIntent);
            if (initialIntent === 'stage-locally') {
                setIngestionSource('local');
                setStagedFiles([]);
                try {
                    localStorage.removeItem('prism_active_staged_bundles');
                } catch { /* ignore */ }
            }
        } else {
            const urlParams = new URLSearchParams(window.location.search);
            const urlIntent = urlParams.get('intent');
            const submitIntent = localStorage.getItem('prism_submit_intent');

            if (urlIntent) {
                setUploadIntent(urlIntent);
                if (urlIntent === 'stage-locally') {
                    setIngestionSource('local');
                    setStagedFiles([]);
                    try {
                        localStorage.removeItem('prism_active_staged_bundles');
                    } catch { /* ignore */ }
                }
            } else if (submitIntent) {
                localStorage.removeItem('prism_submit_intent');
                setUploadIntent(submitIntent);
                if (submitIntent === 'stage-locally') {
                    setIngestionSource('local');
                    setStagedFiles([]);
                    try {
                        localStorage.removeItem('prism_active_staged_bundles');
                    } catch { /* ignore */ }
                }
            } else {
                resetWizard();
            }
        }
    }, [clearAllBrv02Runs, initialIntent]);

    const handleDrop = async (e) => {
        e.preventDefault();
        setIsDragging(false);

        const items = e.dataTransfer.items;
        if (!items || items.length === 0) return;

        const files = [];

        const readAllEntries = async (directoryReader) => {
            let allEntries = [];
            const readBatch = async () => {
                const entries = await new Promise((resolve) => directoryReader.readEntries(resolve));
                if (entries.length > 0) {
                    allEntries.push(...entries);
                    await readBatch();
                }
            };
            await readBatch();
            return allEntries;
        };

        const traverseEntry = async (entry, path = '') => {
            if (entry.isFile) {
                const file = await new Promise((resolve) => entry.file(resolve));
                const fullPath = (entry.fullPath || `${path}/${file.name}`).replace(/^\//, '');
                if (!file.webkitRelativePath) {
                    try {
                        Object.defineProperty(file, 'webkitRelativePath', {
                            value: fullPath,
                            writable: true,
                            configurable: true
                        });
                    } catch {
                        // ignore if read-only
                    }
                }
                files.push(file);
            } else if (entry.isDirectory) {
                const directoryReader = entry.createReader();
                const entries = await readAllEntries(directoryReader);
                for (const subEntry of entries) {
                    await traverseEntry(subEntry, entry.fullPath || path);
                }
            }
        };

        const promises = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const entry = item.webkitGetAsEntry();
                if (entry) {
                    promises.push(traverseEntry(entry));
                }
            }
        }

        await Promise.all(promises);
        
        if (files.length > 0) {
            processFiles(files);
        }
    };

    const handleFileInput = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            processFiles(files);
        }
    };

    const toggleExpand = (id) => {
        setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, isExpanded: !f.isExpanded } : f));
    };

    const removeFile = (id) => {
        setStagedFiles(prev => {
            const updated = prev.map(f => f.id === id ? { ...f, isSkipped: true } : f);
            const activeCount = updated.filter(f => !f.isSkipped).length;
            if (activeCount === 0) {
                // Run in next tick to avoid React state update during render warning
                setTimeout(() => {
                    setWizardStep(1);
                    setIsUploadSidebarCollapsed(false);
                }, 0);
                return [];
            }
            return updated;
        });
    };

    const handleStageLocally = async () => {
        const validBundles = stagedFiles.filter(b => !b.isSkipped && b.validation.format && b.validation.errors.length === 0);
        localStorage.setItem('prism_active_staged_bundles', JSON.stringify(validBundles));
        await onCommit(validBundles);
        
        // Find which dashboards are targeted
        const allTargets = new Set();
        validBundles.forEach(b => {
            if (b.targetDashboards) {
                b.targetDashboards.forEach(t => allTargets.add(t));
            }
        });

        if (addToast) {
            addToast(`Successfully staged ${validBundles.length} runs locally.`, "success");
        }
        
        resetWizard();
        localStorage.setItem('prism_activate_staged_filter', 'true');
        if (localStorage.getItem('prism_hide_post_staged_dialog') !== 'true') {
            localStorage.setItem('prism_show_post_upload_dialog', 'staged');
        }
        if (onNavigate) {
            onNavigate('results-store');
        }
    };

    const handleSubmit = async (targetState = 'submitted_pending_review') => {
        const validBundles = stagedFiles.filter(b => !b.isSkipped && b.validation.format && b.validation.errors.length === 0);
        if (validBundles.length === 0) return;
        
        setIsSubmitting(true);
        try {
            // Stage files locally for immediate browser viewing
            await onCommit(validBundles);
            
            // Post each run package to the production Results Store API `/api/results`
            for (const bundle of validBundles) {
                const payload = {
                    runId: bundle.payload.runId || bundle.id || uuidv4(),
                    runLabel: bundle.name || bundle.payload.runLabel || 'Unnamed Run',
                    model_name: bundle.payload.model_name || "Custom Model",
                    hardware: {
                        hardware_name: bundle.payload.hardware?.hardware_name || "Unknown Hardware",
                        accelerator_count: bundle.payload.hardware?.accelerator_count
                    },
                    well_lit_path: bundle.payload.well_lit_path,
                    inference_tool: bundle.payload.inference_tool,
                    inference_tool_version: bundle.payload.inference_tool_version,
                    run_metadata: bundle.payload.run_metadata,
                    metadata: bundle.payload.metadata,
                    manifests: {
                        ...(bundle.payload.manifests || {}),
                        ...(bundle.attachedManifests ? Object.fromEntries(
                            bundle.attachedManifests.map(m => {
                                let base64 = "";
                                try {
                                    base64 = btoa(unescape(encodeURIComponent(m.content)));
                                } catch {
                                    base64 = btoa(m.content);
                                }
                                return [m.name, `data:text/plain;base64,${base64}`];
                            })
                        ) : {})
                    },
                    evidence: {
                        ...(bundle.payload.evidence || {}),
                        ...(bundle.attachedEvidence ? Object.fromEntries(
                            bundle.attachedEvidence.map(e => {
                                let base64 = "";
                                try {
                                    base64 = btoa(unescape(encodeURIComponent(e.content)));
                                } catch {
                                    base64 = btoa(e.content);
                                }
                                return [e.name, `data:text/plain;base64,${base64}`];
                            })
                        ) : {})
                    },
                    format: "brv02",
                    entries: (bundle.payload.entries || []).map(entry => ({
                        run_id: entry.run_id || uuidv4(),
                        run_description: bundle.name || bundle.payload.runLabel || 'Unnamed Run',
                        filename: entry.filename,
                        raw_report: entry.rawReport || entry.raw_report || entry.content
                    }))
                };

                const preflight = validatePrismUploadStructure(payload, { isUpload: true });
                if (!preflight.isValid) {
                    const errorMsg = `Pre-flight validation failed for "${payload.runLabel}": ${preflight.errors.join('; ')}`;
                    if (addToast) addToast(errorMsg, "error");
                    throw new Error(errorMsg);
                }

                const res = await fetch(`/api/results?targetState=${encodeURIComponent(targetState)}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Prism-Github-Token': accessToken
                    },
                    body: JSON.stringify(payload)
                });
                
                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    const detailsStr = Array.isArray(errorData.details) ? `: ${errorData.details.join('; ')}` : (errorData.details ? `: ${errorData.details}` : '');
                    throw new Error((errorData.error || `Submit failed with HTTP ${res.status}`) + detailsStr);
                }

                const responseData = await res.json();
                if (promoteStagedRunId && responseData.runId) {
                    promoteStagedRunId(bundle.payload.runId || bundle.id, responseData.runId);
                } else if (removeBrv02Run) {
                    removeBrv02Run(bundle.payload.runId || bundle.id);
                }
            }

            if (addToast) {
                addToast(
                    targetState === 'unlisted'
                        ? "Benchmark saved as unlisted!"
                        : "Benchmark submissions submitted successfully for review!",
                    "success"
                );
            }
            
            // Refresh submissions list in main dashboard
            if (loadSubmissions) {
                await loadSubmissions(true);
            }

            // Refetch full database in the background without blocking navigation
            if (loadAllData) {
                loadAllData(null, true).catch(err => console.error("Error refreshing background data:", err));
            }

            // Close and reset
            resetWizard();
            localStorage.setItem('prism_activate_my_submissions_filter', 'true');
            localStorage.setItem('prism_show_post_upload_dialog', targetState === 'unlisted' ? 'unlisted' : 'submitted');
            if (onNavigate) {
                onNavigate('results-store');
            } else if (onNavigateBack) {
                onNavigateBack();
            }

        } catch (e) {
            console.error("Failed to submit benchmarks:", e);
            if (addToast) addToast(`Failed to submit benchmarks: ${e.message}`, "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetWizard = () => {
        setStagedFiles([]);
        setWizardStep(1);
        setDcoSigned(false);
        setSelectedReviewers([]);
        try {
            const params = new URLSearchParams(window.location.search);
            params.delete('intent');
            window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
        } catch { /* ignore */ }
    };

    const handleGithubLoginRedirect = () => {
        localStorage.setItem('prism_staged_upload_cache', JSON.stringify(stagedFiles));
        login({ showSubmitDialog: true });
    };

    const handleGithubDisconnect = () => {
        logout();
        if (addToast) addToast("Disconnected GitHub account", "info");
    };

    const renderStep3 = () => {
        return (
            <div className="flex-1 flex flex-col p-6 overflow-y-auto space-y-6 bg-transparent">
                <div className="max-w-3xl mx-auto w-full space-y-6 text-slate-200">
                    <div>
                        <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2 select-none">
                            Contributor Attribution & DCO
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 select-none">Accept the Developer Certificate of Origin (DCO) and verify your identity using GitHub.</p>
                    </div>

                    {!isAuthenticated ? (
                        <div className="border border-slate-900 bg-slate-950/40 rounded-2xl p-8 shadow-inner flex flex-col items-center text-center space-y-4 max-w-xl mx-auto">
                            <div className="p-3.5 bg-slate-900 rounded-full text-slate-400">
                                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z" />
                                </svg>
                            </div>
                            <div className="space-y-1.5 select-none">
                                <h4 className="font-bold text-slate-200">GitHub Verification Required</h4>
                                <p className="text-xs text-slate-500 max-w-sm leading-relaxed font-medium">To ensure benchmark validity and trace contributor identity, manual entry is disabled. Please verify via GitHub OAuth to proceed.</p>
                            </div>
                            {!isConfigured ? (
                                <div className="relative group/tooltip inline-block w-full sm:w-auto">
                                    <button
                                        type="button"
                                        disabled
                                        className="w-full px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-900 text-slate-500 bg-slate-900/20 cursor-not-allowed opacity-50 select-none shadow-md"
                                    >
                                        Authenticate with GitHub
                                    </button>
                                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-slate-900 border border-slate-800 text-slate-200 text-xs font-medium rounded-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 shadow-2xl z-[9999] w-64 pointer-events-none leading-relaxed text-center">
                                        GitHub Login is not configured yet.
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleGithubLoginRedirect}
                                    className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-slate-900 to-slate-950 hover:from-slate-850 hover:to-slate-900 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-800 shadow-md transition-all cursor-pointer"
                                >
                                    Authenticate with GitHub
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="border border-emerald-500/20 bg-emerald-500/[0.01] rounded-2xl p-5 shadow-sm space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 select-none">
                                    <Check className="text-emerald-500" size={14} />
                                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Authenticated via GitHub</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleGithubDisconnect}
                                    className="text-[10px] text-red-500 hover:text-red-400 font-bold uppercase tracking-wider hover:bg-red-500/5 px-2 py-0.5 rounded transition-all border border-red-500/20 cursor-pointer"
                                >
                                    Disconnect
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/40 p-4 rounded-xl border border-slate-900/80 shadow-inner">
                                <div>
                                    <Label className="uppercase tracking-wider mb-0.5 select-none">GitHub Username</Label>
                                    <div className="text-xs font-semibold text-slate-200">@{user?.username}</div>
                                </div>
                                <div>
                                    <Label className="uppercase tracking-wider mb-0.5 select-none">Account Role</Label>
                                    <div className="text-xs font-semibold text-slate-200">{user?.permission || 'user'}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* DCO Block */}
                    <div className="space-y-2">
                        <Label className="uppercase tracking-wider mb-0 select-none">Developer Certificate of Origin (DCO)</Label>
                        <div className="border border-slate-900/60 bg-slate-950/65 p-4 rounded-xl h-36 overflow-y-auto text-[10px] font-mono leading-relaxed text-slate-400 shadow-inner">
                            <p className="font-bold mb-2">Developer Certificate of Origin Version 1.1</p>
                            <p className="mb-2">By making a contribution to this project, I certify that:</p>
                            <p className="mb-2">(a) The contribution was created in whole or in part by me and I have the right to submit it under the open source license indicated in the file; or</p>
                            <p className="mb-2">(b) The contribution is based upon previous work that, to the best of my knowledge, I have the right to submit it under the same open source license; or</p>
                            <p className="mb-2">(c) The contribution was provided directly to me by some other person who certified (a), (b) or (c) and I have not modified it.</p>
                            <p>(d) I understand and agree that this project and the contribution are public and that a record of the contribution is maintained indefinitely.</p>
                        </div>
                        <label className="flex items-start gap-2.5 mt-2 cursor-pointer select-none">
                            <Checkbox
                                checked={dcoSigned}
                                disabled={!isAuthenticated}
                                onChange={(e) => setDcoSigned(e.target.checked)}
                                className="mt-1 cursor-pointer disabled:opacity-40"
                            />
                            <span className={cn('text-xs leading-normal', !isAuthenticated ? 'text-slate-600' : 'text-slate-400')}>
                                I sign off on the Developer Certificate of Origin (DCO) and certify that these benchmark runs comply with community standards.
                            </span>
                        </label>
                    </div>

                    {/* Reviewers Selection */}
                    <div>
                        <Label className="uppercase tracking-wider mb-1 select-none">Assign Reviewers</Label>
                        <Input
                            type="text"
                            value={selectedReviewers.join(', ')}
                            disabled={!isAuthenticated}
                            onChange={(e) => setSelectedReviewers(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                            placeholder="username1, username2 (comma separated)"
                            className="text-xs font-semibold"
                        />
                    </div>
                </div>
            </div>
        );
    };

    const renderStep4 = () => {
        const validBundles = stagedFiles.filter(b => !b.isSkipped && b.validation.format && b.validation.errors.length === 0);
        return (
            <div className="flex-1 flex flex-col p-6 overflow-y-auto space-y-6 bg-transparent">
                <div className="max-w-2xl mx-auto w-full space-y-6 text-slate-200">
                    <div className="text-center py-4 select-none">
                        <CheckCircle size={48} className="text-cyan-500 mx-auto mb-3" />
                        <h3 className="text-base font-extrabold text-slate-100 tracking-tight">Ready to Submit</h3>
                        <p className="text-xs text-slate-500 mt-1">Review the summary below before pushing to the review queue.</p>
                    </div>

                    <div className="bg-slate-950/40 rounded-2xl border border-slate-900/80 p-5 space-y-4 shadow-inner">
                        <div className="flex justify-between items-center text-xs pb-3 border-b border-slate-900/60 select-none">
                            <span className="text-slate-500 font-semibold">Total Runs Selected</span>
                            <span className="font-bold text-slate-200">{validBundles.length} runs</span>
                        </div>
                        
                        <div className="space-y-3">
                            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block select-none">Staging Summary</span>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                                {validBundles.map(b => (
                                    <div key={b.id} className="flex justify-between items-center text-xs bg-slate-950/60 border border-slate-900/40 px-3.5 py-2 rounded-xl">
                                        <span className="font-mono text-slate-400">{b.payload.runId || b.id}</span>
                                        <span className="text-slate-300 font-semibold">{b.payload.model_name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2 pt-2">
                            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block select-none">Attribution & Compliance</span>
                            <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                    <span className="text-slate-550 block mb-0.5 select-none">Contributor</span>
                                    <span className="font-semibold text-slate-300">@{user?.username || 'Contributor'}</span>
                                </div>
                                <div>
                                    <span className="text-slate-550 block mb-0.5 select-none">GitHub User</span>
                                    <span className="font-semibold text-slate-300">@{user?.username || 'Not specified'}</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-slate-550 block mb-0.5 select-none">DCO Signature</span>
                                    <span className="text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                                        <Check size={13} className="text-emerald-500" /> Signed and Verified
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Visibility Selection Section */}
                    <div className="bg-slate-950/40 rounded-2xl border border-slate-900/80 p-5 space-y-3 shadow-inner">
                        <div>
                            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Benchmark Visibility</h4>
                            <p className="text-[11px] text-slate-400 mt-0.5">Select the visibility and publishing workflow for this submission.</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            <div 
                                onClick={() => setTargetVisibility('submitted_pending_review')}
                                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                                    targetVisibility === 'submitted_pending_review'
                                    ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                                    : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-bold text-emerald-400">
                                        Public Review
                                    </span>
                                    <input 
                                        type="radio" 
                                        name="visibility" 
                                        checked={targetVisibility === 'submitted_pending_review'} 
                                        onChange={() => setTargetVisibility('submitted_pending_review')}
                                        className="accent-emerald-500 cursor-pointer"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 leading-normal">
                                    Submits to the maintainer review queue for formal verification and publishing on the global grid.
                                </p>
                            </div>

                            <div 
                                onClick={() => setTargetVisibility('unlisted')}
                                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                                    targetVisibility === 'unlisted'
                                    ? 'bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                                    : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-bold text-cyan-400">
                                        Unlisted
                                    </span>
                                    <input 
                                        type="radio" 
                                        name="visibility" 
                                        checked={targetVisibility === 'unlisted'} 
                                        onChange={() => setTargetVisibility('unlisted')}
                                        className="accent-cyan-500 cursor-pointer"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 leading-normal">
                                    Experimental runs that haven't been reviewed yet.
                                </p>
                            </div>
                        </div>
                    </div>

                    {user?.permission === 'none' ? (
                        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl p-4 flex gap-3 text-xs leading-normal shadow-[0_4px_20px_rgba(245,158,11,0.05)] animate-in fade-in duration-200">
                            <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={16} />
                            <div className="space-y-1 font-medium">
                                <p className="text-white font-bold">Closed Beta Restriction</p>
                                <p>You are not in the Results Store closed-beta. Check back later once the feature is released.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4 flex gap-3 text-xs leading-normal">
                            <ShieldAlert className="text-amber-500 shrink-0 mt-0.5" size={16} />
                            <p className="text-slate-400 font-medium">
                                By submitting, you initiate a formal pull-request style review. Prism maintainers will inspect the payload, manifests, and evidence logs before merging these results into the public Results Store.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        );
    };





    const _renderLocalVisualization = () => {
        const stagesList = [];
        stagedFiles.forEach(bundle => {
            if (Array.isArray(bundle.stageFiles)) {
                bundle.stageFiles.forEach((sf, sIdx) => {
                    const parsedData = parseReportV02(sf.content, sf.file?.name);
                    if (parsedData) {
                        stagesList.push({
                            id: `${bundle.id}-${sIdx}`,
                            bundleId: bundle.id,
                            stage: sIdx + 1,
                            bundleName: bundle.name,
                            model: bundle.payload?.model_name || parsedData.scenario?.model || 'Unknown',
                            hardware: bundle.payload?.hardware?.hardware_name || parsedData.scenario?.hardware || 'Unknown',
                            qps: parsedData.performance?.requestRate || 0,
                            throughput: parsedData.performance?.outputTokenRate || parsedData.performance?.requestRate || 0,
                            ttft: parsedData.performance?.ttftMean || 0,
                            ttftP50: parsedData.performance?.ttftP50 || parsedData.performance?.ttftMean || 0,
                            ttftP99: parsedData.performance?.ttftP99 || parsedData.performance?.ttftMean || 0,
                            tpot: parsedData.performance?.tpotMean || 0,
                            tpotP50: parsedData.performance?.tpotP50 || parsedData.performance?.tpotMean || 0,
                            tpotP99: parsedData.performance?.tpotP99 || parsedData.performance?.tpotMean || 0,
                            itl: parsedData.performance?.itlMean || 0,
                            itlP50: parsedData.performance?.itlP50 || parsedData.performance?.itlMean || 0,
                            itlP99: parsedData.performance?.itlP99 || parsedData.performance?.itlMean || 0,
                            latency: parsedData.performance?.e2eMean || 0,
                            e2eP50: parsedData.performance?.e2eP50 || parsedData.performance?.e2eMean || 0,
                            e2eP99: parsedData.performance?.e2eP99 || parsedData.performance?.e2eMean || 0,
                            hasErrors: bundle.validation.errors.length > 0
                        });
                    }
                });
            }
        });

        // Unique models and hardware for filters
        const _models = Array.from(new Set(stagesList.map(s => s.model))).filter(Boolean);
        const _hardwares = Array.from(new Set(stagesList.map(s => s.hardware))).filter(Boolean);

        // Filter stages
        const filteredStagesList = stagesList.filter(s => {
            if (localModelFilter !== 'all' && s.model !== localModelFilter) return false;
            if (localHardwareFilter !== 'all' && s.hardware !== localHardwareFilter) return false;
            return true;
        });

        const avgThroughput = filteredStagesList.length > 0 ? (filteredStagesList.reduce((acc, s) => acc + s.throughput, 0) / filteredStagesList.length).toFixed(1) : 0;
        const avgLatency = filteredStagesList.length > 0 ? (filteredStagesList.reduce((acc, s) => acc + s.latency, 0) / filteredStagesList.length).toFixed(1) : 0;
        const maxThroughput = filteredStagesList.length > 0 ? Math.max(...filteredStagesList.map(s => s.throughput)).toFixed(1) : 0;

        // Map data points to match the exact schema IntelligentRoutingChart expects:
        const chartFormattedData = filteredStagesList.map(s => ({
            qps: s.qps,
            model_name: s.model,
            hardware: s.hardware,
            stage: s.stage,
            
            // Map output rate
            router_output_token_rate: s.throughput,
            router_input_token_rate: s.qps * 512,
            
            // Map TTFT percentiles
            router_ttft_p50: s.ttftP50,
            router_ttft_p90: s.ttftP50,
            router_ttft_p99: s.ttftP99,
            
            // Map TPOT percentiles
            router_tpot_p50: s.tpotP50,
            router_tpot_p90: s.tpotP50,
            router_tpot_p99: s.tpotP99,
            
            // Map ITL percentiles
            router_itl_p50: s.itlP50,
            router_itl_p90: s.itlP50,
            router_itl_p99: s.itlP99,
            
            // Map NTPOT percentiles
            router_ntpot_p50: s.tpotP50,
            router_ntpot_p90: s.tpotP50,
            router_ntpot_p99: s.tpotP99
        }));

        // Compute chart metadata dynamically from the resolved staged files
        const firstStage = filteredStagesList[0];
        const matchingBundle = firstStage ? stagedFiles.find(b => b.id === firstStage.bundleId) : null;
        
        const chartMetadata = firstStage ? {
            machineType: 'local-instance',
            accelerator: matchingBundle?.payload?.hardware?.hardware_name || firstStage.hardware,
            replicas: matchingBundle?.payload?.hardware?.accelerator_count || 1,
            model: matchingBundle?.payload?.model_name || firstStage.model,
            precision: 'BF16',
            engine: matchingBundle?.payload?.inference_tool || 'vLLM'
        } : null;

        return (
            <div className="flex flex-col gap-4 w-full h-full text-slate-800 dark:text-slate-100 p-1 animate-in fade-in duration-300">
                {/* KPI metrics row */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-900 border border-slate-800/80 p-3 px-4 rounded-xl shadow-sm flex flex-col gap-1.5 justify-center">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Avg Throughput</span>
                        <div className="text-lg font-extrabold text-slate-200 font-mono leading-none">
                            {avgThroughput} <span className="text-[10px] font-semibold text-slate-400">tok/s</span>
                        </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800/80 p-3 px-4 rounded-xl shadow-sm flex flex-col gap-1.5 justify-center">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Max Throughput</span>
                        <div className="text-lg font-extrabold text-cyan-400 font-mono leading-none">
                            {maxThroughput} <span className="text-[10px] font-semibold text-slate-500">tok/s</span>
                        </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800/80 p-3 px-4 rounded-xl shadow-sm flex flex-col gap-1.5 justify-center">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Avg Latency (E2E)</span>
                        <div className="text-lg font-extrabold text-slate-200 font-mono leading-none">
                            {avgLatency} <span className="text-[10px] font-semibold text-slate-400">ms</span>
                        </div>
                    </div>
                </div>

                {/* Chart and Grid Split - Stacked Vertically */}
                <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-1">
                    {/* Reused Intelligent Routing Chart Component */}
                    <div className="w-full relative overflow-visible">
                        <IntelligentRoutingChart 
                            data={chartFormattedData} 
                            initialXAxis="ttft" 
                            initialYAxis="output" 
                            metadata={chartMetadata}
                        />
                    </div>

                    {/* Data Grid / Stage Table */}
                    <div className="w-full bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 flex flex-col shrink-0">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3 block">Stage Details</span>
                        <div className="grid grid-cols-1 gap-3">
                            {filteredStagesList.map((stage, idx) => (
                                <div key={stage.id} className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg flex items-center justify-start gap-12 text-xs">
                                    <div>
                                        <div className="font-bold text-slate-200 font-mono text-[10px] leading-tight">
                                            Stage {idx + 1}: {stage.qps} QPS
                                        </div>
                                        <div className="text-[9px] text-slate-400 mt-0 leading-tight">
                                            {stage.model} • {stage.hardware}
                                        </div>
                                    </div>
                                    <div className="text-left font-mono text-[10px] font-bold text-slate-200 leading-tight">
                                        <div>Tput: {stage.throughput.toFixed(1)} tok/s</div>
                                        <div className="text-slate-400 font-normal text-[9px] mt-0.5">Lat: {stage.latency.toFixed(1)} ms</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const validCount = stagedFiles.filter(f => !f.isSkipped && f.validation.format && f.validation.errors.length === 0).length;
    const _formatCount = stagedFiles.filter(f => !f.isSkipped && f.validation.format).length;

    return (
        <div className="h-screen bg-[#02050b] text-slate-100 flex flex-col font-sans antialiased relative overflow-hidden pt-0 pl-28">
            {/* Toast Stack */}
            <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
                {toasts.map(t => (
                    <div key={t.id} className={cn(
                        'px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all animate-in slide-in-from-right duration-300 flex items-center justify-between gap-4',
                        t.type === 'error' ? 'bg-red-500/90 backdrop-blur' :
                        t.type === 'success' ? 'bg-green-500/90 backdrop-blur' : 'bg-blue-600/90 backdrop-blur'
                    )}>
                        <span>{t.message}</span>
                        <button onClick={() => removeToast(t.id)} className="hover:bg-white/20 rounded-full p-1 opacity-75 hover:opacity-100">
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
            {/* Ambient Aurora Glow */}
            <div className="absolute top-[-10%] left-[20%] w-[600px] h-[400px] bg-cyan-950/15 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '10s' }} />
            <div className="absolute bottom-[5%] right-[5%] w-[500px] h-[350px] bg-purple-950/15 rounded-full blur-[130px] pointer-events-none animate-pulse" style={{ animationDelay: '2s', animationDuration: '12s' }} />
            
            {/* Dotted Backdrop Mesh */}
            <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none z-[1]" />
            <div className="absolute top-1/4 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/5 to-transparent -skew-y-12 pointer-events-none z-[1]" />
            <div className="absolute top-2/3 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-purple-500/5 to-transparent -skew-y-12 pointer-events-none z-[1]" />
            {/* Header */}
            <header className="w-full h-16 border-b border-slate-900/65 flex justify-between items-center px-6 bg-slate-950/20 backdrop-blur-md sticky top-0 z-[49]">
                <div className="flex items-center gap-4">
                    <button onClick={onNavigateBack} className="p-1.5 rounded-xl hover:bg-slate-900/60 text-slate-400 hover:text-white transition-colors cursor-pointer border border-transparent hover:border-slate-800/60">
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    
                    <div className="flex items-center gap-2.5 border-r border-slate-800 pr-4">
                        <img src="https://llm-d.ai/img/llm-d-logotype-and-icon.png" alt="llm-d Logo" className="h-6 object-contain" />
                        <span className="text-lg font-bold tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 select-none">
                            Prism
                        </span>
                    </div>

                    <div className="flex items-center">
                        <h1 className="text-sm font-semibold text-slate-200 tracking-wide select-none">Upload and Stage Benchmarks</h1>
                    </div>
                </div>
            </header>
            <div className="flex-1 flex flex-col bg-transparent overflow-hidden relative z-10">

                {/* Wizard Steps Progress Indicator */}
                {uploadIntent === 'submit-review' ? (
                    <div className="bg-slate-950/40 backdrop-blur-md border-b border-slate-900/65 px-6 py-4 flex items-center justify-between">
                        <div className="flex flex-wrap items-center gap-5 text-[13px] font-semibold text-slate-500 select-none">
                            <span className={cn('flex items-center gap-2 transition-all', wizardStep === 1 ? 'text-cyan-400 font-extrabold scale-105' : 'text-slate-400')}>
                                <span className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all', wizardStep === 1 ? 'bg-cyan-500/10 text-cyan-400 border-2 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]' : 'bg-slate-950/60 border border-slate-900 text-slate-500')}>1</span>
                                Upload Files
                            </span>
                            <ChevronRight size={14} className="text-slate-700 shrink-0" />
                            <span className={cn('flex items-center gap-2 transition-all', wizardStep === 2 ? 'text-cyan-400 font-extrabold scale-105' : 'text-slate-400')}>
                                <span className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all', wizardStep === 2 ? 'bg-cyan-500/10 text-cyan-400 border-2 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]' : 'bg-slate-950/60 border border-slate-900 text-slate-500')}>2</span>
                                Validation & Preview
                            </span>
                            <ChevronRight size={14} className="text-slate-700 shrink-0" />
                            <span className={cn('flex items-center gap-2 transition-all', wizardStep === 3 ? 'text-cyan-400 font-extrabold scale-105' : 'text-slate-400')}>
                                <span className={cn('w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-mono font-bold transition-all', wizardStep === 3 ? 'bg-cyan-500/10 text-cyan-400 border-2 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]' : 'bg-slate-950/60 border border-slate-900 text-slate-500')}>3</span>
                                Attribution & DCO
                            </span>
                            <ChevronRight size={14} className="text-slate-700 shrink-0" />
                            <span className={cn('flex items-center gap-2 transition-all', wizardStep === 4 ? 'text-cyan-400 font-extrabold scale-105' : 'text-slate-400')}>
                                <span className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all', wizardStep === 4 ? 'bg-cyan-500/10 text-cyan-400 border-2 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]' : 'bg-slate-950/60 border border-slate-900 text-slate-500')}>4</span>
                                Submit & Confirm
                            </span>
                        </div>
                        {wizardStep === 2 && (
                            <div className="text-xs font-semibold text-slate-400 font-mono bg-slate-900 border border-slate-800 px-3 py-1 rounded-xl shadow-sm">
                                {validCount} of {stagedFiles.filter(f => !f.isSkipped).length} runs valid
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bg-slate-950/40 backdrop-blur-md border-b border-slate-900/65 px-6 py-4 flex items-center justify-between">
                        <div className="flex flex-wrap items-center gap-5 text-[13px] font-semibold text-slate-500 select-none">
                            <span className={cn('flex items-center gap-2 transition-all', wizardStep === 1 ? 'text-cyan-400 font-extrabold scale-105' : 'text-slate-400')}>
                                <span className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all', wizardStep === 1 ? 'bg-cyan-500/10 text-cyan-400 border-2 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]' : 'bg-slate-950/60 border border-slate-900 text-slate-500')}>1</span>
                                Upload Files
                            </span>
                            <ChevronRight size={14} className="text-slate-700 shrink-0" />
                            <span className={cn('flex items-center gap-2 transition-all', wizardStep === 2 ? 'text-cyan-400 font-extrabold scale-105' : 'text-slate-400')}>
                                <span className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all', wizardStep === 2 ? 'bg-cyan-500/10 text-cyan-400 border-2 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]' : 'bg-slate-950/60 border border-slate-900 text-slate-500')}>2</span>
                                Validation & Preview
                            </span>
                        </div>
                    </div>
                )}


                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    
                    {/* Left Pane: Ingestion Source Toggle & Input */}
                    {wizardStep === 1 && (
                        <div className={cn(
                            stagedFiles.length === 0
                            ? 'w-full flex items-center justify-center p-8 min-h-[70vh]'
                            : (isUploadSidebarCollapsed ? 'w-0 p-0 overflow-hidden border-r-0' : 'w-1/3 border-r border-slate-900/60 p-6'),
                            'flex flex-col bg-slate-950/20 backdrop-blur-md transition-all duration-300 relative'
                        )}>
                            <div className={stagedFiles.length === 0 ? 'max-w-md w-full bg-slate-900/30 border border-slate-900/50 p-6 rounded-2xl shadow-xl space-y-4' : 'flex flex-col h-full'}>
                            {/* Workflow Option Description */}
                            <div className="mb-5 space-y-2 select-none">
                                {uploadIntent === 'stage-locally' ? (
                                    <>
                                        <p className="text-xs font-bold text-slate-200">
                                            Stage & Preview Benchmark Runs
                                        </p>
                                        <p className="text-xs text-slate-500 leading-normal">
                                            Upload your benchmark run files to validate their structure and preview the performance curves locally. Staged runs are stored in your local session and will not be published to the public Results store.
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-xs font-bold text-slate-200">
                                            Publish Benchmarks to Results Store
                                        </p>
                                        <p className="text-xs text-slate-500 leading-normal">
                                            Upload your benchmark run files to validate them, edit their metadata, add developer attribution, and submit them to be reviewed and published to the public Results store.
                                        </p>
                                    </>
                                )}
                            </div>

                            {/* Ingestion Source Switch (Only visible for Submit Review) */}
                            {uploadIntent === 'submit-review' && (
                                <div className="mb-4 flex bg-slate-950/60 border border-slate-900/60 p-1 rounded-xl">
                                    <button
                                        onClick={() => setIngestionSource('local')}
                                        className={cn(
                                            'flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer',
                                            ingestionSource === 'local'
                                            ? 'bg-slate-900 text-white shadow-sm border border-slate-800/40'
                                            : 'text-slate-500 hover:text-slate-300'
                                        )}
                                    >
                                        Local Ingestion
                                    </button>
                                    <button
                                        onClick={() => setIngestionSource('cloud')}
                                        className={cn(
                                            'flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer',
                                            ingestionSource === 'cloud'
                                            ? 'bg-slate-900 text-white shadow-sm border border-slate-800/40'
                                            : 'text-slate-500 hover:text-slate-300'
                                        )}
                                    >
                                        Cloud Ingestion
                                    </button>
                                </div>
                            )}

                        {ingestionSource === 'local' ? (
                            <div 
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={cn(
                                    'flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-6 text-center transition-all bg-slate-950/40',
                                    isDragging
                                    ? 'border-cyan-500 bg-cyan-500/5 shadow-[0_0_15px_rgba(6,182,212,0.05)]'
                                    : 'border-slate-900 hover:border-cyan-500/50'
                                )}
                            >
                                <UploadCloud size={48} className={cn('mb-4', isDragging ? 'text-cyan-400' : 'text-slate-500')} />
                                <h3 className="font-semibold text-slate-200 mb-2 select-none">Drag & Drop files here</h3>
                                <p className="text-xs text-slate-500 mb-6">Supports .yaml and .json benchmark reports.</p>
                                
                                <div className="flex flex-col gap-2 w-full max-w-xs">
                                    <label className="relative flex items-center justify-center px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold rounded-xl cursor-pointer transition-all shadow-md">
                                        Browse Files
                                        <input type="file" multiple accept=".yaml,.yml,.json" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileInput} />
                                    </label>
                                    <label className="relative flex items-center justify-center px-4 py-2 bg-slate-900/60 hover:bg-slate-900 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer border border-slate-800 transition-all">
                                        Select Directory
                                        <input type="file" webkitdirectory="true" directory="true" multiple className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileInput} />
                                    </label>

                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col justify-between bg-slate-950/40 p-5 rounded-2xl border border-slate-900 shadow-inner">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs">
                                        <UploadCloud size={16} />
                                        <span>Cloud Bucket Import</span>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        Ingest verified benchmark runs directly from object storage (Google Cloud Storage or AWS S3).
                                    </p>
                                    
                                    <div>
                                        <Label className="mb-1 uppercase tracking-wider">Provider</Label>
                                        <Select
                                            value={cloudProvider}
                                            onChange={(e) => setCloudProvider(e.target.value)}
                                            className="text-xs font-semibold cursor-pointer"
                                        >
                                            <option value="gcs">Google Cloud Storage (GCS)</option>
                                            <option value="s3">Amazon Simple Storage Service (S3)</option>
                                        </Select>
                                    </div>

                                    <div>
                                        <Label className="mb-1 uppercase tracking-wider">Bucket or Folder Path</Label>
                                        <Input
                                            type="text"
                                            value={cloudPath}
                                            onChange={(e) => setCloudPath(e.target.value)}
                                            placeholder={cloudProvider === 'gcs' ? "gs://bucket-name/folder/path" : "s3://bucket-name/folder/path"}
                                            className="text-xs font-mono"
                                        />
                                    </div>
                                    
                                    <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-xl p-2.5 text-[10px] text-slate-500 leading-normal">
                                        Note: Requires matching bucket permissions or configured service account roles. Click scan to ingest.
                                    </div>
                                </div>

                                <button 
                                    onClick={handleCloudScan}
                                    className="w-full py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs rounded-xl shadow-md hover:shadow-cyan-500/10 transition-all flex items-center justify-center gap-1.5 mt-4 cursor-pointer"
                                >
                                    <UploadCloud size={14} /> Scan & Stage Cloud Run
                                </button>
                            </div>
                        )}
                            </div>
                        </div>
                    )}

                    {/* Right Pane: Staging List */}
                    {(wizardStep === 1 || wizardStep === 2) && stagedFiles.length > 0 && (
                    <div className={cn(
                        wizardStep === 1 ? (isUploadSidebarCollapsed ? 'w-full' : 'w-2/3 border-l border-slate-900/60') : 'w-full',
                        'bg-slate-950 overflow-y-auto p-6 relative transition-all duration-300'
                    )}>
                        {stagedFiles.length === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                                <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(34,211,238,0.15)] bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                                    <UploadCloud className="w-8 h-8" />
                                </div>
                                <h3 className="text-sm font-bold text-slate-200 mb-2 select-none">
                                    Benchmark Staging Area
                                </h3>
                                <p className="text-xs text-slate-500 max-w-xs leading-relaxed mb-6 select-none">
                                    Select or scan benchmark runs on the left to begin. Ingested runs will be staged here for validation checks.
                                </p>
                                <div className="text-xs text-slate-500 border-t border-slate-900 pt-4 space-y-1.5 w-full max-w-[240px] text-left select-none">
                                    <div className="flex items-center gap-1.5">
                                        <Check size={12} className="text-cyan-400" />
                                        <span>Supports `prism_benchmark_v0.2` logs</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Check size={12} className="text-cyan-500" />
                                        <span>Requires GitHub login to submit runs</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {stagedFiles.some(b => !b.isSkipped && (b.payload?.modelNameInferred || b.payload?.hardwareInferred || b.payload?.acceleratorCountInferred)) && (
                                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-250 p-3.5 rounded-xl text-xs flex items-start gap-2.5 leading-normal shadow-[0_4px_20px_rgba(245,158,11,0.05)] select-none">
                                        <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5 animate-pulse" />
                                        <div className="flex-1">
                                            <span className="font-bold text-amber-450 block mb-0.5">Verification Required for Inferred Metadata</span>
                                            Prism has auto-populated some metadata fields (such as Model Name or Hardware Specs) by guessing/inferring from configuration files or folder structures. Please verify all fields marked with <Badge tone="warning" size="xs" className="px-1 text-[10px] font-extrabold font-mono mx-0.5">Inferred</Badge> before continuing to publish to the Results store.
                                        </div>
                                    </div>
                                )}
                                <div className="flex flex-wrap items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-800 text-xs mb-3 gap-2">
                                    <div className="flex items-center gap-3">
                                        <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-300 select-none">
                                            <Checkbox
                                                checked={stagedFiles.length > 0 && selectedBundleIds.length === stagedFiles.filter(b => !b.isSkipped).length}
                                                onChange={toggleSelectAllBundles}
                                            />
                                            <span>Select All ({selectedBundleIds.length}/{stagedFiles.filter(b => !b.isSkipped).length})</span>
                                        </label>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <div className="relative group/auto-group-tooltip inline-block">
                                            <button
                                                onClick={handleAutoGroup}
                                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                                            >
                                                <Zap size={14} className="text-cyan-400" />
                                                <span>Auto-Group Benchmarks</span>
                                            </button>
                                            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-3 py-2.5 bg-slate-900 border border-slate-700/80 text-slate-200 text-xs font-normal rounded-xl opacity-0 invisible group-hover/auto-group-tooltip:opacity-100 group-hover/auto-group-tooltip:visible transition-all duration-200 shadow-2xl z-[9999] w-72 pointer-events-none leading-relaxed text-left backdrop-blur-md">
                                                <div className="font-bold text-cyan-400 mb-1 flex items-center gap-1.5">
                                                    <Zap size={12} />
                                                    <span>Heuristic Auto-Grouping</span>
                                                </div>
                                                <p className="text-[11px] text-slate-300">
                                                    Automatically scans and groups staged benchmark runs matching on:
                                                </p>
                                                <ul className="mt-1 space-y-0.5 text-[11px] text-slate-300 list-disc list-inside">
                                                    <li>Model name</li>
                                                    <li>Hardware specification</li>
                                                    <li>Inference tool / serving stack</li>
                                                    <li>Execution timestamp (within ±1 hour)</li>
                                                </ul>
                                            </div>
                                        </div>

                                        <button
                                            onClick={handleCoalesceSelected}
                                            disabled={selectedBundleIds.length < 2}
                                            className={cn(
                                                "px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm",
                                                selectedBundleIds.length >= 2
                                                    ? "bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-500/40 text-cyan-200"
                                                    : "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed opacity-60"
                                            )}
                                            title={selectedBundleIds.length >= 2 ? "Coalesce selected benchmark runs into a single run" : "Select at least 2 runs to coalesce"}
                                        >
                                            <GitCompare size={14} />
                                            <span>Coalesce Selected ({selectedBundleIds.length})</span>
                                        </button>

                                        {wizardStep === 1 && (
                                            <button 
                                                onClick={() => setIsUploadSidebarCollapsed(!isUploadSidebarCollapsed)}
                                                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-cyan-400 cursor-pointer transition-all flex items-center gap-1 select-none"
                                                title={isUploadSidebarCollapsed ? "Show Ingestion panel" : "Hide Ingestion panel"}
                                            >
                                                {isUploadSidebarCollapsed ? <ChevronRight size={14} className="text-cyan-400" /> : <ChevronLeft size={14} />}
                                                <span className="text-[9px] font-extrabold uppercase tracking-wider px-0.5">{isUploadSidebarCollapsed ? "Upload" : "Maximize"}</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {stagedFiles.filter(b => !b.isSkipped).map(bundle => {
                                    const rawReport = bundle.payload?.entries?.[0]?.raw_report;
                                    const stack = rawReport?.scenario?.stack || [];
                                    const fieldErrors = bundle.validation?.fieldErrors || {};
                                    const getFieldClassName = (fieldKey, isInferred) => {
                                        const err = fieldErrors[fieldKey];
                                        if (err) {
                                            if (err.severity === 'error') {
                                                return "border-red-500/50 hover:border-red-500/70 focus:border-red-500/80 focus:bg-red-950/10 text-red-200 focus:text-red-100";
                                            }
                                            if (err.severity === 'warning') {
                                                return "border-amber-500/50 hover:border-amber-500/70 focus:border-amber-500/80 focus:bg-amber-950/10 text-amber-205 focus:text-amber-100";
                                            }
                                        }
                                        return isInferred 
                                            ? "border-amber-500/30 hover:border-amber-500/50 focus:border-amber-500/70 focus:bg-amber-950/10" 
                                             : "border-slate-800/40 hover:border-slate-700/60 focus:border-cyan-500/35 focus:bg-slate-900/50";
                                    };
                                    
                                    // Find inference engine
                                    const inferenceEngine = stack.find(c => 
                                        c.standardized?.kind === 'inference_engine' || 
                                        c.standardized?.role === 'decode' || 
                                        c.standardized?.role === 'prefill' ||
                                        c.standardized?.role === 'aggregate'
                                    ) || stack.find(c => 
                                        ['vllm', 'tgi', 'tensorrt', 'tensorrt_llm', 'sglang', 'ollama'].includes(String(c.standardized?.tool || '').toLowerCase())
                                    );

                                    const otherTools = [];
                                    const loadTool = rawReport?.scenario?.load?.standardized?.tool;
                                    const loadVer = rawReport?.scenario?.load?.standardized?.tool_version;
                                    if (loadTool && loadTool !== 'unknown') {
                                        const loadStr = loadVer && loadVer !== 'unknown' ? `${loadTool} (${loadVer})` : loadTool;
                                        otherTools.push(loadStr);
                                    }

                                    stack.forEach(c => {
                                        if (c === inferenceEngine) return;
                                        const tool = c.standardized?.tool;
                                        const version = c.standardized?.tool_version;
                                        if (tool && tool !== 'unknown' && tool !== 'service') {
                                            const toolStr = version && version !== 'unknown' ? `${tool} (${version})` : tool;
                                            if (!otherTools.includes(toolStr)) {
                                                otherTools.push(toolStr);
                                            }
                                        }
                                    });

                                    const _otherToolsStr = otherTools.length > 0 ? otherTools.join(', ') : 'generic/unknown';

                                    return (
                                        <Panel key={bundle.id} padding="none" className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden shadow-none">
                                            <div 
                                                className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                                                onClick={() => toggleExpand(bundle.id)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div onClick={(e) => e.stopPropagation()} className="flex items-center">
                                                        <Checkbox
                                                            checked={selectedBundleIds.includes(bundle.id)}
                                                            onChange={() => toggleSelectBundle(bundle.id)}
                                                            className="cursor-pointer"
                                                        />
                                                    </div>

                                                    {(!bundle.validation.format || bundle.validation.errors.length > 0) && (
                                                        <AlertOctagon size={18} className="text-red-500 shrink-0" />
                                                    )}
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-bold text-slate-800 dark:text-slate-200 select-all">{bundle.payload.model_name || <span className="text-red-400 italic font-normal">Missing</span>}</span>
                                                            {bundle.isCoalesced && !bundle.isAutoCoalesced && (
                                                                <Badge tone="info" size="xs" className="px-1.5 py-0.5 font-bold flex items-center gap-1 text-[10px]">
                                                                    <Layers size={10} />
                                                                    <span>Coalesced ({bundle.payload.entries?.length || 0} stages)</span>
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <span className="text-xs text-slate-500 dark:text-slate-400 select-all font-mono opacity-80 mt-0.5">{bundle.dirKey}</span>
                                                        
                                                        {wizardStep === 2 && (() => {
                                                            const similarRuns = getSimilarBenchmarks(bundle);
                                                            if (similarRuns.length === 0) return null;
                                                            return (
                                                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-400 px-2.5 py-0.5 rounded border border-cyan-200 dark:border-cyan-900/50 hover:bg-cyan-100 dark:hover:bg-cyan-900/70 cursor-pointer select-none transition-colors shadow-sm animate-in fade-in zoom-in-95 duration-150"
                                                                          onClick={(e) => { e.stopPropagation(); if (!bundle.isExpanded) toggleExpand(bundle.id); }}
                                                                          title="Click to view similar public benchmarks and sync configurations"
                                                                    >
                                                                        🔍 {similarRuns.length} similar public runs
                                                                    </span>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    {bundle.isCoalesced && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleUngroupBundle(bundle.id); }}
                                                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs font-semibold text-slate-300 hover:text-cyan-400 flex items-center gap-1 transition-colors cursor-pointer"
                                                            title="Ungroup benchmarks back into original constituent runs"
                                                        >
                                                            <Split size={12} />
                                                            <span>Ungroup</span>
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); removeFile(bundle.id); }}
                                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                        title="Skip run"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                    {bundle.isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                                                </div>
                                            </div>

                                            {bundle.isExpanded && (
                                                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-sm">
                                                    <div className={cn('grid grid-cols-1', wizardStep === 2 ? 'lg:grid-cols-3' : 'lg:grid-cols-1', 'gap-4')}>
                                                        <div className={cn(wizardStep === 2 ? 'lg:col-span-2' : 'w-full', 'space-y-4')}>
                                                    
                                                    {(() => {
                                                        const activeErrors = bundle.validation.errors || [];
                                                        const activeWarnings = (bundle.validation.warnings || []).filter(w => 
                                                            !w.toLowerCase().includes("hardware metadata is missing") && 
                                                            !w.toLowerCase().includes("missing attribution fields")
                                                        );

                                                        if (activeErrors.length === 0 && activeWarnings.length === 0) return null;

                                                        return (
                                                            <div className="space-y-3 mb-3">
                                                                {activeErrors.length > 0 && (
                                                                    <div className="p-3 rounded-lg border text-xs bg-red-50 dark:bg-red-900/25 border-red-200 dark:border-red-900/50 text-red-750 dark:text-red-300">
                                                                        <h4 className="font-semibold mb-1 flex items-center gap-1.5 text-red-750 dark:text-red-300"><AlertOctagon size={14} className="shrink-0 text-red-500"/> Errors:</h4>
                                                                        <ul className="list-disc pl-5 space-y-1 text-red-750 dark:text-red-300">
                                                                            {activeErrors.map((e, i) => <li key={i}>{e}</li>)}
                                                                        </ul>
                                                                    </div>
                                                                )}
                                                                {activeWarnings.length > 0 && (
                                                                    <div className="p-3 rounded-lg border text-xs bg-amber-50 dark:bg-amber-900/25 border-amber-200 dark:border-amber-900/50 text-amber-750 dark:text-amber-300">
                                                                        <h4 className="font-semibold mb-1 flex items-center gap-1.5 text-amber-750 dark:text-amber-300"><AlertTriangle size={14} className="shrink-0 text-amber-500"/> Warnings:</h4>
                                                                        <ul className="list-disc pl-5 space-y-1 text-amber-750 dark:text-amber-300">
                                                                            {activeWarnings.map((w, i) => <li key={i}>{w}</li>)}
                                                                        </ul>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                    <div className="text-[10px] text-slate-500 italic mb-2 px-1 select-none font-semibold">
                                                          * Fields marked with "Inferred" are auto-populated by guessing from configuration files and should be verified (these fields will become editable in the next stage).
                                                      </div>

                                                      <div className="mb-4 overflow-hidden border border-slate-800/40 rounded-xl bg-slate-950/40 backdrop-blur-md shadow-sm">
                                                          <table className="w-full text-left text-xs border-collapse">
                                                              <tbody className="divide-y divide-slate-800/35">
                                                                  <tr className="hover:bg-slate-900/20">
                                                                      <td className="px-3.5 py-2.5 font-semibold text-slate-400 border-r border-slate-800/45 bg-slate-950/30" style={{ width: '220px', minWidth: '220px' }}>
                                                                          <span>Benchmark Name</span>
                                                                      </td>
                                                                      <td className="px-3.5 py-2.5">
                                                                          {wizardStep === 2 ? (
                                                                              <div className="relative flex items-center w-full group">
                                                                                  <input 
                                                                                      type="text" 
                                                                                      value={bundle.name || bundle.payload?.runLabel || ''} 
                                                                                      onChange={(e) => updateSingleField(bundle.id, 'runLabel', e.target.value)}
                                                                                      className={`w-full bg-slate-900/20 border rounded-lg pl-3 pr-8 py-1.5 text-slate-200 font-semibold focus:ring-0 focus:outline-none transition-all text-xs ${getFieldClassName('runLabel', false)}`}
                                                                                      placeholder="My custom run name"
                                                                                  />
                                                                                  <div className="absolute right-2.5 flex items-center gap-2 pointer-events-none select-none">
                                                                                      <Pencil size={10} className="text-slate-650 group-focus-within:text-cyan-400 transition-colors" />
                                                                                  </div>
                                                                              </div>
                                                                          ) : (
                                                                              <span className="text-slate-300 font-semibold select-all text-xs">{bundle.name || bundle.payload?.runLabel || <span className="text-red-400 italic font-normal">Missing</span>}</span>
                                                                          )}
                                                                      </td>
                                                                  </tr>
                                                                  <tr className="hover:bg-slate-900/20">
                                                                      <td className="px-3.5 py-2.5 font-semibold text-slate-400 border-r border-slate-800/45 bg-slate-950/30" style={{ width: '220px', minWidth: '220px' }}>
                                                                          <span>Model Name</span>
                                                                      </td>
                                                                      <td className="px-3.5 py-2.5">
                                                                          {wizardStep === 2 ? (
                                                                              <div className="relative flex items-center w-full group">
                                                                                  <input 
                                                                                      type="text" 
                                                                                      value={bundle.payload.model_name || ''} 
                                                                                      onChange={(e) => updateSingleField(bundle.id, 'model_name', e.target.value)}
                                                                                      className={cn(
                                                                                          'w-full bg-slate-900/20 border rounded-lg pl-3 pr-28 py-1.5 text-slate-200 font-semibold focus:ring-0 focus:outline-none transition-all text-xs',
                                                                                          getFieldClassName('model_name', bundle.payload.modelNameInferred)
                                                                                      )}
                                                                                      placeholder="google/gemma-4-31b-it"
                                                                                  />
                                                                                  <div className="absolute right-2.5 flex items-center gap-2 pointer-events-none select-none">
                                                                                      {bundle.payload.modelNameInferred && (
                                                                                          <Badge tone="warning" size="xs" className="text-[8px] font-extrabold animate-pulse"
                                                                                              title="This field was guessed/inferred from metadata/config files. Verify for correctness."
                                                                                          >
                                                                                              Inferred
                                                                                          </Badge>
                                                                                      )}
                                                                                      <Pencil size={10} className="text-slate-650 group-focus-within:text-cyan-400 transition-colors" />
                                                                                  </div>
                                                                              </div>
                                                                          ) : (
                                                                              <div className="flex items-center gap-2 text-xs">
                                                                                  <span className="text-slate-300 font-semibold select-all">{bundle.payload.model_name || <span className="text-red-400 italic font-normal">Missing</span>}</span>
                                                                                  {bundle.payload.modelNameInferred && (
                                                                                      <Badge tone="warning" size="xs" className="text-[8px] font-extrabold"
                                                                                          title="Inferred field"
                                                                                      >
                                                                                          Inferred
                                                                                      </Badge>
                                                                                  )}
                                                                              </div>
                                                                          )}
                                                                      </td>
                                                                  </tr>
                                                                  <tr className="hover:bg-slate-900/20">
                                                                      <td className="px-3.5 py-2.5 font-semibold text-slate-400 border-r border-slate-800/45 bg-slate-950/30" style={{ width: '220px', minWidth: '220px' }}>
                                                                          <span>Detailed Hardware</span>
                                                                      </td>
                                                                      <td className="px-3.5 py-2.5">
                                                                          {wizardStep === 2 ? (
                                                                              <div className="relative flex items-center w-full group">
                                                                                  <input 
                                                                                      type="text" 
                                                                                      value={bundle.payload.hardware?.hardware_name || ''} 
                                                                                      onChange={(e) => updateSingleField(bundle.id, 'hardware_name', e.target.value)}
                                                                                      className={cn(
                                                                                          'w-full bg-slate-900/20 border rounded-lg pl-3 pr-28 py-1.5 text-slate-200 font-semibold focus:ring-0 focus:outline-none transition-all text-xs',
                                                                                          getFieldClassName('hardware.hardware_name', bundle.payload.hardwareInferred)
                                                                                      )}
                                                                                      placeholder="H100, TPU v6e"
                                                                                  />
                                                                                  <div className="absolute right-2.5 flex items-center gap-2 pointer-events-none select-none">
                                                                                      {bundle.payload.hardwareInferred && (
                                                                                          <Badge tone="warning" size="xs" className="text-[8px] font-extrabold animate-pulse"
                                                                                              title="This field was guessed/inferred from metadata/config files. Verify for correctness."
                                                                                          >
                                                                                              Inferred
                                                                                          </Badge>
                                                                                      )}
                                                                                      <Pencil size={10} className="text-slate-650 group-focus-within:text-cyan-400 transition-colors" />
                                                                                  </div>
                                                                              </div>
                                                                          ) : (
                                                                              <div className="flex items-center gap-2 text-xs">
                                                                                  <span className="text-slate-300 font-semibold select-all">{bundle.payload.hardware?.hardware_name || <span className="text-red-400 italic font-normal">Missing</span>}</span>
                                                                                  {bundle.payload.hardwareInferred && (
                                                                                      <Badge tone="warning" size="xs" className="text-[8px] font-extrabold"
                                                                                          title="Inferred field"
                                                                                      >
                                                                                          Inferred
                                                                                      </Badge>
                                                                                  )}
                                                                              </div>
                                                                          )}
                                                                      </td>
                                                                  </tr>
                                                                  <tr className="hover:bg-slate-900/20">
                                                                      <td className="px-3.5 py-2.5 font-semibold text-slate-400 border-r border-slate-800/45 bg-slate-950/30" style={{ width: '220px', minWidth: '220px' }}>
                                                                          <span>Accelerator/Chip Count</span>
                                                                      </td>
                                                                      <td className="px-3.5 py-2.5">
                                                                          {wizardStep === 2 ? (
                                                                              <div className="relative flex items-center w-full group">
                                                                                  <input 
                                                                                      type="number" 
                                                                                      value={bundle.payload.hardware?.accelerator_count ?? ''} 
                                                                                      onChange={(e) => updateSingleField(bundle.id, 'accelerator_count', e.target.value)}
                                                                                       onFocus={() => clearInferredField(bundle.id, 'acceleratorCountInferred')}
                                                                                       onClick={() => clearInferredField(bundle.id, 'acceleratorCountInferred')}
                                                                                      className={cn(
                                                                                          'w-full bg-slate-900/20 border rounded-lg pl-3 pr-28 py-1.5 text-slate-200 font-mono focus:ring-0 focus:outline-none transition-all text-xs',
                                                                                          getFieldClassName('hardware.accelerator_count', bundle.payload.acceleratorCountInferred)
                                                                                      )}
                                                                                      placeholder="8"
                                                                                  />
                                                                                  <div className="absolute right-2.5 flex items-center gap-2 pointer-events-none select-none">
                                                                                      {bundle.payload.acceleratorCountInferred && (
                                                                                          <Badge tone="warning" size="xs" className="text-[8px] font-extrabold animate-pulse"
                                                                                              title="This field was guessed/inferred from metadata/config files. Verify for correctness."
                                                                                          >
                                                                                              Inferred
                                                                                          </Badge>
                                                                                      )}
                                                                                      <Pencil size={10} className="text-slate-650 group-focus-within:text-cyan-400 transition-colors" />
                                                                                  </div>
                                                                              </div>
                                                                          ) : (
                                                                              <div className="flex items-center gap-2 text-xs">
                                                                                  <span className="text-slate-300 font-semibold select-all font-mono">{bundle.payload.hardware?.accelerator_count !== null && bundle.payload.hardware?.accelerator_count !== undefined ? bundle.payload.hardware.accelerator_count : <span className="text-red-400 italic font-normal font-sans">Missing</span>}</span>
                                                                                  {bundle.payload.acceleratorCountInferred && (
                                                                                      <Badge tone="warning" size="xs" className="text-[8px] font-extrabold"
                                                                                          title="Inferred field"
                                                                                      >
                                                                                          Inferred
                                                                                      </Badge>
                                                                                  )}
                                                                              </div>
                                                                          )}
                                                                      </td>
                                                                  </tr>
                                                                 <tr className="hover:bg-slate-900/20">
                                                                     <td className="px-3.5 py-2.5 font-semibold text-slate-400 border-r border-slate-800/45 bg-slate-950/30" style={{ width: '220px', minWidth: '220px' }}>
                                                                         <span>Serving Stack</span>
                                                                     </td>
                                                                     <td className="px-3.5 py-2.5">
                                                                         {wizardStep === 2 ? (
                                                                             <div className="relative flex items-center w-full gap-3 group">
                                                                                 <div className="flex-1 flex gap-2">
                                                                                     <input 
                                                                                         type="text" 
                                                                                         value={bundle.payload.inference_tool || ''} 
                                                                                         onChange={(e) => updateSingleField(bundle.id, 'inference_tool', e.target.value)}
                                                                                         className={`w-1/2 bg-slate-900/20 border rounded-lg px-3 py-1.5 text-slate-200 font-semibold focus:ring-0 focus:outline-none placeholder-slate-750 transition-all text-xs ${getFieldClassName('inference_tool', false)}`}
                                                                                         placeholder="vLLM"
                                                                                     />
                                                                                     <input 
                                                                                         type="text" 
                                                                                         value={bundle.payload.inference_tool_version || ''} 
                                                                                         onChange={(e) => updateSingleField(bundle.id, 'inference_tool_version', e.target.value)}
                                                                                         className={`w-1/2 bg-slate-900/20 border rounded-lg px-3 py-1.5 text-slate-400 focus:ring-0 focus:outline-none placeholder-slate-750 transition-all font-mono text-xs ${getFieldClassName('inference_tool_version', false)}`}
                                                                                         placeholder="0.4.2"
                                                                                     />
                                                                                 </div>
                                                                                 <div className="flex items-center gap-2 shrink-0 select-none">
                                                                                     <Pencil size={10} className="text-slate-650 group-focus-within:text-cyan-400 transition-colors" />
                                                                                 </div>
                                                                             </div>
                                                                         ) : (
                                                                             <span className="text-slate-300 font-semibold select-all text-xs">
                                                                                 {bundle.payload.inference_tool 
                                                                                     ? `${bundle.payload.inference_tool}${bundle.payload.inference_tool_version ? ` (${bundle.payload.inference_tool_version})` : ''}` 
                                                                                     : <span className="text-amber-400 italic font-normal">Missing</span>}
                                                                             </span>
                                                                         )}
                                                                     </td>
                                                                 </tr>
                                                                 <tr className="hover:bg-slate-900/20">
                                                                     <td className="px-3.5 py-2.5 font-semibold text-slate-400 border-r border-slate-800/45 bg-slate-950/30" style={{ width: '220px', minWidth: '220px' }}>
                                                                         <span>Benchmark Harness</span>
                                                                     </td>
                                                                     <td className="px-3.5 py-2.5">
                                                                         {wizardStep === 2 ? (
                                                                             <div className="relative flex items-center w-full gap-3 group">
                                                                                 <div className="flex-1 flex gap-2">
                                                                                     <input 
                                                                                         type="text" 
                                                                                         value={bundle.payload.benchmark_harness || ''} 
                                                                                         onChange={(e) => updateSingleField(bundle.id, 'benchmark_harness', e.target.value)}
                                                                                         className={`w-1/2 bg-slate-900/20 border rounded-lg px-3 py-1.5 text-slate-200 font-semibold focus:ring-0 focus:outline-none placeholder-slate-750 transition-all text-xs ${getFieldClassName('benchmark_harness', false)}`}
                                                                                         placeholder="inference-perf"
                                                                                     />
                                                                                     <input 
                                                                                         type="text" 
                                                                                         value={bundle.payload.benchmark_harness_version || ''} 
                                                                                         onChange={(e) => updateSingleField(bundle.id, 'benchmark_harness_version', e.target.value)}
                                                                                         className={`w-1/2 bg-slate-900/20 border rounded-lg px-3 py-1.5 text-slate-400 focus:ring-0 focus:outline-none placeholder-slate-750 transition-all font-mono text-xs ${getFieldClassName('benchmark_harness_version', false)}`}
                                                                                         placeholder="v0.2.0"
                                                                                     />
                                                                                 </div>
                                                                                 <div className="flex items-center gap-2 shrink-0 select-none">
                                                                                     <Pencil size={10} className="text-slate-650 group-focus-within:text-cyan-400 transition-colors" />
                                                                                 </div>
                                                                             </div>
                                                                         ) : (
                                                                             <span className="text-slate-300 font-semibold select-all text-xs">
                                                                                 {bundle.payload.benchmark_harness 
                                                                                     ? `${bundle.payload.benchmark_harness}${bundle.payload.benchmark_harness_version ? ` (${bundle.payload.benchmark_harness_version})` : ''}` 
                                                                                     : <span className="text-slate-500 italic font-normal">N/A</span>}
                                                                             </span>
                                                                         )}
                                                                     </td>
                                                                 </tr>
                                                                 <tr className="hover:bg-slate-900/20">
                                                                      <td className="px-3.5 py-2.5 font-semibold text-slate-400 border-r border-slate-800/45 bg-slate-950/30" style={{ width: '220px', minWidth: '220px' }}>Attached Manifests & Configs</td>
                                                                      <td className="px-3.5 py-3 text-slate-300">
                                                                          <div className="space-y-2">
                                                                              {/* List of attached files and URLs */}
                                                                              {((bundle.attachedManifests || []).length > 0 || Object.keys(bundle.payload.manifests || {}).length > 0) && (
                                                                                  <div className="space-y-1.5 mb-2">
                                                                                      {(bundle.attachedManifests || []).map((file, idx) => (
                                                                                          <div key={`local-${idx}`} className="flex items-center justify-between bg-slate-950/40 border border-slate-900 px-3 py-1.5 rounded-lg max-w-xl">
                                                                                              <div className="flex items-center gap-2">
                                                                                                  <span className="text-cyan-400 font-bold text-[11px] font-mono">{file.name}</span>
                                                                                                  <span className="text-[9px] text-slate-500 font-semibold font-mono">({Math.round(file.content.length / 1024 * 10) / 10} KB)</span>
                                                                                              </div>
                                                                                              {wizardStep === 2 && (
                                                                                                  <button 
                                                                                                      onClick={() => removeAttachedManifest(bundle.id, file.name)}
                                                                                                      className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-slate-900/60 transition-colors"
                                                                                                      title="Remove manifest file"
                                                                                                  >
                                                                                                      <Trash2 size={12} />
                                                                                                  </button>
                                                                                              )}
                                                                                          </div>
                                                                                      ))}
                                                                                      {Object.entries(bundle.payload.manifests || {}).map(([name, url], idx) => (
                                                                                          <div key={`url-${idx}`} className="flex items-center justify-between bg-slate-950/40 border border-slate-900 px-3 py-1.5 rounded-lg max-w-xl">
                                                                                              <div className="flex items-center gap-2 truncate pr-4">
                                                                                                  <span className="text-cyan-400 font-bold text-[11px] font-mono">{name}</span>
                                                                                                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-slate-500 hover:text-cyan-400 font-mono truncate max-w-xs transition-colors" title={url}>({url})</a>
                                                                                              </div>
                                                                                              {wizardStep === 2 && (
                                                                                                  <button 
                                                                                                      onClick={() => removeManifestFromBundle(bundle.id, name)}
                                                                                                      className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-slate-900/60 transition-colors"
                                                                                                      title="Remove manifest URL"
                                                                                                  >
                                                                                                      <Trash2 size={12} />
                                                                                                  </button>
                                                                                              )}
                                                                                          </div>
                                                                                      ))}
                                                                                  </div>
                                                                              )}
                                                                              
                                                                              {/* Simple inline Drag-and-drop or File input area */}
                                                                              {wizardStep === 1 && (bundle.attachedManifests || []).length === 0 && Object.keys(bundle.payload.manifests || {}).length === 0 && (
                                                                                  <span className="text-amber-400 italic font-normal select-none">Missing (Optional)</span>
                                                                              )}
                                                                              
                                                                              {/* Simple inline Drag-and-drop or File input area */}
                                                                              {wizardStep === 2 && (
                                                                                  <div className="space-y-2 max-w-xl">
                                                                                      <div className={cn("border border-dashed rounded-lg px-3 py-1.5 flex items-center justify-center gap-2 bg-slate-950/20 transition-all cursor-pointer relative group", fieldErrors['manifests'] ? "border-amber-500/60 hover:border-amber-500/80" : "border-slate-800 hover:border-cyan-500/60")}>
                                                                                          <Upload size={13} className="text-slate-500 group-hover:text-cyan-400 shrink-0" />
                                                                                          <span className="text-[10px] text-slate-400 font-bold block truncate">Drag or click to attach YAML/JSON configuration</span>
                                                                                          <input 
                                                                                              type="file" 
                                                                                              accept=".yaml,.yml,.json" 
                                                                                              className="absolute inset-0 opacity-0 cursor-pointer" 
                                                                                              onChange={(e) => {
                                                                                                  const file = e.target.files?.[0];
                                                                                                  if (file) {
                                                                                                      const reader = new FileReader();
                                                                                                      reader.onload = (evt) => {
                                                                                                          parseManifestAndFillGaps(bundle.id, file.name, evt.target.result);
                                                                                                      };
                                                                                                      reader.readAsText(file);
                                                                                                  }
                                                                                              }}
                                                                                          />
                                                                                      </div>

                                                                                      <div className="flex gap-2">
                                                                                          <Input
                                                                                              type="text"
                                                                                              value={manifestUrlInputs[bundle.id] || ''}
                                                                                              onChange={(e) => setManifestUrlInputs(prev => ({ ...prev, [bundle.id]: e.target.value }))}
                                                                                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddManifestUrl(bundle.id); } }}
                                                                                              placeholder="https://github.com/my-org/runs/vllm.yaml"
                                                                                              className="flex-1 text-xs py-1.5"
                                                                                          />
                                                                                          <Button
                                                                                              variant="secondary"
                                                                                              size="sm"
                                                                                              onClick={() => handleAddManifestUrl(bundle.id)}
                                                                                              className="shrink-0"
                                                                                          >
                                                                                              Add URL
                                                                                          </Button>
                                                                                      </div>
                                                                                  </div>
                                                                              )}
                                                                          </div>
                                                                      </td>
                                                                  </tr>
                                                                  <tr className="hover:bg-slate-900/20">
                                                                      <td className="px-3.5 py-2.5 font-semibold text-slate-400 border-r border-slate-800/45 bg-slate-950/30" style={{ width: '220px', minWidth: '220px' }}>Evidence Logs & Verification</td>
                                                                      <td className="px-3.5 py-3 text-slate-300">
                                                                          <div className="space-y-2">
                                                                              {/* List of attached files and URLs */}
                                                                              {((bundle.attachedEvidence || []).length > 0 || Object.keys(bundle.payload.evidence || {}).length > 0) && (
                                                                                  <div className="space-y-1.5 mb-2">
                                                                                      {(bundle.attachedEvidence || []).map((file, idx) => (
                                                                                          <div key={`local-ev-${idx}`} className="flex items-center justify-between bg-slate-950/40 border border-slate-900 px-3 py-1.5 rounded-lg max-w-xl">
                                                                                              <div className="flex items-center gap-2">
                                                                                                  <span className="text-cyan-400 font-bold text-[11px] font-mono">{file.name}</span>
                                                                                                  <span className="text-[9px] text-slate-500 font-semibold font-mono">({Math.round(file.content.length / 1024 * 10) / 10} KB)</span>
                                                                                              </div>
                                                                                              {wizardStep === 2 && (
                                                                                                  <button 
                                                                                                      onClick={() => removeAttachedEvidence(bundle.id, file.name)}
                                                                                                      className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-slate-900/60 transition-colors"
                                                                                                      title="Remove evidence file"
                                                                                                  >
                                                                                                      <Trash2 size={12} />
                                                                                                  </button>
                                                                                              )}
                                                                                          </div>
                                                                                      ))}
                                                                                      {Object.entries(bundle.payload.evidence || {}).map(([name, url], idx) => (
                                                                                          <div key={`url-ev-${idx}`} className="flex items-center justify-between bg-slate-950/40 border border-slate-900 px-3 py-1.5 rounded-lg max-w-xl">
                                                                                              <div className="flex items-center gap-2 truncate pr-4">
                                                                                                  <span className="text-cyan-400 font-bold text-[11px] font-mono">{name}</span>
                                                                                                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-slate-500 hover:text-cyan-400 font-mono truncate max-w-xs transition-colors" title={url}>({url})</a>
                                                                                              </div>
                                                                                              {wizardStep === 2 && (
                                                                                                  <button 
                                                                                                      onClick={() => removeEvidenceFromBundle(bundle.id, name)}
                                                                                                      className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-slate-900/60 transition-colors"
                                                                                                      title="Remove evidence URL"
                                                                                                  >
                                                                                                      <Trash2 size={12} />
                                                                                                  </button>
                                                                                              )}
                                                                                          </div>
                                                                                      ))}
                                                                                  </div>
                                                                              )}
                                                                              
                                                                              {/* Simple inline Drag-and-drop or File input area */}
                                                                              {wizardStep === 1 && (bundle.attachedEvidence || []).length === 0 && Object.keys(bundle.payload.evidence || {}).length === 0 && (
                                                                                  <span className="text-amber-400 italic font-normal select-none">Missing (Optional)</span>
                                                                              )}
                                                                              
                                                                              {/* Simple inline Drag-and-drop or File input area */}
                                                                              {wizardStep === 2 && (
                                                                                  <div className="space-y-2 max-w-xl">
                                                                                      <div className={cn("border border-dashed rounded-lg px-3 py-1.5 flex items-center justify-center gap-2 bg-slate-950/20 transition-all cursor-pointer relative group", fieldErrors['evidence'] ? "border-amber-500/60 hover:border-amber-500/80" : "border-slate-800 hover:border-cyan-500/60")}>
                                                                                          <Upload size={13} className="text-slate-500 group-hover:text-cyan-400 shrink-0" />
                                                                                          <span className="text-[10px] text-slate-400 font-bold block truncate">Drag or click to attach verification run logs/evidence</span>
                                                                                          <input 
                                                                                              type="file" 
                                                                                              accept=".txt,.log,.json,.yaml,.yml" 
                                                                                              className="absolute inset-0 opacity-0 cursor-pointer" 
                                                                                              onChange={(e) => {
                                                                                                  const file = e.target.files?.[0];
                                                                                                  if (file) {
                                                                                                      attachEvidenceFile(bundle.id, file);
                                                                                                  }
                                                                                              }}
                                                                                          />
                                                                                      </div>

                                                                                      <div className="flex gap-2">
                                                                                          <Input
                                                                                              type="text"
                                                                                              value={evidenceUrlInputs[bundle.id] || ''}
                                                                                              onChange={(e) => setEvidenceUrlInputs(prev => ({ ...prev, [bundle.id]: e.target.value }))}
                                                                                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddEvidenceUrl(bundle.id); } }}
                                                                                              placeholder="gs://my-bucket/runs/evidence.log"
                                                                                              className="flex-1 text-xs py-1.5"
                                                                                          />
                                                                                          <Button
                                                                                              variant="secondary"
                                                                                              size="sm"
                                                                                              onClick={() => handleAddEvidenceUrl(bundle.id)}
                                                                                              className="shrink-0"
                                                                                          >
                                                                                              Add URL
                                                                                          </Button>
                                                                                      </div>
                                                                                  </div>
                                                                              )}
                                                                          </div>
                                                                      </td>
                                                                  </tr>
                                                             </tbody>
                                                         </table>
                                                     </div>
                                                    
                                                    {bundle.payload.entries && bundle.payload.entries.length > 0 && (
                                                        <div>
                                                            <h4 className="font-bold text-slate-300 text-xs uppercase tracking-wider mb-2.5 select-none">Parsed Sub-runs / Stages Validation Checklist ({bundle.payload.entries.length})</h4>
                                                            <div className="overflow-x-auto border border-slate-900/60 rounded-xl bg-slate-950/20">
                                                                <table className="w-full text-left text-xs border-collapse">
                                                                    <thead className="bg-[#0b101c]/45 text-slate-400 border-b border-slate-900/80 uppercase tracking-widest text-[9px]">
                                                                        <tr>
                                                                            <th className="px-2 py-1.5 w-8 text-center"></th>
                                                                            <th className="px-3 py-1.5 w-12 text-center">Stage</th>
                                                                            <th className="px-3 py-1.5 text-center">File</th>
                                                                            <th
                                                                                onClick={() => handleSortStages(bundle.id, 'timestamp')}
                                                                                className="px-3 py-1.5 cursor-pointer hover:text-cyan-400 select-none transition-colors group"
                                                                                title="Click to sort by timestamp"
                                                                            >
                                                                                <div className="flex items-center gap-1">
                                                                                    <span>Timestamp</span>
                                                                                    {stageSortConfig[bundle.id]?.column === 'timestamp' ? (
                                                                                        <span className="text-cyan-400 font-bold">{stageSortConfig[bundle.id].direction === 'asc' ? '▲' : '▼'}</span>
                                                                                    ) : (
                                                                                        <span className="opacity-0 group-hover:opacity-60 text-slate-500">▲</span>
                                                                                    )}
                                                                                </div>
                                                                            </th>
                                                                            <th
                                                                                onClick={() => handleSortStages(bundle.id, 'throughput')}
                                                                                className="px-3 py-1.5 text-right cursor-pointer hover:text-cyan-400 select-none transition-colors group"
                                                                                title="Click to sort by throughput"
                                                                            >
                                                                                <div className="flex items-center justify-end gap-1">
                                                                                    {stageSortConfig[bundle.id]?.column === 'throughput' ? (
                                                                                        <span className="text-cyan-400 font-bold">{stageSortConfig[bundle.id].direction === 'asc' ? '▲' : '▼'}</span>
                                                                                    ) : (
                                                                                        <span className="opacity-0 group-hover:opacity-60 text-slate-500">▲</span>
                                                                                    )}
                                                                                    <span>Throughput</span>
                                                                                </div>
                                                                            </th>
                                                                            <th
                                                                                onClick={() => handleSortStages(bundle.id, 'latency')}
                                                                                className="px-3 py-1.5 text-right cursor-pointer hover:text-cyan-400 select-none transition-colors group"
                                                                                title="Click to sort by E2E latency"
                                                                            >
                                                                                <div className="relative flex items-center justify-end gap-1 group/metric-tooltip">
                                                                                    {stageSortConfig[bundle.id]?.column === 'latency' ? (
                                                                                        <span className="text-cyan-400 font-bold">{stageSortConfig[bundle.id].direction === 'asc' ? '▲' : '▼'}</span>
                                                                                    ) : (
                                                                                        <span className="opacity-0 group-hover:opacity-60 text-slate-500">▲</span>
                                                                                    )}
                                                                                    <span className="underline decoration-dotted underline-offset-4 decoration-slate-500/70 hover:decoration-cyan-400">
                                                                                        Latency
                                                                                    </span>
                                                                                    <div className="absolute right-0 top-full mt-2 hidden group-hover/metric-tooltip:block px-2.5 py-1.5 bg-slate-900 border border-slate-700/80 text-slate-200 text-xs rounded-lg shadow-xl z-50 whitespace-nowrap text-right normal-case tracking-normal font-sans font-normal pointer-events-none">
                                                                                        <span className="text-[11px] text-slate-300">End-to-End Latency</span>
                                                                                    </div>
                                                                                </div>
                                                                            </th>
                                                                            <th
                                                                                onClick={() => handleSortStages(bundle.id, 'ttft')}
                                                                                className="px-3 py-1.5 text-right cursor-pointer hover:text-cyan-400 select-none transition-colors group"
                                                                                title="Click to sort by TTFT"
                                                                            >
                                                                                <div className="relative flex items-center justify-end gap-1 group/metric-tooltip">
                                                                                    {stageSortConfig[bundle.id]?.column === 'ttft' ? (
                                                                                        <span className="text-cyan-400 font-bold">{stageSortConfig[bundle.id].direction === 'asc' ? '▲' : '▼'}</span>
                                                                                    ) : (
                                                                                        <span className="opacity-0 group-hover:opacity-60 text-slate-500">▲</span>
                                                                                    )}
                                                                                    <span className="underline decoration-dotted underline-offset-4 decoration-slate-500/70 hover:decoration-cyan-400">
                                                                                        TTFT
                                                                                    </span>
                                                                                    <div className="absolute right-0 top-full mt-2 hidden group-hover/metric-tooltip:block px-2.5 py-1.5 bg-slate-900 border border-slate-700/80 text-slate-200 text-xs rounded-lg shadow-xl z-50 whitespace-nowrap text-right normal-case tracking-normal font-sans font-normal pointer-events-none">
                                                                                        <span className="text-[11px] text-slate-300">Time to First Token (Prefill)</span>
                                                                                    </div>
                                                                                </div>
                                                                            </th>
                                                                            <th
                                                                                onClick={() => handleSortStages(bundle.id, 'tpot')}
                                                                                className="px-3 py-1.5 text-right cursor-pointer hover:text-cyan-400 select-none transition-colors group"
                                                                                title="Click to sort by TPOT"
                                                                            >
                                                                                <div className="relative flex items-center justify-end gap-1 group/metric-tooltip">
                                                                                    {stageSortConfig[bundle.id]?.column === 'tpot' ? (
                                                                                        <span className="text-cyan-400 font-bold">{stageSortConfig[bundle.id].direction === 'asc' ? '▲' : '▼'}</span>
                                                                                    ) : (
                                                                                        <span className="opacity-0 group-hover:opacity-60 text-slate-500">▲</span>
                                                                                    )}
                                                                                    <span className="underline decoration-dotted underline-offset-4 decoration-slate-500/70 hover:decoration-cyan-400">
                                                                                        TPOT
                                                                                    </span>
                                                                                    <div className="absolute right-0 top-full mt-2 hidden group-hover/metric-tooltip:block px-2.5 py-1.5 bg-slate-900 border border-slate-700/80 text-slate-200 text-xs rounded-lg shadow-xl z-50 whitespace-nowrap text-right normal-case tracking-normal font-sans font-normal pointer-events-none">
                                                                                        <span className="text-[11px] text-slate-300">Time per Output Token (Decode)</span>
                                                                                    </div>
                                                                                </div>
                                                                            </th>
                                                                            <th className="px-3 py-1.5 text-center">Status</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-slate-900/50">
                                                                        {bundle.payload.entries.map((entry, idx) => {
                                                                            const check = checkStageMetrics(entry, bundle.payload.format);
                                                                                const isStageValid = check.throughput.isValid && check.latency.isValid && check.ttft.isValid && check.tpot.isValid;
                                                                                return (
                                                                                    <tr
                                                                                        key={entry.run_id || idx}
                                                                                        draggable
                                                                                        onDragStart={() => setDraggedStageIndex({ bundleId: bundle.id, index: idx })}
                                                                                        onDragOver={(e) => e.preventDefault()}
                                                                                        onDrop={() => {
                                                                                            if (draggedStageIndex && draggedStageIndex.bundleId === bundle.id) {
                                                                                                handleMoveStage(bundle.id, draggedStageIndex.index, idx);
                                                                                            }
                                                                                            setDraggedStageIndex(null);
                                                                                        }}
                                                                                        className="hover:bg-slate-900/30 border-b border-slate-900/10 font-medium transition-colors"
                                                                                    >
                                                                                        <td className="px-2 py-1.5 text-center">
                                                                                            <div
                                                                                                className="cursor-grab active:cursor-grabbing p-1 text-slate-500 hover:text-cyan-400 transition-colors inline-block"
                                                                                                title="Drag to re-order stage"
                                                                                            >
                                                                                                <GripVertical size={14} />
                                                                                            </div>
                                                                                        </td>
                                                                                        <td className="px-3 py-1.5 text-center font-bold font-mono text-slate-400">{check.stageIndex}</td>
                                                                                        <td className="px-3 py-1.5 text-center">
                                                                                            <div
                                                                                                onMouseEnter={(e) => handleFilenameMouseEnter(e, check.filename)}
                                                                                                onMouseLeave={handleFilenameMouseLeave}
                                                                                                className="p-1 text-slate-400 hover:text-cyan-400 cursor-pointer transition-colors inline-flex items-center justify-center"
                                                                                            >
                                                                                                <Info size={15} />
                                                                                            </div>
                                                                                        </td>
                                                                                        <td className="px-3 py-1.5 font-mono text-[10px] text-slate-400 whitespace-nowrap" title={check.timestamp}>{check.timestamp}</td>
                                                                                        
                                                                                        <td className="px-3 py-1.5 text-right font-mono">
                                                                                            {check.throughput.isValid ? (
                                                                                                <span className="text-slate-300">{check.throughput.val.toFixed(2)} t/s</span>
                                                                                            ) : (
                                                                                                <span className="text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20" title="Throughput must be greater than zero">❌ Absent</span>
                                                                                            )}
                                                                                        </td>
                                                                                        
                                                                                        <td className="px-3 py-1.5 text-right font-mono">
                                                                                            {check.latency.isValid ? (
                                                                                                <span className="text-slate-300">{check.latency.val.toFixed(1)}ms</span>
                                                                                            ) : (
                                                                                                <span className="text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20" title="End-to-end latency must be greater than zero">❌ Absent</span>
                                                                                            )}
                                                                                        </td>

                                                                                        <td className="px-3 py-1.5 text-right font-mono">
                                                                                            {check.ttft.isValid ? (
                                                                                                check.ttft.val !== null ? (
                                                                                                    <span className="text-slate-300">{check.ttft.val.toFixed(1)}ms</span>
                                                                                                ) : (
                                                                                                    <span className="text-slate-400">N/A (Legacy)</span>
                                                                                                )
                                                                                            ) : (
                                                                                                <span className="text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20" title="Time to first token (TTFT) is required for V0.2 formats">❌ Absent</span>
                                                                                            )}
                                                                                        </td>

                                                                                        <td className="px-3 py-1.5 text-right font-mono">
                                                                                            {check.tpot.isValid ? (
                                                                                                check.tpot.val !== null ? (
                                                                                                    <span className="text-slate-300">{check.tpot.val.toFixed(2)}ms</span>
                                                                                                ) : (
                                                                                                    <span className="text-slate-400">N/A (Legacy)</span>
                                                                                                )
                                                                                            ) : (
                                                                                                <span className="text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20" title="Time per output token (TPOT) is required for V0.2 formats">❌ Absent</span>
                                                                                            )}
                                                                                        </td>

                                                                                        <td className="px-3 py-1.5 text-center">
                                                                                            {isStageValid ? (
                                                                                                <Badge tone="success">Pass</Badge>
                                                                                            ) : (
                                                                                                <Badge tone="danger">Fail</Badge>
                                                                                            )}
                                                                                        </td>
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Target Dashboards Selection */}
                                                                                                        {/* Publish Destinations Selection */}
                                                    {wizardStep === 2 && (
                                                        <div className="mt-4 p-4 bg-slate-950/20 border border-slate-900/80 rounded-xl shadow-inner">
                                                        <h5 className="font-bold text-xs text-slate-300 mb-1 flex items-center gap-1.5 uppercase tracking-wider select-none">
                                                            Publish Destinations
                                                        </h5>
                                                        <p className="text-[10px] text-slate-500 mb-3 leading-normal">
                                                            Select the dashboards where this benchmark run should be published.
                                                        </p>
                                                        <div className="flex flex-wrap gap-4 text-xs font-semibold select-none">
                                                            <label className="flex items-center gap-2 cursor-pointer bg-slate-950/60 hover:bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-900/80 hover:border-cyan-500/35 shadow-md transition-all">
                                                                <Checkbox
                                                                    checked={bundle.targetDashboards?.includes('inference-scheduling') ?? false}
                                                                    onChange={(e) => {
                                                                        const checked = e.target.checked;
                                                                        setStagedFiles(prev => prev.map(f => {
                                                                            if (f.id === bundle.id) {
                                                                                const targets = f.targetDashboards || ['performance-browser'];
                                                                                const newTargets = checked 
                                                                                    ? [...targets, 'inference-scheduling'] 
                                                                                    : targets.filter(t => t !== 'inference-scheduling');
                                                                                
                                                                                // Set default well-lit path matching the dashboard
                                                                                const updatedWellLit = checked ? 'intelligent-routing' : f.payload.well_lit_path;
                                                                                return {
                                                                                    ...f,
                                                                                    targetDashboards: newTargets,
                                                                                    payload: { ...f.payload, well_lit_path: updatedWellLit }
                                                                                };
                                                                            }
                                                                            return f;
                                                                        }));
                                                                    }}
                                                                />
                                                                <span className="text-slate-300">Intelligent Routing (Inference Scheduling)</span>
                                                            </label>
                                                            <label className="flex items-center gap-2 cursor-pointer bg-slate-950/60 hover:bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-900/80 hover:border-cyan-500/35 shadow-md transition-all">
                                                                <Checkbox
                                                                    checked={bundle.targetDashboards?.includes('agentic-serving') ?? false}
                                                                    onChange={(e) => {
                                                                        const checked = e.target.checked;
                                                                        setStagedFiles(prev => prev.map(f => {
                                                                            if (f.id === bundle.id) {
                                                                                const targets = f.targetDashboards || ['performance-browser'];
                                                                                const newTargets = checked 
                                                                                    ? [...targets, 'agentic-serving'] 
                                                                                    : targets.filter(t => t !== 'agentic-serving');
                                                                                
                                                                                // Set default well-lit path matching the dashboard
                                                                                const updatedWellLit = checked ? 'pd-disaggregation' : f.payload.well_lit_path;
                                                                                return {
                                                                                    ...f,
                                                                                    targetDashboards: newTargets,
                                                                                    payload: { ...f.payload, well_lit_path: updatedWellLit }
                                                                                };
                                                                            }
                                                                            return f;
                                                                        }));
                                                                    }}
                                                                />
                                                                <span className="text-slate-300">Agentic Serving (Agentic Workloads)</span>
                                                            </label>
                                                        </div>
                                                    </div>
                                                    )}
                                                        </div> {/* Close left columns (lg:col-span-2) */}

                                                        {/* Right Column: Similar Runs Assistant */}
                                                        {wizardStep === 2 && (
                                                            <div className="bg-slate-100/30 dark:bg-slate-800/10 border border-slate-200/60 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm self-start text-xs space-y-4 w-full">
                                                            <div>
                                                                <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center gap-1.5 text-[13px]">
                                                                    <span>🔍 Benchmark Assistant</span>
                                                                </h4>
                                                                <p className="text-[10px] text-slate-500 mb-4 leading-relaxed">
                                                                    Compare staging metrics and sync metadata tags with matching public runs.
                                                                </p>

                                                                {(() => {
                                                                    const similar = getSimilarBenchmarks(bundle);
                                                                    if (similar.length === 0) {
                                                                        return (
                                                                            <div className="text-center py-6 text-slate-400 font-medium italic">
                                                                                No similar public runs found.
                                                                            </div>
                                                                        );
                                                                    }

                                                                    // Compute average performance of staged stages
                                                                    let stagedAvgTput = 0;
                                                                    let _stagedAvgLat = 0;
                                                                    if (bundle.payload.entries && bundle.payload.entries.length > 0) {
                                                                        let tCount = 0;
                                                                        let lCount = 0;
                                                                        bundle.payload.entries.forEach(e => {
                                                                            const t = e.raw_report?.throughput || e.raw_report?.metrics?.throughput || 0;
                                                                            if (t > 0) { stagedAvgTput += t; tCount++; }
                                                                            
                                                                            let l = 0;
                                                                            if (typeof e.raw_report?.latency === 'number') l = e.raw_report.latency;
                                                                            else if (typeof e.raw_report?.latency?.mean === 'number') l = e.raw_report.latency.mean;
                                                                            else if (typeof e.raw_report?.metrics?.latency?.mean === 'number') l = e.raw_report.metrics.latency.mean;
                                                                            if (l > 0) { _stagedAvgLat += l; lCount++; }
                                                                        });
                                                                        if (tCount > 0) stagedAvgTput /= tCount;
                                                                        if (lCount > 0) _stagedAvgLat /= lCount;
                                                                    }

                                                                    return (
                                                                        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                                                                            {similar.slice(0, 5).map((run, idx) => {
                                                                                const publicTput = run.throughput || run.metrics?.throughput || 0;
                                                                                
                                                                                let tputDelta = 0;
                                                                                if (publicTput > 0 && stagedAvgTput > 0) {
                                                                                    tputDelta = ((stagedAvgTput - publicTput) / publicTput) * 100;
                                                                                }

                                                                                return (
                                                                                    <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-2 relative shadow-sm">
                                                                                        <div className="flex justify-between items-start gap-1">
                                                                                            <div className="min-w-0 flex-1">
                                                                                                <span className="font-bold text-slate-800 dark:text-slate-100 select-all block truncate" title={run.model || run.model_name}>{run.model || run.model_name}</span>
                                                                                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono block mt-0.5">{run.hardware || 'H100'}</span>
                                                                                            </div>
                                                                                            <Badge tone="neutral" size="xs" className="text-[8px] font-bold scale-90 origin-right shrink-0">
                                                                                                {run.well_lit_path || 'No Path'}
                                                                                            </Badge>
                                                                                        </div>

                                                                                        <div className="flex justify-between items-center text-[10px]">
                                                                                            <div className="text-slate-500">
                                                                                                Tput: <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">{publicTput.toFixed(1)} tok/s</span>
                                                                                            </div>
                                                                                            {stagedAvgTput > 0 && publicTput > 0 && (
                                                                                                <span className={cn('font-extrabold shrink-0', tputDelta >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                                                                                                    {tputDelta >= 0 ? '▲' : '▼'} {Math.abs(tputDelta).toFixed(1)}% {tputDelta >= 0 ? 'faster' : 'slower'}
                                                                                                </span>
                                                                                            )}
                                                                                        </div>

                                                                                        <div className="border-t border-slate-100 dark:border-slate-800/80 pt-2 mt-2">
                                                                                            <span className="text-[9px] text-slate-400 font-mono truncate block" title={run.inference_tool ? `${run.inference_tool} ${run.inference_tool_version || ''}` : 'Unknown serving stack'}>
                                                                                                Serving Stack: {run.inference_tool ? `${run.inference_tool} ${run.inference_tool_version || ''}` : <span className="text-amber-400 italic font-normal">Missing</span>}
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                    )}
                                                    </div> {/* Close 3-column Grid */}
                                                </div>
                                            )}
                                        </Panel>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    )}
                    {wizardStep === 3 && renderStep3()}
                    {wizardStep === 4 && renderStep4()}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-900/60 bg-slate-950/40 backdrop-blur-md flex items-center justify-between">
                    {/* Left Side: Back */}
                    <div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={wizardStep > 1 ? () => setWizardStep(prev => prev - 1) : onNavigateBack}
                            className="px-4 py-2 rounded-xl font-semibold cursor-pointer"
                        >
                            <ArrowLeft size={14} /> Back
                        </Button>
                    </div>

                    {/* Middle: Step Progress Label */}
                    <div className="text-xs text-slate-500 font-semibold font-mono">
                        Step {wizardStep} of {uploadIntent === 'stage-locally' ? 2 : 4}
                    </div>

                    {/* Right Side: Next or Stage */}
                    <div className="flex items-center gap-3">
                        {wizardStep === 1 && (
                            <button
                                onClick={() => setWizardStep(2)}
                                disabled={stagedFiles.filter(f => !f.isSkipped).length === 0}
                                className={cn(
                                    'px-5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer',
                                    stagedFiles.filter(f => !f.isSkipped).length > 0
                                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md'
                                    : 'bg-slate-900/40 text-slate-500 border border-slate-900/50 cursor-not-allowed'
                                )}
                            >
                                Next <ArrowRight size={14} />
                            </button>
                        )}

                        {wizardStep === 2 && (
                            <div className="flex items-center gap-2">
                                {uploadIntent !== 'stage-locally' && validCount === 0 && (
                                    <span className="text-[10px] text-amber-500 font-semibold max-w-[200px] text-right animate-pulse mr-2">
                                        At least one valid run is required to proceed.
                                    </span>
                                )}
                                
                                {uploadIntent === 'stage-locally' ? (
                                    <button 
                                        id="wizard-proceed-staging-btn"
                                        onClick={handleStageLocally}
                                        disabled={validCount === 0 || stagedFiles.some(f => !f.isSkipped && f.validation.errors.length > 0)}
                                        className={cn(
                                            'px-5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border',
                                            validCount > 0 && !stagedFiles.some(f => !f.isSkipped && f.validation.errors.length > 0)
                                            ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-transparent shadow-md'
                                            : 'bg-slate-900/40 text-slate-500 border-slate-900/50 cursor-not-allowed'
                                        )}
                                    >
                                        Proceed to Staging
                                        <ArrowRight size={14} />
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => setWizardStep(3)}
                                        disabled={validCount === 0 || stagedFiles.some(f => !f.isSkipped && f.validation.errors.length > 0)}
                                        className={cn(
                                            'px-5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer',
                                            validCount > 0 && !stagedFiles.some(f => !f.isSkipped && f.validation.errors.length > 0)
                                            ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md'
                                            : 'bg-slate-900/40 text-slate-500 border border-slate-900/50 cursor-not-allowed'
                                        )}
                                    >
                                        Next <ArrowRight size={14} />
                                    </button>
                                )}
                            </div>
                        )}

                        {wizardStep === 3 && (
                            <div className="flex items-center gap-3">
                                {(!isAuthenticated || !user?.username || !dcoSigned) && (
                                    <span className="text-[10px] text-amber-500 font-semibold max-w-[200px] text-right animate-pulse">
                                        Please authenticate via GitHub and accept DCO to continue.
                                    </span>
                                )}
                                <button 
                                    onClick={() => setWizardStep(4)}
                                    disabled={!isAuthenticated || !user?.username || !dcoSigned}
                                    className={cn(
                                        'px-5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer',
                                        isAuthenticated && user?.username && dcoSigned
                                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md'
                                        : 'bg-slate-900/40 text-slate-500 border border-slate-900/50 cursor-not-allowed'
                                    )}
                                >
                                    Next <ArrowRight size={14} />
                                </button>
                            </div>
                        )}

                        {wizardStep === 4 && (
                            <div className="flex items-center gap-3">
                                {user?.permission === 'none' && (
                                    <span className="text-[10px] text-amber-500 font-semibold max-w-[240px] text-right">
                                        You are not in the Results Store closed-beta. Check back later once the feature is released.
                                    </span>
                                )}
                                <button 
                                    onClick={() => handleSubmit(targetVisibility)}
                                    disabled={isSubmitting || user?.permission === 'none'}
                                    className={`px-5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all ${
                                        isSubmitting || user?.permission === 'none'
                                        ? 'bg-slate-900/40 text-slate-500 border border-slate-900/50 cursor-not-allowed opacity-50 shadow-none'
                                        : targetVisibility === 'unlisted'
                                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md hover:shadow-cyan-500/10 cursor-pointer border border-cyan-500/20'
                                        : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md hover:shadow-emerald-500/10 cursor-pointer border border-emerald-500/20'
                                    }`}
                                >
                                    {isSubmitting ? (
                                        <Spinner size="xs" className="text-white dark:text-white" />
                                    ) : targetVisibility === 'unlisted' ? (
                                        <UploadCloud size={14} />
                                    ) : (
                                        <Check size={14} />
                                    )}
                                    {targetVisibility === 'unlisted' ? 'Save as Unlisted' : 'Submit for Public Review'}
                                </button>
                            </div>
                        )}

                        <button 
                            onClick={onNavigateBack}
                            className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-slate-200 border border-slate-900 hover:border-slate-800 hover:bg-slate-900/40 transition-all cursor-pointer"
                        >
                            Cancel
                        </button>
                    </div>
                </div>

                <CoalesceConflictModal
                    isOpen={isConflictModalOpen}
                    onClose={() => {
                        setIsConflictModalOpen(false);
                        setPendingCoalesceBundles([]);
                    }}
                    selectedBundles={pendingCoalesceBundles}
                    onConfirm={(resolvedMetadata) => {
                        executeCoalesce(pendingCoalesceBundles, resolvedMetadata);
                    }}
                />

                {hoveredFilenameTooltip && (
                    <div
                        className={cn(
                            "fixed px-3 py-2 bg-slate-900 border border-slate-700/80 text-slate-200 text-xs rounded-xl shadow-2xl z-[99999] min-w-[320px] w-max max-w-lg break-all pointer-events-none text-left backdrop-blur-md animate-in fade-in duration-100",
                            hoveredFilenameTooltip.isNearTop ? "-translate-x-1/2" : "-translate-x-1/2 -translate-y-full"
                        )}
                        style={{
                            left: `${hoveredFilenameTooltip.x}px`,
                            top: `${hoveredFilenameTooltip.y}px`
                        }}
                    >
                        <span className="font-bold text-cyan-400 block mb-0.5 text-[10px] font-sans uppercase tracking-wider">File Name / Path</span>
                        <span className="text-[11px] text-slate-300 select-all font-mono">{hoveredFilenameTooltip.filename}</span>
                    </div>
                )}

            </div>
        </div>
    );
};
