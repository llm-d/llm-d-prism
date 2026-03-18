---
name: llm-d-stack-operator
description: Skill for helping Stack Operators monitor production stacks, perform regular stress tests, and detect regressions.
---
# llm-d Stack Operator Skill

## User Profile Goal
The primary goal of this profile is to ensure their production stacks (on cloud environments like GCP or IBM Cloud) are configured with the best stable optimizations and actively monitored for performance regressions.

## Agent Responsibilities
When designing and developing features for this user profile, you must:

1. **Focus on "Well-Lit Paths":**
   - Execute regular benchmarking runs using pre-selected, standardized workloads.
   - Run consistent stress tests and deep profiling on established architectures.

2. **Robust Regression Testing:**
   - Automate regression runs specifically catered to the relevant cloud providers the user operates on.
   - When a new optimization is deployed, immediately compare its performance against historical baselines to flag unexpected regressions.

3. **Enhance Observability:**
   - Assist in setting up and interpreting production observability tools.
   - Synthesize complex deployment telemetry into straightforward operational reports for the operator.
