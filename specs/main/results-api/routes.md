# Prism Cloud API Route Reference

This document catalogs all endpoints exposed by the Prism API backend.

---

## 1. Authentication & Session Endpoints

Prism utilizes GitHub OAuth for user authentication and role resolution. For a
detailed overview of the authorization architecture, token storage, and GCS user
allowlists, please refer to the dedicated
[Identity & Access Management (IAM) spec](iam.md).

### `GET /api/auth/github/login`

Redirects the client browser to the GitHub OAuth authorize endpoint to begin
authentication.

### `GET /api/auth/github/callback`

Handles redirect callback from GitHub OAuth, exchanges the temporary
authorization code for a GitHub access token (and optional refresh token), and
redirects back to the frontend with the tokens stored in the URL hash fragment
(`#access_token=<token>&refresh_token=<token>&expires_in=<seconds>&state=<state>`).

### `GET /api/auth/github/me`

Resolves the current session state.

- **Headers:** `X-Prism-Github-Token: <access_token>` (optional)
- **Response (200 OK):**
    - **Authenticated:**
        ```json
        {
          "authenticated": true,
          "configured": true,
          "username": "<username>",
          "permission": "admin" | "user" | "none",
          "avatarUrl": "<avatar_url>"
        }
        ```
    - **Unauthenticated:**
        ```json
        {
            "authenticated": false,
            "configured": true,
            "username": null,
            "permission": "none"
        }
        ```

### `POST /api/auth/github/refresh`

Exchanges a valid refresh token for a new set of GitHub access and refresh
tokens.

- **Request Body:** `{ "refresh_token": "<token>" }`
- **Response (200 OK):**
  `{ "access_token": "<token>", "expires_in": <seconds>, "refresh_token": "<token>", "refresh_token_expires_in": <seconds> }`

### `POST /api/auth/github/logout`

Performs client session cleanup (always returns successful).

---

## 2. Benchmark Results API

These endpoints facilitate listing and inspecting staged or submitted benchmark
run bundles. Detailed parameters, response formats, and authorization policies
are documented inline inside the implementation handler files.

### `GET /api/results`

Lists benchmark runs from the active Prism results store (defined in
`DEFAULT_BUCKETS`).

- **Headers:** `X-Prism-Github-Token: <access_token>` (optional)
- **Query Parameters:**
    - `limit`: (Optional) Maximum number of results to return (integer, defaults
      to 10, max 100).
    - `pageToken`: (Optional) Pagination token retrieved from the
      `nextPageToken` of a prior list response.
    - `status`: (Optional) Filter by submission status (`staged` |
      `submitted_pending_processing` | `submitted_pending_review` | `public` |
      `promoted` | `rejected`).
    - `own`: (Optional) Filter to retrieve only the logged-in user's submissions
      (`true` | `false`).
- **Authorization Rules:**
    - **Admin:** Can list all benchmarks in all statuses.
    - **Standard User/Guest:**
        - Can list their own benchmarks in any status.
        - Can only list approved (`public` or `promoted`) benchmarks of other
          users.
        - Pending or rejected benchmarks belonging to other users are filtered
          out.

### `POST /api/results`

Submits a benchmark result bundle to the active results store.

- **Headers:** `X-Prism-Github-Token: <access_token>` (required)
- **Request Body:** A JSON object representing the benchmark run upload payload
  matching the `PrismResultPayload` schema.
- **Authorization Rules:** Only allowlisted contributors (with role `user` or
  `admin`) can submit benchmark results.
- **Server-Side ID Mutation:** All internal IDs (including the top-level `runId`
  and nested entry `run_id`s) are regenerated on the server to prevent ID
  collisions. The metadata is also enriched with the author's username and
  submission timestamp.
- **Response (201 Created):**
    ```json
    {
        "success": true,
        "runId": "<server_generated_run_id>",
        "oldRunId": "<client_supplied_run_id>",
        "state": "submitted_pending_review",
        "message": "Benchmark result successfully submitted and promoted to review."
    }
    ```

### `GET /api/results/:runId`

Retrieves the complete payload of a single benchmark submission run bundle by
its UUID.

- **Headers:** `X-Prism-Github-Token: <access_token>` (optional)
- **Path Validation:** `runId` must be a valid UUID regex format or it returns
  `400 Bad Request` to prevent path traversal.
- **Authorization Rules:**
    - **Admin:** Full access to view any benchmark bundle.
    - **Standard User/Guest:**
        - Can view their own benchmark run bundle in any state.
        - Can view other contributors' bundles only if its state is `public` or
          `promoted`.
        - Returns `403 Forbidden` (or `404 Not Found`) if the user lacks
          permissions.

### `POST /api/results/:runId/status`

Updates the review status and/or registers admin feedback for a staged or
pending benchmark result submission.

- **Headers:** `X-Prism-Github-Token: <access_token>` (required)
- **Request Body:**
    ```json
    {
        "status": "<submission_state>",
        "feedback": "<optional_reason_string>",
        "reviewer": "<optional_username>"
    }
    ```
- **Authorization Rules:**
    - **Admin:** Full access. Can approve (`public` / `promoted`), reject
      (`rejected`), or reset state.
    - **Contributor (Owner):** Can only transition state to
      `submitted_pending_processing` or `submitted_pending_review` to promote or
      resubmit their own benchmark. Any attempt to set state to `public` or
      `rejected` returns `403 Forbidden`.
    - **Other users:** `403 Forbidden`.

---

## 3. General Proxy & Configuration Endpoints

### `GET /api/config`

Retrieves shared environment parameters.

### `ALL /api/giq/*`

Proxies requests to the Google Kubernetes Engine Recommender API (GIQ) at
`gkerecommender.googleapis.com`.

- **Authentication:** Injects the server's Application Default Credentials (ADC)
  token as the `Authorization: Bearer <token>` header if a valid bearer token is
  not provided by the client.
- **Headers:** `X-Goog-User-Project` (Optional, defaults to backend server
  project ID).

### `GET /api/regressions`

Retrieves a parsed list of regression reports from the public benchmark results
store.

- **Query Parameters:**
    - `refresh`: (Optional) Set to `true` to bypass the server's 5-minute memory
      cache and force GCS fetch.
- **Caching:** Responses are cached on the server for 5 minutes.

### `ALL /api/gcs/*`

Proxies requests to Google Cloud Storage for private buckets. Authenticates
using the server's Application Default Credentials (ADC).

---

## 4. Local Development Staging Endpoints

### `GET /api/local/list`

Lists locally staged benchmarks (Development Mode only).

### `GET /api/local/file/*`

Serves a local staged benchmark file from the private/benchmarks folder.
