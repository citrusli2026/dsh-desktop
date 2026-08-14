# 0005: Materialize the harness closure with pnpm deploy

- Date: 2026-02-09
- Status: accepted
- 中文:[0005](0005-harness-closure-pnpm-deploy.zh.md)

## Context

The app must ship `@deepseek-ai/dsh` and its full dependency tree (~200
packages plus native dependencies such as node-pty / koffi / sharp). The
Electron app's own `node_modules` must stay isolated from the harness's: the
harness runs under a bundled standalone Node as a child process, its native
modules install against the ordinary Node ABI, and electron-builder must never
treat them as the app's own native dependencies.

## Decision

Reuse the closure technique upstream's single-exe build already validated:

- `manifest/harness/package.json` is a **pure dependency manifest** (zero code)
  pinning `@deepseek-ai/dsh` exactly, explicitly declaring every non-optional
  peer of the closure (~20 packages), plus `pnpm` (so `dsh plugin` can install
  plugins inside the app);
- `scripts/deploy-harness.mjs`:
  1. `pnpm --dir manifest/harness install --frozen-lockfile` (lockfile is
     committed, reproducible);
  2. `pnpm deploy --filter . --prod --legacy --config.node-linker=hoisted
     --config.auto-install-peers=false --config.link-workspace-packages=true
     resources/harness` materializes a **symlink-free** flat node_modules;
  3. removes `.bin` shims, walks the closure asserting no symlink remains,
     verifies the dsh bin and pnpm.cjs exist;
  4. runs `scripts/audit-harness-peers.mjs`: any unsatisfied non-optional peer
     fails the build hard (no runtime `ERR_MODULE_NOT_FOUND`);
  5. prunes runtime-irrelevant content: node-pty's foreign-platform prebuilds
     and build-time sources, all `*.map` / `*.d.ts`, and `@types/` — roughly
     161M off the closure (349M → 188M on macOS), never touching licenses;
- `manifest/harness/pnpm-workspace.yaml` mirrors upstream's `allowBuilds`
  allowlist (pnpm 10+ strictDepBuilds), enabling node-pty / koffi / sharp /
  esbuild / dsh-subprocess-local scripts and denying the no-op ones; it also
  carries pnpm's generated `minimumReleaseAgeExclude` (the rc packages are
  under the 24h release-age floor);
- The staged closure lives in `resources/harness/`, shipped via electron-builder
  `extraResources` outside the asar (split into node / node_modules entries
  because electron-builder hard-excludes a copy source's top-level
  node_modules dir); child processes spawn from plain filesystem paths.
  `pnpm run bootstrap` is always deploy → fetch-node (deploy clears the target).

## Consequences

- Positive: the closure corresponds byte-for-byte to the upstream npm release;
  upgrading = one manifest line + lockfile; no symlinks means installers can
  copy and move the tree freely;
- Negative: every platform build installs the closure once (minutes); native
  modules compile on each platform's CI (the same requirement upstream's own
  install has).

## Alternatives

- Let the shell repo depend on `@deepseek-ai/dsh` directly and have
  electron-builder pack the whole tree: mixes two dependency worlds, risks
  unwanted native rebuilds and bloat — rejected;
- esbuild the harness into a single file: upstream's plugin system resolves
  packages out of node_modules (profile bundles, dynamic imports); bundling
  breaks that resolution contract — rejected.
