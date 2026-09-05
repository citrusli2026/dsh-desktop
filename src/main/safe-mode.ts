/**
 * Safe Mode (decision 0021): a shell-owned startup composition that disables
 * every user-installed plugin bundle while keeping the official bundles and
 * the shell-owned controls overlay. Non-destructive by contract: user profile
 * files are only read, never written.
 *
 * Verified in spike (2026-08-28): `dsh plugin add` appends the package name
 * to `dsh.profile.bundles`; each bundle's `dsh.bundle.patch` is a Cordis
 * patch list whose `insert` rows become tree rows addressed by `id`; a
 * `--patch` overlay of `{ id, disabled: true }` rows disables them in the
 * composed tree (the same mechanism the harness uses for its telemetry
 * switch).
 * @module main/safe-mode
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse, stringify } from 'yaml'

/** The web profile name the desktop shell always boots (HARNESS_WEB_ARGS). */
export const WEB_PROFILE = 'web'

/** Official web-profile template bundles; anything else is user-installed. */
export const OFFICIAL_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] as const

/** The failure chain a broken plugin emits on stderr (spike-captured). */
export const PLUGIN_FAILURE_PATTERN = /failed to (?:apply|import) loader entry (\S+) \(([^)]*)\)/g

/** A bundle listed in the profile but missing from node_modules (dsh-app-boot). */
export const BUNDLE_RESOLUTION_PATTERN = /cannot resolve profile bundle "([^"]+)"/g

/**
 * Why a plugin failed to load. `kernel-api` is the recurring upgrade cliff:
 * the plugin imports a symbol the bundled kernel no longer exports, so the
 * fix is to update (or disable) the plugin — exactly what the error page's
 * recovery rows offer.
 */
export type PluginFailureCause = 'kernel-api' | 'unknown'

/** Log evidence that a loader entry failed on a kernel module import. */
const KERNEL_API_EVIDENCE = [
  /does not provide an export named/i,
  /SyntaxError: The requested module '@deepseek-ai\/dsh-/,
]

/**
 * Classify why the failing plugins in `logTail` failed. The kernel-API cliff
 * always shows up as an ESM import error against a `@deepseek-ai/dsh-*`
 * module; anything else stays `unknown` rather than guessing.
 */
export function classifyPluginFailureCause(logTail: string): PluginFailureCause {
  return KERNEL_API_EVIDENCE.some(pattern => pattern.test(logTail)) ? 'kernel-api' : 'unknown'
}

/** A row id reachable through nested insert/group compositions. */
export interface ComposedRow {
  id: string
  name?: string
}

export interface SafeModeOverlay {
  /** Disable patch rows for the composed tree, in insertion order. */
  ids: ComposedRow[]
  /** Rows without an id — not addressable, Safe Mode cannot disable them. */
  unkeyedRows: number
  /** Bundles whose manifest or patch could not be read. */
  unresolved: string[]
}

/** The path the loader imports a row's module from. */
function installedPackagePath(dshHome: string, profile: string, name: string): string | undefined {
  for (const base of [join(dshHome, 'profiles', profile, 'node_modules'), join(dshHome, 'profiles', 'node_modules')]) {
    const candidate = join(base, name)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/**
 * Collect every `insert` row id from a bundle patch list, mirroring the
 * loader's own recursion (an inserted row may carry a nested `group` whose
 * `config` is another entry list).
 */
export function collectInsertIds(rows: unknown[]): { rows: ComposedRow[]; unkeyedRows: number } {
  const found: ComposedRow[] = []
  let unkeyedRows = 0
  const walk = (list: unknown[]): void => {
    for (const item of list) {
      const row = item as { id?: unknown; name?: unknown; group?: unknown; config?: unknown; insert?: unknown }
      if (row === null || typeof row !== 'object') continue
      if (Array.isArray(row.insert)) {
        walk(row.insert as unknown[])
        continue
      }
      if (typeof row.id === 'string') {
        const composed: ComposedRow = { id: row.id }
        if (typeof row.name === 'string') composed.name = row.name
        found.push(composed)
        // The loader walks a group's children via the row-level `config`
        // (applyEntryPatches.buildMap); some authors nest it under `group.config`.
        const nested = Array.isArray(row.config)
          ? row.config
          : Array.isArray((row.group as { config?: unknown } | undefined)?.config)
            ? (row.group as { config: unknown[] }).config
            : undefined
        if (nested !== undefined) walk(nested)
      } else {
        unkeyedRows += 1
      }
    }
  }
  walk(rows)
  return { rows: found, unkeyedRows }
}

/** Parse one bundle patch file tolerating the harness's `!!js` dialect. */
function parsePatch(text: string): unknown[] {
  const JsScalar = {
    tag: 'tag:yaml.org,2002:js',
    kind: 'scalar' as const,
    resolve: () => true,
    construct: (value: string) => ({ __jsExpr: value }),
  }
  const data = parse(text, { customTags: [JsScalar] })
  if (!Array.isArray(data)) return []
  return data
}

/**
 * Compute the Safe Mode disable overlay for a profile: one `disabled: true`
 * patch row per user-bundle row id. Official bundles and the shell-owned
 * controls overlay stay mounted; user files are never touched.
 */
export async function buildSafeModeOverlay(dshHome: string, profile = WEB_PROFILE): Promise<SafeModeOverlay> {
  const manifestPath = join(dshHome, 'profiles', profile, 'package.json')
  let manifest: { dsh?: { profile?: { bundles?: string[] } } }
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as typeof manifest
  } catch {
    return { ids: [], unkeyedRows: 0, unresolved: ['<missing profile manifest>'] }
  }
  const bundles = manifest.dsh?.profile?.bundles ?? []
  const userBundles = bundles.filter((name) => !(OFFICIAL_BUNDLES as readonly string[]).includes(name))
  const ids: ComposedRow[] = []
  let unkeyedRows = 0
  const unresolved: string[] = []
  for (const name of userBundles) {
    const packageDir = installedPackagePath(dshHome, profile, name)
    if (packageDir === undefined) {
      unresolved.push(name)
      continue
    }
    let patchFile: string | undefined
    try {
      const packageJson = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8')) as {
        dsh?: { bundle?: { patch?: string } }
      }
      patchFile = packageJson.dsh?.bundle?.patch
    } catch {
      patchFile = undefined
    }
    if (typeof patchFile !== 'string') {
      unresolved.push(name)
      continue
    }
    try {
      const data = parsePatch(await readFile(resolve(packageDir, patchFile), 'utf8'))
      const collected = collectInsertIds(data)
      ids.push(...collected.rows)
      unkeyedRows += collected.unkeyedRows
    } catch {
      unresolved.push(name)
    }
  }
  return { ids, unkeyedRows, unresolved }
}

/**
 * Detect a plugin-load failure on one harness output line; the final match
 * carries the deepest leaf (`<id> (<name>)`). Returns undefined for lines
 * that are not plugin failures.
 */
export function detectPluginFailure(line: string): { id: string; name: string } | undefined {
  const last = [...line.matchAll(PLUGIN_FAILURE_PATTERN)].at(-1)
  if (last !== undefined) {
    const id = last[1]
    const name = last[2]
    if (id !== undefined && name !== undefined) return { id, name }
  }
  const missing = [...line.matchAll(BUNDLE_RESOLUTION_PATTERN)].at(-1)
  const bundle = missing?.[1]
  if (bundle !== undefined) return { id: bundle, name: bundle }
  return undefined
}

/** The disable patch rows for one computed overlay. */
export function toDisablePatch(overlay: SafeModeOverlay): readonly { id: string; disabled: true }[] {
  return overlay.ids.map(row => ({ id: row.id, disabled: true as const }))
}

/** What a profile actually composed: bundles, user bundles, and their rows. */
export interface PluginInventory {
  bundles: string[]
  userBundles: string[]
  composedRows: ComposedRow[]
  damagedBundles: string[]
}

/** Inspect the live profile for diagnostics: bundles and composed rows. */
export async function inspectPluginInventory(dshHome: string, profile = WEB_PROFILE): Promise<PluginInventory> {
  const overlay = await buildSafeModeOverlay(dshHome, profile)
  let bundles: string[] = []
  try {
    const manifest = JSON.parse(await readFile(join(dshHome, 'profiles', profile, 'package.json'), 'utf8')) as {
      dsh?: { profile?: { bundles?: string[] } }
    }
    bundles = manifest.dsh?.profile?.bundles ?? []
  } catch {
    bundles = []
  }
  const userBundles = bundles.filter(name => !(OFFICIAL_BUNDLES as readonly string[]).includes(name))
  return { bundles, userBundles, composedRows: overlay.ids, damagedBundles: overlay.unresolved }
}

/** Unique suspected-bad-plugin rows found in harness output (deepest leaf per line). */
export function collectPluginFailures(text: string): ComposedRow[] {
  const found: ComposedRow[] = []
  const seen = new Set<string>()
  for (const line of text.split('\n')) {
    const match = detectPluginFailure(line)
    if (match === undefined || seen.has(match.id)) continue
    seen.add(match.id)
    found.push({ id: match.id, name: match.name })
  }
  return found
}

/**
 * Keep crash suspects visible while Safe Mode is the active recovery path.
 * A normal ready boot or an explicit Safe Mode exit is the user's signal that
 * the previous quarantine context is no longer actionable.
 */
export function updatePluginFailureMemory(
  previous: ComposedRow[],
  phase: 'starting' | 'ready' | 'crashed',
  logTail: string,
  safeMode: boolean,
): ComposedRow[] {
  if (phase === 'ready' && !safeMode) return []
  if (phase !== 'crashed') return previous
  const current = collectPluginFailures(logTail)
  if (current.length > 0) return current
  return safeMode ? previous : []
}

/**
 * Compute and persist the Safe Mode overlay into `dir` (usually userData),
 * returning its path. Returns undefined when there is nothing to disable or
 * the write fails — Safe Mode must never block a boot over its own recovery
 * overlay. Unresolved bundles and unkeyed rows are only logged, never fatal.
 */
export async function writeSafeModeOverlay(dshHome: string, dir: string, profile = WEB_PROFILE): Promise<string | undefined> {
  const overlay = await buildSafeModeOverlay(dshHome, profile)
  for (const name of overlay.unresolved) {
    console.warn(`dsh-desktop: safe mode could not inspect bundle ${name}`)
  }
  if (overlay.unkeyedRows > 0) {
    console.warn(`dsh-desktop: safe mode found ${overlay.unkeyedRows} unkeyed row(s) it cannot disable`)
  }
  if (overlay.ids.length === 0) {
    // No user bundles composed: the profile is already safe; no overlay needed.
    return undefined
  }
  const path = join(dir, 'safe-mode.patch.yml')
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(path, stringify(toDisablePatch(overlay)))
    return path
  } catch (error) {
    console.warn(`dsh-desktop: safe mode overlay write failed: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}
