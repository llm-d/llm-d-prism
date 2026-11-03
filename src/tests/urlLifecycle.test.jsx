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
import { render, waitFor, fireEvent, cleanup } from '@testing-library/react';
import App from '../App.jsx';
import { GitHubAuthProvider } from '../components/GitHubAuthProvider.jsx';
import { encodeShareLink } from '../utils/shareLinkEncoder.js';

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

describe('URL Parameter Lifecycle Integration Tests', () => {
    let mockFetch;

    beforeEach(() => {
        // Setup ResizeObserver stub for recharts / layout
        globalThis.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };

        // Setup scrollTo stub
        window.scrollTo = vi.fn();

        // Clear storage
        mockLocalStorage.clear();
        mockSessionStorage.clear();

        // Mock fetch for backend APIs
        mockFetch = vi.fn().mockImplementation(async (url) => {
            const urlStr = url.toString();

            if (urlStr.includes('/api/config')) {
                return {
                    ok: true,
                    json: async () => ({
                        defaultBuckets: [],
                        resultsStoreBucket: 'llm-d-benchmarks',
                        playgroundMode: true
                    })
                };
            }

            if (urlStr.includes('/api/auth/session')) {
                return {
                    ok: true,
                    json: async () => ({ authenticated: false, user: null })
                };
            }

            if (urlStr.includes('/api/results/submissions')) {
                return {
                    ok: true,
                    json: async () => ({ items: [] })
                };
            }

            if (urlStr.includes('/api/results/')) {
                const runId = urlStr.split('/api/results/')[1]?.split('?')[0];
                return {
                    ok: true,
                    json: async () => ({
                        runId: runId,
                        runLabel: 'Test Shared Run',
                        submission_state: 'public',
                        entries: [
                            {
                                filename: 'report.json',
                                raw_report: {
                                    version: '0.2',
                                    scenario: {
                                        stack: [{
                                            standardized: {
                                                role: 'aggregate',
                                                model: { name: 'test-model' },
                                                accelerator: { model: 'H100', count: 1 },
                                            },
                                        }],
                                        load: { standardized: { tool: 'vllm' } },
                                    },
                                    results: {
                                        request_performance: {
                                            aggregate: {
                                                throughput: {
                                                    output_token_rate: { mean: 100 },
                                                    total_token_rate: { mean: 150 }
                                                }
                                            },
                                        },
                                    }
                                }
                            }
                        ]
                    })
                };
            }

            // Default empty json
            return {
                ok: true,
                json: async () => ({})
            };
        });
        globalThis.fetch = mockFetch;
        window.fetch = mockFetch;
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        mockLocalStorage.clear();
        mockSessionStorage.clear();
    });

    it('renders and verifies that opening a benchmark share link clears stale localStorage selections and cleans URL', async () => {
        // 1. Seed localStorage with stale selections from an earlier session
        localStorage.setItem('prism_selected_benchmarks', JSON.stringify(['stale-run-key-1', 'stale-run-key-2']));

        // 2. Set the initial window URL with a shared benchmark link
        const targetUuid = '0d778b34-7689-440e-ac10-911d8c4fed92';
        const encoded = encodeShareLink([targetUuid]);
        window.history.replaceState(null, '', `/?benchmarks=${encoded}`);

        // 3. Render App inside GitHubAuthProvider
        render(
            <GitHubAuthProvider>
                <App />
            </GitHubAuthProvider>
        );

        // 4. Verify that ?benchmarks= query param gets cleared via replaceState
        await waitFor(() => {
            const currentParams = new URLSearchParams(window.location.search);
            expect(currentParams.has('benchmarks')).toBe(false);
        });

        // 5. Verify that stale selections were cleared and replaced by the shared benchmark key
        await waitFor(() => {
            const saved = localStorage.getItem('prism_selected_benchmarks');
            expect(saved).not.toBeNull();
            const parsed = JSON.parse(saved);
            expect(parsed).toContain(`results-store:${targetUuid}`);
            expect(parsed).not.toContain('stale-run-key-1');
            expect(parsed).not.toContain('stale-run-key-2');
        });
    });

    it('clears ResultsStore filter params (f_*) and src when navigating away from results-store', async () => {
        // Start on results-store with active filter params
        window.history.replaceState(null, '', '/?view=results-store&f_hw=H100&f_models=llama&q=test&src=local');

        const { unmount } = render(
            <GitHubAuthProvider>
                <App />
            </GitHubAuthProvider>
        );

        // Verify ?src= was stripped by useDashboardData / App on mount
        await waitFor(() => {
            const params = new URLSearchParams(window.location.search);
            expect(params.has('src')).toBe(false);
        });

        // Unmount ResultsStore (simulating navigation away)
        unmount();

        // Verify ResultsStore unmount effect cleans up f_* and extra results-store params
        const finalParams = new URLSearchParams(window.location.search);
        expect(finalParams.has('f_hw')).toBe(false);
        expect(finalParams.has('f_models')).toBe(false);
        expect(finalParams.has('q')).toBe(false);
    });

    it('strips #access_token= OAuth hash on mount while preserving query parameters', async () => {
        window.history.replaceState(null, '', '/?view=results-store#access_token=dummy_oauth_token_123&expires_in=3600');

        render(
            <GitHubAuthProvider>
                <App />
            </GitHubAuthProvider>
        );

        await waitFor(() => {
            expect(window.location.hash).toBe('');
            expect(localStorage.getItem('prism_github_access_token')).toBe('dummy_oauth_token_123');
            const params = new URLSearchParams(window.location.search);
            expect(params.get('view')).toBe('results-store');
        });
    });

    it('preserves graph filter parameters (c_mode=ttft, t_type=total) when opening a benchmark share link', async () => {
        const targetUuid = '0d778b34-7689-440e-ac10-911d8c4fed92';
        const encoded = encodeShareLink([targetUuid]);
        window.history.replaceState(null, '', `/?view=results-store&benchmarks=${encoded}&c_mode=ttft&t_type=total`);

        render(
            <GitHubAuthProvider>
                <App />
            </GitHubAuthProvider>
        );

        // Verify that drawer opens with TTFT selected as X-Axis and Total as Y-Axis (Total Tokens/sec vs Time To First Token)
        await waitFor(() => {
            const headings = Array.from(document.body.querySelectorAll('h3'));
            const chartHeading = headings.find(h => h.textContent.includes('Total Tokens/sec vs Time To First Token'));
            expect(chartHeading).toBeDefined();
        });

        // Toggle the drawer chart filter panel so axis buttons are rendered
        const chartFilterBtn = Array.from(document.body.querySelectorAll('button')).find(
            btn => btn.textContent.trim() === 'Filters'
        );
        expect(chartFilterBtn).toBeDefined();
        fireEvent.click(chartFilterBtn);

        // Verify active buttons have proper active highlight classes
        await waitFor(() => {
            const allButtons = document.body.querySelectorAll('button');
            const activeTtft = Array.from(allButtons).find(btn => btn.textContent.trim() === 'TTFT' && btn.className.includes('bg-indigo-600'));
            expect(activeTtft).toBeDefined();

            const activeTotal = Array.from(allButtons).find(btn => btn.textContent.trim() === 'Total' && btn.className.includes('bg-emerald-600'));
            expect(activeTotal).toBeDefined();
        });
    });

    it('restores default graph filters when opening a benchmark share link where defaults were omitted', async () => {
        const targetUuid = '0d778b34-7689-440e-ac10-911d8c4fed92';
        const encoded = encodeShareLink([targetUuid]);
        // Share link without any graph filter parameters (defaults were omitted)
        window.history.replaceState(null, '', `/?view=results-store&benchmarks=${encoded}`);

        render(
            <GitHubAuthProvider>
                <App />
            </GitHubAuthProvider>
        );

        // Verify that drawer opens with default chart heading: Output Tokens/sec vs Time Per Output Token
        await waitFor(() => {
            const headings = Array.from(document.body.querySelectorAll('h3'));
            const chartHeading = headings.find(h => h.textContent.includes('Output Tokens/sec vs Time Per Output Token'));
            expect(chartHeading).toBeDefined();
        });

        // Toggle the drawer chart filter panel so axis buttons are rendered
        const chartFilterBtn = Array.from(document.body.querySelectorAll('button')).find(
            btn => btn.textContent.trim() === 'Filters'
        );
        expect(chartFilterBtn).toBeDefined();
        fireEvent.click(chartFilterBtn);

        // Verify default active buttons have proper active highlight classes (TPOT and Output)
        await waitFor(() => {
            const allButtons = document.body.querySelectorAll('button');
            const activeTpot = Array.from(allButtons).find(btn => btn.textContent.trim() === 'TPOT' && btn.className.includes('bg-indigo-600'));
            expect(activeTpot).toBeDefined();

            const activeOutput = Array.from(allButtons).find(btn => btn.textContent.trim() === 'Output' && btn.className.includes('bg-emerald-600'));
            expect(activeOutput).toBeDefined();
        });
    });

    it('triggers automatic database refetch when shared results are missing while keeping all targets selected', async () => {
        const uuid1 = '0d778b34-7689-440e-ac10-911d8c4fed92';
        const uuid2 = '11111111-2222-3333-4444-555555555555';
        const encoded = encodeShareLink([uuid1, uuid2]);
        window.history.replaceState(null, '', `/?view=results-store&benchmarks=${encoded}`);

        render(
            <GitHubAuthProvider>
                <App />
            </GitHubAuthProvider>
        );

        // Verify all targets remain selected even if missing from initial cache
        await waitFor(() => {
            const saved = localStorage.getItem('prism_selected_benchmarks');
            expect(saved).not.toBeNull();
            const parsed = JSON.parse(saved);
            expect(parsed).toContain(`results-store:${uuid1}`);
            expect(parsed).toContain(`results-store:${uuid2}`);
        });

        // Verify refetch database occurred (indicated by repeated calls to local list or data endpoints)
        await waitFor(() => {
            const fetchUrls = mockFetch.mock.calls.map(c => c[0].toString());
            expect(fetchUrls.some(u => u.includes('/api/results/11111111-2222-3333-4444-555555555555'))).toBe(true);
            expect(fetchUrls.filter(u => u.includes('/api/local/list') || u.includes('/data.json')).length).toBeGreaterThanOrEqual(1);
        });
    });

    it('on Benchmark Browser (?view=benchmark-browser), selecting a published BRV02 benchmark enables Share view button and clicking it copies share URL', async () => {
        const targetUuid = '0d778b34-7689-440e-ac10-911d8c4fed92';
        const writeTextMock = vi.fn().mockResolvedValue();
        Object.assign(navigator, {
            clipboard: {
                writeText: writeTextMock
            }
        });

        // Seed with a published BRV02 benchmark key while selectedSources includes 'local'
        localStorage.setItem('prism_selected_benchmarks', JSON.stringify([`results-store:${targetUuid}`]));
        localStorage.setItem('prism_selected_sources', JSON.stringify(['local']));
        window.history.replaceState(null, '', '/?view=benchmark-browser');

        render(
            <GitHubAuthProvider>
                <App />
            </GitHubAuthProvider>
        );

        // Share view button should be enabled even though 'local' is in selectedSources
        await waitFor(() => {
            const shareBtn = Array.from(document.body.querySelectorAll('button')).find(
                b => b.textContent.includes('Share view')
            );
            expect(shareBtn).toBeDefined();
            expect(shareBtn.disabled).toBe(false);
        });

        const shareBtn = Array.from(document.body.querySelectorAll('button')).find(
            b => b.textContent.includes('Share view')
        );
        fireEvent.click(shareBtn);

        await waitFor(() => {
            expect(writeTextMock).toHaveBeenCalled();
            const copiedUrl = writeTextMock.mock.calls[0][0];
            expect(copiedUrl).toContain('view=benchmark-browser');
            expect(decodeURIComponent(copiedUrl)).toContain(`models=results-store:${targetUuid}`);
        });
    });

    it('selecting a local or staged BRV02 benchmark disables the Share view button', async () => {
        const stagedUuid = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';
        localStorage.setItem('prism_selected_benchmarks', JSON.stringify([`brv02:${stagedUuid}`]));
        window.history.replaceState(null, '', '/?view=benchmark-browser');

        render(
            <GitHubAuthProvider>
                <App />
            </GitHubAuthProvider>
        );

        await waitFor(() => {
            const shareBtn = Array.from(document.body.querySelectorAll('button')).find(
                b => b.textContent.includes('Share view')
            );
            expect(shareBtn).toBeDefined();
            expect(shareBtn.disabled).toBe(true);
        });
    });

    it('opening a share URL keeps results-store:<uuid> selected on Benchmark Browser', async () => {
        const targetUuid = '0d778b34-7689-440e-ac10-911d8c4fed92';
        window.history.replaceState(null, '', `/?share=1&view=benchmark-browser&models=results-store:${targetUuid}`);

        render(
            <GitHubAuthProvider>
                <App />
            </GitHubAuthProvider>
        );

        await waitFor(() => {
            const saved = localStorage.getItem('prism_selected_benchmarks');
            expect(saved).not.toBeNull();
            const parsed = JSON.parse(saved);
            expect(parsed).toContain(`results-store:${targetUuid}`);
        });
    });

    it('forwards prism_github_access_token as X-Prism-Github-Token when hydrating shared runs', async () => {
        const missingUuid = '11111111-2222-4333-8444-555555555555';
        localStorage.setItem('prism_github_access_token', 'gho_share_link_token');
        const encoded = encodeShareLink([missingUuid]);
        window.history.replaceState(null, '', `/?view=results-store&benchmarks=${encoded}`);

        render(
            <GitHubAuthProvider>
                <App />
            </GitHubAuthProvider>
        );

        await waitFor(() => {
            const resultFetchCall = mockFetch.mock.calls.find(([url]) =>
                url.toString().includes(`/api/results/${missingUuid}`)
            );
            expect(resultFetchCall).toBeDefined();
            const [, options] = resultFetchCall;
            expect(options?.headers?.['X-Prism-Github-Token']).toBe('gho_share_link_token');
        });
    });
});
