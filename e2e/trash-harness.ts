/** Real Harness + local model, isolated from every real credential and data home. */
import { createServer, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'
import { locatePackagedExecutable } from '../scripts/packaged-locator.mjs'
import { dismissOnboardingModals, WELCOME_ACKNOWLEDGED_YAML } from './onboarding.ts'

export async function launchTrashHarness(packaged: boolean, options: { locale?: 'zh' | 'en'; theme?: 'light' | 'dark'; firstRunGuideDismissed?: boolean; safeMode?: boolean; connectSidecar?: boolean } = {}) {
  const locale = options.locale ?? 'zh', theme = options.theme ?? 'dark'
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-trash-real-')))
  const home = join(root, 'home')
  const documents = join(root, 'documents')
  const workspace = join(documents, 'deepseek-harness', 'default-workspace')
  const userData = join(root, 'electron')
  let requests = 0
  let paused = false
  const held: ServerResponse[] = []
  function reply(response: ServerResponse) {
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    for (const event of [
      { type: 'message_start', message: { id: `trash-mock-${requests}`, type: 'message', role: 'assistant', content: [], usage: { input_tokens: 1, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'TRASH-REAL-ANSWER' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ]) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    response.end()
  }
  const server = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/messages') { response.writeHead(404).end(); return }
    request.resume()
    request.on('end', () => { requests++; if (paused) held.push(response); else reply(response) })
  })
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined
  async function stopApp() {
    if (app !== undefined) {
      let timeout: NodeJS.Timeout | undefined
      await Promise.race([
        app.close(),
        new Promise<void>(resolveClose => { timeout = setTimeout(() => { app?.process().kill('SIGKILL'); resolveClose() }, 10_000) }),
      ]).finally(() => clearTimeout(timeout))
    }
  }
  async function close() {
    await stopApp()
    server.closeAllConnections()
    await new Promise<void>(resolveClose => server.close(() => resolveClose()))
    await rm(root, { recursive: true, force: true })
  }
  try {
    await Promise.all([mkdir(join(home, 'profiles', 'web'), { recursive: true }), mkdir(workspace, { recursive: true }), mkdir(userData)])
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = (server.address() as { port: number }).port
    await writeFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), [
      '- id: llm-deepseek', '  config:', `    baseURL: http://127.0.0.1:${port}`, '    apiKeyEnv: DSH_TRASH_FAKE_KEY', '',
      // These tests target trash, not the asynchronous legacy-settings import.
      // Configure the active profile before boot so English CI hosts use the
      // same Chinese UI as the development machine.
      '- id: locale', '  config:', `    preference: ${locale}`,
      '- id: ui-theme', '  config:', `    preference: ${theme}`,
      '- id: ui-settings-general', '  config:', '    welcomeNoticeVersion: "2026-08-13.1"', '',
      // cwd is not the kernel's default-workspace location. Keep Documents
      // resolution inside this fixture instead of probing the host's account.
      '- id: workspace-controller', '  config:', `    documentsDirectory: ${JSON.stringify(documents)}`, '',
    ].join('\n'))
    await writeFile(join(home, 'settings.yaml'), `locale:\n  preference: ${locale}\nui-theme:\n  preference: ${theme}\n` + WELCOME_ACKNOWLEDGED_YAML)
    await writeFile(join(userData, 'shell-preferences.json'), JSON.stringify({ closeToTrayExplained: true, firstRunGuideDismissed: options.firstRunGuideDismissed ?? true, safeMode: options.safeMode ?? false, whaleWidgetEnabled: false }))
    let connectModePath: string | undefined
    let connectBinPath: string | undefined
    if (options.connectSidecar) {
      if (packaged) throw new Error('the fake cc-connect sidecar is dev-mode only')
      connectModePath = join(root, 'fake-cc-connect.mode')
      connectBinPath = join(root, 'fake-cc-connect.mjs')
      await writeFile(connectModePath, 'ready\n')
      await writeFile(connectBinPath, [
        '#!/usr/bin/env node',
        "import { readFileSync, appendFileSync } from 'node:fs'",
        "const mode = readFileSync(process.env.DSH_CC_CONNECT_TEST_MODE, 'utf8').trim()",
        "appendFileSync(process.env.DSH_CC_CONNECT_TEST_MODE + '.starts', String(process.pid) + '\\n')",
        "if (mode !== 'waiting') console.error('fake cc-connect ready projects=1')",
        "if (mode === 'health') setTimeout(() => { for (const event of [{version:1,component:'channel',state:'online'},{version:1,component:'agent',state:'unavailable',errorCode:'model-key-missing'}]) console.error('level=INFO msg=\"cc-connect health\" event=' + JSON.stringify(JSON.stringify(event))) }, 30)",
        "if (mode === 'crash') setTimeout(() => { console.error('fake sidecar crash'); process.exit(23) }, 40)",
        'setInterval(() => {}, 1000)',
        '',
      ].join('\n'))
      await chmod(connectBinPath, 0o755)
    }
    const env: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
    Object.assign(env, { DSH_HOME: home, DSH_TRASH_FAKE_KEY: 'fake-trash-key', DEEPSEEK_API_KEY: '' })
    if (connectModePath !== undefined && connectBinPath !== undefined) {
      env.DSH_CC_CONNECT_TEST_BIN = connectBinPath
      env.DSH_CC_CONNECT_TEST_MODE = connectModePath
    }
    delete env.DSH_DESKTOP_DEV_WEB_URL
    const args = [`--user-data-dir=${userData}`]
    if (!packaged) args.unshift(resolve('.'))
    if (process.platform === 'linux') args.push('--no-sandbox')
    async function launch() {
      app = await electron.launch({ ...(packaged ? { executablePath: await locatePackagedExecutable() } : {}), args, cwd: workspace, env })
      // This fixture only saves fake credentials. Exercise the permission-
      // protected file fallback without requesting access to the real keychain.
      await app.evaluate(({ safeStorage }) => { safeStorage.isEncryptionAvailable = () => false })
      const page = await app.firstWindow()
      await expect.poll(() => page.locator('[data-dsh-desktop-controls]').count(), { timeout: 90_000 }).toBe(1)
      await dismissOnboardingModals(page)
      await expect(page.locator('html')).toHaveAttribute('lang', locale === 'zh' ? /^zh/ : /^en/)
      await expect(page.getByRole('textbox', { name: locale === 'zh' ? /描述你想要构建/ : /Describe what you want to build/ })).toBeVisible()
      return page
    }
    let page = await launch()
    expect(requests).toBe(0)
    return {
      get app() { return app! }, get page() { return page }, home, workspace, close, connectModePath,
      async restart(beforeLaunch?: () => Promise<void>) { await stopApp(); await beforeLaunch?.(); page = await launch(); return page },
      get requests() { return requests },
      pause() { paused = true },
      resume() { paused = false; for (const response of held.splice(0)) reply(response) },
    }
  } catch (error) { await close(); throw error }
}
