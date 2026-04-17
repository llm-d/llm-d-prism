import React from 'react';
import { Activity, Zap, BarChart2, ArrowRight, Server, Cpu, CheckCircle, Shield, TrendingUp, HelpCircle, FileCode } from 'lucide-react';

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
                        Performance analysis for distributed inference systems.
                    </p>
                </header>



                {/* Section: Well-lit paths (UX Clarity) */}
                <section className="mb-20 w-full">
                    <h2 className="text-2xl font-bold mb-2 text-center text-slate-100">
                          Select a well-lit path to begin
                     </h2>
                     <p className="text-xs text-slate-500 text-center mb-6">Standardized workloads optimized for rapid evaluation and deployment.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                        {/* Path 1: Inference scheduling (Primary M1 Path - Popping) */}
                        <div 
                            onClick={() => onNavigate('inference-scheduling')}
                            className="group relative bg-slate-900/80 backdrop-blur-xl shadow-2xl border-2 border-cyan-500 rounded-2xl p-5 hover:-translate-y-2 hover:shadow-[0_0_30px_rgba(34,211,238,0.3)] transition-all duration-500 cursor-pointer flex flex-col h-full overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 text-xs px-2.5 py-1 bg-cyan-500 text-white rounded-bl-lg font-mono font-bold tracking-wide shadow-lg">PRIMARY PATH</div>
                            <h3 className="text-lg font-bold mb-2 text-white group-hover:text-cyan-400 transition-colors">
                                Intelligent inference scheduling
                            </h3>
                            <div className="flex flex-nowrap gap-1.5 mb-2">
                                <span className="text-[10px] px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full font-medium border border-cyan-500/20 whitespace-nowrap">Prefix-cache aware</span>
                                <span className="text-[10px] px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full font-medium border border-cyan-500/20 whitespace-nowrap">Load balancing</span>
                            </div>
                            <p className="text-slate-400 text-xs mb-3 flex-1">
                                Optimize vLLM and SGLang on Kubernetes. Reduce tail latency and increase throughput with load-aware and prefix-cache aware routing.
                            </p>
                            
                            {/* Visual Preview / Metrics */}
                            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 mb-4 relative">
                                <div className="space-y-1 mb-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-400">Avg. TTFT reduction</span>
                                        <span className="text-cyan-400 font-mono font-bold">-210ms</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                         <span className="text-slate-400">Target efficiency</span>
                                         <span className="text-cyan-400 font-mono font-bold">1.4x gain</span>
                                    </div>
                                </div>
                                {/* Monochromatic Preview Chart */}
                                <div className="h-8 flex items-end justify-between space-x-1">
                                    <div className="w-full bg-cyan-500 h-2 rounded-sm opacity-30"></div>
                                    <div className="w-full bg-cyan-500 h-4 rounded-sm opacity-50"></div>
                                    <div className="w-full bg-cyan-500 h-6 rounded-sm opacity-80"></div>
                                    <div className="w-full bg-cyan-500 h-5 rounded-sm opacity-60"></div>
                                    <div className="w-full bg-cyan-500 h-8 rounded-sm"></div>
                                </div>
                            </div>

                            <button className="w-full py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg font-medium text-xs flex items-center justify-center hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_15px_rgba(34,211,238,0.3)] transform group-hover:scale-[1.02] transition-all">
                                Launch Dashboard <ArrowRight className="ml-1.5 h-3 w-3" />
                            </button>
                        </div>

                        {/* Path 2: P/D Disaggregation */}
                        <div 
                            className="group relative bg-slate-900/80 backdrop-blur-xl shadow-lg border border-slate-800 rounded-2xl p-5 hover:-translate-y-2 hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all duration-500 cursor-not-allowed flex flex-col h-full overflow-hidden"
                        >
                            <h3 className="text-lg font-bold mb-2 text-white group-hover:text-emerald-400 transition-colors">
                                Prefill / Decode (P/D)<br />Disaggregated Serving
                            </h3>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full font-medium border border-emerald-500/20 whitespace-nowrap">Interactivity</span>
                                <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full font-medium border border-emerald-500/20 whitespace-nowrap">Large models</span>
                            </div>
                            <p className="text-slate-400 text-xs mb-3 flex-1">
                                Improve interactivity and throughput for large models like gpt-oss-120b. Eliminate prefill interference by specializing P and D workers.
                            </p>

                            {/* Visual Preview / Metrics */}
                            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 mb-4 relative">
                                <div className="space-y-1 mb-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-400">Target scale split</span>
                                        <span className="text-emerald-400 font-mono font-bold">P-H100 : D-L4</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-400">Idle GPU saver</span>
                                        <span className="text-emerald-400 font-mono font-bold">Up to 30%</span>
                                    </div>
                                </div>
                                <div className="flex justify-center space-x-2">
                                     <div className="w-10 h-8 bg-emerald-500/20 rounded border border-emerald-500/50 flex items-center justify-center text-xs text-emerald-400">P</div>
                                     <div className="w-10 h-8 bg-slate-800 rounded border border-slate-700 flex items-center justify-center text-xs text-slate-500">{"->"}</div>
                                     <div className="w-10 h-8 bg-emerald-500/30 rounded border border-emerald-500/50 flex items-center justify-center text-xs text-emerald-400">D</div>
                                </div>
                            </div>

                            <button className="w-full py-2 bg-slate-800/50 text-slate-400 rounded-lg font-medium text-xs flex items-center justify-center border border-slate-700/50 cursor-not-allowed">
                                Coming soon
                            </button>
                        </div>

                        {/* Path 3: Wide-EP */}
                        <div 
                            className="group relative bg-slate-900/80 backdrop-blur-xl shadow-lg border border-slate-800 rounded-2xl p-5 hover:-translate-y-2 hover:shadow-[0_0_30px_rgba(236,72,153,0.3)] transition-all duration-500 cursor-not-allowed flex flex-col h-full overflow-hidden"
                        >
                            <h3 className="text-lg font-bold mb-2 text-white group-hover:text-pink-400 transition-colors">
                                Wide Expert<br />Parallelism (Wide EP)
                            </h3>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                <span className="text-[10px] px-2 py-0.5 bg-pink-500/10 text-pink-400 rounded-full font-medium border border-pink-500/20 whitespace-nowrap">LeaderWorkerSet</span>
                                <span className="text-[10px] px-2 py-0.5 bg-pink-500/10 text-pink-400 rounded-full font-medium border border-pink-500/20 whitespace-nowrap">MoE scale</span>
                            </div>
                            <p className="text-slate-400 text-xs mb-3 flex-1">
                                Deploy large MoE models like DeepSeek-R1 across multi-node GPU clusters. Scale sparse models using wide expert parallelism and LeaderWorkerSet.
                            </p>

                            {/* Visual Preview / Metrics */}
                            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 mb-4 relative">
                                <div className="space-y-1 mb-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-400">Node expert count</span>
                                        <span className="text-pink-400 font-mono font-bold">64+ Experts</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-400">Cluster size target</span>
                                        <span className="text-pink-400 font-mono font-bold">256+ Chips</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-4 gap-1 h-8">
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

                            <button className="w-full py-2 bg-slate-800/50 text-slate-400 rounded-lg font-medium text-xs flex items-center justify-center border border-slate-700/50 cursor-not-allowed">
                                Coming soon
                            </button>
                        </div>

                        {/* Path 4: Prefix Cache Offloading */}
                        <div 
                            className="group relative bg-slate-900/80 backdrop-blur-xl shadow-lg border border-slate-800 rounded-2xl p-5 hover:-translate-y-2 hover:shadow-[0_0_30px_rgba(245,158,11,0.3)] transition-all duration-500 cursor-not-allowed flex flex-col h-full overflow-hidden"
                        >
                            <h3 className="text-lg font-bold mb-2 text-white group-hover:text-amber-400 transition-colors">
                                Prefix Cache<br />Offloading
                            </h3>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                <span className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full font-medium border border-amber-500/20 whitespace-nowrap">KV-cache</span>
                                <span className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full font-medium border border-amber-500/20 whitespace-nowrap">Tiered storage</span>
                            </div>
                            <p className="text-slate-400 text-xs mb-3 flex-1">
                                Offload KV cache to CPU memory to extend accelerator capacity and serve longer contexts. Supports tiered storage hierarchy.
                            </p>

                            {/* Visual Preview / Metrics */}
                            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 mb-4 relative">
                                <div className="space-y-1 mb-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-400">Primary tier</span>
                                        <span className="text-amber-400 font-mono font-bold">HBM</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-400">Offload tier</span>
                                        <span className="text-amber-400 font-mono font-bold">CPU RAM</span>
                                    </div>
                                </div>
                                <div className="flex justify-center space-x-1">
                                     <div className="w-10 h-8 bg-amber-500/20 rounded border border-amber-500/50 flex items-center justify-center text-xs text-amber-400">HBM</div>
                                     <div className="w-6 h-8 flex items-center justify-center text-xs text-slate-500">{"->"}</div>
                                     <div className="w-10 h-8 bg-amber-500/30 rounded border border-amber-500/50 flex items-center justify-center text-xs text-amber-400">CPU</div>
                                     <div className="w-6 h-8 flex items-center justify-center text-xs text-slate-500">{"->"}</div>
                                     <div className="w-10 h-8 bg-amber-500/10 rounded border border-amber-500/30 flex items-center justify-center text-xs text-amber-400">Disk</div>
                                </div>
                            </div>

                            <button className="w-full py-2 bg-slate-800/50 text-slate-400 rounded-lg font-medium text-xs flex items-center justify-center border border-slate-700/50 cursor-not-allowed">
                                Coming soon
                            </button>
                        </div>
                    </div>
                </section>
                
                {/* Section: Utility Suite */}
                <section className="mb-20 w-full max-w-4xl">
                    <h2 className="text-2xl font-bold mb-2 text-center text-slate-100">
                          Utility Suite
                    </h2>
                    <p className="text-sm text-slate-500 text-center mb-8">Access specialized tools for deeper analysis and schema browsing.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                        {/* Card 1: Benchmark Browser */}
                        <div 
                            onClick={() => onNavigate('advanced')}
                            className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-4 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                <div className="flex items-center mb-2">
                                    <BarChart2 className="h-5 w-5 text-cyan-400 mr-2" />
                                    <h3 className="text-base font-semibold text-slate-100 group-hover:text-cyan-400 transition-colors">Benchmark Browser</h3>
                                </div>
                                <p className="text-xs text-slate-400 mb-4">Browse and compare benchmark results across runs.</p>
                            </div>
                            <button className="w-full py-2 bg-slate-800 hover:bg-cyan-600 text-white rounded-lg font-medium text-xs flex items-center justify-center transition-colors">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 4: Schema Explorer */}
                        <div 
                            onClick={() => onNavigate('schema-explorer')}
                            className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-4 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                <div className="flex items-center mb-2">
                                    <FileCode className="h-5 w-5 text-cyan-400 mr-2" />
                                    <h3 className="text-base font-semibold text-slate-100 group-hover:text-cyan-400 transition-colors">Schema Explorer</h3>
                                </div>
                                <p className="text-xs text-slate-400 mb-4">Explore data schemas and metric definitions.</p>
                            </div>
                            <button className="w-full py-2 bg-slate-800 hover:bg-cyan-600 text-white rounded-lg font-medium text-xs flex items-center justify-center transition-colors">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 2: Model Intelligence */}
                        <div className="bg-slate-900/50 shadow-xl border border-slate-800/50 rounded-xl p-4 cursor-not-allowed flex flex-col justify-between h-full opacity-60">
                            <div>
                                <div className="flex items-center mb-2">
                                    <Zap className="h-5 w-5 text-slate-500 mr-2" />
                                    <h3 className="text-base font-semibold text-slate-500">Model Intelligence</h3>
                                    <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-500 rounded font-mono">SOON</span>
                                </div>
                                <p className="text-xs text-slate-600 mb-4">Advanced analytics and model performance insights.</p>
                            </div>
                            <button className="w-full py-2 bg-slate-800/50 text-slate-600 rounded-lg font-medium text-xs flex items-center justify-center border border-slate-700/30 cursor-not-allowed">
                                Coming soon
                            </button>
                        </div>

                        {/* Card 3: Value Analysis */}
                        <div className="bg-slate-900/50 shadow-xl border border-slate-800/50 rounded-xl p-4 cursor-not-allowed flex flex-col justify-between h-full opacity-60">
                            <div>
                                <div className="flex items-center mb-2">
                                    <TrendingUp className="h-5 w-5 text-slate-500 mr-2" />
                                    <h3 className="text-base font-semibold text-slate-500">Value Analysis</h3>
                                    <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-500 rounded font-mono">SOON</span>
                                </div>
                                <p className="text-xs text-slate-600 mb-4">Cost vs performance optimization reports.</p>
                            </div>
                            <button className="w-full py-2 bg-slate-800/50 text-slate-600 rounded-lg font-medium text-xs flex items-center justify-center border border-slate-700/30 cursor-not-allowed">
                                Coming soon
                            </button>
                        </div>
                    </div>
                </section>
                
                {/* Section: Utility Suite */}
                <section className="mb-20 w-full max-w-4xl">
                    <h2 className="text-2xl font-bold mb-2 text-center text-slate-100">
                          Utility Suite
                    </h2>
                    <p className="text-sm text-slate-500 text-center mb-8">Access specialized tools for deeper analysis and schema browsing.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                        {/* Card 1: Benchmark Browser */}
                        <div 
                            onClick={() => onNavigate('advanced')}
                            className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-4 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                <div className="flex items-center mb-2">
                                    <BarChart2 className="h-5 w-5 text-cyan-400 mr-2" />
                                    <h3 className="text-base font-semibold text-slate-100 group-hover:text-cyan-400 transition-colors">Benchmark Browser</h3>
                                </div>
                                <p className="text-xs text-slate-400 mb-4">Browse and compare benchmark results across runs.</p>
                            </div>
                            <button className="w-full py-2 bg-slate-800 hover:bg-cyan-600 text-white rounded-lg font-medium text-xs flex items-center justify-center transition-colors">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 4: Schema Explorer */}
                        <div 
                            onClick={() => onNavigate('schema-explorer')}
                            className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-4 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                <div className="flex items-center mb-2">
                                    <FileCode className="h-5 w-5 text-cyan-400 mr-2" />
                                    <h3 className="text-base font-semibold text-slate-100 group-hover:text-cyan-400 transition-colors">Schema Explorer</h3>
                                </div>
                                <p className="text-xs text-slate-400 mb-4">Explore data schemas and metric definitions.</p>
                            </div>
                            <button className="w-full py-2 bg-slate-800 hover:bg-cyan-600 text-white rounded-lg font-medium text-xs flex items-center justify-center transition-colors">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 2: Model Intelligence */}
                        <div className="bg-slate-900/50 shadow-xl border border-slate-800/50 rounded-xl p-4 cursor-not-allowed flex flex-col justify-between h-full opacity-60">
                            <div>
                                <div className="flex items-center mb-2">
                                    <Zap className="h-5 w-5 text-slate-500 mr-2" />
                                    <h3 className="text-base font-semibold text-slate-500">Model Intelligence</h3>
                                    <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-500 rounded font-mono">SOON</span>
                                </div>
                                <p className="text-xs text-slate-600 mb-4">Advanced analytics and model performance insights.</p>
                            </div>
                            <button className="w-full py-2 bg-slate-800/50 text-slate-600 rounded-lg font-medium text-xs flex items-center justify-center border border-slate-700/30 cursor-not-allowed">
                                Coming soon
                            </button>
                        </div>

                        {/* Card 3: Value Analysis */}
                        <div className="bg-slate-900/50 shadow-xl border border-slate-800/50 rounded-xl p-4 cursor-not-allowed flex flex-col justify-between h-full opacity-60">
                            <div>
                                <div className="flex items-center mb-2">
                                    <TrendingUp className="h-5 w-5 text-slate-500 mr-2" />
                                    <h3 className="text-base font-semibold text-slate-500">Value Analysis</h3>
                                    <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-500 rounded font-mono">SOON</span>
                                </div>
                                <p className="text-xs text-slate-600 mb-4">Cost vs performance optimization reports.</p>
                            </div>
                            <button className="w-full py-2 bg-slate-800/50 text-slate-600 rounded-lg font-medium text-xs flex items-center justify-center border border-slate-700/30 cursor-not-allowed">
                                Coming soon
                            </button>
                        </div>
                    </div>
                </section>

                {/* Section: Who is it for? (Aligned with SKILL.md) */}
                <section className="mb-20 w-full max-w-4xl">
                     <h2 className="text-2xl font-bold mb-2 text-center text-slate-100">
                          Who is it for?
                     </h2>
                     <p className="text-sm text-slate-500 text-center mb-8">Discover how different roles find value in Prism's performance tracking.</p>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-8 hover:shadow-2xl transition-all cursor-default h-full flex flex-col">
                             <div className="flex items-center mb-4">
                                 <TrendingUp className="h-6 w-6 text-blue-500 mr-2" />
                                 <h3 className="text-xl font-semibold text-slate-100">Feature developers</h3>
                             </div>
                             <p className="text-sm text-slate-400 mb-6 flex-1">
                                Validate model performance deltas and share reproducible recipes.
                             </p>
                             <ul className="text-sm space-y-3 text-slate-300">
                                <li className="flex items-start"><CheckCircle className="h-4 w-4 text-blue-500 mr-2 mt-0.5 flex-shrink-0" /> Automate pricing vs. performance goals</li>
                                <li className="flex items-start"><CheckCircle className="h-4 w-4 text-blue-500 mr-2 mt-0.5 flex-shrink-0" /> Distinct unit vs. system benchmark suites</li>
                                <li className="flex items-start"><CheckCircle className="h-4 w-4 text-blue-500 mr-2 mt-0.5 flex-shrink-0" /> Reproducible shareable benchmark run sets</li>
                             </ul>
                         </div>
                         <div className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-8 hover:shadow-2xl transition-all cursor-default h-full flex flex-col">
                             <div className="flex items-center mb-4">
                                 <Server className="h-6 w-6 text-blue-500 mr-2" />
                                 <h3 className="text-xl font-semibold text-slate-100">Stack operators</h3>
                             </div>
                             <p className="text-sm text-slate-400 mb-6 flex-1">
                                Priorities production stability, regression tracking, and well-lit infra runs.
                             </p>
                             <ul className="text-sm space-y-3 text-slate-300">
                                <li className="flex items-start"><CheckCircle className="h-4 w-4 text-blue-500 mr-2 mt-0.5 flex-shrink-0" /> Compare deployments vs. historical baselines</li>
                                <li className="flex items-start"><CheckCircle className="h-4 w-4 text-blue-500 mr-2 mt-0.5 flex-shrink-0" /> Execute regular stress telemetry tests</li>
                                <li className="flex items-start"><CheckCircle className="h-4 w-4 text-blue-500 mr-2 mt-0.5 flex-shrink-0" /> Reduce wasted GPU spend footprints</li>
                             </ul>
                         </div>
                     </div>
                </section>

                {/* Section: How it works */}
                <section className="mb-20 w-full max-w-4xl">
                     <h2 className="text-2xl font-bold mb-2 text-center text-slate-100">
                          How it works
                     </h2>
                     <p className="text-sm text-slate-500 text-center mb-12">Understanding the dynamic scanning and normalization lifecycle.</p>
                     <div className="space-y-12 relative before:absolute before:left-6 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-cyan-500 before:to-cyan-500/20">
                         {/* Step 1 */}
                         <div className="relative pl-16 flex flex-col justify-center min-h-[5rem] group/step">
                              <div className="absolute left-6 -translate-x-1/2 flex items-center justify-center z-10 w-12 h-12 bg-slate-950 border-2 border-cyan-500/30 rounded-full shadow-sm group-hover/step:border-cyan-500/50 group-hover/step:shadow-md transition-all">
                                  <Server className="h-5 w-5 text-cyan-400 group-hover/step:text-cyan-300 transition-colors" />
                              </div>
                              <div className="p-5 rounded-xl bg-gradient-to-r from-cyan-500/10 to-transparent flex-1 flex flex-col justify-center border-l-2 border-cyan-500/40 group-hover/step:border-cyan-500/60 transition-all">
                                  <h4 className="text-lg font-bold mb-1 text-cyan-400 transition-colors">1. GCS bucket scanning</h4>
                                  <p className="text-sm text-slate-400">
                                      Prism monitors benchmarks dynamically. Standardized reports are tracked automatically sans manual imports.
                                  </p>
                              </div>
                         </div>

                         {/* Step 2 */}
                         <div className="relative pl-16 flex flex-col justify-center min-h-[5rem] group/step">
                              <div className="absolute left-6 -translate-x-1/2 flex items-center justify-center z-10 w-12 h-12 bg-slate-950 border-2 border-cyan-500/30 rounded-full shadow-sm group-hover/step:border-cyan-500/50 group-hover/step:shadow-md transition-all">
                                  <BarChart2 className="h-5 w-5 text-cyan-400 group-hover/step:text-cyan-300 transition-colors" />
                              </div>
                              <div className="p-5 rounded-xl bg-gradient-to-r from-cyan-500/10 to-transparent flex-1 flex flex-col justify-center border-l-2 border-cyan-500/40 group-hover/step:border-cyan-500/60 transition-all">
                                  <h4 className="text-lg font-bold mb-1 text-cyan-400 transition-colors">2. Normalization & comparison</h4>
                                  <p className="text-sm text-slate-400">
                                      Metric definitions are aligned. Hardware types are unified. Compare vs historical baselines.
                                  </p>
                              </div>
                         </div>

                         {/* Step 3 */}
                         <div className="relative pl-16 flex flex-col justify-center min-h-[5rem] group/step">
                              <div className="absolute left-6 -translate-x-1/2 flex items-center justify-center z-10 w-12 h-12 bg-slate-950 border-2 border-cyan-500/30 rounded-full shadow-sm group-hover/step:border-cyan-500/50 group-hover/step:shadow-md transition-all">
                                  <CheckCircle className="h-5 w-5 text-cyan-400 group-hover/step:text-cyan-300 transition-colors" />
                              </div>
                              <div className="p-5 rounded-xl bg-gradient-to-r from-cyan-500/10 to-transparent flex-1 flex flex-col justify-center border-l-2 border-cyan-500/40 group-hover/step:border-cyan-500/60 transition-all">
                                  <h4 className="text-lg font-bold mb-1 text-cyan-400 transition-colors">3. Reproduce & upgrade</h4>
                                  <p className="text-sm text-slate-400">
                                      Select standard benchmarks comparing challenger vs. baseline. One-click export Helm upgrade definitions.
                                  </p>
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
