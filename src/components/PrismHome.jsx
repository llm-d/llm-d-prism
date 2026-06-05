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



                {/* Section: Well-lit paths (UX Clarity) */}
                <section className="mb-20 w-full">
                    <h2 className="text-2xl font-bold mb-2 text-center text-slate-100">
                          Select a well-lit path to begin
                     </h2>
                     <p className="text-xs text-slate-500 text-center mb-6">Standardized workloads optimized for rapid evaluation and deployment.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                        {/* Path 1: Intelligent Routing (Primary M1 Path - Popping) */}
                        <div 
                            onClick={() => onNavigate('intelligent-routing')}
                            className="group relative bg-slate-900/80 backdrop-blur-xl shadow-2xl border-2 border-cyan-500 rounded-2xl p-5 hover:-translate-y-2 hover:shadow-[0_0_30px_rgba(34,211,238,0.3)] transition-all duration-500 cursor-pointer flex flex-col h-full overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 text-xs px-2.5 py-1 bg-cyan-500 text-white rounded-bl-lg font-mono font-bold tracking-wide shadow-lg">PRIMARY PATH</div>
                            <h3 className="text-lg font-bold mb-2 text-white group-hover:text-cyan-400 transition-colors">
                                Intelligent Routing
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 w-full">
                        {/* Card 1: Benchmark Browser */}
                        <div 
                            onClick={() => onNavigate('benchmark-browser')}
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

                        {/* Card 2: Regressions Analysis */}
                        <div 
                            onClick={() => onNavigate('regressions-analysis')}
                            className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-4 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                <div className="flex items-center mb-2">
                                    <Activity className="h-5 w-5 text-cyan-400 mr-2" />
                                    <h3 className="text-base font-semibold text-slate-100 group-hover:text-cyan-400 transition-colors">Regressions Analysis</h3>
                                </div>
                                <p className="text-xs text-slate-400 mb-4">Scan Nightly GCS reports and catch performance regressions.</p>
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

                        {/* Card 2: Workload Catalog */}
                        <div 
                            onClick={() => onNavigate('workload-catalog')}
                            className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-4 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                <div className="flex items-center mb-2">
                                    <Zap className="h-5 w-5 text-cyan-400 mr-2" />
                                    <h3 className="text-base font-semibold text-slate-100 group-hover:text-cyan-400 transition-colors">Workload Catalog</h3>
                                </div>
                                <p className="text-xs text-slate-400 mb-4">Explore standardized workloads for evaluation.</p>
                            </div>
                            <button className="w-full py-2 bg-slate-800 hover:bg-cyan-600 text-white rounded-lg font-medium text-xs flex items-center justify-center transition-colors">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
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
                



                {/* Section: How it works */}
                <section className="mb-20 w-full max-w-6xl mx-auto pl-20">
                     <h2 className="text-3xl font-bold mb-2 text-center text-slate-100">
                          How it works: The Full Benchmark Lifecycle
                     </h2>
                     <p className="text-sm text-slate-400 text-center mb-12 max-w-2xl mx-auto">
                         Designed for human insight and agent automation. Standardizing the end-to-end lifecycle from routing optimization to high-fidelity reproduction.
                     </p>
                     
                     <div className="flex flex-col md:flex-row gap-4 justify-between items-center relative mb-6">
                         
                         {/* Ambient glowing background in center */}
                         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

                         {/* Left Column: Roles & Actions */}
                         <div className="w-full md:w-1/3 space-y-3 flex flex-col items-center md:items-end">
                             <div className="w-full max-w-[320px] text-center text-xs font-extrabold text-cyan-400/90 uppercase tracking-widest mb-2">User & Agent Roles</div>
                             
                             {/* Feature Developer */}
                             <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl p-3 w-full max-w-[320px] hover:border-cyan-500/30 transition-all group">
                                 <div className="mb-2">
                                     <h4 className="text-sm font-bold text-white">Feature Developer</h4>
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
                                     <h4 className="text-sm font-bold text-white">Benchmark Developer</h4>
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
                              <a 
                                  href="https://github.com/llm-d/llm-d-benchmark/tree/main/llmdbenchmark/result_store"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl p-3 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-blue-500/50 transition-all cursor-pointer"
                              >
                                  <h4 className="text-sm font-bold text-blue-400 mb-0.5 flex items-center justify-center gap-1">
                                      llm-d Results Store
                                      <Link className="h-3 w-3 text-blue-400 group-hover:scale-110 transition-transform" />
                                  </h4>
                                  <p className="text-sm text-slate-400">Scalable OSS store for unified schema results.</p>
                              </a>

                             {/* Standard Benchmark Format / Report */}
                             <a 
                                 href="https://github.com/llm-d/llm-d-benchmark/blob/main/llmdbenchmark/analysis/benchmark_report/README.md"
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-xl p-2 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-cyan-500/50 transition-all cursor-pointer"
                             >
                                 <h4 className="text-sm font-bold text-cyan-400 mb-0.5 flex items-center justify-center gap-1">
                                     Standard Benchmark Report
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
                                     Test Harness
                                     <Link className="h-3 w-3 text-cyan-400 group-hover:scale-110 transition-transform" />
                                 </h4>
                                 <p className="text-sm text-slate-400">Stress distributed systems with agentic workloads.</p>
                             </a>

                             {/* Real World Workload Catalog */}
                             <a 
                                 href="https://github.com/kubernetes-sigs/inference-perf/tree/main/workload-catalog"
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-xl p-2 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-cyan-500/50 transition-all cursor-pointer"
                             >
                                 <h4 className="text-sm font-bold text-cyan-400 mb-0.5 flex items-center justify-center gap-1">
                                     Real World Workload Catalog
                                     <Link className="h-3 w-3 text-cyan-400 group-hover:scale-110 transition-transform" />
                                 </h4>
                                 <p className="text-sm text-slate-400">Access standardized workloads for evaluation.</p>
                             </a>

                         </div>

                         {/* Right Column: Roles & Actions */}
                         <div className="w-full md:w-1/3 space-y-3 flex flex-col items-center lg:items-start">
                             <div className="w-full max-w-[320px] text-center text-xs font-extrabold text-purple-400/90 uppercase tracking-widest mb-2">User & Agent Roles</div>
                             
                             {/* Solutions Architect */}
                             <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl p-3 w-full max-w-[320px] hover:border-purple-500/30 transition-all group">
                                 <div className="mb-2">
                                     <h4 className="text-sm font-bold text-white">Solutions Architect</h4>
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
                                     <h4 className="text-sm font-bold text-white">Stack Operator</h4>
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
