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
