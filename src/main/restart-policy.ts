/**
 * Pure restart-policy decisions for the harness supervisor, extracted so the
 * backoff/budget rules can be unit-tested without Electron or child processes
 * (test/restart-policy.test.ts). No imports, no I/O, no clock access — every
 * function takes `now` explicitly.
 * @module main/restart-policy
 */

/** Upstream readiness contract: one stdout line naming the loopback URL. */
const READY_LINE = /^dsh web: (http:\/\/127\.0\.0\.1:\d+(?:[/?][^\s)]*)?)/

/** Crash budget: at most this many unexpected exits inside the window. */
export const MAX_RESTARTS_IN_WINDOW = 5
export const RESTART_WINDOW_MS = 10 * 60_000
export const RESTART_BASE_DELAY_MS = 2_000
export const RESTART_MAX_DELAY_MS = 30_000

/**
 * Extract the ready URL from one harness output line. Preserve the query
 * string because current Harness releases use it for the browser trust token;
 * the shell separately derives and stores only the origin for IPC checks.
 * @returns the loopback URL, or undefined when the line is not the contract line.
 */
export function parseReadyUrl(line: string): string | undefined {
  return READY_LINE.exec(line)?.[1]
}

/**
 * Drop exit timestamps older than the rolling restart window.
 * @returns the timestamps still inside the window (input order preserved).
 */
export function exitsInWindow(exitTimes: readonly number[], now: number): number[] {
  const cutoff = now - RESTART_WINDOW_MS
  return exitTimes.filter(time => time >= cutoff)
}

/** Next backoff delay: doubles from the current one, capped at the max. */
export function nextRestartDelay(currentDelay: number): number {
  return Math.min(currentDelay * 2, RESTART_MAX_DELAY_MS)
}

export type RestartDecision =
  | { action: 'restart'; delay: number }
  | { action: 'gaveUp'; attempts: number }

/**
 * Decide the reaction to an unexpected harness exit.
 * @param attempts - unexpected exits inside the current restart window.
 * @param currentDelay - the backoff delay used for the previous restart.
 */
export function decideRestart(attempts: number, currentDelay: number): RestartDecision {
  if (attempts > MAX_RESTARTS_IN_WINDOW) return { action: 'gaveUp', attempts }
  return { action: 'restart', delay: nextRestartDelay(currentDelay) }
}
