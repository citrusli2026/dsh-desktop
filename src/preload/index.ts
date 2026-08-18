/**
 * Sandboxed preload: the only bridge the renderer gets, exposing the manual
 * harness retry used by the built-in error page. It also installs the narrow,
 * transparent drag handle required by the hidden native title bar. Everything
 * else the UI needs flows over the harness's own HTTP/WebSocket surface.
 * @module preload/index
 */
/// <reference lib="dom" />
import { contextBridge, ipcRenderer } from 'electron'
import { MACOS_SIDEBAR_COLLAPSED_SAFE_TOP, MACOS_SIDEBAR_SAFE_TOP } from '../main/window-chrome.ts'

function installWindowDragRegion(): void {
  if (document.querySelector('[data-dsh-window-drag-region]') !== null) return
  const region = document.createElement('div')
  region.dataset.dshWindowDragRegion = ''
  region.setAttribute('aria-hidden', 'true')
  const fallbackLeft = process.platform === 'darwin' ? '78px' : '0px'
  const fallbackWidth = process.platform === 'darwin' ? 'calc(100% - 78px)' : '100%'
  Object.assign(region.style, {
    position: 'fixed',
    top: '0',
    height: '24px',
    zIndex: '2147483647',
    background: 'transparent',
    userSelect: 'none',
  })
  region.style.setProperty('left', `env(titlebar-area-x, ${fallbackLeft})`)
  region.style.setProperty('width', `env(titlebar-area-width, ${fallbackWidth})`)
  region.style.setProperty('-webkit-app-region', 'drag')
  region.style.setProperty('app-region', 'drag')
  document.body.append(region)

  if (process.platform === 'darwin') {
    const safeInset = document.createElement('style')
    safeInset.dataset.dshMacosSidebarSafeInset = ''
    safeInset.textContent = `
      [data-slot="sidebar"] > :first-child { padding-top: ${MACOS_SIDEBAR_SAFE_TOP}px !important; }
      [data-slot="sidebar"] > :first-child[class*="collapsed"] {
        padding-top: ${MACOS_SIDEBAR_COLLAPSED_SAFE_TOP}px !important;
      }
    `
    document.head.append(safeInset)
  }
}

function installVisionGuideCard(): void {
  // This code runs in the preload's isolated world, where the contextBridge
  // surface exposed to page scripts is not visible, so talk to the main
  // process through ipcRenderer directly.
  const isZh = (document.documentElement.lang || '').toLowerCase().startsWith('zh')
  const title = isZh ? '视觉引擎未配置' : 'Vision engine not configured'
  const body = isZh ? '点击配置，约 1 分钟' : 'Click to configure in about a minute'
  const buttonLabel = isZh ? '去配置' : 'Configure'

  function showCard(): void {
    if (document.querySelector('[data-dsh-vision-guide-card]') !== null) return
    const card = document.createElement('div')
    card.dataset.dshVisionGuideCard = ''
    Object.assign(card.style, {
      position: 'fixed',
      left: '16px',
      bottom: '16px',
      zIndex: '2147483646',
      maxWidth: '320px',
      padding: '12px 14px',
      background: 'var(--panel, #ffffff)',
      color: 'var(--text, #1e2230)',
      border: '1px solid var(--line, #e3e6ef)',
      borderRadius: '12px',
      boxShadow: '0 8px 24px rgba(0,0,0,.12)',
      font: '13px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", sans-serif',
    })
    const strong = document.createElement('strong')
    strong.textContent = title
    strong.style.display = 'block'
    const desc = document.createElement('span')
    desc.textContent = body
    desc.style.display = 'block'
    desc.style.margin = '4px 0 8px'
    desc.style.color = 'var(--muted, #606878)'
    const button = document.createElement('button')
    button.textContent = buttonLabel
    Object.assign(button.style, {
      padding: '6px 12px',
      border: '0',
      borderRadius: '8px',
      background: 'var(--accent, #4d6bfe)',
      color: '#fff',
      fontWeight: '600',
      cursor: 'pointer',
    })
    button.addEventListener('click', () => {
      void ipcRenderer.invoke('shell:open-vision-settings')
      card.remove()
    })
    card.append(strong, desc, button)
    document.body.append(card)
  }

  window.addEventListener('paste', (event) => {
    const types = Array.from(event.clipboardData?.types ?? [])
    const hasImage = types.includes('Files') || types.some(type => type.startsWith('image/'))
    if (!hasImage) return
    ipcRenderer.invoke('shell:vision-needs-guide').then(needs => {
      if (needs) showCard()
    }).catch(() => {})
  })
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    installWindowDragRegion()
    installVisionGuideCard()
  }, { once: true })
} else {
  installWindowDragRegion()
  installVisionGuideCard()
}

contextBridge.exposeInMainWorld('dshDesktop', {
  /** Ask the main process to start the harness again. Resolves true on ready. */
  retryHarness: (): Promise<boolean> => ipcRenderer.invoke('harness:retry'),
  /** Export a local diagnostic report from the built-in error page. */
  exportDiagnostics: (): Promise<boolean> => ipcRenderer.invoke('shell:export-diagnostics'),
  /** Close the shell-owned LAN pairing modal. */
  closeLanPairing: (): Promise<boolean> => ipcRenderer.invoke('shell:close-lan-pairing'),
  /** Close the shell-owned settings window. */
  closeSettings: (): Promise<boolean> => ipcRenderer.invoke('shell:close-settings'),
  /** Proxy a fetch to the dsh harness modlens config endpoint. */
  modlensConfig: (method: string, body?: string): Promise<{ status: number; data: unknown }> =>
    ipcRenderer.invoke('shell:modlens-config', method, body),
  /** Whether the first-run vision setup guide should still be shown. */
  visionNeedsGuide: (): Promise<boolean> => ipcRenderer.invoke('shell:vision-needs-guide'),
  /** Open the vision settings window from the main window inline guide. */
  openVisionSettings: (): Promise<boolean> => ipcRenderer.invoke('shell:open-vision-settings'),
  /** Mark the first-run vision guide as completed. */
  completeVisionGuide: (): Promise<boolean> => ipcRenderer.invoke('shell:vision-guide-complete'),
  /** Run a real ModLens recognition against the bundled sample image. */
  testVision: (): Promise<{ ok: boolean; result?: unknown; error?: string; hints?: unknown[] }> =>
    ipcRenderer.invoke('shell:vision-test'),
  /** Run the local-only ModLens diagnostic and return its text report. */
  visionDoctor: (): Promise<{ ok: boolean; report?: string; error?: string }> =>
    ipcRenderer.invoke('shell:vision-doctor'),
})
