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

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, renderHook, act, waitFor } from '@testing-library/react';
import { GitHubAuthContext } from '../context/GitHubAuthContext.js';
import { UnifiedDataTable, buildBundleForRun } from '../components/ManageBenchmarks/UnifiedDataTable.jsx';
import SubmitValidationPage from '../components/DataConnections/SubmitValidationPage.jsx';
import { StatusChip } from '../components/ui/Badge.jsx';
import { useDashboardData } from '../hooks/useDashboardData.jsx';
import { CacheManager } from '../utils/cacheManager.js';
import { saveWizardHandoff, resetMemoryStoreForTests } from '../utils/stagedBundlesStore.js';

const TEST_RUN_ID = 'f2d6adab-d296-46ae-b46b-dfcd6c6c74b2';

class MockStorage {
    constructor() {
        this.store = {};
        this.maxBytes = Infinity;
    }
    getItem(key) {
        return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
    }
    setItem(key, val) {
        const str = String(val);
        if (Number.isFinite(this.maxBytes)) {
            const currentTotal = Object.entries(this.store).reduce(
                (sum, [k, v]) => sum + (k === key ? 0 : k.length + v.length),
                0
            );
            if (currentTotal + key.length + str.length > this.maxBytes) {
                const err = new Error(`Setting the value of '${key}' exceeded the quota.`);
                err.name = 'QuotaExceededError';
                err.code = 22;
                throw err;
            }
        }
        this.store[key] = str;
    }
    removeItem(key) {
        delete this.store[key];
    }
    clear() {
        this.store = {};
        this.maxBytes = Infinity;
    }
    get length() {
        return Object.keys(this.store).length;
    }
    key(i) {
        return Object.keys(this.store)[i] || null;
    }
}

const mockLocalStorage = new MockStorage();
const mockSessionStorage = new MockStorage();
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, configurable: true, writable: true });
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, configurable: true, writable: true });
Object.defineProperty(window, 'sessionStorage', { value: mockSessionStorage, configurable: true, writable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: mockSessionStorage, configurable: true, writable: true });

function buildMockModelStat({
    runId = TEST_RUN_ID,
    submissionState = 'unlisted',
    authorUsername = 'alice'
} = {}) {
    const entry = {
        id: `entry-${runId}`,
        run_id: runId,
        runLabel: 'admin-v6e',
        model: 'gemma-3-27b-it',
        model_name: 'gemma-3-27b-it',
        hardware: 'V6E',
        accelerator_count: 4,
        throughput: 1200,
        latency: { mean: 25 },
        ttft: { mean: 50 },
        time_per_output_token: 10,
        source: 'gcs:llm-d-benchmarks-staging',
        github_author: { username: authorUsername },
        source_info: {
            type: 'benchmark_report_v02',
            origin: 'gcs:llm-d-benchmarks-staging',
            submission_state: submissionState,
            github_user: authorUsername,
            run_id: runId
        },
        metadata: {
            model_name: 'gemma-3-27b-it',
            hardware: 'V6E',
            accelerator_count: 4,
            tensor_parallelism: 4
        }
    };

    return {
        benchmarkKey: `results-store:${runId}`,
        runId,
        model: 'gemma-3-27b-it',
        model_name: 'gemma-3-27b-it',
        hardware: 'V6E',
        accelerator_count: 4,
        maxTput: 1200,
        minLat: 25,
        peakRun: entry,
        uniqueIsl: [1024],
        uniqueOsl: [1024],
        data: [entry]
    };
}

function renderTableWithAuth({
    user = { username: 'alice', permission: 'user' },
    isPlaygroundMode = false,
    modelStats = [buildMockModelStat()],
    submissionsMap = {},
    includeUnlisted = true,
    updateSubmissionStatus = vi.fn(),
    deleteSubmission = vi.fn()
} = {}) {
    const authValue = {
        user,
        isPlaygroundMode,
        accessToken: user ? 'mock-token' : null,
        isAuthenticated: Boolean(user),
        isLoading: false
    };

    return render(
        <GitHubAuthContext.Provider value={authValue}>
            <UnifiedDataTable
                modelStats={modelStats}
                selectedModels={new Set()}
                filteredBySource={modelStats.flatMap(s => s.data)}
                selectedBenchmarks={new Set()}
                setSelectedBenchmarks={vi.fn()}
                setActiveFilters={vi.fn()}
                expandedModels={new Set()}
                toggleModelExpansion={vi.fn()}
                includeUnlisted={includeUnlisted}
                submissionsMap={submissionsMap}
                updateSubmissionStatus={updateSubmissionStatus}
                deleteSubmission={deleteSubmission}
            />
        </GitHubAuthContext.Provider>
    );
}

describe('Benchmark Submission Lifecycle UI & Hook Tests', () => {
    beforeEach(() => {
        globalThis.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
        window.confirm = vi.fn(() => true);
        mockLocalStorage.clear();
        mockSessionStorage.clear();
        resetMemoryStoreForTests();
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        mockLocalStorage.clear();
        mockSessionStorage.clear();
        resetMemoryStoreForTests();
        Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true, writable: true });
        Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true });
    });

    describe('StatusChip & Unlisted Badge Regression', () => {
        it('renders the Unlisted label in StatusChip instead of falling back to Staged', () => {
            render(<StatusChip status="unlisted" />);
            expect(screen.getByText('Unlisted')).toBeTruthy();
            expect(screen.queryByText('Staged')).toBeNull();
        });

        it('displays Unlisted badge on unlisted rows both via submissionsMap and via source_info.submission_state fallback', () => {
            // Case 1: submissionsMap is empty (e.g. Playground Mode fallback to source_info.submission_state)
            const { unmount } = renderTableWithAuth({
                user: { username: null, permission: 'admin' },
                isPlaygroundMode: true,
                modelStats: [buildMockModelStat({ submissionState: 'unlisted' })],
                submissionsMap: {}
            });

            expect(screen.getByText('Unlisted')).toBeTruthy();
            expect(screen.queryByText('Staged')).toBeNull();
            unmount();

            // Case 2: submissionsMap overrides stale source_info.submission_state
            renderTableWithAuth({
                user: { username: 'alice', permission: 'user' },
                modelStats: [buildMockModelStat({ submissionState: 'submitted_pending_review' })],
                submissionsMap: {
                    [TEST_RUN_ID]: {
                        runId: TEST_RUN_ID,
                        status: 'unlisted',
                        github_author: { username: 'alice' }
                    }
                }
            });

            expect(screen.getByText('Unlisted')).toBeTruthy();
            expect(screen.queryByText('In Review')).toBeNull();
        });
    });

    describe('UnifiedDataTable Role-Based Action Buttons', () => {
        it('unlisted state: allows owner to Promote to Review and Delete, allows admin (non-owner) only to Delete, and hides both for other users', () => {
            const unlistedStat = buildMockModelStat({ submissionState: 'unlisted', authorUsername: 'alice' });

            // 1. Submitting owner (alice) sees both Promote to Review and Delete
            const { unmount: unmountOwner } = renderTableWithAuth({
                user: { username: 'alice', permission: 'user' },
                modelStats: [unlistedStat]
            });
            expect(screen.getByTitle(/Promote unlisted benchmark/i)).toBeTruthy();
            expect(screen.getByTitle(/Permanently delete this unlisted benchmark/i)).toBeTruthy();
            unmountOwner();

            // 2. Admin who is NOT the owner sees Delete, but NOT Promote to Review
            const { unmount: unmountAdmin } = renderTableWithAuth({
                user: { username: 'admin-user', permission: 'admin' },
                modelStats: [unlistedStat]
            });
            expect(screen.queryByTitle(/Promote unlisted benchmark/i)).toBeNull();
            expect(screen.getByTitle(/Permanently delete this unlisted benchmark/i)).toBeTruthy();
            unmountAdmin();

            // 3. Non-owner standard user (bob) sees neither button
            renderTableWithAuth({
                user: { username: 'bob', permission: 'user' },
                modelStats: [unlistedStat]
            });
            expect(screen.queryByTitle(/Promote unlisted benchmark/i)).toBeNull();
            expect(screen.queryByTitle(/Permanently delete this unlisted benchmark/i)).toBeNull();
        });

        it('submitted_pending_review state: shows Withdraw only to owner, and Approve + Reject + Withdraw to admin', () => {
            const pendingStat = buildMockModelStat({ submissionState: 'submitted_pending_review', authorUsername: 'alice' });

            // 1. Submitting owner (non-admin) sees Withdraw, not Approve/Reject
            const { unmount: unmountOwner } = renderTableWithAuth({
                user: { username: 'alice', permission: 'user' },
                modelStats: [pendingStat]
            });
            expect(screen.getByTitle(/Withdraw this benchmark back to unlisted/i)).toBeTruthy();
            expect(screen.queryByTitle(/Approve this run/i)).toBeNull();
            expect(screen.queryByTitle(/Reject compliance/i)).toBeNull();
            unmountOwner();

            // 2. Admin sees Approve, Reject, and Withdraw
            renderTableWithAuth({
                user: { username: 'admin-user', permission: 'admin' },
                modelStats: [pendingStat]
            });
            expect(screen.getByTitle(/Approve this run/i)).toBeTruthy();
            expect(screen.getByTitle(/Reject compliance/i)).toBeTruthy();
            expect(screen.getByTitle(/Withdraw this benchmark back to unlisted/i)).toBeTruthy();
        });

        it('rejected state: allows owner to Resubmit and Delete, and allows admin (non-owner) only to Delete', () => {
            const rejectedStat = buildMockModelStat({ submissionState: 'rejected', authorUsername: 'alice' });

            // 1. Submitting owner sees Resubmit and Delete
            const { unmount: unmountOwner } = renderTableWithAuth({
                user: { username: 'alice', permission: 'user' },
                modelStats: [rejectedStat]
            });
            expect(screen.getByTitle(/Resubmit this run/i)).toBeTruthy();
            expect(screen.getByTitle(/Permanently delete this rejected benchmark/i)).toBeTruthy();
            unmountOwner();

            // 2. Admin (non-owner) sees Delete, but NOT Resubmit
            renderTableWithAuth({
                user: { username: 'admin-user', permission: 'admin' },
                modelStats: [rejectedStat]
            });
            expect(screen.queryByTitle(/Resubmit this run/i)).toBeNull();
            expect(screen.getByTitle(/Permanently delete this rejected benchmark/i)).toBeTruthy();
        });

        it('public state: allows owner or admin to Unlist, and hides Unlist for non-owner standard users', () => {
            const publicStat = buildMockModelStat({ submissionState: 'public', authorUsername: 'alice' });
            const deleteSubmission = vi.fn();

            // 1. Owner can click Unlist -> triggers deleteSubmission(runId)
            const { unmount: unmountOwner } = renderTableWithAuth({
                user: { username: 'alice', permission: 'user' },
                modelStats: [publicStat],
                deleteSubmission
            });
            const unlistBtn = screen.getByTitle(/Pull this public benchmark back to unlisted/i);
            fireEvent.click(unlistBtn);
            expect(deleteSubmission).toHaveBeenCalledWith(TEST_RUN_ID);
            unmountOwner();

            // 2. Non-owner standard user does not see Unlist
            renderTableWithAuth({
                user: { username: 'bob', permission: 'user' },
                modelStats: [publicStat]
            });
            expect(screen.queryByTitle(/Pull this public benchmark back to unlisted/i)).toBeNull();
        });
    });

    describe('useDashboardData Endpoint Routing & Cache Invalidation', () => {
        it('routes upward transitions to /promote, review decisions to /review, and clears CacheManager on status updates and deletions', async () => {
            const clearAllSpy = vi.spyOn(CacheManager, 'clearAll').mockResolvedValue(undefined);
            const fetchCalls = [];

            globalThis.fetch = vi.fn().mockImplementation(async (url, options = {}) => {
                const urlStr = url.toString();
                fetchCalls.push({ url: urlStr, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });

                if (urlStr.includes('/promote') || urlStr.includes('/review')) {
                    return {
                        ok: true,
                        json: async () => ({ success: true })
                    };
                }
                if (options.method === 'DELETE' && urlStr.includes(`/api/results/${TEST_RUN_ID}`)) {
                    return {
                        ok: true,
                        json: async () => ({ success: true, message: 'Withdrawn to unlisted.' })
                    };
                }
                if (urlStr.includes('/api/results')) {
                    return {
                        ok: true,
                        json: async () => ({ items: [] })
                    };
                }
                return {
                    ok: true,
                    json: async () => ({})
                };
            });
            window.fetch = globalThis.fetch;

            const wrapper = ({ children }) => (
                <GitHubAuthContext.Provider
                    value={{
                        user: { username: 'admin-user', permission: 'admin' },
                        isPlaygroundMode: true,
                        accessToken: 'test-token',
                        isAuthenticated: true,
                        isLoading: false
                    }}
                >
                    {children}
                </GitHubAuthContext.Provider>
            );

            const { result } = renderHook(() => useDashboardData({}, {}), { wrapper });

            clearAllSpy.mockClear();
            fetchCalls.length = 0;

            // 1. Upward promotion -> POST /api/results/:runId/promote + CacheManager.clearAll()
            await act(async () => {
                await result.current.updateSubmissionStatus(TEST_RUN_ID, 'submitted_pending_review');
            });

            const promoteCall = fetchCalls.find(c => c.method === 'POST' && c.url === `/api/results/${TEST_RUN_ID}/promote`);
            expect(promoteCall).toBeTruthy();
            expect(promoteCall.body).toEqual({ status: 'submitted_pending_review' });
            expect(clearAllSpy).toHaveBeenCalledTimes(1);

            // 2. Admin review rejection -> POST /api/results/:runId/review + CacheManager.clearAll()
            clearAllSpy.mockClear();
            fetchCalls.length = 0;

            await act(async () => {
                await result.current.updateSubmissionStatus(TEST_RUN_ID, 'rejected', 'Needs hardware count');
            });

            const reviewCall = fetchCalls.find(c => c.method === 'POST' && c.url === `/api/results/${TEST_RUN_ID}/review`);
            expect(reviewCall).toBeTruthy();
            expect(reviewCall.body).toEqual({
                status: 'rejected',
                feedback: 'Needs hardware count',
                reviewer: 'admin-user'
            });
            expect(clearAllSpy).toHaveBeenCalledTimes(1);

            // 3. Bulk review update -> POST /api/results/:runId/review + CacheManager.clearAll()
            clearAllSpy.mockClear();
            fetchCalls.length = 0;

            await act(async () => {
                await result.current.bulkUpdateSubmissionStatus([TEST_RUN_ID], 'public');
            });

            const bulkReviewCall = fetchCalls.find(c => c.method === 'POST' && c.url === `/api/results/${TEST_RUN_ID}/review`);
            expect(bulkReviewCall).toBeTruthy();
            expect(bulkReviewCall.body).toEqual({
                status: 'public',
                feedback: '',
                reviewer: 'admin-user'
            });
            expect(clearAllSpy).toHaveBeenCalledTimes(1);

            // 4. Withdrawal / deletion -> DELETE /api/results/:runId + CacheManager.clearAll()
            clearAllSpy.mockClear();
            fetchCalls.length = 0;

            await act(async () => {
                await result.current.deleteSubmission(TEST_RUN_ID, true);
            });

            const deleteCall = fetchCalls.find(c => c.method === 'DELETE' && c.url === `/api/results/${TEST_RUN_ID}`);
            expect(deleteCall).toBeTruthy();
            expect(clearAllSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('Issues #184 & #178: IndexedDB Staged Bundle Handoff & QuotaExceededError Resilience', () => {
        function installMockIndexedDB({ failPutWithQuota = false, getDelayMs = 0 } = {}) {
            const databases = new Map();
            const idb = {
                open(dbName) {
                    const req = { onupgradeneeded: null, onsuccess: null, onerror: null, result: null, error: null };
                    setTimeout(() => {
                        let dbData = databases.get(dbName);
                        const isNew = !dbData;
                        if (!dbData) {
                            dbData = { stores: new Map() };
                            databases.set(dbName, dbData);
                        }
                        const db = {
                            objectStoreNames: { contains: (n) => dbData.stores.has(n) },
                            createObjectStore(n) {
                                if (!dbData.stores.has(n)) dbData.stores.set(n, new Map());
                                return {};
                            },
                            close() {},
                            transaction(storeName) {
                                const map = dbData.stores.get(storeName) || new Map();
                                const tx = {};
                                const store = {
                                    put(val, key) {
                                        const putReq = {};
                                        setTimeout(() => {
                                            if (failPutWithQuota) {
                                                const err = new Error('IndexedDB QuotaExceededError');
                                                err.name = 'QuotaExceededError';
                                                putReq.error = err;
                                                tx.error = err;
                                                if (putReq.onerror) putReq.onerror();
                                                if (tx.onerror) tx.onerror();
                                                return;
                                            }
                                            map.set(key, JSON.parse(JSON.stringify(val)));
                                            if (putReq.onsuccess) putReq.onsuccess();
                                            setTimeout(() => {
                                                if (tx.oncomplete) tx.oncomplete();
                                            }, 0);
                                        }, 0);
                                        return putReq;
                                    },
                                    get(key) {
                                        const getReq = {};
                                        setTimeout(() => {
                                            getReq.result = map.has(key) ? JSON.parse(JSON.stringify(map.get(key))) : undefined;
                                            if (getReq.onsuccess) getReq.onsuccess();
                                            if (tx.oncomplete) tx.oncomplete();
                                        }, getDelayMs);
                                        return getReq;
                                    },
                                    delete(key) {
                                        const delReq = {};
                                        setTimeout(() => {
                                            map.delete(key);
                                            if (delReq.onsuccess) delReq.onsuccess();
                                            if (tx.oncomplete) tx.oncomplete();
                                        }, 0);
                                        return delReq;
                                    }
                                };
                                tx.objectStore = () => store;
                                return tx;
                            }
                        };
                        req.result = db;
                        if (isNew && req.onupgradeneeded) req.onupgradeneeded({ target: req });
                        if (req.onsuccess) req.onsuccess({ target: req });
                    }, 0);
                    return req;
                }
            };
            Object.defineProperty(window, 'indexedDB', { value: idb, configurable: true, writable: true });
            Object.defineProperty(globalThis, 'indexedDB', { value: idb, configurable: true, writable: true });
            return databases;
        }

        function buildLargeStagedRun(idx, payloadBytes = 32 * 1024) {
            const runId = `00000000-0000-4000-8000-00000000010${idx}`;
            const runLabel = `experiment-arm-${idx}`;
            const denseSeries = 't'.repeat(payloadBytes);
            const rawReport = {
                version: '0.2',
                workload: { stage: 0 },
                run: { uid: `uid-${idx}` },
                scenario: {
                    model: 'meta-llama/Llama-3-70B-Instruct',
                    hardware: 'H100',
                    load: {
                        standardized: {
                            stage: 0,
                            tool: 'inference-perf'
                        }
                    },
                    stack: [
                        {
                            standardized: {
                                role: 'aggregate',
                                tool: 'vllm',
                                model: { name: 'meta-llama/Llama-3-70B-Instruct' },
                                accelerator: { model: 'H100', count: 8 }
                            },
                            config: {
                                accelerator: { model: 'H100', count: 8 }
                            }
                        }
                    ]
                },
                results: {
                    request_performance: {
                        aggregate: {
                            throughput: { output_token_rate: { mean: 145.5, units: 'tok/s' } },
                            latency: {
                                request_latency: { mean: 0.42, units: 's' },
                                time_to_first_token: { mean: 0.08, units: 's' },
                                time_per_output_token: { mean: 0.015, units: 's' }
                            }
                        }
                    },
                    observability: {
                        components: [
                            {
                                component_label: 'vllm-decode-0',
                                dense_pod_metrics: denseSeries
                            }
                        ]
                    }
                }
            };

            const run = {
                runId,
                runLabel,
                model_name: 'meta-llama/Llama-3-70B-Instruct',
                hardware: { hardware_name: 'H100', accelerator_count: 8 },
                stages: [
                    {
                        stageIndex: 0,
                        prism_stage_index: 0,
                        filename: `stage_0_arm_${idx}.yaml`,
                        runUid: `uid-${idx}`,
                        rawReport
                    }
                ]
            };

            const statEntry = {
                id: `staged-entry-${idx}`,
                run_id: runId,
                runLabel,
                model: 'meta-llama/Llama-3-70B-Instruct',
                model_name: 'meta-llama/Llama-3-70B-Instruct',
                hardware: 'H100',
                accelerator_count: 8,
                throughput: 145.5,
                latency: { mean: 420 },
                ttft: { mean: 80 },
                time_per_output_token: 15,
                source: `brv02:${runId}`,
                source_info: {
                    type: 'benchmark_report_v02',
                    submission_state: 'staged',
                    run_id: runId
                },
                metadata: {
                    model_name: 'meta-llama/Llama-3-70B-Instruct',
                    hardware: 'H100',
                    accelerator_count: 8
                }
            };

            const modelStat = {
                benchmarkKey: `brv02:${runId}`,
                runId,
                runLabel,
                model: 'meta-llama/Llama-3-70B-Instruct',
                model_name: 'meta-llama/Llama-3-70B-Instruct',
                hardware: 'H100',
                accelerator_count: 8,
                maxTput: 145.5,
                minLat: 420,
                peakRun: statEntry,
                uniqueIsl: [1024],
                uniqueOsl: [1024],
                data: [statEntry]
            };

            return { run, modelStat };
        }

        it('Issue #184: "Publish Selected" carries multiple staged runs into Step 2 when localStorage quota is exceeded', async () => {
            installMockIndexedDB();
            // Cap localStorage to 2 KB so writing multi-run bundles (~100 KB here, >5 MB in prod) throws QuotaExceededError
            mockLocalStorage.maxBytes = 2048;

            const items = [0, 1, 2].map((i) => buildLargeStagedRun(i, 32 * 1024));
            const brv02Runs = items.map((x) => x.run);
            const modelStats = items.map((x) => x.modelStat);
            const selectedBenchmarks = new Set(modelStats.map((s) => s.benchmarkKey));

            const onOpenSubmitDialog = vi.fn();
            const addToast = vi.fn();

            const authValue = {
                user: { username: 'alice', permission: 'user' },
                isPlaygroundMode: false,
                isConfigured: true,
                accessToken: 'mock-token',
                isAuthenticated: true,
                isLoading: false,
                login: vi.fn(),
                logout: vi.fn()
            };

            const { unmount } = render(
                <GitHubAuthContext.Provider value={authValue}>
                    <UnifiedDataTable
                        modelStats={modelStats}
                        brv02Runs={brv02Runs}
                        selectedModels={new Set()}
                        filteredBySource={modelStats.flatMap((s) => s.data)}
                        selectedBenchmarks={selectedBenchmarks}
                        setSelectedBenchmarks={vi.fn()}
                        setActiveFilters={vi.fn()}
                        expandedModels={new Set()}
                        toggleModelExpansion={vi.fn()}
                        onOpenSubmitDialog={onOpenSubmitDialog}
                        addToast={addToast}
                        dashboardState={{
                            showComparisonDrawer: true,
                            setShowComparisonDrawer: vi.fn()
                        }}
                    />
                </GitHubAuthContext.Provider>
            );

            const publishBtn = screen.getByText(/Publish Selected \(3\)/i);
            fireEvent.click(publishBtn);

            await waitFor(() => {
                expect(onOpenSubmitDialog).toHaveBeenCalledWith('submit-review');
            });
            expect(addToast).not.toHaveBeenCalledWith(expect.any(String), 'error');
            expect(mockLocalStorage.getItem('prism_active_staged_bundles')).toBeNull();
            unmount();

            // Mount SubmitValidationPage under React.StrictMode and verify Step 2 opens with all 3 runs
            render(
                <React.StrictMode>
                    <GitHubAuthContext.Provider value={authValue}>
                        <SubmitValidationPage
                            onNavigateBack={vi.fn()}
                            onNavigate={vi.fn()}
                            initialIntent="submit-review"
                            dashboardState={{}}
                            dashboardData={{
                                data: [],
                                addToast,
                                removeToast: vi.fn(),
                                toasts: [],
                                brv02Runs,
                                handleValidatedUpload: vi.fn(),
                                loadSubmissions: vi.fn(),
                                loadAllData: vi.fn(),
                                promoteStagedRunId: vi.fn(),
                                removeBrv02Run: vi.fn()
                            }}
                        />
                    </GitHubAuthContext.Provider>
                </React.StrictMode>
            );

            expect(screen.getByText(/Step 2 of 4/i)).toBeTruthy();
            expect(screen.queryByText(/Drag & Drop files here/i)).toBeNull();
            expect(screen.getByDisplayValue('experiment-arm-0')).toBeTruthy();
            expect(screen.getByDisplayValue('experiment-arm-1')).toBeTruthy();
            expect(screen.getByDisplayValue('experiment-arm-2')).toBeTruthy();
        });

        it('Issue #184: surfaces an actionable error toast and does NOT navigate to Step 1 if all browser storage fails', async () => {
            installMockIndexedDB({ failPutWithQuota: true });
            mockLocalStorage.maxBytes = 512;

            const items = [0, 1].map((i) => buildLargeStagedRun(i, 16 * 1024));
            const brv02Runs = items.map((x) => x.run);
            const modelStats = items.map((x) => x.modelStat);
            const selectedBenchmarks = new Set(modelStats.map((s) => s.benchmarkKey));

            const onOpenSubmitDialog = vi.fn();
            const addToast = vi.fn();

            render(
                <GitHubAuthContext.Provider
                    value={{
                        user: { username: 'alice', permission: 'user' },
                        isPlaygroundMode: false,
                        isConfigured: true,
                        accessToken: 'mock-token',
                        isAuthenticated: true,
                        isLoading: false
                    }}
                >
                    <UnifiedDataTable
                        modelStats={modelStats}
                        brv02Runs={brv02Runs}
                        selectedModels={new Set()}
                        filteredBySource={modelStats.flatMap((s) => s.data)}
                        selectedBenchmarks={selectedBenchmarks}
                        setSelectedBenchmarks={vi.fn()}
                        setActiveFilters={vi.fn()}
                        expandedModels={new Set()}
                        toggleModelExpansion={vi.fn()}
                        onOpenSubmitDialog={onOpenSubmitDialog}
                        addToast={addToast}
                        dashboardState={{
                            showComparisonDrawer: true,
                            setShowComparisonDrawer: vi.fn()
                        }}
                    />
                </GitHubAuthContext.Provider>
            );

            fireEvent.click(screen.getByText(/Publish Selected \(2\)/i));

            await waitFor(() => {
                expect(addToast).toHaveBeenCalledWith(
                    expect.stringMatching(/Browser storage quota exceeded/i),
                    'error'
                );
            });
            expect(onOpenSubmitDialog).not.toHaveBeenCalled();
        });

        it('Issue #178: "Proceed to Staging" stages 6+ reports via IndexedDB when localStorage is capped, and shows error toast if storage fails', async () => {
            installMockIndexedDB();
            mockLocalStorage.maxBytes = 2048;

            const bundles = [0, 1, 2, 3, 4, 5].map((i) => buildBundleForRun(buildLargeStagedRun(i, 16 * 1024).run));
            await saveWizardHandoff({ bundles, step: 2, intent: 'stage-locally' });

            const onCommit = vi.fn().mockResolvedValue(undefined);
            const onNavigate = vi.fn();
            const addToast = vi.fn();

            const authValue = {
                user: { username: 'anonymous', permission: 'admin' },
                isPlaygroundMode: true,
                isConfigured: true,
                accessToken: null,
                isAuthenticated: true,
                isLoading: false,
                login: vi.fn(),
                logout: vi.fn()
            };

            const { unmount } = render(
                <GitHubAuthContext.Provider value={authValue}>
                    <SubmitValidationPage
                        onNavigateBack={vi.fn()}
                        onNavigate={onNavigate}
                        initialIntent="stage-locally"
                        dashboardState={{}}
                        dashboardData={{
                            data: [],
                            addToast,
                            removeToast: vi.fn(),
                            toasts: [],
                            brv02Runs: [],
                            handleValidatedUpload: onCommit,
                            loadSubmissions: vi.fn(),
                            loadAllData: vi.fn(),
                            promoteStagedRunId: vi.fn(),
                            removeBrv02Run: vi.fn()
                        }}
                    />
                </GitHubAuthContext.Provider>
            );

            const proceedBtn = screen.getByText(/Proceed to Staging/i);
            fireEvent.click(proceedBtn);

            await waitFor(() => {
                expect(onCommit).toHaveBeenCalledTimes(1);
                expect(onCommit.mock.calls[0][0]).toHaveLength(6);
                expect(addToast).toHaveBeenCalledWith('Successfully staged 6 runs locally.', 'success');
                expect(onNavigate).toHaveBeenCalledWith('results-store');
            });
            unmount();

            // Verify failure path: when onCommit rejects (e.g. quota/commit error), surface error toast & stay on Step 2
            await saveWizardHandoff({ bundles, step: 2, intent: 'stage-locally' });

            const quotaErr = new Error('QuotaExceededError');
            quotaErr.name = 'QuotaExceededError';
            const onCommitFail = vi.fn().mockRejectedValue(quotaErr);
            const onNavigateFail = vi.fn();
            const addToastFail = vi.fn();

            render(
                <GitHubAuthContext.Provider value={authValue}>
                    <SubmitValidationPage
                        onNavigateBack={vi.fn()}
                        onNavigate={onNavigateFail}
                        initialIntent="stage-locally"
                        dashboardState={{}}
                        dashboardData={{
                            data: [],
                            addToast: addToastFail,
                            removeToast: vi.fn(),
                            toasts: [],
                            brv02Runs: [],
                            handleValidatedUpload: onCommitFail,
                            loadSubmissions: vi.fn(),
                            loadAllData: vi.fn(),
                            promoteStagedRunId: vi.fn(),
                            removeBrv02Run: vi.fn()
                        }}
                    />
                </GitHubAuthContext.Provider>
            );

            fireEvent.click(screen.getByText(/Proceed to Staging/i));

            await waitFor(() => {
                expect(addToastFail).toHaveBeenCalledWith(
                    expect.stringMatching(/Failed to stage runs locally:.*quota exceeded/i),
                    'error'
                );
            });
            expect(onNavigateFail).not.toHaveBeenCalled();
            expect(screen.getByDisplayValue('experiment-arm-5')).toBeTruthy();
        });

        it('GitHub OAuth redirect round-trip: caches >5 MB staged runs in IndexedDB and hydrates Step 3 without flashing Step 1', async () => {
            installMockIndexedDB({ getDelayMs: 25 });
            mockLocalStorage.maxBytes = 2048;

            const bundles = [0, 1, 2].map((i) => buildBundleForRun(buildLargeStagedRun(i, 24 * 1024).run));
            await saveWizardHandoff({ bundles, step: 3, intent: 'submit-review' });

            const loginSpy = vi.fn();
            const addToast = vi.fn();

            const unauthContext = {
                user: null,
                isPlaygroundMode: false,
                isConfigured: true,
                accessToken: null,
                isAuthenticated: false,
                isLoading: false,
                login: loginSpy,
                logout: vi.fn()
            };

            const { unmount } = render(
                <GitHubAuthContext.Provider value={unauthContext}>
                    <SubmitValidationPage
                        onNavigateBack={vi.fn()}
                        onNavigate={vi.fn()}
                        initialIntent="submit-review"
                        dashboardState={{}}
                        dashboardData={{
                            data: [],
                            addToast,
                            removeToast: vi.fn(),
                            toasts: [],
                            brv02Runs: [],
                            handleValidatedUpload: vi.fn(),
                            loadSubmissions: vi.fn(),
                            loadAllData: vi.fn(),
                            promoteStagedRunId: vi.fn(),
                            removeBrv02Run: vi.fn()
                        }}
                    />
                </GitHubAuthContext.Provider>
            );

            fireEvent.click(screen.getByRole('button', { name: /Authenticate with GitHub/i }));

            await waitFor(() => {
                expect(loginSpy).toHaveBeenCalledWith({ showSubmitDialog: true });
            });
            unmount();

            // Simulate full browser reload returning from GitHub OAuth callback via ResultsStore
            resetMemoryStoreForTests();

            const authedContext = {
                user: { username: 'alice', permission: 'user' },
                isPlaygroundMode: false,
                isConfigured: true,
                accessToken: 'oauth-token',
                isAuthenticated: true,
                isLoading: false,
                login: loginSpy,
                logout: vi.fn()
            };

            render(
                <React.StrictMode>
                    <GitHubAuthContext.Provider value={authedContext}>
                        <SubmitValidationPage
                            onNavigateBack={vi.fn()}
                            onNavigate={vi.fn()}
                            initialIntent="submit-review"
                            dashboardState={{}}
                            dashboardData={{
                                data: [],
                                addToast,
                                removeToast: vi.fn(),
                                toasts: [],
                                brv02Runs: [],
                                handleValidatedUpload: vi.fn(),
                                loadSubmissions: vi.fn(),
                                loadAllData: vi.fn(),
                                promoteStagedRunId: vi.fn(),
                                removeBrv02Run: vi.fn()
                            }}
                        />
                    </GitHubAuthContext.Provider>
                </React.StrictMode>
            );

            // Frame 0 while IndexedDB read is in flight: shows hydration spinner, NEVER Step 1 dropzone
            expect(screen.getByText(/Restoring staged benchmark runs/i)).toBeTruthy();
            expect(screen.queryByText(/Drag & Drop files here/i)).toBeNull();

            // Once IndexedDB read completes, lands on Step 3 with authenticated GitHub banner
            await waitFor(() => {
                expect(screen.queryByText(/Restoring staged benchmark runs/i)).toBeNull();
                expect(screen.getByText(/Step 3 of 4/i)).toBeTruthy();
                expect(screen.getByText(/Authenticated via GitHub/i)).toBeTruthy();
            });
        });
    });
});
