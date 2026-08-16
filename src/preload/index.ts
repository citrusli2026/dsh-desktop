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

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', installWindowDragRegion, { once: true })
} else {
  installWindowDragRegion()
}

contextBridge.exposeInMainWorld('dshDesktop', {
  /** Ask the main process to start the harness again. Resolves true on ready. */
  retryHarness: (): Promise<boolean> => ipcRenderer.invoke('harness:retry'),
  /** Export a local diagnostic report from the built-in error page. */
  exportDiagnostics: (): Promise<boolean> => ipcRenderer.invoke('shell:export-diagnostics'),
  /** Close the shell-owned LAN pairing modal. */
  closeLanPairing: (): Promise<boolean> => ipcRenderer.invoke('shell:close-lan-pairing'),
})
