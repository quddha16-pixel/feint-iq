#!/usr/bin/env bash
# Read-only. Never enables APIs, grants IAM, reads secret values, builds, or deploys.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/vars.sh"
if ! command -v gcloud >/dev/null 2>&1; then
  echo 'gcloud is unavailable here. Run this preflight in Google Cloud Shell.' >&2
  exit 1
fi
actual_number="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
if [[ "$actual_number" != "$PROJECT_NUMBER" ]]; then
  echo 'Project number mismatch. Stop and verify the selected project.' >&2
  exit 1
fi
printf 'Verified project: %s (%s)\n' "$PROJECT_ID" "$PROJECT_NUMBER"
gcloud billing projects describe "$PROJECT_ID" --format='yaml(billingEnabled)' || echo 'Billing metadata not yet verified.'
echo 'Enabled APIs (compare with the runbook):'
gcloud services list --enabled --project="$PROJECT_ID" --format='value(config.name)' || echo 'API enablement not yet verified.'
for account in "$RUNTIME_SA" "$BUILD_SA"; do
  gcloud iam service-accounts describe "$account" --project="$PROJECT_ID" --format='value(email)' || echo "Not yet verified: $account"
done
for secret in "$GEMINI_SECRET" "$ACCESS_SECRET"; do
  echo "Enabled version metadata only: $secret"
  gcloud secrets versions list "$secret" --project="$PROJECT_ID" --filter='state=ENABLED' --format='value(name)' || echo "Not yet verified: $secret"
done
gcloud artifacts repositories describe "$AR_REPOSITORY" --project="$PROJECT_ID" --location="$REGION" --format='value(name)' || echo 'Artifact repository not yet verified.'
gcloud storage buckets describe "gs://$BUILD_SOURCE_BUCKET" --format='yaml(name,projectNumber)' || echo 'Build source bucket not yet verified.'
echo 'This verifies visibility, not every required permission. No secret values were read.'
