/**
 * Real-registry plugin-recovery E2E (packaged, @market-real): an on-disk
 * dshmarket bundle throws during composition, the shell auto-quarantines it
 * and boots, then the recovery bridge pulls the real latest version from npm,
 * re-enables it, and boots the harness for real.
 *
 * The recovery IPC accepts only the main window, so this flow exercises the
 * same update-and-restart path exposed by the recovery banner.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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
    // Seed a deterministic broken dshmarket on disk. A missing dependency no
    // longer fails current Harness startup, so it cannot prove quarantine.
    const profileDir = join(dshHome, 'profiles', 'web')
    const brokenDir = join(profileDir, 'node_modules', 'dshmarket')
    await mkdir(profileDir, { recursive: true })
    await mkdir(brokenDir, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-web',
      private: true,
      dependencies: { dshmarket: 'file:dshmarket' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dshmarket'] } },
    }))
    await writeFile(join(brokenDir, 'package.json'), JSON.stringify({
      name: 'dshmarket',
      version: '0.0.0',
      type: 'module',
      main: 'index.js',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    await writeFile(join(brokenDir, 'cordis.patch.yml'), '- insert:\n    - id: dsh-market\n      name: dshmarket\n')
    await writeFile(join(brokenDir, 'index.js'), "export default class { constructor() { throw new Error('BROKEN_DSHMARKET_E2E') } }\n")
    const executablePath = await locatePackagedExecutable()
    const args = [`--user-data-dir=${userData}`]
    if (process.platform === 'linux') args.push('--no-sandbox')
    const app = await electron.launch({
      executablePath,
      args,
      cwd: process.cwd(),
      env: { ...process.env, DSH_HOME: dshHome } as Record<string, string>,
    })
    let mainOutput = ''
    for (const stream of [app.process().stdout, app.process().stderr]) {
      stream?.on('data', chunk => { mainOutput = `${mainOutput}${String(chunk)}`.slice(-20_000) })
    }
    try {
      await use(app)
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        await app.windows()[0]?.screenshot({ path: testInfo.outputPath('recovery-window.png') }).catch(() => undefined)
        await testInfo.attach('main-process.log', { body: mainOutput, contentType: 'text/plain' })
        await testInfo.attach('harness.log', {
          body: await readFile(join(userData, 'logs', 'harness.log')).catch(() => Buffer.from('missing')),
          contentType: 'text/plain',
        })
        await testInfo.attach('profile-package.json', {
          body: await readFile(join(dshHome, 'profiles', 'web', 'package.json')).catch(() => Buffer.from('missing')),
          contentType: 'application/json',
        })
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

recoveryTest('auto-quarantine Update pulls the real latest plugin and boots @market-real', async ({ window, dshHome }) => {
  // The broken bundle is removed from the boot list and Harness comes back;
  // its suspect remains actionable through the recovery bridge.
  await expect(window.locator('[data-dsh-boot]')).toHaveCount(0, { timeout: 300_000 })
  await expect.poll(() => window.evaluate(() => (window as unknown as {
    dshDesktop?: { getRecoverySuspects(): Promise<Array<{ id: string; name?: string }> | null> }
  }).dshDesktop?.getRecoverySuspects().then(rows => (rows ?? []).map(row => row.name ?? row.id))).catch(() => []), { timeout: 60_000 })
    .toContain('dshmarket')
  const quarantined = JSON.parse(await import('node:fs/promises').then(fs => fs.readFile(join(dshHome, 'profiles', 'web', 'package.json'), 'utf8'))) as {
    dsh?: { profile?: { bundles?: string[] } }
  }
  expect(quarantined.dsh?.profile?.bundles).not.toContain('dshmarket')

  await window.getByRole('button', { name: '继续', exact: true }).click({ timeout: 30_000 })
  await window.getByRole('button', { name: '稍后配置', exact: true }).click({ timeout: 30_000 })
  const recoveryBanner = window.locator('[data-dsh-safe-mode-banner]')
  await expect(recoveryBanner).toContainText('问题插件已自动隔离')
  await recoveryBanner.getByRole('button', { name: '升级并重新启用', exact: true }).click()
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
