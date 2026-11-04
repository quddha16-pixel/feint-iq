# Identifier Q — iPhone operation

This guide does not run commands automatically. **No personal spending, billing upgrades, paid Gemini, Cloud Run deployment or frontend publication is authorized by opening it.**

## Open the reviewed checkout

[Open in Google Cloud Shell](https://shell.cloud.google.com/cloudshell/editor?cloudshell_git_repo=https%3A%2F%2Fgithub.com%2Fquddha16-pixel%2Ffeint-iq.git&cloudshell_git_branch=prepare%2Fcloud-run&cloudshell_tutorial=deploy%2Fcloudrun%2FPHONE.md)

In Safari, request Desktop Website and use landscape if needed. Use your existing Google login; verify the project is `feint-identifierq`. Cloud Shell supplies gcloud. The link checks out `prepare/cloud-run`; inspect existing working changes rather than discarding them if Cloud Shell reuses a checkout. Run commands from the repository root in its terminal. If a reused checkout is clean but still on the earlier preparation commit, update it with `git pull --ff-only`; never reset or force-pull over local work.

## Verify the bucket alone — read-only

If the old “unexpected project” message still appears, it comes from an earlier script copy/run: the parsing correction was pushed in `f730e7c`. From your existing clean `prepare/cloud-run` repository folder, copy this one line:

```bash
git pull --ff-only && bash deploy/cloudrun/iq verify-bucket
```

It updates the scripts and runs only project/bucket metadata reads. Successful output contains the actual verified project number and `ownership_verified: true`. Missing or denied metadata fails closed; no IAM changes are made, no build/deployment is run, and no secret values are printed. Do not discard local changes if updating fails. See [the ownership investigation](BUCKET-VERIFICATION.md) for evidence and the direct gcloud fallback.

## Inspect now — read-only

```bash
bash deploy/cloudrun/iq setup
```

This checks account/resource/IAM metadata and shows the build-side WIF plan. It never reads secret values, creates resources, builds or deploys. Permission errors mean unverified, not absent. Review the [full architecture and exact permissions](AUTOMATION.md) before approving changes. Also check unupgraded Free Trial status, remaining credits/days in Cloud Billing, and **Free** in AI Studio. Do not press Upgrade, Prepay or Set up paid billing.

If setup reports unexpected bucket ownership, use the [bucket-verification investigation](BUCKET-VERIFICATION.md). The old formatter omitted the owner field; the corrected checker requests raw API metadata and distinguishes unverified metadata from a genuine mismatch. Verify the actual owner with its one read-only command before proceeding.

## Apply authentication setup only after approval

If a previous approved setup stopped during the bucket IAM grant, use the [partial-setup recovery procedure](PARTIAL-WIF-RECOVERY.md): update and inspect read-only first, then use `setup --resume --approve-wif-setup` only when all resources are verified. Resume can add missing approved IAM bindings; it cannot create resources or enable APIs. Do not delete/recreate working resources or substitute full setup to bypass failed verification.

Do not run this until the **new WIF pool/provider/account/custom roles and scoped bindings** have been explicitly approved:

```bash
bash deploy/cloudrun/iq setup --approve-wif-setup
```

This prepares build authentication only. It does not start a build. Keep deployment disabled.

## Configure GitHub once

1. Repository → Settings → Environments → create `identifierq-build`; required reviewer: founder; selected branch: `prepare/cloud-run` only.
2. Settings → Secrets and variables → Actions → **Variables** → `IDENTIFIERQ_BUILD_ENABLED=true`, after approved setup succeeds. No Gemini/pilot secret values belong here. Leave `IDENTIFIERQ_DEPLOY_ENABLED` absent/false.
3. Build-only workflow registration on `main` is now complete in `d3069fb`, with the Pages push workflow suppressed. Only `build-backend.yml` was registered; the deployment workflow remains unregistered on `main`. Do not merge the whole preparation branch or publish the frontend to make Actions visible.

## Run an authorized build

Once registered: Actions → **Build Identifier Q backend** → Run workflow → branch **prepare/cloud-run** → confirm trial-only use → Run → approve the environment. The summary gives the Cloud Build ID and immutable image digest. **A build does not deploy.**

### If verification stops at the Free Trial confirmation

The checkbox is intentionally unchecked by default. The workflow passes `inputs.trial_confirmed` directly into `TRIAL_CONFIRMED`; only the exact value `true` passes the guard. A required Boolean input can still be `false`. In run `41935665456`, logs showed `AUTOMATION_ENABLED=true` and `TRIAL_CONFIRMED=false`; the Cloud Build job was skipped. No Cloud Build ID or image digest was produced by that run. This is a missing affirmative confirmation, not a verified forwarding defect.

On iPhone:

1. Open [the build workflow](https://github.com/quddha16-pixel/feint-iq/actions/workflows/build-backend.yml) in Safari. Request Desktop Website or rotate to landscape if the controls are hidden.
2. Tap **Run workflow** to open a **new dispatch**, then select **prepare/cloud-run** in the branch menu. `main` contains registration only.
3. Verify the Google Cloud account remains an unupgraded Free Trial with sufficient promotional credits/days, and Gemini remains Free Tier. Confirm only if these conditions hold; do not upgrade billing or activate paid Gemini.
4. Tick **Confirm unupgraded GCP Free Trial, sufficient credit/days and Gemini Free Tier**, then tap the **Run workflow** button inside that form. Approve `identifierq-build` only if a configured reviewer prompt appears.
5. Inspect the new run. Trial confirmation should show `TRIAL_CONFIRMED: true`; a successful Cloud Build later produces an ID and immutable image digest for review. This confirmation records the founder's assertion; it does not query billing or guarantee remaining credit.

**Re-run jobs** reuses the failed dispatch's original `false` input. Use the workflow's new-dispatch form to change it. Never hardcode `TRIAL_CONFIRMED=true`, default the checkbox to true, or remove the guard. No retry is launched by reading this guide.

If registration/WIF is deferred, the existing secure owner Cloud Shell login can run the already authorized first build with the same code:

```bash
bash deploy/cloudrun/iq build --approve-trial-build
```

Use only valid promotional credits/free allowances. This command does not create WIF resources, deploy Cloud Run, publish Pages, upload footage or call Gemini. If submission fails ambiguously, inspect Cloud Build before retrying; a build might already exist.

## Stop before deployment

Backend deployment remains unauthorized. Do not enable deploy variables, apply deploy-side setup, invoke the initial-deployment helper or run the deployment workflow yet. A later explicit authorization permits one owner bootstrap deployment, followed by service-scoped Actions deployment/rollback setup; [the full guide](AUTOMATION.md) contains the exact procedure.

The current public Pages client uses the older protocol. Its publication/update must be separately authorized before connecting it to request-stream-v1. Never enter a Gemini key into the frontend. Never paste either secret in chat.
