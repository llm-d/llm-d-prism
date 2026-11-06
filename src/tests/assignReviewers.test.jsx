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
import { render, screen, fireEvent, cleanup, waitFor, renderHook, act } from '@testing-library/react';
import { GitHubAuthContext } from '../context/GitHubAuthContext.js';
import UploadValidationPage from '../components/DataConnections/SubmitValidationPage.jsx';
import { UnifiedDataTable } from '../components/ManageBenchmarks/UnifiedDataTable.jsx';
import { useDashboardData } from '../hooks/useDashboardData.jsx';
import {
    normalizeReviewers,
    forwardBundleMetadata,
    parseReportV02,
    groupStagesIntoRuns,
    stageToEntry
} from '../utils/benchmarkReportV02Parser.js';
import { validatePrismUploadStructure } from '../utils/benchmarkValidator.js';
import { resetMemoryStoreForTests } from '../utils/stagedBundlesStore.js';
import { PrismResultPayloadSchema, PrismResultContextSchema } from '../../server/results/api.ts';

const TEST_RUN_ID = 'f2d6adab-d296-46ae-b46b-dfcd6c6c74b2';
const ENTRY_RUN_ID = 'c7e1829b-9a21-4e78-8f64-2b4f21c39a10';

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

function buildValidRawReport() {
    return {
        version: '0.2',
        run: { uid: 'stage-0-uid' },
        workload: { stage: 0 },
        scenario: {
            model: { name: 'meta-llama/Llama-3.1-70B-Instruct' },
            host: {
                accelerator: [
                    { model: 'H100', count: 8 }
                ]
            },
            stack: [
                { standardized: { tool: 'vllm', tool_version: 'v0.6.0' } }
            ]
        },
        results: {
            request_performance: {
                aggregate: {
                    throughput: {
                        request_rate: { mean: 4.0 },
                        output_token_rate: { mean: 128.5 },
                        total_token_rate: { mean: 256.0 }
                    },
                    latency: {
                        request_latency: { mean: 0.25, p50: 0.24, p99: 0.4 },
                        time_to_first_token: { mean: 0.05, p50: 0.04, p99: 0.09 },
                        time_per_output_token: { mean: 0.01, p50: 0.01, p99: 0.02 }
                    }
                }
            }
        }
    };
}

function buildValidStagedBundle({ requestedReviewers } = {}) {
    return {
        id: TEST_RUN_ID,
        dirKey: 'llama-run-1',
        name: 'Llama 70B H100 Baseline',
        stageFiles: [],
        metadataFiles: {},
        isExpanded: false,
        isSkipped: false,
        targetDashboards: ['performance-browser'],
        validation: {
            format: 'brv02',
            hasHardware: true,
            errors: [],
            warnings: [],
            entries: [{ model_name: 'meta-llama/Llama-3.1-70B-Instruct', stage: 0 }]
        },
        payload: {
            runId: TEST_RUN_ID,
            runLabel: 'Llama 70B H100 Baseline',
            model_name: 'meta-llama/Llama-3.1-70B-Instruct',
            hardware: {
                hardware_name: 'H100',
                accelerator_count: 8
            },
            format: 'brv02',
            ...(requestedReviewers ? { requested_reviewers: requestedReviewers } : {}),
            entries: [
                {
                    run_id: ENTRY_RUN_ID,
                    run_description: 'Llama 70B H100 Baseline',
                    filename: 'stage_0_report.yaml',
                    prism_stage_index: 0,
                    raw_report: buildValidRawReport()
                }
            ]
        }
    };
}

function renderUploadWizard({
    auth = {},
    bundles = [buildValidStagedBundle()],
    wizardStep = '3',
    dashboardDataOverrides = {}
} = {}) {
    if (bundles !== null) {
        mockLocalStorage.setItem('prism_active_staged_bundles', JSON.stringify(bundles));
    }
    if (wizardStep !== null) {
        mockLocalStorage.setItem('prism_upload_wizard_step', String(wizardStep));
        mockLocalStorage.setItem('prism_submit_intent', 'submit-review');
    }

    const authValue = {
        user: { username: 'contributor', permission: 'user' },
        isAuthenticated: true,
        isConfigured: true,
        isPlaygroundMode: false,
        accessToken: 'gho_test_token',
        login: vi.fn(),
        logout: vi.fn(),
        isLoading: false,
        ...auth
    };

    const dashboardState = {
        baselineBenchmarkKey: null,
        setBaselineBenchmarkKey: vi.fn()
    };

    const dashboardData = {
        data: [],
        addToast: vi.fn(),
        removeToast: vi.fn(),
        toasts: [],
        brv02Runs: [],
        handleValidatedUpload: vi.fn().mockResolvedValue(undefined),
        loadSubmissions: vi.fn().mockResolvedValue(undefined),
        loadAllData: vi.fn().mockResolvedValue(undefined),
        clearAllBrv02Runs: vi.fn(),
        promoteStagedRunId: vi.fn(),
        removeBrv02Run: vi.fn(),
        ...dashboardDataOverrides
    };

    const rendered = render(
        <GitHubAuthContext.Provider value={authValue}>
            <UploadValidationPage
                onNavigateBack={vi.fn()}
                onNavigate={vi.fn()}
                dashboardState={dashboardState}
                dashboardData={dashboardData}
            />
        </GitHubAuthContext.Provider>
    );

    return { ...rendered, authValue, dashboardData };
}

function buildMockModelStat({
    runId = TEST_RUN_ID,
    submissionState = 'submitted_pending_review',
    authorUsername = 'alice',
    requestedReviewers
} = {}) {
    const entry = {
        id: `entry-${runId}`,
        run_id: runId,
        runLabel: 'llama-h100',
        model: 'meta-llama/Llama-3.1-70B-Instruct',
        model_name: 'meta-llama/Llama-3.1-70B-Instruct',
        hardware: 'H100',
        accelerator_count: 8,
        throughput: 1200,
        latency: { mean: 25 },
        ttft: { mean: 50 },
        time_per_output_token: 10,
        source: 'gcs:llm-d-benchmarks-staging',
        github_author: { username: authorUsername },
        ...(requestedReviewers ? { requested_reviewers: requestedReviewers } : {}),
        source_info: {
            type: 'benchmark_report_v02',
            origin: 'gcs:llm-d-benchmarks-staging',
            submission_state: submissionState,
            github_user: authorUsername,
            run_id: runId
        },
        metadata: {
            model_name: 'meta-llama/Llama-3.1-70B-Instruct',
            hardware: 'H100',
            accelerator_count: 8
        }
    };

    return {
        benchmarkKey: `results-store:${runId}`,
        runId,
        model: 'meta-llama/Llama-3.1-70B-Instruct',
        model_name: 'meta-llama/Llama-3.1-70B-Instruct',
        hardware: 'H100',
        accelerator_count: 8,
        maxTput: 1200,
        minLat: 25,
        peakRun: entry,
        uniqueIsl: [1024],
        uniqueOsl: [1024],
        data: [entry]
    };
}

describe('Issue #187 — Assign Reviewers Input, Persistence, and Review Queue UI', () => {
    beforeEach(() => {
        globalThis.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
        resetMemoryStoreForTests();
        mockLocalStorage.clear();
        mockSessionStorage.clear();
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        resetMemoryStoreForTests();
        mockLocalStorage.clear();
        mockSessionStorage.clear();
    });

    describe('normalizeReviewers & Schema Validation', () => {
        it('splits on commas, semicolons, and whitespace, strips leading @, and deduplicates case-insensitively', () => {
            expect(normalizeReviewers('@Alice, bob, @ALICE; charlie  dave,, ')).toEqual([
                'Alice',
                'bob',
                'charlie',
                'dave'
            ]);
            expect(normalizeReviewers(['@Octocat ', ' octocat', 'hubot, @mona'])).toEqual([
                'Octocat',
                'hubot',
                'mona'
            ]);
            expect(normalizeReviewers('')).toEqual([]);
            expect(normalizeReviewers(' , ; @  ')).toEqual([]);
            expect(normalizeReviewers(null)).toEqual([]);
            expect(normalizeReviewers(undefined)).toEqual([]);
        });

        it('validates requested_reviewers in PrismResultPayloadSchema, PrismResultContextSchema, and validatePrismUploadStructure', () => {
            const basePayload = buildValidStagedBundle().payload;

            expect(
                PrismResultPayloadSchema.safeParse({
                    ...basePayload,
                    requested_reviewers: ['alice', 'bob']
                }).success
            ).toBe(true);

            expect(
                PrismResultPayloadSchema.safeParse({
                    ...basePayload,
                    requested_reviewers: null
                }).success
            ).toBe(true);

            expect(
                PrismResultPayloadSchema.safeParse({
                    ...basePayload,
                    requested_reviewers: [123]
                }).success
            ).toBe(false);

            const structOk = validatePrismUploadStructure(
                { ...basePayload, requested_reviewers: ['alice', 'bob'] },
                { isUpload: true }
            );
            expect(structOk.isValid).toBe(true);

            const structBad = validatePrismUploadStructure(
                { ...basePayload, requested_reviewers: [123] },
                { isUpload: true }
            );
            expect(structBad.isValid).toBe(false);

            expect(
                PrismResultContextSchema.safeParse({
                    submission_state: { value: 'submitted_pending_review' },
                    github_user: { value: 'contributor' },
                    run_id: { value: TEST_RUN_ID },
                    hardware_name: { value: 'eSDEwMA' },
                    model_name: { value: 'eTGxhbWE' },
                    run_label: { value: 'eQmFzZWxpbmU' },
                    requested_reviewers: { value: 'eYWxpY2UsYm9i' }
                }).success
            ).toBe(true);
        });

        it('propagates requested_reviewers across forwardBundleMetadata, groupStagesIntoRuns, and stageToEntry', () => {
            const bundle = {
                ...buildValidStagedBundle().payload,
                requested_reviewers: ['Octocat', 'bob']
            };
            const parsedStage = parseReportV02(bundle.entries[0].raw_report, 'stage_0.yaml');
            forwardBundleMetadata(parsedStage, bundle, bundle.entries[0], 0);

            expect(parsedStage.requested_reviewers).toEqual(['Octocat', 'bob']);

            const runs = groupStagesIntoRuns([parsedStage]);
            expect(runs[0].requested_reviewers).toEqual(['Octocat', 'bob']);

            const flatEntry = stageToEntry(parsedStage);
            expect(flatEntry.requested_reviewers).toEqual(['Octocat', 'bob']);
        });
    });

    describe('SubmitValidationPage — Step 3 Input, OAuth Cache, Step 4 Summary, and Submit Payload', () => {
        it('allows typing commas and spaces naturally, renders removable @reviewer pills, and normalizes on blur', () => {
            renderUploadWizard();

            const input = screen.getByLabelText(/Assign Reviewers/i);
            expect(input).toBeTruthy();

            // Typing a trailing comma + space must NOT be stripped while focused
            fireEvent.change(input, { target: { value: '@Alice, ' } });
            expect(input.value).toBe('@Alice, ');

            const pillsContainer = screen.getByTestId('assigned-reviewer-pills');
            expect(pillsContainer.textContent).toContain('@Alice');

            // Continue typing multiple handles with duplicate casing
            fireEvent.change(input, { target: { value: '@Alice, @bob, alice, ' } });
            expect(input.value).toBe('@Alice, @bob, alice, ');
            expect(screen.getByLabelText('Remove reviewer Alice')).toBeTruthy();
            expect(screen.getByLabelText('Remove reviewer bob')).toBeTruthy();

            // On blur, raw draft clears and input displays normalized canonical string
            fireEvent.blur(input);
            expect(input.value).toBe('Alice, bob');

            // Removing a reviewer pill updates input and pills immediately
            fireEvent.click(screen.getByLabelText('Remove reviewer Alice'));
            expect(input.value).toBe('bob');
            expect(screen.queryByLabelText('Remove reviewer Alice')).toBeNull();
        });

        it('persists reviewers to localStorage on GitHub OAuth redirect and restores them on return', async () => {
            const loginSpy = vi.fn();
            // Start with pre-populated bundle reviewers while unauthenticated so user clicks Authenticate with GitHub
            const { unmount } = renderUploadWizard({
                auth: {
                    user: null,
                    isAuthenticated: false,
                    isConfigured: true,
                    login: loginSpy
                },
                bundles: [buildValidStagedBundle({ requestedReviewers: ['@Alice', 'bob'] })]
            });

            const authBtn = await screen.findByRole('button', { name: /Authenticate with GitHub/i });
            fireEvent.click(authBtn);

            await waitFor(() => {
                expect(loginSpy).toHaveBeenCalledWith({ showSubmitDialog: true });
            });
            expect(JSON.parse(mockLocalStorage.getItem('prism_staged_reviewers_cache'))).toEqual(['Alice', 'bob']);
            expect(
                mockLocalStorage.getItem('prism_staged_upload_cache') ||
                mockLocalStorage.getItem('prism_has_staged_upload_cache')
            ).toBeTruthy();

            unmount();
            // Simulate full cross-page reload clearing in-memory cache
            resetMemoryStoreForTests();

            // Simulate remounting after returning from GitHub OAuth (with staged upload cache + prism_staged_reviewers_cache)
            renderUploadWizard({
                bundles: null,
                wizardStep: null
            });

            const restoredInput = await screen.findByLabelText(/Assign Reviewers/i);
            expect(restoredInput.value).toBe('Alice, bob');
            await waitFor(() => {
                expect(mockLocalStorage.getItem('prism_staged_reviewers_cache')).toBeNull();
            });
        });

        it('displays assigned reviewers in Step 4 summary and includes requested_reviewers in POST /api/results payload', async () => {
            const postedBodies = [];
            globalThis.fetch = vi.fn(async (url, options = {}) => {
                if (String(url).startsWith('/api/results') && options.method === 'POST') {
                    postedBodies.push(JSON.parse(options.body));
                    return {
                        ok: true,
                        json: async () => ({
                            success: true,
                            runId: '99999999-8888-4777-8666-555555555555',
                            state: 'submitted_pending_review'
                        })
                    };
                }
                return { ok: true, json: async () => ({ items: [] }) };
            });
            window.fetch = globalThis.fetch;

            const { dashboardData } = renderUploadWizard();

            // Sign DCO checkbox on Step 3
            const dcoCheckbox = screen.getByRole('checkbox');
            fireEvent.click(dcoCheckbox);

            // Type reviewers without blurring before clicking Next
            const reviewerInput = screen.getByLabelText(/Assign Reviewers/i);
            fireEvent.change(reviewerInput, { target: { value: '@Alice, @bob, ' } });

            const nextBtn = screen.getByRole('button', { name: /Next/i });
            fireEvent.click(nextBtn);

            // Step 4 summary shows @Alice and @bob badges
            const step4Reviewers = screen.getByTestId('step4-assigned-reviewers');
            expect(step4Reviewers.textContent).toContain('@Alice');
            expect(step4Reviewers.textContent).toContain('@bob');

            // Submit for Public Review
            const submitBtn = screen.getByRole('button', { name: /Submit for Public Review/i });
            fireEvent.click(submitBtn);

            await waitFor(() => {
                expect(postedBodies.length).toBe(1);
            });

            expect(postedBodies[0].requested_reviewers).toEqual(['Alice', 'bob']);
            expect(dashboardData.handleValidatedUpload).toHaveBeenCalledTimes(1);
            expect(dashboardData.handleValidatedUpload.mock.calls[0][0][0].payload.requested_reviewers).toEqual([
                'Alice',
                'bob'
            ]);
        });

        it('shows "None (any maintainer)" on Step 4 and omits requested_reviewers when none are entered', async () => {
            const postedBodies = [];
            globalThis.fetch = vi.fn(async (url, options = {}) => {
                if (String(url).startsWith('/api/results') && options.method === 'POST') {
                    postedBodies.push(JSON.parse(options.body));
                    return {
                        ok: true,
                        json: async () => ({
                            success: true,
                            runId: '99999999-8888-4777-8666-555555555555',
                            state: 'submitted_pending_review'
                        })
                    };
                }
                return { ok: true, json: async () => ({ items: [] }) };
            });
            window.fetch = globalThis.fetch;

            renderUploadWizard({
                auth: { isPlaygroundMode: true }
            });

            fireEvent.click(screen.getByRole('button', { name: /Next/i }));

            expect(screen.getByTestId('step4-assigned-reviewers').textContent).toBe('None (any maintainer)');

            fireEvent.click(screen.getByRole('button', { name: /Submit for Public Review/i }));

            await waitFor(() => {
                expect(postedBodies.length).toBe(1);
            });

            expect(postedBodies[0].requested_reviewers).toBeUndefined();
        });
    });

    describe('Review Queue Row Badge, Metadata Modal, and useDashboardData Mapping', () => {
        it('renders row-requested-reviewers badge on in-review rows, omits on public rows, and renders modal-requested-reviewers in details modal', () => {
            const stat = buildMockModelStat({
                runId: TEST_RUN_ID,
                submissionState: 'submitted_pending_review'
            });
            const submissionsMap = {
                [TEST_RUN_ID]: {
                    runId: TEST_RUN_ID,
                    status: 'submitted_pending_review',
                    requested_reviewers: ['alice', 'bob', 'charlie'],
                    github_author: { username: 'contributor' }
                }
            };

            const { unmount } = render(
                <GitHubAuthContext.Provider
                    value={{
                        user: { username: 'admin', permission: 'admin' },
                        isPlaygroundMode: false,
                        accessToken: 'admin-token',
                        isAuthenticated: true,
                        isLoading: false
                    }}
                >
                    <UnifiedDataTable
                        modelStats={[stat]}
                        selectedModels={new Set()}
                        filteredBySource={stat.data}
                        selectedBenchmarks={new Set()}
                        setSelectedBenchmarks={vi.fn()}
                        setActiveFilters={vi.fn()}
                        expandedModels={new Set([stat.benchmarkKey])}
                        toggleModelExpansion={vi.fn()}
                        includeUnlisted={true}
                        submissionsMap={submissionsMap}
                        updateSubmissionStatus={vi.fn()}
                        deleteSubmission={vi.fn()}
                    />
                </GitHubAuthContext.Provider>
            );

            // Compact row chip truncates >2 reviewers to "@alice +2"
            const rowBadge = screen.getByTestId('row-requested-reviewers');
            expect(rowBadge.textContent).toContain('Reviewers: @alice +2');

            // Open Benchmark Run Metadata modal
            const infoBtn = screen.getByTitle('View full benchmark run metadata and lineage');
            fireEvent.click(infoBtn);

            const modalReviewers = screen.getByTestId('modal-requested-reviewers');
            expect(modalReviewers.textContent).toContain('@alice');
            expect(modalReviewers.textContent).toContain('@bob');
            expect(modalReviewers.textContent).toContain('@charlie');

            unmount();

            // Public rows should NOT display the pending-review requested reviewers chip
            const publicStat = buildMockModelStat({
                runId: TEST_RUN_ID,
                submissionState: 'public'
            });
            render(
                <GitHubAuthContext.Provider
                    value={{
                        user: { username: 'admin', permission: 'admin' },
                        isPlaygroundMode: false,
                        accessToken: 'admin-token',
                        isAuthenticated: true,
                        isLoading: false
                    }}
                >
                    <UnifiedDataTable
                        modelStats={[publicStat]}
                        selectedModels={new Set()}
                        filteredBySource={publicStat.data}
                        selectedBenchmarks={new Set()}
                        setSelectedBenchmarks={vi.fn()}
                        setActiveFilters={vi.fn()}
                        expandedModels={new Set()}
                        toggleModelExpansion={vi.fn()}
                        includeUnlisted={true}
                        submissionsMap={{
                            [TEST_RUN_ID]: {
                                runId: TEST_RUN_ID,
                                status: 'public',
                                requested_reviewers: ['alice', 'bob']
                            }
                        }}
                        updateSubmissionStatus={vi.fn()}
                        deleteSubmission={vi.fn()}
                    />
                </GitHubAuthContext.Provider>
            );

            expect(screen.queryByTestId('row-requested-reviewers')).toBeNull();
        });

        it('maps requested_reviewers from /api/results onto submissions in useDashboardData', async () => {
            globalThis.fetch = vi.fn(async (url) => {
                if (String(url).includes('/api/results')) {
                    return {
                        ok: true,
                        json: async () => ({
                            items: [
                                {
                                    runId: TEST_RUN_ID,
                                    runLabel: 'Llama Run',
                                    model_name: 'meta-llama/Llama-3.1-70B-Instruct',
                                    hardware: { hardware_name: 'H100', accelerator_count: 8 },
                                    format: 'brv02',
                                    state: 'submitted_pending_review',
                                    github_author: { username: 'contributor' },
                                    requested_reviewers: ['Octocat', 'bob']
                                }
                            ],
                            nextPageToken: null
                        })
                    };
                }
                return { ok: true, json: async () => ({}) };
            });
            window.fetch = globalThis.fetch;

            const wrapper = ({ children }) => (
                <GitHubAuthContext.Provider
                    value={{
                        user: { username: 'admin', permission: 'admin' },
                        isPlaygroundMode: false,
                        accessToken: 'admin-token',
                        isAuthenticated: true,
                        isLoading: false
                    }}
                >
                    {children}
                </GitHubAuthContext.Provider>
            );

            const { result } = renderHook(() => useDashboardData({}, {}), { wrapper });

            await act(async () => {
                await result.current.loadSubmissions(true);
            });

            expect(result.current.submissionsMap[TEST_RUN_ID]?.requested_reviewers).toEqual(['Octocat', 'bob']);
        });
    });
});
