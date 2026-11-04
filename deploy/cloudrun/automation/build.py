"""One manual Cloud Build, no deployment. No source credentials or footage accepted."""

import json
import re
import signal
import time
import uuid
from pathlib import Path

from common import (
    ARTIFACTS,
    BUCKET,
    BUILD_SA,
    DIGEST,
    IMAGE_BASE,
    NUMBER,
    PROJECT,
    REGION,
    ROOT,
    SHA,
    UUID,
    Failure,
    guard,
    project_check,
    verify_source_bucket,
    write_result,
)


def check_source(files):
    for value in files.splitlines():
        path = Path(value.removeprefix("./"))
        if path.is_absolute() or ".." in path.parts:
            raise Failure("Unexpected source archive path.")
        name = path.name.lower()
        if (
            name.startswith((".env", "gha-creds-"))
            or path.suffix.lower() in (".key", ".pem", ".mp4", ".mov", ".webm")
            or any(
                x in path.parts for x in (".git", "node_modules", "attachments", "dist")
            )
        ):
            raise Failure(
                "Source upload would include credentials, private media or generated files; stopped."
            )
        local = ROOT / path
        if not local.resolve().is_relative_to(ROOT):
            raise Failure("Source archive symlink escapes the checkout.")
        if local.is_file() and local.stat().st_size < 2_000_000:
            text = local.read_bytes()
            if re.search(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", text):
                raise Failure(
                    "Potential long-lived credential in source upload; review privately. No contents were logged."
                )
            if local.suffix.lower() == ".json":
                try:
                    obj = json.loads(text)
                except ValueError:
                    obj = None
                if isinstance(obj, dict) and obj.get("type") == "service_account":
                    raise Failure(
                        "Service-account key JSON is forbidden in build sources."
                    )


def record_from_build(obj, expected_image=None):
    if obj.get("status") != "SUCCESS":
        raise Failure(
            "Cloud Build is not SUCCESS; no image is approved for deployment."
        )
    account = obj.get("serviceAccount", "")
    if account not in (
        BUILD_SA,
        f"projects/{PROJECT}/serviceAccounts/{BUILD_SA}",
        f"projects/{NUMBER}/serviceAccounts/{BUILD_SA}",
    ):
        raise Failure("Build did not use the dedicated build service account.")
    commit = obj.get("substitutions", {}).get("_COMMIT_SHA", "")
    if not SHA.fullmatch(commit):
        raise Failure("Build has no full source commit identifier.")
    if obj.get("source", {}).get("storageSource", {}).get("bucket") != BUCKET:
        raise Failure("Build source is not the approved private build-source bucket.")
    matches = [
        x
        for x in obj.get("results", {}).get("images", [])
        if x.get("name", "").startswith(f"{IMAGE_BASE}:sha-{commit}-")
    ]
    if expected_image:
        matches = [x for x in matches if x["name"] == expected_image]
    if len(matches) != 1 or not DIGEST.fullmatch(matches[0].get("digest", "")):
        raise Failure(
            "No unique immutable backend image digest was returned by Cloud Build."
        )
    build_id = obj.get("id", "")
    if not UUID.fullmatch(build_id):
        raise Failure("Unexpected Cloud Build identifier.")
    return {
        "status": "SUCCESS",
        "project": PROJECT,
        "region": REGION,
        "commit": commit,
        "build_id": build_id,
        "image_ref": f"{IMAGE_BASE}@{matches[0]['digest']}",
        "image_tag": matches[0]["name"],
        "cloud_log_url": f"https://console.cloud.google.com/cloud-build/builds;region={REGION}/{build_id}?project={PROJECT}",
        "deployed": False,
        "gemini_invoked": False,
    }


def build(cloud, ci=False, approved=False, sleep=time.sleep):
    if not approved:
        raise Failure(
            "A manual trial-credit build approval is required. No build was started."
        )
    commit = guard("build", ci)
    project_check(cloud)
    # Metadata only. No automatic provisioning or permission grants.
    cloud.run("iam", "service-accounts", "describe", BUILD_SA, f"--project={PROJECT}")
    cloud.run(
        "artifacts",
        "repositories",
        "describe",
        ARTIFACTS,
        f"--project={PROJECT}",
        f"--location={REGION}",
    )
    verify_source_bucket(cloud)
    check_source(cloud.run("meta", "list-files-for-upload", raw=True))
    # Full SHA + unique run nonce avoids replacing a prior build tag for the same commit.
    # Tags are not claimed immutable: deployments consume only the sha256 digest.
    nonce = uuid.uuid4().hex[:12]
    image = f"{IMAGE_BASE}:sha-{commit}-{nonce}"
    build_id = cloud.run(
        "builds",
        "submit",
        ".",
        f"--project={PROJECT}",
        f"--region={REGION}",
        "--config=deploy/cloudrun/cloudbuild.yaml",
        f"--service-account=projects/{PROJECT}/serviceAccounts/{BUILD_SA}",
        f"--gcs-source-staging-dir=gs://{BUCKET}/source",
        f"--substitutions=_IMAGE={image},_COMMIT_SHA={commit}",
        "--async",
    )
    build_id = build_id.get("id", "")
    if not UUID.fullmatch(build_id):
        raise Failure(
            "Build submission returned no valid ID. Inspect Cloud Build before retrying; submission may already exist."
        )
    print(
        f"Cloud Build submitted once: {build_id}. No deployment is part of this workflow."
    )
    write_result(
        "build",
        {
            "status": "SUBMITTED",
            "build_id": build_id,
            "commit": commit,
            "deployed": False,
        },
    )
    terminal = False

    def interrupted(_signum, _frame):
        raise KeyboardInterrupt

    old = signal.signal(signal.SIGTERM, interrupted)
    try:
        deadline = time.monotonic() + 1050
        while time.monotonic() < deadline:
            obj = cloud.run(
                "builds",
                "describe",
                build_id,
                f"--project={PROJECT}",
                f"--region={REGION}",
            )
            state = obj.get("status")
            if state == "SUCCESS":
                terminal = True
                result = record_from_build(obj, image)
                if result["commit"] != commit:
                    raise Failure(
                        "Cloud Build commit does not match the selected source."
                    )
                write_result("build", result)
                return result
            if state in (
                "FAILURE",
                "INTERNAL_ERROR",
                "TIMEOUT",
                "CANCELLED",
                "EXPIRED",
            ):
                terminal = True
                write_result(
                    "build", {"status": state, "build_id": build_id, "deployed": False}
                )
                raise Failure(
                    f"Cloud Build ended with {state}. Inspect its Console log; no retry or deployment was attempted."
                )
            sleep(10)
        raise Failure(
            "Build observation deadline exceeded. Inspect Cloud Build before retrying."
        )
    finally:
        signal.signal(signal.SIGTERM, old)
        if not terminal:
            try:
                cloud.run(
                    "builds",
                    "cancel",
                    build_id,
                    f"--project={PROJECT}",
                    f"--region={REGION}",
                )
                print("Cancellation requested for this build only.")
            except Failure:
                print(
                    "Could not verify cancellation. Check this build ID in Console; Cloud Build has its own 900s timeout."
                )
