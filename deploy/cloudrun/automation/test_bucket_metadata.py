"""Offline raw/standardized metadata regressions; no authenticated cloud access."""

import json
import subprocess
import unittest
from unittest.mock import patch

import build as b
import common as c
import setup as s
from test_automation import COMMIT, FakeCloud, raw_bucket, standardized_bucket


class BucketMetadata(unittest.TestCase):
    def test_raw_api_owner_string_and_integer_are_verified(self):
        for owner in (c.NUMBER, int(c.NUMBER)):
            with self.subTest(owner=owner):
                obj = raw_bucket()
                obj["projectNumber"] = owner
                c.check_bucket(obj)

    def test_default_gcloud_display_is_missing_metadata_not_owner_mismatch(self):
        with self.assertRaisesRegex(
            c.BucketMetadataError, "projectNumber is missing"
        ) as error:
            c.check_bucket(standardized_bucket())
        self.assertNotIsInstance(error.exception, c.BucketOwnershipMismatch)
        self.assertIn("--raw", str(error.exception))

    def test_missing_null_and_alias_owner_fields_do_not_establish_ownership(self):
        for extra in (
            {},
            {"projectNumber": None},
            {"project_number": c.NUMBER},
            {"project": c.PROJECT},
            {"projectId": c.PROJECT},
        ):
            with self.subTest(extra=extra):
                obj = raw_bucket()
                del obj["projectNumber"]
                obj.update(extra)
                with self.assertRaisesRegex(
                    c.BucketMetadataError, "projectNumber is missing"
                ):
                    c.check_bucket(obj)

    def test_real_mismatch_names_both_verified_numbers_and_expected_project(self):
        for owner in ("999999999999", 999999999999):
            obj = raw_bucket()
            obj["projectNumber"] = owner
            with self.assertRaises(c.BucketOwnershipMismatch) as error:
                c.check_bucket(obj)
            for expected in (str(owner), c.NUMBER, c.PROJECT, f"gs://{c.BUCKET}"):
                self.assertIn(expected, str(error.exception))

    def test_invalid_owner_types_are_unverifiable_not_foreign_ownership(self):
        for owner in (
            True,
            False,
            0,
            -1,
            float(c.NUMBER),
            [],
            {},
            "",
            "feint-identifierq",
            " 334840153796",
            "334840153796 ",
            "0334840153796",
            "3.34840153796e11",
            2**64,
        ):
            with self.subTest(owner=owner):
                obj = raw_bucket()
                obj["projectNumber"] = owner
                with self.assertRaisesRegex(c.BucketMetadataError, "invalid uint64"):
                    c.check_bucket(obj)

    def test_invalid_response_or_bucket_name_cannot_pass(self):
        for obj in (
            None,
            [],
            "",
            {},
            {**raw_bucket(), "name": None},
            {**raw_bucket(), "name": "some-other-bucket"},
        ):
            with self.subTest(obj=obj), self.assertRaises(c.BucketMetadataError):
                c.check_bucket(obj)

    def test_owner_verification_does_not_skip_raw_security_metadata(self):
        for iam in (
            None,
            {},
            {"uniformBucketLevelAccess": None},
            {"uniformBucketLevelAccess": {}},
            {"publicAccessPrevention": "enforced", "uniformBucketLevelAccess": {}},
        ):
            with self.subTest(iam=iam), self.assertRaises(c.BucketMetadataError):
                c.check_bucket({**raw_bucket(), "iamConfiguration": iam})
        hybrid = {**standardized_bucket(), "projectNumber": c.NUMBER}
        with self.assertRaises(c.BucketMetadataError):
            c.check_bucket(hybrid)

    @patch("common.subprocess.run")
    def test_helper_requests_raw_api_keys_and_json_decoding_together(self, run):
        # --raw is a gcloud argument, NOT Cloud.run(raw=True)'s unparsed-stdout mode.
        run.return_value = subprocess.CompletedProcess(
            [], 0, json.dumps(raw_bucket()), ""
        )
        self.assertEqual(c.verify_source_bucket(c.Cloud()), raw_bucket())
        self.assertEqual(
            run.call_args.args[0],
            [
                "gcloud",
                "storage",
                "buckets",
                "describe",
                f"gs://{c.BUCKET}",
                "--raw",
                "--quiet",
                "--format=json",
            ],
        )
        run.assert_called_once()

    @patch("common.subprocess.run")
    def test_permission_denied_stays_unverified_even_when_error_mentions_not_found(
        self, run
    ):
        run.return_value = subprocess.CompletedProcess(
            [],
            1,
            "",
            "PERMISSION_DENIED: 403 storage.buckets.get denied (resource not found) debug-secret-marker",
        )
        with self.assertRaises(c.PermissionDenied) as error:
            c.verify_source_bucket(c.Cloud())
        message = str(error.exception)
        self.assertIn("storage.buckets.get", message)
        self.assertIn("ownership remains unverified", message)
        self.assertNotIn("debug-secret-marker", message)
        self.assertNotIn("ownership mismatch", message)
        run.assert_called_once()

    @patch("common.subprocess.run")
    def test_not_found_does_not_trigger_recreation_or_an_owner_guess(self, run):
        run.return_value = subprocess.CompletedProcess([], 1, "", "NOT_FOUND: 404")
        with self.assertRaises(c.Missing):
            c.verify_source_bucket(c.Cloud())
        run.assert_called_once()

    @patch("common.subprocess.run")
    def test_malformed_json_is_not_reported_as_owner_mismatch(self, run):
        run.return_value = subprocess.CompletedProcess([], 0, "not valid JSON", "")
        with self.assertRaisesRegex(c.Failure, "invalid metadata JSON") as error:
            c.verify_source_bucket(c.Cloud())
        self.assertNotIsInstance(error.exception, c.BucketOwnershipMismatch)
        run.assert_called_once()

    @patch("setup.write_result")
    def test_setup_fetches_raw_metadata_without_writing_cloud_state(self, result):
        cloud = FakeCloud()
        s.setup(cloud, "build")
        call = next(
            x for x in cloud.calls if x[:3] == ("storage", "buckets", "describe")
        )
        self.assertIn("--raw", call)
        self.assertFalse(cloud.mutations())

    def test_setup_apply_stops_on_missing_mismatch_or_denied_metadata_before_mutation(
        self,
    ):
        for failure in ("missing", "mismatch", "denied"):
            with self.subTest(failure=failure):
                cloud = FakeCloud()
                if failure == "missing":
                    cloud.bucket_metadata = standardized_bucket()
                    expected = c.BucketMetadataError
                elif failure == "mismatch":
                    cloud.bucket_metadata["projectNumber"] = "999999999999"
                    expected = c.BucketOwnershipMismatch
                else:
                    cloud.bucket_error = c.PermissionDenied(
                        "Metadata permission denied; ownership unverified"
                    )
                    expected = c.PermissionDenied
                with self.assertRaises(expected):
                    s.setup(cloud, "build", True)
                self.assertFalse(cloud.mutations())

    @patch("build.guard", return_value=COMMIT)
    def test_build_path_stops_on_missing_mismatch_or_denied_metadata_before_submission(
        self, guard
    ):
        # Approved is a synthetic test flag; FakeCloud never invokes gcloud or builds anything.
        for failure in ("missing", "mismatch", "denied"):
            with self.subTest(failure=failure):
                cloud = FakeCloud()
                if failure == "missing":
                    cloud.bucket_metadata = standardized_bucket()
                    expected = c.BucketMetadataError
                elif failure == "mismatch":
                    cloud.bucket_metadata["projectNumber"] = "999999999999"
                    expected = c.BucketOwnershipMismatch
                else:
                    cloud.bucket_error = c.PermissionDenied(
                        "Metadata permission denied; ownership unverified"
                    )
                    expected = c.PermissionDenied
                with self.assertRaises(expected):
                    b.build(cloud, ci=True, approved=True)
                self.assertFalse(cloud.mutations())


if __name__ == "__main__":
    unittest.main()
