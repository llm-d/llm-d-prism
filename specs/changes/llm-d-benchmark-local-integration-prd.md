# Feature Request: llm-d-benchmark Native Integration

## Problem Statement

Prism is the analytics and visualization frontend for the llm-d stack, and `llm-d-benchmark` is its primary benchmarking harness. Closer integration between the two would meaningfully improve the development experience for anyone iterating on llm-d configurations.

Currently, visualizing benchmark results in Prism requires uploading them to Google Drive or a GCS bucket and waiting for the cloud pipeline to process them. This works well for sharing results across a team, but it adds friction for local development: the workflow depends on cloud credentials and a multi-step upload process before results appear in the dashboard.

Two additions to Prism would make local benchmark results immediately accessible:

**1. A parser for the Benchmark Report v0.2 format.**
`llm-d-benchmark` produces a standardized `benchmark_report_v0.2,_*.yaml` after every run, for all five supported harnesses (inference-perf, guidellm, vllm-benchmark, inferencemax, nop). Prism does not yet have a parser for this format. The existing `parseLlmDBenchmark` function in `dataParser.js` (line 403) was written against an older flat JSON schema that current runs no longer produce.

Without this parser, only inference-perf output can be partially read, and the other four harnesses are not yet supported:

| Harness | Output file | Current Prism support |
|---|---|---|
| inference-perf | `stage_N_lifecycle_metrics.json` | Partial — hardware/model metadata and stage linkage not available |
| guidellm | `results.json` | Not yet supported |
| vllm-benchmark | `openai*.json` | Not yet supported |
| inferencemax | `*.json` | Not yet supported |
| nop | `benchmark_report/result.yaml` | Not yet supported |

For inference-perf runs, the partial support means data points are tagged with "Unknown" model and "Unknown" hardware, since that metadata lives in `run_metadata.yaml` and the v0.2 report rather than in the native lifecycle JSON.

**2. A local data source.**
Prism's data connection model supports GCS, AWS S3, Google Drive, GIQ, and a dev-mode directory (`private/benchmarks/`). Adding a way to point Prism at a local `llm-d-benchmark` results directory would let developers see their runs without any cloud setup.

---

## Proposed Solution

This request covers two focused deliverables that together provide a minimal local integration path.

### Deliverable 1 — Benchmark Report v0.2 Parser

Add `parseBenchmarkReportV02(yaml, runLabel)` to `src/utils/dataParser.js`.

Since all five harnesses already produce a `benchmark_report_v0.2,_*.yaml` after `run_analysis`, a single parser for this format would provide coverage across all harnesses without requiring per-harness logic in Prism. The v0.2 schema (`schema_v0_2.py` in llm-d-benchmark) is versioned and stable, so Prism would only need to track one contract going forward.

`js-yaml` is already imported in `gcsScanner.js`, so no new dependency is needed.

**Field mappings — request performance:**

| v0.2 path | Prism `createEntry` field |
|---|---|
| `scenario.stack[0].standardized.model.name` | `metadata.model_name` |
| `scenario.stack[0].standardized.accelerator.model` | `metadata.accelerator_type` |
| `scenario.stack[0].standardized.accelerator.count` | `metadata.accelerator_count` |
| `scenario.stack[0].standardized.accelerator.parallelism.tp` | `metadata.tp` |
| `scenario.stack[0].standardized.role` (`prefill`/`decode`/`aggregate`) | `metadata.architecture` |
| `scenario.load.standardized.tool` | `metadata.harness` (new field) |
| `scenario.load.standardized.stage` | `workload.stage` (new field) |
| `scenario.load.standardized.input_seq_len.value` | `workload.input_tokens` |
| `scenario.load.standardized.output_seq_len.value` | `workload.output_tokens` |
| `scenario.load.standardized.rate_qps` | `workload.target_qps` |
| `scenario.load.standardized.concurrency` | `workload.concurrency` |
| `results.request_performance.aggregate.throughput.output_token_rate.mean` | `metrics.throughput` |
| `results.request_performance.aggregate.latency.request_latency.{mean,p50,p99}` | `metrics.latency.{mean,p50,p99}` |
| `results.request_performance.aggregate.latency.time_to_first_token.{mean,p50,p99}` | `metrics.ttft.{mean,p50,p99}` |
| `results.request_performance.aggregate.latency.time_per_output_token.mean` | `metrics.tpot` |
| `results.request_performance.aggregate.latency.normalized_time_per_output_token.mean` | `metrics.ntpot` |
| `results.request_performance.aggregate.latency.inter_token_latency.mean` | `metrics.itl` |
| `results.request_performance.aggregate.requests.failures` | `metrics.error_count` |
| `run.time.start` | `metadata.timestamp` |
| `run.uid` | `source_info.file_identifier` |
| `run.eid` | `source_info.experiment_id` (new field — useful for future grouping) |
| `run.description` or directory name | display label |

**Field mappings — observability** (attached to the entry for the existing tooltip and future chart axes):

| v0.2 path | Metric |
|---|---|
| `results.observability.components[].aggregate.kv_cache_usage.mean` | KV cache utilization % |
| `results.observability.vllm_prefix_cache_hit_rate.mean` | Prefix cache hit rate |
| `results.observability.epp_pool_avg_kv_cache_utilization.mean` | EPP pool KV utilization |
| `results.observability.epp_pool_avg_queue_size.mean` | EPP queue depth |
| `results.observability.pod_startup_times.aggregate.mean` | Mean pod cold-start (s) |

**Behavior:**
- Optional blocks (observability is not collected on every run) should be skipped gracefully rather than causing the parser to fail.
- Missing fields should be recorded in `_diagnostics` so `DataInspector` can show what was and wasn't parsed.
- `parseLlmDBenchmark` could be updated or replaced to point to this new function, with a note explaining the schema migration.

---

### Deliverable 2 — Extend the Existing inference-perf Upload Panel

The inference-perf connection card in `DataConnectionsPanel.jsx` already has a drag-and-drop file zone and a GCS bucket input that work in the browser today. Rather than adding a new connection card, the simpler approach is to extend this existing panel to also accept `benchmark_report_v0.2,_*.yaml` files alongside the LPG formats it already handles. The intended workflow:

```
run llm-d-benchmark  →  open Prism  →  drag benchmark_report_v0.2,_*.yaml onto the existing drop zone  →  see run in chart
```

This requires no new hooks, no new connection cards, and no server changes.

**Changes needed:**

`src/components/DataConnectionsPanel.jsx` — extend the inference-perf file drop zone:
- Add `.yaml` to the list of accepted file types (currently `.txt`, `.log`, `.json`).
- Update the helper text from "Supports .txt, .log, .json (LPG Format)" to "Supports .txt, .log, .json (LPG Format), .yaml (Benchmark Report v0.2)".
- In the file handler, detect v0.2 YAML files by filename pattern (`benchmark_report_v0.2`) or by parsing the YAML and checking for a `version: '0.2'` field, then route to `parseBenchmarkReportV02` rather than the existing LPG parsers.

`src/utils/dataParser.js` — `parseBenchmarkReportV02` (Deliverable 1) handles the actual parsing. No additional parser logic is needed here beyond the routing.

The GCS path input on the same card continues to work as-is for teams who push runs to a bucket via the Result Store.

---

## Alternatives Considered

**Add a new "Local Results" connection card with a directory picker.**
A new card using the File System Access API (`window.showDirectoryPicker()`) would let users select an entire results directory at once. This is a reasonable approach but requires a new hook, a new connection card, and more UI surface area. Extending the existing inference-perf panel achieves the same outcome with much less code, and individual report files are easy to drag and drop from a file manager.

**Server-side local file endpoints.**
Adding server endpoints (e.g. `GET /api/local-results/list?dir=<path>`) that read from the filesystem works in local dev mode but not with the publicly deployed Prism on Cloud Run. The browser-based approach works for both.

**Copy files manually to `private/benchmarks/`.**
This directory is already served by the dev server and `parseJsonEntry` can partially read inference-perf lifecycle JSON. However, hardware and model metadata would still be missing, only inference-perf output is readable this way, and it requires a manual copy step after each run.

**Push runs to a GCS bucket via the Result Store.**
`llmdbenchmark results push` already publishes runs to GCS/S3, and Prism can read those buckets. This is a good path for sharing results across a team, but it still requires cloud credentials and a push step after every run, so it doesn't fully address quick local iteration.

**Add per-harness native parsers (one each for guidellm, vllm-benchmark, inferencemax).**
Each harness has its own native output schema, so separate parsers would each need to track changes in the upstream harness independently. Since `llm-d-benchmark` already normalizes all harness outputs to v0.2, parsing that shared format once would likely be more maintainable over time.

**Extend `process-llm-d-data.mjs`.**
The existing tool streams `per_request_lifecycle_metrics.json` and computes wall-clock throughput from raw per-request timestamps. It does not read v0.2 reports, does not extract hardware metadata, and is specific to inference-perf. It could serve as a reference for a future offline script, but would not address the browser-based loading use case.

---

## Additional Context

**llm-d-benchmark run output layout:**

```
<run-name>/
  run_metadata.yaml                          # model, endpoint, namespace, harness timing
  config.yaml                                # fully-rendered harness config
  benchmark_report_v0.2,_stage_N_*.yaml      # standardized v0.2 report, one per stage
  stage_N_lifecycle_metrics.json             # inference-perf native output (per stage)
  per_request_lifecycle_metrics.json         # per-request raw data array
  metrics/
    raw/     <pod>_<ts>_metrics.log          # raw Prometheus scrape logs
    processed/
      metrics_summary.json                   # per-pod aggregated Prometheus stats
      pod_startup_times.json
      replica_status.json
    graphs/  *.png                           # pre-generated time-series plots
```

Multi-treatment experiment layout:

```
<experiment>/
  <treatment-1>/   ...
  <treatment-2>/   ...
  cross-treatment-comparison/
    treatment_comparison.csv
```

**Relevant source files:**
- v0.2 Pydantic schema: `llm-d-benchmark/docs/analysis/benchmark_report/schema_v0_2.py`
- v0.2 JSON Schema: `llm-d-benchmark/docs/analysis/benchmark_report/br_v0_2_json_schema.json`
- Harness-to-v0.2 converters: `llm-d-benchmark/llmdbenchmark/analysis/benchmark_report/native_to_br0_2.py`
- Existing parser to update: `llm-d-prism/src/utils/dataParser.js` line 403 (`parseLlmDBenchmark`)
- Existing inference-perf parser: `llm-d-prism/src/utils/dataParser.js` line 1039 (`parseLpgLifecycleMetrics`)
- Existing YAML parsing: `llm-d-prism/src/utils/gcsScanner.js`
- Existing offline tool: `llm-d-prism/tools/process-llm-d-data.mjs`

**Out of scope for this request:**
- Real-time streaming of in-progress benchmark runs.
- Interactive per-request CDF/histogram plots — llm-d-benchmark already generates these as PNGs locally.
- Result Store push/pull to GCS/S3 — already works via `llmdbenchmark results push`.
- A directory picker for loading an entire results folder at once — useful but not necessary given individual file drag-and-drop covers the core use case.
- Multi-stage QPS sweep connected curves, cross-treatment grouping, and observability chart axes — these would build on this foundation and could be tracked as follow-on work.
