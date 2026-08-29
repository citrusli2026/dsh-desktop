import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { MenuItemConstructorOptions } from 'electron'
import { buildAppMenuTemplate, buildLanMenuItems, type MenuActions } from '../src/main/menu-template.ts'

const actions: MenuActions = {
  showWindow() {},
  closeWindow() {}, quit() {}, toggleMaximize() {}, restartHarness() {}, toggleSafeMode() {},
  checkForUpdates() {}, showAbout() {}, openExternal() {},
  startLanLink() {}, showLanQr() {}, stopLanLink() {},
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
  assert.deepEqual(template.map(item => item.label), ['dsh-desktop', '文件', '编辑', '视图', '窗口', '扩展', '帮助'])
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
  assert.deepEqual(template.map(item => item.label), ['File', 'Edit', 'View', 'Window', 'Extensions', 'Help'])
  const all = labels(template)
  assert.ok(all.includes('Quit dsh-desktop'))
  assert.ok(all.includes('Close Window'))
  const help = template.at(-1)?.submenu
  assert.ok(Array.isArray(help))
  const summon = help.find(item => item.label === 'Show dsh-desktop')
  assert.equal(summon?.accelerator, 'CommandOrControl+Shift+Space')
  assert.equal(help.find(item => item.label === 'Restart Harness…')?.enabled, false)
})

test('developer actions appear only in unpackaged builds', () => {
  const template = buildAppMenuTemplate({ locale: 'en', platform: 'linux', packaged: false, appName: 'dsh-desktop' }, actions)
  assert.ok(labels(template).includes('Developer Tools'))
  assert.ok(labels(template).includes('Reload'))
})

test('extensions menu exposes LAN pairing controls', () => {
  const stopped = buildAppMenuTemplate({ locale: 'zh', platform: 'linux', packaged: true, appName: 'dsh-desktop' }, actions)
  assert.ok(labels(stopped).includes('扩展'))
  assert.ok(labels(stopped).includes('连接移动设备…'))

  const busy = buildAppMenuTemplate({
    locale: 'zh', platform: 'linux', packaged: true, appName: 'dsh-desktop', lanBusy: true,
  }, actions)
  const busyLan = busy.find(item => item.label === '扩展')?.submenu
  assert.ok(Array.isArray(busyLan))
  const startItem = busyLan.find((item: any) => item.label === '连接移动设备…')
  assert.equal(startItem?.enabled, false)

  const english = buildAppMenuTemplate({ locale: 'en', platform: 'linux', packaged: true, appName: 'dsh-desktop' }, actions)
  assert.ok(labels(english).includes('Connect a mobile device…'))

  const running = buildAppMenuTemplate({
    locale: 'zh', platform: 'linux', packaged: true, appName: 'dsh-desktop', lanRunning: true,
  }, actions)
  assert.ok(labels(running).includes('显示局域网配对二维码…'))
  assert.ok(labels(running).includes('停止局域网共享'))
  assert.ok(!labels(running).includes('连接移动设备…'))
})

test('extensions menu mirrors the desktop-controls overlay (pairing, Safe Mode, restart, About)', () => {
  const inactive = buildAppMenuTemplate({ locale: 'zh', platform: 'linux', packaged: true, appName: 'dsh-desktop' }, actions)
  const extensions = inactive.find(item => item.label === '扩展')?.submenu
  assert.ok(Array.isArray(extensions))
  assert.ok(labels(extensions).includes('连接移动设备…'))
  assert.ok(labels(extensions).includes('以安全模式启动'))
  assert.ok(labels(extensions).includes('重启 Harness…'))
  assert.ok(labels(extensions).includes('关于 dsh-desktop'))
  assert.ok(!labels(extensions).includes('切换全屏'))
  assert.ok(!labels(extensions).includes('打开日志目录'))
  assert.ok(!labels(extensions).includes('导出诊断报告…'))

  const active = buildAppMenuTemplate({
    locale: 'zh', platform: 'linux', packaged: true, appName: 'dsh-desktop', safeMode: true,
  }, actions)
  const activeExtensions = active.find(item => item.label === '扩展')?.submenu
  assert.ok(Array.isArray(activeExtensions))
  assert.ok(labels(activeExtensions).includes('退出安全模式'))
})

test('extensions menu disables restart while the harness cannot restart', () => {
  const template = buildAppMenuTemplate({
    locale: 'zh', platform: 'linux', packaged: true, appName: 'dsh-desktop', restartEnabled: false,
  }, actions)
  const extensions = template.find(item => item.label === '扩展')?.submenu
  assert.ok(Array.isArray(extensions))
  const restart = extensions.find(item => item.label === '重启 Harness…')
  assert.equal(restart?.enabled, false)
})

test('help menu leaves logs and diagnostics to the About dialog', () => {
  const template = buildAppMenuTemplate({ locale: 'zh', platform: 'linux', packaged: true, appName: 'dsh-desktop' }, actions)
  assert.ok(!labels(template).includes('打开日志目录'))
  assert.ok(!labels(template).includes('导出诊断报告…'))
})

test('lan menu items keep a stable shape for context-menu reuse', () => {
  const stopped = buildLanMenuItems('en', { lanRunning: false, lanBusy: false }, actions)
  assert.deepEqual(stopped.map(item => item.label), ['Connect a mobile device…'])
  assert.equal(stopped[0]?.enabled, true)

  const busy = buildLanMenuItems('en', { lanRunning: false, lanBusy: true }, actions)
  assert.equal(busy[0]?.enabled, false)

  const running = buildLanMenuItems('zh', { lanRunning: true, lanBusy: false }, actions)
  assert.equal(running[0]?.label, '显示局域网配对二维码…')
  assert.equal(running[1]?.type, 'separator')
  assert.equal(running[2]?.label, '停止局域网共享')
})
