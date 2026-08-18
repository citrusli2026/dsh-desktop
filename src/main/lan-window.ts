/** Small modal window used to present a LAN pairing QR code. */
import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { shellText, type ShellLocale } from './locale.ts'
import type { LanPairing } from './lan.ts'

let pairingWindow: BrowserWindow | undefined

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!)
}

function page(pairing: LanPairing, qrSvg: string, locale: ShellLocale): string {
  const title = shellText(locale, 'lan.qrTitle')
  const instructions = shellText(locale, 'lan.qrInstructions')
  const address = shellText(locale, 'lan.address', { address: pairing.baseUrl })
  const code = shellText(locale, 'lan.code', { code: pairing.code })
  const expiry = shellText(locale, 'lan.expires', { minutes: Math.round(pairing.expiresInSeconds / 60) })
  const close = shellText(locale, 'lan.close')
  const language = locale === 'zh' ? 'zh-CN' : 'en'
  const markup = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><title>${escapeHtml(title)}</title><style>
    :root { color-scheme: light dark; --bg: #f6f7fb; --panel: #fff; --text: #1e2230; --muted: #606878; --line: #e3e6ef; --accent: #4d6bfe; }
    @media (prefers-color-scheme: dark) { :root { --bg: #0f1117; --panel: #191c24; --text: #f5f6fa; --muted: #adb3c2; --line: #303542; --accent: #8195ff; } }
    * { box-sizing: border-box; } body { margin: 0; min-height: 100vh; padding: 0; display: grid; place-items: center; overflow: auto; background: var(--panel); color: var(--text); font: 14px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", sans-serif; }
    main { width: 100%; min-height: 100vh; padding: 28px; text-align: center; background: var(--panel); }
    h1 { margin: 0 0 8px; font-size: 22px; } p { margin: 8px 0; color: var(--muted); } .qr { width: 260px; max-width: 100%; margin: 16px auto; padding: 10px; background: #fff; border-radius: 10px; } .qr svg { display: block; width: 100%; height: auto; } .value { padding: 9px 11px; margin-top: 12px; overflow-wrap: anywhere; border: 1px solid var(--line); border-radius: 9px; color: var(--text); font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; } .code { color: var(--accent); font-size: 25px; font-weight: 700; letter-spacing: .2em; } .hint { margin-top: 14px; font-size: 12px; } .close { width: 100%; margin-top: 18px; padding: 10px 14px; border: 0; border-radius: 9px; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer; } .close:hover { filter: brightness(.94); }
  </style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(instructions)}</p><div class="qr">${qrSvg}</div><div class="value">${escapeHtml(address)}</div><div class="value code">${escapeHtml(code)}</div><p class="hint">${escapeHtml(expiry)}</p><button id="close" class="close" type="button">${escapeHtml(close)}</button></main><script>document.getElementById('close').addEventListener('click', function () { window.dshDesktop.closeLanPairing(); });</script></body></html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(markup)}`
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
