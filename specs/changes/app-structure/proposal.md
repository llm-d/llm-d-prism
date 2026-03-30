# Spec: Application Structure - 3 Tiered Views

**Status**: Draft
**Author**: Agent

## 1. Executive Summary

As Prism evolves from a pure performance visualization tool into a comprehensive platform for optimizing the entire inference stack—spanning infrastructure, application/model serving, and orchestration—the single-chart interface is becoming overloaded. To support advanced comparative features (like Quality vs. Cost analysis) and gamified discovery (Leaderboards) without cluttering the core experience, we will structure the application into three distinct top-level views (Tabs).

This PRD outlines the purpose, constraints, and user experience for each of these three views:

1.  **Performance Explorer** (The existing, highly-configurable scatter plot)
2.  **Value Analysis** (A specialized view for Quality vs. Cost)
3.  **Leaderboard** (A curated, gamified "best in class" ranking)

## 2. Core Application Navigation

- **UI Paradigm**: A prominent, top-level Tab bar or Segmented Control (e.g., located in the top header or immediately above the main content area).
- **State Management**:
  - _Global State_: Filters (Model, Provider, Precision, Data Source) should generally persist across tabs so users don't have to re-select their baseline constraints when switching views.
  - _Local State_: Chart configurations (Axis selections, log scales) should be specific to the tab.

## 3. Tab 1: Performance Explorer

This is the evolution of the current Prism experience. It remains the powerhouse for raw technical analysis and optimization.

### 3.1. Purpose

Deep-dive technical analysis of model serving performance (Throughput, Latency, TTFT) against Cost or other performance metrics.

### 3.2. Key Features

- **Full Configuration**: Complete freedom to map any available metric (from the selected Data Sources) to the X, Y, and Z (Bubble Size) axes.
- **All Data Sources**: Supports all benchmark data sources (GIQ, Fireworks, custom uploads, etc.).
- **Primary axes defaults**: X = Cost ($ / 1M Tokens), Y = Output Tokens / Sec.

### 3.3. Constraints

- To prevent the UI from becoming unmanageable, we will _remove_ the need to explicitly wedge "Quality" metrics into the axis selectors here, deferring that to the Value Analysis tab. (Though quality metrics may still appear in rich tooltips).

## 4. Tab 2: Value Analysis

This is a **Net-New** view. It is purpose-built to answer the question: _"Is the cost of this model justified by its intelligence?"_ (Inspired by the LMArena Elo vs. Cost scatter plot).

### 4.1. Purpose

Visualizing the trade-off between a model's capabilities (Quality/Intelligence) and its operational Cost. An example of a useful cost / intelligence chart can be found in figure 1 of this paper: https://arxiv.org/pdf/2507.06261.

### 4.2. Key Features

- **Fixed Axes**:
  - **Y-Axis**: Quality Metric (Default: `LMArena Elo`. Allow switching to `MMLU`, `GSM8K`, etc., via a focused dropdown, rather than the massive metric selector from Tab 1).
  - **X-Axis**: Cost Metric (Default: Blended Prompt/Sample Price).
- **Visual Enhancements**:
  - _Inverted X-Axis_: Cost should decrease as it moves right, so the "Best" models (Smartest & Cheapest) are in the Top-Right quadrant.
  - _Logarithmic X-Axis_: To handle the massive price disparities between models.
  - _Pareto Frontier_: A dynamic line connecting the non-dominated points (highest Elo for a given or lower cost), clearly showing the leading edge of model value.
- **"Tale of the Tape" Cards**: Above the chart (or in a side panel), display summary cards for the top 2-3 models currently visible or pinned, comparing their Quality scores and average Cost side-by-side.

### 4.3. Critical Data Constraint

- **GIQ Only**: Because accurate Cost comparison requires optimal serving efficiency, this tab _must_ constrain cost data to sources that measure at the optimal efficiency point.
- _Implementation_: When the user enters this tab, the "Data Source" filter should silently lock to `GIQ` (or visually indicate that non-GIQ cost points are excluded from this specific chart).

## 5. Tab 3: Leaderboard

This is a **Net-New** view. It gamifies the data, moving away from scatter plots to provide immediate, definitive answers for common use cases.

### 5.1. Purpose

A curated, ranking-based interface that highlights the absolute best configurations (Model + Hardware + Stack) for specific "Events" or categories.

### 5.2. Key Features

- **The "Events" (Categories)**: Curated lists that the user can switch between (e.g., via a sidebar or sub-tabs). Examples:
  - 🏆 _Speed Demon_: Ranked by lowest P95 Time-To-First-Token (TTFT).
  - 🧠 _Smartest in Class_: Ranked by highest MMLU/Elo (filterable by max VRAM or Cost).
  - 💰 _Thrift Shop_: Ranked by best Intelligence-to-Cost ratio.
  - 🏎️ _Throughput King_: Ranked by highest Output Tokens/Sec.
- **The Ranking UI**:
  - A clean, paginated table or list view (not a scatter plot).
  - Each row represents a _winning configuration_ (e.g., `Llama-3-70b` on `8x H100` via `vLLM`).
  - Includes a "Load in Explorer" button to instantly jump to Tab 1 with that specific configuration highlighted/filtered.

### 5.3. User Experience

- Highly opinionated. The user doesn't configure axes; they simply select what they care most about (e.g., "Speed") and Prism tells them who is winning right now based on the ingested data.

## 6. Development Phasing

- **Phase 1: Architecture & Tab 1**: Implement the top-level tab structure and isolate the existing scatter plot into the "Performance Explorer" component. Ensure global filters continue to work.
- **Phase 2: Data Foundation**: Implement the `QualityParser` (defined in the `quality-metrics-prd.md`) to pull in HF/LMSYS data and make it available to the global state.
- **Phase 3: Value Analysis (Tab 2)**: Build the restricted, Pareto-enabled scatter plot for Quality vs. Cost.
- **Phase 4: Leaderboard (Tab 3)**: Build the ranking algorithms and the list-based UI for the specific "Events".
