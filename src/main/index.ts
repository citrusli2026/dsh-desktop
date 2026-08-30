/** Electron lifecycle assembly for the bundled DeepSeek Harness runtime. */
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, nativeTheme, net, Notification, session, shell, systemPreferences, type MessageBoxOptions } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { HarnessSupervisor, type HarnessState } from './supervisor.ts'
import { resolveDshHome } from './dsh-home.ts'
import { dshBin, harnessRoot, mobileShellRoot, nodeBin } from './paths.ts'
import { readProfileStatus } from './profile.ts'
import { BalanceService, formatBalance, readDeepSeekApiKey, type FetchLike } from './balance.ts'
import {
  activeKernelBin,
  createKernelLaunchGuard,
  fetchLatestKernelVersion,
  installKernel,
  KERNEL_HEALTH_TIMEOUT_MS,
  kernelState,
  kernelsDir,
  markKernelFailed,
  type KernelLaunchGuard,
  writeActiveOverlay,
} from './kernel-manager.ts'
import { ensureInstallShims, prependPath, proxyEnvFromResolveProxy } from './install-env.ts'
import { installAppMenu, showAboutDialog, type AboutMaintenanceActions } from './menu.ts'
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
import { statusLabelWithMode } from './tray-status.ts'
import { checkForUpdatesInteractively, checkMacUpdate, configureAutoUpdates } from './update-prompt.ts'
import { armSmokeTimeout, quitGracefully, SMOKE_TEST, SMOKE_UI_TEST, smokeUiRender, smokeVerify, verifySmokeFailureRecovery } from './smoke.ts'
import { DEV_WEB_URL_ENV, SMOKE_EXIT_FAIL, TEST_FAIL_HARNESS_ENV, TEST_RETRY_FAIL_ENV } from './smoke-protocol.ts'
import { exportDiagnosticReport, redactDiagnosticsLog } from './diagnostics.ts'
import { collectPluginFailures, writeSafeModeOverlay, WEB_PROFILE, type ComposedRow } from './safe-mode.ts'
import { buildPresetPackage, importPresetPackage, listUserPresets, parsePresetPackage } from './presets.ts'
import { ShellLocaleController, shellText, type ShellLocale } from './locale.ts'
import type { LanMenuActions, LanMenuState, MenuActions } from './menu-template.ts'
import { DEEPSEEK_PLATFORM_RECHARGE_URL } from './links.ts'
import { markCloseToTrayExplained, shouldExplainCloseToTray } from './shell-preferences.ts'
import { LanService, qrSvgFromText } from './lan.ts'
import { closeLanPairingWindow, isLanPairingWindow, showLanPairingWindow } from './lan-window.ts'
import { isMainWindowHarnessSender, isMainWindowSender, isShellOwnedFrame, ShellApp } from './shell-app.ts'
import { DesktopPreferencesController, type DesktopPreferencesResult, type DesktopPreferencesUpdate } from './desktop-preferences.ts'
import { createShellPreferences } from './shell-preferences.ts'
import { focusWindowOnNotificationClick, normalizePublicStatusSnapshot, notificationsForPublicStatus, type PublicStatusSnapshot } from './desktop-notifications.ts'

const DEV_WEB_URL = process.env[DEV_WEB_URL_ENV]
const MAC_UPDATE_CHECK_DELAY_MS = 15_000

let currentLocale: ShellLocale = 'en'
let localeController: ShellLocaleController | undefined
let closeNoticeClaimed = false
let desktopPreferencesController: DesktopPreferencesController | undefined
let lastPublicStatus: PublicStatusSnapshot | undefined
let lastHarnessPhase: HarnessState['phase'] | undefined
/** Decision 0026: one healthy boot is guaranteed for the overlay selected at
 *  launch; its failure rolls the shell back to the bundled kernel. */
let kernelLaunchGuard: KernelLaunchGuard | undefined
/** Suspected failing plugins extracted from the last crash; shown on the recovery pages. */
let lastPluginFailures: ComposedRow[] = []

const lanService = new LanService({
  mobileShellRoot,
  nodeExecutable: () => nodeBin(),
  getTargetUrl: () => shellApp.state?.phase === 'ready' ? shellApp.state.url : undefined,
  onLog: line => console.log(`dsh-desktop: ${line}`),
  onStateChanged: () => {
    // A dead proxy or an expired pairing leaves the QR window pointing at a
    // dead port — close it instead of letting a stale code linger.
    if (lanService.currentPairing === undefined) closeLanPairingWindow()
    refreshNativeSurfaces()
  },
})

const windowContext: WindowContext = {
  quitInProgress: false,
  hideOnClose: false,
  getLocale: () => currentLocale,
  onVisibilityChanged: refreshTray,
  onCloseToTray: () => { void explainCloseToTray() },
  onShowAbout: () => { void showAboutDialog(currentLocale, aboutMaintenance()) },
  lan: {
    getState: (): LanMenuState => ({ lanRunning: lanService.isRunning, lanBusy: lanService.isBusy }),
    actions: {
      startLanLink: () => { void startLanLink() },
      showLanQr: () => { void showLanQr() },
      stopLanLink,
    },
  },
  safeMode: {
    isActive: () => safeModeActive(),
    toggle: toggleSafeMode,
  },
  harness: {
    restartEnabled: () => shellApp.restartEnabled(),
    restart: () => { void shellApp.requestRestart() },
  },
}

/** Whether the profile should boot with the Safe Mode plugin quarantine. */
function safeModeActive(): boolean {
  return desktopPreferencesController?.snapshot.safeMode === true
}

/** Enter or exit Safe Mode: persist the flag, then restart the harness. */
async function applySafeMode(enabled: boolean): Promise<boolean> {
  if (SMOKE_TEST || desktopPreferencesController === undefined) return false
  const result = desktopPreferencesController.update({ safeMode: enabled })
  if (!result.ok) return false
  refreshNativeSurfaces()
  return shellApp.runHarnessRestart()
}

const DSHMARKET_PACKAGE = 'dshmarket'
const DSHMARKET_INSTALL_TIMEOUT_MS = 300_000

/** Cached tray text for the DeepSeek balance; refreshed opportunistically. */
let lastBalanceText: string | undefined
let latestKernelVersion: string | undefined
// Chromium's fetch follows the system proxy; Node's does not. Every
// main-process network call goes through it so real machines behind a
// system-level proxy keep working (GUI launches carry no proxy env vars).
const mainFetch = net.fetch.bind(net) as unknown as typeof fetch
const balanceService = new BalanceService(async () => readDeepSeekApiKey(resolveDshHome(process.env, homedir())), mainFetch as unknown as FetchLike)

function kernelDir(): string {
  return kernelsDir(app.getPath('userData'))
}

function pnpmBinPath(): string {
  return join(harnessRoot(), 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
}

/** Re-read the balance; the tray line updates on the next menu build. */
async function refreshBalance(): Promise<void> {
  try {
    const balance = await balanceService.current()
    const text = balance === undefined ? undefined : formatBalance(balance)
    if (text !== lastBalanceText) {
      lastBalanceText = text
      refreshTray()
    }
  } catch {
    // Balance is best-effort; surfaces just stay hidden.
  }
}

/** Wait for the harness to reach (or fail) readiness after a kernel switch. */
async function waitForHarnessReady(timeoutMs = KERNEL_HEALTH_TIMEOUT_MS): Promise<boolean> {
  // The supervisor first tears the old child down; the phase can still read
  // 'ready' from the previous boot during that window.
  await new Promise(resolve => setTimeout(resolve, 3_000))
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const phase = shellApp.state?.phase
    if (phase === 'ready') return true
    if (phase === 'crashed') return false
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  return false
}

function rollbackKernel(version: string): void {
  console.warn(`dsh-desktop: kernel ${version} failed its health boot; rolling back to the bundled kernel`)
  markKernelFailed(kernelDir(), version)
  writeActiveOverlay(kernelDir(), undefined)
  void shellApp.runHarnessRestart()
}

/** Switch to an installed overlay kernel and health-check the boot; any
 *  failure rolls back to the bundled kernel and marks the overlay bad. */
async function switchKernel(version: string): Promise<boolean> {
  writeActiveOverlay(kernelDir(), version)
  const restarted = await shellApp.runHarnessRestart()
  if (!restarted) {
    rollbackKernel(version)
    return false
  }
  const ready = await waitForHarnessReady()
  if (!ready) {
    rollbackKernel(version)
    return false
  }
  return true
}

/**
 * Environment for install children (market bundle, kernel overlay): the
 * bundled pnpm/node launchers go to the front of PATH — the dsh CLI forwards
 * `plugin add` to a bare `pnpm`, which a GUI-launched packaged app cannot
 * find — and the system proxy is translated into the env vars pnpm reads.
 *
 * The same env is also the harness supervisor's spawn env: the market plugin
 * installs through the running kernel's CLI, so its pnpm must be the same
 * one that created the profile's store — a user's corepack pnpm of a
 * different major rejects the node_modules with ERR_PNPM_UNEXPECTED_STORE.
 */
let harnessChildEnv: NodeJS.ProcessEnv = { ...process.env }
async function installChildEnv(): Promise<NodeJS.ProcessEnv> {
  let env: NodeJS.ProcessEnv = { ...process.env, DSH_HOME: desktopDshHome() }
  try {
    env = prependPath(env, ensureInstallShims(app.getPath('userData'), { nodeBin: nodeBin(), pnpmBin: pnpmBinPath() }))
  } catch (error) {
    console.warn(`dsh-desktop: install shims unavailable: ${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    const resolveProxy = await session.defaultSession.resolveProxy('https://registry.npmjs.org')
    env = { ...env, ...proxyEnvFromResolveProxy(resolveProxy, process.env) }
  } catch {
    // Proxy resolution is best-effort; direct connectivity still works.
  }
  harnessChildEnv = env
  return env
}

/**
 * Install the community plugin market (dsh-market) into the user's profile
 * with the bundled dsh CLI — the same `dsh plugin add` a CLI user would run,
 * pointed at the desktop DSH_HOME. Network is required; a restart picks the
 * new bundle up. The package stays user-owned: visible in 设置 → 插件,
 * updatable/uninstallable by the market itself, quarantined by Safe Mode.
 */
interface MarketInstallResult {
  status: 'installed' | 'download-failed' | 'install-failed' | 'restart-failed' | 'unavailable'
  installed: boolean
  detail?: string
}

let marketInstallTask: Promise<MarketInstallResult> | undefined

async function installDshMarket(): Promise<MarketInstallResult> {
  if (SMOKE_TEST) return { status: 'unavailable', installed: false }
  if (marketInstallTask !== undefined) return marketInstallTask
  marketInstallTask = installDshMarketInternal()
  try {
    return await marketInstallTask
  } finally {
    marketInstallTask = undefined
  }
}

async function installDshMarketInternal(): Promise<MarketInstallResult> {
  const root = harnessRoot()
  let child
  try {
    child = spawn(
      nodeBin(root),
      [dshBin(root), 'plugin', '--profile', WEB_PROFILE, 'add', DSHMARKET_PACKAGE],
      { env: await installChildEnv(), stdio: ['ignore', 'ignore', 'pipe'] },
    )
  } catch (error) {
    return { status: 'download-failed', installed: false, detail: error instanceof Error ? error.message : String(error) }
  }
  // Keep the CLI's stderr tail: its failures are environment problems
  // (missing pnpm, registry refused) that the UI can only hint at.
  let stderrTail = ''
  child.stderr?.on('data', (chunk: Buffer) => { stderrTail = `${stderrTail}${chunk.toString()}`.slice(-2_000) })
  let timedOut = false
  let spawnFailed = false
  const code = await new Promise<number>((resolve) => {
    const timer = setTimeout(() => { timedOut = true; child.kill(); resolve(1) }, DSHMARKET_INSTALL_TIMEOUT_MS)
    timer.unref()
    child.on('close', (value) => { clearTimeout(timer); resolve(value ?? 1) })
    child.on('error', () => { spawnFailed = true; clearTimeout(timer); resolve(1) })
  })
  if (code !== 0) {
    const detail = redactDiagnosticsLog(stderrTail).trim().slice(-2_000)
    const status = timedOut || spawnFailed ? 'download-failed' : 'install-failed'
    console.warn(`dsh-desktop: dshmarket ${status} (exit ${code})${detail === '' ? '' : `: ${detail}`}`)
    return { status, installed: false, ...(detail === '' ? {} : { detail }) }
  }
  const profile = await readProfileStatus(desktopDshHome())
  if (profile.dshMarket.state !== 'installed') {
    return { status: 'install-failed', installed: false, detail: 'market package did not appear in the user profile' }
  }
  refreshNativeSurfaces()
  // The install landed even if the restart fails (crash page offers retry);
  // reporting it as a failed install would send users hunting for a network
  // problem they do not have.
  const restarted = await shellApp.runHarnessRestart()
  if (!restarted) {
    console.warn('dsh-desktop: dshmarket installed; the restart failed — it loads on the next boot')
    return { status: 'restart-failed', installed: true }
  }
  return { status: 'installed', installed: true }
}

/** Rebuild the Safe Mode overlay from the live profile and return its path. */
async function safeModeOverlayPath(): Promise<string | undefined> {
  const dshHome = resolveDshHome(process.env, homedir())
  return writeSafeModeOverlay(dshHome, app.getPath('userData'))
}

/** The shell state machine, wired to the Electron surfaces it drives. */
const shellApp = new ShellApp({
  createSupervisor: onState => new HarnessSupervisor(
    { onState },
    {
      safeMode: { enabled: safeModeActive, overlayFactory: safeModeOverlayPath },
      env: {
        ...harnessChildEnv,
        DSH_HOME: resolveDshHome(process.env, homedir()),
        // Screen capture model tool (decision 0027): opt-in; re-evaluated per
        // supervisor creation, i.e. per restart.
        DSH_DESKTOP_SCREEN_CAPTURE: desktopPreferencesController?.snapshot.screenCapture === true ? '1' : '0',
      },
      // Kernel overlay (decision 0026): re-read per spawn so a switch or
      // rollback lands on the next restart.
      dshBinOverride: () => {
        try {
          return activeKernelBin(harnessRoot(), kernelsDir(app.getPath('userData')))
        } catch {
          return undefined
        }
      },
    },
  ),
  onStateApplied: (state) => {
    if (windowContext.quitInProgress) return
    // Decision 0026: an overlay selected at launch that crashes before its
    // first boot reaches readiness is rolled back to the bundled kernel.
    const rollbackVersion = kernelLaunchGuard?.observe(state.phase)
    if (rollbackVersion !== undefined) rollbackKernel(rollbackVersion)
    notifyHarnessState(state)
    if (state.phase !== 'ready') lastPublicStatus = undefined
    if (state.phase === 'ready') {
      void loadHarnessUrl(windowContext, state.url)
    } else if (state.phase === 'crashed') {
      lastPluginFailures = collectPluginFailures(state.logTail)
      void loadErrorPage(windowContext, state.attempts, state.logTail, safeModeActive(), lastPluginFailures)
    } else {
      void loadLoadingPage(windowContext)
    }
    installAppMenu(currentLocale, menuActions, shellApp.restartEnabled(), safeModeActive(), lanService.isRunning, lanService.isBusy, desktopPreferencesController?.snapshot.shortcut)
    refreshTray()
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
  installAppMenu(currentLocale, menuActions, shellApp.restartEnabled(), safeModeActive(), lanService.isRunning, lanService.isBusy, desktopPreferencesController?.snapshot.shortcut)
  refreshTray()
  void refreshBalance()
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
    const notification = new Notification({ title, body })
    focusWindowOnNotificationClick(notification, showMainWindow)
    notification.show()
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

/** Log/diagnostic entries surfaced inside the About dialog. */
function aboutMaintenance(): AboutMaintenanceActions {
  return {
    openLogs: () => { void openLogsFolder() },
    exportDiagnostics: () => { void exportDiagnosticReport(shellApp.state, currentLocale, safeModeActive()) },
  }
}

function toggleSafeMode(): void {
  void applySafeMode(!safeModeActive())
}

const menuActions: MenuActions = {
  showWindow: showMainWindow,
  closeWindow: () => windowContext.mainWindow?.close(),
  quit: () => app.quit(),
  toggleMaximize,
  restartHarness: () => { void shellApp.requestRestart() },
  toggleSafeMode,
  checkForUpdates: () => { void checkForUpdatesInteractively(currentLocale) },
  showAbout: () => { void showAboutDialog(currentLocale, aboutMaintenance()) },
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
  isSafeMode: (): boolean => safeModeActive(),
  toggleSafeMode: (): void => { toggleSafeMode() },
  getBalance: (): string | undefined => lastBalanceText,
  checkForUpdates: (): void => { void checkForUpdatesInteractively(currentLocale) },
  quit: (): void => app.quit(),
  showAbout: (): void => { void showAboutDialog(currentLocale, aboutMaintenance()) },
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

ipcMain.handle('harness:safe-mode', (event, enabled: unknown) => {
  if (!isMainWindowSender(windowContext.mainWindow, event.sender, event.senderFrame?.url)) return false
  if (typeof enabled !== 'boolean') return false
  return applySafeMode(enabled)
})

ipcMain.handle('shell:open-logs', (event) => {
  if (!isMainWindowSender(windowContext.mainWindow, event.sender, event.senderFrame?.url)) return false
  void openLogsFolder()
  return true
})

ipcMain.handle('shell:export-diagnostics', async (event) => {
  if (!isMainWindowSender(windowContext.mainWindow, event.sender, event.senderFrame?.url)) return false
  return exportDiagnosticReport(shellApp.state, currentLocale, safeModeActive())
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
  if (action === 'showLanPairing') return showLanQr()
  if (action === 'stopLanPairing') {
    closeLanPairingWindow()
    await lanService.stop()
    refreshNativeSurfaces()
    return true
  }
  if (action === 'showAbout') {
    await showAboutDialog(currentLocale, aboutMaintenance())
    return true
  }
  if (action === 'installDshMarket') return installDshMarket()
  if (action === 'openRecharge') {
    void shell.openExternal(DEEPSEEK_PLATFORM_RECHARGE_URL)
    return true
  }
  if (action === 'kernelCheckUpdates') {
    latestKernelVersion = await fetchLatestKernelVersion(mainFetch)
    return latestKernelVersion !== undefined
  }
  if (action === 'kernelInstall') {
    if (SMOKE_TEST || latestKernelVersion === undefined) return false
    const installed = await installKernel({ dir: kernelDir(), version: latestKernelVersion, nodeBin: nodeBin(), pnpmBin: pnpmBinPath(), env: await installChildEnv() })
    if (!installed.ok) return false
    return switchKernel(latestKernelVersion)
  }
  if (action === 'kernelRestore') {
    writeActiveOverlay(kernelDir(), undefined)
    return shellApp.runHarnessRestart()
  }
  if (action === 'restartHarness') {
    return shellApp.requestRestart()
  }
  if (action === 'enterSafeMode') return applySafeMode(true)
  if (action === 'exitSafeMode') return applySafeMode(false)
  return false
})

ipcMain.handle('desktop:bundled-plugins', async (event) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  const profile = await readProfileStatus(desktopDshHome())
  return { dshMarket: profile.dshMarket }
})

ipcMain.handle('desktop:startup-status', async (event) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  const profile = await readProfileStatus(desktopDshHome())
  return {
    appVersion: app.getVersion(),
    dshHome: desktopDshHome(),
    userData: app.getPath('userData'),
    harnessPhase: shellApp.state?.phase ?? 'starting',
    statusLabel: statusLabelWithMode(currentLocale, shellApp.state, shellApp.restartInFlight, safeModeActive()),
    safeMode: safeModeActive(),
    market: profile.dshMarket,
  }
})

ipcMain.handle('desktop:balance', async (event) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  const balance = await balanceService.current()
  return balance === undefined ? null : { balance: formatBalance(balance) }
})

ipcMain.handle('desktop:kernel:state', (event) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  return { ...kernelState(harnessRoot(), kernelDir()), latestVersion: latestKernelVersion }
})

ipcMain.handle('desktop:lan:state', (event) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  return { running: lanService.isRunning, busy: lanService.isBusy }
})

ipcMain.handle('desktop:preferences:get', (event) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  return desktopPreferencesController?.snapshot ?? null
})

ipcMain.handle('desktop:preferences:update', (event, patch: unknown) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return null
  const candidate = patch as Record<string, unknown>
  // macOS TCC gate (decision 0027): screencapture without the Screen
  // Recording permission exits 0 but captures only the wallpaper — refuse
  // the toggle instead of letting the tool attach useless images.
  if (candidate.screenCapture === true && process.platform === 'darwin'
    && systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
    const snapshot = desktopPreferencesController?.snapshot
    if (snapshot !== undefined) return { ok: false, reason: 'screen-permission', preferences: snapshot } satisfies DesktopPreferencesResult
  }
  const update: DesktopPreferencesUpdate = {}
  if (typeof candidate.shortcut === 'string') update.shortcut = candidate.shortcut
  if (typeof candidate.launchAtLogin === 'boolean') update.launchAtLogin = candidate.launchAtLogin
  if (typeof candidate.launchHidden === 'boolean') update.launchHidden = candidate.launchHidden
  if (typeof candidate.notificationsEnabled === 'boolean') update.notificationsEnabled = candidate.notificationsEnabled
  if (typeof candidate.screenCapture === 'boolean') update.screenCapture = candidate.screenCapture
  const result = desktopPreferencesController?.update(update) ?? null
  // The screen capture flag reaches the harness through its spawn env; a
  // change lands on the next kernel boot (same restart semantics as Safe Mode).
  if (update.screenCapture !== undefined) void shellApp.runHarnessRestart()
  return result
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

function desktopDshHome(): string {
  return resolveDshHome(process.env, homedir())
}

async function exportPresetFlow(id: string): Promise<{ saved: boolean; canceled?: boolean; name?: string }> {
  let pkg
  try {
    pkg = await buildPresetPackage(desktopDshHome(), id)
  } catch (error) {
    console.warn(`dsh-desktop: preset export failed: ${error instanceof Error ? error.message : String(error)}`)
    await dialog.showMessageBox({ type: 'error', message: shellText(currentLocale, 'presets.invalid'), buttons: [shellText(currentLocale, 'common.ok')] })
    return { saved: false }
  }
  const result = await dialog.showSaveDialog({
    title: shellText(currentLocale, 'presets.exportTitle'),
    defaultPath: join(app.getPath('downloads'), `${pkg.id}.dshpreset`),
    filters: [{ name: 'dsh preset', extensions: ['dshpreset'] }],
  })
  if (result.canceled || result.filePath === undefined) return { saved: false, canceled: true }
  try {
    await writeFile(result.filePath, JSON.stringify(pkg, null, 2), { mode: 0o600 })
  } catch (error) {
    console.warn(`dsh-desktop: preset export failed: ${error instanceof Error ? error.message : String(error)}`)
    await dialog.showMessageBox({ type: 'error', message: shellText(currentLocale, 'presets.invalid'), buttons: [shellText(currentLocale, 'common.ok')] })
    return { saved: false }
  }
  return { saved: true, name: pkg.id }
}

async function importPresetFlow(): Promise<{ imported: boolean; canceled?: boolean; skipped?: boolean; invalid?: boolean; name?: string }> {
  const open = await dialog.showOpenDialog({
    title: shellText(currentLocale, 'presets.importTitle'),
    properties: ['openFile'],
    filters: [{ name: 'dsh preset', extensions: ['dshpreset'] }],
  })
  const filePath = open.filePaths[0]
  if (open.canceled || filePath === undefined) return { imported: false, canceled: true }
  let raw: string | undefined
  try {
    raw = await readFile(filePath, 'utf8')
  } catch {
    raw = undefined
  }
  const pkg = raw === undefined ? undefined : parsePresetPackage(raw)
  if (pkg === undefined) {
    await dialog.showMessageBox({ type: 'error', message: shellText(currentLocale, 'presets.invalid'), buttons: [shellText(currentLocale, 'common.ok')] })
    return { imported: false, invalid: true }
  }
  const trust = await dialog.showMessageBox({
    type: 'info',
    title: shellText(currentLocale, 'presets.importTrustTitle'),
    message: pkg.id,
    detail: shellText(currentLocale, 'presets.importTrustBody'),
    buttons: [shellText(currentLocale, 'common.continue'), shellText(currentLocale, 'common.cancel')],
    defaultId: 1,
    cancelId: 1,
  })
  if (trust.response !== 0) return { imported: false, canceled: true }
  const existing = await listUserPresets(desktopDshHome()).then(list => list.some(preset => preset.id === pkg.id))
  let mode: 'skip' | 'overwrite' | 'clone' = 'overwrite'
  if (existing) {
    const choices = await dialog.showMessageBox({
      type: 'warning',
      title: shellText(currentLocale, 'presets.conflictTitle'),
      message: shellText(currentLocale, 'presets.conflictBody', { name: pkg.id }),
      buttons: [
        shellText(currentLocale, 'presets.conflictSkip'),
        shellText(currentLocale, 'presets.conflictReplace'),
        shellText(currentLocale, 'presets.conflictClone'),
      ],
      defaultId: 1,
      cancelId: 0,
    })
    mode = (['skip', 'overwrite', 'clone'] as const)[choices.response] ?? 'skip'
  }
  const result = await importPresetPackage(desktopDshHome(), pkg, mode)
  if (!result.ok) {
    await dialog.showMessageBox({ type: 'error', message: shellText(currentLocale, 'presets.invalid'), buttons: [shellText(currentLocale, 'common.ok')] })
    return { imported: false, invalid: true }
  }
  if (result.skipped === true) return { imported: false, skipped: true, name: pkg.id }
  return { imported: true, name: result.renamedTo ?? result.id }
}

ipcMain.handle('desktop:presets:list', (event) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  return listUserPresets(desktopDshHome())
})

ipcMain.handle('desktop:suspects:get', (event) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  return lastPluginFailures
})

ipcMain.handle('desktop:presets:export', (event, id: unknown) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  if (typeof id !== 'string') return null
  return exportPresetFlow(id)
})

ipcMain.handle('desktop:presets:import', (event) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  return importPresetFlow()
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
  if (!SMOKE_TEST) kernelLaunchGuard = createKernelLaunchGuard(kernelDir())
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
    // Windows toasts only display when the AUMID matches the Start Menu
    // shortcut (electron-builder uses the appId); without it desktop
    // notifications silently never show.
    if (process.platform === 'win32') app.setAppUserModelId('io.github.citrusli2026.dsh-electron-shell')
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

    // The controller also exists in smoke mode (read-only snapshot for the
    // Safe Mode banner assertion); native side effects stay gated below.
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
    if (!SMOKE_TEST) {
      desktopPreferencesController.initialize()
      windowContext.startHidden = desktopPreferencesController.shouldStartHidden()
    }

    // The harness (and the market installs it spawns) needs the bundled-pnpm
    // PATH and the translated system proxy before its first boot.
    harnessChildEnv = await installChildEnv()

    createMainWindow(windowContext)
    installAppMenu(currentLocale, menuActions, false, false, false, false, desktopPreferencesController?.snapshot.shortcut)
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
