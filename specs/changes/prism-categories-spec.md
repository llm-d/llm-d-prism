# Spec: Prism Benchmark Categorization & Context-First Querying

- **Status**: Draft
- **Author**: diamondburned, Jetski
- **Date**: July 20, 2026

## Objective

This proposal introduces a benchmark categorization and querying system for the Prism Results Store. Currently, users upload benchmarks without categorization, and the Results Store page offers only low-level filtering on all loaded benchmarks. Additionally, existing and future custom dashboards cannot leverage these Results Store benchmarks because they expect specific Google Cloud Storage (GCS) directories.

The goals of this feature are:
1.  Enable Prism admins to define and manage a golden list of categories in a configuration file (`prism-categories.json`) on GCS.
2.  Allow users to classify staged or submitted benchmarks under a single category chosen from this golden list.
3.  Implement server-side search querying by category, model name, and hardware name to let custom dashboards fetch specific subsets of Results Store benchmarks.
4.  Expose category, model name, and hardware name options in an autocompleting, category-first search bar on the Results Store page.

Non-goals:
- Supporting multiple tags per benchmark, due to GCS metadata filtering limitations.
- Automatically inferring categories from benchmark report content.

## Background

The Results Store backend currently utilizes GCS to store run results as individual JSON objects (`prism-results-store/<benchmarkID>.v1.json`). GCS custom object metadata contexts are used to filter and list results (e.g. by `submission_state` or `github_user`) without downloading full payloads. 

However, GCS does not support combining multiple query conditions with logical operators (`AND` or `OR`). This complicates server-side querying when combining status filters (like `submission_state="public"`) with specific model or hardware filters. To resolve this, this design outlines a selective search-routing strategy.

For related details, see the canonical [Prism Results Store Specification](file:///usr/local/google/home/diamondburned/Projects/llm-d/llm-d-prism/specs/main/results-api/README.md) and the [Identity & Access Management Specification](file:///usr/local/google/home/diamondburned/Projects/llm-d/llm-d-prism/specs/main/results-api/iam.md).

## Requirements and Scale

- **GCS Constraints**: Custom metadata context fields are restricted to 50 keys. To enable GCS-side filtering, categories must be stored in the GCS metadata context.
- **Single-tag limitation**: GCS's single-filter list limitation restricts us to filtering by at most one metadata context at a time on the storage side. Therefore, each benchmark run will support at most one category (a "1-tag constraint") to ensure queries are fast.
- **Latency**: Searching and retrieval of filtered results must respond within 2 seconds.
- **Scale**: The staging and production buckets are expected to scale to thousands of run payloads. The golden categories configuration file will contain a relatively small list (typically under 50 categories).

## Design Ideas

### 1. Categories Master List Storage & API
The golden list of categories is defined as a JSON array of category configurations:
```json
[
  {
    "name": "pd-disaggregation",
    "description": "Prefill/Decode disaggregated serving configurations"
  }
]
```
This is stored at `gs://<bucket_name>/prism-categories.json` for all buckets in `DEFAULT_BUCKETS`. 

We will expose the following endpoints:
-   `GET /api/categories`: Fetches `prism-categories.json` from all buckets, merges the arrays by unique `name`, and caches the result for 5 minutes in memory.
-   `PUT /api/categories` (Admin only): Accepts a JSON list of categories, updates `DEFAULT_BUCKETS[0]/prism-categories.json`, and invalidates the cache.

### 2. Search Suggestion Registry
-   `GET /api/search/options`: Returns suggestions for categories (from the golden list), model names, and hardware names.
-   **Background Ingestion on Boot**: To minimize latency, the server will trigger a background task to harvest and index model and hardware names from GCS object metadata contexts immediately upon server start.
-   **Caching and Invalidation**: The search options cache is maintained in memory.
    -   While the background indexing runs (either on initial startup or during re-population), the `GET /api/search/options` endpoint will return empty lists `[]` for `modelNames` and `hardwareNames` instead of blocking requests or downloading synchronously.
    -   The cache is invalidated and a background re-population task is kicked off whenever a benchmark's submission status changes (e.g. approved to `public` or `promoted`), or when a benchmark result is modified or deleted.

### 3. Server-Side Context Filtering
We extend `GET /api/results` (in [list.ts](file:///usr/local/google/home/diamondburned/Projects/llm-d/llm-d-prism/server/results/routes/list.ts)) to accept query parameters: `category`, `model_name`, and `hardware_name`.

Because GCS does not support compound `AND` filters, the query-handling and listing optimization is designed as follows:

1.  **Validation Rule**: The client may specify at most **one** of `category`, `model_name`, or `hardware_name` as a search filter. If more than one is provided in the request query parameters, the server immediately returns `400 Bad Request`.
2.  **Filter Selection Priority**: GCS object listing supports at most one filter. The backend resolves the primary GCS query filter parameter (`filter`) using the following priority:
    -   **Priority 1 (Search-First)**: If one of the search parameters (`category`, `model_name`, or `hardware_name`) is specified, it is used as the GCS context filter (e.g. `contexts."category"="${encodeContextValue(category)}"`). This ensures optimal performance when searching.
    -   **Priority 2 (Ownership/Status Fallback)**: If no search parameters are specified, the server defaults to GCS-side filtering for ownership (`contexts."github_user"="${username}"` if `own=true` is requested) or submission status (`contexts."submission_state"="${statusFilter}"` if status is specified). This maintains performance on fresh loads and general navigation listing.
    -   **Priority 3 (None)**: If no query filters are requested, GCS lists all results under the `prism-results-store/` prefix with no filters.
3.  **In-Memory Fallback Evaluation**: Any remaining parameters that were not selected for GCS-side filtering (e.g., matching the `status` or `own` checks when a `category` search filter was active) are evaluated in memory on the server. The resulting list is filtered before pagination bounds are applied.

### 4. Schema & Ingestion Validation Updates
-   **Schema Extensions**: We update `PrismResultPayloadSchema` and `PrismResultContextSchema` in [api.ts](file:///usr/local/google/home/diamondburned/Projects/llm-d/llm-d-prism/server/results/api.ts) to include the optional `category` field. [gcs.ts](file:///usr/local/google/home/diamondburned/Projects/llm-d/llm-d-prism/server/results/gcs.ts) is modified to serialize the category as a base64url-encoded context metadata key.
-   **Server-Side Ingestion Validation**: During benchmark submission (`POST /api/results`), the server will validate the submitted category against the cached category list. If the submitted category is not empty and does not exist in `prism-categories.json`, the server rejects the submission and returns `400 Bad Request`.

### 5. Frontend & UI Integration

-   **Metadata Editing Wizard**: In [SubmitValidationPage.jsx](file:///usr/local/google/home/diamondburned/Projects/llm-d/llm-d-prism/src/components/DataConnections/SubmitValidationPage.jsx), we add a "Category" row.
    -   If unassigned, the field shows a yellow highlight warning.
    -   Clicking the field opens an autocomplete popover populated from `GET /api/categories`. Users must pick an option from the list or leave it blank.
-   **Results Store Search Bar**: The search bar in [FilterPanel.jsx](file:///usr/local/google/home/diamondburned/Projects/llm-d/llm-d-prism/src/components/ManageBenchmarks/FilterPanel.jsx) is converted into a category-first lookup. Focused input shows categories, models, and hardware pills. Selection changes the search query to `category:pd-disaggregation` or `model_name:gemma-4-31b-it`, which fetches matching data from `/api/results`.
-   **Reviewer workflow**: A category badge is shown next to benchmark titles in [UnifiedDataTable.jsx](file:///usr/local/google/home/diamondburned/Projects/llm-d/llm-d-prism/src/components/ManageBenchmarks/UnifiedDataTable.jsx). Reviewers can see the category assigned to the benchmarks, but they cannot edit or override it; they can only approve or reject the benchmark run as a whole. The contributor must edit and verify the category on their end prior to staging/submitting.

## Alternatives Considered

### Arbitrary Tagging System
-   **Implementation**: Let users tag benchmark runs with arbitrary tag strings.
-   **Issues**: GCS's listing API does not support querying objects matching multiple custom metadata values efficiently (requires downloading or sequentially scanning files). Limiting runs to a single category allows us to leverage GCS's native metadata filter (`filter = contexts."category"="..."`) for instant results. A multi-tagging system will be re-evaluated when a structured database backend (such as BigQuery or Spanner) is implemented.
