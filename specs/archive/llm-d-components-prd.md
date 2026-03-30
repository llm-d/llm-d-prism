I want to extend the apps ability to filter and compare benchmarks based on specific components of the serving stack with a focus on very large multi-node configurations and P/D disaggregation to support production environments that require high throughput and low latency.

The goal is to make it easier for users (e.g. Customer Engineers) to compare the performance of different components of the serving stack and to understand the trade-offs between different configurations. It should be easy to find configurations and compare them side-by-side with baselines and reasonable alternatives.

To illustrate the vision I want to include additional inputs to the app. Eventually these inputs will be fully functional but until then I want to manually configure some behavior. The inputs should work like the other filter inputs where there is a selection box, option name, and a count of benchmarks that match the selection.

Add 2 additional input dropdowns to the Ochestration / Serving Framework section of the Benchmark Filter experience.

1. Components
   -- Inference Gateway
   -- Inference Scheduler
   -- LeaderWorkerSet

The Inference Gateway option should display a count of 1 as it will temporarily map to the same benchark as the llm-d v0.30 serving stack option. The other Component options should list 0 as a count.

2. If a user selects "P/D Disaggregation" from the Optimizations dropdown, the app should present an additional dropdown inputs so the user can select the number of prefill nodes and the number of decode nodes.

- P/D node ratio
  -- 1P:1D
  -- 1P:2D
  -- 1P:4D
  -- 2P:1D
  -- 2P:2D
  -- 2P:4D
  -- 10P:8D

All these options should list zero as a count.

## Metadata Configuration & UX Mapping

I want to consider the type of metadata configuration that characterizes the llm-d serving stack.

Based on the `benchmark_report_v0.2_json_schema.json`, the following configuration options are available and should be surfaced in the UI.

### 1. Configuration Analysis

#### A. Core "Serving Stack" Components

_Schema Location_: `scenario.stack[]` (Array of Components)

| Component / Feature  | Schema Field (v0.2)                                          | Show in App? | UX Location               | Notes                                                 |
| :------------------- | :----------------------------------------------------------- | :----------- | :------------------------ | :---------------------------------------------------- |
| **Inference Engine** | `stack[].standardized.tool` (e.g., "vllm", "tgi")            | **Yes**      | **Filter & Card**         | Already core to the app.                              |
| **Engine Role**      | `stack[].standardized.role` ("prefill", "decode", "replica") | **Yes**      | **Filter (Hidden Logic)** | Critical for detecting P/D Disaggregation mode.       |
| **Gateway**          | `stack[].metadata.label` (Look for "gateway")                | **Maybe**    | **Details View**          | Useful for debugging, noise for high-level filtering. |
| **Scheduler**        | `stack[].metadata.label` (Look for "scheduler")              | **Maybe**    | **Details View**          | Only show if multiple scheduler options exist.        |
| **LeaderWorkerSet**  | `stack[].metadata.label` (Look for "lws")                    | **No**       | **N/A**                   | Implementation detail unless comparing LWS versions.  |

#### B. P/D Disaggregation Configuration

_Schema Location_: `scenario.stack[]` where `kind="inference_engine"`

| Configuration      | Schema Field (v0.2)                           | Show in App? | UX Location              | Notes                                                                                                                 |
| :----------------- | :-------------------------------------------- | :----------- | :----------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| **Prefill Nodes**  | `stack[role="prefill"].standardized.replicas` | **Yes**      | **Filter (Conditional)** | Create a "Prefill Node Count" slider/input that _only_ appears when `Optimizations = P/D Disaggregation` is selected. |
| **Decode Nodes**   | `stack[role="decode"].standardized.replicas`  | **Yes**      | **Filter (Conditional)** | Create a "Decode Node Count" slider/input that _only_ appears when `Optimizations = P/D Disaggregation` is selected.  |
| **Context Length** | `scenario.load.standardized.input_seq_len`    | **Yes**      | **Filter**               | Critical to keep next to P/D settings.                                                                                |
| **KV Cache Size**  | `metrics.service.kv_cache_size`               | **Yes**      | **Details / Tooltip**    | High-value metric for P/D tuning. Show in "Tale of the Tape" card.                                                    |

#### C. Parallelism & Hardware

_Schema Location_: `stack[].standardized.parallelism` & `accelerator`

| Configuration              | Schema Field (v0.2)               | Show in App? | UX Location             | Notes                                                    |
| :------------------------- | :-------------------------------- | :----------- | :---------------------- | :------------------------------------------------------- |
| **Tensor Parallel (TP)**   | `parallelism.tp`                  | **Yes**      | **Details / Tooltip**   | Critical for large model comparison.                     |
| **Pipeline Parallel (PP)** | `parallelism.pp`                  | **Yes**      | **Details / Tooltip**   | Critical for very large models impacting latency.        |
| **GPU Count**              | `accelerator.count` \* `replicas` | **Yes**      | **Filter (Total GPUs)** | "Total GPUs" is often a better filter than just "Nodes". |

### 2. Recommended UX Implementation

1.  **Optimization Mode Dropdown**:
    - _Options_: `Standard (Replica)`, `P/D Disaggregation`.
    - _Logic_: Filters based on whether the report contains `role="prefill"` components.

2.  **Conditional Inputs (Context-Aware)**:
    - _If P/D Disaggregation is selected_:
      - Show **"Prefill Nodes"** (Range Slider: 1-100)
      - Show **"Decode Nodes"** (Range Slider: 1-100)
    - _Else_:
      - Show **"Replicas"** (Range Slider).

3.  **Details View ("Stack Introspection")**:
    - Instead of cluttering the main filter with "Gateway" or "Scheduler" dropdowns, put these in the **Model Details Card** or a dedicated **"Stack Info"** tab in the benchmark details view.d serving stacks & components. Most of that information will be stored in the benchmark report JSON schema. I want to ensure that the app surfaces the appropriate information to the user without overwhelming them with noise.

Build a list of the possible configuration options available in the standard report format, assess if it should be showed in the app, and suggest where it could fit into the UX.
