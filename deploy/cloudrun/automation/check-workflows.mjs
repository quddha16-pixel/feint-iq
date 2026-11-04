/* Structural security invariants supplement actionlint's syntax/expression checks. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
for (const name of ["build-backend.yml", "deploy-backend.yml"]) {
  const text = fs.readFileSync(path.join(".github/workflows", name), "utf8");
  const document = yaml.load(text);
  assert.deepEqual(
    Object.keys(document.on),
    ["workflow_dispatch"],
    "Manual dispatch only",
  );
  assert.equal(
    document.permissions["id-token"],
    undefined,
    "OIDC may not be global",
  );
  assert.equal(document.permissions.contents, "read");
  assert.equal(
    document.concurrency["cancel-in-progress"],
    false,
    "Do not abandon cloud execution on another dispatch",
  );
  for (const job of Object.values(document.jobs)) {
    const steps = job.steps;
    for (const step of steps) {
      if (step.uses)
        assert.match(
          step.uses,
          /@[0-9a-f]{40}$/,
          "Pin actions to verified commits",
        );
      if (step.run)
        assert(
          !step.run.includes("${{"),
          "Inputs must enter shell via quoted environment variables",
        );
      if (step.uses?.startsWith("actions/checkout@")) {
        assert.equal(step.with["persist-credentials"], false);
        assert.equal(step.with["fetch-depth"], 0);
      }
    }
    const auth = steps.findIndex((s) =>
      s.uses?.startsWith("google-github-actions/auth@"),
    );
    if (auth >= 0) {
      assert.equal(job.permissions["id-token"], "write");
      assert(job.if.includes("github.ref == 'refs/heads/prepare/cloud-run'"));
      assert(job.if.includes("github.repository == 'quddha16-pixel/feint-iq'"));
      assert(job.if.includes("github.event_name == 'workflow_dispatch'"));
      assert(
        steps.slice(0, auth).some((s) => s.run?.includes("manage.py guard")),
      );
      assert.match(job.environment, /^identifierq-(build|deploy)$/);
      assert.equal(steps[auth].with.project_id, "feint-identifierq");
      assert(
        !steps[auth].with.credentials_json,
        "Long-lived key auth is forbidden",
      );
    }
  }
  assert(
    !text.includes("secrets."),
    "Neither provider keys nor pilot tokens belong in Actions",
  );
  assert(!text.includes("deploy-pages") && !text.includes("workflow_run"));
  if (name === "build-backend.yml") {
    assert(!text.includes("manage.py deploy") && !text.includes("gcloud run"));
    assert.equal(document.jobs["cloud-build"].environment, "identifierq-build");
    assert.match(
      document.jobs["cloud-build"].steps.find((s) =>
        s.uses?.startsWith("google-github-actions/auth@"),
      ).with.service_account,
      /^identifier-q-ci-build@/,
    );
  } else {
    assert(
      document.jobs.deploy.if.includes(
        "vars.IDENTIFIERQ_DEPLOY_ENABLED == 'true'",
      ),
    );
    assert.equal(document.jobs.deploy.environment, "identifierq-deploy");
    assert.match(
      document.jobs.deploy.steps.find((s) =>
        s.uses?.startsWith("google-github-actions/auth@"),
      ).with.service_account,
      /^identifier-q-ci-deploy@/,
    );
  }
}
const build = yaml.load(
  fs.readFileSync("deploy/cloudrun/cloudbuild.yaml", "utf8"),
);
assert.equal(build.steps.length, 1);
assert.equal(build.steps[0].name, "gcr.io/cloud-builders/docker");
assert(build.steps[0].args.includes("server/Dockerfile"));
assert(
  build.steps[0].args.includes(
    "org.opencontainers.image.revision=${_COMMIT_SHA}",
  ),
);
assert.deepEqual(build.images, ["${_IMAGE}"]);
assert.equal(build.options.logging, "CLOUD_LOGGING_ONLY");
assert.equal(build.timeout, "900s");
console.log("Workflow YAML and security boundaries: passed");
