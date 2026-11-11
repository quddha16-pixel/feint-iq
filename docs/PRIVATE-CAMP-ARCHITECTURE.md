# Identifier Q — private fight camp rebuild

Assessment and local implementation for Vince and his coach. No production
service, IAM policy, billing configuration or data migration is changed.

## Repository assessment

The baseline is main at f6e626a, including PR #1's request-stream-v1 frontend.
The broader prepare/cloud-run branch retains the request-bound backend,
scale-to-zero configuration and manually gated cloud automation. Those changes
are not silently merged into this rebuild. Source inspection is not a live
Cloud Run configuration audit.

Retain React/TypeScript/Vite, Zod schemas, responsive primitives, video object-URL
lifecycle, MP4/MOV/WebM validation, identity confirmation frames, the streamed
analysis adapter, cancellation, qualitative reports, evidence seeking,
import/export, and compatible historical report comparisons. Retain FFmpeg,
provider/report boundaries, authenticated pilot and all deployment configuration.

Replace the marketing dashboard, public-product navigation and Feint Labs
presentation with Feint Engineering and a camp-first shell. The old landing
components remain recoverable in Git; they are not imported into the app.
There was no subscriptions or registration implementation to remove. Historical
report scores remain readable as source data; the camp does not derive new
scores or automatic trends from them.

The current code has no two-person shared persistence, cloud video library,
1 GB upload transport, durable long-running job mechanism or continuous fighter
tracking. The current model findings are qualitative and sparse-frame based;
a decoder timestamp locates a source frame, not an independently verified punch.

## Application architecture

Local React UI -> validated camp domain -> dedicated versioned local store.
Existing analysis UI -> authenticated request-stream-v1 adapter -> existing pilot.
The two paths stay distinct. Nothing uploads from the new local review control.

New camp records cover fighter profile, opponent profiles, sessions/rounds,
seven-part coaching findings, evidence-linked follow-ups, camp dates, weekly
objectives, and a planning retention preference. Empty values are truthful.
A finding is explicitly either a coach observation or a hypothesis; none is
labelled AI-generated. Training drafts copy a recorded correction and drill.
Coach approval is required to mark a draft planned. Completed objectives are
coach-recorded completion, not proof of performance improvement.

The local footage control accepts up to 1 GiB by object URL, without reading a
whole video into JS memory. Actual playback and memory use depend on browser
and codec support. iPhone MOV/HEVC is not guaranteed on every browser. The pilot
retains 25 MiB/boxing/10–300-second limits; a 1 GB secure upload is a later phase.
Fight mode is a manual review workspace. Cuts/replays must be identified by the
coach. Cross-angle tracking and replay deduplication are not implemented.

## Navigation and dashboard

- Camp overview: next fight/opponent and days only if entered, status, priorities,
  latest documented sparring review, strengths, recurring weaknesses, notes,
  and evidence-linked recent improvements.
- Analysis center: sparring/fight modes, local footage review, session and round
  records, manual fighter identification, attached reports, and a separate
  entry to the existing small-clip pilot.
- Vince's profile: editable stance, class, height/reach, discipline, strengths,
  priorities, combinations, defensive habits, coach observations, fight history.
- Opponents: editable tendencies, combinations, vulnerabilities and matchup plan,
  with linked sessions/footage references.
- Camp plan: dates, opponent, weekly goals, sparring schedule notes, completion,
  and transparent drafts from documented priorities.
- Development: timestamped observation, diagnosis, consequence, correction,
  training drill and priority, plus evidence-linked follow-up assessments.
- Report library and Settings: retained report tools, recovery/export, provider
  connection, capability status, and retention planning.

The dashboard never counts opponent-only sessions as Vince performance.
Sparring reports appear through an explicitly linked session. No date, result,
stance, attribute, exchange or performance percentage is prefilled.

## Practical private hosting proposal

Use a new, separately reviewed Cloud Run host for the built frontend and camp
API behind direct Identity-Aware Proxy. Allow exactly the coach and Vince's
Google identities; use MFA on both accounts. Direct IAP avoids adding a load
balancer simply to protect a two-person app. For external or non-organization
Google accounts, complete the documented OAuth/IAP audience configuration.
Do not enable anything until the two identities, audience and budget are approved.

The candidate server/camp-gateway.ts protects HTML, JS, CSS, /api/session and
future API paths before file access. It verifies the IAP signature, issuer,
audience and validity period with google-auth-library, then checks the signed
email against exactly two allowed identities. Raw email headers are never
trusted. Missing configuration, invalid identity and unapproved identity fail
closed. Responses use no-store, CSP, no-referrer and nosniff. Unknown APIs fail
explicitly; no shared camp, report or video API is pretended to work.

The gateway has no anonymous local bypass. To exercise it locally, tests inject
only synthetic assertions or mock verification keys. The ordinary development
server binds to loopback and is explicitly labelled local development. The
client refuses to load records on a remote static host without /api/session;
this UI check is defense in depth, not authentication and cannot protect static
assets. The production gateway must protect assets themselves. Public GitHub
Pages must not receive this private build. Existing Pages configuration is
preserved, so do not merge this branch into main before replacing publication
with the separately approved private deployment path.

Future shared APIs should use same-origin identity, reject unauthorized
principals at every endpoint, validate CSRF/Origin on mutations, and never put
provider/session secrets into client code. Retain the existing pilot's bearer
authentication until a reviewed server-to-server bridge replaces it. The new
host's CSP intentionally prevents arbitrary external provider/backend calls;
shared analysis routing is not implemented yet.

Use a regional private Cloud Storage bucket with public access prevention,
uniform access, random object names and ownership records. Authenticated
server-created resumable sessions should bind one object/size/type and expire
or be explicitly invalidated. A resumable-session URI is a bearer credential:
never log it or persist it in frontend bundles. Upload directly to Storage;
never raise the current in-memory /analyses limit to 1 GB. Verify actual
media/hash/size server-side, quarantine invalid objects and clean aborted
uploads. Playback requires authorized short-lived access and no public URLs.
Consider a same-origin upload proxy if direct IAP Storage/CORS interaction makes
mobile access unreliable; benchmark before choosing.

For durable video processing, prefer a single explicitly requested Cloud Run
Job per approved analysis, with durable state and no automatic duplicate model
calls. It is a proposal, not a newly created resource. Keep min instances zero,
max concurrency bounded, no GPU and no always-on worker. Store metadata/report
records in a small pay-per-use store such as Firestore only after approval and
recovery/export tests. Local browser storage must not become the shared source
of truth. Retention requires deletion of footage, derived frames, object
versions and relevant backups; lifecycle rules alone do not establish immediate
erasure. The 7/30/90-day control currently records only an intended policy.

## Provider-independent intelligence

Keep existing Gemini provider code operational and server-only. The new
server/intelligence/contracts.ts defines a separate canonical coaching result,
source evidence manifest, provider interface, nullable usage/cost fields and
opt-in registry. It defaults to no adapters. OpenAI, Anthropic, xAI and Gemini
are candidates, not ranked or silently activated. This scaffold is not four
working provider integrations and does not improve analysis quality by itself.

Next: implement one adapter at a time, record extraction/prompt/model versions,
validate source references and replay exclusions, and benchmark the same consented
rounds with blinded coach ratings. Measure visible-event accuracy, fighter
identity, whole-round coverage, actionable drill specificity, latency and actual
provider usage. Reject unsupported evidence, distinguish hypotheses, and return
insufficient evidence when identity or movement cannot be established. API
errors must remain actionable, with no fabricated reports or implicit retries.
Estimate cost before each run, enforce a server-side approved budget, record
actual/unknown token costs truthfully and require confirmation for comparisons
that multiply calls. No model is presumed superior.

## Phases and exit criteria

1. Local coaching workflow (this branch): usable manual records and review,
   truthful capability boundaries, preserved historical storage, backup/restore,
   regression coverage and private-host access boundary.
2. Private-host validation: approved two identities and audience, cloud budget,
   IAP/ingress/IAM checks, mobile sign-in, denied-user asset/API tests and no
   direct public bypass. Do not move sensitive camp data until these pass.
3. Shared persistence/large uploads: approve storage resources, export/recovery
   plan, resumable 1 GB iPhone tests, interrupted-upload cleanup, authorized
   playback, retention enforcement and durable idempotent processing.
4. Coaching quality: complete canonical adapter(s), approved evaluation footage,
   coach benchmark and usage/cost ledger. Expand kickboxing only after ruleset
   and evidence quality validation.
5. Fight intelligence: evaluate camera-cut identity, replays and round alignment;
   expose experimental status until independently validated. Compare findings
   qualitatively before introducing any reliable quantitative measurements.

## Recurring cost estimate and risks

Local-only work adds $0 of cloud spend. For a potential two-person approved
service, budget roughly $2–15/month in infrastructure before AI and substantial
video playback, with 30–50 GB retained, bounded foreground use and min=0. This
is a planning allowance, not a quote or a guarantee of free-tier availability.
Current us-central1 request-based list rates imply about $0.17 for 32 analyses
at 180 active seconds each using 1 vCPU/2 GiB, before applicable free tiers.
Ten active minutes each would be about $0.56. Real media work may require more
memory/time; Job pricing differs. Storage, requests, network egress, retained
versions, builds, image storage and logs add separate charges. Region, tax,
credits and the rest of the billing account affect the actual bill.

Unbounded 1 GB retention/downloads and premium model comparisons can dominate
cost. Keep a per-run and monthly budget, explicit provider opt-in, no automatic
resubmission and no speculative background processing. Budget alerts are not
hard spending caps. Keep all paid AI integrations disabled until specific
models, evaluation scope and budget are explicitly approved.

Sources checked 2026-11-10 (America/Chicago):
- https://cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run
- https://cloud.google.com/run/pricing
- https://cloud.google.com/storage/pricing
- https://cloud.google.com/storage/docs/resumable-uploads

## Data recovery and validation

No migrations occur. identifier-q.reports.v1, draft.v1 and preferences.v1 remain
unchanged in format. Camp uses identifier-q.camp.v1. Invalid stored camp JSON is
preserved and blocks saves. Concurrent edits from another tab are rejected before
overwriting newer records. Invalid backups cannot replace data. Restoring a
validated version-1 camp backup requires explicit replacement and downloads a
raw recovery backup first, including the untouched legacy keys. Raw recovery
strings require manual recovery and are not silently imported. Back up before
moving origin or browser: localStorage is origin-specific. A future migration
must inventory/export both stores, verify counts and sample reports, keep an
immutable encrypted recovery copy, and rehearse rollback before any deletion.

Baseline before redesign: 59 unit tests and 23 browser tests passed. New checks
cover the coaching evidence chain, references/timestamp bounds, empty facts,
backup validation, storage failures, profile/opponent/plan persistence, session
reviews, evidence-linked development, training drafts and IAP signature/audience/
expiry/allowlist enforcement across assets and API routes. Re-run all baseline
media/streaming/report tests plus responsive and accessibility coverage. Synthetic
fixtures test mechanics, not fighting insight or live provider performance.

## Verification outcome

Local candidate: 69 unit tests passed, including the existing media/backend and
streaming suite, camp contracts/recovery/concurrent edits, canonical provider
contract checks and signed-IAP verification. All 27 Chromium browser tests passed,
including the retained workflows, complete new camp workflows, evidence
comparison, backup restore, mobile layouts and WCAG checks. Type checking, lint,
production build and whitespace checks passed. No cloud service, real provider
call, billing change, public publication or data migration was performed.
