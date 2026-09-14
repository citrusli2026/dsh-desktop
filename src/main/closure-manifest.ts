/**
 * Bundled-closure integrity manifest (decision 0032): every file under the
 * packaged resources directory is hashed at package time into a single
 * `manifest.json`, and the shell can later verify the on-disk tree against
 * it. Upgrade residue, antivirus rewrites, and interrupted installs leave
 * changed, missing, or unexpected files (#39) — the magic-number check on
 * the Node binary alone cannot see those; this manifest covers the whole
 * closure. Dev checkouts have no manifest, so every consumer must treat
 * `missing-manifest` as "fall back to the cheap checks".
 * @module main/closure-manifest
 */
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

/** The single manifest document, always at the resources dir root. */
export const CLOSURE_MANIFEST_FILE = 'manifest.json'

export const CLOSURE_INTEGRITY_PROBLEM_LIMIT = 8

export interface ClosureManifest {
  version: string
  algorithm: 'sha256'
  /** Relative (posix-style) path under the resources dir → sha256 hex. */
  files: Record<string, string>
}

export type ClosureIntegrityStatus =
  | 'ok'
  | 'changed'
  | 'missing-manifest'
  | 'unreadable-manifest'

export interface ClosureIntegrityResult {
  status: ClosureIntegrityStatus
  /** Manifest entries actually re-hashed (0 unless a manifest was verified). */
  checked: number
  /** Bounded list of `changed <path>` / `missing <path>` / `residue <path>` entries. */
  problems: string[]
  /** Total problem count, unbounded by the display limit. */
  problemCount: number
}

async function* walkFiles(root: string): AsyncGenerator<string> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      yield* walkFiles(path)
    } else if (entry.isFile()) {
      yield path
    }
  }
}

/** Absolute path of the closure manifest for a packaged resources dir. */
export function closureManifestPath(resourcesRoot: string): string {
  return join(resourcesRoot, CLOSURE_MANIFEST_FILE)
}

function toKey(resourcesRoot: string, path: string): string {
  return relative(resourcesRoot, path).split(sep).join('/')
}

async function sha256File(path: string): Promise<string> {
  // Electron patches fs so any `*.asar` path is served through the archive
  // virtual filesystem; hashing the raw archive bytes requires disabling
  // that patch while reading (a plain Node process is unaffected).
  const electronFs = process as NodeJS.Process & { noAsar?: boolean }
  const previous = electronFs.noAsar
  electronFs.noAsar = true
  try {
    const hash = createHash('sha256')
    hash.update(await readFile(path))
    return hash.digest('hex')
  } finally {
    electronFs.noAsar = previous
  }
}

/** Hash every file under `resourcesRoot` (except the manifest itself) into a
 *  manifest document. Runs at package time from the electron-builder
 *  `afterPack` hook, when the unpacked tree is complete. */
export async function generateClosureManifest(resourcesRoot: string, version: string): Promise<string> {
  const files: Record<string, string> = {}
  for await (const path of walkFiles(resourcesRoot)) {
    if (path === closureManifestPath(resourcesRoot)) continue
    files[toKey(resourcesRoot, path)] = await sha256File(path)
  }
  const manifest: ClosureManifest = { version, algorithm: 'sha256', files }
  return `${JSON.stringify(manifest)}\n`
}

/**
 * Verify the on-disk resources tree against its packaged manifest. Deterministic
 * order, bounded problem list; `missing-manifest` is the dev-checkout answer,
 * not a failure. Missing files (upgrade residue, AV quarantine), changed files
 * (truncated rewrite), and unexpected extra files (stale upgrades) are all
 * problems — exactly the #39/#40 family this module exists to make visible.
 */
export async function verifyClosureManifest(resourcesRoot: string): Promise<ClosureIntegrityResult> {
  const manifestPath = closureManifestPath(resourcesRoot)
  let manifest: ClosureManifest
  try {
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as Partial<ClosureManifest>
    if (typeof parsed.files !== 'object' || parsed.files === null) throw new Error('no file map')
    manifest = { version: String(parsed.version ?? 'unknown'), algorithm: 'sha256', files: parsed.files as Record<string, string> }
  } catch {
    const missing = await stat(manifestPath).then(() => false).catch(() => true)
    return { status: missing ? 'missing-manifest' : 'unreadable-manifest', checked: 0, problems: [], problemCount: 0 }
  }

  const problems: string[] = []
  let problemCount = 0
  let checked = 0
  const onDisk = new Set<string>()
  for await (const path of walkFiles(resourcesRoot)) {
    if (path === manifestPath) continue
    onDisk.add(toKey(resourcesRoot, path))
  }
  for (const key of Object.keys(manifest.files).sort()) {
    const expected = manifest.files[key]!
    const path = join(resourcesRoot, ...key.split('/'))
    if (!onDisk.delete(key)) {
      problemCount += 1
      if (problems.length < CLOSURE_INTEGRITY_PROBLEM_LIMIT) problems.push(`missing ${key}`)
      continue
    }
    checked += 1
    if (await sha256File(path).catch(() => '') !== expected) {
      problemCount += 1
      if (problems.length < CLOSURE_INTEGRITY_PROBLEM_LIMIT) problems.push(`changed ${key}`)
    }
  }
  for (const key of onDisk) {
    problemCount += 1
    if (problems.length < CLOSURE_INTEGRITY_PROBLEM_LIMIT) problems.push(`residue ${key}`)
  }
  return {
    status: problemCount === 0 ? 'ok' : 'changed',
    checked,
    problems,
    problemCount,
  }
}
