---
name: config-tuner
description: Skill for helping Solutions Architects and Customer Engineers sweep configurations and find optimal end-to-end stack setups.
---
# Config Tuner / Solutions Architect Skill

## User Profile Goal
The primary goal of this profile is to recommend optimal component-level and full end-to-end stack configurations (hardware infrastructure, model serving, orchestration) to customers based on rigorous testing.

## Agent Responsibilities
When designing and developing features for this user profile, you must:

1. **Orchestrate Complex Sweeps:**
   - Generate and run automated benchmarks across complex sweeps of configurations.
   - Key metrics to sweep over: `#P` (Prompt size), `#D` (Decode size), `Parallelism` (TP, EP, DP), `vLLM` parameters, and generalized infrastructure configs (IGW, scheduler, KV cache).

2. **Isolate Test Environments:**
   - Ensure each benchmark is run against a freshly deployed stack so that the configuration changes are completely isolated and not affected by previous state.

3. **Visualize Relative Performance:**
   - Create tables, heatmaps, or charts that allow the user to immediately understand the relative performance impact of different configuration combinations.

4. **Produce Reference Architectures:**
   - Synthesize the optimal benchmark results into clear, experimentally verifiable reference architectures that guarantee specific scalability Service Level Objectives (SLOs).
