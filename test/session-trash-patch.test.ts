import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { patchSessionTrash, patchWorkspaceTrashNavigation } from '../scripts/patch-session-trash.mjs'

const upstream = await readFile('manifest/harness/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js', 'utf8')
const patched = patchSessionTrash(upstream)
const start = patched.indexOf('var ApiSessionAgentController = class {')
const end = patched.indexOf('\n//#endregion', start)
class RemoteError extends Error {
  code: string
  details: unknown
  constructor(code: string, message: string, details: unknown) { super(message); this.code = code; this.details = details }
}
const AgentController = runInNewContext(patched.slice(start, end) + '\nApiSessionAgentController', { RemoteError })

function fixture({ status = 'idle', queued = false, owned = true, maintenance = false } = {}) {
  const events: string[] = []
  let attached = true
  const agent = {
    id: 'session-real', status,
    session: { header: { id: 'session-real', cwd: '/test-workspace' } },
    inbox: { nextTurn: queued ? [{}] : [], nextStep: [] },
    async runMaintenance(task: () => Promise<unknown>) {
      if (maintenance) throw new Error('maintenance already active')
      events.push('maintenance')
      return task()
    },
  }
  const ctx = {
    typert: { lookups: { configure() {} }, contexts: { configureHost() {} } },
    agents: { get: () => attached ? agent : undefined, list: () => attached ? [agent] : [] },
    sessions: { get: () => attached ? agent.session : undefined, flush: async () => { events.push('flush') } },
    sessionPersistence: { list: async (): Promise<Array<{ header: { parentSession?: string } }>> => [], open: async () => ({ header: agent.session.header, close: async () => { events.push('close') } }) },
  }
  const controller = new AgentController(ctx)
  const handle = { agent, dispose: async () => { events.push('dispose'); attached = false } }
  if (owned) controller.keepTrashHandle(handle)
  return { controller, ctx, events, agent, detach: () => { attached = false } }
}

test('pinned lifecycle patch is idempotent and fails closed on changed upstream anchors', () => {
  assert.equal(patchSessionTrash(patched), patched)
  assert.throws(() => patchSessionTrash(upstream.replace('async claim(', 'async changedClaim(')), /anchor changed/)
  assert.match(patched, /this\.agents\.keepTrashHandle\(await this\.ctx\.agents\.create/)
  assert.match(patched, /"sessions",\s+"sessionPersistence",\s+"sessionProjections"/)
})

test('owned idle removal holds maintenance, flushes, blocks admission, then disposes the exact handle', async () => {
  const { controller, events, ctx } = fixture()
  const result = await controller.withIdleSession('session-real', async (header: { id: string }) => {
    assert.equal(header.id, 'session-real')
    assert.equal((await controller.resolveAgent('session-real')).error.code, 'session/agent-busy')
    await assert.rejects(controller.createSession({ sessionId: 'session-real', cwd: '/test-workspace' }), /in progress/)
    await assert.rejects(controller.withIdleSession('session-real', async () => {}), /active or owned/)
    events.push('move')
    return 42
  })
  assert.equal(result, 42)
  assert.deepEqual(events, ['maintenance', 'flush', 'move', 'dispose'])
  assert.equal(ctx.sessions.get(), undefined)
  assert.equal(controller.trashBlocked.size, 0)
})

test('running, queued, foreign-owned, and maintenance-active sessions are refused without forced teardown', async () => {
  for (const options of [{ status: 'running' }, { queued: true }, { owned: false }, { maintenance: true }]) {
    const { controller, events } = fixture(options)
    await assert.rejects(controller.withIdleSession('session-real', async () => { throw new Error('must not touch disk') }))
    assert.deepEqual(events, [])
    assert.equal(controller.trashBlocked.size, 0)
  }
})

test('in-flight resumes and alpha.3 named claims both prevent deletion', async () => {
  for (const collection of ['resumes', 'claims']) {
    const { controller, events } = fixture()
    controller[collection].set('session-real', Promise.resolve())
    await assert.rejects(controller.withIdleSession('session-real', async () => { throw new Error('must not touch disk') }), /active or owned/)
    assert.deepEqual(events, [])
    assert.equal(controller.trashBlocked.size, 0)
  }
})

test('failed disk work still unwinds only the claimed idle handle and releases admission', async () => {
  const { controller, events } = fixture()
  await assert.rejects(controller.withIdleSession('session-real', async () => { throw new Error('disk failed') }), /disk failed/)
  assert.deepEqual(events, ['maintenance', 'flush', 'dispose'])
  assert.equal(controller.trashBlocked.size, 0)
})

test('cold removal claims cross-process write ownership until disk work settles', async () => {
  const { controller, events, detach, ctx } = fixture()
  detach()
  ctx.sessionPersistence.open = async () => {
    events.push('write-open')
    return { header: { id: 'session-real', cwd: '/test-workspace' }, close: async () => { events.push('close') } }
  }
  await assert.rejects(controller.withIdleSession('session-real', async () => { events.push('move'); throw new Error('failure') }), /failure/)
  assert.deepEqual(events, ['write-open', 'move', 'close'])
})

test('resident child sessions, even idle ones, prevent parent deletion without disposing either owner', async () => {
  for (const status of ['idle', 'running']) {
    const { controller, ctx, agent, events } = fixture()
    ctx.agents.list = () => [agent, { ...agent, id: 'session-child', status, session: { header: { ...agent.session.header, parentSession: agent.id } } }]
    await assert.rejects(controller.withIdleSession(agent.id, async () => { throw new Error('must not move parent') }), /active or owned/)
    assert.deepEqual(events, [])
  }
})

test('persisted child identity protects even a cold parent until children are removed first', async () => {
  const { controller, ctx, events, detach } = fixture()
  detach()
  ctx.sessionPersistence.list = async () => [{ header: { parentSession: 'session-real' } }]
  await assert.rejects(controller.withIdleSession('session-real', async () => { throw new Error('must not move parent') }), /active or owned/)
  assert.deepEqual(events, [])
})

/** Slice `watchNavigation` out of the workspace client of either shape.
 *
 * Kernels up to 0.2.2-alpha.3 publish this file formatted, one member per line;
 * 0.2.2-rc.2 publishes it minified onto a few long lines. Locate the method by
 * its declaration and its closing brace instead of by surrounding newlines. A
 * `/` outside a comment or string means a regular expression literal, which
 * this reader does not model — it refuses instead of slicing the method wrong.
 */
function watchNavigationSource(source: string): string {
  const match = /(?:async\s+)?watchNavigation\s*\(\s*\)\s*\{/.exec(source)
  assert.ok(match, 'review the workspace navigation lifecycle if its method disappears')
  let depth = 0
  let quote: string | null = null
  let comment: '//' | '/*' | null = null
  for (let index = match.index + match[0].length - 1; index < source.length; index++) {
    const char = source[index]!
    const next = source[index + 1]
    if (comment === '//') { if (char === '\n') comment = null; continue }
    if (comment === '/*') { if (char === '*' && next === '/') { comment = null; index++ } continue }
    if (quote !== null) {
      if (char === '\\') index++
      else if (char === quote) quote = null
      continue
    }
    if (char === '/' && next === '/') { comment = '//'; index++; continue }
    if (char === '/' && next === '*') { comment = '/*'; index++; continue }
    assert.notEqual(char, '/', 'the pinned watchNavigation now contains a regular expression; extend this reader before trusting it')
    if (char === '"' || char === "'" || char === '`') { quote = char; continue }
    if (char === '{') depth++
    else if (char === '}' && --depth === 0) return source.slice(match.index, index + 1)
  }
  throw new Error('unterminated watchNavigation')
}

test('selection owner clears only a main reference explicitly marked removed', async () => {
  const source = await readFile('manifest/harness/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js', 'utf8')
  const client = patchWorkspaceTrashNavigation(source)
  assert.equal(patchWorkspaceTrashNavigation(client), client)
  const method = watchNavigationSource(client)
  let reconcile = () => {}
  let removed = false
  let clears = 0
  const watcher = runInNewContext(`(class { ${method} })`)
  const owner = new watcher()
  const list = { subscribe: (callback: () => void) => { reconcile = callback; return () => {} }, getSnapshot: () => ({ phase: 'ready' }) }
  Object.assign(owner, {
    lifetime: new AbortController(), workspaces: { list }, sessions: { list },
    mainReference: { binding: { session: { getSnapshot: () => ({ removed }) } } },
    clearArchivedCurrent: () => false, clearMain: () => { clears++ },
  })
  const stop = owner.watchNavigation()
  assert.equal(clears, 0)
  removed = true
  reconcile()
  assert.equal(clears, 1)
  stop()
})
