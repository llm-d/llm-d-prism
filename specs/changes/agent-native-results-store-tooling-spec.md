# Agent-Native Results Store Tooling & Multi-Arm Campaign Ingestion Spec

## 1. Product Specification / Proposal

### Context & Problem Statement
Benchmark contributors and autonomous benchmarking harnesses (`uBench`, `tpu-agent-suite`, `inference-perf`) run multi-arm parameter sweeps (e.g., 18-arm Prefill/Decode Disaggregation or Prefix Cache Offloading sweeps) on headless remote Kubernetes/GKE clusters. Today, contributing these runs to the Prism Results Store requires manual browser interaction through a 4-step web upload wizard (`SubmitValidationPage.jsx`), resulting in several critical friction points:
1. **One-by-One Submission & Missing Logical Campaign Grouping ([#185](https://github.com/llm-d/llm-d-prism/issues/185))**: Multi-arm sweeps must be uploaded and promoted individually, each receiving an isolated UUID without a first-class `experiment_id` grouping or baseline linkage.
2. **Multi-Hop Publish Friction ([#186](https://github.com/llm-d/llm-d-prism/issues/186))**: Publishing verified benchmarks requires staging, submitting to `unlisted` or `submitted_pending_review`, and then manually approving each run one by one.
3. **Sensitive Data & PII Exposure Risk**: Raw benchmark reports, Kubernetes manifests (`deployment.yaml`), `config.yaml`, and harness logs frequently contain sensitive tokens (`HF_TOKEN`, `GITHUB_TOKEN`, cloud credentials), internal corporate hostnames/IPs, email addresses, or local `$HOME` user paths (`/Users/<user>`, `/home/<user>`).
4. **Unverified Autonomous Submissions**: Autonomous agents need a deterministic human-in-the-loop sign-off gate (including Developer Certificate of Origin `DCO 1.1` attribution and PII scrub review) before transmitting benchmark payloads externally.
5. **Actionable Failure Reporting**: When contributors or agents encounter validation, CLI, or API failures, they need a pre-scrubbed diagnostic summary and a direct path to report a GitHub issue on `llm-d/llm-d-prism`.

### Proposed Solution
Deliver a **Repo-Native Full-Lifecycle CLI (`cli/prism.ts`)** paired with a **Zero-Install Standalone Agent Skill (`skills/prism-results/SKILL.md` + bundled `skills/prism-results/scripts/prism.mjs`)** and backend Results Store extensions:
1. **Full Lifecycle CLI (`prism-results`)**: Supports `init`, `scrub`, `validate`, `submit`, `list`, `get`, `compare`, `promote`, `review`, and `fork` with `--json` output and deterministic exit codes (`0` = success, `1` = runtime/auth/API error, `2` = preflight validation/sign-off required, `3` = partial batch failure).
2. **Declarative Multi-Arm Campaigns (`experiment.yaml`) & Auto-Discovery (`#185`)**: Packages $N$ arms in a single preflight pass, assigns a shared `experiment_id` and `experiment_label`, links arms to a designated `baseline_run_id`, and returns a unified Prism comparison URL (`?share=<base64>&experimentId=<id>`).
3. **Single-Pass Direct Publish (`#186`)**: Allows authorized `admin` users to pass `targetState=public` or `targetState=promoted` directly on `POST /api/results`, recording the initial `review.history` audit entry atomically in a single GCS write.
4. **Automatic PII & Sensitive Data Scrubber (`src/utils/piiScrubber.js`)**: Recursively scans and redacts secrets/tokens (`HF_TOKEN`, `ghp_*`, `AIza*`, `AKIA*`, bearer tokens, secret-named YAML/env keys), internal corporate hostnames/private IPs, non-attribution emails, and user home directory paths (`/Users/<name>`, `/home/<name>`) before packaging or uploading any bundle, producing an auditable `piiReport`.
5. **Mandatory User Contribution Sign-Off Gate**: Requires explicit human sign-off (`--dco-signoff "Name <email>"` + `--yes-user-approved` in non-interactive/agent mode) after reviewing the preflight summary and PII scrub report.
6. **GitHub Issue Failure Recommendation**: On any unhandled, API, or validation failure, the CLI outputs a scrubbed `issueReport` block with a pre-populated `https://github.com/llm-d/llm-d-prism/issues/new` URL, and `skills/prism-results/SKILL.md` instructs the agent to recommend that the user post a GitHub issue.

### Success Criteria
- [ ] An 18-arm benchmark directory can be initialized (`prism init`), scrubbed of PII (`prism scrub`), validated offline (`prism validate`), and submitted as a single logical experiment (`prism submit`) with 100% validation parity with the web UI.
- [ ] Zero unredacted secrets, internal hostnames/IPs, or personal home paths (`/Users/<user>`, `/home/<user>`) survive `scrubBundlePii()` across BR v0.2 stage reports, K8s manifests, `config.yaml`, and logs.
- [ ] `prism submit` refuses to transmit data over the network unless both DCO sign-off (`--dco-signoff`) and explicit user approval (`--yes-user-approved` or interactive TTY confirmation) are provided.
- [ ] Admin users can publish directly to `public` or `promoted` in one `POST /api/results?targetState=public` request with an automatic `review.history` entry; non-admin users receive `403 Forbidden`.
- [ ] Every CLI error response includes a scrubbed `issueReport` with a `https://github.com/llm-d/llm-d-prism/issues/new` URL, and `skills/prism-results/SKILL.md` directs the agent to recommend filing a GitHub issue on error.

---

## 2. UI/UX & CLI Experience Specification

### 2.1 CLI Human & Agent Experience (`--json` + Interactive Mode)
- **Preflight Summary & User Sign-Off Table**:
  Before `prism submit` uploads any data, it prints (and in `--json` mode when `--yes-user-approved` is omitted, returns with `exitCode: 2` and `error: "USER_SIGNOFF_REQUIRED"`):
  - **Experiment**: `experiment_label` (`experiment_id`)
  - **Target Visibility**: `unlisted` | `submitted_pending_review` | `public` | `promoted`
  - **Arms Ready**: $N$ arms ($M$ total stages), baseline arm indicator, resolved `model_name`, `hardware`, `inference_tool`
  - **PII Scrubbing Summary**: `totalRedactions` across categories (`secret`, `home_path`, `email`, `internal_host`, `private_ip`)
  - **Attribution & DCO**: `Signed-off-by: Name <email>`
- **Error & GitHub Issue Recommendation UX**:
  When an error occurs, the CLI outputs a clear remediation hint plus:
  ```text
  Recommend filing a GitHub issue if this error persists:
  https://github.com/llm-d/llm-d-prism/issues/new?title=...&body=...
  ```

### 2.2 Web UI Campaign Grouping & Style Contract (`skills/style.md`)
- Any web UI surfaces rendering `experiment_id` / `experiment_label` (such as campaign badges in `UnifiedDataTable.jsx`) must strictly use primitives from `src/components/ui/` (`Badge` with `tone="violet"` or `tone="info"`, `Button`, theme tokens `bg-theme-card`, `text-theme-text`, `text-theme-muted`, `border-theme-border`) with zero raw hex literals.

---

## 3. Engineering Design Specification

### 3.1 Backend Schema & GCS Contexts (`server/results/api.ts`, `server/results/gcs.ts`)
1. **`PrismResultPayloadSchema` Extensions**:
   - `experiment_id`: `z.string().min(1).max(128).nullable().optional()`
   - `experiment_label`: `z.string().min(1).max(256).nullable().optional()`
   - `baseline_run_id`: `z.string().uuid().nullable().optional()`
   - `dco_signoff`: `DcoSignoffSchema.nullable().optional()` (`{ signed_off_by: string, signed_at: string, source?: 'cli-flag' | 'experiment-manifest' | 'web-wizard' }`)
   - `agent_provenance`: `AgentProvenanceSchema.nullable().optional()` (`{ agent_name?: string, tool_version?: string, harness?: string, harness_version?: string, commit_sha?: string, job_url?: string }`)
   - `pii_scrub_summary`: `PiiScrubSummarySchema.nullable().optional()` (`{ scrubbed: boolean, scrubbed_at: string, total_redactions: number, categories: Record<string, number> }`)
2. **`PrismResultContextSchema` & `writeResult` / `listResults` (`server/results/gcs.ts`, `server/results/routes/list.ts`)**:
   - Store `experiment_id`, `experiment_label` (base64url-encoded via `encodeContextValue`), and `baseline_run_id` in GCS custom `contexts`.
   - Support `?experimentId=<id>` query parameter in `GET /api/results` (`server/results/routes/list.ts`) and `listResults()` (`server/results/gcs.ts`).
   - Include `experiment_id`, `experiment_label`, `baseline_run_id`, `dco_signoff`, and `agent_provenance` in `ResultsListItem` and `sanitizeSubmissionPayload()`.
3. **Single-Pass Direct Publish (`server/results/routes/submit.ts`, `server/results/service.ts`)**:
   - Accept `targetState` values `'unlisted' | 'submitted_pending_review' | 'public' | 'promoted'`.
   - Enforce `permission === 'admin'` (or `isPlaygroundMode()`) when `targetState` is `'public'` or `'promoted'`; otherwise return HTTP `403 Forbidden`.
   - Automatically append `{ status: targetState, changedAt: nowIso, by: username }` to `uploadData.review.history` when direct-publishing to `'public'` or `'promoted'`.

### 3.2 PII & Sensitive Data Scrubber (`src/utils/piiScrubber.js`)
- Pure isomorphic ESM module exported for both Node CLI and browser wizard use:
  - `scrubTextPii(text, options)`: Redacts secret tokens (`hf_...`, `ghp_...`, `github_pat_...`, `glpat-...`, `AIza...`, `ya29....`, `AKIA...`, `Bearer ...`, PEM blocks), user home paths (`/Users/<user>`, `/home/<user>`, `/google/src/cloud/<user>`), internal hostnames (`*.corp.google.com`, `*.c.googlers.com`, `*.internal`, `*.svc.cluster.local`), RFC1918 private IPv4s (`10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`), and email addresses.
  - `scrubObjectPii(obj, options)`: Recursively traverses objects/arrays, redacting values of sensitive keys (`/(token|secret|password|passwd|api_key|apikey|access_key|private_key|credentials|authorization|cookie)/i`), decoding and scrubbing inline `data:...;base64,...` manifest strings, while preserving explicit allowlisted attribution paths (`dco_signoff.signed_off_by`, `github_author`, `requested_reviewers`).
  - `scrubBundlePii(bundle, options)`: Returns `{ bundle: scrubbedClone, piiReport: { scrubbed: true, scrubbedAt, totalRedactions, categories, findings } }`.

### 3.3 Isomorphic Bundle Assembler & 3-Tier Metadata Resolution (`src/utils/manifestMetadataExtractor.js`, `src/utils/bundleAssembler.js`)
- Extracts K8s manifest / `config.yaml` / `run_metadata.yaml` metadata inference into `src/utils/manifestMetadataExtractor.js`.
- `src/utils/bundleAssembler.js` discovers single-run or multi-arm directories (or parses `experiment.yaml`), applies 3-tier resolution (Tier 1: CLI/`experiment.yaml` overrides $\succ$ Tier 2: sibling `run_metadata.yaml`/`config.yaml`/K8s manifests $\succ$ Tier 3: BR v0.2 stage report fields), runs `scrubBundlePii()`, validates every arm via `validatePrismUploadStructure({ isUpload: true })`, and generates structured exit-code-2 JSON remediation recipes (`remediation.cliFlags`, `remediation.experimentYamlPatch`) plus `issueReport` links on failure.

### 3.4 Standalone CLI (`cli/prism.ts`) & Zero-Install Skill Bundle (`skills/prism-results/`)
- `cli/prism.ts` implements `init`, `scrub`, `validate`, `submit`, `list`, `get`, `compare`, `promote`, `review`, and `fork`.
- Bundled via `npm run build:cli` (`esbuild`) into `skills/prism-results/scripts/prism.mjs` targeting Node $\ge 20$.
- `skills/prism-results/SKILL.md` defines the mandatory agent protocol:
  1. Run `init` / `scrub` / `validate` locally.
  2. Present the human-scannable preflight & PII scrub summary and obtain explicit user sign-off (`--dco-signoff "Name <email>"` + `--yes-user-approved`).
  3. Execute `submit` and `compare`.
  4. Whenever an unhandled or persistent error occurs, provide the scrubbed diagnostic summary and recommend that the user open a GitHub issue at `https://github.com/llm-d/llm-d-prism/issues/new`.
