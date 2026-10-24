import { test, expect, type Page } from '@playwright/test'
import { launchTrashHarness } from './trash-harness.ts'
import { loadingPageHtml, errorPageHtml } from '../src/main/pages.ts'
import { pairingPageMarkup } from '../src/main/lan-page.ts'
import { asDataUrl } from '../src/main/shell-html.ts'

const packaged = process.env.DSH_E2E_PACKAGED === '1'

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

async function primaryContrast(page: Page, selector: string) {
  const ratios = await page.locator(selector).evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element)
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
      return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722
    }
    const a = luminance(style.color), b = luminance(style.backgroundColor)
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
  }))
  for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5)
}

for (const locale of ['zh', 'en'] as const) {
  test(`first-run guide and safe-mode banner ${locale} @desktop-ui @smoke`, async ({}, info) => {
    info.setTimeout(150_000)
    const harness = await launchTrashHarness(packaged, { locale, theme: locale === 'zh' ? 'light' : 'dark', firstRunGuideDismissed: false, safeMode: true })
    try {
      const { page } = harness
      await expect(page.locator('[data-dsh-safe-mode-banner]')).toContainText(locale === 'zh' ? '安全模式：第三方插件已隔离' : 'Safe Mode')
      const guide = page.locator('[data-dsh-first-success-guide]')
      await expect(guide).toBeVisible()
      await expect(guide.locator('li')).toHaveCount(4)
      await page.screenshot({ path: info.outputPath('first-run-safe-mode.png') })
      const bounds = await guide.boundingBox()
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)
      await guide.getByRole('button', { name: locale === 'zh' ? '关闭首次使用引导' : 'Dismiss first-run guide' }).click()
      await expect(guide).toHaveCount(0)
      expect(harness.requests).toBe(0)
    } finally { await harness.close() }
  })
}

for (const locale of ['zh', 'en'] as const) for (const theme of ['light', 'dark'] as const) {
  test(`custom desktop UI ${locale} ${theme} @desktop-ui @smoke`, async ({}, info) => {
    info.setTimeout(150_000)
    const harness = await launchTrashHarness(packaged, { locale, theme })
    const { page, app } = harness
    const zh = locale === 'zh'
    const entryName = zh ? '飞书连接' : 'Feishu connections'
    const manageName = zh ? '管理应用／扫码创建' : 'Manage applications / create with QR'
    try {
      const main = await app.browserWindow(page)
      await main.evaluate(win => win.setContentSize(1200, 900))
      // Truthful empty state: no saved application, disabled intent, unknown
      // channel, and a read-only open. Opening the panel must not connect.
      await page.locator('[data-dsh-controls-trigger]').click()
      const emptyPanel = page.locator('[data-dsh-controls-panel]')
      const emptyQuick = emptyPanel.locator('[data-dsh-feishu-quick]')
      await expect(emptyQuick).toBeVisible()
      await expect(emptyQuick).toHaveAttribute('data-state', 'disabled')
      await expect(emptyQuick.locator('[data-dsh-feishu-quick-app]')).toContainText(zh ? '未选择应用' : 'No application selected')
      await expect(emptyQuick.locator('[data-dsh-feishu-process]')).toHaveAttribute('data-state', 'disabled')
      await expect(emptyQuick.locator('[data-dsh-feishu-channel]')).toHaveAttribute('data-state', 'unknown')
      await expect(emptyQuick.locator('[data-dsh-feishu-hint]')).toContainText(zh ? '不会自动连接' : 'never connects automatically')
      await expect(emptyQuick.locator('[data-dsh-feishu-start]')).toBeDisabled()
      await expect(emptyQuick.locator('[data-dsh-feishu-restart]')).toHaveCount(0)
      // The INFO group is the panel's only persistent product link surface
      // (About + the GitHub star row); capture it so the release gate covers it
      // on every platform rather than trusting that nothing moved.
      const infoGroup = emptyPanel.locator('section[data-dsh-controls-group="info"]')
      await infoGroup.scrollIntoViewIfNeeded()
      const infoRows = infoGroup.locator('[data-dsh-controls-actions] > *')
      await expect(infoRows).toHaveCount(2)
      await expect(infoRows.nth(1)).toContainText(zh ? '在 GitHub 上 Star' : 'Star on GitHub')
      await infoGroup.screenshot({ path: info.outputPath('desktop-tools-info.png') })
      await page.keyboard.press('Escape')
      await expect(emptyPanel).toHaveCount(0)
      await expect(page.locator('[data-dsh-controls-trigger]')).toBeFocused()
      await page.getByRole('button', { name: /账号菜单|Account menu/ }).click()
      await page.getByText(/^(设置|Settings)$/, { exact: true }).first().click()
      const settings = page.getByRole('dialog', { name: /^(设置|Settings)$/ })
      await settings.getByText(entryName, { exact: true }).click()
      const section = page.locator('[data-dsh-feishu-settings]')
      await expect(section).toBeVisible()
      await expect(section.getByRole('button', { name: manageName, exact: true })).toHaveCSS('background-color', 'rgb(77, 107, 254)')
      await expect(section.getByRole('button', { name: manageName, exact: true })).toHaveCSS('border-radius', '999px')
      await expect(section).toContainText(zh ? '进入此页不会自动连接' : 'Visiting this page does not connect automatically')
      const pending = app.waitForEvent('window')
      await section.getByRole('button', { name: manageName, exact: true }).click()
      const manager = await pending
      await expect(manager.locator('#generate')).toBeEnabled()
      await manager.emulateMedia({ colorScheme: theme })
      await primaryContrast(manager, 'button.primary')
      const managerWindow = await app.browserWindow(manager)
      await managerWindow.evaluate(win => win.setContentSize(600, 650))
      await expect(manager.locator('#manual')).not.toHaveAttribute('open', '')
      await expect(manager.locator('#display > summary')).toBeVisible()
      // Message preferences are discoverable independently of manual credentials.
      await manager.locator('#display > summary').click()
      await expect(manager.getByRole('combobox', { name: zh ? '消息详细度' : 'Message detail', exact: true })).toHaveValue('compact')
      await manager.getByRole('checkbox', { name: zh ? '流式预览' : 'Streaming preview', exact: true }).uncheck()
      await expect(manager.locator('#streamPreviewIntervalMs')).toBeDisabled()
      await expect(manager.locator('#manual')).not.toHaveAttribute('open', '')
      await noHorizontalOverflow(manager)
      await manager.screenshot({ path: info.outputPath('feishu-empty-narrow.png'), fullPage: true })
      await expect(manager.locator('#save')).toBeVisible()
      await expect(manager.locator('#save-open')).toBeVisible()
      await manager.locator('#save').click()
      // An empty workspace is refused before IPC and explained at the field
      // (#124); the shared #message node stays empty for this path.
      await expect(manager.locator('#workspace-error')).not.toBeEmpty()
      await expect(manager.locator('#workspace')).toHaveAttribute('aria-invalid', 'true')
      await manager.screenshot({ path: info.outputPath('feishu-error-narrow.png'), fullPage: true })
      const managerId = await managerWindow.evaluate(win => win.id)
      await app.evaluate(({ Menu }) => {
        const visit = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => {
          for (const item of items) {
            if (/^(管理飞书连接…|Manage Feishu connections…)$/.test(item.label)) return item
            const child = item.submenu && visit(item.submenu.items)
            if (child) return child
          }
        }
        const item = visit(Menu.getApplicationMenu()!.items)
        if (!item) throw new Error('Feishu menu entry missing')
        item.click(undefined, undefined, undefined)
      })
      expect(await managerWindow.evaluate(win => win.id)).toBe(managerId)
      expect(app.windows()).toHaveLength(2)
      await app.evaluate(({ dialog }, workspace) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [workspace] }) }, harness.workspace)
      await manager.locator('#choose').click()
      await manager.locator('#name').fill('UI-review-' + 'LongApplicationName'.repeat(5))
      await manager.locator('#manual > summary').click()
      await manager.locator('#appId').fill('cli_ui_review_fake')
      await manager.locator('#appSecret').fill('fake-ui-review-secret')
      await manager.locator('#save').click()
      await expect(manager.locator('article')).toHaveCount(1)
      await expect(manager.locator('#appSecret')).toHaveValue('')
      await expect(manager.locator('#process')).toHaveText(zh ? '已关闭' : 'Closed')
      await noHorizontalOverflow(manager)
      await manager.screenshot({ path: info.outputPath('feishu-saved-narrow.png'), fullPage: true })
      await manager.close()
      await page.screenshot({ path: info.outputPath('settings-feishu.png') })

      await settings.getByText(zh ? '桌面设置' : 'Desktop settings', { exact: true }).click()
      await expect(page.locator('[data-dsh-desktop-settings]')).toBeVisible()
      await page.screenshot({ path: info.outputPath('settings-desktop-wide.png') })
      await main.evaluate(win => win.setContentSize(960, 700))
      await expect(page.locator('[data-dsh-desktop-connect]')).toBeVisible()
      await page.screenshot({ path: info.outputPath('settings-desktop-minimum.png') })
      await page.locator('[data-dsh-desktop-group="recovery"]').scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath('settings-recovery.png') })
      await page.locator('[data-dsh-desktop-advanced] > summary').click()
      await page.locator('[data-dsh-runtime-panel]').scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath('settings-advanced-runtime.png') })
      await settings.getByText(zh ? '垃圾桶' : 'Trash', { exact: true }).click()
      await expect(page.locator('[data-dsh-trash-section]')).toBeVisible()
      await page.screenshot({ path: info.outputPath('settings-trash.png') })
      await page.keyboard.press('Escape')

      const trigger = page.locator('[data-dsh-controls-trigger]')
      await trigger.click()
      const panel = page.locator('[data-dsh-controls-panel]')
      await expect(panel.getByRole('button', { name: new RegExp(entryName) })).toBeVisible()
      const pendingAgain = app.waitForEvent('window')
      await panel.getByRole('button', { name: new RegExp(entryName) }).click()
      const managerAgain = await pendingAgain
      await expect(managerAgain.locator('#generate')).toBeEnabled()
      await expect(panel).toHaveCount(0)
      await managerAgain.close()

      // Dragging the entry is supported; the expanded menu must still fit.
      const box = await trigger.boundingBox()
      expect(box).not.toBeNull()
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
      await page.mouse.down()
      // Keep the drag clear of the whale widget's bottom-right corner so the
      // follow-up click exercises the menu, not an overlapping overlay.
      await page.mouse.move(600, 420, { steps: 12 })
      await page.mouse.up()
      await trigger.click()
      await expect(panel).toBeVisible()
      // Floating Feishu quick control after the manager saved (but never
      // started) an application: the name is visible, the explicit close keeps
      // starting available, and reconnect stays intent-bound.
      const quick = panel.locator('[data-dsh-feishu-quick]')
      await expect(quick).toBeVisible()
      await expect(quick).toHaveAttribute('data-state', 'disabled')
      await expect(quick.locator('[data-dsh-feishu-quick-app]')).toContainText('UI-review-LongApplicationName')
      await expect(quick.locator('[data-dsh-feishu-process]')).toHaveAttribute('data-state', 'disabled')
      await expect(quick.locator('[data-dsh-feishu-channel]')).toHaveAttribute('data-state', 'unknown')
      await expect(quick.locator('[data-dsh-feishu-hint]')).toContainText(zh ? '连接已显式关闭' : 'explicitly closed')
      const start = quick.locator('[data-dsh-feishu-start]')
      await expect(start).toBeEnabled()
      await expect(start).toHaveAttribute('title', zh ? /连接已显式关闭/ : /explicitly closed/)
      await expect(quick.locator('[data-dsh-feishu-restart]')).toHaveCount(0)
      await expect(quick.locator('[data-dsh-feishu-manage]')).toBeVisible()
      expect(await page.evaluate(() => (window as any).dshDesktop.getConnectState())).toMatchObject({ enabled: false, phase: 'disabled' })
      expect(await quick.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await page.screenshot({ path: info.outputPath('floating-feishu-closed.png') })
      await page.screenshot({ path: info.outputPath('floating-menu-bottom.png') })
      const bounds = await panel.boundingBox()
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.y).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)
      await panel.getByRole('button', { name: new RegExp(zh ? '^关于' : '^About') }).scrollIntoViewIfNeeded()
      await expect(panel.getByRole('button', { name: new RegExp(zh ? '^关于' : '^About') })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(panel).toHaveCount(0)
      await expect(trigger).toBeFocused()
      await main.evaluate(win => win.setContentSize(960, 600))
      await expect.poll(async () => {
        const rect = await trigger.boundingBox()
        return rect !== null && rect.y + rect.height <= await page.evaluate(() => innerHeight)
      }).toBe(true)
      expect(await page.evaluate(() => (window as any).dshDesktop.getConnectState())).toMatchObject({ enabled: false, phase: 'disabled' })
      expect(harness.requests).toBe(0)

      // Pure shell renderers in an isolated sandbox: visual states only, no
      // real crash, network listener, pairing token or recovery action.
      const baseUrl = 'http://192.0.2.10:3081'
      const pairing = { baseUrl, pairingUrl: baseUrl + '/pair?token=fake-visual-only', pairingUrls: [baseUrl],
        code: '123456', expiresInSeconds: 600, expiresAt: Date.now() + 600_000, lanAddress: '192.0.2.10', listenPort: 3081 }
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="white"/><path d="M5 5h30v30H5zm60 0h30v30H65zM5 65h30v30H5zm40-20h10v10H45z" fill="black"/></svg>'
      const catalog = [
        ['loading', loadingPageHtml(locale, 'retrying', 3000)],
        ['recovery', errorPageHtml(3, 'Visual-only failure: ' + 'long-diagnostic-line/'.repeat(20), false, [{ id: 'visual-plugin', name: 'visual-only-package' }], locale, 'kernel-api')],
        ['lan-pairing', asDataUrl(pairingPageMarkup(pairing, [{ svg, kind: 'lan', url: pairing.pairingUrl }, { svg, kind: 'vpn', url: 'http://198.51.100.2:3081/pair?token=fake-visual-only' }], locale))],
      ] as const
      for (const [name, url] of catalog) {
        const pendingPreview = app.waitForEvent('window')
        await app.evaluate(({ BrowserWindow }, url) => {
          const win = new BrowserWindow({ width: 500, height: 720, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
          win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
          void win.loadURL(url)
        }, url)
        const preview = await pendingPreview
        await preview.waitForLoadState('domcontentloaded')
        await preview.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        await expect(preview.locator('main')).toBeVisible()
        await noHorizontalOverflow(preview)
        await primaryContrast(preview, 'button:not(.secondary)')
        await preview.screenshot({ path: info.outputPath(name + '.png'), fullPage: true })
        await preview.close()
      }
    } finally { await harness.close() }
  })
}
