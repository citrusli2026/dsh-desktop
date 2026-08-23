# 0016: Minimal dual-platform release surface

- Date: 2026-08-15
- Status: accepted (partially superseded by 0017 for the Linux points — the deb is now the sole Linux format)
- 中文:[0016](0016-minimal-dual-platform-release-surface.zh.md)

## Context

The previous release matrix exposed 11 files across macOS, Windows, and Linux:
multiple installer formats, blockmaps, and electron-updater metadata. Most of
that surface served edge platforms or implementation machinery rather than the
two primary desktop downloads. It made releases, mirrors, the website, and
support guidance harder to audit.

## Decision

- Public releases support exactly two desktop targets: Apple Silicon macOS and
  x64 Windows.
- Each release has exactly two large installers:
  `dsh-desktop-<version>-arm64-mac.dmg`,
  `dsh-desktop-setup-<version>.exe`. One standard sha256sum file sits beside
  each installer (`<installer>.sha256`), so the user-facing/verifiable surface
  is capped at four files.
- ZIP, AppImage, deb, macOS updater metadata, and secondary installers are not
  uploaded. The only machine-facing sidecars retained are Windows
  `latest.yml` and `dsh-desktop-setup-<version>.exe.blockmap`, because installed
  Windows clients require them for in-place updates.
  The release validator rejects both missing and additional files and verifies
  checksum contents, updater references, and the exact six-file release before
  publication.
- The two packaged applications still launch their bundled Harness in CI.
  Linux remains the CI host for source-level Electron E2E and Harness smoke,
  but is no longer a packaged distribution target.
- Windows keeps `electron-updater`; unsigned macOS continues the check-only
  GitHub Releases flow established by decision 0010.
- Site generation stores and renders only the two installers and their
  optional checksum records. Historical releases without checksum files still
  render the two supported installers; new releases must pass the six-file
  release gate.

## Consequences

- The release surface has one obvious large download per supported platform;
  updater internals remain small and are hidden from the website.
- Release storage, mirror work, website logic, and support choices shrink
  materially; user-facing asset count is capped at four and large files at two.
- Linux packages, Intel macOS, and macOS ZIP are deliberately out of scope.
  Users on other platforms can use upstream
  `npx @deepseek-ai/dsh web`.
- Windows keeps its existing update convenience without reopening the broad
  artifact matrix. Signing/notarization can justify revisiting macOS updates
  later, but must not silently expand the large-file matrix.

## Alternatives

- Upload only two installers without hashes: smallest count, but users cannot
  verify large unsigned downloads independently — rejected.
- Remove all updater metadata: smallest release, but breaks useful updates for
  installed Windows clients — rejected.
- Continue Linux and secondary macOS formats: useful at the edge, but contrary
  to the deliberate two-endpoint product focus — rejected.
