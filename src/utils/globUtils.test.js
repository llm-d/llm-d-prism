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

import { describe, it, expect } from 'vitest';
import {
    globToRegexPattern,
    createGlobMatcher,
    matchesGlob,
    matchesBenchmarkStat
} from './globUtils';

describe('globUtils', () => {
    describe('globToRegexPattern', () => {
        it('should return empty string for empty inputs', () => {
            expect(globToRegexPattern('')).toBe('');
            expect(globToRegexPattern(null)).toBe('');
            expect(globToRegexPattern(undefined)).toBe('');
        });

        it('should escape regex special characters', () => {
            expect(globToRegexPattern('llama-3.1')).toBe('llama-3\\.1');
            expect(globToRegexPattern('(tp=8)')).toBe('\\(tp=8\\)');
            expect(globToRegexPattern('[vllm]')).toBe('\\[vllm\\]');
            expect(globToRegexPattern('a+b^c$d{e}|f\\g')).toBe('a\\+b\\^c\\$d\\{e\\}\\|f\\\\g');
        });

        it('should convert * to .* and collapse consecutive asterisks', () => {
            expect(globToRegexPattern('llama*8b')).toBe('llama.*8b');
            expect(globToRegexPattern('*llama*')).toBe('.*llama.*');
            expect(globToRegexPattern('llama***8b')).toBe('llama.*8b');
        });

        it('should convert ? to .', () => {
            expect(globToRegexPattern('llama-?-8b')).toBe('llama-.-8b');
            expect(globToRegexPattern('???')).toBe('...');
        });

        it('should handle combined * and ? with special characters', () => {
            expect(globToRegexPattern('meta-llama-3.1*8b?(tp=1)')).toBe('meta-llama-3\\.1.*8b.\\(tp=1\\)');
        });
    });

    describe('createGlobMatcher & matchesGlob', () => {
        it('should match plain substring queries anywhere in target', () => {
            const matcher = createGlobMatcher('llama');
            expect(matcher('meta-llama-3-8b')).toBe(true);
            expect(matcher('LLAMA-3-70B')).toBe(true);
            expect(matcher('mistral-7b')).toBe(false);
        });

        it('should match with * wildcard anywhere in the string', () => {
            expect(matchesGlob('llama*8b', 'meta-llama-3-8b-instruct')).toBe(true);
            expect(matchesGlob('llama*8b', 'meta-llama-3-70b-instruct')).toBe(false);
            expect(matchesGlob('*8b', 'meta-llama-3-8b')).toBe(true);
            expect(matchesGlob('8b*', '8b-instruct-v0.1')).toBe(true);
            expect(matchesGlob('*llama*', 'meta-llama-3-8b')).toBe(true);
            expect(matchesGlob('h100*sxm*80gb', '8x NVIDIA H100 SXM5 80GB HBM3')).toBe(true);
            expect(matchesGlob('h100*sxm*80gb', '8x NVIDIA H100 PCIe 80GB')).toBe(false);
        });

        it('should match with ? single character wildcard', () => {
            expect(matchesGlob('llama-?-8b', 'meta-llama-3-8b')).toBe(true);
            expect(matchesGlob('llama-?-8b', 'meta-llama-2-8b')).toBe(true);
            expect(matchesGlob('llama-?-8b', 'meta-llama-3.1-8b')).toBe(false);
            expect(matchesGlob('llama-?.?-8b', 'meta-llama-3.1-8b')).toBe(true);
        });

        it('should treat regex special characters as literal text', () => {
            expect(matchesGlob('llama-3.1', 'meta-llama-3.1-8b')).toBe(true);
            expect(matchesGlob('llama-3.1', 'meta-llama-301-8b')).toBe(false);
            expect(matchesGlob('(tp=8)', 'vLLM (tp=8) config')).toBe(true);
            expect(matchesGlob('(tp=8)', 'vLLM (tp=4) config')).toBe(false);
            expect(matchesGlob('[vllm]', '[vllm] serving engine')).toBe(true);
            expect(matchesGlob('a+b', 'a+b')).toBe(true);
            expect(matchesGlob('a+b', 'ab')).toBe(false);
        });

        it('should respect case sensitivity option', () => {
            expect(matchesGlob('LLAMA', 'meta-llama-3-8b', { caseSensitive: false })).toBe(true);
            expect(matchesGlob('LLAMA', 'meta-llama-3-8b', { caseSensitive: true })).toBe(false);
            expect(matchesGlob('llama', 'meta-llama-3-8b', { caseSensitive: true })).toBe(true);
        });

        it('should match all for empty or whitespace query', () => {
            expect(matchesGlob('', 'anything')).toBe(true);
            expect(matchesGlob('   ', 'anything')).toBe(true);
            expect(matchesGlob(null, 'anything')).toBe(true);
            expect(matchesGlob(undefined, 'anything')).toBe(true);
        });

        it('should return false safely for null or undefined target', () => {
            expect(matchesGlob('test', null)).toBe(false);
            expect(matchesGlob('test', undefined)).toBe(false);
        });

        it('should coerce numbers or other types to string', () => {
            expect(matchesGlob('*80*', 80)).toBe(true);
            expect(matchesGlob('?0', 80)).toBe(true);
            expect(matchesGlob('?0', 800)).toBe(true);
        });
    });

    describe('matchesBenchmarkStat', () => {
        it('matches tags on underlying run data', () => {
            const stat = { data: [{ metadata: { tags: ['baseline', 'latency'] } }] };
            expect(matchesBenchmarkStat(stat, createGlobMatcher('latency'))).toBe(true);
            expect(matchesBenchmarkStat(stat, createGlobMatcher('base*'))).toBe(true);
            expect(matchesBenchmarkStat(stat, createGlobMatcher('throughput'))).toBe(false);
        });

        const sampleStat = {
            benchmarkKey: 'meta-llama/Meta-Llama-3-70B-Instruct::8x H100 SXM5 80GB::vLLM 0.6.3::isl=512_osl=128',
            model: 'meta-llama/Meta-Llama-3-70B-Instruct',
            model_name: 'Meta-Llama-3-70B-Instruct',
            hardware: '8x NVIDIA H100 SXM5 80GB',
            configuration: 'vLLM 0.6.3 (tp=8)',
            runLabel: 'Baseline vLLM v0.6.3 benchmark',
            forked_from: 'run-12345-orig',
            github_author: { username: 'octocat', name: 'Mona Lisa Octocat' },
            source: 'gcs:llm-d-benchmarks',
            source_info: {
                origin: 'gcs:llm-d-benchmarks',
                file_identifier: 'llama3-70b-h100.json'
            },
            data: [
                {
                    run_id: 'run-98765-uuid',
                    filename: 'report-2026-03-26.json',
                    backend: 'vLLM',
                    model: 'Meta-Llama-3-70B-Instruct',
                    hardware: '8x NVIDIA H100 SXM5 80GB'
                }
            ]
        };

        it('should match on model name with glob wildcards', () => {
            expect(matchesBenchmarkStat(sampleStat, 'llama*70b')).toBe(true);
            expect(matchesBenchmarkStat(sampleStat, 'llama*8b')).toBe(false);
            expect(matchesBenchmarkStat(sampleStat, '*llama*instruct')).toBe(true);
        });

        it('should match on hardware with glob wildcards', () => {
            expect(matchesBenchmarkStat(sampleStat, 'h100*80gb')).toBe(true);
            expect(matchesBenchmarkStat(sampleStat, 'h100*pcie')).toBe(false);
            expect(matchesBenchmarkStat(sampleStat, '?x nvidia*')).toBe(true);
        });

        it('should match on configuration', () => {
            expect(matchesBenchmarkStat(sampleStat, 'vllm*tp=8')).toBe(true);
            expect(matchesBenchmarkStat(sampleStat, 'vllm*tp=4')).toBe(false);
            expect(matchesBenchmarkStat(sampleStat, 'vllm 0.6.?')).toBe(true);
        });

        it('should match on runLabel', () => {
            expect(matchesBenchmarkStat(sampleStat, 'baseline*v0.6.3*')).toBe(true);
        });

        it('should match across full benchmarkKey', () => {
            expect(matchesBenchmarkStat(sampleStat, 'llama*h100*vllm')).toBe(true);
        });

        it('should match on github author', () => {
            expect(matchesBenchmarkStat(sampleStat, 'octocat')).toBe(true);
            expect(matchesBenchmarkStat(sampleStat, 'mona*lisa')).toBe(true);
        });

        it('should match on source or file identifier', () => {
            expect(matchesBenchmarkStat(sampleStat, 'llama3*h100.json')).toBe(true);
            expect(matchesBenchmarkStat(sampleStat, 'gcs:llm-d-*')).toBe(true);
        });

        it('should match on data run_id or filename', () => {
            expect(matchesBenchmarkStat(sampleStat, 'run-98765*')).toBe(true);
            expect(matchesBenchmarkStat(sampleStat, 'report-2026-*.json')).toBe(true);
        });

        it('should accept pre-compiled matcher function', () => {
            const matcher = createGlobMatcher('llama*70b');
            expect(matchesBenchmarkStat(sampleStat, matcher)).toBe(true);
        });

        it('should handle null or empty values gracefully', () => {
            expect(matchesBenchmarkStat(null, 'llama')).toBe(false);
            expect(matchesBenchmarkStat(sampleStat, '')).toBe(true);
            expect(matchesBenchmarkStat(sampleStat, null)).toBe(true);
        });
    });
});
