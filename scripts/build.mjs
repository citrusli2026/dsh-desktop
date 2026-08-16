/**
 * Bundle the Electron main process with esbuild's JS API (the API spawns the
 * platform binary directly, avoiding pnpm's .bin shims which go stale when a
 * dependency's postinstall swaps a JS bin for a native binary).
 * @module scripts/build
 */
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

rmSync('lib', { recursive: true, force: true })

const configuredMobileShell = process.env.DSH_MOBILE_SHELL_WEB_ROOT
const mobileShellCandidates = configuredMobileShell === undefined
  ? [resolve('../dsh-mobile-shell/dist/web'), '/Users/citrus/dsh-mobile-shell/dist/web']
  : [resolve(configuredMobileShell)]
const mobileShellArtifact = mobileShellCandidates.find(path => existsSync(join(path, 'web-artifact.json')))
if (mobileShellArtifact === undefined) {
  throw new Error(`dsh-mobile-shell Web artifact not found; run "npm run package:web" in dsh-mobile-shell, or set DSH_MOBILE_SHELL_WEB_ROOT (tried ${mobileShellCandidates.join(', ')})`)
}
const mobileShellManifest = JSON.parse(readFileSync(join(mobileShellArtifact, 'web-artifact.json'), 'utf8'))
if (mobileShellManifest.format !== 'dsh-mobile-shell-web' || mobileShellManifest.formatVersion !== 1) {
  throw new Error(`unsupported dsh-mobile-shell Web artifact at ${mobileShellArtifact}`)
}
const mobileShellTarget = resolve('resources/mobile-shell')
rmSync(mobileShellTarget, { recursive: true, force: true })
cpSync(mobileShellArtifact, mobileShellTarget, { recursive: true })

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
