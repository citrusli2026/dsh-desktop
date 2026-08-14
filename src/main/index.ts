/**
 * dsh-electron-shell main process: a single-instance window hosting the bundled
 * DeepSeek Harness web runtime, following the supervision protocol described
 * in docs/decisions/0006-process-supervision-protocol.md.
 * @module main/index
 */
import { app, BrowserWindow, ipcMain, Menu, nativeImage, net, shell, Tray } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import electronUpdater from 'electron-updater'
import { HarnessSupervisor, type HarnessState } from './supervisor.ts'
import { errorPageHtml, loadingPageHtml } from './pages.ts'
import { dshBin, harnessRoot, nodeBin } from './paths.ts'

const { autoUpdater } = electronUpdater

/** Load an external `dsh web` instance instead of supervising one (dev only). */
const DEV_WEB_URL = process.env.DSH_DESKTOP_DEV_WEB_URL
/** CI/local verification mode: quit 0 once the UI answers, 1 otherwise. */
const SMOKE_TEST = process.argv.includes('--smoke-test')
const SMOKE_TIMEOUT_MS = 150_000

let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let supervisor: HarnessSupervisor | undefined
let allowedOrigin: string | undefined
let quitInProgress = false

/** Apply one supervisor state transition to the window. */
function applyState(state: HarnessState): void {
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

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'DSH Electron Shell',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(__dirname, '..', 'preload', 'index.cjs'),
    },
  })
  window.once('ready-to-show', () => window.show())
  // Closing the window parks the app in the tray; quitting goes through the
  // tray menu or Cmd+Q (before-quit sets quitInProgress and closes for real).
  window.on('close', (event) => {
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

/**
 * Menu-bar tray: reopen the window and quit the app. Skipped in smoke mode
 * (headless CI has no system tray host).
 */
function createTray(): void {
  const image = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'trayTemplate.png'))
  if (process.platform === 'darwin') image.setTemplateImage(true)
  tray = new Tray(image)
  tray.setToolTip('DSH Electron Shell')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 DSH Electron Shell', click: showWindow },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]))
  if (process.platform !== 'darwin') tray.on('click', showWindow)
}

/** Manual retry from the error page (docs/decisions/0006: M3 follow-up). */
ipcMain.handle('harness:retry', async () => {
  if (mainWindow === undefined || mainWindow.isDestroyed()) return false
  supervisor = new HarnessSupervisor({ onState: applyState })
  try {
    const url = await supervisor.start()
    allowedOrigin = new URL(url).origin
    await mainWindow.loadURL(url)
    return true
  } catch {
    return false
  }
})

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
// signed/notarized build exists (decision 0004); dev and smoke runs are
// skipped because app-update.yml only exists in packaged builds. Failures
// stay silent: updates are best-effort for an offline-capable desktop app.
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
      if (!SMOKE_TEST) createTray()
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
      if (SMOKE_TEST) {
        if (process.env.DSH_DESKTOP_TEST_FAIL_HARNESS === '1' && mainWindow !== undefined) {
          // The error page must carry the retry button wired to the preload;
          // then exercise the full retry roundtrip: click it and expect the
          // supervisor to bring a real harness up and reload the window.
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
