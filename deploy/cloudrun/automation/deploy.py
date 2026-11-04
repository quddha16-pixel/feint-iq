"""Future, explicitly unlocked deployment/rollback. Never reads either secret value."""

import json
import os
import re
import urllib.error
import urllib.request

from build import record_from_build
from common import (
    DIGEST,
    IMAGE_BASE,
    MODEL,
    NUMBER,
    ORIGIN,
    PROJECT,
    REGION,
    RUNTIME_SA,
    SECRETS,
    SERVICE,
    UUID,
    Failure,
    git,
    guard,
    project_check,
    version,
    write_result,
)


def deploy_arguments(image_ref, gemini_version, pilot_version):
    if not re.fullmatch(re.escape(IMAGE_BASE) + r"@sha256:[0-9a-f]{64}", image_ref):
        raise Failure(
            "Deploy only the approved repository's immutable sha256 image reference."
        )
    version(gemini_version)
    version(pilot_version)
    return [
        "run",
        "deploy",
        SERVICE,
        f"--project={PROJECT}",
        f"--region={REGION}",
        f"--image={image_ref}",
        f"--service-account={RUNTIME_SA}",
        "--execution-environment=gen2",
        "--port=8080",
        "--cpu=1",
        "--memory=2Gi",
        "--min=0",
        "--min-instances=0",
        "--max=1",
        "--max-instances=1",
        "--concurrency=8",
        "--cpu-throttling",
        "--no-cpu-boost",
        "--timeout=600",
        "--ingress=all",
        "--allow-unauthenticated",
        f"--update-env-vars=HOST=0.0.0.0,MAX_UPLOAD_MB=25,FRONTEND_ORIGIN={ORIGIN},GEMINI_MODEL={MODEL}",
        f"--update-secrets=GEMINI_API_KEY={SECRETS['GEMINI_API_KEY']}:{gemini_version},ANALYSIS_ACCESS_TOKEN={SECRETS['ANALYSIS_ACCESS_TOKEN']}:{pilot_version}",
        "--startup-probe=httpGet.path=/livez,httpGet.port=8080,initialDelaySeconds=0,timeoutSeconds=5,periodSeconds=10,failureThreshold=12",
        "--liveness-probe=httpGet.path=/livez,httpGet.port=8080,timeoutSeconds=5,periodSeconds=30,failureThreshold=3",
    ]


def verify_service(obj, image_ref, gemini_version, pilot_version):
    spec = obj.get("spec", {})
    template = spec.get("template", {})
    revision = template.get("spec", {})
    annotations = template.get("metadata", {}).get("annotations", {})
    service_annotations = obj.get("metadata", {}).get("annotations", {})
    containers = revision.get("containers", [])
    if len(containers) != 1:
        raise Failure(
            "Unexpected Cloud Run container layout. Review it; no unrelated sidecars were removed by verification."
        )
    container = containers[0]
    resources = container.get("resources", {}).get("limits", {})
    expected_annotations = {
        "autoscaling.knative.dev/minScale": "0",
        "autoscaling.knative.dev/maxScale": "1",
        "run.googleapis.com/cpu-throttling": "true",
        "run.googleapis.com/startup-cpu-boost": "false",
        "run.googleapis.com/execution-environment": "gen2",
    }
    # Cloud Run may omit explicit default-zero annotations; omission is the same effective minimum.
    if str(annotations.get("autoscaling.knative.dev/minScale", "0")) != "0":
        raise Failure("Revision minimum is not zero.")
    for key, value in expected_annotations.items():
        if key == "autoscaling.knative.dev/minScale":
            continue
        if (
            str(
                annotations.get(
                    key, "true" if key == "run.googleapis.com/cpu-throttling" else None
                )
            )
            != value
        ):
            raise Failure(f"Unexpected effective Cloud Run revision setting: {key}.")
    if (
        str(service_annotations.get("run.googleapis.com/minScale", "0")) != "0"
        or str(service_annotations.get("run.googleapis.com/maxScale")) != "1"
    ):
        raise Failure("Cloud Run service min/max settings differ from zero/one.")
    if (
        revision.get("serviceAccountName") != RUNTIME_SA
        or revision.get("containerConcurrency") != 8
        or revision.get("timeoutSeconds") != 600
        or resources.get("cpu") not in ("1", "1000m")
        or resources.get("memory") not in ("2Gi", "2048Mi")
        or container.get("image") != image_ref
        or container.get("ports", [{}])[0].get("containerPort") != 8080
    ):
        raise Failure(
            "Unexpected image/runtime identity/resources/port/concurrency/deadline after deployment."
        )
    entries = {x["name"]: x for x in container.get("env", [])}
    if len(entries) != len(container.get("env", [])):
        raise Failure("Duplicate Cloud Run environment names are not allowed.")
    for key, value in {
        "HOST": "0.0.0.0",
        "MAX_UPLOAD_MB": "25",
        "FRONTEND_ORIGIN": ORIGIN,
        "GEMINI_MODEL": MODEL,
    }.items():
        if entries.get(key, {}).get("value") != value:
            raise Failure(f"Cloud Run environment setting differs: {key}.")
    for key, v in (
        ("GEMINI_API_KEY", gemini_version),
        ("ANALYSIS_ACCESS_TOKEN", pilot_version),
    ):
        ref = entries.get(key, {}).get("valueFrom", {}).get("secretKeyRef", {})
        if (
            ref.get("name") != SECRETS[key]
            or str(ref.get("key")) != v
            or "value" in entries.get(key, {})
        ):
            raise Failure(
                "Cloud Run secret references differ from the approved numeric versions."
            )
    for kind in ("startupProbe", "livenessProbe"):
        if container.get(kind, {}).get("httpGet", {}).get("path") != "/livez":
            raise Failure("Cloud Run probe is not the minimal /livez endpoint.")
    status = obj.get("status", {})
    if not any(
        x.get("type") == "Ready" and x.get("status") == "True"
        for x in status.get("conditions", [])
    ):
        raise Failure("Cloud Run service is not ready.")
    # Never send the owner to an untrusted URL returned by unexpected metadata.
    url = status.get("url", "")
    if not re.fullmatch(
        rf"https://{SERVICE}-(?:[a-z0-9-]+\.a\.run\.app|{NUMBER}\.{REGION}\.run\.app)",
        url,
    ):
        raise Failure("Unexpected Cloud Run HTTPS URL.")
    return url


def request(url, path, headers=None, method="GET"):
    req = urllib.request.Request(url + path, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=40) as res:
            return res.status, res.headers, res.read(8192)
    except urllib.error.HTTPError as err:
        return err.code, err.headers, err.read(8192)


def verify_http(url, fetch=request):
    status, headers, body = fetch(url, "/livez")
    if status != 200 or json.loads(body) != {"status": "ok"}:
        raise Failure(
            "Public /livez did not pass. Inspect Cloud Run readiness/public-invoker policy; do not broaden organization policy."
        )
    status, _, body = fetch(url, "/health")
    if (
        status != 401
        or json.loads(body).get("message")
        != "An authorized pilot session token is required."
    ):
        raise Failure(
            "Protected health endpoint did not return the application's unauthenticated 401."
        )
    status, headers, _ = fetch(
        url,
        "/analyses",
        {
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type,idempotency-key",
        },
        "OPTIONS",
    )
    if (
        status != 204
        or headers.get("access-control-allow-origin") != ORIGIN
        or headers.get("access-control-allow-credentials")
    ):
        raise Failure(
            "Pages CORS preflight did not match the approved origin/header policy."
        )
    status, _, _ = fetch(url, "/health", {"Origin": "https://untrusted.example"})
    if status != 403:
        raise Failure("Unexpected origin was not rejected.")


def deploy(
    cloud,
    build_id,
    expected_digest,
    gemini_version,
    pilot_version,
    ci=False,
    approved=False,
    operation="deploy",
):
    if not approved or os.environ.get("IDENTIFIERQ_DEPLOY_ENABLED") != "true":
        raise Failure(
            "Deployment is locked. Explicit authorization, protected environment and IDENTIFIERQ_DEPLOY_ENABLED=true are required."
        )
    if operation not in ("deploy", "rollback"):
        raise Failure("Unsupported deployment operation.")
    guard("deploy", ci)
    if not UUID.fullmatch(build_id) or not DIGEST.fullmatch(expected_digest):
        raise Failure(
            "Enter a successful Cloud Build UUID and its exact sha256 digest from the build summary."
        )
    version(gemini_version)
    version(pilot_version)
    project_check(cloud)
    build_obj = cloud.run(
        "builds", "describe", build_id, f"--project={PROJECT}", f"--region={REGION}"
    )
    record = record_from_build(build_obj)
    if record["image_ref"] != f"{IMAGE_BASE}@{expected_digest}":
        raise Failure("Approval digest does not match that successful build.")
    # This applies equally to rollback: only ancestors of this reviewed branch with the streaming protocol.
    git("merge-base", "--is-ancestor", record["commit"], "HEAD")
    protocol = git("show", f"{record['commit']}:src/domain/transport.ts")
    if '"request-stream-v1"' not in protocol:
        raise Failure(
            "That image's source predates the required frontend/backend streaming protocol."
        )
    for secret, number in (
        (SECRETS["GEMINI_API_KEY"], gemini_version),
        (SECRETS["ANALYSIS_ACCESS_TOKEN"], pilot_version),
    ):
        obj = cloud.run(
            "secrets",
            "versions",
            "describe",
            number,
            f"--secret={secret}",
            f"--project={PROJECT}",
        )
        if obj.get("state") != "ENABLED":
            raise Failure(
                "A selected secret version is not ENABLED. No secret payload was read."
            )
    previous = cloud.run(
        "run",
        "services",
        "describe",
        SERVICE,
        f"--project={PROJECT}",
        f"--region={REGION}",
        optional=True,
    )
    if ci and not previous:
        raise Failure(
            "CI has no project-wide Run administration. The initial owner deployment must be separately authorized before service-scoped automation can operate."
        )
    if previous:
        # Refuse to overwrite unrelated sidecars/service identities accidentally.
        old_spec = previous.get("spec", {}).get("template", {}).get("spec", {})
        if (
            old_spec.get("serviceAccountName") != RUNTIME_SA
            or len(old_spec.get("containers", [])) != 1
        ):
            raise Failure(
                "Existing service layout/identity differs; manual review required before changing it."
            )
        # Existing traffic splits/tags can keep older revision minima alive. Do not remove them silently.
        traffic = previous.get("spec", {}).get("traffic", [])
        if len(traffic) > 1 or any(
            x.get("tag") or x.get("percent", 100) != 100 for x in traffic
        ):
            raise Failure(
                "Existing service has tagged/split traffic; review it without overwriting unrelated routing."
            )
    write_result(
        "deploy",
        {
            "status": "APPROVED_NOT_YET_DEPLOYED",
            "operation": operation,
            "image_ref": record["image_ref"],
            "build_id": build_id,
            "previous_revision": (previous or {})
            .get("status", {})
            .get("latestReadyRevisionName"),
        },
    )
    cloud.run(*deploy_arguments(record["image_ref"], gemini_version, pilot_version))
    current = cloud.run(
        "run",
        "services",
        "describe",
        SERVICE,
        f"--project={PROJECT}",
        f"--region={REGION}",
    )
    url = verify_service(current, record["image_ref"], gemini_version, pilot_version)
    # GET/OPTIONS only: no session token, secret access, upload or provider request.
    verify_http(url)
    result = {
        "status": "DEPLOYED_AND_PUBLIC_PROBES_PASSED",
        "operation": operation,
        "image_ref": record["image_ref"],
        "build_id": build_id,
        "url": url,
        "revision": current.get("status", {}).get("latestReadyRevisionName"),
        "previous_revision": (previous or {})
        .get("status", {})
        .get("latestReadyRevisionName"),
        "frontend_changed": False,
        "gemini_invoked": False,
        "remaining_manual_validation": "After separate frontend publication approval: enter pilot token privately in Settings, verify request-stream-v1, then perform a separately authorized consented clip evaluation.",
    }
    write_result("deploy", result)
    return result
