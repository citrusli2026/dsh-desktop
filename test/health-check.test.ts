import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runDesktopHealthCheck } from '../src/main/health-check.ts'

async function runtimeFixture(): Promise<{
  root: string
  harnessRoot: string
  mobileShellRoot: string
  dshHome: string
  userData: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'desktop-health-'))
  const harnessRoot = join(root, 'harness')
  const mobileShellRoot = join(root, 'mobile-shell')
  const dshHome = join(root, 'dsh-home')
  const userData = join(root, 'user-data')
  await Promise.all([
    mkdir(join(harnessRoot, 'node', 'bin'), { recursive: true }),
    mkdir(join(harnessRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib'), { recursive: true }),
    mkdir(join(harnessRoot, 'node_modules', 'dsh-desktop-controls', 'lib'), { recursive: true }),
    mkdir(join(mobileShellRoot, 'app', 'www'), { recursive: true }),
    mkdir(join(dshHome, 'profiles', 'web'), { recursive: true }),
    mkdir(userData, { recursive: true }),
  ])
  await Promise.all([
    writeFile(join(harnessRoot, 'node', 'bin', 'node'), ''),
    writeFile(join(harnessRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'), ''),
    writeFile(join(harnessRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), JSON.stringify({ version: '0.1.2-rc.1' })),
    writeFile(join(harnessRoot, 'node_modules', 'dsh-desktop-controls', 'lib', 'client.js'), ''),
    writeFile(join(mobileShellRoot, 'app', 'www', 'index.html'), '<!doctype html>'),
    writeFile(join(dshHome, 'profiles', 'web', 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } } })),
  ])
  await chmod(join(harnessRoot, 'node', 'bin', 'node'), 0o755)
  return { root, harnessRoot, mobileShellRoot, dshHome, userData }
}

test('health check reports local runtime, storage, loopback, and optional market as healthy without leaking paths', async () => {
  const fixture = await runtimeFixture()
  try {
    const report = await runDesktopHealthCheck({
      ...fixture,
      harnessState: { phase: 'ready', url: 'http://127.0.0.1:3210/?token=secret' },
      safeMode: false,
      kernelVersion: '0.1.2-rc.1',
      locale: 'en',
      includeNetwork: false,
      fetch: async () => new Response('ok'),
      resolveProxy: async () => 'DIRECT',
    })
    assert.deepEqual(report.results.map(result => [result.id, result.status]), [
      ['runtime', 'ok'],
      ['storage', 'ok'],
      ['harness', 'ok'],
      ['profile', 'ok'],
    ])
    assert.equal(report.networkIncluded, false)
    assert.match(report.results[0]?.detail ?? '', /0\.1\.2-rc\.1/)
    assert.match(report.results[3]?.detail ?? '', /optional/i)
    assert.doesNotMatch(JSON.stringify(report), new RegExp(fixture.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.doesNotMatch(JSON.stringify(report), /token=secret/)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('health check classifies broken local state and keeps connectivity checks advisory', async () => {
  const fixture = await runtimeFixture()
  try {
    await writeFile(join(fixture.dshHome, 'profiles', 'web', 'package.json'), '{broken')
    const report = await runDesktopHealthCheck({
      ...fixture,
      harnessRoot: join(fixture.root, 'missing-harness'),
      userData: join(fixture.root, 'missing-user-data'),
      harnessState: { phase: 'crashed', attempts: 3, logTail: 'private log' },
      safeMode: true,
      locale: 'zh',
      includeNetwork: true,
      fetch: async () => { throw new Error(`secret path ${fixture.root}`) },
      resolveProxy: async () => { throw new Error('proxy secret') },
    })
    const states = new Map(report.results.map(result => [result.id, result.status]))
    assert.equal(states.get('runtime'), 'failed')
    assert.equal(states.get('storage'), 'failed')
    assert.equal(states.get('harness'), 'failed')
    assert.equal(states.get('profile'), 'failed')
    assert.equal(states.get('proxy'), 'warning')
    assert.equal(states.get('registry'), 'warning')
    assert.equal(states.get('updates'), 'warning')
    assert.equal(report.networkIncluded, true)
    assert.doesNotMatch(JSON.stringify(report), /private log|proxy secret|secret path/)
    assert.doesNotMatch(JSON.stringify(report), new RegExp(fixture.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})
