/**
 * NSIS upgrade-residue matrix on the CI Windows runner (decision 0032,
 * #39 family): proves that a deliberately damaged, read-only, or locked
 * bundled node.exe cannot silently survive an upgrade.
 *
 * Scenarios (each on its own real silent install of the previous release:
 * NSIS uninstallers embed their install directory at compile time, so a
 * copied tree's uninstaller deletes the SOURCE directory — install trees
 * cannot be cloned for uninstaller-based tests):
 *  S1 corrupted + future-mtime node.exe must be replaced (hash == manifest).
 *  S2 read-only node.exe must be removed by the upgrade (the new installer's
 *     attribute clear in .onInit unblocks the old uninstaller's RMDir /r).
 *  S3 locked node.exe must fail the new installer explicitly (exit code 5
 *     from the occupancy probe) instead of copying around it; after the
 *     holder exits, the upgrade must succeed cleanly.
 *  S4 (only when Defender real-time protection is ON, see T6 in
 *     docs/nsis-upgrade-residue-analysis.md): one more corrupted→upgraded
 *     cycle as a repeat-under-AV pass.
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

/** Defender real-time protection state for the T6 record: true / false /
 *  'unknown' (PowerShell or the Mp module unavailable). */
async function defenderRealTimeProtection() {
  try {
    const { stdout } = await execFileP('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      '(Get-MpComputerStatus).RealTimeProtectionEnabled',
    ], { timeout: 60_000 })
    const value = stdout.trim().toLowerCase()
    if (value === 'true') return true
    if (value === 'false') return false
  } catch {
    // fall through to unknown
  }
  return 'unknown'
}

const uninstallerOf = installDir => join(installDir, 'Uninstall dsh-desktop.exe')
const nodeExeOf = installDir => join(installDir, 'resources', 'harness', 'node', 'bin', 'node.exe')
const manifestOf = installDir => join(installDir, 'resources', 'manifest.json')
const probeLog = join(tmpdir(), 'dsh-nsis-probe.log')

/** The installer hooks append one line per probe to this log; print it so a
 *  failing scenario shows exactly what the installer saw ($INSTDIR, handle,
 *  last-error). */
async function dumpProbeLog(tag) {
  const text = await readFile(probeLog, 'utf8').catch(() => '<no probe log>')
  console.error(`residue matrix: probe log ${tag}:\n${text.trimEnd()}`)
}

async function clearProbeLog() {
  await rm(probeLog, { force: true })
}

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

/** True when node.exe cannot be opened for writing, i.e. a holder keeps it
 *  mapped. Opening for write on a running image fails with EBUSY/EPERM. */
async function isNodeLocked(path) {
  const handle = await open(path, 'r+').then(
    handle => handle,
    () => null,
  )
  if (handle === null) return true
  await handle.close()
  return false
}

/** S1/S2 shape: tamper the freshly installed tree, upgrade, expect a clean
 *  closure. `baselineDir` must hold a REAL previous install (see the header:
 *  copies would aim the embedded-path uninstaller at the source). */
async function tamperAndUpgrade(baselineDir, tamper) {
  await tamper(nodeExeOf(baselineDir))
  await execFileP(uninstallerOf(baselineDir), ['/S'], { timeout: 300_000 })
  const code = await silentInstall(currentInstaller, baselineDir)
  if (code !== 0) throw new Error(`current installer exited ${String(code)}`)
  await assertNodeMatchesManifest(baselineDir)
}

const root = await mkdtemp(join(tmpdir(), 'dsh-residue-matrix-'))
const previous = await findOne(previousDir, name => name.endsWith('.exe'))
const currentInstaller = await findOne(currentDir, name => isCurrentInstaller(name, currentVersion, 'win32'))
const scenariosRun = []

try {
  const defender = await defenderRealTimeProtection()
  console.log(`residue matrix: Defender real-time protection: ${defender}`)

  let baseline = join(root, 'S1 baseline')
  await silentInstall(previous, baseline)
  await tamperAndUpgrade(baseline, corruptNodeExe)
  scenariosRun.push('S1-corrupted-node-replaced')
  console.log('residue matrix: S1-corrupted-node-replaced OK')

  baseline = join(root, 'S2 baseline')
  await silentInstall(previous, baseline)
  await tamperAndUpgrade(baseline, path => chmod(path, 0o444))
  scenariosRun.push('S2-readonly-node-replaced')
  console.log('residue matrix: S2-readonly-node-replaced OK')

  baseline = join(root, 'S3 baseline')
  await clearProbeLog()
  await silentInstall(previous, baseline)
  let holder = await holdNodeExe(nodeExeOf(baseline))
  try {
    // The locked file must survive the old uninstaller (RMDir /r skips it in
    // silent mode); verify the lock is really held right up to the upgrade.
    await execFileP(uninstallerOf(baseline), ['/S'], { timeout: 300_000 })
    const exists = await readFile(nodeExeOf(baseline)).then(() => true, () => false)
    if (!exists) throw new Error('expected the locked node.exe to survive the old uninstaller (matrix precondition)')
    if (!await isNodeLocked(nodeExeOf(baseline))) {
      // The holder exited early: respawn once so the scenario tests the
      // installer instead of dying on a flaky fixture.
      await killHolder(holder)
      holder = await holdNodeExe(nodeExeOf(baseline))
      if (!await isNodeLocked(nodeExeOf(baseline))) {
        throw new Error('could not hold node.exe locked (holder exited twice)')
      }
    }
    const code = await silentInstall(currentInstaller, baseline)
    await dumpProbeLog('after upgrade attempt over the lock')
    if (code !== OCCUPIED_EXIT_CODE) {
      throw new Error(`installer over a locked closure exited ${String(code)}, expected ${OCCUPIED_EXIT_CODE}`)
    }
  } finally {
    await killHolder(holder)
  }
  const code = await silentInstall(currentInstaller, baseline)
  if (code !== 0) throw new Error(`installer after releasing the holder exited ${String(code)}`)
  await assertNodeMatchesManifest(baseline)
  scenariosRun.push('S3-locked-node-fails-explicitly')
  console.log('residue matrix: S3-locked-node-fails-explicitly OK')

  // S4: one more corrupted→upgraded cycle, meaningful as a repeat-under-AV
  // pass when Defender real-time protection is active on the runner (T6).
  if (defender === true) {
    baseline = join(root, 'S4 baseline')
    await silentInstall(previous, baseline)
    await tamperAndUpgrade(baseline, corruptNodeExe)
    scenariosRun.push('S4-second-pass-under-defender')
    console.log('residue matrix: S4-second-pass-under-defender OK (Defender RT on)')
  }
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }).catch(error => {
    console.warn(`residue matrix: temporary cleanup skipped (${error?.code ?? 'unknown error'})`)
  })
}

console.log(`nsis residue matrix: OK (${scenariosRun.join(', ')})`)
