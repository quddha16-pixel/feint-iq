"""Offline automation contracts. All cloud responses are synthetic metadata, never real APIs."""

import copy
import os
import subprocess
import unittest
from unittest.mock import patch

import build as b
import common as c
import setup as s

import deploy as d

COMMIT = "a" * 40
HASH = "sha256:" + "b" * 64
ID = "12345678-1234-1234-1234-123456789abc"
IMAGE = f"{c.IMAGE_BASE}:sha-{COMMIT}-synthetic"


def built():
    return {
        "id": ID,
        "status": "SUCCESS",
        "serviceAccount": f"projects/{c.PROJECT}/serviceAccounts/{c.BUILD_SA}",
        "substitutions": {"_COMMIT_SHA": COMMIT},
        "source": {"storageSource": {"bucket": c.BUCKET}},
        "results": {"images": [{"name": IMAGE, "digest": HASH}]},
    }


def service():
    env = [
        {"name": k, "value": v}
        for k, v in {
            "HOST": "0.0.0.0",
            "MAX_UPLOAD_MB": "25",
            "FRONTEND_ORIGIN": c.ORIGIN,
            "GEMINI_MODEL": c.MODEL,
            "UNRELATED": "preserved",
        }.items()
    ]
    env += [
        {"name": k, "valueFrom": {"secretKeyRef": {"name": v, "key": "2"}}}
        for k, v in c.SECRETS.items()
    ]
    return {
        "metadata": {
            "annotations": {
                "run.googleapis.com/minScale": "0",
                "run.googleapis.com/maxScale": "1",
            }
        },
        "spec": {
            "traffic": [{"latestRevision": True, "percent": 100}],
            "template": {
                "metadata": {
                    "annotations": {
                        "autoscaling.knative.dev/minScale": "0",
                        "autoscaling.knative.dev/maxScale": "1",
                        "run.googleapis.com/cpu-throttling": "true",
                        "run.googleapis.com/startup-cpu-boost": "false",
                        "run.googleapis.com/execution-environment": "gen2",
                    }
                },
                "spec": {
                    "serviceAccountName": c.RUNTIME_SA,
                    "containerConcurrency": 8,
                    "timeoutSeconds": 600,
                    "containers": [
                        {
                            "image": f"{c.IMAGE_BASE}@{HASH}",
                            "ports": [{"containerPort": 8080}],
                            "resources": {"limits": {"cpu": "1", "memory": "2Gi"}},
                            "env": env,
                            "startupProbe": {
                                "httpGet": {"path": "/livez", "port": 8080}
                            },
                            "livenessProbe": {
                                "httpGet": {"path": "/livez", "port": 8080}
                            },
                        }
                    ],
                },
            },
        },
        "status": {
            "url": "https://identifier-q-api-synthetic-uc.a.run.app",
            "latestReadyRevisionName": "identifier-q-api-00001-test",
            "conditions": [{"type": "Ready", "status": "True"}],
        },
    }


def raw_bucket():
    """Synthetic Storage JSON API shape; never a claim about the live owner."""
    return {
        "kind": "storage#bucket",
        "name": c.BUCKET,
        "projectNumber": c.NUMBER,
        "iamConfiguration": {
            "uniformBucketLevelAccess": {"enabled": True},
            "publicAccessPrevention": "enforced",
        },
    }


def standardized_bucket():
    """SDK 592.0.0 default display: owner is omitted even with --format=json."""
    return {
        "name": c.BUCKET,
        "storage_url": f"gs://{c.BUCKET}/",
        "uniform_bucket_level_access": True,
        "public_access_prevention": "enforced",
    }


def policy(role, member):
    return {"bindings": [{"role": role, "members": [f"serviceAccount:{member}"]}]}


class FakeCloud:
    def __init__(self):
        self.calls = []
        self.image = IMAGE
        self.status = "SUCCESS"
        self.current = service()
        self.invalid_role = False
        self.unknown_provider = False
        self.disabled_secret = False
        self.fail_poll = False
        self.bucket_metadata = raw_bucket()
        self.bucket_error = None

    def run(self, *args, **kwargs):
        self.calls.append(args)
        key = args[:3]
        if key[:2] == ("projects", "describe"):
            return {"projectId": c.PROJECT, "projectNumber": c.NUMBER}
        if key[:2] == ("projects", "get-iam-policy"):
            return policy("roles/logging.logWriter", c.BUILD_SA)
        if key == ("iam", "service-accounts", "describe"):
            return None if "-ci-" in args[3] else {"email": args[3]}
        if key == ("iam", "service-accounts", "get-iam-policy"):
            return {"bindings": []}
        if key[:2] == ("secrets", "get-iam-policy"):
            return policy("roles/secretmanager.secretAccessor", c.RUNTIME_SA)
        if key == ("secrets", "versions", "describe"):
            return {"state": "DISABLED" if self.disabled_secret else "ENABLED"}
        if key == ("artifacts", "repositories", "get-iam-policy"):
            return policy("roles/artifactregistry.writer", c.BUILD_SA)
        if key == ("storage", "buckets", "describe"):
            if self.bucket_error:
                raise self.bucket_error
            return (
                copy.deepcopy(self.bucket_metadata)
                if "--raw" in args
                else standardized_bucket()
            )
        if key == ("storage", "buckets", "get-iam-policy"):
            return policy("roles/storage.objectViewer", c.BUILD_SA)
        if key == ("iam", "workload-identity-pools", "describe"):
            return {"state": "ACTIVE"} if self.unknown_provider else None
        if key == ("iam", "workload-identity-pools", "providers") and "list" in args:
            return [{"name": "unexpected"}]
        if key == ("iam", "roles", "describe"):
            return (
                {"includedPermissions": ["secretmanager.versions.access"]}
                if self.invalid_role
                else None
            )
        if key[:2] == ("services", "list"):
            return [
                {"config": {"name": x}}
                for x in (
                    "iam.googleapis.com",
                    "iamcredentials.googleapis.com",
                    "sts.googleapis.com",
                )
            ]
        if key[:2] == ("meta", "list-files-for-upload"):
            return "server/main.ts"
        if key[:2] == ("builds", "submit"):
            self.image = next(
                x.split("_IMAGE=", 1)[1].split(",")[0]
                for x in args
                if x.startswith("--substitutions=")
            )
            return {"id": ID}
        if key[:2] == ("builds", "describe"):
            if self.fail_poll:
                raise c.Failure("Synthetic polling failure")
            value = built()
            value["results"]["images"][0]["name"] = self.image
            value["status"] = self.status
            return value
        if key == ("run", "services", "describe"):
            return self.current
        return {}

    def mutations(self):
        return [
            x
            for x in self.calls
            if any(
                v in x
                for v in (
                    "create",
                    "create-oidc",
                    "add-iam-policy-binding",
                    "enable",
                    "submit",
                    "deploy",
                    "cancel",
                )
            )
        ]


class Guards(unittest.TestCase):
    def env(self, purpose="build"):
        return {
            "GITHUB_ACTIONS": "true",
            "GITHUB_REPOSITORY": c.REPOSITORY,
            "GITHUB_REPOSITORY_ID": c.REPOSITORY_ID,
            "GITHUB_REPOSITORY_OWNER_ID": c.OWNER_ID,
            "GITHUB_REF": c.REF,
            "GITHUB_EVENT_NAME": "workflow_dispatch",
            "GITHUB_SHA": COMMIT,
            "GITHUB_WORKFLOW_REF": f"{c.REPOSITORY}/.github/workflows/{purpose}-backend.yml@{c.REF}",
            "AUTOMATION_ENABLED": "true",
            "TRIAL_CONFIRMED": "true",
        }

    def git(self, *args):
        return {
            ("remote", "get-url", "origin"): f"https://github.com/{c.REPOSITORY}.git",
            ("rev-parse", "HEAD"): COMMIT,
            ("branch", "--show-current"): c.BRANCH,
            ("status", "--porcelain", "--untracked-files=all"): "",
        }[args]

    @patch("common.git")
    def test_only_manual_approved_repository_branch_and_workflow(self, git):
        git.side_effect = self.git
        self.assertEqual(c.guard("build", True, self.env()), COMMIT)
        for key, value in {
            "GITHUB_REPOSITORY": "attacker/fork",
            "GITHUB_REPOSITORY_ID": "123",
            "GITHUB_REPOSITORY_OWNER_ID": "123",
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_EVENT_NAME": "pull_request_target",
            "GITHUB_WORKFLOW_REF": "other",
            "GITHUB_SHA": "c" * 40,
            "AUTOMATION_ENABLED": "false",
            "TRIAL_CONFIRMED": "false",
        }.items():
            with self.subTest(key=key), self.assertRaises(c.Failure):
                c.guard("build", True, {**self.env(), key: value})

    @patch("common.git")
    def test_deployment_locked_before_cloud_authentication(self, git):
        with self.assertRaisesRegex(c.Failure, "locked"):
            c.guard("deploy", True, {**self.env("deploy"), "AUTOMATION_ENABLED": ""})
        git.assert_not_called()

    def test_source_bucket_requires_expected_project_and_private_access_settings(self):
        c.check_bucket(raw_bucket())
        for field, value in (
            ("uniformBucketLevelAccess", {"enabled": False}),
            ("publicAccessPrevention", "inherited"),
        ):
            obj = raw_bucket()
            obj["iamConfiguration"][field] = value
            with self.assertRaises(c.Failure):
                c.check_bucket(obj)
        obj = raw_bucket()
        obj["projectNumber"] = "999999999999"
        with self.assertRaises(c.BucketOwnershipMismatch):
            c.check_bucket(obj)

    def test_fixed_configuration_and_credential_ignore_rules(self):
        c.verify_configuration()

    def test_trust_has_numeric_ownership_branch_environment_event_workflow(self):
        for purpose in ("build", "deploy"):
            text = c.trust(purpose)
            for required in (
                c.REPOSITORY_ID,
                c.OWNER_ID,
                c.REF,
                "workflow_dispatch",
                f"{purpose}-backend.yml",
                f"environment:identifierq-{purpose}",
            ):
                self.assertIn(required, text)
        self.assertNotEqual(c.mapping("build"), c.mapping("deploy"))
        self.assertNotEqual(c.principal("build"), c.principal("deploy"))

    def test_versions_are_numeric_not_payloads_or_latest(self):
        for value in (
            "",
            "latest",
            "0",
            "synthetic-key",
            "1,OTHER=value",
            "$(command)",
        ):
            with self.assertRaises(c.Failure):
                c.version(value)
        self.assertEqual(c.version("2"), "2")

    @patch("common.subprocess.run")
    def test_permission_failure_is_not_treated_as_absence_or_logged(self, run):
        run.return_value = subprocess.CompletedProcess(
            [], 1, "", "PERMISSION_DENIED (resource not found) secret-debug-marker"
        )
        with self.assertRaises(c.Failure) as context:
            c.Cloud().run("iam", "roles", "describe", "name", optional=True)
        self.assertNotIn("secret-debug-marker", str(context.exception))
        run.assert_called_once()

    @patch("common.subprocess.run")
    def test_only_a_real_not_found_can_be_optional(self, run):
        run.return_value = subprocess.CompletedProcess([], 1, "", "NOT_FOUND")
        self.assertIsNone(
            c.Cloud().run("iam", "roles", "describe", "name", optional=True)
        )


class Provisioning(unittest.TestCase):
    def test_sensitive_legacy_builder_role_stops_new_trust_before_any_mutation(self):
        cloud = FakeCloud()
        run = cloud.run

        def response(*args, **kwargs):
            if args[:2] == ("projects", "get-iam-policy"):
                obj = run(*args, **kwargs)
                obj["bindings"].append(
                    {
                        "role": "roles/editor",
                        "members": [
                            f"serviceAccount:{c.NUMBER}@cloudbuild.gserviceaccount.com"
                        ],
                    }
                )
                return obj
            return run(*args, **kwargs)

        cloud.run = response
        with self.assertRaisesRegex(c.Failure, "Legacy default"):
            s.setup(cloud, "build", True)
        self.assertFalse(cloud.mutations())

    @patch("setup.write_result")
    def test_default_setup_is_read_only_inventory(self, _):
        cloud = FakeCloud()
        result = s.setup(cloud, "build")
        self.assertEqual(result["mode"], "READ-ONLY PLAN")
        self.assertFalse(cloud.mutations())

    @patch("setup.write_result")
    def test_approved_build_setup_keeps_runtime_and_builder_separate(self, _):
        cloud = FakeCloud()
        s.setup(cloud, "build", True)
        writes = cloud.mutations()
        self.assertTrue(any("create-oidc" in x for x in writes))
        self.assertFalse(
            any("deploy" in x or "submit" in x or "set-iam-policy" in x for x in writes)
        )
        self.assertFalse(
            any("--role=roles/secretmanager.secretAccessor" in x for x in writes)
        )
        self.assertFalse(
            any(c.RUNTIME_SA in x and "add-iam-policy-binding" in x for x in writes)
        )
        self.assertTrue(
            any(
                "--role=roles/iam.serviceAccountUser" in x and c.BUILD_SA in x
                for x in writes
            )
        )
        self.assertNotIn(
            "secretmanager.versions.access", s.ROLE_PERMISSIONS[s.BUILD_ROLE]
        )

    @patch("setup.write_result")
    def test_deploy_setup_grants_metadata_not_secret_access_or_build_submission(
        self, _
    ):
        cloud = FakeCloud()
        s.setup(cloud, "deploy", True)
        self.assertNotIn("cloudbuild.builds.create", s.ROLE_PERMISSIONS[s.DEPLOY_ROLE])
        self.assertFalse(
            any(
                p.startswith("run.services.") for p in s.ROLE_PERMISSIONS[s.DEPLOY_ROLE]
            )
        )
        self.assertNotIn("run.services.create", s.ROLE_PERMISSIONS[s.RUN_ROLE])
        self.assertNotIn(
            "secretmanager.versions.access", s.ROLE_PERMISSIONS[s.VERSION_ROLE]
        )
        self.assertFalse(
            any(
                "--role=roles/secretmanager.secretAccessor" in x
                for x in cloud.mutations()
            )
        )

    @patch("setup.write_result")
    def test_deploy_setup_needs_existing_service_before_any_permission_changes(
        self, result
    ):
        cloud = FakeCloud()
        cloud.current = None
        with self.assertRaisesRegex(c.Failure, "does not exist"):
            s.setup(cloud, "deploy", True)
        self.assertFalse(cloud.mutations())

    @patch("setup.write_result")
    def test_deploy_run_permissions_are_bound_to_only_the_named_service(self, result):
        cloud = FakeCloud()
        s.setup(cloud, "deploy", True)
        role = f"--role=projects/{c.PROJECT}/roles/{s.RUN_ROLE}"
        bindings = [x for x in cloud.mutations() if role in x]
        self.assertEqual(len(bindings), 1)
        self.assertEqual(
            bindings[0][:4], ("run", "services", "add-iam-policy-binding", c.SERVICE)
        )
        self.assertFalse(
            any(
                p.startswith("run.services.") for p in s.ROLE_PERMISSIONS[s.DEPLOY_ROLE]
            )
        )

    def test_existing_role_mismatch_fails_before_any_mutation(self):
        cloud = FakeCloud()
        cloud.invalid_role = True
        with self.assertRaisesRegex(c.Failure, "differs"):
            s.setup(cloud, "build", True)
        self.assertFalse(cloud.mutations())

    def test_unexpected_pool_provider_is_not_overwritten(self):
        cloud = FakeCloud()
        cloud.unknown_provider = True
        with self.assertRaisesRegex(c.Failure, "Unexpected provider"):
            s.setup(cloud, "build", True)
        self.assertFalse(cloud.mutations())

    def test_existing_provider_trust_is_exact_not_merely_repository_named(self):
        obj = {
            "attributeMapping": c.mapping("build"),
            "attributeCondition": c.trust("build"),
            "oidc": {"issuerUri": "https://token.actions.githubusercontent.com"},
        }
        s.check_provider(obj, "build")
        for changed in (
            {"attributeCondition": "true"},
            {"attributeMapping": c.mapping("deploy")},
            {"oidc": {"issuerUri": "https://attacker.example"}},
        ):
            with self.assertRaises(c.Failure):
                s.check_provider({**obj, **changed}, "build")


class Builds(unittest.TestCase):
    @patch("build.guard", return_value=COMMIT)
    @patch("build.write_result")
    def test_one_cloud_build_and_no_deployment_secret_access_or_provisioning(
        self, _, guard
    ):
        cloud = FakeCloud()
        result = b.build(cloud, True, True, sleep=lambda _: None)
        self.assertEqual(result["image_ref"], f"{c.IMAGE_BASE}@{HASH}")
        self.assertEqual(sum(x[:2] == ("builds", "submit") for x in cloud.calls), 1)
        self.assertFalse(
            any(
                x[0] in ("run", "secrets", "billing") or "enable" in x
                for x in cloud.calls
            )
        )
        submit = next(x for x in cloud.calls if x[:2] == ("builds", "submit"))
        self.assertIn(
            f"--service-account=projects/{c.PROJECT}/serviceAccounts/{c.BUILD_SA}",
            submit,
        )
        self.assertTrue(any(f"_COMMIT_SHA={COMMIT}" in x for x in submit))

    def test_no_build_without_approval(self):
        cloud = FakeCloud()
        with self.assertRaises(c.Failure):
            b.build(cloud)
        self.assertFalse(cloud.calls)

    @patch("build.guard", return_value=COMMIT)
    @patch("build.write_result")
    def test_failed_build_is_not_retried(self, _, guard):
        cloud = FakeCloud()
        cloud.status = "FAILURE"
        with self.assertRaisesRegex(c.Failure, "FAILURE"):
            b.build(cloud, True, True, sleep=lambda _: None)
        self.assertEqual(sum(x[:2] == ("builds", "submit") for x in cloud.calls), 1)

    @patch("build.guard", return_value=COMMIT)
    @patch("build.write_result")
    def test_interrupted_observation_cancels_only_that_build(self, _, guard):
        cloud = FakeCloud()
        cloud.fail_poll = True
        with self.assertRaises(c.Failure):
            b.build(cloud, True, True, sleep=lambda _: None)
        self.assertIn(
            ("builds", "cancel", ID, f"--project={c.PROJECT}", f"--region={c.REGION}"),
            cloud.calls,
        )

    def test_unapproved_source_media_credentials_and_escaping_paths_fail(self):
        for name in (
            ".env.server",
            "gha-creds-anything.json",
            "private/video.MP4",
            "secrets/key.pem",
            "../outside.txt",
            "/tmp/outside",
        ):
            with self.subTest(name=name), self.assertRaises(c.Failure):
                b.check_source(name)
        b.check_source("server/main.ts")

    def test_digest_provenance_requires_success_right_builder_source_commit_and_image(
        self,
    ):
        self.assertEqual(b.record_from_build(built())["commit"], COMMIT)
        for value in (
            {"status": "FAILURE"},
            {"serviceAccount": c.RUNTIME_SA},
            {"substitutions": {"_COMMIT_SHA": "short"}},
            {"source": {"storageSource": {"bucket": "other"}}},
            {"results": {"images": [{"name": "unapproved", "digest": HASH}]}},
        ):
            with self.assertRaises(c.Failure):
                b.record_from_build({**built(), **value})


class Deployments(unittest.TestCase):
    def test_deploy_locked_before_any_cloud_operation(self):
        cloud = FakeCloud()
        with self.assertRaisesRegex(c.Failure, "locked"):
            d.deploy(cloud, ID, HASH, "2", "2")
        self.assertFalse(cloud.calls)

    def test_safe_configuration_uses_updates_without_overwriting_other_env(self):
        args = d.deploy_arguments(f"{c.IMAGE_BASE}@{HASH}", "2", "2")
        for required in (
            "--min=0",
            "--max=1",
            "--cpu-throttling",
            "--no-cpu-boost",
            "--memory=2Gi",
            "--cpu=1",
            "--timeout=600",
            "--concurrency=8",
        ):
            self.assertIn(required, args)
        self.assertTrue(
            any(
                x.startswith("--update-env-vars=") and "MAX_UPLOAD_MB=25" in x
                for x in args
            )
        )
        self.assertFalse(
            any(
                x.startswith("--set-env-vars") or x.startswith("--set-secrets")
                for x in args
            )
        )
        self.assertTrue(any("identifierq-pilot-token:2" in x for x in args))

    def test_arbitrary_tag_project_and_latest_versions_are_rejected(self):
        for image, gemini, pilot in (
            (f"{c.IMAGE_BASE}:latest", "2", "2"),
            (f"other@{HASH}", "2", "2"),
            (f"{c.IMAGE_BASE}@{HASH}", "latest", "2"),
        ):
            with self.assertRaises(c.Failure):
                d.deploy_arguments(image, gemini, pilot)

    def test_postdeploy_settings_and_secret_references_are_verified(self):
        obj = service()
        self.assertTrue(
            d.verify_service(obj, f"{c.IMAGE_BASE}@{HASH}", "2", "2").startswith(
                "https://"
            )
        )
        for field, value in (
            ("containerConcurrency", 80),
            ("timeoutSeconds", 3600),
            ("serviceAccountName", c.BUILD_SA),
        ):
            changed = copy.deepcopy(obj)
            changed["spec"]["template"]["spec"][field] = value
            with self.assertRaises(c.Failure):
                d.verify_service(changed, f"{c.IMAGE_BASE}@{HASH}", "2", "2")
        changed = copy.deepcopy(obj)
        changed["spec"]["template"]["spec"]["containers"][0]["env"][4] = {
            "name": "ANALYSIS_ACCESS_TOKEN",
            "value": "must-not-be-literal",
        }
        with self.assertRaises(c.Failure):
            d.verify_service(changed, f"{c.IMAGE_BASE}@{HASH}", "2", "2")

    def test_run_url_verification_accepts_current_formats_and_rejects_other_hosts(self):
        for url in (
            f"https://{c.SERVICE}-synthetic-uc.a.run.app",
            f"https://{c.SERVICE}-{c.NUMBER}.{c.REGION}.run.app",
        ):
            obj = service()
            obj["status"]["url"] = url
            self.assertEqual(
                d.verify_service(obj, f"{c.IMAGE_BASE}@{HASH}", "2", "2"), url
            )
        obj = service()
        obj["status"]["url"] = "https://attacker.example"
        with self.assertRaises(c.Failure):
            d.verify_service(obj, f"{c.IMAGE_BASE}@{HASH}", "2", "2")

    def test_probes_never_send_authorization_upload_or_provider_requests(self):
        calls = []

        def fetch(url, path, headers=None, method="GET"):
            calls.append((url, path, headers, method))
            if path == "/livez":
                return 200, {}, b'{"status":"ok"}'
            if method == "OPTIONS":
                return 204, {"access-control-allow-origin": c.ORIGIN}, b""
            if headers:
                return 403, {}, b"{}"
            return (
                401,
                {},
                b'{"message":"An authorized pilot session token is required."}',
            )

        d.verify_http("https://synthetic.run.app", fetch)
        self.assertTrue(all(x[3] in ("GET", "OPTIONS") for x in calls))
        self.assertTrue(all("Authorization" not in (x[2] or {}) for x in calls))
        with self.assertRaises(c.Failure):
            d.verify_http("https://synthetic.run.app", lambda *args: (200, {}, b"{}"))

    @patch.dict(os.environ, {"IDENTIFIERQ_DEPLOY_ENABLED": "true"})
    @patch("deploy.guard", return_value=COMMIT)
    @patch(
        "deploy.git",
        side_effect=lambda *a: '"request-stream-v1"' if a[0] == "show" else "",
    )
    @patch("deploy.verify_http")
    @patch("deploy.write_result")
    def test_approved_rollback_reuses_immutable_build_with_current_safe_config(
        self, _, http, git, guard
    ):
        cloud = FakeCloud()
        result = d.deploy(
            cloud, ID, HASH, "2", "2", ci=True, approved=True, operation="rollback"
        )
        self.assertEqual(result["operation"], "rollback")
        self.assertEqual(sum(x[:2] == ("run", "deploy") for x in cloud.calls), 1)
        self.assertFalse(
            any(x[:2] == ("builds", "submit") or "access" in x for x in cloud.calls)
        )

    @patch.dict(os.environ, {"IDENTIFIERQ_DEPLOY_ENABLED": "true"})
    @patch("deploy.guard", return_value=COMMIT)
    @patch("deploy.git", return_value='"request-stream-v1"')
    def test_mismatched_digest_and_disabled_secret_cannot_deploy(self, git, guard):
        for mismatch in (True, False):
            cloud = FakeCloud()
            cloud.disabled_secret = not mismatch
            with self.assertRaises(c.Failure):
                d.deploy(
                    cloud,
                    ID,
                    "sha256:" + "c" * 64 if mismatch else HASH,
                    "2",
                    "2",
                    True,
                    True,
                )
            self.assertFalse(cloud.mutations())

    @patch.dict(os.environ, {"IDENTIFIERQ_DEPLOY_ENABLED": "true"})
    @patch("deploy.guard", return_value=COMMIT)
    @patch("deploy.git", return_value='"request-stream-v1"')
    def test_unrelated_service_identity_or_split_traffic_is_preserved(self, git, guard):
        for change in ("identity", "traffic"):
            cloud = FakeCloud()
            if change == "identity":
                cloud.current["spec"]["template"]["spec"]["serviceAccountName"] = (
                    "unrelated"
                )
            else:
                cloud.current["spec"]["traffic"] = [{"percent": 50}, {"percent": 50}]
            with self.assertRaises(c.Failure):
                d.deploy(cloud, ID, HASH, "2", "2", True, True)
            self.assertFalse(cloud.mutations())


if __name__ == "__main__":
    unittest.main()
