# Releasing Paramaakshara

For maintainers. A release is a version tag on `main`; the Release
workflow builds the artifacts and attaches them to a draft GitHub
release, which a maintainer reviews and publishes.

## Artifacts

`make release` (`scripts/release.sh`) builds into `dist/`:

  File                                          Contents
  --------------------------------------------- -------------------------------------
  `paramaakshara-<version>-macos.zip`           `Paramaakshara.app`, universal
                                                (Apple silicon and Intel), macOS 11+
  `paramaakshara-<version>-linux-amd64.tar.gz`  static binary, LICENSE, notices, README
  `paramaakshara-<version>-linux-arm64.tar.gz`  same for arm64
  `SHA256SUMS`                                  checksums of the above

All binaries embed the editor and fonts, are statically linked
(`CGO_ENABLED=0`) and include time-zone data. The version comes from
`git describe`.

## Steps

1.  Merge `develop` into `main`; CI must be green.
2.  Move the "Unreleased" entries in `CHANGELOG.md` under the new version.
3.  Tag and push:

    ``` sh
    git tag -a v0.1.0 -m "Paramaakshara 0.1.0"
    git push origin v0.1.0
    ```

4.  The Release workflow runs lint and tests, builds the artifacts and
    creates a **draft** release. Check it: download the macOS zip, open
    the app on a machine where it was not built, and check the
    checksums.
5.  Publish the release.

## Signing and notarizing the macOS app

Without signing, the app is ad-hoc signed: it runs on the machine that
built it, but elsewhere macOS refuses it until the user allows it (the
README explains how), and the release notes say so.

To sign and notarize, a maintainer with an Apple Developer account adds
these repository secrets (Settings → Secrets and variables → Actions):

  Secret                          Value
  ------------------------------- -------------------------------------------------
  `MACOS_CERTIFICATE`             the "Developer ID Application" certificate and key,
                                  exported as .p12, base64-encoded
  `MACOS_CERTIFICATE_PASSWORD`    the .p12 export password
  `DEVELOPER_ID`                  `Developer ID Application: Name (TEAMID)`
  `APPLE_ID`                      the Apple ID used for notarization
  `APPLE_TEAM_ID`                 the team ID
  `APPLE_APP_PASSWORD`            an app-specific password for that Apple ID

With them, the workflow signs with the hardened runtime, submits the zip
to Apple's notary service, waits, and staples the ticket to the app.

To do the same locally:

``` sh
xcrun notarytool store-credentials paramaakshara-notary \
  --apple-id you@example.com --team-id TEAMID --password app-specific-password
DEVELOPER_ID="Developer ID Application: Name (TEAMID)" \
NOTARY_PROFILE=paramaakshara-notary make release
spctl --assess --type execute --verbose dist/…/Paramaakshara.app   # after unzipping
```

## Docker image

The image is built from the release binary with `make docker`
(docker/README.md). Publishing it to a registry is not automated yet.
