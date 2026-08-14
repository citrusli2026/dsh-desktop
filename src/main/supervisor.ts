/**
 * Harness process supervision: spawn the bundled @deepseek-ai/dsh web runtime
 * under the bundled Node, resolve readiness from the stdout URL line, restart
 * on unexpected exit with a bounded backoff, and shut down gracefully on quit.
 * @module main/supervisor
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { app } from 'electron'
import { dshBin, nodeBin } from './paths.ts'

/** Upstream readiness contract: one stdout line naming the loopback URL. */
const READY_LINE = /^dsh web: (http:\/\/127\.0\.0\.1:\d+)/

/** Give a broken first boot room before declaring failure. */
const READY_TIMEOUT_MS = 90_000

/** Crash budget: at most this many unexpected exits inside the window. */
const MAX_RESTARTS_IN_WINDOW = 5
const RESTART_WINDOW_MS = 10 * 60_000
const RESTART_BASE_DELAY_MS = 2_000
const RESTART_MAX_DELAY_MS = 30_000

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

/**
 * Owns one harness child process across restarts. `start()` resolves with the
 * ready URL of the first run that reaches readiness; afterwards, unexpected
 * exits restart automatically (bounded) and every transition is re-emitted
 * through {@link SupervisorEvents.onState}, so the window can follow the
 * current URL or show the error page.
 */
export class HarnessSupervisor {
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

  constructor(private readonly events: SupervisorEvents) {
    const logDir = join(app.getPath('userData'), 'logs')
    mkdirSync(logDir, { recursive: true })
    this.logStream = createWriteStream(join(logDir, 'harness.log'), { flags: 'a' })
  }

  /** Number of unexpected exits inside the current restart window. */
  private windowedAttempts(): number {
    const cutoff = Date.now() - RESTART_WINDOW_MS
    this.exitTimes = this.exitTimes.filter(time => time >= cutoff)
    return this.exitTimes.length
  }

  /** Append one output line to the ring buffer and the log file. */
  private recordLine(line: string): void {
    this.logLines.push(line)
    if (this.logLines.length > LOG_TAIL_LINES) this.logLines.shift()
    this.logStream?.write(`${line}\n`)
  }

  private spawnOnce(): ChildProcess {
    const child = spawn(nodeBin(), [dshBin(), '--profile', 'web', '--port', '0'], {
      // Pass the desktop environment through untouched: DSH_HOME stays the
      // shared default (~/.dsh) unless the user sets it (decision 0003).
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child
    for (const stream of [child.stdout, child.stderr]) {
      const lines = createInterface({ input: stream! })
      lines.on('line', (line) => {
        this.recordLine(line)
        const match = READY_LINE.exec(line)
        if (match !== null) this.onReady(match[1]!)
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
    const attempts = this.windowedAttempts()
    if (attempts > MAX_RESTARTS_IN_WINDOW) {
      this.events.onState({ phase: 'crashed', attempts, logTail: this.logLines.join('\n') })
      return
    }
    this.restartDelay = Math.min(this.restartDelay * 2, RESTART_MAX_DELAY_MS)
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
        reject(new Error(`harness not ready within ${READY_TIMEOUT_MS} ms`))
      }, READY_TIMEOUT_MS)
      this.spawnOnce()
    })
  }

  /**
   * Stop the harness: SIGTERM, then SIGKILL after the grace budget. Safe to
   * call with no child running; never rejects.
   */
  stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.restartTimer !== undefined) clearTimeout(this.restartTimer)
      const child = this.child
      if (child === undefined) {
        this.stopping = true
        resolve()
        return
      }
      this.stopping = true
      const killTimer = setTimeout(() => child.kill('SIGKILL'), STOP_TIMEOUT_MS)
      child.once('exit', () => {
        clearTimeout(killTimer)
        resolve()
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
