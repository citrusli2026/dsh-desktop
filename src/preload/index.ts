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
import type { ProfilePackageStatus } from '../main/profile.ts'
import type { KernelOperationResult } from '../main/kernel-manager.ts'
import type { MarketInstallProgress, MarketInstallResult } from '../main/market-install.ts'
import type { DesktopHealthReport } from '../main/health-check.ts'

export interface DesktopTrashSession {
  projectKey: string
  sessionId: string
  dirPath: string
  archived: boolean
  modifiedAt: number
}

export interface DesktopTrashEntry {
  id: string
  kind: 'preset' | 'plugin' | 'kernel' | 'session' | 'file'
  name: string
  originPath: string
  deletedAt: number
  source?: string
}

export interface DesktopStartupStatus {
  appVersion: string
  dshHome: string
  userData: string
  harnessPhase: 'starting' | 'ready' | 'crashed'
  harnessStage?: 'launching' | 'waiting-for-ready' | 'retrying'
  retryInSeconds?: number
  statusLabel: string
  safeMode: boolean
  market: ProfilePackageStatus
}

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
  } else {
    // The native min/max/close overlay owns the top-right strip on Windows/Linux;
    // the kernel's session-header export capsule renders underneath it. The class
    // hash prefix changes per kernel release, so match the stable suffix only.
    // /export keeps the same download path when the capsule is hidden.
    const overlapGuard = document.createElement('style')
    overlapGuard.dataset.dshWindowControlsOverlapGuard = ''
    overlapGuard.textContent = `
      button[class*="sessionLogButton"] { display: none !important; }
    `
    document.head.append(overlapGuard)
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
  desktopAction: (action: 'startLanPairing' | 'stopLanPairing' | 'showAbout' | 'enterSafeMode' | 'exitSafeMode' | 'installDshMarket' | 'openRecharge' | 'kernelCheckUpdates' | 'kernelInstall' | 'kernelRestore'): Promise<boolean | MarketInstallResult | KernelOperationResult> =>
    ipcRenderer.invoke('desktop:action', action),
  /** Observe the four non-sensitive phases of a manual market install. */
  onMarketInstallProgress: (callback: (progress: MarketInstallProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: MarketInstallProgress): void => callback(progress)
    ipcRenderer.on('desktop:market-install-progress', listener)
    return () => ipcRenderer.removeListener('desktop:market-install-progress', listener)
  },
  /** Read the user profile's community-market state (settings row). */
  getBundledPlugins: (): Promise<{ dshMarket: ProfilePackageStatus; lastInstall?: MarketInstallResult } | null> =>
    ipcRenderer.invoke('desktop:bundled-plugins'),
  /** Read the compact first-launch and shell status summary. */
  getStartupStatus: (): Promise<DesktopStartupStatus | null> =>
    ipcRenderer.invoke('desktop:startup-status'),
  /** DeepSeek balance formatted for display; null when unavailable. */
  getBalance: (): Promise<{ balance: string } | null> =>
    ipcRenderer.invoke('desktop:balance'),
  /** Kernel overlay state (decision 0026). */
  getKernelState: (): Promise<{ bundledVersion?: string; overlayVersion?: string; failedVersions: string[]; installedVersions: string[]; latestVersion?: string; lastOperation?: KernelOperationResult } | null> =>
    ipcRenderer.invoke('desktop:kernel:state'),
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
  /** Run read-only local checks, plus optional network probes when opted in. */
  runHealthCheck: (options?: { includeNetwork?: boolean }): Promise<DesktopHealthReport | null> =>
    ipcRenderer.invoke('desktop:health-check', options ?? {}),
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
  /**
   * Update one failing plugin to the latest registry version and restart.
   * Resolves true when a version moved, 'current' when the installed version
   * is already the newest obtainable one, or false on failure.
   */
  updatePlugin: (name?: string): Promise<boolean | 'current'> => ipcRenderer.invoke('desktop:plugin:update', name),
  /** Remove one failing plugin from the boot bundle list and restart. */
  disablePlugin: (name: string): Promise<boolean> => ipcRenderer.invoke('desktop:plugin:disable', name),
  /** Open a prefilled, sanitized GitHub issue from the built-in error page. */
  openSupportIssue: (): Promise<boolean> => ipcRenderer.invoke('shell:open-support-issue'),
  /** List the desktop trash, newest first. */
  listTrash: (): Promise<DesktopTrashEntry[] | null> => ipcRenderer.invoke('desktop:trash:list'),
  /** Restore one trash entry to its origin (numbered sibling on conflict). */
  restoreTrash: (id: string): Promise<DesktopTrashEntry | null> => ipcRenderer.invoke('desktop:trash:restore', id),
  /** Purge one trash entry permanently. */
  purgeTrash: (id: string): Promise<boolean> => ipcRenderer.invoke('desktop:trash:purge', id),
  /** Purge every entry past the retention window; resolves to the count. */
  purgeExpiredTrash: (): Promise<number | null> => ipcRenderer.invoke('desktop:trash:purge-expired'),
  /** Delete one user preset into the desktop trash (restore moves it back). */
  deletePreset: (id: string): Promise<boolean> => ipcRenderer.invoke('desktop:presets:delete', id),
  /** List on-disk sessions with their archive flag, newest first. */
  listTrashSessions: (): Promise<DesktopTrashSession[] | null> => ipcRenderer.invoke('desktop:trash:sessions'),
  /**
   * Delete one session into the desktop trash. Resolves false for unknown
   * errors and 'active' when the WebUI still reports the session as running.
   */
  deleteTrashSession: (projectKey: string, sessionId: string): Promise<boolean | 'active' | null> =>
    ipcRenderer.invoke('desktop:trash:session-delete', projectKey, sessionId),
  /** Restore a trashed session and clear its archive flag. */
  restoreTrashSession: (trashId: string): Promise<boolean | null> => ipcRenderer.invoke('desktop:trash:session-restore', trashId),
  /** Remove one session id from the workspace archive set (show it again). */
  unarchiveSession: (sessionId: string): Promise<boolean | null> => ipcRenderer.invoke('desktop:trash:session-unarchive', sessionId),
})
