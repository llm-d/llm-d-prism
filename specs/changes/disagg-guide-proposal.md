# Prefill/Decode Disaggregated Serving (PD Disagg) well-lit path in Prism
Public/externally accessible
Contributors: Sean Horgan, Nishtha Jain, Rajitha Leonhard, Danna Wang, <add your name>
May 1, 2026

# Overview
Large Language Model (LLM) inference is traditionally run co-located, where a single hardware instance processes both heavy prefill computations and autoregressive decodes. This creates resource tension between Time to First Token (TTFT/FTL) and Inter-Token Latency (ITL/TTL). Prefill/Decode Disaggregated Serving (PD Disagg) resolves this by partitioning the serving pipeline into separate pools of hardware optimized specifically for Prefill (context processing) or Decode (generation). By integrating this into Prism as a well-lit path, users get a data-driven, benchmark-backed experience for:
1. Deciding if PD Disagg is the right strategy for their specific workloads.
2. Recommending exact cluster configurations (number of prefill vs. decode nodes, and parallelism setups such as TP, DP, EP, PP).

# Business Impact Metrics
- Performance Frontier Amortization: Maximizing throughput and interactivity while optimizing the Pareto frontier. We measure this via amortized cost per 1M tokens versus interactivity (tokens/sec/user).
- Hardware Optimization & TCO: Prevents overallocation of expensive A3/H100 instances by matching the hardware sharding strategies to specific phase needs. This lowers idle resource wastage and reduces TCO.
- Strategy Adoption Rate: Measured using telemetry in Prism to track how often stack operators shift from co-located serving to recommended disaggregated configurations.

# Jobs To Be Done (CUJs)
## CUJ 1: Assess Disaggregation Suitability
User Role: ML Infrastructure Engineer
Goal: Understand whether their specific traffic pattern—characterized by Input Sequence Length (ISL) and Output Sequence Length (OSL)—warrants a shift to disaggregated serving.
Note: PD Disagg delivers the highest benefits in prefill-heavy workloads (ISL >> OSL) and for large models (>10B parameters). Conversely, we must highlight cases where co-located serving or piggybacking is a better fit.

## CUJ 2: Configure Optimal Phase Mappings
User Role: AI Platform Architect
Goal: Obtain clear, benchmark-backed recommendations for exact parallelism strategies (TP, DP, EP, PP) across separate prefill and decode hardware pools.
Pain Points: Hand-tuning integer solvers and simulating hundreds of thousands of design points to match prefill/decode rates is computationally prohibitive for operators.

## CUJ 3: Validate and Reproduce Recommendations
User Role: Stack Operator
Goal: Reproduce the disaggregated configurations in their own production clusters (e.g., using vLLM or TensorRT-LLM).
Pain Points: Lack of guidance on the KV cache transfer bandwidth required to prevent one-time network bottlenecks between pools.

# Detailed Specifications
## General Flow
- Data Source & Pipeline: High-fidelity results will be sourced from the proprietary GPU performance simulator and standard benchmark data gathered via `inference-perf` and published to the GCS Results Store bucket.
- Prism UI/UX: The dashboard will present suitability recommendations based on a user inputting their P50 ISL and OSL traffic profile. It will visually overlay their scenario against known Pareto frontiers (Disaggregated vs. Co-located serving).
- Recommendation Engine: Based on the traffic, Prism recommends a fixed or dynamically adjustable rate matching ratio of Prefill Nodes to Decode Nodes alongside model partition setups.

## Benchmarks
Prism Guide Details: PD Disaggregation Strategy
We’ll ship this guide experience as the "Prefill/Decode Disaggregation" well-lit path in Prism.

## Selectable Parallelism and Optimizations
- Baseline: Co-located serving with in-flight batching (IFB).
- Optimization 1: Co-located serving with context-chunked piggybacking.
- Optimization 2: Static Disaggregated Serving (Fixed Prefill/Decode ratios).
- Optimization 3: Dynamic Disaggregated Serving (Elastic scaling and rate matching).

## Benchmark Scenario
- Hardware Layer: Datacenter Blackwell systems (NVIDIA GB200 NVLink domains) using FP4 precision.
- Target Model: google/gemma4-31B and DeepSeek-R1 (MLA architecture).
- Evaluated Workloads: ISL: 16k, OSL: 2k (Prefill-heavy); ISL: 1k, OSL: 8k (Generation-heavy).

## Primary Outcomes
- First Token Latency (FTL): Evaluates Prefill pool throughput. Optimized via Chunked Pipeline Parallelism (CPP).
- Time to First Token (TTFT): Reduced by avoiding Decode interference.
- Token-to-Token Latency (TTL) / Interactivity: Kept under stringent SLAs for the generation pool by utilizing higher Tensor Parallelism.
- System Throughput: Measured in total generated tokens/sec across the multi-node deployment.

## Key Charts
- Throughput vs. Interactivity Pareto Frontier: Scatter plot highlighting pareto points for both disaggregated and co-located setups across varying TTL SLAs.
- Node Ratio Sensitivity (Heatmap): Illustrates total system throughput across various Prefill-to-Decode node ratios (e.g., 1:4, 2:8, 4:8).
- KV Cache Bandwidth Overlap Requirement: Line chart showcasing egress/ingress bandwidth vs sequence lengths, demonstrating provisioned datacenter bandwidth bounds.

## Summary Recommendation Matrix
| Workload Type | Optimal Strategy | Recommended Prefill Config | Recommended Decode Config | Rate Matching |
| --- | --- | --- | --- | --- |
| Prefill-Heavy (ISL=16k, OSL=2k) | Disaggregated | TP=2, PP=4, DP=1 (CPP used for context) | TP=8, EP=4, DP=2 | Dynamic Rate Matching |
| Balanced (ISL=4k, OSL=4k) | Disaggregated | TP=4, PP=2, DP=2 | TP=8, EP=2, DP=2 | Static Ratio |
| Decode-Heavy (ISL=1k, OSL=8k) | Co-located (Piggybacked) | N/A | N/A | N/A |

# References
- llm-d PD Disaggregation Guide: [guides/pd-disaggregation](https://github.com/llm-d/llm-d/tree/main/guides/pd-disaggregation)
- Beyond the Buzz: A Pragmatic Take on Inference Disaggregation: [arxiv.org/html/2506.05508v1](https://arxiv.org/html/2506.05508v1)
- vLLM Disaggregated Prefilling: [docs.vllm.ai/en/stable/features/disagg_prefill.html](https://docs.vllm.ai/en/stable/features/disagg_prefill.html)
- Mooncake KVCache-centric Architecture: [Mooncake Paper](https://www.usenix.org/conference/fast25/presentation/qin)

# Original Specification Request Prompt
> Generate a new specification that follows the example set in @[specs/changes/prefix-cache-offload-guide-proposal.md] but is focused on delivering an experience for Prefill/Decode Disaggregated Serving (PD Disagg) in prism: https://prism.llm-d.ai.
> 
> The end goal is to provide users with clear guidance backed by benchmarks for 1) deciding if PD disagg is the right strategy for their workloads, and 2) deciding the specific configuration for their workloads, e.g. number of prefill nodes, decode nodes, and parallelism strategy, e.g. TP=2, TP=8, DP=2, EP=4, PP=2.
> 
> Here are some additional context that must be factored in-depth and cited in the specification:
> https://github.com/llm-d/llm-d/tree/main/guides/pd-disaggregation
> https://arxiv.org/html/2506.05508v1