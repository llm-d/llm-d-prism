# Prism: Performance analysis for distributed inference systems

# Vision

Prism aims to optimize AI inference infrastructure by unifying benchmark data from disparate sources—cloud APIs, public repositories, and local experiments—into a single, high-performance comparison interface. Prism makes it easier to navigate the complex trade-offs between cost, latency, and throughput with confidence and precision.

# Principles

- **Build for scale:** Support thousands of benchmarks across hundreds of combinations of AI models, accelerators, model servers, and serving stacks.
- **Progressive analysis:** Default to throughput and latency while providing clear paths to complex dimensions (cost, P/D ratios, components).
- **Visually stunning and grounded in facts:** Technical expertise meets premium aesthetics. Every data point is traceable and verifiable.
- **Provenance is key:** Clear labeling of data sources (Public, Archive, API, Private) to build user trust and clarify data origin.
- **Actionable Communication:** Errors, loading states, and empty results provide clear pathways to resolution or configuration adjustments.

# Top Level UI

The Prism dashboard is built for technical experts, featuring a powerful charting engine and a collapsible, high-density filtering system.

## Data Connections

Prism uses a **Catalog-First Architecture** to manage data sources via a sleek slide-over UI that prioritizes active connections and streamlines discovery.

- **Integrations:**
  - **GIQ (API):** Google's GKE Inference Quickstart API. Supports performance and cost data with refined error handling, batching, and pagination for large project scans.
  - **LLM-D Results Store (Google Drive):** Access to official benchmark results stored in shared folders. Supports v0.1 and v0.2 schemas with automatic recursive indexing.

  - **Local Sample Data:** Embedded static datasets for immediate exploration, including recent Llama and Qwen models.
  - **LPG (Latency Profile Generator):** Direct parsing of Lohi pipeline logs and lifecycle metrics.
  - **AWS S3 Buckets:** Connect to public buckets (supported via direct access).

- **Custom Connections:**
  - **GCS Buckets:** Connect to any public or private bucket (supported via ADC or user tokens).
  - **AWS Buckets:** Support for public S3 buckets.
  - **Paste Results:** Immediate ingest of raw benchmark JSON for rapid, ephemeral validation without server-side storage.

## Unified Benchmark Filter

A collapsible, multi-column panel that updates dynamically based on indexed data:

- **Application:** Model Name (normalized for grouping), Precision (FP8, INT8), Serving Stack.
- **Hardware:** Machine Type, Accelerator (A100, H100, TPU v5e/v6e, TPU v7x), Accelerator Count.
- **Orchestration:** Serving Framework (vllm, sglang, llm-d), Components (Inference Gateway, Scheduler), and Optimizations.
- **P/D Disaggregation:** Detailed controls for Prefill/Decode split setups, including P:D Node Ratios (1P:1D, 2P:4D, etc.).
- **Load / Scenario:** Workload Type (Prefill/Decode Biased derived from ISL:OSL), Use Case (ShareGPT, Code Completion), and Sequence Length buckets.

## Comparison & Visualization

- **Charting Engine:**
  - **Modes:** Latency (E2E, TTFT, TPOT, NTPOT) vs Throughput (Output, Input, Total Tokens, QPS) or Cost.
  - **Normalization:** "Per Chip" toggle scales all throughput and QPS metrics by accelerator count for fair comparison across different hardware scales.
  - **Pareto Frontiers:** Dynamic efficiency lines highlight the "best in class" configurations for any given trade-off (e.g., Throughput vs. Cost).
  - **Annotations:** Automatic data point labeling (TP, Config) and line-end labels with collision detection.
  - **Visual Language:** Hardware-aware color bars (e.g., RTX PRO 6000) and dark/light mode support.
- **Integrated Summary Table:**
  - Placed directly within the filter panel for instant feedback on filter effectiveness.
  - Includes a "Detail Table" toggle for granular metrics (QPS, TTFT, NTPOT, TPOT, E2E) and run-specific metadata.
- **Data Inspector:** Deep-dive view of raw vs. normalized data for any selected benchmark, including direct source links for provenance.

# JTBD / Requirements

## Connect & Scale Data

- **Multi-Schema Support:** Native parsing for `llm-d-benchmark` reports (v0.1 & v0.2 schemas).
- **Automated Discovery:** Drive, GCS, and S3 sources index recursively to build a common dimensionality map across hundreds of files.
- **Persistence:** Data connection configs and UI preferences persist in local storage for a tailored work session.

## Analyze Efficiency

- **Advanced Cost Analysis:**
  - Supports Spot, On-Demand, CUD-1y, and CUD-3y models.
  - Prioritizes **Explicit API Cost** values from GIQ/LLM-D.
  - Falls back to **Derived Constant Product** calculations where explicit data is missing, marked with an "Estimated" indicator.
- **Architecture Validation:** Side-by-side comparison of Aggregated (Replica) vs. Disaggregated (P/D Split) architectures to identify performance gains vs operational complexity.

## Collaboration & Deployment

- **Stateful Sharing:** Unique URLs capture the _entire_ app state, including active filters, sources, chart modes, and zoom levels.
- **Zero-Config Deployment:** Streamlined `deploy.sh` process with support for `SITE_NAME` and `CONTACT_US_URL` variables.

# Data Parsers & Normalization

## Model & Hardware Normalization

- Prism automatically standardizes naming (e.g., `gpt-oss-120b-bf16` -> `gpt-oss-120b`) to group similar benchmarks while preserving precision metadata for filtering.
- Accelerator names and machine types are normalized to ensure consistent mapping across GIQ, LPG, S3, and LLM-D sources (e.g., grouping `nvidia-h100-80gb` and `H100`, or extracting `tpu7x` from `manifest.yaml`).
- **Source Standardization**: Benchmarks are tagged with human-readable IDs: `infperf` (formerly `inference-perf`), `Quality` (formerly `MQ`), and `llm-d` (formerly `DRIVE`).

## Latency Metrics

- Prism defaults to using explicit Latency and TTFT metrics (`(E2E - TTFT) / OSL`) for NTPOT when available, providing a more accurate representation of serving characteristics than simple throughput derivation.

# Authentication & Security

- **BFF Proxy**: A Node.js backend handles authentication, allowing Prism to reach Google APIs using either Application Default Credentials (ADC) for organization-wide shared sources or user-provided tokens for private data.
- **Privacy**: User-pasted results and private tokens are never stored server-side, ensuring data security for sensitive benchmarks.

# Directory Structure

The application is located at the repository root.

```
.
├── deploy.sh               # Deployment Script
├── server/
│   └── server.js           # Backend API & Static File Server (Express)
├── specs/                  # Specifications & Schemas
│   ├── PRD.md
│   ├── kv_cache_optimizations_prd.md
│   ├── quality-metrics-prd.md
│   └── disaggregated_benchmarks_prd.md
├── public/
│   └── data.json           # Local benchmark data sample
├── tools/                  # Utility Scripts
│   ├── patch_data.js
│   └── process-data.js
├── src/
│   ├── components/
│   │   ├── Dashboard/      # Modular Dashboard Components
│   │   ├── Dashboard.jsx   # Dashboard Orchestrator
│   │   ├── DataConnectionsPanel.jsx
│   │   └── DataInspector.jsx
│   ├── hooks/
│   │   ├── useAWS.js       # AWS S3 Hook
│   │   ├── useGCS.js       # Cloud Storage Hook
│   │   ├── useGIQ.js       # API Data Hook
│   │   └── useLLMD.js      # Benchmarking Hook
│   ├── utils/
│   │   ├── dashboardHelpers.js
│   │   ├── dataParser.js   # Data Normalization Logic
│   │   └── cacheManager.js # Client-side caching
│   ├── App.jsx             # React App Root
│   └── main.jsx            # Entry Point
└── package.json
```

# Ideas & Future Work

- **Optimization Insights:** Surfacing advanced tunables like KV Cache Size, Speculative Decoding tokens, and Chunked Prefill stats. For a detailed roadmap, see the [KV Cache Optimizations PRD](kv_cache_optimizations_prd.md).
- **Quality Benchmarking:** Integration of LMArena or similar for Quality (Z-axis) analysis vs Performance/Cost. For details, see the [Quality Metrics PRD](quality-metrics-prd.md).
- **Architecture Validation:** Comparison of Aggregated vs. Disaggregated architectures. For details, see the [Disaggregated Benchmarks PRD](disaggregated_benchmarks_prd.md).

# Open Questions

## Data Parsing

- **NTPOT Calculation Method:** Currently for data sources that don't provide a NTPOT (anything but GIQ), the app derives NTPOT (Time Per Output Token) from steady-state throughput (`(concurrency / throughput) * 1000`). Should we switch to using the explicit latency and TTFT metrics (`(Latency - TTFT) / OSL`) when available? The current method reflects inter-token latency per stream in a saturated system, while the alternative better captures the specific run's end-to-end latency characteristics.

## Quality Analysis

Prism integrates intelligence and reasoning metrics (MMLU, GSM8K, Arena Elo) to enable multi-dimensional comparisons beyond raw performance. For a detailed breakdown of quality metrics, data sources (Hugging Face, LMSYS), and planned UI components like the "Tale of the Tape" cards, refer to the [Quality Metrics PRD](quality-metrics-prd.md).

### Vision & Open Questions

- **Unified Intelligence**: Enable users to answer "What is the smartest model I can run under 20ms/token?" by mapping static quality profiles to dynamic performance benchmarks.
- **Integration Strategy**: Should quality data be treated as a separate data connection (e.g., "LMArena Leaderboard") that overlays with existing performance sources?
- **Visualization Trade-offs**:
  - Should we include quality as a physical axis in the primary chart (e.g., Z-axis or Bubble size)?
  - Or force everything through a "Quality Tab" where the x-axis is cost and the y-axis is intelligence?
- **Robust Mapping**: How do we handle the "Model Naming Problem" (e.g., mapping `gpt-oss-120b` in GIQ to `openai/gpt-oss-120b-instruct` on Hugging Face)?
