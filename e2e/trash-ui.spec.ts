import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { locatePackagedExecutable } from '../scripts/packaged-locator.mjs'

/**
 * Trash UI journey on the packaged build (the trash settings section renders
 * only inside the real Harness WebUI): seeded entries restore and purge with
 * the two-step confirm, retention badges render, and the sessions tab groups
 * archived vs live sessions with delete-to-trash. Tagged @smoke so the
 * packaged suite runs it; skipped elsewhere.
 */
const trashTest = test.extend<{ electronApp: ElectronApplication; window: Page; dshHome: string; root: string }>({
  electronApp: async ({}, use, testInfo) => {
    testInfo.setTimeout(420_000)
    const root = await mkdtemp(join(tmpdir(), 'dsh-trash-e2e-'))
    const dshHome = join(root, 'dsh-home')
    const userData = join(root, 'electron-data')
    await mkdir(userData, { recursive: true })
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000
    // Fresh restorable preset entry (origin parent exists, origin free).
    const freshId = `seed-fresh-${now.toString(36)}`
    const freshOrigin = join(root, 'restore-target', 'old-workspace.dshpreset')
    await mkdir(join(root, 'restore-target'), { recursive: true })
    await mkdir(join(dshHome, 'trash', 'items', freshId), { recursive: true })
    await writeFile(join(dshHome, 'trash', 'items', freshId, 'payload'), 'preset bytes')
    // Expired entry (past the 30-day window) with its stored item.
    const expiredId = `seed-expired-${now.toString(36)}`
    await mkdir(join(dshHome, 'trash', 'items', expiredId), { recursive: true })
    await writeFile(join(dshHome, 'trash', 'items', expiredId, 'payload'), 'old bytes')
    await mkdir(join(dshHome, 'trash'), { recursive: true })
    await writeFile(join(dshHome, 'trash', 'index.json'), JSON.stringify([
      { id: freshId, kind: 'preset', name: 'old-workspace.dshpreset', originPath: freshOrigin, deletedAt: now - 2 * day, source: 'seed' },
      { id: expiredId, kind: 'file', name: 'stale.log', originPath: join(root, 'gone', 'stale.log'), deletedAt: now - 40 * day },
    ], null, 2))
    // Two sessions: one archived, one live.
    await mkdir(join(dshHome, 'sessions', 'proj-a', 'session-livesession1'), { recursive: true })
    await writeFile(join(dshHome, 'sessions', 'proj-a', 'session-livesession1', 'data'), 'x')
    await mkdir(join(dshHome, 'sessions', 'proj-a', 'session-archivedsess'), { recursive: true })
    await writeFile(join(dshHome, 'sessions', 'proj-a', 'session-archivedsess', 'data'), 'x')
    await mkdir(join(dshHome, 'storages'), { recursive: true })
    // Kernel-shaped workspace registry: the workspace plugin validates the
    // unit header and refuses bare objects (missing or foreign unit header).
    await writeFile(join(dshHome, 'storages', 'workspace.json'), JSON.stringify({
      unit: { name: 'workspace', version: 2 },
      global: { initialized: true, workspaceIds: [], archivedSessionIds: ['archivedsess'] },
      tables: { workspaces: {} },
    }))
    await writeFile(join(dshHome, 'settings.yaml'), 'locale:\n  preference: zh\nui-theme:\n  preference: dark\n')
    await writeFile(join(userData, 'shell-preferences.json'), '{"closeToTrayExplained":true}\n')
    const executablePath = await locatePackagedExecutable()
    const args = [`--user-data-dir=${userData}`]
    if (process.platform === 'linux') args.push('--no-sandbox')
    const app = await electron.launch({ executablePath, args, cwd: process.cwd(), env: { ...process.env, DSH_HOME: dshHome } })
    try {
      await use(app)
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        await app.windows()[0]?.screenshot({ path: testInfo.outputPath('trash-window.png') }).catch(() => undefined)
      }
      const closing = app.close().then(() => 'closed', () => 'failed')
      const outcome = await Promise.race([
        closing,
        new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 15_000)),
      ])
      if (outcome === 'timeout') app.process().kill('SIGKILL')
      await rm(root, { recursive: true, force: true })
    }
  },
  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await expect.poll(
      () => window.evaluate(() => ({ controls: document.querySelector('[data-dsh-desktop-controls]') !== null }))
        .catch(() => ({ controls: false })),
      { timeout: 120_000 },
    ).toEqual({ controls: true })
    await use(window)
  },
  dshHome: async ({ electronApp }, use) => {
    await use(await electronApp.evaluate(() => process.env.DSH_HOME ?? ''))
  },
})

trashTest.skip(process.env.DSH_E2E_PACKAGED !== '1' && process.env.DSH_E2E_TRASH !== '1', 'runs in the packaged suite (DSH_E2E_PACKAGED=1) or via DSH_E2E_TRASH=1')

async function openTrashSection(window: Page): Promise<ReturnType<Page['locator']>> {
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
  const trash = window.locator('[data-dsh-trash-section]')
  if (await trash.isVisible().catch(() => false)) return trash
  const settingsDialog = window.getByRole('dialog', { name: /^(Settings|设置)$/ }).first()
  if (!await settingsDialog.isVisible().catch(() => false)) {
    // Kernel 0.1.7+: the Settings entry lives in the bottom-left account
    // popover (avatar row → Settings / Feedback / Sign in). A market install
    // restarts the harness, so wait for the real UI before touching it.
    await expect.poll(() => window.evaluate(() => document.querySelector('[data-dsh-desktop-controls]') !== null).catch(() => false), { timeout: 120_000 }).toBe(true)
    const guideClose = window.locator('[data-dsh-guide-close]')
    // The account row's accessible name is stable across locales/states (aria snapshot).
    const account = window.getByRole('button', { name: /账号菜单|Account menu/ }).first()
    let opened = false
    for (let attempt = 0; attempt < 2 && !opened; attempt++) {
      try {
        // The first-run guide remounts after a restart and mounts a
        // full-window mask (it also closes open popovers) — dismiss it
        // inside every attempt before opening the popover.
        const close = await guideClose.isVisible().catch(() => false)
        if (close) await guideClose.click().catch(() => undefined)
        await expect(account).toBeVisible({ timeout: 60_000 })
        await account.click()
        const entry = window.getByText(/^(Settings|设置)$/, { exact: true }).first()
        await expect(entry).toBeVisible({ timeout: 8_000 })
        await entry.click()
        opened = true
      } catch {
        await window.waitForTimeout(1_500)
      }
    }
    if (!opened) {
      // Fallback: older layouts exposed a sidebar Settings button.
      const expandSidebar = window.getByRole('button', { name: /^(Open sidebar|打开侧边栏)$/ }).first()
      if (await expandSidebar.isVisible().catch(() => false)) await expandSidebar.click()
      const settingsButton = window.getByRole('button', { name: /^(Settings|设置)$/ }).first()
      await expect(settingsButton).toBeVisible({ timeout: 15_000 })
      await settingsButton.click()
    }
  }
  await expect(settingsDialog).toBeVisible({ timeout: 15_000 })
  const trashNav = settingsDialog.getByRole('button', { name: /^(Trash|垃圾桶)$/ }).first()
  await expect(trashNav).toBeVisible({ timeout: 15_000 })
  await trashNav.click()
  await expect(trash).toBeVisible({ timeout: 15_000 })
  return trash
}

trashTest('trash UI restores and purges through the design system @smoke', async ({ window, dshHome }) => {
  const trash = await openTrashSection(window)

  // Design system + tab semantics + retention countdown on the fresh entry.
  await expect(trash.locator('[role="tablist"]')).toBeVisible()
  const freshRow = trash.locator('[data-dsh-desktop-setting-label]').filter({ hasText: 'old-workspace.dshpreset' })
  await expect(freshRow).toBeVisible()
  await expect(trash.locator('[data-dsh-trash-badge]', { hasText: '预设' })).toBeVisible()
  await expect(freshRow.getByText(/天后自动清除|今日自动清除/)).toBeVisible()

  // Boot retention sweep: the entry seeded past the 30-day window was purged
  // by the shell at start-up, before this UI ever rendered.
  const staleRow = trash.locator('[data-dsh-desktop-setting-label]').filter({ hasText: 'stale.log' })
  await expect(staleRow).toHaveCount(0)
  const index = await readFile(join(dshHome, 'trash', 'index.json'), 'utf8')
  expect(index).not.toContain('stale.log')

  // Restore: the fresh entry goes back to its origin, and the index drops it.
  await trash.getByRole('button', { name: '还原', exact: true }).first().click()
  await expect(freshRow).toHaveCount(0, { timeout: 15_000 })
  await expect.poll(() => existsSync(join(dshHome, '..', 'restore-target', 'old-workspace.dshpreset'))).toBe(true)
  const indexAfterRestore = await readFile(join(dshHome, 'trash', 'index.json'), 'utf8')
  expect(indexAfterRestore).not.toContain('old-workspace.dshpreset')

  // Sessions tab: grouped archived/live, delete-to-trash (recoverable).
  await trash.getByRole('tab', { name: /^会话 \(\d+\)$/ }).click()
  await expect(trash.getByText(/此处列出本机全部会话/)).toBeVisible()
  await expect(trash.getByText(/已归档 \(\d+\)/)).toBeVisible()
  const archivedRow = trash.locator('[data-dsh-desktop-setting-label]').filter({ hasText: 'archivedsess' })
  const liveRow = trash.locator('[data-dsh-desktop-setting-label]').filter({ hasText: 'livesession1' })
  await expect(archivedRow).toBeVisible()
  await expect(liveRow).toBeVisible()
  await trash.getByRole('button', { name: '删除（入桶）', exact: true }).last().click()
  await expect(liveRow).toHaveCount(0, { timeout: 15_000 })
  const indexAfterSession = await readFile(join(dshHome, 'trash', 'index.json'), 'utf8')
  expect(indexAfterSession).toContain('session-livesession1')

  // Resources tab: the trashed session shows up; purging it runs the
  // two-step confirm and leaves no seeded item directories behind.
  await trash.getByRole('tab', { name: /^资源 \(\d+\)$/ }).click()
  const sessionRow = trash.locator('[data-dsh-desktop-setting-label]').filter({ hasText: 'session-livesession1' })
  await expect(sessionRow).toBeVisible()
  await trash.getByRole('button', { name: '彻底删除', exact: true }).first().click()
  await expect(trash.getByText('确认永久删除？此操作不可恢复。')).toBeVisible()
  await trash.getByRole('button', { name: '确认', exact: true }).first().click()
  await expect(sessionRow).toHaveCount(0, { timeout: 15_000 })
  await expect(trash.getByText('垃圾桶是空的')).toBeVisible()
  const items = await readdir(join(dshHome, 'trash', 'items'))
  expect(items.filter(name => name.startsWith('seed-'))).toEqual([])
})
