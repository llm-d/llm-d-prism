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

import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SKILL_ROOT_DIR = path.resolve(__dirname, '../../../skills/prism-results');
export const SKILL_MD_PATH = path.join(SKILL_ROOT_DIR, 'SKILL.md');
export const CLI_BUNDLE_PATH = path.join(SKILL_ROOT_DIR, 'scripts/prism.mjs');
export const EXAMPLE_MANIFEST_PATH = path.join(SKILL_ROOT_DIR, 'examples/experiment.yaml');

/**
 * Resolves the public base URL of the Prism server from environment or request headers.
 */
export function resolveBaseUrl(req: Request): string {
    const envUrl = process.env.PRISM_PUBLIC_URL || process.env.PUBLIC_URL;
    if (envUrl && envUrl.trim()) {
        return envUrl.trim().replace(/\/+$/, '');
    }

    const rawProto = (req.headers?.['x-forwarded-proto'] as string | undefined) || req.protocol || 'https';
    const proto = String(rawProto).split(',')[0].trim() || 'https';

    const rawHost =
        (req.headers?.['x-forwarded-host'] as string | undefined) ||
        (typeof req.get === 'function' ? req.get('host') : undefined) ||
        (req.headers?.host as string | undefined) ||
        'prism.llm-d.ai';
    const host = String(rawHost).split(',')[0].trim() || 'prism.llm-d.ai';

    return `${proto}://${host}`;
}

function computeFileSha256(filePath: string): string {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function injectZeroCloneBootstrapSection(rawMarkdown: string, baseUrl: string): string {
    const bootstrapBlock = [
        `> **Zero-Clone Remote Bootstrap (Served by \`${baseUrl}\`)**`,
        `> You do **not** need a local git clone of \`llm-d-prism\` to use this skill. Download the standalone zero-install CLI bundle directly from this Prism instance:`,
        `> \`\`\`bash`,
        `> curl -fsSL ${baseUrl}/api/results/agent/prism.mjs -o /tmp/prism.mjs && chmod +x /tmp/prism.mjs`,
        `> export PRISM_API_URL="${baseUrl}"`,
        `> node /tmp/prism.mjs <command> [flags]`,
        `> \`\`\``,
        `> Or install the full skill bundle (\`SKILL.md\`, \`scripts/prism.mjs\`, \`examples/experiment.yaml\`) in one command:`,
        `> \`\`\`bash`,
        `> curl -fsSL ${baseUrl}/api/results/agent/install.sh | bash`,
        `> \`\`\``
    ].join('\n');

    // Insert right after YAML frontmatter if present
    const frontmatterMatch = rawMarkdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
    if (frontmatterMatch) {
        const prefix = frontmatterMatch[0];
        const rest = rawMarkdown.slice(prefix.length).replace(/^\r?\n/, '');
        return `${prefix}\n${bootstrapBlock}\n\n${rest}`;
    }

    return `${bootstrapBlock}\n\n${rawMarkdown}`;
}

/**
 * GET /api/results/agent
 * Returns machine-readable discovery metadata and quick-start commands for the hosted agent skill & CLI bundle.
 */
export function getAgentToolingManifestHandler(req: Request, res: Response) {
    try {
        const baseUrl = resolveBaseUrl(req);
        const prismMjsSha256 = fs.existsSync(CLI_BUNDLE_PATH) ? computeFileSha256(CLI_BUNDLE_PATH) : null;

        return res.status(200).json({
            name: 'prism-results',
            version: '1.0.0',
            baseUrl,
            endpoints: {
                skillMd: `${baseUrl}/api/results/agent/SKILL.md`,
                cliBundle: `${baseUrl}/api/results/agent/prism.mjs`,
                exampleManifest: `${baseUrl}/api/results/agent/experiment.yaml`,
                installScript: `${baseUrl}/api/results/agent/install.sh`
            },
            sha256: {
                prismMjs: prismMjsSha256
            },
            quickStart: {
                agentPrompt: `Read ${baseUrl}/api/results/agent/SKILL.md and submit my benchmarks in ./results to Prism.`,
                zeroCloneCli: `curl -fsSL ${baseUrl}/api/results/agent/prism.mjs -o /tmp/prism.mjs && PRISM_API_URL=${baseUrl} node /tmp/prism.mjs --help`,
                installSkill: `curl -fsSL ${baseUrl}/api/results/agent/install.sh | bash`
            }
        });
    } catch (error: unknown) {
        const details = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ error: 'Failed to build agent tooling manifest.', details });
    }
}

/**
 * GET /api/results/agent/SKILL.md
 * GET /api/results/agent/skill.md
 * GET /SKILL.md
 * Serves the agent skill instructions with a dynamically injected zero-clone bootstrap header for this Prism host.
 */
export function getAgentSkillMdHandler(req: Request, res: Response) {
    try {
        if (!fs.existsSync(SKILL_MD_PATH)) {
            return res.status(404).json({ error: 'Agent SKILL.md not found on server.' });
        }
        const baseUrl = resolveBaseUrl(req);
        const rawSkillMd = fs.readFileSync(SKILL_MD_PATH, 'utf8');
        const enrichedSkillMd = injectZeroCloneBootstrapSection(rawSkillMd, baseUrl);

        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.status(200).send(enrichedSkillMd);
    } catch (error: unknown) {
        const details = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ error: 'Failed to serve SKILL.md.', details });
    }
}

/**
 * GET /api/results/agent/prism.mjs
 * Serves the standalone single-file ESM CLI bundle (Node >= 20, zero npm install required).
 */
export function getAgentCliBundleHandler(_req: Request, res: Response) {
    try {
        if (!fs.existsSync(CLI_BUNDLE_PATH)) {
            return res.status(404).json({ error: 'Bundled prism.mjs CLI not found on server.' });
        }
        const content = fs.readFileSync(CLI_BUNDLE_PATH, 'utf8');
        const sha256 = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="prism.mjs"');
        res.setHeader('X-Prism-CLI-SHA256', sha256);
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.status(200).send(content);
    } catch (error: unknown) {
        const details = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ error: 'Failed to serve prism.mjs bundle.', details });
    }
}

/**
 * GET /api/results/agent/experiment.yaml
 * Serves the reference multi-arm experiment.yaml template.
 */
export function getAgentExampleManifestHandler(_req: Request, res: Response) {
    try {
        if (!fs.existsSync(EXAMPLE_MANIFEST_PATH)) {
            return res.status(404).json({ error: 'Reference experiment.yaml not found on server.' });
        }
        const content = fs.readFileSync(EXAMPLE_MANIFEST_PATH, 'utf8');

        res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.status(200).send(content);
    } catch (error: unknown) {
        const details = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ error: 'Failed to serve reference experiment.yaml.', details });
    }
}

/**
 * GET /api/results/agent/install.sh
 * Serves a one-liner POSIX/bash installer script that downloads SKILL.md, scripts/prism.mjs,
 * and examples/experiment.yaml into ~/.gemini/skills/prism-results (or $PRISM_SKILL_DIR).
 */
export function getAgentInstallScriptHandler(req: Request, res: Response) {
    try {
        const baseUrl = resolveBaseUrl(req);
        const expectedSha256 = fs.existsSync(CLI_BUNDLE_PATH) ? computeFileSha256(CLI_BUNDLE_PATH) : '';

        const script = [
            '#!/usr/bin/env bash',
            '# Prism Results Store Agent Skill & Zero-Install CLI Installer',
            'set -euo pipefail',
            '',
            `BASE_URL="\${PRISM_API_URL:-${baseUrl}}"`,
            'SKILL_DIR="${PRISM_SKILL_DIR:-$HOME/.gemini/skills/prism-results}"',
            `EXPECTED_SHA256="${expectedSha256}"`,
            '',
            'mkdir -p "$SKILL_DIR/scripts" "$SKILL_DIR/examples"',
            '',
            'echo "Downloading Prism Results Store Agent Skill from $BASE_URL ..."',
            'curl -fsSL "$BASE_URL/api/results/agent/SKILL.md" -o "$SKILL_DIR/SKILL.md"',
            'curl -fsSL "$BASE_URL/api/results/agent/prism.mjs" -o "$SKILL_DIR/scripts/prism.mjs"',
            'curl -fsSL "$BASE_URL/api/results/agent/experiment.yaml" -o "$SKILL_DIR/examples/experiment.yaml"',
            '',
            'chmod +x "$SKILL_DIR/scripts/prism.mjs"',
            '',
            'if [ -n "$EXPECTED_SHA256" ]; then',
            '  if command -v sha256sum >/dev/null 2>&1; then',
            '    ACTUAL_SHA256="$(sha256sum "$SKILL_DIR/scripts/prism.mjs" | awk \'{print $1}\')"',
            '  elif command -v shasum >/dev/null 2>&1; then',
            '    ACTUAL_SHA256="$(shasum -a 256 "$SKILL_DIR/scripts/prism.mjs" | awk \'{print $1}\')"',
            '  else',
            '    ACTUAL_SHA256="$EXPECTED_SHA256"',
            '  fi',
            '  if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then',
            '    echo "ERROR: SHA-256 mismatch for prism.mjs (expected $EXPECTED_SHA256, got $ACTUAL_SHA256)" >&2',
            '    exit 1',
            '  fi',
            'fi',
            '',
            'cat <<EOF',
            '',
            'Installed prism-results skill & standalone CLI to: $SKILL_DIR',
            '  - Skill Instructions : $SKILL_DIR/SKILL.md',
            '  - Standalone CLI     : $SKILL_DIR/scripts/prism.mjs',
            '  - Example Manifest   : $SKILL_DIR/examples/experiment.yaml',
            '',
            'Usage (Direct CLI):',
            '  export PRISM_API_URL="$BASE_URL"',
            '  node "$SKILL_DIR/scripts/prism.mjs" init ./my_benchmarks --json',
            '',
            'Usage (AI Agent Prompt):',
            '  "Read $SKILL_DIR/SKILL.md and submit my benchmarks in ./my_benchmarks to Prism."',
            'EOF',
            ''
        ].join('\n');

        res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.status(200).send(script);
    } catch (error: unknown) {
        const details = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ error: 'Failed to generate install.sh script.', details });
    }
}

/**
 * GET /llms.txt
 * Serves a standard llms.txt discovery document advertising the Prism Agent Skill and zero-clone CLI endpoints.
 */
export function getLlmsTxtHandler(req: Request, res: Response) {
    try {
        const baseUrl = resolveBaseUrl(req);
        const content = [
            '# Prism — llm-d Benchmark Explorer & Results Store',
            '',
            '> Explore, validate, scrub PII, submit, and compare LLM inference benchmarks on Prism.',
            '',
            '## Agent Skill & Zero-Clone CLI',
            '',
            `- [Prism Results Store Agent Skill (SKILL.md)](${baseUrl}/SKILL.md): End-to-end 5-stage workflow (offline validation, PII scrubbing, mandatory human DCO sign-off, multi-arm campaigns, and comparison).`,
            `- [Agent Tooling Discovery Manifest](${baseUrl}/api/results/agent): JSON manifest with endpoints, SHA-256 checksums, and quick-start commands.`,
            `- [Standalone CLI Bundle (prism.mjs)](${baseUrl}/api/results/agent/prism.mjs): Zero-dependency Node.js (>= 20) ESM CLI bundle.`,
            `- [One-Line Skill Installer (install.sh)](${baseUrl}/api/results/agent/install.sh): \`curl -fsSL ${baseUrl}/api/results/agent/install.sh | bash\``,
            `- [Example Multi-Arm Manifest (experiment.yaml)](${baseUrl}/api/results/agent/experiment.yaml): Declarative multi-arm parameter sweep manifest template.`,
            ''
        ].join('\n');

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.status(200).send(content);
    } catch (error: unknown) {
        const details = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ error: 'Failed to serve llms.txt.', details });
    }
}
