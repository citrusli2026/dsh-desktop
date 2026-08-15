import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { MenuItemConstructorOptions } from 'electron'
import { buildAppMenuTemplate, type MenuActions } from '../src/main/menu-template.ts'

const actions: MenuActions = {
  closeWindow() {}, quit() {}, toggleMaximize() {}, restartHarness() {}, openLogs() {},
  exportDiagnostics() {}, checkForUpdates() {}, showAbout() {}, openExternal() {},
}

function labels(items: readonly MenuItemConstructorOptions[]): string[] {
  const result: string[] = []
  for (const item of items) {
    if (item.label !== undefined) result.push(item.label)
    if (Array.isArray(item.submenu)) result.push(...labels(item.submenu))
  }
  return result
}

test('macOS Chinese menu is native-shaped and avoids links duplicated by About', () => {
  const template = buildAppMenuTemplate({ locale: 'zh', platform: 'darwin', packaged: true, appName: 'dsh-desktop' }, actions)
  assert.deepEqual(template.map(item => item.label), ['dsh-desktop', '文件', '编辑', '视图', '窗口', '帮助'])
  const all = labels(template)
  assert.ok(all.includes('关于 dsh-desktop'))
  assert.ok(all.includes('DeepSeek 官方网站'))
  assert.ok(all.includes('项目源代码'))
  assert.ok(!all.includes('dsh-desktop 官网（社区）'))
  assert.ok(!all.includes('DeepSeek Harness 官方页'))
  assert.ok(all.includes('服务'))
  assert.ok(all.includes('关闭窗口'))
  assert.ok(all.includes('删除'))
  assert.ok(!all.includes('开发者工具'))
})

test('Windows English menu has a reliable quit path and disables restart while unavailable', () => {
  const template = buildAppMenuTemplate({
    locale: 'en', platform: 'win32', packaged: true, appName: 'dsh-desktop', restartEnabled: false,
  }, actions)
  assert.deepEqual(template.map(item => item.label), ['File', 'Edit', 'View', 'Window', 'Help'])
  const all = labels(template)
  assert.ok(all.includes('Quit dsh-desktop'))
  assert.ok(all.includes('Close Window'))
  const help = template.at(-1)?.submenu
  assert.ok(Array.isArray(help))
  assert.equal(help.find(item => item.label === 'Restart Harness…')?.enabled, false)
})

test('developer actions appear only in unpackaged builds', () => {
  const template = buildAppMenuTemplate({ locale: 'en', platform: 'linux', packaged: false, appName: 'dsh-desktop' }, actions)
  assert.ok(labels(template).includes('Developer Tools'))
  assert.ok(labels(template).includes('Reload'))
})
