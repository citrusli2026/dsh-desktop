import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { locatePackagedExecutable } from '../scripts/packaged-locator.mjs'

// The companion page has to be served by the real Harness (a plugin route), so
// this suite only runs against the packaged build with the bundled kernel.
const PACKAGED = process.env.DSH_E2E_PACKAGED === '1'

const FIXTURE_PLUGIN = `export function apply(ctx) {
  // Put the fixture behind the same connection fence as real plugin routes:
  // the companion probe must use the window session, not a bare Node fetch.
  ctx.inject(['webServer', 'connection'], (hostCtx) => {
    ctx.effect(() => hostCtx.webServer.register({
      kind: 'prefix',
      path: '/__companion-fixture',
      handler: (req, res) => {
        const rejection = hostCtx.connection.requestRejection(req)
        if (rejection) {
          res.statusCode = typeof rejection === 'number' ? rejection : 403
          res.end()
          return
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end('<!doctype html><html><head><title>Companion Fixture</title></head><body><h1 id="companion-fixture">companion ok</h1></body></html>')
      },
    }))
  })
}
`

async function seedProfile(home: string): Promise<void> {
  const profile = join(home, 'profiles', 'web')
  const fixture = join(profile, 'node_modules', 'companion-fixture')
  await mkdir(fixture, { recursive: true })
  await writeFile(join(fixture, 'package.json'), JSON.stringify({
    name: 'companion-fixture',
    version: '1.0.0',
    type: 'module',
    main: 'index.js',
    dsh: { companion: { route: '/__companion-fixture', width: 420, height: 320, title: 'Companion Fixture' } },
  }))
  await writeFile(join(fixture, 'index.js'), FIXTURE_PLUGIN)
  // A second declaration whose route is never served: the probe must refuse it.
  const missing = join(profile, 'node_modules', 'companion-missing')
  await mkdir(missing, { recursive: true })
  await writeFile(join(missing, 'package.json'), JSON.stringify({
    name: 'companion-missing',
    version: '1.0.0',
    dsh: { companion: { route: '/__companion-missing', width: 300, height: 240, title: 'Missing Companion' } },
  }))
  await writeFile(join(profile, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: companion-fixture',
    "      name: 'companion-fixture'",
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

test.describe('installed plugin companion windows', () => {
  test.skip(!PACKAGED, 'requires the packaged build with the real Harness')

  test('a declared companion opens on minimize, restores the shell and refuses a missing route @smoke', async () => {
    test.setTimeout(300_000)
    const root = await mkdtemp(join(tmpdir(), 'dsh-companion-e2e-'))
    const home = join(root, 'home')
    const userData = join(root, 'data')
    await mkdir(home, { recursive: true })
    await mkdir(userData, { recursive: true })
    await writeFile(join(home, 'settings.yaml'), 'locale:\n  preference: en\nui-theme:\n  preference: system\n')
    await writeFile(join(userData, 'shell-preferences.json'), '{"closeToTrayExplained":true,"whaleWidgetEnabled":false}\n')
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

      // Discovery is read-only and sees both declarations.
      const listed = await page.evaluate(() => (window as unknown as {
        dshDesktop: { listCompanions(): Promise<{ id: string }[]> }
      }).dshDesktop.listCompanions())
      expect(listed.map(item => item.id).sort()).toEqual(['companion-fixture', 'companion-missing'])

      // Minimizing shows the declared route only; the unserved one fails its probe.
      const pending = app.waitForEvent('window', { predicate: win => win.url().includes('__companion-fixture'), timeout: 60_000 })
      await minimizeMainWindow(app)
      const companion = await pending
      await expect(companion.locator('#companion-fixture')).toHaveText('companion ok')
      expect(companion.url()).toContain('__companion-fixture')

      // Click-through is a per-companion window flag the page asks for.
      const interactive = await companion.evaluate(async () => {
        const bridge = (window as unknown as {
          dshCompanion: { setInteractive(enabled: boolean): Promise<boolean> }
        }).dshCompanion
        return [await bridge.setInteractive(false), await bridge.setInteractive(true), await bridge.setInteractive('yes' as unknown as boolean)]
      })
      // Linux cannot forward moves to an ignoring window, so the shell keeps
      // the companion interactive there instead of offering click-through.
      const clickThrough = process.platform === 'linux' ? false : true
      expect(interactive).toEqual([clickThrough, true, false])

      // The bridge hides the companion and restores the main window.
      await companion.evaluate(() => (window as unknown as { dshCompanion: { focusMain(): Promise<boolean> } }).dshCompanion.focusMain())
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
        const main = BrowserWindow.getAllWindows().find(win => !win.webContents.getURL().includes('__companion-fixture'))
        return main?.isMinimized() ?? true
      }), { timeout: 15_000 }).toBe(false)
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
        const pet = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('__companion-fixture'))
        return pet?.isVisible() ?? false
      }), { timeout: 15_000 }).toBe(false)

      // The panel bridge can show it again on demand and hide it again.
      const shown = await page.evaluate(() => (window as unknown as {
        dshDesktop: { toggleCompanion(id: string): Promise<boolean> }
      }).dshDesktop.toggleCompanion('companion-fixture'))
      expect(shown).toBe(true)
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
        const pet = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('__companion-fixture'))
        return pet?.isVisible() ?? false
      }), { timeout: 15_000 }).toBe(true)

      // The real user path: open the desktop-tools panel and click the action.
      await page.locator('[data-dsh-controls-trigger]').click()
      const companionGroup = page.locator('[data-dsh-controls-group="companions"]')
      await expect(companionGroup).toBeVisible()
      const companionAction = companionGroup.getByRole('button', { name: /Companion Fixture/ })
      await companionAction.click()
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
        const pet = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('__companion-fixture'))
        return pet?.isVisible() ?? false
      }), { timeout: 15_000 }).toBe(false)
      await companionAction.click()
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
        const pet = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('__companion-fixture'))
        return pet?.isVisible() ?? false
      }), { timeout: 15_000 }).toBe(true)

      // No window ever appears for the unprobed route.
      expect(app.windows().some(win => win.url().includes('__companion-missing'))).toBe(false)
    } finally {
      await app.close().catch(() => {})
      await rm(root, { recursive: true, force: true })
    }
  })
})

const SLOW_FIXTURE_PLUGIN = `export function apply(ctx) {
  ctx.inject(['webServer'], (hostCtx) => {
    ctx.effect(() => hostCtx.webServer.register({
      kind: 'exact',
      path: '/__companion-slow',
      handler: async (req, res) => {
        await new Promise(resolve => setTimeout(resolve, 1500))
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end('<!doctype html><html><head><title>Slow Companion</title></head><body><h1 id="slow">slow ok</h1></body></html>')
      },
    }))
  })
}
`

async function seedSlowProfile(home: string): Promise<void> {
  const profile = join(home, 'profiles', 'web')
  const slow = join(profile, 'node_modules', 'companion-slow')
  await mkdir(slow, { recursive: true })
  await writeFile(join(slow, 'package.json'), JSON.stringify({
    name: 'companion-slow',
    version: '1.0.0',
    type: 'module',
    main: 'index.js',
    dsh: { companion: { route: '/__companion-slow', width: 360, height: 280, title: 'Slow Companion' } },
  }))
  await writeFile(join(slow, 'index.js'), SLOW_FIXTURE_PLUGIN)
  await writeFile(join(profile, 'cordis.patch.yml'), '- insert:\n    - id: companion-slow\n      name: companion-slow\n')
}

test('a late companion load never covers a restored main window', async () => {
  test.skip(!PACKAGED, 'requires the packaged build with the real Harness')
  test.setTimeout(180_000)
  const root = await mkdtemp(join(tmpdir(), 'dsh-companion-slow-'))
  const home = join(root, 'home')
  const userData = join(root, 'data')
  await mkdir(home, { recursive: true })
  await mkdir(userData, { recursive: true })
  await writeFile(join(home, 'settings.yaml'), 'locale:\n  preference: en\nui-theme:\n  preference: system\n')
  await writeFile(join(userData, 'shell-preferences.json'), '{"closeToTrayExplained":true,"whaleWidgetEnabled":false}\n')
  await seedSlowProfile(home)

  const app = await electron.launch({
    executablePath: await locatePackagedExecutable(),
    args: [`--user-data-dir=${userData}`],
    cwd: process.cwd(),
    env: { ...process.env, DSH_HOME: home },
  })
  try {
    const page = await app.firstWindow()
    await expect.poll(() => page.locator('[data-dsh-desktop-controls]').count(), { timeout: 180_000 }).toBe(1)

    const pending = app.waitForEvent('window', { predicate: win => win.url().includes('__companion-slow'), timeout: 60_000 })
    await minimizeMainWindow(app)
    const pet = await pending

    // Restore while loadURL is still waiting on the slow route; a late
    // showInactive() must not bring the companion back over the main window.
    await app.evaluate(({ BrowserWindow }) => {
      const main = BrowserWindow.getAllWindows().sort((left, right) => right.getBounds().width - left.getBounds().width)[0]
      main?.restore()
      main?.show()
      main?.focus()
    })

    // The window exists but is hidden while the route is still loading, so a
    // plain poll would return false immediately and miss a late showInactive().
    // Wait for the slow page to finish loading, then assert it stayed hidden.
    await pet.waitForLoadState('load')
    await expect(pet.locator('#slow')).toHaveText('slow ok')
    await page.waitForTimeout(750)
    expect(await app.evaluate(({ BrowserWindow }) => {
      const petWindow = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('__companion-slow'))
      return petWindow?.isVisible() ?? false
    })).toBe(false)
  } finally {
    await app.close().catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
})
