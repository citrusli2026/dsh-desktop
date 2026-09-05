/** Electron lifecycle assembly for the bundled DeepSeek Harness runtime. */
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, nativeTheme, net, Notification, session, shell, systemPreferences, type MessageBoxOptions } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { HarnessSupervisor, type HarnessState } from './supervisor.ts'
import { resolveDshHome } from './dsh-home.ts'
import { dshBin, harnessRoot, mobileShellRoot, nodeBin } from './paths.ts'
import { readProfileStatus } from './profile.ts'
import { readProfileManifest, writeProfileManifest, withoutBundle, withoutBundles, pickQuarantinable } from './plugin-recovery.ts'
import { supportIssueUrl, type SupportContext } from './support.ts'
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
  readActiveOverlay,
  type KernelOperationResult,
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
import { updatePluginFailureMemory, writeSafeModeOverlay, WEB_PROFILE, OFFICIAL_BUNDLES, classifyPluginFailureCause, type ComposedRow } from './safe-mode.ts'
import { listTrash, moveToTrash, purgeExpiredTrash, purgeFromTrash, restoreFromTrash } from './trash.ts'
import { writeTrashHookFiles } from './trash-hook.ts'
import { deleteSessionToTrash, listSessions, restoreSessionFromTrash, unarchiveSession, ActiveSessionError } from './trash-sessions.ts'
import { buildPresetPackage, importPresetPackage, listUserPresets, parsePresetPackage, removeUserPreset } from './presets.ts'
import { ShellLocaleController, shellText, type ShellLocale } from './locale.ts'
import type { LanMenuActions, LanMenuState, MenuActions } from './menu-template.ts'
import { DEEPSEEK_PLATFORM_RECHARGE_URL } from './links.ts'
import { markCloseToTrayExplained, shouldExplainCloseToTray } from './shell-preferences.ts'
import { LanService, qrSvgFromText } from './lan.ts'
import { closeLanPairingWindow, isLanPairingWindow, showLanPairingWindow } from './lan-window.ts'
import { isMainWindowHarnessSender, isMainWindowSender, isShellOwnedFrame, ShellApp } from './shell-app.ts'
import { DesktopPreferencesController, type DesktopPreferencesResult, type DesktopPreferencesUpdate } from './desktop-preferences.ts'
import { createShellPreferences } from './shell-preferences.ts'
import { conversationSucceeded, focusWindowOnNotificationClick, normalizePublicStatusSnapshot, notificationsForPublicStatus, type PublicStatusSnapshot } from './desktop-notifications.ts'
import { completeMarketInstall, type MarketInstallCommandResult, type MarketInstallProgress, type MarketInstallResult } from './market-install.ts'
import { runDesktopHealthCheck } from './health-check.ts'

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
  if (!enabled) lastPluginFailures = []
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
let lastKernelOperation: KernelOperationResult | undefined
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
async function switchKernel(version: string): Promise<KernelOperationResult> {
  writeActiveOverlay(kernelDir(), version)
  const restarted = await shellApp.runHarnessRestart()
  if (!restarted) {
    rollbackKernel(version)
    return { status: 'switch-failed', version, reason: 'restart-failed' }
  }
  const ready = await waitForHarnessReady()
  if (!ready) {
    rollbackKernel(version)
    return { status: 'rolled-back', version, reason: 'health-check-failed' }
  }
  return { status: 'ready', version }
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
let marketInstallTask: Promise<MarketInstallResult> | undefined
let lastMarketInstallResult: MarketInstallResult | undefined

function reportMarketInstallProgress(progress: MarketInstallProgress): void {
  const window = windowContext.mainWindow
  if (window === undefined || window.isDestroyed()) return
  window.webContents.send('desktop:market-install-progress', progress)
}

async function installDshMarket(): Promise<MarketInstallResult> {
  if (SMOKE_TEST) return { status: 'unavailable', installed: false, stage: 'prepare', reason: 'spawn' }
  if (marketInstallTask !== undefined) return marketInstallTask
  marketInstallTask = installDshMarketInternal()
  try {
    const result = await marketInstallTask
    lastMarketInstallResult = result
    return result
  } finally {
    marketInstallTask = undefined
  }
}

/** Spawn `dsh plugin --profile web add <spec>` and reduce its output into a
 *  classified command result shared by the market install and the error-page
 *  plugin recovery actions. */
async function runProfilePluginAdd(spec: string, timeoutMs: number): Promise<MarketInstallCommandResult> {
  const root = harnessRoot()
  let child
  try {
    child = spawn(
      nodeBin(root),
      [dshBin(root), 'plugin', '--profile', WEB_PROFILE, 'add', spec],
      { env: await installChildEnv(), stdio: ['ignore', 'pipe', 'pipe'] },
    )
  } catch (error) {
    return { code: 1, stderr: error instanceof Error ? error.message : String(error), spawnFailed: true }
  }
  // Keep the CLI's output tail: dsh/pnpm can report failures on either stream.
  // These are environment problems
  // (missing pnpm, registry refused) that the UI can only hint at.
  let outputTail = ''
  const appendOutput = (chunk: Buffer): void => { outputTail = `${outputTail}${chunk.toString()}`.slice(-2_000) }
  child.stdout?.on('data', appendOutput)
  child.stderr?.on('data', appendOutput)
  let timedOut = false
  let spawnFailed = false
  const code = await new Promise<number>((resolve) => {
    let settled = false
    const finish = (value: number): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
      finish(1)
    }, timeoutMs)
    timer.unref()
    child.on('close', value => finish(value ?? 1))
    child.on('error', () => { spawnFailed = true; finish(1) })
  })
  const detail = redactDiagnosticsLog(redactDiagnosticsLog(outputTail), desktopDshHome()).trim().slice(-2_000)
  return { code, stderr: detail, ...(timedOut ? { timedOut: true } : {}), ...(spawnFailed ? { spawnFailed: true } : {}) }
}

async function runDshMarketInstallCommand(): Promise<MarketInstallCommandResult> {
  // A unique package name keeps the packaged offline E2E on the real dsh/pnpm
  // path without allowing a developer's global metadata cache to satisfy it.
  const packageSpec = process.env.DSH_E2E_MARKET_MODE === 'offline'
    ? `dshmarket-dsh-desktop-offline-e2e-${process.pid}`
    : DSHMARKET_PACKAGE
  return runProfilePluginAdd(packageSpec, DSHMARKET_INSTALL_TIMEOUT_MS)
}

async function installDshMarketInternal(): Promise<MarketInstallResult> {
  const result = await completeMarketInstall({
    install: runDshMarketInstallCommand,
    readStatus: async () => (await readProfileStatus(desktopDshHome())).dshMarket,
    restart: () => shellApp.runHarnessRestart(),
    onProgress: reportMarketInstallProgress,
  })
  refreshNativeSurfaces()
  if (result.status === 'restart-failed') {
    console.warn('dsh-desktop: dshmarket installed; the restart failed — it loads on the next boot')
  } else if (!result.installed) {
    console.warn(`dsh-desktop: dshmarket ${result.status} (${result.reason ?? 'unknown'})${result.detail === undefined ? '' : `: ${result.detail}`}`)
  }
  return result
}

/** The trash hook entry script ships beside the harness under resources/. */
function agentTrashHookScriptPath(): string {
  return join(dirname(harnessRoot()), 'agent-trash-hook', 'agent-trash-hook.mjs')
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
      trashHook: {
        enabled: () => desktopPreferencesController?.snapshot.agentDeletionInterception === true,
        patchFactory: async () => writeTrashHookFiles({
          hookScriptPath: agentTrashHookScriptPath(),
          nodePath: nodeBin(),
          userData: app.getPath('userData'),
        }),
      },
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
    lastPluginFailures = updatePluginFailureMemory(lastPluginFailures, state.phase, state.phase === 'crashed' ? state.logTail : '', safeModeActive())
    if (state.phase === 'ready') {
      void loadHarnessUrl(windowContext, state.url)
    } else if (state.phase === 'crashed') {
      void loadErrorPage(windowContext, state.attempts, state.logTail, safeModeActive(), lastPluginFailures, classifyPluginFailureCause(state.logTail))
      void autoQuarantineSuspects(lastPluginFailures)
    } else {
      void loadLoadingPage(windowContext, state.stage ?? 'launching', state.retryDelayMs ?? 0)
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
    exportDiagnostics: () => { void exportDiagnosticReport(shellApp.state, currentLocale, safeModeActive(), lastMarketInstallResult) },
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
  return restartForPluginRecovery()
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
  return exportDiagnosticReport(shellApp.state, currentLocale, safeModeActive(), lastMarketInstallResult)
})

ipcMain.handle('shell:close-lan-pairing', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!isLanPairingWindow(window)) return false
  if (!isShellOwnedFrame(event.senderFrame?.url)) return false
  window.close()
  return true
})

ipcMain.handle('shell:open-support-issue', (event) => {
  if (!isMainWindowSender(windowContext.mainWindow, event.sender, event.senderFrame?.url)) return false
  const state = shellApp.state
  const kernel = kernelState(harnessRoot(), kernelDir())
  const context: SupportContext = {
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    kernelVersion: kernel.overlayVersion ?? kernel.bundledVersion ?? 'unknown',
    safeMode: safeModeActive(),
    suspects: [...new Set(visibleSuspects().map(row => row.name).filter((name): name is string => typeof name === 'string' && name !== ''))],
    cause: classifyPluginFailureCause(state?.phase === 'crashed' ? state.logTail : ''),
  }
  void shell.openExternal(supportIssueUrl(context))
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
    lastKernelOperation = latestKernelVersion === undefined
      ? { status: 'check-failed', reason: 'registry-unavailable' }
      : { status: 'checked', latestVersion: latestKernelVersion }
    return lastKernelOperation
  }
  if (action === 'kernelInstall') {
    if (SMOKE_TEST || latestKernelVersion === undefined) {
      lastKernelOperation = { status: 'unavailable', reason: 'check-required' }
      return lastKernelOperation
    }
    const installed = await installKernel({ dir: kernelDir(), version: latestKernelVersion, nodeBin: nodeBin(), pnpmBin: pnpmBinPath(), env: await installChildEnv() })
    if (!installed.ok) {
      lastKernelOperation = { status: 'install-failed', version: latestKernelVersion, reason: installed.reason }
      return lastKernelOperation
    }
    lastKernelOperation = await switchKernel(latestKernelVersion)
    return lastKernelOperation
  }
  if (action === 'kernelRestore') {
    const previous = readActiveOverlay(kernelDir())?.version
    writeActiveOverlay(kernelDir(), undefined)
    const restarted = await shellApp.runHarnessRestart()
    lastKernelOperation = restarted
      ? { status: 'restored', ...(previous === undefined ? {} : { version: previous }) }
      : { status: 'restore-failed', ...(previous === undefined ? {} : { version: previous }), reason: 'restart-failed' }
    return lastKernelOperation
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
  return { dshMarket: profile.dshMarket, lastInstall: lastMarketInstallResult }
})

ipcMain.handle('desktop:startup-status', async (event) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  const profile = await readProfileStatus(desktopDshHome())
  return {
    appVersion: app.getVersion(),
    dshHome: desktopDshHome(),
    userData: app.getPath('userData'),
    harnessPhase: shellApp.state?.phase ?? 'starting',
    harnessStage: shellApp.state?.phase === 'starting' ? shellApp.state.stage : undefined,
    retryInSeconds: shellApp.state?.phase === 'starting' && shellApp.state.stage === 'retrying'
      ? Math.ceil((shellApp.state.retryDelayMs ?? 0) / 1000)
      : undefined,
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
  return { ...kernelState(harnessRoot(), kernelDir()), latestVersion: latestKernelVersion, lastOperation: lastKernelOperation }
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
  if (typeof candidate.firstRunGuideDismissed === 'boolean') update.firstRunGuideDismissed = candidate.firstRunGuideDismissed
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
  if (desktopPreferencesController?.snapshot.firstTaskCompleted !== true && conversationSucceeded(lastPublicStatus, next)) {
    desktopPreferencesController?.update({ firstTaskCompleted: true })
  }
  for (const notification of notificationsForPublicStatus(lastPublicStatus, next, currentLocale)) {
    showDesktopNotification(notification.title, notification.body)
  }
  lastPublicStatus = next
  return true
})

ipcMain.handle('desktop:health-check', async (event, raw: unknown) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  const candidate = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const includeNetwork = candidate.includeNetwork === true
  const state = kernelState(harnessRoot(), kernelDir())
  return runDesktopHealthCheck({
    harnessRoot: harnessRoot(),
    mobileShellRoot: mobileShellRoot(),
    dshHome: desktopDshHome(),
    userData: app.getPath('userData'),
    harnessState: shellApp.state,
    safeMode: safeModeActive(),
    kernelVersion: state.overlayVersion ?? state.bundledVersion,
    locale: currentLocale,
    includeNetwork,
    fetch: mainFetch,
    resolveProxy: url => session.defaultSession.resolveProxy(url),
  })
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

/**
 * Auto-quarantine: a plugin-induced crash names its suspects in the log, so
 * the shell removes exactly those bundles from the boot list and restarts —
 * the app comes back up instead of looping on the error page. Quarantine is
 * the same reversible manifest edit as the error page's Disable; the names
 * stay visible in the recovery banner until the plugin is updated or
 * re-enabled. Removal is its own loop guard: a removed bundle cannot crash
 * the next boot.
 */
const autoQuarantined: ComposedRow[] = []
let autoQuarantineInFlight = false
async function autoQuarantineSuspects(suspects: readonly ComposedRow[]): Promise<void> {
  if (autoQuarantineInFlight || suspects.length === 0) return
  const dshHome = resolveDshHome(process.env, homedir())
  const manifest = await readProfileManifest(dshHome)
  const removable = pickQuarantinable(
    suspects.flatMap(row => typeof row.name === 'string' ? [row.name] : []),
    manifest.dsh?.profile?.bundles ?? [],
    OFFICIAL_BUNDLES,
  )
  if (removable.length === 0) return
  autoQuarantineInFlight = true
  try {
    await writeProfileManifest(dshHome, withoutBundles(manifest, removable))
    for (const row of suspects.filter(suspect => typeof suspect.name === 'string' && removable.includes(suspect.name))) {
      if (!autoQuarantined.some(existing => existing.id === row.id)) autoQuarantined.push(row)
    }
    console.warn(`dsh-desktop: boot failed on ${removable.join(', ')}; quarantined them from the boot list — update or re-enable in Settings → Plugins`)
    await restartForPluginRecovery()
  } catch (error) {
    console.warn(`dsh-desktop: auto-quarantine failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    autoQuarantineInFlight = false
  }
}

/** Suspects worth showing: live failures plus still-quarantined plugins. */
function visibleSuspects(): ComposedRow[] {
  return [...lastPluginFailures, ...autoQuarantined.filter(row => !lastPluginFailures.some(fail => fail.id === row.id))]
}

ipcMain.handle('desktop:suspects:get', (event) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  return visibleSuspects()
})

// Error-page plugin recovery: update the failing packages through the same
// `dsh plugin add` path as the market install, or disable one by removing it
// from the boot bundle list (files stay on disk; reversible from Settings →
// Plugins). Both restart the harness on success so the page's retry bridge
// reports a real outcome. Dev builds with a web-URL override "restart" by
// re-applying that URL — there is no supervised kernel to restart.
function restartForPluginRecovery(): Promise<boolean> {
  if (!app.isPackaged && DEV_WEB_URL !== undefined) {
    shellApp.applyState({ phase: 'ready', url: DEV_WEB_URL })
    return Promise.resolve(true)
  }
  return shellApp.runHarnessRestart()
}

async function installedPluginVersion(dshHome: string, name: string): Promise<string | undefined> {
  try {
    const packageJson = JSON.parse(await readFile(join(dshHome, 'profiles', WEB_PROFILE, 'node_modules', name, 'package.json'), 'utf8')) as { version?: unknown }
    return typeof packageJson.version === 'string' ? packageJson.version : undefined
  } catch {
    return undefined
  }
}

ipcMain.handle('desktop:plugin:update', async (event, rawName: unknown): Promise<boolean | 'current'> => {
  if (!isMainWindowSender(windowContext.mainWindow, event.sender, event.senderFrame?.url)) return false
  const dshHome = resolveDshHome(process.env, homedir())
  const { bundles } = await readProfileStatus(dshHome)
  const requested = typeof rawName === 'string' && rawName !== '' ? [rawName] : undefined
  const candidates = [...new Set(visibleSuspects().map(row => row.name).filter((name): name is string => typeof name === 'string'))]
  // A quarantined plugin is off the boot list, but updating it re-adds the
  // bundle — that is the upgrade-and-re-enable path the banner points at.
  const targets = requested ?? candidates.filter(name => bundles.includes(name) || autoQuarantined.some(row => row.name === name))
  // Official bundles are version-locked to the kernel; only community
  // packages may be updated through this recovery path.
  const requestedName = requested?.[0]
  if (requested !== undefined && (!bundles.includes(requestedName!) && !autoQuarantined.some(row => row.name === requestedName) || OFFICIAL_BUNDLES.includes(requestedName as never))) return false
  if (targets.length === 0) return false
  const before = new Map(await Promise.all(targets.map(async name => [name, await installedPluginVersion(dshHome, name)] as const)))
  for (const name of targets) {
    const result = await runProfilePluginAdd(`${name}@latest`, DSHMARKET_INSTALL_TIMEOUT_MS)
    if (result.code !== 0) {
      console.warn(`dsh-desktop: plugin recovery update failed for ${name}: ${result.stderr.slice(-500)}`)
      return false
    }
  }
  const restarted = await restartForPluginRecovery()
  if (!restarted) return false
  for (const name of targets) {
    const quarantinedIndex = autoQuarantined.findIndex(row => row.name === name)
    if (quarantinedIndex !== -1) autoQuarantined.splice(quarantinedIndex, 1)
  }
  // Registry metadata can trail a just-published dist-tag, so a no-op install
  // is not a failure: report 'current' so the error page can say so.
  const after = await Promise.all(targets.map(name => installedPluginVersion(dshHome, name)))
  const moved = targets.some((name, index) => before.get(name) !== after[index])
  return moved ? true : 'current'
})

ipcMain.handle('desktop:plugin:disable', async (event, rawName: unknown) => {
  if (!isMainWindowSender(windowContext.mainWindow, event.sender, event.senderFrame?.url)) return false
  if (typeof rawName !== 'string' || rawName === '' || OFFICIAL_BUNDLES.includes(rawName as never)) return false
  const dshHome = resolveDshHome(process.env, homedir())
  const manifest = await readProfileManifest(dshHome)
  if (!(manifest.dsh?.profile?.bundles ?? []).includes(rawName)) return false
  try {
    await writeProfileManifest(dshHome, withoutBundle(manifest, rawName))
  } catch (error) {
    console.warn(`dsh-desktop: plugin disable write failed: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
  const quarantinedIndex = autoQuarantined.findIndex(row => row.name === rawName || row.id === rawName)
  if (quarantinedIndex !== -1) autoQuarantined.splice(quarantinedIndex, 1)
  return restartForPluginRecovery()
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

// Desktop trash: list/restore/purge trashed resources. The trash page lives
// in the harness-mounted desktop-controls surface, so the harness-origin
// sender guard applies.
ipcMain.handle('desktop:trash:list', (event) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  return listTrash(desktopDshHome())
})
ipcMain.handle('desktop:trash:restore', (event, rawId: unknown) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  if (typeof rawId !== 'string' || rawId === '') return null
  return restoreFromTrash(desktopDshHome(), rawId)
})
ipcMain.handle('desktop:trash:purge', (event, rawId: unknown) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return false
  if (typeof rawId !== 'string' || rawId === '') return false
  return purgeFromTrash(desktopDshHome(), rawId)
})
ipcMain.handle('desktop:trash:purge-expired', (event) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return 0
  return purgeExpiredTrash(desktopDshHome()).then(entries => entries.length)
})
ipcMain.handle('desktop:presets:delete', (event, rawId: unknown) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return false
  if (typeof rawId !== 'string') return false
  return removeUserPreset(desktopDshHome(), rawId).then(() => true).catch(() => false)
})

// Session trash: list on-disk sessions with their archive flag, delete one
// into the trash (live sessions are refused via the WebUI-reported ids),
// restore a trashed session, and clear a phantom archive entry.
ipcMain.handle('desktop:trash:sessions', (event) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  return listSessions(desktopDshHome())
})
ipcMain.handle('desktop:trash:session-delete', (event, rawProjectKey: unknown, rawSessionId: unknown) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return false
  if (typeof rawProjectKey !== 'string' || typeof rawSessionId !== 'string' || rawSessionId === '') return false
  if (rawProjectKey.includes('..') || rawProjectKey.includes('/') || rawProjectKey.includes('\\')) return false
  const live = new Set((lastPublicStatus?.sessions ?? []).filter(session => session.running).map(session => session.id))
  return deleteSessionToTrash(desktopDshHome(), rawProjectKey, rawSessionId, [...live]).then(() => true).catch((error) => {
    if (error instanceof ActiveSessionError) return 'active'
    console.warn(`dsh-desktop: session delete failed: ${error instanceof Error ? error.message : String(error)}`)
    return false
  })
})
ipcMain.handle('desktop:trash:session-restore', (event, rawTrashId: unknown) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return null
  if (typeof rawTrashId !== 'string' || rawTrashId === '') return null
  return restoreSessionFromTrash(desktopDshHome(), rawTrashId).then(() => true).catch(() => false)
})
ipcMain.handle('desktop:trash:session-unarchive', (event, rawSessionId: unknown) => {
  if (!isMainWindowHarnessSender(windowContext.mainWindow, event.sender, event.senderFrame?.url, windowContext.allowedOrigin)) return false
  if (typeof rawSessionId !== 'string' || rawSessionId === '') return false
  return unarchiveSession(desktopDshHome(), rawSessionId)
})

function verifyHarness(root: string): void {
  const checks: ReadonlyArray<readonly [string, string]> = [['node', nodeBin(root)], ['dsh', dshBin(root)]]
  for (const [label, path] of checks) {
    if (!existsSync(path)) throw new Error(`bundled harness incomplete: ${label} missing at ${path}; run 'pnpm run bootstrap' first`)
  }
}

async function boot(): Promise<string> {
  if (!app.isPackaged && DEV_WEB_URL !== undefined) {
    // One-shot test injection: simulate a plugin-induced crash so dev E2E can
    // exercise the error page's plugin recovery rows without the real kernel.
    // The env var deletes itself so the post-recovery restart succeeds.
    if (process.env[TEST_FAIL_HARNESS_ENV] === '1') {
      delete process.env[TEST_FAIL_HARNESS_ENV]
      const logTail = `failed to apply loader entry dsh-market (dshmarket): simulated plugin boot failure (test injection)`
      shellApp.applyState({ phase: 'crashed', attempts: 6, logTail })
      throw new Error(logTail)
    }
    console.log(`dsh-desktop: dev mode, loading ${DEV_WEB_URL}`)
    shellApp.applyState({ phase: 'ready', url: DEV_WEB_URL })
    return DEV_WEB_URL
  }
  verifyHarness(harnessRoot())
  // Trash retention (desktop trash): sweep past-retention entries once per
  // boot; failures never block startup.
  void purgeExpiredTrash(desktopDshHome()).catch(() => {})
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
        if (windowContext.mainWindow === undefined || windowContext.mainWindow.isDestroyed()) createMainWindow(windowContext)
        // startHarness already applied the crashed state with the harness's
        // own output tail; re-applying here would strip the suspect evidence.
      } else if (process.env[TEST_FAIL_HARNESS_ENV] === '1' && windowContext.mainWindow !== undefined) {
        await verifySmokeFailureRecovery(windowContext.mainWindow, () => windowContext.allowedOrigin, currentLocale)
      } else {
        quitGracefully(1)
      }
    }
  })
}
