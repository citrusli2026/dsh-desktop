/** Narrow sandboxed bridge for an installed plugin's companion window. */
/// <reference lib="dom" />
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('dshCompanion', {
  /** Hide this companion and bring the main window forward. */
  focusMain: (): Promise<boolean> => ipcRenderer.invoke('companion:focus-main'),
  /** Hide this companion without changing the main window. */
  hide: (): Promise<boolean> => ipcRenderer.invoke('companion:hide-self'),
})
