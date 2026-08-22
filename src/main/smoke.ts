/** Headless smoke assertions used by CI and local release verification. */
import { app, type BrowserWindow, net } from 'electron'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { shellText, type ShellLocale } from './locale.ts'
import {
  SMOKE_EXIT_FAIL,
  SMOKE_EXIT_OK,
  SMOKE_FLAG,
  SMOKE_UI_FLAG,
  TEST_FAIL_HARNESS_ENV,
  TEST_RETRY_FAIL_ENV,
} from './smoke-protocol.ts'

export const SMOKE_TEST = process.argv.includes(SMOKE_FLAG)
export const SMOKE_UI_TEST = SMOKE_TEST && process.argv.includes(SMOKE_UI_FLAG)
export const SMOKE_TIMEOUT_MS = 150_000

export function quitGracefully(code: number): void {
  process.exitCode = code
  app.quit()
}

export async function smokeVerify(url: string): Promise<void> {
  const response = await net.fetch(url)
  const body = await response.text()
  const ok = response.ok && body.includes('__DSH_BOOT__')
  console.error(`smoke: ${ok ? 'OK' : 'FAIL'} ${url} status=${response.status} body=${body.length}B boot=${body.includes('__DSH_BOOT__')}`)
  quitGracefully(ok ? SMOKE_EXIT_OK : SMOKE_EXIT_FAIL)
}

const SMOKE_UI_DEADLINE_MS = 120_000
const SMOKE_UI_POLL_MS = 800

/**
 * Verify the real Harness UI rendered past its boot surface in the given
 * window. The plain smoke check fetches the boot HTML only; this one proves
 * the bundle loaded: the boot overlay ([data-dsh-boot]) is gone, the plugin
 * failure surface never showed, and some form control (prompt / settings)
 * made it into the DOM. A failure screenshot is parked in the system temp
 * dir for diagnostics. Must be called after boot() resolved.
 */
export async function smokeUiRender(url: string, window: BrowserWindow): Promise<void> {
  const deadline = Date.now() + SMOKE_UI_DEADLINE_MS
  let rendered = false
  let diagnostic = ''
  while (Date.now() < deadline) {
    const state = await window.webContents.executeJavaScript(
      "(() => ({ boot: !!document.querySelector('[data-dsh-boot]')," +
        " failed: document.body.innerText.includes('Failed to load plugins')," +
        " control: !!document.querySelector('input, textarea, [role=\"textbox\"]')," +
        " textLen: document.body.innerText.trim().length }))()",
    ).catch((error: unknown) => {
      diagnostic = String(error)
      return null
    })
    if (state === null) {
      if (diagnostic !== '') await new Promise(resolve => setTimeout(resolve, SMOKE_UI_POLL_MS))
      continue
    }
    if (!state.boot && !state.failed && state.control && state.textLen > 10) {
      rendered = true
      break
    }
    if (diagnostic === '') diagnostic = `boot=${state.boot} failed=${state.failed} control=${state.control} textLen=${state.textLen}`
    await new Promise(resolve => setTimeout(resolve, SMOKE_UI_POLL_MS))
  }
  if (rendered) {
    console.error(`smoke-ui: OK ${url} — real Harness UI rendered`)
    quitGracefully(SMOKE_EXIT_OK)
    return
  }
  const screenshot = await window.webContents.capturePage().catch(() => null)
  const shotPath = join(tmpdir(), `dsh-smoke-ui-fail-${Date.now()}.png`)
  if (screenshot !== null) await writeFile(shotPath, screenshot.toPNG()).catch(() => undefined)
  console.error(`smoke-ui: FAIL ${url} — ${diagnostic} screenshot=${screenshot === null ? 'n/a' : shotPath}`)
  quitGracefully(SMOKE_EXIT_FAIL)
}

export function armSmokeTimeout(): void {
  const timer = setTimeout(() => {
    console.error('smoke: TIMEOUT')
    quitGracefully(SMOKE_EXIT_FAIL)
  }, SMOKE_TIMEOUT_MS)
  timer.unref()
}

export async function verifySmokeFailureRecovery(
  window: BrowserWindow,
  getAllowedOrigin: () => string | undefined,
  locale: ShellLocale,
): Promise<void> {
  const button = await window.webContents.executeJavaScript(
    "document.querySelector('button')?.textContent ?? ''",
  ).catch(() => '')
  console.error(`smoke: error-page button=${JSON.stringify(button)}`)
  const retryLabel = shellText(locale, 'page.retry')
  if (button !== retryLabel) {
    quitGracefully(SMOKE_EXIT_FAIL)
    return
  }
  await window.webContents.executeJavaScript("document.querySelector('button')?.click(); true")
  if (process.env[TEST_RETRY_FAIL_ENV] === '1') {
    const deadline = Date.now() + 15_000
    let recovered = ''
    while (recovered === '' && Date.now() < deadline) {
      recovered = await window.webContents.executeJavaScript(
        "(() => { const b = document.querySelector('button'); return b !== null && !b.disabled ? b.textContent : '' })()",
      ).catch(() => '')
      if (recovered === '') await new Promise(resolve => setTimeout(resolve, 500))
    }
    console.error(recovered === retryLabel ? 'smoke: retry-failure recovery OK' : 'smoke: retry-failure left the error page stuck')
    quitGracefully(recovered === retryLabel ? SMOKE_EXIT_OK : SMOKE_EXIT_FAIL)
    return
  }

  const deadline = Date.now() + 90_000
  while (getAllowedOrigin() === undefined && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  const allowedOrigin = getAllowedOrigin()
  if (allowedOrigin === undefined) {
    console.error('smoke: retry did not reach ready in time')
    quitGracefully(SMOKE_EXIT_FAIL)
  } else {
    await smokeVerify(`${allowedOrigin}/`)
  }
}
