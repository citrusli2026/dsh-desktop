import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { profileManifestPath, readProfileBundles, readProfileStatus } from '../src/main/profile.ts'

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

test('readProfileStatus distinguishes missing, installed, and damaged market packages', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-profile-'))
  try {
    assert.equal((await readProfileStatus(home)).dshMarket.state, 'missing')
    const profileRoot = join(home, 'profiles', 'web')
    await mkdir(profileRoot, { recursive: true })
    await writeFile(join(profileRoot, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['dshmarket'] } } }))
    assert.equal((await readProfileStatus(home)).dshMarket.state, 'damaged')
    await mkdir(join(profileRoot, 'node_modules', 'dshmarket'), { recursive: true })
    await writeFile(join(profileRoot, 'node_modules', 'dshmarket', 'package.json'), JSON.stringify({ version: '1.2.3' }))
    assert.deepEqual((await readProfileStatus(home)).dshMarket, { name: 'dshmarket', state: 'installed', version: '1.2.3' })
    await writeFile(join(profileRoot, 'package.json'), '{broken')
    assert.equal((await readProfileStatus(home)).dshMarket.state, 'damaged')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
