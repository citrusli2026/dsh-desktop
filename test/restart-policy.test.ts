/**
 * Unit tests for the supervisor's pure restart policy (src/main/restart-policy.ts).
 * Run with `pnpm run test` (node --test; Node >= 22.19 strips the types natively).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decideRestart,
  exitsInWindow,
  MAX_RESTARTS_IN_WINDOW,
  nextRestartDelay,
  parseReadyUrl,
  RESTART_BASE_DELAY_MS,
  RESTART_MAX_DELAY_MS,
  RESTART_WINDOW_MS,
} from '../src/main/restart-policy.ts'

test('parseReadyUrl extracts the loopback URL from the contract line', () => {
  assert.equal(parseReadyUrl('dsh web: http://127.0.0.1:55886'), 'http://127.0.0.1:55886')
  // Trailing output on the same line is tolerated.
  assert.equal(parseReadyUrl('dsh web: http://127.0.0.1:3080 (ctrl-click)'), 'http://127.0.0.1:3080')
})

test('parseReadyUrl rejects non-contract lines and non-loopback URLs', () => {
  assert.equal(parseReadyUrl('dsh web: http://0.0.0.0:3080'), undefined)
  assert.equal(parseReadyUrl('dsh web: https://127.0.0.1:3080'), undefined)
  assert.equal(parseReadyUrl('listening on http://127.0.0.1:3080'), undefined)
  assert.equal(parseReadyUrl(''), undefined)
})

test('exitsInWindow drops timestamps older than the rolling window', () => {
  const now = 1_000_000_000
  const inside = [now - 1000, now - RESTART_WINDOW_MS, now]
  const outside = [now - RESTART_WINDOW_MS - 1, 0]
  assert.deepEqual(exitsInWindow([...outside, ...inside], now), inside)
  assert.deepEqual(exitsInWindow([], now), [])
})

test('nextRestartDelay doubles from the base and caps at the max', () => {
  let delay = RESTART_BASE_DELAY_MS
  const seen = [delay]
  for (let i = 0; i < 6; i += 1) {
    delay = nextRestartDelay(delay)
    seen.push(delay)
  }
  assert.deepEqual(seen, [2000, 4000, 8000, 16000, 30000, 30000, 30000])
  assert.equal(RESTART_MAX_DELAY_MS, 30_000)
})

test('decideRestart restarts within budget and gives up beyond it', () => {
  const within = decideRestart(MAX_RESTARTS_IN_WINDOW, RESTART_BASE_DELAY_MS)
  assert.deepEqual(within, { action: 'restart', delay: RESTART_BASE_DELAY_MS * 2 })

  const beyond = decideRestart(MAX_RESTARTS_IN_WINDOW + 1, RESTART_BASE_DELAY_MS)
  assert.deepEqual(beyond, { action: 'gaveUp', attempts: MAX_RESTARTS_IN_WINDOW + 1 })
})
