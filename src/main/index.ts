/**
 * dsh-electron-shell main process: a single-instance window hosting the bundled
 * DeepSeek Harness web runtime, following the supervision protocol described
 * in docs/decisions/0006-process-supervision-protocol.md.
 * @module main/index
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, screen, shell, Tray } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import electronUpdater from 'electron-updater'
import { HarnessSupervisor, type HarnessState } from './supervisor.ts'
import { errorPageHtml, loadingPageHtml } from './pages.ts'
import { dshBin, harnessRoot, nodeBin } from './paths.ts'
import { fitWindowState, MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, type WindowState } from './window-state.ts'
import { isNewerVersion } from './update-check.ts'

const { autoUpdater } = electronUpdater

/** Load an external `dsh web` instance instead of supervising one (dev only). */
const DEV_WEB_URL = process.env.DSH_DESKTOP_DEV_WEB_URL
/** CI/local verification mode: quit 0 once the UI answers, 1 otherwise. */
const SMOKE_TEST = process.argv.includes('--smoke-test')
const SMOKE_TIMEOUT_MS = 150_000

/** GitHub Releases feed backing the macOS check-only update prompt. */
const RELEASES_API_URL = 'https://api.github.com/repos/citrusli2026/dsh-electron-shell/releases/latest'
const RELEASES_PAGE_URL = 'https://github.com/citrusli2026/dsh-electron-shell/releases/latest'
/** Delay before the automatic macOS update check so boot traffic settles. */
const MAC_UPDATE_CHECK_DELAY_MS = 15_000

let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let supervisor: HarnessSupervisor | undefined
let allowedOrigin: string | undefined
let quitInProgress = false
let lastState: HarnessState | undefined
let saveStateTimer: NodeJS.Timeout | undefined

/** Apply one supervisor state transition to the window. */
function applyState(state: HarnessState): void {
  lastState = state
  refreshTray()
  if (mainWindow === undefined || mainWindow.isDestroyed()) return
  if (state.phase === 'ready') {
    allowedOrigin = new URL(state.url).origin
    void mainWindow.loadURL(state.url)
  } else if (state.phase === 'crashed') {
    void mainWindow.loadURL(errorPageHtml(state.attempts, state.logTail))
  } else {
    // starting: the previous surface is gone (boot or post-crash restart).
    void mainWindow.loadURL(loadingPageHtml())
  }
}

/** Bring the window back (recreating it if it was destroyed). */
function showWindow(): void {
  if (mainWindow === undefined || mainWindow.isDestroyed()) {
    mainWindow = createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/** Path of the persisted window-state file (userData is per-platform). */
function windowStatePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

/**
 * Read and validate the persisted window state. Anything unreadable or
 * off-screen falls back to the defaults (fitWindowState owns those rules).
 */
function loadWindowState(): WindowState {
  try {
    const raw: unknown = JSON.parse(readFileSync(windowStatePath(), 'utf8'))
    return fitWindowState(raw, screen.getAllDisplays().map(display => display.workArea))
  } catch {
    return fitWindowState(undefined, [])
  }
}

/** Persist the window's normal bounds plus the maximized flag. Never throws. */
function saveWindowState(window: BrowserWindow): void {
  if (window.isDestroyed()) return
  try {
    const bounds = window.getNormalBounds()
    const state: WindowState = { ...bounds, isMaximized: window.isMaximized() }
    writeFileSync(windowStatePath(), `${JSON.stringify(state)}\n`)
  } catch (error) {
    console.warn(`dsh-electron-shell: saving window state failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Debounce resize/move storms into one disk write. */
function scheduleWindowStateSave(window: BrowserWindow): void {
  if (saveStateTimer !== undefined) clearTimeout(saveStateTimer)
  saveStateTimer = setTimeout(() => {
    saveStateTimer = undefined
    saveWindowState(window)
  }, 400)
  saveStateTimer.unref()
}

function createWindow(): BrowserWindow {
  const state = loadWindowState()
  const window = new BrowserWindow({
    width: state.width,
    height: state.height,
    // Omit x/y entirely when unset so Electron center-positions the window.
    ...(state.x !== undefined && state.y !== undefined ? { x: state.x, y: state.y } : {}),
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    title: 'DSH Electron Shell',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(__dirname, '..', 'preload', 'index.cjs'),
    },
  })
  if (state.isMaximized === true) window.maximize()
  window.once('ready-to-show', () => window.show())
  // Persist geometry: debounced while dragging/resizing, exact on close.
  window.on('resize', () => scheduleWindowStateSave(window))
  window.on('move', () => scheduleWindowStateSave(window))
  window.on('close', (event) => {
    saveWindowState(window)
    // Closing the window parks the app in the tray; quitting goes through the
    // tray menu or Cmd+Q (before-quit sets quitInProgress and closes for real).
    if (!quitInProgress) {
      event.preventDefault()
      window.hide()
    }
  })
  window.on('closed', () => {
    mainWindow = undefined
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('data:')) return
    if (allowedOrigin !== undefined && new URL(url).origin === allowedOrigin) return
    event.preventDefault()
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
  })
  void window.loadURL(loadingPageHtml())
  return window
}

/** One-line harness status for the tray menu, derived from the last state. */
function statusLabel(): string {
  if (lastState?.phase === 'ready') return '状态:运行中'
  if (lastState?.phase === 'crashed') return `状态:已崩溃(${lastState.attempts} 次)`
  return '状态:启动中…'
}

/** Tray context menu: status, lifecycle actions, diagnostics, update, quit. */
function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: '打开 DSH Electron Shell', click: showWindow },
    { type: 'separator' },
    { label: statusLabel(), enabled: false },
    { label: '重启 Harness', click: () => { void restartHarness() } },
    { label: '打开日志目录', click: () => { void shell.openPath(join(app.getPath('userData'), 'logs')) } },
    { type: 'separator' },
    { label: '检查更新…', click: () => { void checkForUpdatesInteractively() } },
    { label: `版本 v${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ])
}

/**
 * Menu-bar tray: reopen the window and quit the app. Skipped in smoke mode
 * (headless CI has no system tray host).
 */
function createTray(): void {
  const image = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'trayTemplate.png'))
  if (process.platform === 'darwin') image.setTemplateImage(true)
  tray = new Tray(image)
  tray.setToolTip('DSH Electron Shell')
  tray.setContextMenu(buildTrayMenu())
  if (process.platform !== 'darwin') tray.on('click', showWindow)
}

/** Re-render the tray menu after a state transition (status line changes). */
function refreshTray(): void {
  tray?.setContextMenu(buildTrayMenu())
}

/**
 * Stop the current supervisor (if any) and boot a fresh harness. Shared by
 * the error page's retry button (IPC) and the tray's restart item.
 * @returns true once the new harness reached readiness and the window loads.
 */
async function restartHarness(): Promise<boolean> {
  if (mainWindow === undefined || mainWindow.isDestroyed()) return false
  // Dispose the previous supervisor first: stop any lingering child (a
  // timed-out boot may still be coming up) and release its log handle.
  await supervisor?.stop()
  supervisor = new HarnessSupervisor({ onState: applyState })
  try {
    const url = await supervisor.start()
    allowedOrigin = new URL(url).origin
    await mainWindow.loadURL(url)
    return true
  } catch {
    return false
  }
}

/** Manual retry from the error page (docs/decisions/0006: M3 follow-up). */
ipcMain.handle('harness:retry', async (event) => {
  if (mainWindow === undefined || mainWindow.isDestroyed()) return false
  // Only the shell's own error page (a data: URL in this window) may restart
  // the harness; the harness UI itself must not spawn a second instance.
  if (event.sender !== mainWindow.webContents || event.senderFrame?.url.startsWith('data:') !== true) return false
  // Smoke-only hook: force the failure path so the error page's recovery is
  // regression-tested (the button must re-enable, not stick on "正在启动…").
  if (SMOKE_TEST && process.env.DSH_DESKTOP_TEST_RETRY_FAIL === '1') return false
  return restartHarness()
})

/**
 * macOS check-only update prompt (docs/decisions/0004, 0010): without a
 * signed build electron-updater cannot install, so compare the latest GitHub
 * release tag and point the user at the download page. Best-effort: network
 * failures stay silent unless the check was triggered manually.
 * @param manual - true when invoked from the tray (shows outcome dialogs).
 */
async function checkMacUpdate(manual: boolean): Promise<void> {
  try {
    const response = await net.fetch(RELEASES_API_URL, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-electron-shell' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload: unknown = await response.json()
    const tagName = typeof payload === 'object' && payload !== null
      ? (payload as { tag_name?: unknown }).tag_name
      : undefined
    const latest = typeof tagName === 'string' ? tagName.replace(/^v/, '') : ''
    if (latest !== '' && isNewerVersion(app.getVersion(), latest)) {
      const { response: choice } = await dialog.showMessageBox({
        type: 'info',
        message: `发现新版本 v${latest}`,
        detail: `当前版本 v${app.getVersion()}。macOS 版暂未签名,没有自动更新(决策 0004);请下载新版手动覆盖安装。`,
        buttons: ['前往下载', '稍后'],
        defaultId: 0,
        cancelId: 1,
      })
      if (choice === 0) void shell.openExternal(RELEASES_PAGE_URL)
    } else if (manual) {
      await dialog.showMessageBox({
        type: 'info',
        message: '已是最新版本',
        detail: `当前版本 v${app.getVersion()}。`,
        buttons: ['好'],
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`dsh-electron-shell: macOS update check failed: ${message}`)
    if (manual) {
      await dialog.showMessageBox({ type: 'warning', message: '检查更新失败', detail: message, buttons: ['好'] })
    }
  }
}

/** Tray "检查更新…": macOS goes through the check-only prompt, other
 *  packaged platforms through electron-updater. */
async function checkForUpdatesInteractively(): Promise<void> {
  if (!app.isPackaged) {
    await dialog.showMessageBox({ type: 'info', message: '检查更新', detail: '开发模式没有更新源。', buttons: ['好'] })
    return
  }
  if (process.platform === 'darwin') {
    await checkMacUpdate(true)
    return
  }
  await autoUpdater.checkForUpdatesAndNotify()
}

/** Fail loudly at boot when the bundled closure is missing or incomplete. */
function verifyHarness(root: string): void {
  const checks: ReadonlyArray<readonly [string, string]> = [
    ['node', nodeBin(root)],
    ['dsh', dshBin(root)],
  ]
  for (const [label, path] of checks) {
    if (!existsSync(path)) {
      throw new Error(`bundled harness incomplete: ${label} missing at ${path}; run 'pnpm run bootstrap' first`)
    }
  }
}

/**
 * Boot the window and the harness; resolve with the UI URL. Rejects when the
 * harness fails to reach readiness (the window shows the error page).
 * @returns the local web UI URL.
 */
async function boot(): Promise<string> {
  verifyHarness(harnessRoot())
  mainWindow = createWindow()

  // Smoke-only branch: exercise the gave-up error page and its retry button.
  if (SMOKE_TEST && process.env.DSH_DESKTOP_TEST_FAIL_HARNESS === '1') {
    await mainWindow.loadURL(errorPageHtml(6, 'simulated crash (smoke)'))
    throw new Error('simulated boot failure (smoke)')
  }

  if (DEV_WEB_URL !== undefined) {
    console.log(`dsh-electron-shell: dev mode, loading ${DEV_WEB_URL}`)
    allowedOrigin = new URL(DEV_WEB_URL).origin
    await mainWindow.loadURL(DEV_WEB_URL)
    return DEV_WEB_URL
  }

  supervisor = new HarnessSupervisor({ onState: applyState })
  try {
    const url = await supervisor.start()
    allowedOrigin = new URL(url).origin
    await mainWindow.loadURL(url)
    console.log(`dsh-electron-shell: harness ready at ${url}`)
    return url
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`dsh-electron-shell: ${message}`)
    await mainWindow.loadURL(errorPageHtml(0, message))
    throw error
  }
}

/** Quit through the app flow so before-quit stops the harness first. */
function quitGracefully(code: number): void {
  process.exitCode = code
  app.quit()
}

async function smokeVerify(url: string): Promise<void> {
  const response = await net.fetch(url)
  const body = await response.text()
  const ok = response.ok && body.includes('__DSH_BOOT__')
  console.error(`smoke: ${ok ? 'OK' : 'FAIL'} ${url} status=${response.status} body=${body.length}B boot=${body.includes('__DSH_BOOT__')}`)
  quitGracefully(ok ? 0 : 1)
}

app.on('before-quit', (event) => {
  if (quitInProgress) return
  // Set before the supervisor check: a quit with no supervisor (boot failed)
  // must still let the hide-on-close handler close the window for real.
  quitInProgress = true
  if (supervisor !== undefined) {
    event.preventDefault()
    void supervisor.stop().finally(() => app.quit())
  }
})

app.on('window-all-closed', () => {
  if (!quitInProgress) app.quit()
})

// macOS dock-icon convention: clicking the icon reopens the window.
app.on('activate', showWindow)

// Windows/Linux auto-update via GitHub Releases. macOS is skipped until a
// signed/notarized build exists (decision 0004) — it gets the check-only
// prompt instead (decision 0010). Dev and smoke runs are skipped because
// app-update.yml only exists in packaged builds. Failures stay silent:
// updates are best-effort for an offline-capable desktop app.
if (app.isPackaged && !SMOKE_TEST && process.platform !== 'darwin') {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-downloaded', () => {
    console.log('dsh-electron-shell: update downloaded, will install on quit')
  })
  autoUpdater.on('error', (error) => {
    console.warn(`dsh-electron-shell: update check failed: ${error.message}`)
  })
  void autoUpdater.checkForUpdatesAndNotify().catch(() => {})
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showWindow()
  })

  void app.whenReady().then(async () => {
    try {
      const url = await boot()
      if (!SMOKE_TEST) {
        createTray()
        if (app.isPackaged && process.platform === 'darwin') {
          // One check-only prompt per launch; the tray item allows manual checks.
          const timer = setTimeout(() => { void checkMacUpdate(false) }, MAC_UPDATE_CHECK_DELAY_MS)
          timer.unref()
        }
      }
      if (SMOKE_TEST) {
        const timer = setTimeout(() => {
          console.error('smoke: TIMEOUT')
          quitGracefully(1)
        }, SMOKE_TIMEOUT_MS)
        timer.unref()
        await smokeVerify(url)
      }
    } catch (error) {
      console.error('dsh-electron-shell: boot failed:', error instanceof Error ? error.message : error)
      if (!SMOKE_TEST) {
        // Boot can fail before any window exists (verifyHarness rejects on a
        // missing closure, before createWindow runs). Never leave a
        // windowless, trayless zombie: surface the failure and give the user
        // a way to quit or retry.
        const message = error instanceof Error ? error.message : String(error)
        if (mainWindow === undefined || mainWindow.isDestroyed()) mainWindow = createWindow()
        void mainWindow.loadURL(errorPageHtml(0, message))
        createTray()
      }
      if (SMOKE_TEST) {
        if (process.env.DSH_DESKTOP_TEST_FAIL_HARNESS === '1' && mainWindow !== undefined) {
          // The error page must carry the retry button wired to the preload.
          const button = await mainWindow.webContents.executeJavaScript(
            "document.querySelector('button')?.textContent ?? ''",
          ).catch(() => '')
          console.error(`smoke: error-page button=${JSON.stringify(button)}`)
          if (button !== '重试启动') {
            quitGracefully(1)
            return
          }
          await mainWindow.webContents.executeJavaScript(
            "document.querySelector('button')?.click(); true",
          )
          if (process.env.DSH_DESKTOP_TEST_RETRY_FAIL === '1') {
            // Forced retry failure: the page must restore the button instead
            // of sticking on the disabled "正在启动…" state.
            const deadline = Date.now() + 15_000
            let recovered = ''
            while (recovered === '' && Date.now() < deadline) {
              recovered = await mainWindow.webContents.executeJavaScript(
                "(() => { const b = document.querySelector('button'); return b !== null && !b.disabled ? b.textContent : '' })()",
              ).catch(() => '')
              if (recovered === '') await new Promise(resolve => setTimeout(resolve, 500))
            }
            if (recovered === '重试启动') {
              console.error('smoke: retry-failure recovery OK')
              quitGracefully(0)
            } else {
              console.error('smoke: retry-failure left the error page stuck')
              quitGracefully(1)
            }
            return
          }
          // Full retry roundtrip: clicking the button must bring a real
          // harness up and reload the window.
          const deadline = Date.now() + 90_000
          while (allowedOrigin === undefined && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
          if (allowedOrigin === undefined) {
            console.error('smoke: retry did not reach ready in time')
            quitGracefully(1)
          } else {
            await smokeVerify(`${allowedOrigin}/`)
          }
        } else {
          quitGracefully(1)
        }
      }
    }
  })
}
