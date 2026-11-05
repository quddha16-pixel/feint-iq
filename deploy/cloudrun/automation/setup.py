"""Read-only WIF/IAM plan by default. Explicit apply is a separate approval boundary."""

import json

from common import (
    ARTIFACTS,
    BUCKET,
    BUILD_SA,
    NUMBER,
    POOL,
    PROJECT,
    REGION,
    RUNTIME_SA,
    SECRETS,
    SERVICE,
    Failure,
    ci_account,
    mapping,
    principal,
    project_check,
    provider,
    trust,
    verify_source_bucket,
    write_result,
)

BUILD_ROLE = "identifierQBuildSubmitter"
DEPLOY_ROLE = "identifierQRunDeployer"
SOURCE_ROLE = "identifierQSourceUploader"
VERSION_ROLE = "identifierQSecretVersionReader"
RUN_ROLE = "identifierQServiceDeployer"
ROLE_PERMISSIONS = {
    BUILD_ROLE: [
        "cloudbuild.builds.create",
        "cloudbuild.builds.get",
        "cloudbuild.builds.update",
        "resourcemanager.projects.get",
        "serviceusage.services.use",
    ],
    DEPLOY_ROLE: [
        "cloudbuild.builds.get",
        "resourcemanager.projects.get",
        "run.operations.get",
        "serviceusage.services.use",
    ],
    RUN_ROLE: [
        "run.services.get",
        "run.services.update",
        "run.services.getIamPolicy",
        "run.services.setIamPolicy",
    ],
    SOURCE_ROLE: [
        "storage.buckets.get",
        "storage.objects.create",
        "storage.objects.get",
        "storage.objects.list",
    ],
    VERSION_ROLE: ["secretmanager.secrets.get", "secretmanager.versions.get"],
}
REQUIRED_APIS = {
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
}


def bound(policy, role, member):
    return any(
        b.get("role") == role
        and member in b.get("members", [])
        and not b.get("condition")
        for b in policy.get("bindings", [])
    )


def plan(cloud, purpose):
    """Inventory first. No command in this function changes a cloud resource."""
    project_check(cloud)
    project_policy = cloud.run("projects", "get-iam-policy", PROJECT)
    legacy = f"serviceAccount:{NUMBER}@cloudbuild.gserviceaccount.com"
    unsafe_legacy_roles = {
        "roles/editor",
        "roles/owner",
        "roles/secretmanager.secretAccessor",
        "roles/run.admin",
        "roles/resourcemanager.projectIamAdmin",
    }
    if any(
        b.get("role") in unsafe_legacy_roles and legacy in b.get("members", [])
        for b in project_policy.get("bindings", [])
    ):
        raise Failure(
            "Legacy default Cloud Build account has sensitive project grants. Review those before enabling a new build submitter; no existing IAM was removed."
        )
    accounts = {}
    for account in (BUILD_SA, RUNTIME_SA, ci_account(purpose)):
        obj = cloud.run(
            "iam",
            "service-accounts",
            "describe",
            account,
            f"--project={PROJECT}",
            optional=True,
        )
        if obj is not None and (
            not isinstance(obj, dict) or obj.get("email") != account
        ):
            raise Failure(
                f"Service-account metadata does not verify {account}; no replacement is allowed."
            )
        if obj and obj.get("disabled"):
            raise Failure(
                "An expected service account is disabled; ask its administrator to review."
            )
        accounts[account] = obj
    if not accounts[BUILD_SA] or not accounts[RUNTIME_SA]:
        raise Failure(
            "Expected existing build/runtime accounts are missing. Do not replace them automatically."
        )
    for account, allowed in (
        (BUILD_SA, {"roles/logging.logWriter"}),
        (RUNTIME_SA, set()),
        (
            ci_account(purpose),
            {
                f"projects/{PROJECT}/roles/{BUILD_ROLE if purpose == 'build' else DEPLOY_ROLE}"
            },
        ),
    ):
        direct = {
            b["role"]
            for b in project_policy.get("bindings", [])
            if f"serviceAccount:{account}" in b.get("members", [])
        }
        if direct - allowed:
            raise Failure(
                f"Unexpected project roles on {account}; administrator review required. No permissions were removed."
            )
    if not bound(
        project_policy, "roles/logging.logWriter", f"serviceAccount:{BUILD_SA}"
    ):
        raise Failure(
            "Existing build account Logging Log Writer binding was not verified."
        )
    secret_policies = {}
    for secret in SECRETS.values():
        policy = cloud.run("secrets", "get-iam-policy", secret, f"--project={PROJECT}")
        secret_policies[secret] = policy
        if not bound(
            policy, "roles/secretmanager.secretAccessor", f"serviceAccount:{RUNTIME_SA}"
        ):
            raise Failure(f"Existing runtime access on {secret} was not verified.")
        for b in policy.get("bindings", []):
            if (
                f"serviceAccount:{ci_account(purpose)}" in b.get("members", [])
                and b["role"] != f"projects/{PROJECT}/roles/{VERSION_ROLE}"
            ):
                raise Failure(
                    "CI account has unexpected secret permissions; review before enabling automation."
                )
    repo_policy = cloud.run(
        "artifacts",
        "repositories",
        "get-iam-policy",
        ARTIFACTS,
        f"--project={PROJECT}",
        f"--location={REGION}",
    )
    if not bound(
        repo_policy, "roles/artifactregistry.writer", f"serviceAccount:{BUILD_SA}"
    ):
        raise Failure(
            "Existing builder's repository-scoped writer grant was not verified."
        )
    bucket = verify_source_bucket(cloud)
    bucket_policy = cloud.run("storage", "buckets", "get-iam-policy", f"gs://{BUCKET}")
    if any(
        any(m in ("allUsers", "allAuthenticatedUsers") for m in b.get("members", []))
        for b in bucket_policy.get("bindings", [])
    ):
        raise Failure(
            "Build-source bucket has a public binding; review privately before uploading source."
        )
    if not bound(
        bucket_policy, "roles/storage.objectViewer", f"serviceAccount:{BUILD_SA}"
    ):
        raise Failure("Existing builder's source-bucket viewer grant was not verified.")
    pool = cloud.run(
        "iam",
        "workload-identity-pools",
        "describe",
        POOL,
        f"--project={PROJECT}",
        "--location=global",
        optional=True,
    )
    if pool is not None and (
        not isinstance(pool, dict) or pool.get("state") != "ACTIVE"
    ):
        raise Failure(
            "WIF pool is not verifiably ACTIVE; inspect it without recreating it."
        )
    if pool and (pool.get("disabled") or pool.get("state") == "DELETED"):
        raise Failure(
            "Existing WIF pool is disabled/deleted; review it instead of replacing it."
        )
    providers = []
    if pool:
        providers = cloud.run(
            "iam",
            "workload-identity-pools",
            "providers",
            "list",
            f"--workload-identity-pool={POOL}",
            f"--project={PROJECT}",
            "--location=global",
        )
        for item in providers:
            name = item["name"].split("/")[-1]
            if name not in ("github-build", "github-deploy"):
                raise Failure(
                    "Unexpected provider in the dedicated WIF pool; review trust before adding bindings."
                )
            check_provider(item, name.removeprefix("github-"))
    service = None
    service_policy = {}
    if purpose == "deploy":
        service = cloud.run(
            "run",
            "services",
            "describe",
            SERVICE,
            f"--project={PROJECT}",
            f"--region={REGION}",
            optional=True,
        )
        if service:
            spec = service.get("spec", {}).get("template", {}).get("spec", {})
            if spec.get("serviceAccountName") != RUNTIME_SA:
                raise Failure(
                    "Existing service has an unrelated runtime identity; stopped."
                )
            service_policy = cloud.run(
                "run",
                "services",
                "get-iam-policy",
                SERVICE,
                f"--project={PROJECT}",
                f"--region={REGION}",
            )
    roles = {}
    selected_roles = (
        (BUILD_ROLE, SOURCE_ROLE)
        if purpose == "build"
        else (DEPLOY_ROLE, VERSION_ROLE, RUN_ROLE)
    )
    for role in selected_roles:
        current = cloud.run(
            "iam", "roles", "describe", role, f"--project={PROJECT}", optional=True
        )
        if current is not None:
            check_role(current, role)
        roles[role] = current
    policies = {}
    for account, present in accounts.items():
        if present:
            policies[account] = cloud.run(
                "iam",
                "service-accounts",
                "get-iam-policy",
                account,
                f"--project={PROJECT}",
            )
    for account in (BUILD_SA, RUNTIME_SA):
        policy = policies[account]
        for binding in policy.get("bindings", []):
            if f"serviceAccount:{ci_account(purpose)}" in binding.get(
                "members", []
            ) and account != (BUILD_SA if purpose == "build" else RUNTIME_SA):
                raise Failure(
                    "CI account can impersonate the wrong service identity; administrator review required."
                )
    for binding in policies.get(ci_account(purpose), {}).get("bindings", []):
        if binding.get("role") == "roles/iam.workloadIdentityUser" and set(
            binding.get("members", [])
        ) != {principal(purpose)}:
            raise Failure(
                "CI service account has an unexpected federated impersonator; review without overwriting it."
            )
        if any(
            m in ("allUsers", "allAuthenticatedUsers")
            for m in binding.get("members", [])
        ):
            raise Failure("CI account has a public IAM binding; stopped.")
    apis = cloud.run("services", "list", "--enabled", f"--project={PROJECT}")
    enabled = {a.get("config", {}).get("name") for a in apis}
    return {
        "purpose": purpose,
        "accounts": accounts,
        "roles": roles,
        "pool": pool,
        "providers": providers,
        "project_policy": project_policy,
        "account_policies": policies,
        "repo_policy": repo_policy,
        "bucket_policy": bucket_policy,
        "bucket": bucket,
        "secret_policies": secret_policies,
        "enabled_apis": enabled,
        "service": service,
        "service_policy": service_policy,
    }


def check_role(current, role):
    expected = f"projects/{PROJECT}/roles/{role}"
    if not isinstance(current, dict):
        reason = "invalid metadata"
    elif current.get("name") not in (expected, f"projects/{NUMBER}/roles/{role}"):
        reason = f"identity is not {expected}; role IDs are case-sensitive"
    elif current.get("deleted") or current.get("stage") != "GA":
        reason = "role is deleted or not verifiably GA"
    elif not isinstance(current.get("includedPermissions"), list) or any(
        not isinstance(p, str) for p in current["includedPermissions"]
    ):
        reason = "includedPermissions metadata is missing or invalid"
    else:
        actual = set(current.get("includedPermissions", []))
        required = set(ROLE_PERMISSIONS[role])
        if actual == required:
            return
        reason = (
            f"missing permissions: {', '.join(sorted(required - actual)) or 'none'}; "
            f"unexpected permissions: {', '.join(sorted(actual - required)) or 'none'}"
        )
    raise Failure(
        f"Existing custom role {role} differs from this reviewed plan ({reason}). "
        "No overwrite, reactivation or recreation is allowed."
    )


def check_provider(item, purpose):
    oidc = item.get("oidc", {})
    if (
        item.get("disabled")
        or item.get("state") == "DELETED"
        or item.get("attributeMapping") != mapping(purpose)
        or item.get("attributeCondition") != trust(purpose)
        or oidc.get("issuerUri") != "https://token.actions.githubusercontent.com"
        or oidc.get("allowedAudiences")
    ):
        raise Failure(
            "Existing WIF provider differs from the exact reviewed trust. No automatic replacement/update is permitted. "
            "For the build provider's immutable-subject investigation, use read-only verify-wif."
        )


def inventory(state, purpose):
    """Only report verified reads; absence/permission failures are never conflated."""
    account = ci_account(purpose)
    member = f"serviceAccount:{account}"
    role = BUILD_ROLE if purpose == "build" else DEPLOY_ROLE
    bindings = []

    def binding(scope, policy, role, member):
        bindings.append(
            {
                "scope": scope,
                "role": role,
                "member": member,
                "present": bound(policy, role, member),
            }
        )

    binding(
        PROJECT, state["project_policy"], f"projects/{PROJECT}/roles/{role}", member
    )
    target = BUILD_SA if purpose == "build" else RUNTIME_SA
    binding(
        target,
        state["account_policies"].get(target, {}),
        "roles/iam.serviceAccountUser",
        member,
    )
    binding(
        account,
        state["account_policies"].get(account, {}),
        "roles/iam.workloadIdentityUser",
        principal(purpose),
    )
    if purpose == "build":
        binding(
            f"gs://{BUCKET}",
            state["bucket_policy"],
            f"projects/{PROJECT}/roles/{SOURCE_ROLE}",
            member,
        )
    else:
        binding(
            SERVICE,
            state["service_policy"],
            f"projects/{PROJECT}/roles/{RUN_ROLE}",
            member,
        )
        binding(
            ARTIFACTS, state["repo_policy"], "roles/artifactregistry.reader", member
        )
        for secret, policy in state["secret_policies"].items():
            binding(secret, policy, f"projects/{PROJECT}/roles/{VERSION_ROLE}", member)
    missing = {
        "service_account": not bool(state["accounts"][account]),
        "pool": not bool(state["pool"]),
        "provider": not any(
            p["name"].endswith(f"/github-{purpose}") for p in state["providers"]
        ),
        "custom_roles": [r for r, obj in state["roles"].items() if not obj],
        "apis_to_enable": sorted(REQUIRED_APIS - state["enabled_apis"]),
    }
    return {
        "missing_resources": missing,
        "bindings": bindings,
        "resources_verified": not any(missing.values()),
        "all_bindings_verified": all(b["present"] for b in bindings),
        "bucket_project_number": str(state["bucket"]["projectNumber"]),
        "custom_role_metadata": {
            r: {"name": obj["name"], "stage": obj["stage"]}
            for r, obj in state["roles"].items()
            if obj
        },
    }


class ApplyProgress:
    """Record successful writes separately from later live, read-only verification."""

    def __init__(self, cloud, result):
        self.cloud = cloud
        self.result = result

    def run(self, *args):
        operation = {"command": list(args)}
        self.result["pending_operation"] = operation
        write_result(f"setup-{self.result['purpose']}", self.result, announce=False)
        value = self.cloud.run(*args)
        self.result["completed_operations"].append(operation)
        self.result["pending_operation"] = None
        write_result(f"setup-{self.result['purpose']}", self.result, announce=False)
        return value


def setup(cloud, purpose, apply=False, resume=False):
    if resume and not apply:
        raise Failure(
            "Resume changes IAM. Supply --approve-wif-setup only for authorized setup."
        )
    state = plan(cloud, purpose)
    account = ci_account(purpose)
    role = BUILD_ROLE if purpose == "build" else DEPLOY_ROLE
    resource_role = SOURCE_ROLE if purpose == "build" else VERSION_ROLE
    result = {
        "mode": "APPLY" if apply else "READ-ONLY PLAN",
        "bindings_only_resume": resume,
        "purpose": purpose,
        "project": PROJECT,
        "new_service_account_if_missing": account,
        "pool_if_missing": POOL,
        "provider": provider(purpose),
        "trust_condition": trust(purpose),
        "attribute_mapping": mapping(purpose),
        "impersonation_member": principal(purpose),
        "custom_roles": {
            r: ROLE_PERMISSIONS[r]
            for r in (
                (role, resource_role)
                if purpose == "build"
                else (role, resource_role, RUN_ROLE)
            )
        },
        "deployment_setup_blocked_until_initial_owner_deployment": purpose == "deploy"
        and not state["service"],
        "existing_build_runtime_accounts_reused": True,
        "warning": "Effective inherited/group IAM and Free Trial/Free Tier status still need Console review. No billing changes are included.",
    }
    result.update(inventory(state, purpose))
    result["inventory_phase"] = "BEFORE_APPLY" if apply else "CURRENT_READ_ONLY"
    result["status"] = "APPLYING" if apply else "READ_ONLY"
    result["completed_operations"] = []
    write_result(f"setup-{purpose}" if apply else f"setup-{purpose}-plan", result)
    if not apply:
        print(json.dumps(result, indent=2))
        count = sum(b["present"] for b in result["bindings"])
        print(
            f"Read-only: resources verified={result['resources_verified']}; IAM grants verified={count}/{len(result['bindings'])}."
        )
        for binding in result["bindings"]:
            if not binding["present"]:
                print(f"Missing grant: {binding['role']} on {binding['scope']}")
        return result
    if purpose == "deploy" and not state["service"]:
        raise Failure(
            "The service does not exist. After separate deployment authorization, the project owner must perform the initial deployment using the same deploy helper. Then scope CI permissions to that one service; no project-wide Run administration is granted."
        )
    if resume and not result["resources_verified"]:
        result["status"] = "RESUME_REFUSED"
        write_result(f"setup-{purpose}", result)
        raise Failure(
            "Bindings-only resume refused: required resources/APIs are missing or not "
            "yet visible. Inspect missing_resources in the read-only setup plan. "
            "No resource was created/recreated, API enabled, or IAM changed. "
            "Do not use full setup merely to bypass this check."
        )
    try:
        progress = ApplyProgress(cloud, result)
        if not resume:
            _create_missing_resources(progress, purpose, state)
        _apply_missing_bindings(progress, purpose, state)
    except Failure as error:
        result["status"] = "PARTIAL_FAILURE"
        result["inventory_phase"] = "UNVERIFIED_AFTER_ERROR"
        result["failed_operation"] = result.pop("pending_operation", None)
        result["failure"] = str(error)
        if hasattr(error, "details"):
            result["failure_details"] = error.details
        write_result(f"setup-{purpose}", result, announce=False)
        # A failing client response does not establish whether the server committed.
        # Reinspect only; never replay a write or remove an earlier successful grant.
        try:
            observed = inventory(plan(cloud, purpose), purpose)
            result.update(observed)
            result["inventory_phase"] = "AFTER_ERROR"
            if observed["resources_verified"] and observed["all_bindings_verified"]:
                result["status"] = "VERIFIED_AFTER_SDK_ERROR"
                write_result(f"setup-{purpose}", result)
                print(
                    "SDK reported an error, but fresh read-only checks verified all scoped setup. No write was retried."
                )
                return result
        except Failure as inspection_error:
            result["reinspection_error"] = str(inspection_error)
            result["resources_verified"] = False
            result["all_bindings_verified"] = False
        write_result(f"setup-{purpose}", result)
        print(json.dumps(result, indent=2))
        raise Failure(
            f"{error} Partial progress was recorded. Fresh inspection results are above; "
            "unverified access is not proof of absence. If resources and role permissions "
            "are all verified, review missing bindings and use the approved bindings-only "
            "resume. IAM propagation is possible, not established; do not recreate resources."
        ) from error
    try:
        result.update(inventory(plan(cloud, purpose), purpose))
        result["inventory_phase"] = "AFTER_APPLY"
        if not result["resources_verified"] or not result["all_bindings_verified"]:
            raise Failure(
                "Post-apply metadata does not yet verify every required resource/binding."
            )
    except Failure as error:
        result["status"] = "APPLIED_UNVERIFIED"
        result["inventory_phase"] = "UNVERIFIED_AFTER_APPLY"
        result["resources_verified"] = False
        result["all_bindings_verified"] = False
        result["verification_error"] = str(error)
        write_result(f"setup-{purpose}", result)
        raise Failure(
            f"{error} Do not blindly repeat writes. Run setup without approval flags "
            "to inspect current state; a permission/propagation issue may require review."
        ) from error
    result["status"] = "VERIFIED"
    write_result(f"setup-{purpose}", result)
    print(
        "Scoped setup verified by fresh reads. No build, deployment, secret payload access or billing change was performed."
    )
    return result


def _create_missing_resources(cloud, purpose, state):
    account = ci_account(purpose)
    role = BUILD_ROLE if purpose == "build" else DEPLOY_ROLE
    resource_role = SOURCE_ROLE if purpose == "build" else VERSION_ROLE
    missing = sorted(REQUIRED_APIS - state["enabled_apis"])
    if missing:
        cloud.run("services", "enable", *missing, f"--project={PROJECT}")
    if not state["accounts"][account]:
        cloud.run(
            "iam",
            "service-accounts",
            "create",
            account.split("@")[0],
            f"--project={PROJECT}",
            f"--display-name=Identifier Q CI {purpose}",
        )
    for r in (
        (role, resource_role) if purpose == "build" else (role, resource_role, RUN_ROLE)
    ):
        if not state["roles"][r]:
            cloud.run(
                "iam",
                "roles",
                "create",
                r,
                f"--project={PROJECT}",
                f"--title=Identifier Q {r}",
                "--stage=GA",
                "--permissions=" + ",".join(ROLE_PERMISSIONS[r]),
            )
    if not state["pool"]:
        cloud.run(
            "iam",
            "workload-identity-pools",
            "create",
            POOL,
            f"--project={PROJECT}",
            "--location=global",
            "--display-name=Identifier Q GitHub",
        )
    if not any(p["name"].endswith(f"/github-{purpose}") for p in state["providers"]):
        cloud.run(
            "iam",
            "workload-identity-pools",
            "providers",
            "create-oidc",
            f"github-{purpose}",
            f"--project={PROJECT}",
            "--location=global",
            f"--workload-identity-pool={POOL}",
            "--issuer-uri=https://token.actions.githubusercontent.com",
            "--attribute-mapping="
            + ",".join(f"{k}={v}" for k, v in mapping(purpose).items()),
            "--attribute-condition=" + trust(purpose),
        )


def _apply_missing_bindings(cloud, purpose, state):
    account = ci_account(purpose)
    role = BUILD_ROLE if purpose == "build" else DEPLOY_ROLE
    member = f"serviceAccount:{account}"
    if not bound(state["project_policy"], f"projects/{PROJECT}/roles/{role}", member):
        cloud.run(
            "projects",
            "add-iam-policy-binding",
            PROJECT,
            f"--member={member}",
            f"--role=projects/{PROJECT}/roles/{role}",
            "--condition=None",
        )
    target = BUILD_SA if purpose == "build" else RUNTIME_SA
    if not bound(
        state["account_policies"].get(target, {}),
        "roles/iam.serviceAccountUser",
        member,
    ):
        cloud.run(
            "iam",
            "service-accounts",
            "add-iam-policy-binding",
            target,
            f"--project={PROJECT}",
            f"--member={member}",
            "--role=roles/iam.serviceAccountUser",
            "--condition=None",
        )
    own_policy = state["account_policies"].get(account, {})
    if not bound(own_policy, "roles/iam.workloadIdentityUser", principal(purpose)):
        cloud.run(
            "iam",
            "service-accounts",
            "add-iam-policy-binding",
            account,
            f"--project={PROJECT}",
            f"--member={principal(purpose)}",
            "--role=roles/iam.workloadIdentityUser",
            "--condition=None",
        )
    if purpose == "build":
        full_role = f"projects/{PROJECT}/roles/{SOURCE_ROLE}"
        if not bound(state["bucket_policy"], full_role, member):
            cloud.run(
                "storage",
                "buckets",
                "add-iam-policy-binding",
                f"gs://{BUCKET}",
                f"--member={member}",
                f"--role={full_role}",
                "--condition=None",
            )
    else:
        if not bound(
            state["service_policy"], f"projects/{PROJECT}/roles/{RUN_ROLE}", member
        ):
            cloud.run(
                "run",
                "services",
                "add-iam-policy-binding",
                SERVICE,
                f"--project={PROJECT}",
                f"--region={REGION}",
                f"--member={member}",
                f"--role=projects/{PROJECT}/roles/{RUN_ROLE}",
                "--condition=None",
            )
        if not bound(state["repo_policy"], "roles/artifactregistry.reader", member):
            cloud.run(
                "artifacts",
                "repositories",
                "add-iam-policy-binding",
                ARTIFACTS,
                f"--project={PROJECT}",
                f"--location={REGION}",
                f"--member={member}",
                "--role=roles/artifactregistry.reader",
                "--condition=None",
            )
        for secret in SECRETS.values():
            policy = state["secret_policies"][secret]
            if not bound(policy, f"projects/{PROJECT}/roles/{VERSION_ROLE}", member):
                cloud.run(
                    "secrets",
                    "add-iam-policy-binding",
                    secret,
                    f"--project={PROJECT}",
                    f"--member={member}",
                    f"--role=projects/{PROJECT}/roles/{VERSION_ROLE}",
                    "--condition=None",
                )
