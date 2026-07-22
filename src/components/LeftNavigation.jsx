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
    FileCode,
    Activity,
    TrendingUp,
    Zap,
    Settings,
    Library,
    Blocks,
    Server
} from 'lucide-react';
import { cn } from '../utils/cn';

const MENU_GROUPS = [
    {
        items: [
            { id: 'home', label: 'Home', icon: Home, view: 'home' }
        ]
    },
    {
        title: "Well-lit paths",
        items: [
            { id: 'inference-scheduling', label: 'Intelligent routing', icon: Route, view: 'inference-scheduling' },
            { id: 'prefix-cache-offloading', label: 'Prefix cache offloading', icon: Database, view: 'prefix-cache-offloading' },
            { id: 'pd-disaggregation', label: 'Prefill/decode disagg', icon: Split, view: 'pd-disaggregation', disabled: true },
            { id: 'wide-ep', label: 'Wide expert parallelism', icon: Brain, view: 'wide-ep', disabled: true },
            { id: 'agentic-serving', label: 'Agentic serving', icon: Compass, view: 'agentic-serving', separator: true }
        ]
    },
    {
        title: "Utility suite",
        items: [
            { id: 'results-store', label: 'Results store', icon: Server, view: 'results-store' },
            { id: 'workload-catalog', label: 'Workload catalog', icon: Blocks, view: 'workload-catalog', disabled: false },
            { id: 'regressions-analysis', label: 'Regressions & analysis', icon: Activity, view: 'regressions-analysis' },
            { id: 'benchmark-browser', label: 'Benchmark browser', icon: BarChart2, view: 'benchmark-browser' },
            { id: 'schema-browser', label: 'Schema explorer', icon: FileCode, view: 'schema-explorer', disabled: false },
            { id: 'value-analysis', label: 'Value analysis', icon: TrendingUp, view: 'value-analysis', disabled: true }
        ]
    }
];

const ITEM_THEMES = {
    'home': {
        activeBg: 'bg-gradient-to-r from-slate-900/10 via-slate-800/10 to-slate-950/20 border-slate-700/30 text-slate-200',
        activeIcon: 'bg-gradient-to-br from-slate-500 to-slate-600 text-white shadow-[0_0_15px_rgba(148,163,184,0.35)]',
        indicator: 'bg-gradient-to-b from-slate-400 to-slate-500 shadow-[0_0_8px_rgba(148,163,184,0.6)]'
    },
    'inference-scheduling': {
        activeBg: 'bg-gradient-to-r from-cyan-950/20 via-blue-950/10 to-slate-950/20 border-cyan-500/20 text-cyan-300',
        activeIcon: 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.35)]',
        indicator: 'bg-gradient-to-b from-cyan-400 to-blue-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]'
    },
    'pd-disaggregation': {
        activeBg: 'bg-gradient-to-r from-violet-950/20 via-purple-950/10 to-slate-950/20 border-violet-500/20 text-violet-300',
        activeIcon: 'bg-gradient-to-br from-violet-500 to-purple-500 text-white shadow-[0_0_15px_rgba(139,92,246,0.35)]',
        indicator: 'bg-gradient-to-b from-violet-400 to-purple-500 shadow-[0_0_8px_rgba(139,92,246,0.6)]'
    },
    'agentic-serving': {
        activeBg: 'bg-gradient-to-r from-emerald-950/20 via-teal-950/10 to-slate-950/20 border-emerald-500/20 text-emerald-300',
        activeIcon: 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.35)]',
        indicator: 'bg-gradient-to-b from-emerald-400 to-teal-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
    },
    'workload-catalog': {
        activeBg: 'bg-gradient-to-r from-cyan-950/20 via-blue-950/10 to-slate-950/20 border-cyan-500/20 text-cyan-300',
        activeIcon: 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.35)]',
        indicator: 'bg-gradient-to-b from-cyan-400 to-blue-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]'
    },
    'regressions-analysis': {
        activeBg: 'bg-gradient-to-r from-rose-950/20 via-red-950/10 to-slate-950/20 border-rose-500/20 text-rose-300',
        activeIcon: 'bg-gradient-to-br from-rose-500 to-red-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.35)]',
        indicator: 'bg-gradient-to-b from-rose-400 to-red-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]'
    },
    'benchmark-browser': {
        activeBg: 'bg-gradient-to-r from-amber-950/20 via-orange-950/10 to-slate-950/20 border-amber-500/20 text-amber-300',
        activeIcon: 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.35)]',
        indicator: 'bg-gradient-to-b from-amber-400 to-orange-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
    },
    'schema-explorer': {
        activeBg: 'bg-gradient-to-r from-purple-950/20 via-violet-950/10 to-slate-950/20 border-purple-500/20 text-purple-300',
        activeIcon: 'bg-gradient-to-br from-purple-500 to-violet-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]',
        indicator: 'bg-gradient-to-b from-purple-400 to-violet-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]'
    },
    'results-store': {
        activeBg: 'bg-gradient-to-r from-emerald-950/20 via-teal-950/10 to-slate-950/20 border-emerald-500/20 text-emerald-300',
        activeIcon: 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.35)]',
        indicator: 'bg-gradient-to-b from-emerald-400 to-teal-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
    }
};

export default function LeftNavigation({ currentView, onNavigate, isMobileOpen }) {
    const [isExpanded, setIsExpanded] = useState(() => {
        const saved = localStorage.getItem('prism_sidebar_expanded');
        return saved !== null ? saved === 'true' : false;
    });

    useEffect(() => {
        localStorage.setItem('prism_sidebar_expanded', isExpanded);
    }, [isExpanded]);

    const handleItemClick = (view, disabled) => {
        if (!disabled) {
            onNavigate(view);
        }
    };

    const visibleGroups = MENU_GROUPS.map(group => ({
        ...group,
        items: group.items.filter(item => !item.disabled)
    })).filter(group => group.items.length > 0);

    return (
        <aside className={cn(
            'fixed top-20 left-4 h-[calc(100vh-6rem)]',
            isMobileOpen ? 'flex' : 'hidden md:flex',
            'flex-col border border-slate-900/65 bg-slate-950/50 backdrop-blur-xl rounded-3xl transition-all duration-300 z-50 shadow-[0_20px_50px_rgba(0,0,0,0.5)]',
            isExpanded ? 'w-80' : 'w-20'
        )}>



            {/* Navigation Items */}
            <div className="flex-1 overflow-y-auto overflow-x-visible py-6 flex flex-col gap-8 px-3 no-scrollbar">
                {visibleGroups.map((group, gIdx) => (
                    <div key={gIdx} className="flex flex-col gap-1">
                        {/* Group Header with Stable Vertical Footprint */}
                        {group.title && (
                            <span className="relative text-[10px] text-slate-500 uppercase tracking-widest px-3 mb-2.5 font-bold h-4 flex items-center">
                                {isExpanded ? group.title : (gIdx > 0 ? <div className="absolute left-[10px] w-[36px] h-[1px] bg-slate-800/80 shrink-0" /> : null)}
                            </span>
                        )}

                        {group.items.map((item) => {
                            const Icon = item.icon;
                            const isActive = currentView === item.view;

                            return (
                                <React.Fragment key={item.id}>
                                    {item.separator && (
                                        <div className="my-2 border-t border-slate-900/60 mx-3" />
                                    )}
                                    <button
                                        onClick={() => handleItemClick(item.view, item.disabled)}
                                        aria-disabled={item.disabled}
                                        title={!isExpanded ? item.label : undefined}
                                        className={cn(
                                            'group relative flex items-center gap-4 px-3 py-2.5 rounded-2xl transition-all duration-300 w-full text-left font-normal border',
                                            isActive
                                                ? (ITEM_THEMES[item.view]?.activeBg || 'bg-gradient-to-r from-cyan-950/20 via-blue-950/10 to-slate-950/20 border-cyan-500/20 text-cyan-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]')
                                                : 'border-transparent text-slate-400 hover:bg-slate-900/30 hover:text-white cursor-pointer'
                                        )}
                                    >
                                        {/* Active Side Indicator */}
                                        {isActive && (
                                            <div className={cn('absolute left-1 top-3.5 bottom-3.5 w-1 rounded-full', ITEM_THEMES[item.view]?.indicator || 'bg-gradient-to-b from-cyan-400 to-blue-500')} />
                                        )}

                                        <div className={cn(
                                            'p-1.5 rounded-xl transition-all duration-300',
                                            isActive
                                                ? (ITEM_THEMES[item.view]?.activeIcon || 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.35)]')
                                                : 'bg-transparent text-slate-400 group-hover:text-slate-200'
                                        )}>
                                            <Icon className="w-5 h-5 shrink-0" />
                                        </div>

                                        {isExpanded && (
                                            <div className="flex flex-1 items-center justify-between truncate">
                                                <span className={cn('text-sm tracking-wide truncate', isActive ? 'text-white font-medium' : 'font-normal')}>
                                                    {item.label}
                                                </span>

                                                {item.disabled && (
                                                    <span className="text-[9px] text-slate-500 font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-900/80 shrink-0 tracking-wider">
                                                        Coming soon
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* Tooltip when Collapsed */}
                                        {!isExpanded && (
                                            <div className="absolute left-16 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-900 border border-slate-800/60 text-white text-xs font-medium rounded-lg invisible group-hover:visible shadow-xl z-[99999] whitespace-nowrap flex items-center gap-2">
                                                {item.label}
                                                {item.disabled && <span className="text-[10px] text-slate-500 font-mono">(Coming soon)</span>}
                                            </div>
                                        )}
                                    </button>
                                </React.Fragment>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Fixed Bottom-Left Toggle */}
            <div className="mt-auto border-t border-slate-900/65 px-4 py-4 flex items-center justify-start bg-slate-950/20 shrink-0 rounded-b-3xl">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="h-8 w-8 rounded-xl font-mono text-slate-500 hover:text-white hover:bg-slate-900/50 transition-all flex items-center justify-center cursor-pointer text-xs font-bold border border-slate-900/60 hover:border-slate-800/65"
                    title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
                >
                    {isExpanded ? "<|" : "|>"}
                </button>
            </div>
        </aside>
    );
}
