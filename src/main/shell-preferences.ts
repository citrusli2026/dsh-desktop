/** Tiny shell-only preferences that do not belong in the upstream Harness document. */
// Default import: under `node --test` the electron package resolves to a path
// string with no named exports, so a named `app` import would crash at load
// time. The default interop yields the real module inside Electron and is
// only dereferenced lazily here.
import electron from 'electron'
import { join } from 'node:path'
import { ConfigFile } from './config-file.ts'

interface ShellPreferences {
  closeToTrayExplained?: boolean
}

export interface ShellPreferencesStore {
  shouldExplainCloseToTray(): boolean
  markCloseToTrayExplained(): void
}

/** Build a preferences store over an explicit file path (testable without Electron). */
export function createShellPreferences(path: string): ShellPreferencesStore {
  const file = new ConfigFile<ShellPreferences>(
    path,
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
  return {
    shouldExplainCloseToTray: () => file.readSync().closeToTrayExplained !== true,
    markCloseToTrayExplained: () => file.update(current => ({ ...current, closeToTrayExplained: true })),
  }
}

// Resolved lazily so importing this module never touches Electron (tests can
// build stores via createShellPreferences without an app instance).
let sharedStore: ShellPreferencesStore | undefined

function sharedPreferences(): ShellPreferencesStore {
  return sharedStore ??= createShellPreferences(join(electron.app.getPath('userData'), 'shell-preferences.json'))
}

export function shouldExplainCloseToTray(): boolean {
  return sharedPreferences().shouldExplainCloseToTray()
}

export function markCloseToTrayExplained(): void {
  sharedPreferences().markCloseToTrayExplained()
}
