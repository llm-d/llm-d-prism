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

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../oauth.ts', () => ({
    validateGitHubToken: vi.fn()
}));

vi.mock('../../iam.ts', () => ({
    isPlaygroundMode: vi.fn(() => false)
}));

vi.mock('../gcs.ts', () => ({
    writeResult: vi.fn(),
    deleteResult: vi.fn()
}));

vi.mock('../processing.ts', () => ({
    processSubmission: vi.fn()
}));

import { validateGitHubToken } from '../../oauth.ts';
import { isPlaygroundMode } from '../../iam.ts';
import { writeResult } from '../gcs.ts';
import { processSubmission } from '../processing.ts';
import { submitResultsHandler } from './submit.ts';

function buildUploadPayload(overrides = {}) {
    return {
        runId: '11111111-2222-4333-8444-555555555555',
        runLabel: 'Llama 70B H100 Run',
        model_name: 'meta-llama/Llama-3.1-70B-Instruct',
        hardware: {
            hardware_name: 'H100',
            accelerator_count: 8
        },
        format: 'brv02',
        entries: [
            {
                run_id: '66666666-7777-4888-8999-aaaaaaaaaaaa',
                run_description: 'Stage 0',
                filename: 'stage_0.yaml',
                raw_report: {
                    version: '0.2',
                    workload: { stage: 0 },
                    scenario: { model: 'meta-llama/Llama-3.1-70B-Instruct' },
                    results: {
                        request_performance: {
                            aggregate: {
                                throughput: { output_token_rate: { mean: 100 } },
                                latency: {
                                    request_latency: { mean: 0.2 },
                                    time_to_first_token: { mean: 0.05 }
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

function createSubmitReqRes({ body, token = 'valid-token', query = {} } = {}) {
    const headers = {};
    if (token !== undefined) {
        headers['x-prism-github-token'] = token;
    }

    const req = {
        headers,
        query,
        body
    };

    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };

    return { req, res };
}

describe('POST /api/results & GCS requested_reviewers persistence', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(isPlaygroundMode).mockReturnValue(false);
        vi.mocked(validateGitHubToken).mockResolvedValue({
            username: 'contributor',
            permission: 'user'
        });
        vi.mocked(writeResult).mockResolvedValue(undefined);
        vi.mocked(processSubmission).mockResolvedValue({
            success: true,
            state: 'submitted_pending_review',
            errors: [],
            warnings: []
        });
    });

    it('sanitizes and deduplicates requested_reviewers before writing to GCS', async () => {
        const payload = buildUploadPayload({
            requested_reviewers: ['@Octocat ', ' bob ', 'octocat', '']
        });
        const { req, res } = createSubmitReqRes({ body: payload });

        await submitResultsHandler(req, res);

        expect(res.statusCode).toBe(201);
        expect(writeResult).toHaveBeenCalledTimes(1);
        const [, savedPayload] = vi.mocked(writeResult).mock.calls[0];
        expect(savedPayload.requested_reviewers).toEqual(['Octocat', 'bob']);
    });

    it('deletes requested_reviewers when array normalizes to empty or is null', async () => {
        const emptyArrPayload = buildUploadPayload({
            requested_reviewers: [' ', '@', '']
        });
        const { req: req1, res: res1 } = createSubmitReqRes({ body: emptyArrPayload });
        await submitResultsHandler(req1, res1);

        expect(res1.statusCode).toBe(201);
        const [, savedPayload1] = vi.mocked(writeResult).mock.calls[0];
        expect('requested_reviewers' in savedPayload1).toBe(false);

        vi.mocked(writeResult).mockClear();

        const nullPayload = buildUploadPayload({
            requested_reviewers: null
        });
        const { req: req2, res: res2 } = createSubmitReqRes({ body: nullPayload });
        await submitResultsHandler(req2, res2);

        expect(res2.statusCode).toBe(201);
        const [, savedPayload2] = vi.mocked(writeResult).mock.calls[0];
        expect('requested_reviewers' in savedPayload2).toBe(false);
    });

    it('leaves malformed non-string requested_reviewers intact so processSubmission rejects with 400', async () => {
        vi.mocked(processSubmission).mockResolvedValueOnce({
            success: false,
            errors: ['Invalid requested_reviewers type: expected string'],
            warnings: []
        });

        const badPayload = buildUploadPayload({
            requested_reviewers: [123]
        });
        const { req, res } = createSubmitReqRes({ body: badPayload });

        await submitResultsHandler(req, res);

        expect(res.statusCode).toBe(400);
        expect(writeResult).toHaveBeenCalledTimes(1);
        const [, savedPayload] = vi.mocked(writeResult).mock.calls[0];
        expect(savedPayload.requested_reviewers).toEqual([123]);
    });

    it('round-trips requested_reviewers through GCS custom contexts in writeResult and listResults, and handles legacy objects without it', async () => {
        const actualGcs = await vi.importActual('../gcs.ts');
        const savedObjects = [];

        const mockBucket = {
            file: vi.fn((objectName) => ({
                save: vi.fn(async (contents, options) => {
                    savedObjects.push({
                        name: objectName,
                        contents,
                        metadata: {
                            ...options.metadata,
                            timeCreated: '2026-11-05T20:00:00Z'
                        }
                    });
                })
            })),
            getFiles: vi.fn(async () => {
                const prefix = actualGcs.getPrismResultsPrefix();
                const legacyFile = {
                    name: `${prefix}aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.v1.json`,
                    metadata: {
                        timeCreated: '2026-10-01T12:00:00Z',
                        contexts: {
                            custom: {
                                submission_state: { value: 'submitted_pending_review' },
                                github_user: { value: 'legacy-user' },
                                run_id: { value: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
                                hardware_name: { value: actualGcs.encodeContextValue('A100') },
                                model_name: { value: actualGcs.encodeContextValue('Llama-2-7b') },
                                run_label: { value: actualGcs.encodeContextValue('Legacy Run') }
                            }
                        }
                    }
                };
                return [[...savedObjects, legacyFile], null];
            })
        };

        const bucketSpy = vi.spyOn(actualGcs.storage, 'bucket').mockReturnValue(mockBucket);

        try {
            const runId = '22222222-3333-4444-8555-666666666666';
            const payload = buildUploadPayload({
                runId,
                requested_reviewers: ['@Octocat', 'bob']
            });

            await actualGcs.writeResult(runId, payload, 'submitted_pending_review', 'contributor');

            expect(savedObjects.length).toBe(1);
            const customCtx = savedObjects[0].metadata.contexts.custom;
            expect(customCtx.requested_reviewers).toEqual({
                value: actualGcs.encodeContextValue('Octocat,bob')
            });

            const listed = await actualGcs.listResults({
                limit: 10,
                permission: 'admin',
                username: 'admin-user'
            });

            const newItem = listed.items.find((i) => i.runId === runId);
            const legacyItem = listed.items.find((i) => i.runId === 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');

            expect(newItem).toBeTruthy();
            expect(newItem.requested_reviewers).toEqual(['Octocat', 'bob']);

            expect(legacyItem).toBeTruthy();
            expect(legacyItem.requested_reviewers).toBeUndefined();
        } finally {
            bucketSpy.mockRestore();
        }
    });
});
