import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

interface Fixture {
  electronApp: ElectronApplication
  window: Page
  settingsPath: string
  /** Mutable knobs read by the stub harness between requests. */
  harness: { failConfigOnce: boolean }
}

const shellTest = test.extend<Fixture>({
  // One mutable object per test, shared between the stub HTTP handler (which
  // reads it per request) and the test body (which sets it).
  harness: async ({}, use) => {
    await use({ failConfigOnce: false })
  },

  electronApp: async ({ harness }, use, testInfo) => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-e2e-'))
    const dshHome = join(root, 'dsh-home')
    const userData = join(root, 'electron-data')
    await mkdir(dshHome, { recursive: true })
    await mkdir(userData, { recursive: true })
    await writeFile(join(dshHome, 'settings.yaml'), 'locale:\n  preference: en\nui-theme:\n  preference: system\n')
    await writeFile(join(userData, 'shell-preferences.json'), '{"closeToTrayExplained":true,"visionGuideCompleted":false}\n')

    const server: Server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (url.pathname === '/modlens/config') {
        const sendJson = (status: number, body: unknown): void => {
          response.writeHead(status, { 'content-type': 'application/json' })
          response.end(JSON.stringify(body))
        }
        // Mirror the real route's contract: the discovery section costs a CLI
        // probe, so it is only included when the client asks with ?discover.
        const summary = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
          provider: '',
          engines: {
            'gemini-api': { baseUrl: '', model: '', hasKey: false, source: '' },
          },
          keyless: ['antigravity-cli', 'claude-cli'],
          reuse: { claude: false, codex: false, opencode: false, pi: false, grok: false },
          ...(url.searchParams.has('discover')
            ? {
                discovery: [
                  { harness: 'claude', cliFound: true, loggedIn: true },
                  { harness: 'codex', cliFound: false, loggedIn: false },
                ],
              }
            : {}),
          ...overrides,
        })
        if (harness.failConfigOnce) {
          harness.failConfigOnce = false
          sendJson(503, { error: 'Harness not ready' })
          return
        }
        if (request.method === 'GET') {
          sendJson(200, summary())
          return
        }
        if (request.method === 'POST') {
          let body = ''
          request.on('data', chunk => { body += String(chunk) })
          request.on('end', () => {
            try {
              const parsed = body === '' ? {} : JSON.parse(body)
              if (parsed?.open === true) {
                sendJson(200, { opened: true })
                return
              }
              sendJson(200, summary({
                provider: typeof parsed.provider === 'string' ? parsed.provider : '',
                reuse: { claude: false, codex: false, opencode: false, pi: false, grok: false, ...(parsed.reuse ?? {}) },
              }))
            } catch {
              sendJson(400, { error: 'Invalid JSON' })
            }
          })
          return
        }
        sendJson(405, { error: 'Method not allowed' })
        return
      }
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

async function clickMenuItem(app: ElectronApplication, label: string): Promise<void> {
  await app.evaluate(({ Menu }, targetLabel) => {
    const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => {
      for (const item of items) {
        if (item.label === targetLabel) return item
        if (item.submenu != null) {
          const found = find(item.submenu.items)
          if (found !== undefined) return found
        }
      }
      return undefined
    }
    const item = find(Menu.getApplicationMenu()?.items ?? [])
    if (item === undefined) throw new Error(`menu item not found: ${targetLabel}`)
    item.click()
  }, label)
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

shellTest('vision settings window loads ModLens config from the harness @critical', async ({ electronApp, window }) => {
  await expect(window.getByRole('heading', { name: 'Harness test workspace' })).toBeVisible()
  await expect.poll(() => menuLabels(electronApp)).toContain('Vision Settings…')
  await clickMenuItem(electronApp, 'Vision Settings…')
  const settingsWindow = await electronApp.waitForEvent('window')
  await settingsWindow.waitForLoadState('domcontentloaded')
  // The guide preference is incomplete, so the wizard opens (not the form).
  await expect(settingsWindow.getByRole('heading', { name: 'Vision Setup Wizard' })).toBeVisible()
  await expect(settingsWindow.locator('#step-1')).toBeVisible()
  // The reuse rows only render when the proxy asked the route for ?discover.
  await expect(settingsWindow.locator('#reuse-list .row')).toHaveCount(2)
  await expect(settingsWindow.locator('#reuse-list .row').first()).toContainText('claude')
  await expect(settingsWindow.locator('#reuse-list .row').first()).toContainText('Found')
  await expect(settingsWindow.locator('#reuse-list .row').nth(1)).toContainText('codex')
  await expect(settingsWindow.locator('#reuse-list .row').nth(1)).toContainText('Not installed')

  // Wizard navigation: nothing reusable selected → step 2 (add a key).
  await settingsWindow.getByRole('button', { name: 'Next' }).click()
  await expect(settingsWindow.locator('#step-2')).toBeVisible()
  await settingsWindow.getByRole('button', { name: 'Skip' }).click()
  await expect(settingsWindow.locator('#step-3')).toBeVisible()
  await expect(settingsWindow.getByRole('button', { name: 'Run test' })).toBeVisible()
  // The diagnosis button runs the local-only modlens doctor (fast, no network
  // or quota) and always prints the per-engine report.
  await settingsWindow.getByRole('button', { name: 'Diagnosis' }).click()
  await expect(settingsWindow.locator('#step3-diagnosis-report')).toContainText('Providers', { timeout: 15_000 })
  await settingsWindow.getByRole('button', { name: 'Back' }).click()
  await expect(settingsWindow.locator('#step-2')).toBeVisible()

  // The main harness window must not be able to proxy ModLens config or close
  // the settings modal; only the settings window itself is allowed.
  const forbidden = await window.evaluate(async () => {
    const bridge = (window as unknown as {
      dshDesktop?: {
        modlensConfig(method: string, body?: string): Promise<{ status: number }>
        closeSettings(): Promise<boolean>
      }
    }).dshDesktop
    const modlens = await bridge!.modlensConfig('GET')
    const close = await bridge!.closeSettings()
    return { modlensStatus: modlens.status, close }
  })
  expect(forbidden.modlensStatus).toBe(403)
  expect(forbidden.close).toBe(false)
  await expect(settingsWindow.getByRole('heading', { name: 'Vision Setup Wizard' })).toBeVisible()

  await settingsWindow.getByRole('button', { name: 'Close' }).click()
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
})

shellTest('vision settings form opens once the guide is completed @critical', async ({ electronApp, window }) => {
  await expect(window.getByRole('heading', { name: 'Harness test workspace' })).toBeVisible()
  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  await writeFile(join(userData, 'shell-preferences.json'), '{"closeToTrayExplained":true,"visionGuideCompleted":true}\n')
  await clickMenuItem(electronApp, 'Vision Settings…')
  const settingsWindow = await electronApp.waitForEvent('window')
  await settingsWindow.waitForLoadState('domcontentloaded')
  await expect(settingsWindow.getByRole('heading', { name: 'Vision Settings' })).toBeVisible()
  await expect(settingsWindow.locator('#provider')).toBeVisible()
  // The form offers a real recognition test (not clicked here: it runs the
  // bundled CLI against live engines, which is machine-dependent).
  await expect(settingsWindow.getByRole('button', { name: 'Test vision' })).toBeVisible()
  // Auto-mode card renders from the ?discover section of the config payload.
  await expect(settingsWindow.locator('#auto-card')).toBeVisible()
  await expect(settingsWindow.locator('#reuse-list .row')).toHaveCount(2)

  // Dirty tracking: a reuse toggle enables Save, and saving persists via POST.
  const save = settingsWindow.getByRole('button', { name: 'Save' })
  await expect(save).toBeDisabled()
  await settingsWindow.locator('#reuse-list .row').first().getByRole('checkbox').check()
  await expect(save).toBeEnabled()
  await save.click()
  await expect(settingsWindow.locator('#status')).toContainText('Saved')

  // Selecting an API-key engine must render its fields (regression: the
  // page script once called a main-process-only escapeHtml helper here).
  await settingsWindow.locator('#provider').selectOption('gemini-api')
  await expect(settingsWindow.locator('#apiKey')).toBeVisible()
  await expect(settingsWindow.locator('#baseUrl')).toBeVisible()
  await expect(settingsWindow.locator('#model')).toBeVisible()
  await expect(settingsWindow.locator('#cli-note')).toBeHidden()
  // A provider switch alone is a pending change.
  await expect(save).toBeEnabled()
  await save.click()
  await expect(settingsWindow.locator('#status')).toContainText('Saved')
  await expect(save).toBeDisabled()
  await settingsWindow.locator('#apiKey').fill('test-key')
  await expect(save).toBeEnabled()
  await save.click()
  await expect(settingsWindow.locator('#status')).toContainText('Saved')
  // Keyless engines show the CLI note instead of key fields.
  await settingsWindow.locator('#provider').selectOption('claude-cli')
  await expect(settingsWindow.locator('#apiKey')).toHaveCount(0)
  await expect(settingsWindow.locator('#cli-note')).toBeVisible()

  await settingsWindow.getByRole('button', { name: 'Close' }).click()
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
})

shellTest('pasting an image into the harness surfaces the first-run vision guide card @critical', async ({ electronApp, window }) => {
  await expect(window.getByRole('heading', { name: 'Harness test workspace' })).toBeVisible()
  await expect(window.locator('[data-dsh-vision-guide-card]')).toHaveCount(0)

  // A plain text paste must not trigger the card.
  await window.evaluate(() => {
    const data = new DataTransfer()
    data.setData('text/plain', 'hello')
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  })
  await expect(window.locator('[data-dsh-vision-guide-card]')).toHaveCount(0)

  // An image paste asks the main process whether the guide is still pending
  // and, when it is, shows the inline card.
  await window.evaluate(() => {
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'screenshot.png', { type: 'image/png' }))
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  })
  const card = window.locator('[data-dsh-vision-guide-card]')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Configure')
  await card.getByRole('button', { name: 'Configure' }).click()

  // Configure opens the shell-owned settings modal (the wizard, since the
  // guide preference is still incomplete).
  const settingsWindow = await electronApp.waitForEvent('window')
  await settingsWindow.waitForLoadState('domcontentloaded')
  await expect(settingsWindow.getByRole('heading', { name: 'Vision Setup Wizard' })).toBeVisible()
  await settingsWindow.getByRole('button', { name: 'Close' }).click()
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
})

shellTest('vision wizard surfaces a config load failure and recovers via retry @critical', async ({ electronApp, window, harness }) => {
  await expect(window.getByRole('heading', { name: 'Harness test workspace' })).toBeVisible()
  harness.failConfigOnce = true
  await clickMenuItem(electronApp, 'Vision Settings…')
  const settingsWindow = await electronApp.waitForEvent('window')
  await settingsWindow.waitForLoadState('domcontentloaded')
  await expect(settingsWindow.getByRole('heading', { name: 'Vision Setup Wizard' })).toBeVisible()
  // The failed GET must read as a load error with a retry, not as "no
  // engines found".
  await expect(settingsWindow.locator('#step1-error')).toBeVisible()
  await expect(settingsWindow.locator('#step1-error-text')).toContainText('Harness not ready')
  await expect(settingsWindow.locator('#reuse-list .row')).toHaveCount(0)
  await settingsWindow.getByRole('button', { name: 'Retry' }).click()
  await expect(settingsWindow.locator('#reuse-list .row')).toHaveCount(2)
  await expect(settingsWindow.locator('#step1-error')).toBeHidden()
  await settingsWindow.getByRole('button', { name: 'Close' }).click()
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
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
