/// <reference lib="dom" />
import { contextBridge, ipcRenderer } from 'electron'

let interactive = false
function setInteractive(next: boolean): void {
  if (interactive === next) return
  interactive = next
  ipcRenderer.send('whale-pet:interactive', next)
}
window.addEventListener('mousemove', event => {
  const target = document.elementFromPoint(event.clientX, event.clientY)
  setInteractive(target?.closest('.dshwv-root, .dshwv-menu') !== null && target !== null)
}, { passive: true })
window.addEventListener('mouseleave', () => setInteractive(false))
window.addEventListener('blur', () => setInteractive(false))
contextBridge.exposeInMainWorld('whalePet', {
  answerApproval: (outcome: string, id: string) => ipcRenderer.invoke('whale-pet:answer', outcome, id),
  focusMain: () => ipcRenderer.invoke('whale-pet:focus-main'),
  minimize: () => ipcRenderer.invoke('whale-pet:minimize'),
})
