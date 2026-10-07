/** Supervise the bundled cc-connect Feishu sidecar. */
import { type ChildProcess } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createInterface } from 'node:readline'
import * as electron from 'electron'
import { ccConnectBin } from './paths.ts'
import { RollingLogWriter } from './diagnostics.ts'
import { InFlight, ManagedChild } from './process-lifecycle.ts'

export const CONNECT_STOP_TIMEOUT_MS = 5_000
export const CONNECT_READY_TIMEOUT_MS = 30_000
export const CONNECT_RESTART_WINDOW_MS = 5 * 60_000
export const CONNECT_MAX_RESTARTS = 5
export const CONNECT_RESTART_BASE_DELAY_MS = 2_000
export const CONNECT_RESTART_MAX_DELAY_MS = 30_000
const LOG_TAIL_LINES = 40
const MAX_ERROR_LENGTH = 1_000

export type ConnectPhase = 'disabled' | 'stopped' | 'starting' | 'ready' | 'crashed' | 'degraded'

export type ConnectState =
  | { phase: 'disabled' | 'stopped' }
  | { phase: 'starting'; stage: 'launching' | 'waiting-for-ready' | 'retrying'; restartAttempts?: number; retryDelayMs?: number; lastError?: string }
  | { phase: 'ready'; restartAttempts: number }
  | { phase: 'degraded'; restartAttempts: number; retryDelayMs: number; lastError?: string }
  | { phase: 'crashed'; restartAttempts: number; lastError: string; logTail: string }

export interface ConnectSupervisorEvents {
  onState(state: ConnectState): void
}

export interface ConnectSupervisorOptions {
  command?: string
  args?: readonly string[]
  configPath?: string
  logDir?: string
  env?: NodeJS.ProcessEnv
  cwd?: string
  readyTimeoutMs?: number
  stopTimeoutMs?: number
  restartBaseDelayMs?: number
  restartMaxDelayMs?: number
  restartWindowMs?: number
  maxRestarts?: number
  redactValues?: () => readonly string[]
}

function defaultLogDir(): string {
  if (electron.app === undefined) throw new Error('Electron app is unavailable; provide logDir')
  return `${electron.app.getPath('userData')}/logs`
}

/** True for the stable structured slog marker emitted by cc-connect. */
export function isConnectReadyLine(line: string): boolean {
  return line.includes('cc-connect ready') || line.includes('msg="cc-connect ready"')
}

function redactText(text: string, values: readonly string[]): string {
  let result = text
  for (const value of values) {
    if (value.length >= 3) result = result.split(value).join('[REDACTED]')
  }
  return result
    .replace(/(DSH_CC_CONNECT_FEISHU_SECRET=)[^\s]+/gi, '$1[REDACTED]')
    .replace(/((?:app_)?secret=)[^\s,]+/gi, '$1[REDACTED]')
    .replace(/((?:access_)?token=)[^\s,]+/gi, '$1[REDACTED]')
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, '$1[REDACTED]')
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class ConnectSupervisor {
  private readonly events: ConnectSupervisorEvents
  private readonly managed = new ManagedChild()
  private readonly startSlot = new InFlight<boolean>()
  private readonly stopSlot = new InFlight<void>()
  private readonly logWriter: RollingLogWriter
  private readonly command: string
  private readonly args: readonly string[]
  private readonly env: NodeJS.ProcessEnv
  private readonly cwd: string | undefined
  private readonly readyTimeoutMs: number
  private readonly stopTimeoutMs: number
  private readonly restartBaseDelayMs: number
  private readonly restartMaxDelayMs: number
  private readonly restartWindowMs: number
  private readonly maxRestarts: number
  private readonly redactValues: () => readonly string[]
  private readonly logLines: string[] = []
  private resolveReady: (() => void) | undefined
  private rejectReady: ((error: Error) => void) | undefined
  private readyTimer: NodeJS.Timeout | undefined
  private restartTimer: NodeJS.Timeout | undefined
  private restartDelay: number
  private exitTimes: number[] = []
  private stopping = false
  private enabled = true
  private state: ConnectState = { phase: 'stopped' }

  constructor(events: ConnectSupervisorEvents, options: ConnectSupervisorOptions = {}) {
    this.events = events
    this.command = options.command ?? ccConnectBin()
    this.args = options.args ?? (options.configPath === undefined ? [] : ['--config', options.configPath])
    this.env = { ...(options.env ?? process.env) }
    this.cwd = options.cwd
    this.readyTimeoutMs = options.readyTimeoutMs ?? CONNECT_READY_TIMEOUT_MS
    this.stopTimeoutMs = options.stopTimeoutMs ?? CONNECT_STOP_TIMEOUT_MS
    this.restartBaseDelayMs = options.restartBaseDelayMs ?? CONNECT_RESTART_BASE_DELAY_MS
    this.restartMaxDelayMs = options.restartMaxDelayMs ?? CONNECT_RESTART_MAX_DELAY_MS
    this.restartWindowMs = options.restartWindowMs ?? CONNECT_RESTART_WINDOW_MS
    this.maxRestarts = options.maxRestarts ?? CONNECT_MAX_RESTARTS
    this.restartDelay = this.restartBaseDelayMs
    this.redactValues = options.redactValues ?? (() => Object.values(this.env).filter((value): value is string => value !== undefined))
    const logDir = options.logDir ?? defaultLogDir()
    mkdirSync(logDir, { recursive: true })
    this.logWriter = new RollingLogWriter(`${logDir}/cc-connect.log`)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) void this.stop()
  }

  currentState(): ConnectState {
    return this.state
  }

  logTailSnapshot(): string {
    return this.logLines.join('\n')
  }

  private emit(state: ConnectState): void {
    this.state = state
    this.events.onState(state)
  }

  private recordLine(line: string): string {
    const redacted = redactText(line, this.redactValues())
    this.logLines.push(redacted)
    if (this.logLines.length > LOG_TAIL_LINES) this.logLines.shift()
    this.logWriter.write(redacted)
    return redacted
  }

  private redactedError(error: unknown): string {
    return redactText(errorText(error), this.redactValues()).slice(0, MAX_ERROR_LENGTH)
  }

  private clearReadyAttempt(): void {
    if (this.readyTimer !== undefined) clearTimeout(this.readyTimer)
    this.readyTimer = undefined
    this.resolveReady = undefined
    this.rejectReady = undefined
  }

  private onReady(): void {
    if (this.resolveReady === undefined) return
    const resolve = this.resolveReady
    this.clearReadyAttempt()
    this.restartDelay = this.restartBaseDelayMs
    this.exitTimes = []
    resolve()
    this.emit({ phase: 'ready', restartAttempts: 0 })
  }

  private spawnOnce(): ChildProcess {
    const child = this.managed.spawn({
      command: this.command,
      args: this.args,
      cwd: this.cwd,
      env: this.env,
      windowsHide: true,
    })
    this.emit({ phase: 'starting', stage: 'waiting-for-ready' })
    for (const stream of [child.stdout, child.stderr]) {
      const lines = createInterface({ input: stream! })
      lines.on('line', line => {
        const redacted = this.recordLine(line)
        if (isConnectReadyLine(redacted)) this.onReady()
      })
    }
    let exitHandled = false
    const unexpectedExit = (message: string): void => {
      if (exitHandled) return
      exitHandled = true
      this.recordLine(message)
      if (this.stopping) return
      this.scheduleRestart(message)
    }
    child.once('error', error => unexpectedExit(`supervisor: spawn error: ${errorText(error)}`))
    child.once('exit', (code, signal) => unexpectedExit(`supervisor: cc-connect exited code=${String(code)} signal=${String(signal)}`))
    return child
  }

  private scheduleRestart(reason: string): void {
    const now = Date.now()
    this.exitTimes = this.exitTimes.filter(time => time >= now - this.restartWindowMs)
    this.exitTimes.push(now)
    const attempts = this.exitTimes.length
    if (attempts > this.maxRestarts) {
      const message = `cc-connect restart budget exhausted after ${String(attempts)} attempts`
      this.stopping = true
      const reject = this.rejectReady
      this.clearReadyAttempt()
      this.emit({ phase: 'crashed', restartAttempts: attempts, lastError: this.redactedError(message), logTail: this.logTailSnapshot() })
      reject?.(new Error(this.redactedError(message)))
      return
    }
    const delay = this.restartDelay
    this.restartDelay = Math.min(this.restartDelay * 2, this.restartMaxDelayMs)
    const lastError = this.redactedError(reason)
    if (this.state.phase === 'ready') this.emit({ phase: 'degraded', restartAttempts: attempts, retryDelayMs: delay, lastError })
    this.emit({ phase: 'starting', stage: 'retrying', restartAttempts: attempts, retryDelayMs: delay, lastError })
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined
      if (this.stopping || !this.enabled) return
      try {
        this.spawnOnce()
      } catch (error) {
        this.scheduleRestart(`supervisor: spawn failed: ${errorText(error)}`)
      }
    }, delay)
  }

  private failStart(error: unknown): void {
    const reject = this.rejectReady
    if (reject === undefined) return
    const message = this.redactedError(error)
    this.stopping = true
    this.managed.process?.kill('SIGTERM')
    this.clearReadyAttempt()
    this.emit({ phase: 'crashed', restartAttempts: this.exitTimes.length, lastError: message, logTail: this.logTailSnapshot() })
    reject(new Error(message))
  }

  start(): Promise<boolean> {
    if (!this.enabled) {
      this.emit({ phase: 'disabled' })
      return Promise.resolve(false)
    }
    if (this.startSlot.pending) return this.startSlot.current!
    if (this.stopSlot.pending) return this.startSlot.track(this.stopSlot.current!.then(() => this.createStartTask()))
    return this.startSlot.track(this.createStartTask())
  }

  private createStartTask(): Promise<boolean> {
    if (this.managed.process !== undefined && this.state.phase === 'ready') return Promise.resolve(true)
    if (this.restartTimer !== undefined) clearTimeout(this.restartTimer)
    this.restartTimer = undefined
    this.stopping = false
    this.exitTimes = []
    this.restartDelay = this.restartBaseDelayMs
    this.emit({ phase: 'starting', stage: 'launching' })
    return new Promise<boolean>((resolve, reject) => {
      this.resolveReady = () => resolve(true)
      this.rejectReady = reject
      this.readyTimer = setTimeout(() => this.failStart(new Error(`cc-connect not ready within ${String(this.readyTimeoutMs)} ms`)), this.readyTimeoutMs)
      try {
        this.spawnOnce()
      } catch (error) {
        this.failStart(error)
      }
    })
  }

  stop(): Promise<void> {
    if (this.stopSlot.pending) return this.stopSlot.current!
    const task = (async () => {
      if (this.restartTimer !== undefined) clearTimeout(this.restartTimer)
      this.restartTimer = undefined
      this.stopping = true
      const reject = this.rejectReady
      if (reject !== undefined) {
        this.clearReadyAttempt()
        reject(new Error('cc-connect stopped before ready'))
      }
      await this.managed.stop(this.stopTimeoutMs)
      await this.logWriter.close()
      this.emit({ phase: this.enabled ? 'stopped' : 'disabled' })
    })()
    return this.stopSlot.track(task)
  }
}
