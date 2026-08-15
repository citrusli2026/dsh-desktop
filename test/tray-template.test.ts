import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTrayTemplate, type TrayTemplateActions } from '../src/main/tray-template.ts'

const actions: TrayTemplateActions = {
  toggleWindow() {}, restartHarness() {}, openLogs() {}, exportDiagnostics() {}, checkForUpdates() {}, quit() {},
}

test('tray labels follow locale and window visibility', () => {
  const menu = buildTrayTemplate('en', {
    harness: { phase: 'ready', url: 'http://127.0.0.1:3000' }, restarting: false, windowVisible: true,
  }, actions)
  assert.equal(menu[0]?.label, 'Hide dsh-desktop')
  assert.equal(menu[2]?.label, 'Status: Running')
  assert.equal(menu[3]?.enabled, true)
})

test('tray disables restart while starting and uses Chinese consistently', () => {
  const menu = buildTrayTemplate('zh', { harness: { phase: 'starting' }, restarting: false, windowVisible: false }, actions)
  assert.equal(menu[0]?.label, '显示 dsh-desktop')
  assert.equal(menu[2]?.label, '状态：正在启动…')
  assert.equal(menu[3]?.enabled, false)
})
