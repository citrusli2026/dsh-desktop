import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { MenuItemConstructorOptions } from 'electron'
import { buildTrayTemplate, type TrayTemplateActions, type TrayTemplateState } from '../src/main/tray-template.ts'

const actions: TrayTemplateActions = {
  toggleWindow() {}, restartHarness() {}, openLogs() {}, exportDiagnostics() {}, checkForUpdates() {}, quit() {},
  showAbout() {}, openExternal() {},
  lan: { startLanLink() {}, showLanQr() {}, stopLanLink() {} },
}

function state(overrides: Partial<TrayTemplateState> = {}): TrayTemplateState {
  return {
    harness: { phase: 'ready', url: 'http://127.0.0.1:3000' },
    restarting: false,
    windowVisible: true,
    lan: { lanRunning: false, lanBusy: false },
    ...overrides,
  }
}

test('tray labels follow locale and window visibility', () => {
  const menu = buildTrayTemplate('en', state(), actions)
  assert.equal(menu[0]?.label, 'Hide dsh-desktop')
  assert.equal(menu[2]?.label, 'Status: Running')
  assert.equal(menu[3]?.enabled, true)
})

test('tray disables restart while starting and uses Chinese consistently', () => {
  const menu = buildTrayTemplate('zh', state({ harness: { phase: 'starting' }, windowVisible: false }), actions)
  assert.equal(menu[0]?.label, '显示 dsh-desktop')
  assert.equal(menu[2]?.label, '状态：正在启动…')
  assert.equal(menu[3]?.enabled, false)
})

test('tray offers the LAN start entry when link is stopped', () => {
  const menu = buildTrayTemplate('zh', state(), actions)
  const lan = menu.filter(item => item.label === '连接移动设备…')
  assert.equal(lan.length, 1)
  assert.equal(lan[0]?.enabled, true)
})

test('tray disables the LAN start entry while busy', () => {
  const menu = buildTrayTemplate('en', state({ lan: { lanRunning: false, lanBusy: true } }), actions)
  const lan = menu.filter(item => item.label === 'Connect a mobile device…')
  assert.equal(lan.length, 1)
  assert.equal(lan[0]?.enabled, false)
})

test('tray swaps LAN entries to QR and stop while running', () => {
  const menu = buildTrayTemplate('zh', state({ lan: { lanRunning: true, lanBusy: false } }), actions)
  const labels = menu.map(item => item.label)
  assert.ok(labels.includes('显示局域网配对二维码…'))
  assert.ok(labels.includes('停止局域网共享'))
  assert.ok(!labels.includes('连接移动设备…'))
})

test('tray offers community links and About on every platform', () => {
  const menu = buildTrayTemplate('zh', state(), actions)
  const community = menu.find(item => item.label === '社区')
  assert.ok(community !== undefined)
  assert.ok(Array.isArray(community.submenu))
  const submenu = community.submenu as MenuItemConstructorOptions[]
  assert.deepEqual(submenu.map(item => item.label), ['社区官网', '项目源代码', '反馈问题'])
  assert.ok(menu.some(item => item.label === '关于 dsh-desktop'))
})
