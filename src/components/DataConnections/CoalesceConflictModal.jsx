import React, { useState } from 'react';
import { AlertTriangle, Check, Layers } from 'lucide-react';
import { Button, Input, Modal } from '../ui';

/**
 * Interactive Conflict Resolution UI for Coalescing Benchmark Runs.
 * Allows users to review and resolve metadata fields across selected runs with radio choices,
 * auto common prefix selection, and custom value inputs (including paired inputs for stack/harness).
 */
export default function CoalesceConflictModal({
    isOpen,
    onClose,
    selectedBundles = [],
    onConfirm
}) {
    // Field definitions to evaluate across coalesced runs
    const fieldDefs = React.useMemo(() => [
        { 
            key: 'runLabel', 
            label: 'Benchmark Run Name', 
            type: 'single', 
            getValue: b => b.name || b.payload?.runLabel 
        },
        { 
            key: 'model_name', 
            label: 'Model Name', 
            type: 'single', 
            getValue: b => b.payload?.model_name 
        },
        { 
            key: 'hardware_name', 
            label: 'Detailed Hardware', 
            type: 'single', 
            getValue: b => b.payload?.hardware?.hardware_name 
        },
        { 
            key: 'accelerator_count', 
            label: 'Accelerator Chip Count', 
            type: 'single', 
            getValue: b => b.payload?.hardware?.accelerator_count 
        },
        { 
            key: 'serving_stack', 
            label: 'Serving Stack', 
            type: 'composite', 
            toolKey: 'inference_tool',
            versionKey: 'inference_tool_version',
            toolPlaceholder: 'vLLM',
            versionPlaceholder: '0.4.2',
            getCompositeValue: b => ({
                tool: b.payload?.inference_tool || '',
                version: b.payload?.inference_tool_version || ''
            })
        },
        { 
            key: 'benchmark_harness', 
            label: 'Benchmark Harness', 
            type: 'composite', 
            toolKey: 'benchmark_harness',
            versionKey: 'benchmark_harness_version',
            toolPlaceholder: 'inference-perf',
            versionPlaceholder: 'v0.2.0',
            getCompositeValue: b => ({
                tool: b.payload?.benchmark_harness || '',
                version: b.payload?.benchmark_harness_version || ''
            })
        },
    ], []);

    // Compute distinct values and common prefix per field
    const fieldConflicts = React.useMemo(() => {
        const result = {};
        fieldDefs.forEach((def) => {
            const { key, type } = def;
            const map = new Map();

            selectedBundles.forEach((bundle, idx) => {
                const runName = bundle.name || bundle.payload?.runLabel || `Run #${idx + 1}`;
                if (type === 'single') {
                    const val = def.getValue(bundle);
                    if (val !== undefined && val !== null && String(val).trim() !== '') {
                        const strVal = String(val).trim();
                        if (!map.has(strVal)) {
                            map.set(strVal, {
                                value: val,
                                strVal,
                                sourceRuns: [{ index: idx + 1, name: runName }]
                            });
                        } else {
                            map.get(strVal).sourceRuns.push({ index: idx + 1, name: runName });
                        }
                    }
                } else if (type === 'composite') {
                    const { tool, version } = def.getCompositeValue(bundle);
                    if (tool.trim() !== '' || version.trim() !== '') {
                        const strVal = `${tool.trim()}::${version.trim()}`;
                        if (!map.has(strVal)) {
                            map.set(strVal, {
                                tool: tool.trim(),
                                version: version.trim(),
                                strVal,
                                sourceRuns: [{ index: idx + 1, name: runName }]
                            });
                        } else {
                            map.get(strVal).sourceRuns.push({ index: idx + 1, name: runName });
                        }
                    }
                }
            });

            const distinct = Array.from(map.values());

            let commonPrefix = '';
            if (distinct.length > 1 && type === 'single') {
                let prefix = distinct[0].strVal;
                for (let i = 1; i < distinct.length; i++) {
                    while (!distinct[i].strVal.startsWith(prefix)) {
                        prefix = prefix.substring(0, prefix.length - 1);
                        if (prefix === '') break;
                    }
                }
                const cleanPrefix = prefix.replace(/[-_/\s]+$/, '').trim();
                if (cleanPrefix.length > 0) {
                    commonPrefix = cleanPrefix;
                }
            }

            result[key] = {
                distinct,
                hasConflict: distinct.length > 1,
                commonPrefix
            };
        });
        return result;
    }, [selectedBundles, fieldDefs]);

    // Derived default choices
    const defaultChoices = React.useMemo(() => {
        const initialChoices = {};
        fieldDefs.forEach(({ key }) => {
            const conflictInfo = fieldConflicts[key];
            if (conflictInfo && conflictInfo.commonPrefix) {
                initialChoices[key] = '__auto_prefix__';
            } else if (conflictInfo && conflictInfo.distinct.length > 0) {
                initialChoices[key] = conflictInfo.distinct[0].strVal;
            } else {
                initialChoices[key] = '';
            }
        });
        return initialChoices;
    }, [fieldConflicts, fieldDefs]);

    const [selectedChoices, setSelectedChoices] = useState({});
    const [customValues, setCustomValues] = useState({});

    // Reset selection state when modal opens or selected bundles change
    React.useEffect(() => {
        if (!isOpen) return;
        setSelectedChoices(defaultChoices);
        const initialCustom = {};
        fieldDefs.forEach((def) => {
            if (def.type === 'single') {
                initialCustom[def.key] = '';
            } else if (def.type === 'composite') {
                initialCustom[def.toolKey] = '';
                initialCustom[def.versionKey] = '';
            }
        });
        setCustomValues(initialCustom);
    }, [isOpen, selectedBundles, defaultChoices, fieldDefs]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        const resolvedMetadata = {};
        fieldDefs.forEach((def) => {
            const { key, type } = def;
            const conflictInfo = fieldConflicts[key];
            const choice = selectedChoices[key];

            if (type === 'single') {
                if (choice === '__auto_prefix__') {
                    const rawVal = conflictInfo.commonPrefix || '';
                    resolvedMetadata[key] = key === 'accelerator_count'
                        ? (parseInt(rawVal, 10) || null)
                        : rawVal;
                } else if (choice === '__custom__') {
                    const rawCustom = customValues[key] || '';
                    resolvedMetadata[key] = key === 'accelerator_count'
                        ? (parseInt(rawCustom, 10) || null)
                        : rawCustom.trim();
                } else if (choice !== undefined && choice !== null) {
                    const matched = conflictInfo?.distinct.find(d => d.strVal === choice);
                    resolvedMetadata[key] = matched ? matched.value : choice;
                    if (key === 'accelerator_count' && typeof resolvedMetadata[key] === 'string') {
                        resolvedMetadata[key] = parseInt(resolvedMetadata[key], 10) || null;
                    }
                } else {
                    const fallbackVal = def.getValue(selectedBundles[0]);
                    resolvedMetadata[key] = fallbackVal ?? (key === 'accelerator_count' ? null : '');
                }
            } else if (type === 'composite') {
                const { toolKey, versionKey } = def;
                if (choice === '__custom__') {
                    resolvedMetadata[toolKey] = (customValues[toolKey] || '').trim();
                    resolvedMetadata[versionKey] = (customValues[versionKey] || '').trim();
                } else if (choice) {
                    const matched = conflictInfo?.distinct.find(d => d.strVal === choice);
                    if (matched) {
                        resolvedMetadata[toolKey] = matched.tool;
                        resolvedMetadata[versionKey] = matched.version;
                    } else {
                        const parts = choice.split('::');
                        resolvedMetadata[toolKey] = parts[0] || '';
                        resolvedMetadata[versionKey] = parts[1] || '';
                    }
                } else {
                    const fallbackObj = def.getCompositeValue(selectedBundles[0]);
                    resolvedMetadata[toolKey] = fallbackObj.tool || '';
                    resolvedMetadata[versionKey] = fallbackObj.version || '';
                }
            }
        });

        onConfirm(resolvedMetadata);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={
                <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                        <Layers size={18} />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-slate-100">Resolve Coalescing Metadata Conflicts</h3>
                        <p className="text-xs text-slate-400 font-normal mt-0.5">
                            Coalescing {selectedBundles.length} runs. Verify or customize metadata values to apply to the consolidated benchmark run.
                        </p>
                    </div>
                </div>
            }
            maxWidth="max-w-4xl"
        >
            <div className="space-y-6">
                {/* Metadata Fields List */}
                <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
                    {fieldDefs.map((def) => {
                        const { key, label, type } = def;
                        const conflictInfo = fieldConflicts[key] || { distinct: [], hasConflict: false, commonPrefix: '' };
                        const currentChoice = selectedChoices[key];
                        const hasConflict = conflictInfo.hasConflict;

                        return (
                            <div key={key} className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                                        {hasConflict ? (
                                            <AlertTriangle size={14} className="text-amber-400" />
                                        ) : (
                                            <Check size={14} className="text-emerald-400" />
                                        )}
                                        <span>{label}</span>
                                    </label>
                                    {hasConflict ? (
                                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                                            {conflictInfo.distinct.length} distinct values
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                                            {conflictInfo.distinct.length === 1 ? 'Matching across runs' : 'Unspecified'}
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    {/* Auto Common Prefix Option (for single text fields) */}
                                    {type === 'single' && conflictInfo.commonPrefix && (
                                        <label
                                            className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                                currentChoice === '__auto_prefix__'
                                                    ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200'
                                                    : 'bg-slate-950/40 border-slate-800/60 hover:bg-slate-900/60 text-slate-300'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name={`conflict-${key}`}
                                                checked={currentChoice === '__auto_prefix__'}
                                                onChange={() => setSelectedChoices(prev => ({ ...prev, [key]: '__auto_prefix__' }))}
                                                className="mt-0.5 text-cyan-500 focus:ring-cyan-500 bg-slate-900 border-slate-700"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <span className="font-semibold block break-all">
                                                    Auto: <span className="text-cyan-400 font-bold">{conflictInfo.commonPrefix}</span>
                                                </span>
                                            </div>
                                        </label>
                                    )}

                                    {/* Distinct Values */}
                                    {conflictInfo.distinct.map((item) => {
                                        const isChecked = currentChoice === item.strVal;

                                        return (
                                            <label
                                                key={item.strVal}
                                                className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                                    isChecked
                                                        ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200'
                                                        : 'bg-slate-950/40 border-slate-800/60 hover:bg-slate-900/60 text-slate-300'
                                                }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name={`conflict-${key}`}
                                                    checked={isChecked}
                                                    onChange={() => setSelectedChoices(prev => ({ ...prev, [key]: item.strVal }))}
                                                    className="mt-0.5 text-cyan-500 focus:ring-cyan-500 bg-slate-900 border-slate-700"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    {type === 'single' ? (
                                                        <span className="font-semibold block break-all">
                                                            {item.strVal}
                                                        </span>
                                                    ) : (
                                                        <div className="flex items-center gap-1.5 font-semibold text-xs">
                                                            <span className="text-slate-200">
                                                                {item.tool || <span className="italic text-slate-500 font-normal">unknown tool</span>}
                                                            </span>
                                                            {item.version && item.version.toLowerCase() !== 'unknown' ? (
                                                                <span className="text-slate-300">{item.version}</span>
                                                            ) : (
                                                                <span className="italic text-slate-500 font-normal">unknown version</span>
                                                            )}
                                                        </div>
                                                    )}

                                                    {hasConflict && item.sourceRuns && (
                                                        <span className="text-[10px] text-slate-500 block mt-0.5 font-sans">
                                                            Source: {item.sourceRuns.map(r => r.name).join(', ')}
                                                        </span>
                                                    )}
                                                </div>
                                            </label>
                                        );
                                    })}

                                    {/* Unspecified / Blank fallback option */}
                                    {conflictInfo.distinct.length === 0 && (
                                        <label
                                            className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                                currentChoice === ''
                                                    ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200'
                                                    : 'bg-slate-950/40 border-slate-800/60 hover:bg-slate-900/60 text-slate-300'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name={`conflict-${key}`}
                                                checked={currentChoice === ''}
                                                onChange={() => setSelectedChoices(prev => ({ ...prev, [key]: '' }))}
                                                className="mt-0.5 text-cyan-500 focus:ring-cyan-500 bg-slate-900 border-slate-700"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <span className="italic text-slate-400 block">None / Unspecified</span>
                                            </div>
                                        </label>
                                    )}

                                    {/* Custom Value Option */}
                                    <label
                                        className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                            currentChoice === '__custom__'
                                                ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200'
                                                : 'bg-slate-950/40 border-slate-800/60 hover:bg-slate-900/60 text-slate-300'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name={`conflict-${key}`}
                                            checked={currentChoice === '__custom__'}
                                            onChange={() => setSelectedChoices(prev => ({ ...prev, [key]: '__custom__' }))}
                                            className="mt-0.5 text-cyan-500 focus:ring-cyan-500 bg-slate-900 border-slate-700"
                                        />
                                        <div className="flex-1 space-y-2">
                                            <span className="font-semibold block">Custom value...</span>
                                            {currentChoice === '__custom__' && (
                                                type === 'single' ? (
                                                    <Input
                                                        type={key === 'accelerator_count' ? 'number' : 'text'}
                                                        value={customValues[key] || ''}
                                                        onChange={(e) => setCustomValues(prev => ({ ...prev, [key]: e.target.value }))}
                                                        placeholder={`Enter custom ${label.toLowerCase()}`}
                                                        className="text-xs py-1.5 bg-slate-950 border-slate-700 focus:border-cyan-500"
                                                        autoFocus
                                                    />
                                                ) : (
                                                    <div className="flex items-center gap-2 pt-1">
                                                        <Input
                                                            type="text"
                                                            value={customValues[def.toolKey] || ''}
                                                            onChange={(e) => setCustomValues(prev => ({ ...prev, [def.toolKey]: e.target.value }))}
                                                            placeholder={def.toolPlaceholder || "Name / Tool"}
                                                            className="w-1/2 text-xs py-1.5 bg-slate-950 border-slate-700 focus:border-cyan-500 font-semibold"
                                                            autoFocus
                                                        />
                                                        <span className="text-slate-500 font-bold">:</span>
                                                        <Input
                                                            type="text"
                                                            value={customValues[def.versionKey] || ''}
                                                            onChange={(e) => setCustomValues(prev => ({ ...prev, [def.versionKey]: e.target.value }))}
                                                            placeholder={def.versionPlaceholder || "Version"}
                                                            className="w-1/2 text-xs py-1.5 bg-slate-950 border-slate-700 focus:border-cyan-500 text-slate-300"
                                                        />
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    </label>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
                    <Button variant="secondary" onClick={onClose} className="text-xs">
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleConfirm} className="text-xs flex items-center gap-1.5">
                        <Check size={14} />
                        <span>Confirm & Coalesce Runs</span>
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
