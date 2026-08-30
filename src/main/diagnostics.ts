/** Local diagnostic export and bounded harness-log retention. */
import electron from 'electron'
import { closeSync, existsSync, openSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { appendFile, readFile } from 'node:fs/promises'
import { homedir, release } from 'node:os'
import { basename, join } from 'node:path'
import type { HarnessState } from './supervisor.ts'
import { shellText, type ShellLocale } from './locale.ts'
import { collectPluginFailures, inspectPluginInventory, type ComposedRow, type PluginInventory } from './safe-mode.ts'
import { resolveDshHome } from './dsh-home.ts'
import { harnessRoot } from './paths.ts'
import { readProfileStatus, type ProfileStatus } from './profile.ts'

export const MAX_LOG_BYTES = 5 * 1024 * 1024
export const KEPT_LOG_FILES = 3
export const DIAGNOSTIC_LOG_BYTES = 256 * 1024

/** Rotate harness.log into harness.log.1..3 once it exceeds the size budget. */
export function rotateLogFiles(logPath: string, maxBytes = MAX_LOG_BYTES, keep = KEPT_LOG_FILES): void {
  if (!existsSync(logPath) || statSync(logPath).size <= maxBytes || keep < 1) return
  for (let index = keep; index >= 1; index -= 1) {
    const source = index === 1 ? logPath : `${logPath}.${index - 1}`
    const target = `${logPath}.${index}`
    if (!existsSync(source)) continue
    rmSync(target, { force: true })
    renameSync(source, target)
  }
}

/** Serialized, non-blocking append writer that enforces the size budget while the app stays open. */
export class RollingLogWriter {
  private readonly logPath: string
  private readonly maxBytes: number
  private readonly keep: number
  private bytes: number
  private queue: Promise<void> = Promise.resolve()

  constructor(logPath: string, maxBytes = MAX_LOG_BYTES, keep = KEPT_LOG_FILES) {
    this.logPath = logPath
    this.maxBytes = maxBytes
    this.keep = keep
    rotateLogFiles(logPath, maxBytes, keep)
    this.bytes = existsSync(logPath) ? statSync(logPath).size : 0
  }

  write(line: string): void {
    const content = `${line}\n`
    const length = Buffer.byteLength(content)
    this.queue = this.queue.then(async () => {
      if (this.bytes > 0 && this.bytes + length > this.maxBytes) {
        rotateLogFiles(this.logPath, 0, this.keep)
        this.bytes = 0
      }
      await appendFile(this.logPath, content, { encoding: 'utf8', mode: 0o600 })
      this.bytes += length
    }).catch(error => {
      console.warn(`dsh-desktop: writing harness log failed: ${error instanceof Error ? error.message : String(error)}`)
    })
  }

  async close(): Promise<void> {
    await this.queue
  }
}

/** Read only the newest bytes of a log, avoiding an unbounded memory read. */
export function readLogTail(logPath: string, maxBytes = DIAGNOSTIC_LOG_BYTES): string {
  if (!existsSync(logPath)) return '(harness.log does not exist yet)'
  const size = statSync(logPath).size
  const length = Math.min(size, maxBytes)
  const buffer = Buffer.alloc(length)
  const descriptor = openSync(logPath, 'r')
  try {
    readSync(descriptor, buffer, 0, length, Math.max(0, size - length))
  } finally {
    closeSync(descriptor)
  }
  const text = buffer.toString('utf8')
  if (size <= maxBytes) return text
  const firstLineBreak = text.indexOf('\n')
  return `[... ${size - maxBytes} earlier bytes omitted ...]\n${firstLineBreak >= 0 ? text.slice(firstLineBreak + 1) : text}`
}

/** Best-effort masking for common credentials and the local home path. */
export function redactDiagnosticsLog(text: string, userHome = homedir()): string {
  const escapedHome = userHome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text
    .replace(new RegExp(escapedHome, 'g'), '~')
    .replace(/\b(authorization)(\s*:\s*)Bearer\s+[^\s,;]+/gi, '$1$2Bearer [REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/(["']?)(api[_-]?key|access[_-]?token|remote[_-]?token|secret|password)(["']?\s*[:=]\s*)["']?[^"',\s}\]]+["']?/gi, '$1$2$3[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED]')
}

export interface DiagnosticFacts {
  createdAt: string
  appVersion: string
  electronVersion: string
  chromiumVersion: string
  nodeVersion: string
  platform: NodeJS.Platform
  platformRelease: string
  arch: string
  harnessState: HarnessState | undefined
  logTail: string
  /** Bundled @deepseek-ai/dsh version from the harness closure. */
  harnessVersion: string
  safeMode: boolean
  profileStatus?: ProfileStatus
  pluginInventory: PluginInventory | undefined
  pluginFailures: ComposedRow[]
}

function stateLine(state: HarnessState | undefined): string {
  if (state?.phase === 'ready') return 'ready'
  if (state?.phase === 'crashed') return `crashed (attempts=${state.attempts})`
  return 'starting'
}

function inventoryLines(inventory: PluginInventory | undefined): string[] {
  if (inventory === undefined) return ['# unavailable (profile manifest not readable)']
  return [
    `bundles=${inventory.bundles.join(',')}`,
    `user_bundles=${inventory.userBundles.join(',')}`,
    `composed_rows=${inventory.composedRows.map(row => row.id).join(',')}`,
    `damaged_bundles=${inventory.damagedBundles.join(',')}`,
  ]
}

export function formatDiagnosticReport(facts: DiagnosticFacts): string {
  const lines = [
    '# dsh-desktop diagnostic report',
    `created_at=${facts.createdAt}`,
    `app_version=${facts.appVersion}`,
    `electron=${facts.electronVersion}`,
    `chromium=${facts.chromiumVersion}`,
    `node=${facts.nodeVersion}`,
    `platform=${facts.platform} ${facts.platformRelease}`,
    `arch=${facts.arch}`,
    `harness_state=${stateLine(facts.harnessState)}`,
    `harness_version=${facts.harnessVersion}`,
    `safe_mode=${facts.safeMode ? 'true' : 'false'}`,
    `safe_mode_reason=${facts.safeMode ? 'plugin-quarantine' : 'none'}`,
    `profile_manifest=${facts.profileStatus?.manifest ?? 'unknown'}`,
    `market_state=${facts.profileStatus?.dshMarket.state ?? 'unknown'}`,
    `market_version=${facts.profileStatus?.dshMarket.version ?? 'unknown'}`,
    'generated_locally=true',
    'uploaded_automatically=false',
    '',
    '# Plugin inventory',
    ...inventoryLines(facts.pluginInventory),
    '',
    '# Suspected failing plugins (from harness output)',
    ...(facts.pluginFailures.length === 0
      ? ['none']
      : facts.pluginFailures.map(row => `${row.id} (${row.name})`)),
    '',
    `# Harness log tail (up to ${DIAGNOSTIC_LOG_BYTES / 1024} KiB; common secrets and home path masked)`,
    redactDiagnosticsLog(facts.logTail).trimEnd(),
    '',
  ]
  return lines.join('\n')
}

/** Ask for a destination, write a local-only report, then offer to reveal it. */
export async function exportDiagnosticReport(state: HarnessState | undefined, locale: ShellLocale = 'en', safeMode = false): Promise<boolean> {
  const api = electron as unknown as typeof import('electron')
  const warning = await api.dialog.showMessageBox({
    type: 'info',
    title: shellText(locale, 'diagnostics.title'),
    message: shellText(locale, 'diagnostics.message'),
    detail: shellText(locale, 'diagnostics.detail'),
    buttons: [shellText(locale, 'diagnostics.continue'), shellText(locale, 'common.cancel')],
    defaultId: 0,
    cancelId: 1,
  })
  if (warning.response !== 0) return false

  const date = new Date().toISOString().slice(0, 10)
  const result = await api.dialog.showSaveDialog({
    title: shellText(locale, 'diagnostics.saveTitle'),
    defaultPath: join(api.app.getPath('downloads'), `dsh-desktop-diagnostics-${date}.txt`),
    filters: [{ name: 'Text report', extensions: ['txt'] }],
  })
  if (result.canceled || result.filePath === undefined) return false

  try {
    const logPath = join(api.app.getPath('userData'), 'logs', 'harness.log')
    let harnessVersion = 'unknown'
    try {
      const harnessPackage = JSON.parse(await readFile(join(harnessRoot(), 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8')) as { version?: string }
      harnessVersion = harnessPackage.version ?? 'unknown'
    } catch {
      harnessVersion = 'unknown'
    }
    let pluginInventory: PluginInventory | undefined
    let profileStatus: ProfileStatus | undefined
    try {
      const dshHome = resolveDshHome(process.env, homedir())
      profileStatus = await readProfileStatus(dshHome)
      pluginInventory = await inspectPluginInventory(dshHome)
    } catch {
      pluginInventory = undefined
    }
    const logTail = readLogTail(logPath)
    const report = formatDiagnosticReport({
      createdAt: new Date().toISOString(),
      appVersion: api.app.getVersion(),
      electronVersion: process.versions.electron ?? 'unknown',
      chromiumVersion: process.versions.chrome ?? 'unknown',
      nodeVersion: process.versions.node,
      platform: process.platform,
      platformRelease: release(),
      arch: process.arch,
      harnessState: state,
      logTail,
      harnessVersion,
      safeMode,
      profileStatus,
      pluginInventory,
      pluginFailures: collectPluginFailures(logTail),
    })
    writeFileSync(result.filePath, report, { mode: 0o600 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`dsh-desktop: diagnostic export failed: ${message}`)
    await api.dialog.showMessageBox({
      type: 'error',
      message: shellText(locale, 'diagnostics.failed'),
      detail: message,
      buttons: [shellText(locale, 'common.ok')],
    })
    return false
  }
  const done = await api.dialog.showMessageBox({
    type: 'info',
    message: shellText(locale, 'diagnostics.saved'),
    detail: basename(result.filePath),
    buttons: [shellText(locale, 'diagnostics.showFolder'), shellText(locale, 'diagnostics.done')],
    defaultId: 1,
    cancelId: 1,
  })
  if (done.response === 0) api.shell.showItemInFolder(result.filePath)
  return true
}
