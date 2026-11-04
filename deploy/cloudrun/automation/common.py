"""Identifier Q cloud policy and subprocess boundary. No secret payload operations."""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PROJECT = "feint-identifierq"
NUMBER = "334840153796"
REGION = "us-central1"
REPOSITORY = "quddha16-pixel/feint-iq"
REPOSITORY_ID = "1443546506"
OWNER_ID = "297506389"
BRANCH = "prepare/cloud-run"
REF = f"refs/heads/{BRANCH}"
SERVICE = "identifier-q-api"
BUCKET = "feint-identifierq-iq-build-source"
ARTIFACTS = "identifier-q"
IMAGE_BASE = f"{REGION}-docker.pkg.dev/{PROJECT}/{ARTIFACTS}/backend"
BUILD_SA = f"identifier-q-build@{PROJECT}.iam.gserviceaccount.com"
RUNTIME_SA = f"identifier-q-runtime@{PROJECT}.iam.gserviceaccount.com"
SECRETS = {
    "GEMINI_API_KEY": "identifierq-gemini-api-key",
    "ANALYSIS_ACCESS_TOKEN": "identifierq-pilot-token",
}
ORIGIN = "https://quddha16-pixel.github.io"
MODEL = "gemini-3.5-flash-lite"
POOL = "identifierq-github"
SHA = re.compile(r"^[0-9a-f]{40}$")
DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
UUID = re.compile(r"^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$")


class Failure(RuntimeError):
    pass


class Missing(Failure):
    pass


class Cloud:
    def __init__(self):
        self.calls = []

    def run(self, *args, optional=False, raw=False):
        # Only metadata/configuration commands and explicitly selected mutations.
        # Never call auth print-access-token, secrets versions access, or billing updates.
        command = ["gcloud", *args, "--quiet"]
        if not raw:
            command += ["--format=json"]
        self.calls.append(command)
        try:
            p = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
        except FileNotFoundError as e:
            raise Failure(
                "gcloud is unavailable. Use Google Cloud Shell; no cloud operation was started."
            ) from e
        if p.returncode:
            # SDK errors can include credential/debug content: classify without logging it.
            text = p.stderr.upper()
            label = " ".join(command[:4])
            if "PERMISSION_DENIED" in text or "PERMISSION" in text or "403" in text:
                raise Failure(
                    f"{label}: permission denied. Verify the documented scoped IAM/act-as grants; no automatic IAM repair was attempted."
                )
            if "UNAUTHENTICATED" in text or "LOGIN" in text or "CREDENTIAL" in text:
                raise Failure(
                    f"{label}: cloud authentication failed. Verify WIF/active Cloud Shell identity. Never upload a service-account key."
                )
            if "NOT_FOUND" in text or "NOT FOUND" in text or "DOES NOT EXIST" in text:
                if optional:
                    return None
                raise Missing(
                    f"{label}: resource not found. Inspect setup; do not recreate unrelated resources."
                )
            raise Failure(
                f"{label}: command failed. Inspect Cloud Console for API/quota/policy errors. No billing upgrade or automatic retry is permitted."
            )
        if raw:
            return p.stdout.strip()
        try:
            return json.loads(p.stdout) if p.stdout.strip() else {}
        except ValueError as e:
            raise Failure(
                "Google Cloud returned invalid metadata JSON; stopped."
            ) from e


def git(*args):
    p = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=True)
    if p.returncode:
        raise Failure(
            "Git source verification failed; use the approved repository and branch."
        )
    return p.stdout.strip()


def ci_account(purpose):
    if purpose not in ("build", "deploy"):
        raise Failure("Unknown automation purpose.")
    return f"identifier-q-ci-{purpose}@{PROJECT}.iam.gserviceaccount.com"


def provider(purpose):
    return f"projects/{NUMBER}/locations/global/workloadIdentityPools/{POOL}/providers/github-{purpose}"


def trust(purpose):
    workflow = "build-backend.yml" if purpose == "build" else "deploy-backend.yml"
    return " && ".join(
        [
            f"assertion.repository_id == '{REPOSITORY_ID}'",
            f"assertion.repository_owner_id == '{OWNER_ID}'",
            f"assertion.repository == '{REPOSITORY}'",
            f"assertion.ref == '{REF}'",
            "assertion.event_name == 'workflow_dispatch'",
            f"assertion.workflow_ref == '{REPOSITORY}/.github/workflows/{workflow}@{REF}'",
            f"assertion.sub == 'repo:{REPOSITORY}:environment:identifierq-{purpose}'",
        ]
    )


def mapping(purpose):
    return {"google.subject": "assertion.sub", "attribute.pipeline": f"'{purpose}'"}


def principal(purpose):
    # Purpose-specific constant mapping avoids cross-provider impersonation in the pool.
    return f"principalSet://iam.googleapis.com/projects/{NUMBER}/locations/global/workloadIdentityPools/{POOL}/attribute.pipeline/{purpose}"


def guard(purpose, ci=False, env=None):
    env = os.environ if env is None else env
    if purpose not in ("build", "deploy"):
        raise Failure("Unknown workflow purpose.")
    if ci:
        expected = {
            "GITHUB_ACTIONS": "true",
            "GITHUB_REPOSITORY": REPOSITORY,
            "GITHUB_REPOSITORY_ID": REPOSITORY_ID,
            "GITHUB_REPOSITORY_OWNER_ID": OWNER_ID,
            "GITHUB_REF": REF,
            "GITHUB_EVENT_NAME": "workflow_dispatch",
        }
        for key, value in expected.items():
            if env.get(key) != value:
                raise Failure(
                    f"Untrusted GitHub context: {key}. Only a manual dispatch on the approved repository/branch is allowed."
                )
        workflow = "build-backend.yml" if purpose == "build" else "deploy-backend.yml"
        if (
            env.get("GITHUB_WORKFLOW_REF")
            != f"{REPOSITORY}/.github/workflows/{workflow}@{REF}"
        ):
            raise Failure("Unexpected workflow identity.")
        if env.get("AUTOMATION_ENABLED") != "true":
            raise Failure(
                f"{purpose.capitalize()} automation is locked. Complete approved WIF/environment setup before enabling its repository variable."
            )
        if env.get("TRIAL_CONFIRMED") != "true":
            raise Failure(
                "Confirm unupgraded Google Cloud Free Trial and Gemini Free Tier. No personal spending or paid upgrade is authorized."
            )
    remote = git("remote", "get-url", "origin")
    if remote not in (
        f"https://github.com/{REPOSITORY}.git",
        f"https://github.com/{REPOSITORY}",
        f"git@github.com:{REPOSITORY}.git",
    ):
        raise Failure(
            "Wrong origin repository; stopped before cloud authentication/mutation."
        )
    commit = git("rev-parse", "HEAD")
    if not SHA.fullmatch(commit):
        raise Failure("A full immutable Git commit identifier is required.")
    if ci and env.get("GITHUB_SHA") != commit:
        raise Failure("Checkout does not match the dispatched commit.")
    if not ci and git("branch", "--show-current") != BRANCH:
        raise Failure(f"Use the {BRANCH} branch.")
    if git("status", "--porcelain", "--untracked-files=all"):
        raise Failure(
            "The checkout has uncommitted/untracked files. Save/review them before building; nothing was discarded."
        )
    verify_configuration()
    return commit


def verify_configuration():
    expected = {
        "PROJECT_ID": PROJECT,
        "PROJECT_NUMBER": NUMBER,
        "REGION": REGION,
        "SERVICE": SERVICE,
        "AR_REPOSITORY": ARTIFACTS,
        "BUILD_SOURCE_BUCKET": BUCKET,
        "RUNTIME_SA": RUNTIME_SA,
        "BUILD_SA": BUILD_SA,
        "GEMINI_MODEL": MODEL,
        "GEMINI_SECRET": SECRETS["GEMINI_API_KEY"],
        "ACCESS_SECRET": SECRETS["ANALYSIS_ACCESS_TOKEN"],
        "FRONTEND_ORIGIN": ORIGIN,
    }
    source = (ROOT / "deploy/cloudrun/vars.sh").read_text()
    for key, value in expected.items():
        if f"export {key}={value}\n" not in source:
            raise Failure(f"Unexpected non-secret deployment setting: {key}.")
    build = (ROOT / "deploy/cloudrun/cloudbuild.yaml").read_text()
    for required in (
        "server/Dockerfile",
        "${_IMAGE}",
        "${_COMMIT_SHA}",
        "CLOUD_LOGGING_ONLY",
        "timeout: 900s",
    ):
        if required not in build:
            raise Failure(
                "Unexpected Cloud Build configuration; review before authenticating."
            )
    for name in (".gitignore", ".gcloudignore", ".dockerignore"):
        if "gha-creds-*.json" not in (ROOT / name).read_text():
            raise Failure(
                "Short-lived Google credentials must be excluded from Git, build uploads and Docker contexts."
            )


def project_check(cloud):
    obj = cloud.run("projects", "describe", PROJECT)
    if str(obj.get("projectNumber")) != NUMBER or obj.get("projectId") != PROJECT:
        raise Failure("Google Cloud project identity mismatch.")


def check_bucket(bucket):
    if str(bucket.get("projectNumber", bucket.get("project_number"))) != NUMBER:
        raise Failure("Build source bucket belongs to an unexpected project.")
    iam = bucket.get("iamConfiguration", {})
    uniform = bucket.get(
        "uniform_bucket_level_access",
        iam.get("uniformBucketLevelAccess", {}).get("enabled"),
    )
    prevention = bucket.get(
        "public_access_prevention", iam.get("publicAccessPrevention")
    )
    if uniform is not True or prevention != "enforced":
        raise Failure(
            "Build-source bucket must have uniform access and enforced public-access prevention. Review its settings; no automatic change was made."
        )


def version(value):
    if not re.fullmatch(r"[1-9][0-9]*", value or ""):
        raise Failure(
            "Choose enabled numeric secret versions; never use latest or paste secret values."
        )
    return value


def write_result(kind, data):
    directory = Path(os.environ.get("RUNNER_TEMP", "/tmp/identifierq-automation"))
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"identifierq-{kind}.json"
    path.write_text(json.dumps(data, indent=2) + "\n")
    print(f"Non-secret {kind} record: {path}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as f:
            f.write(
                f"### Identifier Q {kind}\n\n```json\n{json.dumps(data, indent=2)}\n```\n"
            )
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a") as f:
            for key in ("build_id", "image_ref", "url", "revision"):
                if key in data:
                    f.write(f"{key}={data[key]}\n")
    return path
