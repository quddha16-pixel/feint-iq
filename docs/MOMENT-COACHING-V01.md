# Identifier Q v0.1: moment finding and basic defensive coaching

Implemented locally on develop/private-camp-openai-integration; not deployed.
This is a lightweight search-and-review workflow, not comprehensive fight
intelligence, reliable punch recognition, contact detection or continuous tracking.
Automated tests use synthetic codec footage and mocked providers. No real boxing
accuracy or paid OpenAI access is established by those tests.

## Workflow and boundaries

1. Connect the existing authenticated OpenAI backend. Health advertises optional
   momentDetection support; older backends and Gemini retain their existing path.
2. Upload boxing footage through the unchanged 25 MiB / 10–300-second pilot.
   Confirm Vince using the existing identity-reference controls.
3. At Review & generate, leave “Find moments and basic defensive coaching” checked.
   Uncheck it for the retained sparse-frame pipeline. The choice persists in the
   local draft. No large-upload architecture is added.
4. The server scans a tiny 160x90 grayscale sequence at **at most 6 FPS**. Median
   luminance change is removed; residual image differences rank candidate peaks.
   Large global changes are conservatively excluded as possible cuts/flashes.
   Peaks are separated, capped and sorted chronologically. This is not a boxer,
   glove, pose, punch, contact, defensive-opening or counter-opportunity detector.
5. Each selected peak gets up to 1.5 seconds before and after it. A second decode
   extracts up to 6 FPS within these windows at a maximum 960-pixel side. Actual
   decoder PTS locate each source frame; no event timestamp is invented by the
   model. Before/after evidence and chronological order are validated. Low-FPS
   and VFR input retain actual available frames without fabricated interpolation.
6. If no suitable peaks are found, sample up to three separated short intervals
   across the recording. These are explicitly labelled coverage samples, not
   detected events. If no usable interval exists, fail before provider submission.
7. One bounded OpenAI Responses generation receives the selected sequences and
   identity references, not thousands of full-resolution frames. Optional token
   preflight and the existing single-request dollar guard apply to that batch.
   There are no per-moment retry loops, automatic provider switches or extra
   synthesis calls. Usage receipts/logging and NDJSON request-stream-v1 stages,
   terminal errors, cancellation, cleanup and idempotency remain operational.
8. Strict output validation requires each selected moment exactly once, in order,
   with distinct evidence from that same interval. Outcomes are limited to
   possible-landed / possible-missed / possible-blocked / unclear / not-visible.
   These labels are interpretations, never independently confirmed contact.
   Unknown identity cannot yield a personalized correction or drill.
9. Reattach the original video on the report screen to play each interval and
   inspect chronological source-frame timestamps. Images/video are not stored in
   report JSON or browser storage. Filename/size/duration compatibility checks
   are not a cryptographic guarantee; attach the actual original footage.
10. Review the AI description, defensive vulnerability, countering hypothesis,
    correction, simple drill and uncertainty. Mark each assessment Correct,
    Incorrect or Uncertain. Separately mark whether selecting the interval was
    useful. Add a coach correction and record missed timestamps after watching
    the entire recording, including unselected sections.

Recommendations prioritize guard recovery, chin positioning, stance/balance,
defensive exits, head movement, distance, and countering after defense when the
visible sequence supports them. Null coaching is valid. No scores, strike counts,
measured accuracy, inferred intent or full-round tactical certainty are requested.
The legacy OpenAI prompt/schema and manually selected Gemini fallback remain intact.

## Configuration and cost

Server-only optional settings (validated at startup):

| Variable | Default | Bound |
| --- | --- | --- |
| MOMENT_MAX_COUNT | 4 | Integer 1–6 |
| MOMENT_MOTION_THRESHOLD | 0.025 | 0.005–0.2 normalized residual pixel difference |

The threshold is an uncalibrated image-change threshold, not a probability of an
exchange. Six intervals contain at most 120 sequence frames in total, plus at
most five identity references. The existing 19 MiB provider-request body guard,
output limits, timeout and temporary-file cleanup still apply. Higher-detail
images can cost more than legacy screenshots; fewer frames do not establish a
particular dollar cost. Use OPENAI_MAX_REQUEST_USD=4.50 for the approved single
$5-budget attempt and inspect actual usage afterwards. It is not an account-wide
spending cap. No inference is authorized by running tests or this document.

OPENAI_MODEL and provider selection remain server-side. Follow
[the existing Secret Manager / Cloud Run runbook](PRIVATE-CAMP-OPENAI-DEPLOYMENT.md)
for any separately approved future release. Build an image from this new commit;
changing environment variables on an older image does not install moment mode.
No new bucket, database, queue, GPU, billing change or always-on worker is needed
for this implementation. The existing private-host candidate limitations remain;
use the trusted local camp UI for the approved first test. Do not publish this
branch to public Pages or weaken authentication/CORS.

## Coach feedback and preservation

Reports remain schemaVersion=1 with an optional validated momentAnalysis field;
old reports, imports, comparisons, profiles, planning and camp backups remain
readable. A distinct methodology version prevents numerical comparison across
pipelines. Coach feedback is stored alongside the saved report, separate from
original AI assessments, and included in report export/import and the existing
workspace report backup. Camp-only backup is not a report-library backup.

Feedback saving refuses invalid/corrupt storage or a library changed in another
tab. Storage failures are visible; no successful save is claimed. Records are
browser-local, not shared, encrypted or automatically used for model training.
Export important reviews. Changing browser/origin can hide local records.

## Evaluate false positives AND missed moments

Selection usefulness, AI correctness and search recall are different quantities.
Do not estimate recall from the selected cards alone or treat an empty fallback
as proof that no exchange occurred.

For a consented real clip, have a coach watch the WHOLE recording and annotate
ALL meaningful moment anchor timestamps, independently of detector selections.
Include quiet actions and low-motion defensive openings. Prefer a second coach
for disagreements. Keep a held-out set of sessions when tuning thresholds;
adjacent clips from the same exchange must not straddle tuning/evaluation sets.

Export the moment report, then create a private local annotations JSON file:

```json
{
  "videoId": "COPY_FROM_EXPORTED_REPORT_VIDEO_ID",
  "wholeClipReviewed": true,
  "moments": [
    { "time": 12.4, "note": "Coach-observed meaningful exchange" },
    { "time": 28.1, "note": "Coach-observed quiet defensive opening" }
  ]
}
```

The example timestamps are illustrative, not observations of Vince. Include all
annotated meaningful moments, not just misses. Run this offline command:

```sh
node --import tsx server/benchmark-moments.ts report.json annotations.json
```

It reports annotated/covered/missed moments, candidate windows without an
annotated anchor, coverage recall and candidate precision. Matching means the
annotated point lies inside a selected window. Multiple anchors in one window
are coverage, not a measured action count. Null denominators remain null. This
measures search coverage at that chosen window width; it does not validate punch
classification, onset timing, coaching correctness or frame-by-frame tracking.
Report fallback and motion-selected runs separately and disclose footage quality.

The UI also records missed timestamps and distinguishes those outside selected
windows (search misses) from those inside (possible AI omissions). Its whole-clip
review checkbox records the coach's assertion; it is not independent proof of
complete annotations. These notes alone are not an exhaustive benchmark set.

Automated fixtures explicitly include a selected nuisance peak and a quiet
annotated moment that is missed, so both false positives and false negatives are
counted. Black, moving-test-pattern and VFR codec fixtures verify decoding and
source timestamps, not real action recognition. Evaluate real footage before
claiming useful detection performance.

## First real-clip acceptance (requires separate paid-call approval)

Use the existing deployment guide's private key/model-access, consent and budget
checks, then upload one clear 30–60-second boxing clip under 25 MiB. Submit once.
Confirm that plausible intervals and decoder evidence are present, check Vince's
identity in each interval, inspect all AI claims against playback, and verify
basic corrections/drills with the coach. Log actual input/cache/output/reasoning
tokens and cost from the authenticated usage receipt; reconcile failed attempts
before another call. Watch the entire clip and annotate misses as above.

A successful upload and plausible report establish workflow operation, not
recall or contact accuracy. Camera movement, zooms, flashes and other people can
produce nuisance peaks; quiet exchanges, small/distant glove movement, low FPS,
blur and occlusion can be missed. There is no pose tracker, learned combat-action
model, calibrated detector confidence, replay deduplication, guaranteed identity
continuity, 1 GB upload, premium GPU or validated whole-round intelligence here.

## Verification for this change

- npm test: 118 tests passed across 14 files.
- npm run test:e2e -- --timeout=90000: 29 browser tests passed. The extended
  moment regression also verifies export/reload, preservation of existing
  reports, corrupt/newer storage protection, and visible storage-write failures.
- Type checking, lint, production build and git diff --check passed.
- A separate automated WCAG 2.1 AA check on the moment review screen reported
  no violations at 390 pixels, with no horizontal overflow.
- A five-minute 64x64 black codec smoke fixture produced 1,200 scan samples,
  three fallback intervals and 40 provider images (including one identity
  reference); preprocessing took about one second on this executor. Container
  timestamp quantization affects available sampling intervals. This tiny static
  fixture is not a real-footage speed benchmark or coaching validation.
- The offline evaluation command was exercised with a synthetic covered anchor,
  a missed anchor and a nuisance selection: coverage recall 0.5, candidate
  precision 0.5. These demonstrate accounting, not boxing detection accuracy.

The new screen prioritizes moment cards and omits the legacy empty scorecard
for moment reports. Existing reports retain their existing report interface.
No cloud resources, deployment, billing or paid provider requests were changed.
