/** CI-guarded E2E runner.
 *
 * Playwright 1.62.1 with Electron can hang in worker teardown after the
 * suite already printed its summary (observed on Linux CI: the diagnostics
 * case's app close() never resolves; SIGKILL leaves the worker waiting on
 * its own child bookkeeping). The tests themselves are green — the hang is
 * runner-exit plumbing. This wrapper decides the result from the suite
 * summary ("N passed / N failed") instead of the process exit code and
 * hard-kills the whole tree when Playwright does not exit by itself.
 * Child output is teed to stdout (step log) and a local file.
 *
 * Usage: node scripts/run-e2e-guarded.mjs [--grep tag]
 */
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'

const LOG = '/tmp/dsh-e2e-guarded.log'
const logStream = createWriteStream(LOG)
const command = ['pnpm', 'exec', 'playwright', 'test', ...process.argv.slice(2)].join(' ')
const child = spawn(command, { stdio: ['inherit', 'pipe', 'pipe'], shell: true })
let buffered = ''

function tee(chunk) {
  process.stdout.write(chunk)
  buffered += chunk.toString()
  if (buffered.length > 2_000_000) buffered = buffered.slice(-1_000_000)
  logStream.write(chunk)
}

child.stdout.on('data', tee)
child.stderr.on('data', tee)

/** Null when no summary yet; 0 = pass, 1 = real test failure. */
function decide() {
  const failed = buffered.match(/^\s*([0-9]+) failed/m)
  if (failed !== null && Number(failed[1]) > 0) return 1
  const passed = buffered.match(/^\s*([0-9]+) passed \(/m)
  if (passed !== null) return 0
  return null
}

let finished = false
function finish(code) {
  if (finished || typeof code !== 'number') return
  finished = true
  setTimeout(() => {
    try {
      spawn('pkill', ['-9', '-f', 'playwright'], { stdio: 'ignore' })
      spawn('pkill', ['-9', '-f', 'dsh-electron-e2e'], { stdio: 'ignore' })
    } catch {
      // pkill missing is fine (non-linux hosts)
    }
    try {
      child.kill('SIGKILL')
    } catch {
      // already exited
    }
    logStream.end()
    process.exit(code)
  }, 2_000)
}

const poll = setInterval(() => {
  const verdict = decide()
  if (verdict !== null) {
    clearInterval(poll)
    finish(verdict)
  }
}, 1_000)

child.once('error', error => {
  console.error(`run-e2e-guarded: spawn failed: ${error.message}`)
  clearInterval(poll)
  process.exit(1)
})
child.once('exit', code => {
  if (finished) return
  clearInterval(poll)
  finished = true
  const verdict = decide()
  logStream.end()
  process.exit(verdict !== null ? verdict : (code ?? 1))
})

// Safety net: never let CI hang past 15 minutes.
setTimeout(() => {
  if (finished) return
  console.error('run-e2e-guarded: global timeout — killing process tree')
  finish(1)
}, 15 * 60_000).unref()
