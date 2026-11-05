"""Inspect build trust without tokens; optionally migrate only the known legacy sub."""

import json

from common import (
    NUMBER,
    POOL,
    PROJECT,
    REPOSITORY,
    Failure,
    ci_account,
    expected_oidc_claims,
    mapping,
    principal,
    project_check,
    provider,
    trust,
    write_result,
)


def legacy_build_condition():
    # Recognition for a narrowly scoped migration only. Never used by normal
    # setup validation or as an alternate allowed authentication condition.
    claims = expected_oidc_claims("build")
    claims["sub"] = f"repo:{REPOSITORY}:environment:identifierq-build"
    return " && ".join(f"assertion.{key} == '{value}'" for key, value in claims.items())


def inspect_build_trust(cloud):
    project_check(cloud)
    pool = cloud.run(
        "iam",
        "workload-identity-pools",
        "describe",
        POOL,
        f"--project={PROJECT}",
        "--location=global",
    )
    pool_names = {
        f"projects/{p}/locations/global/workloadIdentityPools/{POOL}"
        for p in (PROJECT, NUMBER)
    }
    if (
        not isinstance(pool, dict)
        or pool.get("name") not in pool_names
        or pool.get("state") != "ACTIVE"
        or pool.get("disabled")
    ):
        raise Failure(
            "The exact WIF pool is not verifiably active; no update is permitted."
        )
    obj = cloud.run(
        "iam",
        "workload-identity-pools",
        "providers",
        "describe",
        "github-build",
        f"--project={PROJECT}",
        "--location=global",
        f"--workload-identity-pool={POOL}",
    )
    names = {f"{name}/providers/github-build" for name in pool_names}
    oidc = obj.get("oidc", {}) if isinstance(obj, dict) else {}
    if (
        not isinstance(obj, dict)
        or obj.get("name") not in names
        or obj.get("state") != "ACTIVE"
        or obj.get("disabled")
        or obj.get("attributeMapping") != mapping("build")
        or not isinstance(oidc, dict)
        or oidc.get("issuerUri") != "https://token.actions.githubusercontent.com"
        or oidc.get("allowedAudiences")
        or oidc.get("jwksJson")
    ):
        raise Failure(
            "Provider identity/state, issuer, audience, JWKS or mapping differs from the "
            "reviewed build configuration. No replacement or update is permitted."
        )
    condition = obj.get("attributeCondition")
    status = (
        "CURRENT"
        if condition == trust("build")
        else "LEGACY_SUBJECT_ONLY"
        if condition == legacy_build_condition()
        else "UNRECOGNIZED_CONDITION"
    )
    report = {
        "project": PROJECT,
        "project_number": NUMBER,
        "provider": provider("build"),
        "service_account": ci_account("build"),
        "condition_status": status,
        "update_required": None
        if status == "UNRECOGNIZED_CONDITION"
        else status == "LEGACY_SUBJECT_ONLY",
        "expected_token_claims": expected_oidc_claims("build"),
        "claim_evidence": "Expected claims configured from GitHub repository/OIDC settings verified during this investigation and workflow context; this command reads Google metadata, not fresh GitHub claims; no live JWT captured or decoded.",
        "expected_condition": trust("build"),
        "attribute_mapping_verified": True,
        "expected_impersonation_member": principal("build"),
        "read_only": True,
    }
    if status == "LEGACY_SUBJECT_ONLY":
        report["only_difference"] = {
            "claim": "sub",
            "provider_requires": f"repo:{REPOSITORY}:environment:identifierq-build",
            "expected": expected_oidc_claims("build")["sub"],
        }
    return report


def verify_build_trust(cloud):
    result = inspect_build_trust(cloud)
    write_result("wif-build-check", result)
    print(json.dumps(result, indent=2))
    if result["condition_status"] == "UNRECOGNIZED_CONDITION":
        raise Failure(
            "Provider condition is unrecognized; inspect its metadata. No automatic migration is allowed."
        )
    if result["update_required"]:
        print(
            "Known legacy subject only: a separately approved provider condition update is required. No build was started."
        )
    else:
        print(
            "Current immutable subject condition verified. No update or build was performed."
        )
    return result


def repair_build_trust(cloud, approved=False):
    if not approved:
        raise Failure(
            "A provider condition update requires --approve-subject-update. No cloud operation was started."
        )
    before = inspect_build_trust(cloud)
    if before["condition_status"] == "CURRENT":
        print(
            "Build provider already uses the exact immutable subject. No change was made."
        )
        return before
    if before["condition_status"] != "LEGACY_SUBJECT_ONLY":
        raise Failure(
            "Refusing to overwrite an unrecognized provider condition. Inspect with verify-wif; do not weaken trust."
        )
    record = {"status": "UPDATE_PENDING", "read_only": False, "before": before}
    write_result("wif-build-update", record)
    try:
        cloud.run(
            "iam",
            "workload-identity-pools",
            "providers",
            "update-oidc",
            "github-build",
            f"--project={PROJECT}",
            "--location=global",
            f"--workload-identity-pool={POOL}",
            "--attribute-condition=" + trust("build"),
        )
    except Failure as error:
        record["status"] = "UPDATE_UNVERIFIED"
        # Do not replay an ambiguous write. A later verify-wif is read-only and
        # identifies whether the server committed despite the client failure.
        write_result("wif-build-update", record)
        raise Failure(
            f"{error} Update outcome is unverified. Run verify-wif before any retry; no write was replayed."
        ) from error
    try:
        after = inspect_build_trust(cloud)
        if after["condition_status"] != "CURRENT":
            raise Failure("The updated provider condition is not yet verified.")
    except Failure as error:
        record["status"] = "UPDATE_UNVERIFIED"
        write_result("wif-build-update", record)
        raise Failure(
            f"{error} Run read-only verify-wif before retrying; no build was started."
        ) from error
    record.update(status="VERIFIED", after=after)
    write_result("wif-build-update", record)
    print(
        "Exact build-provider subject updated and verified. Other restrictions/mappings were retained; no IAM grants, builds or deployments were performed."
    )
    return after
