import React, { useState } from 'react';
import { X, UploadCloud, CheckCircle, AlertCircle, FileText, ChevronRight, ChevronDown, Trash2, Upload, ShieldAlert, Check } from 'lucide-react';
import { validateBenchmark, validatePrismUploadStructure } from '../../utils/benchmarkValidator';
import { parseReportV02, stageToEntry } from '../../utils/benchmarkReportV02Parser';
import yaml from 'js-yaml';

export const UploadValidationDialog = ({ isOpen, onClose, onCommit, existingRunIds = [], initialFiles = [], addToast }) => {
    const [stagedFiles, setStagedFiles] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const [ingestionSource, setIngestionSource] = useState('local'); // 'local' or 'cloud'
    const [cloudPath, setCloudPath] = useState('');
    const [cloudProvider, setCloudProvider] = useState('gcs'); // 'gcs' or 's3'
    const [selectedBundleIds, setSelectedBundleIds] = useState([]);
    const [showBatchEdit, setShowBatchEdit] = useState(false);
    const [batchWellLitPath, setBatchWellLitPath] = useState('');
    const [batchHardware, setBatchHardware] = useState('');
    const [batchManifestName, setBatchManifestName] = useState('');
    const [batchManifestUrl, setBatchManifestUrl] = useState('');
    const [batchEvidenceName, setBatchEvidenceName] = useState('');
    const [batchEvidenceUrl, setBatchEvidenceUrl] = useState('');
    const [batchMetadata, setBatchMetadata] = useState('');
    const [batchMetadataError, setBatchMetadataError] = useState('');
    const [singleMetadataTexts, setSingleMetadataTexts] = useState({});
    const [singleMetadataErrors, setSingleMetadataErrors] = useState({});

    const handleBatchMetadataChange = (val) => {
        setBatchMetadata(val);
        if (!val.trim()) {
            setBatchMetadataError('');
            return;
        }
        try {
            JSON.parse(val);
            setBatchMetadataError('');
        } catch (e) {
            setBatchMetadataError('Invalid JSON format: ' + e.message);
        }
    };

    const applyBatchEdit = () => {
        let parsedMeta = null;
        if (batchMetadata.trim()) {
            try {
                parsedMeta = JSON.parse(batchMetadata);
            } catch (e) {
                if (addToast) addToast("Cannot apply invalid batch metadata JSON.", "error");
                return;
            }
        }

        setStagedFiles(prev => prev.map(bundle => {
            if (selectedBundleIds.includes(bundle.id)) {
                const updatedPayload = {
                    ...bundle.payload,
                    well_lit_path: batchWellLitPath === 'none' ? null : (batchWellLitPath || bundle.payload.well_lit_path),
                    metadata: parsedMeta ? { ...(bundle.payload.metadata || {}), ...parsedMeta } : (bundle.payload.metadata || {})
                };

                if (batchHardware.trim()) {
                    updatedPayload.hardware = {
                        ...(updatedPayload.hardware || {}),
                        hardware_name: batchHardware.trim()
                    };
                }

                if (batchManifestName.trim() && batchManifestUrl.trim()) {
                    updatedPayload.manifests = {
                        ...(updatedPayload.manifests || {}),
                        [batchManifestName.trim()]: batchManifestUrl.trim()
                    };
                }

                if (batchEvidenceName.trim() && batchEvidenceUrl.trim()) {
                    updatedPayload.evidence = {
                        ...(updatedPayload.evidence || {}),
                        [batchEvidenceName.trim()]: batchEvidenceUrl.trim()
                    };
                }

                const uploadValidation = validatePrismUploadStructure(updatedPayload, { isUpload: false });
                const updatedValidation = {
                    ...bundle.validation,
                    hasHardware: updatedPayload.hardware?.hardware_name && updatedPayload.hardware.hardware_name !== 'Unknown' && updatedPayload.hardware.hardware_name !== 'Unknown Hardware',
                    errors: uploadValidation.errors,
                    warnings: uploadValidation.warnings
                };
                return {
                    ...bundle,
                    payload: updatedPayload,
                    validation: updatedValidation
                };
            }
            return bundle;
        }));

        // Reset state fields
        setShowBatchEdit(false);
        setSelectedBundleIds([]);
        setBatchWellLitPath('');
        setBatchHardware('');
        setBatchMetadata('');
        setBatchManifestName('');
        setBatchManifestUrl('');
        setBatchEvidenceName('');
        setBatchEvidenceUrl('');

        if (addToast) {
            addToast(`Successfully applied batch metadata to ${selectedBundleIds.length} runs.`, 'success');
        }
    };

    const updateSingleField = (bundleId, key, value) => {
        setStagedFiles(prev => prev.map(b => {
            if (b.id === bundleId) {
                const updatedPayload = { ...b.payload, [key]: value };
                if (key === 'hardware_name') {
                    updatedPayload.hardware = { ...updatedPayload.hardware, hardware_name: value };
                }
                const uploadValidation = validatePrismUploadStructure(updatedPayload, { isUpload: false });
                const updatedValidation = {
                    ...b.validation,
                    hasHardware: updatedPayload.hardware?.hardware_name && updatedPayload.hardware.hardware_name !== 'Unknown' && updatedPayload.hardware.hardware_name !== 'Unknown Hardware',
                    errors: uploadValidation.errors,
                    warnings: uploadValidation.warnings
                };
                return { ...b, payload: updatedPayload, validation: updatedValidation };
            }
            return b;
        }));
    };

    const handleSingleMetadataChange = (bundleId, value) => {
        setSingleMetadataTexts(prev => ({ ...prev, [bundleId]: value }));
        
        if (!value.trim()) {
            setSingleMetadataErrors(prev => ({ ...prev, [bundleId]: '' }));
            setStagedFiles(prev => prev.map(b => {
                if (b.id === bundleId) {
                    const updatedPayload = { ...b.payload, metadata: {} };
                    const uploadValidation = validatePrismUploadStructure(updatedPayload, { isUpload: false });
                    return { 
                        ...b, 
                        payload: updatedPayload,
                        validation: {
                            ...b.validation,
                            errors: uploadValidation.errors,
                            warnings: uploadValidation.warnings
                        }
                    };
                }
                return b;
            }));
            return;
        }

        try {
            const parsed = JSON.parse(value);
            setSingleMetadataErrors(prev => ({ ...prev, [bundleId]: '' }));
            setStagedFiles(prev => prev.map(b => {
                if (b.id === bundleId) {
                    const updatedPayload = { ...b.payload, metadata: parsed };
                    const uploadValidation = validatePrismUploadStructure(updatedPayload, { isUpload: false });
                    return { 
                        ...b, 
                        payload: updatedPayload,
                        validation: {
                            ...b.validation,
                            errors: uploadValidation.errors,
                            warnings: uploadValidation.warnings
                        }
                    };
                }
                return b;
            }));
        } catch (e) {
            setSingleMetadataErrors(prev => ({ ...prev, [bundleId]: 'Invalid JSON: ' + e.message }));
        }
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
            runId: cloudPath.replace(/^(gs:\/\/|s3:\/\/)/, ''),
            runLabel: runName,
            model_name: "meta-llama/Llama-3-8B-Instruct",
            hardware: {
                hardware_name: "H100"
            },
            attribution: null,
            manifests: {
                "vllm_service": "https://github.com/kubernetes-sigs/inference-perf/blob/main/manifests/vllm.yaml"
            },
            evidence: {
                "run_log": "gs://llm-d-benchmarks/regressions/optimized-baseline/gemma2_9b/run.log"
            },
            format: "brv02",
            run_metadata: {
                accelerator: "NVIDIA H100",
                accelerator_count: 8,
                model: "meta-llama/Llama-3-8B-Instruct"
            },
            entries: [
                {
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
                                    latency: { mean: 245.0, time_to_first_token: { p50: 0.15 }, time_per_output_token: { p50: 0.02 } }
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
            id: Math.random().toString(36).substring(7),
            dirKey: cloudPath.replace(/^(gs:\/\/|s3:\/\/)/, ''),
            name: runName,
            stageFiles: [],
            metadataFiles: {},
            payload,
            validation: bundleValidation,
            isExpanded: false,
            isSkipped: false
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

    const processFiles = async (files) => {
        let uploadedCount = 0;
        let omittedCount = 0;

        // Group files by parent directory prefix (dirKey)
        const groups = {};

        for (const file of files) {
            const relPath = file.webkitRelativePath || file.name || '';
            const filename = file.name || '';
            
            // Get parent directory key
            let dirKey = '';
            if (relPath.includes('/')) {
                const parts = relPath.split('/');
                parts.pop();
                dirKey = parts.join('/');
            } else {
                // Standalone files get a key based on their filename (stripped of extension)
                dirKey = filename.replace(/\.(ya?ml|json)$/i, '');
            }

            if (!groups[dirKey]) {
                groups[dirKey] = {
                    id: Math.random().toString(36).substring(7),
                    dirKey,
                    name: dirKey.split('/').pop(),
                    files: []
                };
            }
            groups[dirKey].files.push(file);
        }

        const newStagedBundles = [];

        for (const groupKey of Object.keys(groups)) {
            const group = groups[groupKey];
            
            const stageFiles = [];
            let runMetadataFile = null;
            let configFile = null;
            let summaryFile = null;

            for (const file of group.files) {
                const filename = file.name || '';
                
                if (/run_metadata\.ya?ml$/i.test(filename)) {
                    runMetadataFile = file;
                } else if (/config\.ya?ml$/i.test(filename)) {
                    configFile = file;
                } else if (/summary_lifecycle_metrics\.json$/i.test(filename)) {
                    summaryFile = file;
                } else if (/benchmark_report_v0\.2/i.test(filename) && /\.(ya?ml|json)$/i.test(filename)) {
                    stageFiles.push(file);
                } else {
                    omittedCount++;
                }
            }

            // If there are no stage files and no metadata/config, we can omit the whole folder
            if (stageFiles.length === 0 && !runMetadataFile && !configFile) {
                continue;
            }

            // Parse metadata files if present
            let runMetadata = null;
            let configParsed = null;
            let summaryParsed = null;

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

            // Now validate and parse each stage file
            const parsedStages = [];
            const bundleErrors = [];
            const bundleWarnings = [];
            let isFormatValid = false;
            let hasHardware = false;
            const entries = [];

            for (const stageFile of stageFiles) {
                const content = await stageFile.text();
                const validation = validateBenchmark(content, stageFile.name);
                
                if (validation.format) {
                    isFormatValid = true;
                    if (validation.hasHardware) hasHardware = true;
                    
                    entries.push(...validation.entries);
                    bundleWarnings.push(...validation.warnings.map(w => `[${stageFile.name}] ${w}`));
                    
                    if (validation.errors.length > 0) {
                        bundleErrors.push(...validation.errors.map(e => `[${stageFile.name}] ${e}`));
                    }
                    
                    parsedStages.push({
                        file: stageFile,
                        content,
                        validation
                    });
                } else {
                    bundleErrors.push(`[${stageFile.name}] ${validation.errors[0] || 'Invalid report format.'}`);
                }
            }

            // If no stage files found in the directory but we have config/metadata
            if (stageFiles.length === 0) {
                bundleErrors.push("No benchmark_report_v0.2 yaml files found in directory.");
            }

            // 1. Resolve root model, hardware, and run identifiers using the first valid stage file
            let firstParsedStage = null;
            for (const sf of parsedStages) {
                if (sf.validation && sf.validation.format) {
                    const parsed = parseReportV02(sf.content, sf.file.name);
                    if (parsed) {
                        parsed.run_metadata = runMetadata;
                        parsed.config = configParsed;
                        firstParsedStage = parsed;
                        break;
                    }
                }
            }

            let resolvedModel = 'Unknown';
            let resolvedHw = 'Unknown';
            let runCid = null;
            let runEid = null;
            let runPid = null;

            if (firstParsedStage) {
                const normalized = stageToEntry(firstParsedStage);
                resolvedModel = normalized.model_name;
                resolvedHw = normalized.hardware;
                runCid = firstParsedStage.runCid || null;
                runEid = firstParsedStage.runEid || null;
                runPid = firstParsedStage.runPid || null;
            }

            // 2. Build the entries list for the upload payload (omitting pre-calculated metrics, keeping run_uid and content)
            const payloadEntries = [];
            for (const sf of parsedStages) {
                const stageParsed = parseReportV02(sf.content, sf.file.name);
                const runUid = stageParsed ? stageParsed.runUid : 'unknown-uid';
                
                let rawReportObj = null;
                try {
                    rawReportObj = sf.file.name.endsWith('.json') ? JSON.parse(sf.content) : yaml.load(sf.content);
                } catch (e) {
                    console.error("Failed to parse raw report content into JSON object:", e);
                }

                payloadEntries.push({
                    run_uid: runUid,
                    filename: sf.file.name,
                    raw_report: rawReportObj,
                    prism_cloud: {
                        run: {
                            uid: `${group.dirKey}/${sf.file.name}`
                        }
                    }
                });
            }

            // Determine initial inference tool name and version, and parse other tools
            let initialInferenceTool = "";
            let initialInferenceToolVersion = "";
            const initialOtherTools = {};
            if (firstParsedStage) {
                const rawReport = parsedStages.find(sf => sf.validation && sf.validation.format)?.validation?.parsedData || parsedStages[0]?.validation?.parsedData || {};
                const stack = rawReport?.scenario?.stack || [];
                const inferenceEngine = stack.find(c => 
                    c.standardized?.kind === 'inference_engine' || 
                    c.standardized?.role === 'decode' || 
                    c.standardized?.role === 'prefill' ||
                    c.standardized?.role === 'aggregate'
                ) || stack.find(c => 
                    ['vllm', 'tgi', 'tensorrt', 'tensorrt_llm', 'sglang', 'ollama'].includes(String(c.standardized?.tool || '').toLowerCase())
                );
                if (inferenceEngine) {
                    initialInferenceTool = inferenceEngine.standardized?.tool || "";
                    initialInferenceToolVersion = inferenceEngine.standardized?.tool_version || "";
                } else if (rawReport?.scenario?.load?.standardized?.tool) {
                    initialInferenceTool = rawReport.scenario.load.standardized.tool || "";
                    initialInferenceToolVersion = rawReport.scenario.load.standardized.tool_version || "";
                }

                const loadTool = rawReport?.scenario?.load?.standardized?.tool;
                const loadVer = rawReport?.scenario?.load?.standardized?.tool_version || "unknown";
                if (loadTool && loadTool !== 'unknown' && loadTool.toLowerCase() !== initialInferenceTool.toLowerCase()) {
                    initialOtherTools[loadTool] = loadVer;
                }

                stack.forEach(c => {
                    if (c === inferenceEngine) return;
                    const tool = c.standardized?.tool;
                    const version = c.standardized?.tool_version || "unknown";
                    if (tool && tool !== 'unknown' && tool !== 'service' && tool.toLowerCase() !== initialInferenceTool.toLowerCase()) {
                        initialOtherTools[tool] = version;
                    }
                });
            }

            // 3. Construct the comprehensive Prism Run Upload Structure
            const payload = {
                runId: group.dirKey,
                runLabel: group.name,
                model_name: resolvedModel,
                hardware: {
                    hardware_name: resolvedHw
                },
                attribution: null,
                manifests: {},
                evidence: {},
                format: "brv02",
                run_metadata: runMetadata || {},
                entries: payloadEntries,
                well_lit_path: null,
                metadata: {},
                inference_tool: initialInferenceTool,
                inference_tool_version: initialInferenceToolVersion,
                other_tools: initialOtherTools
            };

            // If model name is unknown, fail validation
            if (!resolvedModel || resolvedModel === 'Unknown' || resolvedModel === 'Unknown Model') {
                bundleErrors.push("Unknown model name.");
            }
            if (!resolvedHw || resolvedHw === 'Unknown' || resolvedHw === 'Unknown Hardware') {
                bundleWarnings.push("Unknown hardware specification.");
            }

            // 4. Run the shared validator!
            const uploadValidation = validatePrismUploadStructure(payload, { isUpload: false });
            if (!uploadValidation.isValid) {
                bundleErrors.push(...uploadValidation.errors);
            }
            if (uploadValidation.warnings && uploadValidation.warnings.length > 0) {
                bundleWarnings.push(...uploadValidation.warnings);
            }

            // If we have runMetadata/config, let's check if they can resolve hardware
            if (runMetadata && (runMetadata.accelerator || runMetadata.model)) {
                hasHardware = true;
            }
            if (configParsed && configParsed.kustomize?.acceleratorBackend) {
                hasHardware = true;
            }
            if (!resolvedHw || resolvedHw === 'Unknown' || resolvedHw === 'Unknown Hardware') {
                hasHardware = false;
            }

            const bundleValidation = {
                format: isFormatValid ? 'brv02' : false,
                hasHardware,
                errors: bundleErrors,
                warnings: bundleWarnings,
                entries
            };

            newStagedBundles.push({
                id: group.id,
                dirKey: group.dirKey,
                name: group.name,
                stageFiles: parsedStages,
                metadataFiles: {
                    run_metadata: runMetadataFile ? { file: runMetadataFile, content: await runMetadataFile.text(), parsed: runMetadata } : null,
                    config: configFile ? { file: configFile, content: await configFile.text(), parsed: configParsed } : null,
                    summary: summaryFile ? { file: summaryFile, content: await summaryFile.text(), parsed: summaryParsed } : null
                },
                payload, // Store the complete upload structure payload
                validation: bundleValidation,
                isExpanded: false,
                isSkipped: false
            });

            uploadedCount += stageFiles.length;
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
        if (isOpen) {
            setStagedFiles([]);
            if (initialFiles && initialFiles.length > 0) {
                processFiles(initialFiles);
            }
        }
    }, [isOpen, initialFiles]);

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

        const traverseEntry = async (entry) => {
            if (entry.isFile) {
                const file = await new Promise((resolve) => entry.file(resolve));
                files.push(file);
            } else if (entry.isDirectory) {
                const directoryReader = entry.createReader();
                const entries = await readAllEntries(directoryReader);
                for (const subEntry of entries) {
                    await traverseEntry(subEntry);
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
        setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, isSkipped: true } : f));
    };

    const handleCommit = async () => {
        const validBundles = stagedFiles.filter(b => !b.isSkipped && b.validation.format && b.validation.errors.length === 0);
        
        // Stage files locally for browser session viewing (no Prism cloud upload)
        onCommit(validBundles);
        onClose();
        setStagedFiles([]);
    };

    if (!isOpen) return null;

    const validCount = stagedFiles.filter(f => !f.isSkipped && f.validation.format && f.validation.errors.length === 0).length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-6xl h-[80vh] flex flex-col border border-slate-200 dark:border-slate-700 overflow-hidden">
                
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <Upload size={20} className="text-cyan-500" />
                            Upload and Stage Benchmarks
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">Validate and stage benchmarks before pushing to local storage or cloud.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    
                    {/* Left Pane: Ingestion Source Toggle & Input */}
                    <div className="w-1/3 border-r border-slate-200 dark:border-slate-800 p-6 flex flex-col bg-slate-50/50 dark:bg-slate-900/50">
                        {/* Segmented Source Switch */}
                        <div className="mb-4 flex bg-slate-200 dark:bg-slate-800/80 p-1 rounded-lg">
                            <button 
                                onClick={() => setIngestionSource('local')}
                                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                                    ingestionSource === 'local' 
                                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                            >
                                Local Ingestion
                            </button>
                            <button 
                                onClick={() => setIngestionSource('cloud')}
                                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                                    ingestionSource === 'cloud' 
                                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                            >
                                Cloud Ingestion
                            </button>
                        </div>

                        {ingestionSource === 'local' ? (
                            <div 
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-6 text-center transition-all ${
                                    isDragging 
                                    ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/10' 
                                    : 'border-slate-300 dark:border-slate-700 hover:border-cyan-400 dark:hover:border-cyan-600'
                                }`}
                            >
                                <UploadCloud size={48} className={`mb-4 ${isDragging ? 'text-cyan-500' : 'text-slate-400'}`} />
                                <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Drag & Drop files here</h3>
                                <p className="text-xs text-slate-500 mb-6">Supports .yaml and .json benchmark reports.</p>
                                
                                <div className="flex flex-col gap-2 w-full max-w-xs">
                                    <label className="relative flex items-center justify-center px-4 py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white text-sm font-medium rounded-lg cursor-pointer transition-colors">
                                        Browse Files
                                        <input type="file" multiple accept=".yaml,.yml,.json" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileInput} />
                                    </label>
                                    <label className="relative flex items-center justify-center px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg cursor-pointer transition-colors">
                                        Select Directory
                                        <input type="file" webkitdirectory="true" directory="true" multiple className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileInput} />
                                    </label>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col justify-between bg-white dark:bg-slate-800/30 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-cyan-500 font-semibold text-sm">
                                        <UploadCloud size={18} />
                                        <span>Cloud Bucket Import</span>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Ingest verified benchmark runs directly from object storage (Google Cloud Storage or AWS S3).
                                    </p>
                                    
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">PROVIDER</label>
                                        <select 
                                            value={cloudProvider}
                                            onChange={(e) => setCloudProvider(e.target.value)}
                                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 font-medium"
                                        >
                                            <option value="gcs">Google Cloud Storage (GCS)</option>
                                            <option value="s3">Amazon Simple Storage Service (S3)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">BUCKET OR FOLDER PATH</label>
                                        <input 
                                            type="text"
                                            value={cloudPath}
                                            onChange={(e) => setCloudPath(e.target.value)}
                                            placeholder={cloudProvider === 'gcs' ? "gs://bucket-name/folder/path" : "s3://bucket-name/folder/path"}
                                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 font-mono"
                                        />
                                    </div>
                                    
                                    <div className="bg-cyan-500/5 border border-cyan-500/10 rounded p-2.5 text-[11px] text-slate-500 dark:text-slate-400">
                                        Note: Requires matching bucket permissions or configured service account roles. Click scan to ingest.
                                    </div>
                                </div>

                                <button 
                                    onClick={handleCloudScan}
                                    className="w-full py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 mt-4"
                                >
                                    <UploadCloud size={14} /> Scan & Stage Cloud Run
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Right Pane: Staging List */}
                    <div className="flex-1 bg-white dark:bg-slate-900 overflow-y-auto p-6 relative">
                        {stagedFiles.length === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                                <FileText size={48} className="opacity-20 mb-4" />
                                <p>No files staged yet.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Batch Edit Control Bar */}
                                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/30 p-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                                    <div className="flex items-center gap-3">
                                        <input 
                                            type="checkbox"
                                            checked={stagedFiles.filter(f => !f.isSkipped).length > 0 && selectedBundleIds.length === stagedFiles.filter(f => !f.isSkipped).length}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedBundleIds(stagedFiles.filter(f => !f.isSkipped).map(f => f.id));
                                                } else {
                                                    setSelectedBundleIds([]);
                                                }
                                            }}
                                            className="rounded border-slate-300 dark:border-slate-700 text-cyan-500 focus:ring-cyan-500 h-4 w-4"
                                        />
                                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                                            {selectedBundleIds.length} of {stagedFiles.filter(f => !f.isSkipped).length} run(s) selected
                                        </span>
                                    </div>
                                    
                                    <button 
                                        onClick={() => setShowBatchEdit(!showBatchEdit)}
                                        disabled={selectedBundleIds.length === 0}
                                        className={`px-3 py-1.5 rounded font-semibold transition-all flex items-center gap-1.5 ${
                                            selectedBundleIds.length > 0 
                                            ? 'bg-cyan-500 text-white hover:bg-cyan-600 shadow-sm border border-cyan-500/20' 
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-transparent cursor-not-allowed'
                                        }`}
                                    >
                                        Batch Edit Selected
                                    </button>
                                </div>

                                {/* Batch Edit Panel */}
                                {showBatchEdit && (
                                    <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs animate-in slide-in-from-top duration-200 shadow-inner">
                                        <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-1 text-sm">
                                            Batch Edit Metadata ({selectedBundleIds.length} runs selected)
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <label className="block text-slate-500 dark:text-slate-400 mb-1 font-bold">WELL-LIT PATH</label>
                                                <select 
                                                    value={batchWellLitPath}
                                                    onChange={(e) => setBatchWellLitPath(e.target.value)}
                                                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-medium font-semibold"
                                                >
                                                    <option value="">-- No Change --</option>
                                                    <option value="none">None</option>
                                                    <option value="optimized-baseline">optimized-baseline</option>
                                                    <option value="tiered-prefix-cache">tiered-prefix-cache</option>
                                                    <option value="intelligent-routing">intelligent-routing</option>
                                                    <option value="pd-disaggregation">pd-disaggregation</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-slate-500 dark:text-slate-400 mb-1 font-bold">HARDWARE</label>
                                                <input 
                                                    type="text"
                                                    value={batchHardware}
                                                    onChange={(e) => setBatchHardware(e.target.value)}
                                                    placeholder="Accelerator e.g. H100, TPU v6e (or empty to keep)"
                                                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-medium"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <label className="block text-slate-500 dark:text-slate-400 mb-1 font-bold">BATCH ADD MANIFEST / DEPLOYMENT</label>
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text"
                                                        value={batchManifestName}
                                                        onChange={(e) => setBatchManifestName(e.target.value)}
                                                        placeholder="Name (e.g. vllm_deployment)"
                                                        className="w-1/3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-medium"
                                                    />
                                                    <input 
                                                        type="text"
                                                        value={batchManifestUrl}
                                                        onChange={(e) => setBatchManifestUrl(e.target.value)}
                                                        placeholder="URL (e.g. https://github.com...)"
                                                        className="w-2/3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-mono"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-slate-500 dark:text-slate-400 mb-1 font-bold">BATCH ADD EVIDENCE LOG</label>
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text"
                                                        value={batchEvidenceName}
                                                        onChange={(e) => setBatchEvidenceName(e.target.value)}
                                                        placeholder="Name (e.g. run_log)"
                                                        className="w-1/3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-medium"
                                                    />
                                                    <input 
                                                        type="text"
                                                        value={batchEvidenceUrl}
                                                        onChange={(e) => setBatchEvidenceUrl(e.target.value)}
                                                        placeholder="Logs URL (e.g. gs://...)"
                                                        className="w-2/3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-mono"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mb-4">
                                            <label className="block text-slate-500 dark:text-slate-400 mb-1 font-bold">CUSTOM METADATA (JSON)</label>
                                            <textarea 
                                                value={batchMetadata}
                                                onChange={(e) => handleBatchMetadataChange(e.target.value)}
                                                placeholder='e.g. { "machine_type": "a3-highgpu-8g", "workload": "Inference Deployment" }'
                                                rows={3}
                                                className={`w-full bg-white dark:bg-slate-800 border ${batchMetadataError ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-slate-300 dark:border-slate-700 focus:ring-cyan-500 focus:border-cyan-500'} rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-mono text-xs`}
                                            />
                                            {batchMetadataError && (
                                                <p className="text-red-500 text-[10px] mt-1 font-semibold">{batchMetadataError}</p>
                                            )}
                                        </div>

                                        <div className="flex justify-end gap-2">
                                            <button 
                                                onClick={() => setShowBatchEdit(false)}
                                                className="px-3 py-1.5 rounded font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button 
                                                onClick={applyBatchEdit}
                                                className="px-4 py-1.5 rounded font-semibold bg-cyan-500 text-white hover:bg-cyan-600 transition-colors shadow-sm"
                                            >
                                                Apply to Selected
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {stagedFiles.filter(b => !b.isSkipped).map(bundle => {
                                    const rawReport = bundle.payload?.entries?.[0]?.raw_report;
                                    const stack = rawReport?.scenario?.stack || [];
                                    
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

                                    const otherToolsStr = otherTools.length > 0 ? otherTools.join(', ') : 'generic/unknown';

                                    return (
                                        <div key={bundle.id} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
                                            <div 
                                                className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                                                onClick={() => toggleExpand(bundle.id)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <input 
                                                        type="checkbox"
                                                        checked={selectedBundleIds.includes(bundle.id)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        onChange={() => {
                                                            setSelectedBundleIds(prev => 
                                                                prev.includes(bundle.id) 
                                                                ? prev.filter(id => id !== bundle.id) 
                                                                : [...prev, bundle.id]
                                                            );
                                                        }}
                                                        className="rounded border-slate-300 dark:border-slate-700 text-cyan-500 focus:ring-cyan-500 h-4 w-4"
                                                    />
                                                    {(!bundle.validation.format || bundle.validation.errors.length > 0) && (
                                                        <AlertCircle size={18} className="text-red-500 shrink-0" />
                                                    )}
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200 select-all">{bundle.payload.model_name || 'Unknown Model'}</span>
                                                        <span className="text-xs text-slate-500 dark:text-slate-400 select-all font-mono opacity-80 mt-0.5">{bundle.dirKey}</span>
                                                        
                                                        <div className="flex flex-wrap items-center gap-2 mt-2">
                                                            {/* Format Check Tag */}
                                                            {bundle.validation.format && bundle.validation.errors.filter(e => !e.toLowerCase().includes('model') && !e.toLowerCase().includes('hardware') && !e.toLowerCase().includes('attribution')).length === 0 ? (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-900/50 animate-in fade-in zoom-in-95 duration-150">
                                                                    <Check size={10} className="shrink-0 text-emerald-500" /> Format: {bundle.validation.format || 'brv02'}
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded border border-red-200 dark:border-red-900/50 animate-in fade-in zoom-in-95 duration-150">
                                                                    <X size={10} className="shrink-0 text-red-500" /> Format: Invalid
                                                                </span>
                                                            )}

                                                            {/* Hardware Check Tag */}
                                                            {bundle.validation.hasHardware && bundle.payload.hardware?.hardware_name && bundle.payload.hardware.hardware_name !== 'Unknown' && bundle.payload.hardware.hardware_name !== 'Unknown Hardware' ? (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-900/50 animate-in fade-in zoom-in-95 duration-150">
                                                                    <Check size={10} className="shrink-0 text-emerald-500" /> Hardware: {bundle.payload.hardware?.hardware_name}
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-900/50 animate-in fade-in zoom-in-95 duration-150">
                                                                    <X size={10} className="shrink-0 text-amber-500" /> Hardware: {bundle.payload.hardware?.hardware_name || 'Unknown'} (Optional)
                                                                </span>
                                                            )}

                                                            {/* Attribution Check Tag */}
                                                            {bundle.payload.attribution ? (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-900/50 animate-in fade-in zoom-in-95 duration-150">
                                                                    <Check size={10} className="shrink-0 text-emerald-500" /> Attribution: {bundle.payload.attribution.author || 'Author'} ({bundle.payload.attribution.organization || 'Org'})
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-900/50 animate-in fade-in zoom-in-95 duration-150">
                                                                    <X size={10} className="shrink-0 text-amber-500" /> Attribution: Missing (Optional)
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
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
                                                    
                                                    {bundle.validation.errors.length > 0 && (
                                                        <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-xs">
                                                            <h4 className="font-semibold mb-1 flex items-center gap-1"><ShieldAlert size={14}/> Errors:</h4>
                                                            <ul className="list-disc pl-5 space-y-1">
                                                                {bundle.validation.errors.map((e, i) => <li key={i}>{e}</li>)}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    {bundle.validation.warnings.filter(w => 
                                                        !w.toLowerCase().includes("hardware metadata is missing") && 
                                                        !w.toLowerCase().includes("missing attribution fields")
                                                    ).length > 0 && (
                                                        <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-300 text-xs">
                                                            <h4 className="font-semibold mb-1 flex items-center gap-1"><AlertCircle size={14}/> Warnings:</h4>
                                                            <ul className="list-disc pl-5 space-y-1">
                                                                {bundle.validation.warnings.filter(w => 
                                                                    !w.toLowerCase().includes("hardware metadata is missing") && 
                                                                    !w.toLowerCase().includes("missing attribution fields")
                                                                ).map((e, i) => <li key={i}>{e}</li>)}
                                                            </ul>
                                                        </div>
                                                    )}

                                                    {/* Run details section: key-value details table */}
                                                    <div className="mb-4 overflow-hidden border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                                                        <table className="w-full text-left text-xs border-collapse">
                                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Run Directory</td>
                                                                    <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300 select-all">{bundle.dirKey}</td>
                                                                </tr>
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Detailed Hardware</td>
                                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                                                        <div className="flex items-center gap-2">
                                                                            <input 
                                                                                type="text"
                                                                                value={bundle.payload.hardware?.hardware_name || ''}
                                                                                onChange={(e) => updateSingleField(bundle.id, 'hardware_name', e.target.value)}
                                                                                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs w-48 text-slate-800 dark:text-slate-100 font-medium"
                                                                                placeholder="Accelerator Model"
                                                                            />
                                                                            <span className="text-slate-400 dark:text-slate-500 font-medium">Chip Count:</span>
                                                                            <input 
                                                                                type="number"
                                                                                value={bundle.payload.run_metadata?.accelerator_count || ''}
                                                                                onChange={(e) => {
                                                                                    const count = parseInt(e.target.value) || 0;
                                                                                    setStagedFiles(prev => prev.map(b => {
                                                                                        if (b.id === bundle.id) {
                                                                                            const run_metadata = { ...(b.payload.run_metadata || {}), accelerator_count: count };
                                                                                            return { ...b, payload: { ...b.payload, run_metadata } };
                                                                                        }
                                                                                        return b;
                                                                                    }));
                                                                                }}
                                                                                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs w-16 text-slate-800 dark:text-slate-100 font-mono"
                                                                                placeholder="Count"
                                                                            />
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Inference Tool</td>
                                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                                                        <div className="flex items-center gap-2">
                                                                            <input 
                                                                                type="text"
                                                                                value={bundle.payload.inference_tool || ''}
                                                                                onChange={(e) => updateSingleField(bundle.id, 'inference_tool', e.target.value)}
                                                                                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs w-40 text-slate-800 dark:text-slate-100 font-medium"
                                                                                placeholder="Tool e.g. vllm"
                                                                            />
                                                                            <span className="text-slate-400 dark:text-slate-500 font-medium">Version:</span>
                                                                            <input 
                                                                                type="text"
                                                                                value={bundle.payload.inference_tool_version || ''}
                                                                                onChange={(e) => updateSingleField(bundle.id, 'inference_tool_version', e.target.value)}
                                                                                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs w-32 text-slate-800 dark:text-slate-100 font-mono"
                                                                                placeholder="Version e.g. v0.4.2"
                                                                            />
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Other Tools</td>
                                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                                                        <div className="space-y-1.5">
                                                                            {Object.entries(bundle.payload.other_tools || {}).map(([name, version]) => (
                                                                                <div key={name} className="flex items-center gap-2">
                                                                                    <input 
                                                                                        type="text" 
                                                                                        defaultValue={name}
                                                                                        onBlur={(e) => {
                                                                                            const newName = e.target.value;
                                                                                            if (!newName || newName === name) return;
                                                                                            setStagedFiles(prev => prev.map(b => {
                                                                                                if (b.id === bundle.id) {
                                                                                                    const other_tools = { ...b.payload.other_tools };
                                                                                                    const val = other_tools[name];
                                                                                                    delete other_tools[name];
                                                                                                    other_tools[newName] = val;
                                                                                                    return { ...b, payload: { ...b.payload, other_tools } };
                                                                                                }
                                                                                                return b;
                                                                                            }));
                                                                                        }}
                                                                                        placeholder="Name" 
                                                                                        className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-[10px] w-40 text-slate-800 dark:text-slate-100"
                                                                                    />
                                                                                    <input 
                                                                                        type="text" 
                                                                                        defaultValue={version}
                                                                                        onBlur={(e) => {
                                                                                            const newVersion = e.target.value;
                                                                                            if (newVersion === version) return;
                                                                                            setStagedFiles(prev => prev.map(b => {
                                                                                                if (b.id === bundle.id) {
                                                                                                    const other_tools = { ...b.payload.other_tools, [name]: newVersion };
                                                                                                    return { ...b, payload: { ...b.payload, other_tools } };
                                                                                                }
                                                                                                return b;
                                                                                            }));
                                                                                        }}
                                                                                        placeholder="Version" 
                                                                                        className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-[10px] w-60 text-slate-800 dark:text-slate-100 font-mono"
                                                                                    />
                                                                                    <button 
                                                                                        onClick={() => {
                                                                                            setStagedFiles(prev => prev.map(b => {
                                                                                                if (b.id === bundle.id) {
                                                                                                    const other_tools = { ...(b.payload.other_tools || {}) };
                                                                                                    delete other_tools[name];
                                                                                                    return { ...b, payload: { ...b.payload, other_tools } };
                                                                                                }
                                                                                                return b;
                                                                                            }));
                                                                                        }}
                                                                                        className="p-1 hover:text-red-500 rounded transition-colors text-slate-400"
                                                                                    >
                                                                                        <Trash2 size={12} />
                                                                                    </button>
                                                                                </div>
                                                                            ))}
                                                                            <div className="flex items-center gap-2 mt-1">
                                                                                <input 
                                                                                    type="text" 
                                                                                    id={`new-tool-name-${bundle.id}`} 
                                                                                    placeholder="Tool Name (e.g. load_tool)" 
                                                                                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-[10px] w-40 text-slate-800 dark:text-slate-100"
                                                                                />
                                                                                <input 
                                                                                    type="text" 
                                                                                    id={`new-tool-version-${bundle.id}`} 
                                                                                    placeholder="Version (e.g. v0.1)" 
                                                                                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-[10px] w-60 text-slate-800 dark:text-slate-100 font-mono"
                                                                                />
                                                                                <button 
                                                                                    onClick={() => {
                                                                                        const nameEl = document.getElementById(`new-tool-name-${bundle.id}`);
                                                                                        const versionEl = document.getElementById(`new-tool-version-${bundle.id}`);
                                                                                        if (nameEl && versionEl && nameEl.value && versionEl.value) {
                                                                                            const nameVal = nameEl.value;
                                                                                            const versionVal = versionEl.value;
                                                                                            setStagedFiles(prev => prev.map(b => {
                                                                                                if (b.id === bundle.id) {
                                                                                                    const other_tools = { ...(b.payload.other_tools || {}), [nameVal]: versionVal };
                                                                                                    return { ...b, payload: { ...b.payload, other_tools } };
                                                                                                }
                                                                                                return b;
                                                                                            }));
                                                                                            nameEl.value = '';
                                                                                            versionEl.value = '';
                                                                                        }
                                                                                    }}
                                                                                    className="px-2 py-1 bg-cyan-500 text-white rounded text-[10px] font-bold hover:bg-cyan-600 transition-colors shadow-sm"
                                                                                >
                                                                                    Add Tool
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Attribution</td>
                                                                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 italic">
                                                                        N/A (Work-in-progress)
                                                                    </td>
                                                                </tr>
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Manifests / Deployment</td>
                                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                                                        <div className="space-y-1.5">
                                                                            {Object.entries(bundle.payload.manifests || {}).map(([name, url]) => (
                                                                                <div key={name} className="flex items-center gap-2">
                                                                                    <span className="bg-slate-100 dark:bg-slate-850 px-2 py-0.5 rounded font-mono text-[10px] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">{name}</span>
                                                                                    <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px] truncate max-w-xs">{url}</span>
                                                                                    <button 
                                                                                        onClick={() => removeManifestFromBundle(bundle.id, name)}
                                                                                        className="p-1 hover:text-red-500 rounded transition-colors text-slate-400"
                                                                                    >
                                                                                        <Trash2 size={12} />
                                                                                    </button>
                                                                                </div>
                                                                            ))}
                                                                            <div className="flex items-center gap-2 mt-1">
                                                                                <input 
                                                                                    type="text" 
                                                                                    id={`new-manifest-name-${bundle.id}`} 
                                                                                    placeholder="Name (e.g. vllm_deployment)" 
                                                                                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-[10px] w-40 text-slate-800 dark:text-slate-100"
                                                                                />
                                                                                <input 
                                                                                    type="text" 
                                                                                    id={`new-manifest-url-${bundle.id}`} 
                                                                                    placeholder="URL e.g. https://github.com..." 
                                                                                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-[10px] w-60 text-slate-800 dark:text-slate-100 font-mono"
                                                                                />
                                                                                <button 
                                                                                    onClick={() => {
                                                                                        const nameEl = document.getElementById(`new-manifest-name-${bundle.id}`);
                                                                                        const urlEl = document.getElementById(`new-manifest-url-${bundle.id}`);
                                                                                        if (nameEl && urlEl && nameEl.value && urlEl.value) {
                                                                                            addManifestToBundle(bundle.id, nameEl.value, urlEl.value);
                                                                                            nameEl.value = '';
                                                                                            urlEl.value = '';
                                                                                        }
                                                                                    }}
                                                                                    className="px-2 py-1 bg-cyan-500 text-white rounded text-[10px] font-bold hover:bg-cyan-600 transition-colors shadow-sm"
                                                                                >
                                                                                    Add Link
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Evidence Logs</td>
                                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                                                        <div className="space-y-1.5">
                                                                            {Object.entries(bundle.payload.evidence || {}).map(([name, url]) => (
                                                                                <div key={name} className="flex items-center gap-2">
                                                                                    <span className="bg-slate-100 dark:bg-slate-850 px-2 py-0.5 rounded font-mono text-[10px] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">{name}</span>
                                                                                    <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px] truncate max-w-xs">{url}</span>
                                                                                    <button 
                                                                                        onClick={() => removeEvidenceFromBundle(bundle.id, name)}
                                                                                        className="p-1 hover:text-red-500 rounded transition-colors text-slate-400"
                                                                                    >
                                                                                        <Trash2 size={12} />
                                                                                    </button>
                                                                                </div>
                                                                            ))}
                                                                            <div className="flex items-center gap-2 mt-1">
                                                                                <input 
                                                                                    type="text" 
                                                                                    id={`new-evidence-name-${bundle.id}`} 
                                                                                    placeholder="Name (e.g. run_log)" 
                                                                                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-[10px] w-40 text-slate-800 dark:text-slate-100"
                                                                                />
                                                                                <input 
                                                                                    type="text" 
                                                                                    id={`new-evidence-url-${bundle.id}`} 
                                                                                    placeholder="Logs URL e.g. gs://..." 
                                                                                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-[10px] w-60 text-slate-800 dark:text-slate-100 font-mono"
                                                                                />
                                                                                <button 
                                                                                    onClick={() => {
                                                                                        const nameEl = document.getElementById(`new-evidence-name-${bundle.id}`);
                                                                                        const urlEl = document.getElementById(`new-evidence-url-${bundle.id}`);
                                                                                        if (nameEl && urlEl && nameEl.value && urlEl.value) {
                                                                                            addEvidenceToBundle(bundle.id, nameEl.value, urlEl.value);
                                                                                            nameEl.value = '';
                                                                                            urlEl.value = '';
                                                                                        }
                                                                                    }}
                                                                                    className="px-2 py-1 bg-cyan-500 text-white rounded text-[10px] font-bold hover:bg-cyan-600 transition-colors shadow-sm"
                                                                                >
                                                                                    Add Link
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Well-Lit Path</td>
                                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                                                        <select 
                                                                            value={bundle.payload.well_lit_path || ''}
                                                                            onChange={(e) => updateSingleField(bundle.id, 'well_lit_path', e.target.value || null)}
                                                                            className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs w-60 text-slate-800 dark:text-slate-100 font-semibold"
                                                                        >
                                                                            <option value="">None</option>
                                                                            <option value="optimized-baseline">optimized-baseline</option>
                                                                            <option value="tiered-prefix-cache">tiered-prefix-cache</option>
                                                                            <option value="intelligent-routing">intelligent-routing</option>
                                                                            <option value="pd-disaggregation">pd-disaggregation</option>
                                                                        </select>
                                                                    </td>
                                                                </tr>
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Custom Metadata (JSON)</td>
                                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                                                        <textarea 
                                                                            value={singleMetadataTexts[bundle.id] !== undefined ? singleMetadataTexts[bundle.id] : JSON.stringify(bundle.payload.metadata || {}, null, 2)}
                                                                            onChange={(e) => handleSingleMetadataChange(bundle.id, e.target.value)}
                                                                            rows={4}
                                                                            className={`w-full max-w-xl bg-white dark:bg-slate-800 border ${singleMetadataErrors[bundle.id] ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-slate-300 dark:border-slate-700 focus:ring-cyan-500 focus:border-cyan-500'} rounded px-2.5 py-1.5 text-xs font-mono`}
                                                                            placeholder='{ "key": "value" }'
                                                                        />
                                                                        {singleMetadataErrors[bundle.id] && (
                                                                            <p className="text-red-500 text-[10px] mt-1 font-semibold">{singleMetadataErrors[bundle.id]}</p>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                    
                                                    {bundle.payload.entries && bundle.payload.entries.length > 0 && (
                                                        <div>
                                                            <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-2">Parsed Sub-runs / Stages ({bundle.payload.entries.length})</h4>
                                                            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                                                                <table className="w-full text-left text-xs border-collapse">
                                                                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                                                        <tr>
                                                                            <th className="px-3 py-2 w-16 text-center">Stage</th>
                                                                            <th className="px-3 py-2">Model</th>
                                                                            <th className="px-3 py-2 text-right">Throughput</th>
                                                                            <th className="px-3 py-2 text-right">Latency</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-slate-150 dark:divide-slate-700/50">
                                                                        {bundle.payload.entries
                                                                            .map((entry) => {
                                                                                const parsedStage = parseReportV02(entry.raw_report, entry.filename);
                                                                                const normalized = parsedStage ? stageToEntry(parsedStage) : null;
                                                                                const latencyVal = normalized?.latency && typeof normalized.latency === 'object' ? normalized.latency.mean : normalized?.latency;
                                                                                return {
                                                                                    stage: parsedStage?.stageIndex,
                                                                                    model_name: normalized?.model_name || 'Unknown',
                                                                                    throughput: normalized?.throughput,
                                                                                    latency: latencyVal,
                                                                                    uid: entry.prism_cloud?.run?.uid || ''
                                                                                };
                                                                            })
                                                                            .sort((a, b) => (a.stage ?? 0) - (b.stage ?? 0))
                                                                            .map((entry, idx) => {
                                                                                return (
                                                                                    <tr key={idx} className="hover:bg-slate-100 dark:hover:bg-slate-800/50">
                                                                                        <td className="px-3 py-2 text-center font-bold font-mono w-16 text-slate-500">Stage {entry.stage ?? '-'}</td>
                                                                                        <td className="px-3 py-2 font-medium">{entry.model_name}</td>
                                                                                        <td className="px-3 py-2 text-right font-mono">
                                                                                            {typeof entry.throughput === 'number' ? `${entry.throughput.toFixed(2)} tok/s` : '-'}
                                                                                        </td>
                                                                                        <td className="px-3 py-2 text-right font-mono">
                                                                                            {typeof entry.latency === 'number' ? `${entry.latency.toFixed(2)}ms` : '-'}
                                                                                        </td>
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
                    <div className="text-sm text-slate-500">
                        {validCount} valid {validCount === 1 ? 'file' : 'files'} ready to stage
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
                            Cancel
                        </button>
                        <button 
                            onClick={handleCommit}
                            disabled={validCount === 0}
                            className={`px-5 py-2 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors ${
                                validCount > 0 
                                ? 'bg-cyan-500 hover:bg-cyan-600 text-white shadow-sm' 
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                            }`}
                        >
                            <Check size={16} />
                            Stage Valid Files (Local Only)
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};
