# Prism Roadmap & Spec Prioritization

This document tracks upcoming features, their product specifications, and their current phase in the Feature Development Lifecycle.

## Feature Phases
- **Product**: Specifying product requirements.
- **UI/UX**: Designing mocks and implementation specs. Pushed to `next` branch.
- **Engineering**: Backend and data schema design.
- **Implementation**: Active development on main codebase.
- **Completed**: Merged to `main` and deployed.

---

## 🗺️ Roadmap & Prioritization

### 🟢 Priority 1: Core Performance Optimization & Gateway Ingestion

1. **Prefix Cache Offloading Guide**
   - **Product Spec:** [prefix-cache-offload-guide-proposal.md](../changes/prefix-cache-offload-guide-proposal.md)
   - **Status:** Completed
   - **Notes:** Baseline caching strategies integrated.

2. **KV Cache Size & Parameter Insights**
   - **Product Spec:** [kv_cache_optimizations_prd.md](../changes/kv_cache_optimizations_prd.md)
   - **Status:** Engineering Design
   - **Notes:** Backend schema changes are currently being reviewed to support indexing KV Cache sizes from Lohi.

3. **Prism Community Store: Backend Ingestion API (Phase 2.5)**
   - **Product Spec:** [README.md](results-api/README.md)
   - **Status:** Engineering Design
   - **Notes:** Implementing GCS-backed ingestion API, validation checks, and IAM allowlist enforcement.

### 🟡 Priority 2: Advanced Visualization & Analytics

4. **Disaggregated Benchmarking (P/D Split)**
   - **Product Spec:** [disagg-benchmarks-proposal.md](../changes/disagg-benchmarks-proposal.md)
   - **Status:** UI/UX (Mocks on `next` branch)
   - **Notes:** Initial mockups show side-by-side comparison of Prefill/Decode metrics. Implementation spec is under review.

5. **Predicted Latency-Based Scheduling**
   - **Product Spec:** [predicted_latency_scheduling_prd.md](../changes/predicted_latency_scheduling_prd.md)
   - **Status:** Product Spec
   - **Notes:** High-level spec drafted. Waiting for UI/UX phase.

6. **Prism Community Store: Community Catalog Ingestion (Phase 3)**
   - **Status:** Product Spec
   - **Notes:** Enhancing the Workload Catalog to dynamically list and query verified community-submitted benchmarks.

### 🔴 Priority 3: Explorations & Future Features

7. **Reinforcement Learning Benchmarks Exploration**
   - **Product Spec:** [rl-benchmarks-exploration.md](../changes/rl-benchmarks-exploration.md)
   - **Status:** Discovery & Exploration
   - **Notes:** Early-stage analysis on how to map RL serving workloads.

8. **Prism Community Store: Robust Categorization & Open Beta (Phase 4)**
   - **Status:** Discovery & Exploration
   - **Notes:** Integrating advanced validation classifiers and auto-tagging.

9. **Results API Evolution: Asynchronous Validation Queue**
   - **Status:** Discovery & Exploration
   - **Notes:** Decoupling validation from upload request lifecycle using background workers.

10. **Results API Evolution: Scalable Database Migration**
    - **Status:** Discovery & Exploration
    - **Notes:** Migrating to BigQuery or Spanner to support >100k benchmarks with sub-10s latency.
