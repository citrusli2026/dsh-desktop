/** Small native window used to present a LAN pairing QR code. */
import { BrowserWindow } from 'electron'
import { shellText, type ShellLocale } from './locale.ts'
import type { LanPairing } from './lan.ts'

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
  const language = locale === 'zh' ? 'zh-CN' : 'en'
  const markup = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escapeHtml(title)}</title><style>
    :root { color-scheme: light dark; --bg: #f6f7fb; --panel: #fff; --text: #1e2230; --muted: #606878; --line: #e3e6ef; --accent: #4d6bfe; }
    @media (prefers-color-scheme: dark) { :root { --bg: #0f1117; --panel: #191c24; --text: #f5f6fa; --muted: #adb3c2; --line: #303542; --accent: #8195ff; } }
    * { box-sizing: border-box; } body { margin: 0; min-height: 100vh; padding: 28px; display: grid; place-items: center; background: var(--bg); color: var(--text); font: 14px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", sans-serif; }
    main { width: min(420px, 100%); padding: 28px; text-align: center; background: var(--panel); border: 1px solid var(--line); border-radius: 18px; box-shadow: 0 20px 60px rgba(30,34,48,.12); }
    h1 { margin: 0 0 10px; font-size: 22px; } p { margin: 8px 0; color: var(--muted); } .qr { width: 280px; max-width: 100%; margin: 20px auto; padding: 12px; background: #fff; border-radius: 10px; } .qr svg { display: block; width: 100%; height: auto; } .value { padding: 10px 12px; margin-top: 14px; overflow-wrap: anywhere; border: 1px solid var(--line); border-radius: 9px; color: var(--text); font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; } .code { color: var(--accent); font-size: 27px; font-weight: 700; letter-spacing: .2em; } .hint { margin-top: 18px; font-size: 12px; }
  </style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(instructions)}</p><div class="qr">${qrSvg}</div><div class="value">${escapeHtml(address)}</div><div class="value code">${escapeHtml(code)}</div><p class="hint">${escapeHtml(expiry)}</p></main></body></html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(markup)}`
}

export function showLanPairingWindow(parent: BrowserWindow | undefined, pairing: LanPairing, qrSvg: string, locale: ShellLocale): BrowserWindow {
  const window = new BrowserWindow({
    width: 470,
    height: 650,
    minWidth: 420,
    minHeight: 580,
    resizable: false,
    show: false,
    modal: parent !== undefined,
    parent,
    title: shellText(locale, 'lan.qrTitle'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  void window.loadURL(page(pairing, qrSvg, locale))
  return window
}
