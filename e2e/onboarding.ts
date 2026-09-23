/** Shared onboarding-modal dismissal for packaged E2E (fresh DSH_HOME boots). */
import { expect, type Page } from '@playwright/test'

// Kernel 0.1.7 boots with the welcome notice's Continue disabled while its
// settings read/save waits out the boot-time legacy-settings import lock; on
// slow CI disks that takes ~30 s, and the imported locale remounts the modal
// mid-wait (zh ⇄ en copy swap, DOM detach). So: match both languages, wait
// for any ENABLED match with a generous bound instead of letting click()
// burn its whole timeout on the disabled node about to be replaced, and keep
// looping until no modal has been visible for four consecutive checks.
const ONBOARDING_DISMISS = /^(Continue|Configure later|继续|稍后配置|继续使用|稍后设置)$/

export async function dismissOnboardingModals(window: Page): Promise<void> {
  let quietChecks = 0
  while (quietChecks < 4) {
    const button = window.getByRole('button', { name: ONBOARDING_DISMISS, exact: true }).first()
    if (await button.isVisible().catch(() => false)) {
      const clickable = window.getByRole('button', { name: ONBOARDING_DISMISS, exact: true })
        .and(window.locator('button:enabled')).first()
      await expect(clickable).toBeVisible({ timeout: 90_000 })
      await clickable.click()
      quietChecks = 0
    } else {
      quietChecks += 1
    }
    await window.waitForTimeout(500)
  }
}
