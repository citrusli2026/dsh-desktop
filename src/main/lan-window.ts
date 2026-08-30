/** Small modal window used to present a LAN pairing QR code. */
import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { shellText, type ShellLocale } from './locale.ts'
import type { LanPairing } from './lan.ts'
import { asDataUrl } from './shell-html.ts'
import { pairingPageMarkup } from './lan-page.ts'

export { pairingPageMarkup } from './lan-page.ts'

let pairingWindow: BrowserWindow | undefined

function page(pairing: LanPairing, qrSvg: string, locale: ShellLocale): string {
  return asDataUrl(pairingPageMarkup(pairing, qrSvg, locale))
}

export function showLanPairingWindow(parent: BrowserWindow | undefined, pairing: LanPairing, qrSvg: string, locale: ShellLocale): BrowserWindow {
  if (pairingWindow !== undefined && !pairingWindow.isDestroyed()) {
    pairingWindow.show()
    pairingWindow.focus()
    return pairingWindow
  }
  const window = new BrowserWindow({
    width: 500,
    height: 720,
    minWidth: 460,
    minHeight: 660,
    resizable: false,
    show: false,
    modal: parent !== undefined,
    parent,
    center: true,
    title: shellText(locale, 'lan.qrTitle'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(__dirname, '..', 'preload', 'index.cjs'),
    },
  })
  pairingWindow = window
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (pairingWindow === window) pairingWindow = undefined
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  void window.loadURL(page(pairing, qrSvg, locale))
  return window
}

export function isLanPairingWindow(window: BrowserWindow | undefined | null): window is BrowserWindow {
  return window !== undefined && window !== null && !window.isDestroyed() && window === pairingWindow
}

export function closeLanPairingWindow(): void {
  if (pairingWindow !== undefined && !pairingWindow.isDestroyed()) pairingWindow.close()
  pairingWindow = undefined
}
