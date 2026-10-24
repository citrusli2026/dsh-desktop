import { test, expect, _electron as electron } from '@playwright/test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { locatePackagedExecutable } from '../scripts/packaged-locator.mjs'

/**
 * Built-in whale widget (ADR 0044): the vendored package ships inside the app
 * and is mounted only when the desktop setting is on. Off by default, and Safe
 * Mode must keep it out entirely.
 */
const PACKAGED = process.env.DSH_E2E_PACKAGED === '1'

async function launch(options: { whale: boolean; safeMode?: boolean }) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-builtin-whale-'))
  const home = join(root, 'home')
  const userData = join(root, 'data')
  await mkdir(home, { recursive: true })
  await mkdir(userData, { recursive: true })
  await writeFile(join(home, 'settings.yaml'), 'locale:\n  preference: zh\nui-theme:\n  preference: light\n')
  await writeFile(join(userData, 'shell-preferences.json'), JSON.stringify({
    closeToTrayExplained: true,
    firstRunGuideDismissed: true,
    whaleWidgetEnabled: options.whale,
    safeMode: options.safeMode === true,
  }) + '\n')
  const app = await electron.launch({
    executablePath: await locatePackagedExecutable(),
    args: [`--user-data-dir=${userData}`],
    cwd: process.cwd(),
    env: { ...process.env, DSH_HOME: home },
  })
  return { app, root }
}

test.describe('built-in whale widget', () => {
  test.skip(!PACKAGED, 'requires the packaged build')

  test('the settings toggle installs, restarts, and keeps the pet on minimize @smoke', async ({}, info) => {
    test.setTimeout(300_000)
    const { app, root } = await launch({ whale: false })
    try {
      const page = await app.firstWindow()
      await expect.poll(() => page.locator('[data-dsh-desktop-controls]').count(), { timeout: 180_000 }).toBe(1)
      // Off by default: no whale before the user opts in.
      expect(await page.locator('.dshwv-root').count()).toBe(0)

      await page.getByRole('button', { name: /账号菜单|Account menu/ }).click()
      await page.getByText(/^(设置|Settings)$/, { exact: true }).first().click()
      const settings = page.getByRole('dialog', { name: /^(设置|Settings)$/ })
      await settings.getByText('桌面设置', { exact: true }).click()
      const group = page.locator('section[data-dsh-desktop-group="extensions"]')
      await expect(group).toBeVisible()
      await group.scrollIntoViewIfNeeded()
      await expect(group).toContainText('小鲸鱼桌宠')
      await expect(group).toContainText('MeteorNOX')
      await group.screenshot({ path: info.outputPath('01-settings-toggle.png') })

      const toggle = group.locator('[data-dsh-whale-toggle] input')
      await expect(toggle).not.toBeChecked()
      await toggle.click()
      await expect(toggle).toBeChecked({ timeout: 15_000 })
      await expect(group.locator('[data-dsh-whale-restart]')).toBeVisible()
      // The restart path asks for native confirmation; accept it in-process.
      await app.evaluate(({ dialog }) => {
        (dialog as unknown as { showMessageBox: unknown }).showMessageBox = async () => ({ response: 0, checkboxChecked: false })
      })
      await group.locator('[data-dsh-whale-restart]').click()

      // The restart remounts Harness with the vendored package.
      await expect(page.locator('.dshwv-root')).toBeVisible({ timeout: 180_000 })
      await page.screenshot({ path: info.outputPath('02-main-whale.png') })

      const pending = app.waitForEvent('window', { predicate: win => win.url().includes('/dsh-whale/pet'), timeout: 120_000 })
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.minimize())
      const pet = await pending
      await expect(pet.locator('.dshwv-pet-min')).toBeVisible({ timeout: 60_000 })
      expect(pet.url()).toContain('dshCompanion=1')
      await pet.screenshot({ path: info.outputPath('03-pet.png'), omitBackground: true })

      await pet.locator('.dshwv-pet-min').click()
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
        const main = BrowserWindow.getAllWindows().find(win => !win.webContents.getURL().includes('/dsh-whale/pet'))
        return main?.isMinimized() ?? true
      }), { timeout: 20_000 }).toBe(false)
    } finally {
      await app.close().catch(() => {})
      await rm(root, { recursive: true, force: true })
    }
  })

  test('disabled and Safe Mode never mount it', async ({}) => {
    test.setTimeout(300_000)
    for (const options of [{ whale: false }, { whale: true, safeMode: true }]) {
      const { app, root } = await launch(options)
      try {
        const page = await app.firstWindow()
        await expect.poll(() => page.locator('[data-dsh-desktop-controls]').count(), { timeout: 180_000 }).toBe(1)
        await page.waitForTimeout(8_000)
        expect(await page.locator('.dshwv-root').count()).toBe(0)
        // No companion should be offered either.
        const listed = await page.evaluate(() => (window as unknown as {
          dshDesktop: { listCompanions(): Promise<{ id: string }[]> }
        }).dshDesktop.listCompanions())
        expect(listed.map(item => item.id)).not.toContain('dsh-whale-widget')
      } finally {
        await app.close().catch(() => {})
        await rm(root, { recursive: true, force: true })
      }
    }
  })
})
