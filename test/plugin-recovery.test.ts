/**
 * Unit tests for plugin recovery (src/main/plugin-recovery.ts): semver
 * comparison, manifest bundle removal, registry lookup, and the update-info
 * derivation the error page's recovery rows render.
 * Run with `pnpm run test` (node --test; Node >= 22.19 strips the types natively).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  compareSemver,
  latestVersions,
  pluginUpdateInfos,
  readProfileManifest,
  withoutBundle,
  writeProfileManifest,
} from '../src/main/plugin-recovery.ts'

test('compareSemver orders versions, including prereleases', () => {
  assert.equal(compareSemver('1.36.0', '1.41.0'), -1)
  assert.equal(compareSemver('1.41.0', '1.36.0'), 1)
  assert.equal(compareSemver('0.18.0', '0.18.0'), 0)
  assert.equal(compareSemver('1.0.0', '1.0.0-rc.1'), 1)
  assert.equal(compareSemver('1.0.0-rc.1', '1.0.0-rc.2'), -1)
  assert.equal(compareSemver('2.0', '1.9.9'), 1)
})

test('withoutBundle removes the bundle entry and its dependency, keeping the rest', () => {
  const manifest = {
    name: 'dsh-profile-web',
    dependencies: { dshmarket: '^1.36.0', 'dsh-better-sidebar': '^0.17.1' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dshmarket', 'dsh-better-sidebar'] } },
  }
  const next = withoutBundle(manifest, 'dshmarket')
  assert.deepEqual(next.dsh?.profile?.bundles, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-better-sidebar'])
  assert.equal(next.dependencies?.dshmarket, undefined)
  assert.equal(next.dependencies?.['dsh-better-sidebar'], '^0.17.1')
  // Source object must not be mutated.
  assert.ok(manifest.dsh?.profile?.bundles.includes('dshmarket'))
})

test('profile manifest round-trips through read/write', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-'))
  try {
    await mkdir(join(home, 'profiles', 'web'), { recursive: true })
    await writeProfileManifest(home, { name: 'dsh-profile-web', dsh: { profile: { bundles: ['a'] } } })
    const raw = JSON.parse(await readFile(join(home, 'profiles', 'web', 'package.json'), 'utf8'))
    assert.equal(raw.dsh.profile.bundles[0], 'a')
    const manifest = await readProfileManifest(home)
    assert.deepEqual(manifest.dsh?.profile?.bundles, ['a'])
    // A missing manifest reads as empty, never throws.
    assert.deepEqual(await readProfileManifest(join(home, 'nope')), {})
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('latestVersions tolerates registry failures and returns only found versions', async () => {
  const calls: string[] = []
  const stub = (async (url: string | URL) => {
    calls.push(String(url))
    if (String(url).includes('broken-pkg')) throw new Error('offline')
    return new Response(JSON.stringify({ version: '1.41.0' }), { status: 200 })
  }) as typeof fetch
  const latest = await latestVersions(['dshmarket', 'broken-pkg'], stub, 'https://registry.example')
  assert.deepEqual(latest, { dshmarket: '1.41.0' })
  assert.equal(calls.length, 2)
})

test('pluginUpdateInfos flags only plugins with a newer published version', () => {
  const infos = pluginUpdateInfos(
    { dshmarket: '1.36.0', 'already-newest': '0.18.0', 'unpublished': '0.1.0' },
    { dshmarket: '1.41.0', 'already-newest': '0.18.0' },
  )
  const byName = new Map(infos.map(info => [info.name, info]))
  assert.equal(byName.get('dshmarket')?.updatable, true)
  assert.equal(byName.get('dshmarket')?.latest, '1.41.0')
  assert.equal(byName.get('already-newest')?.updatable, false)
  assert.equal(byName.get('unpublished')?.updatable, false)
})
