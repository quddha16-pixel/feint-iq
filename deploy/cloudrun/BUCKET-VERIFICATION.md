# Source bucket ownership verification

The earlier error, **“Build source bucket belongs to an unexpected project”**, did not distinguish missing ownership metadata from a real mismatch. A parsing defect is verified; the live bucket's owner has **not** been verified in this workspace, which has no gcloud executable or connected Google Cloud identity.

**Subsequent Cloud Shell evidence:** the founder has now supplied successful `verify-bucket` output with project number **334840153796**, ownership verified, and required access settings verified. The later IAM-grant failure is a separate investigation; use [partial WIF setup recovery](PARTIAL-WIF-RECOVERY.md) to inspect and preserve already completed setup. This workspace still cannot inspect live Google Cloud state directly.

## If the old message still appears

The exact string **“Build source bucket belongs to an unexpected project”** was emitted by `7424f49`. It was removed in the already-pushed correction **f730e7c**. Seeing that exact message means the output is from an older/different script copy or an earlier run; current code does not emit it. The Console's access, location, storage class and encryption settings do not establish the owner project number.

An additional short command is now available after updating a clean `prepare/cloud-run` checkout:

```bash
bash deploy/cloudrun/iq verify-bucket
```

This command only reads Cloud Resource Manager's expected project ID/number and the bucket's raw Storage API metadata. It prints a small verification summary only after the exact name/owner/private-access checks pass. It does not fetch IAM policy bindings, create authentication resources, submit builds, deploy, or change billing. A missing SDK, permission denial, missing metadata or mismatched owner fails without a success summary. Metadata errors include the complete read-only gcloud query so authenticated verification can be performed directly.

From the existing clean `prepare/cloud-run` repository folder in Cloud Shell, this single copyable line obtains the current code and runs only that read-only check:

```bash
git pull --ff-only && bash deploy/cloudrun/iq verify-bucket
```

Fast-forward-only updating does not discard local work. Stop and share the error if the checkout cannot update; do not reset or force it. The direct gcloud query below remains available without a repository update.

## Verified SDK behavior

We inspected Google's official SDK **592.0.0** core distribution, version `2026.10.30`, downloaded using its [official component manifest](https://dl.google.com/dl/cloudsdk/channels/rapid/components-2.json). The core archive's SHA-256 matched the manifest: `2de2eb7c365cbeaa2410e92d1080234957b662458229d45af5371a5853d671e1`. No SDK installation, login or project API call was performed. This is evidence about that SDK's formatting, not a claim about the user's installed version or bucket contents.

The relevant implementation files are:

- `lib/surface/storage/buckets/describe.py`: fetches the bucket and passes `args.raw` to `get_display_dict_for_resource`.
- `lib/googlecloudsdk/command_lib/storage/resources/resource_util.py`: without raw mode, emits only `BucketDisplayTitlesAndDefaults._fields`; with raw mode, returns `resource.metadata`.
- `lib/googlecloudsdk/command_lib/storage/resources/full_resource_formatter.py`: its bucket display field list includes the access settings but omits **both projectNumber and project_number**.

Therefore `--format=json` alone serializes an already standardized display that can omit ownership. The default and raw output use these fields:

| Check                       | Default standardized display   | Raw Storage JSON API                                |
| --------------------------- | ------------------------------ | --------------------------------------------------- |
| Bucket identity             | `name`                         | `name`                                              |
| Owning project number       | omitted in inspected formatter | **`projectNumber`**                                 |
| Uniform bucket-level access | `uniform_bucket_level_access`  | `iamConfiguration.uniformBucketLevelAccess.enabled` |
| Public access prevention    | `public_access_prevention`     | `iamConfiguration.publicAccessPrevention`           |

Google's [command reference](https://docs.cloud.google.com/sdk/gcloud/reference/storage/buckets/describe) documents `--raw` as “Shows metadata in the format returned by the API instead of standardizing it.” The [Storage Bucket resource](https://docs.cloud.google.com/storage/docs/json_api/v1/buckets) defines **projectNumber** as “The project number of the project the bucket belongs to.” It is a uint64, normally JSON-encoded as a decimal string. The underlying [buckets.get API](https://docs.cloud.google.com/storage/docs/json_api/v1/buckets/get) is read-only and requires `storage.buckets.get`; particular full-metadata properties can require additional read permissions. `--raw` changes presentation, not the SDK's read scope.

## Correction and security boundaries

Both the setup planner and build preflight now share `verify_source_bucket`, which runs:

```bash
gcloud storage buckets describe gs://feint-identifierq-iq-build-source --raw --format=json
```

The helper requests `--raw` as a **gcloud argument**, retaining JSON decoding in the subprocess wrapper. It verifies the returned bucket name and compares authoritative **projectNumber** exactly against **334840153796**. The existing project-ID/number check for **feint-identifierq** is unchanged. A configured/default project, `--project` flag, bucket-name prefix, project ID alias or missing field is never substituted for ownership.

Uniform bucket-level access must still be the boolean `true`, and public access prevention must still be `enforced`, read from the raw API fields. Missing/unrecognized metadata fails closed. The older standalone preflight also requests raw metadata when displaying ownership.

Errors now distinguish:

- **Metadata missing/invalid:** ownership or required security settings remain unverified; this does not establish foreign ownership.
- **Permission denied:** metadata could not be read; verify the denied read permission using the raw command. No automatic IAM repair or fallback is performed.
- **Ownership mismatch:** a valid API project number differs from the expected one; the error names the observed and expected numbers.
- **Not found / malformed JSON:** lookup/format failure, with no owner guess or bucket recreation.

No bucket creation/deletion, IAM changes, billing changes, builds or deployments were performed for this investigation. Regression tests use synthetic raw/standardized metadata and a mocked SDK subprocess. They verify both callers, unchanged access restrictions, and that missing/mismatched/denied ownership prevents all subsequent mutating operations.

## Next iPhone step — read-only proof of the actual owner

In the existing Google Cloud Shell session, copy this single command. No repository update is needed to run it:

```bash
gcloud storage buckets describe gs://feint-identifierq-iq-build-source --raw --format='json(name,projectNumber)'
```

It returns bucket identity and owner number only, with no secret values or object contents. If **projectNumber is 334840153796**, the owner matches the intended project. If another number appears, stop and inspect that ownership; do not delete/recreate the bucket. Missing fields or a permission error leave ownership unverified. Do not grant new permissions as part of this check.

After ownership is confirmed, update a **clean** `prepare/cloud-run` checkout with `git pull --ff-only`, then rerun `bash deploy/cloudrun/iq setup` without any approval flag. Do not discard unrelated local changes. The corrected setup remains read-only; builds, deployment and infrastructure changes are not authorized by this investigation.
