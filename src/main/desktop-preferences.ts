/** Shell-owned desktop preferences and their native side effects. */
import type { ShellPreferencesStore, DesktopPreferences } from './shell-preferences.ts'
import {
  DESKTOP_SUMMON_ACCELERATOR,
  desktopShortcutLabel,
  registerDesktopSummonShortcut,
  unregisterDesktopSummonShortcut,
  normalizeDesktopAccelerator,
  type GlobalShortcutRegistrar,
} from './global-shortcut.ts'

export interface LoginItemSettings {
  openAtLogin?: boolean
  openAsHidden?: boolean
  wasOpenedAtLogin?: boolean
  wasOpenedAsHidden?: boolean
}

export interface LoginItemApi {
  getLoginItemSettings?(): LoginItemSettings
  setLoginItemSettings(settings: { openAtLogin: boolean; openAsHidden: boolean }): void
}

export interface DesktopPreferencesSnapshot extends DesktopPreferences {
  shortcutLabel: string
  shortcutRegistered: boolean
  launchAtLoginAvailable: boolean
  notificationsAvailable: boolean
}

export type DesktopPreferencesUpdate = Partial<DesktopPreferences>

export type DesktopPreferencesResult =
  | { ok: true; preferences: DesktopPreferencesSnapshot }
  | { ok: false; reason: 'conflict' | 'invalid' | 'unavailable' | 'requires-login'; preferences: DesktopPreferencesSnapshot }

export interface DesktopPreferencesControllerOptions {
  store: ShellPreferencesStore
  registrar: GlobalShortcutRegistrar
  onSummon(): void
  platform: NodeJS.Platform
  packaged: boolean
  loginItems?: LoginItemApi
  notificationsAvailable: boolean
}

/**
 * Coordinates durable shell preferences with globalShortcut and login items.
 * The controller keeps shortcut changes transactional: a conflicting new key
 * never leaves the shell without its previous working key.
 */
export class DesktopPreferencesController {
  private readonly store: ShellPreferencesStore
  private readonly registrar: GlobalShortcutRegistrar
  private readonly onSummon: () => void
  private readonly platform: NodeJS.Platform
  private readonly loginItems: LoginItemApi | undefined
  private readonly notificationsAvailable: boolean
  private current: DesktopPreferences
  private registeredShortcut: string | undefined

  constructor(options: DesktopPreferencesControllerOptions) {
    this.store = options.store
    this.registrar = options.registrar
    this.onSummon = options.onSummon
    this.platform = options.platform
    this.loginItems = options.packaged && (options.platform === 'darwin' || options.platform === 'win32')
      ? options.loginItems
      : undefined
    this.notificationsAvailable = options.notificationsAvailable
    this.current = this.store.getDesktopPreferences()
  }

  initialize(): void {
    this.applyLoginItems()
    this.registerShortcut(this.current.shortcut)
  }

  dispose(): void {
    if (this.registeredShortcut !== undefined) {
      unregisterDesktopSummonShortcut(this.registrar, this.registeredShortcut)
      this.registeredShortcut = undefined
    }
  }

  get snapshot(): DesktopPreferencesSnapshot {
    return {
      ...this.current,
      shortcutLabel: desktopShortcutLabel(this.current.shortcut, this.platform),
      shortcutRegistered: this.registeredShortcut === this.current.shortcut,
      launchAtLoginAvailable: this.loginItems !== undefined,
      notificationsAvailable: this.notificationsAvailable,
    }
  }

  shouldStartHidden(): boolean {
    if (!this.current.launchAtLogin || !this.current.launchHidden) return false
    const settings = this.loginItems?.getLoginItemSettings?.()
    return settings?.wasOpenedAtLogin === true || settings?.wasOpenedAsHidden === true
  }

  update(patch: DesktopPreferencesUpdate): DesktopPreferencesResult {
    if (patch.shortcut !== undefined) {
      const result = this.setShortcut(patch.shortcut)
      if (!result.ok) return result
    }
    if (patch.launchAtLogin !== undefined) {
      const result = this.setLaunchAtLogin(patch.launchAtLogin)
      if (!result.ok) return result
    }
    if (patch.launchHidden !== undefined) {
      const result = this.setLaunchHidden(patch.launchHidden)
      if (!result.ok) return result
    }
    if (patch.notificationsEnabled !== undefined) {
      this.current = this.store.updateDesktopPreferences({ notificationsEnabled: patch.notificationsEnabled })
    }
    if (patch.safeMode !== undefined) {
      this.current = this.store.updateDesktopPreferences({ safeMode: patch.safeMode })
    }
    if (patch.screenCapture !== undefined) {
      this.current = this.store.updateDesktopPreferences({ screenCapture: patch.screenCapture })
    }
    return { ok: true, preferences: this.snapshot }
  }

  private setShortcut(raw: string): DesktopPreferencesResult {
    const next = normalizeDesktopAccelerator(raw)
    if (next === undefined) return { ok: false, reason: 'invalid', preferences: this.snapshot }
    if (next === this.current.shortcut && this.registeredShortcut === next) {
      return { ok: true, preferences: this.snapshot }
    }
    const previous = this.registeredShortcut
    if (previous !== undefined) unregisterDesktopSummonShortcut(this.registrar, previous)
    this.registeredShortcut = undefined
    if (!this.registerShortcut(next)) {
      if (previous !== undefined) this.registerShortcut(previous)
      return { ok: false, reason: 'conflict', preferences: this.snapshot }
    }
    this.current = this.store.updateDesktopPreferences({ shortcut: next })
    return { ok: true, preferences: this.snapshot }
  }

  private setLaunchAtLogin(enabled: boolean): DesktopPreferencesResult {
    if (this.loginItems === undefined) return { ok: false, reason: 'unavailable', preferences: this.snapshot }
    try {
      this.loginItems.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: enabled && this.current.launchHidden,
      })
    } catch {
      return { ok: false, reason: 'unavailable', preferences: this.snapshot }
    }
    this.current = this.store.updateDesktopPreferences({ launchAtLogin: enabled })
    return { ok: true, preferences: this.snapshot }
  }

  private setLaunchHidden(enabled: boolean): DesktopPreferencesResult {
    if (this.loginItems === undefined) return { ok: false, reason: 'unavailable', preferences: this.snapshot }
    try {
      this.loginItems.setLoginItemSettings({
        openAtLogin: this.current.launchAtLogin,
        openAsHidden: this.current.launchAtLogin && enabled,
      })
    } catch {
      return { ok: false, reason: 'unavailable', preferences: this.snapshot }
    }
    this.current = this.store.updateDesktopPreferences({ launchHidden: enabled })
    return { ok: true, preferences: this.snapshot }
  }

  private applyLoginItems(): void {
    if (this.loginItems === undefined) return
    try {
      this.loginItems.setLoginItemSettings({
        openAtLogin: this.current.launchAtLogin,
        openAsHidden: this.current.launchAtLogin && this.current.launchHidden,
      })
    } catch {
      // A platform can expose the API while denying the setting. The UI will
      // keep the preference visible and the next explicit change can retry it.
    }
  }

  private registerShortcut(accelerator: string): boolean {
    const normalized = normalizeDesktopAccelerator(accelerator) ?? DESKTOP_SUMMON_ACCELERATOR
    if (!registerDesktopSummonShortcut(this.registrar, this.onSummon, normalized)) return false
    this.registeredShortcut = normalized
    return true
  }
}
