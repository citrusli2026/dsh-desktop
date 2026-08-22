/**
 * Deep child-process lifecycle primitive shared by the harness supervisor and
 * the LAN proxy service. Both previously re-implemented the same machinery —
 * spawn slots, in-flight start/stop tracking, SIGTERM→SIGKILL escalation, and
 * the Windows tree sweep — with subtly different variants. This module owns
 * that machinery once; the two services keep only their domain logic
 * (restart budget / pairing window) as thin adapters.
 * @module main/process-lifecycle
 */
import { spawn, type ChildProcess } from 'node:child_process'

export interface SpawnProcessOptions {
  command: string
  args: readonly string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  windowsHide?: boolean
}

/**
 * One child-process slot that survives restarts: `spawn()` replaces the slot,
 * an exit clears it, and `stop()` performs the shared graceful-shutdown
 * sequence (SIGTERM, SIGKILL after the grace budget, and a `taskkill /T /F`
 * tree sweep on Windows so grandchildren cannot outlive the app).
 */
export class ManagedChild {
  private child: ChildProcess | undefined
  private stopTask: Promise<void> | undefined

  /** The current child, or undefined when none is running. */
  get process(): ChildProcess | undefined {
    return this.child
  }

  /** Whether a child exists and has not exited yet. */
  get running(): boolean {
    return this.child !== undefined && this.child.exitCode === null
  }

  /**
   * Spawn the next child, replacing the previous slot. The caller wires its
   * own stdout/stderr consumption and error/exit observers on the returned
   * process; slot bookkeeping (exit clears the slot) is this module's job.
   */
  spawn(options: SpawnProcessOptions): ChildProcess {
    const child = spawn(options.command, options.args, {
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: options.windowsHide ?? true,
    })
    this.child = child
    child.once('exit', () => {
      if (this.child === child) this.child = undefined
    })
    return child
  }

  /**
   * Stop the current child: SIGTERM, then SIGKILL once `graceMs` elapses, and
   * on Windows a taskkill tree sweep so shell sessions and subagents do not
   * survive a quit. Safe to call with no child running; never rejects;
   * concurrent calls while a stop is in flight share that one stop (a later
   * call after it settled starts a fresh stop for whatever child is current).
   */
  stop(graceMs: number): Promise<void> {
    if (this.stopTask !== undefined) return this.stopTask
    const child = this.child
    if (child === undefined || child.exitCode !== null) return Promise.resolve()
    const task = new Promise<void>(resolve => {
      const killTimer = setTimeout(() => child.kill('SIGKILL'), graceMs)
      killTimer.unref()
      child.once('exit', () => {
        clearTimeout(killTimer)
        resolve()
      })
      // SIGTERM on Windows is TerminateProcess for the direct child only;
      // sweep the whole tree so grandchildren do not survive an app quit.
      child.kill('SIGTERM')
      if (process.platform === 'win32' && child.pid !== undefined) {
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      }
    })
    this.stopTask = task
    void task.then(
      () => this.finishStop(task),
      () => this.finishStop(task),
    )
    return task
  }

  private finishStop(task: Promise<void>): void {
    if (this.stopTask === task) this.stopTask = undefined
  }
}

/**
 * In-flight dedup for one async slot: a long-running start (or stop) is
 * started once and shared by every concurrent caller, then cleared when it
 * settles so the next call starts fresh.
 */
export class InFlight<T> {
  private task: Promise<T> | undefined

  /** Whether an operation is currently in flight. */
  get pending(): boolean {
    return this.task !== undefined
  }

  /** The shared in-flight operation, or undefined when idle. */
  get current(): Promise<T> | undefined {
    return this.task
  }

  /** Record `task` as the shared in-flight operation and return it. */
  track(task: Promise<T>): Promise<T> {
    this.task = task
    void task.then(
      () => this.settle(task),
      () => this.settle(task),
    )
    return task
  }

  private settle(task: Promise<T>): void {
    if (this.task === task) this.task = undefined
  }
}
