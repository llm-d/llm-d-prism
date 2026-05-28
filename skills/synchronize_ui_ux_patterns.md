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
