# Recover a partially completed build-side WIF setup

Project: `feint-identifierq` / **334840153796**. This procedure is for the already authorized build-authentication setup only. It does not build a container, deploy Cloud Run, publish Pages, invoke Gemini, access secret payloads, change billing, or activate paid services.

## Next iPhone step: read-only inspection

From the existing `prepare/cloud-run` repository folder in Cloud Shell, run:

```bash
git pull --ff-only origin prepare/cloud-run && bash deploy/cloudrun/iq setup
```

The Git update preserves local work and stops on conflicts; do not reset or discard files if it fails. The setup command makes **only metadata/IAM reads**. It ends with a compact resources/grants summary, with each missing grant named. The full non-secret JSON plan is also saved locally.

It must verify the exact project ID/number, raw API bucket owner/private-access settings, build/runtime prerequisites, exact CI account, both case-sensitive custom role identities and their exact permissions/GA status, and the exact WIF trust. It reports all four build-side bindings independently:

1. CI build submitter custom role on the project.
2. CI build account's `roles/iam.serviceAccountUser` on the existing builder account.
3. Exact build-provider principal set's `roles/iam.workloadIdentityUser` on the CI build account.
4. CI build account's `identifierQSourceUploader` custom role on the existing source bucket.

Permission/read/metadata errors stop inspection. They do not establish absence. `missing_resources` means not found/not yet visible to this read; it is not authorization to recreate something. Review inherited/group IAM separately as before.

## IAM modification: resume missing approved bindings only

If inspection says **resources verified=True**, permissions/trust checks pass, and only approved bindings are missing, run this separately:

```bash
bash deploy/cloudrun/iq setup --resume --approve-wif-setup
```

This **can modify IAM** by adding missing approved grants. It repeats the complete read-only check first. Its code path does not create accounts/roles/pools/providers or enable APIs. It refuses if any required resource/API is missing, disabled, mismatched, unreadable or not yet visible. Existing unconditional grants are skipped, unrelated grants/conditions are preserved, and no working resource is replaced. A fully completed setup is a no-op.

Success requires fresh read-back verification of every resource/binding. A write error triggers read-only reinspection, with **no automatic write replay or rollback**. If the server committed despite a client error and all checks pass, the status is `VERIFIED_AFTER_SDK_ERROR`. Otherwise it records `PARTIAL_FAILURE`; a successful write response with unverifiable read-back records `APPLIED_UNVERIFIED`. Stop on either failure and inspect the diagnostic instead of repeatedly submitting writes.

The latest apply record is `/tmp/identifierq-automation/identifierq-setup-build.json` in Cloud Shell, unless `RUNNER_TEMP` changes the directory. It records successful operation responses, the pending/failed operation and separately labeled live inspection results. A read-only run writes `identifierq-setup-build-plan.json`, preserving the last apply record. These temporary files are diagnostic records, not an authoritative or durable state store; each invocation derives state from fresh Google API reads.

If resources are not verified, **do not substitute full setup to bypass resume's refusal**. Determine whether the read failed, a resource is disabled/deleted, propagation is still pending, or a genuinely missing resource needs review under the original scoped authorization. No permissions are broadened automatically.

## Investigation findings

The earlier generic message discarded the underlying SDK diagnostic and therefore did **not** prove the source bucket was absent. User-provided Cloud Shell output already verified bucket ownership against `334840153796`, uniform access, and enforced public-access prevention. Subsequent user-provided `gcloud iam roles list --project=feint-identifierq` output confirms both `identifierQBuildSubmitter` and **`identifierQSourceUploader`** exist in GA status. The list view does not verify their included permissions or prove when they became visible to Storage.

An earlier manual lookup used lowercase `identifierqsourceuploader`; custom role IDs are case-sensitive, so that NOT_FOUND result concerned a different role ID. The automation consistently uses the intended mixed-case ID. **No verified role-name correction to the bucket-grant command was identified.**

The following operations precede the failing bucket grant. Each may already have succeeded; commands are conditional on inspected state, so the list does not claim every operation actually ran:

| Order | Operation that may already have succeeded |
| --- | --- |
| 1 | Enable missing IAM, IAM Credentials and Security Token Service APIs |
| 2 | Create `identifier-q-ci-build@feint-identifierq.iam.gserviceaccount.com` |
| 3 | Create project custom role `identifierQBuildSubmitter` |
| 4 | Create project custom role `identifierQSourceUploader` |
| 5 | Create pool `identifierq-github` |
| 6 | Create its strictly constrained `github-build` OIDC provider |
| 7 | Bind Build Submitter on the project to the CI build account |
| 8 | Bind Service Account User on the existing builder to the CI build account |
| 9 | Bind Workload Identity User on the CI build account to the exact build principal set |
| 10 | **Failing operation:** add Source Uploader on `gs://feint-identifierq-iq-build-source` to the CI build account |

The final grant itself could have committed before a client response failure. Never infer rollback or discard earlier resources.

We inspected the previously checksum-validated official SDK **592.0.0** source, not the authenticated user's installation. `lib/surface/storage/buckets/add_iam_policy_binding.py` reads the bucket policy, `lib/googlecloudsdk/command_lib/storage/iam_command_util.py` adds the supplied role/member with an explicit no-condition binding, and `lib/googlecloudsdk/command_lib/storage/tasks/set_iam_policy_task.py` writes the policy. The supplied custom role is passed through; `--condition=None` is supported. The current command uses the full project-scoped custom-role name. This inspection does not establish the failing API phase or historical cause.

The corrected error wrapper identifies the exact requested bucket, case-sensitive role and principal; distinguishes authentication, permission denial, ambiguous not-found, unsupported-role/scope, policy conflict and other SDK/API failures; and reports recognized permission names when supplied by the SDK. Raw stderr/debug output is never dumped. Fresh reinspection identifies missing/unverified prerequisites and grants. Unknown 404s remain explicitly ambiguous rather than being labeled “bucket missing.”

Possible remaining causes include visibility/propagation of a newly created role or principal, a policy validation problem, or caller permissions/API behavior. Permission denials often identify `storage.buckets.getIamPolicy` or `storage.buckets.setIamPolicy`; the latter is not established just by a successful read. The automation does not auto-grant either permission. Google's [IAM propagation documentation](https://docs.cloud.google.com/iam/docs/access-change-propagation) describes eventual consistency, commonly minutes; this is a possibility, **not a confirmed explanation for this incident**. Do not recreate a resource to address a possible delay.

This Codex workspace has no installed gcloud or connected Google Cloud identity, so it cannot inspect live IAM or establish the historical cause. The first command above is the exact authenticated read-only verification needed. If a repeated authorized grant still fails with all resources verified, keep its sanitized diagnostic; `gcloud version` is an additional read-only SDK check. Do not use HTTP debug logging, paste access tokens, or change IAM/billing to work around an unidentified error.

## Validation

Offline regression tests use persistent synthetic cloud metadata. They cover interruption at each earlier operation, recovery without repeating successful writes, final-grant-only resume, repeated no-op setup, missing prerequisites, exact role permissions/case/stage, denied/invalid reads, preserved unrelated IAM, a committed write followed by client error, failed read-back, and sanitized SDK diagnostics. No actual Google API is called by these tests.
