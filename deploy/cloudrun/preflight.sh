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
echo 'billingEnabled does NOT prove Free Trial status, remaining credit, or Gemini Free Tier. Check both Consoles; never upgrade.'
echo 'Enabled APIs (compare with the runbook):'
gcloud services list --enabled --project="$PROJECT_ID" --format='value(config.name)' || echo 'API enablement not yet verified.'
for account in "$RUNTIME_SA" "$BUILD_SA"; do
  gcloud iam service-accounts describe "$account" --project="$PROJECT_ID" --format='value(email)' || echo "Not yet verified: $account"
done
for secret in "$GEMINI_SECRET" "$ACCESS_SECRET"; do
  echo "Enabled version metadata only: $secret"
  gcloud secrets versions list "$secret" --project="$PROJECT_ID" --filter='state=ENABLED' --format='value(name)' || echo "Not yet verified: $secret"
  gcloud secrets get-iam-policy "$secret" --project="$PROJECT_ID" \
    --flatten='bindings[].members' --filter="bindings.members:serviceAccount:$RUNTIME_SA" \
    --format='table(bindings.role,bindings.members,bindings.condition.expression)' || echo 'Runtime per-secret IAM not yet verified.'
done
echo 'Direct project-level runtime grants (expect none; inherited/group grants need administrator review):'
gcloud projects get-iam-policy "$PROJECT_ID" --flatten='bindings[].members' \
  --filter="bindings.members:serviceAccount:$RUNTIME_SA" \
  --format='table(bindings.role,bindings.condition.expression)' || echo 'Project IAM not yet verified.'
gcloud artifacts repositories describe "$AR_REPOSITORY" --project="$PROJECT_ID" --location="$REGION" --format='value(name)' || echo 'Artifact repository not yet verified.'
gcloud storage buckets describe "gs://$BUILD_SOURCE_BUCKET" --raw --format='yaml(name,projectNumber)' || echo 'Build source bucket not yet verified.'
gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" \
  --format='value(status.url,status.latestReadyRevisionName)' || echo 'Cloud Run service not yet verified (expected before first deployment).'
echo 'This is an inventory, NOT a deployment approval or a complete permission/billing check. No secret values were read.'
