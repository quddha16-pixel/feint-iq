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

## Estimated monthly costs — separate compute and provider

These are planning estimates for **short clips**, not measured model latency, actual token usage, a quote, or a spending cap. Official pricing checked 2026-11-03:

- [Cloud Run us-central1 request-based pricing](https://cloud.google.com/run/pricing): **$0.000024/vCPU-second**, **$0.0000025/GiB-second**, **$0.40 per million requests**, before applicable credits/free tier.
- [Gemini 3.5 Flash-Lite standard pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite): **$0.30/million input tokens** and **$2.50/million output tokens including thinking**, subject to current model availability/terms. No key/tier or real model access has been configured or validated here.

**Base assumption per clip:** 120 seconds of active upload, decoding, provider waiting, response and cleanup, plus a conservative 10 seconds of cold-start/shutdown overhead per clip; 1 CPU, 2 GiB; no startup boost; three ordinary HTTP requests per clip; no retry. Model waiting time still counts as an active Cloud Run request. The resource estimate is deliberately not based only on video duration.

Compute calculation per clip: `130 × (0.000024 + 2 × 0.0000025) + 3 × 0.40 / 1,000,000 = $0.0037712`. Input and output model token assumptions remain approximately 10,000–150,000 input and 2,000–8,192 output tokens including thinking. At the listed rates that is about $0.008–$0.066, rounded to **$0.01–$0.07 per clip**. Actual provider usage must be measured during an authorized evaluation.

| Clips / month | Cloud Run before free tier | Gemini API estimate (separate) | Compute + Gemini subtotal, before free tier |
| ------------: | -------------------------: | -----------------------------: | ------------------------------------------: |
|            10 |                  **$0.04** |                **$0.10–$0.70** |                             **$0.14–$0.74** |
|            50 |                  **$0.19** |                **$0.50–$3.50** |                             **$0.69–$3.69** |
|           100 |                  **$0.38** |                **$1.00–$7.00** |                             **$1.38–$7.38** |

The standard request-based Cloud Run free tier is commonly 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests per month. At 100 clips these assumptions consume about 13,000 vCPU-seconds, 26,000 GiB-seconds and 300 requests. If the billing account's applicable shared free-tier allocation is unused, **Cloud Run compute/request charges may be $0** at all three volumes. Eligibility, other projects' usage, billing account and future pricing can change that; do not assume credits are dedicated to Identifier Q. Gemini is separate and this estimate does not assume free-tier processing of sensitive footage.

**Slower-case sensitivity:** a 370-second billed envelope (up to 120 seconds receiving a slow upload + 240 seconds processing + 10 seconds overhead) is about **$0.0107312 per attempt**, or approximately **$0.11 / $0.54 / $1.07** for 10 / 50 / 100 attempts before Cloud Run free-tier credits. Failed attempts/retries may incur both compute and provider charges. The existing 5-minute video limit is not a promise every clip analyzes in 120 seconds.

Not included in the table: Cloud Build minutes, Artifact Registry image storage, build-source bucket storage, Secret Manager versions/access, logs, outbound transfer to the provider and report responses, taxes, or repeated/failed attempts. Small retained build/secret/storage charges can exist even when the service is scaled to zero. Keep images/source archives tidy and check actual billing; none of these costs justify buying an always-on server for the prototype. The old $57/month continuously warm **compute** estimate no longer applies.

## Evaluation and next action

Local tests exercise actual HTTP streaming, decoding, metadata, complete-report delivery, cancellation, disconnection, malformed/truncated streams, timeouts, upload limits and per-instance duplicate protection using explicitly synthetic providers. They do not establish Gemini analysis quality or mobile-network durability. All existing report/history/identity/branding features remain regression-tested.

After explicit deployment/provider approval: verify project billing/IAM, store the two secrets securely, build the backend image with the existing Cloud Build file, deploy using the revised min=0 command, and publish the reviewed frontend transport update separately. Test health/CORS first without sending footage, then submit one consented 30–60-second boxing clip while keeping the phone foreground. Measure actual latency/token usage and inspect every source-frame-linked finding. No cloud deployment or paid resource creation is authorized by this document alone.

## Verification of this implementation

- Type checking, linting, **58 unit/integration tests**, production build, and **23 browser tests** passed locally.
- Existing browser regressions for branding, discipline/rulesets, uploads, manual identity frames, report evidence seeking, Shades Of, local history/comparison, settings, keyboard focus and responsive layouts remain covered. A new real-HTTP test verifies streamed stages, configuration locking, and request cancellation without a partial saved report.
- Transport tests reject malformed, truncated, oversized and mismatched streams; heartbeat records never count as completion. The report is returned from the adapter's received result without a follow-up GET. An ambiguous interrupted attempt retains its key for an explicit retry.
- Server tests hold provider execution open and verify that no terminal success is emitted until the result and source cleanup are complete. They verify cancellation, timeout, disconnect-driven abort, genuine errors, per-instance duplicate replay and source-timestamp/metadata preservation. Providers in these tests are explicitly synthetic, never presented as real AI analysis.
- The production Docker image was built locally and exercised under **1 CPU / 2 GiB**. A generated 10-second codec clip passed actual multipart upload, FFmpeg decoding, real stage streaming and inline report delivery with unchanged fighter ID and decoder-derived timestamps. No provider/cloud request was made.
- Cloud deployment commands were only Bash-syntax-checked. They were not executed, and no GCP service, build, registry, bucket, secret, queue, Job or database was created. The public Pages deployment and `main` remain unchanged. Real Cloud Run proxy behavior, physical iPhone Safari interruptions and live Gemini quality/latency still require an authorized deployment/evaluation.
