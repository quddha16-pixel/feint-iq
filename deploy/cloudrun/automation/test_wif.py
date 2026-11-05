"""Immutable OIDC subject migration: synthetic metadata, no tokens or cloud access."""

import copy
import io
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

import common as c
import manage
import setup
import wif


class WifCloud:
    def __init__(self, condition=None):
        self.calls = []
        self.pool = {
            "name": f"projects/{c.NUMBER}/locations/global/workloadIdentityPools/{c.POOL}",
            "state": "ACTIVE",
        }
        self.obj = {
            "name": c.provider("build"),
            "state": "ACTIVE",
            "attributeMapping": c.mapping("build"),
            "attributeCondition": condition or wif.legacy_build_condition(),
            "oidc": {"issuerUri": "https://token.actions.githubusercontent.com"},
            "description": "Existing metadata must survive",
        }
        self.error = None
        self.error_after_commit = False
        self.hide_update = False

    def run(self, *args):
        self.calls.append(args)
        if args[:2] == ("projects", "describe"):
            return {"projectId": c.PROJECT, "projectNumber": c.NUMBER}
        if args[:3] == ("iam", "workload-identity-pools", "describe"):
            return copy.deepcopy(self.pool)
        if args[:4] == ("iam", "workload-identity-pools", "providers", "describe"):
            return copy.deepcopy(self.obj)
        if args[:4] == ("iam", "workload-identity-pools", "providers", "update-oidc"):
            if self.error and not self.error_after_commit:
                raise self.error
            if not self.hide_update:
                self.obj["attributeCondition"] = next(
                    x.split("=", 1)[1]
                    for x in args
                    if x.startswith("--attribute-condition=")
                )
            if self.error:
                raise self.error
            return copy.deepcopy(self.obj)
        raise AssertionError(f"Unexpected command: {args[:4]}")

    def writes(self):
        return [x for x in self.calls if "update-oidc" in x]


class ImmutableSubject(unittest.TestCase):
    def test_all_existing_constraints_remain_and_only_the_subject_changes(self):
        legacy = wif.legacy_build_condition().split(" && ")
        corrected = c.trust("build").split(" && ")
        self.assertEqual(len(corrected), 7)
        self.assertEqual(legacy[:-1], corrected[:-1])
        self.assertNotEqual(legacy[-1], corrected[-1])
        self.assertEqual(
            c.expected_oidc_claims("build")["sub"],
            "repo:quddha16-pixel@297506389/feint-iq@1443546506:environment:identifierq-build",
        )
        self.assertNotIn(" || ", c.trust("build"))
        self.assertEqual(
            c.mapping("build"),
            {"google.subject": "assertion.sub", "attribute.pipeline": "'build'"},
        )
        self.assertTrue(c.principal("build").endswith("/attribute.pipeline/build"))

    def test_deploy_subject_stays_separate_and_legacy_is_not_valid_authentication(self):
        self.assertTrue(
            c.expected_oidc_claims("deploy")["sub"].endswith(
                ":environment:identifierq-deploy"
            )
        )
        obj = WifCloud().obj
        with self.assertRaises(c.Failure):
            setup.check_provider(obj, "build")
        obj["attributeCondition"] = c.trust("build")
        setup.check_provider(obj, "build")
        for purpose in ("", "other"):
            with self.assertRaises(c.Failure):
                c.trust(purpose)


class Recovery(unittest.TestCase):
    def setUp(self):
        self.records = []
        record = patch(
            "wif.write_result",
            side_effect=lambda kind, data: self.records.append(copy.deepcopy(data)),
        )
        record.start()
        self.addCleanup(record.stop)
        self.output = io.StringIO()
        redirect = redirect_stdout(self.output)
        redirect.__enter__()
        self.addCleanup(redirect.__exit__, None, None, None)

    def test_verify_reads_only_and_reports_a_sub_only_mismatch_without_a_token(self):
        cloud = WifCloud()
        cloud.obj["unrelated_debug_field"] = "credential-marker-must-never-print"
        result = wif.verify_build_trust(cloud)
        self.assertEqual(result["condition_status"], "LEGACY_SUBJECT_ONLY")
        self.assertTrue(result["read_only"])
        self.assertTrue(result["update_required"])
        self.assertEqual(result["only_difference"]["claim"], "sub")
        self.assertIn("no live JWT", result["claim_evidence"])
        self.assertEqual(len(cloud.calls), 3)
        self.assertFalse(cloud.writes())
        self.assertNotIn("credential-marker", self.output.getvalue())

    def test_repair_needs_explicit_flag_before_any_cloud_call(self):
        cloud = WifCloud()
        with self.assertRaisesRegex(c.Failure, "approve-subject-update"):
            wif.repair_build_trust(cloud)
        self.assertFalse(cloud.calls)

    def test_update_changes_one_field_on_one_named_provider_and_is_idempotent(self):
        cloud = WifCloud()
        before = copy.deepcopy(cloud.obj)
        result = wif.repair_build_trust(cloud, approved=True)
        self.assertEqual(result["condition_status"], "CURRENT")
        before["attributeCondition"] = c.trust("build")
        self.assertEqual(cloud.obj, before)
        self.assertEqual(len(cloud.writes()), 1)
        self.assertEqual(
            cloud.writes()[0],
            (
                "iam",
                "workload-identity-pools",
                "providers",
                "update-oidc",
                "github-build",
                f"--project={c.PROJECT}",
                "--location=global",
                f"--workload-identity-pool={c.POOL}",
                "--attribute-condition=" + c.trust("build"),
            ),
        )
        wif.repair_build_trust(cloud, approved=True)
        self.assertEqual(len(cloud.writes()), 1)
        self.assertEqual(self.records[-1]["status"], "VERIFIED")

    def test_changed_claim_constraints_are_not_overwritten(self):
        claims = c.expected_oidc_claims("build")
        for key, value in claims.items():
            with self.subTest(claim=key):
                old = f"assertion.{key} == '{value}'"
                cloud = WifCloud(
                    c.trust("build").replace(old, f"assertion.{key} == 'other'")
                )
                with self.assertRaisesRegex(c.Failure, "unrecognized"):
                    wif.repair_build_trust(cloud, approved=True)
                self.assertFalse(cloud.writes())
        cloud = WifCloud(
            wif.legacy_build_condition() + " && assertion.ref_protected == 'true'"
        )
        with self.assertRaisesRegex(c.Failure, "unrecognized"):
            wif.repair_build_trust(cloud, approved=True)
        self.assertFalse(cloud.writes())

    def test_project_identity_mismatch_stops_before_pool_reads_or_update(self):
        cloud = WifCloud()
        original = cloud.run

        def wrong_project(*args):
            if args[:2] == ("projects", "describe"):
                cloud.calls.append(args)
                return {"projectId": c.PROJECT, "projectNumber": "999999999999"}
            return original(*args)

        cloud.run = wrong_project
        with self.assertRaises(c.Failure):
            wif.repair_build_trust(cloud, approved=True)
        self.assertEqual(len(cloud.calls), 1)
        self.assertFalse(cloud.writes())

    def test_wrong_identity_state_issuer_audience_or_mapping_cannot_be_repaired(self):
        for change in (
            {"name": c.provider("deploy")},
            {"disabled": True},
            {"state": "DELETED"},
            {
                "attributeMapping": {
                    "google.subject": "assertion.sub",
                    "attribute.pipeline": "'deploy'",
                }
            },
            {"oidc": {"issuerUri": "https://untrusted.invalid"}},
            {"oidc": None},
            {
                "oidc": {
                    "issuerUri": "https://token.actions.githubusercontent.com",
                    "allowedAudiences": ["other"],
                }
            },
            {
                "oidc": {
                    "issuerUri": "https://token.actions.githubusercontent.com",
                    "jwksJson": "unreviewed",
                }
            },
        ):
            cloud = WifCloud()
            cloud.obj.update(change)
            with self.subTest(change=change), self.assertRaises(c.Failure):
                wif.repair_build_trust(cloud, approved=True)
            self.assertFalse(cloud.writes())
        for change in (
            {"name": "projects/other/locations/global/workloadIdentityPools/other"},
            {"disabled": True},
            {"state": "DELETED"},
        ):
            cloud = WifCloud()
            cloud.pool.update(change)
            with self.subTest(pool=change), self.assertRaises(c.Failure):
                wif.repair_build_trust(cloud, approved=True)
            self.assertFalse(cloud.writes())

    def test_permission_error_or_missing_metadata_is_not_a_reason_to_create_resources(
        self,
    ):
        for error in (
            c.PermissionDenied(
                "Synthetic iam.workloadIdentityPoolProviders.get denied"
            ),
            c.Missing("Synthetic provider missing"),
        ):
            cloud = WifCloud()
            original = cloud.run

            def denied(*args):
                if args[:4] == (
                    "iam",
                    "workload-identity-pools",
                    "providers",
                    "describe",
                ):
                    raise error
                return original(*args)

            cloud.run = denied
            with self.assertRaises(c.Failure):
                wif.repair_build_trust(cloud, approved=True)
            self.assertFalse(cloud.writes())

    def test_ambiguous_write_is_not_replayed_and_fresh_verification_can_see_commit(
        self,
    ):
        for committed in (False, True):
            cloud = WifCloud()
            cloud.error = c.Failure("Synthetic network failure")
            cloud.error_after_commit = committed
            with self.assertRaisesRegex(c.Failure, "outcome is unverified"):
                wif.repair_build_trust(cloud, approved=True)
            self.assertEqual(len(cloud.writes()), 1)
            self.assertEqual(self.records[-1]["status"], "UPDATE_UNVERIFIED")
            result = wif.verify_build_trust(cloud)
            self.assertEqual(
                result["condition_status"],
                "CURRENT" if committed else "LEGACY_SUBJECT_ONLY",
            )
            self.assertEqual(len(cloud.writes()), 1)

    def test_successful_response_requires_fresh_readback(self):
        cloud = WifCloud()
        cloud.hide_update = True
        with self.assertRaisesRegex(c.Failure, "not yet verified"):
            wif.repair_build_trust(cloud, approved=True)
        self.assertEqual(self.records[-1]["status"], "UPDATE_UNVERIFIED")
        self.assertEqual(len(cloud.writes()), 1)

    def test_unknown_condition_diagnostic_fails_without_echoing_unrecognized_content(
        self,
    ):
        cloud = WifCloud("unrecognized-sensitive-marker")
        with self.assertRaisesRegex(c.Failure, "unrecognized"):
            wif.verify_build_trust(cloud)
        self.assertNotIn("unrecognized-sensitive-marker", self.output.getvalue())
        self.assertIsNone(self.records[-1]["update_required"])


class Commands(unittest.TestCase):
    @patch("manage.Cloud")
    @patch("manage.verify_build_trust")
    @patch("manage.repair_build_trust")
    def test_cli_only_routes_to_selected_inspection_or_narrow_update(
        self, repair, verify, cloud
    ):
        with patch("sys.argv", ["manage.py", "verify-wif"]):
            self.assertEqual(manage.main(), 0)
        verify.assert_called_once_with(cloud.return_value)
        repair.assert_not_called()
        with patch("sys.argv", ["manage.py", "repair-wif", "--approve-subject-update"]):
            self.assertEqual(manage.main(), 0)
        repair.assert_called_once_with(cloud.return_value, True)


if __name__ == "__main__":
    unittest.main()
