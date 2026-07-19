# Spec: On-Demand Dynamic Dashboards in Prism

## 1. Executive Summary & Overview

Prism is a powerful comparison interface for distributed LLM inference performance, but adding new guides (e.g., Prefix Cache Offloading, PD Disagg) currently requires manual codebase changes, writing React components, creating custom backend endpoints, and deploying a new app version. 

To empower field engineers (such as Customer Engineers and Solutions Architects) to quickly share tailored benchmarks and customized visualizations with customers, we propose **On-Demand Dynamic Dashboards**. This feature allows authenticated users to:
1. Build a custom dashboard through a visual UI builder.
2. Select benchmark runs directly from the Results Store or paste custom JSON data.
3. Configure standard visual blocks (Markdown explanation, Bar Charts, Scatter Plots, Metrics Tables) matching Prism's aesthetics.
4. Publish and share the dashboard using a short, clean, namespaced URL: `https://prism.llm-d.ai/<github-username>/<dashboard-shortname>`.

All dashboards are publicly readable by default. Writing, updating, or deleting a dashboard configuration requires authentication via GitHub OAuth and is scoped to the owner's username namespace.

---

## 2. Business Impact & Success Metrics

### 2.1. Business Impact Metrics
*   **Time-to-Share Acceleration**: Reduces the time to build and publish a custom performance study from days (requiring a PR and deployment) to minutes.
*   **Customer Engagement & Adoption**: Enables CEs to deliver highly interactive, reproducible performance proofs directly to customers. Measured by counting active shared links and unique visitors.
*   **Content Volume**: Encourages crowdsourced guides and documentation from the broader `llm-d` developer community.

### 2.2. Functional Success Metrics
*   Users can log in, select datasets, arrange layout blocks, and save a dashboard in under 5 minutes.
*   Shared URLs are short, human-readable, and load in under 2 seconds.
*   Modification or deletion is securely restricted to the dashboard creator.

---

## 3. User Journeys & Stories (CUJs)

### CUJ 1: Create and Publish a Custom Dashboard
*   **User Role**: Customer Engineer
*   **Goal**: Create a custom dashboard showcasing TPU v6e performance benefits for Qwen2.5-72B vs. an A100 baseline to share with a customer.
*   **Steps**:
    1. Log in to Prism via GitHub.
    2. Click **Create Dashboard**.
    3. Add a **Markdown Block** for introduction and key takeaways.
    4. Click **Add Dataset** and search/select relevant run UUIDs from the Results Store (e.g., Qwen2.5-72B runs on TPU and A100).
    5. Add a **Bar Chart Block** to compare TTFT and throughput.
    6. Add a **Pareto Frontier Scatter Plot** to show cost vs. throughput.
    7. Enter metadata: Title ("Qwen2.5 TPU v6e Optimization Study"), Shortname (`qwen-tpu-eval`).
    8. Click **Publish**. The app displays the link: `https://prism.llm-d.ai/seanhorgan/qwen-tpu-eval`.

### CUJ 2: Share and Access a Namespaced URL
*   **User Role**: Customer / Stakeholder
*   **Goal**: View the evaluation results shared by the CE.
*   **Steps**:
    1. Click the link `https://prism.llm-d.ai/seanhorgan/qwen-tpu-eval` in an email or chat.
    2. The page loads the custom layout, displaying the interactive charts and tables using the selected datasets.
    3. The viewer does *not* need to log in to read the dashboard.
    4. The user can interact with the charts (tooltips, zoom) and inspect raw data.

### CUJ 3: Edit or Delete an Existing Dashboard
*   **User Role**: Dashboard Creator
*   **Goal**: Update the shared dashboard with fresh runs or delete it when it is no longer relevant.
*   **Steps**:
    1. Visit `https://prism.llm-d.ai/seanhorgan/qwen-tpu-eval` while logged in.
    2. Click **Edit Dashboard** (only visible to the author).
    3. Update the content/datasets and click **Save**.
    4. Or, click **Delete Dashboard** to remove the configuration from storage.

---

## 4. Technical & Functional Requirements

### 4.1. Routing & SPA Fallback

To support clean URLs like `https://prism.llm-d.ai/:username/:dashboardShortname`, the routing system must handle path parsing without colliding with standard app views.

#### 4.1.1. Path Resolution Strategy
The frontend application will parse the URL path (`window.location.pathname`).
*   **Static Views**: If the first segment matches a registered static view (e.g. `schema-explorer`, `workload-catalog`, `manage-benchmarks`), render that view.
*   **Dynamic Namespaces**: If the path matches `/:username/:shortname`, treat it as a request to load a dynamic dashboard.
    *   *Alternative (Recommended for collision safety)*: Use a `/u/` prefix: `/u/:username/:shortname`. This guarantees that future static routes (e.g., a new tab `/leaderboard`) never conflict with user namespaces (e.g., a user named `leaderboard`).
*   **SPA Support**: The Express server's catch-all route `app.get('*')` already serves `index.html`, allowing client-side resolution of these paths.

---

### 4.2. Storage & API Contract

Dashboard configurations are stored as JSON files in GCS under a scoped prefix:
`gs://<bucket_name>/dashboards/<github-username>/<shortname>.json`

#### 4.2.1. Dashboard Configuration Schema
A dashboard configuration defines the layout blocks, text, and datasets.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PrismDynamicDashboard",
  "type": "object",
  "properties": {
    "version": {
      "type": "string",
      "enum": ["1.0"]
    },
    "metadata": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "description": { "type": "string" },
        "author": { "type": "string" },
        "created_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" }
      },
      "required": ["title", "author"]
    },
    "datasets": {
      "type": "array",
      "description": "List of run IDs and data sources used in this dashboard",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "description": "Unique key to reference in charts" },
          "type": { "type": "string", "enum": ["run-id", "gcs-path", "raw-json"] },
          "source": { "type": "string", "description": "Run UUID or GCS path" }
        },
        "required": ["id", "type", "source"]
      }
    },
    "layout": {
      "type": "array",
      "description": "Ordered list of visual blocks rendering the dashboard",
      "items": {
        "type": "object",
        "properties": {
          "type": { "type": "string", "enum": ["markdown", "bar-chart", "scatter-plot", "table"] },
          "title": { "type": "string" },
          "description": { "type": "string" },
          "config": {
            "type": "object",
            "properties": {
              "dataset_id": { "type": "string" },
              "x_axis": { "type": "string" },
              "y_axis": { "type": "string" },
              "height": { "type": "integer", "default": 400 }
            }
          },
          "content": { "type": "string", "description": "Used by markdown type for content body" }
        },
        "required": ["type"]
      }
    }
  },
  "required": ["version", "metadata", "datasets", "layout"]
}
```

#### 4.2.2. API Endpoints

*   **`GET /api/dashboards/:username/:shortname`**
    *   **Public Access**: True
    *   **Description**: Resolves and returns the JSON configuration from GCS.
    *   **Error Responses**: `404 Not Found` if the configuration file doesn't exist.

*   **`POST /api/dashboards/:shortname`**
    *   **Public Access**: False (Requires GitHub OAuth via `X-Prism-Github-Token`)
    *   **Request Body**: The Dashboard Configuration JSON payload.
    *   **Description**: Validates the payload structure and writes it to `gs://<bucket>/dashboards/<username>/<shortname>.json`.
    *   **Rules**:
        *   `<username>` is extracted from the GitHub token.
        *   `<shortname>` must be alphanumeric, lowercase, and hyphenated (regex: `^[a-z0-9-]+$`).
        *   Overwrites existing dashboards if they belong to the authenticated user.

*   **`DELETE /api/dashboards/:shortname`**
    *   **Public Access**: False (Requires GitHub OAuth)
    *   **Description**: Deletes `gs://<bucket>/dashboards/<username>/<shortname>.json`.

---

### 4.3. UI Builder & Visual Blocks

To maintain design alignment with Prism, the UI builder will provide pre-approved components.

1.  **Markdown / Content Block**: Renders sanitized HTML from markdown text, enabling explanations, callouts, and narratives.
2.  **Bar Chart Block**: Displays side-by-side or stacked comparisons for metrics like throughput and TTFT across selected configurations.
3.  **Scatter Plot Block**: Reuses the core Prism chart engine to display multi-axis relationships (e.g. Latency vs. Throughput) with optional Pareto frontiers.
4.  **Comparison Table Block**: High-density grid rendering key statistics (e.g., TTFT P50/P90, TPOT, QPS) for all selected datasets.

---

## 5. Security & Access Control

*   **Namespace Scoping**: The GCS prefix `/dashboards/<username>/` serves as the authorization boundary. Users can only write/delete files under their own GitHub username prefix.
*   **Markdown Sanitization**: All user-supplied Markdown content must be sanitized on render in the frontend (e.g., using `dompurify` and `marked`) to prevent Cross-Site Scripting (XSS) vulnerabilities.
*   **Validation**: The API server will validate dashboard configs against the JSON Schema to prevent corrupted configurations from breaking the rendering engine.

---

## 6. Open Questions & Future Considerations

*   **Dynamic Data Updates**: If a dataset references a run ID, what happens if that run is retracted or deleted? Should the dashboard report an error, omit the run, or fall back gracefully?
*   **Collaborative Editing**: Should we allow multiple GitHub usernames to edit the same dashboard? (e.g., using GitHub teams or a shared namespace like `/org/llm-d/`).
*   **Custom CSS / Layout Innovation**: How much flexibility should we give CEs to customize colors or override default Tailwind styles? (Standardizing styling aligns with Prism principles, but too much rigidity may block innovation).
*   **Stateful Sharing within Custom Dashboards**: If a user filters a custom dashboard, should we persist those filter states in the URL (e.g. `https://prism.llm-d.ai/u/seanhorgan/qwen-tpu-eval?model=xyz`)?
