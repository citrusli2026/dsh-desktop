import { _electron as electron, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { locatePackagedExecutable } from './scripts/packaged-locator.mjs'

const root = mkdtempSync(join(tmpdir(), 'dsh-mktprobe-'))
const dshHome = join(root, 'home'); const userData = join(root, 'data')
mkdirSync(dshHome, { recursive: true }); mkdirSync(userData, { recursive: true })
writeFileSync(join(userData, 'shell-preferences.json'), '{"closeToTrayExplained":true}\n')
const exe = await locatePackagedExecutable()
const app = await electron.launch({ executablePath: exe, args: [`--user-data-dir=${userData}`], cwd: process.cwd(), env: { ...process.env, DSH_HOME: dshHome } })
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await expect.poll(() => win.evaluate(() => document.querySelector('[data-dsh-desktop-controls]') !== null).catch(() => false), { timeout: 120_000 }).toBe(true)
const started = await win.evaluate(() => (window.dshDesktop).desktopAction('installDshMarket'))
console.log('install returned:', JSON.stringify(started).slice(0, 300))
const result = await win.evaluate(() => (window.dshDesktop).getBundledPlugins())
console.log('bundled:', JSON.stringify(result).slice(0, 500))
await app.close().catch(() => {})
