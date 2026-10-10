/**
 * Unit tests for the desktop trash (src/main/trash.ts): index parsing,
 * conflict-free restore naming, retention expiry, and the move → restore →
 * purge flow against a real temporary DSH_HOME.
 * Run with `pnpm run test` (node --test; Node >= 22.19 strips the types natively).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import {
  conflictFreeRestorePath,
  expiredTrashEntries,
  listTrash,
  moveToTrash,
  parseTrashIndex,
  purgeExpiredTrash,
  purgeFromTrash,
  restoreFromTrash,
  SessionRestoreConflictError,
  type TrashEntry,
} from '../src/main/trash.ts'

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

test('parseTrashIndex keeps well-formed rows and drops malformed ones', () => {
  const entries = parseTrashIndex([
    { id: 'a', kind: 'preset', name: 'p1', originPath: '/x/p1', deletedAt: 100, source: 'import' },
    { id: 'b', name: 'no-origin', deletedAt: 101 },
    { id: '', name: 'empty-id', originPath: '/x', deletedAt: 102 },
    { id: 'c', name: 'bad-time', originPath: '/x', deletedAt: 'yesterday' },
    null,
    'row',
    { id: 'd', name: 'minimal', originPath: '/x/d', deletedAt: 103 },
  ])
  assert.deepEqual(entries.map(entry => entry.id), ['a', 'd'])
  assert.equal(entries[0]?.kind, 'preset')
  assert.equal(entries[0]?.source, 'import')
  assert.equal(entries[1]?.kind, 'file')
  assert.equal(entries[1]?.source, undefined)
  assert.deepEqual(parseTrashIndex(undefined), [])
  assert.deepEqual(parseTrashIndex({ nope: true }), [])
})

test('conflictFreeRestorePath returns the origin or a numbered restored sibling', () => {
  const taken = new Set(['/w/data', '/w/data (restored)', '/w/data (restored 2)'])
  const exists = (path: string): boolean => taken.has(path)
  assert.equal(conflictFreeRestorePath('/w/free', exists), '/w/free')
  assert.equal(conflictFreeRestorePath('/w/data', exists), '/w/data (restored 3)')
})

test('expiredTrashEntries selects past-retention entries oldest first', () => {
  const now = 10 * 24 * 60 * 60 * 1000
  const entry = (id: string, deletedAt: number): TrashEntry => ({ id, kind: 'file', name: id, originPath: `/x/${id}`, deletedAt })
  const entries = [entry('new', now - 1000), entry('old', now - 31 * 24 * 60 * 60 * 1000), entry('edge', now - 30 * 24 * 60 * 60 * 1000)]
  const expired = expiredTrashEntries(entries, now)
  // Exactly-at-retention entries are purgeable too; oldest first.
  assert.deepEqual(expired.map(entry => entry.id), ['old', 'edge'])
})

test('move → list → restore round-trips a directory through the trash', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-trash-'))
  try {
    const origin = join(home, 'sessions', 'p', 'session-1')
    await mkdir(origin, { recursive: true })
    await writeFile(join(origin, 'session.jsonl'), 'events')

    const entry = await moveToTrash(home, origin, { kind: 'session', source: 'trash page' })
    assert.equal(entry.name, 'session-1')
    assert.equal(await exists(origin), false, 'origin is gone after move')
    const listed = await listTrash(home)
    assert.deepEqual(listed.map(candidate => candidate.id), [entry.id])
    // The index document on disk is the parsed source of truth.
    assert.deepEqual(parseTrashIndex(JSON.parse(await readFile(join(home, 'trash', 'index.json'), 'utf8'))).length, 1)

    const restored = await restoreFromTrash(home, entry.id)
    assert.equal(restored.originPath, origin)
    assert.equal(await exists(join(origin, 'session.jsonl')), true)
    assert.deepEqual(await listTrash(home), [])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('restore falls back to a numbered sibling when the origin is taken again', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-trash-'))
  try {
    const origin = join(home, '.agent-presets', 'writer')
    await mkdir(origin, { recursive: true })
    await writeFile(join(origin, 'preset.yml'), 'old')
    const entry = await moveToTrash(home, origin, { kind: 'preset' })
    // The user recreated a preset with the same id while it was trashed.
    await mkdir(origin, { recursive: true })
    await writeFile(join(origin, 'preset.yml'), 'new')
    const restored = await restoreFromTrash(home, entry.id)
    assert.equal(restored.originPath, `${origin} (restored)`)
    assert.equal(await readFile(`${origin} (restored)/preset.yml`, 'utf8'), 'old')
    assert.equal(await readFile(join(origin, 'preset.yml'), 'utf8'), 'new')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('purgeFromTrash removes the stored item permanently; purgeExpiredTrash sweeps by age', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-trash-'))
  try {
    const keptPath = join(home, 'a.txt')
    const gonePath = join(home, 'b.txt')
    await writeFile(keptPath, 'keep')
    await writeFile(gonePath, 'gone')
    await moveToTrash(home, keptPath, { kind: 'file' })
    const gone = await moveToTrash(home, gonePath, { kind: 'file' })

    assert.equal(await purgeFromTrash(home, gone.id), true)
    assert.equal(await purgeFromTrash(home, gone.id), false, 'second purge is a no-op')
    await assert.rejects(() => restoreFromTrash(home, gone.id), /unknown entry/)

    // Age the remaining entry past retention and sweep.
    const now = Date.now() + 31 * 24 * 60 * 60 * 1000
    const swept = await purgeExpiredTrash(home, now)
    assert.deepEqual(swept.map(entry => entry.name), ['a.txt'])
    assert.deepEqual(await listTrash(home), [])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('moveToTrash refuses missing paths and rolls the entry back when the index write fails', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-trash-'))
  try {
    await assert.rejects(() => moveToTrash(home, join(home, 'missing'), { kind: 'file' }), /nothing to delete/)
    // Corrupt the trash layout so the post-move index write fails: the origin
    // must be renamed back instead of being lost in a dead items directory.
    const origin = join(home, 'x.txt')
    await writeFile(origin, 'x')
    await mkdir(join(home, 'trash'), { recursive: true })
    await writeFile(join(home, 'trash', 'index.json'), '{"not":"an array"}')
    // parseTrashIndex drops the malformed document (readIndex falls back to []),
    // so simulate a hard failure instead: make the index path a directory's child.
    await rm(join(home, 'trash', 'index.json'))
    await mkdir(join(home, 'trash', 'index.json'))
    await assert.rejects(() => moveToTrash(home, origin, { kind: 'file' }))
    assert.equal(await exists(origin), true, 'origin was renamed back after the failed write')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('parseTrashIndex drops unsafe ids, relative origins, and unknown kinds', () => {
  const entries = parseTrashIndex([
    { id: '../escape', kind: 'file', name: 'x', originPath: '/tmp/x', deletedAt: 1 },
    { id: 'safe-id', kind: 'weird', name: 'x', originPath: '/tmp/x', deletedAt: 2 },
    { id: 'safe-id', kind: 'file', name: 'x', originPath: 'relative/x', deletedAt: 3 },
    { id: 'safe-id', kind: 'file', name: 'x', originPath: '/tmp/x', deletedAt: -1 },
    { id: 'safe-id', kind: 'file', name: 'x', originPath: '/tmp/x', deletedAt: 4 },
  ])
  assert.deepEqual(entries.map(entry => entry.id), ['safe-id'])
})

test('session conflicts preserve both identities and never create a renamed session copy', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-trash-conflict-'))
  try {
    const origin = join(home, 'sessions', 'project', 'session-real')
    await mkdir(origin, { recursive: true })
    await writeFile(join(origin, 'events'), 'original')
    const entry = await moveToTrash(home, origin, { kind: 'session' })
    await mkdir(origin)
    await writeFile(join(origin, 'events'), 'new session')
    await assert.rejects(restoreFromTrash(home, entry.id), SessionRestoreConflictError)
    assert.equal(await readFile(join(origin, 'events'), 'utf8'), 'new session')
    assert.equal(await readFile(join(home, 'trash', 'items', entry.id, 'events'), 'utf8'), 'original')
    assert.equal(await exists(`${origin} (restored)`), false)
    assert.deepEqual(await listTrash(home), [entry])
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('restore rolls back registry or index failure without losing the recoverable original', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-trash-rollback-'))
  try {
    const origin = join(home, 'session-real')
    await mkdir(origin)
    await writeFile(join(origin, 'events'), 'durable')
    const entry = await moveToTrash(home, origin, { kind: 'session' })
    await assert.rejects(restoreFromTrash(home, entry.id, async () => { throw new Error('registry failed') }), /registry failed/)
    assert.equal(await exists(origin), false)
    assert.deepEqual(await listTrash(home), [entry])
    const index = join(home, 'trash', 'index.json')
    const before = await readFile(index, 'utf8')
    await assert.rejects(restoreFromTrash(home, entry.id, async () => {
      await rm(index)
      await mkdir(index)
    }))
    assert.equal(await exists(origin), false)
    assert.equal(await readFile(join(home, 'trash', 'items', entry.id, 'events'), 'utf8'), 'durable')
    await rm(index, { recursive: true })
    await writeFile(index, before)
    await restoreFromTrash(home, entry.id)
    assert.equal(await readFile(join(origin, 'events'), 'utf8'), 'durable')
    assert.deepEqual(await listTrash(home), [])
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('concurrent processes serialize index writes, duplicate restore and purge safely', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-trash-concurrent-'))
  try {
    const moduleURL = pathToFileURL(join(process.cwd(), 'src/main/trash.ts')).href
    for (let index = 0; index < 12; index++) await writeFile(join(home, `file-${index}`), `bytes-${index}`)
    await Promise.all([0, 6].map(start => promisify(execFile)(process.execPath, ['--input-type=module', '-e', `
      import { moveToTrash } from ${JSON.stringify(moduleURL)};
      for (let index = ${start}; index < ${start + 6}; index++) {
        await moveToTrash(${JSON.stringify(home)}, ${JSON.stringify(home)} + '/file-' + index, { kind: 'file' });
      }
    `])))
    const entries = await listTrash(home)
    assert.equal(entries.length, 12, 'neither process loses the other writer’s records')
    const entry = entries[0]!
    const outcomes = await Promise.allSettled([restoreFromTrash(home, entry.id), restoreFromTrash(home, entry.id)])
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1)
    assert.match(await readFile(entry.originPath, 'utf8'), /^bytes-/)
    const remaining = (await listTrash(home))[0]!
    let release!: () => void
    let entered!: () => void
    const enteredPromise = new Promise<void>(resolve => { entered = resolve })
    const restoring = restoreFromTrash(home, remaining.id, async () => {
      entered()
      await new Promise<void>(resolve => { release = resolve })
    })
    await enteredPromise
    const purging = purgeFromTrash(home, remaining.id)
    release()
    const competing = await Promise.allSettled([restoring, purging])
    assert.equal(competing[0]!.status, 'fulfilled')
    assert.match(await readFile(remaining.originPath, 'utf8'), /^bytes-/)
    assert.equal((await listTrash(home)).length, 10)
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('failed deletion keeps an indexed recovery copy if the origin was recreated during the transaction', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-trash-recreated-'))
  try {
    const origin = join(home, 'session-real')
    await mkdir(origin)
    await writeFile(join(origin, 'events'), 'original')
    await assert.rejects(moveToTrash(home, origin, { kind: 'session' }, async () => {
      await mkdir(origin)
      await writeFile(join(origin, 'events'), 'new')
      throw new Error('registry failed')
    }), /registry failed/)
    const [entry] = await listTrash(home)
    assert.ok(entry)
    assert.equal(await readFile(join(home, 'trash', 'items', entry.id, 'events'), 'utf8'), 'original')
    assert.equal(await readFile(join(origin, 'events'), 'utf8'), 'new')
    await assert.rejects(restoreFromTrash(home, entry.id), SessionRestoreConflictError)
  } finally { await rm(home, { recursive: true, force: true }) }
})
