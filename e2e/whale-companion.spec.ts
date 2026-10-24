import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { locatePackagedExecutable } from '../scripts/packaged-locator.mjs'

/**
 * Real-plugin release gate for the generic companion window.
 *
 * The plugin is third-party and the pet page is not on npm yet, so this suite
 * is opt-in: point WHALE_PLUGIN_DIR at a prepared dsh-whale-widget checkout
 * that has the `dsh.companion` declaration and the /dsh-whale/pet route.
 * The default companion suite covers the generic contract with fixtures.
 */
const PACKAGED = process.env.DSH_E2E_PACKAGED === '1'
const PLUGIN = process.env.WHALE_PLUGIN_DIR

async function seedProfile(home: string): Promise<void> {
  const profile = join(home, 'profiles', 'web')
  const dest = join(profile, 'node_modules', 'dsh-whale-widget')
  await mkdir(dest, { recursive: true })
  await cp(PLUGIN!, dest, { recursive: true })
  await writeFile(join(profile, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: dsh-whale-widget',
    '      name: dsh-whale-widget',
    '',
  ].join('\n'))
}

async function minimizeMainWindow(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows().sort((left, right) => right.getBounds().width - left.getBounds().width)
    const main = windows[0]
    if (main === undefined) throw new Error('main window missing')
    main.minimize()
  })
}

test.describe('real whale plugin companion', () => {
  test.skip(!PACKAGED || !PLUGIN, 'requires packaged shell and WHALE_PLUGIN_DIR')

  test('the whale pet survives minimize and restores from its own − button @smoke', async ({}, info) => {
    test.setTimeout(300_000)
    const root = await mkdtemp(join(tmpdir(), 'dsh-whale-e2e-'))
    const home = join(root, 'home')
    const userData = join(root, 'data')
    await mkdir(home, { recursive: true })
    await mkdir(userData, { recursive: true })
    await writeFile(join(home, 'settings.yaml'), 'locale:\n  preference: zh\nui-theme:\n  preference: light\n')
    await writeFile(join(userData, 'shell-preferences.json'), JSON.stringify({
      closeToTrayExplained: true,
      firstRunGuideDismissed: true,
    }) + '\n')
    await seedProfile(home)

    const app = await electron.launch({
      executablePath: await locatePackagedExecutable(),
      args: [`--user-data-dir=${userData}`],
      cwd: process.cwd(),
      env: { ...process.env, DSH_HOME: home },
    })
    try {
      const page = await app.firstWindow()
      await expect.poll(() => page.locator('[data-dsh-desktop-controls]').count(), { timeout: 180_000 }).toBe(1)

      // Discovery is read-only and sees the plugin's declaration.
      const listed = await page.evaluate(() => (window as unknown as {
        dshDesktop: { listCompanions(): Promise<{ id: string; route: string }[]> }
      }).dshDesktop.listCompanions())
      expect(listed).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'dsh-whale-widget', route: '/dsh-whale/pet' }),
      ]))
      await page.screenshot({ path: info.outputPath('01-main-with-whale.png') })

      // Minimizing opens the real page, not the main WebUI.
      const pending = app.waitForEvent('window', { predicate: win => win.url().includes('/dsh-whale/pet'), timeout: 120_000 })
      await minimizeMainWindow(app)
      const pet = await pending
      await expect.poll(() => pet.title(), { timeout: 30_000 }).toBe('小鲸鱼')
      await expect(pet.locator('.dshwv-root')).toBeVisible({ timeout: 30_000 })
      await expect(pet.locator('.dshwv-pet-min')).toBeVisible({ timeout: 30_000 })
      expect(pet.url()).toContain('dshCompanion=1')
      expect(pet.url()).toContain('dshwPet=1')
      await pet.screenshot({ path: info.outputPath('02-pet-window.png'), omitBackground: true })

      // Approvals are fail-closed: the pet cannot answer for the user, so the
      // action hands off to the main window where the real panel lives.
      const approval = await pet.evaluate(() => (window as unknown as {
        whalePet: { answerApproval(outcome: string, id: string): Promise<{ ok: boolean; reason?: string }> }
      }).whalePet.answerApproval('allowed-once', 'not-a-real-approval'))
      expect(approval.ok).toBe(false)
      expect(approval.reason).toBe('confirm-in-main')
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
        const main = BrowserWindow.getAllWindows().find(win => !win.webContents.getURL().includes('/dsh-whale/pet'))
        return main?.isMinimized() ?? true
      }), { timeout: 20_000 }).toBe(false)
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
        const petWindow = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/dsh-whale/pet'))
        return petWindow?.isVisible() ?? false
      }), { timeout: 20_000 }).toBe(false)
      await page.screenshot({ path: info.outputPath('03-restored.png') })

      // The panel lists the real plugin and reopens the companion on demand.
      await page.locator('[data-dsh-controls-trigger]').click()
      const group = page.locator('[data-dsh-controls-group="companions"]')
      await expect(group).toContainText('小鲸鱼')
      await group.scrollIntoViewIfNeeded()
      await group.screenshot({ path: info.outputPath('04-panel-companions.png') })
      const toggle = group.getByRole('button', { name: /小鲸鱼/ })
      await toggle.click()
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
        const petWindow = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/dsh-whale/pet'))
        return petWindow?.isVisible() ?? false
      }), { timeout: 20_000 }).toBe(true)

      // Click-through is the generic window flag the page asks for.
      const interactive = await pet.evaluate(async () => {
        const bridge = (window as unknown as { dshCompanion: { setInteractive(enabled: boolean): Promise<boolean> } }).dshCompanion
        return [await bridge.setInteractive(false), await bridge.setInteractive(true)]
      })
      expect(interactive).toEqual([true, true])

      // The pet's own − button is the bridge back to the main window.
      await pet.locator('.dshwv-pet-min').click()
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
        const main = BrowserWindow.getAllWindows().find(win => !win.webContents.getURL().includes('/dsh-whale/pet'))
        return main?.isMinimized() ?? true
      }), { timeout: 20_000 }).toBe(false)
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
        const petWindow = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/dsh-whale/pet'))
        return petWindow?.isVisible() ?? false
      }), { timeout: 20_000 }).toBe(false)
      await page.screenshot({ path: info.outputPath('05-panel-toggle.png') })
    } finally {
      await app.close().catch(() => {})
      await rm(root, { recursive: true, force: true })
    }
  })
})
