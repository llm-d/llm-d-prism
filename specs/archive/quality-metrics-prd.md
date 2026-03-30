# PRD: Model Quality & Intelligence Support

**Status**: Draft
**Author**: Agent

## 1. Executive Summary

Prism currently excels at visualizing **Performance** (Throughput, Latency) and **Price**. To truly help users select the best model for their needs, we must integrate **Intelligence/Quality** metrics. This will enable users to answer questions like:

- _"What is the smartest model I can run under 20ms/token?"_
- _"Does the 2x cost increase for Model A yield a proportional increase in reasoning capability?"_

## 2. Key Metrics

We will focus on four primary metrics that cover General Intelligence, Reasoning, Instruction Following, and Human Preference.

| Metric             | Full Name                                | Domain            | Significance                                                                       |
| :----------------- | :--------------------------------------- | :---------------- | :--------------------------------------------------------------------------------- |
| **MMLU-Pro**       | Massive Multitask Language Understanding | General Knowledge | Standard proxy for "general intelligence" across 57 subjects.                      |
| **IFEval**         | Instruction-Following Evaluation         | Adherence         | Measures reliability in following strict formatting rules (crucial for agents).    |
| **Arena Elo**      | Chatbot Arena Elo                        | Human Preference  | Gold standard for "how good this feels to use" in chat.                            |
| **Terminal-Bench** | Terminal Bench 2.0                       | Agentic Coding    | Measures agent performance in realistic terminal environments (coding, debugging). |

## 3. Data Integration Strategy

### 3.1. Data Sources

1.  **Simple Benchmark Viewer**
    - **Source**: `gustheman.github.io/Simple-Benchmark-Viewer`
    - **Method**: Scrape the site for the latest data.
    - **Metrics**: MMLU-Pro, LiveCodeBench

2.  **Arena.ai Score**
    - **Source**: `https://arena.ai/leaderboard/`
    - **Method**: Scrape the site for the latest data by modality,
    - **Metrics**: Score (text), Score (code)
    - **Source Tag**: `Quality`

3.  **Terminal Bench (tbench.ai)**
    - **Source**: `tbench.ai/leaderboard/terminal-bench/2.0`
    - **Method**: HTML Scraping (No public API/JSON found).
    - **Metrics**: Rank, Accuracy

### 3.2. Data Connection Updates

- **New "Integration" Type**: `Quality Scores`
  - **Description**: "Fetch latest quality scores from open quality leaderboards."
  - **Configuration**: None required (public data).
  - **Refresh Strategy**: Periodic fetch (e.g., on app load or daily cache).

## 4. User Experience (UX)

### 4.1. Benchmark Filter Panel

The goal is to enable users to find models that meet a minimum intelligence threshold _before_ they select them.

- **Enhanced Model Selector**:
  - Display quality badges (e.g., "MMLU: 82") next to model names in the `Application` filter dropdown.
  - Allow sorting the Model Filter list by "Smartest" or "Newest".
- **Quality Sliders**:
  - Add global "Minimum Quality" sliders (e.g., "Exclude models with MMLU < 70") to the top of the filter panel.

### 4.2 Chart visualization

### 4.3. Model Details Card ("Tale of the Tape")

Since quality metrics are constant per model, they should be displayed once per model, not per benchmark run.

- **Model Comparison Cards**:
  - Add a row of summary cards above the charts for each _selected_ model.
  - **Visual**: A sleek, card-based layout (inspired by sports "tale of the tape" or RPG character stats).
  - **Content**:
    - **Header**: Model Name (e.g., `Llama-3-70b`) + Link to Hugging Face Model Page (Icon).
    - **Quality Stats**: Big, bold numbers for MMLU, GSM8K, Arena Elo.
    - **Performance Snapshot**: Avg. Throughput & Cost from the _currently selected_ benchmarks for this model.
  - **Interaction**: Clicking a card could highlight that model's points in the charts below.

## 5. InferenceArena: The Benchmark Leaderboard

Inspired by "Arena" evaluations (like Vending Bench Arena), we will introduce a **Leaderboard View** to gamify and simplify optimization discovery.

- **Concept**: Instead of just raw data, present "Champions" for specific "Events".
- **Events (Categories)**:
  - 🏆 **Speed Demon**: Lowest P95 TTFT.
  - 🧠 **Smartest in Class**: Highest MMLU for models < 20GB vRAM.
  - 💰 **Thrift Shop**: Best MMLU per Dollar.
  - 🏎️ **Throughput King**: Highest Output Tokens/Sec.
- **Leaderboard UI**:
  - A ranked list for each category, showing the _winning configuration_ (Model + Hardware + Serving Stack).
  - Users can click a winner to "Load Config" into the main chart view.

## 6. The Unifying Framework: "Inference Efficiency Index"

To move beyond simple X/Y charts, we introduce a composite **Inference Efficiency Index (IEI)**.

- **Metric**: `IEI = (Quality_Score * Throughput) / Cost`
  - _Quality_Score_: Normalized (0-1) score like MMLU/100.
  - _Throughput_: Normalized value.
  - _Cost_: Normalized price.
- **Visualization**:
  - **Radar Charts**: Plot models on 3-5 axes (Speed, Smarts, Cost, Context, Cache Hit Rate) to show the "shape" of the model's performance.
  - **3D Scatter Plot (Experimental)**: X=Cost, Y=Throughput, Z=Quality.

## 7. Technical Implementation Plan

1.  **Quality Parser**: Create `src/utils/qualityParser.js` to normalize data from HF/LMSYS into a common `QualityProfile` format.
2.  **Mapping**: Implement fuzzy matching to link Quality data (which uses model names like `meta-llama/Llama-2-70b-hf`) to Performance data (which might use `llama-2-70b` or `gemma-2-9b-it`).
3.  **State**: Add `qualityMetrics` to the Redux/Global state.
4.  **Components**:
    - `ModelComparisonCard.jsx`: New component for the "Tale of the Tape".
    - `LeaderboardView.jsx`: New view for the Arena/Champions.

## 8. Open Questions

- **Matching**: How do we robustly map model names across different data sources? (Likely need a normalization dictionary).
- **Versioning**: How do we handle different versions of the same model (e.g., `v0.1` vs `v1.0`) in quality scores?
