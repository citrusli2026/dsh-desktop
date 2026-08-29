/** Pure tray-menu template so locale and lifecycle behavior are unit-testable. */
import type { MenuItemConstructorOptions } from 'electron'
import type { HarnessState } from './supervisor.ts'
import { shellText, type ShellLocale } from './locale.ts'
import { statusLabel } from './tray-status.ts'
import { buildCommunityMenuItems, buildLanMenuItems, buildSafeModeMenuItems, type LanMenuActions, type LanMenuState } from './menu-template.ts'
import { DEEPSEEK_PLATFORM_RECHARGE_URL } from './links.ts'
import { DESKTOP_SUMMON_ACCELERATOR, desktopShortcutLabel } from './global-shortcut.ts'

export interface TrayTemplateState {
  harness: HarnessState | undefined
  restarting: boolean
  windowVisible: boolean
  shortcutRegistered: boolean
  shortcutAccelerator?: string
  launchAtLoginAvailable?: boolean
  launchAtLogin?: boolean
  safeMode?: boolean
  /** Formatted DeepSeek balance line; hidden when absent (no key / no data). */
  balance?: string
  lan: LanMenuState
}

export interface TrayTemplateActions {
  showWindow(): void
  toggleWindow(): void
  restartHarness(): void
  toggleSafeMode(): void
  checkForUpdates(): void
  quit(): void
  showAbout(): void
  openExternal(url: string): void
  toggleLaunchAtLogin?(): void
  lan: LanMenuActions
}

export function buildTrayTemplate(
  locale: ShellLocale,
  state: TrayTemplateState,
  actions: TrayTemplateActions,
): MenuItemConstructorOptions[] {
  const t = (key: Parameters<typeof shellText>[1]): string => shellText(locale, key)
  const canRestart = !state.restarting && state.harness?.phase !== 'starting' && state.harness !== undefined
  const shortcutAccelerator = state.shortcutAccelerator ?? DESKTOP_SUMMON_ACCELERATOR
  const launchAtLoginAvailable = state.launchAtLoginAvailable === true
  return [
    { label: t(state.windowVisible ? 'tray.hide' : 'tray.show'), click: actions.toggleWindow },
    { label: t('tray.quickSummon'), accelerator: shortcutAccelerator, click: actions.showWindow },
    {
      label: shellText(locale, state.shortcutRegistered ? 'tray.shortcutEnabled' : 'tray.shortcutUnavailable', {
        shortcut: desktopShortcutLabel(shortcutAccelerator, process.platform),
      }),
      enabled: false,
    },
    {
      label: t(state.launchAtLogin === true ? 'tray.launchAtLoginEnabled' : 'tray.launchAtLoginDisabled'),
      type: 'checkbox',
      checked: state.launchAtLogin === true,
      enabled: launchAtLoginAvailable,
      click: actions.toggleLaunchAtLogin,
    },
    { type: 'separator' },
    { label: statusLabel(locale, state.harness, state.restarting), enabled: false },
    {
      label: t(state.harness?.phase === 'crashed' ? 'tray.startHarness' : 'menu.restartHarness'),
      enabled: canRestart,
      click: actions.restartHarness,
    },
    // Balance line doubles as the recharge shortcut (decision 0025); hidden
    // when no key is configured or the fetch has not landed yet.
    ...(state.balance !== undefined ? [{
      label: shellText(locale, 'tray.balance', { balance: state.balance }),
      click: () => actions.openExternal(DEEPSEEK_PLATFORM_RECHARGE_URL),
    } as MenuItemConstructorOptions] : []),
    { type: 'separator' },
    ...buildLanMenuItems(locale, state.lan, actions.lan),
    ...buildSafeModeMenuItems(locale, state.safeMode === true, actions),
    { label: t('menu.community'), submenu: buildCommunityMenuItems(locale, actions) },
    { label: t('app.about'), click: actions.showAbout },
    { type: 'separator' },
    { label: t('app.checkUpdates'), click: actions.checkForUpdates },
    { type: 'separator' },
    { label: t('app.quit'), click: actions.quit },
  ]
}
