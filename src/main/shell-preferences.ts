/** Tiny shell-only preferences that do not belong in the upstream Harness document. */
import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface ShellPreferences {
  closeToTrayExplained?: boolean
  visionGuideCompleted?: boolean
}

function preferencesPath(): string {
  return join(app.getPath('userData'), 'shell-preferences.json')
}

function readPreferences(): ShellPreferences {
  try {
    const value: unknown = JSON.parse(readFileSync(preferencesPath(), 'utf8'))
    return typeof value === 'object' && value !== null ? value as ShellPreferences : {}
  } catch {
    return {}
  }
}

export function shouldExplainCloseToTray(): boolean {
  return readPreferences().closeToTrayExplained !== true
}

export function markCloseToTrayExplained(): void {
  try {
    writeFileSync(preferencesPath(), `${JSON.stringify({ ...readPreferences(), closeToTrayExplained: true })}\n`, { mode: 0o600 })
  } catch (error) {
    console.warn(`dsh-desktop: saving shell preferences failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function shouldShowVisionGuide(): boolean {
  return readPreferences().visionGuideCompleted !== true
}

export function markVisionGuideCompleted(): void {
  try {
    writeFileSync(preferencesPath(), `${JSON.stringify({ ...readPreferences(), visionGuideCompleted: true })}\n`, { mode: 0o600 })
  } catch (error) {
    console.warn(`dsh-desktop: saving shell preferences failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
