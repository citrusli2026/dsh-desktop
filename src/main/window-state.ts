/**
 * Pure window-state geometry for the persisted size/position of the main
 * window. No imports, no I/O, no clock access — Electron reading/writing
 * lives in index.ts so these rules stay unit-testable
 * (test/window-state.test.ts).
 * @module main/window-state
 */

/** Persisted shape of the main window's normal (un-maximized) bounds. */
export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized?: boolean
}

/** A display's work area, reduced to what the fit check needs. */
export interface DisplayArea {
  x: number
  y: number
  width: number
  height: number
}

/** First-launch geometry, matching the historical createWindow values. */
export const DEFAULT_WINDOW_WIDTH = 1280
export const DEFAULT_WINDOW_HEIGHT = 860
export const MIN_WINDOW_WIDTH = 960
export const MIN_WINDOW_HEIGHT = 640

/** How much of the window must stay on some display to reuse a saved x/y. */
const MIN_VISIBLE_PX = 100

/** Overlap between the candidate window rect and one display's work area. */
function isVisibleOn(state: { width: number; height: number; x: number; y: number }, area: DisplayArea): boolean {
  const overlapWidth = Math.min(state.x + state.width, area.x + area.width) - Math.max(state.x, area.x)
  const overlapHeight = Math.min(state.y + state.height, area.y + area.height) - Math.max(state.y, area.y)
  return overlapWidth >= MIN_VISIBLE_PX && overlapHeight >= MIN_VISIBLE_PX
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Validate a persisted state against the current displays. Malformed input
 * falls back to the defaults; sizes are clamped to the window minimums; a
 * saved position is reused only when at least MIN_VISIBLE_PX of the window
 * would still be visible on some connected display (a monitor may have been
 * unplugged since the state was written).
 * @param input - raw JSON-parsed content of window-state.json (untrusted).
 * @param displays - work areas of the currently connected displays.
 * @returns a state safe to hand to BrowserWindow.
 */
export function fitWindowState(input: unknown, displays: readonly DisplayArea[]): WindowState {
  if (typeof input !== 'object' || input === null) {
    return { width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT }
  }
  const candidate = input as Record<string, unknown>
  const width = finiteNumber(candidate.width)
    ? Math.max(Math.round(candidate.width), MIN_WINDOW_WIDTH)
    : DEFAULT_WINDOW_WIDTH
  const height = finiteNumber(candidate.height)
    ? Math.max(Math.round(candidate.height), MIN_WINDOW_HEIGHT)
    : DEFAULT_WINDOW_HEIGHT
  const result: WindowState = { width, height }
  const { x, y } = candidate
  if (finiteNumber(x) && finiteNumber(y)) {
    const position = { width, height, x: Math.round(x), y: Math.round(y) }
    if (displays.some(area => isVisibleOn(position, area))) {
      result.x = position.x
      result.y = position.y
    }
  }
  if (candidate.isMaximized === true) result.isMaximized = true
  return result
}
