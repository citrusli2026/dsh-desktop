import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, readFile, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { parseSessionTrashRequest, runSessionTrash, sessionProjectKey, startSessionTrashServer } from '../src/main/trash-host.ts'
import { SessionTrashClient } from '../src/main/trash-client.ts'
import { listTrash } from '../src/main/trash.ts'

test('request whitelist rejects traversal and does not accept free filesystem paths', () => {
  assert.equal(parseSessionTrashRequest(null), undefined)
  for (const projectKey of ['..', '.', '/tmp', 'a/b', 'a\\b', '']) {
    assert.equal(parseSessionTrashRequest({ action: 'delete', projectKey, sessionId: 'session-real' }), undefined)
  }
  assert.deepEqual(parseSessionTrashRequest({ action: 'delete', projectKey: '--Users-test--', sessionId: 'session-real' }), { action: 'delete', projectKey: '--Users-test--', sessionId: 'session-real' })
  assert.equal(parseSessionTrashRequest({ action: 'purge', path: '/' }), undefined)
})

test('project directory mapping matches the pinned kernel, including Unicode and bounded Windows paths', async () => {
  const source = await readFile('manifest/harness/node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js', 'utf8')
  const start = source.indexOf('function projectKey(cwd) {')
  const end = source.indexOf('\n/**', start)
  const kernelKey = runInNewContext(source.slice(start, end) + '\nprojectKey')
  for (const path of ['/Users/test/project', 'C:\\Users\\项目 😀', '/a//b', '/', '/a'.repeat(200), '/~project', '/a+b']) {
    assert.equal(sessionProjectKey(path), kernelKey(path))
  }
  assert.equal(sessionProjectKey(undefined), '_no-cwd')
})

test('Host uses authoritative full identity/archive state and coordinates delete/restore with one lifecycle owner', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-trash-host-'))
  const cwd = join(home, 'workspace')
  const key = sessionProjectKey(cwd)
  const id = 'session-real'
  const directory = join(home, 'sessions', key, id)
  const calls: string[] = []
  const archived = [id]
  let archiveFailure = false
  let headerCwd = cwd
  const ctx = {
    emit: (_event: string, summary: { sessionId: string }) => { assert.equal(summary.sessionId, id); calls.push('publish') },
    sessionPersistence: { list: async () => [{ header: { id, cwd: headerCwd } }] },
    workspaceRegistry: {
      archivedSessionIds: archived,
      unarchiveSession: async (target: string) => { assert.equal(target, id); calls.push('unarchive'); if (archiveFailure) throw new Error('registry write failed'); archived.splice(0) },
    },
    sessionController: { list: async () => ({ items: existsSync(directory) ? [{ sessionId: id }] : [] }), withIdleSession: async (target: string, operation: (header: { id: string; cwd?: string }) => Promise<unknown>) => {
      assert.equal(target, id)
      calls.push('claim')
      return operation({ id, cwd })
    } },
  }
  try {
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'events'), 'fixture')
    const rows = await runSessionTrash(ctx, home, { action: 'list' }) as Array<{ sessionId: string; archived: boolean }>
    assert.equal(rows[0]?.sessionId, id, 'do not strip the kernel identity prefix')
    assert.equal(rows[0]?.archived, true, 'do not rely on a stale registry file')
    await assert.rejects(runSessionTrash(ctx, home, { action: 'delete', projectKey: 'wrong', sessionId: id }), /workspace mismatch/)
    assert.equal((await stat(directory)).isDirectory(), true)
    await runSessionTrash(ctx, home, { action: 'delete', projectKey: key, sessionId: id })
    assert.deepEqual(calls, ['claim', 'claim', 'unarchive'])
    assert.equal(await stat(directory).then(() => true, () => false), false)
    const entry = (await listTrash(home))[0]!
    assert.equal(entry.name, id)
    await runSessionTrash(ctx, home, { action: 'restore', trashId: entry.id })
    assert.equal((await stat(directory)).isDirectory(), true)
    assert.deepEqual(calls.slice(-2), ['unarchive', 'publish'])
    assert.deepEqual(await listTrash(home), [])
    archiveFailure = true
    await assert.rejects(runSessionTrash(ctx, home, { action: 'delete', projectKey: key, sessionId: id }), /registry write failed/)
    assert.equal(existsSync(directory), true)
    assert.deepEqual(await listTrash(home), [])
    archiveFailure = false
    await runSessionTrash(ctx, home, { action: 'delete', projectKey: key, sessionId: id })
    const [saved] = await listTrash(home)
    headerCwd = '/different-workspace'
    await assert.rejects(runSessionTrash(ctx, home, { action: 'restore', trashId: saved!.id }), /identity mismatch/)
    assert.equal(existsSync(directory), false)
    assert.deepEqual(await listTrash(home), [saved])
    headerCwd = cwd
    archiveFailure = true
    await assert.rejects(runSessionTrash(ctx, home, { action: 'restore', trashId: saved!.id }), /registry write failed/)
    assert.equal(existsSync(directory), false)
    assert.deepEqual(await listTrash(home), [saved])
    archiveFailure = false
    await runSessionTrash(ctx, home, { action: 'restore', trashId: saved!.id })
    assert.equal(existsSync(directory), true)
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('loopback bridge requires main-only token, rejects invalid input, and invalidates old generations', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-trash-transport-'))
  const client = new SessionTrashClient()
  let release: (() => void) | undefined
  const ctx = {
    emit() {},
    sessionController: { list: async () => ({ items: [] }), withIdleSession: async () => { throw Object.assign(new Error('active'), { code: 'session/agent-busy' }) } },
    sessionPersistence: { list: async () => [] },
    workspaceRegistry: { archivedSessionIds: [], unarchiveSession: async () => new Promise<void>(resolve => { release = resolve }) },
  }
  const server = startSessionTrashServer(ctx, home, client.token, port => client.bind(port))
  try {
    await once(server, 'listening')
    const port = (server.address() as { port: number }).port
    const url = `http://127.0.0.1:${port}/session-trash`
    assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 403)
    assert.equal((await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${client.token}` }, body: '{' })).status, 400)
    assert.deepEqual(await client.list(), [])
    assert.equal(await client.run({ action: 'delete', projectKey: 'key', sessionId: 'session-active' }), 'active')
    const pending = client.run({ action: 'unarchive', sessionId: 'session-real' })
    for (let attempt = 0; release === undefined && attempt < 200; attempt++) await new Promise(resolve => setTimeout(resolve, 5))
    assert.ok(release, 'request reached the Host')
    client.bind(undefined)
    release()
    assert.equal(await pending, false, 'an old Host response cannot report success in a new environment')
    assert.equal(await client.run({ action: 'unarchive', sessionId: 'session-real' }), false)
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(home, { recursive: true, force: true })
  }
})
