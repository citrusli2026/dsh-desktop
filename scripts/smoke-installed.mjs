/** Installed-state smoke: run the app from its real install location.
 *
 *   node scripts/smoke-installed.mjs dpkg [--reinstall]        # Linux: dpkg -i already done
 *   node scripts/smoke-installed.mjs nsis <dir|exe> [--reinstall]  # Windows: silent install → smoke → uninstall
 *
 * Unlike scripts/smoke-packaged.mjs (unpacked tree, Chromium sandbox off on
 * Linux), the installed binary must boot with its real sandbox — the deb
 * postinst sets the chrome-sandbox SUID — so no --no-sandbox is passed.
 * `--reinstall` re-runs the installer over the existing install (same version
 * overwrite, the closest CI can get to a real user upgrade) and smokes again.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { spawn } from 'node:child_process'
import { SMOKE_EXIT_OK, SMOKE_FLAG } from '../src/main/smoke-protocol.ts'

const execFileP = promisify(execFile)
// dpkg -L lists every file of the 160 MB Electron install; the default 1 MB
// stdout cap truncates it and aborts the smoke before the app ever runs.
const BIG_BUFFER = { maxBuffer: 32 * 1024 * 1024 }
const method = process.argv[2]
const reinstall = process.argv.includes('--reinstall')

async function smokeRun(executable) {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-installed-smoke-'))
  try {
    const exitCode = await new Promise((resolve, reject) => {
      const userData = join(dshHome, 'electron-user-data')
      const child = spawn(executable, [SMOKE_FLAG, `--user-data-dir=${userData}`], {
        env: { ...process.env, DSH_HOME: dshHome },
        stdio: 'inherit',
      })
      let settled = false
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        child.kill('SIGKILL')
        reject(new Error('installed smoke timed out after 180 seconds'))
      }, 180_000)
      child.once('error', error => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        reject(error)
      })
      child.once('exit', code => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve(code)
      })
    })
    if (exitCode !== SMOKE_EXIT_OK) throw new Error(`installed smoke exited with code ${String(exitCode)}`)
    console.log(`installed smoke: OK ${executable}`)
  } finally {
    await rm(dshHome, { recursive: true, force: true })
  }
}

if (method === 'dpkg') {
  const { stdout } = await execFileP('dpkg', ['-L', 'dsh-desktop'], BIG_BUFFER)
  const candidates = stdout.split('\n').filter(line => line.endsWith('/dsh-desktop'))
  // dpkg -L lists the /opt/dsh-desktop DIRECTORY before the binary inside it;
  // spawn the first regular executable (stat follows the /usr/bin symlink).
  let executable
  for (const candidate of candidates) {
    const info = await stat(candidate).catch(() => null)
    if (info?.isFile() && (info.mode & 0o111) !== 0) { executable = candidate; break }
  }
  if (executable === undefined) throw new Error('dpkg: installed binary not found via dpkg -L dsh-desktop')
  await smokeRun(executable)
  if (reinstall) {
    const distDir = process.argv[3] ?? 'dist'
    const debName = (await readdir(distDir)).find(name => name.endsWith('.deb'))
    if (debName === undefined) throw new Error(`dpkg --reinstall: no .deb under ${distDir}`)
    await execFileP('sudo', ['dpkg', '-i', join(distDir, debName)], { timeout: 300_000 })
    console.log('dpkg: reinstalled', debName)
    await smokeRun(executable)
  }
} else if (method === 'nsis') {
  const dirOrFile = process.argv[3]
  if (dirOrFile === undefined) throw new Error('nsis: pass the installers directory or the installer exe as the third argument')
  const info = await stat(dirOrFile).catch(() => null)
  let installerPath = dirOrFile
  if (info?.isDirectory() === true) {
    const files = await readdir(dirOrFile)
    installerPath = join(dirOrFile, files.find(name => /-setup-.*\.exe$/.test(name)) ?? '')
  }
  if (!installerPath.endsWith('.exe')) throw new Error(`nsis: installer exe not found under ${dirOrFile}`)
  const installer = installerPath
  const installDir = await mkdtemp(join(tmpdir(), 'dsh-nsis-install-'))
  try {
    // /S = silent, /D = installation directory (NSIS: must be the last switch,
    // no quotes around the path).
    await execFileP(installer, ['/S', `/D=${installDir}`], { timeout: 300_000 })
    console.log(`nsis: installed under ${installDir}`)
    const executable = join(installDir, 'dsh-desktop.exe')
    await smokeRun(executable)
    if (reinstall) {
      // Same-version overwrite: closest CI can get to a real user upgrade.
      // Replacing a same-version install runs the existing app's uninstaller,
      // which waits indefinitely when a previous smoke left part of the app
      // running and holding install-dir files, so sweep the tree first.
      if (process.platform === 'win32') {
        await new Promise(resolve => {
          const sweep = spawn('taskkill', ['/f', '/t', '/im', 'dsh-desktop.exe'], { stdio: 'ignore' })
          sweep.once('exit', () => resolve(undefined))
          sweep.once('error', () => resolve(undefined))
        })
      }
      await execFileP(installer, ['/S', `/D=${installDir}`], { timeout: 300_000 })
      console.log('nsis: reinstalled over the existing install')
      await smokeRun(executable)
    }
    const uninstaller = join(installDir, 'Uninstall dsh-desktop.exe')
    await execFileP(uninstaller, ['/S'], { timeout: 300_000 })
    console.log('nsis: uninstalled')
  } finally {
    await rm(installDir, { recursive: true, force: true }).catch(() => undefined)
  }
} else {
  throw new Error('usage: smoke-installed.mjs <dpkg|nsis> [installer.exe]')
}
