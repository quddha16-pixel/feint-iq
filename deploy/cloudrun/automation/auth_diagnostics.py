"""Read-only CI authentication probes. Never emit SDK output or credential data."""

import json
import os
import subprocess
from pathlib import Path

from common import (
    NUMBER,
    PROJECT,
    ROOT,
    Failure,
    ci_account,
    cloud_error_details,
    guard,
    provider,
    write_result,
)


def credential_configuration():
    """Check the intended gcloud override without logging credential JSON/paths.

    ADC alone does not select gcloud credentials. Do not add a second
    --impersonate-service-account hop on top of the external-account file.
    """
    names = (
        "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
        "GOOGLE_APPLICATION_CREDENTIALS",
        "GOOGLE_GHA_CREDS_PATH",
    )
    present = {name: bool(os.environ.get(name)) for name in names}
    # These can select a different identity or bypass the credential file.
    conflicts = [
        name
        for name in (
            "CLOUDSDK_AUTH_ACCESS_TOKEN",
            "CLOUDSDK_AUTH_ACCESS_TOKEN_FILE",
            "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT",
            "CLOUDSDK_AUTH_DISABLE_CREDENTIALS",
        )
        if os.environ.get(name)
    ]
    report = {
        "bindings_present": present,
        "conflicting_overrides": conflicts,
        "expected_external_account_verified": False,
    }
    if not all(present.values()) or conflicts:
        return report
    try:
        paths = [Path(os.environ[name]).resolve(strict=True) for name in names]
        if len(set(paths)) != 1:
            return report
        # The file contains a GitHub request bearer header: inspect in memory only.
        obj = json.loads(paths[0].read_text())
        report["expected_external_account_verified"] = (
            isinstance(obj, dict)
            and obj.get("type") == "external_account"
            and obj.get("audience") == f"//iam.googleapis.com/{provider('build')}"
            and obj.get("subject_token_type") == "urn:ietf:params:oauth:token-type:jwt"
            and obj.get("token_url") == "https://sts.googleapis.com/v1/token"
            and obj.get("service_account_impersonation_url")
            == "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/"
            + ci_account("build")
            + ":generateAccessToken"
        )
    except (OSError, ValueError, RuntimeError):
        # Exceptions may include paths or file contents. Never propagate them.
        pass
    return report


def probe(*args):
    """Capture both streams, suppress SDK debug/file logs, and bound each probe."""
    env = dict(os.environ)
    env.update(
        CLOUDSDK_CORE_LOG_HTTP="false",
        CLOUDSDK_CORE_VERBOSITY="error",
        CLOUDSDK_CORE_DISABLE_FILE_LOGGING="true",
    )
    try:
        result = subprocess.run(
            ["gcloud", *args, "--quiet", "--verbosity=error", "--no-log-http"],
            cwd=ROOT,
            env=env,
            text=True,
            capture_output=True,
            timeout=90,
        )
    except FileNotFoundError:
        return {"status": "failed", "kind": "gcloud_unavailable"}, None
    except subprocess.TimeoutExpired:
        return {"status": "failed", "kind": "probe_timed_out"}, None
    except OSError:
        return {"status": "failed", "kind": "sdk_execution_failed"}, None
    if result.returncode:
        return {"status": "failed", **cloud_error_details(result.stderr)}, None
    return {"status": "passed"}, result.stdout


def diagnose_auth():
    # Same source, branch, manual event, environment variable and trial gates as
    # the build. No owner-login fallback and no cloud command before the guard.
    guard("build", ci=True)
    report = {
        "read_only": True,
        "project": PROJECT,
        "expected_service_account": ci_account("build"),
        "credential_configuration": credential_configuration(),
        "token_refresh": {"status": "not_run"},
        "project_lookup": {"status": "not_run"},
    }
    if not report["credential_configuration"]["expected_external_account_verified"]:
        report["failed_phase"] = "credential_configuration"
    else:
        # Unlike file creation, this exercises gcloud's complete WIF credential
        # resolution (GitHub OIDC -> STS -> service account); the SDK may reuse
        # a cached short-lived token. Token stays in memory;
        # never use Cloud.run(raw=True), shell output, or action outputs for it.
        status, token = probe("auth", "print-access-token")
        if status["status"] == "passed" and not (token and token.strip()):
            status = {"status": "failed", "kind": "empty_token_response"}
        del token
        report["token_refresh"] = status
        if status["status"] != "passed":
            report["failed_phase"] = status.get("reported_phase", "unresolved")
            if report["failed_phase"] == "unresolved":
                report["failed_phase"] = "token_refresh_unresolved"
        else:
            status, metadata = probe(
                "projects",
                "describe",
                PROJECT,
                "--format=json(projectId,projectNumber)",
            )
            if status["status"] == "passed":
                try:
                    obj = json.loads(metadata)
                    verified = (
                        isinstance(obj, dict)
                        and obj.get("projectId") == PROJECT
                        and str(obj.get("projectNumber")) == NUMBER
                    )
                except (ValueError, TypeError):
                    verified = False
                if not verified:
                    status = {"status": "failed", "kind": "project_identity_unverified"}
            report["project_lookup"] = status
            if status["status"] != "passed":
                # Refresh may also fail again inside the project request.
                phase = status.get("reported_phase", "unresolved")
                report["failed_phase"] = (
                    phase
                    if phase != "unresolved"
                    else "token_refresh_unresolved"
                    if status.get("kind") == "authentication_or_refresh_failed"
                    else "project_lookup"
                )
    report["status"] = "FAILED" if "failed_phase" in report else "VERIFIED"
    write_result("auth-diagnostic", report)
    print(json.dumps(report, indent=2))
    if report["status"] != "VERIFIED":
        raise Failure(
            "Read-only CI authentication diagnostic failed; inspect its safe phase "
            "indicators. Unknown causes remain unverified. No build or IAM change was attempted."
        )
    print(
        "gcloud token refresh and exact project lookup verified. "
        "Build/deployment permissions remain untested; no build was started."
    )
    return report
