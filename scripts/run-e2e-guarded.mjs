/** CI-guarded E2E runner.
 *
 * Playwright 1.62.1 with Electron can hang in worker teardown after the
 * suite already printed its summary (observed on Linux CI: the diagnostics
 * case's app close() never resolves; SIGKILL leaves the worker waiting on
 * its own child bookkeeping). The tests themselves are green — the hang is
 * runner-exit plumbing, so this wrapper watches the summary line and then
 * hard-kills the whole process tree, exiting with the parsed result.
 * Child output is teed to stdout (GitHub step log) and a local file.
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

let finished = false
function finish(code) {
  if (finished) return
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

// Parse the suite summary as soon as either marker is printed.
setInterval(() => {
  const failedMatch = buffered.match(/^\s*([0-9]+) failed/m)
  const passedMatch = buffered.match(/^\s*([0-9]+) passed \(/m)
  if (failedMatch !== null) {
    finish(Number(failedMatch[1]) > 0 ? 1 : 0)
  } else if (passedMatch !== null) {
    finish(0)
  }
}, 1_000)

child.once('error', error => {
  console.error(`run-e2e-guarded: spawn failed: ${error.message}`)
  process.exit(1)
})
child.once('exit', code => {
  // Playwright exited on its own — no hang: trust its code.
  process.exit(code ?? 1)
})

// Safety net: never let CI hang past 15 minutes.
setTimeout(() => {
  if (finished) return
  console.error('run-e2e-guarded: global timeout — killing process tree')
  finish(1)
}, 15 * 60_000).unref()
