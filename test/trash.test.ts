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
import {
  conflictFreeRestorePath,
  expiredTrashEntries,
  listTrash,
  moveToTrash,
  parseTrashIndex,
  purgeExpiredTrash,
  purgeFromTrash,
  restoreFromTrash,
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
