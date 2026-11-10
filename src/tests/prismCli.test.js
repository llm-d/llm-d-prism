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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';
import { runPrismCli, DEFAULT_API_URL } from '../../cli/prism.ts';
import { decodeShareLink } from '../utils/shareLinkEncoder.js';

function createSampleBrv02Report({
    model = 'meta-llama/Llama-3.1-70B-Instruct',
    hardware = 'H100',
    count = 8,
    tool = 'vLLM',
    toolVersion = 'v0.6.3',
    stageIndex = 0,
    outputTput = 1200,
    ttftMeanSec = 0.045,
    tpotMeanSec = 0.012,
    e2eMeanSec = 1.2,
    totalRequests = 100,
    failures = 0,
    extraNote = '',
} = {}) {
    return yaml.dump({
        version: '0.2',
        run: {
            uid: `stage-${stageIndex}`,
            eid: 'exp-123',
            description: `Run Stage ${stageIndex} ${extraNote}`.trim(),
            time: { start: '2026-11-06T12:00:00Z' },
        },
        scenario: {
            stack: [
                {
                    standardized: {
                        kind: 'inference_engine',
                        tool,
                        tool_version: toolVersion,
                        role: 'aggregate',
                        model: { name: model },
                        accelerator: {
                            model: hardware,
                            count,
                            parallelism: { tp: count },
                        },
                    },
                },
            ],
            load: {
                standardized: {
                    stage: stageIndex,
                    tool: 'inference-perf',
                    tool_version: 'v0.5.0',
                    input_seq_len: { value: 1024 },
                    output_seq_len: { value: 512 },
                    rate_qps: 10,
                    concurrency: 32,
                },
            },
        },
        results: {
            request_performance: {
                aggregate: {
                    requests: {
                        total: totalRequests,
                        failures,
                    },
                    throughput: {
                        output_token_rate: { mean: outputTput, units: 'tokens/s' },
                        input_token_rate: { mean: outputTput * 2, units: 'tokens/s' },
                        total_token_rate: { mean: outputTput * 3, units: 'tokens/s' },
                        request_rate: { mean: 10, units: 'queries/s' },
                    },
                    latency: {
                        time_to_first_token: { mean: ttftMeanSec, p50: ttftMeanSec, p99: ttftMeanSec * 1.5, units: 's' },
                        time_per_output_token: { mean: tpotMeanSec, p50: tpotMeanSec, p99: tpotMeanSec * 1.2, units: 's/token' },
                        request_latency: { mean: e2eMeanSec, p50: e2eMeanSec, p99: e2eMeanSec * 1.4, units: 's' },
                    },
                },
            },
        },
    });
}

describe('prism-results CLI (cli/prism.ts)', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-cli-test-'));
    });

    afterEach(() => {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('initializes experiment.yaml from a multi-arm directory and scrubs PII', async () => {
        const arm1Dir = path.join(tmpDir, 'arm_01_baseline');
        const arm2Dir = path.join(tmpDir, 'arm_02_offload');
        fs.mkdirSync(arm1Dir, { recursive: true });
        fs.mkdirSync(arm2Dir, { recursive: true });

        fs.writeFileSync(
            path.join(arm1Dir, 'benchmark_report_stage_0.yaml'),
            createSampleBrv02Report({
                outputTput: 1000,
                extraNote: 'HF_TOKEN=hf_abcdefghijklmnopqrstuvwxyz123456 on /Users/alice/work',
            }),
            'utf8'
        );
        fs.writeFileSync(
            path.join(arm2Dir, 'benchmark_report_stage_0.yaml'),
            createSampleBrv02Report({ outputTput: 1450 }),
            'utf8'
        );

        const stdoutLines = [];
        const res = await runPrismCli(
            [
                'init',
                tmpDir,
                '--experiment-label',
                'KV Offload Campaign',
                '--baseline',
                'arm_01_baseline',
                '--json',
            ],
            { stdout: (m) => stdoutLines.push(m) }
        );

        expect(res.exitCode).toBe(0);
        expect(res.payload.ok).toBe(true);
        expect(res.payload.discoveredArms).toHaveLength(2);
        expect(res.payload.piiReport.total_redactions).toBeGreaterThanOrEqual(2);
        expect(fs.existsSync(path.join(tmpDir, 'experiment.yaml'))).toBe(true);

        const writtenYaml = yaml.load(fs.readFileSync(path.join(tmpDir, 'experiment.yaml'), 'utf8'));
        expect(writtenYaml.experiment.label).toBe('KV Offload Campaign');
        expect(writtenYaml.arms).toHaveLength(2);
        expect(writtenYaml.arms[0].is_baseline).toBe(true);
    });

    it('returns exitCode 2 (NO_BRV02_STAGES_FOUND) in prism init when only raw inference-perf lifecycle metrics exist without BR v0.2 conversion', async () => {
        const rawDir = path.join(tmpDir, 'raw_inference_perf');
        fs.mkdirSync(rawDir, { recursive: true });
        fs.writeFileSync(
            path.join(rawDir, 'stage_0_lifecycle_metrics.json'),
            JSON.stringify({ load_summary: { count: 50, achieved_rate: 5.0 } }, null, 2),
            'utf8'
        );
        fs.writeFileSync(
            path.join(rawDir, 'config.yaml'),
            yaml.dump({ model: 'Qwen/Qwen3-32B' }),
            'utf8'
        );

        const res = await runPrismCli(['init', rawDir, '--json'], {
            stdout: () => {},
        });

        expect(res.exitCode).toBe(2);
        expect(res.payload.ok).toBe(false);
        expect(res.payload.error).toBe('NO_BRV02_STAGES_FOUND');
        expect(res.payload.message).toContain('stage_0_lifecycle_metrics.json');
        expect(res.payload.message).toContain('benchmark-report');
        expect(res.payload.message).toContain('-w inference-perf -b 0.2');
        expect(res.payload.remediation.detectedRawFiles).toContain('stage_0_lifecycle_metrics.json');
        expect(res.payload.remediation.installCommand).toBe('pip install llmd-benchmark-report');
        expect(res.payload.remediation.pythonModuleCommand).toContain(
            'python -m llmd_benchmark_report.cli'
        );
        // Should not write a broken experiment.yaml with 0 stages
        expect(fs.existsSync(path.join(rawDir, 'experiment.yaml'))).toBe(false);
    });

    it('supports single-shot prism init flags (--target-state unlisted, --label, --dco-signoff, --reviewers, --tags) and subcommand --help', async () => {
        const singleDir = path.join(tmpDir, 'single_run');
        fs.mkdirSync(singleDir, { recursive: true });
        fs.writeFileSync(
            path.join(singleDir, 'benchmark_report_stage_0.yaml'),
            createSampleBrv02Report({ model: 'google/gemma-4-E2B-it', hardware: 'nvidia-rtx-pro-6000', count: 1 }),
            'utf8'
        );

        const initRes = await runPrismCli(
            [
                'init',
                singleDir,
                '--target-state',
                'unlisted',
                '--experiment-label',
                'Gemma-4 Sweep',
                '--label',
                'Gemma-4 vLLM on RTX PRO 6000',
                '--dco-signoff',
                'Jane Doe <jane@example.com>',
                '--reviewers',
                'alice,bob',
                '--tags',
                'gke,sweep',
                '--json',
            ],
            { stdout: () => {} }
        );

        expect(initRes.exitCode).toBe(0);
        const writtenYaml = yaml.load(fs.readFileSync(path.join(singleDir, 'experiment.yaml'), 'utf8'));
        expect(writtenYaml.experiment.target_state).toBe('unlisted');
        expect(writtenYaml.experiment.dco_signoff).toBe('Jane Doe <jane@example.com>');
        expect(writtenYaml.experiment.requested_reviewers).toEqual(['alice', 'bob']);
        expect(writtenYaml.arms[0].run_label).toBe('Gemma-4 vLLM on RTX PRO 6000');
        expect(writtenYaml.arms[0].tags).toEqual(expect.arrayContaining(['gke', 'sweep']));

        // Rejects invalid --target-state locally with exitCode 2
        const badStateRes = await runPrismCli(['init', singleDir, '--target-state', 'private_draft', '--json'], {
            stdout: () => {},
        });
        expect(badStateRes.exitCode).toBe(2);
        expect(badStateRes.payload.error).toBe('INVALID_TARGET_STATE');

        // Subcommand --help prints subcommand usage, options, and examples
        const helpLines = [];
        const subHelpRes = await runPrismCli(['validate', '--help'], {
            stdout: (m) => helpLines.push(m),
        });
        expect(subHelpRes.exitCode).toBe(0);
        expect(subHelpRes.payload.subcommand).toBe('validate');
        expect(helpLines.join('\n')).toContain('Usage: prism validate [dir] [options]');
        expect(helpLines.join('\n')).toContain('--drop-failed-stages');

        const topHelpLines = [];
        const topHelpRes = await runPrismCli(['--help'], {
            stdout: (m) => topHelpLines.push(m),
        });
        expect(topHelpRes.exitCode).toBe(0);
        expect(topHelpRes.payload.subcommand).toBeNull();
        expect(topHelpLines.join('\n')).toContain('prism <command> --help');
    });

    it('scrubs PII across files and enforces --strict exit code 2 when redactions occur', async () => {
        const manifestPath = path.join(tmpDir, 'deployment.yaml');
        fs.writeFileSync(
            manifestPath,
            yaml.dump({
                apiVersion: 'apps/v1',
                kind: 'Deployment',
                metadata: { name: 'vllm-server' },
                spec: {
                    host: 'worker-01.corp.google.com',
                    nodeIp: '10.128.15.42',
                    contact: 'engineer@example.com',
                    hf_token: 'hf_1234567890abcdefghijklmnopqrstuv',
                    mountPath: '/home/johndoe/models/llama',
                },
            }),
            'utf8'
        );

        // 1. Strict mode exits with 2 when PII is detected
        const strictRes = await runPrismCli(['scrub', tmpDir, '--strict', '--json'], {
            stdout: () => {},
        });
        expect(strictRes.exitCode).toBe(2);
        expect(strictRes.payload.error).toBe('PII_DETECTED_STRICT');
        expect(strictRes.payload.piiReport.total_redactions).toBeGreaterThanOrEqual(4);
        expect(strictRes.payload.issueReport.newIssueUrl).toContain('https://github.com/llm-d/llm-d-prism/issues/new');

        // 2. Non-strict --in-place mode scrubs the file and exits with 0
        const inplaceRes = await runPrismCli(['scrub', tmpDir, '--in-place', '--json'], {
            stdout: () => {},
        });
        expect(inplaceRes.exitCode).toBe(0);
        expect(inplaceRes.payload.ok).toBe(true);

        const scrubbedText = fs.readFileSync(manifestPath, 'utf8');
        expect(scrubbedText).not.toContain('hf_1234567890abcdefghijklmnopqrstuv');
        expect(scrubbedText).not.toContain('worker-01.corp.google.com');
        expect(scrubbedText).not.toContain('10.128.15.42');
        expect(scrubbedText).not.toContain('/home/johndoe/');
        expect(scrubbedText).toContain('[REDACTED_SECRET]');

        // 3. Re-running --strict after --in-place scrubbing passes with exitCode 0
        const recheckRes = await runPrismCli(['scrub', tmpDir, '--strict', '--json'], {
            stdout: () => {},
        });
        expect(recheckRes.exitCode).toBe(0);
        expect(recheckRes.payload.piiReport.total_redactions).toBe(0);
    });

    it('validates offline and returns exit code 2 with self-repair remediation on missing hardware or 100% failed stages', async () => {
        const armDir = path.join(tmpDir, 'arm_invalid');
        fs.mkdirSync(armDir, { recursive: true });

        // Stage 0 has Unknown hardware; Stage 1 has 100% failed requests
        fs.writeFileSync(
            path.join(armDir, 'benchmark_report_stage_0.yaml'),
            createSampleBrv02Report({ hardware: 'Unknown', count: 0, stageIndex: 0 }),
            'utf8'
        );
        fs.writeFileSync(
            path.join(armDir, 'benchmark_report_stage_1.yaml'),
            createSampleBrv02Report({
                hardware: 'Unknown',
                count: 0,
                stageIndex: 1,
                totalRequests: 50,
                failures: 50,
            }),
            'utf8'
        );

        const failRes = await runPrismCli(['validate', armDir, '--json'], {
            stdout: () => {},
        });
        expect(failRes.exitCode).toBe(2);
        expect(failRes.payload.ok).toBe(false);
        expect(failRes.payload.error).toBe('PREFLIGHT_VALIDATION_FAILED');
        expect(failRes.payload.arms[0].isValid).toBe(false);
        expect(failRes.payload.arms[0].remediation).toBeTruthy();
        expect(failRes.payload.arms[0].remediation.cliFlags).toContain('--hardware');
        expect(failRes.payload.arms[0].remediation.cliFlags).toContain('--drop-failed-stages');
        expect(failRes.payload.issueReport.newIssueUrl).toContain('https://github.com/llm-d/llm-d-prism/issues/new');

        // Self-repair using the suggested CLI flags!
        const repairedRes = await runPrismCli(
            [
                'validate',
                armDir,
                '--hardware',
                'H100',
                '--chips',
                '8',
                '--drop-failed-stages',
                '--json',
            ],
            { stdout: () => {} }
        );
        expect(repairedRes.exitCode).toBe(0);
        expect(repairedRes.payload.ok).toBe(true);
        expect(repairedRes.payload.arms[0].isValid).toBe(true);
        expect(repairedRes.payload.arms[0].stageCount).toBe(1);
    });

    it('blocks submit when --dco-signoff or --yes-user-approved is missing (exit code 2, zero fetch calls)', async () => {
        const armDir = path.join(tmpDir, 'arm_valid');
        fs.mkdirSync(armDir, { recursive: true });
        fs.writeFileSync(
            path.join(armDir, 'benchmark_report_stage_0.yaml'),
            createSampleBrv02Report(),
            'utf8'
        );

        const fetchMock = vi.fn();

        // Missing both --dco-signoff and --yes-user-approved
        const noSignoffRes = await runPrismCli(['submit', armDir, '--json'], {
            stdout: () => {},
            fetchImpl: fetchMock,
        });
        expect(noSignoffRes.exitCode).toBe(2);
        expect(noSignoffRes.payload.error).toBe('USER_SIGNOFF_REQUIRED');
        expect(noSignoffRes.payload.preflightSummary).toBeTruthy();
        expect(noSignoffRes.payload.piiReport).toBeTruthy();
        expect(fetchMock).not.toHaveBeenCalled();

        // Has --dco-signoff, but missing --yes-user-approved
        const noApprovalRes = await runPrismCli(
            ['submit', armDir, '--dco-signoff', 'Jane Doe <jane@example.com>', '--json'],
            {
                stdout: () => {},
                fetchImpl: fetchMock,
            }
        );
        expect(noApprovalRes.exitCode).toBe(2);
        expect(noApprovalRes.payload.error).toBe('USER_SIGNOFF_REQUIRED');
        expect(fetchMock).not.toHaveBeenCalled();

        // Has --yes-user-approved, but missing --dco-signoff
        const noDcoRes = await runPrismCli(['submit', armDir, '--yes-user-approved', '--json'], {
            stdout: () => {},
            fetchImpl: fetchMock,
        });
        expect(noDcoRes.exitCode).toBe(2);
        expect(noDcoRes.payload.error).toBe('DCO_SIGNOFF_REQUIRED');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('executes two-pass baseline upload, propagates baseline_run_id, chains /review fallback, and generates shareUrl', async () => {
        const arm1Dir = path.join(tmpDir, 'arm_01_baseline');
        const arm2Dir = path.join(tmpDir, 'arm_02_candidate');
        fs.mkdirSync(arm1Dir, { recursive: true });
        fs.mkdirSync(arm2Dir, { recursive: true });

        fs.writeFileSync(
            path.join(arm1Dir, 'benchmark_report_stage_0.yaml'),
            createSampleBrv02Report({ outputTput: 1000 }),
            'utf8'
        );
        fs.writeFileSync(
            path.join(arm2Dir, 'benchmark_report_stage_0.yaml'),
            createSampleBrv02Report({ outputTput: 1500 }),
            'utf8'
        );

        await runPrismCli(
            [
                'init',
                tmpDir,
                '--experiment-id',
                '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
                '--experiment-label',
                'Two-Pass Test Campaign',
                '--baseline',
                'arm_01_baseline',
                '--json',
            ],
            { stdout: () => {} }
        );

        const assignedUuids = [
            '11111111-2222-4333-8444-555555555555',
            '66666666-7777-4888-9999-aaaaaaaaaaaa',
        ];
        let submitCount = 0;
        const postedPayloads = [];
        const reviewCalls = [];

        const fetchMock = vi.fn(async (url, init) => {
            const urlStr = String(url);
            if (urlStr.includes('/review')) {
                reviewCalls.push({ url: urlStr, body: JSON.parse(init.body) });
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ success: true, state: 'public' }),
                };
            }
            const parsedBody = JSON.parse(init.body);
            postedPayloads.push({
                url: urlStr,
                headers: init.headers,
                body: parsedBody,
            });
            const assignedId = assignedUuids[submitCount++];
            // Simulate an older server that returns state: 'submitted_pending_review' even when targetState=public
            return {
                ok: true,
                status: 201,
                json: async () => ({
                    success: true,
                    runId: assignedId,
                    state: 'submitted_pending_review',
                }),
            };
        });

        const submitRes = await runPrismCli(
            [
                'submit',
                '-f',
                path.join(tmpDir, 'experiment.yaml'),
                '--publish',
                '--dco-signoff',
                'Jane Doe <jane@example.com>',
                '--yes-user-approved',
                '--json',
            ],
            {
                stdout: () => {},
                fetchImpl: fetchMock,
                env: { PRISM_GITHUB_TOKEN: 'ghp_testtoken1234567890abcdefghij' },
            }
        );

        expect(submitRes.exitCode).toBe(0);
        expect(submitRes.payload.ok).toBe(true);
        expect(submitRes.payload.baselineRunId).toBe(assignedUuids[0]);
        expect(submitRes.payload.uploadedRunIds).toEqual(assignedUuids);

        // Verify two-pass baseline propagation
        expect(postedPayloads).toHaveLength(2);
        expect(postedPayloads[0].headers['X-Prism-Github-Token']).toBe('ghp_testtoken1234567890abcdefghij');
        expect(postedPayloads[0].body.dco_signoff.signed_off_by).toBe('Jane Doe <jane@example.com>');
        expect(postedPayloads[0].body.baseline_run_id).toBeUndefined();
        expect(postedPayloads[1].body.baseline_run_id).toBe(assignedUuids[0]);

        // Verify /review fallback was automatically chained for both runs
        expect(reviewCalls).toHaveLength(2);
        expect(reviewCalls[0].body.status).toBe('public');

        // Verify shareUrl uses ?view=results-store&benchmarks= and decodes back to the 2 server runIds
        expect(DEFAULT_API_URL).toBe('https://prism.llm-d.ai');
        expect(postedPayloads[0].url).toContain('https://prism.llm-d.ai/api/results');
        const parsedShareUrl = new URL(submitRes.payload.shareUrl);
        expect(parsedShareUrl.searchParams.get('view')).toBe('results-store');
        const benchmarksParam = parsedShareUrl.searchParams.get('benchmarks');
        expect(decodeShareLink(benchmarksParam)).toEqual(assignedUuids);
        expect(parsedShareUrl.searchParams.get('experimentId')).toBe('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');
    });

    it('compares runs, computes relative % deltas, evaluates SLOs, and outputs Markdown + shareUrl', async () => {
        const baseId = '11111111-2222-4333-8444-555555555555';
        const candId = '66666666-7777-4888-9999-aaaaaaaaaaaa';

        const mockRuns = {
            [baseId]: {
                runId: baseId,
                runLabel: 'vLLM Baseline',
                model_name: 'meta-llama/Llama-3.1-70B-Instruct',
                hardware: { hardware_name: 'H100', accelerator_count: 8 },
                entries: [
                    {
                        run_id: baseId,
                        filename: 'stage_0.yaml',
                        raw_report: yaml.load(
                            createSampleBrv02Report({
                                outputTput: 1000,
                                ttftMeanSec: 0.08, // 80 ms
                                tpotMeanSec: 0.02, // 20 ms
                            })
                        ),
                    },
                ],
            },
            [candId]: {
                runId: candId,
                runLabel: 'vLLM Prefix Cache Offload',
                model_name: 'meta-llama/Llama-3.1-70B-Instruct',
                hardware: { hardware_name: 'H100', accelerator_count: 8 },
                baseline_run_id: baseId,
                entries: [
                    {
                        run_id: candId,
                        filename: 'stage_0.yaml',
                        raw_report: yaml.load(
                            createSampleBrv02Report({
                                outputTput: 1500, // +50.0%
                                ttftMeanSec: 0.04, // 40 ms (-50.0%)
                                tpotMeanSec: 0.015, // 15 ms (-25.0%)
                            })
                        ),
                    },
                ],
            },
        };

        const fetchMock = vi.fn(async (url) => {
            const urlStr = String(url);
            const id = urlStr.split('/').pop();
            if (mockRuns[id]) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => mockRuns[id],
                };
            }
            return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
        });

        const compareRes = await runPrismCli(
            [
                'compare',
                baseId,
                candId,
                '--baseline',
                baseId,
                '--slo-ttft-ms',
                '100',
                '--slo-tpot-ms',
                '25',
                '--markdown',
                '--json',
            ],
            {
                stdout: () => {},
                fetchImpl: fetchMock,
            }
        );

        expect(compareRes.exitCode).toBe(0);
        expect(compareRes.payload.ok).toBe(true);
        expect(compareRes.payload.runs).toHaveLength(2);

        const candidateRow = compareRes.payload.runs[1];
        expect(candidateRow.deltas.throughputPct).toBeCloseTo(50, 1);
        expect(candidateRow.deltas.throughputFormatted).toBe('+50.0%');
        expect(candidateRow.deltas.ttftPct).toBeCloseTo(-50, 1);
        expect(candidateRow.deltas.tpotPct).toBeCloseTo(-25, 1);
        expect(candidateRow.sloPass).toBe(true);

        expect(compareRes.payload.markdown).toContain('| vLLM Baseline (Baseline) |');
        expect(compareRes.payload.markdown).toContain('+50.0%');
        expect(compareRes.payload.shareUrl).toContain('https://prism.llm-d.ai/?view=results-store&benchmarks=');
        const parsedCompareShare = new URL(compareRes.payload.shareUrl);
        expect(decodeShareLink(parsedCompareShare.searchParams.get('benchmarks'))).toEqual([baseId, candId]);
    });

    it('prints actionable arm errors, remediation hints, and dry-run preflight summary in human mode (without --json)', async () => {
        const armInvalidDir = path.join(tmpDir, 'arm_human_invalid');
        fs.mkdirSync(armInvalidDir, { recursive: true });
        fs.writeFileSync(
            path.join(armInvalidDir, 'benchmark_report_stage_0.yaml'),
            createSampleBrv02Report({ hardware: 'Unknown', count: 0 }),
            'utf8'
        );

        const stderrLines = [];
        const stdoutLines = [];
        const valFailRes = await runPrismCli(['validate', armInvalidDir], {
            stdout: (m) => stdoutLines.push(m),
            stderr: (m) => stderrLines.push(m),
        });
        expect(valFailRes.exitCode).toBe(2);
        const combinedErr = stderrLines.join('\n');
        expect(combinedErr).toContain("Arm 'arm_human_invalid'");
        expect(combinedErr).toContain('hardware');
        expect(combinedErr).toContain('Suggested CLI Flags:');
        expect(combinedErr).toContain('--hardware');

        // Human-mode submit --dry-run on a valid arm
        const armValidDir = path.join(tmpDir, 'arm_human_valid');
        fs.mkdirSync(armValidDir, { recursive: true });
        fs.writeFileSync(
            path.join(armValidDir, 'benchmark_report_stage_0.yaml'),
            createSampleBrv02Report({ extraNote: 'HF_TOKEN=hf_1234567890abcdefghijklmnop' }),
            'utf8'
        );

        const dryStdout = [];
        const dryRes = await runPrismCli(['submit', armValidDir, '--dry-run', '--publish'], {
            stdout: (m) => dryStdout.push(m),
        });
        expect(dryRes.exitCode).toBe(0);
        const combinedDryOut = dryStdout.join('\n');
        expect(combinedDryOut).toContain('Dry-run validation succeeded');
        expect(combinedDryOut).toContain('Target State: public');
        expect(combinedDryOut).toContain('Arms Ready: 1 arm(s), 1 stage(s)');
        expect(combinedDryOut).toMatch(/PII Redactions:\s+[1-9]\d*\s+item\(s\)\s+scrubbed/);
    });

    it('supports list, get, promote, review, and fork commands and scrubs diagnostics on API error', async () => {
        const sampleRunId = '11111111-2222-4333-8444-555555555555';
        const samplePayload = {
            runId: sampleRunId,
            runLabel: 'Original Run',
            model_name: 'meta-llama/Llama-3.1-70B-Instruct',
            hardware: { hardware_name: 'H100', accelerator_count: 8 },
            format: 'brv02',
            entries: [
                {
                    run_id: sampleRunId,
                    filename: 'stage_0.yaml',
                    raw_report: yaml.load(createSampleBrv02Report()),
                },
            ],
        };

        const fetchMock = vi.fn(async (url, init) => {
            const urlStr = String(url);
            if (urlStr.endsWith('/promote') || urlStr.endsWith('/review')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        state: init?.body ? JSON.parse(init.body).status || 'submitted_pending_review' : 'submitted_pending_review',
                    }),
                };
            }
            if (urlStr.includes(`/api/results/${sampleRunId}`)) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => samplePayload,
                };
            }
            if (urlStr.includes('/api/results')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ results: [samplePayload] }),
                };
            }
            return { ok: false, status: 500, json: async () => ({ error: 'Server failure' }) };
        });

        // list
        const listRes = await runPrismCli(['list', '--model', 'Llama-3.1', '--json'], {
            stdout: () => {},
            fetchImpl: fetchMock,
        });
        expect(listRes.exitCode).toBe(0);
        expect(listRes.payload.count).toBe(1);

        // fork
        const forkedOut = path.join(tmpDir, 'forked.json');
        const forkRes = await runPrismCli(
            ['fork', sampleRunId, '--label', 'Forked Variant', '--tags', 'fork-test,v2', '-o', forkedOut, '--json'],
            {
                stdout: () => {},
                fetchImpl: fetchMock,
            }
        );
        expect(forkRes.exitCode).toBe(0);
        expect(forkRes.payload.payload.runLabel).toBe('Forked Variant');
        expect(forkRes.payload.payload.tags).toContain('fork-test');
        expect(forkRes.payload.payload.forked_from.original_run_id).toBe(sampleRunId);
        expect(fs.existsSync(forkedOut)).toBe(true);

        // Error reporting with scrubbed diagnostics
        const errorFetchMock = vi.fn(async () => {
            throw new Error('Auth failed with token hf_secret1234567890abcdefghij on host node1.corp.google.com');
        });
        const errRes = await runPrismCli(['get', sampleRunId, '--json'], {
            stdout: () => {},
            fetchImpl: errorFetchMock,
        });
        expect(errRes.exitCode).toBe(1);
        expect(errRes.payload.issueReport).toBeTruthy();
        expect(errRes.payload.issueReport.newIssueUrl).toContain('https://github.com/llm-d/llm-d-prism/issues/new');
        expect(JSON.stringify(errRes.payload.issueReport)).not.toContain('hf_secret1234567890abcdefghij');
        expect(JSON.stringify(errRes.payload.issueReport)).not.toContain('node1.corp.google.com');
        expect(JSON.stringify(errRes.payload.issueReport)).toContain('[REDACTED_SECRET]');
    });
});
