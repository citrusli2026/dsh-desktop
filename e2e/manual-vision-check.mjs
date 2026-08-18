/** One-off real-harness verification: boot the shell against the bundled dsh,
 * probe /modlens/config, open the vision settings UI, and screenshot it. */
import { _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dshHome = await mkdtemp(join(tmpdir(), 'dsh-real-vision-'))
const userData = await mkdtemp(join(tmpdir(), 'dsh-real-vision-data-'))
const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  cwd: process.cwd(),
  env: { ...process.env, DSH_HOME: dshHome },
})
try {
  const window = await app.firstWindow()
  // Wait until the real harness is serving (supervisor follows the ready URL).
  let harnessUrl = ''
  for (let i = 0; i < 90; i += 1) {
    harnessUrl = window.url()
    if (harnessUrl.startsWith('http://127.0.0.1')) break
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  console.log('harness URL:', harnessUrl)
  if (!harnessUrl.startsWith('http://127.0.0.1')) throw new Error('harness never became ready')
  const base = harnessUrl.replace(/\/+$/, '')

  const res = await fetch(`${base}/modlens/config?discover`)
  console.log('GET /modlens/config?discover ->', res.status, res.headers.get('content-type'))
  const data = await res.json()
  console.log('summary keys:', Object.keys(data).join(','), '| discovery:', Array.isArray(data.discovery) ? data.discovery.length : data.discovery)

  const labels = await app.evaluate(({ Menu }) => {
    const collect = (items) => items.flatMap(item => [item.label, ...(item.submenu == null ? [] : collect(item.submenu.items))])
    return collect(Menu.getApplicationMenu()?.items ?? [])
  })
  const target = labels.find(l => l.includes('Vision Settings') || l.includes('视觉设置'))
  console.log('menu item:', target)
  await app.evaluate(({ Menu }, targetLabel) => {
    const find = (items) => {
      for (const item of items) {
        if (item.label === targetLabel) return item
        if (item.submenu != null) { const f = find(item.submenu.items); if (f) return f }
      }
      return undefined
    }
    find(Menu.getApplicationMenu()?.items ?? [])?.click()
  }, target)
  const settings = await app.waitForEvent('window')
  await settings.waitForLoadState('domcontentloaded')
  await settings.waitForTimeout(3000) // let the config GET + render settle
  await settings.screenshot({ path: '/tmp/vision-ui-1.png' })
  console.log('settings page title:', await settings.title())
  console.log('screenshot: /tmp/vision-ui-1.png')

  // Wizard flow: grant every detected-and-signed-in harness (claude, pi…),
  // so Next lands on step 3 with the best chance of a working engine.
  const rows = settings.locator('#reuse-list .row')
  const rowCount = await rows.count()
  for (let i = 0; i < rowCount; i += 1) {
    const row = rows.nth(i)
    const text = await row.textContent()
    if (text != null && (text.includes('已找到') || text.includes('Found'))) {
      await row.getByRole('checkbox').check()
    }
  }
  await settings.getByRole('button', { name: /^(继续|Next)$/ }).click()
  await settings.waitForTimeout(500)
  await settings.screenshot({ path: '/tmp/vision-ui-2.png' })
  const testButton = settings.getByRole('button', { name: /^(开始测试|Run test)$/ })
  if (await testButton.count() > 0) {
    await testButton.click()
    console.log('vision test running (up to 120s)…')
    await settings.locator('#finish').waitFor({ state: 'visible', timeout: 120_000 }).catch(() => {})
    await settings.screenshot({ path: '/tmp/vision-ui-3.png' })
    const status = await settings.locator('#step3-status').textContent().catch(() => '')
    console.log('step3 status:', status)
    const hints = await settings.locator('#step3-hints').textContent().catch(() => '')
    if (hints !== null && hints.trim() !== '') console.log('step3 hints:', hints.trim())
  }
  // Diagnosis runs the local-only doctor; its report is the log evidence
  // that verifies which engines are usable and why the test failed.
  const diagnosis = settings.getByRole('button', { name: /^(诊断|Diagnosis)$/ })
  if (await diagnosis.count() > 0) {
    await diagnosis.click()
    await settings.locator('#step3-diagnosis-report').waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
    const report = await settings.locator('#step3-diagnosis-report').textContent().catch(() => '')
    console.log('=== modlens doctor report ===')
    console.log(report)
  }
  // Form view after guide completion (or forced via pref).
  await app.evaluate(({ app: electronApp }) => {
    const fs = process.getBuiltinModule('node:fs')
    const path = process.getBuiltinModule('node:path')
    fs.writeFileSync(
      path.join(electronApp.getPath('userData'), 'shell-preferences.json'),
      '{"closeToTrayExplained":true,"visionGuideCompleted":true}\n',
    )
  })
  await settings.getByRole('button', { name: /^(关闭|完成|Close|Finish)$/ }).first().click().catch(() => {})
  await window.waitForTimeout(800)
  await app.evaluate(({ Menu }, targetLabel) => {
    const find = (items) => {
      for (const item of items) {
        if (item.label === targetLabel) return item
        if (item.submenu != null) { const f = find(item.submenu.items); if (f) return f }
      }
      return undefined
    }
    find(Menu.getApplicationMenu()?.items ?? [])?.click()
  }, target)
  const form = await app.waitForEvent('window')
  await form.waitForLoadState('domcontentloaded')
  await form.waitForTimeout(3000)
  await form.screenshot({ path: '/tmp/vision-ui-4.png' })
  console.log('form page title:', await form.title())
  console.log('screenshots: /tmp/vision-ui-2.png /tmp/vision-ui-3.png /tmp/vision-ui-4.png')
} finally {
  await app.close().catch(() => {})
  await rm(dshHome, { recursive: true, force: true })
  await rm(userData, { recursive: true, force: true })
}
