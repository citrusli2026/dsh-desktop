/** Electron lifecycle assembly for the bundled DeepSeek Harness runtime. */
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, nativeTheme, Notification, session, shell, type MessageBoxOptions } from 'electron'
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
import { createTray, destroyTray, refreshTray, type TrayActions } from './tray.ts'
import { checkForUpdatesInteractively, checkMacUpdate, configureAutoUpdates } from './update-prompt.ts'
import { armSmokeTimeout, quitGracefully, SMOKE_TEST, SMOKE_UI_TEST, smokeUiRender, smokeVerify, verifySmokeFailureRecovery } from './smoke.ts'
import { DEV_WEB_URL_ENV, SMOKE_EXIT_FAIL, TEST_FAIL_HARNESS_ENV, TEST_RETRY_FAIL_ENV } from './smoke-protocol.ts'
import { exportDiagnosticReport } from './diagnostics.ts'
import { ShellLocaleController, shellText, type ShellLocale } from './locale.ts'
import type { LanMenuActions, LanMenuState, MenuActions } from './menu-template.ts'
import { markCloseToTrayExplained, shouldExplainCloseToTray } from './shell-preferences.ts'
import { LanService, qrSvgFromText } from './lan.ts'
import { closeLanPairingWindow, isLanPairingWindow, showLanPairingWindow } from './lan-window.ts'
import { isMainWindowHarnessSender, isMainWindowSender, isShellOwnedFrame, ShellApp } from './shell-app.ts'
import { DesktopPreferencesController, type DesktopPreferencesUpdate } from './desktop-preferences.ts'
import { createShellPreferences } from './shell-preferences.ts'
import { normalizePublicStatusSnapshot, notificationsForPublicStatus, type PublicStatusSnapshot } from './desktop-notifications.ts'

const DEV_WEB_URL = process.env[DEV_WEB_URL_ENV]
const MAC_UPDATE_CHECK_DELAY_MS = 15_000

let currentLocale: ShellLocale = 'en'
let localeController: ShellLocaleController | undefined
let closeNoticeClaimed = false
let desktopPreferencesController: DesktopPreferencesController | undefined
let lastPublicStatus: PublicStatusSnapshot | undefined
let lastHarnessPhase: HarnessState['phase'] | undefined

const lanService = new LanService({
  mobileShellRoot,
  nodeExecutable: () => nodeBin(),
  getTargetUrl: () => shellApp.state?.phase === 'ready' ? shellApp.state.url : undefined,
  onLog: line => console.log(`dsh-desktop: ${line}`),
  onStateChanged: () => refreshNativeSurfaces(),
})

const windowContext: WindowContext = {
  quitInProgress: false,
  hideOnClose: false,
  getLocale: () => currentLocale,
  onVisibilityChanged: refreshTray,
  onCloseToTray: () => { void explainCloseToTray() },
  onShowAbout: () => { void showAboutDialog(currentLocale) },
  lan: {
    getState: (): LanMenuState => ({ lanRunning: lanService.isRunning, lanBusy: lanService.isBusy }),
    actions: {
      startLanLink: () => { void startLanLink() },
      showLanQr: () => { void showLanQr() },
      stopLanLink,
    },
  },
}

/** The shell state machine, wired to the Electron surfaces it drives. */
const shellApp = new ShellApp({
  createSupervisor: onState => new HarnessSupervisor({ onState }),
  onStateApplied: (state) => {
    if (windowContext.quitInProgress) return
    notifyHarnessState(state)
    if (state.phase !== 'ready') lastPublicStatus = undefined
    installAppMenu(currentLocale, menuActions, shellApp.restartEnabled(), lanService.isRunning, lanService.isBusy, desktopPreferencesController?.snapshot.shortcut)
    refreshTray()
    if (state.phase === 'ready') void loadHarnessUrl(windowContext, state.url)
    else if (state.phase === 'crashed') void loadErrorPage(windowContext, state.attempts, state.logTail)
    else void loadLoadingPage(windowContext)
  },
  onRestartBusyChanged: refreshNativeSurfaces,
  restartLanProxy: () => lanService.restart(),
  confirmRestart: async () => {
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
    return result.response === 0
  },
})

function refreshNativeSurfaces(): void {
  if (windowContext.quitInProgress) return
  installAppMenu(currentLocale, menuActions, shellApp.restartEnabled(), lanService.isRunning, lanService.isBusy, desktopPreferencesController?.snapshot.shortcut)
  refreshTray()
}

function notificationEnabled(): boolean {
  const preferences = desktopPreferencesController?.snapshot
  if (preferences?.notificationsAvailable !== true || preferences.notificationsEnabled !== true) return false
  const window = windowContext.mainWindow
  return window === undefined || window.isDestroyed() || !window.isVisible() || !window.isFocused()
}

function showDesktopNotification(title: string, body: string): void {
  if (!notificationEnabled()) return
  try {
    new Notification({ title, body }).show()
  } catch (error) {
    console.warn(`dsh-desktop: notification failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function notifyHarnessState(state: HarnessState): void {
  const previous = lastHarnessPhase
  lastHarnessPhase = state.phase
  if (previous === 'ready' && state.phase === 'crashed') {
    showDesktopNotification(shellText(currentLocale, 'notify.harnessStoppedTitle'), shellText(currentLocale, 'notify.harnessStoppedBody'))
  } else if (previous === 'crashed' && state.phase === 'ready') {
    showDesktopNotification(shellText(currentLocale, 'notify.harnessRecoveredTitle'), shellText(currentLocale, 'notify.harnessRecoveredBody'))
  }
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

async function showLanQr(): Promise<boolean> {
  const pairing = lanService.currentPairing
  if (pairing === undefined) return false
  try {
    const qrSvg = await qrSvgFromText(pairing.pairingUrl, mobileShellRoot())
    showLanPairingWindow(windowContext.mainWindow, pairing, qrSvg, currentLocale)
    return true
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error',
      title: shellText(currentLocale, 'menu.extensions'),
      message: error instanceof Error ? error.message : String(error),
      buttons: [shellText(currentLocale, 'common.ok')],
    })
    return false
  }
}

async function startLanLink(): Promise<boolean> {
  try {
    const pairing = await lanService.start()
    refreshNativeSurfaces()
    const qrSvg = await qrSvgFromText(pairing.pairingUrl, mobileShellRoot())
    showLanPairingWindow(windowContext.mainWindow, pairing, qrSvg, currentLocale)
    return true
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error',
      title: shellText(currentLocale, 'menu.extensions'),
      message: error instanceof Error ? error.message : String(error),
      buttons: [shellText(currentLocale, 'common.ok')],
    })
    return false
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

function showMainWindow(): void {
  windowContext.startHidden = false
  showWindow(windowContext)
}

function releaseDesktopShortcut(): void {
  desktopPreferencesController?.dispose()
}

function toggleLaunchAtLogin(): void {
  const controller = desktopPreferencesController
  if (controller === undefined) return
  const result = controller.update({ launchAtLogin: !controller.snapshot.launchAtLogin })
  if (!result.ok) console.warn(`dsh-desktop: could not update launch-at-login: ${result.reason}`)
  refreshNativeSurfaces()
}

function toggleMaximize(): void {
  const window = windowContext.mainWindow
  if (window === undefined || window.isDestroyed()) return
  if (window.isMaximized()) window.unmaximize()
  else window.maximize()
}

function toggleFullscreen(): boolean {
  const window = windowContext.mainWindow
  if (window === undefined || window.isDestroyed()) return false
  window.setFullScreen(!window.isFullScreen())
  return true
}

const menuActions: MenuActions = {
  showWindow: showMainWindow,
  closeWindow: () => windowContext.mainWindow?.close(),
  quit: () => app.quit(),
  toggleMaximize,
  restartHarness: () => { void shellApp.requestRestart() },
  openLogs: () => { void openLogsFolder() },
  exportDiagnostics: () => { void exportDiagnosticReport(shellApp.state, currentLocale) },
  checkForUpdates: () => { void checkForUpdatesInteractively(currentLocale) },
  showAbout: () => { void showAboutDialog(currentLocale) },
  openExternal: url => { void shell.openExternal(url) },
  startLanLink: () => { void startLanLink() },
  showLanQr: () => { void showLanQr() },
  stopLanLink,
}

const trayActions: TrayActions = {
  getLocale: (): ShellLocale => currentLocale,
  getState: (): HarnessState | undefined => shellApp.state,
  isRestarting: (): boolean => shellApp.restartInFlight,
  getShortcut: (): string => desktopPreferencesController?.snapshot.shortcut ?? 'CommandOrControl+Shift+Space',
  isShortcutRegistered: (): boolean => desktopPreferencesController?.snapshot.shortcutRegistered === true,
  isLaunchAtLoginAvailable: (): boolean => desktopPreferencesController?.snapshot.launchAtLoginAvailable === true,
  isLaunchAtLoginEnabled: (): boolean => desktopPreferencesController?.snapshot.launchAtLogin === true,
  toggleLaunchAtLogin: (): void => { void toggleLaunchAtLogin() },
  isWindowVisible: (): boolean => windowContext.mainWindow?.isVisible() === true,
  showWindow: showMainWindow,
  toggleWindow: toggleMainWindow,
  restartHarness: (): void => { void shellApp.requestRestart() },
  openLogs: (): void => { void openLogsFolder() },
  exportDiagnostics: (): void => { void exportDiagnosticReport(shellApp.state, currentLocale) },
  checkForUpdates: (): void => { void checkForUpdatesInteractively(currentLocale) },
  quit: (): void => app.quit(),
  showAbout: (): void => { void showAboutDialog(currentLocale) },
  openExternal: url => { void shell.openExternal(url) },
  getLanState: (): LanMenuState => ({ lanRunning: lanService.isRunning, lanBusy: lanService.isBusy }),
  getLanActions: (): LanMenuActions => ({
    startLanLink: () => { void startLanLink() },
    showLanQr: () => { void showLanQr() },
    stopLanLink,
  }),
}

// Shell-owned IPC handlers are exposed through the sandboxed preload. The
// recovery channels remain data-page-only; the desktop-controls plugin gets a
// separate allowlisted set of handlers from the verified Harness origin.
ipcMain.handle('harness:retry', async (event) => {
  if (!isMainWindowSender(windowContext.mainWindow, event.sender, event.senderFrame?.url)) return false
  if (SMOKE_TEST && process.env[TEST_RETRY_FAIL_ENV] === '1') return false
  return shellApp.runHarnessRestart()
})

ipcMain.handle('shell:export-diagnostics', async (event) => {
  if (!isMainWindowSender(windowContext.mainWindow, event.sender, event.senderFrame?.url)) return false
  return exportDiagnosticReport(shellApp.state, currentLocale)
})

ipcMain.handle('shell:close-lan-pairing', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!isLanPairingWindow(window)) return false
  if (!isShellOwnedFrame(event.senderFrame?.url)) return false
  window.close()
  return true
})

ipcMain.handle('desktop:action', async (event, action: unknown) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return false
  if (typeof action !== 'string') return false
  if (action === 'startLanPairing') return startLanLink()
  if (action === 'toggleFullscreen') return toggleFullscreen()
  if (action === 'showAbout') {
    await showAboutDialog(currentLocale)
    return true
  }
  return false
})

ipcMain.handle('desktop:preferences:get', (event) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  return desktopPreferencesController?.snapshot ?? null
})

ipcMain.handle('desktop:preferences:update', (event, patch: unknown) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return null
  const candidate = patch as Record<string, unknown>
  const update: DesktopPreferencesUpdate = {}
  if (typeof candidate.shortcut === 'string') update.shortcut = candidate.shortcut
  if (typeof candidate.launchAtLogin === 'boolean') update.launchAtLogin = candidate.launchAtLogin
  if (typeof candidate.launchHidden === 'boolean') update.launchHidden = candidate.launchHidden
  if (typeof candidate.notificationsEnabled === 'boolean') update.notificationsEnabled = candidate.notificationsEnabled
  return desktopPreferencesController?.update(update) ?? null
})

ipcMain.handle('desktop:session-status', (event, raw: unknown) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return false
  const next = normalizePublicStatusSnapshot(raw)
  if (next === undefined) return false
  for (const notification of notificationsForPublicStatus(lastPublicStatus, next, currentLocale)) {
    showDesktopNotification(notification.title, notification.body)
  }
  lastPublicStatus = next
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
    shellApp.applyState({ phase: 'ready', url: DEV_WEB_URL })
    return DEV_WEB_URL
  }
  verifyHarness(harnessRoot())
  if (SMOKE_TEST && process.env[TEST_FAIL_HARNESS_ENV] === '1') {
    shellApp.applyState({ phase: 'crashed', attempts: 6, logTail: 'simulated crash (smoke)' })
    throw new Error('simulated boot failure (smoke)')
  }
  return shellApp.startHarness()
}

app.on('before-quit', (event) => {
  if (windowContext.quitInProgress) return
  windowContext.quitInProgress = true
  releaseDesktopShortcut()
  closeLanPairingWindow()
  localeController?.dispose()
  destroyTray()
  if (shellApp.supervisorInstance !== undefined || lanService.isRunning) {
    event.preventDefault()
    // Absolute quit guard: each stop() already has a SIGKILL fallback, but if
    // something unexpected leaves a promise pending we still force-quit
    // within 8s instead of hanging the app on exit.
    const forceQuitTimer = setTimeout(() => app.quit(), 8_000)
    forceQuitTimer.unref()
    void Promise.all([shellApp.stopHarness(), lanService.stop()]).finally(() => {
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

    if (!SMOKE_TEST) {
      desktopPreferencesController = new DesktopPreferencesController({
        store: createShellPreferences(join(app.getPath('userData'), 'shell-preferences.json')),
        registrar: globalShortcut,
        onSummon: showMainWindow,
        platform: process.platform,
        packaged: app.isPackaged,
        loginItems: {
          getLoginItemSettings: () => app.getLoginItemSettings(),
          setLoginItemSettings: settings => { app.setLoginItemSettings(settings) },
        },
        notificationsAvailable: Notification.isSupported(),
      })
      desktopPreferencesController.initialize()
      windowContext.startHidden = desktopPreferencesController.shouldStartHidden()
    }

    createMainWindow(windowContext)
    installAppMenu(currentLocale, menuActions, false, false, false, desktopPreferencesController?.snapshot.shortcut)
    if (!SMOKE_TEST) {
      try {
        createTray(trayActions)
        windowContext.hideOnClose = true
      } catch (error) {
        windowContext.hideOnClose = false
        windowContext.startHidden = false
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
        if (SMOKE_UI_TEST) {
          const mainWindow = windowContext.mainWindow
          if (mainWindow === undefined || mainWindow.isDestroyed()) {
            console.error('dsh-desktop: smoke-ui: no main window')
            quitGracefully(SMOKE_EXIT_FAIL)
          } else {
            await smokeUiRender(url, mainWindow)
          }
        } else {
          await smokeVerify(url)
        }
      }
    } catch (error) {
      console.error('dsh-desktop: boot failed:', error instanceof Error ? error.message : error)
      if (!SMOKE_TEST) {
        const message = error instanceof Error ? error.message : String(error)
        if (windowContext.mainWindow === undefined || windowContext.mainWindow.isDestroyed()) createMainWindow(windowContext)
        shellApp.applyState({ phase: 'crashed', attempts: 0, logTail: message })
      } else if (process.env[TEST_FAIL_HARNESS_ENV] === '1' && windowContext.mainWindow !== undefined) {
        await verifySmokeFailureRecovery(windowContext.mainWindow, () => windowContext.allowedOrigin, currentLocale)
      } else {
        quitGracefully(1)
      }
    }
  })
}
