---
name: analyze-benchmark-results
description: Analyze a directory of llm-d-benchmark report files (BRv0.2.x YAML), extract the benchmark scenario and key performance metrics, and produce a short dashboard design spec for review. Use when new benchmark results arrive and a Prism dashboard (new or updated) should present them.
---

# Benchmark Results → Dashboard Design Spec

Turns a set of benchmark report files into a reviewable design spec for a Prism
dashboard. This is stage one of the dashboard pipeline: **no application code is
written by this skill** — its output is a spec that a human approves, after
which implementation follows `skills/style.md`'s "new dashboard" recipe.

## Input

A directory of benchmark reports in the
[llm-d-benchmark report format](https://github.com/llm-d/llm-d-benchmark) v0.2+
(YAML or JSON), optionally with a README. Each report has three sections:
`run` (identity, keywords), `scenario` (`load` = workload, `stack` = deployed
components), and `results` (`request_performance.aggregate`).

## Procedure

1. **Read every report** (and the README if present). Confirm `version` is
   0.2.x; note the units declared inline (`units:` fields) — never assume ms
   vs s.
2. **Extract per run:**
   - Identity: `run.uid`, `run.keywords`, `run.description`.
   - Workload: `scenario.load.standardized` (concurrency, input/output seq
     len, multi-turn) plus anything notable in `native.config`.
   - Stack: for each `scenario.stack[]` component — `role`, `replicas`,
     `accelerator` (model, count, parallelism), `model.name`, `tool`, and any
     caveats in `metadata.description` (e.g. assumed/mirrored configs).
   - Metrics: `results.request_performance.aggregate` — latency
     (`time_to_first_token`, `request_latency`, `inter_token_latency`, each
     with whatever stats exist: mean/p50/p90/p99), throughput
     (`output_token_rate`, `total_token_rate`, `input_token_rate`), and
     `requests` counts.
3. **Split constants from the sweep.** Compare runs: fields identical across
   all runs are the *scenario* (they become the dashboard's config/hero
   panel); fields that vary are the *sweep dimension(s)* (they become the
   x-axis / selector). Name the sweep explicitly (e.g. "P:D replica ratio at
   fixed total replicas"). If more than one dimension varies, say so — that
   usually means a selector per extra dimension.
4. **Judge the data honestly.** Record which stats are missing (e.g. only
   mean+p90, no p50/p99), any hand-conversion or assumption caveats from the
   README/metadata, and sample sizes. The spec must not promise charts the
   data can't support.
5. **Design the dashboard** (constraints from `skills/style.md` apply):
   - **KPI row**: 3-4 StatCards answering "which config wins and by how much"
     — e.g. best config by throughput, best latency, sweep size/scale facts.
   - **Charts**: one ChartContainer per question, each with ONE axis. Typical
     split: a throughput chart, a latency chart (stat selector via
     ToggleGroup when mean/p90 both exist), and — only if it earns its place —
     a trade-off or efficiency view. Metric selectors use the canonical sets
     from skills/style.md (latency: NTPOT/TPOT/TTFT/ITL/E2E; throughput:
     Output/Input/Total/QPS; stats: Mean/P50/P90/P99), omitting metrics the
     data lacks but keeping the canonical order and labels. ≤5 series per chart, colors from
     `CHART_SERIES` assigned per entity, legend for ≥2 series, tooltips on the
     `ChartTooltip` shell. State each metric's direction (lower/higher =
     better).
   - **Results table**: every dashboard ships the full per-run matrix (all
     runs × all available metrics, units stated, best value(s) highlighted).
     Charts summarize; the table is the record — and the accessible fallback.
   - **Config/hero panel**: the scenario constants (model, hardware, workload
     shape) and stack caveats.
   - **Controls**: ToggleGroups for metric/stat switches; no filter that only
     has one possible value (render those as static text).
6. **Specify the data flow**: where the report files live, the server
   endpoint that parses them (pattern: `/api/<name>/data` in
   `server/server.js`, like `/api/prefix-cache/data`; `js-yaml` is available),
   and the normalized run-object shape the frontend receives.
7. **Write the spec** to `specs/changes/<name>/proposal.md` (OPSX — see
   `specs/README.md`). Keep it short: scenario summary, metrics table, the
   design per §5, data flow per §6, open questions. Include the implementation
   checklist from `skills/style.md` (scaffold → register view → enable nav).
8. **Stop for review.** Do not implement until the spec is approved by one of
   **@seanhorgan**, **@diamondburned**, or **@jjk-g** (Gate A in
   `specs/main/dashboard-pipeline.md`). Absence of approval is a "no";
   defaults proposed in the spec are not self-approving. The implementation
   that follows has its own gate: approval by one of **@jjk-g**,
   **@diamondburned**, or **@seanhorgan**.
