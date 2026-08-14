# 0007: CJS single-file main bundle

- Date: 2026-02-09
- Status: accepted
- 中文:[0007](0007-cjs-main-bundle.zh.md)

## Context

The main process started as ESM output. Wiring electron-updater hit two layers
of trouble:

1. If electron-updater stays an npm production dependency for electron-builder
   to collect, electron-builder 26 collects nothing under this repo's pnpm
   hoisted layout (log: `no node modules returned`);
2. If esbuild bundles electron-updater into ESM output, its dependency chain
   fs-extra → graceful-fs uses a dynamic `require('fs')`, which ESM output
   cannot express — the main process crashed on startup
   (`Dynamic require of "fs" is not supported`). Leaving it external failed
   differently: Node's cjs-module-lexer cannot see electron-updater's named
   exports, so `import { autoUpdater }` threw `Named export not found` at
   runtime.

## Decision

The main process ships as a **CJS single-file bundle**:

- `scripts/build.mjs` bundles `src/main` together with electron-updater and its
  full dependency tree via esbuild (`format: 'cjs'`) into
  `lib/main/index.cjs`; only `electron` stays external (provided by the
  runtime). The sandboxed preload is a second CJS bundle
  (`lib/preload/index.cjs`);
- `package.json`'s `main` points at `lib/main/index.cjs` (the `.cjs` extension
  forces CommonJS inside the `"type": "module"` repo);
- The app has no production dependencies at all — electron-builder finding no
  modules is now correct; the asar holds just the bundle, preload, and
  package.json;
- The build clears `lib/` first so stale outputs never mix.

## Consequences

- Positive: the whole main process is one file; dynamic require works natively;
  sidesteps electron-builder's pnpm-collection variance and CJS named-export
  detection variance — identical behavior across platforms; upgrading
  electron-updater is a devDependency bump plus repackage;
- Negative: the main process is CJS (it has no top-level-await need); bundled
  dependency versions are locked by the build, upgraded explicitly.

## Alternatives

- rollup + @rollup/plugin-commonjs producing ESM: another toolchain solving the
  same CJS-interop problem for no extra benefit — rejected;
- ESM output + electron-builder dependency collection: collection is empty in
  this layout — rejected.
