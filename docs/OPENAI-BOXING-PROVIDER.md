# OpenAI short-clip boxing provider

Original provider branch: feature/openai-boxing-provider, based on the local private
camp rebuild (0237067). No deployment, billing change, resource creation,
credential creation, or real provider invocation was performed for this change.

For the integrated release, current pricing, the $5 guard and exact Google Cloud
configuration, use [PRIVATE-CAMP-OPENAI-DEPLOYMENT.md](PRIVATE-CAMP-OPENAI-DEPLOYMENT.md).
The integration preserves this provider and adds optional OPENAI_MAX_REQUEST_USD.

## Model choice

Default: gpt-6-astra, high reasoning effort, high image detail, standard service
tier, maximum 16,384 output tokens including reasoning. Current OpenAI docs
identify Astra as the highest-capability model and support image input and
Structured Outputs. This is a quality-first starting point, not a benchmark
claim about boxing coaching. Model access remains account-dependent.

OPENAI_MODEL changes the model without code changes. For a later controlled
comparison, gpt-6.1-sol is a lower-cost candidate. Use a model that supports
Responses API vision, reasoning and Structured Outputs. Unsupported parameters
or lack of model access fail explicitly; there is no silent model downgrade.
Model aliases can change; keep the returned model ID and evaluation date.

Sources checked 2026-11-10 (America/Chicago):
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/models
- https://developers.openai.com/api/docs/guides/images-vision
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/reference/resources/responses/methods/create
- https://developers.openai.com/api/docs/guides/prompt-caching

## What changed and what stays intact

The OpenAI adapter implements the existing VideoAnalysisProvider boundary. It
calls POST https://api.openai.com/v1/responses using native fetch, with the key
only in the server's Authorization header. No SDK retry behavior, new runtime
dependency, provider tools, background job, remote media URL or Files API upload
is involved. store=false disables retrievable response storage; it is not a
promise of zero provider retention. Review the account's data controls and
obtain permission from the people in the footage before a live test.

The camp branch still had the historical detached backend handler. This branch
brings over the reviewed request-bound server/app.ts and streaming regressions
from prepare/cloud-run. This aligns local backend source with the existing
request-stream-v1 frontend/live protocol, rather than creating a new transport.
All frontend files, IAP identity gateway, bearer authentication, exact-origin
CORS policy, Docker files, workflows and cloud deployment configuration remain
unchanged. /livez remains a minimal metadata-free probe; protected endpoints
still require the pilot token. Usage access uses that same existing boundary.

The original 25 MiB, boxing-only, 10–300-second pipeline and FFmpeg preprocessing
remain. Up to 120 decoder-timestamped JPEGs cover the whole clip, plus up to five
point-marked fighter identity references. Existing images are at most 640 pixels
on their longest side. The adapter does not upgrade the video/frame extraction
system or implement continuous motion tracking. A 1 GB upload is not accepted.

The prompt treats metadata, names, image text and notes as untrusted data. It
asks for precise visible observations, mechanical/tactical diagnosis,
consequences, corrections, specific drills/dosage/cues, priority and uncertainty.
Guard, balance, distance, combinations, counters, feints, positioning and
adaptation are considered only where the sampled evidence supports them.
Hypotheses are labelled. No chain-of-thought transcript, invented punch counts,
confidence percentages or exact strike timestamps are requested.

Strict JSON-schema output is checked again with bounded Zod schemas. Findings
must cite distinct supplied sequence frames; identity-reference images and
unknown IDs cannot be technical evidence. A recurring-pattern claim requires
multiple source moments, but that check does not establish repetition by itself:
the coach must still rule out the same exchange and replays. Ambiguous identity
returns no personalized assessment. Malformed/truncated/refused responses,
unsupported claims and incomplete outputs never become saved partial reports.

Coaching fields map into the current report schema, including evidence links,
interpretation labels, primary/secondary priorities, drills and tactical
adjustments. Scores and confidence remain null. The existing frontend needs no
change. The API continues to send NDJSON stage/heartbeat events, then one
validated result or terminal error. OpenAI's upstream response is buffered JSON
(stream=false); unfinished model JSON is never forwarded as a report.

The Gemini implementation is retained. It is a manual fallback selected with
ANALYSIS_PROVIDER=gemini, not an automatic second paid call after failure.
Blank ANALYSIS_PROVIDER preserves the previous Gemini behavior. An OpenAI key
alone does not opt the application into OpenAI.

## Server configuration

Only after approving the provider, consent and a first-test spending allowance,
create an ignored, permission-restricted local environment file. Do not commit
it, paste secrets into chat, or enter the OpenAI key into frontend Settings.

```sh
umask 077
cp -n .env.example .env.openai-test.local
chmod 600 .env.openai-test.local
```

Edit that file privately with these settings (supply real secrets locally):

```dotenv
ANALYSIS_PROVIDER=openai
OPENAI_API_KEY=<server-only project API key>
OPENAI_MODEL=gpt-6-astra
OPENAI_REASONING_EFFORT=high
OPENAI_MAX_OUTPUT_TOKENS=16384
ANALYSIS_ACCESS_TOKEN=<privately generated random pilot token of at least 32 characters>
FRONTEND_ORIGIN=http://127.0.0.1:5173
HOST=127.0.0.1
PORT=8787
```

The output-token setting accepts 1,024–32,768. Reducing it can truncate reasoning
or the structured report; incomplete output fails rather than being repaired
with another paid call. The provider timeout is 210 seconds inside the existing
240-second processing timeout. No Cloud Run timeout or resource limit changed.
The request payload is capped at 19 MiB and the upstream response at 2 MiB.

For current GPT-6 models, explicit-only prompt caching with no cache breakpoints
avoids paying to write one-off clip images into an implicit cache. Other model
families retain API defaults; review their parameter/caching compatibility.
No extended cache TTL or premium service tier is enabled.

If no provider is configured, uploads retain the existing 503 behavior. Missing
keys for an explicitly selected provider stop startup. Provider HTTP errors,
network ambiguity, cancellation and timeouts do not cause automatic retries,
provider switches or additional model calls. Previously accepted work may still
be charged after a disconnect or timeout.

## One real boxing clip: procedure (not executed)

1. Choose one consented stationary-camera boxing clip, preferably 30–60 seconds
   for the first evaluation, within the existing 10–300-second/25 MiB limits.
   Use a decodable MP4/MOV; HEVC browser playback is device-dependent. Keep the
   original outside the repository/build context. Have the coach independently
   note a few visible sequences and uncertainties before reading model output.
2. Confirm OpenAI project/model access and approve a small explicit spending
   allowance. The token cap is not a dollar cap; image input, reasoning and
   failed attempts may cost money. OpenAI API billing is separate from ChatGPT.
   Project budget notifications may not be hard spending stops. No billing
   activation is part of this implementation.
3. Start the existing backend locally with the restricted environment file:

   ```sh
   node --use-env-proxy --env-file=.env.openai-test.local --import tsx server/main.ts
   ```

   Startup does not call OpenAI. Run npm run dev in another terminal and open
   http://127.0.0.1:5173. Do not expose the Vite server or local backend remotely.
4. In Settings, connect http://127.0.0.1:8787 using the PILOT SESSION TOKEN,
   never the OpenAI key. Health should show OpenAI, the intended model,
   request-stream-v1 and the 25 MiB limit. Health invokes no analysis model.
5. In Analysis center, use "Open existing 25 MiB pilot". Select the clip,
   identify Vince with at least one clear confirmation frame, confirm boxing
   and the desired focus, then submit ONCE. Keep the tab foreground. Expect
   decoding, analyzing, validating and cleanup stages and an inline report.
6. Verify that timestamp links open actual source images/locations. The coach
   should assess identity, source support, diagnostic specificity, tactical
   consequences, drill usefulness and uncertainty. Reject unsupported motion,
   counts, tactical intent or a claim that merely looks sophisticated. Frame
   timestamps are not exact punch measurements. Record failures as evaluation
   results; do not automatically buy another attempt.
7. Capture the usage receipt below. Record the job ID from the report URL, or
   from the sanitized analysis_provider_usage log after a failed attempt.
   The receipt's status describes the provider response, not final coaching
   truth or subsequent report validation/cleanup. An identity rejection can
   still have a completed, billable provider response.
8. Compare the assessment to the coach's independent notes. Save/export only
   useful, reviewed findings. Stop the local processes and remove the temporary
   environment file when finished. Keep any desired token/cost receipts in a
   private folder outside source control. Do not run a Gemini comparison until
   that additional call is explicitly approved.

## Actual usage and cost

Every attempted OpenAI fetch emits one sanitized operational JSON log through
server/main.ts. It contains the job ID, requested/returned model, OpenAI request
and response IDs, service tier, status, token counts, and an optional list-price
estimate. No key, video, frame data, athlete metadata, prompt or raw response is
logged. Incomplete/invalid assessments retain usage when OpenAI supplied it.
No response/usage means unknown cost, not zero cost.

During the 15-minute in-memory job retention window, the same receipt is
available at GET /analyses/JOB_ID/usage using the existing pilot authentication.
It is optional for report completion and can disappear after restart or if a
follow-up request reaches a different Cloud Run instance. A 404 never proves
no usage occurred. Operational logs preserve the emitted receipt independently
of the ephemeral API cache, subject to the host's logging configuration.

To inspect a local receipt without putting either secret in command-line
arguments, run this in the backend checkout with JOB_ID replaced by its UUID:

```sh
node --use-env-proxy --env-file=.env.openai-test.local --input-type=module - JOB_ID <<'JS'
const id = process.argv[2];
if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Use the analysis job UUID');
const response = await fetch(`http://127.0.0.1:8787/analyses/${id}/usage`, {
  headers: { authorization: `Bearer ${process.env.ANALYSIS_ACCESS_TOKEN}` },
});
if (!response.ok) throw new Error(`Usage request failed: HTTP ${response.status}`);
console.log(JSON.stringify(await response.json(), null, 2));
JS
```

Use the returned actual counters. Input includes visual input tokens. Reasoning
tokens are a subset of output tokens and must NOT be added again. At the checked
standard Astra list rates, let I=input, C=cachedInput, W=cacheWrites,
W30=cacheWrites30m, W12=cacheWrites12h, and O=output:

```
up to 272K input: ((I-C-W)*10 + C*1 + W30*12.5 + W12*25 + O*50) / 1,000,000
above 272K input: ((I-C-W)*20 + C*2 + W30*25 + W12*50 + O*75) / 1,000,000
```

The threshold selects the rates for the entire request. The code computes this
only for the exact known model/standard tier and valid
counter details. Missing cache details, different model IDs, nonstandard tiers
or inconsistent totals produce a null estimate. For a different model, use its
current published rates and the same measured counters; never reuse Astra rates.

Synthetic arithmetic example ONLY: I=12,000; C=4,000; W30=3,000; W12=4,000;
O=1,000 gives $0.2015 at these rates. That is not a measured real-clip cost.
The actual first-clip price is unknown until the approved request is made.
Rates can change and negotiated pricing, regional processing, taxes/credits and
other adjustments can differ. Reconcile the receipt/model/project/time window
with the OpenAI Usage dashboard and organization Costs data for the authoritative
actual spend. A dedicated project and one isolated test window make that check
clearer. Do not give the runtime an organization admin key just to read billing.

## Validation and deployment boundary

All tests use synthetic provider payloads and generated black codec footage.
They check multimodal requests, output validation, evidence/drill mapping,
OpenAI authentication errors, pilot/IAP access controls, provider failure,
cancellation, token arithmetic and actual HTTP streaming/replay. They do not
establish coaching accuracy or paid account access.

Deployment is a separate future action. The existing cloud workflow is not
modified to bind the new secret or select OpenAI. A later approved release must
supply OPENAI_API_KEY through server-side secret management, select the model/
provider explicitly, verify allowed network access to api.openai.com and retain
all existing authentication, origin restrictions, resource limits and privacy
hosting gates. No frontend redeployment is required for this provider adapter.
Do not publish the private frontend to GitHub Pages.

Validation completed locally: 101 unit tests and 27 Chromium browser tests
passed, along with type checking, lint, production build and git diff --check.
The built frontend asset hashes match the private-camp baseline; no OpenAI key
handling, prompt, or synthetic OpenAI fixture was bundled into the frontend.
