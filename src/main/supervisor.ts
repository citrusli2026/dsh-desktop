/**
 * Harness process supervision: spawn the bundled @deepseek-ai/dsh web runtime
 * under the bundled Node, resolve readiness from the stdout URL line, restart
 * on unexpected exit with a bounded backoff, and shut down gracefully on quit.
 * @module main/supervisor
 */
import { type ChildProcess } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import * as electron from 'electron'
import { resolveDshHome } from './dsh-home.ts'
import { dshBin, harnessRoot, nodeBin } from './paths.ts'
import { decideRestart, exitsInWindow, parseReadyUrl, RESTART_BASE_DELAY_MS } from './restart-policy.ts'
import { RollingLogWriter } from './diagnostics.ts'
import { InFlight, ManagedChild } from './process-lifecycle.ts'
import { prepareDesktopControlsMount } from './desktop-controls.ts'

/** Give a broken first boot room before declaring failure. */
const READY_TIMEOUT_MS = 90_000

/** Graceful-stop budget before SIGKILL. */
const STOP_TIMEOUT_MS = 5_000

/** Lines kept in memory for the error page. */
const LOG_TAIL_LINES = 40

/** Web-profile flags owned by the desktop shell. */
export const HARNESS_WEB_ARGS = ['--profile', 'web', '--no-open', '--port', '0'] as const

/** Insert a dsh-owned overlay before the first Web-app flag. */
export function addDesktopControlsPatch(args: readonly string[], patch: string): readonly string[] {
  const index = args.indexOf('--no-open')
  if (index < 0) return args
  return [...args.slice(0, index), '--patch', patch, ...args.slice(index)]
}

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
  cwd?: string
}

function defaultLogDir(): string {
  if (electron.app === undefined) throw new Error('Electron app is unavailable; provide logDir')
  return join(electron.app.getPath('userData'), 'logs')
}

function defaultCwd(): string | undefined {
  // In tests (no Electron app) there is no packaged harness root; spawn then
  // inherits the parent cwd, which is what the fixtures already expect.
  if (electron.app === undefined) return undefined
  return harnessRoot()
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
  private readonly managed = new ManagedChild()
  private readonly startSlot = new InFlight<string>()
  private readonly stopSlot = new InFlight<void>()
  private stopping = false
  private resolveReady: ((url: string) => void) | undefined
  private rejectReady: ((error: Error) => void) | undefined
  private readyTimer: NodeJS.Timeout | undefined
  private restartTimer: NodeJS.Timeout | undefined
  private restartDelay = RESTART_BASE_DELAY_MS
  private exitTimes: number[] = []
  private readonly logLines: string[] = []
  private readonly logWriter: RollingLogWriter
  private readonly command: string
  private readonly args: readonly string[]
  private readonly defaultArgs: boolean
  private readonly dshHome: string
  private readonly env: NodeJS.ProcessEnv
  private readonly readyTimeoutMs: number
  private readonly cwd: string | undefined

  constructor(
    events: SupervisorEvents,
    options: SupervisorOptions = {},
  ) {
    this.events = events
    const logDir = options.logDir ?? defaultLogDir()
    this.command = options.command ?? nodeBin()
    this.defaultArgs = options.args === undefined
    this.args = options.args ?? [dshBin(), ...HARNESS_WEB_ARGS]
    const baseEnv = options.env ?? process.env
    this.dshHome = resolveDshHome(baseEnv, homedir())
    this.env = { ...baseEnv, DSH_HOME: this.dshHome }
    this.readyTimeoutMs = options.readyTimeoutMs ?? READY_TIMEOUT_MS
    this.cwd = options.cwd ?? defaultCwd()
    mkdirSync(logDir, { recursive: true })
    const logPath = join(logDir, 'harness.log')
    this.logWriter = new RollingLogWriter(logPath)
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
    this.logWriter.write(line)
  }

  /**
   * Mount the shell-owned client plugin only for the production invocation.
   * Test fixtures and custom callers keep their exact argument list.
   */
  private resolvedArgs(): readonly string[] {
    if (!this.defaultArgs) return this.args
    let patch: string | undefined
    try {
      patch = prepareDesktopControlsMount(this.dshHome, harnessRoot())
    } catch (error) {
      console.warn(`dsh-desktop: desktop controls mount failed, booting without the in-app surface: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (patch === undefined) return this.args
    // dsh's top-level parser forwards unknown app flags after the first one;
    // keep its own --patch option before --no-open/--port or it is swallowed
    // as a Web-app argument.
    return addDesktopControlsPatch(this.args, patch)
  }

  private spawnOnce(): ChildProcess {
    const child = this.managed.spawn({
      command: this.command,
      args: this.resolvedArgs(),
      // Run from the harness root so dsh's own cwd-relative lookups (if any)
      // resolve against its bundled closure, not the Electron app directory.
      // In tests this is undefined and spawn inherits the parent cwd.
      cwd: this.cwd,
      // Isolate the desktop data home by default (decision 0012): the harness
      // uses ~/.dsh-desktop unless the user sets DSH_HOME explicitly (e.g.
      // DSH_HOME=~/.dsh to share with the CLI again).
      env: this.env,
      windowsHide: true,
    })
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
      this.failStart(error)
    })
    child.once('exit', (code, signal) => {
      this.recordLine(`supervisor: harness exited code=${String(code)} signal=${String(signal)}`)
      if (this.stopping) return
      if (this.rejectReady !== undefined) {
        // Died before ever reaching readiness: fail this start attempt.
        this.failStart(new Error(`harness exited before ready (code ${String(code)}, signal ${String(signal)})`))
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

  private failStart(error: Error): void {
    const reject = this.rejectReady
    if (reject === undefined) return
    this.stopping = true
    this.managed.process?.kill('SIGTERM')
    this.clearStartAttempt()
    reject(error)
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
    if (this.startSlot.pending) return this.startSlot.current!
    if (this.stopSlot.pending) {
      return this.startSlot.track(this.stopSlot.current!.then(() => this.createStartTask()))
    }
    return this.startSlot.track(this.createStartTask())
  }

  private createStartTask(): Promise<string> {
    if (this.managed.process !== undefined && this.resolveReady === undefined) {
      return Promise.reject(new Error('harness is already running'))
    }
    if (this.restartTimer !== undefined) clearTimeout(this.restartTimer)
    this.restartTimer = undefined
    this.stopping = false
    this.events.onState({ phase: 'starting' })
    return new Promise<string>((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
      this.readyTimer = setTimeout(() => {
        this.failStart(new Error(`harness not ready within ${this.readyTimeoutMs} ms`))
      }, this.readyTimeoutMs)
      this.spawnOnce()
    })
  }

  /**
   * Stop the harness: SIGTERM, then SIGKILL after the grace budget. Safe to
   * call with no child running; never rejects.
   */
  stop(): Promise<void> {
    if (this.stopSlot.pending) return this.stopSlot.current!
    const task = (async () => {
      if (this.restartTimer !== undefined) clearTimeout(this.restartTimer)
      this.restartTimer = undefined
      this.stopping = true
      const reject = this.rejectReady
      if (reject !== undefined) {
        this.clearStartAttempt()
        reject(new Error('harness stopped before ready'))
      }
      await this.managed.stop(STOP_TIMEOUT_MS)
      await this.logWriter.close()
    })()
    this.stopSlot.track(task)
    return task
  }
}
