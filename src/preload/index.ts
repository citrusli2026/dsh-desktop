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
import type { DesktopPreferencesResult, DesktopPreferencesSnapshot, DesktopPreferencesUpdate } from '../main/desktop-preferences.ts'

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
  window.addEventListener('DOMContentLoaded', () => {
    installWindowDragRegion()
  }, { once: true })
} else {
  installWindowDragRegion()
}

contextBridge.exposeInMainWorld('dshDesktop', {
  /** Ask the main process to start the harness again. Resolves true on ready. */
  retryHarness: (): Promise<boolean> => ipcRenderer.invoke('harness:retry'),
  /** Enter (true) or exit (false) Safe Mode and restart the harness. */
  safeModeBoot: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('harness:safe-mode', enabled),
  /** Export a local diagnostic report from the built-in error page. */
  exportDiagnostics: (): Promise<boolean> => ipcRenderer.invoke('shell:export-diagnostics'),
  /** Reveal the shell's local logs directory from the built-in error page. */
  openLogsFolder: (): Promise<boolean> => ipcRenderer.invoke('shell:open-logs'),
  /** Close the shell-owned LAN pairing modal. */
  closeLanPairing: (): Promise<boolean> => ipcRenderer.invoke('shell:close-lan-pairing'),
  /** Invoke one of the fixed, low-risk desktop controls from the Harness UI. */
  desktopAction: (action: 'startLanPairing' | 'stopLanPairing' | 'showAbout' | 'enterSafeMode' | 'exitSafeMode' | 'installDshMarket'): Promise<boolean> =>
    ipcRenderer.invoke('desktop:action', action),
  /** Read which curated bundles the profile already carries (settings row). */
  getBundledPlugins: (): Promise<{ dshMarketInstalled: boolean } | null> =>
    ipcRenderer.invoke('desktop:bundled-plugins'),
  /** Read the LAN pairing state for the extension settings surface. */
  getLanState: (): Promise<{ running: boolean; busy: boolean } | null> =>
    ipcRenderer.invoke('desktop:lan:state'),
  /** Read shell-only preferences without exposing the settings file to Web UI. */
  getDesktopPreferences: (): Promise<DesktopPreferencesSnapshot | null> =>
    ipcRenderer.invoke('desktop:preferences:get'),
  /** Update one or more shell preferences through the allowlisted main handler. */
  updateDesktopPreferences: (patch: DesktopPreferencesUpdate): Promise<DesktopPreferencesResult | null> =>
    ipcRenderer.invoke('desktop:preferences:update', patch),
  /** Report only the Harness public session/job state used for desktop notices. */
  reportSessionStatus: (snapshot: unknown): Promise<boolean> =>
    ipcRenderer.invoke('desktop:session-status', snapshot),
  /** List user-writable agent presets for the settings surface. */
  listPresets: (): Promise<Array<{ id: string; name: string }> | null> =>
    ipcRenderer.invoke('desktop:presets:list'),
  /** Export one user preset as a .dshpreset file. */
  exportPreset: (id: string): Promise<{ saved: boolean; canceled?: boolean; name?: string } | null> =>
    ipcRenderer.invoke('desktop:presets:export', id),
  /** Pick a .dshpreset file and import it (trust warning + conflict flow). */
  importPreset: (): Promise<{ imported: boolean; canceled?: boolean; skipped?: boolean; invalid?: boolean; name?: string } | null> =>
    ipcRenderer.invoke('desktop:presets:import'),
  /** Failing-plugin suspects extracted from the last crash (recovery banner). */
  getRecoverySuspects: (): Promise<Array<{ id: string; name?: string }> | null> =>
    ipcRenderer.invoke('desktop:suspects:get'),
})
