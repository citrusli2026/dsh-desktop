import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  activeKernelBin,
  bundledKernelVersion,
  kernelState,
  kernelsDir,
  markKernelFailed,
  overlayBinPath,
  readActiveOverlay,
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
