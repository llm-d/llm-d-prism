---
name: prism-results
description: Package, scrub PII/secrets, preflight-validate, submit/publish, compare, promote, review, and fork LLM inference benchmark runs and multi-arm campaigns in the Prism Results Store using the zero-install prism-results CLI.
---

# Prism Results Store Agent Skill (`prism-results`)

Use this skill whenever an agent or contributor needs to package Benchmark Report v0.2 (`brv02`) or `inference-perf` runs, scrub sensitive environment data/PII, validate metadata offline, submit single runs or multi-arm parameter sweeps (`experiment.yaml`) to the Prism Results Store, or compare runs against a baseline.

## 1. Zero-Install CLI Invocation & Exit Code Contract

Run the standalone bundled CLI directly with Node.js ($\ge 20$, zero `npm install` required on remote benchmark clusters):

```bash
node skills/prism-results/scripts/prism.mjs <command> [flags]
```

Or from a local development checkout of `llm-d-prism`:

```bash
npm run prism -- <command> [flags]
```

### Deterministic Exit Codes
Always pass `--json` when invoking `prism` programmatically:
- **`0` (`SUCCESS`)**: Command succeeded.
- **`1` (`RUNTIME_OR_AUTH_ERROR`)**: Missing/expired GitHub token, `403 Forbidden`, or network/API error.
- **`2` (`PREFLIGHT_OR_SIGNOFF_FAILED`)**: Local preflight validation failed, `--strict` PII check found redactions, or mandatory human DCO/contribution sign-off (`--dco-signoff` + `--yes-user-approved`) was not provided. **Zero network writes occurred.**
- **`3` (`PARTIAL_BATCH_FAILURE`)**: Preflight validation passed, but $k < N$ arms in a multi-arm campaign failed during network upload. Inspect `succeededRunIds` and `failedArms`.

---

## 2. Mandatory 5-Stage Agent Workflow

Follow these 5 stages in order whenever packaging or submitting benchmark results:

### Stage 1: Initialize & Scrub PII (`init` / `scrub`)
Scan the benchmark output directory to auto-discover single-run stage files or multi-arm subdirectories, infer hardware/model/serving-stack metadata from sibling Kubernetes manifests (`deployment.yaml`, `values.yaml`, `config.yaml`, `run_metadata.yaml`), and run automatic PII/secret redaction:

```bash
node skills/prism-results/scripts/prism.mjs init ./benchmark_sweep \
  --experiment-label "Llama-3.1-70B PD Disaggregation Sweep" \
  --baseline arm_01_baseline \
  --json
```

Or run standalone PII scrubbing (with `--in-place` to overwrite local files before archiving, or `--strict` to fail with exit code `2` if any secrets/PII were detected):

```bash
node skills/prism-results/scripts/prism.mjs scrub ./benchmark_sweep --json
```

**Always inspect `piiReport`** in the JSON output to verify that:
- `secret`: `HF_TOKEN`, `GITHUB_TOKEN`, `ghp_*`, `AIza*`, `AKIA*`, `sk-*`, `Bearer` tokens, PEM private keys, and secret-named YAML/env keys are redacted to `[REDACTED_SECRET]`.
- `home_path`: Personal paths (`/Users/<user>/...`, `/home/<user>/...`, `/google/src/cloud/<user>/...`) are normalized to `$HOME/` or `$WORKSPACE/`.
- `internal_host` & `private_ip`: Internal corporate FQDNs (`*.corp.google.com`, `*.c.googlers.com`, `*.internal`, `*.svc.cluster.local`) and RFC1918 private IPs (`10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`) are redacted.
- `email`: Non-attribution email addresses are redacted to `[REDACTED_EMAIL]`.

### Stage 2: Preflight Validate & Self-Repair (`validate --json`)
Validate all discovered arms offline using the exact server-side schema and stage-consistency validator (`validatePrismUploadStructure({ isUpload: true })`):

```bash
node skills/prism-results/scripts/prism.mjs validate -f ./benchmark_sweep/experiment.yaml --json
```

- If `exitCode === 2` (`error: "PREFLIGHT_VALIDATION_FAILED"`), inspect each arm's `fieldErrors` and `remediation`:
  - Apply `remediation.experimentYamlPatch` to `experiment.yaml` or pass the suggested `remediation.cliFlags` (e.g., `--model "meta-llama/Llama-3.1-70B-Instruct" --hardware "H100" --chips 8`).
  - If a high-QPS saturation stage recorded 100% failed requests, pass `--drop-failed-stages` to exclude 100%-failed stages cleanly.
  - Re-run `validate --json` until `ok: true` (`exitCode === 0`).

### Stage 3: Mandatory Human Sign-Off Gate (CRITICAL RULE — DO NOT SKIP)
> **CRITICAL AGENT RULE**: You MUST NEVER run `prism submit` or `prism promote` with `--yes-user-approved` without first presenting a concise preflight summary to the human user and receiving their explicit approval in the conversation.

Before calling `submit`, present the user with:
1. **Campaign / Run Summary**: Experiment label, total arms, and valid stages per arm.
2. **Resolved Metadata**: `model_name`, `hardware` (`hardware_name` & `accelerator_count`), `inference_tool`, and designated baseline arm.
3. **Target Visibility State**: `unlisted`, `submitted_pending_review`, `public`, or `promoted`.
4. **PII Scrub Report**: `total_redactions` count and breakdown by category (`secret`, `home_path`, `internal_host`, `private_ip`, `email`).
5. **DCO 1.1 Sign-Off Identity**: `Signed-off-by: Name <email@domain>`.

Wait for the human user's explicit confirmation. If `prism submit` is invoked without `--yes-user-approved` in `--json` / non-TTY mode, it will deterministically abort with `exitCode: 2` (`error: "USER_SIGNOFF_REQUIRED"`) and return `preflightSummary` + `piiReport` with zero network calls.

### Stage 4: Submit / Direct-Publish & Compare (`submit` / `compare`)
Once the user explicitly approves, execute `submit`:

```bash
node skills/prism-results/scripts/prism.mjs submit \
  -f ./benchmark_sweep/experiment.yaml \
  --target-state public \
  --dco-signoff "Jane Doe <jane@example.com>" \
  --yes-user-approved \
  --json
```

- **Authentication Token Cascade**: Automatically resolves `PRISM_GITHUB_TOKEN` $\rightarrow$ `GITHUB_TOKEN` $\rightarrow$ `gh auth token`.
- **Two-Pass Baseline Linking**: Uploads the arm marked `is_baseline: true` first, captures its server-assigned `runId`, and sets `baseline_run_id` on all remaining arms in the campaign.
- **Direct-Publish Fallback**: When `--target-state public` (or `--publish`) or `promoted` is requested by an admin user, requests single-pass publishing on `POST /api/results?targetState=public` and automatically chains `POST /api/results/:runId/review` if connected to an older backend.

Next, generate a Markdown comparison table and unified share link across the campaign:

```bash
node skills/prism-results/scripts/prism.mjs compare \
  --experiment-id <experimentId> \
  --baseline <baselineRunId> \
  --slo-ttft-ms 200 \
  --slo-tpot-ms 50 \
  --markdown \
  --json
```

Present the Markdown comparison table and the `shareUrl` (`https://prism.llm-d.ai/?share=...&experimentId=...`) to the user.

### Stage 5: Failure Handling & GitHub Issue Recommendation
Whenever any `prism` command returns a non-zero exit code (`exitCode !== 0`) due to an unhandled exception, API failure, or persistent validation error that cannot be auto-remediated:
1. Inspect the returned `issueReport` object (`issueReport.newIssueUrl` and `issueReport.scrubbedDiagnostics`).
2. Present the scrubbed diagnostic block to the user (all secrets, paths, IPs, and emails are automatically redacted).
3. **Explicitly recommend that the user post a GitHub issue** on `llm-d/llm-d-prism` using the pre-populated URL:
   `https://github.com/llm-d/llm-d-prism/issues/new?...`

---

## 3. Command Quick Reference

| Command | Example | Description |
| :--- | :--- | :--- |
| `init <dir>` | `prism init ./runs -o ./runs/experiment.yaml --json` | Discover arms, infer metadata, scrub PII, and write `experiment.yaml`. |
| `scrub <dirOrFile>` | `prism scrub ./runs --in-place --strict --json` | Redact secrets/PII across reports, manifests, and configs. |
| `validate [dir]` | `prism validate -f experiment.yaml --drop-failed-stages --json` | Offline 3-tier resolution, PII scrub check, and schema validation. |
| `submit [dir]` | `prism submit -f experiment.yaml --publish --dco-signoff "Name <e@d.com>" --yes-user-approved --json` | Validate, enforce user sign-off gate, upload arms, and emit share link. |
| `list` | `prism list --experiment-id <id> --status public --json` | List runs from `GET /api/results` with server/client filters. |
| `get <runId>` | `prism get <runId> --export-dir ./exported --json` | Fetch full `.v1.json` run bundle (and optionally export stage files). |
| `compare [runIds...]` | `prism compare <id1> <id2> --baseline <id1> --markdown --json` | Compute Throughput, TTFT, TPOT deltas, SLO checks, and Markdown table. |
| `promote [runId]` | `prism promote <runId> --yes-user-approved --json` | Promote owner's run (or `--experiment-id` batch) to `submitted_pending_review`. |
| `review [runId]` | `prism review <runId> --status public --feedback "LGTM" --json` | Admin review decision (`public`, `promoted`, `changes_requested`, `rejected`). |
| `fork <runId>` | `prism fork <runId> --label "Forked Run" -o forked.json --json` | Clone an existing run with `forked_from` lineage metadata. |
