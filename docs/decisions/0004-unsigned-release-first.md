# 0004: Release unsigned first, sign later

- Date: 2026-02-09
- Status: accepted
- 中文:[0004](0004-unsigned-release-first.zh.md)

## Context

Code signing affects three things: macOS Gatekeeper/notarization, Windows
SmartScreen reputation, and electron-updater availability on macOS (mac updates
require a signed app). Certificates need an Apple Developer account
(USD 99/year) and maintainer key management; this repository starts on a
personal GitHub account without certificates.

## Decision

Ship **unsigned** in the first phase:

- CI builds all three platforms and publishes to GitHub Releases;
- macOS users right-click → Open on first launch (documented in the README);
- If right-click → Open still provides no override, the README documents a
  trusted-source fallback: `xattr -dr com.apple.quarantine
  "/Applications/dsh-desktop.app"`, followed by `open
  "/Applications/dsh-desktop.app"`;
- Automatic updates are disabled on macOS; Windows / Linux electron-updater
  works normally;
- The repo layout and CI reserve signing slots (certificates via CI secrets,
  enabled by a later flag); notarization and macOS updates come later without
  changing anything else.

## Consequences

- Positive: fastest path to download-and-use; any fork can run the release
  pipeline without credentials;
- Negative: first-launch friction on macOS; SmartScreen warns on unsigned
  Windows builds — both covered in the README.

## Alternatives

- Set up Apple Developer + notarization from day one: delays the first release
  and raises maintainer overhead — deferred;
- Ship Windows/Linux only: against the three-platform goal — rejected.
