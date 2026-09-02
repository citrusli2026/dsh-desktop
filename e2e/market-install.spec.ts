import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { locatePackagedExecutable } from '../scripts/packaged-locator.mjs'

type MarketMode = 'offline' | 'real'
const MODE = process.env.DSH_E2E_MARKET_MODE as MarketMode | undefined

interface MarketFixture {
  electronApp: ElectronApplication
  window: Page
  dshHome: string
  userData: string
}

const marketTest = test.extend<MarketFixture>({
  electronApp: async ({}, use, testInfo) => {
    testInfo.setTimeout(MODE === 'real' ? 600_000 : 300_000)
    const root = await mkdtemp(join(tmpdir(), 'dsh market e2e 中文-'))
    const dshHome = join(root, 'DSH profile 配置')
    const userData = join(root, 'Electron data 数据')
    await mkdir(dshHome, { recursive: true })
    await mkdir(userData, { recursive: true })
    const locale = MODE === 'real' ? 'zh' : 'en'
    const theme = MODE === 'real' ? 'dark' : 'system'
    await writeFile(join(dshHome, 'settings.yaml'), `locale:\n  preference: ${locale}\nui-theme:\n  preference: ${theme}\n`)
    await writeFile(join(userData, 'shell-preferences.json'), '{"closeToTrayExplained":true}\n')
    const executablePath = await locatePackagedExecutable()
    const args = [`--user-data-dir=${userData}`]
    if (process.platform === 'linux') args.push('--no-sandbox')
    const env = { ...process.env, DSH_HOME: dshHome } as Record<string, string>
    if (MODE === 'offline') {
      env.npm_config_registry = 'http://127.0.0.1:9'
      env.npm_config_fetch_retries = '0'
      env.npm_config_fetch_timeout = '2500'
      // Isolate the content-addressable store too; otherwise a developer or
      // runner that installed dshmarket before can satisfy an "offline" test
      // entirely from its global pnpm cache.
      env.npm_config_store_dir = join(root, 'empty pnpm store')
    }
    const app = await electron.launch({ executablePath, args, cwd: process.cwd(), env })
    try {
      await use(app)
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        await app.windows()[0]?.screenshot({ path: testInfo.outputPath('market-window.png') }).catch(() => undefined)
      }
      const closing = app.close().then(() => 'closed', () => 'failed')
      const outcome = await Promise.race([
        closing,
        new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 15_000)),
      ])
      if (outcome === 'timeout') app.process().kill('SIGKILL')
      await chmod(dshHome, 0o755).catch(() => undefined)
      await rm(root, { recursive: true, force: true })
    }
  },
  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await expect.poll(
      () => window.evaluate(() => ({
        boot: document.querySelector('[data-dsh-boot]') !== null,
        failed: document.body.innerText.includes('Failed to load plugins'),
        controls: document.querySelector('[data-dsh-desktop-controls]') !== null,
      })).catch(() => ({ boot: true, failed: false, controls: false })),
      { timeout: 120_000 },
    ).toEqual({ boot: false, failed: false, controls: true })
    await use(window)
  },
  dshHome: async ({ electronApp }, use) => {
    await use(await electronApp.evaluate(() => process.env.DSH_HOME ?? ''))
  },
  userData: async ({ electronApp }, use) => {
    await use(await electronApp.evaluate(({ app }) => app.getPath('userData')))
  },
})

marketTest.skip(MODE === undefined, 'run through a dedicated market E2E script')

async function dismissOnboarding(window: Page): Promise<void> {
  let quietChecks = 0
  while (quietChecks < 4) {
    const button = window.getByRole('button', {
      name: /^(Continue|Configure later|继续|稍后配置|继续使用|稍后设置)$/,
      exact: true,
    }).first()
    if (await button.isVisible().catch(() => false)) {
      await button.click()
      quietChecks = 0
    } else {
      quietChecks += 1
    }
    await window.waitForTimeout(500)
  }
}

async function openExtensionSettings(window: Page): Promise<ReturnType<Page['locator']>> {
  await dismissOnboarding(window)
  const settings = window.locator('[data-dsh-desktop-settings]')
  if (await settings.isVisible().catch(() => false)) return settings
  const settingsDialog = window.getByRole('dialog', { name: /^(Settings|设置)$/ }).first()
  if (!await settingsDialog.isVisible().catch(() => false)) {
    const expandSidebar = window.getByRole('button', { name: /^(Open sidebar|打开侧边栏)$/ }).first()
    if (await expandSidebar.isVisible().catch(() => false)) await expandSidebar.click()
    const settingsButton = window.getByRole('button', { name: /^(Settings|设置)$/ }).first()
    await expect(settingsButton).toBeVisible({ timeout: 15_000 })
    await settingsButton.click()
  }
  await expect(settingsDialog).toBeVisible({ timeout: 15_000 })
  const extensionNav = settingsDialog.getByRole('button', { name: /^(Extensions|扩展设置)$/ }).first()
  await expect(extensionNav).toBeVisible({ timeout: 15_000 })
  await extensionNav.click()
  await expect(settings).toBeVisible({ timeout: 15_000 })
  return settings
}

async function ensureExtensionSettings(window: Page): Promise<ReturnType<Page['locator']>> {
  await dismissOnboarding(window)
  const settings = window.locator('[data-dsh-desktop-settings]')
  if (await settings.isVisible().catch(() => false)) return settings
  return openExtensionSettings(window)
}

async function beginMarketInstall(settings: ReturnType<Page['locator']>, locale: 'en' | 'zh'): Promise<void> {
  const install = locale === 'zh' ? '安装插件市场' : 'Install the market'
  const confirm = locale === 'zh' ? '确认安装' : 'Confirm install'
  await settings.getByRole('button', { name: install, exact: true }).click()
  await expect(settings.getByText(locale === 'zh'
    ? /将从网络下载并运行第三方社区代码/
    : /downloads and runs third-party community code/)).toBeVisible()
  await settings.getByRole('button', { name: confirm, exact: true }).click()
}

marketTest('offline market install is classified, explainable, and retryable @market-offline', async ({ window, dshHome }) => {
  test.skip(MODE !== 'offline', 'run through pnpm test:e2e:market:offline')
  const settings = await openExtensionSettings(window)
  await beginMarketInstall(settings, 'en')
  await expect(async () => {
    const current = await ensureExtensionSettings(window)
    await expect(current.getByText(/plugin registry is unreachable/i)).toBeVisible()
  }).toPass({ timeout: 90_000 })
  const current = await ensureExtensionSettings(window)
  await expect(current.getByRole('button', { name: 'Install the market', exact: true })).toBeEnabled()
  await current.getByText('Show sanitized technical detail', { exact: true }).click()
  const detail = current.locator('[data-dsh-market-technical] code')
  await expect(detail).not.toBeEmpty()
  expect(await detail.textContent()).not.toContain(dshHome)
  await expect(current.getByRole('button', { name: 'Copy technical detail', exact: true })).toBeVisible()
  const manifest = await readFile(join(dshHome, 'profiles', 'web', 'package.json'), 'utf8').catch(() => '')
  expect(manifest).not.toContain('dshmarket')
})

marketTest('real market install survives unicode paths, zh/dark, minimum width, and reports its version @market-real', async ({ electronApp, window }, testInfo) => {
  test.skip(MODE !== 'real', 'run through pnpm test:e2e:market:real')
  const consoleErrors: string[] = []
  window.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(960, 640))
  let settings = await openExtensionSettings(window)
  await beginMarketInstall(settings, 'zh')

  await expect.poll(() => window.evaluate(() => (window as unknown as {
    dshDesktop?: { getBundledPlugins(): Promise<{ lastInstall?: { status: string } } | null> }
  }).dshDesktop?.getBundledPlugins().then(value => value?.lastInstall?.status)).catch(() => undefined), { timeout: 180_000 }).toBe('installed')
  await expect.poll(() => window.evaluate(() => document.querySelector('[data-dsh-desktop-controls]') !== null).catch(() => false), { timeout: 60_000 }).toBe(true)
  settings = await openExtensionSettings(window)
  const status = await window.evaluate(() => (window as unknown as {
    dshDesktop?: { getBundledPlugins(): Promise<{ dshMarket: { state: string; version?: string } } | null> }
  }).dshDesktop?.getBundledPlugins())
  expect(status?.dshMarket.state).toBe('installed')
  expect(status?.dshMarket.version).toMatch(/^\d+\.\d+\.\d+/)
  await expect(settings.getByText(new RegExp(`已安装.*${status?.dshMarket.version ?? ''}`))).toBeVisible()

  const overflow = await settings.evaluate(element => Array.from(element.querySelectorAll('button, small, code'))
    .filter(node => (node as HTMLElement).scrollWidth > (node as HTMLElement).clientWidth)
    .map(node => node.textContent?.trim() ?? ''))
  expect(overflow).toEqual([])
  await window.screenshot({ path: testInfo.outputPath('market-installed-zh-dark-960.png') })
  const unexpected = consoleErrors.filter(message => message !== 'Failed to load resource: net::ERR_INCOMPLETE_CHUNKED_ENCODING')
  expect(unexpected).toEqual([])
})
