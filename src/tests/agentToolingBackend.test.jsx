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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../server/oauth.ts', () => ({
    validateGitHubToken: vi.fn()
}));

vi.mock('../../server/iam.ts', () => ({
    isPlaygroundMode: vi.fn(() => false)
}));

import { validateGitHubToken } from '../../server/oauth.ts';
import { isPlaygroundMode } from '../../server/iam.ts';
import * as gcsModule from '../../server/results/gcs.ts';
import { resultsRouter } from '../../server/results/index.ts';
import { submitResultsHandler } from '../../server/results/routes/submit.ts';
import { listResultsHandler } from '../../server/results/routes/list.ts';
import { getResultsHandler } from '../../server/results/routes/get.ts';
import {
    getAgentToolingManifestHandler,
    getAgentSkillMdHandler,
    getAgentCliBundleHandler,
    getAgentExampleManifestHandler,
    getAgentInstallScriptHandler,
    getLlmsTxtHandler
} from '../../server/results/routes/agent.ts';
import { sanitizeSubmissionPayload } from '../../server/results/service.ts';
import { combineStagesToRunBundle } from '../utils/benchmarkReportV02Parser.js';
import { createForkedBundle } from '../utils/benchmarkForker.js';

function buildValidAgentPayload(overrides = {}) {
    const runLabel = overrides.runLabel || 'Llama 3.1 70B Arm 1';
    return {
        runId: '11111111-2222-4333-8444-555555555555',
        runLabel,
        model_name: 'meta-llama/Llama-3.1-70B-Instruct',
        hardware: {
            hardware_name: 'H100',
            accelerator_count: 8
        },
        format: 'brv02',
        experiment_id: 'exp-pd-disagg-2026-q4',
        experiment_label: 'PD Disaggregation Sweep Q4',
        baseline_run_id: '00000000-1111-4222-8333-444444444444',
        dco_signoff: {
            signed_off_by: 'Ada Lovelace <ada@example.com>',
            signed_at: '2026-11-06T18:00:00.000Z',
            source: 'cli-flag'
        },
        agent_provenance: {
            agent_name: 'uBench-agent',
            tool_version: 'prism-cli/0.1.0',
            harness: 'inference-perf',
            harness_version: 'v0.5.0',
            commit_sha: 'deadbeef'
        },
        pii_scrub_summary: {
            scrubbed: true,
            scrubbed_at: '2026-11-06T17:59:50.000Z',
            total_redactions: 3,
            categories: {
                secret: 1,
                home_path: 2
            }
        },
        entries: [
            {
                run_id: '66666666-7777-4888-8999-aaaaaaaaaaaa',
                run_description: runLabel,
                filename: 'stage_0.yaml',
                prism_stage_index: 0,
                raw_report: {
                    version: '0.2',
                    workload: { stage: 0 },
                    scenario: {
                        stack: [
                            {
                                standardized: {
                                    tool: 'vllm',
                                    model: { name: 'meta-llama/Llama-3.1-70B-Instruct' },
                                    accelerator: { model: 'H100', count: 8 }
                                }
                            }
                        ]
                    },
                    results: {
                        request_performance: {
                            aggregate: {
                                requests: { total: 100, failures: 0 },
                                throughput: { output_token_rate: { mean: 450, units: 'tokens/s' } },
                                latency: {
                                    request_latency: { mean: 1.2, units: 's' },
                                    time_to_first_token: { mean: 0.08, units: 's' },
                                    time_per_output_token: { mean: 0.015, units: 's/token' }
                                }
                            }
                        }
                    }
                }
            }
        ],
        ...overrides
    };
}

function createReqRes({
    method = 'GET',
    url = '/api/results',
    protocol = 'https',
    host = 'prism.llm-d.ai',
    body = {},
    token = 'valid-token',
    query = {},
    params = {}
} = {}) {
    const headers = {
        host
    };
    if (token !== undefined && token !== null) {
        headers['x-prism-github-token'] = token;
    }

    const req = {
        method,
        url,
        originalUrl: url,
        protocol,
        headers,
        query,
        params,
        body,
        get(headerName) {
            return headers[String(headerName).toLowerCase()];
        }
    };

    const resHeaders = {};
    const res = {
        statusCode: 200,
        headers: resHeaders,
        body: null,
        setHeader(name, value) {
            resHeaders[String(name).toLowerCase()] = value;
            return this;
        },
        getHeader(name) {
            return resHeaders[String(name).toLowerCase()];
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
        send(payload) {
            this.body = payload;
            return this;
        }
    };

    return { req, res };
}

describe('Agent-Native Results Store Backend & Schema (#185, #186)', () => {
    let savedObjects;
    let bucketSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        savedObjects = new Map();

        vi.mocked(isPlaygroundMode).mockReturnValue(false);
        vi.mocked(validateGitHubToken).mockResolvedValue({
            username: 'contributor',
            permission: 'user'
        });

        const mockBucket = {
            file: vi.fn((objectName) => ({
                save: vi.fn(async (contents, options) => {
                    savedObjects.set(objectName, {
                        name: objectName,
                        contents: typeof contents === 'string' ? contents : globalThis.Buffer.from(contents).toString('utf8'),
                        metadata: {
                            ...(options?.metadata || {}),
                            timeCreated: '2026-11-06T19:00:00.000Z'
                        }
                    });
                }),
                download: vi.fn(async () => {
                    const obj = savedObjects.get(objectName);
                    if (!obj) {
                        const err = new Error('Not found');
                        err.code = 404;
                        throw err;
                    }
                    return [globalThis.Buffer.from(obj.contents, 'utf8')];
                }),
                getMetadata: vi.fn(async () => {
                    const obj = savedObjects.get(objectName);
                    if (!obj) {
                        const err = new Error('Not found');
                        err.code = 404;
                        throw err;
                    }
                    return [obj.metadata];
                }),
                delete: vi.fn(async () => {
                    savedObjects.delete(objectName);
                })
            })),
            getFiles: vi.fn(async () => {
                return [Array.from(savedObjects.values()), null];
            })
        };

        bucketSpy = vi.spyOn(gcsModule.storage, 'bucket').mockReturnValue(mockBucket);
    });

    afterEach(() => {
        if (bucketSpy) {
            bucketSpy.mockRestore();
        }
    });

    it('persists campaign fields, dco_signoff, agent_provenance, and pii_scrub_summary and filters via GET /api/results?experimentId=...', async () => {
        // Submit Arm 1 belonging to campaign exp-pd-disagg-2026-q4
        const arm1Payload = buildValidAgentPayload({
            runLabel: 'PD Disagg Arm 1 (Baseline)',
            experiment_id: 'exp-pd-disagg-2026-q4',
            experiment_label: 'PD Disaggregation Sweep Q4'
        });
        const { req: subReq1, res: subRes1 } = createReqRes({ body: arm1Payload });
        await submitResultsHandler(subReq1, subRes1);

        expect(subRes1.statusCode).toBe(201);
        const arm1RunId = subRes1.body.runId;
        expect(arm1RunId).toBeTruthy();

        // Submit an unrelated run belonging to a different campaign
        const otherPayload = buildValidAgentPayload({
            runLabel: 'Other Campaign Run',
            experiment_id: 'exp-other-campaign',
            experiment_label: 'Other Sweep'
        });
        const { req: subReq2, res: subRes2 } = createReqRes({ body: otherPayload });
        await submitResultsHandler(subReq2, subRes2);
        expect(subRes2.statusCode).toBe(201);

        // Verify GET /api/results/:runId returns full provenance, DCO, and campaign metadata
        const { req: getReq, res: getRes } = createReqRes({
            params: { runId: arm1RunId }
        });
        await getResultsHandler(getReq, getRes);

        expect(getRes.statusCode).toBe(200);
        expect(getRes.body.experiment_id).toBe('exp-pd-disagg-2026-q4');
        expect(getRes.body.experiment_label).toBe('PD Disaggregation Sweep Q4');
        expect(getRes.body.baseline_run_id).toBe('00000000-1111-4222-8333-444444444444');
        expect(getRes.body.dco_signoff).toEqual({
            signed_off_by: 'Ada Lovelace <ada@example.com>',
            signed_at: '2026-11-06T18:00:00.000Z',
            source: 'cli-flag'
        });
        expect(getRes.body.agent_provenance).toMatchObject({
            agent_name: 'uBench-agent',
            harness: 'inference-perf',
            commit_sha: 'deadbeef'
        });
        expect(getRes.body.pii_scrub_summary).toEqual({
            scrubbed: true,
            scrubbed_at: '2026-11-06T17:59:50.000Z',
            total_redactions: 3,
            categories: { secret: 1, home_path: 2 }
        });

        // Verify GET /api/results?experimentId=exp-pd-disagg-2026-q4 filters to only the matching campaign run
        const { req: listReq, res: listRes } = createReqRes({
            query: { experimentId: 'exp-pd-disagg-2026-q4' }
        });
        await listResultsHandler(listReq, listRes);

        expect(listRes.statusCode).toBe(200);
        expect(listRes.body.items).toHaveLength(1);
        expect(listRes.body.items[0].runId).toBe(arm1RunId);
        expect(listRes.body.items[0].experiment_id).toBe('exp-pd-disagg-2026-q4');
        expect(listRes.body.items[0].experiment_label).toBe('PD Disaggregation Sweep Q4');
        expect(listRes.body.items[0].baseline_run_id).toBe('00000000-1111-4222-8333-444444444444');
    });

    it('Issue #186: allows admin users to direct-publish with targetState=public or promoted and records review.history, while rejecting non-admins with 403', async () => {
        // 1. Standard non-admin contributor attempting targetState=public -> 403 Forbidden
        vi.mocked(validateGitHubToken).mockResolvedValueOnce({
            username: 'contributor',
            permission: 'user'
        });

        const nonAdminPayload = buildValidAgentPayload();
        const { req: forbiddenReq, res: forbiddenRes } = createReqRes({
            body: nonAdminPayload,
            query: { targetState: 'public' }
        });
        await submitResultsHandler(forbiddenReq, forbiddenRes);

        expect(forbiddenRes.statusCode).toBe(403);
        expect(forbiddenRes.body.error).toMatch(/requires admin privileges/i);
        expect(savedObjects.size).toBe(0);

        // 2. Admin user direct-publishing with targetState=public -> 201 Created + state='public' + review.history populated
        vi.mocked(validateGitHubToken).mockResolvedValue({
            username: 'maintainer-admin',
            permission: 'admin'
        });

        const adminPublicPayload = buildValidAgentPayload({ runLabel: 'Direct Public Run' });
        const { req: pubReq, res: pubRes } = createReqRes({
            body: adminPublicPayload,
            query: { targetState: 'public' }
        });
        await submitResultsHandler(pubReq, pubRes);

        expect(pubRes.statusCode).toBe(201);
        expect(pubRes.body.state).toBe('public');

        const { req: getPubReq, res: getPubRes } = createReqRes({
            params: { runId: pubRes.body.runId }
        });
        await getResultsHandler(getPubReq, getPubRes);

        expect(getPubRes.statusCode).toBe(200);
        expect(getPubRes.body.review).toBeTruthy();
        expect(getPubRes.body.review.reviewer).toBe('maintainer-admin');
        expect(getPubRes.body.review.history).toHaveLength(1);
        expect(getPubRes.body.review.history[0]).toMatchObject({
            status: 'public',
            by: 'maintainer-admin',
            feedback: 'Direct publish on submission'
        });

        // 3. Admin user direct-publishing with targetState=promoted -> 201 Created + state='promoted'
        const adminPromotedPayload = buildValidAgentPayload({ runLabel: 'Direct Promoted Run' });
        const { req: promReq, res: promRes } = createReqRes({
            body: adminPromotedPayload,
            query: { targetState: 'promoted' }
        });
        await submitResultsHandler(promReq, promRes);

        expect(promRes.statusCode).toBe(201);
        expect(promRes.body.state).toBe('promoted');
    });

    it('preserves campaign and provenance metadata in combineStagesToRunBundle and sanitizeSubmissionPayload, and resets sign-off in createForkedBundle', () => {
        const rawPayload = buildValidAgentPayload();

        // 1. sanitizeSubmissionPayload preserves campaign & provenance fields
        const sanitized = sanitizeSubmissionPayload({
            ...rawPayload,
            requested_reviewers: ['@ReviewerOne ', ' reviewerone']
        });
        expect(sanitized.experiment_id).toBe('exp-pd-disagg-2026-q4');
        expect(sanitized.experiment_label).toBe('PD Disaggregation Sweep Q4');
        expect(sanitized.baseline_run_id).toBe('00000000-1111-4222-8333-444444444444');
        expect(sanitized.dco_signoff).toEqual(rawPayload.dco_signoff);
        expect(sanitized.agent_provenance).toEqual(rawPayload.agent_provenance);
        expect(sanitized.pii_scrub_summary).toEqual(rawPayload.pii_scrub_summary);
        expect(sanitized.requested_reviewers).toEqual(['ReviewerOne']);

        // 2. combineStagesToRunBundle preserves existingBundle campaign & provenance fields
        const combined = combineStagesToRunBundle(rawPayload.entries, rawPayload);
        expect(combined.experiment_id).toBe('exp-pd-disagg-2026-q4');
        expect(combined.experiment_label).toBe('PD Disaggregation Sweep Q4');
        expect(combined.baseline_run_id).toBe('00000000-1111-4222-8333-444444444444');
        expect(combined.dco_signoff).toEqual(rawPayload.dco_signoff);
        expect(combined.agent_provenance).toEqual(rawPayload.agent_provenance);
        expect(combined.pii_scrub_summary).toEqual(rawPayload.pii_scrub_summary);

        // 3. createForkedBundle resets dco_signoff and agent_provenance to null while honoring overrides
        const forked = createForkedBundle(rawPayload, {
            runLabel: 'Forked Arm 1',
            experiment_id: 'exp-forked-campaign',
            experiment_label: 'Forked Campaign'
        });
        expect(forked.runId).not.toBe(rawPayload.runId);
        expect(forked.runLabel).toBe('Forked Arm 1');
        expect(forked.dco_signoff).toBeNull();
        expect(forked.agent_provenance).toBeNull();
        expect(forked.experiment_id).toBe('exp-forked-campaign');
        expect(forked.experiment_label).toBe('Forked Campaign');
        expect(forked.forked_from).toBeTruthy();
    });

    it('serves zero-clone Agent Skill & CLI bundle via /api/results/agent* and /SKILL.md without colliding with /api/results/:runId', () => {
        // 1. GET /api/results/agent manifest
        const { req: manReq, res: manRes } = createReqRes({
            url: '/api/results/agent',
            host: 'prism.llm-d.ai'
        });
        getAgentToolingManifestHandler(manReq, manRes);

        expect(manRes.statusCode).toBe(200);
        expect(manRes.body.name).toBe('prism-results');
        expect(manRes.body.baseUrl).toBe('https://prism.llm-d.ai');
        expect(manRes.body.endpoints).toEqual({
            skillMd: 'https://prism.llm-d.ai/api/results/agent/SKILL.md',
            cliBundle: 'https://prism.llm-d.ai/api/results/agent/prism.mjs',
            exampleManifest: 'https://prism.llm-d.ai/api/results/agent/experiment.yaml',
            installScript: 'https://prism.llm-d.ai/api/results/agent/install.sh'
        });
        expect(manRes.body.sha256.prismMjs).toMatch(/^[a-f0-9]{64}$/);
        expect(manRes.body.quickStart.zeroCloneCli).toContain('curl -fsSL https://prism.llm-d.ai/api/results/agent/prism.mjs');

        // 2. GET /api/results/agent/SKILL.md injects Zero-Clone Remote Bootstrap callout
        const { req: skillReq, res: skillRes } = createReqRes({
            url: '/api/results/agent/SKILL.md',
            host: 'custom-prism.example.com'
        });
        getAgentSkillMdHandler(skillReq, skillRes);

        expect(skillRes.statusCode).toBe(200);
        expect(skillRes.getHeader('content-type')).toContain('text/markdown');
        expect(skillRes.body).toContain('Zero-Clone Remote Bootstrap (Served by `https://custom-prism.example.com`)');
        expect(skillRes.body).toContain('https://custom-prism.example.com/api/results/agent/prism.mjs');

        // 3. GET /api/results/agent/prism.mjs returns standalone CLI bundle with matching SHA-256 header
        const { req: cliReq, res: cliRes } = createReqRes({
            url: '/api/results/agent/prism.mjs'
        });
        getAgentCliBundleHandler(cliReq, cliRes);

        expect(cliRes.statusCode).toBe(200);
        expect(cliRes.getHeader('content-type')).toContain('application/javascript');
        expect(cliRes.getHeader('x-prism-cli-sha256')).toBe(manRes.body.sha256.prismMjs);
        expect(String(cliRes.body).startsWith('#!/usr/bin/env node')).toBe(true);

        // 4. GET /api/results/agent/experiment.yaml returns YAML manifest template
        const { req: yamlReq, res: yamlRes } = createReqRes({
            url: '/api/results/agent/experiment.yaml'
        });
        getAgentExampleManifestHandler(yamlReq, yamlRes);

        expect(yamlRes.statusCode).toBe(200);
        expect(yamlRes.getHeader('content-type')).toContain('text/yaml');
        expect(yamlRes.body).toContain('experiment:');
        expect(yamlRes.body).toContain('arms:');

        // 5. GET /api/results/agent/install.sh returns bash installer with embedded SHA-256 verification
        const { req: shReq, res: shRes } = createReqRes({
            url: '/api/results/agent/install.sh',
            host: 'prism.llm-d.ai'
        });
        getAgentInstallScriptHandler(shReq, shRes);

        expect(shRes.statusCode).toBe(200);
        expect(shRes.getHeader('content-type')).toContain('text/x-shellscript');
        expect(shRes.body).toContain('#!/usr/bin/env bash');
        expect(shRes.body).toContain(`EXPECTED_SHA256="${manRes.body.sha256.prismMjs}"`);
        expect(shRes.body).toContain('/api/results/agent/prism.mjs');

        // 6. Verify Express resultsRouter registers /api/results/agent* and /SKILL.md BEFORE /api/results/:runId
        const routePaths = resultsRouter.stack
            .filter((layer) => layer.route)
            .map((layer) => layer.route.path);

        const agentIdx = routePaths.indexOf('/api/results/agent');
        const rootSkillIdx = routePaths.indexOf('/SKILL.md');
        const runIdIdx = routePaths.indexOf('/api/results/:runId');

        expect(agentIdx).toBeGreaterThanOrEqual(0);
        expect(rootSkillIdx).toBeGreaterThanOrEqual(0);
        expect(runIdIdx).toBeGreaterThan(agentIdx);

        // Dispatch GET /api/results/agent through resultsRouter directly to confirm it does not hit getResultsHandler (which would return 400 Invalid UUID)
        const { req: routerReq, res: routerRes } = createReqRes({
            method: 'GET',
            url: '/api/results/agent',
            host: 'prism.llm-d.ai'
        });
        resultsRouter.handle(routerReq, routerRes, () => {});
        expect(routerRes.statusCode).toBe(200);
        expect(routerRes.body.name).toBe('prism-results');

        // 7. Verify GET /llms.txt, /.well-known/agent.json, /.well-known/skills/index.json, and /.well-known/skills/prism-results/SKILL.md
        const { req: llmsReq, res: llmsRes } = createReqRes({
            method: 'GET',
            url: '/llms.txt',
            host: 'prism.llm-d.ai'
        });
        getLlmsTxtHandler(llmsReq, llmsRes);
        expect(llmsRes.statusCode).toBe(200);
        expect(llmsRes.getHeader('content-type')).toContain('text/plain');
        expect(llmsRes.body).toContain('# Prism — llm-d Benchmark Explorer & Results Store');
        expect(llmsRes.body).toContain('[Prism Results Store Agent Skill (SKILL.md)](https://prism.llm-d.ai/SKILL.md)');
        expect(llmsRes.body).toContain('[Agent Tooling Discovery Manifest](https://prism.llm-d.ai/api/results/agent)');
        expect(llmsRes.body).toContain('[Standalone CLI Bundle (prism.mjs)](https://prism.llm-d.ai/api/results/agent/prism.mjs)');
        expect(llmsRes.body).toContain('[One-Line Skill Installer (install.sh)](https://prism.llm-d.ai/api/results/agent/install.sh)');
        expect(llmsRes.body).toContain('[Example Multi-Arm Manifest (experiment.yaml)](https://prism.llm-d.ai/api/results/agent/experiment.yaml)');

        const { req: wkAgentReq, res: wkAgentRes } = createReqRes({
            method: 'GET',
            url: '/.well-known/agent.json',
            host: 'prism.llm-d.ai'
        });
        resultsRouter.handle(wkAgentReq, wkAgentRes, () => {});
        expect(wkAgentRes.statusCode).toBe(200);
        expect(wkAgentRes.body.name).toBe('prism-results');

        const { req: wkSkillsIdxReq, res: wkSkillsIdxRes } = createReqRes({
            method: 'GET',
            url: '/.well-known/skills/index.json',
            host: 'prism.llm-d.ai'
        });
        resultsRouter.handle(wkSkillsIdxReq, wkSkillsIdxRes, () => {});
        expect(wkSkillsIdxRes.statusCode).toBe(200);
        expect(wkSkillsIdxRes.body.name).toBe('prism-results');

        const { req: wkSkillMdReq, res: wkSkillMdRes } = createReqRes({
            method: 'GET',
            url: '/.well-known/skills/prism-results/SKILL.md',
            host: 'prism.llm-d.ai'
        });
        resultsRouter.handle(wkSkillMdReq, wkSkillMdRes, () => {});
        expect(wkSkillMdRes.statusCode).toBe(200);
        expect(wkSkillMdRes.getHeader('content-type')).toContain('text/markdown');
        expect(wkSkillMdRes.body).toContain('Zero-Clone Remote Bootstrap (Served by `https://prism.llm-d.ai`)');
    });
});
