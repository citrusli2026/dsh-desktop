/**
 * Harness process supervision: spawn the bundled @deepseek-ai/dsh web runtime
 * under the bundled Node, resolve readiness from the stdout URL line, restart
 * on unexpected exit with a bounded backoff, and shut down gracefully on quit.
 * @module main/supervisor
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import * as electron from 'electron'
import { resolveDshHome } from './dsh-home.ts'
import { dshBin, nodeBin } from './paths.ts'
import { decideRestart, exitsInWindow, parseReadyUrl, RESTART_BASE_DELAY_MS } from './restart-policy.ts'

/** Give a broken first boot room before declaring failure. */
const READY_TIMEOUT_MS = 90_000

/** Graceful-stop budget before SIGKILL. */
const STOP_TIMEOUT_MS = 5_000

/** Lines kept in memory for the error page. */
const LOG_TAIL_LINES = 40

/** Supervisor-reported lifecycle state, consumed by the window controller. */
export type HarnessState =
  | { phase: 'starting' }
  | { phase: 'ready'; url: string }
  | { phase: 'crashed'; attempts: number; logTail: string }

/** Callbacks the supervisor reports state transitions through. */
export interface SupervisorEvents {
  onState(state: HarnessState): void
}

/** Testable process and filesystem overrides; production uses bundled defaults. */
export interface SupervisorOptions {
  command?: string
  args?: readonly string[]
  logDir?: string
  env?: NodeJS.ProcessEnv
  readyTimeoutMs?: number
}

function defaultLogDir(): string {
  if (electron.app === undefined) throw new Error('Electron app is unavailable; provide logDir')
  return join(electron.app.getPath('userData'), 'logs')
}

/**
 * Owns one harness child process across restarts. `start()` resolves with the
 * ready URL of the first run that reaches readiness; afterwards, unexpected
 * exits restart automatically (bounded) and every transition is re-emitted
 * through {@link SupervisorEvents.onState}, so the window can follow the
 * current URL or show the error page.
 */
export class HarnessSupervisor {
  private readonly events: SupervisorEvents
  private child: ChildProcess | undefined
  private stopping = false
  private resolveReady: ((url: string) => void) | undefined
  private rejectReady: ((error: Error) => void) | undefined
  private readyTimer: NodeJS.Timeout | undefined
  private restartTimer: NodeJS.Timeout | undefined
  private restartDelay = RESTART_BASE_DELAY_MS
  private exitTimes: number[] = []
  private readonly logLines: string[] = []
  private readonly logStream: NodeJS.WritableStream | undefined
  private readonly command: string
  private readonly args: readonly string[]
  private readonly env: NodeJS.ProcessEnv
  private readonly readyTimeoutMs: number

  constructor(
    events: SupervisorEvents,
    options: SupervisorOptions = {},
  ) {
    this.events = events
    const logDir = options.logDir ?? defaultLogDir()
    this.command = options.command ?? nodeBin()
    this.args = options.args ?? [dshBin(), '--profile', 'web', '--port', '0']
    const baseEnv = options.env ?? process.env
    this.env = { ...baseEnv, DSH_HOME: resolveDshHome(baseEnv, homedir()) }
    this.readyTimeoutMs = options.readyTimeoutMs ?? READY_TIMEOUT_MS
    mkdirSync(logDir, { recursive: true })
    this.logStream = createWriteStream(join(logDir, 'harness.log'), { flags: 'a' })
  }

  /** Number of unexpected exits inside the current restart window. */
  private windowedAttempts(): number {
    this.exitTimes = exitsInWindow(this.exitTimes, Date.now())
    return this.exitTimes.length
  }

  /** Append one output line to the ring buffer and the log file. */
  private recordLine(line: string): void {
    this.logLines.push(line)
    if (this.logLines.length > LOG_TAIL_LINES) this.logLines.shift()
    this.logStream?.write(`${line}\n`)
  }

  private spawnOnce(): ChildProcess {
    const child = spawn(this.command, [...this.args], {
      // Isolate the desktop data home by default (decision 0012): the harness
      // uses ~/.dsh-desktop unless the user sets DSH_HOME explicitly (e.g.
      // DSH_HOME=~/.dsh to share with the CLI again).
      env: this.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child
    for (const stream of [child.stdout, child.stderr]) {
      const lines = createInterface({ input: stream! })
      lines.on('line', (line) => {
        this.recordLine(line)
        const url = parseReadyUrl(line)
        if (url !== undefined) this.onReady(url)
      })
    }
    child.once('error', (error) => {
      this.recordLine(`supervisor: spawn error: ${String(error)}`)
      this.rejectReady?.(error)
    })
    child.once('exit', (code, signal) => {
      this.child = undefined
      this.recordLine(`supervisor: harness exited code=${String(code)} signal=${String(signal)}`)
      if (this.stopping) return
      if (this.resolveReady !== undefined) {
        // Died before ever reaching readiness: fail this start attempt.
        this.rejectReady?.(new Error(`harness exited before ready (code ${String(code)}, signal ${String(signal)})`))
        return
      }
      this.exitTimes.push(Date.now())
      this.scheduleRestart()
    })
    return child
  }

  private onReady(url: string): void {
    if (this.resolveReady === undefined) {
      // Restart path: no pending promise, just re-emit for the window.
      this.events.onState({ phase: 'ready', url })
      return
    }
    const resolve = this.resolveReady
    this.clearStartAttempt()
    resolve(url)
    this.events.onState({ phase: 'ready', url })
  }

  private clearStartAttempt(): void {
    if (this.readyTimer !== undefined) clearTimeout(this.readyTimer)
    this.readyTimer = undefined
    this.resolveReady = undefined
    this.rejectReady = undefined
    this.restartDelay = RESTART_BASE_DELAY_MS
  }

  private scheduleRestart(): void {
    const decision = decideRestart(this.windowedAttempts(), this.restartDelay)
    if (decision.action === 'gaveUp') {
      this.events.onState({ phase: 'crashed', attempts: decision.attempts, logTail: this.logLines.join('\n') })
      return
    }
    this.restartDelay = decision.delay
    this.events.onState({ phase: 'starting' })
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined
      this.spawnOnce()
    }, this.restartDelay)
    this.restartTimer.unref()
  }

  /**
   * Start (or restart after a gave-up crash) the harness and resolve with the
   * ready URL once the upstream readiness line is observed. Rejects on a
   * pre-ready exit or on the readiness timeout.
   * @returns the loopback URL the web UI is served at.
   */
  start(): Promise<string> {
    this.stopping = false
    this.events.onState({ phase: 'starting' })
    return new Promise<string>((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
      this.readyTimer = setTimeout(() => {
        this.clearStartAttempt()
        reject(new Error(`harness not ready within ${this.readyTimeoutMs} ms`))
      }, this.readyTimeoutMs)
      this.spawnOnce()
    })
  }

  /**
   * Stop the harness: SIGTERM, then SIGKILL after the grace budget. Safe to
   * call with no child running; never rejects.
   */
  stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      // Ending the log stream releases the file handle; a replacement
      // supervisor (manual retry) reopens the same file in append mode.
      const finish = (): void => {
        this.logStream?.end()
        resolve()
      }
      if (this.restartTimer !== undefined) clearTimeout(this.restartTimer)
      const child = this.child
      if (child === undefined) {
        this.stopping = true
        finish()
        return
      }
      this.stopping = true
      const killTimer = setTimeout(() => child.kill('SIGKILL'), STOP_TIMEOUT_MS)
      child.once('exit', () => {
        clearTimeout(killTimer)
        finish()
      })
      // SIGTERM on Windows is TerminateProcess for the direct child only;
      // sweep the whole tree so shell sessions and subagents do not survive
      // an app quit (their incremental JSONL writes bound the data loss).
      child.kill('SIGTERM')
      if (process.platform === 'win32' && child.pid !== undefined) {
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      }
    })
  }
}
