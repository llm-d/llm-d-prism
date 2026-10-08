// Copyright 2026 The llm-d Authors
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

/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GitHubAuthContext } from '../../context/GitHubAuthContext';
import { FilterPanel } from './FilterPanel';

const benchmark = (runId, status, source = 'gcs:results-store') => ({
    benchmarkKey: runId,
    data: [{
        run_id: runId,
        source,
        source_info: { type: 'benchmark_report_v02', submission_state: status },
        github_author: { username: 'alice' },
    }],
});

const panel = (modelStats, { isPlaygroundMode = true, user = null, submissionsMap = {} } = {}) => (
    <GitHubAuthContext.Provider value={{ user, isPlaygroundMode }}>
        <FilterPanel
            showFilterPanel
            filterOptions={{ models: [], hardware: [], tags: [] }}
            activeFilters={{ models: new Set(), hardware: new Set() }}
            facetCounts={{}}
            modelStats={modelStats}
            submissionsMap={submissionsMap}
            kpiFilter={null}
        />
    </GitHubAuthContext.Provider>
);

const publicCount = () => screen.getByRole('button', { name: /^Public Store\s*\d+$/ }).textContent;

afterEach(() => {
    cleanup();
    localStorage.clear();
});

describe('Public Store benchmark count', () => {
    it.each([true, false])('excludes local pending benchmarks with playground mode %s', (isPlaygroundMode) => {
        const publicBenchmarks = Array.from({ length: 167 }, (_, i) => benchmark(`public-${i}`, 'public'));
        const stagedBenchmarks = Array.from({ length: 23 }, (_, i) => benchmark(`local-${i}`, 'staged', `brv02:local-${i}`));
        const { rerender } = render(panel(publicBenchmarks, { isPlaygroundMode }));

        expect(publicCount()).toBe('Public Store167');

        rerender(panel([...publicBenchmarks, ...stagedBenchmarks], { isPlaygroundMode }));

        expect(publicCount()).toBe('Public Store167');
        expect(screen.getByText('Total Runs').nextElementSibling.textContent).toBe('167');
        const pendingLabel = isPlaygroundMode ? 'Pending Benchmarks' : 'My Benchmarks';
        expect(screen.getByRole('button', { name: new RegExp(`^${pendingLabel}\\s*23$`) })).toBeDefined();
    });

    it('counts built-in and published benchmarks independently of their owner', () => {
        const benchmarks = [
            { benchmarkKey: 'builtin', data: [{ source: 'llm-d:builtin' }] },
            ...['public', 'promoted', 'approved', 'staged', 'unlisted', 'processing', 'submitted_pending_review', 'rejected']
                .map(status => benchmark(status, status)),
        ];
        const { rerender } = render(panel(benchmarks, { isPlaygroundMode: false, user: { username: 'alice' } }));

        expect(publicCount()).toBe('Public Store4');

        rerender(panel(benchmarks, { isPlaygroundMode: false, user: { username: 'bob' } }));

        expect(publicCount()).toBe('Public Store4');
    });

    it('uses the latest submission status for local and remote benchmarks', () => {
        const benchmarks = [
            benchmark('local', 'staged', 'brv02:local'),
            benchmark('remote', 'public'),
        ];
        const { rerender } = render(panel(benchmarks, {
            submissionsMap: { local: { status: 'approved' }, remote: { status: 'unlisted' } },
        }));

        expect(publicCount()).toBe('Public Store1');

        rerender(panel(benchmarks, {
            submissionsMap: { local: { status: 'staged' }, remote: { status: 'unlisted' } },
        }));

        expect(publicCount()).toBe('Public Store0');
    });
});
