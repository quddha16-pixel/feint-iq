# Identifier Q — deployment readiness and Cloud Shell runbook

**Reviewed 2026-11-03. Prepared, NOT DEPLOYED.** Project `feint-identifierq` (`334840153796`), region `us-central1`. This branch is `prepare/cloud-run`; `main` and the existing GitHub Pages deployment remain unchanged. No Google Cloud resource, IAM grant, API enablement, build, secret access, or billing change has been performed here.

## Decision and remaining blockers

The code is prepared for a **restricted single-owner prototype**, with request-bound processing, minimum instances **0**, request-based CPU billing, and no permanent warm server. Local checks do not prove cloud permissions, Gemini availability, or analysis quality.

Before authorizing deployment, resolve these items in your own Console/Cloud Shell:

1. Verify the linked billing account is still **Free Trial**, with sufficient remaining credit and days, and the project owning the Gemini key still shows **Free** in AI Studio. `billingEnabled: true` alone proves neither. Do not upgrade, add Gemini paid billing/prepay, link a different billing account, or select paid services. Stop on any prompt requiring these actions. Google states that **the $300 trial credit cannot pay Gemini API in AI Studio charges**; this plan relies on Gemini Free Tier, not those credits, for inference.
2. Inspect the existing two secrets' **enabled numeric versions** and IAM metadata. Their existence is user-confirmed; this environment cannot independently verify their versions, values, API restrictions, or permissions. Do not recreate or rotate them as part of this review.
3. Confirm deployment-account permissions, public Cloud Run invocation policy, and availability of the dedicated resources below. This workspace has no `gcloud` executable or connected GCP identity; no credential files were opened. Run the read-only preflight in Cloud Shell. Missing visibility is not proof a resource is absent.
4. Review Free Tier data handling for consented footage, and check actual model quota in AI Studio. A health check does not call Gemini. The first live clip is a later, explicit evaluation; no actual analysis has yet been validated.
5. **Publish the reviewed `request-stream-v1` frontend separately, only after authorization.** The current public Pages client uses the older background/polling protocol. The client and backend on this branch work together in local HTTP/browser tests. An old client must not be connected to this backend. Do not push/merge to `main` during preparation: it triggers Pages deployment.

## Exact backend configuration

| Backend environment variable | Source / prepared value                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GEMINI_API_KEY`             | Secret `projects/feint-identifierq/secrets/identifierq-gemini-api-key`, pinned enabled version                                       |
| `ANALYSIS_ACCESS_TOKEN`      | Secret `projects/feint-identifierq/secrets/identifierq-pilot-token`, pinned enabled version; at least 32 characters, securely random |
| `GEMINI_MODEL`               | `gemini-3.5-flash-lite` (reviewed Free Tier candidate; no automatic model fallback)                                                  |
| `FRONTEND_ORIGIN`            | `https://quddha16-pixel.github.io` — origin only, no `/feint-iq/` path                                                               |
| `HOST`                       | `0.0.0.0`                                                                                                                            |
| `PORT`                       | Injected by Cloud Run from `--port=8080`; do not set it in Secret Manager or `--set-env-vars`                                        |
| `MAX_UPLOAD_MB`              | `25` — interpreted as MiB; startup rejects values above 25                                                                           |
| `NODE_ENV`                   | `production` in the image                                                                                                            |
| `K_SERVICE`                  | Injected by Cloud Run; enforces all-interface binding                                                                                |

The Dockerfile installs **FFmpeg, ffprobe and CA certificates**, installs locked production dependencies, and runs as the non-root `node` user. Startup checks both media tools. `server/config.ts` validates the injected port. `GET /livez` returns only `{"status":"ok"}` without authentication or a Gemini call; detailed `/health` is bearer protected. Liveness excludes provider availability, preventing quota-related restart loops.

### Gemini Free Tier compatibility

Official [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) lists **text, image, video and audio inputs**, text output, and structured outputs. Its [Standard pricing table](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite) lists **Free of charge** for Free Tier input and output. No model substitution is required based on those documented capabilities.

This adapter uses synchronous `generateContent` with **JPEG images sampled by FFmpeg**, source-frame IDs/times and fighter metadata. It does not upload the original video or audio to Google, use Vertex AI, request tools/search grounding, create a context cache, or select batch/flex/priority processing. It samples at most 120 sequence frames plus five identity frames. Frame-linked observations are model interpretations, not independently verified actions, exact strike timing, numerical scores, or automatic fighter tracking.

Free Tier limits are **per project**, depend on model/account/region eligibility, and can be lower than a long clip's token requirement. Check [your active limits in AI Studio](https://aistudio.google.com/rate-limit); do not invent a fixed RPM/TPM/RPD quota. Start with one consented 30–60-second boxing clip. A 403/404, zero model quota, 429, incomplete response, or unconfirmed fighter identity fails the attempt without a fabricated report, automatic retry, or fallback model. The quota error explicitly says not to enable paid billing. Wait for quota or reduce the evaluation clip; changing models requires a new free-eligibility review.

A model ID or API key **cannot enforce the project's billing tier**. The same endpoint can charge a paid project. Keeping AI Studio on **Free** and the Cloud billing account unupgraded is an operator prerequisite, not a guarantee inferred from configuration. No code or command here upgrades billing. Free-service terms may permit product improvement/human review; do not submit confidential or personal footage without reviewing the [current terms](https://ai.google.dev/gemini-api/terms) and obtaining appropriate consent. Moving to a paid tier for privacy is not authorized.

### Authentication, CORS and request lifetime

The public Pages bundle contains neither secret. The owner enters **only the pilot token** in Settings over HTTPS; it is held in memory, sent in an `Authorization: Bearer` header, and discarded on disconnect/reload. It is not saved in URLs, localStorage, public `VITE_` variables or build arguments. The Gemini key is injected into the server only. Never paste either value in chat or commit it. API-key restrictions should allow the Generative Language API; browser-referrer restrictions are inappropriate for this server-side key. No service-account JSON keys are needed.

All real API routes require the token; only `/livez` and browser `OPTIONS` are public. CORS permits exactly `https://quddha16-pixel.github.io`, GET/POST/DELETE/OPTIONS, and authorization/content-type/idempotency-key headers, with no cookies. Origins cannot restrict a URL subpath. CORS is not authentication. The shared token grants access to **all** temporary pilot jobs; this is single-owner access, not separate user accounts. Use a securely generated token; rotate it through Secret Manager if disclosed.

Cloud Run's Google IAM layer must allow public invocation so Pages can perform preflight and application bearer authentication. This exposes the URL; it does not expose reports without the token. If organization policy forbids public invocation, stop and design an approved gateway/authentication flow. Rate limiting (60/minute) and one active analysis per instance reduce ordinary load but are not a hard abuse/spending cap.

| Setting                        | Prepared value                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Instances / CPU billing        | service min **0**, max **1**, request-based CPU, startup CPU boost off                                                     |
| Resources / concurrency        | 1 vCPU, 2 GiB, HTTP concurrency 8; application analysis concurrency 1                                                      |
| Request / processing deadlines | Cloud Run 600s; browser 540s; processing 240s; upload 120s; individual media child 45s                                     |
| Inputs                         | one file, **25 MiB**, **10–300 seconds**, boxing, identity-confirmation frame required; actual metadata checked by ffprobe |
| Probes                         | startup `/livez` every 10s, 5s timeout, 12 failures; liveness every 30s, 5s timeout, 3 failures                            |
| Execution / network            | gen2, HTTP/1 port 8080, public HTTPS ingress; no VPC/NAT                                                                   |

The upload HTTP request remains open through decoding, provider analysis, validation and temporary-file cleanup. Status/heartbeat records and the complete validated report use the **same NDJSON response**. No processing is detached after success. Reports are saved in browser history. Temporary server caches are optional diagnostics, lost on restart/scale-to-zero. Cancellation aborts the active stream and attempts to cancel provider/FFmpeg work; accepted provider work cannot be undone. Keep the iPhone tab foreground and phone unlocked. This is not durable execution across browser disconnects. [LOW-COST.md](LOW-COST.md) evaluates Jobs/storage if that later becomes necessary.

## Resources the future deployment would create or change

| Resource                                    | Scope and cost consideration                                                                                                                                                                                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API enablement and managed service agents   | Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Logging, IAM, Storage, Service Usage and Resource Manager; Generative Language API in the key's verified project if not already enabled. Enabling an API is not a Gemini paid-tier upgrade. Standard Google service agents may be created automatically. |
| Two user-managed service accounts           | `identifier-q-runtime` and `identifier-q-build`; no downloaded keys, no standing compute cost                                                                                                                                                                                                                       |
| IAM bindings                                | Runtime accessor on **the two existing secrets only**; builder repository writer, source-bucket viewer and log writer; deployer act-as; Cloud Run public invoker binding                                                                                                                                            |
| Docker Artifact Registry repository/image   | `us-central1/identifier-q`, immutable backend image digest; retained image storage can consume credits above shared free allowance                                                                                                                                                                                  |
| Private Cloud Storage source bucket         | `gs://feint-identifierq-iq-build-source`, us-central1; source archives/operations may consume credits; **not a footage bucket**                                                                                                                                                                                     |
| Cloud Build execution and logs              | Manual build with this repository's `server/Dockerfile`, custom build account, 900s build limit; build minutes/logs subject to shared free allowances/credits; no trigger/private worker pool                                                                                                                       |
| Cloud Run service, revision, URL and probes | `identifier-q-api`, min0/max1; active requests/startup/shutdown and transfer can consume credits; no always-running VM or warm instance                                                                                                                                                                             |
| Existing Secret Manager secrets             | **Reused**, no new secret or version created by this runbook; storage/access operations have their own shared free allowance/credit usage                                                                                                                                                                           |
| Gemini requests                             | **Free Tier only**, quota-limited and separate from GCP trial credits; no paid subscription/prepay, Vertex AI endpoint or reserved capacity                                                                                                                                                                         |

No Cloud Run Job, Tasks/Pub/Sub queue, database, load balancer, scheduled ping, GPU, custom domain, VPC or NAT is added. Scaling to zero removes idle compute, not retained storage costs. Shared free allowances and trial credit/day balance must be checked; alerts are notifications, not spending caps. Google documents no automatic personal charge while the account remains an unupgraded Free Trial; when credit/days expire, resources stop and may later be deleted. **Do not upgrade to keep them running.** See the [trial rules](https://docs.cloud.google.com/free/docs/free-cloud-features) and [separate estimates](LOW-COST.md).

## iPhone procedure: inspection now, deployment only after later authorization

Open [Cloud Console](https://console.cloud.google.com/run?project=feint-identifierq) in Safari. Request Desktop Website and use landscape if needed, then open **Cloud Shell**. It supplies `gcloud` and your Google login; no installation or secret sharing in chat is required. Confirm the billing trial/credit/days in Console and the key-owning project's **Free** tier/limits in [AI Studio](https://aistudio.google.com/projects). Never press Upgrade, Set up billing or Prepay.

### A. Read-only inspection — can be run now

```bash
git clone --branch prepare/cloud-run https://github.com/quddha16-pixel/feint-iq.git identifier-q-cloudrun
cd identifier-q-cloudrun
source deploy/cloudrun/vars.sh
git status --short --branch
git remote -v
gcloud auth list --filter=status:ACTIVE --format='value(account)'
bash deploy/cloudrun/preflight.sh
```

If that directory already exists, inspect it and its remote/branch before updating; do not discard unrelated changes. Preflight reads project, billing/API, IAM, enabled-secret-version and resource **metadata only**. It never reads payloads or creates anything. Errors/missing permission mean **unverified**, not deploy-ready. This command cannot prove trial status, remaining credit/days, Gemini tier, inherited IAM or permission to deploy. Stop here for the current no-deploy request.

### B. Future administrator setup — NOT RUN; requires later authorization

Only an authorized administrator should execute these changes, after confirming the prerequisites. Inspect/reuse existing dedicated resources instead of recreating them. Do not treat a permission-denied response as “missing.” No billing attachment/upgrade commands are included.

```bash
set -euo pipefail
source deploy/cloudrun/vars.sh
test "$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')" = "$PROJECT_NUMBER"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com logging.googleapis.com \
  iam.googleapis.com storage.googleapis.com serviceusage.googleapis.com \
  cloudresourcemanager.googleapis.com --project="$PROJECT_ID"
# Only if this is the verified project owning the existing Gemini API key:
gcloud services enable generativelanguage.googleapis.com --project="$PROJECT_ID"

# Create only if preflight/administrator confirms these dedicated resources are absent.
gcloud iam service-accounts create identifier-q-runtime \
  --project="$PROJECT_ID" --display-name='Identifier Q runtime'
gcloud iam service-accounts create identifier-q-build \
  --project="$PROJECT_ID" --display-name='Identifier Q image builder'
gcloud artifacts repositories create "$AR_REPOSITORY" \
  --project="$PROJECT_ID" --location="$REGION" --repository-format=docker
gcloud storage buckets create "gs://$BUILD_SOURCE_BUCKET" \
  --project="$PROJECT_ID" --location="$REGION" \
  --uniform-bucket-level-access --public-access-prevention

gcloud artifacts repositories add-iam-policy-binding "$AR_REPOSITORY" \
  --project="$PROJECT_ID" --location="$REGION" \
  --member="serviceAccount:$BUILD_SA" --role=roles/artifactregistry.writer
gcloud storage buckets add-iam-policy-binding "gs://$BUILD_SOURCE_BUCKET" \
  --member="serviceAccount:$BUILD_SA" --role=roles/storage.objectViewer
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$BUILD_SA" --role=roles/logging.logWriter

# Runtime receives no project-wide roles or access to other secrets.
for SECRET in "$GEMINI_SECRET" "$ACCESS_SECRET"; do
  gcloud secrets add-iam-policy-binding "$SECRET" --project="$PROJECT_ID" \
    --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor
done
```

The runtime needs **no** Vertex AI, Cloud Build, Storage, Artifact Registry writer, Owner or Editor role. Same-project image pulling uses the Google-managed Cloud Run service agent. The build account needs **no secrets** or Cloud Run administration. If the runtime already has broader project/group/inherited grants, have an administrator review them rather than deleting unrelated bindings automatically.

| Actor                   | Permissions needed                                                                                                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bootstrap administrator | Service Usage Admin, Service Account Admin; relevant project/resource IAM policy administration; Artifact Registry/Storage administration for new dedicated resources; per-secret policy administration. Existing secrets do not need recreation or new versions.                                                                |
| Routine deployer        | Cloud Run Admin, Cloud Build Builds Editor, Service Usage Consumer; Service Account User **on both named accounts**, Artifact Registry Reader on the selected repository, Storage Object User on the dedicated source bucket. Logging Viewer for inspecting logs as needed. These do not require provider-secret payload access. |
| Runtime service account | `roles/secretmanager.secretAccessor` on **identifierq-gemini-api-key** and **identifierq-pilot-token**, nothing project-wide                                                                                                                                                                                                     |
| Build service account   | Repository-scoped Artifact Registry Writer, bucket-scoped Storage Object Viewer, project Logging Log Writer                                                                                                                                                                                                                      |
| Pilot owner             | Pilot token only; optional accessor on only its secret to retrieve it privately in Console; no Gemini key in the browser                                                                                                                                                                                                         |

If the routine deployer does not already have act-as rights, the administrator grants them to that specific account (replace the non-secret placeholder):

```bash
DEPLOYER='user:YOUR_GOOGLE_ACCOUNT_EMAIL'
for ACCOUNT in "$RUNTIME_SA" "$BUILD_SA"; do
  gcloud iam service-accounts add-iam-policy-binding "$ACCOUNT" --project="$PROJECT_ID" \
    --member="$DEPLOYER" --role=roles/iam.serviceAccountUser
done
```

### C. Future version selection and image build — NOT RUN

Read enabled **version metadata**, then set the two numeric versions you verified. No secret payload is needed in the terminal or repository. Sourcing `vars.sh` preserves these overrides and leaves unknown versions empty.

```bash
gcloud secrets versions list "$GEMINI_SECRET" --project="$PROJECT_ID" --filter=state=ENABLED
gcloud secrets versions list "$ACCESS_SECRET" --project="$PROJECT_ID" --filter=state=ENABLED
# Enter NUMBERS from those lists, not the secret values:
read -r -p 'Enabled Gemini secret version number: ' GEMINI_SECRET_VERSION
read -r -p 'Enabled pilot secret version number: ' ACCESS_SECRET_VERSION
export GEMINI_SECRET_VERSION ACCESS_SECRET_VERSION
[[ "$GEMINI_SECRET_VERSION" =~ ^[1-9][0-9]*$ ]]
[[ "$ACCESS_SECRET_VERSION" =~ ^[1-9][0-9]*$ ]]

gcloud meta list-files-for-upload
RELEASE="$(git rev-parse --short=12 HEAD)"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPOSITORY/backend:$RELEASE"
gcloud builds submit . --project="$PROJECT_ID" --region="$REGION" \
  --config=deploy/cloudrun/cloudbuild.yaml \
  --service-account="projects/$PROJECT_ID/serviceAccounts/$BUILD_SA" \
  --gcs-source-staging-dir="gs://$BUILD_SOURCE_BUCKET/source" \
  --substitutions="_IMAGE=$IMAGE"
DIGEST="$(gcloud artifacts docker images describe "$IMAGE" \
  --project="$PROJECT_ID" --format='value(image_summary.digest)')"
test -n "$DIGEST"
IMAGE_REF="$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPOSITORY/backend@$DIGEST"
```

Inspect the clean checkout/source-file list for unintended media/keys before building. `.gcloudignore` excludes env/key files, local data, videos and tests; secrets are injected **only at runtime**. Cloud Build explicitly uses `server/Dockerfile`; **do not use root `gcloud run deploy --source .`**, which could select frontend buildpacks. No build trigger is created.

### D. Future Cloud Run deployment — NOT RUN

Use the same Cloud Shell session. Numeric versions must refer to enabled versions; do not use `latest`. Inspect an existing service before applying these replacing flags (`--set-env-vars` / `--set-secrets`) to preserve unrelated settings. Do not deploy if trial/tier/permissions remain unverified.

```bash
: "${IMAGE_REF:?Build and verify the image digest first}"
: "${GEMINI_SECRET_VERSION:?Choose an enabled numeric version}"
: "${ACCESS_SECRET_VERSION:?Choose an enabled numeric version}"
[[ "$GEMINI_SECRET_VERSION" =~ ^[1-9][0-9]*$ ]]
[[ "$ACCESS_SECRET_VERSION" =~ ^[1-9][0-9]*$ ]]
gcloud run deploy "$SERVICE" \
  --project="$PROJECT_ID" --region="$REGION" --image="$IMAGE_REF" \
  --service-account="$RUNTIME_SA" --execution-environment=gen2 \
  --port=8080 --cpu=1 --memory=2Gi --min=0 --max=1 --concurrency=8 \
  --cpu-throttling --no-cpu-boost --timeout=600 --ingress=all --allow-unauthenticated \
  --set-env-vars="HOST=0.0.0.0,MAX_UPLOAD_MB=25,FRONTEND_ORIGIN=$FRONTEND_ORIGIN,GEMINI_MODEL=$GEMINI_MODEL" \
  --set-secrets="GEMINI_API_KEY=$GEMINI_SECRET:$GEMINI_SECRET_VERSION,ANALYSIS_ACCESS_TOKEN=$ACCESS_SECRET:$ACCESS_SECRET_VERSION" \
  --startup-probe='httpGet.path=/livez,httpGet.port=8080,initialDelaySeconds=0,timeoutSeconds=5,periodSeconds=10,failureThreshold=12' \
  --liveness-probe='httpGet.path=/livez,httpGet.port=8080,timeoutSeconds=5,periodSeconds=30,failureThreshold=3'
```

Do not add `--use-http2` to this HTTP/1 server or periodic external health pings that keep waking it. Min0/max1 is not a hard monetary limit; platform/revision transitions can briefly exceed the cap. No account upgrade is authorized to resolve a failed command.

### E. Future verification and frontend release — NOT RUN

```bash
URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" \
  --region="$REGION" --format='value(status.url)')"
printf 'Backend URL: %s\n' "$URL"
curl --fail --show-error "$URL/livez"
# Expected: 401, not health/job/configuration data.
curl --silent --output /dev/null --write-out '%{http_code}\n' "$URL/health"
curl --include --request OPTIONS "$URL/analyses" \
  --header "Origin: $FRONTEND_ORIGIN" \
  --header 'Access-Control-Request-Method: POST' \
  --header 'Access-Control-Request-Headers: authorization,content-type,idempotency-key'
```

Verify actual revision settings and IAM in Cloud Console. Publish the reviewed frontend through the existing Pages workflow only with separate authorization, preserving unrelated `main` changes. In Settings, enter the resulting HTTPS URL plus the pilot token retrieved privately from Secret Manager Console. Authenticated health must show **request-stream-v1**, **25 MiB**, **10–300 seconds** and the reviewed model. Reload should forget the token; unauthorized/other-origin requests must not return protected data.

Health/CORS checks above invoke no Gemini. After approving consent/privacy and confirming Free Tier quota, run one 30–60-second boxing clip, keep Safari foreground/unlocked, check complete stream/report delivery, fighter identity, evidence seeking, cancellation and actual usage. A successful live test is a remaining launch gate, not a result claimed by this review. No automatic retries after an uncertain outcome.

## Validation and official references

Current local validation is recorded in [LOW-COST.md](LOW-COST.md). Synthetic providers test contracts and failure handling; they do not establish authentic boxing-analysis accuracy. Cloud commands are syntax-checked only. Physical iPhone Safari, real Cloud Run proxy behavior, effective IAM/secret versions and live model access remain unverified.

- [Container contract](https://docs.cloud.google.com/run/docs/container-contract), [HTTP/1 limits](https://docs.cloud.google.com/run/quotas), [health probes](https://docs.cloud.google.com/run/docs/configuring/healthchecks)
- [Billing settings](https://docs.cloud.google.com/run/docs/configuring/billing-settings), [deploy flags](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy), [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Custom build accounts](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts), [secret integration](https://docs.cloud.google.com/run/docs/configuring/services/secrets)
- [Gemini model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [Free Tier pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite), [quotas](https://ai.google.dev/gemini-api/docs/rate-limits), [terms](https://ai.google.dev/gemini-api/terms)
- [Google Cloud Free Trial restrictions, expiration and free allowances](https://docs.cloud.google.com/free/docs/free-cloud-features)
