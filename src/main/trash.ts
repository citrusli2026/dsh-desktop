/**
 * The desktop trash: every resource the shell deletes — presets, plugins,
 * kernel versions, sessions, and files intercepted from agent commands — is
 * renamed under `<DSH_HOME>/trash/items/<id>/` and recorded in
 * `<DSH_HOME>/trash/index.json`, so the Desktop settings trash page can list
 * and restore it. Non-destructive by contract: "delete" means a rename into
 * the items directory; purging happens only past the retention window or on
 * an explicit user action. Restore moves the entry back to its origin path,
 * falling back to a numbered "… (restored)" name when the origin is taken.
 * @module main/trash
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { atomicWriteFile } from './config-file.ts'

export type TrashEntryKind = 'preset' | 'plugin' | 'kernel' | 'session' | 'file'

export interface TrashEntry {
  id: string
  kind: TrashEntryKind
  /** Display name: the entry's file name at deletion time. */
  name: string
  /** Absolute path the entry is restored to. */
  originPath: string
  deletedAt: number
  /** Human-readable context, e.g. "preset import overwrote this version". */
  source?: string
}

export const TRASH_RETENTION_DAYS = 30

/** Parse and normalize the index document, dropping malformed rows. */
export function parseTrashIndex(raw: unknown): TrashEntry[] {
  if (!Array.isArray(raw)) return []
  const entries: TrashEntry[] = []
  for (const row of raw) {
    if (row === null || typeof row !== 'object') continue
    const candidate = row as Partial<TrashEntry>
    const { id, name, originPath, deletedAt } = candidate
    if (typeof id !== 'string' || id === '') continue
    if (typeof name !== 'string' || name === '') continue
    if (typeof originPath !== 'string' || originPath === '') continue
    if (typeof deletedAt !== 'number' || !Number.isSafeInteger(deletedAt)) continue
    entries.push({
      id,
      kind: candidate.kind ?? 'file',
      name,
      originPath,
      deletedAt,
      ...(typeof candidate.source === 'string' ? { source: candidate.source } : {}),
    })
  }
  return entries
}

/**
 * The path to restore to: the origin when free, otherwise a numbered
 * "name (restored)", "name (restored 2)", … sibling so a restore never
 * clobbers newer data.
 */
export function conflictFreeRestorePath(originPath: string, exists: (path: string) => boolean): string {
  if (!exists(originPath)) return originPath
  for (let counter = 2;; counter += 1) {
    const candidate = join(dirname(originPath), counter === 2
      ? `${basename(originPath)} (restored)`
      : `${basename(originPath)} (restored ${counter})`)
    if (!exists(candidate)) return candidate
  }
}

/** Entries whose retention window has elapsed (oldest first). */
export function expiredTrashEntries(entries: readonly TrashEntry[], now: number, retentionDays = TRASH_RETENTION_DAYS): TrashEntry[] {
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000
  return entries.filter(entry => entry.deletedAt <= cutoff).sort((left, right) => left.deletedAt - right.deletedAt)
}

export function trashRoot(dshHome: string): string {
  return join(dshHome, 'trash')
}

function itemsRoot(dshHome: string): string {
  return join(trashRoot(dshHome), 'items')
}

function indexPath(dshHome: string): string {
  return join(trashRoot(dshHome), 'index.json')
}

async function readIndex(dshHome: string): Promise<TrashEntry[]> {
  try {
    return parseTrashIndex(JSON.parse(await readFile(indexPath(dshHome), 'utf8')))
  } catch {
    return []
  }
}

async function writeIndex(dshHome: string, entries: readonly TrashEntry[]): Promise<void> {
  await atomicWriteFile(indexPath(dshHome), `${JSON.stringify(entries, null, 2)}\n`)
}

/** List every trashed entry, newest first. */
export async function listTrash(dshHome: string): Promise<TrashEntry[]> {
  return (await readIndex(dshHome)).sort((left, right) => right.deletedAt - left.deletedAt)
}

export interface MoveToTrashOptions {
  kind: TrashEntryKind
  /** Display name; defaults to the path's basename. */
  name?: string
  source?: string
}

/**
 * Rename `originPath` into the trash and record it. If the index write fails
 * after the rename, the entry is renamed back — a trash failure must never
 * lose data.
 */
export async function moveToTrash(dshHome: string, originPath: string, options: MoveToTrashOptions): Promise<TrashEntry> {
  if (!existsSync(originPath)) throw new Error(`trash: nothing to delete at ${originPath}`)
  const entry: TrashEntry = {
    id: `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    kind: options.kind,
    name: options.name ?? basename(originPath),
    originPath,
    deletedAt: Date.now(),
    ...(options.source === undefined ? {} : { source: options.source }),
  }
  await mkdir(itemsRoot(dshHome), { recursive: true })
  const storedPath = join(itemsRoot(dshHome), entry.id)
  await rename(originPath, storedPath)
  try {
    const entries = await readIndex(dshHome)
    await writeIndex(dshHome, [...entries, entry])
  } catch (error) {
    await rename(storedPath, originPath).catch(() => {})
    throw error
  }
  return entry
}

/** Restore one entry to its origin (numbered sibling on conflict). */
export async function restoreFromTrash(dshHome: string, id: string): Promise<TrashEntry> {
  const entries = await readIndex(dshHome)
  const entry = entries.find(candidate => candidate.id === id)
  if (entry === undefined) throw new Error(`trash: unknown entry ${id}`)
  const storedPath = join(itemsRoot(dshHome), entry.id)
  if (!existsSync(storedPath)) {
    // Item already gone (purged by hand): drop the stale record.
    await writeIndex(dshHome, entries.filter(candidate => candidate.id !== id))
    throw new Error(`trash: entry ${id} is no longer in the items directory`)
  }
  const destination = conflictFreeRestorePath(entry.originPath, existsSync)
  await mkdir(dirname(destination), { recursive: true })
  await rename(storedPath, destination)
  await writeIndex(dshHome, entries.filter(candidate => candidate.id !== id))
  return { ...entry, originPath: destination }
}

/** Purge one entry permanently (explicit user action). */
export async function purgeFromTrash(dshHome: string, id: string): Promise<boolean> {
  const entries = await readIndex(dshHome)
  const entry = entries.find(candidate => candidate.id === id)
  if (entry === undefined) return false
  await rm(join(itemsRoot(dshHome), entry.id), { recursive: true, force: true })
  await writeIndex(dshHome, entries.filter(candidate => candidate.id !== id))
  return true
}

/** Purge everything past the retention window; returns purged entries. */
export async function purgeExpiredTrash(dshHome: string, now = Date.now(), retentionDays = TRASH_RETENTION_DAYS): Promise<TrashEntry[]> {
  const entries = await readIndex(dshHome)
  const expired = expiredTrashEntries(entries, now, retentionDays)
  for (const entry of expired) {
    await rm(join(itemsRoot(dshHome), entry.id), { recursive: true, force: true })
  }
  if (expired.length > 0) {
    const expiredIds = new Set(expired.map(entry => entry.id))
    await writeIndex(dshHome, entries.filter(entry => !expiredIds.has(entry.id)))
  }
  return expired
}

/** The on-disk layout of one session (shared by the trash page and IPC). */
export function sessionDirPath(dshHome: string, projectKey: string, sessionId: string): string {
  return join(dshHome, 'sessions', projectKey, `session-${sessionId}`)
}
