import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statusLabel } from '../src/main/tray-status.ts'

test('statusLabel summarizes every supervisor phase', () => {
  assert.equal(statusLabel('en', undefined), 'Status: Starting…')
  assert.equal(statusLabel('zh', { phase: 'starting' }), '状态：正在启动…')
  assert.equal(statusLabel('en', { phase: 'ready', url: 'http://127.0.0.1:3000' }), 'Status: Running')
  assert.equal(statusLabel('zh', { phase: 'crashed', attempts: 6, logTail: 'tail' }), '状态：恢复已暂停（崩溃 6 次）')
  assert.equal(statusLabel('en', { phase: 'ready', url: 'http://127.0.0.1:3000' }, true), 'Status: Restarting…')
})
