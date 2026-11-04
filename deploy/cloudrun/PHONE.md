# Identifier Q — iPhone operation

This guide does not run commands automatically. **No personal spending, billing upgrades, paid Gemini, Cloud Run deployment or frontend publication is authorized by opening it.**

## Open the reviewed checkout

[Open in Google Cloud Shell](https://shell.cloud.google.com/cloudshell/editor?cloudshell_git_repo=https%3A%2F%2Fgithub.com%2Fquddha16-pixel%2Ffeint-iq.git&cloudshell_git_branch=prepare%2Fcloud-run&cloudshell_tutorial=deploy%2Fcloudrun%2FPHONE.md)

In Safari, request Desktop Website and use landscape if needed. Use your existing Google login; verify the project is `feint-identifierq`. Cloud Shell supplies gcloud. The link checks out `prepare/cloud-run`; inspect existing working changes rather than discarding them if Cloud Shell reuses a checkout. Run commands from the repository root in its terminal. If a reused checkout is clean but still on the earlier preparation commit, update it with `git pull --ff-only`; never reset or force-pull over local work.

## Inspect now — read-only

```bash
bash deploy/cloudrun/iq setup
```

This checks account/resource/IAM metadata and shows the build-side WIF plan. It never reads secret values, creates resources, builds or deploys. Permission errors mean unverified, not absent. Review the [full architecture and exact permissions](AUTOMATION.md) before approving changes. Also check unupgraded Free Trial status, remaining credits/days in Cloud Billing, and **Free** in AI Studio. Do not press Upgrade, Prepay or Set up paid billing.

If setup reports unexpected bucket ownership, use the [bucket-verification investigation](BUCKET-VERIFICATION.md). The old formatter omitted the owner field; the corrected checker requests raw API metadata and distinguishes unverified metadata from a genuine mismatch. Verify the actual owner with its one read-only command before proceeding.

## Apply authentication setup only after approval

Do not run this until the **new WIF pool/provider/account/custom roles and scoped bindings** have been explicitly approved:

```bash
bash deploy/cloudrun/iq setup --approve-wif-setup
```

This prepares build authentication only. It does not start a build. Keep deployment disabled.

## Configure GitHub once

1. Repository → Settings → Environments → create `identifierq-build`; required reviewer: founder; selected branch: `prepare/cloud-run` only.
2. Settings → Secrets and variables → Actions → **Variables** → `IDENTIFIERQ_BUILD_ENABLED=true`, after approved setup succeeds. No Gemini/pilot secret values belong here. Leave `IDENTIFIERQ_DEPLOY_ENABLED` absent/false.
3. Request separate authorization to register just the workflow files on `main` while skipping the Pages push workflow. Codex has not done this. Do not merge the whole preparation branch or publish the frontend to make Actions visible.

## Run an authorized build

Once registered: Actions → **Build Identifier Q backend** → Run workflow → branch **prepare/cloud-run** → confirm trial-only use → Run → approve the environment. The summary gives the Cloud Build ID and immutable image digest. **A build does not deploy.**

If registration/WIF is deferred, the existing secure owner Cloud Shell login can run the already authorized first build with the same code:

```bash
bash deploy/cloudrun/iq build --approve-trial-build
```

Use only valid promotional credits/free allowances. This command does not create WIF resources, deploy Cloud Run, publish Pages, upload footage or call Gemini. If submission fails ambiguously, inspect Cloud Build before retrying; a build might already exist.

## Stop before deployment

Backend deployment remains unauthorized. Do not enable deploy variables, apply deploy-side setup, invoke the initial-deployment helper or run the deployment workflow yet. A later explicit authorization permits one owner bootstrap deployment, followed by service-scoped Actions deployment/rollback setup; [the full guide](AUTOMATION.md) contains the exact procedure.

The current public Pages client uses the older protocol. Its publication/update must be separately authorized before connecting it to request-stream-v1. Never enter a Gemini key into the frontend. Never paste either secret in chat.
