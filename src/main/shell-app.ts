/**
 * Shell state machine: owns the harness lifecycle state, the restart flow
 * (with its single-flight dedup), and the boot path — the core behavior that
 * used to live untested in index.ts's module-level mutable state. All
 * Electron touchpoints (windows, menu, tray, dialogs, LAN service) are
 * injected through {@link ShellAppServices}, so this module is unit-testable
 * without Electron.
 * @module main/shell-app
 */
import type { HarnessState, HarnessSupervisor } from './supervisor.ts'

export interface ShellAppServices {
  /** Build a fresh supervisor that reports transitions through `onState`. */
  createSupervisor(onState: (state: HarnessState) => void): HarnessSupervisor
  /** Side effects of a state change: page loads and native-surface refreshes. */
  onStateApplied(state: HarnessState): void
  /** Called when the restart in-flight flag flips (menu/tray refresh). */
  onRestartBusyChanged(): void
  /** Restart the LAN proxy after the harness moved to a new ready URL. */
  restartLanProxy(): Promise<unknown>
  /** Ask the user to confirm a manual restart; false cancels. */
  confirmRestart(): Promise<boolean>
}

/** A shell-owned frame is one of our data:-URL pages, never the harness UI. */
export function isShellOwnedFrame(url: string | undefined): boolean {
  return typeof url === 'string' && url.startsWith('data:')
}

/** The minimal window surface the IPC guard needs, so it stays unit-testable. */
export interface ShellIpcWindow {
  isDestroyed(): boolean
  webContents: unknown
}

/**
 * Guard for the shell-owned IPC channels: accept the call only when the main
 * window exists, the sender is its webContents, and the frame is one of our
 * data:-URL pages. A compromised or curious harness page can never invoke
 * shell restarts or dialogs. See the `isShellOwnedFrame` doc for the threat
 * model; the three ipcMain handlers in index.ts delegate to this.
 */
export function isMainWindowSender(window: ShellIpcWindow | undefined, sender: unknown, frameUrl: string | undefined): boolean {
  if (window === undefined || window.isDestroyed()) return false
  if (sender !== window.webContents || !isShellOwnedFrame(frameUrl)) return false
  return true
}

export class ShellApp {
  private readonly services: ShellAppServices
  private supervisor: HarnessSupervisor | undefined
  private currentState: HarnessState | undefined
  private restartTask: Promise<boolean> | undefined

  constructor(services: ShellAppServices) {
    this.services = services
  }

  /** The latest harness lifecycle state, for surfaces that render it. */
  get state(): HarnessState | undefined {
    return this.currentState
  }

  /** Whether a manual restart is currently in flight. */
  get restartInFlight(): boolean {
    return this.restartTask !== undefined
  }

  /** The live supervisor instance (for diagnostics and quit). */
  get supervisorInstance(): HarnessSupervisor | undefined {
    return this.supervisor
  }

  /** A restart is allowed when the harness has a state and is not still starting. */
  restartEnabled(): boolean {
    return this.restartTask === undefined && this.currentState !== undefined && this.currentState.phase !== 'starting'
  }

  /**
   * Record a harness state transition and propagate it. When the harness
   * moves to a new ready URL while the LAN proxy is up, the proxy must be
   * restarted so phones keep proxying to the live instance.
   */
  applyState(state: HarnessState): void {
    const previousTarget = this.currentState?.phase === 'ready' ? this.currentState.url : undefined
    this.currentState = state
    if (state.phase === 'ready' && previousTarget !== undefined && previousTarget !== state.url) {
      void this.services.restartLanProxy().catch(error => {
        console.warn(`dsh-desktop: LAN proxy restart failed: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
    this.services.onStateApplied(state)
  }

  /**
   * Restart the harness: stop the current supervisor, build a fresh one, and
   * start it. Single-flight: concurrent callers share one restart. On start
   * failure the shell reports the crashed state and resolves false.
   */
  runHarnessRestart(): Promise<boolean> {
    if (this.restartTask !== undefined) return this.restartTask
    const task = Promise.resolve().then(async () => {
      await this.supervisor?.stop()
      this.supervisor = this.services.createSupervisor(state => this.applyState(state))
      try {
        await this.supervisor.start()
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.applyState({ phase: 'crashed', attempts: 0, logTail: message })
        return false
      }
    })
    this.restartTask = task.finally(() => {
      this.restartTask = undefined
      this.services.onRestartBusyChanged()
    })
    this.services.onRestartBusyChanged()
    return this.restartTask
  }

  /**
   * User-initiated restart: confirm first when the harness is ready (a crash
   * page retry skips the dialog and goes straight to {@link runHarnessRestart}).
   */
  async requestRestart(): Promise<void> {
    if (!this.restartEnabled()) return
    if (this.currentState?.phase === 'ready' && !(await this.services.confirmRestart())) return
    await this.runHarnessRestart()
  }

  /**
   * Boot the bundled harness. Reports `starting` → `ready` through
   * {@link applyState}; on failure reports the crashed state and rethrows so
   * the caller can decide the recovery path (error page vs smoke exit).
   * @returns the loopback URL the web UI is served at.
   */
  async startHarness(): Promise<string> {
    this.supervisor = this.services.createSupervisor(state => this.applyState(state))
    try {
      return await this.supervisor.start()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`dsh-desktop: ${message}`)
      this.applyState({ phase: 'crashed', attempts: 0, logTail: message })
      throw error
    }
  }

  /** Stop the harness for quit; safe to call when nothing is running. */
  async stopHarness(): Promise<void> {
    await this.supervisor?.stop()
  }
}
