# Spec: KV Cache Optimizations Analysis

## 1. Executive Summary

As LLM workloads grow more complex and sequence lengths increase, the memory footprint of the Key-Value (KV) cache becomes a primary bottleneck for both latency (TTFT) and throughput. This document outlines the requirements for supporting the analysis of KV Cache optimizations within Prism, focusing on multi-tier offloading, cache-aware routing, and block-level reuse strategies powered by the `llm-d-kv-cache` project.

## 2. Technical Context & Concepts

### 2.1. The KV Cache Challenge

Modern LLMs require significant memory to store KV tensors for every token in a prompt's context. When this memory exceeds a single GPU's capacity, performance degrades or requests are rejected.

### 2.2. Optimization Strategies

- **Multi-Tier Offloading**: Moving KV blocks across different memory tiers:
  - **GPU HBM (Tier 0)**: Fastest, most limited.
  - **CPU RAM (Tier 1)**: Slower, but significantly larger.
  - **Shared/Remote Storage (Tier 2)**: Persistent or cluster-wide (e.g., Lustre, LMCache, Mooncake).
- **Cache-Aware Routing**: Directing requests to specific vLLM pods that already have the required KV blocks in memory, minimizing recomputation.
- **Intra-Node vs. Inter-Node Sharing**:
  - _North/South_: GPU <-> CPU <-> Disk movement.
  - _East/West_: Sharing blocks between different nodes in a cluster.

## 3. User Stories

1.  **As a DevOps Engineer**, I want to compare the TTFT of a workload using local GPU cache vs. CPU offloading so I can determine the latency penalty of memory tiering.
2.  **As a ML Architect**, I want to visualize the "Cache Hit Score" for a specific set of prompts across my vLLM fleet to validate my cache-aware routing configuration.
3.  **As a Capacity Planner**, I want to see how much memory is saved by using a shared Lustre backend for KV blocks compared to duplicating them across pods.

## 4. Functional Requirements

### 4.1. Data Ingestion & Metrics

The platform must ingest and normalize the following metrics from `llm-d-kv-cache` events and vLLM monitoring:

| Metric                  | Source          | Description                                                 |
| :---------------------- | :-------------- | :---------------------------------------------------------- |
| `num_gpu_blocks`        | vLLM/KVEvents   | Count of blocks in GPU HBM.                                 |
| `num_cpu_blocks`        | vLLM/KVEvents   | Count of blocks offloaded to CPU RAM.                       |
| `kv_offloading_backend` | Config/Metadata | The active storage backend (e.g., `lustre`, `local_disk`).  |
| `cache_hit_score`       | KVCache Indexer | The percentage of blocks reused for a given prompt/request. |
| `ttft_recomputation`    | Benchmark       | TTFT when blocks must be recomputed.                        |
| `ttft_cached`           | Benchmark       | TTFT when blocks are fetched from cache (GPU/CPU/Disk).     |

### 4.2. Analysis & Visualization

KV Cache data is fundamentally different from standard benchmark runs — it is temporal, compositional, and focused on a **TTFT vs. Memory Cost** trade-off rather than throughput vs. latency. This requires both a new chart mode and a new distribution visualization.

#### 4.2.1. "Cache Analysis" Chart Mode (Extend `ThroughputCostChart.jsx`)

Rather than introducing a wholly separate chart component, a new **Cache Analysis mode** should be added alongside the existing Latency and Cost modes:

- **X-Axis**: Cache Hit Score (0–100%).
- **Y-Axis**: TTFT (ms).
- **Color**: Storage tier where the cache hit occurred — GPU HBM (blue), CPU RAM (green), Remote Disk (amber).
- **Pareto Line**: Highlight the optimal frontier (lowest TTFT for a given cache hit rate).
- **Implementation**: Add `cacheAnalysis` to the chart mode toggle in `ThroughputCostChart.jsx`, swapping axes and color schemes when active.

#### 4.2.2. Memory Distribution Bar Chart (New Component)

A **stacked horizontal bar** per configuration showing the split of blocks across memory tiers:

- **GPU HBM** (blue) / **CPU RAM** (green) / **Remote Disk** (amber).
- Sorted by Cache Hit Score (descending) to surface the most effective configurations.
- Displayed in the filter panel or alongside the data table, similar to how the P/D ratio filter works today.
- **Goal**: Instant visual comparison of offloading strategies across configurations.

#### 4.2.3. Optimization Discovery Table

- A table view that ranks configurations by **Caching Efficiency** (Throughput / Memory Cost).
- Columns: Backend, `num_gpu_blocks`, `num_cpu_blocks`, Cache Hit Score, TTFT, Efficiency Score.

## 5. Directory & Schema Support

- **Schema**: Support for `KVEvents` metadata and `vllm:cache_config_info` labels.
- **Parser**: New logic in `src/utils/dataParser.js` to handle tier-specific breakdown of metrics.

## 6. Open Questions

- **Granularity**: Should we visualize block-level locality in a "Heatmap" or stick to aggregate metrics per pod?
- **Cost Mapping**: How do we factor in the network cost of "East/West" (Inter-node) block transfers?

## 7. References

- **[LMCache Connector Manifests](https://github.com/llm-d/llm-d/tree/main/guides/tiered-prefix-cache/storage/manifests/vllm/lmcache-connector)**: vLLM configuration manifests for the LMCache storage connector, enabling shared remote KV cache backends.
- **[CPU Tiered Prefix Cache Benchmark Guide](https://github.com/llm-d/llm-d/tree/main/guides/tiered-prefix-cache/cpu#benchmark)**: Step-by-step guide for benchmarking CPU-tier KV cache offloading, including setup instructions and expected performance characteristics.
- **[llm-d-kv-cache Repository](https://github.com/llm-d/llm-d-kv-cache)**: Core library for distributed KV cache scheduling, offloading, and cache-aware routing.
- **[Project Northstar](https://docs.google.com/document/d/1EM1QtDUaw7pVRkbHQFTSCQhmWqAcRPJugJgqPbvzGTA/edit?tab=t.ikcvw3heciha)**: Multi-tiered KV-cache management vision and architecture roadmap.
