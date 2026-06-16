import yaml from 'js-yaml';
import { parseReportV02, stageToEntry } from './benchmarkReportV02Parser.js';

export function validateFormat(fileContent, filename) {
    let parsedDoc;
    try {
        if (filename.endsWith('.json')) {
            parsedDoc = JSON.parse(fileContent);
        } else {
            parsedDoc = yaml.load(fileContent);
        }
    } catch {
        return { format: false, error: "Invalid YAML/JSON format" };
    }

    if (!parsedDoc) {
        return { format: false, error: "Empty document" };
    }

    if (parsedDoc.version === "0.2" || parsedDoc.schema === "v0.2" || (parsedDoc.run && parsedDoc.scenario && (parsedDoc.metrics || parsedDoc.results))) {
        return { format: "brv02", parsedData: parsedDoc };
    }

    if (parsedDoc.model && (parsedDoc.throughput || parsedDoc.latency || parsedDoc.metrics)) {
        return { format: "inference-perf", parsedData: parsedDoc };
    }
    
    return { format: false, error: "Unrecognized benchmark format" };
}

export function validateHardware(parsedData) {
    let hasHardware = false;
    
    if (parsedData.scenario && parsedData.scenario.stack) {
        hasHardware = parsedData.scenario.stack.some(component => 
            component.config?.accelerator?.model || component.config?.machine?.type
        );
    }
    
    return hasHardware;
}

export function validateBenchmark(fileContent, filename) {
    const result = {
        format: false,
        hasHardware: false,
        errors: [],
        warnings: [],
        prism_cloud: null,
        entries: []
    };

    const formatCheck = validateFormat(fileContent, filename);
    
    if (!formatCheck.format) {
        result.errors.push(formatCheck.error || "File does not match supported formats.");
        return result;
    }
    
    result.format = formatCheck.format;
    const parsedData = formatCheck.parsedData;
    result.parsedData = parsedData;
    
    if (result.format === "brv02") {
        try {
            const stage = parseReportV02(fileContent, filename);
            if (stage) {
                const entries = [];
                
                const entry = stageToEntry(stage);
                const latencyVal = entry.latency && typeof entry.latency === 'object' ? entry.latency.mean : entry.latency;
                if (entry.throughput === null || entry.throughput <= 0 || latencyVal === null || latencyVal <= 0) {
                    result.errors.push(`Stage ${stage.stageIndex} has zero or negative metrics.`);
                }
                entries.push({
                    model_name: entry.model_name,
                    stage: stage.stageIndex
                });
                
                result.entries = entries;
                
                result.hasHardware = validateHardware(parsedData);
                if (!result.hasHardware) {
                    result.warnings.push("Hardware metadata is missing or incomplete.");
                }
                
                const runUid = parsedData.run?.uid || "unknown-uid";
                result.prism_cloud = {
                    run_id: stage.runId,
                    original_uid: runUid,
                    filepath: filename,
                    label: stage.runLabel
                };
            } else {
                result.errors.push("No valid stages parsed from BRV02 file.");
            }
        } catch (e) {
            result.errors.push(`Error parsing BRV02: ${e.message}`);
        }
    } else if (result.format === "inference-perf") {
        result.errors.push("inference-perf support is pending implementation.");
    }

    return result;
}

/**
 * Validate the complete Prism Run Upload Structure.
 * Rejects runs if any of its stages contain mismatching info (model, hardware).
 * Isomorphic/shared function called by both frontend and backend.
 */
export function validatePrismUploadStructure(uploadData, options = {}) {
    const { isUpload = false } = options;
    const errors = [];
    const warnings = [];

    if (!uploadData) {
        return { isValid: false, errors: ["Missing upload data"], warnings };
    }

    const { model_name, hardware, entries, format } = uploadData;

    if (!format || format !== 'brv02') {
        errors.push(`Format must be 'brv02' in upload structure, found '${format || 'unknown'}'`);
    }

    if (!model_name) {
        errors.push("Missing root model_name in upload structure");
    }
    if (!hardware || !hardware.hardware_name || hardware.hardware_name === 'Unknown' || hardware.hardware_name === 'Unknown Hardware') {
        if (isUpload) {
            errors.push("Missing or unknown root hardware.hardware_name in upload structure");
        } else {
            warnings.push("Missing or unknown root hardware.hardware_name in upload structure");
        }
    }

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
        errors.push("Missing or empty entries array in upload structure");
        return { isValid: false, errors, warnings };
    }

    // Check each entry (stage)
    for (const entry of entries) {
        const stageContent = entry.raw_report || entry.content;
        if (!stageContent) {
            errors.push(`Entry for file ${entry.filename || 'unknown'} is missing raw_report or content`);
            continue;
        }

        try {
            const parsedStage = parseReportV02(stageContent, entry.filename);
            if (!parsedStage) {
                errors.push(`File ${entry.filename || 'unknown'} could not be parsed as a valid BRV02 stage`);
                continue;
            }

            // Propagate metadata for normalization
            parsedStage.run_metadata = uploadData.run_metadata || null;
            parsedStage.config = uploadData.config || null;

            const normalizedEntry = stageToEntry(parsedStage);

            // 1. Verify model name matches root $.model_name
            if (normalizedEntry.model_name !== model_name) {
                errors.push(`Stage ${parsedStage.stageIndex ?? 'unknown'} (${entry.filename}) has mismatching model name: expected '${model_name}', but found '${normalizedEntry.model_name}'`);
            }

            // 2. Verify hardware matches root $.hardware.hardware_name
            const rootHw = hardware ? hardware.hardware_name : '';
            if (normalizedEntry.hardware !== rootHw) {
                const msg = `Stage ${parsedStage.stageIndex ?? 'unknown'} (${entry.filename}) has mismatching hardware: expected '${rootHw}', but found '${normalizedEntry.hardware}'`;
                if (isUpload) {
                    errors.push(msg);
                } else {
                    warnings.push(msg);
                }
            }

            // 3. Verify entry run_uid matches entry.run_uid if present
            if (entry.run_uid && parsedStage.runUid !== entry.run_uid) {
                errors.push(`Stage ${parsedStage.stageIndex ?? 'unknown'} (${entry.filename}) has mismatching run UID: expected '${entry.run_uid}', but found '${parsedStage.runUid}'`);
            }

            // 4. Verify no zero or negative metrics
            const latencyVal = normalizedEntry.latency && typeof normalizedEntry.latency === 'object' ? normalizedEntry.latency.mean : normalizedEntry.latency;
            if (normalizedEntry.throughput === null || normalizedEntry.throughput <= 0 || latencyVal === null || latencyVal <= 0) {
                errors.push(`Stage ${parsedStage.stageIndex ?? 'unknown'} (${entry.filename}) has zero or negative metrics.`);
            }

        } catch (e) {
            errors.push(`Error validating stage file ${entry.filename || 'unknown'}: ${e.message}`);
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}
