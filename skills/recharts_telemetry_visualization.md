# Skill: Recharts Telemetry Visualization Standards

## Goal
Maintain consistent, high-fidelity metadata formatting and clean visual presentations for all dual-chart telemetries and data visualisations using `Recharts`.

## Visual Engineering Rules
### 1. Descriptive, Standardized Chart Titles
* **Pattern**: Structure chart titles comprehensively using the `"Y-Axis vs X-Axis"` naming convention, prioritizing precise metrics and outcome designations. For example:
  * **Chart 1**: `"Output tokens/sec vs Normalized TPOT"`
  * **Chart 2**: `"Throughput (Total Tokens/sec) vs Generation Speed (Normalized TPOT)"`

### 2. Embedded Provider and Configuration Subheadings
* **Pattern**: Support all telemetry chart headings with comprehensive provider icons (e.g., GCP SVGs), precise cluster topologies, and model metadata to provide actionable context for comparisons.
  * Example Structure: `[Provider SVG] [Machine-Type] [Accelerator-Type] ([Replica count])`
  * Example Structure: `[Model Scale] ([Quantization]) • [Engine Version]`

### 3. Clear Legends with Interactive Capability
* **Pattern**: Group legend items using the uppercase `text-slate-500` category header format. Ensure percentile and metric legend labels are selectable, toggleable, and free of outer background containers, matching the established presentation of the `InferenceSchedulingChart`.
