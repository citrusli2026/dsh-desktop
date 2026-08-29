import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile, lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { desktopControlsPatchPath, prepareDesktopControlsMount } from '../src/main/desktop-controls.ts'

const pluginRoot = resolve('plugins/dsh-desktop-controls')

test('desktop controls package exposes a safe additive client plugin contract', async () => {
  const packageJson = JSON.parse(await readFile(join(pluginRoot, 'package.json'), 'utf8')) as {
    dsh?: { client?: { platform?: string; inject?: string[] } }
    exports?: Record<string, string>
  }
  assert.equal(packageJson.dsh?.client?.platform, 'web')
  assert.deepEqual(packageJson.dsh?.client?.inject, ['@deepseek-ai/dsh-client-runtime'])
  assert.equal(packageJson.exports?.['./client'], './lib/client.js')
  const client = await readFile(join(pluginRoot, 'lib/client.js'), 'utf8')
  assert.match(client, /shell\.overlay/)
  assert.match(client, /startLanPairing/)
  // The overlay carries extension actions only (pairing, Safe Mode, About);
  // fullscreen, logs, and diagnostics belong to other surfaces.
  assert.doesNotMatch(client, /toggleFullscreen/)
  assert.doesNotMatch(client, /openLogs/)
  assert.doesNotMatch(client, /exportDiagnostics/)
  assert.match(client, /showAbout/)
  assert.match(client, /dshDesktop/)
  assert.match(client, /settings\.section/)
  assert.doesNotMatch(client, /settings\.general\.item/)
  assert.match(client, /reportSessionStatus/)
  assert.match(client, /data-dsh-controls-trigger/)
  assert.match(client, /entryPosition/)
  assert.match(client, /addEventListener\("pointermove"/)
  assert.match(client, /getLanState/)
  assert.match(client, /stopLanPairing/)
  assert.match(client, /lanStart/)
  assert.match(client, /lanStop/)
  assert.match(client, /safeModeBanner/)
  assert.match(client, /enterSafeMode/)
  assert.match(client, /exitSafeMode/)
  assert.match(client, /data-dsh-safe-mode-banner/)
  assert.match(client, /getRecoverySuspects/)
  assert.match(client, /safeModeSuspect/)
  assert.match(client, /data-dsh-safe-mode-suspect/)
  assert.match(client, /listPresets/)
  assert.match(client, /exportPreset/)
  assert.match(client, /importPreset/)
  assert.match(client, /presetsTitle/)
})

test('desktop controls mount returns undefined until all package files exist', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-desktop-controls-'))
  const harness = await mkdtemp(join(tmpdir(), 'dsh-desktop-controls-harness-'))
  try {
    assert.equal(prepareDesktopControlsMount(home, harness), undefined)
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(harness, { recursive: true, force: true })
  }
})

test('desktop controls mount links the complete package into the profile lookup path', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-desktop-controls-'))
  const harness = await mkdtemp(join(tmpdir(), 'dsh-desktop-controls-harness-'))
  const packageDir = join(harness, 'node_modules', 'dsh-desktop-controls')
  try {
    await mkdir(join(packageDir, 'lib'), { recursive: true })
    await writeFile(join(packageDir, 'cordis.patch.yml'), '- insert: []\n')
    await writeFile(join(packageDir, 'lib', 'index.js'), 'export function apply() {}\n')
    await writeFile(join(packageDir, 'lib', 'client.js'), '/* client */\n')
    const patch = prepareDesktopControlsMount(home, harness)
    assert.equal(patch, desktopControlsPatchPath(harness))
    assert.equal(await lstat(join(home, 'profiles', 'node_modules', 'dsh-desktop-controls')).then(stat => stat.isSymbolicLink()), true)
    assert.equal(await readFile(join(home, 'profiles', 'node_modules', 'dsh-desktop-controls', 'lib', 'client.js'), 'utf8'), '/* client */\n')
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(harness, { recursive: true, force: true })
  }
})
