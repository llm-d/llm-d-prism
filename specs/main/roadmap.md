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

### 🟡 Q3 2026 (Active Work - Target: End of September)
Focus is on stabilizing core features, publishing the Results Store UI, ensuring scalability, and preparing guides for the llm-d 1.0 release in October. Work in this quarter should be substantially complete to support the launch.

1.  **llm-d Results Store: Ingestion & UI**
    *   **Description**: Combining the backend ingestion API with a new submission UI.
    *   **Status**: Active Development / Engineering Design
    *   **Next Steps**: Publish UI to prod with an AllowList of approvers. Implement GCS-backed ingestion API, validation checks, and IAM allowlist.
    *   **Spec/Ref**: [Backend Ingestion API README](results-api/README.md)

2.  **Regressions Analysis**
    *   **Description**: Automated regression detection for model serving.
    *   **Status**: Active Development
    *   **Next Steps**: Switch from "fake workloads" to real workloads in nightly tests => results store => prism.
    *   **Spec/Ref**: TBD

3.  **Disaggregated Benchmarking (P/D Split) MVP**
    *   **Description**: Support for Prefill/Decode split visualization.
    *   **Status**: UI/UX
    *   **Next Steps**: MVP UX targeting end of July (stretch goal).
    *   **Spec/Ref**: [disagg-benchmarks-proposal.md](../changes/disagg-benchmarks-proposal.md)

4.  **KV Cache Offloading Guide (Extension)**
    *   **Description**: Extending the existing guide with more benchmarks and configurations.
    *   **Status**: Completed (V1 published Jul 15, 2026) / Active (Extension)
    *   **Next Steps**: Work with IBM team (Rachel) to extend the benchmarks to cover more workloads and configurations.
    *   **Spec/Ref**: [prefix-cache-offload-guide-proposal.md](../changes/prefix-cache-offload-guide-proposal.md)

5.  **KV Cache Size & Parameter Insights**
    *   **Description**: Indexing KV Cache sizes from Lohi.
    *   **Status**: Engineering Design
    *   **Next Steps**: Review backend schema changes.
    *   **Spec/Ref**: [kv_cache_optimizations_prd.md](../changes/kv_cache_optimizations_prd.md)

6.  **llm-d Results Store Scalability**
    *   **Description**: Scaling the database and adding advanced features to support the launch.
    *   **Status**: Engineering Design / Implementation
    *   **Goals**:
        *   Scale to O(100) active users and O(10000) benchmarks.
        *   Migrate to BigQuery or Spanner for scalable database.
        *   Implement ability to retract benchmarks.
        *   Implement Asynchronous Validation Queue.

7.  **llm-d Benchmark Backlog Execution**
    *   **Description**: Execute and ingest prioritized benchmarks to populate the Results Store for the 1.0 launch.
    *   **Summary**: Execution of the prioritized benchmarks covering key models (Gemma 4 31B, Qwen 3 32B) across diverse hardware (RTX Pro 6000, TPU v6e, H100) and optimization paths (Prefix Caching, P/D Disagg, Intelligent Routing).
    *   **Status**: Active / Execution
    *   **Ref/Link**: [go/llm-d-benchmark-backlog](https://goto.google.com/llm-d-benchmark-backlog)

8.  **Wide EP (Aspirational Stretch Goal)**
    *   **Description**: Wide EP benchmarking.
    *   **Status**: Aspirational / Planning
    *   **Next Steps**: Target completion before llm-d 1.0 in October.

---

### 🔵 Q4 2026 (Milestone: llm-d 1.0 Release & Fine-Tuning)
Starting October 1, this quarter focuses on the llm-d 1.0 marketing launch, fine-tuning delivered features, and landing key UI and usability updates.

1.  **llm-d 1.0 Well-Lit Paths Benchmarks**
    *   **Goal**: Deliver baseline benchmarks for key optimization paths:
        *   KV Cache Offloading (with IBM extensions).
        *   P/D Disagg (with MVP UX).
        *   Wide EP (if completed).
    *   **Status**: Planning

2.  **Benchmark Browser Redesign**
    *   **Description**: Redesign or replace the current Benchmark Browser as the new Results Store UI goes live, implementing the 3-tab structure (Performance Explorer, Value Analysis, Leaderboard).
    *   **Status**: UI/UX / Planning -> Implementation
    *   **Next Steps**: Design and implement the new tabbed layout and views.
    *   **Spec/Ref**: [well-lit-path-app-structure-proposal.md](../changes/well-lit-path-app-structure-proposal.md)

3.  **Well-Lit Path Guides FAQ (Intelligent Routing)**
    *   **Description**: Embedded FAQ in Intelligent Routing guide to help users extrapolate benchmarks.
    *   **Status**: Draft Spec / UI Integration
    *   **Next Steps**: Implement FAQAccordion component and integrate into Milestone1Dashboard.
    *   **Spec/Ref**: [intelligent-routing-faq-spec.md](../changes/intelligent-routing-faq-spec.md)

4.  **Predicted Latency-Based Scheduling**
    *   **Description**: Scheduling based on predicted latency.
    *   **Status**: Product Spec
    *   **Spec/Ref**: [predicted_latency_scheduling_prd.md](../changes/predicted_latency_scheduling_prd.md)

5.  **llm-d Results Store: Community Catalog Ingestion (Phase 3)**
    *   **Description**: Dynamically list and query verified community-submitted benchmarks.
    *   **Status**: Product Spec

---

### 🟣 2027-H1 (Future Ideas & Explorations)

1.  **llm-d Results Store: Robust Categorization & Open Beta (Phase 4)**
    *   **Description**: Integrating advanced validation classifiers and auto-tagging.
    *   **Status**: Discovery & Exploration

2.  **Reinforcement Learning Benchmarks Exploration**
    *   **Description**: Mapping RL serving workloads.
    *   **Status**: Discovery & Exploration
    *   **Spec/Ref**: [rl-benchmarks-exploration.md](../changes/rl-benchmarks-exploration.md)

3.  **Multi-Token Prediction (MTP) Benchmarks Exploration**
    *   **Description**: Exploring MTP impact on orchestration and parallelism.
    *   **Status**: Discovery & Exploration
    *   **Spec/Ref**: [mtp-spec-decode-benchmarks-exploration.md](../changes/mtp-spec-decode-benchmarks-exploration.md)
