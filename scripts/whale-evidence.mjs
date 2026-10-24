/** Local macOS visual evidence for the real whale plugin (not CI).
 *  Requires a prepared plugin in WHALE_PLUGIN_DIR and screen-recording permission.
 *  Writes annotated screenshots + a 32s screen recording under artifacts/.
 */
import { _electron as electron } from '@playwright/test'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn, execFileSync } from 'node:child_process'
import sharp from 'sharp'
import { locatePackagedExecutable } from '/Users/citrus/dsh-desktop/scripts/packaged-locator.mjs'

const PLUGIN = process.env.WHALE_PLUGIN_DIR
if (!PLUGIN) { console.error('WHALE_PLUGIN_DIR is required'); process.exit(2) }
if (process.platform !== 'darwin') { console.error('macOS only: uses screencapture'); process.exit(2) }
const STAMP = process.env.WHALE_EVIDENCE_DATE ?? new Date().toISOString().slice(0, 10)
const OUT = `/Users/citrus/dsh-desktop/artifacts/whale-companion-${STAMP}`
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

await mkdir(OUT, { recursive: true })
const root = await mkdtemp(join(tmpdir(), 'dsh-whale-evidence-'))
const home = join(root, 'home')
const userData = join(root, 'data')
await mkdir(home, { recursive: true })
await mkdir(userData, { recursive: true })
await writeFile(join(home, 'settings.yaml'), 'locale:\n  preference: zh\nui-theme:\n  preference: light\n')
await writeFile(join(userData, 'shell-preferences.json'), JSON.stringify({ closeToTrayExplained: true, firstRunGuideDismissed: true }) + '\n')
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
const page = await app.firstWindow()
await page.waitForSelector('[data-dsh-desktop-controls]', { timeout: 180_000 })

const area = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
const main = await app.browserWindow(page)
const bounds = {
  x: area.x + 40,
  y: area.y + 40,
  width: Math.min(1240, area.width - 80),
  height: Math.min(820, area.height - 80),
}
await main.evaluate((win, b) => { win.setBounds(b); win.show(); win.focus() }, bounds)
// A full-screen neutral stage keeps the recording free of whatever desktop
// windows happen to sit behind the test app.
await app.evaluate(({ BrowserWindow, screen }, stamp) => {
  const area = screen.getPrimaryDisplay().workArea
  const html = '<!doctype html><html><head><meta charset="utf-8"><style>'
    + 'html,body{margin:0;height:100%;overflow:hidden;background:linear-gradient(135deg,#eef2ff,#f8fafc 45%,#e0f2fe);font-family:-apple-system,"PingFang SC",sans-serif}'
    + 'body::before{content:"";position:absolute;inset:0;background-image:radial-gradient(#c7d2fe 1px,transparent 1px);background-size:24px 24px;opacity:.45}'
    + '.label{position:absolute;left:32px;bottom:28px;color:#475569;font-size:14px;letter-spacing:.04em;background:rgba(255,255,255,.72);border:1px solid rgba(148,163,184,.35);padding:8px 12px;border-radius:10px}'
    + '</style></head><body><div class="label">dsh-desktop · 伴随窗口回归演示 · ' + stamp + '</div></body></html>'
  const stage = new BrowserWindow({
    x: area.x, y: area.y, width: area.width, height: area.height,
    frame: false, resizable: false, movable: false, focusable: false,
    skipTaskbar: true, hasShadow: false, show: false,
    webPreferences: { sandbox: true, contextIsolation: true },
  })
  stage.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  stage.showInactive()
  return stage.id
}, STAMP)
await main.evaluate(win => { win.moveTop(); win.show(); win.focus() })
await sleep(1200)
const guideClose = page.getByRole('button', { name: /关闭首次使用引导|Dismiss first-run guide/ })
if (await guideClose.count()) await guideClose.first().click().catch(() => {})
await sleep(800)

await page.locator('.dshwv-root').first().waitFor({ state: 'visible', timeout: 60_000 })

async function caption(target, text, small = false) {
  await target.evaluate(({ t, tiny }) => {
    let el = document.getElementById('evidence-caption')
    if (!el) {
      el = document.createElement('div')
      el.id = 'evidence-caption'
      document.body.appendChild(el)
    }
    el.textContent = t
    Object.assign(el.style, {
      position: 'fixed', top: tiny ? '8px' : '14px', left: tiny ? '8px' : '50%',
      right: tiny ? '8px' : 'auto', transform: tiny ? 'none' : 'translateX(-50%)',
      zIndex: '2147483647', background: 'rgba(15,23,42,.92)', color: '#fff',
      padding: tiny ? '7px 10px' : '10px 18px', borderRadius: '10px',
      font: `${tiny ? 600 : 700} ${tiny ? 13 : 16}px/1.45 -apple-system, "PingFang SC", "Helvetica Neue", sans-serif`,
      textAlign: 'center', pointerEvents: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.28)',
      whiteSpace: 'nowrap',
    })
  }, { t: text, tiny: small })
}

async function outlineWhale(target) {
  await target.evaluate(() => {
    const el = document.querySelector('.dshwv-root')
    if (el) {
      el.style.outline = '3px solid #ef4444'
      el.style.outlineOffset = '4px'
      el.style.borderRadius = '16px'
    }
  })
}

function shot(name) {
  const path = join(OUT, name)
  execFileSync('screencapture', ['-x', '-R', `${area.x},${area.y},${area.width},${area.height}`, path])
  return path
}

const results = {}
try {
  await caption(page, '① 主窗口：小鲸鱼在右下角')
  await outlineWhale(page)
  await sleep(1200)
  shot('01-main.png')
  results.main = 'ok'

  await rm(join(OUT, 'flow.mov'), { force: true })
  const rec = spawn('screencapture', ['-x', '-v', '-k', '-R', `${area.x},${area.y},${area.width},${area.height}`, '-V', '32', join(OUT, 'flow.mov')], { stdio: 'ignore' })
  await sleep(1200)

  const pending = app.waitForEvent('window', { predicate: win => win.url().includes('/dsh-whale/pet'), timeout: 60_000 })
  await main.evaluate(win => win.minimize())
  const pet = await pending
  await pet.locator('.dshwv-pet-min').waitFor({ state: 'visible', timeout: 60_000 })
  await caption(pet, '② 最小化：伴窗留在桌面右下角', true)
  await sleep(4200)
  shot('02-minimized.png')
  const petPng = await pet.screenshot({ omitBackground: true })
  const meta = await sharp(petPng).metadata()
  const framed = await sharp({
    create: { width: (meta.width ?? 560) + 40, height: (meta.height ?? 620) + 40, channels: 4, background: { r: 226, g: 232, b: 240, alpha: 1 } },
  }).composite([{ input: petPng, left: 20, top: 20 }]).png().toBuffer()
  await writeFile(join(OUT, '02b-pet-window.png'), framed)
  results.pet = pet.url()

  await pet.locator('.dshwv-pet-min').click()
  await main.evaluate(win => { win.restore(); win.show(); win.focus() })
  await caption(page, '③ 点 −：主窗口恢复，伴窗自动收起')
  await sleep(2800)
  shot('03-restored.png')
  results.restored = 'ok'

  await page.locator('[data-dsh-controls-trigger]').click()
  const group = page.locator('[data-dsh-controls-group="companions"]')
  await group.scrollIntoViewIfNeeded()
  await group.evaluate(el => {
    el.style.outline = '3px solid #22c55e'
    el.style.outlineOffset = '3px'
  })
  await caption(page, '④ 面板：伴随窗口分组可手动开关')
  await sleep(2600)
  shot('04-panel.png')

  await group.getByRole('button', { name: /小鲸鱼/ }).click()
  await sleep(2200)
  await caption(page, '⑤ 面板开关：随时收回 / 打开伴窗')
  shot('05-toggle.png')
  results.toggle = 'ok'
  await group.getByRole('button', { name: /小鲸鱼/ }).click()
  await sleep(1200)

  await new Promise(resolve => rec.on('exit', resolve))
} finally {
  await writeFile(join(OUT, 'results.json'), JSON.stringify(results, null, 2) + '\n')
  await app.close().catch(() => {})
  await rm(root, { recursive: true, force: true })
}
console.log('EVIDENCE', OUT)
console.log('RESULTS', JSON.stringify(results))
