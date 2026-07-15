// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { useState, useRef, useEffect, useMemo } from 'react';
import { Loader, ArrowRight } from 'lucide-react';
import Dashboard from './components/Dashboard';
import ResultsStore from './components/ResultsStore';
import ErrorBoundary from './components/ErrorBoundary';
import PrismHome from './components/PrismHome';
import Milestone1Dashboard from './components/Milestone1Dashboard';
import SchemaExplorer from './components/SchemaExplorer';
import WorkloadCatalog from './components/WorkloadCatalog';
import RegressionsAnalysisDashboard from './components/RegressionsAnalysisDashboard';
import AgenticWorkloadsDashboard from './components/AgenticWorkloadsDashboard';
import PrefixCacheOffloadingDashboard from './components/PrefixCacheOffloadingDashboard';
import SubmitValidationPage from './components/DataConnections/SubmitValidationPage';

import LeftNavigation from './components/LeftNavigation';
import { useDashboardState } from './hooks/useDashboardState';
import { useDashboardData } from './hooks/useDashboardData';

function App() {
  const mainRef = useRef(null);
  const dashboardState = useDashboardState();
  const dashboardData = useDashboardData(dashboardState.initialState, dashboardState);

  const [stagedBundles, setStagedBundles] = useState(() => {
    try {
      const active = localStorage.getItem('prism_active_staged_bundles');
      return active ? JSON.parse(active) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const checkStaged = () => {
      try {
        const active = localStorage.getItem('prism_active_staged_bundles');
        const parsed = active ? JSON.parse(active) : [];
        if (JSON.stringify(parsed) !== JSON.stringify(stagedBundles)) {
          setStagedBundles(parsed);
        }
      } catch {
        // ignore
      }
    };
    const interval = setInterval(checkStaged, 1000);
    return () => clearInterval(interval);
  }, [stagedBundles]);

  const [currentView, setCurrentView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    // Legacy 'benchmark-comparison' deep links land on the Benchmark Browser,
    // where the comparison renders inline once brv02 runs are submitted.
    const view = params.get('view') || 'home';
    if (view === 'benchmark-comparison') return 'benchmark-browser';
    if (view === 'manage-benchmarks') return 'results-store';
    return view;
  });

  const [navigationParams, setNavigationParams] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return { intent: params.get('intent') || null };
  });

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [bypassLoading, setBypassLoading] = useState(false);

  const { fetchConfig, loadAllData, enableLLMDResults, loading, isRestoringConnections, gcsProfiles, loadingTasks } = dashboardData;
  const hasFetchedConfig = useRef(false);

  useEffect(() => {
    const initialize = async () => {
      if (!hasFetchedConfig.current) {
        hasFetchedConfig.current = true;
        const config = await fetchConfig();
        loadAllData(config);
      } else {
        loadAllData();
      }
    };
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableLLMDResults]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.add('dark');
    localStorage.setItem('app-theme', 'dark');
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const view = params.get('view') || 'home';
      if (view === 'benchmark-comparison') {
        setCurrentView('benchmark-browser');
      } else if (view === 'manage-benchmarks') {
        setCurrentView('results-store');
      } else {
        setCurrentView(view);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);


  const handleNavigate = (view, extraParams = {}) => {
    if (currentView !== 'submit-benchmarks') {
      localStorage.setItem('prism_previous_view', currentView);
    }
    setCurrentView(view);
    setIsMobileNavOpen(false); // Close mobile nav on navigation
    
    // Update URL to reflect the current view
    const params = new URLSearchParams(window.location.search);
    params.set('view', view);
    if (view !== 'workload-catalog') {
      params.delete('workload');
    }
    
    const resolvedParams = {};
    if (view === 'submit-benchmarks') {
      if (extraParams && typeof extraParams === 'object' && extraParams.intent) {
        params.set('intent', extraParams.intent);
        resolvedParams.intent = extraParams.intent;
      } else if (typeof extraParams === 'string') {
        params.set('intent', extraParams);
        resolvedParams.intent = extraParams;
      } else {
        params.delete('intent');
        resolvedParams.intent = null;
      }
    } else {
      params.delete('intent');
      resolvedParams.intent = null;
    }
    setNavigationParams(resolvedParams);

    window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`);
    
    // Reset scroll position on navigation
    window.scrollTo(0, 0);
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  };

  const activeLoading = loading || isRestoringConnections || (gcsProfiles && gcsProfiles.some(p => p.loading));

  const { overallProgress, itemsFetched, totalItems, activeSourcesList } = useMemo(() => {
    const tasks = Object.values(loadingTasks || {});
    if (tasks.length === 0) return { overallProgress: 0, itemsFetched: 0, totalItems: 0, activeSourcesList: [] };

    let loaded = 0;
    let total = 0;
    const activeSources = [];

    tasks.forEach(t => {
      if (t.status === 'loading' || t.status === 'pending') {
        loaded += (t.loaded || 0);
        total += (t.total || 0);
        activeSources.push(t.name);
      }
    });

    const progress = total > 0 ? (loaded / total) * 100 : 0;
    return {
      overallProgress: Math.min(Math.max(progress, 0), 100),
      itemsFetched: loaded,
      totalItems: total,
      activeSourcesList: activeSources
    };
  }, [loadingTasks]);

  const showOverlays = activeLoading && !bypassLoading && (currentView === 'benchmark-browser' || currentView === 'results-store');

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-950 w-full overflow-hidden font-sans relative flex flex-col">
        <LeftNavigation currentView={currentView} onNavigate={handleNavigate} isMobileOpen={isMobileNavOpen} />
        <main ref={mainRef} className="flex-1 overflow-y-auto flex flex-col relative w-full h-screen">
          {/* Top Spark Progress Bar */}
          {showOverlays && (
            <div className="fixed top-0 left-0 right-0 h-1 bg-slate-900 z-[9999] pointer-events-none">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400 transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.5)]" 
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          )}

          <>
            {/* Global staged benchmarks banner removed in favor of localized Results Store dashboard alert banner */}
            {currentView === 'home' && <PrismHome onNavigate={handleNavigate} />}
            {currentView === 'inference-scheduling' && <Milestone1Dashboard onNavigateBack={() => handleNavigate('home')} onNavigate={handleNavigate} onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)} dashboardData={dashboardData} />}
            {currentView === 'agentic-serving' && <AgenticWorkloadsDashboard onNavigateBack={() => handleNavigate('home')} onNavigate={handleNavigate} onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)} dashboardData={dashboardData} />}
            {currentView === 'benchmark-browser' && <Dashboard onNavigateBack={() => handleNavigate('home')} onNavigate={handleNavigate} dashboardState={dashboardState} dashboardData={dashboardData} />}
            {currentView === 'results-store' && (
              <ResultsStore 
                onNavigateBack={() => {
                  const prevView = localStorage.getItem('prism_previous_view') || 'benchmark-browser';
                  handleNavigate(prevView);
                }} 
                onNavigate={handleNavigate} 
                dashboardState={dashboardState} 
                dashboardData={dashboardData} 
              />
            )}
            {currentView === 'submit-benchmarks' && (
              <SubmitValidationPage 
                onNavigateBack={() => {
                  const prevView = localStorage.getItem('prism_previous_view') || 'results-store';
                  handleNavigate(prevView);
                }}
                onNavigate={handleNavigate} 
                dashboardState={dashboardState} 
                dashboardData={dashboardData} 
                initialIntent={navigationParams.intent}
              />
            )}
            {currentView === 'schema-explorer' && <SchemaExplorer onNavigateBack={() => handleNavigate('home')} />}
            {currentView === 'workload-catalog' && <WorkloadCatalog onNavigateBack={() => handleNavigate('home')} />}
            {currentView === 'prefix-cache-offloading' && <PrefixCacheOffloadingDashboard onNavigateBack={() => handleNavigate('home')} onNavigate={handleNavigate} onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)} />}
            {currentView === 'regressions-analysis' && <RegressionsAnalysisDashboard onNavigateBack={() => handleNavigate('home')} onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)} />}
            {currentView === 'guided-analysis' && <div className="p-8 text-center text-slate-400 mt-20">Guided Analysis Coming Soon... <button onClick={() => handleNavigate('home')} className="underline ml-2 text-indigo-400">Back</button></div>}
          </>

          {/* Bottom-Right Persistent Status Toast */}
          {showOverlays && (
            <div className="fixed bottom-6 right-6 z-[100] w-96 bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-2xl backdrop-blur-md flex flex-col space-y-3 text-sm select-none border-slate-700/50 animate-in slide-in-from-bottom duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader className="w-4 h-4 animate-spin text-blue-500" />
                  <span className="font-semibold text-slate-200">Fetching {activeSourcesList.length} source{activeSourcesList.length !== 1 ? 's' : ''}</span>
                </div>
                <button
                  onClick={() => setBypassLoading(true)}
                  className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
                >
                  Skip Waiting
                </button>
              </div>
              
              <div className="flex flex-col space-y-1">
                <span className="text-xs text-slate-400 font-medium">Active Sources:</span>
                <div className="text-xs font-mono text-blue-400 bg-slate-950/60 p-2 rounded-lg border border-slate-850 max-h-20 overflow-y-auto break-all flex flex-col gap-1">
                  {activeSourcesList.length > 0 ? (
                    activeSourcesList.map((src, i) => (
                      <div key={i} className="truncate">• {src}</div>
                    ))
                  ) : (
                    <div>Initializing...</div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span>{totalItems > 0 ? `${totalItems - itemsFetched} out of ${totalItems} items left` : 'Discovering items...'}</span>
                <span>{Math.round(overallProgress)}%</span>
              </div>

              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-950">
                <div 
                  className="h-full bg-blue-500 transition-all duration-300 rounded-full" 
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App;

