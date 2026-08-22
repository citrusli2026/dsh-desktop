import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigFile, atomicWriteFile, atomicWriteFileSync, withFileLock } from '../src/main/config-file.ts'

interface Preferences { closeToTrayExplained?: boolean }

const normalizePrefs = (raw: unknown): Preferences =>
  typeof raw === 'object' && raw !== null ? raw as Preferences : {}

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'config-file-test-'))
}

test('ConfigFile.readSync falls back to defaults on a missing file', async () => {
  const dir = await tempDir()
  try {
    const file = new ConfigFile<Preferences>(join(dir, 'missing.json'), {}, normalizePrefs)
    assert.deepEqual(file.readSync(), {})
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('ConfigFile.readSync falls back to defaults on malformed JSON', async () => {
  const dir = await tempDir()
  try {
    const path = join(dir, 'broken.json')
    await writeFile(path, '{not json')
    const file = new ConfigFile<Preferences>(path, { closeToTrayExplained: true }, normalizePrefs)
    assert.deepEqual(file.readSync(), { closeToTrayExplained: true })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('ConfigFile.update persists read-modify-write results', async () => {
  const dir = await tempDir()
  try {
    const path = join(dir, 'prefs.json')
    const file = new ConfigFile<Preferences>(path, {}, normalizePrefs)
    file.update(current => ({ ...current, closeToTrayExplained: true }))
    assert.deepEqual(file.readSync(), { closeToTrayExplained: true })
    const raw = JSON.parse(await readFile(path, 'utf8')) as Preferences
    assert.equal(raw.closeToTrayExplained, true)
    // update does not clobber keys it did not touch
    file.update(current => ({ ...current, extra: 'kept' as never }))
    assert.equal((file.readSync() as Preferences & { extra?: string }).extra, 'kept')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('atomic writes leave no temp files behind and replace content', async () => {
  const dir = await tempDir()
  try {
    const path = join(dir, 'doc.txt')
    await atomicWriteFile(path, 'first')
    assert.equal(readFileSync(path, 'utf8'), 'first')
    await atomicWriteFile(path, 'second')
    assert.equal(readFileSync(path, 'utf8'), 'second')
    const entries = await readdir(dir)
    assert.deepEqual(entries, ['doc.txt'], 'no temp files may survive a write')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('atomicWriteFileSync writes content and creates parent directories', async () => {
  const dir = await tempDir()
  try {
    const path = join(dir, 'nested', 'secret.json')
    atomicWriteFileSync(path, '{"a":1}\n')
    assert.equal(readFileSync(path, 'utf8'), '{"a":1}\n')
    const mode = (await stat(path)).mode & 0o777
    assert.equal(mode, 0o600)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('withFileLock serializes concurrent operations', async () => {
  const dir = await tempDir()
  try {
    const lockPath = join(dir, 'doc.lock')
    const order: string[] = []
    const first = withFileLock(lockPath, async () => {
      order.push('first:enter')
      await new Promise(resolve => setTimeout(resolve, 80))
      order.push('first:exit')
    })
    const second = withFileLock(lockPath, async () => {
      order.push('second:enter')
    })
    await Promise.all([first, second])
    // Which caller wins the lock first is scheduling-dependent; the contract
    // is mutual exclusion — the second operation must not interleave inside
    // the first one's critical section.
    const firstEnter = order.indexOf('first:enter')
    assert.ok(firstEnter >= 0, 'first operation must run')
    assert.equal(order[firstEnter + 1], 'first:exit', 'the lock must not interleave the two operations')
    assert.ok(order.includes('second:enter'), 'second operation must run')
    assert.deepEqual(await readdir(dir), [], 'lock file must be removed after the operation')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('withFileLock gives up after the timeout when the lock is held', async () => {
  const dir = await tempDir()
  try {
    const lockPath = join(dir, 'stuck.lock')
    await writeFile(lockPath, 'held by someone else')
    await assert.rejects(
      withFileLock(lockPath, async () => 1, { timeoutMs: 100 }),
      /EEXIST|ENOENT|already exists/,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
