# Identifier Q · Feint Engineering

Private boxing and kickboxing fight-camp workspace for Vince and his coach.
This development branch replaces the public landing experience with a camp
command center. It is not deployed and is not yet a shared private production
service. Do not merge it into main while main still publishes to public Pages.

## Local development

Requires Node 24, npm, FFmpeg/ffprobe and Chromium for the full test suite.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. The dev server binds to loopback. Local records are
stored in this browser profile without encryption or account isolation. Use
synthetic data during development. No provider credentials are needed.

Working locally: camp dashboard, editable fighter/opponent profiles, session
and round records, video preview, timestamped seven-part coaching findings,
hypothesis labels, evidence-linked follow-ups, weekly objectives, coach-reviewed
training drafts, and camp backup/restore. Historical report import/export,
identity frames, report seeking, streamed analysis and cancellation are retained.
No legacy data is migrated or deleted.

The separate existing live pilot remains boxing-only, 25 MiB and 10–300 seconds.
The new local reviewer can preview up to 1 GiB depending on device/codec support;
it does not upload. Secure resumable large uploads, shared cloud data, enforced
cloud retention, cross-angle tracking, replay detection and other AI providers
remain pending. A server-only OpenAI short-clip adapter is implemented on this
provider branch; no premium provider was activated by this work. See
[OpenAI model selection, test procedure, usage and cost](docs/OPENAI-BOXING-PROVIDER.md).

See [architecture, phases, costs, privacy and recovery](docs/PRIVATE-CAMP-ARCHITECTURE.md).

## Candidate private host (not deployed)

`npm run camp:host` serves the build behind signed Google IAP identity checks.
It refuses startup unless server-only `CAMP_IAP_AUDIENCE` and exactly two distinct
`CAMP_AUTHORIZED_EMAILS` are configured. All app assets and API routes require
verification. It has no anonymous bypass; normal local development uses Vite.
No shared data/analysis endpoints are implemented on this host yet. Google
IAP/IAM/ingress/OAuth setup must be separately approved and verified. Never put
secrets in Vite variables, source, backups, or chat.

The existing pilot server, Docker files and cloud automation remain intact.
Public GitHub Pages cannot host the private application. The client-side remote
host guard is defense in depth, not an access-control substitute.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e -- --timeout=90000
```

Tests generate black codec fixtures and explicitly synthetic findings. They
validate workflow and transport behavior, not AI accuracy. Every real coaching
claim still requires human-reviewed footage and trustworthy source evidence.

## Integrated development release

The existing camp redesign and OpenAI provider are integrated on
`develop/private-camp-openai-integration`, preserving commits `0237067` and
`53062f5`. See [exact Cloud Run/Secret Manager configuration and the $5 first-test
procedure](docs/PRIVATE-CAMP-OPENAI-DEPLOYMENT.md). No deployment or paid request
has been performed. The first approved test uses the existing 25 MiB pipeline.
