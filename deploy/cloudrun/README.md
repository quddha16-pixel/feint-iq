# Cloud Run preparation — NOT DEPLOYED

Prepared for **Feint Labs - Identifier Q**, project ID **`feint-identifierq`**, project number **`334840153796`**, region **`us-central1`**. This is a reviewable runbook, not an automatic deployment. The modifying commands below have **not** been executed. Running them later enables services, creates billable resources/secret versions, builds an image and deploys a service. Do not run them until you explicitly approve that work and its cost.

## Findings and changes

- The container includes ffmpeg/ffprobe and CA certificates, uses production dependencies, and runs as non-root `node`.
- `server/config.ts` validates the injected `PORT`; the image defaults to 8080, but Cloud Run can override it. Cloud Run binds to **`0.0.0.0`**, not loopback. TLS terminates at Cloud Run; the container speaks HTTP/1.
- **`GET /livez`** is a minimal unauthenticated HTTP probe returning only `{ "status": "ok" }`. It bypasses the API rate limit so probes do not consume the pilot request allowance. Detailed `/health`, uploads, reports and jobs still require the application bearer token. A provider outage/missing provider does not cause a liveness restart loop.
- Cloud Run's HTTP/1 request limit is **32 MiB**. This pilot defaults to **25 MiB per file** in Cloud Run and enforces it before decoding/provider usage. Multipart overhead has headroom. The duration range stays **10 seconds–5 minutes**. Non-Cloud-Run deployments retain the earlier 100 MiB default. Explicit Cloud Run limits above 30 MiB are rejected. Larger uploads require a separate resumable object-storage flow or an end-to-end HTTP/2 implementation, neither of which is claimed here.
- The app sends HTTP 202 and then processes in the background. **Default request-based CPU/scale-to-zero settings are not suitable for this implementation.** The prepared pilot uses instance-based billing, one minimum instance, always-allocated CPU, and a one-instance service limit. The API accepts several HTTP requests for status/cancel/probes while the application itself runs only one analysis worker.
- Jobs and reports are still in process memory. Even a warm singleton can restart or be replaced; a deployment can temporarily overlap instances. Maximum instances is not a durable queue, absolute spending cap, or guarantee against transient extra instances. In-flight jobs can be lost. Do not redeploy while processing. Durable jobs/storage and owner isolation are prerequisites for a dependable multi-user service.
- No load balancer, VPC/NAT, database, Cloud Tasks queue, footage bucket, domain, or frontend redesign is needed for this private pilot. Gemini Developer API access remains API-key based, not Vertex AI/ADC.

## Proposed resource settings

| Setting           | Prepared value                                      | Reason                                                                                             |
| ----------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Service           | `identifier-q-api`                                  | Separate from the static frontend                                                                  |
| Region            | `us-central1`                                       | User requested; no documented reason to change it                                                  |
| CPU / memory      | 1 vCPU / 2 GiB                                      | ffmpeg plus buffers; one analysis at a time                                                        |
| Billing           | Instance-based, `--no-cpu-throttling`               | Background work continues after HTTP 202                                                           |
| Service min / max | 1 / 1                                               | Keep CPU available; limit normal pilot scaling                                                     |
| HTTP concurrency  | 8                                                   | Allow polling/cancel/probes; extra analyses get application 429                                    |
| Request timeout   | 600 seconds                                         | Not a background-job timer; app has its own 240-second processing timeout                          |
| Port / host       | injected `PORT` (8080) / `0.0.0.0`                  | Cloud Run container contract                                                                       |
| Upload limit      | 25 MiB (`MAX_UPLOAD_MB=25`)                         | Stay below HTTP/1's 32 MiB request ceiling                                                         |
| Startup probe     | `/livez`, 8080; 5s timeout, 10s period, 12 failures | Up to 120 seconds for startup/tool checks                                                          |
| Liveness probe    | `/livez`, 8080; 5s timeout, 30s period, 3 failures  | Check responsiveness, not provider quota                                                           |
| Authentication    | Public Cloud Run ingress; application bearer auth   | The existing Pages client does not mint Google ID tokens; browser preflight must reach the service |
| Execution         | second generation                                   | Regular Node/ffmpeg container                                                                      |

**Cost decision required before deployment:** using the published us-central1 instance-based rates of $0.000018/vCPU-second and $0.000002/GiB-second, a continuously warm 1-vCPU/2-GiB instance is approximately **$57 per 30 days before free-tier credits**, plus build, image/source storage, logging/network, Secret Manager and Gemini charges. This is an estimate, not a quote or cap. Budget alerts notify; they do not stop spending. This is a Cloud Run-specific estimate replacing the earlier generic hosting allowance. Lower-cost scale-to-zero operation needs a request-scoped or durable job design first; simply setting min=0 risks interrupting this backend.

The Cloud Run region controls the service location, not a residency guarantee for Gemini Developer API processing. Provider privacy/tier selection still needs approval. No live provider assessment is verified.

## Simplest workflow from an iPhone

1. Use Safari to open [Cloud Console for this project](https://console.cloud.google.com/run?project=feint-identifierq). For Cloud Shell, use landscape orientation and Safari's **Request Desktop Website** if the terminal is cramped. No iPhone `gcloud` installation is needed. A larger device may still be more comfortable if Safari's terminal controls are awkward.
2. After this preparation branch is available in GitHub, open Cloud Shell and clone it (commands below). Read this runbook first. The read-only preflight does not deploy anything.
3. When you later approve provisioning, use Console Secret Manager to enter the Gemini key securely and create the pilot access secret. Do **not** paste provider keys in this chat, source files, GitHub Pages, build arguments, or terminal command history.
4. Run the marked setup/build/deploy sections in order in Cloud Shell. A project administrator may need to do the one-time API/IAM setup for you. Cloud Build builds the exact `server/Dockerfile`; no Docker installation on the iPhone is needed.
5. Copy the resulting HTTPS `run.app` URL into the existing Identifier Q **Settings → Backend URL** and enter only the **pilot session access token**, never the Gemini key. The app keeps that token in memory. The current deployed client already uses the backend's advertised size limit before uploading.

A review branch does not change the live Pages site; do not merge/push these changes to `main` merely to prepare Cloud Run. The existing Pages workflow is left unchanged.

### A. Read-only inspection — safe to run before deployment approval

```bash
git clone --branch prepare/cloud-run https://github.com/quddha16-pixel/feint-iq.git identifier-q-cloudrun
cd identifier-q-cloudrun
source deploy/cloudrun/vars.sh
# Uses your existing Cloud Shell login; does not create credentials or resources.
gcloud auth list --filter=status:ACTIVE --format='value(account)'
bash deploy/cloudrun/preflight.sh
```

The script verifies the project number, shows billing/API and secret-version **metadata**, and checks whether the proposed accounts/repository/bucket are visible. It never reads secret values. Missing resources are expected before setup. A readable object does not prove permission to modify/deploy it. Check IAM below with your administrator.

### B. One-time provisioning — DO NOT RUN until explicitly approved

An authorized administrator can run this in the same checkout. If any named resource already exists, **inspect and reuse it rather than recreating or modifying unrelated resources**. Do not bypass an organization policy denial.

```bash
set -euo pipefail
source deploy/cloudrun/vars.sh
# Confirm identity/project before all modifying steps.
test "$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')" = "$PROJECT_NUMBER"

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  logging.googleapis.com \
  serviceusage.googleapis.com \
  --project="$PROJECT_ID"

# Needed in the project owning the Gemini Developer API key.
# If that is a different project, do this there after verifying its identity.
gcloud services enable generativelanguage.googleapis.com --project="$PROJECT_ID"

gcloud iam service-accounts create identifier-q-runtime \
  --project="$PROJECT_ID" --display-name='Identifier Q runtime'
gcloud iam service-accounts create identifier-q-build \
  --project="$PROJECT_ID" --display-name='Identifier Q image builder'

gcloud artifacts repositories create "$AR_REPOSITORY" \
  --project="$PROJECT_ID" --location="$REGION" --repository-format=docker

gcloud storage buckets create "gs://$BUILD_SOURCE_BUCKET" \
  --project="$PROJECT_ID" --location="$REGION" \
  --uniform-bucket-level-access --public-access-prevention

# Builder can write only this image repository, read this source bucket, and write logs.
gcloud artifacts repositories add-iam-policy-binding "$AR_REPOSITORY" \
  --project="$PROJECT_ID" --location="$REGION" \
  --member="serviceAccount:$BUILD_SA" --role=roles/artifactregistry.writer

gcloud storage buckets add-iam-policy-binding "gs://$BUILD_SOURCE_BUCKET" \
  --member="serviceAccount:$BUILD_SA" --role=roles/storage.objectViewer

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$BUILD_SA" --role=roles/logging.logWriter
```

Billing must already be linked/enabled. These commands deliberately do not attach a billing account or buy a plan. Do not generate/download a service-account JSON key. Google-managed Cloud Run/Cloud Build service agents receive their standard service-agent roles when the APIs are enabled; do not replace those policies.

### C. Secret Manager — values entered securely, never supplied in this chat

In [Secret Manager](https://console.cloud.google.com/security/secret-manager?project=feint-identifierq), create or reuse:

| Secret name                   | Secure value                                                                                                    | Who receives it                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `identifier-q-gemini-api-key` | Your authorized Gemini Developer API key                                                                        | Server process only as `GEMINI_API_KEY`                                        |
| `identifier-q-pilot-token`    | A separately generated cryptographically random access token, at least 32 characters (prefer 64 hex characters) | Server as `ANALYSIS_ACCESS_TOKEN`; authorized pilot user enters it in Settings |

For this regional pilot, select user-managed replication in **us-central1** when creating new secrets. Do not change an existing secret's replication policy without reviewing its use. Restrict the Google API key to the Generative Language API; do not apply browser-referrer restrictions to this server key. The runtime does not use Vertex AI and does not require `roles/aiplatform.user`.

A secure token can be generated and added without displaying it or putting its value in history, **after provisioning approval and only when creating a new token secret**:

```bash
# Alternative to creating the access-token secret in the UI. Do not run both.
openssl rand -hex 32 | tr -d '\n' | \
  gcloud secrets create "$ACCESS_SECRET" \
    --project="$PROJECT_ID" --replication-policy=user-managed --locations="$REGION" --data-file=-
```

The provider key should be entered in the Console's secure secret-value field, not as a CLI literal. The pilot user can retrieve their access-token value securely in Secret Manager's Console when connecting; it must not be posted here. An authorized user's access to that particular token secret is separate from runtime access; they do not need permission to read the provider-key secret.

Grant the runtime **only per-secret read access**:

```bash
for SECRET in "$GEMINI_SECRET" "$ACCESS_SECRET"; do
  gcloud secrets add-iam-policy-binding "$SECRET" --project="$PROJECT_ID" \
    --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor
done

# Metadata only: choose ENABLED numeric versions, not blindly 'latest'.
gcloud secrets versions list "$GEMINI_SECRET" --project="$PROJECT_ID" --filter=state=ENABLED
gcloud secrets versions list "$ACCESS_SECRET" --project="$PROJECT_ID" --filter=state=ENABLED
# Defaults in vars.sh are version 1. Override these with verified version numbers if reusing secrets.
export GEMINI_SECRET_VERSION=1
export ACCESS_SECRET_VERSION=1
```

Pinning numeric versions gives a reproducible revision. Rotating a secret requires reviewing its new version and deploying an updated revision. No actual versions or secret availability have been verified here.

### D. Build the backend image — DO NOT RUN until approved

```bash
set -euo pipefail
source deploy/cloudrun/vars.sh
gcloud meta list-files-for-upload
RELEASE="$(git rev-parse --short=12 HEAD)"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPOSITORY/backend:$RELEASE"

gcloud builds submit . \
  --project="$PROJECT_ID" --region="$REGION" \
  --config=deploy/cloudrun/cloudbuild.yaml \
  --service-account="projects/$PROJECT_ID/serviceAccounts/$BUILD_SA" \
  --gcs-source-staging-dir="gs://$BUILD_SOURCE_BUCKET/source" \
  --substitutions="_IMAGE=$IMAGE"

# Resolve the exact image digest and deploy that immutable reference.
DIGEST="$(gcloud artifacts docker images describe "$IMAGE" \
  --project="$PROJECT_ID" --format='value(image_summary.digest)')"
test -n "$DIGEST"
IMAGE_REF="$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPOSITORY/backend@$DIGEST"
```

The Cloud Build YAML builds `server/Dockerfile` explicitly and uploads the image; it does not deploy. Do not use `gcloud run deploy --source .` from the repository root: without a root Dockerfile, buildpacks may select the frontend/default start behavior. `.gcloudignore` excludes env/key files, local data, tests and videos from the uploaded source archive. Confirm your checkout is clean and contains no unintended credentials/media before a cloud build. Only source code goes into the build; secrets are injected at runtime.

### E. Deploy — DO NOT RUN until explicitly approved

```bash
gcloud run deploy "$SERVICE" \
  --project="$PROJECT_ID" --region="$REGION" \
  --image="$IMAGE_REF" \
  --service-account="$RUNTIME_SA" \
  --execution-environment=gen2 \
  --port=8080 --cpu=1 --memory=2Gi \
  --min=1 --max=1 --concurrency=8 \
  --no-cpu-throttling --timeout=600 \
  --ingress=all --allow-unauthenticated \
  --set-env-vars="HOST=0.0.0.0,MAX_UPLOAD_MB=25,FRONTEND_ORIGIN=$FRONTEND_ORIGIN,GEMINI_MODEL=gemini-3.5-flash-lite" \
  --set-secrets="GEMINI_API_KEY=$GEMINI_SECRET:$GEMINI_SECRET_VERSION,ANALYSIS_ACCESS_TOKEN=$ACCESS_SECRET:$ACCESS_SECRET_VERSION" \
  --startup-probe='httpGet.path=/livez,httpGet.port=8080,initialDelaySeconds=0,timeoutSeconds=5,periodSeconds=10,failureThreshold=12' \
  --liveness-probe='httpGet.path=/livez,httpGet.port=8080,timeoutSeconds=5,periodSeconds=30,failureThreshold=3'
```

This command is for this new, dedicated service. `--set-env-vars` / `--set-secrets` replace those settings; inspect an existing service before applying them to avoid dropping unrelated settings. Do not pass `PORT` through `--set-env-vars`: Cloud Run injects it from `--port`. Do not add `--use-http2` to this HTTP/1 server. `--allow-unauthenticated` makes the URL reachable at Google's IAM layer; **all real app endpoints remain bearer-protected**. It is required for the current cross-origin Pages client, including preflight; this is not permission to bypass an organization's public-access policy. If public invocation is forbidden, stop and design an authorized gateway/client instead of weakening that policy.

### F. Verify without sending footage or invoking Gemini

```bash
URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" \
  --region="$REGION" --format='value(status.url)')"
printf 'Backend URL: %s\n' "$URL"
curl --fail --show-error "$URL/livez"
# Expected: HTTP 401 without a bearer token, NOT configuration or report data.
curl --silent --output /dev/null --write-out '%{http_code}\n' "$URL/health"
curl --include --request OPTIONS "$URL/analyses" \
  --header "Origin: $FRONTEND_ORIGIN" \
  --header 'Access-Control-Request-Method: POST' \
  --header 'Access-Control-Request-Headers: authorization,content-type,idempotency-key'
```

Then connect URL + pilot token in the existing Pages app and verify it reports a **25 MiB** limit before trying a consented 30–60-second boxing clip. A successful health check proves configuration/reachability, not model authorization or analysis accuracy. No verification step above sends footage or calls Gemini. Real-footage evaluation remains separately authorized work.

## Required access and unresolved information

Project ID/number and region are known. What remains unverified here:

1. **Billing linkage and policy approval** for continuously warm compute, API usage, public ingress and the selected provider privacy/tier.
2. **Who will deploy** (Cloud Shell user's Google account or an explicitly connected cloud identity), and their actual permission grants. This environment has no `gcloud` executable or selected GCP identity in its supported connection manifest; pre-existing ADC-related variable names alone do not verify access. No secret files were opened and no GCP IAM capabilities are claimed.
3. Whether the proposed service/accounts/repository/source bucket/secrets already exist and should be reused. API enablement and secret versions have not been verified against Google Cloud.
4. **Authorized Gemini key stored securely**, and **pilot access-token secret**, with enabled numeric version numbers. No key values are needed in chat. A Gemini key can belong to a different project, but its project/API restrictions/quota/billing must be confirmed separately.

| Principal / operation               | Required roles or permissions (scope)                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One-time API setup                  | `roles/serviceusage.serviceUsageAdmin` on project                                                                                                                                                                                                                                                                                                                                                                               |
| One-time account creation           | `roles/iam.serviceAccountAdmin` on project                                                                                                                                                                                                                                                                                                                                                                                      |
| One-time IAM grants                 | Authority to set the relevant project/resource/service-account IAM policies, e.g. project IAM admin plus resource administration; do not grant Owner/Editor just to run the backend                                                                                                                                                                                                                                             |
| Repository / source bucket creation | Artifact Registry admin and Storage admin for the bootstrap administrator; narrow these after setup                                                                                                                                                                                                                                                                                                                             |
| Secret creation/version entry       | Secret Manager admin for bootstrap, or an appropriately scoped secret-create/version-adder role plus policy administration; secret values handled only in Secret Manager                                                                                                                                                                                                                                                        |
| Routine deployer                    | `roles/run.admin` for creating/configuring service and setting public invocation, `roles/cloudbuild.builds.editor`, `roles/serviceusage.serviceUsageConsumer` on project; `roles/iam.serviceAccountUser` on **both** the runtime and build accounts; Artifact Registry reader on the selected repository; source-bucket upload/read/list permissions (Storage object user on that dedicated bucket is a practical scoped grant) |
| Troubleshooting operator            | Logging viewer and Cloud Run viewer if not already covered; grant only as needed                                                                                                                                                                                                                                                                                                                                                |
| Build service account               | Artifact Registry writer on **one repository**, Storage object viewer on **one build-source bucket**, project Logging log writer; **no Secret Manager access and no Cloud Run administration**                                                                                                                                                                                                                                  |
| Runtime service account             | Secret accessor on **only the two selected secrets**; no Owner/Editor, Artifact Registry writer, Cloud Build editor, or Vertex AI roles                                                                                                                                                                                                                                                                                         |
| Pilot user                          | Application session token, not general project-admin access; optional secret accessor on **only the pilot-token secret** if they must retrieve it in Console                                                                                                                                                                                                                                                                    |

A bootstrap administrator can grant the routine deployer's act-as access (replace the non-secret email placeholder with that user's account):

```bash
DEPLOYER='user:YOUR_GOOGLE_ACCOUNT_EMAIL'
for ACCOUNT in "$RUNTIME_SA" "$BUILD_SA"; do
  gcloud iam service-accounts add-iam-policy-binding "$ACCOUNT" --project="$PROJECT_ID" \
    --member="$DEPLOYER" --role=roles/iam.serviceAccountUser
done
```

Do not grant the runtime project-wide secret access or create service-account key files. Same-project Cloud Run image pulling uses the Google-managed Cloud Run service agent; do not add broad image permissions to the runtime unnecessarily. If cross-project resources or organization constraints apply, have the administrator review the additional explicit bindings rather than guessing.

## Pause / cleanup after a pilot (also modifying commands; not run)

Setting min=0 later removes the always-warm baseline but is **not a safe active-processing configuration** for this in-memory backend. First finish/cancel processing and export reports. Deleting the dedicated Cloud Run service stops its compute, but does not remove Artifact Registry images, source archives, logs or secrets and their possible charges. Review those resources individually and never delete shared resources blindly. Budget alerts are recommended before activation, not a hard cost limit.

## Official references checked 2026-11-03

- [Cloud Run container contract](https://docs.cloud.google.com/run/docs/container-contract)
- [HTTP/1 upload limits](https://docs.cloud.google.com/run/quotas)
- [Health probes](https://docs.cloud.google.com/run/docs/configuring/healthchecks)
- [CPU / instance-based billing and background work](https://docs.cloud.google.com/run/docs/configuring/billing-settings)
- [gcloud run deploy flags](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy)
- [User-specified Cloud Build accounts](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts)
- [Cloud Run Secret Manager integration](https://docs.cloud.google.com/run/docs/configuring/services/secrets)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)

## Validation performed here (2026-11-03)

- Type checking, linting and production build passed.
- **49 unit/integration tests and all 22 browser tests passed.** This includes Cloud Run port/default/limit validation, public probe metadata/rate-limit behavior, protected health/job endpoints, and enforcement of smaller advertised upload limits before media/provider calls.
- The Docker image was built **locally only**, then run as non-root with injected `PORT=9090` and `K_SERVICE=identifier-q-api`. Its probe returned 200 without a token, detailed health returned 401 without a token, authenticated health advertised 25 MiB and 10–300 seconds, and the Pages CORS preflight passed. FFmpeg and ffprobe were present and their startup checks passed. No model was called.
- All eight Bash command blocks and both shell files passed local Bash syntax checks; provisioning/build/deployment blocks were **not executed**. The read-only preflight stopped with its expected “gcloud unavailable” message in this machine.
- Existing GitHub Pages returned HTTP 200. The frontend source and Pages workflow were not changed by this preparation.
- No GCP project API/permissions/secret versions were live-verified, and no APIs, service accounts, buckets, registries, secrets, Cloud Build jobs or Cloud Run services were created/modified. No image was pushed to a registry. No provider credentials were requested or read.
