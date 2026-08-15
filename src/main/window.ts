/** Main-window ownership, persistence, and navigation boundaries. */
import { app, BrowserWindow, screen, shell } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { errorPageHtml, loadingPageHtml } from './pages.ts'
import { fitWindowState, MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, type WindowState } from './window-state.ts'

export interface WindowContext {
  mainWindow?: BrowserWindow
  allowedOrigin?: string
  quitInProgress: boolean
}

function windowStatePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): WindowState {
  try {
    const raw: unknown = JSON.parse(readFileSync(windowStatePath(), 'utf8'))
    return fitWindowState(raw, screen.getAllDisplays().map(display => display.workArea))
  } catch {
    return fitWindowState(undefined, [])
  }
}

function saveWindowState(window: BrowserWindow): void {
  if (window.isDestroyed()) return
  try {
    const bounds = window.getNormalBounds()
    const state: WindowState = { ...bounds, isMaximized: window.isMaximized() }
    writeFileSync(windowStatePath(), `${JSON.stringify(state)}\n`)
  } catch (error) {
    console.warn(`dsh-desktop: saving window state failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function createMainWindow(context: WindowContext): BrowserWindow {
  const state = loadWindowState()
  let saveStateTimer: NodeJS.Timeout | undefined
  const window = new BrowserWindow({
    width: state.width,
    height: state.height,
    ...(state.x !== undefined && state.y !== undefined ? { x: state.x, y: state.y } : {}),
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    title: 'dsh-desktop',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(__dirname, '..', 'preload', 'index.cjs'),
    },
  })
  context.mainWindow = window
  if (state.isMaximized === true) window.maximize()
  window.once('ready-to-show', () => window.show())

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
    if (!context.quitInProgress) {
      event.preventDefault()
      window.hide()
    }
  })
  window.on('closed', () => {
    if (context.mainWindow === window) context.mainWindow = undefined
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('data:')) return
    if (context.allowedOrigin !== undefined && new URL(url).origin === context.allowedOrigin) return
    event.preventDefault()
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
  })
  void window.loadURL(loadingPageHtml())
  return window
}

export function showWindow(context: WindowContext): void {
  const window = context.mainWindow
  if (window === undefined || window.isDestroyed()) {
    createMainWindow(context)
    return
  }
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

export async function loadHarnessUrl(context: WindowContext, url: string): Promise<void> {
  context.allowedOrigin = new URL(url).origin
  await context.mainWindow?.loadURL(url)
}

export async function loadLoadingPage(context: WindowContext): Promise<void> {
  await context.mainWindow?.loadURL(loadingPageHtml())
}

export async function loadErrorPage(context: WindowContext, attempts: number, logTail: string): Promise<void> {
  await context.mainWindow?.loadURL(errorPageHtml(attempts, logTail))
}
