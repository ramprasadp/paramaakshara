#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Builds release artifacts into dist/ (see docs/release.md):
#
#   paramaakshara-<version>-macos.zip           Paramaakshara.app (universal)
#   paramaakshara-<version>-linux-amd64.tar.gz  static binary
#   paramaakshara-<version>-linux-arm64.tar.gz  static binary
#   SHA256SUMS
#
# macOS signing is optional and uses the environment:
#   DEVELOPER_ID    "Developer ID Application: Name (TEAMID)"; without it
#                   the app is ad-hoc signed (fine on the build machine,
#                   Gatekeeper warns elsewhere).
#   NOTARY_PROFILE  a notarytool keychain profile; with DEVELOPER_ID it
#                   notarizes and staples the app.

set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${VERSION:-$(git describe --tags --always --dirty 2>/dev/null || echo dev)}"
# CFBundleShortVersionString must be numeric.
SHORT_VERSION="$(sed -nE 's/^v?([0-9]+\.[0-9]+\.[0-9]+).*/\1/p' <<<"$VERSION")"
SHORT_VERSION="${SHORT_VERSION:-0.0.0}"
DIST=dist
WORK="$DIST/work"
LDFLAGS="-s -w -X main.version=$VERSION"

echo "Building Paramaakshara $VERSION"
rm -rf "$DIST"
mkdir -p "$WORK"

npm --prefix frontend ci --silent
npm --prefix frontend run build >/dev/null

build() { # goos goarch output
  CGO_ENABLED=0 GOOS="$1" GOARCH="$2" go build -trimpath -tags timetzdata \
    -ldflags "$LDFLAGS" -o "$3" ./cmd/paramaakshara
}

docs() { # directory
  cp LICENSE THIRD_PARTY_NOTICES.md "$1/"
  cp README.md "$1/README.md"
}

# Linux: static binaries.
for arch in amd64 arm64; do
  dir="$WORK/paramaakshara-$VERSION-linux-$arch"
  mkdir -p "$dir"
  build linux "$arch" "$dir/paramaakshara"
  docs "$dir"
  tar -C "$WORK" -czf "$DIST/paramaakshara-$VERSION-linux-$arch.tar.gz" "$(basename "$dir")"
done

# macOS: universal binary in an app bundle.
build darwin arm64 "$WORK/paramaakshara-darwin-arm64"
build darwin amd64 "$WORK/paramaakshara-darwin-amd64"
APP="$WORK/macos/Paramaakshara.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
lipo -create -output "$APP/Contents/MacOS/paramaakshara" \
  "$WORK/paramaakshara-darwin-arm64" "$WORK/paramaakshara-darwin-amd64"
sed -e "s/@VERSION@/$VERSION/" -e "s/@SHORT_VERSION@/$SHORT_VERSION/" \
  packaging/macos/Info.plist.in >"$APP/Contents/Info.plist"
docs "$APP/Contents/Resources"

if [[ -n "${DEVELOPER_ID:-}" ]]; then
  codesign --force --options runtime --timestamp --sign "$DEVELOPER_ID" "$APP"
else
  echo "DEVELOPER_ID not set: ad-hoc signing (not for distribution)"
  codesign --force --sign - "$APP"
fi
codesign --verify --strict "$APP"

ZIP="$DIST/paramaakshara-$VERSION-macos.zip"
ditto -c -k --keepParent "$APP" "$ZIP"
if [[ -n "${DEVELOPER_ID:-}" && -n "${NOTARY_PROFILE:-}" ]]; then
  xcrun notarytool submit "$ZIP" --keychain-profile "$NOTARY_PROFILE" --wait
  xcrun stapler staple "$APP"
  rm "$ZIP"
  ditto -c -k --keepParent "$APP" "$ZIP"
fi

(cd "$DIST" && shasum -a 256 ./*.zip ./*.tar.gz | sed 's| \./| |' >SHA256SUMS)
rm -rf "$WORK"
echo
ls -l "$DIST"
