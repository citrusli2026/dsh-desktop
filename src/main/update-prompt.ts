/** Platform update setup and the unsigned-macOS check-only prompt. */
import { app, dialog, net, shell } from 'electron'
import electronUpdater from 'electron-updater'
import { isNewerVersion, latestPublishedVersion } from './update-check.ts'

const { autoUpdater } = electronUpdater
const RELEASES_API_URL = 'https://api.github.com/repos/citrusli2026/dsh-electron-shell/releases?per_page=20'
const RELEASES_PAGE_URL = 'https://github.com/citrusli2026/dsh-electron-shell/releases/latest'

export async function checkMacUpdate(manual: boolean): Promise<void> {
  try {
    const response = await net.fetch(RELEASES_API_URL, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-desktop' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload: unknown = await response.json()
    const latest = latestPublishedVersion(payload) ?? ''
    if (latest !== '' && isNewerVersion(app.getVersion(), latest)) {
      const { response: choice } = await dialog.showMessageBox({
        type: 'info',
        message: `发现新版本 v${latest}`,
        detail: `当前版本 v${app.getVersion()}。macOS 版暂未签名,没有自动更新(决策 0004);请下载新版手动覆盖安装。`,
        buttons: ['前往下载', '稍后'],
        defaultId: 0,
        cancelId: 1,
      })
      if (choice === 0) void shell.openExternal(RELEASES_PAGE_URL)
    } else if (manual) {
      await dialog.showMessageBox({ type: 'info', message: '已是最新版本', detail: `当前版本 v${app.getVersion()}。`, buttons: ['好'] })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`dsh-desktop: macOS update check failed: ${message}`)
    if (manual) await dialog.showMessageBox({ type: 'warning', message: '检查更新失败', detail: message, buttons: ['好'] })
  }
}

export async function checkForUpdatesInteractively(): Promise<void> {
  if (!app.isPackaged) {
    await dialog.showMessageBox({ type: 'info', message: '检查更新', detail: '开发模式没有更新源。', buttons: ['好'] })
  } else if (process.platform === 'darwin') {
    await checkMacUpdate(true)
  } else {
    await autoUpdater.checkForUpdatesAndNotify()
  }
}

export function configureAutoUpdates(smokeTest: boolean): void {
  if (!app.isPackaged || smokeTest || process.platform === 'darwin') return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-downloaded', () => console.log('dsh-desktop: update downloaded, will install on quit'))
  autoUpdater.on('error', error => console.warn(`dsh-desktop: update check failed: ${error.message}`))
  void autoUpdater.checkForUpdatesAndNotify().catch(() => {})
}
