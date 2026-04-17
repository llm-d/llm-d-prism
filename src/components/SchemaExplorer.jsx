import React from 'react';
import { ArrowLeft, MessageCircle, Share2 } from 'lucide-react';

const SchemaExplorer = ({ onNavigateBack }) => {
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
                        <img src="/favicon.png" alt="Prism Logo" className="h-6 w-6 object-contain drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
                        <span className="text-lg font-bold tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-emerald-600">
                            Prism
                        </span>
                    </div>

                    <div className="flex items-center">
                        <h1 className="text-lg font-bold text-white tracking-wide">Schema Explorer</h1>
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
                        className="px-4 py-2 text-sm font-medium rounded-md text-slate-500 bg-slate-800/50 cursor-not-allowed flex items-center border border-slate-700/50 relative"
                        disabled
                    >
                        <Share2 className="w-4 h-4 mr-2" /> Share view 
                    </button>
                </div>
            </header>

            <main className="w-full px-8 py-6 pl-28 flex flex-col relative w-full h-[calc(100vh-4rem)]">
                <iframe 
                    src="https://my-google-ai-studio-applet-369234493812.us-west1.run.app/" 
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
