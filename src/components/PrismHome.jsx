import React, { useState, useEffect } from 'react';
import { Activity, Zap, BarChart2, ArrowRight, Server, Cpu, CheckCircle, Shield, TrendingUp, HelpCircle, FileCode, Link, Database, Sliders, Layers, ChevronDown, ChevronUp, Lightbulb, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../utils/cn';

const roadmapItems = [
        {
            title: "Prefix Cache Offloading",
            description: "Tiered KV cache offloading to host CPU memory, expanding accelerator context capacity bounds.",
            icon: Database,
            colorClass: "text-emerald-400",
            bgClass: "bg-emerald-500/10",
            borderClass: "border-emerald-500/20",
            badge: "KV-cache"
        },
        {
            title: "Wide Expert Parallelism",
            description: "Scaling Mixture-of-Experts (MoE) workloads across large multi-node GPU clusters dynamically.",
            icon: Layers,
            colorClass: "text-pink-400",
            bgClass: "bg-pink-500/10",
            borderClass: "border-pink-500/20",
            badge: "MoE scale"
        },
        {
            title: "Value Analysis (Cost/TCO)",
            description: "Dynamic cost vs. performance optimization reports, estimating dollar savings per Chip hour.",
            icon: TrendingUp,
            colorClass: "text-cyan-400",
            bgClass: "bg-cyan-500/10",
            borderClass: "border-cyan-500/20",
            badge: "Cost/TCO"
        }
];

const PrismHome = ({ onNavigate }) => {
    const [currentRoadmapIndex, setCurrentRoadmapIndex] = useState(0);
    const [isHoveringRoadmap, setIsHoveringRoadmap] = useState(false);

    useEffect(() => {
        if (isHoveringRoadmap) return;
        const timer = setInterval(() => {
            setCurrentRoadmapIndex((prev) => (prev + 1) % roadmapItems.length);
        }, 3500);
        return () => clearInterval(timer);
    }, [isHoveringRoadmap]);

    return (
        <div className="min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden bg-[radial-gradient(#334155_1.2px,transparent_1.2px)] bg-[size:24px_24px] bg-repeat">
            {/* Pulsing Vibrant Neon Glow Background Shapes */}
            <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-blue-600/25 rounded-full blur-3xl pointer-events-none animate-pulse" />
            <div className="absolute top-1/3 -right-1/4 w-1/2 h-1/2 bg-purple-600/20 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '1s' }} />
            <div className="absolute bottom-0 -left-1/4 w-1/2 h-1/2 bg-emerald-600/25 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />

            <div className="max-w-6xl w-full z-10 flex flex-col items-center">
                {/* Hero Header */}
                <header className="mb-8 text-center relative pt-3 flex flex-col items-center">
                    <div className="flex items-center justify-center mb-3 space-x-3">
                        <a href="https://llm-d.ai" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
                            <img src="https://llm-d.ai/img/llm-d-logotype-and-icon.png" alt="llm-d Logo" className="h-9 object-contain" />
                        </a>
                        <a href="https://github.com/llm-d/llm-d-prism" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
                            <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">
                                Prism
                            </h1>
                        </a>
                    </div>
                    <p className="text-lg text-slate-400 max-w-3xl leading-relaxed font-normal tracking-wide">
                        Performance analysis for distributed inference systems and agentic workflows
                    </p>
                </header>

                {/* Well-lit paths */}
                <section className="mb-10 w-full max-w-6xl bg-slate-900/15 border border-slate-900 rounded-2xl relative overflow-hidden backdrop-blur-xl shadow-2xl">
                    {/* Grid mesh backdrop decorative lines */}
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1.5px,transparent_1.5px),linear-gradient(to_bottom,#1e293b_1.5px,transparent_1.5px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-25 pointer-events-none" />
                    <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
                    
                    <div className="relative p-5 md:p-6 z-10">
                        <div className="flex flex-col items-center text-center max-w-2xl mx-auto gap-3.5 mb-5">
                            <h2 className="text-2xl font-extrabold tracking-tight text-white mb-0.5">
                                Well-lit paths
                            </h2>
                            <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
                                Live benchmarked serving configurations and architectural templates
                            </p>
                        </div>
                        
                        <div className="flex flex-row overflow-x-auto gap-5 pt-4 pb-5 px-2 w-full items-stretch scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-slate-950/20">
                        {/* Path 1: Intelligent routing */}
                        <div 
                            onClick={() => onNavigate('inference-scheduling')}
                            className="group relative bg-slate-900/95 backdrop-blur-xl shadow-lg hover:shadow-2xl rounded-xl p-4 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(34,211,238,0.25)] transition-all duration-300 cursor-pointer flex flex-col justify-between border border-slate-800/80 hover:border-cyan-500/50 w-[246px] shrink-0 min-h-[320px] overflow-hidden"
                        >
                            <div>
                                <h3 className="text-base font-bold text-slate-200 tracking-wide mb-2 transition-colors group-hover:text-cyan-400">
                                    Intelligent routing
                                </h3>
                                <div className="flex flex-wrap gap-1 mb-2.5">
                                    <span className="text-[10px] px-1.5 py-0.5 bg-cyan-500/15 text-cyan-400 rounded-full font-medium border border-cyan-500/30 whitespace-nowrap">Prefix-cache</span>
                                    <span className="text-[10px] px-1.5 py-0.5 bg-cyan-500/15 text-cyan-400 rounded-full font-medium border border-cyan-500/30 whitespace-nowrap">Load balance</span>
                                </div>
                                <p className="text-slate-400 text-xs leading-relaxed mb-3">
                                    Optimize request routing to maximize performance. Leverage GKE Inference Gateway and cache introspection to reduce tail latency.
                                </p>
                                
                                {/* Visual Preview / Metrics */}
                                <div className="bg-slate-950/60 border border-slate-800/60 rounded-lg p-2.5 mb-3">
                                    <div className="space-y-0.5 mb-1.5">
                                        <div className="flex justify-between text-[10px]">
                                            <span className="text-slate-400">SLA compliance</span>
                                            <span className="text-cyan-400 font-mono font-bold">98.5%</span>
                                        </div>
                                        <div className="flex justify-between text-[10px]">
                                             <span className="text-slate-400">Context scale</span>
                                             <span className="text-cyan-400 font-mono font-bold">163k Tok</span>
                                        </div>
                                    </div>
                                    {/* Monochromatic Preview Chart */}
                                    <div className="h-6 flex items-end justify-between space-x-0.5 border-b border-slate-800/40 pb-px">
                                        <div className="w-full bg-gradient-to-t from-cyan-600 to-cyan-400 h-1.5 rounded-t-sm opacity-35"></div>
                                        <div className="w-full bg-gradient-to-t from-cyan-600 to-cyan-400 h-3 rounded-t-sm opacity-55"></div>
                                        <div className="w-full bg-gradient-to-t from-cyan-600 to-cyan-400 h-4.5 rounded-t-sm opacity-85"></div>
                                        <div className="w-full bg-gradient-to-t from-cyan-600 to-cyan-400 h-3.5 rounded-t-sm opacity-70"></div>
                                        <div className="w-full bg-gradient-to-t from-cyan-600 to-cyan-400 h-6 rounded-t-sm"></div>
                                    </div>
                                </div>
                            </div>
 
                            <button className="w-full py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_15px_rgba(34,211,238,0.2)] transform group-hover:scale-[1.02] transition-all cursor-pointer mt-auto">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Path 2: Prefix cache offloading */}
                        <div
                            onClick={() => onNavigate('prefix-cache-offloading')}
                            className="group relative bg-slate-900/95 backdrop-blur-xl shadow-lg hover:shadow-2xl rounded-xl p-4 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(16,185,129,0.25)] transition-all duration-300 cursor-pointer flex flex-col justify-between border border-slate-800/80 hover:border-emerald-500/50 w-[246px] shrink-0 min-h-[320px] overflow-hidden"
                        >
                            <div>
                                <h3 className="text-base font-bold text-slate-200 tracking-wide mb-2 transition-colors group-hover:text-emerald-400">
                                    Prefix cache offloading
                                </h3>
                                <div className="flex flex-wrap gap-1 mb-2.5">
                                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 rounded-full font-medium border border-emerald-500/30 whitespace-nowrap">KV-cache</span>
                                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 rounded-full font-medium border border-emerald-500/30 whitespace-nowrap">Tiered storage</span>
                                </div>
                                <p className="text-slate-400 text-xs leading-relaxed mb-3">
                                    Offload KV cache to CPU memory to extend accelerator capacity limit.
                                </p>
 
                                <div className="bg-slate-950/60 border border-slate-800/60 rounded-lg p-2.5 mb-3">
                                    <div className="space-y-0.5 mb-1.5">
                                        <div className="flex justify-between text-[10px]">
                                            <span className="text-slate-400">Capacity wall</span>
                                            <span className="text-emerald-400 font-mono font-bold">OOM Avoided</span>
                                        </div>
                                        <div className="flex justify-between text-[10px]">
                                             <span className="text-slate-400">Max prompt</span>
                                             <span className="text-emerald-400 font-mono font-bold">32k Tok</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-center space-x-0.5 h-6 items-center">
                                         <div className="w-8 h-5 bg-emerald-500/20 rounded border border-emerald-500/30 flex items-center justify-center text-[8px] font-bold text-emerald-400">HBM</div>
                                         <div className="text-[8px] text-slate-600 font-mono">{"->"}</div>
                                         <div className="w-8 h-5 bg-emerald-500/30 rounded border border-emerald-500/30 flex items-center justify-center text-[8px] font-bold text-emerald-400">CPU</div>
                                         <div className="text-[8px] text-slate-600 font-mono">{"->"}</div>
                                         <div className="w-8 h-5 bg-emerald-500/10 rounded border border-emerald-500/20 flex items-center justify-center text-[8px] font-bold text-emerald-400">Disk</div>
                                     </div>
                                </div>
                            </div>
 
                            <button className="w-full py-1.5 bg-gradient-to-r from-emerald-500 to-cyan-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center hover:from-emerald-400 hover:to-cyan-500 shadow-[0_0_15px_rgba(16,185,129,0.2)] transform group-hover:scale-[1.02] transition-all cursor-pointer mt-auto">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Path 3: Agentic serving */}
                        <div 
                            onClick={() => onNavigate('agentic-serving')}
                            className="group relative bg-slate-900/95 backdrop-blur-xl shadow-lg hover:shadow-2xl rounded-xl p-4 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(168,85,247,0.25)] transition-all duration-300 cursor-pointer flex flex-col justify-between border border-slate-800/80 hover:border-purple-500/50 w-[246px] shrink-0 min-h-[320px] overflow-hidden"
                        >
                            <div>
                                <h3 className="text-base font-bold text-slate-200 tracking-wide mb-2 transition-colors group-hover:text-purple-400">
                                    Agentic serving
                                </h3>
                                <div className="flex flex-wrap gap-1 mb-2.5">
                                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/15 text-purple-400 rounded-full font-medium border border-purple-500/30 whitespace-nowrap">Multi-turn</span>
                                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/15 text-purple-400 rounded-full font-medium border border-purple-500/30 whitespace-nowrap">Tool use</span>
                                </div>
                                <p className="text-slate-400 text-xs leading-relaxed mb-3">
                                    Optimize multi-turn conversations using prefix-aware routing, KV-offloading, and queue depth load balancing.
                                </p>
                                
                                {/* Visual Preview / Metrics */}
                                <div className="bg-slate-950/60 border border-slate-800/60 rounded-lg p-2.5 mb-3">
                                    <div className="space-y-0.5 mb-1.5">
                                        <div className="flex justify-between text-[10px]">
                                            <span className="text-slate-400">Workload</span>
                                            <span className="text-purple-400 font-mono font-bold">Code Generation</span>
                                        </div>
                                        <div className="flex justify-between text-[10px]">
                                            <span className="text-slate-400">Num Turns</span>
                                            <span className="text-purple-400 font-mono font-bold">230</span>
                                        </div>
                                    </div>
                                    <div className="h-6 flex items-end justify-between space-x-0.5 px-0.5 relative border-b border-slate-800/40 pb-px">
                                         <div className="w-1/6 bg-purple-500 h-1.5 rounded-t-sm opacity-20"></div>
                                         <div className="w-1/6 bg-purple-500 h-1.5 rounded-t-sm opacity-20"></div>
                                         <div className="w-2/6 bg-gradient-to-t from-cyan-600 to-cyan-400 h-4 rounded-t-sm relative opacity-90">
                                             <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[5px] font-mono font-bold text-cyan-400 uppercase tracking-wide">Active</span>
                                         </div>
                                         <div className="w-1/6 bg-purple-500 h-1.5 rounded-t-sm opacity-20"></div>
                                         <div className="w-1/6 bg-purple-500 h-1.5 rounded-t-sm opacity-20"></div>
                                         <div className="w-2/6 bg-gradient-to-t from-purple-600 to-purple-400 h-4 rounded-t-sm opacity-90 relative">
                                             <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[5px] font-mono font-bold text-purple-400 uppercase tracking-wide">Offload</span>
                                         </div>
                                    </div>
                                </div>
                            </div>
 
                            <button className="w-full py-1.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center hover:from-purple-400 hover:to-indigo-500 shadow-[0_0_15px_rgba(168,85,247,0.2)] transform group-hover:scale-[1.02] transition-all cursor-pointer mt-auto">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Divider */}
                        <div className="w-px bg-slate-800/60 self-stretch my-4 shrink-0" />

                        {/* Card 3: Consolidated Roadmap */}
                        <div 
                            onMouseEnter={() => setIsHoveringRoadmap(true)}
                            onMouseLeave={() => setIsHoveringRoadmap(false)}
                            className="group relative bg-gradient-to-br from-purple-950/20 via-slate-950/80 to-slate-950 backdrop-blur-xl border border-dashed border-purple-900/40 hover:border-purple-500/40 rounded-xl p-4 transition-all duration-300 flex flex-col justify-between w-[246px] shrink-0 min-h-[320px] overflow-hidden hover:shadow-[0_0_20px_rgba(168,85,247,0.15)]"
                        >
                            <div>
                                <h3 className="text-base font-bold text-slate-300 tracking-wide mb-2 transition-colors group-hover:text-purple-400">
                                    Coming soon
                                </h3>
                                <div className="flex flex-wrap gap-1 mb-2.5">
                                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/15 text-purple-400 rounded-full font-medium border border-purple-500/30 whitespace-nowrap">Roadmap</span>
                                </div>
                                <p className="text-slate-400 text-xs leading-relaxed mb-4">
                                    Upcoming performance optimizations and architectural templates on the Prism roadmap.
                                </p>

                                {/* Slideshow Item Container */}
                                <div className="relative p-2.5 bg-slate-950/40 border border-slate-900/60 rounded-xl flex items-start gap-2.5 mt-2 min-h-[110px] group/item transition-all duration-300">
                                    {/* Left/Right manual controls inside the carousel */}
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setCurrentRoadmapIndex((prev) => (prev - 1 + roadmapItems.length) % roadmapItems.length);
                                        }}
                                        className="absolute left-1 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-slate-900 border border-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800 opacity-0 group-hover/item:opacity-100 transition-opacity z-10 cursor-pointer"
                                    >
                                        <ChevronLeft className="w-3.5 h-3.5" />
                                    </button>

                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setCurrentRoadmapIndex((prev) => (prev + 1) % roadmapItems.length);
                                        }}
                                        className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-slate-900 border border-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800 opacity-0 group-hover/item:opacity-100 transition-opacity z-10 cursor-pointer"
                                    >
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Slide Item Content */}
                                    {(() => {
                                        const item = roadmapItems[currentRoadmapIndex];
                                        return (
                                            <div className="flex items-start gap-2.5 px-1.5 w-full animate-fadeIn">
                                                <div className="flex-1 min-w-0 pr-1.5">
                                                    <div className="flex items-center justify-between gap-1">
                                                        <h4 className="text-xs font-bold text-slate-200 truncate">{item.title}</h4>
                                                        <span className="text-[8px] font-mono text-slate-500 shrink-0">{currentRoadmapIndex + 1}/{roadmapItems.length}</span>
                                                    </div>
                                                    <p className="text-[11px] text-slate-400 leading-normal mt-1 line-clamp-3">{item.description}</p>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Pagination indicator dots below the carousel */}
                                <div className="flex justify-center gap-1.5 mt-2.5">
                                    {roadmapItems.map((_, idx) => (
                                        <button 
                                            key={idx}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setCurrentRoadmapIndex(idx);
                                            }}
                                            className="p-1 cursor-pointer flex items-center justify-center group"
                                        >
                                            <div
                                                className={cn(
                                                    'w-1.5 h-1.5 rounded-full transition-all duration-300',
                                                    idx === currentRoadmapIndex ? 'bg-purple-400 w-3' : 'bg-slate-700 group-hover:bg-slate-550'
                                                )}
                                            />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
                
                {/* Section: Utility Suite */}
                <section className="mb-10 w-full max-w-5xl bg-slate-900/15 border border-slate-900 rounded-2xl relative overflow-hidden backdrop-blur-xl shadow-2xl">
                    {/* Grid mesh backdrop decorative lines */}
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1.5px,transparent_1.5px),linear-gradient(to_bottom,#1e293b_1.5px,transparent_1.5px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-25 pointer-events-none" />
                    <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
                    
                    <div className="relative p-5 md:p-6 z-10">
                        <div className="flex flex-col items-center text-center max-w-2xl mx-auto gap-3.5 mb-5">
                            <h2 className="text-2xl font-extrabold tracking-tight text-white mb-0.5">
                                Utility suite
                            </h2>
                            <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
                                Access specialized tools for deeper analysis and schema browsing
                            </p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 w-full">
                        {/* Card 1: Results Store */}
                        <div 
                            onClick={() => onNavigate('results-store')}
                            className="bg-slate-900/60 shadow-xl border border-slate-800/80 hover:border-emerald-500/25 rounded-xl p-3.5 hover:shadow-[0_8px_30px_rgba(16,185,129,0.06)] hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                {/* Mini Visualization */}
                                <div className="relative h-20 w-full mb-2 bg-slate-950/60 rounded-xl border border-slate-900 overflow-hidden flex items-center justify-center group-hover:border-emerald-500/20 transition-all duration-300">
                                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:8px_8px] opacity-50" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <svg className="w-full h-full p-2.5 relative z-10" viewBox="0 0 160 50" fill="none">
                                        <line x1="20" y1="42" x2="140" y2="42" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                                        
                                        {/* Source Benchmark File (Local staging) */}
                                        <rect x="22" y="10" width="28" height="24" rx="2.5" fill="rgba(16,185,129,0.08)" stroke="rgba(16,185,129,0.5)" strokeWidth="1.2" />
                                        <line x1="28" y1="16" x2="44" y2="16" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" />
                                        <line x1="28" y1="22" x2="38" y2="22" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" />
                                        <line x1="28" y1="28" x2="42" y2="28" stroke="rgba(16,185,129,0.4)" strokeWidth="1.2" strokeLinecap="round" />
                                        
                                        {/* Checkmark overlay showing validation success */}
                                        <circle cx="50" cy="14" r="6" fill="#10b981" stroke="#022c22" strokeWidth="1.2" />
                                        <path d="M47.5 14 L 49.5 16 L 53 12.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        
                                        {/* Active transmission path */}
                                        <path d="M60 22 H 95" stroke="#10b981" strokeWidth="1.5" strokeDasharray="3 3" />
                                        <path d="M90 18 L 96 22 L 90 26" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        
                                        {/* Results Store Database (Solid pop) */}
                                        <rect x="108" y="9" width="30" height="26" rx="2.5" fill="rgba(16,185,129,0.18)" stroke="#10b981" strokeWidth="1.5" />
                                        <line x1="108" y1="17.5" x2="138" y2="17.5" stroke="#10b981" strokeWidth="1.2" />
                                        <line x1="108" y1="26" x2="138" y2="26" stroke="#10b981" strokeWidth="1.2" />
                                        <circle cx="114" cy="13.5" r="1.5" fill="#10b981" className="animate-pulse" />
                                        <circle cx="114" cy="22" r="1.5" fill="#10b981" />
                                        <circle cx="114" cy="30.5" r="1.5" fill="#10b981" />
                                    </svg>
                                </div>
                                <div className="flex items-center mb-2">
                                    <h3 className="text-sm font-bold text-slate-200 tracking-wide transition-colors group-hover:text-emerald-400 select-none">Results store</h3>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed mb-2">Stage, validate, and submit standardized benchmark report files and system execution benchmarks.</p>
                            </div>
                            <button className="w-full py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center hover:from-emerald-400 hover:to-teal-500 shadow-[0_0_15px_rgba(16,185,129,0.2)] transform group-hover:scale-[1.02] transition-all cursor-pointer mt-auto">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 2: Workload Catalog */}
                        <div 
                            onClick={() => onNavigate('workload-catalog')}
                            className="bg-slate-900/60 shadow-xl border border-slate-800/80 hover:border-cyan-500/25 rounded-xl p-3.5 hover:shadow-[0_8px_30px_rgba(6,182,212,0.06)] hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                {/* Mini Visualization */}
                                <div className="relative h-20 w-full mb-2 bg-slate-950/60 rounded-xl border border-slate-900 overflow-hidden flex items-center justify-center group-hover:border-cyan-500/20 transition-all duration-300">
                                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:8px_8px] opacity-50" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <svg className="w-full h-full p-2.5 relative z-10" viewBox="0 0 160 50" fill="none">
                                        <rect x="18" y="8" width="34" height="28" rx="3" fill="rgba(6,182,212,0.08)" stroke="rgba(6,182,212,0.45)" strokeWidth="1" />
                                        <path d="M22 14 H 42" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" />
                                        <path d="M26 20 H 46" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
                                        <path d="M22 26 H 38" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" />
                                        
                                        <rect x="63" y="8" width="34" height="28" rx="3" fill="rgba(6,182,212,0.18)" stroke="#06b6d4" strokeWidth="1.2" />
                                        <path d="M68 13 H 88" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" />
                                        <path d="M72 18 H 92" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
                                        <path d="M72 23 H 84" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
                                        <path d="M68 28 H 78" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" />
                                        <circle cx="91" cy="13" r="2" fill="#06b6d4" className="animate-pulse" />
                                        <circle cx="91" cy="13" r="1.5" fill="#06b6d4" />

                                        <rect x="108" y="8" width="34" height="28" rx="3" fill="rgba(6,182,212,0.08)" stroke="rgba(6,182,212,0.45)" strokeWidth="1" />
                                        <path d="M112 13 H 138" stroke="#3b82f6" strokeWidth="1.2" strokeLinecap="round" />
                                        <path d="M112 18 H 138" stroke="#3b82f6" strokeWidth="1.2" strokeLinecap="round" />
                                        <path d="M112 24 H 124" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                </div>
                                <div className="flex items-center mb-2">
                                    <h3 className="text-sm font-bold text-slate-200 tracking-wide transition-colors group-hover:text-cyan-400 select-none">Workload catalog</h3>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed mb-2">Browse, import, and configure production-grade Inference Workloads for latency & throughput testing.</p>
                            </div>
                            <button className="w-full py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_15px_rgba(34,211,238,0.2)] transform group-hover:scale-[1.02] transition-all cursor-pointer mt-auto">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 3: Regressions & Analysis */}
                        <div 
                            onClick={() => onNavigate('regressions-analysis')}
                            className="bg-slate-900/60 shadow-xl border border-slate-800/80 hover:border-rose-500/25 rounded-xl p-3.5 hover:shadow-[0_8px_30px_rgba(244,63,94,0.06)] hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                {/* Mini Visualization */}
                                <div className="relative h-20 w-full mb-2 bg-slate-950/60 rounded-xl border border-slate-900 overflow-hidden flex items-center justify-center group-hover:border-rose-500/20 transition-all duration-300">
                                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:8px_8px] opacity-50" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-rose-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <svg className="w-full h-full p-2.5 relative z-10" viewBox="0 0 160 50" fill="none">
                                        <line x1="20" y1="20" x2="140" y2="20" stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="3 2" />
                                        <text x="22" y="16" fill="rgba(255,255,255,0.2)" fontSize="6" fontFamily="sans-serif">SLA Target</text>
                                        <path d="M20 18 Q 45 15, 70 14 T 120 15 T 140 16" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" fill="none" />
                                        <path d="M20 18 C 40 18, 55 16, 75 36 C 90 38, 115 36, 140 37" stroke="#f43f5e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                                        <circle cx="75" cy="36" r="3.5" fill="rgba(244,63,94,0.2)" stroke="#f43f5e" strokeWidth="1.5" className="animate-pulse" />
                                        <line x1="18" y1="10" x2="18" y2="42" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                                        <line x1="18" y1="42" x2="142" y2="42" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                                    </svg>
                                </div>
                                <div className="flex items-center mb-2">
                                    <h3 className="text-sm font-bold text-slate-200 tracking-wide transition-colors group-hover:text-rose-455 select-none">Regressions & analysis</h3>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed mb-2">Track system performance trends, compare nightly metrics, and auto-detect regressions on well-lit paths.</p>
                            </div>
                            <button className="w-full py-1.5 bg-gradient-to-r from-rose-500 to-red-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center hover:from-rose-400 hover:to-red-500 shadow-[0_0_15px_rgba(244,63,94,0.2)] transform group-hover:scale-[1.02] transition-all cursor-pointer mt-auto">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 4: Benchmark Browser */}
                        <div 
                            onClick={() => onNavigate('benchmark-browser')}
                            className="bg-slate-900/60 shadow-xl border border-slate-800/80 hover:border-amber-500/25 rounded-xl p-3.5 hover:shadow-[0_8px_30px_rgba(245,158,11,0.06)] hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                {/* Mini Visualization */}
                                <div className="relative h-20 w-full mb-2 bg-slate-950/60 rounded-xl border border-slate-900 overflow-hidden flex items-center justify-center group-hover:border-amber-500/20 transition-all duration-300">
                                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:8px_8px] opacity-50" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-amber-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <svg className="w-full h-full p-2.5 relative z-10" viewBox="0 0 160 50" fill="none">
                                        <path d="M25 40 Q 55 38, 65 24 T 95 10" stroke="#f59e0b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                                        <text x="98" y="13" fill="#f59e0b" fontSize="6" fontFamily="sans-serif">Config A</text>
                                        <path d="M25 40 Q 75 39, 85 28 T 125 10" stroke="rgba(245,158,11,0.25)" strokeWidth="1.2" strokeDasharray="3 2" fill="none" strokeLinecap="round" />
                                        <text x="128" y="13" fill="rgba(245,158,11,0.4)" fontSize="6" fontFamily="sans-serif">Config B</text>
                                        <path d="M78 21 L 95 21" stroke="#f59e0b" strokeWidth="1" strokeDasharray="1 1" />
                                        <path d="M91 18 L 95 21 L 91 24" stroke="#f59e0b" strokeWidth="1" fill="none" />
                                        <text x="80" y="30" fill="#f59e0b" fontSize="5" fontFamily="monospace">Latency gap</text>
                                        <line x1="22" y1="8" x2="22" y2="40" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                                        <line x1="22" y1="40" x2="142" y2="40" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                                    </svg>
                                </div>
                                <div className="flex items-center mb-2">
                                    <h3 className="text-sm font-bold text-slate-200 tracking-wide transition-colors group-hover:text-amber-400 select-none">Benchmark browser</h3>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed mb-2">Search, filter, and compare benchmark results interactively across hardware and framework configs.</p>
                            </div>
                            <button className="w-full py-1.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center hover:from-amber-400 hover:to-orange-500 shadow-[0_0_15px_rgba(245,158,11,0.2)] transform group-hover:scale-[1.02] transition-all cursor-pointer mt-auto">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 5: Schema Explorer */}
                        <div 
                            onClick={() => onNavigate('schema-explorer')}
                            className="bg-slate-900/60 shadow-xl border border-slate-800/80 hover:border-purple-500/25 rounded-xl p-3.5 hover:shadow-[0_8px_30px_rgba(168,85,247,0.06)] hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                {/* Mini Visualization */}
                                <div className="relative h-20 w-full mb-2 bg-slate-950/60 rounded-xl border border-slate-900 overflow-hidden flex items-center justify-center group-hover:border-purple-500/20 transition-all duration-300">
                                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:8px_8px] opacity-50" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-purple-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <svg className="w-full h-full p-2.5 relative z-10" viewBox="0 0 160 50" fill="none">
                                        <text x="18" y="15" fill="#a855f7" fontSize="7.5" fontFamily="monospace" fontWeight="bold">"format":</text>
                                        <text x="64" y="15" fill="#f472b6" fontSize="7.5" fontFamily="monospace" fontWeight="bold">"brv02",</text>
                                        <text x="18" y="26" fill="#a855f7" fontSize="7.5" fontFamily="monospace" fontWeight="bold">"hardware":</text>
                                        <text x="76" y="26" fill="#e9d5ff" fontSize="7.5" fontFamily="monospace" fontWeight="bold">{"{"}</text>
                                        <text x="28" y="37" fill="#a855f7" fontSize="7.5" fontFamily="monospace" fontWeight="bold">"name":</text>
                                        <text x="64" y="37" fill="#f472b6" fontSize="7.5" fontFamily="monospace" fontWeight="bold">"nvidia-h100"</text>
                                        <text x="18" y="45" fill="#e9d5ff" fontSize="7.5" fontFamily="monospace" fontWeight="bold">{"}"}</text>
                                        <circle cx="132" cy="25" r="10.5" fill="rgba(168,85,247,0.25)" stroke="#a855f7" strokeWidth="1.5" />
                                        <path d="M128 25 L 131 28 L 137 22" stroke="#e9d5ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </div>
                                <div className="flex items-center mb-2">
                                    <h3 className="text-sm font-bold text-slate-200 tracking-wide transition-colors group-hover:text-purple-400 select-none">Schema explorer</h3>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed mb-2">Browse standard schema structures, validation rules, and metric definitions for benchmark reports.</p>
                            </div>
                            <button className="w-full py-1.5 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center hover:from-purple-400 hover:to-violet-500 shadow-[0_0_15px_rgba(168,85,247,0.2)] transform group-hover:scale-[1.02] transition-all cursor-pointer mt-auto">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>
                    </div>
                </div>
            </section>
                

                {/* Section: How it works */}
                <section className="mb-10 w-full max-w-5xl">
                     <h2 className="text-2xl font-extrabold tracking-tight text-white mb-2 text-center">
                          How it works: the full benchmark lifecycle
                     </h2>
                     <p className="text-xs text-slate-450 text-center mb-6 max-w-2xl mx-auto">
                          Designed for human insight and agent automation. Standardizing the end-to-end lifecycle from routing optimization to high-fidelity reproduction.
                     </p>
                     
                     <div className="flex flex-col md:flex-row gap-4 justify-between items-center relative mb-4">
                          
                          {/* Ambient glowing background in center */}
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

                          {/* Left Column: Roles & Actions */}
                          <div className="w-full md:w-1/3 space-y-3 flex flex-col items-center md:items-end">
                              <div className="w-full max-w-[320px] text-center text-[11px] font-bold text-cyan-400/90 uppercase tracking-widest mb-3 font-mono">User & agent roles</div>
                              
                              {/* Feature Developer */}
                              <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl p-3 w-full max-w-[320px] hover:border-cyan-500/30 transition-all group">
                                  <div className="mb-2">
                                      <h3 className="text-base font-bold text-slate-200 tracking-wide">Feature developer</h3>
                                  </div>
                                  <div className="space-y-1 text-slate-400 text-xs leading-relaxed">
                                      <div className="flex items-start gap-1">
                                          <span className="text-cyan-400">•</span>
                                          <span>Isolate component and system benchmarks.</span>
                                      </div>
                                      <div className="flex items-start gap-1">
                                          <span className="text-cyan-400">•</span>
                                          <span>Evaluate performance with established baselines.</span>
                                      </div>
                                      <div className="flex items-start gap-1">
                                          <span className="text-cyan-400">•</span>
                                          <span>Format results for publication and reproduction.</span>
                                      </div>
                                  </div>
                              </div>

                              {/* Benchmark Developer */}
                              <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl p-3 w-full max-w-[320px] hover:border-cyan-500/30 transition-all group">
                                  <div className="mb-2">
                                      <h3 className="text-base font-bold text-slate-200 tracking-wide">Benchmark developer</h3>
                                  </div>
                                  <div className="space-y-1 text-slate-400 text-xs leading-relaxed">
                                      <div className="flex items-start gap-1">
                                          <span className="text-cyan-400">•</span>
                                          <span>Publish reproducible workloads to the open catalog.</span>
                                      </div>
                                      <div className="flex items-start gap-1">
                                          <span className="text-cyan-400">•</span>
                                          <span>Configure cloud infrastructure for distributed testing.</span>
                                      </div>
                                      <div className="flex items-start gap-1">
                                          <span className="text-cyan-400">•</span>
                                          <span>Validate benchmark results for accuracy and correctness.</span>
                                      </div>
                                  </div>
                              </div>

                          </div>

                          {/* Center Column: Core Pipeline */}
                          <div className="w-full md:w-1/3 relative border-2 border-dashed border-slate-700 rounded-2xl p-4 bg-slate-900/50 backdrop-blur-xl flex flex-col items-center space-y-2 hover:border-blue-500/30 transition-all">
                              
                              {/* Column Label */}
                              <div className="w-full max-w-[320px] text-center text-[11px] font-bold text-purple-400/90 uppercase tracking-widest mb-1.5 font-mono">Central pipeline</div>

                              {/* Prism */}
                              <div className="bg-gradient-to-r from-purple-500/10 to-purple-600/10 border border-purple-500/30 rounded-xl p-2 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-purple-500/50 transition-all">
                                  <h3 className="text-base font-bold text-purple-400 mb-1">Prism</h3>
                                  <p className="text-xs text-slate-400 leading-normal">Visualize and compare metrics across benchmarks.</p>
                              </div>

                              {/* Llm-d Results Store */}
                              <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl p-3 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-blue-500/50 transition-all">
                                  <h3 className="text-base font-bold text-blue-400 mb-1">llm-d results store</h3>
                                  <p className="text-xs text-slate-400 leading-normal">Unified repository for schema-validated benchmark results.</p>
                              </div>

                              {/* Standard Benchmark Format / Report */}
                              <a 
                                  href="https://github.com/llm-d/llm-d-benchmark/blob/main/benchmark_report"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-xl p-2 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-cyan-500/50 transition-all cursor-pointer"
                              >
                                  <h3 className="text-base font-bold text-cyan-400 mb-1 flex items-center justify-center gap-1">
                                      Standard benchmark report
                                      <Link className="h-3 w-3 text-cyan-400 group-hover:scale-110 transition-transform" />
                                  </h3>
                                  <p className="text-xs text-slate-400 leading-normal">Unified JSON schema guarantees data interoperability.</p>
                              </a>

                              {/* Test Harness */}
                              <a 
                                  href="https://github.com/kubernetes-sigs/inference-perf/"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-xl p-2 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-cyan-500/50 transition-all cursor-pointer"
                              >
                                  <h3 className="text-base font-bold text-cyan-400 mb-1 flex items-center justify-center gap-1">
                                      Test harness
                                      <Link className="h-3 w-3 text-cyan-400 group-hover:scale-110 transition-transform" />
                                  </h3>
                                  <p className="text-xs text-slate-400 leading-normal">Stress distributed systems with agentic serving workloads.</p>
                              </a>

                              {/* Real World Workload Catalog */}
                              <a 
                                  href="https://github.com/kubernetes-sigs/inference-perf/tree/main/workload-catalog"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-xl p-2 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-cyan-500/50 transition-all cursor-pointer"
                              >
                                  <h3 className="text-base font-bold text-cyan-400 mb-1 flex items-center justify-center gap-1">
                                      Real world workload catalog
                                      <Link className="h-3 w-3 text-cyan-400 group-hover:scale-110 transition-transform" />
                                  </h3>
                                  <p className="text-xs text-slate-400 leading-normal">Access standardized workloads for evaluation.</p>
                              </a>

                          </div>

                          {/* Right Column: Roles & Actions */}
                          <div className="w-full md:w-1/3 space-y-3 flex flex-col items-center lg:items-start">
                              <div className="w-full max-w-[320px] text-center text-[11px] font-bold text-purple-400/90 uppercase tracking-widest mb-3 font-mono">User & agent roles</div>
                              
                              {/* Solutions Architect */}
                              <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl p-3 w-full max-w-[320px] hover:border-purple-500/30 transition-all group">
                                  <div className="mb-2">
                                      <h3 className="text-base font-bold text-slate-200 tracking-wide">Solutions architect</h3>
                                  </div>
                                  <div className="space-y-1 text-slate-400 text-xs leading-relaxed">
                                      <div className="flex items-start gap-1">
                                          <span className="text-purple-400">•</span>
                                          <span>Analyze features for optimal architectural fit.</span>
                                      </div>
                                      <div className="flex items-start gap-1">
                                          <span className="text-purple-400">•</span>
                                          <span>Architect full stack distributed inference solutions.</span>
                                      </div>
                                      <div className="flex items-start gap-1">
                                          <span className="text-purple-400">•</span>
                                          <span>Fork and run new custom benchmarks dynamically.</span>
                                      </div>
                                  </div>
                              </div>

                              {/* Stack Operator */}
                              <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl p-3 w-full max-w-[320px] hover:border-purple-500/30 transition-all group">
                                  <div className="mb-2">
                                      <h3 className="text-base font-bold text-slate-200 tracking-wide">Stack operator</h3>
                                  </div>
                                  <div className="space-y-1 text-slate-400 text-xs leading-relaxed">
                                      <div className="flex items-start gap-1">
                                          <span className="text-purple-400">•</span>
                                          <span>Compare price vs performance of serving stacks.</span>
                                      </div>
                                      <div className="flex items-start gap-1">
                                          <span className="text-purple-400">•</span>
                                          <span>Select optimal configurations for production use.</span>
                                      </div>
                                      <div className="flex items-start gap-1">
                                          <span className="text-purple-400">•</span>
                                          <span>Reproduce benchmarks to validate performance gain.</span>
                                      </div>
                                  </div>
                              </div>

                          </div>
                      </div>
                 </section>

                {/* Secondary Actions / Footer */}
                <div className="flex space-x-4 mb-8">
                    <a 
                        href="https://llm-d.ai/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="px-5 py-2.5 bg-slate-900/50 hover:bg-slate-850 text-slate-400 border border-slate-800 rounded font-mono text-[10px] uppercase tracking-widest transition-all"
                    >
                        llm-d.ai documentation
                    </a>
                </div>
            </div>
        </div>
    );
};

export default PrismHome;
