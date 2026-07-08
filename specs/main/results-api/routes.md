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
authorization code for a GitHub access token, and redirects back to the frontend
with the token stored in the URL hash fragment
(`#access_token=<token>&state=<state>`).

### `GET /api/auth/github/me`

Resolves the current session state.

- **Headers:** `X-Prism-Github-Token: <access_token>` (optional)

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
