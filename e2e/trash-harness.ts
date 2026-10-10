/** Real Harness + local model, isolated from every real credential and data home. */
import { createServer, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'
import { locatePackagedExecutable } from '../scripts/packaged-locator.mjs'
import { dismissOnboardingModals, WELCOME_ACKNOWLEDGED_YAML } from './onboarding.ts'

export async function launchTrashHarness(packaged: boolean) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-trash-real-'))
  const home = join(root, 'home')
  const workspace = join(root, 'workspace')
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
  async function close() {
    if (app !== undefined) {
      let timeout: NodeJS.Timeout | undefined
      await Promise.race([
        app.close(),
        new Promise<void>(resolveClose => { timeout = setTimeout(() => { app?.process().kill('SIGKILL'); resolveClose() }, 10_000) }),
      ]).finally(() => clearTimeout(timeout))
    }
    server.closeAllConnections()
    await new Promise<void>(resolveClose => server.close(() => resolveClose()))
    await rm(root, { recursive: true, force: true })
  }
  try {
    await Promise.all([mkdir(join(home, 'profiles', 'web'), { recursive: true }), mkdir(workspace), mkdir(userData)])
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = (server.address() as { port: number }).port
    await writeFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), [
      '- id: llm-deepseek', '  config:', `    baseURL: http://127.0.0.1:${port}`, '    apiKeyEnv: DSH_TRASH_FAKE_KEY', '',
    ].join('\n'))
    await writeFile(join(home, 'settings.yaml'), 'locale:\n  preference: zh\nui-theme:\n  preference: dark\n' + WELCOME_ACKNOWLEDGED_YAML)
    await writeFile(join(userData, 'shell-preferences.json'), JSON.stringify({ closeToTrayExplained: true, firstRunGuideDismissed: true }))
    const env: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
    Object.assign(env, { DSH_HOME: home, DSH_TRASH_FAKE_KEY: 'fake-trash-key', DEEPSEEK_API_KEY: '' })
    delete env.DSH_DESKTOP_DEV_WEB_URL
    const args = [`--user-data-dir=${userData}`]
    if (!packaged) args.unshift(resolve('.'))
    if (process.platform === 'linux') args.push('--no-sandbox')
    app = await electron.launch({ ...(packaged ? { executablePath: await locatePackagedExecutable() } : {}), args, cwd: workspace, env })
    const page = await app.firstWindow()
    await expect.poll(() => page.locator('[data-dsh-desktop-controls]').count(), { timeout: 90_000 }).toBe(1)
    await dismissOnboardingModals(page)
    expect(requests).toBe(0)
    return {
      app, page, home, close,
      get requests() { return requests },
      pause() { paused = true },
      resume() { paused = false; for (const response of held.splice(0)) reply(response) },
    }
  } catch (error) { await close(); throw error }
}
