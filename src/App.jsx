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

import { useState, useRef, useEffect } from 'react';
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

  const { fetchConfig, loadAllData, enableLLMDResults, loading, isRestoringConnections, gcsProfiles, gcsProgressStats } = dashboardData;
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
  const shouldShowLoading = activeLoading && !bypassLoading && (currentView === 'benchmark-browser' || currentView === 'results-store');

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-950 w-full overflow-hidden font-sans relative flex flex-col">
        <LeftNavigation currentView={currentView} onNavigate={handleNavigate} isMobileOpen={isMobileNavOpen} />
        <main ref={mainRef} className="flex-1 overflow-y-auto flex flex-col relative w-full h-screen">
          {shouldShowLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-100 transition-colors space-y-6 pl-28">
              <Loader className="animate-spin text-blue-500" size={40} />
              <div className="text-center space-y-2">
                <div className="text-lg font-semibold text-slate-200">
                  Loading Benchmark Data...
                </div>
                {gcsProgressStats && gcsProgressStats.total > 0 && (
                  <div className="space-y-2 pt-1 animate-in fade-in duration-300">
                    <div className="text-xs text-slate-400 font-mono">
                      Fetched {gcsProgressStats.loaded} of {gcsProgressStats.total} files
                    </div>
                    {/* Progress Bar Container */}
                    <div className="w-56 h-1 bg-slate-800 rounded-full overflow-hidden mx-auto border border-slate-900">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-300 rounded-full" 
                        style={{ width: `${(gcsProgressStats.loaded / gcsProgressStats.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => setBypassLoading(true)}
                className="text-xs text-slate-500 hover:text-slate-300 underline transition-colors"
              >
                Skip Waiting (Data may successfully arrive later)
              </button>
            </div>
          ) : (
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
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App;

