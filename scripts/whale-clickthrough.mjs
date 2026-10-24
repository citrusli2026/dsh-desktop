/** macOS-only evidence check: the companion's transparent area passes real OS
 *  clicks through to the desktop, while clicks on the whale stay in the window.
 *
 *  Posts HID events with CoreGraphics, so the terminal needs Accessibility
 *  permission; without it the posted clicks are silently dropped and both
 *  counters stay 0 (reported as inconclusive, exit 1).
 *
 *  Requires a prepared plugin in WHALE_PLUGIN_DIR (see docs/companion-windows.md)
 *  and a packaged build (pnpm run dist:dir).
 */
import { _electron as electron } from '@playwright/test'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { locatePackagedExecutable } from './packaged-locator.mjs'

const PLUGIN = process.env.WHALE_PLUGIN_DIR
if (!PLUGIN) { console.error('WHALE_PLUGIN_DIR is required'); process.exit(2) }
if (process.platform !== 'darwin') { console.error('macOS only (CoreGraphics HID events)'); process.exit(2) }

const SWIFT = `
import CoreGraphics
import Foundation
let mode = CommandLine.arguments[1]
if mode == "lock" {
  let d = CGSessionCopyCurrentDictionary() as? [String: Any]
  print(d?["CGSSessionScreenIsLocked"] as? Int ?? 0)
  exit(0)
}
let x = Double(CommandLine.arguments[2])!
let y = Double(CommandLine.arguments[3])!
let p = CGPoint(x: x, y: y)
CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
usleep(120_000)
if mode != "move" {
  CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
  usleep(60_000)
  CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
}
`
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const root = await mkdtemp(join(tmpdir(), 'dsh-clickthrough-'))
// Private temp dir (mkdtemp), never a predictable path in the shared tmp dir.
const swiftPath = join(root, 'click.swift')
writeFileSync(swiftPath, SWIFT, { mode: 0o600 })
const post = (mode, x, y) => execFileSync('swift', [swiftPath, mode, String(Math.round(x)), String(Math.round(y))], { encoding: 'utf8' })
const locked = () => execFileSync('swift', [swiftPath, 'lock', '0', '0'], { encoding: 'utf8' }).trim() === '1'
// Posted HID events never reach app windows while the screen is locked, so
// fail before launching anything instead of reporting a bogus 0-click result.
if (locked()) {
  console.error('screen is locked — unlock the Mac and rerun this check')
  await rm(root, { recursive: true, force: true })
  process.exit(3)
}
const home = join(root, 'home')
const userData = join(root, 'data')
await mkdir(home, { recursive: true })
await mkdir(userData, { recursive: true })
await writeFile(join(home, 'settings.yaml'), 'locale:\n  preference: zh\n')
await writeFile(join(userData, 'shell-preferences.json'), JSON.stringify({ closeToTrayExplained: true, firstRunGuideDismissed: true }))
const profile = join(home, 'profiles', 'web')
const dest = join(profile, 'node_modules', 'dsh-whale-widget')
await mkdir(dest, { recursive: true })
await cp(PLUGIN, dest, { recursive: true })
await writeFile(join(profile, 'cordis.patch.yml'), '- insert:\n    - id: dsh-whale-widget\n      name: dsh-whale-widget\n')

const app = await electron.launch({
  executablePath: await locatePackagedExecutable(),
  args: [`--user-data-dir=${userData}`],
  env: { ...process.env, DSH_HOME: home },
})
try {
  const page = await app.firstWindow()
  await page.waitForSelector('[data-dsh-desktop-controls]', { timeout: 180_000 })
  const mainId = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.id ?? -1)

  // Positive control: a full-screen stage window behind the companion counts clicks.
  await app.evaluate(({ BrowserWindow, screen }) => {
    const area = screen.getPrimaryDisplay().workArea
    const html = '<!doctype html><body style="margin:0;height:100vh;background:#2563eb">'
      + '<script>window.clicks=0;addEventListener("click",()=>{window.clicks++})</script>'
    const win = new BrowserWindow({ x: area.x, y: area.y, width: area.width, height: area.height, frame: false, focusable: false, skipTaskbar: true, show: false })
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    win.showInactive()
  })
  const stageClicks = async () => app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('data:'))
    return win === undefined ? -1 : await win.webContents.executeJavaScript('window.clicks')
  })

  const pending = app.waitForEvent('window', { predicate: w => w.url().includes('/dsh-whale/pet'), timeout: 60_000 })
  await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.minimize(), mainId)
  const pet = await pending
  await pet.locator('.dshwv-pet-min').waitFor({ state: 'visible', timeout: 60_000 })
  await pet.waitForTimeout(1500)
  const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/dsh-whale/pet'))?.getBounds())
  const whale = await pet.evaluate(() => {
    const r = document.querySelector('.dshwv-img').getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await pet.evaluate(() => { window.__clicks = 0; document.addEventListener('click', () => { window.__clicks++ }, true) })


  // 1. Transparent corner: the click must reach the stage, not the companion.
  post('click', bounds.x + 40, bounds.y + 40)
  await sleep(400)
  const afterTransparent = await stageClicks()

  // 2. Whale: hovering flips the window back to interactive, so the click stays here.
  post('move', bounds.x + whale.x, bounds.y + whale.y)
  await sleep(300)
  post('click', bounds.x + whale.x, bounds.y + whale.y)
  await sleep(500)
  const afterWhale = await stageClicks()
  const petClicks = await pet.evaluate(() => window.__clicks)

  const result = {
    transparentClickPassedThrough: afterTransparent === 1,
    whaleClickStayedInCompanion: afterWhale === 1 && petClicks >= 1,
    stageClicks: afterWhale,
    petClicks,
  }
  console.log('RESULT', JSON.stringify(result))
  if (!result.transparentClickPassedThrough && afterWhale === 0 && petClicks === 0) {
    console.error('inconclusive: no clicks were delivered — check Accessibility permission for the terminal')
    process.exitCode = 1
  } else if (!result.transparentClickPassedThrough || !result.whaleClickStayedInCompanion) {
    process.exitCode = 1
  }
} finally {
  await app.close().catch(() => {})
  await rm(root, { recursive: true, force: true })
}
