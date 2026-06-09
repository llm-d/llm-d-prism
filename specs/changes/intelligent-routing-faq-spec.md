# Spec: Well-Lit Path Guides FAQ (Intelligent Routing)

**Status**: Draft
**Author**: Sean Horgan, Jetski
**Date**: Jun 1, 2026

## 1. Overview & Goal

Prism's Well-Lit Path guides provide high-fidelity, benchmark-backed recommendations for specific configurations (e.g., running Qwen3-32B on 8x H100 for Interactive Chat). However, customers often need to deploy different models, use different hardware, or serve different workloads.

The goal of this feature is to embed a user-visible FAQ directly into the Well-Lit Path guide pages (starting with [Intelligent Routing](https://prism.llm-d.ai/?view=intelligent-routing)) to help customers bridge the gap between our published benchmarks and their actual production use cases.

This is **not** a generic FAQ about Prism. It is a targeted, technical guide designed to help Stack Operators and AI Architects extrapolate our benchmark results to their specific constraints.

---

## 2. UI/UX Integration Plan

- **Location**: Embedded at the bottom of the `Intelligent Routing` guide page (within `Milestone1Dashboard.jsx`).
- **Component**: A clean, accessible Accordion component (using Tailwind CSS for styling consistent with the rest of the Prism dashboard).
- **Structure**: Grouped by topic:
  - Model Architectures & Sizes
  - Hardware Infrastructure
  - Workloads & Traffic Patterns

---

## 3. Intelligent Routing FAQ Content

Below is the drafted content for the Intelligent Routing FAQ.

### Category 1: Model Architectures & Sizes

#### Q: The benchmarks show Qwen 3 32B. How do the benefits of cache-aware routing scale to smaller models like Gemma 4 (9B/26B) or Qwen 3.5 (27B)?
**A**:
- **TTFT Overhead**: Smaller models have significantly lower baseline prefill times. Because the absolute time saved by hitting a cache is smaller, the relative benefit of routing to a warm cache is reduced for low-concurrency workloads.
- **Throughput Gains**: Under high QPS, cache-aware routing remains highly beneficial even for smaller models. By preventing redundant prefill computations, it frees up GPU compute cycles, increasing overall system throughput and preventing queue buildup.
- **Recommendation**: If your average Input Sequence Length (ISL) is $< 2k$ tokens, standard round-robin routing may suffice for small models. If ISL $> 4k$ or you experience bursty traffic, cache-aware routing is still recommended.

#### Q: How does Intelligent Routing handle massive models or Mixture of Experts (MoE) like Qwen 3 Coder (480B-A35B-Instruct)?
**A**:
- **Memory Footprint**: Large models and MoEs require high Tensor Parallelism (TP) and Pipeline Parallelism (PP), often spanning multiple nodes.
- **Routing Complexity**: For a 480B MoE, the routing decision must align with the model replica boundaries (e.g., routing to the master node of a specific TP/PP group).
- **Latency Sensitivity**: Prefill cost (TTFT) for a 480B model is extremely high. A cache miss on a large prefix is highly penalized. Therefore, precise cache-aware routing (e.g., tracking exact prefix matches) is critical to avoid multi-second TTFT spikes.
- **Recommendation**: For models $> 100B$ parameters, default load balancing is highly inefficient. We recommend using **Precise Cache Aware Routing** or **Predicted Latency Balancing** to ensure requests with shared prompts are strictly routed to the same replica group.

#### Q: How do long-context models like Kimi K2.5 or GLM 5.1 impact routing decisions?
**A**:
- **Cache Volatility**: Long-context models can ingest $100k+$ tokens. The KV cache for a single request can easily consume gigabytes of VRAM, leading to rapid cache eviction on the serving nodes.
- **Routing Strategy**: Heuristic routing that only checks prefix matches might fail if the cache has already been evicted due to memory pressure. Here, the router must combine prefix awareness with **real-time KV cache capacity tracking** from the pods to avoid routing to a node that has the prefix but must evict it to process the new request.

---

### Category 2: Hardware Infrastructure

#### Q: We don't use H100s. How does cache-aware routing perform on lower-tier hardware like RTX-PRO-6000 or L4 GPUs?
**A**:
- **Compute Constraints**: Slower GPUs take longer to process prefills. This means the penalty for a cache miss (recomputation) is much higher in absolute latency. Cache-aware routing actually provides a *larger* relative latency improvement on lower-tier hardware.
- **VRAM Constraints**: RTX-PRO-6000 (48GB) and L4 (24GB) have much smaller VRAM capacity than H100 (80GB). The KV cache pool is smaller, leading to frequent evictions.
- **Recommendation**: On constrained hardware, you must pair cache-aware routing with aggressive **KV Cache Offloading** (to CPU or Local SSD) to keep prefixes warm longer. The router should be configured to prioritize nodes where the prefix is at least in CPU RAM, as fetching from CPU is still faster than full recomputation on a slower GPU.

#### Q: What is the expected behavior on next-gen hardware like NVIDIA GB200 NVLink domains or Google TPU v6e / TPU7x?
**A**:
- **GB200 NVLink**: The ultra-high bandwidth interconnect reduces the penalty of inter-node communication. If using a disaggregated cache architecture (e.g., Mooncake), KV cache can be pulled from a neighbor node's HBM over NVLink almost as fast as local HBM. In this environment, the router can be more flexible, routing for load balancing first and pulling cache remotely.
- **TPUs (v6e/7x)**: TPU serving stacks (e.g., using `tpu-inference` or JetStream) rely heavily on ahead-of-time (AOT) compilation via XLA. Routing must ensure that requests are routed to replicas compiled for the matching sequence length buckets to avoid compilation overhead. Cache routing on TPUs must be tightly integrated with the TPU slice manager.

---

### Category 3: Workloads & Traffic Patterns

#### Q: How do the routing benefits differ between Code Generation and Interactive Chat workloads?
**A**:
- **Code Generation**:
  - **Pattern**: Typically involves a large, static shared prefix (e.g., repository context, library definitions) and small user queries.
  - **Routing Fit**: **Perfect fit for Heuristic Cache Routing**. The prefix is identical across many users/requests, and it changes infrequently. You can achieve $> 90\%$ cache hit rates easily.
- **Interactive Chat**:
  - **Pattern**: Multi-turn conversations where the prefix (history) grows with each turn. The prefix is unique to each user session.
  - **Routing Fit**: Harder for static heuristic routers. You need **Session-Based Routing** or **Predicted Latency Balancing** that routes subsequent turns of the same conversation to the same replica to leverage the cache generated by previous turns.

#### Q: How do I configure GKE Inference Gateway for Heuristic Cache Routing in an Agentic Code Gen scenario?
**A**:
GKE Inference Gateway uses the **Gateway API Inference Extension** (specifically the Endpoint Picker pod, or EPP) to perform heuristic routing. You don't need to deploy ML models; you configure the scoring weights directly on the EPP deployment.

For Agentic Code Gen, you want to heavily favor prefix cache hits while still guarding against node overload. Configure the EPP container with the following flags (or corresponding environment variables):

1. **Prioritize Cache Matches**:
   - Set `--prefix-cache-scorer-weight=2.0` (or higher, baseline is `1.0`). This tells the router to strongly prefer nodes that already have the repository context cached.
   - Configure `--max-prefix-blocks-to-match` to capture the typical size of your shared codebase context (divided by the block size).

2. **Define Cache Block Size**:
   - Set `--prefix-cache-block-size=16` (matching the default vLLM PagedAttention block size).

3. **Guard Against Hot-Spotting**:
   - Keep `--queue-scorer-weight=1.0`. If a node with the warm cache starts queuing too many requests, this weight allows the router to dynamically fall back to another node, trading a cache-miss prefill for immediate execution.
   - Set `--kv-cache-utilization-scorer-weight=0.5`. This ensures we don't route to a node that has the prefix but is so full that it would immediately evict the cache to process the new request.

Example EPP Deployment container spec fragment:
```yaml
      containers:
      - name: endpoint-picker
        image: us-central1-docker.pkg.dev/k8s-staging-images/gateway-api-inference-extension/epp:v1.3.0
        args:
        - --prefix-cache-scorer-weight=2.0
        - --queue-scorer-weight=1.0
        - --kv-cache-utilization-scorer-weight=0.5
        - --prefix-cache-block-size=16
        - --max-prefix-blocks-to-match=512 # Adjust based on repo size
```

#### Q: What about Deep Research workloads?
**A**:
- **Pattern**: Extremely long inputs (many source documents), low QPS, and long generation times.
- **Routing Challenge**: A single request can occupy a replica for minutes. Routing a new request to a node that is currently generating will cause massive queuing (high ITL for the existing user, high TTFT for the new user).
- **Recommendation**: For Deep Research, prefix caching is useful but **load balancing and capacity scheduling are primary**. The router should prioritize routing to the least-loaded replica, even if it results in a cache miss, to avoid head-of-line blocking. This is a key use case where **Predicted Latency Scheduling** outperforms simple prefix heuristics.

---

## 4. Next Steps & Tasks

1.  **Review Spec**: Share this spec with the team for feedback on the Q&A content.
2.  **UI Component Implementation**: Create a reusable `FAQAccordion` component in `src/components/common/`.
3.  **Integration**: Embed the component into `src/components/Milestone1Dashboard.jsx` under the main dashboard view.
4.  **Data Verification**: Ensure the advice aligns with latest benchmark results from `inference-perf`.

---

## 5. Open Questions & Issues

### 5.1. Source of Truth for FAQ Content
- **Problem**: We need to decide where the FAQ content should reside. Hardcoding the FAQ text directly into React components (like `Milestone1Dashboard.jsx`) "buries" the content in code artifacts. This makes it difficult for AI agents (who read the codebase to assist users) to find, read, and reason about the FAQs. It also makes content updates require code releases.
- **Proposed Solutions**:
  - **Option A (Static Markdown/JSON)**: Store the FAQs in structured Markdown files (e.g., `specs/changes/intelligent-routing-faq.md` or a dedicated `docs/faq/` folder) or JSON files. The React application can ingest these files at build time (using a markdown loader) or fetch them at runtime.
    - *Pros*: Content is easily readable by AI agents in the repo. Clean separation of content and presentation.
    - *Cons*: Requires setting up a parser/loader in the build pipeline.
  - **Option B (Database/CMS)**: Serve the FAQ content from an external API or CMS.
    - *Pros*: Dynamic updates without code redeployment.
    - *Cons*: Overkill for the current state of Prism; adds runtime dependency.
  - **Option C (Hardcoded in Config)**: Store as a structured JS object in a configuration file (e.g., `src/config/faqs.js`).
    - *Pros*: Simple to implement, relatively easy for agents to parse compared to inline JSX.
    - *Cons*: Still mixed with code artifacts.

- **Recommendation**: **Option A (Static Markdown/JSON)**. We should maintain the FAQs as Markdown files in the repository. This keeps them highly visible to AI agents and developers, and we can write a simple utility in React to render them.
