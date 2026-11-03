# Implementation scope and remaining work

## Repository assessment

Initial checkout: README only, no framework, dependency lock, API, environment variables, database, tests, deployment configuration, or working components. Node 24.19, npm 11.9, ffmpeg, and system Chromium were available. React/TypeScript/Vite is a new static frontend foundation; Zod validates data; Lucide provides icons. No framework migration or existing functionality removal occurred. The chosen hash router requires no deployment rewrite support.

## Verification limits

Automated browser tests use Chromium, including phone-sized viewports at 320, 375, 390, and 430 pixels, tablet 768, and desktop 1440. A browser-compatible synthetic WebM exercises metadata, video preview, manual identification, and seeking. This does not verify actual boxing/kickboxing recognition. iOS Safari hardware, MOV/HEVC variants, camera roll permissions, device memory limits, and on-device native video controls still need physical iPhone testing. MOV support is conditional on the browser codec; a useful error recommends H.264 MP4 when decoding fails.

Schema tests deliberately use synthetic reports. No synthetic report is accessible in the production app. The report reader can display real compatible structured data, but an external producer must supply authentic findings. No model quality or backend load/performance validation is possible without a backend.

## Remaining engineering priorities

1. Select and validate a specialized video-analysis pipeline; obtain authorized footage and measure fighter tracking, event timing, technical classifications, and evidence sufficiency. This is a substantial engineering dependency, not a missing API key.
2. Build an authenticated server, owner-scoped object storage, actual upload transfer, immutable durable jobs, monitoring, cancellation, retry/idempotency, and real report retrieval. Wire the service boundary only after the full lifecycle works.
3. Publish a scoring methodology and grade scale versioning strategy; independently validate that category scores and recommendations are supportable. Verify exact competition rules, especially local/custom variations.
4. Add account/athlete IDs, team permissions, database persistence, browser-to-cloud migration, retention and deletion controls. localStorage does not support secure multi-user isolation or concurrency conflict resolution across tabs.
5. Validate on physical iPhones and Safari codecs, then test long-duration footage and resource budgets on target devices. Browser-local file checks are UX validation, not server security controls.
6. Enable GitHub Pages with GitHub Actions as the source, then rerun the committed deployment workflow. The production asset base is `/feint-iq/`; see GITHUB-PAGES.md for the permission blocker and activation steps.

## Deliberate boundaries

No automatic tracking, event detection, punch counts, accuracy calculation, personalized recommendations, grades, or timestamps are invented. The app has an explicit engine-unavailable state. The local frame selector stores a point/time hint, not a bounding box or identity model. Reports preserve their submitted discipline when the preferred discipline changes. Browser preference changes reset unsubmitted ruleset information; a saved report never mutates. The service interface models future jobs, but no queued/processing demo or simulated percentage exists.

## Current Phase 1.5 / Phase 2 status

The earlier sections record the original foundation. Feint Labs branding/About, responsive refinements, 10–300-second video validation, multiple identity confirmations, the authenticated HTTP transport, private-pilot Node/ffmpeg/Gemini boundary, qualitative report mapping, and evidence-linked Shades Of comparisons are now implemented. No live provider analysis, continuous tracking, numerical scoring, account system, hosted backend, or durable server jobs are claimed. See PHASE2-INTEGRATION.md and ACCEPTANCE-REGRESSION.md for current configuration and validation limits.
