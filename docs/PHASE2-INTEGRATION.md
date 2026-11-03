# Phase 2: the first authentic boxing analysis

## Implemented versus validated

The repository now includes a working private-pilot transport and media pipeline:

1. User explicitly connects a separately hosted backend in Settings with its URL and a session access token. The token exists in memory only; it is not a provider key and is not written to localStorage, URLs, GitHub Pages configuration, or the bundle.
2. A selected **10-second to 5-minute** video, fighter metadata, stable subject ID, and up to five normalized identity reference points/times are submitted by authenticated multipart POST. Local selection alone sends nothing.
3. The backend enforces a **25 MiB** limit, permitted media types, boxing configuration, reference-frame requirements, and single-worker concurrency. ffprobe verifies the real video track, dimensions (4K maximum), and actual duration rather than trusting browser metadata. ffmpeg permits only local file/pipe protocols and MOV/MP4/Matroska/WebM demuxers.
4. ffmpeg decodes at most 120 sequence frames across the **whole** clip, plus up to five identity frames. Short clips are sampled at up to 2 FPS; a five-minute clip has approximately 2.5 seconds between sequence samples. Decoder PTS supplies source-frame times; the model never supplies timestamps.
5. The server-only provider adapter sends JPEG frames, source IDs/times, and identity hints to Google's Gemini API over HTTPS. Audio is not transmitted. The original video does not go to Google in this implementation. No provider request is made until the user submits a connected, configured pilot.
6. Structured findings must confirm the subject and cite actual sequence frame IDs. Unknown frames, unconfirmed identity, malformed responses, provider refusals/truncation, or out-of-bounds evidence fail the job. Observations are labeled model interpretations. All numerical scores and confidence values remain null.
7. The frontend receives real stage updates and the validated report in the same open response, saves it to browser history, and opens the existing report interface. Source-frame links seek in reattached original footage. These are **verified source-frame locations, not verified strike timing or independent fact-checking**.

HTTP transport, media decoding, job lifecycle, and report rendering are tested using explicitly synthetic provider adapters. No live Gemini request or authentic fight assessment has been run. Provider access, model accuracy, identity quality, latency, and real token usage remain unvalidated. The exact existing-secret mapping and Free Trial/Free Tier restrictions are in the [deployment readiness runbook](../deploy/cloudrun/README.md).

## Recommended provider and API

**Google Gemini API, `gemini-3.5-flash-lite`**, through the isolated `VideoAnalysisProvider` interface in `server/provider.ts`. The official model documentation lists image/video inputs and structured outputs. It is a cost-efficient candidate for an initial qualitative pilot, not a validated striking-analysis model. Benchmark it against stronger models before making performance claims.

Current official documentation was checked on 2026-11-03:

- [Model capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [Video understanding and sampling limitations](https://ai.google.dev/gemini-api/docs/video-understanding)
- [Pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)
- [Terms and data handling](https://ai.google.dev/gemini-api/terms)

Gemini 2.5 Flash was considered but is deprecated and its documentation announces automatic rerouting beginning December 1, 2026. The default avoids that impending migration. `GEMINI_MODEL` is a server-side override; a changed model needs fresh evaluation, and its name is recorded in each report.

The adapter calls `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with `x-goog-api-key`, inline image parts, a bounded structured-response schema, and an 8,192-token maximum output. It does not request search grounding, tools, code execution, or external URLs. A 19 MiB serialized request guard prevents oversized provider calls. There are no automatic paid retries or invented fallback findings.

## Approved Free Tier boundary and costs

The current prototype plan uses **Gemini Free Tier only**, with `gemini-3.5-flash-lite`. Its documented Standard input/output pricing is free of charge within active project quotas; the model supports image/video inputs and structured outputs. The adapter sends JPEG frames, not the original video/audio. Confirm the key-owning project still shows **Free** in AI Studio; a model ID cannot enforce billing tier. No automatic retry/model switch or paid API upgrade is implemented. A quota error tells the owner not to enable paid billing.

The prior paid-tier token estimates are superseded by the [current free-tier/trial-only deployment plan](../deploy/cloudrun/README.md) and [separate cloud cost estimates](../deploy/cloudrun/LOW-COST.md). **Google Cloud's $300 trial credit cannot pay Gemini API in AI Studio charges.** Cloud compute/storage/build usage must fit eligible shared free allowances or remaining valid trial credits. Do not upgrade either billing account or activate paid Gemini.

Free-service data handling can permit product improvement/human review; review Google's current terms and use appropriate, consented footage. Privacy concerns are not permission to purchase a paid tier. No real footage, provider credential, paid service, or hosted backend has been used here.

## Simplest viable hosting

One **Node 24 container with ffmpeg/ffprobe**, one analysis request per instance, ephemeral writable `/tmp`, and HTTPS supplied by Cloud Run. The current recommendation is Cloud Run request-based billing with min=0; see LOW-COST.md for the executable plan. Plan roughly **1 vCPU / 2 GB RAM** for the private pilot because a multipart file may occupy up to 25 MiB and decoding high-resolution media is memory intensive. The Dockerfile is `server/Dockerfile`; it runs as the unprivileged `node` user. Build it with `docker build -f server/Dockerfile -t identifier-q-pilot .`; configure server-only secrets at runtime rather than as image build arguments. The pipeline has been executed directly in the cloud machine. The Docker image was built and started locally; authentication, limits, and actual ffmpeg frame decoding were verified in the container. No hosted backend is deployed.

The original $10–$30/month generic hosting allowance is superseded by the scale-to-zero estimates in [LOW-COST.md](../deploy/cloudrun/LOW-COST.md). Check current resource pricing before authorizing deployment. GitHub Pages remains the static frontend and cannot run this server. A request-time-limited edge function is a poor fit for ffmpeg and multi-minute analysis. Use one replica: jobs and idempotency state are in memory. Multiple replicas require shared durable job storage and routing before use.

Backend-only environment configuration:

| Variable                | Purpose                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GEMINI_API_KEY`        | Authorized Google API secret; absent means provider unavailable                                                          |
| `GEMINI_MODEL`          | Defaults to `gemini-3.5-flash-lite`                                                                                      |
| `ANALYSIS_ACCESS_TOKEN` | At least 32 random characters, generated/managed securely by the owner; grants access to the entire private pilot's jobs |
| `FRONTEND_ORIGIN`       | Exact allowed origin, e.g. `https://quddha16-pixel.github.io` (no repository path or trailing slash)                     |
| `HOST`                  | Loopback by default; container sets `0.0.0.0`                                                                            |
| `PORT`                  | Defaults to 8787                                                                                                         |

`.env.example` contains no credentials. After explicit approval of the provider/hosting arrangement, configure secrets through the host's secret manager, or use an ignored local file:

```sh
npm ci
node --use-env-proxy --env-file=.env.server --import tsx server/main.ts
```

For local development, set `FRONTEND_ORIGIN` to the exact origin used to open Vite (`http://localhost:5173` and `http://127.0.0.1:5173` are different origins). The server requires the access token even when the provider is unconfigured. The server command honors inherited HTTP(S) proxy settings using Node’s `--use-env-proxy`; preserve configured CA trust in managed environments. Never disable TLS verification. Connect in Settings, then submit explicitly. Never enter a Gemini key in the browser. Do not set secret `VITE_` variables or embed keys in GitHub Actions. The Pages workflow remains a static deployment and only adds ffmpeg as a test prerequisite.

## API and operation

All endpoints except CORS preflight and the minimal `/livez` probe require `Authorization: Bearer <session access token>`. Only the configured browser origin is permitted; all responses use `Cache-Control: no-store`. This is **single-owner pilot authentication**, not multi-user account/athlete isolation. Anyone with the pilot token can access every current pilot job. Keep it private; separate multi-user authorization is a production prerequisite.

- `GET /health`: authenticated backend/provider configuration and size/duration limits. Configured does not mean model access or quality has been verified.
- `POST /analyses`: authenticated multipart `metadata` and `video`. The response remains open and streams real stages, then the complete validated report after cleanup, using `request-stream-v1`. A UUID `Idempotency-Key` protects duplicate successful submissions within a warm instance only. Busy requests get 429; no automatic retry is performed.
- `GET /analyses/:id/status`: real queued/processing/completed/failed/canceled state; no fabricated percentages.
- `GET /analyses/:id/report`: optional best-effort cached report; not used to retrieve the result of a successful streamed request.
- `GET /analyses`: temporary completed pilot reports.
- `DELETE /analyses/:id`: best-effort cancellation, or deletion of a completed/failed server result. Canceling a request already sent to a provider does not guarantee zero provider usage/cost.

Provider processing has a four-minute timeout; media subprocesses have 45-second timeouts. The browser request deadline is nine minutes, below Cloud Run’s ten-minute request timeout. Job caches do not survive restarts/scale-to-zero. Browser abort/disconnect cancels the primary stream and attempts to abort FFmpeg/provider work; cancellation and no-charge outcomes cannot be guaranteed after a proxy/provider has accepted work. Do not blindly retry an ambiguous outcome. Durable processing/resume after disconnect requires the separately evaluated Jobs/storage design.

## Retention and privacy

- Original video and decoded JPEGs use an ephemeral private job directory and are removed in a `finally` block after completion, failure, timeout, or cancellation. The service does not retain videos intentionally. A hard process/container crash can bypass cleanup; use ephemeral disk and a host-level cleanup/retention policy before production. No secure-erasure claim is made.
- Completed/failed/canceled job metadata and reports are held in server memory for approximately 15 minutes (expiry checked on API access) or until deletion/restart. In-progress jobs are bounded by timeouts. Up to 20 temporary jobs are retained.
- Browser reports and settings retain the existing localStorage behavior. Videos and identity reference points are session-only; reload requires selecting footage and reconfirming references. There is no cloud report backup or user account.
- Google receives only sampled images plus fighter identification/notes, and its terms/retention apply separately. No provider-side storage deletion or zero-retention guarantee is claimed. Minimize notes and obtain consent/rights for all identifiable people in footage, especially minors. Do not send sensitive footage through an unreviewed free tier.
- Request logs are disabled to avoid accidental bearer/video metadata logging. Production still needs host-level security, patching, monitoring, user authentication, data-region/retention review, per-owner quotas, and a durable job/ownership model.

## What this cannot reliably do

This is sparse-frame qualitative review, not continuous tracking or exact event detection. Rapid punches can happen between samples; five-minute clips have much wider gaps. A model can mistake the selected fighter, miss an occlusion, or hallucinate a plausible technical finding. It may refuse to confirm identity, producing a clear failure rather than a fabricated assessment. User frame points are hints, not bounding boxes or proven identity. No exact punch counts, accuracy, power, calibrated confidence, tactical intent, numerical grades, or psychological assessments are produced. Kickboxing remains fully configurable locally and can render authentic imported reports, but this first live provider rejects kickboxing jobs pending ruleset-specific validation.

## Concrete real-footage validation protocol

1. Obtain permission to process a clear 30–60-second boxing clip (supported envelope is 10–300 seconds, ≤25 MiB). Start with a single continuous camera view; include both fighters and a visible identifying feature.
2. Have a coach independently record which fighter is the subject and 3–5 visible, source-frame-verifiable observations. Do not use the model output as ground truth.
3. After provider/hosting approval, configure backend secrets securely and verify `/health` through Settings. This tests connection/configuration, not provider authorization until an analysis is submitted.
4. Select footage, choose the subject by method plus notes, and add 2–3 confirmation frames before/after the fighters change sides. Select boxing and technical breakdown, then review the transfer/privacy notice and explicitly generate.
5. Verify the report keeps the exact subject/configuration. Reattach the original video, check every cited source frame, compare each interpretation with the coach's observations, and record false positives/identity mistakes. Scores must remain Not assessed.
6. Repeat with occlusion and camera cuts; the expected behavior for ambiguous identity is a refusal/failure, not confident tracking. Repeat at 10 and 300 seconds to assess sampling gaps and resource use.
7. Record actual provider token usage/cost, latency, media decode time, identity accuracy, evidence validity, unsupported conclusions, and cleanup behavior. Do not claim a functioning validated analysis product until this evaluation passes. If the lightweight model fails, benchmark a stronger provider through the same interface before further UI changes.

**Next credential-dependent action:** approve a provider tier/privacy arrangement and a backend host, configure the server-only Gemini key and pilot access secret securely, then run that first consented real clip. No secret value should be sent in chat. Everything up to that boundary is implemented and exercised with test adapters.

## Shades Of: evidence-linked stylistic comparisons

The report overview now supports **Shades Of**, with one to three distinct named fighter references when findings support them. It is optional: older reports and insufficient evidence show an honest empty state. Nothing is selected at random or generated by the frontend.

`src/domain/styles.ts` contains a deliberately small coaching-reference catalog for boxing and kickboxing. The phrases describe broad technical patterns, not complete characterizations, rankings, credentials, or claims about an athlete's career. The live boxing adapter can select boxing references only. The provider must cite zero-based observation indexes; the server converts those to report observation IDs and validates them. The report schema rejects unknown names, discipline mismatches, duplicate references, more than three comparisons, missing finding links, and references without observed source evidence.

Each card explains a specific stylistic overlap and links to the supporting technical findings and their evidence. It makes **no claim of equivalent skill, ability, identity, physique, achievement, or measured similarity**. No similarity percentage or grade exists. The prompt forbids comparisons based on appearance, stance alone, or stereotypes. These remain qualitative model interpretations and need coach review; schema validation cannot prove the stylistic claim is correct. No authentic live comparison has been generated yet.

The feature shares the same provider call and output-token cap; it does not introduce a second paid service. The real-footage evaluation must also check whether each named reference is reasonable and whether the explanation is genuinely supported by the athlete's footage.

## Scale-to-zero processing update (supersedes the original background API description)

The original HTTP 202/background worker has been replaced by awaited request-bound NDJSON streaming. Uploads now default to and are capped at **25 MiB** on every deployment. The whole report is returned in the original response after media cleanup; the frontend saves it directly without polling or a follow-up instance-local report GET. Authenticated status/cancel endpoints remain optional diagnostics, not durable job storage. Server-side cache expiry is checked on access. The safe Cloud Run plan is now **min=0, request-based CPU**, not a warm always-allocated instance. See [the low-cost plan](../deploy/cloudrun/LOW-COST.md) for limitations, timeouts, Jobs comparison and separate cost estimates. Keep the browser foreground during analysis. No deployment or live provider validation has occurred.
