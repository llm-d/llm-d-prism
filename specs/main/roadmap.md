# Prism Roadmap & Spec Prioritization

This document tracks upcoming features, their product specifications, and their current phase in the Feature Development Lifecycle, organized by target delivery timeline.

## Feature Phases
- **Product**: Specifying product requirements.
- **UI/UX**: Designing mocks and implementation specs. Pushed to `next` branch.
- **Engineering**: Backend and data schema design.
- **Implementation**: Active development on main codebase.
- **Completed**: Merged to `main` and deployed.

---

## 🗺️ Timeline Roadmap

### 🟡 Q4 2026 (Active Work - Near-Term Priorities)
Focus is on reducing friction for feature developers publishing benchmarks to the Results Store and enabling AgentX benchmark publishing and visualization in Prism.

1.  **llm-d Results Store UI Redesign**
    *   **Goal**: Reduce feature developer friction when publishing results.
    *   **Status**: Designed & implemented, needs merging
    *   **Next Steps**: Review and merge the redesigned Results Store submission, curve-building, and exploration UX to `main`.

2.  **AgentX Results in Results Store**
    *   **Goal**: Enable developers to publish AgentX benchmarks in the Results Store & Prism.
    *   **Status**: Designing
    *   **Next Steps**: Define ingestion schema, metadata mapping, and Prism visualization requirements for AgentX benchmark runs.
    *   **Spec/Ref**: TBD

#### Already Shipped in Q4 2026
*   **Agent-Native Results Store Tooling & Multi-Arm Campaign Ingestion** (*Completed*, PRs #190, #191, #196, #197): Full-lifecycle CLI (`prism-results`), standalone Agent Skill (`skills/prism-results/SKILL.md`), declarative multi-arm campaigns (`experiment.yaml`), automatic PII/secret scrubbing, single-pass direct publishing, and `llms.txt` autodiscovery. ([agent-native-results-store-tooling-spec.md](../changes/agent-native-results-store-tooling-spec.md))
*   **S3-Compatible Results Store Backend** (*Completed*, PR #198): Config-selected S3-compatible object storage backend alongside GCS. ([s3-results-store-backend-spec.md](../changes/s3-results-store-backend-spec.md))

---

### 🔵 Q1 2027 (Planned Backlog)
Carryover work from 2026 Q3/Q4 and planned next-wave capabilities once the Q4 near-term priorities land.

1.  **llm-d 1.0 Well-Lit Paths Benchmarks**
    *   **Goal**: Deliver baseline benchmarks for key optimization paths:
        *   KV Cache Offloading (with IBM extensions).
        *   P/D Disagg (with MVP UX).
        *   Wide EP (if completed).
    *   **Status**: Planning

2.  **Regressions Analysis**
    *   **Description**: Automated regression detection for model serving.
    *   **Status**: Active Development
    *   **Next Steps**: Switch from "fake workloads" to real workloads in nightly tests => Results Store => Prism.
    *   **Spec/Ref**: TBD

3.  **Disaggregated Benchmarking (P/D Split) MVP**
    *   **Description**: Support for Prefill/Decode split visualization.
    *   **Status**: UI/UX
    *   **Next Steps**: Finalize MVP UX and integrate production P/D Disagg benchmarks.
    *   **Spec/Ref**: [disagg-benchmarks-proposal.md](completed/disagg-benchmarks-proposal.md)

4.  **KV Cache Offloading Guide (Extension)**
    *   **Description**: Extending the existing guide with more benchmarks and configurations.
    *   **Status**: Completed (V1 published Jul 15, 2026) / Active (Extension)
    *   **Next Steps**: Work with IBM team (Rachel) and TPU/storage teams to extend benchmarks across additional workloads, tiers, and configurations.
    *   **Spec/Ref**: [prefix-cache-offload-guide-proposal.md](completed/prefix-cache-offload-guide-proposal.md)

5.  **KV Cache Size & Parameter Insights**
    *   **Description**: Indexing KV Cache sizes from Lohi.
    *   **Status**: Engineering Design
    *   **Next Steps**: Review backend schema changes.
    *   **Spec/Ref**: [kv_cache_optimizations_prd.md](completed/kv_cache_optimizations_prd.md)

6.  **llm-d Results Store: Community Catalog Ingestion (Phase 3)**
    *   **Description**: Dynamically list and query verified community-submitted benchmarks.
    *   **Status**: Product Spec

7.  **llm-d Results Store Scalability (Carryover from Q3 2026)**
    *   **Description**: Remaining scalability and storage architecture work carried over from Q3 2026 (benchmark retraction/withdrawal shipped in PR #169).
    *   **Status**: Engineering Design
    *   **Goals**:
        *   Scale to O(100) active users and O(10,000) benchmarks.
        *   Decouple from GCS / migrate to a scalable database backend (e.g., BigQuery, Spanner, or pluggable internal data store).
        *   Implement Asynchronous Validation Queue (currently validation runs synchronously in `POST /api/results`).

8.  **llm-d Benchmark Backlog Execution (Carryover from Q3 2026)**
    *   **Description**: Complete remaining prioritized benchmarks not landed in Q3 (Gemma 4 31B on RTX Pro 6K, IBM P/D Disagg, Batch 2 SGLang on TPU v6e and RTX Pro 6K, Multi-Turn Chat, and TPU 7x Qwen3-Coder-480B P/D Disagg).
    *   **Status**: Active / Execution
    *   **Ref/Link**: [go/llm-d-benchmark-backlog](https://goto.google.com/llm-d-benchmark-backlog)

---

### 🟣 2027 (Rest of Year Wishlist)

1.  **Benchmark Browser Redesign**
    *   **Description**: Redesign or replace the current Benchmark Browser as the new Results Store UI goes live, implementing the 3-tab structure (Performance Explorer, Value Analysis, Leaderboard).
    *   **Status**: UI/UX / Planning -> Implementation
    *   **Next Steps**: Design and implement the new tabbed layout and views.
    *   **Spec/Ref**: [well-lit-path-app-structure-proposal.md](../changes/well-lit-path-app-structure-proposal.md)

2.  **Well-Lit Path Guides FAQ (Intelligent Routing)**
    *   **Description**: Embedded FAQ in Intelligent Routing guide to help users extrapolate benchmarks.
    *   **Status**: Draft Spec / UI Integration
    *   **Next Steps**: Implement FAQAccordion component and integrate into Milestone1Dashboard.
    *   **Spec/Ref**: [intelligent-routing-faq-spec.md](../changes/intelligent-routing-faq-spec.md)

3.  **Wide EP (Aspirational Stretch Goal)**
    *   **Description**: Wide EP benchmarking.
    *   **Status**: Aspirational / Planning
    *   **Next Steps**: Scope and schedule Wide EP benchmarking once upstream Wide EP work stabilizes.

4.  **On-Demand Dynamic Dashboards (Aspirational Stretch Goal)**
    *   **Description**: Enable power users to build, configure, and share customized benchmark dashboards via Namespaced URLs without code redeployments.
    *   **Status**: Product Spec
    *   **Next Steps**: Review proposal, define final GCS folder schema, design UI builder blocks.
    *   **Spec/Ref**: [on-demand-dashboards.md](../changes/on-demand-dashboards.md)

5.  **llm-d Results Store: Robust Categorization & Open Beta (Phase 4)**
    *   **Description**: Integrating advanced validation classifiers and auto-tagging.
    *   **Status**: Discovery & Exploration

6.  **Reinforcement Learning Benchmarks Exploration**
    *   **Description**: Mapping RL serving workloads.
    *   **Status**: Discovery & Exploration
    *   **Spec/Ref**: [rl-benchmarks-exploration.md](../changes/rl-benchmarks-exploration.md)

7.  **Multi-Token Prediction (MTP) Benchmarks Exploration**
    *   **Description**: Exploring MTP impact on orchestration and parallelism.
    *   **Status**: Discovery & Exploration
    *   **Spec/Ref**: [mtp-spec-decode-benchmarks-exploration.md](../changes/mtp-spec-decode-benchmarks-exploration.md)

---

### ✅ Q3 2026 (Closed)
Q3 focused on stabilizing core features, publishing the Results Store UI, scaling the backend, and executing the benchmark backlog ahead of llm-d 1.0.

1.  **llm-d Results Store: Ingestion & UI**
    *   **Outcome**: Completed (core shipped to prod on `https://prism.llm-d.ai/?view=results-store`).
    *   **What Shipped**: GCS-backed ingestion API, GitHub OAuth, `prism-iam/` contributor and admin allowlists (PRs #86, #182, #183), strict Zod upload payload validation (PRs #92, #108, #113, #168), closed-beta UI (PR #88), scheduled Cloud Run prod deploys (PR #130), and default Results Store bucket integration (PR #156).
    *   **Follow-on**: UX simplification and redesign tracked in Q4 2026 (`llm-d Results Store UI Redesign`).
    *   **Spec/Ref**: [Backend Ingestion API README](completed/results-api/README.md)

2.  **llm-d Results Store Scalability**
    *   **Outcome**: Partially completed (1 of 4 goals shipped; remainder carried to Q1 2027).
    *   **What Shipped**: Benchmark retraction/withdrawal and split review routes (PR #169, merged Oct 2: owner/admin double-delete withdrawal and unlisting, plus admin retraction to `rejected`).
    *   **Carried to Q1 2027**: Scalable database / decoupled storage backend (BigQuery/Spanner not implemented), Asynchronous Validation Queue (validation still synchronous), and scaling/load validation to O(100) active users and O(10,000) benchmarks.

3.  **llm-d Benchmark Backlog Execution**
    *   **Outcome**: Partially completed (partial Batch 1 landed; remainder carried to Q1 2027).
    *   **What Shipped**: 9 public runs in the live Results Store: 8 Partner (EPAM) Intelligent Routing runs across `standard-k8s`, `optimized-baseline`, `precise-prefix`, and `predicted-latency` (4 for Gemma 4 31B on 16x TPU v6e, 4 for Qwen3 32B on 8x H100), plus 1 TPU 7x Qwen3.5-397B-A17B `agentic-pd-disagg` run. Earlier Tiered Prefix Offloading V1 (Jul 15) and P/D Disagg prototype data (Jul 20) landed in Well-Lit Path GCS folders.
    *   **Carried to Q1 2027**: Gemma 4 31B on RTX Pro 6K (Tiered Prefix Offloading and Intelligent Routing), IBM P/D Disagg P0, Batch 2 SGLang (TPU v6e and RTX Pro 6K), H100 Gemma 4 31B, Multi-Turn Chat, and TPU 7x Qwen3-Coder-480B P/D Disagg.
    *   **Ref/Link**: [go/llm-d-benchmark-backlog](https://goto.google.com/llm-d-benchmark-backlog)
