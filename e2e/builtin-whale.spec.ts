import { test, expect, _electron as electron } from '@playwright/test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { locatePackagedExecutable } from '../scripts/packaged-locator.mjs'

/**
 * Built-in whale widget (ADR 0044): the vendored, unmodified 0.4.2 package is
 * mounted only while the desktop setting is on. The shell supplies the
 * companion descriptor and serves the adapter page, so the plugin itself needs
 * no `dsh.companion` field and no pet route. Safe Mode never mounts it.
 */
const PACKAGED = process.env.DSH_E2E_PACKAGED === '1'

async function launch(options: { whale?: boolean; safeMode?: boolean }) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-builtin-whale-'))
  const home = join(root, 'home')
  const userData = join(root, 'data')
  await mkdir(home, { recursive: true })
  await mkdir(userData, { recursive: true })
  await writeFile(join(home, 'settings.yaml'), 'locale:\n  preference: zh\nui-theme:\n  preference: light\n')
  await writeFile(join(home, '.dshw-size.json'), JSON.stringify({ scale: 0.6, sound: false }))
  const preferences: Record<string, unknown> = { closeToTrayExplained: true, firstRunGuideDismissed: true }
  if (options.whale !== undefined) preferences.whaleWidgetEnabled = options.whale
  if (options.safeMode === true) preferences.safeMode = true
  await writeFile(join(userData, 'shell-preferences.json'), JSON.stringify(preferences) + '\n')
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

  test('on by default: mounts the unmodified widget and hosts the shell adapter @smoke', async ({}, info) => {
    test.setTimeout(300_000)
    const { app, root } = await launch({})
    try {
      const page = await app.firstWindow()
      await expect.poll(() => page.locator('[data-dsh-desktop-controls]').count(), { timeout: 180_000 }).toBe(1)
      // The vendored plugin is mounted from the app's own closure.
      await expect(page.locator('.dshwv-root')).toBeVisible({ timeout: 120_000 })
      // The whale must stay above the app root (lowering z-index hides it and
      // makes clicks pass through) and use the saved scale, not a fixed one.
      expect(await page.locator('.dshwv-root').evaluate(el => getComputedStyle(el).zIndex)).toBe('9999')
      expect(await page.locator('.dshwv-root').evaluate(el => getComputedStyle(el).getPropertyValue('--dshw-scale').trim())).toBe('0.6')
      await page.locator('.dshwv-img').click()
      await expect(page.locator('.dshwv-menu')).toBeVisible()
      await page.keyboard.press('Escape')
      await page.screenshot({ path: info.outputPath('01-main-whale.png') })

      // A Harness dialog must not be blocked by the body-level whale.
      await page.getByRole('button', { name: /账号菜单|Account menu/ }).click()
      await page.getByText(/^(设置|Settings)$/, { exact: true }).first().click()
      await expect(page.locator('.dshwv-root')).toBeHidden()
      await page.keyboard.press('Escape')

      const pending = app.waitForEvent('window', { predicate: win => win.url().includes('/__dsh-desktop/whale-pet'), timeout: 120_000 })
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.minimize())
      const pet = await pending
      await expect(pet.locator('.dshwv-root')).toBeVisible({ timeout: 60_000 })
      await expect(pet.locator('#dsh-companion-hide')).toBeVisible()
      expect(pet.url()).toContain('dshCompanion=1')
      expect(await pet.locator('.dshwv-root').evaluate(el => getComputedStyle(el).getPropertyValue('--dshw-scale').trim())).toBe('0.6')
      await pet.screenshot({ path: info.outputPath('02-pet.png'), omitBackground: true })

      await pet.locator('#dsh-companion-hide').click()
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
        const main = BrowserWindow.getAllWindows().find(win => !win.webContents.getURL().includes('/__dsh-desktop/whale-pet'))
        return main?.isMinimized() ?? true
      }), { timeout: 20_000 }).toBe(false)
    } finally {
      await app.close().catch(() => {})
      await rm(root, { recursive: true, force: true })
    }
  })

  test('the settings toggle persists the choice and offers a restart @smoke', async ({}, info) => {
    test.setTimeout(300_000)
    const { app, root } = await launch({ whale: false })
    try {
      const page = await app.firstWindow()
      await expect.poll(() => page.locator('[data-dsh-desktop-controls]').count(), { timeout: 180_000 }).toBe(1)
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
      await group.screenshot({ path: info.outputPath('03-settings-toggle.png') })

      const toggle = group.locator('[data-dsh-whale-toggle] input')
      await toggle.click()
      await expect(toggle).toBeChecked({ timeout: 15_000 })
      await expect(group.locator('[data-dsh-whale-restart]')).toBeVisible()
      const saved = await page.evaluate(() => (window as unknown as {
        dshDesktop: { getDesktopPreferences(): Promise<{ whaleWidgetEnabled: boolean }> }
      }).dshDesktop.getDesktopPreferences())
      expect(saved.whaleWidgetEnabled).toBe(true)
    } finally {
      await app.close().catch(() => {})
      await rm(root, { recursive: true, force: true })
    }
  })

  test('disabled and Safe Mode never mount it @smoke', async ({}) => {
    test.setTimeout(300_000)
    for (const options of [{ whale: false }, { whale: true, safeMode: true }]) {
      const { app, root } = await launch(options)
      try {
        const page = await app.firstWindow()
        await expect.poll(() => page.locator('[data-dsh-desktop-controls]').count(), { timeout: 180_000 }).toBe(1)
        await page.waitForTimeout(8_000)
        expect(await page.locator('.dshwv-root').count()).toBe(0)
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
