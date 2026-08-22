/** Tiny shell-only preferences that do not belong in the upstream Harness document. */
import { app } from 'electron'
import { join } from 'node:path'
import { ConfigFile } from './config-file.ts'

interface ShellPreferences {
  closeToTrayExplained?: boolean
}

const preferencesFile = new ConfigFile<ShellPreferences>(
  join(app.getPath('userData'), 'shell-preferences.json'),
  {},
  raw => (typeof raw === 'object' && raw !== null ? raw as ShellPreferences : {}),
  {
    // A missing file is the normal first-run state; anything else is worth a warn.
    onError: error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      console.warn(`dsh-desktop: shell preferences failed: ${error instanceof Error ? error.message : String(error)}`)
    },
  },
)

export function shouldExplainCloseToTray(): boolean {
  return preferencesFile.readSync().closeToTrayExplained !== true
}

export function markCloseToTrayExplained(): void {
  preferencesFile.update(current => ({ ...current, closeToTrayExplained: true }))
}
