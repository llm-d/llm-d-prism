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
import { Loader } from 'lucide-react';
import Dashboard from './components/Dashboard';
import ManageBenchmarks from './components/ManageBenchmarks';
import ErrorBoundary from './components/ErrorBoundary';
import PrismHome from './components/PrismHome';
import Milestone1Dashboard from './components/Milestone1Dashboard';
import SchemaExplorer from './components/SchemaExplorer';
import WorkloadCatalog from './components/WorkloadCatalog';
import RegressionsAnalysisDashboard from './components/RegressionsAnalysisDashboard';
import AgenticWorkloadsDashboard from './components/AgenticWorkloadsDashboard';

import LeftNavigation from './components/LeftNavigation';
import { useDashboardState } from './hooks/useDashboardState';
import { useDashboardData } from './hooks/useDashboardData';

function App() {
  const mainRef = useRef(null);
  const dashboardState = useDashboardState();
  const dashboardData = useDashboardData(dashboardState.initialState, dashboardState);

  const [currentView, setCurrentView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    // Legacy 'benchmark-comparison' deep links land on the Benchmark Browser,
    // where the comparison renders inline once brv02 runs are uploaded.
    const view = params.get('view') || 'home';
    return view === 'benchmark-comparison' ? 'benchmark-browser' : view;
  }); // 'home' | 'benchmark-browser' | 'intelligent-routing' | 'schema-explorer' | 'workload-catalog' | 'guided-analysis' | 'regressions-analysis'

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [bypassLoading, setBypassLoading] = useState(false);

  const { fetchConfig, loadAllData, enableLLMDResults, loading, isRestoringConnections, gcsProfiles } = dashboardData;
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
      setCurrentView(view === 'benchmark-comparison' ? 'benchmark-browser' : view);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);


  const handleNavigate = (view) => {
    setCurrentView(view);
    setIsMobileNavOpen(false); // Close mobile nav on navigation
    
    // Update URL to reflect the current view
    const params = new URLSearchParams(window.location.search);
    params.set('view', view);
    if (view !== 'workload-catalog') {
      params.delete('workload');
    }
    window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`);
    
    // Reset scroll position on navigation
    window.scrollTo(0, 0);
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  };

  const activeLoading = loading || isRestoringConnections || (gcsProfiles && gcsProfiles.some(p => p.loading));
  const shouldShowLoading = activeLoading && !bypassLoading && (currentView === 'benchmark-browser' || currentView === 'manage-benchmarks');

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
              {currentView === 'home' && <PrismHome onNavigate={handleNavigate} />}
              {currentView === 'inference-scheduling' && <Milestone1Dashboard onNavigateBack={() => handleNavigate('home')} onNavigate={handleNavigate} onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)} />}
              {currentView === 'agentic-serving' && <AgenticWorkloadsDashboard onNavigateBack={() => handleNavigate('home')} onNavigate={handleNavigate} onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)} />}
              {currentView === 'benchmark-browser' && <Dashboard onNavigateBack={() => handleNavigate('home')} onNavigate={handleNavigate} dashboardState={dashboardState} dashboardData={dashboardData} />}
              {currentView === 'manage-benchmarks' && <ManageBenchmarks onNavigateBack={() => handleNavigate('benchmark-browser')} onNavigate={handleNavigate} dashboardState={dashboardState} dashboardData={dashboardData} />}
              {currentView === 'schema-explorer' && <SchemaExplorer onNavigateBack={() => handleNavigate('home')} />}
              {currentView === 'workload-catalog' && <WorkloadCatalog onNavigateBack={() => handleNavigate('home')} />}
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

