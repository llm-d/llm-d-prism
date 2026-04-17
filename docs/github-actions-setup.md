# GitHub Actions Deployment Setup

This guide explains how to configure GitHub Actions to automatically deploy to Google Cloud Run when code is merged to `main`.

---

## Overview

The deployment workflow (`.github/workflows/deploy-cloud-run.yaml`) automatically:
1. Triggers on push to `main` branch
2. Authenticates to Google Cloud using Workload Identity Federation
3. Loads deployment configuration from GitHub repository variables and secrets
4. Deploys the latest code to Cloud Run

**Why Workload Identity Federation?**
- ✅ No service account keys to manage or rotate
- ✅ More secure - credentials never leave Google Cloud
- ✅ Fine-grained access control per repository
- ✅ Recommended by Google for CI/CD

---

## Setup Steps

### 1. Enable Required APIs

```bash
gcloud services enable iam.googleapis.com \
  sts.googleapis.com \
  iamcredentials.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  apikeys.googleapis.com \
  drive.googleapis.com \
  --project=llm-d-prism
```

### 2. Create Workload Identity Pool

```bash
gcloud iam workload-identity-pools create "github-actions" \
  --project="llm-d-prism" \
  --location="global" \
  --display-name="GitHub Actions Pool"
```

### 3. Create Workload Identity Provider

```bash
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="llm-d-prism" \
  --location="global" \
  --workload-identity-pool="github-actions" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner == 'llm-d'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

### 4. Create Service Account for Deployment

```bash
gcloud iam service-accounts create github-actions-deployer \
  --project=llm-d-prism \
  --display-name="GitHub Actions Deployer"
```

### 5. Grant Required Permissions

```bash
SERVICE_ACCOUNT="github-actions-deployer@llm-d-prism.iam.gserviceaccount.com"

# Cloud Run deployment
gcloud projects add-iam-policy-binding llm-d-prism \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/run.admin"

# Service account user (to deploy as the runtime SA)
gcloud projects add-iam-policy-binding llm-d-prism \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/iam.serviceAccountUser"

# Cloud Build
gcloud projects add-iam-policy-binding llm-d-prism \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/cloudbuild.builds.builder"

# Storage for build artifacts
gcloud projects add-iam-policy-binding llm-d-prism \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/storage.admin"
```

### 6. Allow GitHub to Impersonate Service Account

```bash
gcloud iam service-accounts add-iam-policy-binding \
  "github-actions-deployer@llm-d-prism.iam.gserviceaccount.com" \
  --project="llm-d-prism" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/551003848936/locations/global/workloadIdentityPools/github-actions/attribute.repository/llm-d/llm-d-prism"
```

### 7. Get Workload Identity Provider Resource Name

```bash
gcloud iam workload-identity-pools providers describe "github-provider" \
  --project="llm-d-prism" \
  --location="global" \
  --workload-identity-pool="github-actions" \
  --format="value(name)"
```

This will output something like:
```
projects/551003848936/locations/global/workloadIdentityPools/github-actions/providers/github-provider
```

### 8. Create the `GOOGLE_API_KEY` (CLI)

The deployer service account (`github-actions-deployer`) uses Workload Identity Federation and **does not require a JSON key file**.

The `GOOGLE_API_KEY` secret is a separate API key used by the app at runtime.

```bash
PROJECT_ID="llm-d-prism"

# Create API key
gcloud services api-keys create \
  --project "$PROJECT_ID" \
  --display-name="prism-runtime"

# List keys (copy the NAME value for your key)
gcloud services api-keys list \
  --project "$PROJECT_ID" \
  --format="table(name,displayName,createTime)"

# Extract KEY_ID from NAME:
# projects/<project-number>/locations/global/keys/<KEY_ID>
KEY_NAME="projects/551003848936/locations/global/keys/<key-id-from-name-column>"
KEY_ID="${KEY_NAME##*/}"

# Retrieve the AIza... key string (use this value for GitHub secret GOOGLE_API_KEY)
gcloud services api-keys get-key-string "$KEY_ID" --project "$PROJECT_ID"
```

Recommended key restriction:

```bash
PROJECT_ID="llm-d-prism"
KEY_NAME="projects/551003848936/locations/global/keys/<key-id-from-name-column>"
KEY_ID="${KEY_NAME##*/}"

gcloud services api-keys update "$KEY_ID" \
  --project "$PROJECT_ID" \
  --api-target=service=drive.googleapis.com
```

If your deployment uses Google Sheets data, include both API targets in one update:

```bash
gcloud services api-keys update "$KEY_ID" \
  --project "$PROJECT_ID" \
  --api-target=service=drive.googleapis.com \
  --api-target=service=sheets.googleapis.com
```

### 9. Configure GitHub Variables and Secrets

After completing step 8 to generate the API key value, go to **GitHub Repository → Settings → Secrets and variables → Actions** and add the following repository variables:

| Variable Name | Value | Example |
|---------------|-------|---------|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | The full provider name from step 7 | `projects/551003848936/locations/global/workloadIdentityPools/github-actions/providers/github-provider` |
| `GCP_SERVICE_ACCOUNT` | The service account email | `github-actions-deployer@llm-d-prism.iam.gserviceaccount.com` |
| `GCP_PROJECT_ID` | Deployment project ID | `llm-d-prism` |
| `GCP_SERVICE_NAME` | Cloud Run service name | `prism` |
| `GCP_REGION` | Cloud Run region | `us-central1` |
| `SITE_NAME` | UI display name | `llm-d` |
| `GA_TRACKING_ID` | Google Analytics tracking ID | `G-9V2H96477R` |
| `CONTACT_US_URL` | Optional contact link or email | `https://llm-d.ai/contact` |
| `GIQ_PROJECTS` | Comma-separated GIQ project list | `llm-d-prism` |
| `GCS_BUCKETS` | Comma-separated GCS bucket list | `llm-d-prism-results` |

Then add this repository secret:

| Secret Name | Value | Example |
|-------------|-------|---------|
| `GOOGLE_API_KEY` | Your Google API key for the app | `AIza...` |

---

## Testing

### Manual Trigger

Test the workflow without pushing to main:

1. Go to **Actions** tab in GitHub
2. Select **Deploy to Cloud Run**
3. Click **Run workflow**
4. Select `main` branch
5. Click **Run workflow**

### Automatic Trigger

Simply merge a PR to `main` or push directly to `main`, and the deployment will trigger automatically.

---

## Monitoring

View deployment status:
- GitHub: **Actions** tab → **Deploy to Cloud Run**
- GCP Console: **Cloud Run** → Select service → **Revisions**

---

## Troubleshooting

### Permission Denied Errors

```bash
# Verify service account has correct roles
gcloud projects get-iam-policy llm-d-prism \
  --flatten="bindings[].members" \
  --filter="bindings.members:github-actions-deployer@llm-d-prism.iam.gserviceaccount.com"
```

### Workload Identity Federation Issues

```bash
# Verify the pool exists
gcloud iam workload-identity-pools describe github-actions \
  --location=global \
  --project=llm-d-prism

# Verify the provider configuration
gcloud iam workload-identity-pools providers describe github-provider \
  --location=global \
  --workload-identity-pool=github-actions \
  --project=llm-d-prism
```

### View Deployment Logs

```bash
# Cloud Build logs
gcloud builds list --project=llm-d-prism --limit=5

# Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=prism" \
  --project=llm-d-prism \
  --limit=50 \
  --format=json
```

---

## Security Best Practices

1. ✅ Workload Identity Federation eliminates the need for service account keys
2. ✅ Service account permissions are limited to only deployment tasks
3. ✅ Repository-specific conditions prevent unauthorized access
4. ✅ Sensitive values are stored in GitHub Secrets, never committed to the repo
5. ✅ Enable Cloud Audit Logs to monitor deployments

---

## Cost Considerations

- Cloud Run deployments from source trigger Cloud Build, which has a free tier of 120 build-minutes/day
- Each deployment takes approximately 3-5 minutes
- Estimated cost for typical usage: **Free** (within free tier limits)
