import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

interface Fixture {
  electronApp: ElectronApplication
  window: Page
  settingsPath: string
}

const shellTest = test.extend<Fixture>({
  electronApp: async ({}, use, testInfo) => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-e2e-'))
    const dshHome = join(root, 'dsh-home')
    const userData = join(root, 'electron-data')
    await mkdir(dshHome, { recursive: true })
    await mkdir(userData, { recursive: true })
    await writeFile(join(dshHome, 'settings.yaml'), 'locale:\n  preference: en\nui-theme:\n  preference: system\n')
    await writeFile(join(userData, 'shell-preferences.json'), '{"closeToTrayExplained":true}\n')

    const server: Server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end('<!doctype html><html lang="en"><head><title>Stub Harness</title></head><body><div data-slot="sidebar"><aside>Brand</aside></div><main><h1>Harness test workspace</h1><input aria-label="Prompt"></main></body></html>')
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('test server did not bind a TCP port')

    const app = await electron.launch({
      // Linux CI runners lack the setuid sandbox helper, so the Chromium
      // sandbox has to be disabled there; dev machines keep it enabled.
      args: ['.', ...(process.platform === 'linux' ? ['--no-sandbox'] : []), `--user-data-dir=${userData}`],
      cwd: process.cwd(),
      env: {
        ...process.env,
        DSH_HOME: dshHome,
        DSH_DESKTOP_DEV_WEB_URL: `http://127.0.0.1:${address.port}`,
      },
    })
    await use(app)

    if (testInfo.status !== testInfo.expectedStatus) {
      const page = app.windows()[0]
      if (page !== undefined) await page.screenshot({ path: testInfo.outputPath('window.png') }).catch(() => {})
    }
    await app.close().catch(() => {})
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await use(window)
  },

  settingsPath: async ({ electronApp }, use) => {
    const path = await electronApp.evaluate(() => (
      `${process.env.DSH_HOME}${process.platform === 'win32' ? '\\' : '/'}settings.yaml`
    ))
    await use(path)
  },
})

async function menuLabels(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(({ Menu }) => {
    const collect = (items: Electron.MenuItem[]): string[] => items.flatMap(item => [
      item.label,
      ...(item.submenu == null ? [] : collect(item.submenu.items)),
    ])
    return collect(Menu.getApplicationMenu()?.items ?? [])
  })
}

shellTest('native menu and title follow the Harness locale preference @smoke @critical', async ({ electronApp, window, settingsPath }) => {
  await expect(window.getByRole('heading', { name: 'Harness test workspace' })).toBeVisible()
  const dragRegion = window.locator('[data-dsh-window-drag-region]')
  await expect(dragRegion).toHaveCount(1)
  await expect(dragRegion).toHaveCSS('position', 'fixed')
  expect(await dragRegion.evaluate(element => getComputedStyle(element).getPropertyValue('-webkit-app-region'))).toBe('drag')
  const chrome = await electronApp.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0]!
    return { platform: process.platform, bounds: mainWindow.getBounds(), content: mainWindow.getContentBounds() }
  })
  if (chrome.platform === 'darwin') expect(chrome.content.height).toBe(chrome.bounds.height)
  if (chrome.platform === 'darwin') {
    const sidebarRoot = window.locator('[data-slot="sidebar"] > :first-child')
    await expect(sidebarRoot).toHaveCSS('padding-top', '12px')
    await sidebarRoot.evaluate(element => element.classList.add('fixture-collapsed'))
    await expect(sidebarRoot).toHaveCSS('padding-top', '25px')
  }
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle()))
    .toBe('dsh-desktop — DeepSeek Harness (Community)')
  await expect.poll(() => menuLabels(electronApp)).toContain('Help')
  const english = await menuLabels(electronApp)
  expect(english).not.toContain('dsh-desktop Website (Community)')
  expect(english).not.toContain('DeepSeek Harness — Official')
  expect(english).toContain('Project Repository')
  expect(english).toContain('DeepSeek Official Website')
  expect(await window.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined')

  await writeFile(settingsPath, 'locale:\n  preference: zh\nui-theme:\n  preference: system\n')
  await expect.poll(() => menuLabels(electronApp)).toContain('帮助')
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle()))
    .toBe('dsh-desktop — DeepSeek Harness（社区版）')
})

shellTest('closing hides to tray and a second-instance activation restores the window @critical', async ({ electronApp, window }) => {
  await expect(window.getByRole('heading', { name: 'Harness test workspace' })).toBeVisible()
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())).toBe(true)
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())).toBe(false)
  await electronApp.evaluate(({ app }) => {
    app.emit('second-instance', {} as Electron.Event, [], process.cwd(), {})
  })
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())).toBe(true)
})
