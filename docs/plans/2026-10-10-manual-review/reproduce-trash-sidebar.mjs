/** Real-Harness diagnostic, isolated home and local mock model; never uses real credentials. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, expect } from '@playwright/test'
import { dismissOnboardingModals, WELCOME_ACKNOWLEDGED_YAML } from '../../../e2e/onboarding.ts'

const repository = fileURLToPath(new URL('../../../', import.meta.url))
const root = await mkdtemp(join(tmpdir(), 'dsh-review-sidebar-'))
const home = join(root, 'home')
const workspace = join(root, 'workspace')
const userData = join(root, 'electron')
const requests = []
const server = createServer((request, response) => {
  let body = ''
  request.setEncoding('utf8')
  request.on('data', chunk => { body += chunk })
  request.on('end', () => {
    if (request.method !== 'POST' || request.url !== '/v1/messages') return response.writeHead(404).end()
    requests.push(JSON.parse(body))
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    for (const event of [
      { type: 'message_start', message: { id: 'review-mock', type: 'message', role: 'assistant', content: [], usage: { input_tokens: 1, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'REVIEW-TRASH-ANSWER' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ]) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    response.end()
  })
})
let app
try {
  await Promise.all([mkdir(join(home, 'profiles', 'web'), { recursive: true }), mkdir(workspace), mkdir(userData)])
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  await writeFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), [
    '- id: llm-deepseek', '  config:', `    baseURL: http://127.0.0.1:${server.address().port}`,
    '    apiKeyEnv: DSH_REVIEW_FAKE_KEY', '',
  ].join('\n'))
  await writeFile(join(home, 'settings.yaml'), 'locale:\n  preference: zh\nui-theme:\n  preference: dark\n' + WELCOME_ACKNOWLEDGED_YAML)
  await writeFile(join(userData, 'shell-preferences.json'), JSON.stringify({ closeToTrayExplained: true, firstRunGuideDismissed: true }))
  const env = { ...process.env, DSH_HOME: home, DSH_REVIEW_FAKE_KEY: 'fake-review-key', DEEPSEEK_API_KEY: '' }
  delete env.DSH_DESKTOP_DEV_WEB_URL
  app = await electron.launch({ args: [repository, `--user-data-dir=${userData}`], cwd: workspace, env })
  const page = await app.firstWindow()
  await expect.poll(() => page.locator('[data-dsh-desktop-controls]').count(), { timeout: 90_000 }).toBe(1)
  await dismissOnboardingModals(page)
  assert.equal(requests.length, 0, 'opening the app does not make a model request')
  await page.getByRole('textbox', { name: /描述你想要构建/ }).fill('REVIEW-TRASH-SESSION')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(page.getByRole('paragraph').filter({ hasText: 'REVIEW-TRASH-ANSWER' })).toBeVisible({ timeout: 30_000 })
  const sessions = await page.evaluate(() => window.dshDesktop.listTrashSessions())
  assert.equal(sessions.length, 1, 'the fixture contains one real persisted session')
  const session = sessions[0]
  const sidebarRow = page.getByRole('treeitem').filter({ hasText: 'REVIEW-TRASH-ANSWER' })
  await expect(sidebarRow).toHaveCount(1)
  await page.getByRole('button', { name: '账号菜单', exact: true }).click()
  await page.getByText('设置', { exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.getByRole('button', { name: '垃圾桶', exact: true }).click()
  const trash = page.locator('[data-dsh-trash-section]')
  await trash.getByRole('tab', { name: /^会话 / }).click()
  const trashRow = trash.locator('[data-dsh-trash-row]').filter({ hasText: session.sessionId.slice(0, 12) })
  await expect(trashRow).toHaveCount(1)
  await trashRow.getByRole('button', { name: '删除（入桶）', exact: true }).click()
  await expect(trashRow).toHaveCount(0)
  await page.keyboard.press('Escape')
  console.log(JSON.stringify({
    realHarness: true, modelRequests: requests.length,
    persistedSessionsAfterDelete: (await page.evaluate(() => window.dshDesktop.listTrashSessions())).length,
    sidebarRowsAfterDelete: await sidebarRow.count(),
  }))
  await expect(sidebarRow).toHaveCount(0, { timeout: 5_000 })
  await expect(page.getByRole('paragraph').filter({ hasText: 'REVIEW-TRASH-ANSWER' })).toHaveCount(0, { timeout: 5_000 })
} finally {
  if (app !== undefined) {
    let timeout
    await Promise.race([
      app.close(),
      new Promise(resolve => { timeout = setTimeout(() => { app.process().kill('SIGKILL'); resolve() }, 10_000) }),
    ]).finally(() => clearTimeout(timeout))
  }
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await rm(root, { recursive: true, force: true })
}
