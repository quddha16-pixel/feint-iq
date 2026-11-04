#!/usr/bin/env bash
# Pinned release and checksum. Runs locally/on standard Linux x64 Actions runners.
set -euo pipefail
if [[ "$(uname -sm)" != 'Linux x86_64' ]]; then
  echo 'This actionlint installer supports Linux x86_64 only.' >&2
  exit 1
fi
iq_lint_dir="$(mktemp -d)"
trap 'rm -rf "$iq_lint_dir"' EXIT
iq_lint_archive="$iq_lint_dir/actionlint.tar.gz"
curl --fail --silent --show-error --location --max-time 60 \
  https://github.com/rhysd/actionlint/releases/download/v1.7.7/actionlint_1.7.7_linux_amd64.tar.gz \
  --output "$iq_lint_archive"
printf '%s  %s\n' 023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757 "$iq_lint_archive" \
  | sha256sum --check --status
tar --extract --gzip --file "$iq_lint_archive" --directory "$iq_lint_dir" actionlint
"$iq_lint_dir/actionlint" "$@"
