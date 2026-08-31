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
  // Manual market entry: settings row + main-process install.
  assert.match(client, /getBundledPlugins/)
  assert.match(client, /getStartupStatus/)
  assert.match(client, /data-dsh-controls-stage/)
  assert.match(client, /installDshMarket/)
  assert.match(client, /marketInstall/)
  assert.match(client, /marketDamaged/)
  assert.match(client, /marketRisk/)
  assert.match(client, /data-dsh-market-risk/)
  assert.match(client, /groupRecovery/)
  assert.match(client, /data-dsh-desktop-advanced/)
  assert.match(client, /advancedTitle/)
  // Balance + kernel overlay rows (decisions 0025/0026).
  assert.match(client, /getBalance/)
  assert.match(client, /getKernelState/)
  assert.match(client, /kernelInstall/)
  // A successful check with no newer kernel must still answer the user.
  assert.match(client, /kernelUpToDate/)
  assert.match(client, /kernelRolledBack/)
  assert.match(client, /kernelCheckFailed/)
  assert.match(client, /dshDesktop/)

  // Host half: opt-in screen capture model tool (decision 0027, route C).
  const host = await readFile(join(pluginRoot, 'lib/index.js'), 'utf8')
  assert.match(host, /DSH_DESKTOP_SCREEN_CAPTURE/)
  assert.match(host, /screen_capture/)
  assert.match(host, /saveImage/)
  assert.match(host, /inputModalities/)
  assert.doesNotMatch(host, /vision route|visionRoute/)
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
  // The overlay panel mirrors the native surfaces' state-aware pairing entry.
  assert.match(client, /showLanPairing/)
  assert.match(client, /lanShowQr/)
  assert.match(client, /safeModeBanner/)
  assert.match(client, /enterSafeMode/)
  assert.match(client, /exitSafeMode/)
  // Restart joined the extension surfaces (decision 0028).
  assert.match(client, /restartHarness/)
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
