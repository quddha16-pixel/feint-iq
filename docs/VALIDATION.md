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
