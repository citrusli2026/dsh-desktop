/** Settings window for vision plugin configuration. */
import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { shellText, type ShellLocale } from './locale.ts'
import { getVisionPluginInfo } from './vision.ts'

let settingsWindow: BrowserWindow | undefined

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!)
}

function settingsPage(locale: ShellLocale): string {
  const vision = getVisionPluginInfo()
  const title = locale === 'zh' ? 'dsh-desktop 设置' : 'dsh-desktop Settings'
  const lang = locale === 'zh' ? 'zh-CN' : 'en'

  const visionTitle = locale === 'zh' ? '视觉能力' : 'Vision'
  const visionDesc = locale === 'zh'
    ? 'ModLens 是预装的视觉识别插件，让纯文本模型能够理解图片内容。在对话中粘贴图片即可自动识别。'
    : 'ModLens is a pre-installed vision plugin that gives text-only models the ability to understand images. Paste an image in chat to use it automatically.'
  const statusLabel = locale === 'zh' ? '状态' : 'Status'
  const versionLabel = locale === 'zh' ? '版本' : 'Version'
  const descLabel = locale === 'zh' ? '功能' : 'Description'
  const installedText = locale === 'zh' ? '已安装' : 'Installed'
  const notInstalledText = locale === 'zh' ? '未安装（运行 pnpm run bootstrap 安装）' : 'Not installed (run pnpm run bootstrap)'
  const usageTitle = locale === 'zh' ? '使用方法' : 'How to use'
  const usageSteps = locale === 'zh'
    ? '<li>在对话中粘贴图片（Ctrl/Cmd+V）</li><li>或输入图片路径，如 <code>./screenshot.png</code></li><li>AI 会自动调用 modlens_read_image 识别图片内容</li><li>需要配置视觉引擎（首次使用时会提示）</li>'
    : '<li>Paste an image in chat (Ctrl/Cmd+V)</li><li>Or type an image path, e.g. <code>./screenshot.png</code></li><li>AI will automatically call modlens_read_image to analyze the image</li><li>Vision engine configuration required (prompted on first use)</li>'
  const engineTitle = locale === 'zh' ? '视觉引擎配置' : 'Vision Engine Configuration'
  const engineDesc = locale === 'zh'
    ? 'ModLens 支持多种视觉引擎。首次使用时，在 Harness 设置中配置 API Key 和模型。推荐使用免费的 Gemini API。'
    : 'ModLens supports multiple vision engines. On first use, configure the API Key and model in Harness settings. Free Gemini API is recommended.'
  const geminiLink = locale === 'zh' ? '获取免费 Gemini API Key' : 'Get free Gemini API Key'

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><title>${escapeHtml(title)}</title><style>
    :root { color-scheme: light dark; --bg: #f6f7fb; --panel: #fff; --text: #1e2230; --muted: #606878; --line: #e3e6ef; --accent: #4d6bfe; --success: #22c55e; --warning: #f59e0b; }
    @media (prefers-color-scheme: dark) { :root { --bg: #0f1117; --panel: #191c24; --text: #f5f6fa; --muted: #adb3c2; --line: #303542; --accent: #8195ff; --success: #4ade80; --warning: #fbbf24; } }
    * { box-sizing: border-box; } body { margin: 0; min-height: 100vh; padding: 24px; background: var(--bg); color: var(--text); font: 14px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", sans-serif; }
    .container { max-width: 560px; margin: 0 auto; }
    h1 { font-size: 20px; margin: 0 0 24px; }
    h2 { font-size: 16px; margin: 24px 0 12px; color: var(--accent); }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
    .status { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px; font-size: 13px; font-weight: 600; }
    .status--ok { background: rgba(34,197,94,0.12); color: var(--success); }
    .status--warn { background: rgba(245,158,11,0.12); color: var(--warning); }
    .meta { display: grid; grid-template-columns: 100px 1fr; gap: 8px 12px; font-size: 13px; }
    .meta dt { color: var(--muted); } .meta dd { margin: 0; }
    ol { padding-left: 20px; margin: 8px 0; } ol li { margin: 4px 0; }
    code { background: var(--line); padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    a { color: var(--accent); }
  </style></head><body><div class="container">
    <h1>${escapeHtml(title)}</h1>

    <h2>${escapeHtml(visionTitle)}</h2>
    <div class="card">
      <p>${escapeHtml(visionDesc)}</p>
      <dl class="meta">
        <dt>${escapeHtml(statusLabel)}</dt>
        <dd><span class="status ${vision.installed ? 'status--ok' : 'status--warn'}">${vision.installed ? escapeHtml(installedText) : escapeHtml(notInstalledText)}</span></dd>
        <dt>${escapeHtml(versionLabel)}</dt>
        <dd>${escapeHtml(vision.version)}</dd>
        <dt>${escapeHtml(descLabel)}</dt>
        <dd>${escapeHtml(vision.description)}</dd>
      </dl>
    </div>

    <h2>${escapeHtml(usageTitle)}</h2>
    <div class="card">
      <ol>${usageSteps}</ol>
    </div>

    <h2>${escapeHtml(engineTitle)}</h2>
    <div class="card">
      <p>${escapeHtml(engineDesc)}</p>
      <p><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">${escapeHtml(geminiLink)} ↗</a></p>
    </div>
  </div></body></html>`
}

export function showSettingsWindow(parent: BrowserWindow | undefined, locale: ShellLocale): BrowserWindow {
  if (settingsWindow !== undefined && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return settingsWindow
  }
  const window = new BrowserWindow({
    width: 600,
    height: 520,
    minWidth: 480,
    minHeight: 400,
    resizable: true,
    show: false,
    modal: parent !== undefined,
    parent,
    center: true,
    title: locale === 'zh' ? 'dsh-desktop 设置' : 'dsh-desktop Settings',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  settingsWindow = window
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (settingsWindow === window) settingsWindow = undefined
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(settingsPage(locale))}`)
  return window
}

export function closeSettingsWindow(): void {
  if (settingsWindow !== undefined && !settingsWindow.isDestroyed()) settingsWindow.close()
  settingsWindow = undefined
}
