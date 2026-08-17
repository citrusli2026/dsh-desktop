/** Electron lifecycle assembly for the bundled DeepSeek Harness runtime. */
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, session, shell, type MessageBoxOptions } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { HarnessSupervisor, type HarnessState } from './supervisor.ts'
import { resolveDshHome } from './dsh-home.ts'
import { dshBin, harnessRoot, mobileShellRoot, nodeBin } from './paths.ts'
import { installAppMenu, showAboutDialog } from './menu.ts'
import { denyUnexpectedPermissions } from './permissions.ts'
import {
  createMainWindow,
  loadErrorPage,
  loadHarnessUrl,
  loadLoadingPage,
  refreshWindowLocale,
  refreshWindowTheme,
  showWindow,
  type WindowContext,
} from './window.ts'
import { createTray, destroyTray, refreshTray } from './tray.ts'
import { checkForUpdatesInteractively, checkMacUpdate, configureAutoUpdates } from './update-prompt.ts'
import { armSmokeTimeout, quitGracefully, SMOKE_TEST, smokeVerify, verifySmokeFailureRecovery } from './smoke.ts'
import { exportDiagnosticReport } from './diagnostics.ts'
import { ShellLocaleController, shellText, type ShellLocale } from './locale.ts'
import type { MenuActions } from './menu-template.ts'
import { markCloseToTrayExplained, shouldExplainCloseToTray } from './shell-preferences.ts'
import { LanService, qrSvgFromText } from './lan.ts'
import { closeLanPairingWindow, showLanPairingWindow } from './lan-window.ts'

const DEV_WEB_URL = process.env.DSH_DESKTOP_DEV_WEB_URL
const MAC_UPDATE_CHECK_DELAY_MS = 15_000

let currentLocale: ShellLocale = 'en'
let localeController: ShellLocaleController | undefined
let supervisor: HarnessSupervisor | undefined
let lastState: HarnessState | undefined
let restartInFlight: Promise<boolean> | undefined
let closeNoticeClaimed = false

const lanService = new LanService({
  mobileShellRoot,
  nodeExecutable: () => nodeBin(),
  getTargetUrl: () => lastState?.phase === 'ready' ? lastState.url : undefined,
  onLog: line => console.log(`dsh-desktop: ${line}`),
  onStateChanged: () => refreshNativeSurfaces(),
})

const windowContext: WindowContext = {
  quitInProgress: false,
  hideOnClose: false,
  getLocale: () => currentLocale,
  onVisibilityChanged: refreshTray,
  onCloseToTray: () => { void explainCloseToTray() },
}

function restartEnabled(): boolean {
  return restartInFlight === undefined && lastState !== undefined && lastState.phase !== 'starting'
}

function refreshNativeSurfaces(): void {
  if (windowContext.quitInProgress) return
  installAppMenu(currentLocale, menuActions, restartEnabled(), lanService.isRunning, lanService.isBusy)
  refreshTray()
}

function applyState(state: HarnessState): void {
  const previousTarget = lastState?.phase === 'ready' ? lastState.url : undefined
  lastState = state
  if (state.phase === 'ready' && lanService.isRunning && previousTarget !== undefined && previousTarget !== state.url) {
    void lanService.restart().catch(error => console.warn(`dsh-desktop: LAN proxy restart failed: ${error instanceof Error ? error.message : String(error)}`))
  }
  refreshNativeSurfaces()
  if (state.phase === 'ready') void loadHarnessUrl(windowContext, state.url)
  else if (state.phase === 'crashed') void loadErrorPage(windowContext, state.attempts, state.logTail)
  else void loadLoadingPage(windowContext)
}

async function runHarnessRestart(): Promise<boolean> {
  if (restartInFlight !== undefined) return restartInFlight
  const task = Promise.resolve().then(async () => {
    await supervisor?.stop()
    if (windowContext.quitInProgress) return false
    supervisor = new HarnessSupervisor({ onState: applyState })
    try {
      await supervisor.start()
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      applyState({ phase: 'crashed', attempts: 0, logTail: message })
      return false
    }
  })
  restartInFlight = task.finally(() => {
    restartInFlight = undefined
    refreshNativeSurfaces()
  })
  refreshNativeSurfaces()
  return restartInFlight
}

async function requestHarnessRestart(): Promise<void> {
  if (!restartEnabled()) return
  if (lastState?.phase === 'ready') {
    const options: MessageBoxOptions = {
      type: 'warning',
      title: shellText(currentLocale, 'restart.title'),
      message: shellText(currentLocale, 'restart.message'),
      detail: shellText(currentLocale, 'restart.detail'),
      buttons: [shellText(currentLocale, 'restart.confirm'), shellText(currentLocale, 'common.cancel')],
      defaultId: 1,
      cancelId: 1,
    }
    const window = windowContext.mainWindow
    const result = window === undefined ? await dialog.showMessageBox(options) : await dialog.showMessageBox(window, options)
    if (result.response !== 0) return
  }
  await runHarnessRestart()
}

async function explainCloseToTray(): Promise<void> {
  if (closeNoticeClaimed || !shouldExplainCloseToTray()) return
  closeNoticeClaimed = true
  markCloseToTrayExplained()
  await dialog.showMessageBox({
    type: 'info',
    title: shellText(currentLocale, 'window.closeNoticeTitle'),
    message: shellText(currentLocale, 'window.closeNoticeMessage'),
    detail: shellText(currentLocale, 'window.closeNoticeDetail'),
    buttons: [shellText(currentLocale, 'window.closeNoticeAcknowledge')],
  })
}

async function openLogsFolder(): Promise<void> {
  const path = join(app.getPath('userData'), 'logs')
  mkdirSync(path, { recursive: true })
  const error = await shell.openPath(path)
  if (error !== '') console.warn(`dsh-desktop: opening logs failed: ${error}`)
}

async function showLanQr(): Promise<void> {
  const pairing = lanService.currentPairing
  if (pairing === undefined) return
  try {
    const qrSvg = await qrSvgFromText(pairing.pairingUrl, mobileShellRoot())
    showLanPairingWindow(windowContext.mainWindow, pairing, qrSvg, currentLocale)
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error',
      title: shellText(currentLocale, 'menu.extensions'),
      message: error instanceof Error ? error.message : String(error),
      buttons: [shellText(currentLocale, 'common.ok')],
    })
  }
}

async function startLanLink(): Promise<void> {
  try {
    const pairing = await lanService.start()
    refreshNativeSurfaces()
    const qrSvg = await qrSvgFromText(pairing.pairingUrl, mobileShellRoot())
    showLanPairingWindow(windowContext.mainWindow, pairing, qrSvg, currentLocale)
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error',
      title: shellText(currentLocale, 'menu.extensions'),
      message: error instanceof Error ? error.message : String(error),
      buttons: [shellText(currentLocale, 'common.ok')],
    })
  }
}

function stopLanLink(): void {
  closeLanPairingWindow()
  void lanService.stop().finally(refreshNativeSurfaces)
}

function toggleMainWindow(): void {
  const window = windowContext.mainWindow
  if (window !== undefined && !window.isDestroyed() && window.isVisible()) window.hide()
  else showWindow(windowContext)
}

function toggleMaximize(): void {
  const window = windowContext.mainWindow
  if (window === undefined || window.isDestroyed()) return
  if (window.isMaximized()) window.unmaximize()
  else window.maximize()
}

const menuActions: MenuActions = {
  closeWindow: () => windowContext.mainWindow?.close(),
  quit: () => app.quit(),
  toggleMaximize,
  restartHarness: () => { void requestHarnessRestart() },
  openLogs: () => { void openLogsFolder() },
  exportDiagnostics: () => { void exportDiagnosticReport(lastState, currentLocale) },
  checkForUpdates: () => { void checkForUpdatesInteractively(currentLocale) },
  showAbout: () => { void showAboutDialog(currentLocale) },
  openExternal: url => { void shell.openExternal(url) },
  startLanLink: () => { void startLanLink() },
  showLanQr: () => { void showLanQr() },
  stopLanLink,
}

const trayActions = {
  getLocale: (): ShellLocale => currentLocale,
  getState: (): HarnessState | undefined => lastState,
  isRestarting: (): boolean => restartInFlight !== undefined,
  isWindowVisible: (): boolean => windowContext.mainWindow?.isVisible() === true,
  toggleWindow: toggleMainWindow,
  restartHarness: (): void => { void requestHarnessRestart() },
  openLogs: (): void => { void openLogsFolder() },
  exportDiagnostics: (): void => { void exportDiagnosticReport(lastState, currentLocale) },
  checkForUpdates: (): void => { void checkForUpdatesInteractively(currentLocale) },
  quit: (): void => app.quit(),
}

// Shell-owned IPC handlers (retry, diagnostics, LAN pairing close) are exposed
// to the renderer only through the sandboxed preload. They must accept calls
// only from shell-owned pages, which we render as data: URLs (loading/error/
// LAN QR). The harness UI itself (served from http://127.0.0.1) never needs
// these channels, so we reject any frame whose URL is not a data: URL — this
// keeps a compromised or curious harness page from invoking shell restarts or
// opening the diagnostic dialog. See src/preload/index.ts for the bridge.
function isShellOwnedFrame(url: string | undefined): boolean {
  return typeof url === 'string' && url.startsWith('data:')
}

ipcMain.handle('harness:retry', async (event) => {
  const window = windowContext.mainWindow
  if (window === undefined || window.isDestroyed()) return false
  if (event.sender !== window.webContents || !isShellOwnedFrame(event.senderFrame?.url)) return false
  if (SMOKE_TEST && process.env.DSH_DESKTOP_TEST_RETRY_FAIL === '1') return false
  return runHarnessRestart()
})

ipcMain.handle('shell:export-diagnostics', async (event) => {
  const window = windowContext.mainWindow
  if (window === undefined || window.isDestroyed()) return false
  if (event.sender !== window.webContents || !isShellOwnedFrame(event.senderFrame?.url)) return false
  return exportDiagnosticReport(lastState, currentLocale)
})

ipcMain.handle('shell:close-lan-pairing', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window === null || window.isDestroyed() || window === windowContext.mainWindow) return false
  if (!isShellOwnedFrame(event.senderFrame?.url)) return false
  window.close()
  return true
})

function verifyHarness(root: string): void {
  const checks: ReadonlyArray<readonly [string, string]> = [['node', nodeBin(root)], ['dsh', dshBin(root)]]
  for (const [label, path] of checks) {
    if (!existsSync(path)) throw new Error(`bundled harness incomplete: ${label} missing at ${path}; run 'pnpm run bootstrap' first`)
  }
}

async function boot(): Promise<string> {
  if (!app.isPackaged && DEV_WEB_URL !== undefined) {
    console.log(`dsh-desktop: dev mode, loading ${DEV_WEB_URL}`)
    applyState({ phase: 'ready', url: DEV_WEB_URL })
    return DEV_WEB_URL
  }
  verifyHarness(harnessRoot())
  if (SMOKE_TEST && process.env.DSH_DESKTOP_TEST_FAIL_HARNESS === '1') {
    applyState({ phase: 'crashed', attempts: 6, logTail: 'simulated crash (smoke)' })
    throw new Error('simulated boot failure (smoke)')
  }
  supervisor = new HarnessSupervisor({ onState: applyState })
  try {
    const url = await supervisor.start()
    console.log(`dsh-desktop: harness ready at ${url}`)
    return url
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`dsh-desktop: ${message}`)
    applyState({ phase: 'crashed', attempts: 0, logTail: message })
    throw error
  }
}

app.on('before-quit', (event) => {
  if (windowContext.quitInProgress) return
  windowContext.quitInProgress = true
  closeLanPairingWindow()
  localeController?.dispose()
  destroyTray()
  if (supervisor !== undefined || lanService.isRunning) {
    event.preventDefault()
    // Absolute quit guard: each stop() already has a SIGKILL fallback, but if
    // something unexpected leaves a promise pending we still force-quit
    // within 8s instead of hanging the app on exit.
    const forceQuitTimer = setTimeout(() => app.quit(), 8_000)
    forceQuitTimer.unref()
    void Promise.all([supervisor?.stop(), lanService.stop()]).finally(() => {
      clearTimeout(forceQuitTimer)
      app.quit()
    })
  }
})

app.on('window-all-closed', () => {
  if (!windowContext.quitInProgress) app.quit()
})
app.on('activate', () => showWindow(windowContext))
configureAutoUpdates(SMOKE_TEST)

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow(windowContext))
  void app.whenReady().then(async () => {
    denyUnexpectedPermissions(session.defaultSession)
    const settingsPath = join(resolveDshHome(process.env, homedir()), 'settings.yaml')
    localeController = await ShellLocaleController.create(settingsPath, app.getPreferredSystemLanguages())
    currentLocale = localeController.locale
    nativeTheme.themeSource = localeController.theme
    localeController.subscribe((locale) => {
      currentLocale = locale
      refreshNativeSurfaces()
      void refreshWindowLocale(windowContext)
    })
    localeController.subscribeTheme((theme) => {
      nativeTheme.themeSource = theme
      refreshWindowTheme(windowContext)
    })

    createMainWindow(windowContext)
    installAppMenu(currentLocale, menuActions, false, false)
    if (!SMOKE_TEST) {
      try {
        createTray(trayActions)
        windowContext.hideOnClose = true
      } catch (error) {
        windowContext.hideOnClose = false
        console.warn(`dsh-desktop: tray unavailable; closing the window will quit: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    try {
      const url = await boot()
      if (!SMOKE_TEST) {
        if (app.isPackaged && process.platform === 'darwin') {
          const timer = setTimeout(() => { void checkMacUpdate(false, currentLocale) }, MAC_UPDATE_CHECK_DELAY_MS)
          timer.unref()
        }
      } else {
        armSmokeTimeout()
        await smokeVerify(url)
      }
    } catch (error) {
      console.error('dsh-desktop: boot failed:', error instanceof Error ? error.message : error)
      if (!SMOKE_TEST) {
        const message = error instanceof Error ? error.message : String(error)
        if (windowContext.mainWindow === undefined || windowContext.mainWindow.isDestroyed()) createMainWindow(windowContext)
        applyState({ phase: 'crashed', attempts: 0, logTail: message })
      } else if (process.env.DSH_DESKTOP_TEST_FAIL_HARNESS === '1' && windowContext.mainWindow !== undefined) {
        await verifySmokeFailureRecovery(windowContext.mainWindow, () => windowContext.allowedOrigin, currentLocale)
      } else {
        quitGracefully(1)
      }
    }
  })
}
