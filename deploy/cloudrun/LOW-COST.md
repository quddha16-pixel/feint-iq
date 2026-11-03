# Scale-to-zero prototype plan — not deployed

Target: **`feint-identifierq`**, number **`334840153796`**, **`us-central1`**. This replaces the earlier always-warm proposal. No Google Cloud resources, API credentials, paid subscriptions, builds or deployments were provisioned by this work.

## Decision: request-bound analysis, not a detached worker

The complete pipeline runs inside the original authenticated `POST /analyses` handler. It keeps its HTTP response open while it:

1. Receives and validates up to **25 MiB**, with a **10–300-second** clip and immutable fighter identity metadata.
2. Decodes/samples actual video with FFmpeg/ffprobe, preserving decoder-derived source timestamps and identity confirmation frames.
3. Calls the existing server-only Gemini adapter. No provider secret reaches the frontend.
4. Validates evidence references, qualitative findings and optional Shades Of comparisons. Scores remain unassessed.
5. Removes temporary media, then sends the completed report **in the same response**.

The response is `application/x-ndjson` using `request-stream-v1`. Actual job/stage events communicate decoding, provider analysis, validation and cleanup. Heartbeats only keep the active response open; they are not progress percentages. A terminal result contains both the completed job and its validated report. HTTP 200 alone does **not** mean analysis succeeded: the client waits for a valid terminal result or error.

The browser adapter receives that result without a follow-up report GET and stores it in browser history. Server shutdown, scale-down or different routing _after successful response delivery_ cannot prevent reading the already-delivered report. The client keeps a bounded session result cache solely to satisfy the existing report-service interface. The UI workflow, saved reports, discipline rules, identity metadata, authenticated upload and report rendering remain intact.

There is **no work launched to continue after a successful response ends**, no external queue, and no need to allocate idle CPU. Source-file cleanup is awaited before success is emitted. Cache expiry happens on API access rather than requiring a background timer. Cold starts and per-instance empty caches are expected.

## Alternatives evaluated

| Architecture                                         | Scale to zero?                    | Survives phone disconnect / server restart?                                    | Extra components                                                                                                                          | Decision                                                                                                                               |
| ---------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Old HTTP 202 + detached in-memory task               | Unsafe with request-only CPU      | No                                                                             | None, but requires warm/always-CPU configuration                                                                                          | Removed                                                                                                                                |
| **Open request + streamed status + inline result**   | **Yes, min=0, request-based CPU** | No durable resume; disconnects fail/cancel explicitly                          | **No additional services**                                                                                                                | **Implemented for this short-clip, foreground private pilot**                                                                          |
| Cloud Run Jobs                                       | Yes; execution keeps its own CPU  | Can complete independently of the browser if inputs/results are stored durably | Durable object storage, job/execution API, ownership/result tracking (e.g. database or object metadata); additional IAM and orchestration | Appropriate next step if analysis must finish after closing the phone, or durations exceed request limits; not implemented/provisioned |
| Cloud Tasks + request-bound worker + durable storage | Yes                               | Durable dispatch/retries, with idempotency design                              | Queue, object storage, durable metadata, retry/dead-letter policy and more IAM                                                            | More infrastructure than this prototype needs; not implemented/provisioned                                                             |

Jobs would not inherently require always-running compute, and their idle compute can also be zero. However a Job cannot safely read an ephemeral upload file from an unrelated API instance or return results to a disconnected browser without storage and retrieval. Merely changing the process to a Job would not solve data delivery. There is no claim that request-bound processing is a durable background system.

## Reliability boundary and cancellation

- **Keep the iPhone browser tab foreground and the device unlocked until completion.** Safari/OS suspension, connection loss, instance termination, or timeout may interrupt a request. No incomplete report is displayed or saved. If guaranteed completion while the phone sleeps is required, choose the Jobs/storage architecture instead.
- The backend enforces a 240-second decode/analysis budget, a 120-second upload limit, per-subprocess timeouts, and cleanup before success. Cloud Run allows the containing request up to **600 seconds**. The frontend's entire request deadline is **540 seconds**, including response-body reading. A timeout is a failure, never a completed assessment.
- The job ID is available in the first real status event. While the request is open, authenticated status/cancel endpoints provide best-effort diagnostics. Their in-memory records are not durable and may return 404 after replacement or scale-to-zero. The completed analysis does not depend on those endpoints.
- Cancel immediately aborts the primary stream in the browser. The backend listens for that response connection closing, aborts its native Gemini fetch and FFmpeg processes, and attempts cleanup. An authenticated DELETE is also attempted when the job ID is known. A DELETE routed to another/replacement instance may fail; local cancellation still occurs. Provider work already accepted may be billable and cannot be “unbilled.” Proxy/OS disconnect notification is not guaranteed to be instantaneous.
- SIGTERM triggers cancellation before the server drains its connections. Hard kills cannot guarantee cleanup or delivery. Files are ephemeral and no permanent video store is added. Temporary files, bounded status/result caches and the original single-owner access token are not a multi-user data platform.
- Duplicate protection is **per warm instance**. Repeated keys with matching metadata replay the cached inline result without another provider call. Busy requests get 429. After an ambiguous/truncated network response the frontend retains the same key for an explicit retry; known failed/canceled outcomes allow a new explicit attempt. Across cold starts/restarts, exact-once billing cannot be guaranteed without durable idempotency records. There are **no automatic retries** that silently incur another Gemini call. Check usage/outcome before retrying an uncertain request.

This preserves reliable, bounded execution and complete-result delivery for an active request. It deliberately does not promise durable completion across infrastructure/client failure.

## Specific low-cost deployment settings

Use the reviewed setup/Secret Manager/build steps in [README.md](README.md). Those steps remain unexecuted. The revised deployment command there uses:

```text
region: us-central1
minimum instances: 0
maximum service instances: 1
billing: request-based (--cpu-throttling)
startup CPU boost: disabled (--no-cpu-boost)
CPU: 1 vCPU
memory: 2 GiB
HTTP concurrency: 8
application analysis concurrency: 1 per instance
request timeout: 600 seconds
application decode/provider budget: 240 seconds
browser request deadline: 540 seconds
upload ceiling: 25 MiB, all deployments
```

Concurrent HTTP slots allow probes/status/cancellation while one analysis occupies its response. They do not permit eight simultaneous FFmpeg/model jobs: the app rejects additional analysis requests with 429. The normal service instance cap bounds expected concurrency but is not a hard spending cap; Cloud Run may briefly exceed it during platform/revision transitions. Do not add periodic external health pings that unnecessarily wake the service. No VPC/NAT, database, footage bucket, queue, scheduler or Jobs service is added.

Health probes and `PORT` handling from the Cloud Run preparation remain in place. The GitHub Pages deployment workflow remains unchanged. **This frontend transport update must be reviewed/published before connecting the public Pages client to the new backend protocol.** Keep it off `main` until publishing is authorized; do not connect an old client that expects HTTP 202/polling. Existing reports are backward-compatible and the default unconnected workspace still sends no footage.

## Estimated monthly costs — cloud resources and Free Tier Gemini

**Current authorization: an unupgraded Google Cloud $300 Free Trial and Gemini Free Tier only. No personal spending, billing upgrade or paid Gemini access.** Official documentation checked 2026-11-03. These estimates are for short clips, not measured latency/token usage, a spending cap, or a bill.

- [Cloud Run us-central1 request-based pricing](https://cloud.google.com/run/pricing): $0.000024/vCPU-second, $0.0000025/GiB-second, $0.40/million requests, before applicable shared free allowances/trial credits.
- [Gemini 3.5 Flash-Lite Standard Free Tier](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite): **input and output free of charge**, within the key-owning project's active free quotas. Paid Gemini is excluded from this plan. Google explicitly says [the $300 trial credit cannot pay Gemini API in AI Studio charges](https://docs.cloud.google.com/free/docs/free-cloud-features). No paid fallback or quota upgrade is permitted.

**Base assumption per clip:** 120 seconds of active upload, decoding, provider waiting, response and cleanup, plus 10 seconds cold-start/shutdown overhead; 1 vCPU, 2 GiB, no startup CPU boost, three ordinary HTTP requests, no retries. Model waiting is active request time. Calculation: `130 × (0.000024 + 2 × 0.0000025) + 3 × 0.40 / 1,000,000 = $0.0037712`.

| Clips/month | Cloud Run compute/requests before allowances | With sufficient unused Cloud Run free allowance | Gemini API, Free Tier only |
| ----------: | -------------------------------------------: | ----------------------------------------------: | -------------------------: |
|          10 |                                        $0.04 |                                              $0 |       $0, if quota permits |
|          50 |                                        $0.19 |                                              $0 |       $0, if quota permits |
|         100 |                                        $0.38 |                                              $0 |       $0, if quota permits |

Published request-based Cloud Run monthly free allowances include 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests. At 100 clips the base assumptions use about 13,000 vCPU-seconds, 26,000 GiB-seconds and 300 requests. Shared allocation consumption by other projects and account eligibility must be checked. Eligible cloud usage above free allowances can consume the **remaining valid trial credit** while the account remains unupgraded. After trial exhaustion/expiration the service can stop; do not upgrade to avoid interruption.

Gemini planning input size remains roughly 10,000–150,000 tokens and output 2,000–8,192 tokens including any thinking, depending on frame/image processing. The 8,192 output cap and 19 MiB serialized-request guard do not guarantee a request fits free TPM/RPD quota. Check actual project limits in AI Studio. On quota/capacity errors, the backend reports failure with no automatic retry or model switch. These clip counts do not imply all clips can be submitted on one day or minute. The model name cannot verify/enforce the project's billing tier; confirm **Free** in AI Studio before launch.

**Slow-case sensitivity:** 370 billed seconds (up to 120 upload + 240 processing + 10 overhead) costs about $0.0107312/attempt, or $0.11 / $0.54 / $1.07 for 10 / 50 / 100 attempts before Cloud Run allowances/credits. The five-minute video limit is not a promise of 120-second analysis. Failed/uncertain attempts and explicit retries also consume quota/compute.

**Separate costs not included above:** Cloud Build minutes, Artifact Registry images, private build-source storage/operations, the two existing Secret Manager secrets/accesses, logging and outbound transfer. These services have their own shared free allowances; excess eligible usage can consume trial credits. Retained storage may have a small idle cost even with zero Cloud Run instances. A total $0 cloud bill is not promised. No new footage bucket, database, queue or permanent warm compute is added. The old $57/month warm compute proposal is superseded. Budget alerts are not spending caps.

Google documents no automatic personal charge for an **unupgraded** Free Trial; credits/time exhaustion closes billing/stops resources. Remaining credit/days, billing-account status and current Gemini tier cannot be verified in this workspace. Do not link a paid billing account, enter prepay, or upgrade either product. Free Gemini privacy terms can permit product improvement/human review; evaluate only appropriate, consented footage after reviewing current terms.

## Evaluation and next action

Local tests exercise actual HTTP streaming, decoding, metadata, complete-report delivery, cancellation, disconnection, malformed/truncated streams, timeouts, upload limits and per-instance duplicate protection using explicitly synthetic providers. They do not establish Gemini analysis quality or mobile-network durability. All existing report/history/identity/branding features remain regression-tested.

After explicit deployment/provider approval: verify Free Trial/Free Tier status, remaining credit/days, IAM and the two existing secrets' enabled versions, build the backend image with the existing Cloud Build file, deploy using the revised min=0 command, and publish the reviewed frontend transport update separately. Test health/CORS first without sending footage, then submit one consented 30–60-second boxing clip while keeping the phone foreground. Measure actual latency/token usage and inspect every source-frame-linked finding. No cloud deployment or paid resource creation is authorized by this document alone.

## Verification of this implementation

- Type checking, linting, **59 unit/integration tests**, production build, and **23 browser tests** passed locally.
- Existing browser regressions for branding, discipline/rulesets, uploads, manual identity frames, report evidence seeking, Shades Of, local history/comparison, settings, keyboard focus and responsive layouts remain covered. A new real-HTTP test verifies streamed stages, configuration locking, and request cancellation without a partial saved report.
- Transport tests reject malformed, truncated, oversized and mismatched streams; heartbeat records never count as completion. The report is returned from the adapter's received result without a follow-up GET. An ambiguous interrupted attempt retains its key for an explicit retry.
- Server tests hold provider execution open and verify that no terminal success is emitted until the result and source cleanup are complete. They verify cancellation, timeout, disconnect-driven abort, genuine errors, per-instance duplicate replay and source-timestamp/metadata preservation. Providers in these tests are explicitly synthetic, never presented as real AI analysis.
- The production Docker image was built locally and exercised under **1 CPU / 2 GiB**. A generated 10-second codec clip passed actual multipart upload, FFmpeg decoding, real stage streaming and inline report delivery with unchanged fighter ID and decoder-derived timestamps. No provider/cloud request was made.
- The final readiness image `identifier-q-readiness:local` also passed injected `PORT=9090`/`K_SERVICE`, non-root execution, actual FFmpeg/ffprobe startup, public minimal probe, protected detailed health, exact Pages-origin CORS, and advertised request-stream-v1/25 MiB/10–300-second limits under 1 CPU/2 GiB. No actual credentials were used.
- The existing public Pages HTML, JavaScript and CSS returned HTTP 200. The new production bundle excludes server credential variables and synthetic test credentials. The Pages workflow and Vite base path remain unchanged.
- The final readiness review also tests Free Tier quota exhaustion: a 429 causes one provider attempt, no model fallback, no tools/caching, and guidance against paid billing.
- Cloud deployment commands were only Bash-syntax-checked. They were not executed, and no GCP service, build, registry, bucket, secret, queue, Job or database was created. The public Pages deployment and `main` remain unchanged. Real Cloud Run proxy behavior, physical iPhone Safari interruptions and live Gemini quality/latency still require an authorized deployment/evaluation.
