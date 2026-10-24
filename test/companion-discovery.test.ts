import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { discoverCompanions } from '../src/main/companion-discovery.ts'

async function packageFile(root: string, name: string, body: unknown): Promise<void> {
  const dir = join(root, 'profiles', 'web', 'node_modules', name)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify(body))
}

test('discovery reads only declared companion manifests from the Web profile', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-companion-'))
  try {
    await packageFile(home, 'alpha-pet', { name: 'alpha-pet', dsh: { companion: { route: '/alpha/pet', width: 400, height: 300 } } })
    await packageFile(home, '@scope/beta-pet', { name: '@scope/beta-pet', dsh: { companion: { route: '/beta/pet' } } })
    await packageFile(home, 'plain-plugin', { name: 'plain-plugin', dsh: { bundle: { patch: './cordis.patch.yml' } } })
    await packageFile(home, 'bad-route', { name: 'bad-route', dsh: { companion: { route: 'https://evil.example/pet' } } })
    await packageFile(home, 'bad-size', { name: 'bad-size', dsh: { companion: { route: '/x', width: 10 } } })
    const broken = join(home, 'profiles', 'web', 'node_modules', 'broken-json')
    await mkdir(broken, { recursive: true })
    await writeFile(join(broken, 'package.json'), '{ not json')
    const bin = join(home, 'profiles', 'web', 'node_modules', '.bin')
    await mkdir(bin, { recursive: true })

    const found = await discoverCompanions(home)
    assert.deepEqual(found.map(item => item.id), ['@scope/beta-pet', 'alpha-pet'])
    assert.equal(found.find(item => item.id === 'alpha-pet')?.width, 400)
    assert.equal(found.find(item => item.id === '@scope/beta-pet')?.route, '/beta/pet')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('discovery is empty when the profile has no plugins', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-companion-empty-'))
  try {
    assert.deepEqual(await discoverCompanions(home), [])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('the shell supplies a companion for a reviewed, unmodified package', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-companion-'))
  try {
    // Upstream 0.4.2 has no dsh.companion declaration: the shell's compat map
    // must add the adapter route without the plugin changing.
    await packageFile(home, 'dsh-whale-widget', { name: 'dsh-whale-widget', version: '0.4.2', dsh: { bundle: { patch: './cordis.patch.yml' } } })
    const listed = await discoverCompanions(home)
    assert.deepEqual(listed, [{
      id: 'dsh-whale-widget',
      route: '/__dsh-desktop/whale-pet',
      width: 560,
      height: 620,
      title: '小鲸鱼',
      showOnMinimize: true,
    }])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('a plugin declaration wins over the shell compat map, and unknown versions are left alone', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-companion-'))
  try {
    await packageFile(home, 'dsh-whale-widget', {
      name: 'dsh-whale-widget', version: '0.5.0',
      dsh: { companion: { route: '/dsh-whale/pet', width: 500, height: 500 } },
    })
    const declared = await discoverCompanions(home)
    assert.equal(declared[0]?.route, '/dsh-whale/pet', 'plugin declaration wins')
    await packageFile(home, 'dsh-whale-widget', { name: 'dsh-whale-widget', version: '0.5.0', dsh: {} })
    assert.deepEqual(await discoverCompanions(home), [], 'unreviewed version gets no adapter')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
