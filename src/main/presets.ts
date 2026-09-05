/**
 * Portable agent presets (decision 0021): export/import a preset directory
 * as one `.dshpreset` file. The harness mounts presets from root
 * directories; the user-writable root is `$DSH_HOME/.agent-presets/<id>/`
 * carrying `agent.cordis.yml` (composition) and `preset.yml` (display
 * metadata, YAML). The shell only packages those two files, so imported
 * presets mount through the official picker with no behavior change to the
 * agent.
 * @module main/presets
 */
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { moveToTrash } from './trash.ts'

export const PRESET_FORMAT = 'dsh-preset/v1'
const PRESET_DIR = '.agent-presets'
const COMPOSITION_FILE = 'agent.cordis.yml'
const METADATA_FILE = 'preset.yml'

export interface PresetMeta {
  id: string
  name: string
}

export interface PresetImportResult {
  ok: boolean
  reason?: 'invalid-id' | 'bad-format' | 'missing-composition' | 'write-failed'
  id?: string
  /** True when a conflicting preset was skipped instead of imported. */
  skipped?: boolean
  /** The id actually written when a conflict was cloned under a new name. */
  renamedTo?: string
}

/** The user-writable preset root, mirroring the harness's USER_PRESET_DIR. */
export function presetUserRoot(dshHome: string): string {
  return join(dshHome, PRESET_DIR)
}

/** Preset ids become directory names; keep them filesystem-safe. */
export function isSafePresetId(id: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(id) && !id.includes('..')
}

async function readPresetMeta(presetDir: string, id: string): Promise<PresetMeta> {
  let name = id
  try {
    const parsed = parseYaml(await readFile(join(presetDir, METADATA_FILE), 'utf8')) as { name?: unknown } | null
    if (typeof parsed?.name === 'string' && parsed.name.trim() !== '') name = parsed.name.trim()
  } catch {
    name = id
  }
  return { id, name }
}

/** List presets under the user root (a missing root yields an empty list). */
export async function listUserPresets(dshHome: string): Promise<PresetMeta[]> {
  const root = presetUserRoot(dshHome)
  let entries: Dirent[]
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const presets: PresetMeta[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafePresetId(entry.name)) continue
    const compositionOk = await stat(join(root, entry.name, COMPOSITION_FILE)).then(() => true).catch(() => false)
    if (!compositionOk) continue
    presets.push(await readPresetMeta(join(root, entry.name), entry.name))
  }
  return presets.sort((a, b) => a.id.localeCompare(b.id))
}

export interface PresetPackage {
  format: typeof PRESET_FORMAT
  id: string
  metadata: Record<string, unknown>
  composition: string
}

/** Package one preset id into the portable object (files must be readable). */
export async function buildPresetPackage(dshHome: string, id: string): Promise<PresetPackage> {
  if (!isSafePresetId(id)) throw new Error(`unsafe preset id: ${id}`)
  const presetDir = join(presetUserRoot(dshHome), id)
  const meta = parseYaml(await readFile(join(presetDir, METADATA_FILE), 'utf8')) as Record<string, unknown> | null
  const metadata = typeof meta === 'object' && meta !== null ? meta : { name: id }
  const composition = (await readFile(join(presetDir, COMPOSITION_FILE), 'utf8')).trim()
  if (composition === '') throw new Error(`preset ${id} has no composition`)
  return { format: PRESET_FORMAT, id, metadata, composition }
}

/**
 * Parse a `.dshpreset` payload. Returns undefined on anything malformed —
 * the caller reports a clean "invalid file" instead of an exception.
 */
export function parsePresetPackage(raw: string): PresetPackage | undefined {
  let parsed: Partial<PresetPackage>
  try {
    parsed = JSON.parse(raw) as Partial<PresetPackage>
  } catch {
    return undefined
  }
  if (parsed.format !== PRESET_FORMAT || typeof parsed.id !== 'string' || typeof parsed.composition !== 'string') {
    return undefined
  }
  const metadata = typeof parsed.metadata === 'object' && parsed.metadata !== null
    ? parsed.metadata as Record<string, unknown>
    : {}
  if (!isSafePresetId(parsed.id)) return undefined
  if (parsed.composition.trim() === '') return undefined
  return { format: PRESET_FORMAT, id: parsed.id, metadata, composition: parsed.composition }
}

/** Import one package; `mode` resolves a conflicting id upfront. */
export async function importPresetPackage(
  dshHome: string,
  pkg: PresetPackage,
  mode: 'skip' | 'overwrite' | 'clone',
): Promise<PresetImportResult> {
  if (pkg.format !== PRESET_FORMAT) return { ok: false, reason: 'bad-format' }
  if (!isSafePresetId(pkg.id)) return { ok: false, reason: 'invalid-id' }
  if (pkg.composition.trim() === '') return { ok: false, reason: 'missing-composition' }
  const root = presetUserRoot(dshHome)
  const existing = await stat(join(root, pkg.id)).then(() => true).catch(() => false)
  let targetId = pkg.id
  if (existing) {
    if (mode === 'skip') return { ok: true, skipped: true, id: pkg.id }
    if (mode === 'overwrite') {
      // The previous version is recoverable from the desktop trash instead of
      // being overwritten in place.
      try {
        await moveToTrash(dshHome, join(root, pkg.id), { kind: 'preset', name: pkg.id, source: 'overwritten by preset import' })
      } catch {
        return { ok: false, reason: 'write-failed' }
      }
    }
    if (mode === 'clone') targetId = await nextCloneId(pkg.id, root)
  }
  const targetDir = join(root, targetId)
  try {
    await mkdir(targetDir, { recursive: true })
    await writeFile(join(targetDir, COMPOSITION_FILE), `${pkg.composition.trim()}\n`, { encoding: 'utf8', mode: 0o600 })
    const metadata = { ...(pkg.metadata ?? {}) }
    if (mode === 'clone' && typeof metadata.name === 'string') metadata.name = `${metadata.name} (copy)`
    await writeFile(join(targetDir, METADATA_FILE), JSON.stringify(metadata) + '\n', { encoding: 'utf8', mode: 0o600 })
  } catch {
    return { ok: false, reason: 'write-failed' }
  }
  const result: PresetImportResult = { ok: true, id: targetId }
  if (targetId !== pkg.id) result.renamedTo = targetId
  return result
}

/** Pick a free clone name: `<id>-copy`, then `<id>-copy-2`, … */
async function nextCloneId(id: string, root: string): Promise<string> {
  for (let index = 1; ; index += 1) {
    const candidate = index === 1 ? `${id}-copy` : `${id}-copy-${index}`
    const taken = await stat(join(root, candidate)).then(() => true).catch(() => false)
    if (!taken) return candidate
  }
}

/** Delete a user preset into the desktop trash (safe-ids only); restore
 *  moves the directory straight back — presets carry no registry. */
export async function removeUserPreset(dshHome: string, id: string): Promise<void> {
  if (!isSafePresetId(id)) throw new Error(`unsafe preset id: ${id}`)
  await moveToTrash(dshHome, join(presetUserRoot(dshHome), id), { kind: 'preset', name: id, source: 'deleted from preset settings' })
}
