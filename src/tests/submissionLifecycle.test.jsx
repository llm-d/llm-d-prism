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
import { render, screen, fireEvent, cleanup, renderHook, act } from '@testing-library/react';
import { GitHubAuthContext } from '../context/GitHubAuthContext.js';
import { UnifiedDataTable } from '../components/ManageBenchmarks/UnifiedDataTable.jsx';
import { StatusChip } from '../components/ui/Badge.jsx';
import { useDashboardData } from '../hooks/useDashboardData.jsx';
import { CacheManager } from '../utils/cacheManager.js';

const TEST_RUN_ID = 'f2d6adab-d296-46ae-b46b-dfcd6c6c74b2';

class MockStorage {
    constructor() {
        this.store = {};
    }
    getItem(key) {
        return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
    }
    setItem(key, val) {
        this.store[key] = String(val);
    }
    removeItem(key) {
        delete this.store[key];
    }
    clear() {
        this.store = {};
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
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        mockLocalStorage.clear();
        mockSessionStorage.clear();
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
});
