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
import { describe, it, expect } from 'vitest';
import { scrubTextPii, scrubObjectPii, scrubBundlePii } from '../utils/piiScrubber.js';

describe('piiScrubber', () => {
    describe('scrubTextPii', () => {
        it('redacts secret tokens (HF, GitHub, Google API/OAuth, AWS, sk-, Bearer, inline key-value, PEM)', () => {
            const fakeHf = ['hf_', 'abcdefghijklmnopqrstuvwxyz1234'].join('');
            const fakeGhp = ['ghp_', '1234567890abcdefghijklmnopqrstuvwx'].join('');
            const fakeGhPat = ['github_pat_', '11AABBCCDD_1234567890abcdefghijklmnopqrstuv'].join('');
            const fakeGapi = ['AIza', 'SyDaGmWKa4JsXZ-0123456789abcdefghij'].join('');
            const fakeOauth = ['ya29.', 'a0AfH6SMBx1234567890abcdefghijklmnop'].join('');
            const fakeAws = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
            const fakeSk = ['sk-proj-', '1234567890abcdefghijklmnop'].join('');
            const pemHeader = ['-----BEGIN RSA ', 'PRIVATE KEY-----'].join('');
            const pemFooter = ['-----END RSA ', 'PRIVATE KEY-----'].join('');

            const raw = [
                `HuggingFace: ${fakeHf}`,
                `GitHub Classic: ${fakeGhp}`,
                `GitHub PAT: ${fakeGhPat}`,
                `Google API: ${fakeGapi}`,
                `Google OAuth: ${fakeOauth}`,
                `AWS Key: ${fakeAws}`,
                `OpenAI Key: ${fakeSk}`,
                'Auth Header: Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
                'Inline Env: HF_TOKEN="my_super_secret_hf_value"',
                'CLI Flag: --api_key=custom_secret_value_999',
                `${pemHeader}\nMIIEpAIBAAKCAQEA1234567890\n${pemFooter}`,
            ].join('\n');

            const { text, findings } = scrubTextPii(raw);

            expect(text).not.toContain(fakeHf);
            expect(text).not.toContain(fakeGhp);
            expect(text).not.toContain('github_pat_11AABBCCDD');
            expect(text).not.toContain(fakeGapi);
            expect(text).not.toContain(fakeOauth);
            expect(text).not.toContain(fakeAws);
            expect(text).not.toContain(fakeSk);
            expect(text).not.toContain('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9');
            expect(text).not.toContain('my_super_secret_hf_value');
            expect(text).not.toContain('custom_secret_value_999');
            expect(text).not.toContain('MIIEpAIBAAKCAQEA1234567890');

            expect(text).toContain('Bearer [REDACTED_SECRET]');
            expect(text).toContain('HF_TOKEN="[REDACTED_SECRET]"');
            expect(text).toContain('[REDACTED_PRIVATE_KEY]');

            const secretFinding = findings.find((f) => f.category === 'secret');
            expect(secretFinding).toBeDefined();
            expect(secretFinding.count).toBeGreaterThanOrEqual(10);
        });

        it('redacts user home paths and CitC workspace paths', () => {
            const raw = [
                'Loaded weights from /Users/alice.smith/.cache/huggingface/hub/llama',
                'Config path: /home/bob_dev/benchmarks/run_01/config.yaml',
                'Workspace: /google/src/cloud/charlie/my_workspace/google3/test.py',
            ].join('\n');

            const { text, findings } = scrubTextPii(raw);

            expect(text).toContain('$HOME/.cache/huggingface/hub/llama');
            expect(text).toContain('$HOME/benchmarks/run_01/config.yaml');
            expect(text).toContain('$WORKSPACE/my_workspace/google3/test.py');
            expect(text).not.toContain('alice.smith');
            expect(text).not.toContain('bob_dev');
            expect(text).not.toContain('charlie');

            const pathFinding = findings.find((f) => f.category === 'home_path');
            expect(pathFinding).toBeDefined();
            expect(pathFinding.count).toBe(3);
        });

        it('redacts internal corporate and cluster hostnames', () => {
            const raw = [
                'Endpoint: http://vllm-router.default.svc.cluster.local:8000/v1',
                'Pod DNS: 10-24-1-5.llm-d.pod.cluster.local',
                'Node: devbox.c.googlers.com and service.corp.google.com and tool.googleplex.com and gateway.internal',
            ].join('\n');

            const { text, findings } = scrubTextPii(raw);

            expect(text).toContain('http://[REDACTED_INTERNAL_HOST]:8000/v1');
            expect(text).not.toContain('svc.cluster.local');
            expect(text).not.toContain('pod.cluster.local');
            expect(text).not.toContain('devbox.c.googlers.com');
            expect(text).not.toContain('service.corp.google.com');
            expect(text).not.toContain('tool.googleplex.com');
            expect(text).not.toContain('gateway.internal');

            const hostFinding = findings.find((f) => f.category === 'internal_host');
            expect(hostFinding).toBeDefined();
            expect(hostFinding.count).toBe(6);
        });

        it('redacts RFC1918 private IPv4 addresses while ignoring version numbers', () => {
            const raw = 'Connected to 10.128.0.42, 192.168.1.100, and 172.24.15.9 on vLLM v10.1.2.3';
            const { text, findings } = scrubTextPii(raw);

            expect(text).toBe(
                'Connected to [REDACTED_PRIVATE_IP], [REDACTED_PRIVATE_IP], and [REDACTED_PRIVATE_IP] on vLLM v10.1.2.3'
            );
            const ipFinding = findings.find((f) => f.category === 'private_ip');
            expect(ipFinding).toBeDefined();
            expect(ipFinding.count).toBe(3);
        });

        it('redacts email addresses unless allowEmails is true', () => {
            const raw = 'Contact engineer@example.com or user.name+tag@sub.domain.org for details.';
            const scrubbed = scrubTextPii(raw);
            expect(scrubbed.text).toBe('Contact [REDACTED_EMAIL] or [REDACTED_EMAIL] for details.');
            expect(scrubbed.findings.find((f) => f.category === 'email')?.count).toBe(2);

            const allowed = scrubTextPii(raw, { allowEmails: true });
            expect(allowed.text).toBe(raw);
            expect(allowed.findings.find((f) => f.category === 'email')).toBeUndefined();
        });

        it('redacts HTTP basic-auth URL credentials and sensitive URL query parameters', () => {
            const raw = [
                'Registry: https://deployer:my_basic_auth_pw_123@registry.example.com/v2/models',
                'Webhook: https://api.example.com/callback?token=query_tok_98765&api_key=q_apikey_54321&client_secret=q_sec_111&page=2',
            ].join('\n');

            const { text, findings } = scrubTextPii(raw);
            expect(text).toContain('https://deployer:[REDACTED_SECRET]@registry.example.com/v2/models');
            expect(text).toContain(
                'https://api.example.com/callback?token=[REDACTED_SECRET]&api_key=[REDACTED_SECRET]&client_secret=[REDACTED_SECRET]&page=2'
            );
            expect(text).not.toContain('my_basic_auth_pw_123');
            expect(text).not.toContain('query_tok_98765');
            expect(text).not.toContain('q_apikey_54321');
            expect(text).not.toContain('q_sec_111');
            expect(findings.find((f) => f.category === 'secret')?.count).toBe(4);
        });
    });

    describe('scrubObjectPii & scrubBundlePii', () => {
        it('redacts sensitive object keys, scrubs base64 data-URI manifests, and preserves allowlisted attribution emails', () => {
            const rawManifestYaml = [
                'apiVersion: apps/v1',
                'kind: Deployment',
                'metadata:',
                '  annotations:',
                '    owner: secret-owner@corp.google.com',
                'spec:',
                '  template:',
                '    spec:',
                '      containers:',
                '        - name: vllm',
                '          env:',
                '            - name: HF_TOKEN',
                '              value: hf_1234567890abcdefghijklmnop',
                '          args:',
                '            - --model=/Users/johndoe/models/llama-3-70b',
                '            - --host=10.42.0.15',
            ].join('\n');

            const b64Manifest = `data:text/yaml;base64,${Buffer.from(rawManifestYaml, 'utf-8').toString('base64')}`;

            const rawBundle = {
                runId: '3f8c8b73-049e-4e4b-bb66-e8e08d6d63c3',
                runLabel: 'Llama-3-70B on node1.c.googlers.com',
                model_name: 'meta-llama/Llama-3-70B-Instruct',
                dco_signoff: {
                    signed_off_by: 'Jane Contributor <jane.contributor@example.com>',
                    signed_at: '2026-11-06T12:00:00.000Z',
                },
                github_author: {
                    username: 'janecontrib',
                    email: 'jane.contributor@example.com',
                },
                requested_reviewers: ['reviewer@example.com', 'octocat'],
                metadata: {
                    hf_token: 'custom_non_regex_token_value',
                    api_key: 'my_raw_api_key_string',
                    contact_email: 'leak@example.com',
                    local_dir: '/home/janecontrib/runs/exp1/',
                },
                manifests: {
                    'deployment.yaml': b64Manifest,
                },
                entries: [
                    {
                        run_id: '4f8c8b73-049e-4e4b-bb66-e8e08d6d63c4',
                        filename: 'stage_0.yaml',
                        raw_report: {
                            version: '0.2',
                            run: {
                                description: 'Run from /Users/janecontrib/workspace/ on 192.168.10.25',
                            },
                        },
                    },
                ],
            };

            const { bundle: scrubbed, piiReport } = scrubBundlePii(rawBundle);
            const directObjScrub = scrubObjectPii(rawBundle);
            expect(directObjScrub.piiReport.total_redactions).toBe(piiReport.total_redactions);

            // 1. Original object is not mutated
            expect(rawBundle.metadata.hf_token).toBe('custom_non_regex_token_value');

            // 2. Allowlisted paths preserve emails
            expect(scrubbed.dco_signoff.signed_off_by).toBe('Jane Contributor <jane.contributor@example.com>');
            expect(scrubbed.github_author.email).toBe('jane.contributor@example.com');
            expect(scrubbed.requested_reviewers).toEqual(['reviewer@example.com', 'octocat']);

            // 3. Non-allowlisted fields are scrubbed
            expect(scrubbed.runLabel).toBe('Llama-3-70B on [REDACTED_INTERNAL_HOST]');
            expect(scrubbed.metadata.hf_token).toBe('[REDACTED_SECRET]');
            expect(scrubbed.metadata.api_key).toBe('[REDACTED_SECRET]');
            expect(scrubbed.metadata.contact_email).toBe('[REDACTED_EMAIL]');
            expect(scrubbed.metadata.local_dir).toBe('$HOME/runs/exp1/');
            expect(scrubbed.entries[0].raw_report.run.description).toBe(
                'Run from $HOME/workspace/ on [REDACTED_PRIVATE_IP]'
            );

            // 4. Base64 Data-URI manifest is decoded, scrubbed, and re-encoded
            const scrubbedDataUri = scrubbed.manifests['deployment.yaml'];
            expect(scrubbedDataUri.startsWith('data:text/yaml;base64,')).toBe(true);
            const decodedManifest = Buffer.from(
                scrubbedDataUri.replace('data:text/yaml;base64,', ''),
                'base64'
            ).toString('utf-8');
            expect(decodedManifest).not.toContain('secret-owner@corp.google.com');
            expect(decodedManifest).not.toContain('hf_1234567890abcdefghijklmnop');
            expect(decodedManifest).not.toContain('/Users/johndoe/');
            expect(decodedManifest).not.toContain('10.42.0.15');
            expect(decodedManifest).toContain('[REDACTED_EMAIL]');
            expect(decodedManifest).toContain('[REDACTED_SECRET]');
            expect(decodedManifest).toContain('$HOME/models/llama-3-70b');
            expect(decodedManifest).toContain('[REDACTED_PRIVATE_IP]');

            // 5. pii_scrub_summary is attached to bundle and matches piiReport
            expect(scrubbed.pii_scrub_summary).toBeDefined();
            expect(scrubbed.pii_scrub_summary.scrubbed).toBe(true);
            expect(scrubbed.pii_scrub_summary.total_redactions).toBe(piiReport.total_redactions);
            expect(piiReport.total_redactions).toBeGreaterThanOrEqual(9);
            expect(piiReport.categories.secret).toBeGreaterThanOrEqual(3);
            expect(piiReport.categories.home_path).toBeGreaterThanOrEqual(3);
            expect(piiReport.categories.email).toBeGreaterThanOrEqual(2);
            expect(piiReport.categories.private_ip).toBeGreaterThanOrEqual(2);
            expect(piiReport.categories.internal_host).toBeGreaterThanOrEqual(1);
        });

        it('redacts camelCase secret keys without false-positiving token metric/tokenizer keys, and handles circular/Date/RegExp objects', () => {
            const cyclic = {
                accessToken: 'camel_access_token_val',
                refreshToken: 'camel_refresh_token_val',
                clientSecret: 'camel_client_secret_val',
                privateKey: 'camel_private_key_val',
                apiKey: 'camel_api_key_val',
                hfToken: 'camel_hf_token_val',
                secretKey: 'camel_secret_key_val',
                authToken: 'camel_auth_token_val',
                bearerToken: 'camel_bearer_token_val',
                awsSecretAccessKey: 'camel_aws_secret_val',
                openaiApiKey: 'camel_openai_key_val',
                metrics: {
                    max_tokens: '4096',
                    input_tokens: '1024',
                    output_tokens: '512',
                    total_tokens: '1536',
                    prompt_tokens: '1024',
                    completion_tokens: '512',
                    tokenizer: 'meta-llama/Llama-3.1-70B-Instruct',
                },
                createdAt: new Date('2026-11-06T00:00:00.000Z'),
                pattern: /^llama-3/i,
            };
            cyclic.self = cyclic;

            const { data, piiReport } = scrubObjectPii(cyclic);

            expect(data.accessToken).toBe('[REDACTED_SECRET]');
            expect(data.refreshToken).toBe('[REDACTED_SECRET]');
            expect(data.clientSecret).toBe('[REDACTED_SECRET]');
            expect(data.privateKey).toBe('[REDACTED_SECRET]');
            expect(data.apiKey).toBe('[REDACTED_SECRET]');
            expect(data.hfToken).toBe('[REDACTED_SECRET]');
            expect(data.secretKey).toBe('[REDACTED_SECRET]');
            expect(data.authToken).toBe('[REDACTED_SECRET]');
            expect(data.bearerToken).toBe('[REDACTED_SECRET]');
            expect(data.awsSecretAccessKey).toBe('[REDACTED_SECRET]');
            expect(data.openaiApiKey).toBe('[REDACTED_SECRET]');

            // Token count/metric & tokenizer fields are preserved untouched
            expect(data.metrics).toEqual({
                max_tokens: '4096',
                input_tokens: '1024',
                output_tokens: '512',
                total_tokens: '1536',
                prompt_tokens: '1024',
                completion_tokens: '512',
                tokenizer: 'meta-llama/Llama-3.1-70B-Instruct',
            });

            expect(data.createdAt).toBeInstanceOf(Date);
            expect(data.createdAt.toISOString()).toBe('2026-11-06T00:00:00.000Z');
            expect(data.pattern).toBeInstanceOf(RegExp);
            expect(data.pattern.source).toBe('^llama-3');
            expect(data.self).toBe('[Circular]');
            expect(piiReport.categories.secret).toBe(11);
        });
    });
});
