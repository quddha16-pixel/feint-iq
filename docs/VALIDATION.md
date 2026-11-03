# Validation — 2026-11-02

Validated in the managed Linux environment with Node 24.19, npm 11.9, system Chromium, and ffmpeg/libvpx.

| Check                                                       | Result                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| `npm ci --no-audit --no-fund --cache /tmp/identifier-q-npm` | Clean lockfile installation passed                                  |
| `npm run typecheck`                                         | Passed                                                              |
| `npm run lint`                                              | Passed, no errors or warnings                                       |
| `npm test`                                                  | 21 tests passed in 2 suites                                         |
| `npm run build`                                             | Passed; static output in `dist/`                                    |
| `npm run test:e2e`                                          | 14 browser tests passed                                             |
| Production Chromium smoke                                   | HTTP 200, dashboard and new-analysis route rendered, no page errors |
| `git diff --check`                                          | Passed                                                              |

Browser coverage includes the complete four-step setup, first-time boxing preference, discipline and ruleset changes, invalid-file/codec feedback, local video preview, manual frame reference, replacement resets, restored metadata after reload, honest unavailable-engine submission, structured-report imports, saved discipline preservation, evidence seeking at a verified test timestamp, recommendations/drills, history filtering/comparison, corrupted-storage recovery, keyboard dialog behavior, and responsive navigation at 320/375/390/430/768/1440 pixels. A populated report and the workflow were additionally checked for overflow at 320px.

Axe reported no WCAG 2.1 A/AA violations on the five main empty screens and all three populated report tabs. This is automated coverage, not a complete accessibility certification. No synthetic test athlete or sample assessment text was included in the built application bundle.

Early browser checks exposed ambiguous selectors and a real dialog focus-restoration issue; both were corrected and the complete final suite passed. No currently failing checks remain.

Physical iPhone/Safari validation, continuous fighter tracking, real analysis output, server upload/security, authenticated ownership, and cloud report persistence were not tested because those capabilities are not present. No actual fight footage was analyzed. See IMPLEMENTATION.md and ENGINE-INTEGRATION.md for the remaining work.

# Phase 1.5 / Phase 2 validation — 2026-11-03

| Check                   | Current result                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Type checking           | Passed, frontend, backend and tests                                                                                      |
| ESLint                  | Passed without warnings                                                                                                  |
| Unit/integration suites | **42 tests passed**, 4 suites                                                                                            |
| Chromium suites         | **22 tests passed**, including all original 14 regression scenarios                                                      |
| Production build        | Passed with `/feint-iq/` asset paths                                                                                     |
| Production static smoke | HTML/JS/CSS loaded; six screens, hash navigation and reload passed without page errors                                   |
| Backend Docker build    | Passed, production dependencies only, unprivileged `node` user                                                           |
| Container runtime smoke | Authenticated health and 10–300-second limits passed; provider correctly unavailable; unauthenticated calls returned 401 |
| Container media smoke   | A generated 10-second codec-test clip decoded into real source-PTS sequence and identity frames without a provider       |
| Bundle boundary scan    | No Gemini transport/key header or synthetic provider adapter content in the static bundle                                |
| Whitespace check        | `git diff --check` passed                                                                                                |

The Node backend suite exercises real HTTP authentication, origin restriction, metadata preservation, duplicate protection, busy-worker rejection, cancellation, timeout, result expiry, unknown-frame rejection, and provider error handling. Real ffmpeg decoding was verified for 10-second and 300-second generated codec footage. The browser suite submits a real HTTP multipart upload to the backend, decodes it, polls its job, and renders its report using an **explicitly synthetic test provider**. This validates the integration path, not an actual model's combat analysis.

Shades Of tests cover optional legacy compatibility, one-to-three references, unknown/duplicate/discipline-mismatched references, missing observation links, source-evidence requirements, provider-index mapping, visible explanations, evidence navigation, and narrow-screen layout. All comparison fixtures are test-only.

The first Docker startup exposed source-file ownership incompatible with the unprivileged runtime user. `COPY --chown=node:node` fixed that; the rebuilt image started successfully. A completion/cleanup race in duplicate-job handling was also fixed: reports become available only after temporary source cleanup. No assertions were disabled to make the checks pass.

No live Gemini request, genuine fighter assessment, authentic stylistic comparison, provider billing operation, hosted backend deployment, or physical iPhone/Safari test was performed. The original separate 29-point device checklist was not present; see ACCEPTANCE-REGRESSION.md for the available behavior mapping and the explicit verification limits. Model/provider authorization and a consented real-footage evaluation remain necessary.

# Final Free Trial / Free Tier readiness review — 2026-11-03

Type checking, ESLint, all **59 unit/integration tests**, all **23 Chromium browser tests**, and the production Vite build passed. The current client uses request-stream-v1: complete reports arrive in the same open response, without background polling. Tests include quota exhaustion with no retry/model switch, authenticated HTTP streaming, actual FFmpeg decoding, fighter metadata, error/cancellation handling and responsive regressions. No live model or real footage was used.

A rebuilt production container passed the Cloud Run contract locally under 1 CPU/2 GiB: non-root, injected PORT=9090, FFmpeg/ffprobe installed, minimal public probe, protected health, exact Pages-origin CORS, request-stream-v1 and 25 MiB/10–300-second limits. Six documented Bash blocks and both shell files passed syntax checks; cloud mutation commands were not executed. The read-only preflight reported that gcloud is absent from this environment. No connected GCP identity is available, so effective IAM, enabled secret versions, trial balance/tier, model quota and Cloud Run proxy behavior remain unverified.

Existing public Pages HTML/JS/CSS returned HTTP 200. Main and its workflow were unchanged; the public client still uses the older transport. The compatible frontend on this preparation branch must be separately authorized for publication before connecting to the new backend. No deployment, cloud resource creation, secret-payload access, provider request or billing upgrade occurred. See the [readiness runbook](../deploy/cloudrun/README.md) for the exact existing-secret mapping, future IAM/build/deployment commands and iPhone Cloud Shell procedure.
