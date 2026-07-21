# Proposal: Prefill/Decode Disaggregation Well-Lit Path Dashboard

- **Status:** Approved at Gate A by @jjk-g (2026-07-16), as written; proposed defaults in §8 confirmed. Stage 2 implemented and verified; awaiting Gate B (implementation PR review).
- **Pipeline:** `specs/main/dashboard-pipeline.md`, Stage 1 output (per `skills/analyze_benchmark_results.md`)
- **Change dir:** `specs/changes/pd-disaggregation-dashboard/`

## 1. Context / Intent

Six P/D disaggregation benchmark runs (llm-d-benchmark report format v0.2.1)
have been published to `gs://llm-d-benchmarks/pd-disaggregation/`. The
"Prefill/decode disagg" nav item already exists in `LeftNavigation.jsx` but is
`disabled: true`, and PrismHome lists P/D Disagg only on the roadmap rail. This
proposal turns those results into the fourth well-lit path dashboard
(after Intelligent routing, Prefix cache offloading, Agentic serving),
following the style contract in `skills/style.md`. Prior context:
`specs/changes/disagg-benchmarks-proposal.md` (analysis PRD) and
`specs/changes/disagg-guide-proposal.md` (path overview) — neither was
rejected; this spec is the concrete dashboard for the data we actually have.

## 2. Benchmark scenario (constants across all six runs)

| Facet | Value |
|---|---|
| Model | Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8 |
| Accelerator | TPU v7x (Ironwood), 8 chips per replica, TP=8 |
| Total replicas | 8 (fixed; split between prefill and decode pools) |
| Engine | vLLM, P/D disaggregation via TPUConnector KV transfer (`kv_producer` / `kv_consumer`), fp8 KV cache, prefix caching disabled, `--max-model-len 65536` |
| Workload | Agentic multi-turn: 800 requests @ concurrency 40; shared system prompt 3,000 tok; dynamic system prompt mean 160,000 tok; ~540 turns/conversation; ~1,500 input / ~425 output tok per turn (means) |
| Report format | llm-d-benchmark v0.2.1, validated against `br_v0_2_1_json_schema.json` |

**Sweep dimension (exactly one):** the prefill:decode replica ratio at fixed
total of 8 replicas — 2:6, 3:5, 4:4, 5:3, 6:2, 7:1. Verified by field-level
diff of all six reports: only `replicas` (per pool), run identity fields, and
results vary. The ratio is the x-axis everywhere; no extra selectors needed
for run dimensions.

## 3. What the data supports (honest audit)

Available per run (`results.request_performance.aggregate`):

| Metric | Stats present | Units (declared inline) | Direction |
|---|---|---|---|
| `time_to_first_token` (TTFT) | mean, p90 | ms | lower = better |
| `request_latency` (E2E) | mean, p90 | ms | lower = better |
| `inter_token_latency` (ITL) | **mean only** | ms/token | lower = better |
| `output_token_rate` | mean | tokens/s | higher = better |
| `input_token_rate` | mean | tokens/s | higher = better |
| `total_token_rate` | mean | tokens/s | higher = better |
| `requests.total` | 800 (configured count) | — | — |

Missing / caveats (from `pd-benchmarks/README.md` and report metadata — these
constrain the design and must be surfaced in the Benchmark scenario panel):

- No p50/p99 for any metric; no TPOT, NTPOT, or QPS. Selectors omit these.
- ITL is mean-only → per the style contract, its stat selector renders as
  static text ("Mean — only stat reported").
- Reports were hand-converted from a summary spreadsheet
  (`pd-benchmarks/gen_reports.py`).
- Decode-side `vllm serve` command was not in the source data; decode args
  mirror prefill with `kv_role` assumed `kv_consumer` (flagged in each decode
  component's `metadata.description`).
- vLLM version, load-tool name/version, token source: `unknown`.
- `requests.total: 800` is the configured count; success/failure breakdown
  not yet extracted.
- Latency magnitudes are large (mean TTFT 31 s – 837 s): axis/tooltips/table
  display in **seconds** for TTFT and E2E (converted from ms at render time,
  unit stated); ITL stays in ms/token.

Headline result: decode-heavy wins. 2:6 is best on every metric except p90
TTFT, where 3:5 is marginally better (104.7 s vs 112.6 s). Every step toward
prefill-heavy is monotonically worse — total throughput spans 7.0× (33,810 →
4,837 tok/s) and mean TTFT 27× (31.2 s → 837 s). Because 2:6 dominates
(no Pareto frontier in this sweep), **no trade-off/scatter chart is
proposed** — it would not earn its place; the two axis charts plus table tell
the story.

## 4. Dashboard design (per `skills/style.md`)

New component `src/components/PdDisaggregationDashboard.jsx`, view id
`pd-disaggregation`. Full well-lit path anatomy; **hue identity: violet**
(per style.md's hue registry: cyan/blue = routing, sky/emerald = prefix
cache, purple = agentic, violet = P/D disagg).

### Page structure (canonical order)

1. **WellLitHeader** — title "Prefill/Decode Disaggregation", Guided path
   badge, Share button (plain `ShareLinkButton`; no encoded state beyond
   defaults — see Open questions).
2. **Canonical page root + animated background** — the verbatim shell from
   style.md §3 (dotted grid, glow blobs).
3. **Hero panel** (`SectionLabel`, hover accent `hover:border-violet-500/30`),
   3-column grid:
   - *Overview* (tone cyan): what P/D disaggregation is; why the split pool
     ratio matters for agentic long-context workloads.
   - *Active configuration*: model, TPU v7x ×8 chips/replica, TP=8, 8 total
     replicas, TPUConnector KV transfer, fp8 KV cache.
   - *Caveats / roadmap* (tone slate): hand-converted reports, mirrored
     decode args, mean+p90 only; future: aggregated baseline comparison.
4. **Benchmark scenario** (tone sky): agentic workload shape (800 req,
   conc 40, ~540 turns, 160k-token dynamic system prompt, 1,500/425 tok per
   turn) + data caveats.
5. **Primary outcomes** (tone emerald) — KPI row, 4 `StatCard`s:
   - **Best configuration — 2:6** ("Wins 5 of 6 reported metrics"; detail:
     2 prefill / 6 decode replicas).
   - **Peak total throughput — 33,810 tok/s** @ 2:6 (detail: 7.0× spread
     across the sweep, worst 4,837 @ 7:1).
   - **Best mean TTFT — 31.2 s** @ 2:6 (detail: p90 winner is 3:5 at
     104.7 s).
   - **Best mean ITL — 78 ms/tok** @ 2:6 (detail: 244.5 @ 7:1; interactivity
     degrades 3.1×).
6. **Charts** — two `ChartContainer`s, one axis each, x-axis = P:D ratio in
   sweep order (2:6 … 7:1), single series (one value per ratio) colored
   `seriesColor(0)`, no legend needed (single series), tooltips on
   `ChartTooltip`/`ChartTooltipRow`, grid via `gridProps()`:
   - **Throughput vs. P:D ratio** (bar chart; higher = better). Metric
     `ToggleGroup`, canonical order/labels with unsupported options omitted:
     `Output | Input | Total` (no QPS — not reported). Stat: static text
     "Mean — only stat reported".
   - **Latency vs. P:D ratio** (bar chart; lower = better). Metric
     `ToggleGroup`, canonical order with omissions: `TTFT | ITL | E2E`
     (no NTPOT/TPOT — not reported). Stat `ToggleGroup` `Mean | P90` for
     TTFT and E2E; when ITL selected, stat selector is replaced by static
     text "Mean — only stat reported". Y-axis in seconds for TTFT/E2E,
     ms/token for ITL. Two control groups → collapsible `Filters` toggle in
     `ChartContainer` actions (prefix-cache `showChartFilters` pattern).
7. **Results table** — full per-run matrix in a `ChartContainer`, canonical
   table styling; units in subtitle ("TTFT/E2E in seconds, ITL in ms/token,
   throughput in tokens/s"). Columns: P:D ratio, prefill/decode replicas,
   TTFT mean, TTFT p90, E2E mean, E2E p90, ITL mean, Output tok/s, Input
   tok/s, Total tok/s, Requests. Best value per metric column highlighted
   (`text-emerald-300`); winning row (2:6) `bg-emerald-900/20` with a
   success `Badge`.

### Registration set

- `src/App.jsx`: import + `{currentView === 'pd-disaggregation' && …}` with
  `onNavigateBack`/`onToggleMobileNav`.
- `src/components/LeftNavigation.jsx`: flip the existing
  `pd-disaggregation` item's `disabled: true` → enabled; add an
  `ITEM_THEMES['pd-disaggregation']` entry in violet.
- `src/components/PrismHome.jsx`: add the card to the "Well-lit paths" rail
  in nav order (after Prefix cache offloading): title, 2 violet tag pills
  (e.g. "KV transfer", "TPU v7x"), 1–2 sentence description, metrics preview
  box (`bg-slate-950/60`; e.g. "Best ratio 2:6" / "Peak 33.8k tok/s" + small
  violet-tinted ratio bar viz), gradient Launch CTA. The existing roadmap-rail
  "Prefill/Decode Disagg" entry is superseded/removed per how prior paths
  graduated (implementation follows whatever the existing pattern is).

## 5. Data flow

**Source of truth (production):** GCS —
`gs://llm-d-benchmarks/pd-disaggregation/pd-ratio-<P>-<D>/reports-<timestamp>/benchmark_report_v02.yaml`
(currently six ratios × one `reports-20260720-100535` dir each; verified by
listing the bucket). The local `pd-benchmarks/` copies are analysis aids
only — **the endpoint must read from GCS**.

**Server endpoint:** `GET /api/pd-disaggregation/data` in `server/server.js`,
same server-side GCS pattern as the existing `/api/prefix-cache/data`
(lines ~208–367):

1. Auth: `GOOGLE_APPLICATION_DEFAULT_CREDENTIALS` `authorized_user` file via
   `UserRefreshClient`, falling back to `auth.getClient()` (ADC).
2. Paginated JSON-API listing of `b/llm-d-benchmarks/o?prefix=pd-disaggregation/`.
3. Filter to objects ending `.yaml`; group by the `pd-ratio-<P>-<D>` path
   segment; within each ratio, keep only the **lexicographically latest
   `reports-<timestamp>` directory** (timestamps are sortable
   `YYYYMMDD-HHMMSS`), so re-published runs supersede older ones.
4. Fetch each report (`?alt=media`, bearer token, `Promise.all`), parse with
   `js-yaml` (already imported), extract fields; per-file failures are logged
   and skipped (matching the prefix-cache endpoint's resilience).
5. Respond with the array sorted by prefill count ascending. Errors → 500
   `{ error }`.

**Normalized run object** (what the frontend receives; latencies in ms as
reported — frontend converts TTFT/E2E to seconds for display):

```json
{
  "ratio": "2:6",
  "prefill": 2,
  "decode": 6,
  "ttft":  { "mean": 31164, "p90": 112646 },
  "e2e":   { "mean": 76012, "p90": 178718 },
  "itl":   { "mean": 78 },
  "throughput": { "output": 295, "input": 33515, "total": 33810 },
  "requests": 800,
  "model": "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8",
  "accelerator": "TPU-v7x-Ironwood",
  "tp": 8,
  "totalReplicas": 8,
  "uid": "agentic-pd-2-6-262144",
  "reportPath": "pd-disaggregation/pd-ratio-2-6/reports-20260720-100535/benchmark_report_v02.yaml"
}
```

`prefill`/`decode` come from the report's `scenario.stack[]` components
(`role: prefill|decode` → `standardized.replicas`), not from parsing the
object path; the path segment is only used for grouping/latest-dir selection.
Frontend fetches once on mount; `LoadingState` while `null`, `EmptyState` on
error/empty.

## 6. Implementation checklist (from `skills/style.md`)

1. Spec approved at Gate A (this document).
2. Data in: `/api/pd-disaggregation/data` endpoint (§5).
3. Scaffold `src/components/PdDisaggregationDashboard.jsx` from the style.md
   recipe skeleton (ui primitives only).
4. Register the view in `src/App.jsx`.
5. Enable nav in `LeftNavigation.jsx` + violet `ITEM_THEMES` entry.
6. Apply full well-lit path anatomy (§4) incl. PrismHome card.
7. Self-check: style.md ratchet checklist, `npm run lint` (zero new errors),
   `npm run build`, drive via `npm run dev` (verify all six runs returned
   from GCS).

## 7. Success criteria

- Dashboard reachable from nav + PrismHome; renders all six ratios fetched
  live from GCS via the new endpoint (no bundled/local data).
- Charts/table/KPIs match §4 exactly; canonical selector sets with
  unsupported options omitted; every metric direction stated in UI copy.
- Data caveats from §3 visible in the scenario panel.
- Ratchet greps clean on touched files; lint/build green.

## 8. Open questions (for Gate A reviewers — answers are not assumed)

1. **Share-link state:** should metric/stat selector state be encoded in the
   share URL (`getShareUrl`) like some dashboards, or is a plain
   `ShareLinkButton` acceptable for v1? Proposal default: plain button.
2. **Chart mark:** bars proposed for both charts (6 discrete ratios). Line
   marks would imply continuity between ratios; flagging in case reviewers
   prefer the line style used elsewhere.
3. **PrismHome roadmap rail:** confirm the roadmap "Prefill/Decode Disagg"
   entry should be replaced by the well-lit path card (matching how earlier
   paths graduated).
4. **Latency display unit:** seconds for TTFT/E2E (values up to 937 s)
   proposed; confirm reviewers don't want raw ms for consistency with other
   dashboards.

Per the pipeline: these proposed defaults are **not** self-approving; no
application code is written until Gate A approval arrives.
