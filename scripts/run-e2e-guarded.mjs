/** CI-guarded E2E runner.
 *
 * Playwright 1.62.1 with Electron can hang in worker teardown after the
 * suite already printed its summary (observed on Linux CI: the diagnostics
 * case's app close() never resolves; SIGKILL leaves the worker waiting on
 * its own child bookkeeping). The tests themselves are green — the hang is
 * runner-exit plumbing, so this wrapper watches the summary line and then
 * hard-kills the whole process tree, exiting with the parsed result.
 *
 * Usage: node scripts/run-e2e-guarded.mjs [--grep tag]
 */
import { spawn } from 'node:child_process'
import { openSync, readFileSync } from 'node:fs'

const LOG = '/tmp/dsh-e2e-guarded.log'
const logFd = openSync(LOG, 'w')
// Args here are static (CI-provided grep filters); join to avoid the
// shell-args concatenation warning.
const command = ['pnpm', 'exec', 'playwright', 'test', ...process.argv.slice(2)].join(' ')
const child = spawn(command, { stdio: ['inherit', logFd, logFd], shell: true })

let finished = false

function readLog() {
  try {
    return readFileSync(LOG, 'utf8')
  } catch {
    return ''
  }
}

function reap(result) {
  if (finished) return
  finished = true
  // Give trace/screenshot writers a moment to flush, then reap the tree.
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
    process.exit(result)
  }, 2_000)
}

// Watch for the suite summary: "N passed (…)" with a failed count present.
const interval = setInterval(() => {
  const text = readLog()
  const failedMatch = text.match(/^\s*([0-9]+) failed/m)
  const passedMatch = text.match(/^\s*([0-9]+) passed \(/m)
  if (passedMatch !== null && failedMatch !== null) {
    clearInterval(interval)
    reap(Number(failedMatch[1]) > 0 ? 1 : 0)
  }
}, 2_000)

// Normal exit: report playwright's own code (no hang occurred).
child.once('error', error => {
  console.error(`run-e2e-guarded: spawn failed: ${error.message}`)
  clearInterval(interval)
  process.exit(1)
})
child.once('exit', code => {
  if (finished) return
  clearInterval(interval)
  finished = true
  process.exit(code ?? 1)
})

// Safety net: never let CI hang past 15 minutes.
setTimeout(() => {
  if (finished) return
  console.error('run-e2e-guarded: global timeout — killing process tree')
  reap(1)
}, 15 * 60_000).unref()
