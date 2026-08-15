/** Headless smoke assertions used by CI and local release verification. */
import { app, type BrowserWindow, net } from 'electron'

export const SMOKE_TEST = process.argv.includes('--smoke-test')
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
  quitGracefully(ok ? 0 : 1)
}

export function armSmokeTimeout(): void {
  const timer = setTimeout(() => {
    console.error('smoke: TIMEOUT')
    quitGracefully(1)
  }, SMOKE_TIMEOUT_MS)
  timer.unref()
}

export async function verifySmokeFailureRecovery(
  window: BrowserWindow,
  getAllowedOrigin: () => string | undefined,
): Promise<void> {
  const button = await window.webContents.executeJavaScript(
    "document.querySelector('button')?.textContent ?? ''",
  ).catch(() => '')
  console.error(`smoke: error-page button=${JSON.stringify(button)}`)
  if (button !== '重试启动') {
    quitGracefully(1)
    return
  }
  await window.webContents.executeJavaScript("document.querySelector('button')?.click(); true")
  if (process.env.DSH_DESKTOP_TEST_RETRY_FAIL === '1') {
    const deadline = Date.now() + 15_000
    let recovered = ''
    while (recovered === '' && Date.now() < deadline) {
      recovered = await window.webContents.executeJavaScript(
        "(() => { const b = document.querySelector('button'); return b !== null && !b.disabled ? b.textContent : '' })()",
      ).catch(() => '')
      if (recovered === '') await new Promise(resolve => setTimeout(resolve, 500))
    }
    console.error(recovered === '重试启动' ? 'smoke: retry-failure recovery OK' : 'smoke: retry-failure left the error page stuck')
    quitGracefully(recovered === '重试启动' ? 0 : 1)
    return
  }

  const deadline = Date.now() + 90_000
  while (getAllowedOrigin() === undefined && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  const allowedOrigin = getAllowedOrigin()
  if (allowedOrigin === undefined) {
    console.error('smoke: retry did not reach ready in time')
    quitGracefully(1)
  } else {
    await smokeVerify(`${allowedOrigin}/`)
  }
}
