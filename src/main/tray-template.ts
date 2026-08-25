/** Pure tray-menu template so locale and lifecycle behavior are unit-testable. */
import type { MenuItemConstructorOptions } from 'electron'
import type { HarnessState } from './supervisor.ts'
import { shellText, type ShellLocale } from './locale.ts'
import { statusLabel } from './tray-status.ts'
import { buildCommunityMenuItems, buildLanMenuItems, type LanMenuActions, type LanMenuState } from './menu-template.ts'

export interface TrayTemplateState {
  harness: HarnessState | undefined
  restarting: boolean
  windowVisible: boolean
  lan: LanMenuState
}

export interface TrayTemplateActions {
  toggleWindow(): void
  restartHarness(): void
  openLogs(): void
  exportDiagnostics(): void
  checkForUpdates(): void
  quit(): void
  showAbout(): void
  openExternal(url: string): void
  lan: LanMenuActions
}

export function buildTrayTemplate(
  locale: ShellLocale,
  state: TrayTemplateState,
  actions: TrayTemplateActions,
): MenuItemConstructorOptions[] {
  const t = (key: Parameters<typeof shellText>[1]): string => shellText(locale, key)
  const canRestart = !state.restarting && state.harness?.phase !== 'starting' && state.harness !== undefined
  return [
    { label: t(state.windowVisible ? 'tray.hide' : 'tray.show'), click: actions.toggleWindow },
    { type: 'separator' },
    { label: statusLabel(locale, state.harness, state.restarting), enabled: false },
    {
      label: t(state.harness?.phase === 'crashed' ? 'tray.startHarness' : 'menu.restartHarness'),
      enabled: canRestart,
      click: actions.restartHarness,
    },
    { type: 'separator' },
    ...buildLanMenuItems(locale, state.lan, actions.lan),
    { label: t('menu.openLogs'), click: actions.openLogs },
    { label: t('menu.exportDiagnostics'), click: actions.exportDiagnostics },
    { type: 'separator' },
    { label: t('menu.community'), submenu: buildCommunityMenuItems(locale, actions) },
    { label: t('app.about'), click: actions.showAbout },
    { type: 'separator' },
    { label: t('app.checkUpdates'), click: actions.checkForUpdates },
    { type: 'separator' },
    { label: t('app.quit'), click: actions.quit },
  ]
}
