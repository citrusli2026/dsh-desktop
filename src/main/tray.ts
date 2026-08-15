/** System-tray status and lifecycle actions. */
import { app, Menu, nativeImage, shell, Tray } from 'electron'
import { join } from 'node:path'
import type { HarnessState } from './supervisor.ts'
import { statusLabel } from './tray-status.ts'

export { statusLabel } from './tray-status.ts'

export interface TrayActions {
  getState(): HarnessState | undefined
  showWindow(): void
  restartHarness(): Promise<boolean>
  checkForUpdates(): Promise<void>
}

let tray: Tray | undefined
let actions: TrayActions | undefined

function buildTrayMenu(): Menu {
  const current = actions
  if (current === undefined) throw new Error('tray actions are not configured')
  return Menu.buildFromTemplate([
    { label: '打开 dsh-desktop', click: current.showWindow },
    { type: 'separator' },
    { label: statusLabel(current.getState()), enabled: false },
    { label: '重启 Harness', click: () => { void current.restartHarness() } },
    { label: '打开日志目录', click: () => { void shell.openPath(join(app.getPath('userData'), 'logs')) } },
    { type: 'separator' },
    { label: '检查更新…', click: () => { void current.checkForUpdates() } },
    { label: `版本 v${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ])
}

export function createTray(nextActions: TrayActions): void {
  actions = nextActions
  const image = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'trayTemplate.png'))
  if (process.platform === 'darwin') image.setTemplateImage(true)
  tray = new Tray(image)
  tray.setToolTip('dsh-desktop')
  tray.setContextMenu(buildTrayMenu())
  if (process.platform !== 'darwin') tray.on('click', nextActions.showWindow)
}

export function refreshTray(): void {
  if (tray !== undefined && actions !== undefined) tray.setContextMenu(buildTrayMenu())
}
