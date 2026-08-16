#!/usr/bin/env node
/**
 * Capture real application screenshots (light + dark) for the website.
 * Boots the packaged desktop shell with an isolated DSH_HOME, waits for the
 * real Harness UI, and writes PNGs to site/assets/shots/.
 *
 * Usage: node scripts/capture-site-shots.mjs
 */
import { _electron as electron } from '@playwright/test'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'site', 'assets', 'shots')
const PACKAGED_BIN = join(ROOT, 'dist', 'mac-arm64', 'dsh-desktop.app', 'Contents', 'MacOS', 'dsh-desktop')

const THEMES = ['light', 'dark']

async function capture(theme) {
  const root = await mkdtemp(join(tmpdir(), `dsh-shots-${theme}-`))
  const dshHome = join(root, 'dsh-home')
  const userData = join(root, 'electron-data')
  await mkdir(dshHome, { recursive: true })
  await mkdir(userData, { recursive: true })
  await writeFile(
    join(dshHome, 'settings.yaml'),
    `locale:\n  preference: zh\nui-theme:\n  preference: ${theme}\n`,
  )
  await writeFile(join(userData, 'shell-preferences.json'), '{"closeToTrayExplained":true}\n')

  const launch = existsSync(PACKAGED_BIN)
    ? { executablePath: PACKAGED_BIN, args: [`--user-data-dir=${userData}`] }
    : { args: ['.', `--user-data-dir=${userData}`], cwd: ROOT }

  const app = await electron.launch({
    ...launch,
    env: { ...process.env, DSH_HOME: dshHome },
    timeout: 120_000,
  })
  try {
    const window = await app.firstWindow({ timeout: 60_000 })
    // Wait until the loading page is replaced by the real Harness URL.
    await window.waitForURL(/^http:\/\/127\.0\.0\.1:/, { timeout: 120_000 })
    await window.waitForLoadState('domcontentloaded')
    await window.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
    await window.waitForTimeout(3000)
    // Dismiss the first-run beta notice so the real workspace is visible.
    const continueButton = window.getByRole('button', { name: /继续|Continue/i })
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click()
      await window.waitForTimeout(2500)
    }
    // Dismiss the optional API-key prompt as well.
    const laterButton = window.getByRole('button', { name: /稍后配置|Later/i })
    if (await laterButton.isVisible().catch(() => false)) {
      await laterButton.click()
      await window.waitForTimeout(2500)
    }
    await window.waitForTimeout(1500)
    const out = join(OUT_DIR, `app-main-${theme}.png`)
    await window.screenshot({ path: out })
    console.log(`captured ${out}`)

    // A second real state: the Harness settings view.
    const settingsButton = window.getByRole('button', { name: /设置|Settings/i }).last()
    if (await settingsButton.isVisible().catch(() => false)) {
      await settingsButton.click()
      await window.waitForTimeout(3000)
      const settingsOut = join(OUT_DIR, `app-settings-${theme}.png`)
      await window.screenshot({ path: settingsOut })
      console.log(`captured ${settingsOut}`)
    }
  } finally {
    await app.close().catch(() => {})
  }
}

await mkdir(OUT_DIR, { recursive: true })
for (const theme of THEMES) await capture(theme)
console.log('done')
