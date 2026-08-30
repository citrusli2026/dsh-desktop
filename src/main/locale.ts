/** Shell-owned locale selection, persistence, and live settings synchronization. */
import { watch, type FSWatcher } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { parseDocument } from 'yaml'
import { atomicWriteFile, withFileLock } from './config-file.ts'

export const SHELL_LOCALES = ['zh', 'en'] as const
export type ShellLocale = typeof SHELL_LOCALES[number]
export const SHELL_THEMES = ['light', 'dark', 'system'] as const
export type ShellTheme = typeof SHELL_THEMES[number]

const english = {
  'app.about': 'About dsh-desktop',
  'app.checkUpdates': 'Check for Updates…',
  'app.services': 'Services',
  'app.hide': 'Hide dsh-desktop',
  'app.hideOthers': 'Hide Others',
  'app.showAll': 'Show All',
  'app.quit': 'Quit dsh-desktop',
  'menu.file': 'File',
  'menu.closeWindow': 'Close Window',
  'menu.edit': 'Edit',
  'menu.undo': 'Undo',
  'menu.redo': 'Redo',
  'menu.cut': 'Cut',
  'menu.copy': 'Copy',
  'menu.paste': 'Paste',
  'menu.pasteMatchStyle': 'Paste and Match Style',
  'menu.delete': 'Delete',
  'menu.selectAll': 'Select All',
  'menu.view': 'View',
  'menu.reload': 'Reload',
  'menu.devTools': 'Developer Tools',
  'menu.actualSize': 'Actual Size',
  'menu.zoomIn': 'Zoom In',
  'menu.zoomOut': 'Zoom Out',
  'menu.fullScreen': 'Toggle Full Screen',
  'menu.window': 'Window',
  'menu.extensions': 'Extensions',
  'menu.startLanLink': 'Connect a mobile device…',
  'menu.showLanQr': 'Show LAN pairing QR code…',
  'menu.stopLanLink': 'Stop LAN sharing',
  'menu.safeModeStart': 'Start in Safe Mode',
  'menu.safeModeExit': 'Exit Safe Mode',
  'menu.minimize': 'Minimize',
  'menu.maximize': 'Maximize / Restore',
  'menu.bringAllToFront': 'Bring All to Front',
  'menu.help': 'Help',
  'menu.quickSummon': 'Show dsh-desktop',
  'menu.community': 'Community',
  'menu.communityWebsite': 'Community Website',
  'menu.restartHarness': 'Restart Harness…',
  'menu.openLogs': 'Open Logs Folder',
  'menu.exportDiagnostics': 'Export Diagnostic Report…',
  'menu.projectRepository': 'Project Repository',
  'menu.reportIssue': 'Report an Issue',
  'menu.deepseekOfficial': 'DeepSeek Official Website',
  'context.openLink': 'Open Link in Browser',
  'context.copyLink': 'Copy Link',
  'tray.show': 'Show dsh-desktop',
  'tray.balance': 'Balance: {balance}',
  'tray.hide': 'Hide dsh-desktop',
  'tray.quickSummon': 'Show dsh-desktop',
  'tray.shortcutEnabled': 'Shortcut enabled: {shortcut}',
  'tray.shortcutUnavailable': 'Shortcut unavailable: {shortcut}',
  'tray.launchAtLoginEnabled': 'Launch at login: On',
  'tray.launchAtLoginDisabled': 'Launch at login: Off',
  'tray.startHarness': 'Start Harness',
  'tray.statusStarting': 'Status: Starting…',
  'tray.statusLaunching': 'Status: Launching runtime…',
  'tray.statusWaitingForReady': 'Status: Waiting for Harness…',
  'tray.statusRetrying': 'Status: Retrying Harness… (attempt {attempts}, {seconds}s)',
  'tray.statusRunning': 'Status: Running',
  'tray.statusRestarting': 'Status: Restarting…',
  'tray.statusSafeMode': 'Status: Running · Safe Mode',
  'tray.statusRecoveryPaused': 'Status: Recovery paused ({count} crashes)',
  'notify.harnessStoppedTitle': 'Harness stopped',
  'notify.harnessStoppedBody': 'The local Harness stopped unexpectedly. Open dsh-desktop to retry or view logs.',
  'notify.harnessRecoveredTitle': 'Harness recovered',
  'notify.harnessRecoveredBody': 'The local Harness is connected again.',
  'restart.title': 'Restart Harness?',
  'restart.message': 'Restarting may interrupt active tasks.',
  'restart.detail': 'The desktop window will stay open while the local Harness process restarts.',
  'restart.confirm': 'Restart',
  'common.cancel': 'Cancel',
  'common.continue': 'Continue',
  'common.ok': 'OK',
  'common.close': 'Close',
  'about.title': 'About dsh-desktop',
  'about.version': 'Version v{version}',
  'about.harnessVersion': 'Bundled DeepSeek Harness {version} (shell revision {revision})',
  'about.community': 'Community-maintained, unofficial desktop packaging for DeepSeek Harness.',
  'about.unaffiliated': 'Not affiliated with, authorized, sponsored, or partnered with DeepSeek AI.',
  'about.license': 'MIT License',
  'about.communityWebsite': 'Community Website',
  'about.projectRepository': 'Project Repository',
  'about.harnessOfficial': 'Harness Official',
  'about.deepseekOfficial': 'DeepSeek Official',
  'diagnostics.title': 'Export Diagnostic Report',
  'diagnostics.message': 'The report is saved only where you choose. It is never uploaded automatically.',
  'diagnostics.detail': 'It includes versions, system information, and the latest 256 KiB of Harness logs. Common secrets and your home path are masked; review it before sharing.',
  'diagnostics.continue': 'Continue',
  'diagnostics.saveTitle': 'Save dsh-desktop Diagnostic Report',
  'diagnostics.saved': 'Diagnostic report saved',
  'diagnostics.showFolder': 'Show in Folder',
  'diagnostics.done': 'Done',
  'diagnostics.failed': 'Could not export the diagnostic report',
  'update.title': 'Check for Updates',
  'update.available': 'dsh-desktop v{version} is available',
  'update.macDetail': 'You have v{current}. This unsigned macOS build uses manual updates; download the new release and replace the current app.',
  'update.linuxDetail': 'You have v{current}. Linux builds use manual updates; download the release and replace the current app.',
  'update.download': 'Open Release',
  'update.later': 'Later',
  'update.current': 'You’re up to date',
  'update.currentDetail': 'Current version: v{version}.',
  'update.failed': 'Update check failed',
  'update.dev': 'Development builds do not have an update source.',
  'page.startingTitle': 'Loading Harness…',
  'page.launchingTitle': 'Starting the bundled runtime…',
  'page.waitingForReadyTitle': 'Waiting for Harness to be ready…',
  'page.retryingTitle': 'Retrying Harness…',
  'page.retryingDetail': 'Retrying automatically in about {seconds}s.',
  'page.errorTitle': 'Startup failed',
  'page.recoveryStatus': 'RECOVERY · PAUSED',
  'page.errorHeading': 'The local Harness could not stay running',
  'page.errorBody': 'The process exited {count} times in a short period, so automatic recovery paused. Try again or export a local diagnostic report.',
  'page.logLabel': 'RECENT HARNESS OUTPUT',
  'page.retry': 'Start again',
  'page.retrying': 'Starting…',
  'page.retryFailed': 'Startup still failed. Check the logs and try again.',
  'page.export': 'Export Diagnostic Report',
  'page.safeModeStart': 'Start in Safe Mode',
  'page.safeModeExit': 'Exit Safe Mode',
  'page.openLogs': 'Open Logs Folder',
  'page.suspects': 'Suspected failing plugin: {id} ({name}). Uninstall it from the official Settings → Plugins, or continue in Safe Mode.',
  'window.title': 'dsh-desktop — DeepSeek Harness (Community)',
  'window.closeNoticeTitle': 'dsh-desktop is still running',
  'window.closeNoticeMessage': 'Closing the window keeps Harness available in the system tray.',
  'window.closeNoticeDetail': 'Use Quit dsh-desktop from the application menu or tray to stop it completely.',
  'window.closeNoticeAcknowledge': 'Got it',
  'window.rendererFailed': 'The desktop view stopped responding and could not recover.',
  'lan.qrTitle': 'Connect a phone or tablet',
  'lan.qrInstructions': 'Scan this QR code with the mobile shell or a phone browser, then confirm pairing.',
  'lan.address': 'Address: {address}',
  'lan.code': 'Code: {code}',
  'lan.expires': 'This pairing code expires in about {minutes} minutes and can be used once.',
  'lan.expiresSeconds': 'Pairing code expires in {seconds} seconds and can be used once.',
  'lan.expired': 'This pairing code has expired. Close this window and create a new one.',
  'presets.exportTitle': 'Export Agent Preset',
  'presets.importTitle': 'Import Agent Preset',
  'presets.importTrustTitle': 'Import this preset?',
  'presets.importTrustBody': 'This is an external file. It will be installed as a user preset next to your own presets, not replacing any built-in one.',
  'presets.conflictTitle': 'A preset with this name already exists',
  'presets.conflictBody': 'A user preset named {name} already exists. Skip, replace it, or import it as a copy.',
  'presets.conflictSkip': 'Skip',
  'presets.conflictReplace': 'Replace',
  'presets.conflictClone': 'Import as copy',
  'presets.exportSaved': 'Exported {name}',
  'presets.importDone': 'Imported {name}',
  'presets.importSkipped': 'Skipped {name}',
  'presets.invalid': 'The file is not a valid dsh preset.',
  'presets.empty': 'No user presets yet; create one in the official presets picker.',
  'lan.close': 'Close',
} as const

export type CopyKey = keyof typeof english

const chinese: Record<CopyKey, string> = {
  'app.about': '关于 dsh-desktop',
  'app.checkUpdates': '检查更新…',
  'app.services': '服务',
  'app.hide': '隐藏 dsh-desktop',
  'app.hideOthers': '隐藏其他',
  'app.showAll': '全部显示',
  'app.quit': '退出 dsh-desktop',
  'menu.file': '文件',
  'menu.closeWindow': '关闭窗口',
  'menu.edit': '编辑',
  'menu.undo': '撤销',
  'menu.redo': '重做',
  'menu.cut': '剪切',
  'menu.copy': '复制',
  'menu.paste': '粘贴',
  'menu.pasteMatchStyle': '粘贴并匹配样式',
  'menu.delete': '删除',
  'menu.selectAll': '全选',
  'menu.view': '视图',
  'menu.reload': '重新加载',
  'menu.devTools': '开发者工具',
  'menu.actualSize': '实际大小',
  'menu.zoomIn': '放大',
  'menu.zoomOut': '缩小',
  'menu.fullScreen': '切换全屏',
  'menu.window': '窗口',
  'menu.extensions': '扩展',
  'menu.startLanLink': '连接移动设备…',
  'menu.showLanQr': '显示局域网配对二维码…',
  'menu.stopLanLink': '停止局域网共享',
  'menu.safeModeStart': '以安全模式启动',
  'menu.safeModeExit': '退出安全模式',
  'menu.minimize': '最小化',
  'menu.maximize': '最大化 / 还原',
  'menu.bringAllToFront': '全部置于顶层',
  'menu.help': '帮助',
  'menu.quickSummon': '快速唤起 dsh-desktop',
  'menu.community': '社区',
  'menu.communityWebsite': '社区官网',
  'menu.restartHarness': '重启 Harness…',
  'menu.openLogs': '打开日志目录',
  'menu.exportDiagnostics': '导出诊断报告…',
  'menu.projectRepository': '项目源代码',
  'menu.reportIssue': '反馈问题',
  'menu.deepseekOfficial': 'DeepSeek 官方网站',
  'context.openLink': '在浏览器中打开链接',
  'context.copyLink': '复制链接',
  'tray.show': '显示 dsh-desktop',
  'tray.balance': '余额：{balance}',
  'tray.hide': '隐藏 dsh-desktop',
  'tray.quickSummon': '快速唤起 dsh-desktop',
  'tray.shortcutEnabled': '快捷键已启用：{shortcut}',
  'tray.shortcutUnavailable': '快捷键不可用：{shortcut}',
  'tray.launchAtLoginEnabled': '开机启动：已开启',
  'tray.launchAtLoginDisabled': '开机启动：未开启',
  'tray.startHarness': '启动 Harness',
  'tray.statusStarting': '状态：正在启动…',
  'tray.statusLaunching': '状态：正在启动运行时…',
  'tray.statusWaitingForReady': '状态：等待 Harness 就绪…',
  'tray.statusRetrying': '状态：正在重试 Harness…（第 {attempts} 次，{seconds} 秒后）',
  'tray.statusRunning': '状态：运行中',
  'tray.statusRestarting': '状态：正在重启…',
  'tray.statusSafeMode': '状态：运行中 · 安全模式',
  'tray.statusRecoveryPaused': '状态：恢复已暂停（崩溃 {count} 次）',
  'notify.harnessStoppedTitle': 'Harness 已停止',
  'notify.harnessStoppedBody': '本地 Harness 意外退出，请打开 dsh-desktop 重试或查看日志。',
  'notify.harnessRecoveredTitle': 'Harness 已恢复',
  'notify.harnessRecoveredBody': '本地 Harness 已重新连接。',
  'restart.title': '要重启 Harness 吗？',
  'restart.message': '重启可能会中断正在运行的任务。',
  'restart.detail': '本地 Harness 进程重启期间，桌面窗口会保持打开。',
  'restart.confirm': '重启',
  'common.cancel': '取消',
  'common.continue': '继续',
  'common.ok': '好',
  'common.close': '关闭',
  'about.title': '关于 dsh-desktop',
  'about.version': '版本 v{version}',
  'about.harnessVersion': '内置 DeepSeek Harness {version}（壳修订 {revision}）',
  'about.community': '由社区维护的 DeepSeek Harness 非官方桌面打包。',
  'about.unaffiliated': '与 DeepSeek AI 无隶属、授权、赞助或合作关系。',
  'about.license': 'MIT 许可证',
  'about.communityWebsite': '社区官网',
  'about.projectRepository': '项目源代码',
  'about.harnessOfficial': 'Harness 官方页',
  'about.deepseekOfficial': 'DeepSeek 官网',
  'diagnostics.title': '导出诊断报告',
  'diagnostics.message': '报告只会保存到你选择的位置，不会自动上传。',
  'diagnostics.detail': '报告包含版本、系统信息和最近 256 KiB Harness 日志。常见密钥和用户主目录会自动遮罩；分享前仍建议自行检查。',
  'diagnostics.continue': '继续导出',
  'diagnostics.saveTitle': '保存 dsh-desktop 诊断报告',
  'diagnostics.saved': '诊断报告已保存',
  'diagnostics.showFolder': '在文件夹中显示',
  'diagnostics.done': '完成',
  'diagnostics.failed': '无法导出诊断报告',
  'update.title': '检查更新',
  'update.available': '发现 dsh-desktop v{version}',
  'update.macDetail': '当前版本为 v{current}。未签名的 macOS 版本采用手动更新；请下载新版本后覆盖当前应用。',
  'update.linuxDetail': '当前版本为 v{current}。Linux 版本采用手动更新；请下载新版本后覆盖当前应用。',
  'update.download': '打开发布页',
  'update.later': '稍后',
  'update.current': '已是最新版本',
  'update.currentDetail': '当前版本：v{version}。',
  'update.failed': '检查更新失败',
  'update.dev': '开发模式没有更新源。',
  'page.startingTitle': '框架加载中…',
  'page.launchingTitle': '正在启动内置运行时…',
  'page.waitingForReadyTitle': '正在等待 Harness 就绪…',
  'page.retryingTitle': '正在重试 Harness…',
  'page.retryingDetail': '约 {seconds} 秒后自动重试。',
  'page.errorTitle': '启动失败',
  'page.recoveryStatus': '恢复 · 已暂停',
  'page.errorHeading': '本地 Harness 未能保持运行',
  'page.errorBody': '进程在短时间内退出了 {count} 次，自动恢复已暂停。你可以再次启动，或导出一份本地诊断报告。',
  'page.logLabel': '最近的 HARNESS 输出',
  'page.retry': '再次启动',
  'page.retrying': '正在启动…',
  'page.retryFailed': '启动仍未成功，请查看日志后再试。',
  'page.export': '导出诊断报告',
  'page.safeModeStart': '以安全模式启动',
  'page.safeModeExit': '退出安全模式',
  'page.openLogs': '打开日志文件夹',
  'page.suspects': '疑似坏插件:{id}({name})。可在官方「设置 → 插件」中卸载,或继续以安全模式启动。',
  'window.title': 'dsh-desktop — DeepSeek Harness（社区版）',
  'window.closeNoticeTitle': 'dsh-desktop 仍在运行',
  'window.closeNoticeMessage': '关闭窗口后，Harness 会继续在系统托盘中运行。',
  'window.closeNoticeDetail': '需要完全停止时，请从应用菜单或托盘选择“退出 dsh-desktop”。',
  'window.closeNoticeAcknowledge': '知道了',
  'window.rendererFailed': '桌面视图停止响应，且未能恢复。',
  'lan.qrTitle': '连接手机或平板',
  'lan.qrInstructions': '使用 mobile shell 或手机浏览器扫描二维码，然后确认配对。',
  'lan.address': '地址：{address}',
  'lan.code': '配对码：{code}',
  'lan.expires': '此配对码约 {minutes} 分钟后过期，且只能使用一次。',
  'lan.expiresSeconds': '配对码剩余 {seconds} 秒，且只能使用一次。',
  'lan.expired': '此配对码已过期，请关闭窗口后重新创建。',
  'presets.exportTitle': '导出 Agent 预设',
  'presets.importTitle': '导入 Agent 预设',
  'presets.importTrustTitle': '导入这个预设吗？',
  'presets.importTrustBody': '这是一个外部文件，将安装为用户预设，不会替换任何内置预设。',
  'presets.conflictTitle': '已存在同名预设',
  'presets.conflictBody': '用户预设 {name} 已存在。跳过、替换它，或作为副本导入。',
  'presets.conflictSkip': '跳过',
  'presets.conflictReplace': '替换',
  'presets.conflictClone': '作为副本导入',
  'presets.exportSaved': '已导出 {name}',
  'presets.importDone': '已导入 {name}',
  'presets.importSkipped': '已跳过 {name}',
  'presets.invalid': '文件不是有效的 dsh 预设。',
  'presets.empty': '还没有用户预设；请先在官方预设选择器里创建一个。',
  'lan.close': '关闭',
}

export const SHELL_COPY: Readonly<Record<ShellLocale, Readonly<Record<CopyKey, string>>>> = {
  en: english,
  zh: chinese,
}

export function shellText(locale: ShellLocale, key: CopyKey, values: Readonly<Record<string, string | number>> = {}): string {
  return SHELL_COPY[locale][key].replace(/\{(\w+)\}/g, (token, name: string) => (
    Object.hasOwn(values, name) ? String(values[name]) : token
  ))
}

export function isShellLocale(value: unknown): value is ShellLocale {
  return value === 'zh' || value === 'en'
}

export function isShellTheme(value: unknown): value is ShellTheme {
  return value === 'light' || value === 'dark' || value === 'system'
}

/** Select the first supported primary language subtag; English is the product fallback. */
export function resolvePreferredLocale(preferredLanguages: readonly string[]): ShellLocale {
  for (const language of preferredLanguages) {
    const primary = language.trim().toLowerCase().split('-')[0]
    if (isShellLocale(primary)) return primary
  }
  return 'en'
}

function parseLocaleDocument(text: string): {
  locale: ShellLocale | undefined
  theme: ShellTheme | undefined
  rendered?: (locale: ShellLocale) => string
} {
  const document = parseDocument(text, { prettyErrors: true })
  if (document.errors.length > 0) throw document.errors[0]
  const value: unknown = document.toJS()
  if (value !== null && (typeof value !== 'object' || Array.isArray(value))) {
    throw new Error('settings document root must be a mapping')
  }
  const localeSection = value === null ? undefined : (value as Record<string, unknown>).locale
  if (localeSection !== undefined && (typeof localeSection !== 'object' || localeSection === null || Array.isArray(localeSection))) {
    throw new Error('settings locale section must be a mapping')
  }
  const preference = localeSection === undefined ? undefined : (localeSection as Record<string, unknown>).preference
  if (preference !== undefined && !isShellLocale(preference)) throw new Error('unsupported locale preference')
  const themeSection = value === null ? undefined : (value as Record<string, unknown>)['ui-theme']
  if (themeSection !== undefined && (typeof themeSection !== 'object' || themeSection === null || Array.isArray(themeSection))) {
    throw new Error('settings ui-theme section must be a mapping')
  }
  const theme = themeSection === undefined ? undefined : (themeSection as Record<string, unknown>).preference
  if (theme !== undefined && !isShellTheme(theme)) throw new Error('unsupported theme preference')
  return {
    locale: preference,
    theme,
    rendered: (locale) => {
      document.setIn(['locale', 'preference'], locale)
      return document.toString()
    },
  }
}

export async function readLocalePreference(settingsPath: string): Promise<ShellLocale | undefined> {
  try {
    return parseLocaleDocument(await readFile(settingsPath, 'utf8')).locale
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

export async function readThemePreference(settingsPath: string): Promise<ShellTheme | undefined> {
  try {
    return parseLocaleDocument(await readFile(settingsPath, 'utf8')).theme
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/** Initialize an absent preference once, without overwriting an existing or invalid value. */
export async function initializeLocalePreference(
  settingsPath: string,
  preferredLanguages: readonly string[],
): Promise<ShellLocale> {
  const existing = await readLocalePreference(settingsPath)
  if (existing !== undefined) return existing
  const selected = resolvePreferredLocale(preferredLanguages)
  return withFileLock(`${settingsPath}.lock`, async () => {
    let text = ''
    try {
      text = await readFile(settingsPath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const parsed = parseLocaleDocument(text)
    if (parsed.locale !== undefined) return parsed.locale
    await atomicWriteFile(settingsPath, parsed.rendered!(selected))
    return selected
  })
}

export type LocaleListener = (locale: ShellLocale) => void
export type ThemeListener = (theme: ShellTheme) => void

/** Keeps shell-owned native surfaces synchronized with Harness settings. */
export class ShellLocaleController {
  private current: ShellLocale
  private currentTheme: ShellTheme
  private readonly settingsPath: string
  private readonly systemLocale: ShellLocale
  private readonly listeners = new Set<LocaleListener>()
  private readonly themeListeners = new Set<ThemeListener>()
  private watcher: FSWatcher | undefined
  private readTimer: NodeJS.Timeout | undefined
  private pollTimer: NodeJS.Timeout | undefined

  private constructor(settingsPath: string, initial: ShellLocale, theme: ShellTheme, systemLocale: ShellLocale) {
    this.settingsPath = settingsPath
    this.current = initial
    this.currentTheme = theme
    this.systemLocale = systemLocale
  }

  static async create(settingsPath: string, preferredLanguages: readonly string[]): Promise<ShellLocaleController> {
    const systemLocale = resolvePreferredLocale(preferredLanguages)
    let initial: ShellLocale = 'en'
    let theme: ShellTheme = 'system'
    try {
      initial = await initializeLocalePreference(settingsPath, preferredLanguages)
      theme = await readThemePreference(settingsPath) ?? 'system'
    } catch (error) {
      console.warn(`dsh-desktop: locale initialization failed; using English: ${error instanceof Error ? error.message : String(error)}`)
    }
    const controller = new ShellLocaleController(settingsPath, initial, theme, systemLocale)
    controller.startWatching()
    controller.startPolling()
    return controller
  }

  get locale(): ShellLocale {
    return this.current
  }

  get theme(): ShellTheme {
    return this.currentTheme
  }

  subscribe(listener: LocaleListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeTheme(listener: ThemeListener): () => void {
    this.themeListeners.add(listener)
    return () => this.themeListeners.delete(listener)
  }

  dispose(): void {
    if (this.readTimer !== undefined) clearTimeout(this.readTimer)
    if (this.pollTimer !== undefined) clearInterval(this.pollTimer)
    this.watcher?.close()
    this.listeners.clear()
    this.themeListeners.clear()
  }

  private startPolling(): void {
    // Directory fs.watch can miss content rewrites on some platforms
    // (Windows in particular), which left the native menu and title stuck on
    // the old locale after a settings change until restart. The file is tiny,
    // so re-read it every few seconds as a fallback; refresh() deduplicates
    // and only notifies when a value actually changed.
    this.pollTimer = setInterval(() => { void this.refresh() }, 2_000)
    this.pollTimer.unref()
  }

  private startWatching(): void {
    try {
      this.watcher = watch(dirname(this.settingsPath), { persistent: false }, (_event, filename) => {
        if (filename !== null && filename.toString() !== basename(this.settingsPath)) return
        if (this.readTimer !== undefined) clearTimeout(this.readTimer)
        this.readTimer = setTimeout(() => {
          this.readTimer = undefined
          void this.refresh()
        }, 150)
        this.readTimer.unref()
      })
      this.watcher.on('error', error => console.warn(`dsh-desktop: locale watcher failed: ${error.message}`))
    } catch (error) {
      console.warn(`dsh-desktop: locale watcher unavailable: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async refresh(): Promise<void> {
    try {
      const text = await readFile(this.settingsPath, 'utf8')
      const snapshot = parseLocaleDocument(text)
      const next = snapshot.locale ?? this.systemLocale
      const nextTheme = snapshot.theme ?? 'system'
      if (next !== this.current) {
        this.current = next
        for (const listener of [...this.listeners]) listener(next)
      }
      if (nextTheme !== this.currentTheme) {
        this.currentTheme = nextTheme
        for (const listener of [...this.themeListeners]) listener(nextTheme)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        if (this.current !== this.systemLocale) {
          this.current = this.systemLocale
          for (const listener of [...this.listeners]) listener(this.current)
        }
        if (this.currentTheme !== 'system') {
          this.currentTheme = 'system'
          for (const listener of [...this.themeListeners]) listener(this.currentTheme)
        }
        return
      }
      console.warn(`dsh-desktop: ignoring invalid locale update: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
