# Phase 1.5 / 2 regression coverage

The repository did not contain the separate 29-point physical-iPhone acceptance checklist mentioned in the request. It is not possible to claim that exact checklist or a physical Safari test was rerun. Existing automated behaviors were preserved, with the requested intentional changes to branding/CTA and the 10–300-second duration envelope. The following 29 behavior areas describe the executable coverage available here; they are not a substitute for the original device test.

| #   | Behavior                                                                     | Evidence                                                               |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | Dashboard renders without fabricated statistics                              | app.spec.ts empty dashboard/navigation                                 |
| 2   | Exact iQ logo capitalization                                                 | phase2.spec.ts, phone/desktop                                          |
| 3   | Use identifierQ opens the workflow                                           | app.spec.ts                                                            |
| 4   | History navigation                                                           | app.spec.ts                                                            |
| 5   | Browser back navigation                                                      | app.spec.ts                                                            |
| 6   | First-time boxing default                                                    | app.spec.ts                                                            |
| 7   | Persistent discipline preference                                             | app.spec.ts                                                            |
| 8   | Kickboxing metric/ruleset switching                                          | app.spec.ts                                                            |
| 9   | Saved-report discipline is immutable                                         | app.spec.ts                                                            |
| 10  | Invalid file format feedback                                                 | app.spec.ts                                                            |
| 11  | Compatible local video preview/metadata                                      | app.spec.ts                                                            |
| 12  | Unsupported codec feedback                                                   | app.spec.ts                                                            |
| 13  | 10-second to 5-minute duration bounds                                        | phase2.spec.ts; real 10/300-second backend media tests                 |
| 14  | File removal and replacement                                                 | app.spec.ts                                                            |
| 15  | Replacement resets identity hints                                            | app.spec.ts                                                            |
| 16  | Fighter name, corner and notes                                               | app.spec.ts                                                            |
| 17  | Manual paused-frame reference                                                | app.spec.ts                                                            |
| 18  | Multiple confirmation frames/removal                                         | phase2.spec.ts                                                         |
| 19  | Subject identity independent of position                                     | phase2.spec.ts and HTTP metadata tests                                 |
| 20  | Backward step navigation preserves inputs                                    | app.spec.ts                                                            |
| 21  | Required-field and unavailable-engine submission feedback                    | app.spec.ts                                                            |
| 22  | Authentic-service boundary, actual HTTP upload and job monitoring            | phase2.spec.ts with explicitly synthetic provider; no live-model claim |
| 23  | Structured report rendering and unavailable metrics                          | app.spec.ts; contract tests                                            |
| 24  | Source evidence seeking and drill rendering                                  | app.spec.ts                                                            |
| 25  | Real persisted report import/export foundations and reload                   | app.spec.ts; storage tests                                             |
| 26  | History filtering and compatible comparisons                                 | app.spec.ts                                                            |
| 27  | Corrupt-storage recovery and quota failure feedback                          | app.spec.ts; storage tests                                             |
| 28  | Responsive navigation and no horizontal overflow at 320/375/390/430/768/1440 | app.spec.ts and phase2.spec.ts                                         |
| 29  | Keyboard focus, semantic controls, automated accessibility                   | app.spec.ts and accessibility.spec.ts; About and report tabs audited   |

Browser automation uses Chromium and synthetic codec footage; the test-only provider is explicitly labeled and is not accessible in the shipped application. Physical iPhone Safari validation, including camera-roll selection, native video controls and codecs, should be repeated using the original checklist before a release claim.
