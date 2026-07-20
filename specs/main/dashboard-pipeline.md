# Dashboard Pipeline: Benchmark Results → Well-Lit Path Dashboard

The repeatable process for turning benchmark results into a Prism dashboard.
It is built on two artifacts: `skills/analyze_benchmark_results.md` (analysis →
design spec) and `skills/style.md` (the UI contract that governs
implementation). Both humans and agents follow the same pipeline; the approval
gates below are always human.

## The pipeline

```
benchmark reports (llm-d-benchmark format v0.2+)
        │
        ▼
Stage 1 — Analyze & design        skills/analyze_benchmark_results.md
        │   extracts scenario vs. sweep, audits available stats,
        │   designs charts/KPIs/table, writes
        │   specs/changes/<name>/proposal.md
        ▼
Gate A — Spec approval            one of @seanhorgan, @diamondburned, @jjk-g
        │
        ▼
Stage 2 — Implement               skills/style.md
        │   shared ui/ primitives only; full well-lit path anatomy
        │   (WellLitHeader, page shell, hero/scenario/outcomes/charts/
        │   results table, nav + ITEM_THEMES + PrismHome card);
        │   verify: lint (zero new errors), build, style ratchet,
        │   drive via dev server
        ▼
Gate B — Implementation approval  one of @jjk-g, @diamondburned, @seanhorgan
        │
        ▼
merge; move the change dir to specs/archive/ per specs/README.md
```

### Stage 1 — Analysis and design spec

Input: a directory of benchmark reports in the
[llm-d-benchmark report format](https://github.com/llm-d/llm-d-benchmark)
v0.2+ (YAML/JSON), optionally with a README. Run
`skills/analyze_benchmark_results.md`. Its output is a short design spec at
`specs/changes/<name>/proposal.md`: scenario constants vs. sweep dimension,
the metrics the data actually supports (no promised charts the data can't
back), chart/KPI/results-table design under the style contract, and the data
flow (report location + `/api/<name>/data` endpoint shape).

**The pipeline stops here.** No application code is written until Gate A.

### Gate A — Spec approval

The design spec must be approved by **one of @seanhorgan, @diamondburned, or
@jjk-g** (PR review on the change directory, per the OPSX protocol in
`specs/README.md`). Agents must treat this as a hard stop: absence of an
approval is a "no", and proposed defaults in the spec are not self-approving.

### Stage 2 — Implementation

Implement exactly what the approved spec says, following `skills/style.md`:
primitives from `src/components/ui/` only, the full well-lit path anatomy,
canonical metric selectors, and the registration set (App view, nav item +
theme, PrismHome card). Verification bar before requesting review:
`npm run lint` with zero NEW errors on touched files, `npm run build` green,
the style.md ratchet checklist clean, and the dashboard driven through the
dev server. Gaps discovered in style.md or the ui library are reported (and
folded back into the contract), never worked around by hand-rolling.

### Gate B — Implementation approval

The implementation PR must be approved by **one of @jjk-g, @diamondburned, or
@seanhorgan**.

## Contract governance

The pipeline improves by folding review findings back into its artifacts.
Changes to those artifacts have their own approvers:

| Artifact | Approval required |
|---|---|
| `skills/style.md` (and the `src/components/ui/` contract it governs) | one of **@seanhorgan**, **@raji14** |
| `specs/main/roadmap.md` | one of **@seanhorgan**, **@jjk-g** |
| Design specs (`specs/changes/*/proposal.md`) | Gate A approvers above |
| Dashboard implementations | Gate B approvers above |

These gates are mechanically enforced via `.github/CODEOWNERS`. Enforcement
is only active when the repository's `main` branch protection enables
**"Require review from Code Owners"** — a repo admin must switch that on.
