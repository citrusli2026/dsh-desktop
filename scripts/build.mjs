/**
 * Bundle the Electron main process with esbuild's JS API (the API spawns the
 * platform binary directly, avoiding pnpm's .bin shims which go stale when a
 * dependency's postinstall swaps a JS bin for a native binary).
 * @module scripts/build
 */
import { rmSync } from 'node:fs'
import { build } from 'esbuild'

rmSync('lib', { recursive: true, force: true })

await build({
  entryPoints: ['src/main/index.ts'],
  bundle: true,
  platform: 'node',
  // CommonJS output: electron-updater's dependency chain (fs-extra →
  // graceful-fs) uses dynamic require() that cannot exist in ESM output;
  // CJS keeps it native and lets the whole main process ship as one file.
  format: 'cjs',
  external: ['electron'],
  outfile: 'lib/main/index.cjs',
  sourcemap: true,
})
