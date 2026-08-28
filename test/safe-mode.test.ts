import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  buildSafeModeOverlay,
  collectInsertIds,
  collectPluginFailures,
  detectPluginFailure,
  inspectPluginInventory,
  OFFICIAL_BUNDLES,
  toDisablePatch,
  writeSafeModeOverlay,
  type SafeModeOverlay,
} from '../src/main/safe-mode.ts'

test('collectInsertIds walks insert lists and nested groups, counting unkeyed rows', () => {
  const { rows, unkeyedRows } = collectInsertIds([
    { id: 'timer', name: '@deepseek-ai/cordis-plugin-timer' },
    {
      insert: [
        { id: 'plugins', group: { config: [{ id: 'inner-a' }, { id: 'inner-b' }] } },
        { name: 'unkeyed-module' },
      ],
    },
  ])
  assert.deepEqual(rows, [
    { id: 'timer', name: '@deepseek-ai/cordis-plugin-timer' },
    { id: 'plugins' },
    { id: 'inner-a' },
    { id: 'inner-b' },
  ])
  assert.equal(unkeyedRows, 1)
})

test('detectPluginFailure extracts the deepest failing row id and name', () => {
  const line = 'Error: failed to apply loader entry include (cordis:include): failed to apply loader entry spike-fake (spike-fake-plugin): SPIKE_BROKEN_PLUGIN_BOOM'
  assert.deepEqual(detectPluginFailure(line), { id: 'spike-fake', name: 'spike-fake-plugin' })
  assert.equal(detectPluginFailure('dsh web: http://127.0.0.1:52247'), undefined)
  assert.equal(detectPluginFailure(''), undefined)
})

async function makeHome(): Promise<{ home: string; cleanup: () => Promise<void> }> {
  const base = await mkdtemp(join(tmpdir(), 'dsh-safe-mode-'))
  const home = join(base, 'home')
  const profile = join(home, 'profiles', 'web')
  await mkdir(join(profile, 'node_modules'), { recursive: true })
  return {
    home,
    cleanup: () => rm(base, { recursive: true, force: true }),
  }
}

async function installBundle(home: string, name: string, patch: string): Promise<void> {
  const pkg = join(home, 'profiles', 'web', 'node_modules', name)
  await mkdir(pkg, { recursive: true })
  await writeFile(
    join(pkg, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }),
  )
  await writeFile(join(pkg, 'cordis.patch.yml'), patch)
}

function writeManifest(home: string, bundles: string[]): Promise<void> {
  return writeFile(
    join(home, 'profiles', 'web', 'package.json'),
    JSON.stringify({ name: 'dsh-profile-web', private: true, dependencies: {}, dsh: { profile: { bundles } } }),
  )
}

test('buildSafeModeOverlay collects user bundle rows, excluding official bundles', async () => {
  const { home, cleanup } = await makeHome()
  try {
    await writeManifest(home, [...OFFICIAL_BUNDLES, 'user-plugin'])
    await installBundle(
      home,
      'user-plugin',
      [
        '- insert:',
        '    - id: user-a',
        "      name: 'user-plugin'",
        '    - id: group-row',
        '      group: {}',
        '      config:',
        '        - id: child-row',
      ].join('\n'),
    )
    const overlay = await buildSafeModeOverlay(home)
    assert.deepEqual(
      overlay.ids.map((row) => row.id).sort(),
      ['child-row', 'group-row', 'user-a'],
    )
    assert.equal(overlay.unkeyedRows, 0)
    assert.deepEqual(overlay.unresolved, [])
  } finally {
    await cleanup()
  }
})

test('buildSafeModeOverlay tolerates the harness !!js dialect', async () => {
  const { home, cleanup } = await makeHome()
  try {
    await writeManifest(home, ['user-plugin'])
    await installBundle(home, 'user-plugin', ['- insert:', '    - id: js-row', "      config:", "        fn: !!js '() => 1'"].join('\n'))
    const overlay = await buildSafeModeOverlay(home)
    assert.deepEqual(overlay.ids.map((row) => row.id), ['js-row'])
    assert.deepEqual(overlay.unresolved, [])
  } finally {
    await cleanup()
  }
})

test('buildSafeModeOverlay reports missing or broken bundles without throwing', async () => {
  const { home, cleanup } = await makeHome()
  try {
    await writeManifest(home, ['ghost-plugin'])
    assert.deepEqual(await buildSafeModeOverlay(home), { ids: [], unkeyedRows: 0, unresolved: ['ghost-plugin'] })
    await installBundle(home, 'ghost-plugin', '- insert: [\n')
    const overlay = await buildSafeModeOverlay(home)
    assert.deepEqual(overlay.unresolved, ['ghost-plugin'])
  } finally {
    await cleanup()
  }
})

test('buildSafeModeOverlay resolves hoisted profile node_modules and a missing manifest', async () => {
  const base = await mkdtemp(join(tmpdir(), 'dsh-safe-mode-hoist-'))
  const home = join(base, 'home')
  const profile = join(home, 'profiles', 'web')
  const hoisted = join(home, 'profiles', 'node_modules')
    const pkg = join(hoisted, 'hoisted-plugin')
    try {
    await mkdir(pkg, { recursive: true })
    await mkdir(profile, { recursive: true })
    await writeFile(
      join(pkg, 'package.json'),
      JSON.stringify({ name: 'hoisted-plugin', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }),
    )
    await writeFile(join(pkg, 'cordis.patch.yml'), '- insert:\n    - id: hoisted-row\n')
    await writeFile(
      join(profile, 'package.json'),
      JSON.stringify({ private: true, dsh: { profile: { bundles: ['hoisted-plugin'] } } }),
    )
    assert.deepEqual((await buildSafeModeOverlay(home)).ids.map((row) => row.id), ['hoisted-row'])
    const emptyHome = join(base, 'empty')
    assert.deepEqual(await buildSafeModeOverlay(emptyHome), { ids: [], unkeyedRows: 0, unresolved: ['<missing profile manifest>'] })
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('safe mode overlay shape stays a plain disable patch list', async () => {
  const { home, cleanup } = await makeHome()
  try {
    await writeManifest(home, ['user-plugin'])
    await installBundle(home, 'user-plugin', '- insert:\n    - id: only\n')
    const overlay: SafeModeOverlay = await buildSafeModeOverlay(home)
    const patch = overlay.ids.map((row) => ({ id: row.id, disabled: true }))
    assert.deepEqual(patch, [{ id: 'only', disabled: true }])
  } finally {
    await cleanup()
  }
})

test('writeSafeModeOverlay persists the disable patch and skips empty profiles', async () => {
  const { home, cleanup } = await makeHome()
  try {
    await writeManifest(home, ['user-plugin'])
    await installBundle(home, 'user-plugin', '- insert:\n    - id: only\n')
    const dir = await mkdtemp(join(tmpdir(), 'dsh-safe-mode-dir-'))
    const path = await writeSafeModeOverlay(home, dir)
    assert.ok(path !== undefined)
    assert.match(await readFile(path, 'utf8'), /id: only/)
    assert.match(await readFile(path, 'utf8'), /disabled: true/)
    const emptyHome = await mkdtemp(join(tmpdir(), 'dsh-safe-mode-empty-'))
    assert.equal(await writeSafeModeOverlay(emptyHome, dir), undefined)
  } finally {
    await cleanup()
  }
})

test('toDisablePatch is the only composed overlay shape', () => {
  assert.deepEqual(toDisablePatch({ ids: [{ id: 'a' }, { id: 'b', name: 'pkg' }], unkeyedRows: 0, unresolved: [] }), [
    { id: 'a', disabled: true },
    { id: 'b', disabled: true },
  ])
})

test('collectPluginFailures dedupes rows across harness log lines', () => {
  const text = [
    'Error: failed to apply loader entry include (cordis:include): failed to apply loader entry a (pkg-a): boom',
    'Error: failed to apply loader entry include (cordis:include): failed to apply loader entry a (pkg-a): boom again',
    'Error: failed to apply loader entry include (cordis:include): failed to apply loader entry b (pkg-b): nope',
    'dsh web: http://127.0.0.1:1',
  ].join('\n')
  assert.deepEqual(collectPluginFailures(text), [
    { id: 'a', name: 'pkg-a' },
    { id: 'b', name: 'pkg-b' },
  ])
})

test('inspectPluginInventory reports bundles, composed rows, and damaged packages', async () => {
  const { home, cleanup } = await makeHome()
  try {
    await writeManifest(home, [...OFFICIAL_BUNDLES, 'user-plugin', 'ghost-plugin'])
    await installBundle(home, 'user-plugin', '- insert:\n    - id: user-a\n')
    const inventory = await inspectPluginInventory(home)
    assert.deepEqual(inventory.bundles.sort(), [...OFFICIAL_BUNDLES, 'ghost-plugin', 'user-plugin'].sort())
    assert.deepEqual(inventory.userBundles.sort(), ['ghost-plugin', 'user-plugin'])
    assert.deepEqual(inventory.composedRows.map(row => row.id), ['user-a'])
    assert.deepEqual(inventory.damagedBundles, ['ghost-plugin'])
  } finally {
    await cleanup()
  }
})
