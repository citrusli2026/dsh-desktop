/**
 * Application menu and About surface: replaces Electron's default menu
 * (labeled "Electron" in dev, English-only roles elsewhere) with branded
 * Chinese-labeled menus, project links under 帮助, and a versioned About
 * surface — the native panel on macOS, a dialog on Windows/Linux.
 * @module main/menu
 */
import { app, dialog, Menu, nativeImage, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { splitCompositeVersion } from './update-check.ts'

const REPO_URL = 'https://github.com/citrusli2026/dsh-electron-shell'
const RELEASES_URL = `${REPO_URL}/releases`
const ISSUES_URL = `${REPO_URL}/issues`
const UPSTREAM_URL = 'https://github.com/deepseek-ai/deepseek-harness'

/** Version facts block shared by the About panel (macOS) and dialog. */
function aboutDetail(): string {
  const version = app.getVersion()
  const composite = splitCompositeVersion(version)
  const lines = [`版本 v${version}`]
  if (composite !== undefined) {
    lines.push(`内置 DeepSeek Harness ${composite.dsh}(壳修订 ${composite.shellRev})`)
  }
  lines.push(
    `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
    '',
    'DeepSeek Harness 的非官方社区桌面打包(MIT),与 DeepSeek 无关联。',
  )
  return lines.join('\n')
}

/** App icon for the About dialog (icon.png ships in the asar, see electron-builder.yml). */
function iconImage(): Electron.NativeImage {
  return nativeImage.createFromPath(join(app.getAppPath(), 'build', 'icon.png'))
}

/** About dialog for Windows/Linux; macOS uses the native panel instead. */
export async function showAboutDialog(): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: '关于 dsh-desktop',
    message: 'dsh-desktop',
    detail: aboutDetail(),
    icon: iconImage(),
    buttons: ['打开项目主页', '好'],
    defaultId: 1,
    cancelId: 1,
  })
  if (response === 0) void shell.openExternal(REPO_URL)
}

/** Native About panel content (macOS only; the panel shows name, version, website). */
export function configureAboutPanel(): void {
  if (process.platform !== 'darwin') return
  const composite = splitCompositeVersion(app.getVersion())
  app.setAboutPanelOptions({
    applicationName: 'dsh-desktop',
    applicationVersion: app.getVersion(),
    version: composite === undefined ? `Electron ${process.versions.electron}` : `dsh ${composite.dsh} · Electron ${process.versions.electron}`,
    copyright: 'MIT · 非官方社区打包,与 DeepSeek 无关联',
    credits: '内置 DeepSeek Harness(上游,MIT)',
    website: REPO_URL,
    iconPath: join(app.getAppPath(), 'build', 'icon.png'),
  })
}

/**
 * Install the branded application menu. Called on every ready (including
 * smoke runs, so CI exercises this path headlessly).
 */
export function installAppMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about', label: '关于 dsh-desktop' },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    })
  }

  template.push({
    label: '编辑',
    submenu: [
      { role: 'undo', label: '撤销' },
      { role: 'redo', label: '重做' },
      { type: 'separator' },
      { role: 'cut', label: '剪切' },
      { role: 'copy', label: '拷贝' },
      { role: 'paste', label: '粘贴' },
      { role: 'selectAll', label: '全选' },
    ],
  })

  const viewSubmenu: MenuItemConstructorOptions[] = []
  if (!app.isPackaged) {
    viewSubmenu.push(
      { role: 'reload', label: '重新加载' },
      { role: 'toggleDevTools', label: '开发者工具' },
      { type: 'separator' },
    )
  }
  viewSubmenu.push(
    { role: 'resetZoom', label: '实际大小' },
    { role: 'zoomIn', label: '放大' },
    { role: 'zoomOut', label: '缩小' },
    { type: 'separator' },
    { role: 'togglefullscreen', label: '切换全屏' },
  )
  template.push({ label: '视图', submenu: viewSubmenu })

  const windowSubmenu: MenuItemConstructorOptions[] = [{ role: 'minimize', label: '最小化' }]
  if (isMac) {
    windowSubmenu.push(
      { role: 'zoom', label: '缩放' },
      { type: 'separator' },
      { role: 'front', label: '全部置于顶层' },
    )
  }
  template.push({ label: '窗口', submenu: windowSubmenu })

  const helpSubmenu: MenuItemConstructorOptions[] = [
    { label: '项目主页(GitHub)', click: () => { void shell.openExternal(REPO_URL) } },
    { label: '下载最新版', click: () => { void shell.openExternal(RELEASES_URL) } },
    { label: '报告问题', click: () => { void shell.openExternal(ISSUES_URL) } },
    { type: 'separator' },
    { label: 'DeepSeek Harness(上游)', click: () => { void shell.openExternal(UPSTREAM_URL) } },
  ]
  if (!isMac) {
    helpSubmenu.push(
      { type: 'separator' },
      { label: '关于 dsh-desktop', click: () => { void showAboutDialog() } },
    )
  }
  template.push({ label: '帮助', submenu: helpSubmenu })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
