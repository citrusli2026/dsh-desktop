import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RuntimeManager } from '../src/main/runtime-manager.ts'

async function makeRuntime(root: string, version: string): Promise<void> {
  const bin = join(root, version, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  await mkdir(join(root, version, 'node_modules', '@deepseek-ai', 'dsh', 'lib'), { recursive: true })
  await writeFile(bin, [
    'const ports = { alpha: 41001, beta: 41002 }',
    'const id = process.env.DSH_DESKTOP_ENVIRONMENT_ID',
    'console.log(`dsh web: http://127.0.0.1:${ports[id]}/?token=${id}`)',
    'setInterval(() => {}, 1000)',
  ].join('\n'))
}

test('two official runtimes run in isolated environments and uninstall independently', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-manager-'))
  const runtimeRoot = join(root, 'kernels')
  const dataRoot = join(root, 'runtime-environments')
  await makeRuntime(runtimeRoot, '1.0.0')
  await makeRuntime(runtimeRoot, '2.0.0')
  const manager = new RuntimeManager({
    runtimeRoot,
    dataRoot,
    nodeBin: process.execPath,
    readyTimeoutMs: 2_000,
  })

  try {
    await manager.createEnvironment({ id: 'alpha', name: 'Alpha', runtimeVersion: '1.0.0' })
    await manager.createEnvironment({ id: 'beta', name: 'Beta', runtimeVersion: '2.0.0' })
    const alphaMarker = join(dataRoot, 'alpha', 'dsh-home', 'data.txt')
    const betaMarker = join(dataRoot, 'beta', 'dsh-home', 'data.txt')
    await writeFile(alphaMarker, 'alpha data')
    await writeFile(betaMarker, 'beta data')

    const [alpha, beta] = await Promise.all([
      manager.startEnvironment('alpha'),
      manager.startEnvironment('beta'),
    ])
    assert.match(alpha.url ?? '', /41001/)
    assert.match(beta.url ?? '', /41002/)
    assert.notEqual(alpha.pid, beta.pid)
    assert.deepEqual(manager.state().runtimes, ['1.0.0', '2.0.0'])
    assert.deepEqual(manager.state().environments.map(row => row.status), ['running', 'running'])

    await manager.stopEnvironment('alpha')
    await manager.uninstallRuntime('1.0.0')

    const state = manager.state()
    assert.deepEqual(state.runtimes, ['2.0.0'])
    assert.equal(state.environments.find(row => row.id === 'alpha')?.status, 'missing-runtime')
    assert.equal(state.environments.find(row => row.id === 'beta')?.status, 'running')
    assert.equal(await readFile(alphaMarker, 'utf8'), 'alpha data')
    assert.equal(await readFile(betaMarker, 'utf8'), 'beta data')
  } finally {
    await manager.stopAll()
    await rm(root, { recursive: true, force: true })
  }
})

test('a running environment blocks uninstalling its runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-manager-'))
  const runtimeRoot = join(root, 'kernels')
  const dataRoot = join(root, 'runtime-environments')
  await makeRuntime(runtimeRoot, '1.0.0')
  const manager = new RuntimeManager({ runtimeRoot, dataRoot, nodeBin: process.execPath, readyTimeoutMs: 2_000 })
  try {
    await manager.createEnvironment({ id: 'alpha', name: 'Alpha', runtimeVersion: '1.0.0' })
    await manager.startEnvironment('alpha')
    await assert.rejects(manager.uninstallRuntime('1.0.0'), /runtime-running:alpha/)
  } finally {
    await manager.stopAll()
    await rm(root, { recursive: true, force: true })
  }
})

test('runtime uninstall rejects path-like version names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-manager-'))
  const manager = new RuntimeManager({
    runtimeRoot: join(root, 'kernels'),
    dataRoot: join(root, 'runtime-environments'),
    nodeBin: process.execPath,
  })
  try {
    await assert.rejects(manager.uninstallRuntime('.'), /invalid-version/)
    await assert.rejects(manager.uninstallRuntime('..'), /invalid-version/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
