/**
 * NSIS upgrade-residue matrix on the CI Windows runner (decision 0032,
 * #39 family): proves that a deliberately damaged, read-only, or locked
 * bundled node.exe cannot silently survive an upgrade.
 *
 * Scenarios (each on a fresh silent install of the previous release):
 *  S1 corrupted + future-mtime node.exe must be replaced (hash == manifest).
 *  S2 read-only node.exe must be removed by the upgrade (the new installer's
 *     attribute clear in .onInit unblocks the old uninstaller's RMDir /r).
 *  S3 locked node.exe must fail the new installer explicitly (exit code 5
 *     from the occupancy probe) instead of copying around it; after the
 *     holder exits, the upgrade must succeed cleanly.
 *
 * Usage: node scripts/smoke-nsis-residue.mjs <current-dist> <previous-dir>
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdtemp, open, readFile, readdir, rm, utimes } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { isCurrentInstaller } from './download-previous-release.mjs'

const execFileP = promisify(execFile)
const currentDir = resolve(process.argv[2] ?? 'dist')
const previousDir = resolve(process.argv[3] ?? 'test-results/previous-release')
const currentVersion = JSON.parse(await readFile(resolve('package.json'), 'utf8')).version
const OCCUPIED_EXIT_CODE = 5

async function findOne(dir, predicate) {
  const files = (await readdir(dir)).filter(predicate)
  if (files.length !== 1) throw new Error(`expected one matching installer under ${dir}, found ${files.length}`)
  return join(dir, files[0])
}

function silentInstall(installer, installDir) {
  return new Promise((resolveCode, reject) => {
    // /D=<dir> must be the final argument and stays unquoted (NSIS rule),
    // spaces included — same pattern as smoke-upgrade.mjs.
    const child = spawn(installer, ['/S', `/D=${installDir}`], { stdio: 'ignore' })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`installer timed out: ${installer}`))
    }, 300_000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); resolveCode(code ?? -1) })
  })
}

const uninstallerOf = installDir => join(installDir, 'Uninstall dsh-desktop.exe')
const nodeExeOf = installDir => join(installDir, 'resources', 'harness', 'node', 'bin', 'node.exe')
const manifestOf = installDir => join(installDir, 'resources', 'manifest.json')

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

/** Hash the installed node.exe against the closure manifest the current
 *  installer embedded: the clean-slate assertion for every scenario. */
async function assertNodeMatchesManifest(installDir) {
  const manifest = JSON.parse(await readFile(manifestOf(installDir), 'utf8'))
  const key = 'harness/node/bin/node.exe'
  const expected = manifest.files?.[key]
  if (expected === undefined) throw new Error(`closure manifest has no entry for ${key}`)
  const actual = await sha256(nodeExeOf(installDir))
  if (actual !== expected) throw new Error(`upgraded node.exe does not match the closure manifest (residue survived)`)
}

/** Corrupt the first bytes and stamp a future mtime, defeating both
 *  "overwrite identical file" and any ifnewer-style skip. */
async function corruptNodeExe(path) {
  const handle = await open(path, 'r+')
  try {
    await handle.write(Buffer.from('CORRUPTED-BY-RESIDUE-SMOKE'), 0)
  } finally {
    await handle.close()
  }
  const future = new Date(Date.now() + 86_400_000)
  await utimes(path, future, future)
}

async function holdNodeExe(path) {
  const child = spawn(path, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: false })
  await new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(() => rejectReady(new Error('holder node never started')), 30_000)
    child.once('spawn', () => { clearTimeout(timer); resolveReady() })
    child.once('error', error => { clearTimeout(timer); rejectReady(error) })
  })
  return child
}

const killHolder = child => new Promise(resolveKill => {
  child.once('exit', () => resolveKill())
  child.kill('SIGKILL')
  setTimeout(resolveKill, 5_000).unref?.()
})

async function scenario(name, run) {
  const root = await mkdtemp(join(tmpdir(), `dsh-residue-${name}-`))
  try {
    await run(root)
    console.log(`residue matrix: ${name} OK`)
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }).catch(() => undefined)
  }
}

const previous = await findOne(previousDir, name => name.endsWith('.exe'))
const current = await findOne(currentDir, name => isCurrentInstaller(name, currentVersion, 'win32'))

await scenario('S1-corrupted-node-replaced', async root => {
  const installDir = join(root, 'installed app')
  await silentInstall(previous, installDir)
  await corruptNodeExe(nodeExeOf(installDir))
  await execFileP(uninstallerOf(installDir), ['/S'], { timeout: 300_000 })
  const code = await silentInstall(current, installDir)
  if (code !== 0) throw new Error(`current installer exited ${String(code)}`)
  await assertNodeMatchesManifest(installDir)
})

await scenario('S2-readonly-node-replaced', async root => {
  const installDir = join(root, 'installed app')
  await silentInstall(previous, installDir)
  await chmod(nodeExeOf(installDir), 0o444)
  await execFileP(uninstallerOf(installDir), ['/S'], { timeout: 300_000 })
  const code = await silentInstall(current, installDir)
  if (code !== 0) throw new Error(`current installer exited ${String(code)}`)
  await assertNodeMatchesManifest(installDir)
})

await scenario('S3-locked-node-fails-explicitly', async root => {
  const installDir = join(root, 'installed app')
  await silentInstall(previous, installDir)
  const holder = await holdNodeExe(nodeExeOf(installDir))
  try {
    // The locked file survives the old uninstaller (RMDir /r skips it in
    // silent mode); the new installer must refuse with the explicit code.
    await execFileP(uninstallerOf(installDir), ['/S'], { timeout: 300_000 })
    const locked = await readFile(nodeExeOf(installDir)).then(() => true, () => false)
    if (!locked) throw new Error('expected the locked node.exe to survive the old uninstaller (matrix precondition)')
    const code = await silentInstall(current, installDir)
    if (code !== OCCUPIED_EXIT_CODE) {
      throw new Error(`installer over a locked closure exited ${String(code)}, expected ${OCCUPIED_EXIT_CODE}`)
    }
  } finally {
    await killHolder(holder)
  }
  const code = await silentInstall(current, installDir)
  if (code !== 0) throw new Error(`installer after releasing the holder exited ${String(code)}`)
  await assertNodeMatchesManifest(installDir)
})

console.log('nsis residue matrix: OK (corrupted replaced, readonly replaced, lock fails explicitly)')
