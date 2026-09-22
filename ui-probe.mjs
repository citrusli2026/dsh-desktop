import { _electron as electron, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { locatePackagedExecutable } from './scripts/packaged-locator.mjs'

const root = mkdtempSync(join(tmpdir(), 'dsh-uiprobe-'))
const dshHome = join(root, 'home'); const userData = join(root, 'data')
mkdirSync(dshHome, { recursive: true }); mkdirSync(userData, { recursive: true })
writeFileSync(join(dshHome, 'settings.yaml'), 'locale:\n  preference: zh\nui-theme:\n  preference: dark\n')
writeFileSync(join(userData, 'shell-preferences.json'), '{"closeToTrayExplained":true}\n')
const exe = await locatePackagedExecutable()
const app = await electron.launch({ executablePath: exe, args: [`--user-data-dir=${userData}`], cwd: process.cwd(), env: { ...process.env, DSH_HOME: dshHome } })
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await expect.poll(() => win.evaluate(() => document.querySelector('[data-dsh-desktop-controls]') !== null).catch(() => false), { timeout: 120_000 }).toBe(true)
const guideClose = win.locator('[data-dsh-guide-close]')
if (await guideClose.isVisible().catch(() => false)) await guideClose.click().catch(() => undefined)
const account = win.getByText(/^(Not signed in|尚未登录|未登录)$/, { exact: true }).first()
await expect(account).toBeVisible({ timeout: 15_000 })
await account.evaluate(el => el.click())
await win.waitForTimeout(1500)
const dump = await win.evaluate(() => {
  const items = []
  document.querySelectorAll('body *').forEach(el => {
    const own = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('')
    if (/^(设置|Settings|反馈|登录)$/.test(own)) items.push({ tag: el.tagName, role: el.getAttribute('role'), cls: (el.className||'').toString().slice(0,36), own })
  })
  return { items: items.slice(0, 10), tail: document.body.innerText.slice(-260) }
})
console.log(JSON.stringify(dump, null, 1))
await win.screenshot({ path: 'ui-probe-zh.png' })
await app.close().catch(() => {})
