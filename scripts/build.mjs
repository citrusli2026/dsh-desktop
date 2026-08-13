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
  external: ['electron'],
  outfile: 'lib/main/index.js',
  sourcemap: true,
})
