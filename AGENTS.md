# Agent Reference & Dev Notes

This file serves as a reference for agents and developers working on the `llm-d-prism` codebase.

## Dataset & Reference Paths

- **inference-perf outputs:** Reference runs/logs can be found in:
  `../../kubernetes-sigs/inference-perf/reports-*`
- **llm-d-benchmark results:** Benchmark result references are located at:
  `devutils/llm-d-benchmark-results`

## Current Capabilities & Roadmap (Updated for PR #58)

- **Completed in PR #58:**
  - **Parser (`src/utils/benchmarkReportV02Parser.js`):** A native, robust YAML parser for the `llm-d-benchmark` Benchmark Report v0.2 schema. It supports all five major harnesses (`inference-perf`, `guidellm`, `vllm-benchmark`, `inferencemax`, `nop`).
  - **Enhanced BRV0.2 Parser and Deduplicator:** Upgraded run ID derivation with a file/scenario-descriptor prefix, modernized common prefix/suffix stripping, and added auto-suffixing to resolve naming collisions dynamically for duplicate run labels.
  - **Comparison UI (`src/components/BenchmarkComparisonDashboard.jsx`):** A rich comparison dashboard featuring grouped bar charts for request performance and observability metrics, baseline toggling (★), and side-by-side metric tables with % diff comparison badges.
  - **Control Panel (`src/components/DataConnections/BenchmarkReportPanel.jsx`):** A dedicated connection panel supporting drag-and-drop for `.yaml` files, inline renaming with collision safety, and stage selectors.
  - **Scatter Plot Integration:** Ingested v0.2 runs are automatically mapped (`stageToEntry`) and displayed in the main scatter chart under the `brv02:<run-uid>` tag.

- **Completed in PR #64 (Recursive Folder Ingestion & Persistence):**
  - **Recursive Folder Batch Ingestion:** Enabled dragging-and-dropping entire directories or selecting folders via a directory picker, recursively scanning subdirectories to batch-ingest benchmark files.
  - **Collision-Resistant Unique Labeling:** Added deduplication logic that appends counter suffixes (e.g. `(1)`) to avoid name clashes upon folder upload.
  - **Enhanced Local Storage State Persistence:** Expanded state persistence to cover `showSelectedOnly`, selected benchmarks, active search filters, and baseline benchmark selections, so user states are fully preserved on tab closure or reloads.
  - **Bulk Run Management:** Integrated checkbox selection for uploaded runs, featuring fast "Select All", "Invert Selection", and "Delete Selected" bulk management controls.
  - **Visual Processing Feedback:** Added a loading spinner during directory crawling and parser execution.
  - **Corrected Switch UI State:** Refactored sidebar drawer toggles so their visual ON/OFF states and transition knobs accurately align with the actual data/connection state.

- **Completed (Benchmark Selection Decoupling & Sidebar Navigation Restructure):**
  - **Manage Benchmarks Page (`src/components/ManageBenchmarks.jsx`):** Decoupled the benchmark browser filter controls and selection list into a separate, dedicated "Manage Benchmarks" page. Integrated GCS/AWS/GIQ connection configuration directly on this management page.
  - **Shared App-Wide Selection States (`src/App.jsx`):** Lifted `dashboardState` and `dashboardData` hooks up to the main application context, allowing selections made in the management page to seamlessly carry over to the old results page.
  - **Component Isolation for Layouts:** Duplicated and isolated the `FilterPanel` and `UnifiedDataTable` components into `src/components/Dashboard/` (retaining the classic table layout) and `src/components/ManageBenchmarks/` (using the new expanded card layout), allowing both views to coexist with their respective designs.
  - **Classic Flat Dashboard Layout (`src/components/Dashboard.jsx`):** Restored the primary dashboard to its original `main` branch state, ensuring the classic flat layout, side-by-side spec comparison table, and performance metric scatter plots remain intact. Replaced the "Connections" button with a "Manage" button that links to the new management page.
  - **Enhanced Navigation Sidebar (`src/components/LeftNavigation.jsx`):** Created a new `"Management"` sidebar section to offer a direct path to the new `"Manage Benchmarks"` view.
  - **Omitted Share Functionality:** Removed the "Share view" button from the management view to keep its interface focused strictly on data selection and ingestion.

- **Completed (Manage Benchmarks Quality of Life Enhancements):**
  - **Inline Run Management:** Moved the Delete, Baseline (★), and Rename (pencil) controls for BRV2.0 uploaded runs out of the Connections sidebar directly into the benchmark rows within `UnifiedDataTable.jsx`.
  - **Bulk Delete for Selected Local Runs:** Added a "Delete Selected" button that appears when benchmarks are selected. If any non-local (read-only) benchmark is selected, the button is greyed out with a custom stylish tooltip stating "Non-local data sources are read-only." on hover. If only local runs are selected, clicking it deletes them all simultaneously and clears the active selection.
  - **Drag-to-Select Capabilities:** Replaced basic checkbox clicks with OS-native style "rubber-banding". Users can click and hold a row's checkbox, then drag their mouse to quickly select or deselect multiple contiguous benchmarks. Fully supports viewport scrolling by dynamically re-computing bounding boxes and updating active selections during active scroll events.
  - **Simplified Upload Interface:** Stripped the list of uploaded runs from `BenchmarkReportPanel.jsx`, reducing it to exclusively act as a clean file/folder dropzone.
  - **Integration Source Type Categorization:** Added structured source classifications (`Local`, `Cloud`, `Built-in`) with matching colored status pills (amber for Local, cyan for Cloud, and emerald for Built-in) across the Connections panel to give clear visual distinction to different benchmark origins.
  - **UI/UX Polish:** Transformed the "Manage Benchmarks" sidebar navigation icon to a more descriptive `Database` icon, removed redundant filter buttons in the classic dashboard, and preserved model row expansion states within the benchmarks table.

- **Completed (Run Grouping & UUID Formatting for Uploaded Reports):**
  - **Accurate UUID Rendering:** Fixed `stageToEntry` in `benchmarkReportV02Parser.js` to properly pass `run_id` to the base `createEntry` schema. Previously, uploaded runs displayed internal sequential integer IDs (e.g. `270`) instead of their actual UUIDs within the Manage Benchmarks dashboard.
  - **Directory-Based Run Identification:** Rewrote `deriveRunId` and `deriveRunLabel` to directly consume parent directory names when files are uploaded as folders (e.g. producing `llm-d-benchmark-results/h100_with_igw` as the origin label).
  - **Stable Stage Grouping:** Eliminated the buggy automatic suffixing `(1)`, `(2)` logic which was falsely fracturing single runs into multiple isolated run folders. By using the directory as the strict grouping mechanism (`runId`), all stages parsed from a single folder now accurately group under one combined label.

## Development Instructions

- Use `nix shell nixpkgs#nodejs -c npm run lint` to lint this project. Only care about lint messages specific to your modifications. DO NOT FIX PREVIOUS LINT ISSUES.
- Use the `gbrowser` skill to automate testing of a webpage.
- The development servers are managed via `docker compose`. Assume that the `docker compose` stack is always running; if it is not, error out and inform the user immediately. Use `docker compose logs` to retrieve server logs.
