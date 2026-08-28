import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  buildPresetPackage,
  importPresetPackage,
  isSafePresetId,
  listUserPresets,
  parsePresetPackage,
  presetUserRoot,
  PRESET_FORMAT,
  removeUserPreset,
  type PresetPackage,
} from '../src/main/presets.ts'

async function makeHome(): Promise<{ home: string; cleanup: () => Promise<void> }> {
  const base = await mkdtemp(join(tmpdir(), 'dsh-presets-'))
  const home = join(base, 'home')
  const root = presetUserRoot(home)
  await mkdir(join(root, 'standard'), { recursive: true })
  await writeFile(join(root, 'standard', 'agent.cordis.yml'), '[]\n')
  await writeFile(join(root, 'standard', 'preset.yml'), 'name: Standard Preset\ndescription: The official one\n')
  return { home, cleanup: () => rm(base, { recursive: true, force: true }) }
}

test('listUserPresets reads user roots and ignores invalid dirs', async () => {
  const { home, cleanup } = await makeHome()
  try {
    await mkdir(join(presetUserRoot(home), '..bad'), { recursive: true })
    await writeFile(join(presetUserRoot(home), '..bad', 'agent.cordis.yml'), '[]\n')
    assert.deepEqual(await listUserPresets(home), [{ id: 'standard', name: 'Standard Preset' }])
  } finally {
    await cleanup()
  }
})

test('preset package round-trips through JSON and imports into a fresh home', async () => {
  const { home, cleanup } = await makeHome()
  try {
    const pkg = await buildPresetPackage(home, 'standard')
    assert.equal(pkg.format, PRESET_FORMAT)
    const roundTrip = parsePresetPackage(JSON.stringify(pkg))
    assert.ok(roundTrip !== undefined)
    const target = await mkdtemp(join(tmpdir(), 'dsh-presets-target-'))
    const result = await importPresetPackage(target, roundTrip, 'overwrite')
    assert.equal(result.ok, true)
    assert.equal(result.id, 'standard')
    assert.equal(result.renamedTo, undefined)
    assert.equal((await readFile(join(presetUserRoot(target), 'standard', 'agent.cordis.yml'), 'utf8')).trim(), '[]')
    assert.deepEqual(await listUserPresets(target), [{ id: 'standard', name: 'Standard Preset' }])
    await rm(target, { recursive: true, force: true })
  } finally {
    await cleanup()
  }
})

test('parsePresetPackage rejects malformed payloads and unsafe ids', () => {
  assert.equal(parsePresetPackage('not json'), undefined)
  assert.equal(parsePresetPackage(JSON.stringify({ format: 'other', id: 'a', composition: '[]' })), undefined)
  assert.equal(parsePresetPackage(JSON.stringify({ format: PRESET_FORMAT, id: '../evil', composition: '[]' })), undefined)
  assert.equal(parsePresetPackage(JSON.stringify({ format: PRESET_FORMAT, id: 'ok', composition: '  ' })), undefined)
  assert.equal(isSafePresetId('../evil'), false)
  assert.equal(isSafePresetId('a..b'), false)
  assert.equal(isSafePresetId('standard'), true)
})

test('import resolves conflicts by skip, overwrite, or clone', async () => {
  const { home, cleanup } = await makeHome()
  try {
    const pkg: PresetPackage = { format: PRESET_FORMAT, id: 'standard', metadata: { name: 'New' }, composition: '- id: custom\n' }
    const skip = await importPresetPackage(home, pkg, 'skip')
    assert.deepEqual({ ok: skip.ok, skipped: skip.skipped }, { ok: true, skipped: true })
    assert.equal((await readFile(join(presetUserRoot(home), 'standard', 'agent.cordis.yml'), 'utf8')).trim(), '[]')
    const overwrite = await importPresetPackage(home, pkg, 'overwrite')
    assert.equal(overwrite.ok, true)
    assert.equal((await readFile(join(presetUserRoot(home), 'standard', 'agent.cordis.yml'), 'utf8')).trim(), '- id: custom')
    const clone = await importPresetPackage(home, pkg, 'clone')
    assert.equal(clone.renamedTo, 'standard-copy')
    assert.equal(await readFile(join(presetUserRoot(home), 'standard-copy', 'agent.cordis.yml'), 'utf8').then(t => t.trim()), '- id: custom')
    const cloneAgain = await importPresetPackage(home, pkg, 'clone')
    assert.equal(cloneAgain.renamedTo, 'standard-copy-2')
  } finally {
    await cleanup()
  }
})

test('import rejects unsafe ids and reports write failures', async () => {
  const { home, cleanup } = await makeHome()
  try {
    const bad = await importPresetPackage(home, { format: PRESET_FORMAT, id: '../evil', metadata: {}, composition: '[]' }, 'overwrite')
    assert.deepEqual(bad, { ok: false, reason: 'invalid-id' })
    const readOnly = await mkdtemp(join(tmpdir(), 'dsh-presets-readonly-'))
    await mkdir(readOnly, { recursive: true })
    await import('node:fs/promises').then(fs => fs.chmod(readOnly, 0o555))
    const failed = await importPresetPackage(readOnly, { format: PRESET_FORMAT, id: 'x', metadata: {}, composition: '[]' }, 'overwrite')
    assert.equal(failed.ok, false)
    await import('node:fs/promises').then(fs => fs.chmod(readOnly, 0o755))
  } finally {
    await cleanup()
  }
})

test('removeUserPreset deletes only safe ids', async () => {
  const { home, cleanup } = await makeHome()
  try {
    await removeUserPreset(home, 'standard')
    assert.deepEqual(await listUserPresets(home), [])
    await assert.rejects(removeUserPreset(home, '../../etc'), /unsafe/)
  } finally {
    await cleanup()
  }
})
