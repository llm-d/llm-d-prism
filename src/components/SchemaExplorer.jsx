import React from 'react';
import { ArrowLeft, MessageCircle, Share2 } from 'lucide-react';
import { Button } from './ui';

const SchemaExplorer = ({ onNavigateBack }) => {
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
                        <span className="text-lg font-bold tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 select-none inline-block pl-0.5 py-0.5">
                            Prism
                        </span>
                    </div>

                    <div className="flex items-center">
                        <h1 className="text-sm font-semibold text-slate-200 tracking-wide select-none">Schema Explorer</h1>
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
                    <Button
                        variant="secondary"
                        size="sm"
                        className="relative"
                        disabled
                    >
                        <Share2 className="w-4 h-4" /> Share view
                    </Button>
                </div>
            </header>

            <main className="w-full px-8 py-6 pl-28 flex flex-col relative w-full h-[calc(100vh-4rem)]">
                <iframe 
                    src="https://benchmark-schema-explorer-369234493812.us-central1.run.app" 
                    className="w-full h-full border-0" 
                    title="Schema Explorer"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                />
            </main>
        </div>
    );
};

export default SchemaExplorer;
