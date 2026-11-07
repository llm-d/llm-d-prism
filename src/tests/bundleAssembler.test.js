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

import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { describe, it, expect, afterEach } from 'vitest';
import { extractMetadataFromManifest } from '../utils/manifestMetadataExtractor.js';
import {
    discoverAndAssembleArms,
    generateExperimentYamlConfig,
    buildRemediationRecipe,
    buildGithubIssueReport,
    isAssembledPrismBundle,
} from '../utils/bundleAssembler.js';
import { encodeContextValue, decodeContextValue } from '../../server/results/gcs.ts';

function makeBrv02ReportYaml({
    uid = '11111111-2222-3333-4444-555555555555',
    eid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    description = 'Stage Run',
    stage = 0,
    model = 'Unknown',
    hardware = 'Unknown',
    acceleratorCount = null,
    tool = 'unknown',
    toolVersion = 'unknown',
    harness = 'inference-perf',
    outputTokenRate = 1250.5,
    e2eMean = 1.2,
    ttftMean = 0.08,
    tpotMean = 0.015,
    totalRequests = 100,
    failures = 0,
} = {}) {
    return yaml.dump({
        version: '0.2',
        run: {
            uid,
            eid,
            description,
            time: { start: '2026-11-06T10:00:00Z' },
            keywords: ['kv-cache', 'sweep'],
        },
        scenario: {
            stack: [
                {
                    standardized: {
                        kind: 'inference_engine',
                        role: 'aggregate',
                        tool,
                        tool_version: toolVersion,
                        model: { name: model },
                        accelerator: {
                            model: hardware,
                            ...(acceleratorCount !== null ? { count: acceleratorCount } : {}),
                        },
                    },
                },
            ],
            load: {
                standardized: {
                    stage,
                    tool: harness,
                    input_seq_len: { value: 1024 },
                    output_seq_len: { value: 256 },
                    rate_qps: 10,
                    concurrency: 32,
                },
            },
        },
        results: {
            request_performance: {
                aggregate: {
                    throughput: {
                        output_token_rate: { mean: outputTokenRate, units: 'tokens/s' },
                        request_rate: { mean: 10, units: 'queries/s' },
                    },
                    latency: {
                        request_latency: { mean: e2eMean, p50: e2eMean, p99: e2eMean * 1.5, units: 's' },
                        time_to_first_token: { mean: ttftMean, p50: ttftMean, p99: ttftMean * 1.5, units: 's' },
                        time_per_output_token: { mean: tpotMean, p50: tpotMean, p99: tpotMean * 1.2, units: 's/token' },
                    },
                    requests: {
                        total: totalRequests,
                        failures,
                    },
                },
            },
        },
    });
}

describe('manifestMetadataExtractor & bundleAssembler', () => {
    const tempDirs = [];

    const createTempDir = (prefix = 'prism-assembler-test-') => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
        tempDirs.push(dir);
        return dir;
    };

    afterEach(() => {
        while (tempDirs.length > 0) {
            const d = tempDirs.pop();
            try {
                fs.rmSync(d, { recursive: true, force: true });
            } catch {
                // ignore cleanup errors
            }
        }
    });

    describe('extractMetadataFromManifest', () => {
        it('extracts model, hardware, chip count, inference tool & version from K8s Deployment YAML', () => {
            const k8sDeployment = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vllm-llama-70b
spec:
  replicas: 2
  template:
    spec:
      nodeSelector:
        cloud.google.com/gke-accelerator: nvidia-h100-80gb
      containers:
        - name: inference-server
          image: vllm/vllm-openai:v0.6.3
          args:
            - "--model"
            - "meta-llama/Llama-3.1-70B-Instruct"
            - "--tensor-parallel-size"
            - "4"
          resources:
            limits:
              nvidia.com/gpu: "4"
`;
            const extracted = extractMetadataFromManifest('deployment.yaml', k8sDeployment);
            expect(extracted.model_name).toBe('meta-llama/Llama-3.1-70B-Instruct');
            expect(extracted.hardware_name).toBe('H100');
            // 2 replicas * 4 GPUs per pod = 8 total chips
            expect(extracted.accelerator_count).toBe(8);
            expect(extracted.inference_tool).toBe('vLLM');
            expect(extracted.inference_tool_version).toBe('v0.6.3');
            expect(extracted.manifests_extracted[0].kind).toBe('Deployment');
        });

        it('extracts metadata from LeaderWorkerSet (LWS) with TPU topology and SGLang image', () => {
            const lwsYaml = `
apiVersion: leaderworkerset.x-k8s.io/v1
kind: LeaderWorkerSet
metadata:
  name: sglang-tpu
spec:
  replicas: 1
  leaderWorkerTemplate:
    size: 2
    workerTemplate:
      metadata:
        annotations:
          cloud.google.com/gke-tpu-topology: "2x4"
      spec:
        nodeSelector:
          cloud.google.com/gke-accelerator: tpu-v6e-slice
        containers:
          - name: worker
            image: lmsysorg/sglang:v0.4.1-tpu
            env:
              - name: MODEL_ID
                value: Qwen/Qwen2.5-72B-Instruct
`;
            const extracted = extractMetadataFromManifest('lws.yaml', lwsYaml);
            expect(extracted.model_name).toBe('Qwen/Qwen2.5-72B-Instruct');
            expect(extracted.hardware_name).toBe('TPU v6e');
            expect(extracted.accelerator_count).toBe(8);
            expect(extracted.inference_tool).toBe('SGLang');
            expect(extracted.inference_tool_version).toBe('v0.4.1-tpu');
        });

        it('extracts metadata from config.yaml and Helm values.yaml', () => {
            const configYaml = `
model: google/gemma-2-27b-it
kustomize:
  acceleratorBackend: a100-standalone
accelerator_count: 2
inference_tool: Triton
inference_tool_version: 24.08
well_lit_path: Prefix Cache Offloading
vllm:
  enablePrefixCaching: true
`;
            const extracted = extractMetadataFromManifest('config.yaml', configYaml);
            expect(extracted.model_name).toBe('google/gemma-2-27b-it');
            expect(extracted.hardware_name).toBe('A100');
            expect(extracted.accelerator_count).toBe(2);
            expect(extracted.inference_tool).toBe('Triton');
            expect(extracted.inference_tool_version).toBe('24.08');
            expect(extracted.well_lit_path).toBe('Prefix Cache Offloading');
            expect(extracted.helm_ServingStack_values).toEqual({
                vllm: { enablePrefixCaching: true },
            });
        });
    });

    describe('discoverAndAssembleArms (3-Tier Resolution & Automatic PII Scrubbing)', () => {
        it('resolves Tier 1 (experiment.yaml / CLI overrides) > Tier 2 (sibling manifests) > Tier 3 (stage report) and scrubs PII', () => {
            const rootDir = createTempDir('prism-multi-arm-');
            const arm1Dir = path.join(rootDir, 'arm_01_baseline');
            const arm2Dir = path.join(rootDir, 'arm_02_offload');
            fs.mkdirSync(arm1Dir, { recursive: true });
            fs.mkdirSync(arm2Dir, { recursive: true });

            // Arm 1: Stage report has 'Unknown' hardware and model, but sibling deployment.yaml provides Tier 2 metadata
            // Also includes PII (HF token and internal hostname) inside deployment.yaml and stage description
            fs.writeFileSync(
                path.join(arm1Dir, 'benchmark_report_stage_0.yaml'),
                makeBrv02ReportYaml({
                    description: 'Baseline run from /Users/alice/benchmarks on host1.corp.google.com',
                    model: 'Unknown',
                    hardware: 'Unknown',
                    acceleratorCount: null,
                    tool: 'unknown',
                })
            );
            fs.writeFileSync(
                path.join(arm1Dir, 'vllm-deployment.yaml'),
                `
apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 1
  template:
    spec:
      nodeSelector:
        cloud.google.com/gke-accelerator: nvidia-h100-80gb
      containers:
        - name: vllm
          image: vllm/vllm-openai:v0.6.3
          env:
            - name: HF_TOKEN
              value: hf_secretTokenForTestingPurposesOnly12345
          args:
            - --model=meta-llama/Llama-3.1-70B-Instruct
            - --tp=8
`
            );

            // Arm 2: Stage report has native values (Tier 3), sibling config.yaml has Tier 2, and experiment.yaml arm overrides Tier 1
            fs.writeFileSync(
                path.join(arm2Dir, 'benchmark_report_stage_0.yaml'),
                makeBrv02ReportYaml({
                    description: 'Offload run',
                    model: 'meta-llama/Llama-3.1-8B-Instruct',
                    hardware: 'L4',
                    acceleratorCount: 2,
                    tool: 'vLLM',
                })
            );
            fs.writeFileSync(
                path.join(arm2Dir, 'config.yaml'),
                yaml.dump({
                    hardware: 'A100',
                    accelerator_count: 4,
                })
            );

            // Declarative experiment.yaml at root
            const expYaml = {
                version: '1.0',
                experiment: {
                    id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
                    label: 'PD Disaggregation Sweep',
                    target_state: 'public',
                    requested_reviewers: ['@jkramberger'],
                    dco_signoff: 'Alice Engineer <alice@example.com>',
                },
                defaults: {
                    well_lit_path: 'Prefix Cache Offloading',
                    tags: ['campaign:q4'],
                },
                arms: [
                    {
                        key: 'arm-01-baseline',
                        path: './arm_01_baseline',
                        is_baseline: true,
                    },
                    {
                        key: 'arm-02-offload',
                        run_label: 'Arm 2 Tier-1 Override',
                        path: './arm_02_offload',
                        model_name: 'meta-llama/Llama-3.1-70B-Instruct',
                        hardware: {
                            hardware_name: 'H100',
                            accelerator_count: 8,
                        },
                    },
                ],
            };
            fs.writeFileSync(path.join(rootDir, 'experiment.yaml'), yaml.dump(expYaml));

            const result = discoverAndAssembleArms(rootDir);

            expect(result.ok).toBe(true);
            expect(result.exitCode).toBe(0);
            expect(result.arms).toHaveLength(2);

            const [arm1, arm2] = result.arms;

            // Arm 1 verified: resolved from Tier 2 (vllm-deployment.yaml)
            expect(arm1.isValid).toBe(true);
            expect(arm1.bundle.model_name).toBe('meta-llama/Llama-3.1-70B-Instruct');
            expect(arm1.bundle.hardware).toEqual({ hardware_name: 'H100', accelerator_count: 8 });
            expect(arm1.bundle.inference_tool).toBe('vLLM');
            expect(arm1.bundle.inference_tool_version).toBe('v0.6.3');
            expect(arm1.bundle.well_lit_path).toBe('Prefix Cache Offloading');
            expect(arm1.bundle.requested_reviewers).toEqual(['jkramberger']);

            // Verify mutateRawReportMetadata propagated resolved metadata into entries[0].raw_report
            const stage0Stack = arm1.bundle.entries[0].raw_report.scenario.stack[0].standardized;
            expect(stage0Stack.model.name).toBe('meta-llama/Llama-3.1-70B-Instruct');
            expect(stage0Stack.accelerator.model).toBe('H100');
            expect(stage0Stack.accelerator.count).toBe(8);

            // Verify PII scrubbing occurred on Arm 1 stage report and base64 manifest
            expect(arm1.bundle.runLabel).toContain('$HOME/benchmarks');
            expect(arm1.bundle.runLabel).toContain('[REDACTED_INTERNAL_HOST]');
            const b64Manifest = arm1.bundle.manifests['vllm-deployment.yaml'];
            expect(b64Manifest).toMatch(/^data:text\/yaml;base64,/);
            const decodedManifest = Buffer.from(b64Manifest.split(',')[1], 'base64').toString('utf-8');
            expect(decodedManifest).not.toContain('hf_secretTokenForTestingPurposesOnly12345');
            expect(decodedManifest).toContain('[REDACTED_SECRET]');
            expect(arm1.bundle.dco_signoff.signed_off_by).toBe('Alice Engineer <alice@example.com>');
            expect(arm1.bundle.pii_scrub_summary.scrubbed).toBe(true);
            expect(result.piiReport.total_redactions).toBeGreaterThanOrEqual(3);

            // Arm 2 verified: Tier 1 overrides in experiment.yaml beat Tier 2 config.yaml and Tier 3 stage report
            expect(arm2.isValid).toBe(true);
            expect(arm2.bundle.runLabel).toBe('Arm 2 Tier-1 Override');
            expect(arm2.bundle.model_name).toBe('meta-llama/Llama-3.1-70B-Instruct');
            expect(arm2.bundle.hardware).toEqual({ hardware_name: 'H100', accelerator_count: 8 });
        });

        it('handles --drop-failed-stages and generates structured exit-code-2 remediation & GitHub issue reports when invalid', () => {
            const runDir = createTempDir('prism-failed-stage-');

            // Stage 0: valid metrics, but Unknown hardware & model
            fs.writeFileSync(
                path.join(runDir, 'stage_0.yaml'),
                makeBrv02ReportYaml({
                    stage: 0,
                    model: 'Unknown',
                    hardware: 'Unknown',
                    acceleratorCount: null,
                    totalRequests: 50,
                    failures: 0,
                })
            );
            // Stage 1: 100% failed requests (50/50 failed)
            fs.writeFileSync(
                path.join(runDir, 'stage_1.yaml'),
                makeBrv02ReportYaml({
                    stage: 1,
                    model: 'Unknown',
                    hardware: 'Unknown',
                    acceleratorCount: null,
                    totalRequests: 50,
                    failures: 50,
                })
            );

            // 1. Without overrides or dropFailedStages -> fails with exitCode 2 and remediation recipe
            const failedResult = discoverAndAssembleArms(runDir);
            expect(failedResult.ok).toBe(false);
            expect(failedResult.exitCode).toBe(2);
            expect(failedResult.arms[0].isValid).toBe(false);

            const remediation = failedResult.arms[0].remediation;
            expect(remediation).toBeDefined();
            expect(remediation.cliFlags).toContain('--model');
            expect(remediation.cliFlags).toContain('--hardware');
            expect(remediation.cliFlags).toContain('--chips');
            expect(remediation.cliFlags).toContain('--drop-failed-stages');
            expect(remediation.experimentYamlPatch.defaults.hardware).toEqual({
                hardware_name: 'H100',
                accelerator_count: 8,
            });
            expect(failedResult.issueReport).toBeDefined();
            expect(failedResult.issueReport.newIssueUrl).toContain(
                'https://github.com/llm-d/llm-d-prism/issues/new?'
            );

            // 2. Re-run with Tier 1 overrides + dropFailedStages: true -> passes cleanly!
            const repairedResult = discoverAndAssembleArms(runDir, {
                dropFailedStages: true,
                overrides: {
                    model: 'meta-llama/Llama-3.1-8B-Instruct',
                    hardware: 'H100',
                    chips: 4,
                    tool: 'vLLM',
                },
            });
            expect(repairedResult.ok).toBe(true);
            expect(repairedResult.exitCode).toBe(0);
            expect(repairedResult.arms[0].droppedStages).toHaveLength(1);
            expect(repairedResult.arms[0].droppedStages[0].stageIndex).toBe(1);
            expect(repairedResult.arms[0].bundle.entries).toHaveLength(1);
            expect(repairedResult.arms[0].bundle.hardware).toEqual({
                hardware_name: 'H100',
                accelerator_count: 4,
            });
        });

        it('generates experiment.yaml via generateExperimentYamlConfig and scrubs PII in buildGithubIssueReport', () => {
            const sweepDir = createTempDir('prism-init-');
            const armDir = path.join(sweepDir, 'arm_baseline');
            fs.mkdirSync(armDir, { recursive: true });

            fs.writeFileSync(
                path.join(armDir, 'stage_0.yaml'),
                makeBrv02ReportYaml({
                    description: 'Sweep by dev@corp.google.com',
                    model: 'Qwen/Qwen2.5-32B',
                    hardware: 'H100',
                    acceleratorCount: 4,
                    tool: 'vLLM',
                    toolVersion: 'v0.6.3',
                })
            );

            const initRes = generateExperimentYamlConfig(sweepDir, {
                experimentLabel: 'Qwen Sweep',
            });
            expect(initRes.configObject.experiment.label).toBe('Qwen Sweep');
            expect(initRes.configObject.defaults.model_name).toBe('Qwen/Qwen2.5-32B');
            expect(initRes.configObject.defaults.hardware).toEqual({
                hardware_name: 'H100',
                accelerator_count: 4,
            });
            expect(initRes.yamlString).toContain('Qwen/Qwen2.5-32B');
            expect(initRes.yamlString).not.toContain('dev@corp.google.com');
            expect(initRes.yamlString).toContain('[REDACTED_EMAIL]');

            // Verify buildGithubIssueReport scrubs tokens/paths/emails from URL & diagnostics
            const issue = buildGithubIssueReport({
                command: 'prism submit --token hf_1234567890abcdefghijklmnop',
                errorCode: 'API_UPLOAD_ERROR',
                message: 'Failed uploading /Users/secretuser/run.yaml to internal.corp.google.com with key sk-1234567890abcdefghijklmnop',
                exitCode: 1,
                details: {
                    authorEmail: 'secretuser@corp.google.com',
                    hostIp: '10.240.0.15',
                },
            });

            expect(issue.newIssueUrl).toContain('https://github.com/llm-d/llm-d-prism/issues/new?');
            expect(issue.newIssueUrl).not.toContain('hf_1234567890abcdefghijklmnop');
            expect(issue.newIssueUrl).not.toContain('secretuser');
            expect(issue.newIssueUrl).not.toContain('internal.corp.google.com');
            expect(issue.newIssueUrl).not.toContain('10.240.0.15');
            expect(issue.scrubbedDiagnostics.message).toContain('$HOME/run.yaml');
            expect(issue.scrubbedDiagnostics.message).toContain('[REDACTED_INTERNAL_HOST]');
            expect(issue.scrubbedDiagnostics.message).toContain('[REDACTED_SECRET]');
            expect(issue.scrubbedDiagnostics.details.authorEmail).toBe('[REDACTED_EMAIL]');
            expect(issue.scrubbedDiagnostics.details.hostIp).toBe('[REDACTED_PRIVATE_IP]');

            // Verify buildRemediationRecipe standalone call
            const recipe = buildRemediationRecipe({
                errors: ['Missing model name.'],
                fieldErrors: { model_name: { message: 'Missing model name.', severity: 'error' } },
            });
            expect(recipe.cliFlags).toContain('--model');
        });

        it('preserves heterogeneous multi-arm metadata during prism init (generateExperimentYamlConfig) and discoverAndAssembleArms', () => {
            const hetDir = createTempDir('prism-het-init-');
            const arm1Dir = path.join(hetDir, 'arm_tp4_baseline');
            const arm2Dir = path.join(hetDir, 'arm_tp8_candidate');
            fs.mkdirSync(arm1Dir, { recursive: true });
            fs.mkdirSync(arm2Dir, { recursive: true });

            fs.writeFileSync(
                path.join(arm1Dir, 'stage_0.yaml'),
                makeBrv02ReportYaml({
                    description: 'TP4 Baseline',
                    model: 'Qwen/Qwen2.5-32B-Instruct',
                    hardware: 'H100',
                    acceleratorCount: 4,
                    tool: 'vLLM',
                })
            );
            fs.writeFileSync(
                path.join(arm2Dir, 'stage_0.yaml'),
                makeBrv02ReportYaml({
                    description: 'TP8 Candidate on H200',
                    model: 'Qwen/Qwen2.5-72B-Instruct',
                    hardware: 'H200',
                    acceleratorCount: 8,
                    tool: 'SGLang',
                })
            );

            const initRes = generateExperimentYamlConfig(hetDir, {
                experimentLabel: 'Heterogeneous Sweep',
            });

            // Differing fields must NOT be placed into shared defaults; instead they live on each arm entry
            expect(initRes.configObject.defaults.model_name).toBeUndefined();
            expect(initRes.configObject.defaults.hardware).toBeUndefined();
            expect(initRes.configObject.defaults.inference_tool).toBeUndefined();

            expect(initRes.configObject.arms[0]).toMatchObject({
                key: 'arm_tp4_baseline',
                model_name: 'Qwen/Qwen2.5-32B-Instruct',
                hardware: { hardware_name: 'H100', accelerator_count: 4 },
                inference_tool: 'vLLM',
            });
            expect(initRes.configObject.arms[1]).toMatchObject({
                key: 'arm_tp8_candidate',
                model_name: 'Qwen/Qwen2.5-72B-Instruct',
                hardware: { hardware_name: 'H200', accelerator_count: 8 },
                inference_tool: 'SGLang',
            });

            // Write generated experiment.yaml to disk and re-assemble to verify round-trip fidelity
            fs.writeFileSync(path.join(hetDir, 'experiment.yaml'), initRes.yamlString);
            const roundTrip = discoverAndAssembleArms(hetDir);
            expect(roundTrip.ok).toBe(true);
            expect(roundTrip.arms[0].bundle.model_name).toBe('Qwen/Qwen2.5-32B-Instruct');
            expect(roundTrip.arms[0].bundle.hardware).toEqual({ hardware_name: 'H100', accelerator_count: 4 });
            expect(roundTrip.arms[0].bundle.inference_tool).toBe('vLLM');
            expect(roundTrip.arms[1].bundle.model_name).toBe('Qwen/Qwen2.5-72B-Instruct');
            expect(roundTrip.arms[1].bundle.hardware).toEqual({ hardware_name: 'H200', accelerator_count: 8 });
            expect(roundTrip.arms[1].bundle.inference_tool).toBe('SGLang');
        });

        it('assembles and validates already-assembled Prism bundles (prism fork output) directly', () => {
            const forkDir = createTempDir('prism-fork-bundle-');
            const stageObj = yaml.load(
                makeBrv02ReportYaml({
                    description: 'Forked Stage from /Users/forkuser/local',
                    model: 'meta-llama/Llama-3.1-70B-Instruct',
                    hardware: 'H100',
                    acceleratorCount: 8,
                    tool: 'vLLM',
                })
            );

            const forkedBundle = {
                schema_version: '1.0',
                runId: 'e4b1c2d3-5678-4abc-9def-0123456789ab',
                runLabel: 'Forked Llama 70B Run',
                model_name: 'meta-llama/Llama-3.1-70B-Instruct',
                hardware: {
                    hardware_name: 'H100',
                    accelerator_count: 8,
                },
                format: 'brv02',
                inference_tool: 'vLLM',
                forked_from: {
                    original_run_id: '11111111-2222-4333-8444-555555555555',
                    original_run_label: 'Source Llama 70B Run',
                    original_author: { username: 'octocat' },
                    source_bucket: 'llm-d-benchmarks',
                    forked_at: '2026-11-06T12:00:00.000Z',
                },
                forked: true,
                entries: [
                    {
                        run_id: '22222222-3333-4444-8555-666666666666',
                        filename: 'stage_0.yaml',
                        raw_report: stageObj,
                    },
                ],
            };

            expect(isAssembledPrismBundle(forkedBundle)).toBe(true);

            const forkedFilePath = path.join(forkDir, 'forked.json');
            fs.writeFileSync(forkedFilePath, JSON.stringify(forkedBundle, null, 2));

            // 1. Direct file target (e.g. `prism validate forked.json`)
            const directRes = discoverAndAssembleArms(forkedFilePath, {
                overrides: {
                    runLabel: 'Updated Forked Label',
                },
            });
            expect(directRes.ok).toBe(true);
            expect(directRes.exitCode).toBe(0);
            expect(directRes.arms).toHaveLength(1);
            expect(directRes.arms[0].bundle.runLabel).toBe('Updated Forked Label');
            expect(directRes.arms[0].bundle.forked_from.original_run_id).toBe(
                '11111111-2222-4333-8444-555555555555'
            );
            expect(directRes.arms[0].bundle.entries).toHaveLength(1);
            expect(
                directRes.arms[0].bundle.entries[0].raw_report.run.description
            ).toContain('Updated Forked Label');

            // 2. Directory containing forked.json
            const dirRes = discoverAndAssembleArms(forkDir);
            expect(dirRes.ok).toBe(true);
            expect(dirRes.arms).toHaveLength(1);
            expect(dirRes.arms[0].bundle.model_name).toBe('meta-llama/Llama-3.1-70B-Instruct');
        });

        it('prevents UUIDv4 strings starting with "e" from being corrupted by GCS decodeContextValue', () => {
            const uuidStartingWithE = 'e5371af0-5456-4f74-8b91-f8609537d1e5';
            expect(decodeContextValue(uuidStartingWithE)).toBe(uuidStartingWithE);

            const encodedUuid = encodeContextValue(uuidStartingWithE);
            expect(decodeContextValue(encodedUuid)).toBe(uuidStartingWithE);

            const encodedText = encodeContextValue('meta-llama/Llama-3.1-70B-Instruct');
            expect(decodeContextValue(encodedText)).toBe('meta-llama/Llama-3.1-70B-Instruct');
        });
    });
});
