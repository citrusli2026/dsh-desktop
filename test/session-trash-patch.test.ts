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
    sessionPersistence: { open: async () => ({ header: agent.session.header, close: async () => { events.push('close') } }) },
  }
  const controller = new AgentController(ctx)
  const handle = { agent, dispose: async () => { events.push('dispose'); attached = false } }
  if (owned) controller.keepTrashHandle(handle)
  return { controller, ctx, events, agent, detach: () => { attached = false } }
}

test('pinned lifecycle patch is idempotent and fails closed on changed upstream anchors', () => {
  assert.equal(patchSessionTrash(patched), patched)
  assert.throws(() => patchSessionTrash(upstream.replace('async ensureSession(', 'async changedEnsureSession(')), /anchor changed/)
  assert.match(patched, /this\.agents\.keepTrashHandle\(await this\.ctx\.agents\.create/)
})

test('owned idle removal holds maintenance, flushes, blocks admission, then disposes the exact handle', async () => {
  const { controller, events, ctx } = fixture()
  const result = await controller.withIdleSession('session-real', async (header: { id: string }) => {
    assert.equal(header.id, 'session-real')
    assert.equal((await controller.resolveAgent('session-real')).error.code, 'session/agent-busy')
    await assert.rejects(controller.ensureSession('session-real', '/test-workspace', true), /in progress/)
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

test('selection owner clears only a main reference explicitly marked removed', async () => {
  const source = await readFile('manifest/harness/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js', 'utf8')
  const client = patchWorkspaceTrashNavigation(source)
  assert.equal(patchWorkspaceTrashNavigation(client), client)
  const start = client.indexOf('\n\t\t\twatchNavigation() {')
  const end = client.indexOf('\n\t\t\tasync restoreSelection(', start)
  let reconcile = () => {}
  let removed = false
  let clears = 0
  const watcher = runInNewContext(`(class { ${client.slice(start, end)} })`)
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
