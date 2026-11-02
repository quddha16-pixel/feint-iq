# GitHub Pages deployment

The deployment repository is **quddha16-pixel/feint-iq**. The production URL is:

https://quddha16-pixel.github.io/feint-iq/

Publishing the Codex development environment does not publish this website.

## Deployment configuration

- Source branch: `main`.
- Settings → Pages → Build and deployment → Source: **GitHub Actions**.
- Workflow: `.github/workflows/deploy-pages.yml`.
- Pushes to `main` and manual workflow dispatches build and deploy `dist/`.
- Node 24 and `npm ci` use the committed dependency lockfile. Type checking, linting, unit tests, and the production build must pass before deployment.
- Vite uses `/feint-iq/` for builds and production preview, and `/` for local development. The application uses hash navigation (e.g. `/feint-iq/#/history`), so no Pages fallback/404 rewrite is needed.
- The workflow uploads a Pages artifact; it does not commit generated files or overwrite a `gh-pages` branch. The `github-pages` deployment environment receives the deployment URL.
- Deployment permissions are scoped to `pages: write` and `id-token: write`; repository contents are read-only in Actions.

## Local verification

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm exec vite -- preview --host 127.0.0.1 --port 4173 --strictPort
```

The preview serves the production repository subpath `/feint-iq/`. Verify its HTML, JavaScript, CSS, and hash navigation. `npm run dev` continues to serve the local workspace at `/`.

## If GitHub permissions block setup

1. Commit and push the application and deployment workflow to `main` using an account/app permitted to write repository contents and workflow files. Do not force-push. If branch protection requires review, merge the deployment commit through a pull request.
2. A repository administrator must select **GitHub Actions** in Settings → Pages. If Pages is unavailable, verify repository/organization policy and Pages eligibility.
3. Open Actions → Deploy Identifier Q to GitHub Pages and choose **Run workflow** on `main` if a push did not start it.
4. If the `github-pages` environment requires approval, approve that deployment in GitHub. Keep any existing protections intact.
5. Check the build and deploy job logs. Once successful, open the production URL above and check its asset requests and navigation.

Git read access or repository `admin` metadata does not establish access to every Pages or Actions API. An integration can be denied individual operations even when Git pushes are allowed. Grant the relevant app permissions or perform these steps through GitHub; never place a personal token in the repository or client application.

## Product scope

This deploys the functional static workspace. It does not create an AI analysis backend, accounts, or cloud report storage. The existing honest engine-unavailable behavior remains in place.

## Deployment attempt — 2026-11-02

The application and deployment configuration were committed and pushed without force to `main` (application `ad7c637`; deployment `b87f16b`). The remote was confirmed as `https://github.com/quddha16-pixel/feint-iq.git`; its prior `main` contained only the initial README commit, so no unrelated remote work required conflict resolution.

Local type checking, linting, all 21 unit tests, all 14 browser tests, and the production build passed. A production-browser smoke check confirmed HTTP 200 for HTML, JavaScript and CSS beneath `/feint-iq/`, correct navigation across all five screens, reload behavior, and no JavaScript errors.

[Actions run 41547411413](https://github.com/quddha16-pixel/feint-iq/actions/runs/41547411413) successfully installed, checked, tested, built, and uploaded the Pages artifact. Deployment failed at **Configure GitHub Pages**: `Get Pages site failed ... Pages enabled and configured to build using GitHub Actions`, with HTTP 404. The deployment step was skipped. The public URL also returned HTTP 404.

Enabling Pages through `POST /repos/quddha16-pixel/feint-iq/pages` with `build_type=workflow` was denied with **HTTP 403: Resource not accessible by integration**. The token also cannot read repository Actions permission settings. Repository `permissions.admin=true` metadata does not override these integration-scoped API restrictions. No credentials were extracted or saved, and no repository protections were changed.

**Required action:** a repository administrator must open [Settings → Pages](https://github.com/quddha16-pixel/feint-iq/settings/pages), choose **GitHub Actions** as the build source, and rerun the failed jobs or manually dispatch **Deploy Identifier Q to GitHub Pages** on `main`. No code changes or additional client-side keys are needed. After deployment succeeds, run:

```sh
node tests/pages-smoke.mjs https://quddha16-pixel.github.io/feint-iq/
```

The application is committed and build-verified, but public deployment is not complete until that administrator action and a successful Pages run occur.
