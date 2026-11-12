# Spec: S3-Compatible Results Store Backend

- **Status**: Implemented
- **Issue**: llm-d/llm-d-prism#193
- **Date**: November 8, 2026

---

## 1. Objective

Let the writable Prism Results Store (submit, review, promote, withdraw/delete, export, and the
`prism-results` CLI) run on any S3-compatible object store (AWS S3, IBM Cloud Object Storage,
MinIO, Ceph), not only Google Cloud Storage.

### Goals

1. **Two storage backends behind the existing API.** All Results Store persistence still goes
   through `server/results/gcs.ts`'s five functions; they dispatch to a new S3 store when it is
   selected, and otherwise run the current GCS code unchanged (same behavior and object layout).
2. **Config-selected backend.** `RESULTS_STORE_BACKEND=gcs|s3` (default `gcs`). Existing
   deployments, including prism.llm-d.ai, need no config change and see no behavior change.
3. **Same authorization.** GitHub login with the same allowlist files, read from the active
   backend's bucket, so GitHub-login mode works on S3 deployments. Playground mode is unchanged.
4. **Dashboard parity.** Published runs in an S3 Results Store appear in the dashboard, with the
   same visibility rules as the Results Store API (approved runs; plus own runs for the signed-in
   owner; all non-unlisted runs for admins). Unlisted runs arrive through share links and
   submissions hydration, as on GCS.

### Non-goals

- Changing the GCS object layout, contexts, or the prism.llm-d.ai deployment.
- Changing the GitHub OAuth flow, the `llm-d` org-membership check, or the permission model.
  (The existing rules — e.g. unlisted runs being readable by direct link — apply unchanged to S3.)
- Moving the hard-coded GCS dashboards (`/api/prefix-cache`, `/api/pd-disaggregation`,
  `/api/regressions`) or the GIQ proxy off GCS.
- Fixing the read-modify-write races in review/promote/delete. They exist on GCS today and are
  inherited unchanged (see §6).

---

## 2. Current state (GCS)

Persistence lives in `server/results/gcs.ts`: `listResults`, `readResultPayload`,
`readResultMetadata`, `writeResult`, `deleteResult`. Routes and `processing.ts` import these.

- **State and ownership** live in GCS object contexts (`metadata.contexts.custom`):
  `submission_state`, `github_user`, `run_id`, `model_name`, `hardware_name`, `run_label`,
  `accelerator_count`, `feedback`, `requested_reviewers`, `well_lit_path`, `forked`,
  `experiment_id`, `experiment_label`, `baseline_run_id`, `playground_submitted`.
- **Listing** reads contexts only (no payload download) and pushes one filter to GCS.
- **Key:** `<prefix><runId>.v1.json`, prefix default `prism-results-store/`.
- **Allowlists:** `server/iam.ts` fetches `prism-iam/github-{admin,user}-allowlist.txt` from the
  Results Store GCS bucket.
- **Dashboard:** approved runs reach the dashboard because the GCS bucket is in `DEFAULT_BUCKETS`
  and the `/api/gcs` proxy filters list results by context (approved, or owned by the caller;
  admins see all). Share links (`?share=<runId>`) load runs through `GET /api/results/:runId`.

---

## 3. Design

### 3.1 Dispatch

The S3 store (`server/results/store/s3.ts`, class `S3ResultsStore`) implements the same operations
as `gcs.ts`: `readPayload`, `readMetadata`, `write`, `delete`, `list`, plus `readIamFile` for the
allowlists. There is no separate interface type; `gcs.ts` is the single entry point.

- `gcs.ts` keeps every current export, implementation, and the `storage` singleton, so tests that
  spy on `storage.bucket` or `vi.mock('../gcs.ts')` keep working. Its five functions now check
  the active backend first: when `RESULTS_STORE_BACKEND=s3` they delegate to the S3 store; when
  `gcs` they run the existing code unchanged. Routes and `processing.ts` keep importing
  `../gcs.ts`. This keeps the diff on the GCS path to a dispatch line per function.
- Visibility filtering (`buildListFilters`) is extracted from `listResults` into
  `server/results/listFilters.ts` and used by both backends, so they apply identical rules.

### 3.2 S3 store (`server/results/store/s3.ts`)

**Config.** `RESULTS_STORE_BACKEND=s3` plus `RESULTS_STORE_BUCKET` (`bucket` or `bucket/prefix`,
parsed as on GCS; default prefix `prism-results-store/`). Unlike GCS there is no fallback to
`DEFAULT_BUCKETS` or a default bucket name. Optional `RESULTS_STORE_S3_ENDPOINT` (omit for AWS),
`RESULTS_STORE_S3_REGION` (default `us-east-1`) and `RESULTS_STORE_S3_FORCE_PATH_STYLE=true`.
Credentials come from the AWS SDK's default chain (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`,
a shared profile, or an instance/pod role), so Prism handles no secrets of its own.

**Object metadata — authorization and listing fields only.** S3 limits user metadata to 2 KB and
to ASCII header values, so S3 stores only short, bounded fields as `x-amz-meta-*`:

| Key | Value |
|---|---|
| `prism-rev` | revision id, a new UUID on every write |
| `prism-state` | `submission_state` (enum) |
| `prism-user` | `encodeMeta(github_user)` (≤ 100 chars) |
| `prism-submitted-at` | `encodeMeta(ISO timestamp)`, preserved across state changes |
| `prism-experiment-id` | `encodeMeta(experiment_id)` (≤ 128 chars, the schema limit) |

- `encodeMeta` = `'e' + base64url(utf8)`, so every free-text value is ASCII and header-safe
  regardless of input. Over-cap values are refused before the write with HTTP 400. The caps keep
  the total under 2 KB even if every character takes 4 bytes in UTF-8.
- Keys use `-` only and are lowercase; reads lowercase the returned keys (providers differ).
- **Descriptive list fields** (`run_label`, `model_name`, `hardware_name`, `accelerator_count`,
  `feedback`, `requested_reviewers`, `well_lit_path`, `experiment_label`, `baseline_run_id`,
  `forked`) come
  from the payload, never metadata: they are unbounded in the schema and must not be truncated.

**Listing.** S3 cannot list with metadata, so each list:

1. `ListObjectsV2` over the prefix (keys that are not `<UUID>.v1.json` are ignored);
2. `HeadObject` per run (bounded concurrency), so visibility is decided from metadata, never from
   the payload (this scan is reused for 5 s, see below);
3. filters and sorts (newest `prism-submitted-at` first, runId tie-break), takes the page;
4. for each run on the page, reads descriptive fields from a cache keyed by `prism-rev`, or from a
   `GetObject` whose own `prism-rev` must equal the one just authorized. If the run changed in
   between, it is re-checked (bounded retries) and dropped if no longer visible, so a list never
   pairs one version's state with another version's content.

A scan (LIST + a HEAD per run) in progress is shared by concurrent callers, and a finished scan
is reused for 5 s, so paging through N runs costs one scan rather than one per page. Local writes
and deletes invalidate it immediately. A change made by another process (e.g. another replica)
shows up in listings once a scan that started after it finishes: within 5 s plus one scan's
duration. Until then a listing on this process may still include a run that was just withdrawn
or rejected there. Per-run routes (get, review, export, ...) always read
fresh metadata. An object whose payload
cannot be parsed is skipped (and logged) rather than failing the listing.

ETag and LastModified are not used for objects Prism wrote: rewriting identical JSON keeps the
ETag, and LastModified has one-second resolution. Objects without `prism-rev` (written by other
tools) fall back to ETag+LastModified as their revision. Pagination tokens are opaque keyset
cursors (sort key of the last run returned), and a page is refilled from later candidates when a
run vanishes mid-request, so concurrent writes never make paging skip or repeat runs.

**Objects without Prism metadata** read as `submitted_pending_processing` owned by `''` —
invisible to non-admins, as on GCS.

**Network timeouts.** The S3 client uses a 5 s connect timeout and a 30 s idle-socket timeout, and
response bodies are read with a 60 s deadline (the SDK's socket timeout stops applying once
headers arrive). A dead endpoint address fails within about 15 s (3 attempts) instead of hanging.

### 3.3 Allowlists (`server/iam.ts`)

`fetchAllowlist(name)` reads `prism-iam/<name>` from the active backend: on GCS the existing ADC
fetch, unchanged; on S3 `readIamFile()` from the store's bucket (the same key, at the bucket
root). Parsing (trim, drop blanks and `#` comments, lowercase) is shared. Missing file → empty
list; fetch error → throw (callers already fail closed to `none` for the allowlist role; the
independent `llm-d` org-membership role is unchanged).

`tools/prism-iam`, the existing allowlist CLI, accepts `s3://<bucket>` in place of
`production`/`staging` and then uses the `aws` CLI with `RESULTS_STORE_S3_ENDPOINT` /
`RESULTS_STORE_S3_REGION` and AWS credentials. Its GCS behavior is unchanged.

### 3.4 Dashboard and config

- `/api/config` adds `resultsStoreBackend`. On `s3`, `resultsStoreBucket/Prefix/Path` are `null`
  (they describe the GCS store, and the S3 location is not published), `RESULTS_STORE_BUCKET` is
  not added to the GCS bucket list (explicit `DEFAULT_BUCKETS` entries still are), and the
  `/api/gcs` proxy does not treat it as a GCS bucket either.
- `GET /api/results/:runId` adds `submission_state` (from storage metadata) to the payload it
  returns, on both backends. On GCS too, share-linked runs now show their real state (e.g.
  unlisted or pending) instead of an assumed `public`.
- New frontend loader `loadResultsStoreRuns()` in `src/utils/resultsStoreLoader.js` (used only when
  `resultsStoreBackend === 's3'`):
  - Pages `GET /api/results?limit=100` until `nextPageToken` is null. The server applies the
    usual visibility (approved for everyone; own runs for the signed-in owner; all for admins;
    unlisted excluded unless requested). It also pages `?status=unlisted` (as submissions
    hydration does on GCS), so a withdrawn run stays loaded whoever withdrew it: the owner, an
    admin, or anyone in playground mode. As on GCS, admins and owners also see non-public runs
    (that is the review surface). It stops after 100 pages per listing and then warns the user.
  - Fetches each run with `GET /api/results/:runId` (bounded concurrency 6). Runs anyone may open
    (public, promoted, unlisted) are fetched without the GitHub token; other runs send it (and an
    open run that 401/403s is retried with it). It parses the envelope
    with the shared `parseResultsBundle()` helper, and takes `submission_state` from that GET
    (newer than the list item, which is the fallback).
  - Source key `results:store`, labelled "Results Store", type Cloud. The source's entries are
    replaced on every load, including with an empty list, so withdrawn runs disappear.
- Share-link loaders (`Dashboard.jsx`, `ResultsStore.jsx`) wait for `/api/config`, then use
  `parseResultsBundle()` and the backend's source key (`gcs:llm-d-benchmarks` on GCS — unchanged —
  or `results:store` on S3). Hydrated runs (the signed-in user's own and unlisted runs) use the
  same helper. On S3, runs added this way are kept across Results Store reloads after
  re-fetching each one: runs that are gone or no longer visible (401/403/404) are dropped, runs
  that cannot be checked right now are kept, and so are runs injected while the reload ran.
- The S3 Results Store source reloads when the GitHub token changes (login, logout, refresh);
  stale loads are discarded. On a token change, runs only the previous identity could see are
  dropped at once. Share-link and hydration results fetched with a token that is no longer current
  are not trusted: public, promoted and unlisted runs are added at once; the others are fetched
  once more with the current token (not awaited, never repeated) and added if it may see them.
- `loadAllData` keeps `loading` true until the latest S3 Results Store load has finished (a load
  replaced by a newer one no longer counts), so code that acts when loading ends (e.g. the
  Dashboard's saved-filter cleanup) never sees a partial dataset.
- GitHub token validation (`server/oauth.ts`, both backends) is cached for 60 s per token (keyed by
  a hash; concurrent requests share one validation). A dashboard load sends the token with every
  non-public run, and each validation otherwise costs several GitHub API calls against the user's
  hourly limit. Only definitive results are kept: not failures, and not a permission computed
  while the org lookup failed or was rate-limited, or while the allowlists could not be read
  (`resolveAllowlistRole`). A revoked token or a permission change takes effect within a minute.
- After submit/review/promote/delete the existing `loadAllData(null, true)` refresh re-runs the
  loader.

### 3.5 Errors

- Misconfigured S3 backend (`RESULTS_STORE_BUCKET` unset): logged at startup; the
  storage routes return 503 `Results Store is not configured`. Agent/SKILL routes are unaffected.
- A payload the S3 store cannot hold (over-cap metadata value) returns 400.
- No fallback to GCS when the backend is `s3`.

### 3.6 Configuration summary

| Variable | Meaning |
|---|---|
| `RESULTS_STORE_BACKEND` | `gcs` (default) or `s3` |
| `RESULTS_STORE_BUCKET` | store bucket and optional prefix (as on GCS; required on S3) |
| `RESULTS_STORE_S3_ENDPOINT` | S3 endpoint URL; omit for AWS |
| `RESULTS_STORE_S3_REGION` | default `us-east-1` |
| `RESULTS_STORE_S3_FORCE_PATH_STYLE` | `true` for path-style addressing (e.g. MinIO) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | or any other AWS SDK credential source |
| `RESULTS_STORE_PLAYGROUND_MODE` | unchanged |

---

## 4. Testing

- S3 store unit tests against an in-memory S3 (`fakeS3.js`): CRUD, metadata encoding and caps,
  key-case normalization, objects vanishing between LIST/HEAD/GET, same-second identical-body
  state changes, authorization/content races, pagination.
- Listing parity: the visibility scenarios run against the S3 store; existing GCS tests pass.
- Configuration: bucket/prefix parsing, endpoint/region/path style, no fallback bucket, 503 when
  unset.
- Allowlists: read from the store bucket, missing file, error propagation.
- Frontend: loader paging, state from list items, revalidation, share-link source keys.
- Manual end-to-end (not automated) against moto through the HTTP API, the `prism-results` CLI
  and a headless browser: submit → review → promote → withdraw → delete, in playground and
  allowlist modes.

## 5. Rollout

1. Merge with default `gcs`; prism.llm-d.ai is unaffected.
2. An S3 deployment sets `RESULTS_STORE_BACKEND=s3`, `RESULTS_STORE_BUCKET`, the endpoint and
   credentials, and either GitHub OAuth plus the two allowlist files in the bucket, or
   `RESULTS_STORE_PLAYGROUND_MODE=1`.

## 6. Known limitations

- Review/promote/delete are read-modify-write without preconditions, on both backends (inherited).
  Two admins acting on the same run at the same instant can overwrite each other's history entry.
- S3 has no creation time; `prism-submitted-at` is written once at submit and preserved on state
  changes, so list timestamps don't move.
- An S3 scan costs one `ListObjectsV2` page per 1,000 objects plus one `HeadObject` per run, at
  most once per 5 s. Appropriate for hundreds to low thousands of runs; a metadata index would be
  the next step beyond that.
- Get and export read the metadata (to authorize) and the payload in two requests, on both
  backends (inherited). A run whose state changes between the two can be returned with the
  newer payload under the older state.
