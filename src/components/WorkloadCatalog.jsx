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
        const baseUrl = isLocal 
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
            <header className="w-full h-16 border-b border-slate-800 flex justify-between items-center px-6 bg-slate-900 fixed top-0 left-0 right-0 z-[9999]">
                <div className="flex items-center gap-4">
                    {onNavigateBack && (
                        <button onClick={onNavigateBack} className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                    )}
                    
                    {/* Compact Prism Logo & Name */}
                    <div className="flex items-center gap-2.5 border-r border-slate-500 pr-4">
                        <img src="https://llm-d.ai/img/llm-d-logotype-and-icon.png" alt="llm-d Logo" className="h-6 object-contain" />
                        <span className="text-lg font-bold tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">
                            Prism
                        </span>
                    </div>

                    <div className="flex items-center">
                        <h1 className="text-lg font-bold text-white tracking-wide">Workload Catalog</h1>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    <a 
                        href="https://llm-d.ai/docs/community" 
                        target="_blank" 
                        rel="noreferrer"
                        className="px-4 py-2 text-sm font-medium rounded-md text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors flex items-center border border-slate-700"
                    >
                        <MessageCircle className="w-4 h-4 mr-2" /> Contact us
                    </a>
                    <button 
                        onClick={handleShare}
                        className="px-4 py-2 text-sm font-medium rounded-md text-slate-300 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 transition-colors flex items-center border border-slate-700 relative"
                    >
                        <Share2 className="w-4 h-4 mr-2" /> {copied ? 'Copied!' : 'Share view'}
                    </button>
                </div>
            </header>

            <main className="w-full px-8 py-6 pl-28 flex flex-col relative w-full h-[calc(100vh-4rem)]">
                <iframe 
                    src={iframeSrc} 
                    className="w-full h-full border-0" 
                    title="Workload Catalog"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                />
            </main>
        </div>
    );
};

export default WorkloadCatalog;
