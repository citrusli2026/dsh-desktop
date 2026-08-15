/** Electron lifecycle assembly for the bundled DeepSeek Harness runtime. */
import { app, ipcMain, session } from 'electron'
import { existsSync } from 'node:fs'
import { HarnessSupervisor, type HarnessState } from './supervisor.ts'
import { dshBin, harnessRoot, nodeBin } from './paths.ts'
import { configureAboutPanel, installAppMenu } from './menu.ts'
import { denyUnexpectedPermissions } from './permissions.ts'
import {
  createMainWindow,
  loadErrorPage,
  loadHarnessUrl,
  loadLoadingPage,
  showWindow,
  type WindowContext,
} from './window.ts'
import { createTray, refreshTray } from './tray.ts'
import { checkForUpdatesInteractively, checkMacUpdate, configureAutoUpdates } from './update-prompt.ts'
import { armSmokeTimeout, quitGracefully, SMOKE_TEST, smokeVerify, verifySmokeFailureRecovery } from './smoke.ts'

const DEV_WEB_URL = process.env.DSH_DESKTOP_DEV_WEB_URL
const MAC_UPDATE_CHECK_DELAY_MS = 15_000

const windowContext: WindowContext = { quitInProgress: false }
let supervisor: HarnessSupervisor | undefined
let lastState: HarnessState | undefined

function applyState(state: HarnessState): void {
  lastState = state
  refreshTray()
  if (state.phase === 'ready') {
    void loadHarnessUrl(windowContext, state.url)
  } else if (state.phase === 'crashed') {
    void loadErrorPage(windowContext, state.attempts, state.logTail)
  } else {
    void loadLoadingPage(windowContext)
  }
}

async function restartHarness(): Promise<boolean> {
  const window = windowContext.mainWindow
  if (window === undefined || window.isDestroyed()) return false
  await supervisor?.stop()
  supervisor = new HarnessSupervisor({ onState: applyState })
  try {
    const url = await supervisor.start()
    await loadHarnessUrl(windowContext, url)
    return true
  } catch {
    return false
  }
}

ipcMain.handle('harness:retry', async (event) => {
  const window = windowContext.mainWindow
  if (window === undefined || window.isDestroyed()) return false
  if (event.sender !== window.webContents || event.senderFrame?.url.startsWith('data:') !== true) return false
  if (SMOKE_TEST && process.env.DSH_DESKTOP_TEST_RETRY_FAIL === '1') return false
  return restartHarness()
})

function verifyHarness(root: string): void {
  const checks: ReadonlyArray<readonly [string, string]> = [['node', nodeBin(root)], ['dsh', dshBin(root)]]
  for (const [label, path] of checks) {
    if (!existsSync(path)) throw new Error(`bundled harness incomplete: ${label} missing at ${path}; run 'pnpm run bootstrap' first`)
  }
}

async function boot(): Promise<string> {
  verifyHarness(harnessRoot())
  createMainWindow(windowContext)
  if (SMOKE_TEST && process.env.DSH_DESKTOP_TEST_FAIL_HARNESS === '1') {
    await loadErrorPage(windowContext, 6, 'simulated crash (smoke)')
    throw new Error('simulated boot failure (smoke)')
  }
  if (DEV_WEB_URL !== undefined) {
    console.log(`dsh-desktop: dev mode, loading ${DEV_WEB_URL}`)
    await loadHarnessUrl(windowContext, DEV_WEB_URL)
    return DEV_WEB_URL
  }

  supervisor = new HarnessSupervisor({ onState: applyState })
  try {
    const url = await supervisor.start()
    await loadHarnessUrl(windowContext, url)
    console.log(`dsh-desktop: harness ready at ${url}`)
    return url
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`dsh-desktop: ${message}`)
    await loadErrorPage(windowContext, 0, message)
    throw error
  }
}

const trayActions = {
  getState: (): HarnessState | undefined => lastState,
  showWindow: (): void => showWindow(windowContext),
  restartHarness,
  checkForUpdates: checkForUpdatesInteractively,
}

app.on('before-quit', (event) => {
  if (windowContext.quitInProgress) return
  windowContext.quitInProgress = true
  if (supervisor !== undefined) {
    event.preventDefault()
    void supervisor.stop().finally(() => app.quit())
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
    configureAboutPanel()
    installAppMenu()
    try {
      const url = await boot()
      if (!SMOKE_TEST) {
        createTray(trayActions)
        if (app.isPackaged && process.platform === 'darwin') {
          const timer = setTimeout(() => { void checkMacUpdate(false) }, MAC_UPDATE_CHECK_DELAY_MS)
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
        void loadErrorPage(windowContext, 0, message)
        createTray(trayActions)
      } else if (process.env.DSH_DESKTOP_TEST_FAIL_HARNESS === '1' && windowContext.mainWindow !== undefined) {
        await verifySmokeFailureRecovery(windowContext.mainWindow, () => windowContext.allowedOrigin)
      } else {
        quitGracefully(1)
      }
    }
  })
}
