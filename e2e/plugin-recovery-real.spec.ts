/**
 * Real-registry plugin-recovery E2E (packaged, @market-real): a profile whose
 * bundle list references dshmarket without the package on disk fails to boot,
 * the error page lists it as a suspect, and the Update button pulls the real
 * latest version from npm and boots the harness for real.
 *
 * The recovery IPC is deliberately error-page-only (isMainWindowSender, never
 * the live Harness page), so this flow is the only honest way to exercise it
 * against the real registry.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { locatePackagedExecutable } from '../scripts/packaged-locator.mjs'

const MODE = process.env.DSH_E2E_MARKET_MODE

interface RecoveryFixture {
  electronApp: ElectronApplication
  window: Page
  dshHome: string
}

const recoveryTest = test.extend<RecoveryFixture>({
  electronApp: async ({}, use, testInfo) => {
    testInfo.setTimeout(600_000)
    const root = await mkdtemp(join(tmpdir(), 'dsh plugin recovery e2e 中文-'))
    const dshHome = join(root, 'DSH profile 配置')
    const userData = join(root, 'Electron data 数据')
    await mkdir(dshHome, { recursive: true })
    await mkdir(userData, { recursive: true })
    await writeFile(join(dshHome, 'settings.yaml'), 'locale:\n  preference: zh\nui-theme:\n  preference: dark\n')
    await writeFile(join(userData, 'shell-preferences.json'), '{"closeToTrayExplained":true}\n')
    // Seed the upgrade cliff: dshmarket is in the boot bundle list but the
    // package was never installed, so the very first boot cannot compose it.
    const profileDir = join(dshHome, 'profiles', 'web')
    await mkdir(profileDir, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-web',
      private: true,
      dependencies: { dshmarket: '^1.36.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dshmarket'] } },
    }))
    const executablePath = await locatePackagedExecutable()
    const args = [`--user-data-dir=${userData}`]
    if (process.platform === 'linux') args.push('--no-sandbox')
    const app = await electron.launch({
      executablePath,
      args,
      cwd: process.cwd(),
      env: { ...process.env, DSH_HOME: dshHome } as Record<string, string>,
    })
    try {
      await use(app)
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        await app.windows()[0]?.screenshot({ path: testInfo.outputPath('recovery-window.png') }).catch(() => undefined)
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
    await use(window)
  },
  dshHome: async ({ electronApp }, use) => {
    await use(await electronApp.evaluate(() => process.env.DSH_HOME ?? ''))
  },
})

recoveryTest.skip(MODE !== 'real', 'run through pnpm test:e2e:market:real')

recoveryTest('error-page Update pulls the real latest plugin and boots @market-real', async ({ window, dshHome }) => {
  // Crash loop reaches the recovery center; the suspect row names dshmarket.
  // The page navigates (loading → error → …); tolerate destroyed contexts.
  await expect.poll(async () => window.evaluate(() => document.body.innerText).catch(() => ''), { timeout: 180_000 })
    .toContain('插件恢复')
  const row = window.locator('.plugin-row', { hasText: 'dshmarket' })
  await expect(row).toHaveCount(1)

  await row.getByRole('button', { name: '升级', exact: true }).click()
  // The update runs the real 'dsh plugin add dshmarket@latest' and restarts
  // the packaged harness, which now composes the freshly installed market.
  await expect(window.locator('[data-dsh-boot]')).toHaveCount(0, { timeout: 300_000 })
  await expect.poll(() => window.evaluate(() => (window as unknown as {
    dshDesktop?: { getBundledPlugins(): Promise<{ dshMarket: { state: string; version?: string } } | null> }
  }).dshDesktop?.getBundledPlugins().then(value => value?.dshMarket)).catch(() => undefined), { timeout: 60_000 })
    .toEqual(expect.objectContaining({ state: 'installed' }))

  // The installed version must be a real published release. It is not pinned
  // to the dist-tag: pnpm's registry metadata can trail a just-published
  // version, which is acceptable for a recovery update.
  const published = await fetch('https://registry.npmjs.org/dshmarket', { signal: AbortSignal.timeout(15_000) })
    .then(response => response.json() as Promise<{ versions?: Record<string, unknown> }>)
  expect(typeof published.versions).toBe('object')
  await expect.poll(async () => {
    const version = await window.evaluate(() => (window as unknown as {
      dshDesktop?: { getBundledPlugins(): Promise<{ dshMarket: { version?: string } } | null> }
    }).dshDesktop?.getBundledPlugins().then(value => value?.dshMarket.version)).catch(() => undefined)
    return version !== undefined && Object.hasOwn(published.versions ?? {}, version)
  }, { timeout: 60_000 }).toBe(true)
  const manifest = await import('node:fs/promises').then(fs => fs.readFile(join(dshHome, 'profiles', 'web', 'package.json'), 'utf8'))
  expect(manifest).toContain('dshmarket')
})
