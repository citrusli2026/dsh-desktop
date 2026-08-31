/** Capture the website's product screenshots from the current packaged app. */
import { _electron as electron, expect } from '@playwright/test'
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { locatePackagedExecutable } from './packaged-locator.mjs'

const outputDir = resolve(process.argv[2] ?? 'site/assets/shots')
const executablePath = resolve(await locatePackagedExecutable())
const root = await mkdtemp(join(tmpdir(), 'dsh-site-shots-'))
const displayHome = '~/.dsh-desktop'

await mkdir(outputDir, { recursive: true })

async function dismissOnboarding(page) {
  for (;;) {
    const blocker = page.getByRole('button', {
      name: /^(Continue|Configure later|继续|稍后配置|继续使用|稍后设置)$/,
      exact: true,
    }).first()
    if (await blocker.count() === 0 || !(await blocker.isVisible().catch(() => false))) break
    await blocker.click().catch(() => undefined)
    await page.waitForTimeout(300)
  }
}

async function capture(locale, theme) {
  const captureRoot = await mkdtemp(join(root, `${locale}-${theme}-`))
  const home = join(captureRoot, `${locale}-${theme}-home`)
  const userData = join(captureRoot, 'user-data')
  await mkdir(home, { recursive: true })
  await mkdir(userData, { recursive: true })
  await writeFile(join(home, 'settings.yaml'), `locale:\n  preference: ${locale}\nui-theme:\n  preference: ${theme}\n`)
  await writeFile(join(userData, 'shell-preferences.json'), '{"closeToTrayExplained":true}\n')

  const args = [`--user-data-dir=${userData}`]
  if (process.platform === 'linux') args.push('--no-sandbox')
  const app = await electron.launch({
    executablePath,
    args,
    cwd: process.cwd(),
    env: { ...process.env, DSH_HOME: home },
  })
  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect.poll(
      () => page.evaluate(() => ({
        failed: document.body.innerText.includes('Failed to load plugins'),
        control: document.querySelector('input, textarea, [role="textbox"]') !== null,
      })).catch(() => ({ failed: true, control: false })),
      { timeout: 120_000 },
    ).toEqual({ failed: false, control: true })
    await dismissOnboarding(page)
    await page.waitForTimeout(500)
    await expect(page.locator('[data-dsh-desktop-controls]')).toBeVisible({ timeout: 60_000 })
    // A fresh Harness profile can reveal its one-time modal after the shell
    // controls mount. Clear it again before clicking through the real UI.
    await dismissOnboarding(page)

    const suffix = `${locale}-${theme}`
    await page.screenshot({ path: join(outputDir, `app-main-${suffix}.png`), animations: 'disabled' })

    const trigger = page.locator('[data-dsh-controls-trigger]')
    await expect(trigger).toBeVisible()
    await trigger.click()
    await expect(page.locator('[data-dsh-controls-panel]')).toBeVisible()
    await page.screenshot({ path: join(outputDir, `app-controls-${suffix}.png`), animations: 'disabled' })
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-dsh-controls-panel]')).toHaveCount(0)

    const settingsLabel = locale === 'en' ? 'Settings' : '设置'
    const extensionsLabel = locale === 'en' ? 'Extensions' : '扩展设置'
    const settingsButton = page.getByText(settingsLabel, { exact: true }).first()
    await settingsButton.click({ force: true, timeout: 10_000 })
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await dialog.getByText(extensionsLabel, { exact: true }).first().click()
    await expect(page.locator('[data-dsh-desktop-settings]')).toBeVisible()
    await expect(page.locator('[data-dsh-desktop-lan-row]')).toBeVisible()
    await page.locator('[data-dsh-desktop-settings]').evaluate((root, paths) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      const nodes = []
      while (walker.nextNode()) nodes.push(walker.currentNode)
      for (const node of nodes) node.nodeValue = node.nodeValue?.replaceAll(paths.actual, paths.display) ?? null
    }, { actual: home, display: displayHome })
    const options = page.locator('.VOzbGW_options').first()
    await expect(options).toBeVisible()
    const advanced = page.locator('[data-dsh-desktop-advanced]').first()
    await expect(advanced).toHaveCount(1)
    expect(await advanced.getAttribute('open')).toBe(null)
    await expect(page.locator('[data-dsh-desktop-settings]').getByText(locale === 'en' ? 'Status' : '状态', { exact: true })).toHaveCount(0)
    await expect(page.locator('[data-dsh-desktop-settings]').getByText(locale === 'en' ? 'Start in Safe Mode' : '以安全模式启动', { exact: true })).toHaveCount(1)
    const settingsCapture = join(captureRoot, `app-extension-settings-${suffix}.png`)
    await options.screenshot({
      path: settingsCapture,
      animations: 'disabled',
    })
    // The host settings surface is taller than the two 16:9-ish app captures.
    // Keep the real controls, but crop the quiet lower area so every carousel
    // frame has the same 2560x1720 aspect ratio.
    const normalizedSettings = await sharp(settingsCapture)
      .resize(2560, 1720, { fit: 'cover', position: 'top' })
      .png()
      .toBuffer()
    await writeFile(join(outputDir, `app-extension-settings-${suffix}.png`), normalizedSettings)
    await unlink(settingsCapture)
    console.log(`captured ${suffix}`)
  } finally {
    await app.close().catch(() => {})
    await rm(captureRoot, { recursive: true, force: true })
  }
}

try {
  for (const locale of ['zh', 'en']) {
    for (const theme of ['light', 'dark']) await capture(locale, theme)
  }
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log(`screenshots written to ${outputDir}`)
