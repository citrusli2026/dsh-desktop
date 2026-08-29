import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import {
  activeKernelBin,
  bundledKernelVersion,
  clearKernelFailed,
  createKernelLaunchGuard,
  failedVersions,
  fetchLatestKernelVersion,
  installKernel,
  kernelState,
  kernelsDir,
  markKernelFailed,
  overlayBinPath,
  readActiveOverlay,
  REGISTRY_URL,
  writeActiveOverlay,
} from '../src/main/kernel-manager.ts'

async function makeClosure(version: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-kernel-closure-'))
  const binDir = join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib')
  await mkdir(binDir, { recursive: true })
  await writeFile(join(binDir, 'bin.js'), '// bundled\n')
  await writeFile(join(root, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version }))
  return root
}

async function makeOverlayKernel(dir: string, version: string, opts: { broken?: boolean } = {}): Promise<void> {
  const binDir = join(dir, version, 'node_modules', '@deepseek-ai', 'dsh', 'lib')
  await mkdir(binDir, { recursive: true })
  if (opts.broken !== true) await writeFile(join(binDir, 'bin.js'), '// overlay\n')
}

test('overlay pointer round-trips and the active bin prefers a healthy overlay', async () => {
  const closure = await makeClosure('0.1.1-rc.2')
  const dir = kernelsDir(await mkdtemp(join(tmpdir(), 'dsh-kernel-')))
  try {
    assert.equal(readActiveOverlay(dir), undefined)
    assert.equal(activeKernelBin(closure, dir), join(closure, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'))

    await makeOverlayKernel(dir, '0.1.1-rc.3')
    writeActiveOverlay(dir, '0.1.1-rc.3')
    assert.deepEqual(readActiveOverlay(dir), { version: '0.1.1-rc.3' })
    assert.equal(activeKernelBin(closure, dir), overlayBinPath(dir, '0.1.1-rc.3'))

    // A failed health boot excludes the overlay until it is cleared.
    markKernelFailed(dir, '0.1.1-rc.3')
    assert.equal(activeKernelBin(closure, dir), join(closure, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'))

    writeActiveOverlay(dir, undefined)
    assert.equal(readActiveOverlay(dir), undefined)
    assert.equal(activeKernelBin(closure, dir), join(closure, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'))
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(closure, { recursive: true, force: true })
  }
})

test('an overlay whose bin is missing never becomes active', async () => {
  const closure = await makeClosure('0.1.1-rc.2')
  const dir = kernelsDir(await mkdtemp(join(tmpdir(), 'dsh-kernel-')))
  try {
    await makeOverlayKernel(dir, '0.9.9-broken', { broken: true })
    writeActiveOverlay(dir, '0.9.9-broken')
    assert.equal(overlayBinPath(dir, '0.9.9-broken'), undefined)
    assert.equal(activeKernelBin(closure, dir), join(closure, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'))
    const state = kernelState(closure, dir)
    assert.equal(state.overlayVersion, undefined)
    assert.deepEqual(state.installedVersions, [])
    assert.equal(state.bundledVersion, '0.1.1-rc.2')
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(closure, { recursive: true, force: true })
  }
})

test('kernel state reports installed and failed versions', async () => {
  const closure = await makeClosure('0.1.1-rc.2')
  const dir = kernelsDir(await mkdtemp(join(tmpdir(), 'dsh-kernel-')))
  try {
    await makeOverlayKernel(dir, '0.1.1-rc.3')
    await makeOverlayKernel(dir, '0.2.0', { broken: true })
    markKernelFailed(dir, '0.1.1-rc.3')
    const state = kernelState(closure, dir)
    assert.deepEqual(state.installedVersions, ['0.1.1-rc.3'])
    assert.deepEqual(state.failedVersions, ['0.1.1-rc.3'])
    assert.equal(state.overlayVersion, undefined)
    assert.equal(bundledKernelVersion(closure), '0.1.1-rc.2')
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(closure, { recursive: true, force: true })
  }
})

test('launch guard rolls back exactly once when the overlay crashes before readiness', async () => {
  const dir = kernelsDir(await mkdtemp(join(tmpdir(), 'dsh-kernel-')))
  try {
    await makeOverlayKernel(dir, '0.1.1-rc.3')
    writeActiveOverlay(dir, '0.1.1-rc.3')
    const guard = createKernelLaunchGuard(dir)
    assert.ok(guard !== undefined)
    assert.equal(guard.observe('starting'), undefined)
    assert.equal(guard.observe('crashed'), '0.1.1-rc.3')
    assert.equal(guard.observe('crashed'), undefined)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('launch guard is absent when the launch boot runs the bundled kernel', async () => {
  const dir = kernelsDir(await mkdtemp(join(tmpdir(), 'dsh-kernel-')))
  try {
    assert.equal(createKernelLaunchGuard(dir), undefined)
    await makeOverlayKernel(dir, '0.1.1-rc.3')
    markKernelFailed(dir, '0.1.1-rc.3')
    writeActiveOverlay(dir, '0.1.1-rc.3')
    assert.equal(createKernelLaunchGuard(dir), undefined)
    clearKernelFailed(dir, '0.1.1-rc.3')
    await makeOverlayKernel(dir, '0.9.9-broken', { broken: true })
    writeActiveOverlay(dir, '0.9.9-broken')
    assert.equal(createKernelLaunchGuard(dir), undefined)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('launch guard never rolls back after readiness or a deselected overlay', async () => {
  const dir = kernelsDir(await mkdtemp(join(tmpdir(), 'dsh-kernel-')))
  try {
    await makeOverlayKernel(dir, '0.1.1-rc.3')
    writeActiveOverlay(dir, '0.1.1-rc.3')
    const guard = createKernelLaunchGuard(dir)!
    assert.equal(guard.observe('ready'), undefined)
    assert.equal(guard.observe('crashed'), undefined)

    await makeOverlayKernel(dir, '0.2.0')
    writeActiveOverlay(dir, '0.2.0')
    const second = createKernelLaunchGuard(dir)!
    writeActiveOverlay(dir, undefined)
    assert.equal(second.observe('crashed'), undefined)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('installKernel clears the failed marker of the same version on success', async () => {
  const dir = kernelsDir(await mkdtemp(join(tmpdir(), 'dsh-kernel-')))
  try {
    await makeOverlayKernel(dir, '0.1.1-rc.3')
    markKernelFailed(dir, '0.1.1-rc.3')
    assert.deepEqual(failedVersions(dir), ['0.1.1-rc.3'])

    const handlers = new Map<string, (code?: number) => void>()
    const fakeSpawn = (() => ({
      on: (event: string, callback: (code?: number) => void) => { handlers.set(event, callback) },
      kill: () => {},
    })) as unknown as typeof spawn
    const pending = installKernel({
      dir,
      version: '0.1.1-rc.3',
      nodeBin: 'node',
      pnpmBin: 'pnpm',
      timeoutMs: 5_000,
      spawnImpl: fakeSpawn,
    })
    handlers.get('close')?.(0)
    assert.deepEqual(await pending, { ok: true })
    assert.deepEqual(failedVersions(dir), [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('installKernel forwards the injected child env to pnpm', async () => {
  const dir = kernelsDir(await mkdtemp(join(tmpdir(), 'dsh-kernel-')))
  try {
    await makeOverlayKernel(dir, '0.1.1-rc.3')
    let observedEnv: NodeJS.ProcessEnv | undefined
    const fakeSpawn = ((_file: string, _args: readonly string[], options: { env?: NodeJS.ProcessEnv }) => {
      observedEnv = options.env
      return {
        on: (event: string, callback: (code?: number) => void) => { if (event === 'close') callback(0) },
        kill: () => {},
      }
    }) as unknown as typeof spawn
    const pending = installKernel({
      dir,
      version: '0.1.1-rc.3',
      nodeBin: 'node',
      pnpmBin: 'pnpm',
      env: { HTTPS_PROXY: 'http://127.0.0.1:7890' },
      spawnImpl: fakeSpawn,
    })
    assert.deepEqual(await pending, { ok: true })
    assert.equal(observedEnv?.HTTPS_PROXY, 'http://127.0.0.1:7890')
    assert.equal(observedEnv?.npm_config_save_exact, 'true')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('fetchLatestKernelVersion gives up when the registry never answers', async () => {
  // Honors the abort signal, unlike a black-holed socket the timeout is for.
  const hangingFetch = ((_url: string, init?: { signal?: AbortSignal }) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
  })) as unknown as typeof fetch
  assert.equal(await fetchLatestKernelVersion(hangingFetch, REGISTRY_URL, 20), undefined)
})

test('fetchLatestKernelVersion reads dist-tags.latest', async () => {
  const registryFetch = (async () => Response.json({ 'dist-tags': { latest: '0.2.0' } })) as unknown as typeof fetch
  assert.equal(await fetchLatestKernelVersion(registryFetch), '0.2.0')
})
