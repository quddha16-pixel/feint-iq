# Frontend streaming response repair

The Pages client previously used `response.json()` on the successful
`POST /analyses` response. The live backend uses `application/x-ndjson`:
multiple job/heartbeat records followed by a terminal result or error. Those
records are not a single JSON document. This explains the reported unreadable
JSON error even though the upload arrived and Cloud Run returned HTTP 200.
The request log alone cannot establish whether the terminal event was success
or a provider error.

This frontend consumes `request-stream-v1` incrementally, validates job/report
identity, shows actual processing stages, and obtains the completed report
from the same response. It accepts a complete final record without a newline,
rejects incomplete/malformed JSON and nonterminal streams, and preserves
backend errors. Heartbeats never count as completion. Cancellation aborts the
active request before attempting a best-effort DELETE. Ambiguous failures keep
the submission key for an explicit retry; the client does not retry automatically.

The matching contracts and workflow UI must be released with the adapter.
The UI describes the existing live 25 MiB limit and foreground-tab requirement.
Bearer authentication, credential handling, allowed origins and cloud resources
are unchanged. Existing dependencies and their lockfile are retained.

The fix originated on `prepare/cloud-run`; the frontend-only release branch is
`fix/frontend-analysis-stream`. The broader branch also contains backend and
infrastructure preparation that is deliberately excluded from this release.
`server/backend.test.ts` only updates the advertised shared-limit expectation;
no production server implementation, Docker file, cloud configuration, or
backend workflow is changed. Browser tests use an explicitly synthetic local
streaming server in `tests/streaming-backend.ts` because the historical server
source on main predates the live request-bound protocol. That fixture is never
bundled into the frontend or used as a deployed backend.

Merging the PR into main triggers `.github/workflows/deploy-pages.yml`, which
runs npm ci, type checking, lint, unit tests and the production build before
uploading dist and deploying GitHub Pages. Publication remains subject to those
checks and any GitHub environment protection rules. Reload Pages after the
deployment succeeds to load the new frontend assets.

Cloud Run is not modified or redeployed by this release. The registered backend
build workflow is manual-only; it is not triggered by this branch or a merge.
Do not merge the broader preparation branch or manually dispatch a backend
workflow for this frontend repair.
