/**
 * Bundle the Electron main process with esbuild's JS API (the API spawns the
 * platform binary directly, avoiding pnpm's .bin shims which go stale when a
 * dependency's postinstall swaps a JS bin for a native binary).
 * @module scripts/build
 */
import { build } from 'esbuild'

await build({
  entryPoints: ['src/main/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  // electron-updater ships CJS with dynamic requires that esbuild cannot
  // bundle into ESM output; it stays external and electron-builder packs it
  // (and its deps) into the asar from the production dependency tree.
  external: ['electron', 'electron-updater'],
  outfile: 'lib/main/index.js',
  sourcemap: true,
})
