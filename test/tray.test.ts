import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statusLabel } from '../src/main/tray-status.ts'

test('statusLabel summarizes every supervisor phase', () => {
  assert.equal(statusLabel('en', undefined), 'Status: Starting…')
  assert.equal(statusLabel('zh', { phase: 'starting' }), '状态：正在启动…')
  assert.equal(statusLabel('en', { phase: 'starting', stage: 'launching' }), 'Status: Launching runtime…')
  assert.equal(statusLabel('zh', { phase: 'starting', stage: 'waiting-for-ready' }), '状态：等待 Harness 就绪…')
  assert.equal(statusLabel('en', { phase: 'starting', stage: 'retrying', attempts: 2, retryDelayMs: 4_000 }), 'Status: Retrying Harness… (attempt 2, 4s)')
  assert.equal(statusLabel('en', { phase: 'ready', url: 'http://127.0.0.1:3000' }), 'Status: Running')
  assert.equal(statusLabel('zh', { phase: 'crashed', attempts: 6, logTail: 'tail' }), '状态：恢复已暂停（崩溃 6 次）')
  assert.equal(statusLabel('en', { phase: 'ready', url: 'http://127.0.0.1:3000' }, true), 'Status: Restarting…')
})
