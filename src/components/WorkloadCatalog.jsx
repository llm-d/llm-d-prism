import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, MessageCircle, Share2 } from 'lucide-react';

const WorkloadCatalog = ({ onNavigateBack }) => {
    const [copied, setCopied] = useState(false);

    // Compute the initial iframe source on mount only to prevent reloading the iframe on parent re-renders.
    const iframeSrc = useMemo(() => {
        const queryParams = new URLSearchParams(window.location.search);
        const workload = queryParams.get('workload') || '';
        const initialPath = workload ? `/workloads/${workload}` : '';
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const useLocalCatalog = isLocal && (
            import.meta.env.VITE_USE_LOCAL_WORKLOAD_CATALOG === 'true' ||
            queryParams.get('local_catalog') === 'true'
        );
        const baseUrl = useLocalCatalog 
            ? 'http://localhost:5174'
            : 'https://workload-catalog-app-369234493812.us-central1.run.app';
        return `${baseUrl}${initialPath}`;
    }, []);

    useEffect(() => {
        const handleMessage = (event) => {
            if (event.data && event.data.type === 'workload-catalog-navigate') {
                const path = event.data.path;
                const params = new URLSearchParams(window.location.search);
                if (path && path.startsWith('/workloads/')) {
                    const workloadId = path.replace('/workloads/', '').trim().toLowerCase().replace(/\s+/g, '-');
                    params.set('workload', workloadId);
                } else {
                    params.delete('workload');
                }
                window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch((err) => {
                console.error('Failed to copy link: ', err);
            });
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center pt-16">
            
            {/* Top Navigation Bar - Fully Fixed for 100% Scroll Independence */}
            <header className="w-full h-16 border-b border-slate-900/65 flex justify-between items-center px-6 bg-slate-950/20 backdrop-blur-md fixed top-0 left-0 right-0 z-[49]">
                <div className="flex items-center gap-4">
                    {onNavigateBack && (
                        <button onClick={onNavigateBack} className="p-1.5 rounded-xl hover:bg-slate-900/60 text-slate-400 hover:text-white transition-colors cursor-pointer border border-transparent hover:border-slate-800/60">
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                    )}
                    
                    {/* Compact Prism Logo & Name */}
                    <div className="flex items-center gap-2.5 border-r border-slate-800 pr-4">
                        <img src="https://llm-d.ai/img/llm-d-logotype-and-icon.png" alt="llm-d Logo" className="h-6 object-contain" />
                        <span className="text-lg font-bold tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 select-none">
                            Prism
                        </span>
                    </div>

                    <div className="flex items-center">
                        <h1 className="text-sm font-semibold text-slate-200 tracking-wide select-none">Workload catalog</h1>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    <a 
                        href="https://llm-d.ai/community" 
                        target="_blank" 
                        rel="noreferrer"
                        className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-300 bg-slate-900/40 hover:bg-slate-900/80 transition-all flex items-center border border-slate-800 hover:border-slate-700 cursor-pointer"
                    >
                        <MessageCircle className="w-4 h-4 mr-2" /> Contact us
                    </a>
                    <button 
                        onClick={handleShare}
                        className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-300 bg-slate-900/40 hover:bg-slate-900/80 transition-all flex items-center border border-slate-800 hover:border-slate-700 relative"
                    >
                        <Share2 className="w-4 h-4 mr-2" /> {copied ? 'Copied!' : 'Share view'}
                    </button>
                </div>
            </header>

            <main className="w-full px-8 py-6 pl-28 flex flex-col relative w-full h-[calc(100vh-4rem)]">
                <iframe 
                    src={iframeSrc} 
                    className="w-full h-full border-0" 
                    title="Workload catalog"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                />
            </main>
        </div>
    );
};

export default WorkloadCatalog;

