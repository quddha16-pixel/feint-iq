# GitHub OIDC authentication: immutable subject correction

The failed [Actions run 41937514944](https://github.com/quddha16-pixel/feint-iq/actions/runs/41937514944) passed every quality step, then Google STS returned `unauthorized_client`: **“The given credential is rejected by the attribute condition.”** The Cloud Build submission step was skipped. This run produced no Cloud Build ID or image digest. This is a provider-condition rejection, not evidence that the build service account needs broader IAM.

## Confirmed repository-side mismatch

Read-only GitHub API inspection returned:

```json
{
  "use_default": true,
  "use_immutable_subject": true,
  "sub_claim_prefix": "repo:quddha16-pixel@297506389/feint-iq@1443546506"
}
```

Endpoint: `GET /repos/quddha16-pixel/feint-iq/actions/oidc/customization/sub`. Repository API metadata independently confirms repository ID **1443546506** and owner ID **297506389**. GitHub's [OIDC reference](https://docs.github.com/en/actions/reference/security/oidc) documents the immutable default subject format for repositories created after July 15, 2026, as well as repositories that opt in or subsequently rename/transfer. This repository explicitly reports the immutable format; no creation-date assumption is needed.

The old `common.py` condition required:

```text
repo:quddha16-pixel/feint-iq:environment:identifierq-build
```

The default subject for this repository's `identifierq-build` job is:

```text
repo:quddha16-pixel@297506389/feint-iq@1443546506:environment:identifierq-build
```

An exact equality between these strings cannot pass. The correction changes only the expected `sub` value; every other constraint remains an AND requirement. The future deploy subject uses the same immutable repository prefix with `environment:identifierq-deploy`, but this task does not update/create/authorize any deploy-side resource.

| Claim | Required value | Evidence and limits |
| --- | --- | --- |
| `repository_id` | `1443546506` | Repository API; source guard passed |
| `repository_owner_id` | `297506389` | Repository owner API; source guard passed |
| `repository` | `quddha16-pixel/feint-iq` | Repository/run API; source guard passed |
| `ref` | `refs/heads/prepare/cloud-run` | Run branch and passed source guard |
| `event_name` | `workflow_dispatch` | Run API and passed source guard |
| `workflow_ref` | `quddha16-pixel/feint-iq/.github/workflows/build-backend.yml@refs/heads/prepare/cloud-run` | Run workflow path and passed `GITHUB_WORKFLOW_REF` guard; this is the normal workflow, not a reusable `job_workflow_ref` |
| `sub` | Immutable subject above | GitHub's current OIDC policy metadata plus documented environment-subject construction |

These are the expected token claims derived from authoritative settings and the observed run context. The completed runner's short-lived JWT is unavailable; no token was captured, decoded or printed. GitHub's public [OpenID discovery document](https://token.actions.githubusercontent.com/.well-known/openid-configuration) lists the required claim names, including `workflow_ref`. **JWT claims and runner environment variables are distinct evidence sources**; the table does not claim that the historical JWT was inspected.

## Next iPhone step: read-only live provider comparison

From the existing clean `prepare/cloud-run` Cloud Shell checkout:

```bash
git pull --ff-only origin prepare/cloud-run && bash deploy/cloudrun/iq verify-wif
```

This reads only the fixed project's ID/number and the exact pool/provider metadata. It does not mint a GitHub token, exchange Google credentials, read secret values, build, deploy, enable APIs or modify IAM. It prints only expected claim values and recognized condition differences, not arbitrary provider/debug fields. The report labels its evidence as expected claims, not a fresh token capture. It saves a non-secret temporary `wif-build-check` JSON record.

The provider's exact identity, active state, issuer, default audience validation and two attribute mappings must match the reviewed setup. Report outcomes:

- **`LEGACY_SUBJECT_ONLY`**: the live condition matches the entire old seven-clause condition exactly. All six other clauses match; a provider update is required.
- **`CURRENT`**: the provider already requires the exact immutable subject and all existing clauses. No update is needed. This verifies configuration, not a fresh successful STS exchange.
- **`UNRECOGNIZED_CONDITION` or a metadata/permission error**: stop; the helper refuses repair. Unknown state is not treated as absence. Do not remove conditions, recreate the provider or add broader grants.

This workspace has no gcloud installation/connected Google Cloud identity. Until authenticated Cloud Shell inspection returns, the actual live provider condition remains unverified here. A provider created by the original setup requires this correction. If you already supplied the direct read-only `gcloud ... providers describe` output, that also establishes its current condition without exposing a token.

## Separate Google Cloud modification: exact build-provider repair

Only after the read-only report identifies **`LEGACY_SUBJECT_ONLY`**, the owner can apply the scoped subject correction:

```bash
bash deploy/cloudrun/iq repair-wif --approve-subject-update
```

This **modifies Google Cloud provider configuration**. It repeats the same reads first and refuses any unrecognized condition, identity, state, issuer, custom JWKS, audience or mapping. It runs one `gcloud iam workload-identity-pools providers update-oidc github-build` with the fixed project/global pool and **only** `--attribute-condition=<the exact corrected seven-clause condition>`. It does not modify any other provider fields or any IAM policy. It does not change GitHub's immutable-subject setting. Branch, repository IDs/name, event, workflow, environment, issuer and audience restrictions remain enforced.

The mapping remains `google.subject=assertion.sub` and `attribute.pipeline='build'`. The service-account binding uses the pipeline principal set, not the old literal subject, so **no service-account IAM binding update is required for this correction**. The existing CI/build/runtime identities, roles and permissions are retained.

Success requires fresh metadata read-back of the exact corrected configuration. Repeating the command against `CURRENT` does nothing. Ambiguous write/read-back errors record `UPDATE_UNVERIFIED`; run `verify-wif` to inspect rather than blindly replaying the update. No automatic retry or rollback is performed. Diagnostic records use `/tmp/identifierq-automation/identifierq-wif-build-*.json` in Cloud Shell, or `RUNNER_TEMP` when set.

Read permissions: `resourcemanager.projects.get`, `iam.workloadIdentityPools.get`, `iam.workloadIdentityPoolProviders.get`. The optional repair additionally requires `iam.workloadIdentityPoolProviders.update`. Use the existing authorized project-owner Cloud Shell login. The automation does not grant itself permissions, enable APIs, upgrade billing, or ask for a service-account key.

## Stop after verification

Do not start another build as part of this investigation. A later explicitly authorized build retry must use a new manual dispatch on `prepare/cloud-run` with the trial confirmation checked after verifying eligibility. Its real STS exchange is the eventual runtime confirmation. Cloud Run deployment and frontend publication remain separately unauthorized.

Do not paste a JWT, use an external JWT-decoding website, print the runner's OIDC request bearer token, or enable HTTP authentication debug logging. The metadata diagnostic resolves this format mismatch without a token. If configuration is `CURRENT` and a later authorized run still fails, inspect that run's specific metadata/subject policy before changing any additional condition.

## Tests

Offline tests cover the exact immutable format, unchanged six clauses, no legacy OR fallback, separate build/deploy subjects, normal setup's rejection of legacy trust, metadata-only inspection, no credential output, missing permissions/resources, strict repair preconditions, a single-field update, idempotency, ambiguous writes and read-back failure. Synthetic fixtures never call Google, mint an OIDC token or submit a build.
