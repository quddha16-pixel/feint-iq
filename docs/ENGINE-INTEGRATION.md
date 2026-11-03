# Real analysis integration contract

## Current boundary

`AnalysisService` defines submit, monitor status, retrieve a validated report, cancel, list, and get by ID. The only current adapter is explicitly unavailable. Its capability flags are all false and every operation rejects. UI submission sends no network request. No provider credentials or environment secrets are required for the local workspace.

A future authenticated server must receive the original file or an owned storage reference plus immutable `AnalysisConfiguration`. `VideoAsset.storageId` can carry a backend-owned object identifier, not an arbitrary client URL. `FighterIdentification` preserves the original method, notes, and an optional normalized point / video timestamp. Corner and starting position do not establish continuous identity. The server must confirm identity and explicitly report tracking failure.

## Required server pipeline (not implemented)

1. Authenticate the owner; authorize every job, asset, and report access.
2. Validate media server-side using signatures and decoding, not filename/MIME alone. Enforce size, duration, resource and rate limits. Scan/process footage in isolated workers. Do not fetch arbitrary client-supplied URLs.
3. Store source footage securely with owner-scoped object references and an explicit deletion/retention policy. Strip sensitive metadata where appropriate.
4. Decode/sample frames; establish fighter identity, then use specialized tracking/event detection with measured quality and legal-ruleset context.
5. Preserve observed events separately from estimates and interpretations. Only verified observed evidence may include exact timestamps. Unmeasurable accuracy, counts, or confidence must remain unavailable.
6. Derive category scores from documented, versioned evidence-based scoring. `gradeFor` is a configurable display scale (97 A+, 93 A, 90 A−, 87 B+, 83 B, 80 B−, 77 C+, 73 C, 70 C−, 67 D+, 60 D, else F); it does not create scores. No production scoring algorithm exists yet.
7. Generate findings and corrective recommendations linked to evidence. Validate with `reportSchema` before persisting or sending them to the browser. Validate returned jobs with `jobSchema` as well.
8. Persist reports and return owner-authorized, validated data. Connect application submission to actual upload progress, status polling with abort/backoff/timeouts, and validated report retrieval before enabling the adapter.

## Lifecycle and HTTP mapping

Suggested mapping, to be adapted to the eventual server rather than stubbed now:

- `submit`: authenticated multipart POST `/analyses`, or signed-upload + asset-reference POST; return job ID and frozen configuration.
- `status`: GET `/analyses/:id/status`, validated lifecycle and optional **measured** percentage.
- `report` / `get`: GET `/analyses/:id/report`, schema-v1 completed report.
- `cancel`: POST `/analyses/:id/cancel`, only when server cancellation is supported.
- `list`: GET `/analyses` with owner-bound pagination.

Statuses: not-started → ready → uploading (only real transfer) → queued → processing → completed / failed / canceled. Current unavailable adapter resolves no job. Do not enable capabilities until transport, monitoring, failure recovery, duplicate-request idempotency, cancellation (if advertised), and report ownership are implemented. Keep submitted configuration frozen while processing. Server cancellation does not imply storage deletion.

## Schema-v1 reports

The executable contract is `src/domain/contracts.ts`, not a provider response format. Top-level fields are `schemaVersion`, `id`, `configuration`, `video`, `createdAt`, `completedAt`, `engineVersion`, `methodology`, `conditions`, `assessment`, `metrics`, `evidence`, `observations`, and `recommendations`.

Include every discipline metric with `assessed`, `insufficient-evidence`, or `not-applicable`. Scores are nullable (0–100 when present); confidence is nullable (0–1 when actually provided). Scored metrics need supporting observation IDs. Overview strengths and weaknesses reference observations; priorities reference recommendations. Evidence references this video's ID and a verified time within duration, or null. Recommendations reference findings and metrics; drills include execution, dosage, mistakes, and cues.

Scores and factual accuracy require provider-side validation beyond this structural schema. Changing scoring methodology withholds numeric comparison deltas. Comparisons require the same fighter name/identifier, discipline, analysis type, and ruleset details. Names are a local foundation, not authoritative athlete IDs; use authenticated stable athlete identity before team/multi-user deployment.

## Security / deployment gates

Keep provider keys server-side. Add real auth, authorization, CORS/CSRF controls appropriate to the chosen transport, upload quotas, worker isolation, retention/deletion controls, threat monitoring, and independent model validation. Use HTTPS. Configure signed video delivery without exposing permanent credentials. No sensitive provider token may be prefixed with `VITE_` or bundled into this static frontend.

The current report reader only accepts local reattached footage. Cloud playback requires an authenticated video asset adapter, expiry handling, ownership checks, and stronger identity checks (e.g. hashes) before claiming footage provenance. No unnecessary empty server routes were added.

## Phase 2 implementation update

The original unavailable adapter remains the default. The authenticated HTTP adapter, Node upload/job service, ffmpeg frame preparation, Gemini provider boundary and qualitative report conversion are now implemented. Read [PHASE2-INTEGRATION.md](PHASE2-INTEGRATION.md) for the current executable pipeline, 10–300-second limits, exact privacy boundaries, cost assumptions and live-validation requirements. Earlier sections describe the full production target; account isolation, durable jobs, real tracking and numeric scoring remain unimplemented. No live provider result has been validated.
