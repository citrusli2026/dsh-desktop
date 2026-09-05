/**
 * Build the prefilled GitHub issue URL the error page offers after a failed
 * startup. The content is deliberately generic and sanitized: the diagnostic
 * report is created on-device by the user (never attached automatically), and
 * no log text, paths, tokens, or settings values are embedded here.
 * @module main/support
 */

export interface SupportContext {
  /** dsh-desktop composite version (e.g. 0.1.2-rc.1.shell.5). */
  appVersion: string
  platform: NodeJS.Platform
  arch: string
  kernelVersion: string
  safeMode: boolean
  /** Suspect package names extracted from the harness output, if any. */
  suspects: readonly string[]
  /** Classified failure cause ('kernel-api' upgrade cliff vs unknown). */
  cause: 'kernel-api' | 'unknown'
}

const REPO = 'citrusli2026/dsh-desktop'

function sanitize(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

function titleFor(context: SupportContext): string {
  const pieces = [`dsh-desktop ${context.appVersion}`, context.platform, context.arch]
  if (context.cause === 'kernel-api') pieces.push('plugin/kernel API')
  return pieces.filter(Boolean).join(' · ')
}

/** The bug-report template mirrors .github/ISSUE_TEMPLATE/bug.yml. */
export function supportIssueBody(context: SupportContext): string {
  const suspectLine = context.suspects.length === 0
    ? '(未检测到可疑插件)'
    : context.suspects.join('、')
  return [
    '## 描述 / Description',
    '启动失败，需要帮助。（Startup failed and I need help.）',
    '',
    '## 环境 / Environment',
    `- dsh-desktop 版本: ${sanitize(context.appVersion)}`,
    `- 平台: ${context.platform} ${context.arch}`,
    `- 内置内核: ${sanitize(context.kernelVersion)}`,
    `- 安全模式: ${context.safeMode ? '开启' : '未开启'}`,
    `- 疑似插件: ${suspectLine}`,
    context.cause === 'kernel-api'
      ? '- 失败原因: 插件引用了当前内核已移除的导出（可尝试在错误页一键升级插件）'
      : '',
    '',
    '## 复现步骤 / Steps to reproduce',
    '1. 请补充你做了什么（如：刚安装/刚升级/刚装了某个插件后启动）。',
    '',
    '## 诊断 / Diagnostics',
    '请在错误页点击「导出诊断报告」，把导出的文件拖入本 issue。该文件只在你的设备上生成，不会自动上传；如包含密钥请先自行删除。',
    '（On the error page choose "Export Diagnostic Report" and attach the file. It is generated locally and never uploaded automatically.）',
  ].filter(line => line !== '').join('\n')
}

/** A new-issue URL with a human-readable title and the sanitized body. */
export function supportIssueUrl(context: SupportContext, base = `https://github.com/${REPO}/issues/new`): string {
  const params = new URLSearchParams({ title: titleFor(context), body: supportIssueBody(context) })
  return `${base}?${params.toString()}`
}
