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

### 🟡 Priority 2: Advanced Visualization & Analytics

3. **Disaggregated Benchmarking (P/D Split)**
   - **Product Spec:** [disagg-benchmarks-proposal.md](../changes/disagg-benchmarks-proposal.md)
   - **Status:** UI/UX (Mocks on `next` branch)
   - **Notes:** Initial mockups show side-by-side comparison of Prefill/Decode metrics. Implementation spec is under review.

4. **Predicted Latency-Based Scheduling**
   - **Product Spec:** [predicted_latency_scheduling_prd.md](../changes/predicted_latency_scheduling_prd.md)
   - **Status:** Product Spec
   - **Notes:** High-level spec drafted. Waiting for UI/UX phase.

### 🔴 Priority 3: Explorations & Future Features

5. **Reinforcement Learning Benchmarks Exploration**
   - **Product Spec:** [rl-benchmarks-exploration.md](../changes/rl-benchmarks-exploration.md)
   - **Status:** Discovery & Exploration
   - **Notes:** Early-stage analysis on how to map RL serving workloads.
