import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { locatePackagedExecutable } from '../scripts/packaged-locator.mjs'

// Packaged mode runs the real bundled Harness (the dev web-URL override is
// dev-only, src/main/index.ts boot()), so stub-only page assertions are
// skipped and the boot-overlay wait doubles as the real-render check.
const PACKAGED = process.env.DSH_E2E_PACKAGED === '1'
const require = createRequire(import.meta.url)
const electronPath = require('electron') as string

type PathStyle = 'normal' | 'weird' | 'readonly'

// The electronApp fixture exposes its launch closure through this module-level
// slot so the `relaunch` fixture can restart the app on the same home/data
// dirs. workers: 1 in playwright.config.ts keeps this race-free.
interface LaunchHandle {
  launch: () => Promise<ElectronApplication>
  current: () => ElectronApplication | undefined
}
let activeLaunch: LaunchHandle | undefined

interface Fixture {
  electronApp: ElectronApplication
  window: Page
  settingsPath: string
  dshHome: string
  userData: string
  relaunch: () => Promise<ElectronApplication>
}

const shellTest = test.extend<Fixture & { pathStyle: PathStyle }>({
  pathStyle: ['normal', { option: true }],
  electronApp: async ({ pathStyle }, use, testInfo) => {
    if (PACKAGED) testInfo.setTimeout(240_000) // 真实 Harness 首次渲染可达 120s
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-e2e-'))
    // 特殊路径变体:中文/空格目录(真实用户环境)与只读 DSH_HOME。
    const homeDir = pathStyle === 'weird'
      ? 'dsh e2e 中文 目录'
      : 'dsh-home'
    const dataDir = pathStyle === 'weird'
      ? 'electron data 数据'
      : 'electron-data'
    const dshHome = join(root, homeDir)
    const userData = join(root, dataDir)
    await mkdir(dshHome, { recursive: true })
    await mkdir(userData, { recursive: true })
    await writeFile(join(dshHome, 'settings.yaml'), 'locale:\n  preference: en\nui-theme:\n  preference: system\n')
    await writeFile(join(userData, 'shell-preferences.json'), '{"closeToTrayExplained":true}\n')
    if (pathStyle === 'readonly') await chmod(dshHome, 0o555)

    let currentApp: ElectronApplication | undefined
    let server: Server | undefined
    const launch = async (): Promise<ElectronApplication> => {
      if (server !== undefined) {
        const previous = server
        server = undefined
        await new Promise<void>(resolve => previous.close(() => resolve()))
      }
      let launchArgs: string[] = [`--user-data-dir=${userData}`]
      if (process.platform === 'linux') launchArgs.push('--no-sandbox')
      const launchEnv: Record<string, string> = { ...process.env, DSH_HOME: dshHome }
      let executablePath: string | undefined
      if (PACKAGED) {
        // Unpacked build from dist/ — no stub server, the real Harness renders.
        executablePath = await locatePackagedExecutable()
        currentApp = await electron.launch({ executablePath, args: launchArgs, cwd: process.cwd(), env: launchEnv })
        return currentApp
      }
      server = createServer((request, response) => {
        if (request.method === 'POST' && request.url === '/settings') {
          let body = ''
          request.on('data', chunk => { body += chunk })
          request.on('end', () => {
            try {
              const parsed = JSON.parse(body) as { locale?: string; theme?: string }
              const settings = [
                `locale:\n  preference: ${parsed.locale ?? 'en'}`,
                `ui-theme:\n  preference: ${parsed.theme ?? 'system'}`,
              ].join('\n')
              void writeFile(join(dshHome, 'settings.yaml'), settings + '\n')
              response.writeHead(204)
            } catch {
              response.writeHead(400)
            }
            response.end()
          })
          return
        }
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        response.end('<!doctype html><html lang="en"><head><title>Stub Harness</title></head><body><div data-slot="sidebar"><aside>Brand</aside></div><main><h1>Harness test workspace</h1><input aria-label="Prompt">' +
          '<section><select id="locale" aria-label="Locale"><option value="en">English</option><option value="zh">中文</option></select>' +
          '<select id="theme" aria-label="Theme"><option value="system">System</option><option value="dark">Dark</option></select>' +
          '<button id="apply-settings" type="button">Apply</button></section></main>' +
          '<script>' +
          'var apply = document.getElementById("apply-settings");' +
          'apply.addEventListener("click", function () {' +
          'var locale = document.getElementById("locale").value;' +
          'var theme = document.getElementById("theme").value;' +
          'fetch("/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: locale, theme: theme }) });' +
          '});' +
          '</script></body></html>')
      })
      await new Promise<void>((resolve, reject) => {
        server!.once('error', reject)
        server!.listen(0, '127.0.0.1', resolve)
      })
      const address = server!.address()
      if (address === null || typeof address === 'string') throw new Error('test server did not bind a TCP port')
      launchArgs = ['.', ...launchArgs]
      launchEnv.DSH_DESKTOP_DEV_WEB_URL = `http://127.0.0.1:${address.port}`
      currentApp = await electron.launch({ executablePath, args: launchArgs, cwd: process.cwd(), env: launchEnv })
      return currentApp
    }
    activeLaunch = { launch, current: () => currentApp }

    currentApp = await launch()
    await use(currentApp)

    if (testInfo.status !== testInfo.expectedStatus) {
      const page = currentApp?.windows()[0]
      if (page !== undefined) await page.screenshot({ path: testInfo.outputPath('window.png') }).catch(() => {})
    }
    // Guard the teardown: on Linux CI a lingering application can keep
    // close() pending past the test timeout (observed on the diagnostics
    // case). Race it; only SIGKILL when the graceful close actually hung.
    const close = currentApp?.close().catch(() => {})
    const outcome = await Promise.race([
      close?.then(() => 'closed') ?? Promise.resolve('none'),
      new Promise<string>(resolve => setTimeout(() => resolve('timeout'), 15_000)),
    ])
    console.log(`[e2e-fixture] ${testInfo.title}: close=${outcome}`)
    if (outcome === 'timeout') {
      try {
        currentApp?.process().kill('SIGKILL')
      } catch {
        // process already gone
      }
    }
    activeLaunch = undefined
    await chmod(dshHome, 0o755).catch(() => undefined)
    if (server !== undefined) await new Promise<void>(resolve => server!.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    if (PACKAGED) {
      // Real Harness: the boot overlay disappears only after the web bundle
      // finished loading its plugins (failure surface text is treated as a
      // failure rather than a render).
      await expect.poll(
        () => window.evaluate(() => ({
          boot: document.querySelector('[data-dsh-boot]') !== null,
          failed: document.body.innerText.includes('Failed to load plugins'),
        })),
        { timeout: 120_000 },
      ).toEqual({ boot: false, failed: false })
    }
    await use(window)
  },

  settingsPath: async ({ electronApp }, use) => {
    const path = await electronApp.evaluate(() => (
      `${process.env.DSH_HOME}${process.platform === 'win32' ? '\\' : '/'}settings.yaml`
    ))
    await use(path)
  },

  dshHome: async ({ electronApp }, use) => {
    const home = await electronApp.evaluate(() => process.env.DSH_HOME ?? '')
    await use(home)
  },

  userData: async ({ electronApp }, use) => {
    const data = await electronApp.evaluate(({ app }) => app.getPath('userData'))
    await use(data)
  },

  relaunch: async ({ electronApp }, use) => {
    await use(async () => {
      const handle = activeLaunch
      if (handle === undefined) throw new Error('relaunch: no active launch handle')
      await electronApp.close().catch(() => {})
      const next = await handle.launch()
      // The fixture tracks the latest app so teardown closes it as well.
      return next
    })
  },
})

async function packagedOrStubHeadline(window: Page): Promise<void> {
  if (PACKAGED) {
    // Real render already waited for in the window fixture; a form control
    // (prompt input or settings surface) proves the app mounted.
    await expect.poll(
      () => window.evaluate(() => ({
        failed: document.body.innerText.includes('Failed to load plugins'),
        control: document.querySelector('input, textarea, [role="textbox"]') !== null,
      })),
      { timeout: 60_000 },
    ).toEqual({ failed: false, control: true })
  } else {
    await expect(window.getByRole('heading', { name: 'Harness test workspace' })).toBeVisible()
  }
}

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
  // The application menu is installed during startup; wait for it before
  // clicking (the window can be ready before the menu exists).
  await expect.poll(() => app.evaluate(({ Menu }, label) => {
    const collect = (items: Electron.MenuItem[]): Electron.MenuItem[] => items.flatMap(item => [
      item,
      ...(item.submenu == null ? [] : collect(item.submenu.items)),
    ])
    const item = collect(Menu.getApplicationMenu()?.items ?? []).find(entry => entry.label === label)
    if (item === undefined) return false
    item.click()
    return true
  }, label), { timeout: 10_000 }).toBe(true)
}

shellTest('native menu and title follow the Harness locale preference @smoke @critical', async ({ electronApp, window, settingsPath }) => {
  await packagedOrStubHeadline(window)
  const dragRegion = window.locator('[data-dsh-window-drag-region]')
  await expect(dragRegion).toHaveCount(1)
  await expect(dragRegion).toHaveCSS('position', 'fixed')
  // The real Harness page can navigate right after boot; retry the evaluate so
  // a mid-navigation context swap does not fail the assertion.
  await expect.poll(() => dragRegion.evaluate(element => getComputedStyle(element).getPropertyValue('-webkit-app-region'))).toBe('drag')
  const chrome = await electronApp.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0]!
    return { platform: process.platform, bounds: mainWindow.getBounds(), content: mainWindow.getContentBounds() }
  })
  if (chrome.platform === 'darwin') expect(chrome.content.height).toBe(chrome.bounds.height)
  if (chrome.platform === 'darwin' && !PACKAGED) {
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

shellTest('closing hides to tray and a second-instance activation restores the window @smoke @critical', async ({ electronApp, window }) => {
  await packagedOrStubHeadline(window)
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())).toBe(true)
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())).toBe(false)
  await electronApp.evaluate(({ app }) => {
    app.emit('second-instance', {} as Electron.Event, [], process.cwd(), {})
  })
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())).toBe(true)
})

shellTest('settings UI drives locale/theme through the harness page into settings.yaml', async ({ electronApp, window, dshHome }) => {
  await expect(window.getByRole('heading', { name: 'Harness test workspace' })).toBeVisible()
  await window.selectOption('#locale', 'zh')
  await window.selectOption('#theme', 'dark')
  await window.click('#apply-settings')
  // The stub server wrote settings.yaml; the shell watcher picks it up.
  await expect.poll(() => menuLabels(electronApp)).toContain('帮助')
  await expect.poll(() => electronApp.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle()))
    .toBe('dsh-desktop — DeepSeek Harness（社区版）')
  const persisted = await readFile(join(dshHome, 'settings.yaml'), 'utf8')
  expect(persisted).toContain('preference: zh')
  expect(persisted).toContain('preference: dark')
})

shellTest('manual update check in dev mode explains the missing update source', async ({ electronApp }) => {
  await electronApp.evaluate(({ dialog }) => {
    ;(globalThis as unknown as { __dshE2eDialogs: Array<Record<string, string>> }).__dshE2eDialogs = []
    ;(dialog as unknown as { showMessageBox: unknown }).showMessageBox = async (options: { title?: string; message?: string; detail?: string }) => {
      ;(globalThis as unknown as { __dshE2eDialogs: Array<Record<string, string>> }).__dshE2eDialogs.push({
        title: options.title ?? '', message: options.message ?? '', detail: options.detail ?? '',
      })
      return { response: 0 }
    }
  })
  await clickMenuItem(electronApp, 'Check for Updates…')
  await expect.poll(() => electronApp.evaluate(
    () => (globalThis as unknown as { __dshE2eDialogs?: Array<Record<string, string>> }).__dshE2eDialogs ?? [],
  )).toHaveLength(1)
  const [dialog] = await electronApp.evaluate(
    () => (globalThis as unknown as { __dshE2eDialogs: Array<Record<string, string>> }).__dshE2eDialogs,
  )
  expect(dialog?.title).toBe('Check for Updates')
  expect(dialog?.detail).toContain('Development builds do not have an update source')
})

shellTest('diagnostic export writes the report to the chosen path', async ({ electronApp, window, dshHome }) => {
  await packagedOrStubHeadline(window)
  const reportPath = join(dshHome, 'diagnostic-report.txt')
  const version = await electronApp.evaluate(({ app }) => app.getVersion())
  await electronApp.evaluate(({ dialog }, reportPath) => {
    ;(dialog as unknown as { showMessageBox: unknown }).showMessageBox = async () => ({ response: 0 })
    ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async () => ({ canceled: false, filePath: reportPath })
  }, reportPath)
  await clickMenuItem(electronApp, 'Export Diagnostic Report…')
  await expect.poll(async () => readFile(reportPath, 'utf8').then(() => true, () => false)).toBe(true)
  const text = await readFile(reportPath, 'utf8')
  expect(text).toContain('dsh-desktop')
  expect(text).toContain(version)
})

shellTest('window geometry is restored after a restart', async ({ electronApp, window, relaunch }) => {
  await expect(window.getByRole('heading', { name: 'Harness test workspace' })).toBeVisible()
  await electronApp.evaluate(({ BrowserWindow }) => {
    // 1180x640 respects MIN_WINDOW_WIDTH=960 / MIN_WINDOW_HEIGHT=640.
    BrowserWindow.getAllWindows()[0]?.setBounds({ x: 96, y: 88, width: 1180, height: 640 })
  })
  await window.waitForTimeout(400)
  const next = await relaunch()
  try {
    const nextWindow = await next.firstWindow()
    await nextWindow.waitForLoadState('domcontentloaded')
    await expect.poll(() => next.evaluate(({ BrowserWindow }) => {
      const bounds = BrowserWindow.getAllWindows()[0]?.getBounds()
      return bounds === undefined ? null : { width: bounds.width, height: bounds.height }
    })).toEqual({ width: 1180, height: 640 })
  } finally {
    await next.close().catch(() => {})
  }
})

shellTest('a real second instance is redirected to the already-running app', async ({ electronApp, window, dshHome, userData }) => {
  await expect(window.getByRole('heading', { name: 'Harness test workspace' })).toBeVisible()
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())).toBe(false)
  const args = ['.', `--user-data-dir=${userData}`]
  if (process.platform === 'linux') args.push('--no-sandbox')
  const second = spawn(electronPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, DSH_HOME: dshHome },
    stdio: 'ignore',
  })
  const exited = await Promise.race([
    new Promise<number | null>(resolve => second.once('exit', resolve)),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 30_000)),
  ])
  expect(exited).not.toBeNull()
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())).toBe(true)
})

test.describe('environment edge paths', () => {
  shellTest.use({ pathStyle: 'weird' })

  shellTest('unicode and space-heavy paths still boot', async ({ electronApp, window, settingsPath }) => {
    await expect(window.getByRole('heading', { name: 'Harness test workspace' })).toBeVisible()
    await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle()))
      .toBe('dsh-desktop — DeepSeek Harness (Community)')
    await writeFile(settingsPath, 'locale:\n  preference: zh\nui-theme:\n  preference: system\n')
    await expect.poll(() => menuLabels(electronApp)).toContain('帮助')
  })
})

test.describe('environment edge paths', () => {
  shellTest.use({ pathStyle: 'readonly' })

  shellTest('a read-only DSH_HOME still boots with defaults', async ({ electronApp, window }) => {
    await expect(window.getByRole('heading', { name: 'Harness test workspace' })).toBeVisible()
    await expect.poll(() => menuLabels(electronApp)).toContain('Help')
  })
})
