import { test, expect } from '@playwright/test'
import { launchTrashHarness } from './trash-harness.ts'

/**
 * The floating desktop-tools panel is a quick launcher, not a settings page:
 * every action must stay reachable without scrolling at a normal window
 * height. The 2026-11 redesign moved the four utility groups into a
 * two-column grid, kept the two connect entries full width, and folded the
 * Feishu card into a one-row summary.
 *
 * Budget: the empty-state panel measured 886px before the redesign and 486px
 * after, so 540px fails loudly on any regression while leaving room for the
 * optional companions group and a running LAN pairing row.
 */
const MAX_PANEL_HEIGHT = 540

for (const locale of ['zh', 'en'] as const) {
  test(`desktop tools panel stays compact ${locale} @desktop-ui`, async ({}, info) => {
    info.setTimeout(150_000)
    const harness = await launchTrashHarness(false, { locale, theme: locale === 'zh' ? 'light' : 'dark' })
    const { page, app } = harness
    try {
      const main = await app.browserWindow(page)
      await main.evaluate(win => win.setContentSize(1200, 900))
      await page.locator('[data-dsh-controls-trigger]').click()
      const panel = page.locator('[data-dsh-controls-panel]')
      await expect(panel).toBeVisible()

      const measure = await panel.evaluate(element => {
        const height = (selector: string) => {
          const node = element.querySelector<HTMLElement>(selector)
          return node === null ? 0 : Math.round(node.getBoundingClientRect().height)
        }
        const rowTop = (selector: string) => Array.from(element.querySelectorAll<HTMLElement>(selector))
          .map(node => Math.round(node.getBoundingClientRect().top))
        return {
          panel: Math.round(element.getBoundingClientRect().height),
          head: height('[data-dsh-controls-panel-head]'),
          connect: height('section[data-dsh-controls-group="connect"]'),
          recovery: height('section[data-dsh-controls-group="recovery"]'),
          maintenance: height('section[data-dsh-controls-group="maintenance"]'),
          info: height('section[data-dsh-controls-group="info"]'),
          feishu: height('[data-dsh-feishu-quick]'),
          actions: element.querySelectorAll('[data-dsh-controls-action]').length,
          connectRows: rowTop('section[data-dsh-controls-group="connect"] [data-dsh-controls-action]'),
          infoRows: rowTop('section[data-dsh-controls-group="info"] [data-dsh-controls-action]'),
        }
      })
      console.log(`[${locale}] panel ${measure.panel}px (head ${measure.head}, connect ${measure.connect} incl. feishu ${measure.feishu}, recovery ${measure.recovery}, maintenance ${measure.maintenance}, info ${measure.info}); ${measure.actions} actions`)

      await panel.screenshot({ path: info.outputPath(`desktop-tools-panel-${locale}.png`) })
      expect(measure.panel).toBeLessThanOrEqual(MAX_PANEL_HEIGHT)
      // Utility groups pair their actions on one row; the two connect entries
      // stay full width, so they stack instead of squeezing their labels.
      expect(measure.infoRows[0]).toBe(measure.infoRows[1])
      expect(measure.connectRows[1]).toBeGreaterThan(measure.connectRows[0])
      // The whole palette fits the 900px window without a scrollbar.
      expect(await panel.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true)
    } finally {
      await harness.close()
    }
  })
}
