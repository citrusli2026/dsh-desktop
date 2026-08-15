/**
 * Sandboxed preload: the only bridge the renderer gets, exposing the manual
 * harness retry used by the built-in error page. Everything else the UI needs
 * flows over the harness's own HTTP/WebSocket surface.
 * @module preload/index
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('dshDesktop', {
  /** Ask the main process to start the harness again. Resolves true on ready. */
  retryHarness: (): Promise<boolean> => ipcRenderer.invoke('harness:retry'),
  /** Export a local diagnostic report from the built-in error page. */
  exportDiagnostics: (): Promise<boolean> => ipcRenderer.invoke('shell:export-diagnostics'),
})
