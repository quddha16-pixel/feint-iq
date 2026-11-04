#!/usr/bin/env python3
"""Cloud Shell / Actions entry point. Defaults never provision or deploy anything."""

import argparse
import json
import os
import sys

from build import build
from common import (
    PROJECT,
    REGION,
    SERVICE,
    Cloud,
    Failure,
    guard,
    project_check,
    verify_configuration,
    verify_source_bucket,
)
from setup import setup

from deploy import deploy


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    check = sub.add_parser("guard")
    check.add_argument("--purpose", choices=("build", "deploy"), required=True)
    check.add_argument("--ci", action="store_true")
    sub.add_parser(
        "verify-bucket",
        help="Read-only project/owner/access verification; no IAM, build or deployment actions",
    )
    settings = sub.add_parser(
        "setup", help="Read-only WIF/IAM plan unless --approve-wif-setup is supplied"
    )
    settings.add_argument("--purpose", choices=("build", "deploy"), default="build")
    settings.add_argument("--approve-wif-setup", action="store_true")
    compile_image = sub.add_parser("build")
    compile_image.add_argument("--approve-trial-build", action="store_true")
    compile_image.add_argument("--ci", action="store_true")
    release = sub.add_parser(
        "deploy", help="Locked until explicit deployment authorization"
    )
    release.add_argument("--ci", action="store_true")
    release.add_argument("--approve-deployment", action="store_true")
    release.add_argument(
        "--operation", choices=("deploy", "rollback"), default="deploy"
    )
    release.add_argument("--build-id", required=True)
    release.add_argument("--digest", required=True)
    release.add_argument("--gemini-version", required=True)
    release.add_argument("--pilot-version", required=True)
    first = sub.add_parser(
        "first-deploy",
        help="Owner-only initial deployment; no project-wide Run role is granted to CI",
    )
    first.add_argument("--approve-deployment", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "guard":
            commit = guard(args.purpose, args.ci)
            print(
                f"Approved source/configuration verified: {commit}. No cloud command executed."
            )
        elif args.command == "verify-bucket":
            cloud = Cloud()
            project_check(cloud)
            bucket = verify_source_bucket(cloud)
            print(
                json.dumps(
                    {
                        "bucket": bucket["name"],
                        "project_id": PROJECT,
                        "project_number": str(bucket["projectNumber"]),
                        "ownership_verified": True,
                        "access_settings_verified": True,
                        "read_only": True,
                    },
                    indent=2,
                )
            )
        elif args.command == "first-deploy":
            if not args.approve_deployment:
                raise Failure(
                    "Initial deployment is not authorized. Explicit later approval and --approve-deployment are required."
                )
            guard("deploy", False)
            if (
                input("After explicit deployment authorization, type DEPLOY: ")
                != "DEPLOY"
            ):
                raise Failure("No deployment authorization entered.")
            if (
                input(
                    "Confirm unupgraded Free Trial with valid credit/days and Gemini Free Tier; type TRIAL: "
                )
                != "TRIAL"
            ):
                raise Failure("Financial prerequisites not confirmed.")
            build_id = input("Successful Cloud Build UUID (not a secret): ").strip()
            digest = input("Approved sha256 digest (include sha256:): ").strip()
            gemini_version = input(
                "Enabled Gemini secret VERSION NUMBER only: "
            ).strip()
            pilot_version = input("Enabled pilot secret VERSION NUMBER only: ").strip()
            cloud = Cloud()
            if cloud.run(
                "run",
                "services",
                "describe",
                SERVICE,
                f"--project={PROJECT}",
                f"--region={REGION}",
                optional=True,
            ):
                raise Failure(
                    "The service already exists. Use the reviewed deployment/rollback workflow instead."
                )
            os.environ["IDENTIFIERQ_DEPLOY_ENABLED"] = "true"
            deploy(
                cloud, build_id, digest, gemini_version, pilot_version, approved=True
            )
        elif args.command == "setup":
            verify_configuration()
            setup(Cloud(), args.purpose, args.approve_wif_setup)
        elif args.command == "build":
            build(Cloud(), args.ci, args.approve_trial_build)
        elif args.command == "deploy":
            deploy(
                Cloud(),
                args.build_id,
                args.digest,
                args.gemini_version,
                args.pilot_version,
                args.ci,
                args.approve_deployment,
                args.operation,
            )
        return 0
    except (Failure, ValueError) as err:
        print(f"STOPPED: {err}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print(
            "Interrupted. Check the recorded Cloud Build/service state before retrying.",
            file=sys.stderr,
        )
        return 130
    except Exception:
        print(
            "STOPPED: unexpected tooling/network response. Inspect cloud state before retrying. No automatic rollback, billing change or credential dump was attempted.",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
