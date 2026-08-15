/** System-tray ownership and lifecycle actions. */
import { app, Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'
import type { HarnessState } from './supervisor.ts'
import type { ShellLocale } from './locale.ts'
import { buildTrayTemplate } from './tray-template.ts'

export { statusLabel } from './tray-status.ts'

export interface TrayActions {
  getLocale(): ShellLocale
  getState(): HarnessState | undefined
  isRestarting(): boolean
  isWindowVisible(): boolean
  toggleWindow(): void
  restartHarness(): void
  openLogs(): void
  exportDiagnostics(): void
  checkForUpdates(): void
  quit(): void
}

let tray: Tray | undefined
let actions: TrayActions | undefined

function buildTrayMenu(): Menu {
  const current = actions
  if (current === undefined) throw new Error('tray actions are not configured')
  return Menu.buildFromTemplate(buildTrayTemplate(current.getLocale(), {
    harness: current.getState(),
    restarting: current.isRestarting(),
    windowVisible: current.isWindowVisible(),
  }, current))
}

export function createTray(nextActions: TrayActions): void {
  actions = nextActions
  const image = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'trayTemplate.png'))
  if (process.platform === 'darwin') image.setTemplateImage(true)
  tray = new Tray(image)
  tray.setToolTip('dsh-desktop · Community')
  tray.setContextMenu(buildTrayMenu())
  if (process.platform !== 'darwin') tray.on('click', nextActions.toggleWindow)
}

export function refreshTray(): void {
  if (tray !== undefined && actions !== undefined) tray.setContextMenu(buildTrayMenu())
}

export function destroyTray(): void {
  tray?.destroy()
  tray = undefined
  actions = undefined
}
