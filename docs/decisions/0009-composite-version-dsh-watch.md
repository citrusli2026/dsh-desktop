# 0009: Composite version (dsh + shell) and upstream watch automation

- Date: 2026-08-14
- Status: accepted
- 中文:[0009](0009-composite-version-dsh-watch.zh.md)

## Context

The shell bundles one pinned upstream `@deepseek-ai/dsh`, and the two evolve
independently: upstream ships release candidates on its own cadence while the
shell fixes its own bugs in between. A single linear version (0.1.1, 0.1.2)
cannot express which upstream a release bundles, and checking upstream for new
releases was manual. Constraints: electron-builder needs a valid semver, and
electron-updater compares versions monotonically — build metadata (`+dsh.x`)
is ignored by semver comparison, so an upstream-only bump encoded that way
would never reach installed users.

## Decision

- App version and git tag are composite: **`<dsh version>.shell.<shell rev>`**,
  e.g. `0.1.0-rc.6.shell.3` — upstream first (it dominates user-visible
  behavior), then a per-upstream shell revision (Debian upstream-revision
  style). After the first dash everything is dot-separated, so every
  prerelease identifier compares numerically where expected — an upstream
  `rc.10` sorts above `rc.9` — which electron-updater relies on.
- `scripts/version.mjs` is the single writer of the version field and the
  manifest pin: `show` / `check` / `bump shell` / `bump dsh` / `set`.
  `bump dsh` rewrites the manifest pin and resets the shell revision to 0.
- The `dsh-watch` workflow checks the npm registry daily (cron `42 1 * * *`
  UTC). On a newer upstream it bumps, regenerates the closure lockfile,
  rebuilds the closure, smoke-tests it, and opens a PR; when verification
  fails it opens an issue instead — commonly the 24h `minimumReleaseAge`
  floor on a fresh upstream release, which the next daily run clears.

## Consequences

- Ordering resets against the old linear line: `0.1.0-rc.6.shell.3` sorts
  below `0.1.2-pre.0`. Accepted — pre-1.0 with no install base to preserve
  (owner decision, 2026-08-14); from here on ordering is monotonic.
- Every release becomes a reproducible statement: the tag names the exact
  bundled upstream plus the shell delta.
- The existing linear tags `v0.1.0-pre.0` / `v0.1.1-pre.0` stay as history;
  new tags follow the composite scheme.

## Alternatives

- Build metadata (`0.1.2+dsh.0.1.0-rc.6`): semver comparison ignores it, so
  electron-updater would treat an upstream-only bump as the same version and
  skip the update — rejected.
- Shell-first composite (`0.1.2.dsh.0.1.0...`): upstream dominates what a
  release *is*, so upstream leads — rejected.
- Plain upstream tracking without a shell revision (`0.1.0-rc.6` re-tagged):
  no room for shell-only fixes between upstream releases — rejected.
