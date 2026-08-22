/** Locate the current platform's unpacked app and run its built-in smoke mode. */
import { rm, mkdtemp } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { locatePackagedExecutable } from './packaged-locator.mjs'
// Shared with the app's built-in smoke mode (src/main/smoke.ts) so the flag,
// exit codes, and injection env vars cannot drift between the two sides.
import { SMOKE_EXIT_OK, SMOKE_FLAG, SMOKE_UI_FLAG } from '../src/main/smoke-protocol.ts'

const distRoot = process.argv[2] ?? 'dist'
const executable = await locatePackagedExecutable(distRoot)
// DSH_SMOKE_UI adds the UI-render variant: the plain smoke fetches the boot
// HTML, the UI variant additionally proves the real Harness bundle rendered.
const smokeUi = process.env.DSH_SMOKE_UI === '1'

const dshHome = await mkdtemp(join(tmpdir(), 'dsh-packaged-smoke-'))
try {
  const exitCode = await new Promise((resolve, reject) => {
    const userData = join(dshHome, 'electron-user-data')
    // The unpacked tree has no SUID chrome-sandbox (deb postinst sets it at
    // install time), so headless CI smoke runs with the Chromium sandbox off,
    // same as the e2e fixture.
    const args = [SMOKE_FLAG, `--user-data-dir=${userData}`]
    if (smokeUi) args.push(SMOKE_UI_FLAG)
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
  console.log(`packaged smoke: OK ${executable}${smokeUi ? ' (smoke-ui)' : ''}`)
} finally {
  await rm(dshHome, { recursive: true, force: true })
}
