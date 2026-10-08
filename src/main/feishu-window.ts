import { BrowserWindow, nativeTheme } from 'electron'
import { join } from 'node:path'
import { shellText, type ShellLocale } from './locale.ts'
import { asDataUrl } from './shell-html.ts'
import { feishuSetupPageMarkup, type FeishuSetupPageState } from './feishu-page.ts'
import { hiddenTitleBarOptions } from './window-chrome.ts'

export interface FeishuSetupWindowController {
  update(state: FeishuSetupPageState): void
  show(): void
  close(): void
  isOpen(): boolean
}

let setupWindow: BrowserWindow | undefined

export function showFeishuSetupWindow(
  parent: BrowserWindow | undefined,
  locale: ShellLocale,
  onClosed: () => void,
): FeishuSetupWindowController {
  if (setupWindow !== undefined && !setupWindow.isDestroyed()) {
    setupWindow.show()
    setupWindow.focus()
    return controllerFor(setupWindow, locale)
  }

  const window = new BrowserWindow({
    width: 500,
    height: 650,
    minWidth: 460,
    minHeight: 600,
    resizable: false,
    show: false,
    modal: parent !== undefined,
    parent,
    center: true,
    title: shellText(locale, 'feishu.setupTitle'),
    ...hiddenTitleBarOptions(process.platform, nativeTheme.shouldUseDarkColors),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  setupWindow = window
  let closedByController = false
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (setupWindow === window) setupWindow = undefined
    if (!closedByController) onClosed()
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const controller = controllerFor(window, locale, () => { closedByController = true })
  controller.update({ stage: 'starting' })
  return controller
}

export function closeFeishuSetupWindow(): void {
  if (setupWindow !== undefined && !setupWindow.isDestroyed()) setupWindow.close()
  setupWindow = undefined
}

function controllerFor(window: BrowserWindow, locale: ShellLocale, markClosed?: () => void): FeishuSetupWindowController {
  let updateQueue = Promise.resolve()
  let latest: FeishuSetupPageState = { stage: 'starting' }
  return {
    update(state) {
      latest = state
      updateQueue = updateQueue.then(async () => {
        if (!window.isDestroyed()) await window.loadURL(asDataUrl(feishuSetupPageMarkup(locale, latest)))
      }).catch(() => undefined)
    },
    show() {
      if (!window.isDestroyed()) {
        window.show()
        window.focus()
      }
    },
    close() {
      if (!window.isDestroyed()) {
        markClosed?.()
        window.close()
      }
    },
    isOpen() {
      return !window.isDestroyed()
    },
  }
}
