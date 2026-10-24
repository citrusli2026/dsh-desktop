/**
 * Optional companion windows declared by installed plugins (ADR 0043).
 *
 * The shell only ever loads a declared path on the Harness origin, after an
 * HTML probe, in a sandboxed frameless window. It never executes plugin code,
 * never reads the Harness DOM and deliberately offers no approval bridge.
 */
import { app, BrowserWindow, ipcMain, screen, type IpcMainInvokeEvent, type Rectangle, type Session } from 'electron'
import { join } from 'node:path'
import {
  companionPosition,
  companionUrl,
  isCompanionResponseOk,
  type CompanionDescriptor,
} from './companion-policy.ts'
import { discoverCompanions } from './companion-discovery.ts'
import type { WindowContext } from './window.ts'

interface Entry {
  descriptor: CompanionDescriptor
  window?: BrowserWindow
}

let active: { context: WindowContext; main: BrowserWindow } | undefined
const entries = new Map<string, Entry>()
let ipcRegistered = false
let screenListening = false
let quitListening = false

function mainOf(): BrowserWindow | undefined {
  const main = active?.main
  return main !== undefined && !main.isDestroyed() ? main : undefined
}

function sameRoute(candidate: string, route: string): boolean {
  const origin = active?.context.allowedOrigin
  if (origin === undefined) return false
  try {
    const target = new URL(candidate)
    return target.origin === origin && target.pathname === route
  } catch {
    return false
  }
}

/** The main Harness renderer, from the verified shell origin. */
function isMainSender(event: IpcMainInvokeEvent): boolean {
  const main = mainOf()
  const origin = active?.context.allowedOrigin
  if (main === undefined || origin === undefined) return false
  if (event.sender.id !== main.webContents.id) return false
  if (event.senderFrame !== main.webContents.mainFrame) return false
  try {
    return new URL(event.senderFrame.url).origin === origin
  } catch {
    return false
  }
}

/** The companion that owns this IPC sender, including its declared route. */
function companionFor(event: IpcMainInvokeEvent): Entry | undefined {
  for (const entry of entries.values()) {
    const win = entry.window
    if (win === undefined || win.isDestroyed()) continue
    if (event.sender.id !== win.webContents.id) continue
    if (event.senderFrame !== win.webContents.mainFrame) continue
    if (sameRoute(event.senderFrame.url, entry.descriptor.route)) return entry
  }
  return undefined
}

async function probe(url: string, session: Session): Promise<boolean> {
  try {
    // Use the main window's session: the Harness auth fence rejects a bare
    // Node fetch (401) even when the same route serves the logged-in window.
    const response = await session.fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(4000),
      headers: { accept: 'text/html' },
    })
    const contentType = response.headers.get('content-type')
    await response.body?.cancel().catch(() => {})
    return isCompanionResponseOk(response.status, contentType)
  } catch {
    return false
  }
}

function place(win: BrowserWindow, index: number): void {
  const main = mainOf()
  if (main === undefined || win.isDestroyed()) return
  const { width, height } = win.getBounds()
  const area: Rectangle = screen.getDisplayMatching(main.getBounds()).workArea
  const position = companionPosition(area, { width, height }, index)
  win.setPosition(position.x, position.y)
}

function repositionAll(): void {
  let index = 0
  for (const entry of entries.values()) {
    const win = entry.window
    if (win === undefined || win.isDestroyed() || !win.isVisible()) continue
    place(win, index)
    index += 1
  }
}

function ensureWindow(entry: Entry): BrowserWindow {
  const existing = entry.window
  if (existing !== undefined && !existing.isDestroyed()) return existing
  const win = new BrowserWindow({
    width: entry.descriptor.width,
    height: entry.descriptor.height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    title: entry.descriptor.title,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(__dirname, '..', 'preload', 'companion.cjs'),
    },
  })
  win.setMenuBarVisibility(false)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const guard = (event: Electron.Event, next: string): void => {
    if (sameRoute(next, entry.descriptor.route)) return
    event.preventDefault()
  }
  win.webContents.on('will-navigate', guard)
  win.webContents.on('will-redirect', guard)
  win.webContents.on('will-attach-webview', event => { event.preventDefault() })
  win.on('closed', () => {
    if (entry.window === win) entry.window = undefined
  })
  entry.window = win
  return win
}

/** Show one declared companion; returns false when it cannot be offered. */
export async function showCompanion(id: string, options: { onlyIfMinimized?: boolean } = {}): Promise<boolean> {
  const current = active
  const main = mainOf()
  if (current === undefined || main === undefined) return false
  const descriptors = await discoverCompanions(current.context.getDshHome())
  const descriptor = descriptors.find(item => item.id === id)
  if (descriptor === undefined) return false
  const url = companionUrl(current.context.harnessUrl, descriptor.route)
  if (url === undefined) return false
  let entry = entries.get(id)
  if (entry === undefined) {
    entry = { descriptor }
    entries.set(id, entry)
  }
  entry.descriptor = descriptor
  if (!(await probe(url, main.webContents.session))) {
    entry.window?.destroy()
    entry.window = undefined
    return false
  }
  const win = ensureWindow(entry)
  try {
    await win.loadURL(url)
  } catch {
    win.destroy()
    entry.window = undefined
    return false
  }
  // loadURL resolves after subresources; the user may have restored the main
  // window meanwhile. Never let a late showInactive undo that restore.
  const stillMain = mainOf()
  if (options.onlyIfMinimized === true && (stillMain === undefined || !stillMain.isMinimized())) {
    win.hide()
    return false
  }
  place(win, Array.from(entries.keys()).indexOf(id))
  win.showInactive()
  return true
}

export function hideCompanion(id: string): void {
  entries.get(id)?.window?.hide()
}

function hideAll(): void {
  for (const entry of entries.values()) entry.window?.hide()
}

function destroyAll(): void {
  for (const entry of entries.values()) {
    const win = entry.window
    if (win !== undefined && !win.isDestroyed()) win.destroy()
  }
  entries.clear()
}

async function showMinimized(): Promise<void> {
  const current = active
  if (current === undefined) return
  const descriptors = await discoverCompanions(current.context.getDshHome())
  for (const descriptor of descriptors.filter(item => item.showOnMinimize).slice(0, 3)) {
    await showCompanion(descriptor.id, { onlyIfMinimized: true })
  }
}

function registerIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true
  ipcMain.handle('companion:list', async event => {
    if (!isMainSender(event)) return []
    const current = active
    return current === undefined ? [] : discoverCompanions(current.context.getDshHome())
  })
  ipcMain.handle('companion:toggle', async (event, id: unknown) => {
    if (!isMainSender(event) || typeof id !== 'string' || id.length > 214) return false
    const entry = entries.get(id)
    if (entry?.window !== undefined && !entry.window.isDestroyed() && entry.window.isVisible()) {
      entry.window.hide()
      return true
    }
    return showCompanion(id)
  })
  // Let the page decide when the transparent parts of its own window should
  // pass clicks through to the desktop (ADR 0043 keeps this generic: the shell
  // never inspects the page, it only applies the window flag the page asks for).
  ipcMain.handle('companion:set-interactive', (event, interactive: unknown) => {
    const entry = companionFor(event)
    const win = entry?.window
    if (win === undefined || win.isDestroyed() || typeof interactive !== 'boolean') return false
    win.setIgnoreMouseEvents(!interactive, { forward: true })
    return true
  })
  ipcMain.handle('companion:hide-self', event => {
    const entry = companionFor(event)
    if (entry?.window === undefined) return false
    entry.window.hide()
    return true
  })
  ipcMain.handle('companion:focus-main', event => {
    const entry = companionFor(event)
    if (entry === undefined) return false
    entry.window?.hide()
    const main = mainOf()
    if (main === undefined) return true
    if (main.isMinimized()) main.restore()
    main.show()
    main.focus()
    return true
  })
}

/** Bind companion behaviour to the main window; safe to call per window. */
export function attachCompanionWindows(context: WindowContext, main: BrowserWindow): void {
  active = { context, main }
  registerIpc()
  main.on('minimize', () => {
    if (context.quitInProgress || context.builtInPage !== undefined) return
    void showMinimized()
  })
  main.on('restore', hideAll)
  main.on('show', () => { if (!main.isMinimized()) hideAll() })
  main.on('hide', hideAll)
  main.on('close', hideAll)
  main.on('closed', destroyAll)
  if (!screenListening) {
    screenListening = true
    screen.on('display-metrics-changed', repositionAll)
    screen.on('display-added', repositionAll)
    screen.on('display-removed', repositionAll)
  }
  if (!quitListening) {
    quitListening = true
    app.on('before-quit', destroyAll)
  }
}
