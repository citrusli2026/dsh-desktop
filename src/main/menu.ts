/** Native application menu and the cross-platform community About surface. */
import { app, dialog, Menu, nativeImage, shell } from 'electron'
import { join } from 'node:path'
import { shellText, type ShellLocale } from './locale.ts'
import { buildAppMenuTemplate, type MenuActions } from './menu-template.ts'
import {
  COMMUNITY_WEBSITE_URL,
  DEEPSEEK_HARNESS_URL,
  DEEPSEEK_OFFICIAL_URL,
  PROJECT_REPO_URL,
} from './links.ts'
import { splitCompositeVersion } from './update-check.ts'

function aboutDetail(locale: ShellLocale): string {
  const version = app.getVersion()
  const composite = splitCompositeVersion(version)
  const lines = [shellText(locale, 'about.version', { version })]
  if (composite !== undefined) {
    lines.push(shellText(locale, 'about.harnessVersion', {
      version: composite.dsh,
      revision: composite.shellRev,
    }))
  }
  lines.push(
    `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
    '',
    shellText(locale, 'about.community'),
    shellText(locale, 'about.unaffiliated'),
    shellText(locale, 'about.license'),
  )
  return lines.join('\n')
}

function iconImage(): Electron.NativeImage {
  return nativeImage.createFromPath(join(app.getAppPath(), 'build', 'icon.png'))
}

/** A consistent About dialog whose actions establish community and official provenance. */
export async function showAboutDialog(locale: ShellLocale): Promise<void> {
  const links = [
    COMMUNITY_WEBSITE_URL,
    PROJECT_REPO_URL,
    DEEPSEEK_HARNESS_URL,
    DEEPSEEK_OFFICIAL_URL,
  ] as const
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: shellText(locale, 'about.title'),
    message: 'dsh-desktop',
    detail: aboutDetail(locale),
    icon: iconImage(),
    buttons: [
      shellText(locale, 'about.communityWebsite'),
      shellText(locale, 'about.projectRepository'),
      shellText(locale, 'about.harnessOfficial'),
      shellText(locale, 'about.deepseekOfficial'),
      shellText(locale, 'common.close'),
    ],
    defaultId: 4,
    cancelId: 4,
    noLink: true,
  })
  const target = links[response]
  if (target !== undefined) await shell.openExternal(target)
}

export function installAppMenu(
  locale: ShellLocale,
  actions: MenuActions,
  restartEnabled = true,
  lanRunning = false,
  lanBusy = false,
  shortcutAccelerator?: string,
): void {
  const template = buildAppMenuTemplate({
    locale,
    platform: process.platform,
    packaged: app.isPackaged,
    appName: app.name,
    restartEnabled,
    lanRunning,
    lanBusy,
    shortcutAccelerator,
  }, actions)
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
