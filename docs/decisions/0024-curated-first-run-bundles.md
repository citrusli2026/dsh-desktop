# 0024: Curated first-run bundles and the market entry

- Date: 2026-08-29
- Status: accepted
- 中文:[0024](0024-curated-first-run-bundles.zh.md)

## Context

Upstream has no plugin market; the de-facto one is the community
dsh-market plugin (2.7k★, MIT, installs via `dsh plugin --profile web add
dshmarket`). Desktop users had no realistic path to any of it: no CLI on
PATH, no curated starting set. High-star shells solved this by shipping
curated bundles — most completely the Bundle Edition client (vibeinging),
which initializes new profiles offline from pinned artifacts and never
reinstalls a bundle the user removed.

## Decision

- **First-run seeding**: a brand-new web profile boots with three curated
  community bundles — `dshmarket` 1.36.0 (MIT), `dsh-better-sidebar`
  0.17.1 (MIT), `@linxin666/dsh-client-ui-task-board` 0.3.6 (Apache-2.0).
  Before the first harness boot the shell writes the profile manifest
  (official bundles first, then seeds) and symlinks each seed from the
  vendored closure into `profiles/node_modules` — symlink, never copy, so
  a bundle's runtime dependencies resolve through the hoisted closure
  exactly as they do for the official bundles (same mechanism as the
  loader's `healProfilesModuleFallback`).
- **The user owns the profile**: the seed fires only when the profile
  manifest does not exist. An existing profile is never rewritten; a
  bundle the user uninstalled is never reinstalled. Seeded bundles are
  ordinary user bundles — visible in 设置 → 插件, updatable/uninstallable
  by the market, quarantined by Safe Mode.
- **Existing installs** get a 扩展设置 row: "安装插件市场" runs the
  bundled dsh CLI (`plugin --profile web add dshmarket`, 2-minute
  timeout) and restarts the harness. The row reports state via a
  read-only bundled-plugins bridge call.
- **Vetting bar** for the curated set: npm-published with traceable
  provenance, permissive license, peer dependencies satisfiable by the
  pinned kernel (enforced by `scripts/audit-harness-peers.mjs`), and
  proven in high-star bundles. Rejections: `dsh-theme` (npm package
  points at an unrelated bot repository), `dsh-balance` (package lacks a
  license field), worktree plugins (GitHub-tarball only, no npm).

## Consequences

- Positive: a fresh desktop install opens with a working market and two
  quality-of-life bundles, zero CLI; the market covers everything else;
  Safe Mode and market-uninstall remain the recovery paths.
- Negative: the vendored closure grows (~16 MB unpacked); a kernel bump
  can break a seeded bundle until we re-pin (the pinned-kernel-per-release
  policy bounds this); the seed is one more first-boot step before the
  window (offline, sub-second).

## Alternatives

- Shell-owned mount for seeds (the dsh-desktop-controls `--patch`
  channel): invisible to the plugin manager and the market, and wrong
  ownership for third-party code — rejected;
- Auto-installing via `dsh plugin add` at first run: needs network and an
  npm registry at the user's worst moment (first boot) — rejected;
- Shipping no bundles and only recommending the market: leaves desktop
  users without any in-product path — rejected (the 扩展设置 row covers
  existing installs instead).
