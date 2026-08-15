# 0010: macOS check-only update prompt

- Date: 2026-08-15
- Status: accepted
- 中文:[0010](0010-macos-check-only-update.zh.md)

## Context

Decision 0004 ships unsigned builds, and electron-updater cannot install
updates on macOS without an Apple-issued signature — so macOS users received
no update signal at all and silently stayed on old versions, while
Windows/Linux auto-update normally. The composite version (0009) reduces "is
there something newer" to a semver comparison between the running version and
the latest GitHub release tag; no updater machinery is needed for that.

## Decision

- macOS gets a **check-only prompt**: fetch the releases list from the GitHub
  Releases API, include non-draft prereleases, and select the highest
  parseable version before comparing it with the running version
  (`latestPublishedVersion` / `isNewerVersion` in
  `src/main/update-check.ts`, a pure unit-tested module; unparseable tags are
  ignored — the feed is untrusted input),
  and when a newer version exists show a dialog whose primary button opens
  the releases page for a manual download-and-overwrite install.
- One automatic check per launch, delayed 15 s so boot traffic settles;
  automatic-check failures stay silent. A tray item (检查更新…) runs the
  same check manually and reports the outcome, including up-to-date and
  failure dialogs.
- Windows/Linux are unchanged: the electron-updater `autoDownload` path
  stays the only channel there.
- The GitHub Releases API is the single feed. The GitCode mirror (0008) is
  not polled — one canonical source keeps the comparison and the failure
  modes simple.

## Consequences

- Positive: macOS users learn about new versions without any signing
  infrastructure; the manual overwrite install matches the already-manual
  first install (right-click → Open).
- Negative: the unauthenticated GitHub API is rate-limited (60 req/hour/IP)
  — bounded by one check per launch plus manual clicks, and the check is
  best-effort by design.
- The update code paths diverge per platform (prompt vs auto-install);
  both are behind the same tray item so the user-facing surface is uniform.

## Alternatives

- electron-updater with an ad-hoc/self-signed signature: macOS auto-update
  requires an Apple Developer ID signature; ad-hoc does not qualify —
  rejected.
- No update signal on macOS until signing lands (0004's later phase):
  users strand on old versions with no way to learn that — rejected.
- In-app download and in-place replacement (Sparkle-style): trading the
  unsigned-install problem for the harder problem of replacing a running
  app bundle — deferred until signing exists.
