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

### `POST /api/results`

Submits a benchmark result bundle to the active results store.

### `GET /api/results/:runId`

Retrieves the complete payload of a single benchmark submission run bundle by
its UUID.

### `POST /api/results/:runId/status`

Updates the review status and/or registers admin feedback for a staged or
pending benchmark result submission.

- **Headers:** `X-Prism-Github-Token: <access_token>` (required)
- **Request Body:**
  `{ "status": "<submission_state>", "feedback": "<optional_reason_string>", "reviewer": "<optional_username>" }`
- **Authorization Rules:**
    - **Admin:** Full access to change state to any status level (e.g. `public`,
      `rejected`, `submitted_pending_review`, etc.).
    - **Contributor (Owner):** Can only change state to
      `submitted_pending_processing` or `submitted_pending_review` to promote or
      resubmit their own benchmark.

---

## 3. General Proxy & Configuration Endpoints

### `GET /api/config`

Retrieves shared environment parameters.

### `ALL /api/gcs/*`

Proxies requests to Google Cloud Storage for private buckets. Authenticates
using the server's Application Default Credentials (ADC).

---

## 4. Local Development Staging Endpoints

### `GET /api/local/list`

Lists locally staged benchmarks (Development Mode only).

### `GET /api/local/file/*`

Serves a local staged benchmark file from the private/benchmarks folder.
