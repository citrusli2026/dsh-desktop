/** Optional Windows companion for an explicitly installed dsh-whale-widget. */
import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import type { WindowContext } from './window.ts'
import { approvalClickScript, whalePetUrl } from './whale-pet-policy.ts'

interface PetController {
  window?: BrowserWindow
  context: WindowContext
  focusMain(): void
  hide(): void
  destroy(): void
  reload(base: string): void
}

const owners = new Map<number, PetController>()
const controllers = new WeakMap<WindowContext, PetController>()
let registered = false

function registerIpc(): void {
  if (registered) return
  registered = true
  const owner = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): PetController | undefined => {
    const pet = owners.get(event.sender.id)
    if (pet?.window?.isDestroyed() !== false || event.senderFrame !== pet.window.webContents.mainFrame) return undefined
    const expected = whalePetUrl(pet.context.harnessUrl)
    if (expected === undefined) return undefined
    try {
      const actual = new URL(event.senderFrame.url)
      if (actual.origin !== new URL(expected).origin || actual.pathname !== '/dsh-whale/pet') return undefined
    } catch { return undefined }
    return pet
  }
  for (const channel of ['whale-pet:focus-main', 'whale-pet:minimize']) {
    ipcMain.handle(channel, event => {
      const pet = owner(event)
      if (pet === undefined) return false
      pet.hide()
      pet.focusMain()
      return true
    })
  }
  ipcMain.on('whale-pet:interactive', (event, interactive: unknown) => {
    owner(event)?.window?.setIgnoreMouseEvents(interactive !== true, { forward: true })
  })
  ipcMain.handle('whale-pet:answer', async (event, outcome: unknown, id: unknown) => {
    const pet = owner(event)
    if (pet === undefined) return { ok: false, reason: 'unauthorized' }
    const script = approvalClickScript(outcome, id)
    const main = pet.context.mainWindow
    if (script === undefined || main === undefined || main.isDestroyed()) {
      pet.focusMain()
      return { ok: false, reason: 'invalid-request' }
    }
    try {
      const result: unknown = await main.webContents.executeJavaScript(script, true)
      if (typeof result === 'object' && result !== null && 'ok' in result && result.ok === true) return { ok: true }
    } catch { /* A stale or missing approval is handled in the main window. */ }
    pet.hide()
    pet.focusMain()
    return { ok: false, reason: 'confirm-in-main' }
  })
}

export function attachWhalePet(context: WindowContext, main: BrowserWindow, focusMain: () => void): void {
  // Opt in while maintainers review the integration; never open a companion for
  // users who have not requested it, or on platforms without validation.
  if (process.platform !== 'win32' || process.env.DSH_DESKTOP_WHALE_PET !== '1') return
  registerIpc()
  const controller: PetController = {
    context, focusMain,
    hide() { if (controller.window?.isDestroyed() === false) controller.window.hide() },
    destroy() {
      const pet = controller.window
      if (pet !== undefined && !pet.isDestroyed()) {
        owners.delete(pet.webContents.id)
        pet.destroy()
      }
      controller.window = undefined
      controllers.delete(context)
    },
    reload(base) {
      const url = whalePetUrl(base)
      if (controller.window?.isDestroyed() === false && url !== undefined) {
        void controller.window.loadURL(url).catch(() => controller.hide())
      } else controller.hide()
    },
  }
  controllers.set(context, controller)
  main.on('minimize', () => {
    if (context.quitInProgress || context.builtInPage !== undefined) return
    const url = whalePetUrl(context.harnessUrl)
    if (url === undefined) return
    let pet = controller.window
    if (pet === undefined || pet.isDestroyed()) {
      pet = new BrowserWindow({
        width: 560, height: 620, show: false, frame: false, transparent: true,
        backgroundColor: '#00000000', resizable: false, movable: false,
        minimizable: false, maximizable: false, fullscreenable: false,
        skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
        webPreferences: {
          contextIsolation: true, sandbox: true, nodeIntegration: false,
          preload: join(__dirname, '..', 'preload', 'pet.cjs'),
        },
      })
      controller.window = pet
      owners.set(pet.webContents.id, controller)
      pet.setIgnoreMouseEvents(true, { forward: true })
      pet.webContents.setAudioMuted(true)
      pet.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      const guardNavigation = (event: Electron.Event, next: string): void => {
        try {
          const target = new URL(next)
          if (target.origin === new URL(url).origin && target.pathname === '/dsh-whale/pet') return
        } catch { /* Malformed navigation is blocked. */ }
        event.preventDefault()
      }
      pet.webContents.on('will-navigate', guardNavigation)
      pet.webContents.on('will-redirect', guardNavigation)
      const owned = pet
      pet.webContents.on('did-finish-load', () => {
        if (!owned.isDestroyed()) owned.setIgnoreMouseEvents(true, { forward: true })
      })
      pet.on('closed', () => {
        for (const [id, owner] of owners) if (owner === controller) owners.delete(id)
        if (controller.window === owned) controller.window = undefined
      })
      void pet.loadURL(url).catch(() => controller.hide())
    }
    const area = screen.getDisplayMatching(main.getBounds()).workArea
    pet.setPosition(Math.max(area.x, area.x + area.width - 568), Math.max(area.y, area.y + area.height - 628))
    pet.showInactive()
  })
  main.on('restore', () => controller.hide())
  main.on('show', () => { if (!main.isMinimized()) controller.hide() })
  main.on('hide', () => controller.hide())
  main.on('close', () => controller.hide())
  main.on('closed', () => controller.destroy())
}

export function reloadWhalePet(context: WindowContext, url: string): void {
  controllers.get(context)?.reload(url)
}

export function hideWhalePet(context: WindowContext): void {
  controllers.get(context)?.hide()
}
