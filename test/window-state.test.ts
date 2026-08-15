/**
 * Unit tests for the pure window-state geometry (src/main/window-state.ts).
 * Run with `pnpm run test` (node --test; Node >= 22.19 strips the types natively).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  fitWindowState,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
} from '../src/main/window-state.ts'

const DISPLAY = { x: 0, y: 0, width: 2560, height: 1415 }

test('fitWindowState keeps a valid persisted state', () => {
  assert.deepEqual(
    fitWindowState({ width: 1600, height: 1000, x: 100, y: 80, isMaximized: false }, [DISPLAY]),
    { width: 1600, height: 1000, x: 100, y: 80 },
  )
})

test('fitWindowState falls back to defaults on malformed input', () => {
  assert.deepEqual(fitWindowState(undefined, [DISPLAY]), { width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT })
  assert.deepEqual(fitWindowState(null, [DISPLAY]), { width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT })
  assert.deepEqual(fitWindowState('junk', [DISPLAY]), { width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT })
  assert.deepEqual(fitWindowState({}, [DISPLAY]), { width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT })
})

test('fitWindowState clamps sizes to the window minimums', () => {
  assert.deepEqual(
    fitWindowState({ width: 100, height: 50 }, [DISPLAY]),
    { width: MIN_WINDOW_WIDTH, height: MIN_WINDOW_HEIGHT },
  )
})

test('fitWindowState drops a position that no display still shows', () => {
  // Monitor unplugged since the state was written: x/y far off-screen.
  assert.deepEqual(
    fitWindowState({ width: 1280, height: 860, x: 5000, y: 3000 }, [DISPLAY]),
    { width: 1280, height: 860 },
  )
  // No displays at all (headless corner): same fallback.
  assert.deepEqual(
    fitWindowState({ width: 1280, height: 860, x: 100, y: 100 }, []),
    { width: 1280, height: 860 },
  )
})

test('fitWindowState keeps a position visible on any one display', () => {
  const second = { x: 2560, y: 0, width: 1920, height: 1040 }
  assert.deepEqual(
    fitWindowState({ width: 1280, height: 860, x: 2600, y: 100 }, [DISPLAY, second]),
    { width: 1280, height: 860, x: 2600, y: 100 },
  )
})

test('fitWindowState keeps the maximized flag and rounds fractional values', () => {
  assert.deepEqual(
    fitWindowState({ width: 1280.6, height: 860.4, x: 10.6, y: 20.2, isMaximized: true }, [DISPLAY]),
    { width: 1281, height: 860, x: 11, y: 20, isMaximized: true },
  )
})
