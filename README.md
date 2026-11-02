# Identifier Q · Feint Engineering

**Understand the fight. Engineer the improvement.**

A mobile-first boxing and kickboxing performance workspace built with React 19, TypeScript, Vite, Zod, and Lucide. The original repository contained only this README; no working application or backend was replaced.

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

Deploy `dist/` through a static HTTPS host. Hash routes work without server rewrite rules. Do not use the development server for production. There is no deployment integration or infrastructure provisioned here.

## What works

- Dashboard, four-stage analysis setup, report reader, history, comparison, and settings.
- Boxing by default; persistent discipline selection and 12 boxing / 14 kickboxing metric definitions. Rulesets gate knee and checking metrics. Changing preference never changes a stored report.
- Local MP4/MOV/WebM selection, size/type checks, metadata validation, codec error feedback, preview, resource cleanup, replacement, and removal. Default limit 500 MB; configurable from 10–2048 MB.
- Fighter identification by corner, initial position, or a paused-frame point plus notes. Frame points are normalized metadata, **not automatic tracking**. Replacing footage resets identification hints. Frame references and files do not survive reload.
- Validated submission with a truthful unavailable-engine result; no fake upload or analysis progress.
- Import/export of structured schema-v1 reports, evidence-linked metrics and coaching drills, verified timestamp seeking after original-video reattachment, and source/methodology context.
- Browser-local validated report history (up to 100 reports), filters, sorting, deletion, compatible two-report comparisons, and a progression chart when compatible scored reports exist.
- Keyboard navigation, visible focus, accessible form controls and tabs, native modal focus containment, reduced motion, and safe-area-aware mobile navigation.

## Analysis is not connected

**This application does not analyze footage.** There is no CV model, tracking, upload endpoint, job queue, provider, authenticated account, or remote storage. Generate validates the configuration and returns an explicit integration-required error. Nothing is sent to a server. No samples or fictional assessments are bundled with the application.

`src/services/analysis.ts` is the provider-independent service boundary. See [engine integration](docs/ENGINE-INTEGRATION.md) for the backend requirements, lifecycle, security, report shape, and rollout criteria. The typed contract is not an implemented analysis pipeline.

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

Browser tests require Chromium and `ffmpeg` with libvpx. `/usr/bin/chromium` is used when available; otherwise install Playwright's Chromium (`npx playwright install chromium`) or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its path. Tests generate a three-second black WebM under `/tmp/identifier-q-tests`; it is codec-test footage, not a combat assessment. Synthetic reports live only in `tests/fixture.ts` and are never imported by application code. Playwright starts the dev server automatically. In restricted cloud execution, browser launch and local networking may require the supported command-sandbox escalation.

## Structure

- `src/domain/`: versioned Zod contracts, grading display scale, discipline models, comparison, video validation.
- `src/services/`: local persistence and the unavailable analysis adapter.
- `src/components/`: shell UI primitives, dashboard, workflow, report, library, preferences.
- `src/state/useWorkspace.ts`: workflow state, media lifecycle, persistence coordination, and submission.
- `src/App.tsx`: hash routing and the responsive application shell.
- `tests/`: Chromium workflow, responsive, report, and accessibility tests.

See [implementation notes](docs/IMPLEMENTATION.md) for remaining work and validation limits.

## GitHub Pages

The public deployment target is https://quddha16-pixel.github.io/feint-iq/.
Pushes to `main` run `.github/workflows/deploy-pages.yml`, which validates, builds,
and deploys `dist/` using GitHub Actions. Production assets use the `/feint-iq/`
base path; local development remains at `/`. See [Pages deployment instructions](docs/GITHUB-PAGES.md).
