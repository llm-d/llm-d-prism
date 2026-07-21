# Spec: Prefill/Decode Disaggregated Serving (PD Disagg) in Prism

## 1. Executive Summary & Overview

Traditionally, Large Language Model (LLM) inference is run in a co-located setup where a single hardware instance processes both heavy prefill computations and autoregressive decodes. This creates resource tension between Time to First Token (TTFT) and Inter-Token Latency (ITL). Prefill/Decode Disaggregated Serving (PD Disagg) resolves this by partitioning the serving pipeline into separate pools of hardware optimized specifically for Prefill (context processing) or Decode (generation).

This specification outlines the product requirements for integrating PD Disagg into Prism as a first-class, data-driven experience. Prism will provide:
1. **Benchmark Analysis & Ingestion**: The ability to ingest and parse benchmark reports (e.g., from `llm-d-benchmark` or `inference-perf`) to analyze performance, latency trade-offs, and Pareto frontiers.
2. **Guided Decision Path ("Well-Lit Path")**: A guided interface to help users assess if PD Disagg is suitable for their specific workloads, and recommend exact cluster configurations (number of prefill vs. decode nodes, and parallelism layouts like TP, DP, EP, PP).

---

## 2. Business Impact & Success Metrics

### 2.1. Business Impact Metrics
*   **Performance Frontier Amortization**: Maximizing throughput and interactivity while optimizing the Pareto frontier. Measured via amortized cost per 1M tokens versus interactivity (tokens/sec/user).
*   **Hardware Optimization & TCO**: Prevents overallocation of expensive accelerator instances (e.g., H100, GB200) by matching sharding strategies to phase needs, reducing idle resource waste.
*   **Strategy Adoption Rate**: Measured using telemetry in Prism to track how often operators shift from co-located serving to recommended disaggregated configurations.

### 2.2. Functional Success Metrics
*   Users can successfully import standard `llm-d` benchmark reports.
*   Users can identify the optimal P:D node ratio and parallelism setup for a given workload using the dashboard visualizations.

---

## 3. User Journeys & Stories (CUJs)

### CUJ 1: Assess Disaggregation Suitability
*   **User Role**: ML Infrastructure Engineer / Platform Engineer
*   **Goal**: Determine if a specific traffic pattern—defined by Input Sequence Length (ISL) and Output Sequence Length (OSL)—warrants shifting to disaggregated serving.
*   **Key Insight**: PD Disagg offers the most benefit in prefill-heavy workloads (ISL >> OSL) and for large models (>10B parameters). Co-located serving or context-chunked piggybacking should be suggested if disaggregation is not suitable.

### CUJ 2: Configuration & Phase Mappings
*   **User Role**: AI Platform Architect
*   **Goal**: Obtain clear, benchmark-backed recommendations for exact parallelism strategies (TP, DP, EP, PP) and node ratios across prefill and decode hardware pools.
*   **Key Pain Point**: Simulating thousands of design points to match prefill/decode rates is too computationally expensive for operators to calculate manually.

### CUJ 3: Visualize & Analyze Latency/Throughput Trade-offs
*   **User Role**: AI Architect / Capacity Planner
*   **Goal**: Visualize the Pareto frontier of all tested configurations to ensure they are not choosing a sub-optimal deployment strategy.
*   **Key Pain Point**: Visualizing the three-way trade-off between TTFT (often elevated in disaggregated setups), ITL (dramatically reduced by disaggregation), and system throughput.

### CUJ 4: Validate and Reproduce Recommendations
*   **User Role**: Stack Operator
*   **Goal**: Reproduce the disaggregated configurations in production clusters (e.g., using vLLM or TensorRT-LLM) with appropriate network/KV-cache bandwidth.
*   **Key Pain Point**: Lack of guidance on the KV cache transfer bandwidth required to prevent network bottlenecks between prefill and decode pools.

---

## 4. Technical & Functional Requirements

### 4.1. Data Ingestion & Parsing

#### 4.1.1. Schema Support
The platform must natively parse:
*   **`llm-d-benchmark` JSON Schema (`benchmark_report_v0.2_json_schema.json`)**:
    *   `ttft`: `metrics.latency.time_to_first_token` (mean, p95, p99)
    *   `itl`: `metrics.latency.inter_token_latency` (mean, p95, p99)
    *   `throughput`: `metrics.throughput.total_tokens_per_sec` (tokens/sec) or `metrics.throughput.requests_per_sec` (req/sec)
    *   `latency`: `metrics.latency.request_latency` (mean, p95, p99 - representing End-to-End Latency)
*   **Simulator & Performance Data**: Ingestion of simulated/measured performance results published to the GCS Results Store bucket (from GPUTG performance simulator and `inference-perf`).

#### 4.1.2. Metadata Extraction
*   **Directory/Folder Name Parsing**: Parse configuration details from file paths/folder structures:
    *   *Disaggregated*: `setup_modelservice_NA_NA_<P_Node>_<P_TP>_<D_Node>_<D_TP>` (e.g., `1_4_3_4` -> 1 Prefill Node @ TP4, 3 Decode Nodes @ TP4).
    *   *Aggregated/Standalone*: `setup_standalone_<Node>_<TP>_NA_NA_NA_NA` (e.g., `1_2` -> 1 Node @ TP2).
*   **P:D Ratio Calculation**:
    *   If Disaggregated: Compute ratio as `P_Node` : `D_Node` (e.g., "1:3") to use as a filterable dimension.
    *   If Aggregated: Default to "Aggregated".

### 4.2. Filtering & Selection
*   **Architecture Toggle**: A high-level filter to switch between "Aggregated" and "Disaggregated" benchmarks.
*   **P:D Ratio Filter**: A multi-select filter for specific ratios (e.g., "1:1", "1:2", "1:4") visible when disaggregation is selected.
*   **Scenario Grouping**: Group benchmarks by Scenario (same Model + Hardware + Workload, varying only the P:D ratio or sharding setups).

### 4.3. UI & Visualizations

#### 4.3.1. Trade-off Scatter Plot (The "Pareto" Chart)
*   **X-Axis**: Throughput (Tokens/Sec or Requests/Sec).
*   **Y-Axis**: Latency, toggleable between:
    *   Time To First Token (TTFT)
    *   Inter-Token Latency (ITL)
    *   End-to-End (E2E) Request Latency
*   **Grouping/Color**: Points colored by P:D Ratio or Architecture.
*   **Frontier Line**: Option to draw a Pareto-optimal frontier line.

#### 4.3.2. Node Ratio Sensitivity (Heatmap)
*   Illustrates system throughput and latency bounds across various Prefill-to-Decode node ratios (e.g., 1:4, 2:8, 4:8) for sensitivity analysis.

#### 4.3.3. Ratio Comparison Bar Chart
*   For a fixed workload (e.g., ISL=5000, OSL=250), display side-by-side bars comparing Throughput, TTFT, and ITL (e.g., Aggregated Baseline vs Disaggregated 1:1 vs 1:2).

#### 4.3.4. KV Cache Bandwidth Overlap Requirement
*   Line chart showcasing egress/ingress bandwidth vs. sequence lengths to demonstrate the physical network limits required to prevent transfer bottlenecks.

---

## 5. Recommendation Engine & Optimization Matrix

Prism will recommend a deployment strategy using a combination of input traffic metrics (P50 ISL/OSL) and available hardware capabilities. 

### 5.1. Target Models & Hardware Evaluated
*   **Hardware Layer**: Datacenter Blackwell systems (NVIDIA GB200 NVLink domains) using FP4 precision, and H100 domains.
*   **Models**: google/gemma4-31B and DeepSeek-R1 (MLA architecture).
*   **Selectable Optimizations**:
    1. Co-located serving with in-flight batching (IFB).
    2. Co-located serving with context-chunked piggybacking.
    3. Static Disaggregated Serving (Fixed Prefill/Decode ratios).
    4. Dynamic Disaggregated Serving (Elastic scaling and rate matching).

### 5.2. Summary Recommendation Matrix

| Workload Type | Optimal Strategy | Recommended Prefill Config | Recommended Decode Config | Rate Matching |
| :--- | :--- | :--- | :--- | :--- |
| **Prefill-Heavy**<br>(ISL=16k, OSL=2k) | Disaggregated | TP=2, PP=4, DP=1<br>(CPP used for context) | TP=8, EP=4, DP=2 | Dynamic Rate Matching |
| **Balanced**<br>(ISL=4k, OSL=4k) | Disaggregated | TP=4, PP=2, DP=2 | TP=8, EP=2, DP=2 | Static Ratio |
| **Decode-Heavy**<br>(ISL=1k, OSL=8k) | Co-located (Piggybacked) | N/A | N/A | N/A |

---

## 6. References

*   **llm-d PD Disaggregation Guide**: [guides/pd-disaggregation](https://github.com/llm-d/llm-d/tree/main/guides/pd-disaggregation)
*   **Beyond the Buzz: A Pragmatic Take on Inference Disaggregation**: [arxiv.org/html/2506.05508v1](https://arxiv.org/html/2506.05508v1)
*   **vLLM Disaggregated Prefilling**: [docs.vllm.ai/en/stable/features/disagg_prefill.html](https://docs.vllm.ai/en/stable/features/disagg_prefill.html)
*   **Mooncake KVCache-centric Architecture**: [Mooncake Paper](https://www.usenix.org/conference/fast25/presentation/qin)
