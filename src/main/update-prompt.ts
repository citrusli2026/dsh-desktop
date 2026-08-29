/** Windows auto-update setup and the unsigned-macOS check-only prompt. */
import { app, dialog, net, shell } from 'electron'
import electronUpdater from 'electron-updater'
import { isNewerVersion, latestPublishedRelease } from './update-check.ts'
import { shellText, type ShellLocale } from './locale.ts'

const { autoUpdater } = electronUpdater
const RELEASES_API_URL = 'https://api.github.com/repos/citrusli2026/dsh-desktop/releases?per_page=20'

/**
 * Optional GitHub token for the macOS update check. Unauthenticated requests
 * are rate-limited to 60/hour/IP, which is tight on shared NATs. Set
 * DSH_DESKTOP_GH_TOKEN in the environment (e.g. a fine-grained PAT with
 * public-read on the repo) to lift it. The token never leaves the update
 * check; it is not written to settings or sent anywhere else.
 */
function githubAuthHeaders(): Record<string, string> {
  const token = process.env.DSH_DESKTOP_GH_TOKEN
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-desktop' }
  if (token !== undefined && token !== '') headers.Authorization = `Bearer ${token}`
  return headers
}

export async function checkMacUpdate(manual: boolean, locale: ShellLocale): Promise<void> {
  try {
    // Bound the request: a black-holed connection must surface as the
    // failure dialog (manual checks), not a silently pending menu action.
    const response = await net.fetch(RELEASES_API_URL, { headers: githubAuthHeaders(), signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload: unknown = await response.json()
    const latest = latestPublishedRelease(payload)
    if (latest !== undefined && isNewerVersion(app.getVersion(), latest.version)) {
      const { response: choice } = await dialog.showMessageBox({
        type: 'info',
        title: shellText(locale, 'update.title'),
        message: shellText(locale, 'update.available', { version: latest.version }),
        detail: shellText(locale, 'update.macDetail', { current: app.getVersion() }),
        buttons: [shellText(locale, 'update.download'), shellText(locale, 'update.later')],
        defaultId: 0,
        cancelId: 1,
      })
      if (choice === 0) await shell.openExternal(latest.htmlUrl)
    } else if (manual) {
      await dialog.showMessageBox({
        type: 'info',
        title: shellText(locale, 'update.title'),
        message: shellText(locale, 'update.current'),
        detail: shellText(locale, 'update.currentDetail', { version: app.getVersion() }),
        buttons: [shellText(locale, 'common.ok')],
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`dsh-desktop: macOS update check failed: ${message}`)
    if (manual) await dialog.showMessageBox({
      type: 'warning',
      title: shellText(locale, 'update.title'),
      message: shellText(locale, 'update.failed'),
      detail: message,
      buttons: [shellText(locale, 'common.ok')],
    })
  }
}

export async function checkForUpdatesInteractively(locale: ShellLocale): Promise<void> {
  if (!app.isPackaged) {
    await dialog.showMessageBox({
      type: 'info',
      title: shellText(locale, 'update.title'),
      message: shellText(locale, 'update.title'),
      detail: shellText(locale, 'update.dev'),
      buttons: [shellText(locale, 'common.ok')],
    })
  } else if (process.platform === 'darwin') {
    await checkMacUpdate(true, locale)
  } else {
    try {
      const result = await autoUpdater.checkForUpdatesAndNotify()
      const candidate = result?.updateInfo.version
      if (candidate === undefined || !isNewerVersion(app.getVersion(), candidate)) {
        await dialog.showMessageBox({
          type: 'info',
          title: shellText(locale, 'update.title'),
          message: shellText(locale, 'update.current'),
          detail: shellText(locale, 'update.currentDetail', { version: app.getVersion() }),
          buttons: [shellText(locale, 'common.ok')],
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await dialog.showMessageBox({
        type: 'warning',
        title: shellText(locale, 'update.title'),
        message: shellText(locale, 'update.failed'),
        detail: message,
        buttons: [shellText(locale, 'common.ok')],
      })
    }
  }
}

export function configureAutoUpdates(smokeTest: boolean): void {
  if (!app.isPackaged || smokeTest || process.platform !== 'win32') return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-downloaded', () => console.log('dsh-desktop: update downloaded, will install on quit'))
  autoUpdater.on('error', error => console.warn(`dsh-desktop: update check failed: ${error.message}`))
  void autoUpdater.checkForUpdatesAndNotify().catch(() => {})
}
