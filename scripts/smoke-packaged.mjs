/** Locate the current platform's unpacked app and run its built-in smoke mode. */
import { readdir, rm, mkdtemp } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
// Shared with the app's built-in smoke mode (src/main/smoke.ts) so the flag,
// exit codes, and injection env vars cannot drift between the two sides.
import { SMOKE_EXIT_OK, SMOKE_FLAG } from '../src/main/smoke-protocol.ts'

async function filesBelow(root) {
  const result = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) result.push(...await filesBelow(path))
    else result.push(path)
  }
  return result
}

function isExecutable(path) {
  const normalized = path.replaceAll('\\', '/')
  if (process.platform === 'darwin') return normalized.endsWith('/dsh-desktop.app/Contents/MacOS/dsh-desktop')
  if (process.platform === 'win32') return basename(path).toLowerCase() === 'dsh-desktop.exe' && normalized.includes('/win-unpacked/')
  return basename(path) === 'dsh-desktop' && normalized.includes('/linux-unpacked/')
}

const distRoot = process.argv[2] ?? 'dist'
const executable = (await filesBelow(distRoot)).find(isExecutable)
if (executable === undefined) throw new Error(`packaged smoke: unpacked executable not found for ${process.platform}`)

const dshHome = await mkdtemp(join(tmpdir(), 'dsh-packaged-smoke-'))
try {
  const exitCode = await new Promise((resolve, reject) => {
    const userData = join(dshHome, 'electron-user-data')
    // The unpacked tree has no SUID chrome-sandbox (deb postinst sets it at
    // install time), so headless CI smoke runs with the Chromium sandbox off,
    // same as the e2e fixture.
    const args = [SMOKE_FLAG, `--user-data-dir=${userData}`]
    if (process.platform === 'linux') args.push('--no-sandbox')
    const child = spawn(executable, args, {
      env: { ...process.env, DSH_HOME: dshHome },
      stdio: 'inherit',
    })
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error('packaged smoke timed out after 180 seconds'))
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
  if (exitCode !== SMOKE_EXIT_OK) throw new Error(`packaged smoke exited with code ${String(exitCode)}`)
  console.log(`packaged smoke: OK ${executable}`)
} finally {
  await rm(dshHome, { recursive: true, force: true })
}
