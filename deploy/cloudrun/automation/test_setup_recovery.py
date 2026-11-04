"""Partial WIF setup/recovery with persistent synthetic state; no cloud operations."""

import copy
import io
import subprocess
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

import common as c
import manage
import setup as s
from test_automation import FakeCloud


BUCKET_WRITE = ("storage", "buckets", "add-iam-policy-binding")


class Recovery(unittest.TestCase):
    def setUp(self):
        self.records = []
        self.record_patch = patch(
            "setup.write_result",
            side_effect=lambda kind, data, **kwargs: self.records.append(
                copy.deepcopy(data)
            ),
        )
        self.record_patch.start()
        self.addCleanup(self.record_patch.stop)
        self.output = redirect_stdout(io.StringIO())
        self.output.__enter__()
        self.addCleanup(self.output.__exit__, None, None, None)

    def complete(self):
        cloud = FakeCloud()
        s.setup(cloud, "build", True)
        cloud.calls.clear()
        self.records.clear()
        return cloud

    def partial(self):
        cloud = self.complete()
        cloud.bucket_policy["bindings"] = [
            b
            for b in cloud.bucket_policy["bindings"]
            if b["role"] != f"projects/{c.PROJECT}/roles/{s.SOURCE_ROLE}"
        ]
        return cloud

    def test_partial_setup_records_each_success_and_live_missing_final_grant(self):
        cloud = FakeCloud()
        cloud.apis.clear()
        original = cloud.run

        def fail(*args, **kwargs):
            if args[:3] == BUCKET_WRITE:
                cloud.calls.append(args)
                raise c.BucketIamBindingError(
                    "Synthetic ambiguous 404", {"kind": "not_found_ambiguous"}
                )
            return original(*args, **kwargs)

        cloud.run = fail
        with self.assertRaisesRegex(c.Failure, "Partial progress"):
            s.setup(cloud, "build", True)
        record = self.records[-1]
        self.assertEqual(record["status"], "PARTIAL_FAILURE")
        self.assertEqual(record["inventory_phase"], "AFTER_ERROR")
        self.assertTrue(record["resources_verified"])
        self.assertEqual(
            [b["present"] for b in record["bindings"]], [True, True, True, False]
        )
        self.assertEqual(record["failed_operation"]["command"][:3], list(BUCKET_WRITE))
        self.assertEqual(record["failure_details"]["kind"], "not_found_ambiguous")
        completed = [op["command"] for op in record["completed_operations"]]
        self.assertEqual(
            len(completed), 9
        )  # APIs, CI SA, 2 roles, pool, provider, 3 grants.
        self.assertFalse(any(x[:3] == list(BUCKET_WRITE) for x in completed))
        self.assertEqual(sum(x[:3] == BUCKET_WRITE for x in cloud.calls), 1)
        failed_at = cloud.calls.index(
            next(x for x in cloud.calls if x[:3] == BUCKET_WRITE)
        )
        self.assertFalse(
            any(x in cloud.mutations() for x in cloud.calls[failed_at + 1 :])
        )

    def test_resume_adds_only_missing_final_binding_and_preserves_other_policies(self):
        cloud = self.partial()
        unrelated = {
            "role": "roles/storage.objectViewer",
            "members": ["group:reviewers@example.invalid"],
            "condition": {"title": "existing", "expression": "true"},
        }
        cloud.bucket_policy["bindings"].append(unrelated)
        old_bucket = copy.deepcopy(cloud.bucket_policy)
        old_project = copy.deepcopy(cloud.project_policy)
        old_accounts = copy.deepcopy(cloud.account_policies)
        old_secrets = copy.deepcopy(cloud.secret_policies)
        result = s.setup(cloud, "build", True, resume=True)
        self.assertEqual(result["status"], "VERIFIED")
        self.assertTrue(result["resources_verified"])
        self.assertTrue(result["all_bindings_verified"])
        self.assertEqual(len(cloud.mutations()), 1)
        self.assertEqual(cloud.mutations()[0][:3], BUCKET_WRITE)
        self.assertEqual(cloud.bucket_policy["bindings"][:-1], old_bucket["bindings"])
        self.assertEqual(cloud.project_policy, old_project)
        self.assertEqual(cloud.account_policies, old_accounts)
        self.assertEqual(cloud.secret_policies, old_secrets)

    def test_second_full_apply_and_resume_are_noops(self):
        cloud = self.complete()
        for resume in (False, True):
            result = s.setup(cloud, "build", True, resume=resume)
            self.assertEqual(result["status"], "VERIFIED")
        self.assertFalse(cloud.mutations())

    def test_full_setup_recovers_from_each_intermediate_failure_without_repeating_successful_writes(
        self,
    ):
        reference = FakeCloud()
        reference.apis.clear()
        s.setup(reference, "build", True)
        operations = reference.mutations()
        for operation in operations[
            :-1
        ]:  # The final bucket write is covered separately.
            with self.subTest(operation=operation):
                cloud = FakeCloud()
                cloud.apis.clear()
                original = cloud.run

                def interrupt(*args, **kwargs):
                    if args == operation:
                        cloud.calls.append(args)
                        raise c.Failure("Synthetic interrupted operation")
                    return original(*args, **kwargs)

                cloud.run = interrupt
                with self.assertRaisesRegex(c.Failure, "Partial progress"):
                    s.setup(cloud, "build", True)
                completed = [
                    tuple(x["command"])
                    for x in self.records[-1]["completed_operations"]
                ]
                cloud.calls.clear()
                cloud.run = original
                result = s.setup(cloud, "build", True)
                self.assertEqual(result["status"], "VERIFIED")
                self.assertFalse(set(completed) & set(cloud.mutations()))

    def test_missing_role_permissions_are_named_before_any_resume_write(self):
        cloud = self.partial()
        cloud.roles[s.SOURCE_ROLE]["includedPermissions"].remove(
            "storage.objects.create"
        )
        with self.assertRaisesRegex(
            c.Failure, "missing permissions: storage.objects.create"
        ):
            s.setup(cloud, "build", True, resume=True)
        self.assertFalse(cloud.mutations())

    def test_resume_refuses_every_missing_prerequisite_without_any_write(self):
        for missing in (
            "account",
            "source_role",
            "build_role",
            "pool",
            "provider",
            "api",
        ):
            with self.subTest(missing=missing):
                cloud = self.partial()
                if missing == "account":
                    del cloud.accounts[c.ci_account("build")]
                elif missing.endswith("role"):
                    del cloud.roles[
                        s.SOURCE_ROLE if missing == "source_role" else s.BUILD_ROLE
                    ]
                elif missing == "pool":
                    cloud.pool = None
                elif missing == "provider":
                    cloud.providers.clear()
                else:
                    cloud.apis.remove("iam.googleapis.com")
                with self.assertRaisesRegex(c.Failure, "Bindings-only resume refused"):
                    s.setup(cloud, "build", True, resume=True)
                self.assertFalse(cloud.mutations())
                self.assertEqual(self.records[-1]["status"], "RESUME_REFUSED")

    def test_disabled_deleted_wrong_case_or_changed_role_is_never_recreated(self):
        for change in (
            {"stage": "DISABLED"},
            {"stage": None},
            {"deleted": True},
            {"name": f"projects/{c.PROJECT}/roles/identifierqsourceuploader"},
            {"name": f"projects/other-project/roles/{s.SOURCE_ROLE}"},
            {"includedPermissions": ["storage.objects.delete"]},
            {"includedPermissions": None},
        ):
            with self.subTest(change=change):
                cloud = self.partial()
                cloud.roles[s.SOURCE_ROLE].update(change)
                with self.assertRaisesRegex(c.Failure, "differs"):
                    s.setup(cloud, "build", True, resume=True)
                self.assertFalse(cloud.mutations())

    def test_permission_or_metadata_failure_before_resume_is_not_absence(self):
        for exception in (
            c.PermissionDenied("Synthetic iam.roles.get denied"),
            c.Failure("Synthetic invalid metadata JSON"),
        ):
            cloud = self.partial()
            original = cloud.run

            def deny(*args, **kwargs):
                if args[:3] == ("iam", "roles", "describe"):
                    raise exception
                return original(*args, **kwargs)

            cloud.run = deny
            with self.assertRaises(c.Failure):
                s.setup(cloud, "build", True, resume=True)
            self.assertFalse(cloud.mutations())

    def test_empty_identity_metadata_is_not_treated_as_missing_and_recreated(self):
        for resource in ("account", "pool", "role"):
            cloud = self.partial()
            if resource == "account":
                cloud.accounts[c.ci_account("build")] = {}
            elif resource == "pool":
                cloud.pool = {}
            else:
                cloud.roles[s.SOURCE_ROLE] = {}
            with self.assertRaises(c.Failure):
                s.setup(cloud, "build", True, resume=True)
            self.assertFalse(cloud.mutations())

    def test_write_error_after_server_commit_is_verified_without_retry(self):
        cloud = self.partial()
        original = cloud.run

        def committed(*args, **kwargs):
            result = original(*args, **kwargs)
            if args[:3] == BUCKET_WRITE:
                raise c.BucketIamBindingError(
                    "Synthetic client failure after server commit"
                )
            return result

        cloud.run = committed
        result = s.setup(cloud, "build", True, resume=True)
        self.assertEqual(result["status"], "VERIFIED_AFTER_SDK_ERROR")
        self.assertTrue(result["all_bindings_verified"])
        self.assertEqual(len(cloud.mutations()), 1)
        self.assertEqual(result["completed_operations"], [])
        self.assertIsNotNone(result["failed_operation"])

    def test_denied_reinspection_preserves_progress_without_claiming_verified_state(
        self,
    ):
        cloud = self.partial()
        original = cloud.run
        failed = False

        def response(*args, **kwargs):
            nonlocal failed
            if args[:3] == BUCKET_WRITE:
                failed = True
                cloud.calls.append(args)
                raise c.BucketIamBindingError("Synthetic write failure")
            if failed and args[:3] == ("storage", "buckets", "describe"):
                raise c.PermissionDenied("Synthetic storage.buckets.get denied")
            return original(*args, **kwargs)

        cloud.run = response
        with self.assertRaisesRegex(c.Failure, "Partial progress"):
            s.setup(cloud, "build", True, resume=True)
        record = self.records[-1]
        self.assertEqual(record["inventory_phase"], "UNVERIFIED_AFTER_ERROR")
        self.assertIn("storage.buckets.get", record["reinspection_error"])
        self.assertFalse(record["resources_verified"])
        self.assertFalse(record["all_bindings_verified"])
        self.assertEqual(len(cloud.mutations()), 1)

    def test_successful_write_response_without_visible_binding_is_not_success(self):
        cloud = self.partial()
        original = cloud.run

        def not_visible(*args, **kwargs):
            if args[:3] == BUCKET_WRITE:
                cloud.calls.append(args)
                return {}  # Server response succeeded, but fresh reads do not confirm it.
            return original(*args, **kwargs)

        cloud.run = not_visible
        with self.assertRaisesRegex(c.Failure, "Post-apply metadata"):
            s.setup(cloud, "build", True, resume=True)
        self.assertEqual(self.records[-1]["status"], "APPLIED_UNVERIFIED")
        self.assertEqual(len(cloud.mutations()), 1)

    def test_resume_requires_explicit_setup_flag_before_any_cloud_read(self):
        cloud = FakeCloud()
        with self.assertRaisesRegex(c.Failure, "Resume changes IAM"):
            s.setup(cloud, "build", resume=True)
        self.assertEqual(cloud.calls, [])

    def test_read_only_plan_reports_roles_and_every_binding_without_writes(self):
        cloud = self.partial()
        result = s.setup(cloud, "build")
        self.assertEqual(result["bucket_project_number"], c.NUMBER)
        self.assertEqual(result["custom_role_metadata"][s.SOURCE_ROLE]["stage"], "GA")
        self.assertEqual(
            [b["present"] for b in result["bindings"]], [True, True, True, False]
        )
        self.assertTrue(result["resources_verified"])
        self.assertFalse(result["all_bindings_verified"])
        self.assertFalse(cloud.mutations())


class SdkDiagnostics(unittest.TestCase):
    @patch("common.subprocess.run")
    def test_bucket_error_names_only_reviewed_resources_and_permissions(self, run):
        for stderr, kind, permissions in (
            ("NOT_FOUND resource not found", "not_found_ambiguous", []),
            (
                "403 PERMISSION_DENIED storage.buckets.setIamPolicy resource not found",
                "permission_denied",
                ["storage.buckets.setIamPolicy"],
            ),
            ("UNAUTHENTICATED", "authentication_failed", []),
            (
                "role is not supported for this resource",
                "unsupported_role_or_scope",
                [],
            ),
            ("409 ABORTED", "policy_conflict", []),
            ("unrecognized failure", "sdk_or_api_failure", []),
        ):
            with self.subTest(kind=kind):
                run.return_value = subprocess.CompletedProcess(
                    [], 1, "", stderr + " secret-debug-marker"
                )
                role = f"projects/{c.PROJECT}/roles/{s.SOURCE_ROLE}"
                member = f"serviceAccount:{c.ci_account('build')}"
                with self.assertRaises(c.BucketIamBindingError) as error:
                    c.Cloud().run(
                        *BUCKET_WRITE,
                        f"gs://{c.BUCKET}",
                        f"--role={role}",
                        f"--member={member}",
                        "--condition=None",
                    )
                self.assertEqual(error.exception.details["kind"], kind)
                self.assertEqual(error.exception.details["role"], role)
                self.assertEqual(error.exception.details["member"], member)
                self.assertEqual(
                    error.exception.details["reported_permissions"], permissions
                )
                self.assertNotIn("secret-debug-marker", str(error.exception))
                self.assertIn(
                    "does not identify a missing bucket", str(error.exception)
                )

    @patch("common.subprocess.run")
    def test_explicit_role_not_found_identifies_exact_case_sensitive_resource(
        self, run
    ):
        run.return_value = subprocess.CompletedProcess(
            [], 1, "", "NOT_FOUND secret-debug-marker"
        )
        with self.assertRaises(c.Missing) as error:
            c.Cloud().run(
                "iam", "roles", "describe", s.SOURCE_ROLE, f"--project={c.PROJECT}"
            )
        self.assertIn(
            f"projects/{c.PROJECT}/roles/{s.SOURCE_ROLE}", str(error.exception)
        )
        self.assertIn("case-sensitive", str(error.exception))
        self.assertNotIn("secret-debug-marker", str(error.exception))

    @patch("manage.setup")
    @patch("manage.Cloud")
    @patch("manage.verify_configuration")
    def test_cli_routes_resume_only_to_setup_not_build_or_deploy(
        self, verify, cloud, setup
    ):
        with patch(
            "sys.argv", ["manage.py", "setup", "--resume", "--approve-wif-setup"]
        ):
            self.assertEqual(manage.main(), 0)
        setup.assert_called_once_with(cloud.return_value, "build", True, True)


if __name__ == "__main__":
    unittest.main()
