#!/bin/bash
set -e

# Default Values
PROJECT_ID=$(gcloud config get-value project)
SERVICE_NAME="prism"
SITE_NAME=""
GA_TRACKING_ID="G-9V2H96477R"
REGION="us-central1"
MIN_INSTANCES=""
MAX_INSTANCES=""
CONCURRENCY=""

# Helper function to print usage
usage() {
  echo "Usage: $0 [options]"
  echo "Options:"
  echo "  -f, --config <FILE>           Configuration file (default: .deploy_config)"
  echo "  -p, --project <PROJECT_ID>    GCP Project ID (default: current gcloud project)"
  echo "  -s, --service <SERVICE_NAME>  Cloud Run Service Name (default: 'prism')"
  echo "  -n, --name <TEXT>             Site Name (e.g. 'Internal')"
  echo "  -g, --ga-id <ID>              Google Analytics Tracking ID (e.g. 'G-XXXX')"
  echo "  -c, --contact <URL>           Contact Us URL/Email"
  echo "  -giq, --giq-projects <IDS>    Comma-separated list of GIQ project IDs"
  echo "  -b, --gcs-buckets <NAMES>     Comma-separated list of GCS buckets"
  echo "  -h, --help                    Show this help message"
  exit 1
}

# Config Persistence
CONFIG_FILE=".deploy_config"

# First pass to find config file
for ((i=1; i<=$#; i++)); do
    arg="${!i}"
    next=$((i+1))
    if [[ "$arg" == "-f" ]] || [[ "$arg" == "--config" ]]; then
        CONFIG_FILE="${!next}"
    fi
done

if [ -f "$CONFIG_FILE" ]; then
    echo "Loading defaults from $CONFIG_FILE..."
    # Use a subshell to avoid polluting current shell if config has bad syntax
    source "$CONFIG_FILE"
fi

# Parse all arguments (overrides loaded defaults)
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -f|--config) CONFIG_FILE="$2"; shift ;;
        -p|--project) PROJECT_ID="$2"; shift ;;
        -s|--service) SERVICE_NAME="$2"; shift ;;
        -n|--name) SITE_NAME="$2"; shift ;;
        -g|--ga-id) GA_TRACKING_ID="$2"; shift ;;
        -c|--contact) CONTACT_US_URL="$2"; shift ;;
        -giq|--giq-projects) GIQ_PROJECTS="$2"; shift ;;
        -b|--gcs-buckets) GCS_BUCKETS="$2"; shift ;;
        -h|--help) usage ;;
        *) echo "Unknown parameter passed: $1"; usage ;;
    esac
    shift
done

# Auto-detect API Key from .env.local if not set
if [ -z "$GOOGLE_API_KEY" ] && [ -f ".env.local" ]; then
    echo "Attempting to extract API Key from .env.local..."
    # Extract value, handling potential quotes
    DETECTED_KEY=$(grep "REACT_APP_GOOGLE_API_KEY" .env.local | cut -d '=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ')
    if [ ! -z "$DETECTED_KEY" ]; then
        echo "Found API Key in .env.local"
        GOOGLE_API_KEY=$DETECTED_KEY
    fi
fi

# Save current config
echo "Saving configuration to $CONFIG_FILE..."
cat > "$CONFIG_FILE" <<EOL
PROJECT_ID="$PROJECT_ID"
SERVICE_NAME="$SERVICE_NAME"
SITE_NAME="$SITE_NAME"
GA_TRACKING_ID="$GA_TRACKING_ID"
REGION="$REGION"
CONTACT_US_URL="$CONTACT_US_URL"
GIQ_PROJECTS="${GIQ_PROJECTS:-$PROJECT_ID}"
GCS_BUCKETS="${GCS_BUCKETS:-prism-internal-results}"
MIN_INSTANCES="$MIN_INSTANCES"
MAX_INSTANCES="$MAX_INSTANCES"
CONCURRENCY="$CONCURRENCY"
EOL

IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

echo "Deploying to Project: $PROJECT_ID with Name: '$SITE_NAME' and GA: '$GA_TRACKING_ID'"

# Enable required APIs (skipped in CI; enable manually or grant the SA serviceusage.serviceUsageAdmin)
if [ "${CI}" != "true" ]; then
  echo "Enabling required APIs..."
  gcloud services enable cloudbuild.googleapis.com containerregistry.googleapis.com run.googleapis.com --project $PROJECT_ID
else
  echo "Skipping API enablement in CI environment"
fi

# Deploy to Cloud Run from source
echo "Deploying to Cloud Run from source..."

DEPLOY_ARGS=(
  run deploy $SERVICE_NAME
  --source .
  --platform managed
  --region $REGION
  --allow-unauthenticated
  --port 8080
  --project $PROJECT_ID
  --set-env-vars GOOGLE_CLOUD_PROJECT="$PROJECT_ID",DEFAULT_PROJECTS="${GIQ_PROJECTS:-$PROJECT_ID}",DEFAULT_BUCKETS="${GCS_BUCKETS:-prism-internal-results}",SITE_NAME="$SITE_NAME",GA_TRACKING_ID="$GA_TRACKING_ID",CONTACT_US_URL="$CONTACT_US_URL",GOOGLE_API_KEY="$GOOGLE_API_KEY"
)

[ -n "$MIN_INSTANCES" ] && DEPLOY_ARGS+=(--min-instances "$MIN_INSTANCES")
[ -n "$MAX_INSTANCES" ] && DEPLOY_ARGS+=(--max-instances "$MAX_INSTANCES")
[ -n "$CONCURRENCY" ] && DEPLOY_ARGS+=(--concurrency "$CONCURRENCY")

gcloud "${DEPLOY_ARGS[@]}"

# Tip: To configure default data sources, verify functionality using --set-env-vars:
# --set-env-vars DEFAULT_PROJECTS="my-project",DEFAULT_BUCKETS="gs://my-bucket"


echo "Deployment complete!"
