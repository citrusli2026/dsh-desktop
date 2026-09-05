/** Main-window ownership, persistence, and navigation boundaries. */
import { app, BrowserWindow, clipboard, Menu, nativeTheme, screen, shell } from 'electron'
import { join } from 'node:path'
import { errorPageHtml, loadingPageHtml } from './pages.ts'
import type { HarnessStartupStage } from './supervisor.ts'
import type { ComposedRow } from './safe-mode.ts'
import { fitWindowState, MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, type WindowState } from './window-state.ts'
import { shellText, type ShellLocale } from './locale.ts'
import { hiddenTitleBarOptions } from './window-chrome.ts'
import { ConfigFile } from './config-file.ts'
import { MAX_RENDERER_RECOVERIES, recordRendererRecovery } from './renderer-recovery.ts'
import { buildLanMenuItems, buildSafeModeMenuItems, type LanMenuActions, type LanMenuState } from './menu-template.ts'

type BuiltInPage =
  | { kind: 'loading'; stage: HarnessStartupStage; retryDelayMs: number }
  | { kind: 'error'; attempts: number; logTail: string; safeMode: boolean; suspects: ComposedRow[]; cause?: 'kernel-api' | 'unknown' }

export interface WindowLanApi {
  getState(): LanMenuState
  actions: LanMenuActions
}

export interface WindowSafeModeApi {
  isActive(): boolean
  toggle(): void
}

export interface WindowHarnessApi {
  restartEnabled(): boolean
  restart(): void
}

export interface WindowContext {
  mainWindow?: BrowserWindow
  allowedOrigin?: string
  harnessUrl?: string
  builtInPage?: BuiltInPage
  quitInProgress: boolean
  hideOnClose: boolean
  /** Skip the first ready-to-show reveal when the OS launched us to the tray. */
  startHidden?: boolean
  getLocale(): ShellLocale
  onVisibilityChanged?(): void
  onCloseToTray?(): void
  rendererRecoveryTimes?: number[]
  /** LAN-link entries for the window context menu; discoverable without the native menu bar. */
  lan?: WindowLanApi
  /** Safe Mode entry for the window context menu (decision 0023 trio). */
  safeMode?: WindowSafeModeApi
  /** Restart entry for the window context menu (decision 0028). */
  harness?: WindowHarnessApi
  /** Open the About dialog from the window context menu. */
  onShowAbout?(): void
}

const windowStateFile = new ConfigFile<unknown>(
  join(app.getPath('userData'), 'window-state.json'),
  undefined,
  raw => raw,
  {
    // A missing file is the first-run state; anything else is worth a warn.
    onError: error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      console.warn(`dsh-desktop: window state failed: ${error instanceof Error ? error.message : String(error)}`)
    },
  },
)

function loadWindowState(): WindowState {
  return fitWindowState(windowStateFile.readSync(), screen.getAllDisplays().map(display => display.workArea))
}

function saveWindowState(window: BrowserWindow): void {
  if (window.isDestroyed()) return
  const bounds = window.getNormalBounds()
  const state: WindowState = { ...bounds, isMaximized: window.isMaximized() }
  windowStateFile.writeSync(state)
}

export function createMainWindow(context: WindowContext): BrowserWindow {
  const state = loadWindowState()
  let saveStateTimer: NodeJS.Timeout | undefined
  const dark = nativeTheme.shouldUseDarkColors
  const window = new BrowserWindow({
    width: state.width,
    height: state.height,
    ...(state.x !== undefined && state.y !== undefined ? { x: state.x, y: state.y } : {}),
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    title: shellText(context.getLocale(), 'window.title'),
    backgroundColor: dark ? '#0e0f12' : '#f9f8f8',
    ...hiddenTitleBarOptions(process.platform, dark),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(__dirname, '..', 'preload', 'index.cjs'),
    },
  })
  context.mainWindow = window
  if (state.isMaximized === true) window.maximize()
  window.once('ready-to-show', () => {
    if (context.startHidden === true) {
      context.startHidden = false
      context.onVisibilityChanged?.()
      return
    }
    window.show()
  })

  const scheduleSave = (): void => {
    if (saveStateTimer !== undefined) clearTimeout(saveStateTimer)
    saveStateTimer = setTimeout(() => {
      saveStateTimer = undefined
      saveWindowState(window)
    }, 400)
    saveStateTimer.unref()
  }
  window.on('resize', scheduleSave)
  window.on('move', scheduleSave)
  window.on('close', (event) => {
    saveWindowState(window)
    if (!context.quitInProgress && context.hideOnClose) {
      event.preventDefault()
      window.hide()
      context.onCloseToTray?.()
    }
  })
  window.on('show', () => context.onVisibilityChanged?.())
  window.on('hide', () => context.onVisibilityChanged?.())
  window.on('closed', () => {
    if (context.mainWindow === window) context.mainWindow = undefined
  })
  // The harness UI emits page-title-updated on every navigation, which would
  // overwrite our shell-owned window title (including the "Community" suffix).
  // Suppress those updates and keep the shell title authoritative; the
  // harness workspace name is still visible inside its own UI.
  window.webContents.on('page-title-updated', (event) => {
    event.preventDefault()
    window.setTitle(shellText(context.getLocale(), 'window.title'))
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('data:')) return
    if (context.allowedOrigin !== undefined && new URL(url).origin === context.allowedOrigin) return
    event.preventDefault()
    void openExternalUrl(url)
  })
  window.webContents.on('context-menu', (_event, parameters) => {
    const locale = context.getLocale()
    const items: Electron.MenuItemConstructorOptions[] = []
    if (parameters.isEditable) {
      items.push(
        { role: 'undo', label: shellText(locale, 'menu.undo') },
        { role: 'redo', label: shellText(locale, 'menu.redo') },
        { type: 'separator' },
        { role: 'cut', label: shellText(locale, 'menu.cut') },
        { role: 'copy', label: shellText(locale, 'menu.copy') },
        { role: 'paste', label: shellText(locale, 'menu.paste') },
        { role: 'selectAll', label: shellText(locale, 'menu.selectAll') },
      )
    } else if (parameters.selectionText !== '') {
      items.push({ role: 'copy', label: shellText(locale, 'menu.copy') })
    }
    if (parameters.linkURL !== '') {
      if (items.length > 0) items.push({ type: 'separator' })
      items.push(
        { label: shellText(locale, 'context.openLink'), click: () => { void openExternalUrl(parameters.linkURL) } },
        { label: shellText(locale, 'context.copyLink'), click: () => clipboard.writeText(parameters.linkURL) },
      )
    }
    // The extension actions (decisions 0023/0028) — LAN, Safe Mode, restart,
    // About — keep the menu non-empty and consistent with the app Extensions
    // menu, tray, and overlay, so the entry stays discoverable on
    // Windows/Linux where the menu bar is hidden.
    const lan = context.lan
    if (lan !== undefined) {
      if (items.length > 0) items.push({ type: 'separator' })
      items.push(...buildLanMenuItems(locale, lan.getState(), lan.actions))
    }
    if (context.safeMode !== undefined) {
      items.push(...buildSafeModeMenuItems(locale, context.safeMode.isActive(), { toggleSafeMode: () => context.safeMode?.toggle() }))
    }
    if (context.harness !== undefined) {
      items.push({
        label: shellText(locale, 'menu.restartHarness'),
        enabled: context.harness.restartEnabled(),
        click: () => context.harness?.restart(),
      })
    }
    if (context.onShowAbout !== undefined) {
      items.push(
        { type: 'separator' },
        { label: shellText(locale, 'app.about'), click: context.onShowAbout },
      )
    }
    // Fullscreen is a window function, not an extension action (decision
    // 0023); it trails the trio at the end of the context menu.
    if (items.length > 0) {
      items.push(
        { type: 'separator' },
        { role: 'togglefullscreen', label: shellText(locale, 'menu.fullScreen') },
      )
    }
    if (items.length > 0) Menu.buildFromTemplate(items).popup({ window })
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    if (!context.quitInProgress) void recoverRenderer(context, `renderer ${details.reason} (exit ${details.exitCode})`)
  })
  window.webContents.on('did-fail-load', (_event, errorCode, description, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || validatedURL.startsWith('data:') || context.quitInProgress) return
    void recoverRenderer(context, `load failed (${errorCode}): ${description}`)
  })
  void loadLoadingPage(context)
  return window
}

async function openExternalUrl(url: string): Promise<void> {
  try {
    const target = new URL(url)
    if (target.protocol === 'https:' || target.protocol === 'http:') await shell.openExternal(target.href)
  } catch {
    // Ignore malformed or non-web URLs supplied by renderer content.
  }
}

async function navigateWindow(context: WindowContext, url: string): Promise<void> {
  const window = context.mainWindow
  if (window === undefined || window.isDestroyed()) return
  try {
    await window.loadURL(url)
  } catch (error) {
    if (context.quitInProgress || window.isDestroyed()) return
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
    if (code === 'ERR_ABORTED' || code === -3) return
    // did-fail-load owns recovery; catch here so Electron navigation failures
    // never become process-level unhandled rejections.
    console.warn(`dsh-desktop: navigation failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function recoverRenderer(context: WindowContext, reason: string): Promise<void> {
  const { times: recent, allowed } = recordRendererRecovery(context.rendererRecoveryTimes, Date.now())
  context.rendererRecoveryTimes = recent
  console.warn(`dsh-desktop: ${reason}; renderer recovery ${recent.length}/${MAX_RENDERER_RECOVERIES}`)
  if (allowed && context.harnessUrl !== undefined) {
    await navigateWindow(context, context.harnessUrl)
    return
  }
  await loadErrorPage(context, 0, `${shellText(context.getLocale(), 'window.rendererFailed')}\n${reason}`)
}

export function showWindow(context: WindowContext): void {
  context.startHidden = false
  const window = context.mainWindow
  if (window === undefined || window.isDestroyed()) {
    const harnessUrl = context.harnessUrl
    const builtInPage = context.builtInPage
    createMainWindow(context)
    if (builtInPage?.kind === 'error') {
      void loadErrorPage(context, builtInPage.attempts, builtInPage.logTail, builtInPage.safeMode, builtInPage.suspects, builtInPage.cause)
    }
    else if (harnessUrl !== undefined && builtInPage === undefined) void loadHarnessUrl(context, harnessUrl)
    return
  }
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

export async function loadHarnessUrl(context: WindowContext, url: string): Promise<void> {
  context.allowedOrigin = new URL(url).origin
  context.harnessUrl = url
  context.builtInPage = undefined
  await navigateWindow(context, url)
}

export async function loadLoadingPage(
  context: WindowContext,
  stage: HarnessStartupStage = 'launching',
  retryDelayMs = 0,
): Promise<void> {
  context.builtInPage = { kind: 'loading', stage, retryDelayMs }
  await navigateWindow(context, loadingPageHtml(context.getLocale(), stage, retryDelayMs))
}

export async function loadErrorPage(context: WindowContext, attempts: number, logTail: string, safeMode = false, suspects: ComposedRow[] = [], cause: 'kernel-api' | 'unknown' = 'unknown'): Promise<void> {
  context.builtInPage = { kind: 'error', attempts, logTail, safeMode, suspects, cause }
  await navigateWindow(context, errorPageHtml(attempts, logTail, safeMode, suspects, context.getLocale(), cause))
}

/** Re-render shell-owned pages and title after a live language switch. */
export async function refreshWindowLocale(context: WindowContext): Promise<void> {
  context.mainWindow?.setTitle(shellText(context.getLocale(), 'window.title'))
  if (context.builtInPage?.kind === 'loading') await loadLoadingPage(context, context.builtInPage.stage, context.builtInPage.retryDelayMs)
  else if (context.builtInPage?.kind === 'error') {
    await loadErrorPage(context, context.builtInPage.attempts, context.builtInPage.logTail, context.builtInPage.safeMode, context.builtInPage.suspects, context.builtInPage.cause)
  }
}

export function refreshWindowTheme(context: WindowContext): void {
  const window = context.mainWindow
  if (window === undefined || window.isDestroyed()) return
  const dark = nativeTheme.shouldUseDarkColors
  window.setBackgroundColor(dark ? '#0e0f12' : '#f9f8f8')
  const overlay = hiddenTitleBarOptions(process.platform, dark).titleBarOverlay
  if (overlay !== undefined) window.setTitleBarOverlay(overlay)
}
