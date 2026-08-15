import type { HarnessState } from './supervisor.ts'
import { shellText, type ShellLocale } from './locale.ts'

/** Pure status label shared by the tray and its unit test. */
export function statusLabel(locale: ShellLocale, state: HarnessState | undefined, restarting = false): string {
  if (restarting) return shellText(locale, 'tray.statusRestarting')
  if (state?.phase === 'ready') return shellText(locale, 'tray.statusRunning')
  if (state?.phase === 'crashed') return shellText(locale, 'tray.statusRecoveryPaused', { count: state.attempts })
  return shellText(locale, 'tray.statusStarting')
}
