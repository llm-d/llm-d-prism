# Skill: Synchronizing UI/UX Element Styles with Existing Dashboard Patterns

## Goal
Ensure that all new visual features, components, and dashboard refactors blend seamlessly with existing designs, maintaining total visual coherence across the application.

## Core Design Principles
### 1. Zero Outer Strokes on Cards
* **Pattern**: Default to borderless outer cards to reduce visual noise. Use ambient background shadows like `shadow-xl` or `shadow-2xl` on dark-mode backgrounds instead of border strokes.

### 2. Standardized Color Palettes
* **Pattern**: Deploy a consistent, cohesive color palette for primary pathways and action buttons. 
  * Primary Path (e.g., Inference Scheduling, Agentic Workloads): Use `Cyan` (`cyan-500`, `cyan-400`, and `cyan-600`).
  * Utility Suite (e.g., Benchmark Browser): Use `Emerald` (`emerald-400`, `emerald-500`, and `emerald-600`).

### 3. Replicate Established Layout Paddings and Typography
* **Pattern**: Carry over the exact spacing, font choices, and padding rules from existing components. For example:
  * **Legend Header Typography**: Use `text-[10px] font-bold text-slate-500 uppercase tracking-tight`.
  * **Table Column Headers**: Use `text-[10px] font-extrabold uppercase tracking-widest`.
  * **Interactive CTA Buttons**: Mirror the sizing and styling of existing buttons like `px-3 py-1.5 bg-slate-800 border-slate-700` and avoid introducing new SVGs or flex parameters unless explicitly requested.

### 4. Consistent Page Template and Chart Layouts
* **Pattern**: All new dashboard pages must strictly follow the uniform visual template and section structure established by standard dashboards (e.g., `Milestone1Dashboard`):
  * **Dashboard Header**: Breadcrumb structure with back navigation button, thin bottom divider, and category badges. For prototype or experimental dashboards, a dedicated `PROTOTYPE` badge styled in a premium purple theme (`bg-purple-500/10 text-purple-400 border-purple-500/20`) must be placed to the **right** of the `<h1>` title, consistent with the side-by-side badge placement (e.g., "Guided path") seen in standard headers.
  * **Description & Optimization Overview**: A premium multi-column horizontal card with ambient glowing background orbs detailing:
    * *Overview*: Subtitled description paragraph of the benchmark optimization.
    * *Active Configurations*: Status badge selectors highlighting active (`Active` in cyan) vs combined (`Baseline` in emerald) states with linked technical installation guides.
    * *Upcoming*: Disabled/coming soon optimizations in amber/slate tones.
  * **Metric KPI Cards**: 3-column responsive grid displaying primary performance telemetry outcomes.
  * **Interactive Chart Controls & Visualization Filters**: Charts must feature collapsible filter drawers offering consistent axes toggle arrays (`NTPOT`, `TPOT`, `TTFT`, `ITL`, `E2E` for X-axis; `Output`, `Input`, `Total`, `QPS` for Y-axis) as well as Log Scale, Per Chip scaling, and selectable percentile toggle legends (P50/P90/P99) matching the custom interactive telemetry behaviors in `InferenceSchedulingChart`.
  * **Telemetry Result Table**: Descriptive data table matching standard columns, sorting headers, and gain percentage indicators.
  * **collapsible FAQ Accordion**: Standardized visual grouping at the bottom of the page.
  * **Reproducibility/Action Modals**: Styled consistently with exact overlay layers, headers, and reference doc links.
