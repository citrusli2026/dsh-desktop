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
    // (prompt input or settings surface) proves the app mounted. The first
    // boot replaces the loading overlay with the harness page, so an
    // evaluate landing on the navigation can throw — treat it as "not there
    // yet" and keep polling.
    await expect.poll(
      () => window.evaluate(() => ({
        failed: document.body.innerText.includes('Failed to load plugins'),
        control: document.querySelector('input, textarea, [role="textbox"]') !== null,
      })).catch(() => ({ failed: true, control: false })),
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

shellTest('desktop shell visual sanity check @visual', async ({ window }, testInfo) => {
  await packagedOrStubHeadline(window)
  await expect(window.locator('[data-dsh-window-drag-region]')).toHaveCount(1)
  await expect(window.getByRole('heading').first()).toBeVisible()
  await window.screenshot({ path: testInfo.outputPath('shell-visual.png'), animations: 'disabled' })
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

shellTest('manual update check in dev mode explains the missing update source', async ({ electronApp, window }) => {
  await packagedOrStubHeadline(window)
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
    // Two message boxes share this stub: the About dialog (7 buttons — pick
    // "Export Diagnostic Report…", index 1) and the export's own Continue/Cancel
    // warning (2 buttons — pick Continue, index 0).
    ;(dialog as unknown as { showMessageBox: unknown }).showMessageBox = async (options: { buttons?: string[] }) => ({
      response: (options?.buttons?.length ?? 0) > 2 ? 1 : 0,
    })
    ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async () => ({ canceled: false, filePath: reportPath })
  }, reportPath)
  // Diagnostics live inside the About dialog (decision 0023): open it and pick
  // the "Export Diagnostic Report…" button (index 1 of the maintenance trio).
  await clickMenuItem(electronApp, 'About dsh-desktop')
  await expect.poll(async () => readFile(reportPath, 'utf8').then(() => true, () => false)).toBe(true)
  const text = await readFile(reportPath, 'utf8')
  expect(text).toContain('dsh-desktop')
  expect(text).toContain(version)
})

shellTest('portable preset import lands a user preset under the user preset root', async ({ electronApp, window, dshHome }) => {
  await packagedOrStubHeadline(window)
  const presetFile = join(dshHome, 'team.dshpreset')
  await writeFile(presetFile, JSON.stringify({
    format: 'dsh-preset/v1',
    id: 'team-workflow',
    metadata: { name: 'Team Workflow' },
    composition: '- id: custom-prompt\n  config:\n    instructions: keep\n',
  }))
  await electronApp.evaluate(({ dialog }, presetFile) => {
    ;(dialog as unknown as { showMessageBox: unknown }).showMessageBox = async () => ({ response: 0 })
    ;(dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({ canceled: false, filePaths: [presetFile] })
  }, presetFile)
  const result = await window.evaluate(() => (window as unknown as {
    dshDesktop?: { importPreset(): Promise<unknown> }
  }).dshDesktop?.importPreset())
  expect(result).toEqual({ imported: true, name: 'team-workflow' })
  const written = await readFile(join(dshHome, '.agent-presets', 'team-workflow', 'agent.cordis.yml'), 'utf8')
  expect(written.trim()).toContain('custom-prompt')
})

shellTest('health check is local by default and adds advisory connectivity checks only after opt-in @smoke', async ({ window, dshHome, userData }) => {
  await packagedOrStubHeadline(window)
  const run = (includeNetwork: boolean) => window.evaluate(value => (window as unknown as {
    dshDesktop?: { runHealthCheck(options: { includeNetwork: boolean }): Promise<{ networkIncluded: boolean; results: Array<{ id: string; status: string }> } | null> }
  }).dshDesktop?.runHealthCheck({ includeNetwork: value }), includeNetwork)
  const local = await run(false)
  expect(local?.networkIncluded).toBe(false)
  expect(local?.results.map(result => result.id)).toEqual(['runtime', 'storage', 'harness', 'profile'])
  expect(JSON.stringify(local)).not.toContain(dshHome)
  expect(JSON.stringify(local)).not.toContain(userData)

  const connected = await run(true)
  expect(connected?.networkIncluded).toBe(true)
  expect(connected?.results.map(result => result.id)).toEqual(['runtime', 'storage', 'harness', 'profile', 'proxy', 'registry', 'updates'])
  expect(connected?.results.filter(result => ['proxy', 'registry', 'updates'].includes(result.id)).every(result => ['ok', 'warning'].includes(result.status))).toBe(true)
})

// Desktop status notices (shell.6/7): renderer → preload bridge → `desktop:session-status`
// → native Notification. The bridge runs unchanged in dev-stub and packaged modes, so the
// state-edge pipeline can be driven from either page. Record shown notices and their click
// listener per native Notification instance via the main-process prototype.
interface NoticeSnapshot { title: string; body: string; clicks: number }
interface NoticeBridge {
  dshDesktop?: {
    getDesktopPreferences(): Promise<{ notificationsAvailable?: boolean; notificationsEnabled?: boolean; firstTaskCompleted?: boolean; firstRunGuideDismissed?: boolean } | null>
    reportSessionStatus(status: unknown): Promise<boolean>
    updateDesktopPreferences(patch: { notificationsEnabled: boolean }): Promise<unknown>
  }
}

async function ensureNoticesAvailable(window: Page): Promise<void> {
  const prefs = await window.evaluate(() => (window as unknown as NoticeBridge).dshDesktop?.getDesktopPreferences())
  test.skip(prefs?.notificationsAvailable !== true || prefs?.notificationsEnabled !== true, 'status notices unavailable on this platform')
}

async function instrumentDesktopNotices(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ Notification }) => {
    interface NoticeRecord { title: string; body: string; listeners: Array<() => void> }
    const records: NoticeRecord[] = []
    ;(globalThis as unknown as { __dshE2eNotices: NoticeRecord[] }).__dshE2eNotices = records
    const prototype = Notification.prototype as unknown as { on: (event: string, listener: () => void) => unknown }
    const originalOn = prototype.on
    const byInstance = new WeakMap<object, NoticeRecord>()
    prototype.on = function (this: unknown, event: string, listener: () => void): unknown {
      if (event === 'click') {
        let record = byInstance.get(this as object)
        if (record === undefined) {
          const instance = this as unknown as { title: string; body: string }
          record = { title: instance.title ?? '', body: instance.body ?? '', listeners: [] }
          byInstance.set(this as object, record)
          records.push(record)
        }
        record.listeners.push(listener)
        return this
      }
      return originalOn.call(this, event, listener)
    }
  })
}

function readNoticeRecords(app: ElectronApplication): Promise<NoticeSnapshot[]> {
  return app.evaluate(() => (globalThis as unknown as {
    __dshE2eNotices?: Array<{ title: string; body: string; listeners: Array<() => void> }>
  }).__dshE2eNotices?.map(record => ({ title: record.title, body: record.body, clicks: record.listeners.length })) ?? [])
}

function clickNotice(app: ElectronApplication, index: number): Promise<void> {
  // evaluate() receives the electron module first and the custom arg second.
  return app.evaluate((_electron, index) => {
    for (const listener of (globalThis as unknown as {
      __dshE2eNotices?: Array<{ listeners: Array<() => void> }>
    }).__dshE2eNotices?.[index]?.listeners ?? []) listener()
  }, index)
}

function reportSessionStatus(page: Page, snapshot: unknown): Promise<unknown> {
  return page.evaluate(value => (window as unknown as NoticeBridge).dshDesktop?.reportSessionStatus(value), snapshot)
}

async function mainWindowVisible(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() === true)
}

async function hideMainWindow(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.hide())
  await expect.poll(() => mainWindowVisible(app)).toBe(false)
}

shellTest('desktop status notices fire on real state edges and clicking one restores the window', async ({ electronApp, window }) => {
  // The packaged run checks the real Harness UI below; the state-edge pipeline
  // needs the dev-stub page, so skip silently there.
  test.skip(PACKAGED, 'packaged covers the pipeline against the real Harness')
  await expect(window.getByRole('heading', { name: 'Harness test workspace' })).toBeVisible()
  await ensureNoticesAvailable(window)
  await instrumentDesktopNotices(electronApp)

  // Baseline: the first report only establishes state, so booting work never notifies.
  await reportSessionStatus(window, { sessions: [{ id: 's1', title: 'Research', running: true, jobs: [{ id: 'j1', label: 'Worker', status: 'running' }] }] })
  await hideMainWindow(electronApp)

  // A hidden window is the target case: a real edge fires with a localized body.
  await reportSessionStatus(window, { sessions: [{ id: 's1', title: 'Research', running: true, jobs: [{ id: 'j1', label: 'Worker', status: 'completed' }] }] })
  await expect.poll(() => readNoticeRecords(electronApp)).toEqual([{ title: 'Background task completed', body: 'Worker finished.', clicks: 1 }])

  // Re-reporting the same state is not a new edge — no duplicate notice.
  await reportSessionStatus(window, { sessions: [{ id: 's1', title: 'Research', running: true, jobs: [{ id: 'j1', label: 'Worker', status: 'completed' }] }] })
  expect(await readNoticeRecords(electronApp)).toHaveLength(1)

  // The session completing is its own edge; clicking that notice summons the window.
  await reportSessionStatus(window, { sessions: [{ id: 's1', title: 'Research', running: false, jobs: [{ id: 'j1', label: 'Worker', status: 'completed' }] }] })
  await expect.poll(() => readNoticeRecords(electronApp)).toEqual([
    { title: 'Background task completed', body: 'Worker finished.', clicks: 1 },
    { title: 'Task completed', body: 'Research finished.', clicks: 1 },
  ])
  await clickNotice(electronApp, 1)
  await expect.poll(() => mainWindowVisible(electronApp)).toBe(true)
  await expect.poll(() => window.evaluate(() => (window as unknown as NoticeBridge).dshDesktop?.getDesktopPreferences()))
    .toMatchObject({ firstTaskCompleted: true })

  // The preference switch silences later edges; a hidden-window failure stays quiet.
  await window.evaluate(() => (window as unknown as NoticeBridge).dshDesktop?.updateDesktopPreferences({ notificationsEnabled: false }))
  await reportSessionStatus(window, { sessions: [{ id: 's1', title: 'Research', running: false, jobs: [{ id: 'j1', label: 'Worker', status: 'completed' }, { id: 'j2', label: 'Searcher', status: 'running' }] }] })
  await hideMainWindow(electronApp)
  await reportSessionStatus(window, { sessions: [{ id: 's1', title: 'Research', running: false, jobs: [{ id: 'j1', label: 'Worker', status: 'completed' }, { id: 'j2', label: 'Searcher', status: 'failed', detail: 'boom' }] }] })
  expect(await readNoticeRecords(electronApp)).toHaveLength(2)
})

shellTest('packaged app shows a desktop notice for a real state edge and restores on click @smoke', async ({ electronApp, window }, testInfo) => {
  test.skip(!PACKAGED, 'dev stub covers the pipeline; this is the real-Harness check')
  // The window fixture already waited for the real render; the plugin surface
  // proves the harness loaded the desktop-controls bundle. Packaged first
  // boots can render slowly (the fixture allows 120 s) and still navigate,
  // so keep the poll above the default expect timeout and survive a
  // navigation-driven context swap.
  await expect.poll(() => window.evaluate(() => document.querySelector('[data-dsh-desktop-controls]') !== null).catch(() => false), { timeout: 60_000 }).toBe(true)
  await ensureNoticesAvailable(window)
  await instrumentDesktopNotices(electronApp)
  await window.screenshot({ path: testInfo.outputPath('01-real-app.png') })

  // Fresh harness installs show onboarding modals (internal-testing notice,
  // API-key prompt); dismiss each as it appears before driving the UI.
  const dismissOnboarding = async () => {
    for (;;) {
      const blocker = window.getByRole('button', { name: /^(Continue|Configure later)$/, exact: true }).first()
      if (await blocker.count() === 0) break
      await blocker.click().catch(() => undefined)
      await window.waitForTimeout(300)
    }
  }
  await dismissOnboarding()

  const firstRunGuide = window.locator('[data-dsh-first-success-guide]')
  await expect(firstRunGuide).toBeVisible()
  await expect(firstRunGuide.locator('[data-dsh-guide-step]')).toHaveCount(4)
  await expect(firstRunGuide).toContainText('The plugin market is optional')
  await firstRunGuide.getByRole('button', { name: 'Dismiss first-run guide' }).click()
  await expect(firstRunGuide).toHaveCount(0)
  await expect.poll(() => window.evaluate(() => (window as unknown as NoticeBridge).dshDesktop?.getDesktopPreferences()))
    .toMatchObject({ firstRunGuideDismissed: true, firstTaskCompleted: false })

  // The overlay entry is draggable: pointer-drag moves it, must not open the
  // panel, and a clean click afterwards still does.
  const trigger = window.locator('[data-dsh-controls-trigger]')
  await expect(trigger).toBeVisible()
  // Slow packaged boots (Windows CI in particular) can surface a first-run
  // overlay mid-gesture, and an overlay swallows the pointerdown, so the drag
  // moves nothing. Retry only when it did not move; a genuinely broken drag
  // still fails after all attempts.
  let moved = false
  for (let attempt = 0; attempt < 3 && !moved; attempt++) {
    await dismissOnboarding()
    const before = await trigger.boundingBox()
    if (before !== null) {
      await window.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
      await window.mouse.down()
      await window.mouse.move(before.x - 120, before.y + 100, { steps: 8 })
      await window.mouse.up()
      await window.waitForTimeout(200)
      const after = await trigger.boundingBox()
      moved = after !== null && Math.abs(after.x - before.x) > 60 && Math.abs(after.y - before.y) > 40
    }
  }
  expect(moved).toBe(true)
  await expect(window.locator('[data-dsh-controls-panel]')).toHaveCount(0)
  await trigger.click()
  await expect(window.locator('[data-dsh-controls-panel]')).toBeVisible()
  await window.screenshot({ path: testInfo.outputPath('04-desktop-tools-menu.png') })
  await window.keyboard.press('Escape')
  await expect(window.locator('[data-dsh-controls-panel]')).toHaveCount(0)

  // The desktop tools live in their own Settings section now (like
  // General/Models/Plugins), not embedded in General. Scope to the dialog:
  // the page also has the overlay trigger called 'Desktop tools'.
  await window.getByText('Settings', { exact: true }).first().click()
  const desktopSettingsNav = window.locator('[role="dialog"]').getByText('Desktop settings').first()
  await desktopSettingsNav.waitFor({ timeout: 15_000 })
  await desktopSettingsNav.click()
  await expect.poll(() => window.evaluate(() => document.querySelector('[data-dsh-desktop-settings]') !== null
    && document.querySelector('[data-dsh-desktop-lan-row]') !== null
    && document.body.innerText.includes('Summon shortcut'))).toBe(true)
  const settings = window.locator('[data-dsh-desktop-settings]')
  const advancedSettings = settings.locator('[data-dsh-desktop-advanced]')
  await expect(advancedSettings).toHaveCount(1)
  expect(await advancedSettings.getAttribute('open')).toBe(null)
  // The settings surface stays actionable: runtime status is not a setting,
  // Safe Mode is a core recovery action, and dependent start-hidden is absent
  // until launch-at-login is enabled.
  await expect(settings.getByText('Status', { exact: true })).toHaveCount(0)
  await expect(settings.getByText('Start in Safe Mode', { exact: true })).toHaveCount(1)
  await expect(advancedSettings.getByText('Start in Safe Mode', { exact: true })).toHaveCount(0)
  await expect(settings.getByText('Start hidden in the tray', { exact: true })).toHaveCount(0)
  const healthNetwork = settings.getByRole('checkbox', { name: /Also check proxy/ })
  await expect(healthNetwork).not.toBeChecked()
  await settings.getByRole('button', { name: 'Run check' }).click()
  await expect(settings.locator('[data-dsh-health-result]')).toHaveCount(4, { timeout: 15_000 })
  await expect(settings).toContainText('Results stay local and sanitized')
  await settings.screenshot({ path: testInfo.outputPath('02-desktop-preferences.png') })
  await advancedSettings.locator('summary').click()
  await expect.poll(() => window.evaluate(() => document.querySelector('[data-dsh-desktop-advanced]')?.hasAttribute('open') ?? false)).toBe(true)

  // Drive a hidden-window edge through the real page and restore via the notice.
  await reportSessionStatus(window, { sessions: [{ id: 's1', title: 'Research', running: true, jobs: [{ id: 'j1', label: 'Worker', status: 'running' }] }] })
  await hideMainWindow(electronApp)
  await reportSessionStatus(window, { sessions: [{ id: 's1', title: 'Research', running: false, jobs: [{ id: 'j1', label: 'Worker', status: 'running' }] }] })
  await expect.poll(() => readNoticeRecords(electronApp)).toEqual([{ title: 'Task completed', body: 'Research finished.', clicks: 1 }])
  await clickNotice(electronApp, 0)
  await expect.poll(() => mainWindowVisible(electronApp), { timeout: 20_000 }).toBe(true)
  await window.screenshot({ path: testInfo.outputPath('03-restored-by-notice.png') })
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

shellTest('a plugin crash offers recovery rows and disabling one boots again', async ({ electronApp, window, dshHome, relaunch }) => {
  await expect(window.getByRole('heading', { name: 'Harness test workspace' })).toBeVisible()
  // Seed a profile as if dshmarket had been installed: the boot bundle list
  // carries the community package alongside the official ones.
  const profileDir = join(dshHome, 'profiles', 'web')
  await mkdir(profileDir, { recursive: true })
  const manifestPath = join(profileDir, 'package.json')
  const manifest = {
    name: 'dsh-profile-web',
    private: true,
    dependencies: { dshmarket: '^1.36.0' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dshmarket'] } },
  }
  await writeFile(manifestPath, JSON.stringify(manifest))

  // One-shot dev injection (src/main/index.ts boot): the app boots onto the
  // error page with dshmarket named as the suspected failing plugin.
  process.env.DSH_DESKTOP_TEST_FAIL_HARNESS = '1'
  let next
  try {
    next = await relaunch()
    const errorWindow = await next.firstWindow()
    await errorWindow.waitForLoadState('domcontentloaded')
    await expect.poll(async () => errorWindow.evaluate(() => document.body.innerText))
      .toContain('PLUGIN RECOVERY')
    await expect(errorWindow.locator('.plugin-row code', { hasText: 'dshmarket' })).toHaveCount(1)
    // Official bundles are never offered as recovery targets.
    expect(await errorWindow.locator('.plugin-row code').allInnerTexts()).toEqual(['dshmarket'])

    await errorWindow.getByRole('button', { name: 'Disable', exact: true }).click()
    // Recovery disables the bundle and restarts: the stub harness headline
    // returns and the manifest keeps the official bundles without dshmarket.
    await expect(errorWindow.getByRole('heading', { name: 'Harness test workspace' })).toBeVisible({ timeout: 30_000 })
    const updated = JSON.parse(await readFile(manifestPath, 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }
    expect(updated.dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])

    // Guards hold on the live app: official and unlisted names are refused.
    type RecoveryBridge = { disablePlugin(name: string): Promise<boolean>; updatePlugin(name: string): Promise<boolean> }
    const guards = await errorWindow.evaluate(() => {
      const bridge = (window as unknown as { dshDesktop?: RecoveryBridge }).dshDesktop
      if (!bridge) throw new Error('bridge missing')
      return Promise.all([
        bridge.disablePlugin('@deepseek-ai/dsh-base'),
        bridge.updatePlugin('@deepseek-ai/dsh-base'),
        bridge.updatePlugin('never-installed'),
      ])
    })
    expect(guards).toEqual([false, false, false])
  } finally {
    delete process.env.DSH_DESKTOP_TEST_FAIL_HARNESS
    if (next !== undefined) await next.close().catch(() => {})
  }
})

shellTest('LAN pairing shows a scannable QR link for the private address', async ({ electronApp, window }) => {
  await expect(window.getByRole('heading', { name: 'Harness test workspace' })).toBeVisible()
  const { networkInterfaces } = await import('node:os')
  const hasPrivateLan = Object.values(networkInterfaces())
    .flat()
    .some(entry => entry?.family === 'IPv4' && !entry.internal
      && (entry.address.startsWith('10.')
        || /^172\.(1[6-9]|2\d|3[01])\./.test(entry.address)
        || entry.address.startsWith('192.168.')))
  // CI runners expose docker-bridge 172.x addresses that pass the private-LAN
  // probe but are not a usable LAN; this test is a local regression gate.
  test.skip(!hasPrivateLan || process.env.CI === 'true', 'requires a local machine with a real private LAN IPv4 address')

  const opened = await window.evaluate(() => (
    window as unknown as { dshDesktop?: { desktopAction(action: string): Promise<unknown> } }
  ).dshDesktop?.desktopAction('startLanPairing'))
  expect(opened).toBe(true)

  // The pairing window is a shell-owned data: page; find it by title. The QR
  // encodes http://<private-lan>:<port>/launch#pair=<6 digits> while the page
  // shows the same base address and the 6-digit code as text.
  let pairingPage: Page | undefined
  await expect.poll(() => {
    pairingPage = electronApp.windows().find(candidate => candidate.url().startsWith('data:')
      && candidate.isClosed() === false && candidate !== window)
    return pairingPage !== undefined
  }, { timeout: 30_000 }).toBe(true)
  const content = await pairingPage!.evaluate(() => document.body.innerText)
  expect(content).toMatch(/(Address|地址)[:：]\s*http:\/\/\d+\.\d+\.\d+\.\d+:\d+\//)
  expect(content).toMatch(/\d{6}/)
  expect(await pairingPage!.locator('svg[aria-label]').count()).toBe(1)
  await pairingPage!.close().catch(() => {})
  await expect.poll(() => electronApp.windows().some(candidate => candidate !== window
    && candidate.url().startsWith('data:') && !candidate.isClosed()))
    .toBe(false)
  await expect.poll(() => electronApp.windows().some(candidate => candidate !== window
    && candidate.url().startsWith('data:') && !candidate.isClosed()))
    .toBe(false)
})
