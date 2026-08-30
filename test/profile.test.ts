import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { profileManifestPath, readProfileBundles } from '../src/main/profile.ts'

test('readProfileBundles reports only user profile bundle names', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-profile-'))
  try {
    const manifest = profileManifestPath(home)
    await mkdir(join(home, 'profiles', 'web'), { recursive: true })
    await writeFile(manifest, JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dshmarket', 42] } } }))
    assert.deepEqual(await readProfileBundles(home), ['@deepseek-ai/dsh-base', 'dshmarket'])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('readProfileBundles returns an empty list before a profile exists', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-profile-'))
  try {
    assert.deepEqual(await readProfileBundles(home), [])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
