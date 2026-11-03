# Identifier Q · Feint Labs

**Understand the fight. Engineer the improvement.**

A mobile-first boxing and kickboxing performance workspace built with React 19, TypeScript, Vite, Zod, and Lucide. The original repository contained only this README; no working application was replaced. Feint Labs is the parent innovation company.

## Run locally

Requires Node.js 22.12+ (validated on Node 24.19) and npm. No credentials, database, or environment variables are required.

```sh
npm ci
npm run dev
```

Use the existing checkout. Cloud tasks already run in isolation; creating a Git worktree is unnecessary. The dev server binds to `0.0.0.0:5173`. Production deployment is a static site:

```sh
npm run build
npm run dev -- --port 5173 --strictPort
```

Deploy `dist/` through a static HTTPS host. Hash routes work without server rewrite rules. Do not use the development server for production. GitHub Pages deployment is configured through the Actions workflow described below.

## What works

- Dashboard, four-stage analysis setup, report reader, history, comparison, and settings.
- Boxing by default; persistent discipline selection and 12 boxing / 14 kickboxing metric definitions. Rulesets gate knee and checking metrics. Changing preference never changes a stored report.
- Local 10-second to 5-minute MP4/MOV/WebM selection, size/type checks, metadata validation, codec error feedback, preview, resource cleanup, replacement, and removal. Default limit 500 MB; configurable from 10–2048 MB.
- Fighter identification by corner, initial position, or a paused-frame point plus notes. Up to five confirmation frames and a stable subject ID preserve identity independently of screen position. Frame points are normalized metadata, **not automatic tracking**. Replacing footage resets identification hints. Frame references and files do not survive reload.
- Validated submission with a truthful unavailable-engine result by default, plus an authenticated private-pilot backend connection, real upload and bounded job monitoring; no simulated progress.
- Import/export of structured schema-v1 reports, evidence-linked metrics and coaching drills, verified timestamp seeking after original-video reattachment, and source/methodology context.
- Browser-local validated report history (up to 100 reports), filters, sorting, deletion, compatible two-report comparisons, and a progression chart when compatible scored reports exist.
- Keyboard navigation, visible focus, accessible form controls and tabs, native modal focus containment, reduced motion, and safe-area-aware mobile navigation.

## Analysis integration status

The static GitHub Pages frontend does not analyze footage on its own. With no backend connection, Generate returns an explicit integration-required error and sends nothing. **No live Gemini assessment has been validated.**

A separately hosted private-pilot Node backend is implemented in `server/`. It authenticates uploads, validates actual media with ffprobe, decodes up to 120 source frames across a 10–300-second clip plus identity references, calls a server-only Gemini adapter, and validates qualitative findings into the existing report schema. All scores/confidence remain null; timestamps locate source frames, not exact strikes. HTTP/media/report paths are tested with explicitly synthetic provider adapters, not represented as live AI results.

See [Phase 2 integration, cost, hosting and privacy](docs/PHASE2-INTEGRATION.md) for configuration and the exact credential-dependent boundary. No provider credentials or paid hosting have been configured or purchased. Server-only variables are listed in `.env.example`; never put provider keys in Vite or Pages. The recommended candidate model is `gemini-3.5-flash-lite`, subject to real-footage evaluation.

Frontend-only development still needs no credentials:

```sh
npm run dev
```

After explicit provider/hosting authorization, use host-managed secrets or an ignored `.env.server` and run:

```sh
node --use-env-proxy --env-file=.env.server --import tsx server/main.ts
```

Connect its HTTPS URL and private pilot session token in Settings; that token is held in memory, not persisted. The browser asks for a backend access token, never a Gemini API key. The first live pipeline is boxing-only, 10 seconds–5 minutes, ≤100 MB. Kickboxing local setup and authentic imported reports remain supported.

## Persistence and privacy

Preferences, lightweight setup metadata, and completed structured reports use versioned localStorage keys. Full videos are never stored there. Video object URLs and frame references exist only in the current session. After reload, choose footage again and reconfirm any manual frame reference. Configured athlete identity is preserved as metadata, not verified identity.

There is no account isolation, cloud backup, or application-level encryption. People using the same browser profile can see the saved library. Quota/access errors are surfaced; corrupted records are preserved for export and explicit recovery. Exported report JSON can be reimported in History. Settings' raw workspace backup preserves even corrupted storage strings for manual recovery; it is not a one-click restore format.

Imported reports are schema-validated, **not fact-checked**. Only import authentic reports from a trusted source. Files over 5 MB are rejected before parsing. Validation checks versions, discipline/ruleset metric membership, unique IDs, evidence links, scored metric support, recommendations, and timestamp bounds. React renders report strings as text, never HTML. Original video reattachment checks name, size, and duration; it is not a cryptographic identity guarantee.

## Quality checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Backend/media tests require `ffmpeg` and `ffprobe` with libvpx; browser tests also require Chromium. `/usr/bin/chromium` is used when available; otherwise install Playwright's Chromium (`npx playwright install chromium`) or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its path. Tests generate a twelve-second black WebM under `/tmp/identifier-q-tests`; it is codec-test footage, not a combat assessment. Synthetic reports live only in `tests/fixture.ts` and are never imported by application code. Playwright starts the dev server automatically. In restricted cloud execution, browser launch and local networking may require the supported command-sandbox escalation.

## Structure

- `src/domain/`: versioned Zod contracts, grading display scale, discipline models, comparison, video validation.
- `src/services/`: local persistence, unavailable adapter, and validated authenticated HTTP transport.
- `server/`: private-pilot upload/job API, ffmpeg preprocessing, server-only provider adapter and qualitative report validation.
- `src/components/`: shell UI primitives, dashboard, workflow, report, library, preferences.
- `src/state/useWorkspace.ts`: workflow state, media lifecycle, persistence coordination, and submission.
- `src/App.tsx`: hash routing and the responsive application shell.
- `tests/`: Chromium workflow, responsive, report, and accessibility tests.

See [Phase 2 integration notes](docs/PHASE2-INTEGRATION.md) and [regression coverage](docs/ACCEPTANCE-REGRESSION.md) for remaining work and validation limits.

## GitHub Pages

The public deployment target is https://quddha16-pixel.github.io/feint-iq/.
Pushes to `main` run `.github/workflows/deploy-pages.yml`, which validates, builds,
and deploys `dist/` using GitHub Actions. Production assets use the `/feint-iq/`
base path; local development remains at `/`. See [Pages deployment instructions](docs/GITHUB-PAGES.md).

## Shades Of

Report overviews can show up to three evidence-linked stylistic fighter references,
with an explanation and links to the relevant observations. Comparisons describe
limited technical similarities, not equal ability or measured similarity. Reports
without supported comparison data show an honest empty state. The backend contract
and Gemini prompt support this optional field; live generation still requires an
authorized backend/provider and real-footage validation.
