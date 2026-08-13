/**
 * dsh-desktop main process: a single-instance window hosting the bundled
 * DeepSeek Harness web runtime, following the supervision protocol described
 * in docs/decisions/0006-process-supervision-protocol.md.
 * @module main/index
 */
import { app, BrowserWindow, net, shell } from 'electron'
import { existsSync } from 'node:fs'
import { HarnessSupervisor, type HarnessState } from './supervisor.ts'
import { errorPageHtml, loadingPageHtml } from './pages.ts'
import { dshBin, harnessRoot, nodeBin } from './paths.ts'

/** Load an external `dsh web` instance instead of supervising one (dev only). */
const DEV_WEB_URL = process.env.DSH_DESKTOP_DEV_WEB_URL
/** CI/local verification mode: quit 0 once the UI answers, 1 otherwise. */
const SMOKE_TEST = process.argv.includes('--smoke-test')
const SMOKE_TIMEOUT_MS = 150_000

let mainWindow: BrowserWindow | undefined
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
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'DSH Desktop',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  window.once('ready-to-show', () => window.show())
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

  if (DEV_WEB_URL !== undefined) {
    console.log(`dsh-desktop: dev mode, loading ${DEV_WEB_URL}`)
    allowedOrigin = new URL(DEV_WEB_URL).origin
    await mainWindow.loadURL(DEV_WEB_URL)
    return DEV_WEB_URL
  }

  supervisor = new HarnessSupervisor({ onState: applyState })
  try {
    const url = await supervisor.start()
    allowedOrigin = new URL(url).origin
    await mainWindow.loadURL(url)
    console.log(`dsh-desktop: harness ready at ${url}`)
    return url
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`dsh-desktop: ${message}`)
    await mainWindow.loadURL(errorPageHtml(0, message))
    throw error
  }
}

async function smokeVerify(url: string): Promise<void> {
  const response = await net.fetch(url)
  const body = await response.text()
  if (response.ok && body.includes('__DSH_BOOT__')) {
    console.log(`SMOKE_OK ${url}`)
    process.exit(0)
  }
  console.error(`SMOKE_FAIL ${url} status=${response.status}`)
  process.exit(1)
}

app.on('before-quit', (event) => {
  if (quitInProgress || supervisor === undefined) return
  event.preventDefault()
  quitInProgress = true
  void supervisor.stop().finally(() => app.quit())
})

app.on('window-all-closed', () => {
  app.quit()
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow === undefined) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(async () => {
    try {
      const url = await boot()
      if (SMOKE_TEST) {
        const timer = setTimeout(() => {
          console.error('SMOKE_TIMEOUT')
          process.exit(1)
        }, SMOKE_TIMEOUT_MS)
        timer.unref()
        await smokeVerify(url)
      }
    } catch (error) {
      console.error('dsh-desktop: boot failed:', error instanceof Error ? error.message : error)
      if (SMOKE_TEST) process.exit(1)
    }
  })
}
