import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lstat, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CURATED_SEED_BUNDLES, profileManifestPath, readProfileBundles, seedCuratedProfile } from '../src/main/profile-seed.ts'

async function makeVendorRoot(packages: readonly string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-seed-vendor-'))
  for (const name of packages) {
    const dir = join(root, name)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
    await writeFile(join(dir, 'index.js'), 'module.exports = 1\n')
  }
  return root
}

async function makeHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'dsh-seed-home-'))
}

test('seeding a brand-new profile copies seeds and writes official+seed bundles', async () => {
  const vendor = await makeVendorRoot(CURATED_SEED_BUNDLES)
  const home = await makeHome()
  try {
    const outcome = await seedCuratedProfile({ dshHome: home, bundledNodeModules: vendor })
    assert.deepEqual(outcome.seeded.sort(), [...CURATED_SEED_BUNDLES].sort())
    assert.deepEqual(outcome.skipped, [])
    assert.equal(outcome.profileExists, false)

    const manifest = JSON.parse(await readFile(profileManifestPath(home), 'utf8'))
    assert.deepEqual(manifest.dsh.profile.bundles.slice(0, 2), ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    assert.equal(manifest.dsh.profile.bundles.length, 2 + CURATED_SEED_BUNDLES.length)
    for (const name of CURATED_SEED_BUNDLES) {
      assert.ok(manifest.dsh.profile.bundles.includes(name))
      const link = join(home, 'profiles', 'node_modules', name)
      // Seeds are symlinks into the vendored closure (resolution parity with
      // the official bundles' heal links), and readable through the link.
      assert.equal((await lstat(link)).isSymbolicLink(), true)
      const copied = JSON.parse(await readFile(join(link, 'package.json'), 'utf8'))
      assert.equal(copied.name, name)
    }
    assert.deepEqual(await readProfileBundles(home), manifest.dsh.profile.bundles)
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(vendor, { recursive: true, force: true })
  }
})

test('an existing profile is never rewritten and bundles are never reinstalled', async () => {
  const vendor = await makeVendorRoot(CURATED_SEED_BUNDLES)
  const home = await makeHome()
  try {
    await mkdir(join(home, 'profiles', 'web'), { recursive: true })
    const manifestPath = profileManifestPath(home)
    const userManifest = JSON.stringify({ name: 'dsh-profile-web', private: true, dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } } }, null, 2)
    await writeFile(manifestPath, userManifest)

    const outcome = await seedCuratedProfile({ dshHome: home, bundledNodeModules: vendor })
    assert.deepEqual(outcome.seeded, [])
    assert.equal(outcome.profileExists, true)
    assert.equal(await readFile(manifestPath, 'utf8'), userManifest)
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(vendor, { recursive: true, force: true })
  }
})

test('a real directory at a seed path is left alone and not referenced', async () => {
  const vendor = await makeVendorRoot(['dshmarket', 'dsh-better-sidebar', '@linxin666/dsh-client-ui-task-board'])
  const home = await makeHome()
  try {
    const userDir = join(home, 'profiles', 'node_modules', 'dsh-better-sidebar')
    await mkdir(userDir, { recursive: true })
    await writeFile(join(userDir, 'package.json'), JSON.stringify({ name: 'user-content' }))

    const outcome = await seedCuratedProfile({ dshHome: home, bundledNodeModules: vendor })
    assert.deepEqual(outcome.skipped, ['dsh-better-sidebar'])
    assert.ok(outcome.seeded.includes('dshmarket'))
    // The user-owned directory survives untouched and stays out of the manifest.
    assert.equal(await readFile(join(userDir, 'package.json'), 'utf8'), JSON.stringify({ name: 'user-content' }))
    const manifest = JSON.parse(await readFile(profileManifestPath(home), 'utf8'))
    assert.ok(!manifest.dsh.profile.bundles.includes('dsh-better-sidebar'))
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(vendor, { recursive: true, force: true })
  }
})

test('seeds missing from the closure are skipped without failing the rest', async () => {
  const vendor = await makeVendorRoot(['dshmarket'])
  const home = await makeHome()
  try {
    const outcome = await seedCuratedProfile({ dshHome: home, bundledNodeModules: vendor })
    assert.deepEqual(outcome.seeded, ['dshmarket'])
    assert.deepEqual(outcome.skipped.sort(), ['@linxin666/dsh-client-ui-task-board', 'dsh-better-sidebar'].sort())
    const manifest = JSON.parse(await readFile(profileManifestPath(home), 'utf8'))
    assert.deepEqual(manifest.dsh.profile.bundles, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dshmarket'])
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(vendor, { recursive: true, force: true })
  }
})

test('an empty closure leaves profile creation to the harness template', async () => {
  const vendor = await makeVendorRoot([])
  const home = await makeHome()
  try {
    const outcome = await seedCuratedProfile({ dshHome: home, bundledNodeModules: vendor })
    assert.deepEqual(outcome.seeded, [])
    assert.equal(outcome.profileExists, false)
    assert.equal(await readFile(profileManifestPath(home), 'utf8').then(() => true, () => false), false)
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(vendor, { recursive: true, force: true })
  }
})
