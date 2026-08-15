import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statusLabel } from '../src/main/tray-status.ts'

test('statusLabel summarizes every supervisor phase', () => {
  assert.equal(statusLabel(undefined), '状态:启动中…')
  assert.equal(statusLabel({ phase: 'starting' }), '状态:启动中…')
  assert.equal(statusLabel({ phase: 'ready', url: 'http://127.0.0.1:3000' }), '状态:运行中')
  assert.equal(statusLabel({ phase: 'crashed', attempts: 6, logTail: 'tail' }), '状态:已崩溃(6 次)')
})
