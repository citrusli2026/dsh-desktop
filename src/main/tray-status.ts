import type { HarnessState } from './supervisor.ts'
import { shellText, type ShellLocale } from './locale.ts'

/** Pure status label shared by the tray and its unit test. */
export function statusLabel(locale: ShellLocale, state: HarnessState | undefined, restarting = false): string {
  return statusLabelWithMode(locale, state, restarting, false)
}

/** Shared lifecycle wording for native surfaces and the in-app controls. */
export function statusLabelWithMode(locale: ShellLocale, state: HarnessState | undefined, restarting = false, safeMode = false): string {
  if (restarting) return shellText(locale, 'tray.statusRestarting')
  if (safeMode && state?.phase === 'ready') return shellText(locale, 'tray.statusSafeMode')
  if (state?.phase === 'ready') return shellText(locale, 'tray.statusRunning')
  if (state?.phase === 'crashed') return shellText(locale, 'tray.statusRecoveryPaused', { count: state.attempts })
  return shellText(locale, 'tray.statusStarting')
}
