# Integrated private camp + OpenAI: first boxing analysis

This is a deployment runbook, not an executed deployment. No Google resource,
IAM, billing, secret value, model access or paid request was changed by the
integration task. Values below come from the repository's prepared deployment
configuration; they are NOT a live-cloud audit. Inspect the existing service
before applying any separately approved change.

## History and scope

The two original commits are preserved verbatim:

- 0237067e417dbd1e33060bfe32ee1d89873f212f: private camp redesign.
- 53062f5c4267191f52997017c49678dcc6d6d72f: OpenAI provider, whose parent is 0237067.

There is no divergent history or merge conflict to resolve. The integration
branch starts at 53062f5, retaining both commits as ancestors. Local preservation
refs and a verified Git bundle were created before changes; the original
branches/worktrees were left intact. The pushed integration history preserves
both commits remotely too.

No UI was rebuilt. Vince's dashboard, profiles, opponents, planning, coaching
findings, comparisons, backup/recovery, report reader and NDJSON transport are
retained. Gemini remains the manually selectable fallback. New work corrects
long-context price accounting, adds an opt-in pre-generation budget guard, adds
one real-decoder/adapter/browser integration regression, and documents release
configuration. The existing IAP gateway and deployment workflows are unchanged.

## Integration verification

Checked locally on 2026-11-11 (UTC):

| Check | Result |
| --- | --- |
| npm test | 105 tests passed across 11 files |
| npm run test:e2e -- --timeout=90000 | 28 browser tests passed |
| npm run typecheck | Passed, including frontend, backend and tests |
| npm run lint | Passed |
| npm run build | Passed, production Vite build |
| git diff --check | Passed |

Coverage includes provider outputs/refusals/incomplete JSON, invalid evidence,
authentication/CORS, provider errors, cancellation, request-stream-v1 stages,
inline completion and replay, upload limits, long-context costs, and budget
preflight failures. The added browser regression uses actual FFmpeg decoding,
the OpenAI adapter with synthetic API responses, the existing NDJSON reader,
usage receipts and linked camp session/profile/plan data. No test sends a paid
request or proves real-world coaching accuracy. Both original worktrees remain
clean and both original commits remain unchanged ancestors of this branch.

## Verified OpenAI model and prices

The currently configured gpt-6-astra ID is documented, not an unsupported ID.
The official model page lists text/image input, Responses API support and
Structured Outputs. The images guide supports high image detail; the structured
output guide uses this model with JSON schemas. high reasoning remains supported.
OPENAI_MODEL remains configurable. No replacement was needed.

This is verification of published API availability and compatibility, not this
account's entitlement. No OpenAI key is configured in this execution environment,
so live account access and coaching accuracy remain unverified. Before a paid
attempt, check account access with a metadata-only GET /v1/models/gpt-6-astra
using the intended project key, and confirm current prices. Do not use a Google
Vertex/preview model ID; this adapter calls api.openai.com directly.

Published standard prices checked 2026-11-11 (UTC), USD per 1M tokens:

| Input context | Input | Cached reads | 30m cache writes | 12h cache writes | Output, including reasoning |
| --- | ---: | ---: | ---: | ---: | ---: |
| At most 272,000 input tokens | 10 | 1 | 12.50 | 25 | 50 |
| More than 272,000 input tokens | 20 | 2 | 25 | 50 | 75 |

The higher rates apply to the WHOLE long-context request, not just the excess.
The previous estimate omitted this distinction; the integration corrects it.
Reasoning tokens remain a subset of output and are not charged twice in the
calculator. Unknown returned model/tier/counter details still yield a null
estimate rather than invented pricing.

Sources:
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/guides/images-vision
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/token-counting
- https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count
- https://cloud.google.com/run/docs/configuring/services/secrets
- https://cloud.google.com/sdk/gcloud/reference/run/services/update

## The $5 test plan

Use ONE isolated generation, not a retry loop or model comparison. A $4.50
per-generation guard leaves $0.50 room inside the $5 API test allowance. It is
not a durable account-wide spending cap: repeated requests, different instances,
restarts, other projects/keys, price changes, service fees and taxes are not
controlled by this application. Cloud hosting costs are separate. OpenAI budget
alerts alone are not a hard spending stop. If the first request fails or usage
is ambiguous, stop and reconcile spend before authorizing any next attempt.

Set OPENAI_MAX_REQUEST_USD=4.50. The server first calls the non-generating
Responses input-token endpoint with the same model, instructions, images,
schema, reasoning configuration and tools. Counts are not guessed from bytes or
video size. It then calculates ordinary uncached input plus the FULL output cap
at the verified standard rates, including the long-context threshold. Generation
is refused if the amount exceeds the limit or the count/pricing is unavailable.
The count call also sends the images to OpenAI; obtain footage consent first.
No counting or generation request was made during development; tests mock both.
This bound is for generation at the checked list prices, not an invoice or an
account-wide billing guarantee.

For the first approved test, use 32,768 max output tokens. This leaves more room
for high-effort reasoning and structured coaching than the unchanged 16,384
default. At 50,000 uncached input tokens its conservative generation bound is
$2.1384. At 272,000 input tokens it is $4.3584. Above that threshold the higher
rates trigger the $4.50 guard before generation. These are bounds, not measured
clip prices; actual token usage is returned after the attempt. One rejected or
invalid report may still have incurred inference usage.

No tools, premium service tier, automatic retries, automatic Gemini fallback,
implicit cache writes for GPT-6 or second model calls are enabled. The selected
provider is openai, the service tier is default and caching is explicit-only
without breakpoints. General model configurability is preserved; with the budget
guard enabled an unknown-priced model fails closed until its pricing is reviewed.
Do not disable the guard just to force a rejected clip through.

## Exact existing Google Cloud target

| Item | Value / required state |
| --- | --- |
| Project | feint-identifierq |
| Project number | 334840153796 |
| Region | us-central1 |
| Existing API service | identifier-q-api |
| Runtime identity | identifier-q-runtime@feint-identifierq.iam.gserviceaccount.com |
| Existing artifact image base | us-central1-docker.pkg.dev/feint-identifierq/identifier-q/backend |
| New secret name | identifierq-openai-api-key |
| New runtime binding | OPENAI_API_KEY=identifierq-openai-api-key:ENABLED_NUMERIC_VERSION |
| Existing pilot secret | identifierq-pilot-token, preserve its current enabled numeric binding to ANALYSIS_ACCESS_TOKEN |
| Existing Gemini secret | identifierq-gemini-api-key, preserve its current enabled numeric binding to GEMINI_API_KEY |
| Existing model fallback | GEMINI_MODEL=gemini-3.5-flash-lite; manually select ANALYSIS_PROVIDER=gemini to use it |

Grant the runtime identity roles/secretmanager.secretAccessor on ONLY the new
OpenAI secret. Do not grant secret payload access to build/CI identities or the
frontend. Do not recreate/rotate the existing pilot or Gemini secrets. Use a
restricted OpenAI PROJECT key; do not place an organization admin key in Cloud
Run to read cost data. Never use VITE_OPENAI_API_KEY or a plain text Cloud Run
environment variable for the key.

Preserve the current gen2, 1 vCPU/2 GiB, min=0/max=1, request-based CPU, no startup
CPU boost, concurrency 8, 600-second request deadline, injected PORT=8080,
/livez probes, and single-heavy-analysis application limit. Do not add an
always-on worker, GPU, queue, bucket, database or load balancer for this test.
Do not change ingress, invoker IAM, IAP, pilot authentication or origin policy
implicitly. If live settings differ from the expected configuration, stop and
review them rather than applying replacement flags.

## Future owner/operator steps — NOT run by this task

The following are separate cloud mutations requiring explicit release approval.
First obtain an immutable image digest built from the pushed integration commit
using server/Dockerfile and the existing registry. The private UI is not part of
that API image. Building/pushing through Cloud Build/Artifact Registry can incur
charges and is not authorized or triggered by this task. Do not dispatch old
prepare/cloud-run automation against a different source branch or silently
change its trust guards. Do not deploy an older Gemini-only image and expect
setting an OpenAI environment variable to install the adapter.

Before any mutation, inspect metadata and save a private rollback snapshot:

```sh
umask 077
IQ_REVIEW_DIR=$(mktemp -d)
gcloud run services describe identifier-q-api \
  --project=feint-identifierq --region=us-central1 --format=json \
  > "$IQ_REVIEW_DIR/service-before.json"
gcloud run services get-iam-policy identifier-q-api \
  --project=feint-identifierq --region=us-central1 --format=json \
  > "$IQ_REVIEW_DIR/iam-before.json"
gcloud secrets describe identifierq-openai-api-key --project=feint-identifierq
```

Keep snapshots private: incorrectly configured services could contain literal
secret values in metadata. Do not upload them to GitHub or paste them in chat.
A permission error is not proof the secret is missing. Only if metadata confirms
that the new secret does not exist, create it after approval:

```sh
gcloud secrets create identifierq-openai-api-key \
  --project=feint-identifierq --replication-policy=automatic
```

Add the API key as a new secret version privately through Secret Manager Console
(the payload never enters Git, shell arguments or chat). Inspect enabled numeric
versions, and grant only the runtime identity access to this secret:

```sh
gcloud secrets versions list identifierq-openai-api-key \
  --project=feint-identifierq --filter=state=ENABLED
gcloud secrets add-iam-policy-binding identifierq-openai-api-key \
  --project=feint-identifierq \
  --member=serviceAccount:identifier-q-runtime@feint-identifierq.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

The actual version and image digest are unknown until the authorized secret and
build steps occur. Do not assume version 1 or use latest. Set the two non-secret
references below from verified metadata, then apply ONE approved service update.
The update creates a revision and can send traffic to it; do not run it merely
as a configuration check:

```sh
IQ_OPENAI_VERSION=REPLACE_WITH_ENABLED_NUMERIC_VERSION
IQ_IMAGE_DIGEST=REPLACE_WITH_APPROVED_SHA256_DIGEST
[[ "$IQ_OPENAI_VERSION" =~ ^[1-9][0-9]*$ ]] || exit 1
[[ "$IQ_IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 1

gcloud run services update identifier-q-api \
  --project=feint-identifierq --region=us-central1 \
  --image="us-central1-docker.pkg.dev/feint-identifierq/identifier-q/backend@$IQ_IMAGE_DIGEST" \
  --update-secrets="OPENAI_API_KEY=identifierq-openai-api-key:$IQ_OPENAI_VERSION" \
  --update-env-vars="ANALYSIS_PROVIDER=openai,OPENAI_MODEL=gpt-6-astra,OPENAI_REASONING_EFFORT=high,OPENAI_MAX_OUTPUT_TOKENS=32768,OPENAI_MAX_REQUEST_USD=4.50,HOST=0.0.0.0,MAX_UPLOAD_MB=25,FRONTEND_ORIGIN=http://127.0.0.1:5173"
```

The update flags preserve unrelated environment/secrets and existing resources,
service identity and IAM. Do not replace them with --set-env-vars/--set-secrets,
--allow-unauthenticated or invoker/IAP changes. Retain the existing pilot/Gemini
bindings and existing probes. Standard outbound HTTPS to api.openai.com must be
allowed by the service's existing network policy; do not disable TLS verification.
Node uses the inherited proxy/CA settings. No Google model/Vertex API or billing
activation is needed for a direct OpenAI provider call.

After the approved release, verify metadata, image digest, readiness, numeric
secret bindings and unchanged resources/IAM. GET /health with the pilot token
should advertise OpenAI/gpt-6-astra/request-stream-v1/25 MiB/10–300 seconds.
Missing/incorrect pilot tokens must return 401; an unapproved origin must return
403. Health and these negative checks invoke no analysis model. No automatic
rollback or repeat analysis should follow a failed check; the service may already
have changed. Review the saved prior revision/configuration before a separately
authorized rollback.

## Private frontend and one-clip acceptance procedure

For this immediate pilot, use the preserved camp UI LOCALLY on the coach's trusted
computer with npm run dev at http://127.0.0.1:5173. This is why the approved test
configuration above uses that exact frontend origin. It intentionally stops the
public Pages client from uploading through this origin policy; do not publish
this private branch to Pages. Existing ingress/IAP restrictions can further
require an already approved access path; never relax them to make this test work.

The server/camp-main.ts IAP host is retained as a private-host candidate, not
claimed to implement a same-origin analysis proxy/shared database. Its CSP permits
same-origin connections. A remotely hosted two-person frontend needs the separate
reviewed IAP/identity and API-routing release described in PRIVATE-CAMP-ARCHITECTURE.md.
This integration does not create that host or pretend its /api/* placeholders
are working analysis endpoints. Local profile/plan/history remain browser-local;
back up before changing origin or browser. No data migration is performed.

Before the paid attempt, verify project-key access without generation in a local
ignored environment file using a metadata-only request:

```sh
node --use-env-proxy --env-file=.env.openai-test.local --input-type=module - <<'JS'
const r = await fetch('https://api.openai.com/v1/models/gpt-6-astra', {
  headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
});
if (!r.ok) throw new Error(`Model access check failed: HTTP ${r.status}`);
const model = await r.json();
if (model.id !== 'gpt-6-astra') throw new Error('Unexpected model identity');
console.log({ model: model.id, generationRequested: false });
JS
```

Supply that local key privately; this command was not executed. Public docs
establish modalities/schema compatibility; account access is a separate gate.
A 401/403/404 must be resolved without guessing alternative model IDs or sending
a paid generation. No secret payload access is needed by the frontend.

In the local camp Settings, connect to the approved Cloud Run service URL and
enter ONLY the existing pilot session token. Select one consented 30–60-second
boxing clip, no larger than 25 MiB. Use the existing pilot entry in Analysis
center; confirm Vince with a clear reference frame and submit ONCE. Keep the tab
foreground. Do not test 1 GB uploads, kickboxing, camera-cut tracking or replays.

Accept a result only if the coach confirms fighter identity, true source-frame
links, mechanically credible diagnosis, supported tactical consequences,
actionable correction/drill/dosage and candid uncertainty. Sparse frames cannot
prove fast exchanges, exact strike times or measured punch counts. A polished
but unsupported report fails the evaluation. The integration's synthetic
black-footage test validates mechanics, not authentic coaching quality.

Capture the job ID and sanitized analysis_provider_usage log/receipt. The
existing authenticated GET /analyses/JOB_ID/usage includes preflight bounds,
actual input/cached/write/output/reasoning tokens, returned model and estimated
list cost. The in-memory endpoint can expire or miss across instances; retained
operational logs and OpenAI usage are the fallback, not another inference. Check
actual account spend for the isolated project/window before considering another
attempt. Failure/incomplete output can be billable. Stop after the first attempt
until its usage is reconciled. Do not auto-fallback to Gemini within the budget.

To use Gemini later, preserve its current enabled secret/model and select
ANALYSIS_PROVIDER=gemini through a separately approved configuration change.
That creates a revision; it is not a client-side or automatic fallback.
