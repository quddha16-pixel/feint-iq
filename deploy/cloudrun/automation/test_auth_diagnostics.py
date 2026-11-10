"""Offline CI diagnostics with synthetic credentials/SDK errors; no cloud access."""

import copy
import io
import json
import os
import subprocess
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

import auth_diagnostics as a
import common as c
import manage

MARKER = "private-token-and-debug-marker"


def credential():
    return {
        "type": "external_account",
        "audience": f"//iam.googleapis.com/{c.provider('build')}",
        "subject_token_type": "urn:ietf:params:oauth:token-type:jwt",
        "token_url": "https://sts.googleapis.com/v1/token",
        "service_account_impersonation_url": (
            "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/"
            + c.ci_account("build")
            + ":generateAccessToken"
        ),
        "credential_source": {"headers": {"Authorization": "Bearer " + MARKER}},
    }


class CredentialSelection(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / "synthetic.json"
        self.path.write_text(json.dumps(credential()))
        env = patch.dict(
            os.environ,
            dict.fromkeys(
                (
                    "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
                    "GOOGLE_APPLICATION_CREDENTIALS",
                    "GOOGLE_GHA_CREDS_PATH",
                ),
                str(self.path),
            ),
            clear=True,
        )
        env.start()
        self.addCleanup(env.stop)

    def test_expected_file_selects_exact_build_provider_and_impersonation_target(self):
        result = a.credential_configuration()
        self.assertTrue(result["expected_external_account_verified"])
        self.assertNotIn(MARKER, json.dumps(result))
        self.assertNotIn(str(self.path), json.dumps(result))

    def test_adc_alone_does_not_select_gcloud_credentials(self):
        del os.environ["CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE"]
        self.assertFalse(
            a.credential_configuration()["expected_external_account_verified"]
        )

    def test_different_exported_paths_fail_closed(self):
        other = self.path.with_name("other.json")
        other.write_text(json.dumps(credential()))
        os.environ["GOOGLE_GHA_CREDS_PATH"] = str(other)
        self.assertFalse(
            a.credential_configuration()["expected_external_account_verified"]
        )

    def test_conflicting_identity_overrides_report_names_only(self):
        for name in (
            "CLOUDSDK_AUTH_ACCESS_TOKEN",
            "CLOUDSDK_AUTH_ACCESS_TOKEN_FILE",
            "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT",
            "CLOUDSDK_AUTH_DISABLE_CREDENTIALS",
        ):
            with self.subTest(name=name), patch.dict(os.environ, {name: MARKER}):
                result = a.credential_configuration()
                self.assertFalse(result["expected_external_account_verified"])
                self.assertEqual(result["conflicting_overrides"], [name])
                self.assertNotIn(MARKER, json.dumps(result))

    def test_wrong_metadata_and_malformed_files_do_not_leak_or_verify(self):
        for field in credential():
            if field == "credential_source":
                continue
            obj = credential()
            obj[field] = MARKER
            with self.subTest(field=field):
                self.path.write_text(json.dumps(obj))
                result = a.credential_configuration()
                self.assertFalse(result["expected_external_account_verified"])
                self.assertNotIn(MARKER, json.dumps(result))
        for text in (MARKER, "[]", "null"):
            self.path.write_text(text)
            self.assertFalse(
                a.credential_configuration()["expected_external_account_verified"]
            )
        self.path.unlink()
        self.assertFalse(
            a.credential_configuration()["expected_external_account_verified"]
        )


class SafeSdkIndicators(unittest.TestCase):
    def test_refresh_error_takes_precedence_over_embedded_permission_denied(self):
        result = c.cloud_error_details(
            "PERMISSION_DENIED 403 refreshing credentials: Unable to acquire "
            "impersonated credentials: iam.serviceAccounts.getAccessToken " + MARKER
        )
        self.assertEqual(result["reported_phase"], "service_account_impersonation")
        self.assertEqual(result["kind"], "authentication_or_refresh_failed")
        self.assertEqual(
            result["reported_permissions"], ["iam.serviceAccounts.getAccessToken"]
        )
        self.assertNotIn(MARKER, json.dumps(result))

    def test_phase_signatures_and_unknown_errors_are_not_overclaimed(self):
        for text, phase in (
            (
                "unauthorized_client: rejected by the attribute condition",
                "sts_exchange",
            ),
            ("POST https://sts.googleapis.com/v1/token failed", "sts_exchange"),
            ("Unable to retrieve the subject token", "github_oidc_retrieval"),
            (
                "iamcredentials.googleapis.com unavailable",
                "service_account_impersonation",
            ),
            ("invalid_grant 403", "unresolved"),
            ("unfamiliar response " + MARKER, "unresolved"),
        ):
            with self.subTest(text=text):
                result = c.cloud_error_details(text)
                self.assertEqual(result["reported_phase"], phase)
                self.assertNotIn(MARKER, json.dumps(result))

    def test_only_allowlisted_reasons_and_permissions_survive(self):
        result = c.cloud_error_details(
            "PERMISSION_DENIED SERVICE_DISABLED SECURITY_POLICY_VIOLATED "
            "resourcemanager.projects.get iam.roles.update " + MARKER
        )
        self.assertEqual(
            result["reported_reasons"], ["SERVICE_DISABLED", "SECURITY_POLICY_VIOLATED"]
        )
        self.assertEqual(
            result["reported_permissions"], ["resourcemanager.projects.get"]
        )
        self.assertNotIn(MARKER, json.dumps(result))
        self.assertFalse(
            c.cloud_error_details("NOT_SERVICE_DISABLED_EXTRA")["reported_reasons"]
        )

    @patch("common.subprocess.run")
    def test_original_project_failure_preserves_safe_refresh_phase(self, run):
        run.return_value = subprocess.CompletedProcess(
            [], 1, MARKER, "403 iam.serviceAccounts.getAccessToken " + MARKER
        )
        with self.assertRaises(c.Failure) as context:
            c.Cloud().run("projects", "describe", c.PROJECT)
        self.assertNotIsInstance(context.exception, c.PermissionDenied)
        self.assertIn("service_account_impersonation", str(context.exception))
        self.assertNotIn(MARKER, str(context.exception))

    @patch("common.subprocess.run")
    def test_actual_project_denial_keeps_permission_exception(self, run):
        run.return_value = subprocess.CompletedProcess(
            [], 1, MARKER, "PERMISSION_DENIED resourcemanager.projects.get " + MARKER
        )
        with self.assertRaises(c.PermissionDenied) as context:
            c.Cloud().run("projects", "describe", c.PROJECT)
        self.assertIn("resourcemanager.projects.get", str(context.exception))
        self.assertNotIn(MARKER, str(context.exception))


class DiagnosticExecution(unittest.TestCase):
    def setUp(self):
        self.output = io.StringIO()
        output = redirect_stdout(self.output)
        output.__enter__()
        self.addCleanup(output.__exit__, None, None, None)
        self.records = []
        for target, kwargs in (
            ("auth_diagnostics.guard", {}),
            (
                "auth_diagnostics.credential_configuration",
                {"return_value": {"expected_external_account_verified": True}},
            ),
            (
                "auth_diagnostics.write_result",
                {
                    "side_effect": lambda kind, data: self.records.append(
                        copy.deepcopy(data)
                    )
                },
            ),
            ("auth_diagnostics.subprocess.run", {}),
        ):
            mock = patch(target, **kwargs)
            setattr(self, target.rsplit(".", 1)[-1], mock.start())
            self.addCleanup(mock.stop)
        self.run.side_effect = [
            subprocess.CompletedProcess([], 0, MARKER, MARKER),
            subprocess.CompletedProcess(
                [],
                0,
                json.dumps({"projectId": c.PROJECT, "projectNumber": c.NUMBER}),
                MARKER,
            ),
        ]

    def assert_private(self):
        self.assertNotIn(MARKER, self.output.getvalue())
        self.assertNotIn(MARKER, json.dumps(self.records))

    def test_success_checks_gcloud_then_exact_project_without_token_output(self):
        report = a.diagnose_auth()
        self.guard.assert_called_once_with("build", ci=True)
        self.assertEqual(report["status"], "VERIFIED")
        self.assertEqual(self.run.call_count, 2)
        commands = [x.args[0] for x in self.run.call_args_list]
        self.assertEqual(commands[0][:3], ["gcloud", "auth", "print-access-token"])
        self.assertEqual(commands[1][:4], ["gcloud", "projects", "describe", c.PROJECT])
        for call in self.run.call_args_list:
            self.assertTrue(call.kwargs["capture_output"])
            self.assertEqual(call.kwargs["timeout"], 90)
            self.assertEqual(call.kwargs["env"]["CLOUDSDK_CORE_LOG_HTTP"], "false")
            self.assertEqual(
                call.kwargs["env"]["CLOUDSDK_CORE_DISABLE_FILE_LOGGING"], "true"
            )
            self.assertIn("--no-log-http", call.args[0])
        self.assert_private()

    def test_failed_guard_or_configuration_cannot_reach_token_or_project_probe(self):
        self.guard.side_effect = c.Failure("guard stopped")
        with self.assertRaises(c.Failure):
            a.diagnose_auth()
        self.run.assert_not_called()
        self.credential_configuration.assert_not_called()
        self.guard.side_effect = None
        self.credential_configuration.return_value = {
            "expected_external_account_verified": False
        }
        with self.assertRaises(c.Failure):
            a.diagnose_auth()
        self.run.assert_not_called()
        self.assertEqual(self.records[-1]["failed_phase"], "credential_configuration")

    def test_each_refresh_failure_stops_before_project_request(self):
        for stderr, expected in (
            ("unauthorized_client 403 " + MARKER, "sts_exchange"),
            ("Unable to retrieve the subject token " + MARKER, "github_oidc_retrieval"),
            (
                "403 iam.serviceAccounts.getAccessToken " + MARKER,
                "service_account_impersonation",
            ),
            ("PERMISSION_DENIED " + MARKER, "token_refresh_unresolved"),
        ):
            with self.subTest(stderr=stderr):
                self.run.reset_mock()
                self.run.side_effect = [
                    subprocess.CompletedProcess([], 1, MARKER, stderr)
                ]
                with self.assertRaises(c.Failure):
                    a.diagnose_auth()
                self.assertEqual(self.run.call_count, 1)
                self.assertEqual(self.records[-1]["failed_phase"], expected)
                self.assertEqual(
                    self.records[-1]["project_lookup"]["status"], "not_run"
                )
                self.assert_private()

    def test_project_denial_or_later_refresh_is_distinguished(self):
        for stderr, expected in (
            (
                "PERMISSION_DENIED resourcemanager.projects.get " + MARKER,
                "project_lookup",
            ),
            ("SERVICE_DISABLED " + MARKER, "project_lookup"),
            (
                "Error refreshing credentials invalid_grant " + MARKER,
                "token_refresh_unresolved",
            ),
            (
                "403 iam.serviceAccounts.getAccessToken " + MARKER,
                "service_account_impersonation",
            ),
        ):
            with self.subTest(stderr=stderr):
                self.run.side_effect = [
                    subprocess.CompletedProcess([], 0, MARKER, ""),
                    subprocess.CompletedProcess([], 1, MARKER, stderr),
                ]
                with self.assertRaises(c.Failure):
                    a.diagnose_auth()
                self.assertEqual(self.records[-1]["token_refresh"]["status"], "passed")
                self.assertEqual(self.records[-1]["failed_phase"], expected)
                self.assert_private()

    def test_empty_token_invalid_project_or_wrong_project_cannot_verify(self):
        for token, metadata in (
            ("", "{}"),
            (MARKER, MARKER),
            (MARKER, "[]"),
            (MARKER, json.dumps({"projectId": c.PROJECT, "projectNumber": "1"})),
            (MARKER, json.dumps({"projectId": "other", "projectNumber": c.NUMBER})),
        ):
            with self.subTest(metadata=metadata):
                self.run.side_effect = [
                    subprocess.CompletedProcess([], 0, token, ""),
                    subprocess.CompletedProcess([], 0, metadata, ""),
                ]
                with self.assertRaises(c.Failure):
                    a.diagnose_auth()
                self.assertEqual(self.records[-1]["status"], "FAILED")
                self.assert_private()

    def test_missing_sdk_timeout_and_execution_errors_are_safe(self):
        for error, kind in (
            (FileNotFoundError(MARKER), "gcloud_unavailable"),
            (
                subprocess.TimeoutExpired("gcloud", 90, output=MARKER, stderr=MARKER),
                "probe_timed_out",
            ),
            (OSError(MARKER), "sdk_execution_failed"),
        ):
            with self.subTest(kind=kind):
                self.run.side_effect = error
                with self.assertRaises(c.Failure):
                    a.diagnose_auth()
                self.assertEqual(self.records[-1]["token_refresh"]["kind"], kind)
                self.assert_private()

    @patch("manage.diagnose_auth", side_effect=c.Failure("diagnostic failed"))
    def test_cli_failure_is_nonzero_and_ci_flag_is_required(self, diagnose):
        with (
            patch("sys.argv", ["manage.py", "diagnose-auth", "--ci"]),
            redirect_stderr(io.StringIO()),
        ):
            self.assertEqual(manage.main(), 1)
        diagnose.assert_called_once_with()
        with (
            patch("sys.argv", ["manage.py", "diagnose-auth"]),
            redirect_stderr(io.StringIO()),
            self.assertRaises(SystemExit) as context,
        ):
            manage.main()
        self.assertEqual(context.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
