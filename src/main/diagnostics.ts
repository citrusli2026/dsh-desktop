/** Local diagnostic export and bounded harness-log retention. */
import electron from 'electron'
import { closeSync, existsSync, openSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, release } from 'node:os'
import { basename, join } from 'node:path'
import type { HarnessState } from './supervisor.ts'

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
    .replace(/\b(api[_-]?key|access[_-]?token|secret)(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[REDACTED]')
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
}

function stateLine(state: HarnessState | undefined): string {
  if (state?.phase === 'ready') return 'ready'
  if (state?.phase === 'crashed') return `crashed (attempts=${state.attempts})`
  return 'starting'
}

export function formatDiagnosticReport(facts: DiagnosticFacts): string {
  return [
    '# dsh-desktop diagnostic report',
    `created_at=${facts.createdAt}`,
    `app_version=${facts.appVersion}`,
    `electron=${facts.electronVersion}`,
    `chromium=${facts.chromiumVersion}`,
    `node=${facts.nodeVersion}`,
    `platform=${facts.platform} ${facts.platformRelease}`,
    `arch=${facts.arch}`,
    `harness_state=${stateLine(facts.harnessState)}`,
    'generated_locally=true',
    'uploaded_automatically=false',
    '',
    `# Harness log tail (up to ${DIAGNOSTIC_LOG_BYTES / 1024} KiB; common secrets and home path masked)`,
    redactDiagnosticsLog(facts.logTail).trimEnd(),
    '',
  ].join('\n')
}

/** Ask for a destination, write a local-only report, then offer to reveal it. */
export async function exportDiagnosticReport(state: HarnessState | undefined): Promise<boolean> {
  const api = electron as unknown as typeof import('electron')
  const warning = await api.dialog.showMessageBox({
    type: 'info',
    title: '导出诊断报告',
    message: '报告只会保存到你选择的位置,不会自动上传。',
    detail: '报告包含版本、系统信息和最近 256 KiB Harness 日志。常见密钥和用户主目录会自动遮罩,分享前仍建议自行检查内容。',
    buttons: ['继续导出', '取消'],
    defaultId: 0,
    cancelId: 1,
  })
  if (warning.response !== 0) return false

  const date = new Date().toISOString().slice(0, 10)
  const result = await api.dialog.showSaveDialog({
    title: '保存 dsh-desktop 诊断报告',
    defaultPath: join(api.app.getPath('downloads'), `dsh-desktop-diagnostics-${date}.txt`),
    filters: [{ name: 'Text report', extensions: ['txt'] }],
  })
  if (result.canceled || result.filePath === undefined) return false

  const logPath = join(api.app.getPath('userData'), 'logs', 'harness.log')
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
    logTail: readLogTail(logPath),
  })
  writeFileSync(result.filePath, report, { mode: 0o600 })
  const done = await api.dialog.showMessageBox({
    type: 'info',
    message: '诊断报告已保存',
    detail: basename(result.filePath),
    buttons: ['在文件夹中显示', '完成'],
    defaultId: 1,
    cancelId: 1,
  })
  if (done.response === 0) api.shell.showItemInFolder(result.filePath)
  return true
}
