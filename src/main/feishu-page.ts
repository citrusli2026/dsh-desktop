import { shellText, type ShellLocale } from './locale.ts'
import { escapeHtml } from './shell-html.ts'

export type FeishuSetupPageStage = 'starting' | 'waiting-for-scan' | 'completed' | 'error'

export interface FeishuSetupPageState {
  stage: FeishuSetupPageStage
  qrDataUrl?: string
}

export function feishuSetupPageMarkup(locale: ShellLocale, state: FeishuSetupPageState): string {
  const language = locale === 'zh' ? 'zh-CN' : 'en'
  const title = shellText(locale, 'feishu.setupTitle')
  const instructions = shellText(locale, 'feishu.setupInstructions')
  const status = shellText(locale, state.stage === 'starting'
    ? 'feishu.starting'
    : state.stage === 'waiting-for-scan'
      ? 'feishu.waiting'
      : state.stage === 'completed'
        ? 'feishu.completed'
        : 'feishu.failed')
  const qr = state.qrDataUrl === undefined
    ? `<div class="placeholder" aria-label="${escapeHtml(status)}"></div>`
    : `<img class="qr" alt="${escapeHtml(title)}" src="${escapeHtml(state.qrDataUrl)}">`
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${escapeHtml(title)}</title><style>
    :root { color-scheme: light dark; --bg: #f6f7fb; --panel: #fff; --text: #1e2230; --muted: #606878; --line: #e3e6ef; --accent: #4d6bfe; }
    @media (prefers-color-scheme: dark) { :root { --bg: #0f1117; --panel: #191c24; --text: #f5f6fa; --muted: #adb3c2; --line: #303542; --accent: #8195ff; } }
    * { box-sizing: border-box; } body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--text); font: 14px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", sans-serif; }
    main { width: min(440px, 100%); min-height: 100vh; padding: 30px 28px 24px; display: flex; flex-direction: column; align-items: center; text-align: center; background: var(--panel); } h1 { margin: 4px 0 8px; font-size: 22px; } p { margin: 8px 0; color: var(--muted); } .qr-shell { width: 300px; height: 300px; max-width: 100%; margin: 22px 0 18px; display: grid; place-items: center; padding: 14px; background: #fff; border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 12px 30px rgb(0 0 0 / 8%); } .qr { display: block; width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; } .placeholder { width: 32px; height: 32px; border: 3px solid #d8dded; border-top-color: var(--accent); border-radius: 50%; animation: spin 1s linear infinite; } .status { min-height: 28px; color: var(--text); font-weight: 600; } button { width: 100%; margin-top: auto; padding: 10px 14px; border: 0; border-radius: 9px; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer; } @keyframes spin { to { transform: rotate(360deg); } }
  </style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(instructions)}</p><div class="qr-shell">${qr}</div><p class="status">${escapeHtml(status)}</p><button type="button" onclick="window.close()">${escapeHtml(shellText(locale, 'feishu.close'))}</button></main></body></html>`
}
