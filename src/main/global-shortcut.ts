/** Desktop-only global shortcut for bringing the shell back to the foreground. */

export const DESKTOP_SUMMON_ACCELERATOR = 'CommandOrControl+Shift+Space'

const MODIFIERS = new Set(['CommandOrControl', 'Command', 'Control', 'Ctrl', 'Alt', 'Option', 'AltGr', 'Shift', 'Super'])
const MODIFIER_ORDER = ['CommandOrControl', 'Command', 'Control', 'Ctrl', 'Alt', 'Option', 'AltGr', 'Super', 'Shift'] as const
const NAMED_KEYS = new Set([
  'Space', 'Tab', 'Enter', 'Escape', 'Backspace', 'Delete', 'Insert', 'Home', 'End',
  'PageUp', 'PageDown', 'Up', 'Down', 'Left', 'Right', 'Plus',
])

/** Normalize the small accelerator language accepted by Electron. */
export function normalizeDesktopAccelerator(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const tokens = value.split('+').map(token => token.trim()).filter(Boolean)
  if (tokens.length < 2) return undefined
  const modifiers: string[] = []
  for (const token of tokens.slice(0, -1)) {
    const aliases: Record<string, string> = {
      cmdorctrl: 'CommandOrControl', commandorcontrol: 'CommandOrControl',
      command: 'Command', control: 'Ctrl', ctrl: 'Ctrl',
      alt: 'Alt', option: 'Option', altgr: 'AltGr', shift: 'Shift', super: 'Super',
    }
    const modifier = aliases[token.toLowerCase()] ?? token
    if (!MODIFIERS.has(modifier) || modifiers.includes(modifier)) return undefined
    modifiers.push(modifier)
  }
  const key = tokens.at(-1)!
  const normalizedKey = /^[a-z]$/.test(key) ? key.toUpperCase() : key
  if (!/^[A-Z0-9]$/.test(normalizedKey) && !/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(normalizedKey) && !NAMED_KEYS.has(normalizedKey)) {
    return undefined
  }
  const ordered = MODIFIER_ORDER.filter(modifier => modifiers.includes(modifier))
  return [...ordered, normalizedKey].join('+')
}

export interface GlobalShortcutRegistrar {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
}

/** Human-readable label used in the tray and site-facing shell copy. */
export function desktopShortcutLabel(platform: NodeJS.Platform): string
export function desktopShortcutLabel(accelerator: string, platform: NodeJS.Platform): string
export function desktopShortcutLabel(
  acceleratorOrPlatform: string | NodeJS.Platform,
  platform?: NodeJS.Platform,
): string {
  const accelerator = platform === undefined ? DESKTOP_SUMMON_ACCELERATOR : acceleratorOrPlatform
  const hostPlatform = platform ?? acceleratorOrPlatform as NodeJS.Platform
  const normalized = normalizeDesktopAccelerator(accelerator) ?? DESKTOP_SUMMON_ACCELERATOR
  return normalized.split('+').map(token => {
    if (token === 'CommandOrControl') return hostPlatform === 'darwin' ? '⌘' : 'Ctrl'
    if (token === 'Command') return hostPlatform === 'darwin' ? '⌘' : 'Command'
    if (token === 'Control' || token === 'Ctrl') return 'Ctrl'
    if (token === 'Alt' || token === 'Option') return hostPlatform === 'darwin' ? '⌥' : 'Alt'
    return token
  }).join(' + ')
}

/** Register without allowing a shortcut conflict to block the desktop shell. */
export function registerDesktopSummonShortcut(
  registrar: GlobalShortcutRegistrar,
  onSummon: () => void,
  accelerator = DESKTOP_SUMMON_ACCELERATOR,
): boolean {
  const normalized = normalizeDesktopAccelerator(accelerator)
  if (normalized === undefined) return false
  try {
    return registrar.register(normalized, onSummon)
  } catch {
    return false
  }
}

/** Release only the shortcut owned by this shell. */
export function unregisterDesktopSummonShortcut(
  registrar: GlobalShortcutRegistrar,
  accelerator = DESKTOP_SUMMON_ACCELERATOR,
): void {
  const normalized = normalizeDesktopAccelerator(accelerator)
  if (normalized === undefined) return
  try {
    registrar.unregister(normalized)
  } catch {
    // App shutdown should remain best-effort even when the platform has
    // already torn down its global shortcut service.
  }
}
