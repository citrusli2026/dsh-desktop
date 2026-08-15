/** Pure tray-menu template so locale and lifecycle behavior are unit-testable. */
import type { MenuItemConstructorOptions } from 'electron'
import type { HarnessState } from './supervisor.ts'
import { shellText, type ShellLocale } from './locale.ts'
import { statusLabel } from './tray-status.ts'

export interface TrayTemplateState {
  harness: HarnessState | undefined
  restarting: boolean
  windowVisible: boolean
}

export interface TrayTemplateActions {
  toggleWindow(): void
  restartHarness(): void
  openLogs(): void
  exportDiagnostics(): void
  checkForUpdates(): void
  quit(): void
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
    { label: t('menu.openLogs'), click: actions.openLogs },
    { label: t('menu.exportDiagnostics'), click: actions.exportDiagnostics },
    { type: 'separator' },
    { label: t('app.checkUpdates'), click: actions.checkForUpdates },
    { type: 'separator' },
    { label: t('app.quit'), click: actions.quit },
  ]
}
