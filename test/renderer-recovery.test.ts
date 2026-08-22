import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_RENDERER_RECOVERIES, RECOVERY_WINDOW_MS, recordRendererRecovery } from '../src/main/renderer-recovery.ts'

test('first failure starts the budget and is allowed', () => {
  const record = recordRendererRecovery(undefined, 1_000)
  assert.deepEqual(record.times, [1_000])
  assert.equal(record.allowed, true)
})

test('recoveries inside the window count up to the limit', () => {
  let record = recordRendererRecovery(undefined, 1_000)
  for (let i = 2; i <= MAX_RENDERER_RECOVERIES; i += 1) {
    record = recordRendererRecovery(record.times, 1_000 + i * 1_000)
    assert.equal(record.allowed, true, `attempt ${i} is inside the budget`)
  }
  record = recordRendererRecovery(record.times, 1_000 + (MAX_RENDERER_RECOVERIES + 1) * 1_000)
  assert.equal(record.allowed, false, `attempt ${MAX_RENDERER_RECOVERIES + 1} exceeds the budget`)
})

test('stale recoveries age out of the rolling window', () => {
  let record = recordRendererRecovery(undefined, 1_000)
  record = recordRendererRecovery(record.times, 2_000)
  record = recordRendererRecovery(record.times, 3_000)
  assert.equal(record.allowed, false, 'three rapid failures exhaust the budget')
  const later = RECOVERY_WINDOW_MS + 10_000
  record = recordRendererRecovery(record.times, later)
  assert.equal(record.allowed, true, 'the window rolled over')
  assert.deepEqual(record.times, [later], 'only the fresh timestamp remains')
})
