/** Pure, platform-aware application-menu template. */
import type { MenuItemConstructorOptions } from 'electron'
import { shellText, type ShellLocale } from './locale.ts'
import {
  DEEPSEEK_OFFICIAL_URL,
  PROJECT_ISSUES_URL,
  PROJECT_REPO_URL,
} from './links.ts'

export interface MenuActions {
  closeWindow(): void
  quit(): void
  toggleMaximize(): void
  restartHarness(): void
  openLogs(): void
  exportDiagnostics(): void
  checkForUpdates(): void
  showAbout(): void
  openExternal(url: string): void
  startLanLink(): void
  showLanQr(): void
  stopLanLink(): void
}

export interface MenuEnvironment {
  locale: ShellLocale
  platform: NodeJS.Platform
  packaged: boolean
  appName: string
  restartEnabled?: boolean
  lanRunning?: boolean
  lanBusy?: boolean
}

export function buildAppMenuTemplate(environment: MenuEnvironment, actions: MenuActions): MenuItemConstructorOptions[] {
  const { locale, platform, packaged, appName, restartEnabled = true, lanRunning = false, lanBusy = false } = environment
  const t = (key: Parameters<typeof shellText>[1]): string => shellText(locale, key)
  const isMac = platform === 'darwin'
  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: appName,
      submenu: [
        { label: t('app.about'), click: actions.showAbout },
        { label: t('app.checkUpdates'), click: actions.checkForUpdates },
        { type: 'separator' },
        { role: 'services', label: t('app.services'), submenu: [] },
        { type: 'separator' },
        { role: 'hide', label: t('app.hide') },
        { role: 'hideOthers', label: t('app.hideOthers') },
        { role: 'unhide', label: t('app.showAll') },
        { type: 'separator' },
        { role: 'quit', label: t('app.quit') },
      ],
    })
  }

  template.push({
    label: t('menu.file'),
    submenu: [
      { label: t('menu.closeWindow'), accelerator: 'CmdOrCtrl+W', click: actions.closeWindow },
      ...(!isMac ? [
        { type: 'separator' } as MenuItemConstructorOptions,
        { label: t('app.quit'), accelerator: 'CmdOrCtrl+Q', click: actions.quit } as MenuItemConstructorOptions,
      ] : []),
    ],
  })

  template.push({
    label: t('menu.edit'),
    submenu: [
      { role: 'undo', label: t('menu.undo') },
      { role: 'redo', label: t('menu.redo') },
      { type: 'separator' },
      { role: 'cut', label: t('menu.cut') },
      { role: 'copy', label: t('menu.copy') },
      { role: 'paste', label: t('menu.paste') },
      ...(isMac ? [{ role: 'pasteAndMatchStyle', label: t('menu.pasteMatchStyle') } as MenuItemConstructorOptions] : []),
      { role: 'delete', label: t('menu.delete') },
      { role: 'selectAll', label: t('menu.selectAll') },
    ],
  })

  const view: MenuItemConstructorOptions[] = []
  if (!packaged) {
    view.push(
      { role: 'reload', label: t('menu.reload') },
      { role: 'toggleDevTools', label: t('menu.devTools') },
      { type: 'separator' },
    )
  }
  view.push(
    { role: 'resetZoom', label: t('menu.actualSize') },
    { role: 'zoomIn', label: t('menu.zoomIn') },
    { role: 'zoomOut', label: t('menu.zoomOut') },
    { type: 'separator' },
    { role: 'togglefullscreen', label: t('menu.fullScreen') },
  )
  template.push({ label: t('menu.view'), submenu: view })

  template.push({
    label: t('menu.window'),
    submenu: [
      { role: 'minimize', label: t('menu.minimize') },
      ...(isMac
        ? [
            { role: 'zoom', label: t('menu.maximize') } as MenuItemConstructorOptions,
            { type: 'separator' } as MenuItemConstructorOptions,
            { role: 'front', label: t('menu.bringAllToFront') } as MenuItemConstructorOptions,
          ]
        : [{ label: t('menu.maximize'), click: actions.toggleMaximize }]),
    ],
  })

  template.push({
    label: t('menu.extensions'),
    submenu: lanRunning
      ? [
          { label: t('menu.showLanQr'), click: actions.showLanQr },
          { type: 'separator' },
          { label: t('menu.stopLanLink'), click: actions.stopLanLink },
        ]
      : [{ label: t('menu.startLanLink'), enabled: !lanBusy, click: actions.startLanLink }],
  })

  const help: MenuItemConstructorOptions[] = []
  if (!isMac) help.push({ label: t('app.checkUpdates'), click: actions.checkForUpdates }, { type: 'separator' })
  help.push(
    { label: t('menu.restartHarness'), enabled: restartEnabled, click: actions.restartHarness },
    { label: t('menu.openLogs'), click: actions.openLogs },
    { label: t('menu.exportDiagnostics'), click: actions.exportDiagnostics },
    { type: 'separator' },
    { label: t('menu.projectRepository'), click: () => actions.openExternal(PROJECT_REPO_URL) },
    { label: t('menu.reportIssue'), click: () => actions.openExternal(PROJECT_ISSUES_URL) },
    { type: 'separator' },
    { label: t('menu.deepseekOfficial'), click: () => actions.openExternal(DEEPSEEK_OFFICIAL_URL) },
  )
  if (!isMac) help.push({ type: 'separator' }, { label: t('app.about'), click: actions.showAbout })
  template.push({ label: t('menu.help'), role: 'help', submenu: help })
  return template
}
