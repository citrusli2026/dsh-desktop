/** Local screenshots for the built-in whale toggle (macOS, packaged build).
 *  Drives the real settings UI: off → enable → restart → whale → pet.
 */
import { _electron as electron } from '@playwright/test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { locatePackagedExecutable } from './packaged-locator.mjs'

const STAMP = process.env.WHALE_EVIDENCE_DATE ?? new Date().toISOString().slice(0, 10)
const OUT = `/Users/citrus/dsh-desktop/artifacts/whale-builtin-${STAMP}`
const sleep = ms => new Promise(r => setTimeout(r, ms))
await mkdir(OUT, { recursive: true })

const root = await mkdtemp(join(tmpdir(), 'dsh-whale-builtin-evidence-'))
const home = join(root, 'home')
const userData = join(root, 'data')
await mkdir(home, { recursive: true })
await mkdir(userData, { recursive: true })
await writeFile(join(home, 'settings.yaml'), 'locale:\n  preference: zh\nui-theme:\n  preference: light\n')
await writeFile(join(userData, 'shell-preferences.json'), JSON.stringify({ closeToTrayExplained: true, firstRunGuideDismissed: true }))

const app = await electron.launch({
  executablePath: await locatePackagedExecutable(),
  args: [`--user-data-dir=${userData}`],
  env: { ...process.env, DSH_HOME: home },
})
try {
  const page = await app.firstWindow()
  await page.waitForSelector('[data-dsh-desktop-controls]', { timeout: 180_000 })
  const main = await app.browserWindow(page)
  await main.evaluate(win => win.setContentSize(1280, 900))
  await sleep(1500)

  await page.getByRole('button', { name: /账号菜单|Account menu/ }).click()
  await page.getByText(/^(设置|Settings)$/, { exact: true }).first().click()
  const settings = page.getByRole('dialog', { name: /^(设置|Settings)$/ })
  await settings.getByText('桌面设置', { exact: true }).click()
  const group = page.locator('section[data-dsh-desktop-group="extensions"]')
  await group.waitFor()
  await group.scrollIntoViewIfNeeded()
  await sleep(600)
  await group.screenshot({ path: join(OUT, '01-settings-off.png') })

  await group.locator('[data-dsh-whale-toggle] input').click()
  await sleep(800)
  await group.screenshot({ path: join(OUT, '02-settings-on.png') })

  await app.evaluate(({ dialog }) => {
    (dialog).showMessageBox = async () => ({ response: 0, checkboxChecked: false })
  })
  await group.locator('[data-dsh-whale-restart]').click()
  await page.locator('.dshwv-root').waitFor({ state: 'visible', timeout: 180_000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: join(OUT, '03-main-whale.png') })

  const pending = app.waitForEvent('window', { predicate: w => w.url().includes('/dsh-whale/pet'), timeout: 120_000 })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.minimize())
  const pet = await pending
  await pet.locator('.dshwv-pet-min').waitFor({ state: 'visible', timeout: 60_000 })
  await pet.screenshot({ path: join(OUT, '04-pet.png'), omitBackground: true })
  const raw = await pet.screenshot({ omitBackground: true })
  const meta = await sharp(raw).metadata()
  await sharp({ create: { width: (meta.width ?? 560) + 40, height: (meta.height ?? 620) + 40, channels: 4, background: { r: 226, g: 232, b: 240, alpha: 1 } } })
    .composite([{ input: raw, left: 20, top: 20 }]).png().toFile(join(OUT, '04b-pet-framed.png'))

  console.log('EVIDENCE', OUT)
} finally {
  await app.close().catch(() => {})
  await rm(root, { recursive: true, force: true })
}
