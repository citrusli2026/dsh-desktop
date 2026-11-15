/**
 * Materialize the @deepseek-ai/dsh dependency closure for the bundled harness
 * (docs/decisions/0005): install the pure manifest in manifest/harness against
 * its committed lockfile, then `pnpm deploy` (hoisted, from that shared
 * lockfile) a symlink-free node_modules into resources/harness/ — the closure
 * technique the upstream deepseek-harness single-exe build uses. Clears
 * resources/harness first, so bootstrap fetches the pinned Node afterwards and
 * then rebuilds ABI-bound addons with that exact runtime.
 * @module scripts/deploy-harness
 */
import { spawnSync } from 'node:child_process'
import { lstat, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { patchBundledAccountUi } from './patch-account-ui.mjs'
import { patchBundledSessionTrash } from './patch-session-trash.mjs'
import { pruneRuntimeMetadata } from './prune-closure-metadata.mjs'

const ROOT = process.cwd()
const MANIFEST_DIR = join(ROOT, 'manifest', 'harness')
const HARNESS_ROOT = join(ROOT, 'resources', 'harness')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: MANIFEST_DIR, stdio: 'inherit', ...options })
  if (result.status !== 0) {
    console.error(`deploy-harness: '${command} ${args.join(' ')}' failed`)
    process.exit(result.status ?? 1)
  }
  return result
}

/**
 * Run pnpm in the manifest directory. Windows resolves pnpm through its .cmd
 * shim, which spawn() refuses to execute directly, so route it through
 * cmd.exe /c instead.
 * @param args - pnpm arguments.
 */
function runPnpm(args) {
  if (process.platform === 'win32') {
    const quoted = args.map(arg => (/\s/.test(arg) ? `"${arg}"` : arg)).join(' ')
    const result = spawnSync('cmd.exe', ['/d', '/s', '/c', `pnpm ${quoted}`], { cwd: MANIFEST_DIR, stdio: 'inherit' })
    if (result.status !== 0) {
      console.error(`deploy-harness: 'pnpm ${args.join(' ')}' failed`)
      process.exit(result.status ?? 1)
    }
  } else {
    run('pnpm', args)
  }
}

/**
 * Verify the deployed closure carries no symlinks: the harness is spawned
 * from a plain directory, and symlinks would break packaged installs that
 * are copied around by installers. `.bin` shims are removed beforehand.
 * @param dir - closure root to walk.
 */
async function assertNoSymlinks(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === '.bin') continue
    const path = join(dir, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`symlink left in deployed closure: ${path}`)
    if (entry.isDirectory()) await assertNoSymlinks(path)
  }
}

/**
 * Prune runtime-irrelevant content from the closure (about 96M on macOS):
 * node-pty's foreign-platform prebuilds and build-time sources, TypeScript
 * declarations, @types, and every source map. Licenses are never touched.
 * The harness keeps its current-platform node-pty prebuild, verified to load
 * under the bundled Node (its loader prefers build/, then prebuilds/<plat>).
 */
async function pruneClosure() {
  const modules = join(HARNESS_ROOT, 'node_modules')
  const removed = []

  // node-pty: keep lib/ + the current platform's prebuild + package metadata.
  const pty = join(modules, 'node-pty')
  if (existsSync(pty)) {
    const prebuilds = join(pty, 'prebuilds')
    const keep = `${process.platform}-${process.arch}`
    if (existsSync(prebuilds)) {
      for (const entry of await readdir(prebuilds, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name !== keep) {
          await rm(join(prebuilds, entry.name), { recursive: true, force: true })
          removed.push(`node-pty/prebuilds/${entry.name}`)
        }
      }
    }
    for (const dir of ['src', 'deps', 'third_party', 'typings', 'scripts']) {
      await rm(join(pty, dir), { recursive: true, force: true })
      removed.push(`node-pty/${dir}`)
    }
  }

  // Modern packages also ship .d.mts/.d.cts declarations. Keep executable
  // .mts/.cts/.ts files; only declaration suffixes are runtime-irrelevant.
  const metadataRemoved = await pruneRuntimeMetadata(modules)
  removed.push(...metadataRemoved)
  console.log(`deploy-harness: modern declarations removed=${metadataRemoved.filter(path => /\.d\.[cm]ts$/.test(path)).length}`)
  console.log(`deploy-harness: pruned ${removed.length} paths from the closure`)
}

/**
 * The lockfile-faithful deploy copies the workspace patch mapping into the
 * deployed package.json with a repo-relative path (`../../manifest/...`).
 * That path does not exist in a packaged app and makes nested pnpm
 * invocations warn; the closure code is already patched, so drop it.
 */
async function pruneWorkspacePatchMetadata() {
  const file = join(HARNESS_ROOT, 'package.json')
  const manifest = JSON.parse(await readFile(file, 'utf8'))
  if (manifest.pnpm === undefined) return
  delete manifest.pnpm
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log('deploy-harness: removed workspace-only patch metadata from the closure')
}

async function main() {
  await rm(HARNESS_ROOT, { recursive: true, force: true })

  // safe-delete=false: pnpm 11 asks for confirmation before emptying a
  // non-empty target — both here (replacing stale closure entries under
  // node_modules) and in deploy below, which is exactly what this script
  // does on purpose (it rm'd HARNESS_ROOT above); interactive prompts
  // cannot run in CI. The hoisted linker is explicit rather than inherited
  // from the caller's env: the manifest tree must expose the kernel bundles
  // at their top-level paths (the account/trash contract tests read them
  // there) no matter how bootstrap was started.
  runPnpm(['install', '--frozen-lockfile', '--config.safe-delete=false', '--config.node-linker=hoisted'])
  //
  // Deploy from the shared lockfile, not the legacy mode: `--legacy` ignores
  // the lockfile and re-resolves every range, so a newly published prerelease
  // (0.2.1-rc.1 appeared mid-iteration) could silently replace the reviewed
  // alpha.5 closure or fail on a companion that was never published. The
  // non-legacy deploy is frozen to this lockfile; pnpm >=10 requires
  // inject-workspace-packages and the lockfile's auto-install-peers setting
  // (do not override it here). `link-workspace-packages` keeps the local
  // dsh-desktop-controls file dependency materialized in the closure.
  runPnpm([
    'deploy', '--filter', '.', '--prod',
    '--config.inject-workspace-packages=true',
    '--config.node-linker=hoisted',
    '--config.link-workspace-packages=true',
    '--config.safe-delete=false',
    HARNESS_ROOT,
  ])

  const shims = join(HARNESS_ROOT, 'node_modules', '.bin')
  if (existsSync(shims)) await rm(shims, { recursive: true, force: true })

  await pruneWorkspacePatchMetadata()
  await assertNoSymlinks(HARNESS_ROOT)
  await pruneClosure()
  await patchBundledSessionTrash(HARNESS_ROOT)
  await patchBundledAccountUi(HARNESS_ROOT)

  const dshBin = join(HARNESS_ROOT, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const pnpmCjs = join(HARNESS_ROOT, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
  for (const [label, path] of [['dsh bin', dshBin], ['pnpm.cjs', pnpmCjs]]) {
    if (!existsSync(path)) throw new Error(`deployed closure incomplete: ${label} missing at ${path}`)
  }

  if (process.platform === 'win32') {
    // No du on Windows; report a JS-walked byte count instead.
    let bytes = 0
    async function sizeOf(dir) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) await sizeOf(path)
        else bytes += (await lstat(path)).size
      }
    }
    await sizeOf(HARNESS_ROOT)
    console.log(`deploy-harness: closure staged at ${HARNESS_ROOT} (${Math.round(bytes / 1024 / 1024)}M)`)
  } else {
    const result = run('du', ['-sh', HARNESS_ROOT], { stdio: ['ignore', 'pipe', 'inherit'] })
    console.log(`deploy-harness: closure staged at ${HARNESS_ROOT} (${String(result.stdout).trim().split('\t')[0]})`)
  }

  // The closure must satisfy every non-optional peer dependency; the manifest
  // lists the complete set while the lockfile governs the exact versions.
  run(process.execPath, [join(ROOT, 'scripts', 'audit-harness-peers.mjs')], { cwd: ROOT })
}

main().catch(error => {
  console.error('deploy-harness:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
