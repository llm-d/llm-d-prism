import React from 'react';
import { Activity, Zap, BarChart2, ArrowRight, Server, Cpu, CheckCircle, Shield, TrendingUp, HelpCircle, FileCode, Link } from 'lucide-react';

const PrismHome = ({ onNavigate }) => {
    return (
        <div className="min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Pulsing Vibrant Neon Glow Background Shapes */}
            <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-blue-600/15 rounded-full blur-3xl pointer-events-none animate-pulse" />
            <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />

            <div className="max-w-6xl w-full z-10 flex flex-col items-center">
                {/* Hero Header */}
                <header className="mb-10 text-center relative pt-6 flex flex-col items-center">
                    <div className="flex items-center justify-center mb-2 space-x-3">
                        <a href="https://llm-d.ai" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
                            <img src="https://llm-d.ai/img/llm-d-logotype-and-icon.png" alt="llm-d Logo" className="h-9 object-contain" />
                        </a>
                        <a href="https://github.com/llm-d/llm-d-prism" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
                            <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">
                                Prism
                            </h1>
                        </a>
                    </div>
                    <p className="text-xl text-slate-400 max-w-3xl leading-relaxed font-light tracking-wide mb-4">
                        Performance analysis for distributed inference systems and agentic workflows
                    </p>
                </header>



                {/* Well-lit paths */}
                <section className="mb-16 w-full">
                    <h2 className="text-2xl font-bold mb-2 text-center text-slate-100">
                        Well-lit paths
                    </h2>
                    <p className="text-xs text-slate-500 text-center mb-8">Underlying building blocks and features powering the workload suites.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-[96%] mx-auto">
                        {/* Path 1: Inference scheduling (Primary M1 Path - Popping) */}
                        <div 
                            onClick={() => onNavigate('inference-scheduling')}
                            className="group relative bg-slate-900/80 backdrop-blur-xl shadow-lg hover:shadow-2xl rounded-xl p-3.5 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(34,211,238,0.15)] transition-all duration-300 cursor-pointer flex flex-col h-full overflow-hidden border border-slate-800/50 hover:border-cyan-500/30"
                        >
                            <h3 className="text-sm font-bold mb-1.5 text-white group-hover:text-cyan-400 transition-colors leading-tight">
                                Intelligent routing
                            </h3>
                            <div className="flex flex-wrap gap-1 mb-2">
                                <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full font-medium border border-cyan-500/20 whitespace-nowrap">Prefix-cache</span>
                                <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full font-medium border border-cyan-500/20 whitespace-nowrap">Load balance</span>
                            </div>
                            <p className="text-slate-400 text-[10px] leading-relaxed mb-3 flex-1">
                                Optimize request routing to maximize performance. Leverage GKE Inference Gateway and cache introspection to reduce tail latency.
                            </p>
                            
                            {/* Visual Preview / Metrics */}
                            <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-2 mb-3">
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
                                <div className="h-6 flex items-end justify-between space-x-0.5 border-b border-slate-700/30 pb-px">
                                    <div className="w-full bg-cyan-500 h-1.5 rounded-t-sm opacity-30"></div>
                                    <div className="w-full bg-cyan-500 h-3 rounded-t-sm opacity-50"></div>
                                    <div className="w-full bg-cyan-500 h-4.5 rounded-t-sm opacity-80"></div>
                                    <div className="w-full bg-cyan-500 h-3.5 rounded-t-sm opacity-60"></div>
                                    <div className="w-full bg-cyan-500 h-6 rounded-t-sm"></div>
                                </div>
                            </div>
 
                            <button className="w-full py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_15px_rgba(34,211,238,0.2)] transform group-hover:scale-[1.02] transition-all">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Path 2: Prefix Cache Offloading (Coming Soon) */}
                        <div
                            className="group relative bg-slate-900/80 backdrop-blur-xl shadow-lg border border-slate-800 rounded-xl p-3.5 hover:-translate-y-1 transition-all duration-300 cursor-not-allowed flex flex-col h-full overflow-hidden opacity-70 hover:border-emerald-500/20 hover:shadow-[0_0_30px_rgba(16,185,129,0.08)]"
                        >
                            <h3 className="text-sm font-bold mb-1.5 text-white group-hover:text-emerald-400 transition-colors leading-tight">
                                Prefix cache offloading
                            </h3>
                            <div className="flex flex-wrap gap-1 mb-2">
                                <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full font-medium border border-emerald-500/20 whitespace-nowrap">KV-cache</span>
                                <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full font-medium border border-emerald-500/20 whitespace-nowrap">Tiered storage</span>
                            </div>
                            <p className="text-slate-400 text-[10px] leading-relaxed mb-3 flex-1">
                                Offload KV cache to CPU memory to extend accelerator capacity limit.
                            </p>
 
                            <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-2 mb-3">
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
 
                            <div className="w-full py-1.5 bg-slate-800/50 text-slate-500 rounded-lg font-medium text-[10px] flex items-center justify-center border border-slate-700/50">
                                Coming Soon
                            </div>
                        </div>

                        {/* Path 3: Prefill / Decode (P/D) Disagg */}
                        <div 
                            className="group relative bg-slate-900/80 backdrop-blur-xl shadow-lg border border-slate-800 rounded-xl p-3.5 hover:-translate-y-1 transition-all duration-300 cursor-not-allowed flex flex-col h-full overflow-hidden opacity-70 hover:border-purple-500/20 hover:shadow-[0_0_30px_rgba(168,85,247,0.08)]"
                        >
                            <h3 className="text-sm font-bold mb-1.5 text-white group-hover:text-purple-400 transition-colors leading-tight">
                                Prefill / decode (P/D) disagg
                            </h3>
                            <div className="flex flex-wrap gap-1 mb-2">
                                <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded-full font-medium border border-purple-500/20 whitespace-nowrap">Interactivity</span>
                                <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded-full font-medium border border-purple-500/20 whitespace-nowrap">Large models</span>
                            </div>
                            <p className="text-slate-400 text-[10px] leading-relaxed mb-3 flex-1">
                                Improve interactivity and eliminate prefill interference for large models.
                            </p>
 
                            <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-2 mb-3">
                                <div className="space-y-0.5 mb-1.5">
                                    <div className="flex justify-between text-[10px]">
                                        <span className="text-slate-400">Scale split</span>
                                        <span className="text-purple-400 font-mono font-bold">P-H100 : D-L4</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                         <span className="text-slate-400">Idle GPU saver</span>
                                         <span className="text-purple-400 font-mono font-bold">Up to 30%</span>
                                    </div>
                                </div>
                                <div className="flex justify-center space-x-1 h-6 items-center">
                                     <div className="w-8 h-5 bg-purple-500/20 rounded border border-purple-500/30 flex items-center justify-center text-[8px] font-bold text-purple-400">P</div>
                                     <div className="text-[8px] text-slate-600 font-bold font-mono">{"->"}</div>
                                     <div className="w-8 h-5 bg-purple-500/30 rounded border border-purple-500/30 flex items-center justify-center text-[8px] font-bold text-purple-400">D</div>
                                </div>
                            </div>
 
                            <button className="w-full py-1.5 bg-slate-800/50 text-slate-400 rounded-lg font-medium text-[10px] flex items-center justify-center border border-slate-700/50 cursor-not-allowed">
                                Coming soon
                            </button>
                        </div>

                        {/* Path 4: Wide Expert Parallelism */}
                        <div 
                            className="group relative bg-slate-900/80 backdrop-blur-xl shadow-lg border border-slate-800 rounded-xl p-3.5 hover:-translate-y-1 transition-all duration-300 cursor-not-allowed flex flex-col h-full overflow-hidden opacity-70 hover:border-pink-500/20 hover:shadow-[0_0_30px_rgba(236,72,153,0.08)]"
                        >
                            <h3 className="text-sm font-bold mb-1.5 text-white group-hover:text-pink-400 transition-colors leading-tight">
                                Wide expert parallelism
                            </h3>
                            <div className="flex flex-wrap gap-1 mb-2">
                                <span className="text-[9px] px-1.5 py-0.5 bg-pink-500/10 text-pink-400 rounded-full font-medium border border-pink-500/20 whitespace-nowrap">LeaderWorkerSet</span>
                                <span className="text-[9px] px-1.5 py-0.5 bg-pink-500/10 text-pink-400 rounded-full font-medium border border-pink-500/20 whitespace-nowrap">MoE scale</span>
                            </div>
                            <p className="text-slate-400 text-[10px] leading-relaxed mb-3 flex-1">
                                Deploy large MoE models across multi-node GPU clusters with Wide EP.
                            </p>
 
                            <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-2 mb-3">
                                <div className="space-y-0.5 mb-1.5">
                                    <div className="flex justify-between text-[10px]">
                                        <span className="text-slate-400">Experts</span>
                                        <span className="text-pink-400 font-mono font-bold">64+ Experts</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                         <span className="text-slate-400">Scale</span>
                                         <span className="text-pink-400 font-mono font-bold">256+ Chips</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-4 gap-0.5 h-6">
                                     <div className="bg-pink-500/20 rounded-sm"></div>
                                     <div className="bg-pink-500/40 rounded-sm"></div>
                                     <div className="bg-pink-500/10 rounded-sm"></div>
                                     <div className="bg-pink-500/30 rounded-sm"></div>
                                     <div className="bg-pink-500/20 rounded-sm"></div>
                                     <div className="bg-pink-500/50 rounded-sm animate-pulse"></div>
                                     <div className="bg-pink-500/20 rounded-sm"></div>
                                     <div className="bg-pink-500/10 rounded-sm"></div>
                                 </div>
                             </div>
 
                            <button className="w-full py-1.5 bg-slate-800/50 text-slate-400 rounded-lg font-medium text-[10px] flex items-center justify-center border border-slate-700/50 cursor-not-allowed">
                                Coming soon
                            </button>
                        </div>
                    </div>
                </section>
 
                {/* Workload Hub */}
                <section className="mb-20 w-full">
                    <h2 className="text-2xl font-bold mb-2 text-center text-slate-100">
                        Workload hub
                    </h2>
                    <p className="text-xs text-slate-500 text-center mb-8">Wide, premium paths aligned with how users deploy real-world production workloads.</p>
                    <div className="w-full max-w-[46%] mx-auto">
                        {/* Path 5: Agentic Workloads (M2 Path) */}
                        <div 
                            onClick={() => onNavigate('agentic-serving')}
                            className="group relative bg-slate-900/80 backdrop-blur-xl shadow-lg hover:shadow-2xl rounded-xl p-5 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(34,211,238,0.15)] transition-all duration-300 cursor-pointer flex flex-col h-full overflow-hidden border border-slate-800/50 hover:border-cyan-500/30"
                        >
                            <h3 className="text-base font-bold mb-2 text-white group-hover:text-cyan-400 transition-colors leading-tight">
                                Agentic serving
                            </h3>
                            <div className="flex flex-wrap gap-1.5 mb-3">
                                <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full font-medium border border-cyan-500/20 whitespace-nowrap">Multi-turn</span>
                                <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full font-medium border border-cyan-500/20 whitespace-nowrap">TPU v7</span>
                                <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full font-medium border border-cyan-500/20 whitespace-nowrap">Qwen3-480B</span>
                            </div>
                            <p className="text-slate-400 text-xs leading-relaxed mb-4 flex-1">
                                Deploy Qwen3-Coder-480B over 8 TPU v7 replicas. Harness prefix-aware routing, CPU DRAM KV-offloading, and queue depth load balancing to optimize multi-turn conversations.
                            </p>
 
                            {/* Visual Preview / Metrics */}
                            <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-3 mb-4">
                                <div className="space-y-1 mb-2.5">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-400">Platform</span>
                                        <span className="text-cyan-400 font-mono font-bold">TPU v7 (2x2x1)</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-400">Conversation type</span>
                                        <span className="text-cyan-400 font-mono font-bold">Multi-Turn + Tools</span>
                                    </div>
                                </div>
                                <div className="h-8 flex items-end justify-between space-x-1 px-0.5 relative border-b border-slate-700/30 pb-px">
                                     <div className="w-1/6 bg-cyan-500 h-1.5 rounded-t-sm opacity-20"></div>
                                     <div className="w-1/6 bg-cyan-500 h-1.5 rounded-t-sm opacity-20"></div>
                                     <div className="w-2/6 bg-cyan-500 h-6 rounded-t-sm relative opacity-90">
                                         <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[6px] font-mono font-bold text-cyan-400 uppercase tracking-wide">Active</span>
                                     </div>
                                     <div className="w-1/6 bg-cyan-500 h-1.5 rounded-t-sm opacity-20"></div>
                                     <div className="w-1/6 bg-cyan-500 h-1.5 rounded-t-sm opacity-20"></div>
                                     <div className="w-2/6 bg-cyan-500 h-6 rounded-t-sm opacity-90 relative">
                                         <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[6px] font-mono font-bold text-cyan-400 uppercase tracking-wide">Offload</span>
                                     </div>
                                </div>
                            </div>
 
                            <button className="w-full py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-xs rounded-lg flex items-center justify-center hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_15px_rgba(34,211,238,0.2)] transform group-hover:scale-[1.02] transition-all">
                                Launch <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                </section>
                

{/* Section: Utility Suite */}
                <section className="mb-20 w-full max-w-6xl">
                    <h2 className="text-2xl font-bold mb-2 text-center text-slate-100">
                          Utility suite
                    </h2>
                    <p className="text-sm text-slate-500 text-center mb-8">Access specialized tools for deeper analysis and schema browsing.</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full">
                        {/* Card 1: Benchmark Browser */}
                        <div 
                            onClick={() => onNavigate('advanced')}
                            className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-3.5 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                <div className="flex items-center mb-2">
                                    <BarChart2 className="h-4 w-4 text-emerald-400 mr-2" />
                                    <h3 className="text-sm font-bold text-slate-100 group-hover:text-emerald-400 transition-colors">Benchmark browser</h3>
                                </div>
                                <p className="text-[10px] text-slate-400 mb-4">Browse and compare benchmark results across runs.</p>
                            </div>
                            <button className="w-full py-1.5 bg-slate-800 hover:bg-emerald-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center transition-colors">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 4: Schema Explorer */}
                        <div 
                            onClick={() => onNavigate('schema-explorer')}
                            className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-3.5 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                <div className="flex items-center mb-2">
                                    <FileCode className="h-4 w-4 text-emerald-400 mr-2" />
                                    <h3 className="text-sm font-bold text-slate-100 group-hover:text-emerald-400 transition-colors">Schema explorer</h3>
                                </div>
                                <p className="text-[10px] text-slate-400 mb-4">Explore data schemas and metric definitions.</p>
                            </div>
                            <button className="w-full py-1.5 bg-slate-800 hover:bg-emerald-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center transition-colors">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 2: Workload Catalog */}
                        <div 
                            onClick={() => onNavigate('workload-catalog')}
                            className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-3.5 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                <div className="flex items-center mb-2">
                                    <Zap className="h-4 w-4 text-emerald-400 mr-2" />
                                    <h3 className="text-sm font-bold text-slate-100 group-hover:text-emerald-400 transition-colors">Workload catalog</h3>
                                </div>
                                <p className="text-[10px] text-slate-400 mb-4">Explore standardized workloads for evaluation.</p>
                            </div>
                            <button className="w-full py-1.5 bg-slate-800 hover:bg-emerald-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center transition-colors">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 5: Regressions & Analysis */}
                        <div 
                            onClick={() => onNavigate('regressions-analysis')}
                            className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-3.5 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                <div className="flex items-center mb-2">
                                    <Activity className="h-4 w-4 text-emerald-400 mr-2" />
                                    <h3 className="text-sm font-bold text-slate-100 group-hover:text-emerald-400 transition-colors">Regressions & analysis</h3>
                                </div>
                                <p className="text-[10px] text-slate-400 mb-4">Track nightly benchmark runs and detect regressions across well-lit paths.</p>
                            </div>
                            <button className="w-full py-1.5 bg-slate-800 hover:bg-emerald-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center transition-colors">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 3: Value Analysis */}
                        <div className="bg-slate-900/50 shadow-xl border border-slate-800/50 rounded-xl p-3.5 cursor-not-allowed flex flex-col justify-between h-full opacity-60">
                            <div>
                                <div className="flex items-center mb-2">
                                    <TrendingUp className="h-4 w-4 text-slate-500 mr-2" />
                                    <h3 className="text-sm font-bold text-slate-500">Value analysis</h3>
                                    <span className="ml-auto text-[8px] px-1.5 py-0.5 bg-slate-800 text-slate-500 rounded font-mono">SOON</span>
                                </div>
                                <p className="text-[10px] text-slate-600 mb-4">Cost vs performance optimization reports.</p>
                            </div>
                            <button className="w-full py-1.5 bg-slate-800/50 text-slate-600 rounded-lg font-medium text-[10px] flex items-center justify-center border border-slate-700/30 cursor-not-allowed">
                                Coming soon
                            </button>
                        </div>
                    </div>
                </section>
                



                {/* Section: How it works */}
                <section className="mb-20 w-full max-w-6xl mx-auto pl-20">
                     <h2 className="text-3xl font-bold mb-2 text-center text-slate-100">
                          How it works: the full benchmark lifecycle
                     </h2>
                     <p className="text-sm text-slate-400 text-center mb-12 max-w-2xl mx-auto">
                          Designed for human insight and agent automation. Standardizing the end-to-end lifecycle from routing optimization to high-fidelity reproduction.
                     </p>
                     
                     <div className="flex flex-col md:flex-row gap-4 justify-between items-center relative mb-6">
                         
                         {/* Ambient glowing background in center */}
                         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

                         {/* Left Column: Roles & Actions */}
                         <div className="w-full md:w-1/3 space-y-3 flex flex-col items-center md:items-end">
                             <div className="w-full max-w-[320px] text-center text-xs font-extrabold text-cyan-400/90 uppercase tracking-widest mb-2">User & agent roles</div>
                             
                             {/* Feature Developer */}
                             <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl p-3 w-full max-w-[320px] hover:border-cyan-500/30 transition-all group">
                                 <div className="mb-2">
                                     <h4 className="text-sm font-bold text-white">Feature developer</h4>
                                 </div>
                                 <div className="space-y-1 text-sm text-slate-400">
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
                                     <h4 className="text-sm font-bold text-white">Benchmark developer</h4>
                                 </div>
                                 <div className="space-y-1 text-sm text-slate-400">
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
                             
                             {/* Prism */}
                             <div className="bg-gradient-to-r from-purple-500/10 to-purple-600/10 border border-purple-500/30 rounded-xl p-2 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-purple-500/50 transition-all">
                                 <h4 className="text-sm font-bold text-purple-400 mb-0.5">Prism</h4>
                                 <p className="text-sm text-slate-400">Visualize and compare metrics across benchmarks.</p>
                             </div>

                             {/* Llm-d Results Store */}
                             <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl p-3 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-blue-500/50 transition-all">
                                 <h4 className="text-sm font-bold text-blue-400 mb-0.5">llm-d results store</h4>
                                 <p className="text-sm text-slate-400">Scalable OSS store for unified schema results.</p>
                             </div>

                             {/* Standard Benchmark Format / Report */}
                             <a 
                                 href="https://github.com/llm-d/llm-d-benchmark/blob/main/benchmark_report"
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-xl p-2 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-cyan-500/50 transition-all cursor-pointer"
                              >
                                 <h4 className="text-sm font-bold text-cyan-400 mb-0.5 flex items-center justify-center gap-1">
                                     Standard benchmark report
                                     <Link className="h-3 w-3 text-cyan-400 group-hover:scale-110 transition-transform" />
                                 </h4>
                                 <p className="text-sm text-slate-400">Unified JSON schema guarantees data interoperability.</p>
                             </a>

                             {/* Test Harness */}
                             <a 
                                 href="https://github.com/kubernetes-sigs/inference-perf/"
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-xl p-2 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-cyan-500/50 transition-all cursor-pointer"
                             >
                                 <h4 className="text-sm font-bold text-cyan-400 mb-0.5 flex items-center justify-center gap-1">
                                     Test harness
                                     <Link className="h-3 w-3 text-cyan-400 group-hover:scale-110 transition-transform" />
                                 </h4>
                                 <p className="text-sm text-slate-400">Stress distributed systems with agentic serving workloads.</p>
                             </a>

                             {/* Real World Workload Catalog */}
                             <a 
                                 href="https://github.com/kubernetes-sigs/inference-perf/tree/main/workload-catalog"
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-xl p-2 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-cyan-500/50 transition-all cursor-pointer"
                             >
                                 <h4 className="text-sm font-bold text-cyan-400 mb-0.5 flex items-center justify-center gap-1">
                                     Real world workload catalog
                                     <Link className="h-3 w-3 text-cyan-400 group-hover:scale-110 transition-transform" />
                                 </h4>
                                 <p className="text-sm text-slate-400">Access standardized workloads for evaluation.</p>
                             </a>

                         </div>

                         {/* Right Column: Roles & Actions */}
                         <div className="w-full md:w-1/3 space-y-3 flex flex-col items-center lg:items-start">
                             <div className="w-full max-w-[320px] text-center text-xs font-extrabold text-purple-400/90 uppercase tracking-widest mb-2">User & agent roles</div>
                             
                             {/* Solutions Architect */}
                             <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl p-3 w-full max-w-[320px] hover:border-purple-500/30 transition-all group">
                                 <div className="mb-2">
                                     <h4 className="text-sm font-bold text-white">Solutions architect</h4>
                                 </div>
                                 <div className="space-y-1 text-sm text-slate-400">
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
                                     <h4 className="text-sm font-bold text-white">Stack operator</h4>
                                 </div>
                                 <div className="space-y-1 text-sm text-slate-400">
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
                <div className="flex space-x-4 mb-16">
                    <a 
                        href="https://llm-d.ai/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="px-6 py-2 bg-transparent hover:bg-slate-800 text-slate-400 rounded-lg transition-colors flex items-center text-sm font-medium"
                    >
                        llm-d.ai docs
                    </a>
                </div>
            </div>
        </div>
    );
};

export default PrismHome;
