import React, { useState, useEffect } from 'react';
import { 
    Home, 
    BarChart2, 
    Route, 
    Compass, 
    Database, 
    Lightbulb, 
    Layers,
    Split,
    Brain,
    DollarSign,
    FileCode
} from 'lucide-react';

const MENU_GROUPS = [
    {
        items: [
            { id: 'home', label: 'Home', icon: Home, view: 'home' }
        ]
    },
    {
        title: "Well-Lit Paths",
        items: [
            { id: 'inference-scheduling', label: 'Inference Scheduling', icon: Route, view: 'inference-scheduling' },
            { id: 'pd-disaggregation', label: 'P/D Disaggregation', icon: Split, view: 'pd-disaggregation', disabled: true },
            { id: 'wide-ep', label: 'Wide-EP', icon: Brain, view: 'wide-ep', disabled: true }
        ]
    },
    {
        title: "Utility Suite",
        items: [
            { id: 'benchmark-browser', label: 'Benchmark Browser', icon: BarChart2, view: 'advanced' },
            { id: 'schema-browser', label: 'Schema Explorer', icon: FileCode, view: 'schema-explorer', disabled: false },
            { id: 'model-intelligence', label: 'Model Intelligence', icon: Lightbulb, view: 'model-intelligence', disabled: true },
            { id: 'value-analysis', label: 'Value Analysis', icon: DollarSign, view: 'value-analysis', disabled: true }
        ]
    }
];

export default function LeftNavigation({ currentView, onNavigate }) {
    const [isExpanded, setIsExpanded] = useState(() => {
        const saved = localStorage.getItem('prism_sidebar_expanded');
        return saved !== null ? saved === 'true' : true;
    });

    useEffect(() => {
        localStorage.setItem('prism_sidebar_expanded', isExpanded);
    }, [isExpanded]);

    const handleItemClick = (view, disabled) => {
        if (!isExpanded) {
            setIsExpanded(true);
        } else if (!disabled) {
            onNavigate(view);
            setIsExpanded(false);
        }
    };

    return (
        <aside className={`fixed top-20 left-4 h-[calc(100vh-6rem)] flex flex-col border border-slate-800/80 bg-slate-900/80 backdrop-blur-xl rounded-2xl transition-all duration-300 z-50 shadow-2xl ${isExpanded ? 'w-80' : 'w-20'}`}>

            {/* Navigation Items */}
            <div className="flex-1 overflow-y-auto overflow-x-visible py-6 flex flex-col gap-8 px-3 no-scrollbar">
                {MENU_GROUPS.map((group, gIdx) => (
                    <div key={gIdx} className="flex flex-col gap-1">
                        {/* Group Header with Stable Vertical Footprint */}
                        {group.title && (
                            <span className="relative text-xs text-slate-500 uppercase tracking-widest px-3 mb-2 font-normal h-4 flex items-center">
                                {isExpanded ? group.title : <div className="absolute left-[10px] w-[36px] h-[1px] bg-slate-700 shrink-0" />}
                            </span>
                        )}

                        {group.items.map((item) => {
                            const Icon = item.icon;
                            const isActive = currentView === item.view;

                            return (
                                <button
                                    key={item.id}
                                    onClick={() => handleItemClick(item.view, item.disabled)}
                                    aria-disabled={item.disabled}
                                    title={!isExpanded ? item.label : undefined}
                                    className={`group relative flex items-center gap-4 px-3 py-2.5 rounded-xl transition-all w-full text-left font-normal ${
                                        isActive 
                                            ? 'bg-cyan-600/15 text-cyan-300' 
                                            : item.disabled 
                                                ? 'text-slate-400 opacity-80 cursor-not-allowed' 
                                                : 'text-slate-300 hover:bg-slate-800/50 hover:text-white cursor-pointer'
                                    }`}
                                >
                                    {/* Active Side Indicator */}
                                    {isActive && (
                                        <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-cyan-500 shadow-md" />
                                    )}

                                    <div className={`p-1.5 rounded-lg transition-colors ${isActive ? 'bg-cyan-600 text-white shadow' : 'bg-transparent text-slate-400 group-hover:text-slate-200'}`}>
                                        <Icon className="w-5 h-5 shrink-0" />
                                    </div>

                                    {isExpanded && (
                                        <div className="flex flex-1 items-center justify-between truncate">
                                            <span className={`text-sm tracking-wide truncate ${isActive ? 'text-white font-medium' : 'font-normal'}`}>
                                                {item.label}
                                            </span>

                                            {item.disabled && (
                                                <span className="text-[9px] text-slate-400 font-mono px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 shrink-0 tracking-wider">
                                                    COMING SOON
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Tooltip when Collapsed */}
                                    {!isExpanded && (
                                        <div className="absolute left-16 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-800 border border-slate-700/80 text-white text-xs font-medium rounded-lg invisible group-hover:visible shadow-xl z-[99999] whitespace-nowrap flex items-center gap-2">
                                            {item.label}
                                            {item.disabled && <span className="text-[10px] text-slate-400 font-mono">(Coming Soon)</span>}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Fixed Bottom-Left Toggle */}
            <div className="mt-auto border-t border-slate-800/60 px-3 py-3 flex items-center justify-start bg-slate-900/40 shrink-0">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="px-2.5 py-1.5 rounded font-mono text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all flex items-center justify-center cursor-pointer text-xs font-bold border border-transparent hover:border-slate-700/60"
                    title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
                >
                    {isExpanded ? "<|" : "|>"}
                </button>
            </div>
        </aside>
    );
}
