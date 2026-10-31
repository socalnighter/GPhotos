#!/usr/bin/env bash
# Builds the zip to upload to the Chrome Web Store (extension files only).
set -euo pipefail
cd "$(dirname "$0")"
version=$(grep -m1 '"version"' extension/manifest.json | sed 's/.*: *"\(.*\)".*/\1/')
mkdir -p dist
out="dist/gphotos-backup-${version}.zip"
rm -f "$out"
(cd extension && zip -qr "../$out" . -x "*.DS_Store")
echo "Created $out"
