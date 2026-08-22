/**
 * Pure renderer-recovery budget for the main window: how many times the
 * window may self-recover within a rolling window before giving up and
 * showing the error page. Extracted from window.ts so the "2 strikes in
 * 5 minutes" rule is unit-testable without Electron.
 * @module main/renderer-recovery
 */

/** Rolling window for renderer recoveries. */
export const RECOVERY_WINDOW_MS = 5 * 60_000

/** Recovery attempts allowed inside the window before the error page. */
export const MAX_RENDERER_RECOVERIES = 2

export interface RecoveryRecord {
  /** Recovery timestamps still inside the rolling window, newest last. */
  times: number[]
  /** Whether another recovery is still allowed. */
  allowed: boolean
}

/**
 * Record one renderer failure against the budget.
 * @param times - previous recovery timestamps (may be undefined on first use).
 * @param now - current clock, injected for determinism.
 */
export function recordRendererRecovery(times: readonly number[] | undefined, now: number): RecoveryRecord {
  const recent = (times ?? []).filter(time => now - time <= RECOVERY_WINDOW_MS)
  recent.push(now)
  return { times: recent, allowed: recent.length <= MAX_RENDERER_RECOVERIES }
}
