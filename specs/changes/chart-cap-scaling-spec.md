# Spec: Explicit Auto Mode & Scaled Cap Controls for Prism Charts

- **Status**: Implemented
- **Author**: diamondburned@google.com, Jetski
- **Date**: July 24, 2026

## 1. Executive Summary & Rationale

This document outlines the architectural decisions, scaling behavior, and performance optimizations for the "CAP" slider and X-axis domain controls across Prism's Results Store and Well-Lit Path dashboards.

Previously, adjusting the CAP slider filtered out data points exceeding the cap value. However, because charts were configured with dynamic auto-scaling domains (`domain=['auto', 'auto']` or `getAxisConfig`), the X-axis bounds automatically shrank to fit the remaining datapoints rather than remaining locked at the slider's specified numerical cap. Additionally, switching between different X/Y axis metrics (e.g., TPOT vs. TTFT) retained stale numerical cap values, cutting off valid data points in the new metric scale.

### 1.1 Core UX & Engineering Challenges

- **Auto-Scaling Domain Conflicts**: Setting a cap filtered data points above the cap, but Recharts auto-scaled the axis down to the maximum remaining datapoint. If a user set a cap of 400 ms and the highest remaining datapoint was 320 ms, the axis right edge jumped down to 320 ms instead of staying pinned at 400 ms.
- **Cross-Metric Scale Mismatches**: Retaining a manual cap value across different metrics (e.g., 50 ms for TPOT) caused 100% of data points to be hidden when switching to higher-scale metrics like TTFT (which may span up to 5,000 ms).
- **Synchronous Rendering Stutter**: Dragging the Cap range input fired synchronous React state updates on every `mousemove` event (60–120 times/sec), triggering unmemoized array filtering and full component tree re-renders across data tables and scatter charts.

---

## 2. Technical Architecture & Design Decisions

### 2.1 Explicit Auto Mode vs. Locked Manual Cap

Prism introduces an explicit **Auto** mode state alongside the numerical Cap slider control across all chart toolbars ([ThroughputCostChart.jsx](src/components/Dashboard/ThroughputCostChart.jsx), [AgenticWorkloadsDashboard.jsx](src/components/AgenticWorkloadsDashboard.jsx), and [IntelligentRoutingChart.jsx](src/components/IntelligentRoutingChart.jsx)):

1.  **Auto Mode (Default)**:
    - Active on initial page load or when clicking the "Auto" toggle button (`xAxisMax === Infinity` / `zoomXMax === null`).
    - The X-axis domain automatically scales to fit active benchmark dataset bounds using clean tick distributions (`getAxisConfig`).
    - Range slider and text inputs display an "Auto" placeholder and dimmed UI styling.
2.  **Locked Manual Cap Mode**:
    - Engaged when unchecking "Auto", dragging the range slider, or entering a custom number.
    - Pins the upper boundary of the X-axis domain strictly to `[minX, customCap]` with `allowDataOverflow` enabled.
    - Data points above `customCap` are hidden or visually clipped, but the right boundary of the X-axis stays pinned at `customCap` without shrinking under the user's feet.

### 2.2 120% Maximum Bound Padding

To prevent data points on the far right edge of a dataset from clipping against the container boundary, upper axis calculations (`dataMax`) incorporate a 20% right margin (`Math.ceil(rawDataMax * 1.2)`):

- **Data Max Calculation**: `const dataMax = Math.ceil(rawDataMax * 1.2);`
- Provides comfortable visual padding when viewing scatter plots and Pareto frontiers.

### 2.3 Automatic Cap Reset on Metric View Switch

When a user switches the active X-axis or Y-axis metric (e.g., switching from TPOT to TTFT or NTPOT), `xAxisMax` / `zoomXMax` automatically resets to Auto mode (`Infinity` / `null`). This prevents stale numerical caps from masking data in the new unit scale.

---

## 3. Performance Optimizations & 60 FPS Responsiveness

To eliminate Main Thread layout thrashing during mouse drag operations on the Cap range input:

1.  **React 19 `useDeferredValue` Integration**:
    - Wrap the cap filter state in `React.useDeferredValue(xAxisMax)` / `React.useDeferredValue(zoomXMax)` in [Dashboard.jsx](src/components/Dashboard.jsx), [AgenticWorkloadsDashboard.jsx](src/components/AgenticWorkloadsDashboard.jsx), and [IntelligentRoutingChart.jsx](src/components/IntelligentRoutingChart.jsx).
    - Slider knob movement and text input updates remain responsive at 60 FPS while heavy SVG chart re-renders and table filtering are scheduled as non-blocking background transitions.
2.  **Memoized Filter Pipelines**:
    - In [Dashboard.jsx](src/components/Dashboard.jsx), `filteredData` is wrapped in `useMemo` to prevent array re-allocation on unrelated renders.
    - In [ThroughputCostChart.jsx](src/components/Dashboard/ThroughputCostChart.jsx), `visibleDataPoints`, `uniqueBenchmarks`, `baselineSeries`, `paretoData`, and axis domain calculations are wrapped in `useMemo`.

---

## 4. Trade-offs: Pros vs. Cons

### 4.1 Pros

- **Predictable Boundary Controls**: Lock-in manual caps allow users to compare datasets side-by-side or against fixed latency SLO boundaries.
- **Zero-Stutter Dragging**: `useDeferredValue` and `useMemo` eliminate frame drops during range slider interaction.
- **Safe Metric Transitions**: Automatic cap resetting prevents empty graphs when switching axis dimensions.

### 4.2 Cons

- **State Complexity**: Manually managed `useDeferredValue` and Auto state flags require careful sync when building shareable URLs (`useDashboardState.js`).

---

## 5. Relevant Git Commit History

The following commits introduced the automated chart axis scaling, scaling synchronization, and layout fixes:

- **`1597944`** — *Fix agentic serving guide chart axes and labels (#106)* (Author: Sean Horgan)  
  Introduced `getAxisConfig` in [utils.js](src/components/ui/charts/utils.js) and replaced hardcoded axis domain arrays with dynamic `chartAxesConfig` auto-scaling domain calculations.
- **`25e9a5e`** — *fix: synchronize agentic chart scaling controls (#75) (#101)* (Author: diamondburned)  
  Synchronized `zoomXMax` and `effectiveXMax` scaling bounds across agentic workload chart lines.
- **`6d3db5b`** — *fix: scale comparison drawer chart axes to selected benchmarks only* (Author: Sean Horgan)  
  Scoped drawer dataset filtering (`drawerFilteredData`) to align comparison chart axis scaling with active benchmark selections.
- **`70462ad`** — *Match popup charts to the same format as guide charts; remove incorrect data normalization in popup charts.* (Author: Sean Horgan)  
  Standardized popup chart formatting and removed legacy normalization routines overriding axis bounds.
- **`0e6e73a`** — *Refactor Inference Scheduling charts to new scatter layout* (Author: Sean Horgan)  
  Refactored scheduling chart layout to scatter plot formats using dynamic dataset bounds.
