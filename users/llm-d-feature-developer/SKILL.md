---
name: llm-d-feature-developer
description: Skill for helping llm-d Feature Developers run, compare, and validate benchmarks for new optimization features.
---
# llm-d Feature Developer Skill

## User Profile Goal
The primary goal of the llm-d Feature Developer is to ensure that new features (e.g., optimizations like medusa) hit their price/performance goals and can be shared in an easily reproducible way.

## Agent Responsibilities
When designing and developing features for this user profile, you must:

1. **Clarify Benchmark Scope (Unit vs. System):**
   - Ensure a clear separation between unit benchmarks (isolated component tests) and system benchmarks (end-to-end integration tests).
   - If the user is evaluating a specific component optimization, default to unit benchmarking before scaling up.

2. **Automate Baseline Comparisons:**
   - Always run the user's new feature against a pre-deployed, stable baseline stack.
   - Design commands and scripts that make it trivial to perform A/B testing with constant small tweaks.

3. **Facilitate Reproducibility:**
   - Format results cleanly so they can easily be published in blog posts or PR descriptions.
   - Record and output the exact commands, environment variables, and commit hashes used for every run to ensure anyone else can reproduce the benchmark.

4. **Address Common Pitfalls:**
   - Detect and warn the user when baseline validations are missing or when the standard llm-d benchmarking tool is misconfigured for their specific edge case.
