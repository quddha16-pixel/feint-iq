# Build CI authentication diagnostics

Run under investigation: [42732216946](https://github.com/quddha16-pixel/feint-iq/actions/runs/42732216946), on `prepare/cloud-run`. The reported failure is the first `gcloud projects describe feint-identifierq`, after the quality job and credentials-file creation. This workspace could not fetch that run through the GitHub API (Forbidden) and has no gcloud/Google identity. The live root cause is **unverified**; these changes fix the diagnostic gap, not Google IAM.

## What the existing evidence establishes

The pinned [auth action main](https://github.com/google-github-actions/auth/blob/7c6bc770dae815cd3e89ee6cdf493a5fab2cc093/src/main.ts) writes the external-account credentials file **before** its `getToken()` call. A created-file message alone establishes neither exchange nor impersonation success. The pinned [WIF client](https://github.com/google-github-actions/auth/blob/7c6bc770dae815cd3e89ee6cdf493a5fab2cc093/src/client/workload_identity_federation.ts) implements `getToken()` using Google STS. Thus a successful auth **step** establishes its GitHub OIDC retrieval and STS exchange at that time. With no `token_format: access_token` input, it does not validate the service account's `generateAccessToken` operation. Instead the file instructs gcloud to impersonate `identifier-q-ci-build@feint-identifierq.iam.gserviceaccount.com` when resolving credentials later. The SDK can refresh/reuse short-lived credentials independently of the action.

`common.Cloud.run` previously classified any stderr containing `PERMISSION`/`403` as a resource IAM failure before considering refresh errors. A nested `iam.serviceAccounts.getAccessToken` denial could therefore appear to be a project permission denial. Raw stderr was correctly suppressed; the replacement preserves that protection while retaining fixed phase, permission and reason indicators.

The reported five-permission custom role and unconditional direct binding address **project authorization for the intended CI service account**. They do not establish that the request reached Resource Manager as that account. An owner impersonation test exercises a different caller-to-service-account relationship from the federated principal and cannot establish why this CI job failed.

## Read-only checks and interpretation

The new `manage.py diagnose-auth --ci` command uses the unchanged build guard: exact repository/IDs, workflow, branch, manual event, commit, clean source, reviewed configuration, enable variable and trial confirmation. It does not fall back to an owner's identity. It performs only:

1. Local validation of the three exported credential paths: gcloud's credential-file override, ADC and the action's credential path must agree. The file must be an external account for the exact build provider, Google STS endpoint and intended service account impersonation endpoint. Conflicting access-token/impersonation/disabled-credentials overrides fail closed; only their names are reported. ADC alone does not select gcloud's credentials.
2. Captured `gcloud auth print-access-token` to exercise the SDK credential path. Both streams stay private; the token is discarded, never printed, recorded, put in action outputs or uploaded. SDK HTTP/debug and file logging are disabled for both probes; each is bounded to 90 seconds with no automatic retry.
3. If token resolution succeeds, a project lookup restricted to `projectId,projectNumber`, verified against `feint-identifierq` / `334840153796`. No IAM-policy enumeration or mutations are needed. The original build still performs its own project checks.

The fixed-schema `auth-diagnostic` record is written to `RUNNER_TEMP` and the Actions step summary. It never includes credential JSON, credential paths/headers, arbitrary response bodies, raw errors, tokens or token claims. Failures stop the job, including ordinary build-mode execution. Unknown errors stay unresolved; phase inference from recognized SDK error strings is evidence, not a complete IAM analysis.

| Reported phase / indicator | Remaining possibility |
| --- | --- |
| `credential_configuration` | Missing/mismatched exported paths, unexpected provider/target, unsupported file, or conflicting gcloud identity overrides. No token probe runs. |
| `github_oidc_retrieval` | SDK could not retrieve its GitHub subject token. Check the job's current OIDC permission/context/expiry. |
| `sts_exchange` | Provider/audience/subject/trust rejection or STS failure during SDK refresh. An earlier successful auth step does not guarantee a later exchange. Do not loosen trust conditions. |
| `service_account_impersonation` | SDK reached the impersonation path; `iam.serviceAccounts.getAccessToken` is a strong indicator of a federated-principal-to-CI-account denial. Other possibilities include disabled/deleted account, IAM Credentials API/service policy or network failure. Verify the actual error indicators; do not add Token Creator or broader roles based on this label alone. |
| `token_refresh_unresolved` | Token resolution failed without enough safe phase evidence; project authorization is not established. |
| `project_lookup` after passed token resolution | Resource Manager rejected the request, or SDK/network/response validation failed. Consider the effective identity and project, IAM deny/principal access boundary policies, organization/VPC restrictions, API/service-usage or quota-project constraints. A direct allow binding does not override a deny. These are possibilities, not verified findings. |
| `VERIFIED` | SDK token resolution and exact project read succeeded for this run. This does not verify Cloud Build submission, source upload, builder act-as, deployment, or Gemini access. |

Only allowlisted permissions and reasons (for example `SERVICE_DISABLED`, `ACCESS_TOKEN_SCOPE_INSUFFICIENT`, `SECURITY_POLICY_VIOLATED`, `USER_PROJECT_DENIED`) survive sanitization. Their absence does not rule out those causes. No additional read/IAM role is requested.

## Single manual verification step

After these reviewed changes are available on `prepare/cloud-run`, manually start a **new** `Build Identifier Q backend` workflow run on that branch with **`diagnostics_only: true`** (the new default), confirm trial eligibility using the existing checkbox, and approve the existing `identifierq-build` environment gate. Read the `auth-diagnostic` summary, or the failed auth/setup step if execution stops earlier. Do not use **Re-run jobs** on the old run: it retains the old workflow/commit and inputs.

This mode still runs the quality checks and existing guards, obtains short-lived credentials, and performs the bounded read-only probes. It **skips Cloud Build submission even when authentication passes**. Normal build mode requires explicitly unchecking `diagnostics_only` and remains outside this investigation. No run was triggered, IAM/WIF/billing changed, key created, Cloud Build submitted, Cloud Run deployed, Pages published, Gemini invoked, or real footage uploaded by this change.

Offline regressions cover credential selection and conflicting overrides; OIDC/STS/impersonation/project failures; refresh errors nested inside permission errors; unknown failures; successful and empty token output; exact project validation; timeouts/missing SDK; secret suppression in logs/records; guard and CLI exit behavior; workflow ordering, read-only default and fail-closed submission gating. Live diagnosis remains necessary to establish the historical failure's cause.
