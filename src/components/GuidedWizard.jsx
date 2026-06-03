import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';

export default function GuidedWizard({ onApplyPath, onSkip }) {
    const [workloadGoal, setWorkloadGoal] = useState(null);
    const [modelScale, setModelScale] = useState(null);

    return (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-amber-400" /> Guided configuration wizard
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Answer a few questions to find the best well-lit path for your workload.</p>
                </div>
            </div>

            {/* Question 1 */}
            <div className="space-y-3">
                <label className="text-sm font-bold text-white">1. What is your primary goal for this workload?</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                        { id: 'throughput', label: 'Maximize throughput', desc: 'Highest token generation rate' },
                        { id: 'latency', label: 'Minimize latency', desc: 'Lowest response time (TTFT)' },
                        { id: 'cost', label: 'Minimize cost', desc: 'Most economical hardware' }
                    ].map((opt) => (
                        <button
                            key={opt.id}
                            onClick={() => setWorkloadGoal(opt.id)}
                            className={`p-4 rounded-xl border text-left transition-all ${workloadGoal === opt.id ? 'border-sky-500 bg-sky-950/50' : 'border-slate-800 bg-slate-950 hover:border-slate-700'}`}
                        >
                            <div className="font-bold text-white text-sm">{opt.label}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Question 2 */}
            {workloadGoal && (
                <div className="space-y-3 animate-fade-in">
                    <label className="text-sm font-bold text-white">2. What model scale are you targeting?</label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {[
                            { id: 'small', label: 'Small (~7B)', desc: 'e.g., Gemma 2B, Llama 8B' },
                            { id: 'medium', label: 'Medium (~30B)', desc: 'e.g., Qwen 31B' },
                            { id: 'large', label: 'Large (~70B+)', desc: 'e.g., Llama 70B' }
                        ].map((opt) => (
                            <button
                                key={opt.id}
                                onClick={() => setModelScale(opt.id)}
                                className={`p-4 rounded-xl border text-left transition-all ${modelScale === opt.id ? 'border-sky-500 bg-sky-950/50' : 'border-slate-800 bg-slate-950 hover:border-slate-700'}`}
                            >
                                <div className="font-bold text-white text-sm">{opt.label}</div>
                                <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Recommendations */}
            {workloadGoal && modelScale && (
                <div className="space-y-3 animate-fade-in">
                    <label className="text-sm font-bold text-white">Recommended "well-lit paths"</label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                            { title: 'Path 1: cost optimized', desc: 'Best balance of cost and speed', applied: { model: 'Qwen-3-Dense', hardware: '4x RTX A6000 (Spot)', batch: 16, prompt: 4000 } },
                            { title: 'Path 2: performance max', desc: 'Lowest latency, highest throughput', applied: { model: 'Llama-3-70B', hardware: '4x L40S (Spot)', batch: 32, prompt: 8000 } },
                            { title: 'Path 3: balanced', desc: 'Optimized for mixed workloads', applied: { model: 'Gemma-4-Ultra', hardware: '2x RTX 4090 Heterogeneous', batch: 8, prompt: 8000 } }
                        ].map((path, idx) => (
                            <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                                <div>
                                    <div className="font-bold text-white text-sm">{path.title}</div>
                                    <div className="text-xs text-slate-500 mt-0.5">{path.desc}</div>
                                </div>
                                <button
                                    onClick={() => onApplyPath(path.applied)}
                                    className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg transition-colors"
                                >
                                    Apply this path
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
