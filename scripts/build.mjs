/**
 * Bundle the Electron main process with esbuild's JS API (the API spawns the
 * platform binary directly, avoiding pnpm's .bin shims which go stale when a
 * dependency's postinstall swaps a JS bin for a native binary).
 * @module scripts/build
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

rmSync('lib', { recursive: true, force: true })

const mobileShellCandidates = [
  process.env.DSH_MOBILE_SHELL_ROOT,
  resolve('../dsh-mobile-shell'),
  '/Users/citrus/dsh-mobile-shell',
].filter(path => path !== undefined)
const mobileShellSource = mobileShellCandidates.find(path => existsSync(join(path, 'proxy', 'dsh-remote.mjs')))
if (mobileShellSource === undefined) {
  throw new Error(`dsh-mobile-shell not found; set DSH_MOBILE_SHELL_ROOT (tried ${mobileShellCandidates.join(', ')})`)
}
const mobileShellTarget = resolve('resources/mobile-shell')
rmSync(mobileShellTarget, { recursive: true, force: true })
mkdirSync(join(mobileShellTarget, 'app', 'www'), { recursive: true })
mkdirSync(join(mobileShellTarget, 'proxy', 'vendor'), { recursive: true })
for (const [from, to] of [
  ['app/www/index.html', 'app/www/index.html'],
  ['proxy/dsh-remote.mjs', 'proxy/dsh-remote.mjs'],
  ['proxy/pairing-qr.mjs', 'proxy/pairing-qr.mjs'],
  ['proxy/vendor/qrcodegen.mjs', 'proxy/vendor/qrcodegen.mjs'],
  ['LICENSE', 'LICENSE'],
]) {
  cpSync(join(mobileShellSource, from), join(mobileShellTarget, to))
}

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

await build({
  entryPoints: ['src/preload/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  outfile: 'lib/preload/index.cjs',
  sourcemap: true,
})
