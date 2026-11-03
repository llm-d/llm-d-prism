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

/**
 * @vitest-environment jsdom
 */

// Staging several BR v0.2 reports overflows localStorage. These cover the
// paths that used to abort without telling the user.

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, renderHook, act, waitFor } from '@testing-library/react';
import yaml from 'js-yaml';
import { GitHubAuthContext } from '../context/GitHubAuthContext.js';
import UploadValidationPage from '../components/DataConnections/SubmitValidationPage.jsx';
import { UnifiedDataTable } from '../components/ManageBenchmarks/UnifiedDataTable.jsx';
import { useDashboardData } from '../hooks/useDashboardData.jsx';
import { trySetLocalStorageJSON } from '../utils/localStorageJSON.js';

// localStorage whose setItem throws like a browser at quota for the keys in
// `fullKeys`, the way Chrome does for a value past its ~5 MB budget.
class QuotaStorage {
    constructor() {
        this.store = {};
        this.fullKeys = new Set();
    }
    getItem(key) {
        return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
    }
    setItem(key, val) {
        if (this.fullKeys.has(key)) {
            throw new DOMException(
                `Failed to execute 'setItem' on 'Storage': Setting the value of '${key}' exceeded the quota.`,
                'QuotaExceededError'
            );
        }
        this.store[key] = String(val);
    }
    removeItem(key) {
        delete this.store[key];
    }
    clear() {
        this.store = {};
        this.fullKeys.clear();
    }
    get length() {
        return Object.keys(this.store).length;
    }
    key(i) {
        return Object.keys(this.store)[i] || null;
    }
}

const storage = new QuotaStorage();
Object.defineProperty(window, 'localStorage', { value: storage, configurable: true, writable: true });
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });

const AUTH = {
    user: null,
    isPlaygroundMode: false,
    accessToken: null,
    isAuthenticated: false,
    isConfigured: false,
    isLoading: false,
    login: () => {},
    logout: () => {},
};

const reportYaml = (n) => yaml.dump({
    version: '0.2',
    run: { uid: `run-${n}`, eid: `exp-quota-${n}` },
    scenario: {
        stack: [{
            standardized: {
                role: 'aggregate',
                model: { name: 'quota-model' },
                accelerator: { model: 'H100', count: 8 },
            },
        }],
        load: { standardized: { tool: 'inference-perf' } },
    },
    results: {
        request_performance: {
            aggregate: {
                throughput: {
                    output_token_rate: { mean: 100 + n, units: 'tokens/s' },
                    input_token_rate: { mean: 400 + n, units: 'tokens/s' },
                    request_rate: { mean: 2, units: 'queries/s' },
                },
                latency: {
                    time_to_first_token: { mean: 0.12, p50: 0.1, p99: 0.4, units: 's' },
                    time_per_output_token: { mean: 0.02, p50: 0.02, p99: 0.05, units: 's' },
                    request_latency: { mean: 2.5, p50: 2.2, p99: 6.1, units: 's' },
                },
                requests: { total: 1000, failures: 0 },
            },
        },
    },
});

const renderWizard = (dashboardData, onNavigate = vi.fn()) => render(
    <GitHubAuthContext.Provider value={AUTH}>
        <UploadValidationPage
            onNavigate={onNavigate}
            onNavigateBack={vi.fn()}
            dashboardState={{}}
            dashboardData={dashboardData}
            initialIntent="stage-locally"
        />
    </GitHubAuthContext.Provider>
);

const stageReports = async (count) => {
    const files = Array.from({ length: count }, (_, i) =>
        new File([reportYaml(i)], `benchmark_report_v0.2_run${i}.yaml`, { type: 'application/x-yaml' })
    );
    const input = document.querySelector('input[type="file"][accept]');
    fireEvent.change(input, { target: { files } });
    fireEvent.click(await screen.findByRole('button', { name: /^Next/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Proceed to Staging/ }));
};

const mockDashboardData = (overrides = {}) => ({
    data: [],
    addToast: vi.fn(),
    removeToast: vi.fn(),
    toasts: [],
    brv02Runs: [],
    handleValidatedUpload: vi.fn().mockResolvedValue(undefined),
    loadSubmissions: vi.fn(),
    loadAllData: vi.fn(),
    clearAllBrv02Runs: vi.fn(),
    promoteStagedRunId: vi.fn(),
    removeBrv02Run: vi.fn(),
    ...overrides,
});

describe('staging BR v0.2 reports past the localStorage quota', () => {
    beforeEach(() => {
        globalThis.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
        storage.clear();
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        storage.clear();
    });

    describe('trySetLocalStorageJSON', () => {
        it('stores the value as JSON', () => {
            expect(trySetLocalStorageJSON('k', [{ a: 1 }])).toEqual({ ok: true, error: null });
            expect(JSON.parse(storage.getItem('k'))).toEqual([{ a: 1 }]);
        });

        it('reports a quota error instead of throwing, and drops the stale copy', () => {
            storage.setItem('k', JSON.stringify(['older']));
            storage.fullKeys.add('k');

            const result = trySetLocalStorageJSON('k', ['newer']);

            expect(result.ok).toBe(false);
            expect(result.error.name).toBe('QuotaExceededError');
            expect(storage.getItem('k')).toBeNull();
        });
    });

    describe('Proceed to Staging', () => {
        it('still stages, confirms and navigates when the staged copy does not fit', async () => {
            vi.spyOn(console, 'warn').mockImplementation(() => {});
            storage.setItem('prism_active_staged_bundles', JSON.stringify([{ id: 'stale' }]));
            storage.fullKeys.add('prism_active_staged_bundles');
            const dashboardData = mockDashboardData();
            const onNavigate = vi.fn();
            renderWizard(dashboardData, onNavigate);

            await stageReports(6);

            await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('results-store'));
            expect(dashboardData.handleValidatedUpload).toHaveBeenCalledTimes(1);
            expect(dashboardData.handleValidatedUpload.mock.calls[0][0]).toHaveLength(6);
            expect(dashboardData.addToast).toHaveBeenCalledWith('Successfully staged 6 runs locally.', 'success');
            // A stale bundle must not be resumed in place of the runs just staged.
            expect(storage.getItem('prism_active_staged_bundles')).toBeNull();
        });

        it('shows an error toast when staging throws, rather than doing nothing', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            const dashboardData = mockDashboardData({
                handleValidatedUpload: vi.fn().mockRejectedValue(new Error('boom')),
            });
            const onNavigate = vi.fn();
            renderWizard(dashboardData, onNavigate);

            await stageReports(1);

            await waitFor(() => expect(dashboardData.addToast).toHaveBeenCalledWith('Failed to stage runs locally: boom', 'error'));
            expect(onNavigate).not.toHaveBeenCalled();
        });
    });

    describe('opening staged runs in the upload wizard', () => {
        const RUN_ID = 'run-0';
        const stagedStat = {
            benchmarkKey: `brv02:${RUN_ID}`,
            runId: RUN_ID,
            model: 'quota-model',
            model_name: 'quota-model',
            hardware: 'H100',
            accelerator_count: 8,
            maxTput: 100,
            minLat: 2.5,
            uniqueIsl: [],
            uniqueOsl: [],
            data: [{ id: `entry-${RUN_ID}`, run_id: RUN_ID, model: 'quota-model', hardware: 'H100', source: `brv02:${RUN_ID}`, metadata: {} }],
        };

        const renderTable = ({ onOpenSubmitDialog, addToast }) => render(
            <GitHubAuthContext.Provider value={AUTH}>
                <UnifiedDataTable
                    modelStats={[stagedStat]}
                    selectedModels={new Set()}
                    filteredBySource={stagedStat.data}
                    selectedBenchmarks={new Set([stagedStat.benchmarkKey])}
                    setSelectedBenchmarks={vi.fn()}
                    setActiveFilters={vi.fn()}
                    expandedModels={new Set()}
                    toggleModelExpansion={vi.fn()}
                    brv02Runs={[{ runId: RUN_ID, runLabel: RUN_ID, stages: [] }]}
                    removeBrv02Run={vi.fn()}
                    onOpenSubmitDialog={onOpenSubmitDialog}
                    addToast={addToast}
                />
            </GitHubAuthContext.Provider>
        );

        it('opens the wizard with the selected runs when they fit', () => {
            const onOpenSubmitDialog = vi.fn();
            renderTable({ onOpenSubmitDialog, addToast: vi.fn() });

            fireEvent.click(screen.getByRole('button', { name: /Edit Selected/ }));

            expect(onOpenSubmitDialog).toHaveBeenCalledWith('stage-locally');
            expect(JSON.parse(storage.getItem('prism_active_staged_bundles'))).toHaveLength(1);
            expect(storage.getItem('prism_upload_wizard_step')).toBe('2');
        });

        it('explains instead of opening an empty wizard when they do not fit', () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            storage.fullKeys.add('prism_active_staged_bundles');
            const onOpenSubmitDialog = vi.fn();
            const addToast = vi.fn();
            renderTable({ onOpenSubmitDialog, addToast });

            fireEvent.click(screen.getByRole('button', { name: /Edit Selected/ }));

            expect(onOpenSubmitDialog).not.toHaveBeenCalled();
            expect(addToast).toHaveBeenCalledWith(expect.stringMatching(/too large for browser storage/), 'error');
            expect(storage.getItem('prism_upload_wizard_step')).toBeNull();
        });
    });

    describe('useDashboardData persistence of staged runs', () => {
        it('keeps the runs in memory and warns once when they cannot be persisted', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
            window.fetch = globalThis.fetch;
            const wrapper = ({ children }) => (
                <GitHubAuthContext.Provider value={AUTH}>{children}</GitHubAuthContext.Provider>
            );
            const { result } = renderHook(() => useDashboardData({}, {}), { wrapper });
            const bundleFor = (n) => ({
                id: `bundle-${n}`,
                metadataFiles: {},
                payload: {
                    runId: `run-${n}`,
                    runLabel: `run-${n}`,
                    entries: [{ filename: `r${n}.yaml`, raw_report: yaml.load(reportYaml(n)) }],
                },
            });
            const warnings = () => result.current.toasts.filter(t => t.type === 'warning' && /lost when the page reloads/.test(t.message));

            storage.fullKeys.add('prism_brv02_runs');
            await act(async () => {
                await result.current.handleValidatedUpload([bundleFor(0)]);
            });
            expect(warnings()).toHaveLength(1);

            // Dismissed, it stays dismissed while the runs still do not fit.
            act(() => result.current.removeToast(warnings()[0].id));
            await act(async () => {
                await result.current.handleValidatedUpload([bundleFor(1)]);
            });

            expect(result.current.brv02Runs.map(r => r.runId).sort()).toEqual(['run-0', 'run-1']);
            expect(storage.getItem('prism_brv02_runs')).toBeNull();
            expect(warnings()).toHaveLength(0);
        });
    });
});
