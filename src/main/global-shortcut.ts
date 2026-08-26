/** Desktop-only global shortcut for bringing the shell back to the foreground. */

export const DESKTOP_SUMMON_ACCELERATOR = 'CommandOrControl+Shift+Space'

export interface GlobalShortcutRegistrar {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
}

/** Human-readable label used in the tray and site-facing shell copy. */
export function desktopShortcutLabel(platform: NodeJS.Platform): string {
  return platform === 'darwin' ? '⌘ + Shift + Space' : 'Ctrl + Shift + Space'
}

/** Register without allowing a shortcut conflict to block the desktop shell. */
export function registerDesktopSummonShortcut(
  registrar: GlobalShortcutRegistrar,
  onSummon: () => void,
): boolean {
  try {
    return registrar.register(DESKTOP_SUMMON_ACCELERATOR, onSummon)
  } catch {
    return false
  }
}

/** Release only the shortcut owned by this shell. */
export function unregisterDesktopSummonShortcut(registrar: GlobalShortcutRegistrar): void {
  try {
    registrar.unregister(DESKTOP_SUMMON_ACCELERATOR)
  } catch {
    // App shutdown should remain best-effort even when the platform has
    // already torn down its global shortcut service.
  }
}
