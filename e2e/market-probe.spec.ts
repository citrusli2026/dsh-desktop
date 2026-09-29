// Diagnostic probe for the packaged market install. Runs only when
// explicitly enabled — the default suites skip it:
//
//   pnpm run build && DSH_MARKET_PROBE=1 pnpm exec playwright test -g @market-probe
//
// It launches the packaged app with a fresh unicode DSH_HOME, calls
// `desktopAction('installDshMarket')` through the real IPC guard, and prints
// the full MarketInstallResult (status / reason / detail) — the piece the
// market:real E2E assertion hides behind `install-failed`. Use it when the
// market install regresses (e.g. a kernel bump adds install-time peer
// enforcement and the plugin ecosystem lags; see HANDOFF §68/§69).
import { test } from '@playwright/test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'
import { locatePackagedExecutable } from '../scripts/packaged-locator.mjs'
import { WELCOME_ACKNOWLEDGED_YAML } from './onboarding.ts'

interface MarketBridge {
  desktopAction: (action: string) => Promise<unknown>
  onMarketInstallProgress: (callback: (progress: unknown) => void) => () => void
}

test('market install probe prints the full install result @market-probe', async () => {
  test.skip(process.env.DSH_MARKET_PROBE !== '1', 'diagnostic probe: set DSH_MARKET_PROBE=1 (and build dist first) to run')
  test.setTimeout(600_000)
  const root = await mkdtemp(join(tmpdir(), 'dsh market probe 中文-'))
  const dshHome = join(root, 'DSH profile 配置')
  const userData = join(root, 'Electron data 数据')
  await mkdir(dshHome, { recursive: true })
  await mkdir(userData, { recursive: true })
  await writeFile(join(dshHome, 'settings.yaml'), 'locale:\n  preference: zh\nui-theme:\n  preference: dark\n' + WELCOME_ACKNOWLEDGED_YAML)
  await writeFile(join(userData, 'shell-preferences.json'), '{"closeToTrayExplained":true}\n')
  const executablePath = await locatePackagedExecutable()
  const app = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${userData}`],
    cwd: process.cwd(),
    env: { ...process.env, DSH_HOME: dshHome },
  })
  try {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    // Mirror the market spec's readiness contract: boot finished, controls
    // rendered (the desktopAction IPC only accepts that window's frame).
    const deadline = Date.now() + 120_000
    for (;;) {
      const state = await window.evaluate(() => ({
        boot: document.querySelector('[data-dsh-boot]') !== null,
        controls: document.querySelector('[data-dsh-desktop-controls]') !== null,
      })).catch(() => ({ boot: true, controls: false }))
      if ((!state.boot && state.controls) || Date.now() > deadline) break
      await new Promise(resolve => setTimeout(resolve, 2_000))
    }
    const result = await window.evaluate(async () => {
      const api = (window as unknown as { dshDesktop: MarketBridge }).dshDesktop
      // Poll a harmless action until the harness-origin guard accepts the
      // sender (returns undefined once accepted, false before).
      for (let i = 0; i < 90; i += 1) {
        const probe = await api.desktopAction('probe-sender-validity')
        if (probe !== false) break
        await new Promise(resolve => setTimeout(resolve, 2_000))
      }
      const events: string[] = []
      api.onMarketInstallProgress(progress => events.push(JSON.stringify(progress)))
      const outcome = await api.desktopAction('installDshMarket')
      return { outcome, events }
    })
    console.log('MARKET_PROBE_BEGIN')
    console.log(JSON.stringify(result, null, 2).slice(0, 6_000))
    console.log('MARKET_PROBE_END')
  } finally {
    await app.close().catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
})
