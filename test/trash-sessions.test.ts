/**
 * Unit tests for session trash support (src/main/trash-sessions.ts): the
 * on-disk session scan with archive flags, live-session refusal, and the
 * delete → restore round-trip that also clears the archive flag.
 * Run with `pnpm run test` (node --test).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  deleteSessionToTrash,
  listSessions,
  readArchivedSessionIds,
  restoreSessionFromTrash,
  unarchiveSession,
  ActiveSessionError,
} from '../src/main/trash-sessions.ts'
import { listTrash } from '../src/main/trash.ts'

async function makeSession(home: string, projectKey: string, sessionId: string): Promise<string> {
  const dir = join(home, 'sessions', projectKey, `session-${sessionId}`)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'session.jsonl.zstd'), 'events')
  return dir
}

async function writeWorkspace(home: string, archivedSessionIds: readonly string[]): Promise<void> {
  await mkdir(join(home, 'storages'), { recursive: true })
  await writeFile(join(home, 'storages', 'workspace.json'), `${JSON.stringify({ archivedSessionIds })}\n`)
}

test('listSessions reports every on-disk session with its archive flag', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-trash-sessions-'))
  try {
    await makeSession(home, '--Users-me-project--', 'abc')
    await makeSession(home, '--Users-me-project--', 'def')
    await makeSession(home, 'other-key', 'ghi')
    await writeWorkspace(home, ['def'])

    const sessions = await listSessions(home)
    const byId = new Map(sessions.map(session => [session.sessionId, session]))
    assert.equal(sessions.length, 3)
    assert.equal(byId.get('abc')?.archived, false)
    assert.equal(byId.get('def')?.archived, true)
    assert.equal(byId.get('def')?.projectKey, '--Users-me-project--')
    assert.match(byId.get('ghi')?.dirPath ?? '', /other-key/)
    // Newest-modified first: ghi was written last.
    assert.equal(sessions[0]?.sessionId, 'ghi')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('readArchivedSessionIds tolerates a missing or malformed workspace file', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-trash-sessions-'))
  try {
    assert.deepEqual([...await readArchivedSessionIds(home)], [])
    await mkdir(join(home, 'storages'), { recursive: true })
    await writeFile(join(home, 'storages', 'workspace.json'), '{broken')
    assert.deepEqual([...await readArchivedSessionIds(home)], [])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('deleting a live session is refused without touching anything', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-trash-sessions-'))
  try {
    const dir = await makeSession(home, 'key', 'live-1')
    await assert.rejects(
      () => deleteSessionToTrash(home, 'key', 'live-1', ['live-1']),
      ActiveSessionError,
    )
    assert.equal(await stat(dir).then(() => true).catch(() => false), true)
    assert.deepEqual(await listTrash(home), [])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('delete moves the session into the trash and clears its archive flag; restore moves it back', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-trash-sessions-'))
  try {
    const dir = await makeSession(home, 'key', 'dead-1')
    await writeWorkspace(home, ['dead-1'])

    await deleteSessionToTrash(home, 'key', 'dead-1', [])
    assert.equal(await stat(dir).then(() => true).catch(() => false), false, 'session dir is inside the trash')
    assert.deepEqual([...await readArchivedSessionIds(home)], [], 'archive flag cleared on delete')
    const trashed = await listTrash(home)
    assert.equal(trashed.length, 1)
    assert.equal(trashed[0]?.kind, 'session')

    await restoreSessionFromTrash(home, trashed[0]!.id)
    assert.equal(await stat(dir).then(() => true).catch(() => false), true, 'session dir is back at its origin')
    assert.deepEqual([...await readArchivedSessionIds(home)], [])
    assert.deepEqual(await listTrash(home), [])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('unarchiveSession removes exactly one id and reports no-op honestly', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-trash-sessions-'))
  try {
    await writeWorkspace(home, ['a', 'b'])
    assert.equal(await unarchiveSession(home, 'a'), true)
    assert.deepEqual([...await readArchivedSessionIds(home)], ['b'])
    assert.equal(await unarchiveSession(home, 'a'), false)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
