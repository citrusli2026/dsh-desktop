import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  closureManifestPath,
  generateClosureManifest,
  verifyClosureManifest,
} from '../src/main/closure-manifest.ts'

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'closure-manifest-test-'))
}

/** A minimal resources tree shaped like the packaged one (harness + mobile-shell). */
async function fixture(): Promise<string> {
  const root = await tempDir()
  await mkdir(join(root, 'harness', 'node', 'bin'), { recursive: true })
  await mkdir(join(root, 'mobile-shell', 'app', 'www'), { recursive: true })
  await writeFile(join(root, 'harness', 'package.json'), '{"name":"harness"}\n')
  await writeFile(join(root, 'harness', 'node', 'bin', 'node'), 'fake-binary')
  await writeFile(join(root, 'mobile-shell', 'app', 'www', 'index.html'), '<html></html>')
  return root
}

async function seal(root: string): Promise<void> {
  await writeFile(closureManifestPath(root), await generateClosureManifest(root, '0.0.0-test'))
}

test('generateClosureManifest covers every file with posix keys; clean tree verifies ok', async () => {
  const root = await fixture()
  try {
    await seal(root)
    const raw = JSON.parse(await readFile(closureManifestPath(root), 'utf8')) as { version: string; files: Record<string, string> }
    assert.equal(raw.version, '0.0.0-test')
    assert.deepEqual(Object.keys(raw.files).sort(), [
      'harness/node/bin/node',
      'harness/package.json',
      'mobile-shell/app/www/index.html',
    ])
    const result = await verifyClosureManifest(root)
    assert.equal(result.status, 'ok')
    assert.equal(result.checked, 3)
    assert.equal(result.problemCount, 0)
    assert.deepEqual(result.problems, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a changed file fails verification with its relative path', async () => {
  const root = await fixture()
  try {
    await seal(root)
    await writeFile(join(root, 'harness', 'node', 'bin', 'node'), 'corrupted-content')
    const result = await verifyClosureManifest(root)
    assert.equal(result.status, 'changed')
    assert.equal(result.problemCount, 1)
    assert.deepEqual(result.problems, ['changed harness/node/bin/node'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a missing file and an unexpected residue file are both problems', async () => {
  const root = await fixture()
  try {
    await seal(root)
    await rm(join(root, 'harness', 'package.json'))
    await writeFile(join(root, 'mobile-shell', 'stale-upgrade.bak'), 'leftover')
    const result = await verifyClosureManifest(root)
    assert.equal(result.status, 'changed')
    assert.equal(result.problemCount, 2)
    assert.deepEqual(result.problems.sort(), [
      'missing harness/package.json',
      'residue mobile-shell/stale-upgrade.bak',
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a missing manifest is the dev-checkout fallback, not a failure', async () => {
  const root = await fixture()
  try {
    const result = await verifyClosureManifest(root)
    assert.equal(result.status, 'missing-manifest')
    assert.equal(result.checked, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a corrupt manifest is unreadable rather than silently clean', async () => {
  const root = await fixture()
  try {
    await writeFile(closureManifestPath(root), '{not json')
    const result = await verifyClosureManifest(root)
    assert.equal(result.status, 'unreadable-manifest')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the problem list is bounded while the total count is not', async () => {
  const root = await fixture()
  try {
    await seal(root)
    await writeFile(join(root, 'harness', 'package.json'), '{"tampered":true}\n')
    await mkdir(join(root, 'residue'), { recursive: true })
    for (let index = 0; index < 15; index += 1) {
      await writeFile(join(root, 'residue', `extra-${index}.tmp`), 'x')
    }
    const result = await verifyClosureManifest(root)
    assert.equal(result.status, 'changed')
    assert.ok(result.problems.length <= 8)
    assert.equal(result.problemCount, 1 + 15)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
