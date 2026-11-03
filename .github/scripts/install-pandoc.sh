#!/usr/bin/env bash
# Installs the official pandoc build for the robot and for CI.
#
# Ubuntu's own package (pandoc 3.1.3) keeps its data files outside the
# program, so with --sandbox it cannot write any Word file. The official
# build carries them inside. The version is pinned and its file checked: a
# new pandoc comes only with a commit (see docs/deploy.md). The checksum is
# the "digest" GitHub lists for the release asset.
set -euo pipefail

version=3.11
sha256=89d4c9d97818c62a97157f0072844e4602c6cee795bf84abd1aee7273abcda99

deb="pandoc-${version}-1-amd64.deb"
file="${RUNNER_TEMP:-/tmp}/${deb}"
curl --fail --silent --show-error --location --retry 3 --output "$file" \
  "https://github.com/jgm/pandoc/releases/download/${version}/${deb}"
echo "${sha256}  ${file}" | sha256sum --check --strict
sudo dpkg --install "$file"
pandoc --version | head -n 1
