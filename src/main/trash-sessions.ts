/**
 * Session trash support: sessions are directories under
 * `<DSH_HOME>/sessions/<projectKey>/session-<id>/` plus a soft-hide flag in
 * `storages/workspace.json` (`archivedSessionIds`). The kernel's search index
 * reconciles itself when a session directory appears or disappears, so the
 * trash can move those directories out and back without breaking the kernel.
 * Deleting a *running* session is refused; the caller (main window IPC) feeds
 * the ids the WebUI last reported.
 * @module main/trash-sessions
 */
import { existsSync } from 'node:fs'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { atomicWriteFile } from './config-file.ts'
import { moveToTrash, restoreFromTrash } from './trash.ts'

export interface TrashSessionInfo {
  projectKey: string
  sessionId: string
  dirPath: string
  archived: boolean
  modifiedAt: number
}

function workspacePath(dshHome: string): string {
  return join(dshHome, 'storages', 'workspace.json')
}

/** Tolerant read of the workspace registry's archived id list. */
export async function readArchivedSessionIds(dshHome: string): Promise<Set<string>> {
  try {
    const parsed = JSON.parse(await readFile(workspacePath(dshHome), 'utf8')) as { archivedSessionIds?: unknown }
    const raw = Array.isArray(parsed.archivedSessionIds) ? parsed.archivedSessionIds : []
    return new Set(raw.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

/** Remove one id from the workspace archive set; returns true when changed. */
export async function unarchiveSession(dshHome: string, sessionId: string): Promise<boolean> {
  const archived = await readArchivedSessionIds(dshHome)
  if (!archived.delete(sessionId)) return false
  let document: Record<string, unknown> = {}
  try {
    document = JSON.parse(await readFile(workspacePath(dshHome), 'utf8')) as Record<string, unknown>
  } catch {
    return false
  }
  document.archivedSessionIds = [...archived]
  await atomicWriteFile(workspacePath(dshHome), `${JSON.stringify(document, null, 2)}\n`)
  return true
}

/** Every session on disk with its archive flag, most recently used first. */
export async function listSessions(dshHome: string): Promise<TrashSessionInfo[]> {
  const sessionsRoot = join(dshHome, 'sessions')
  const archived = await readArchivedSessionIds(dshHome)
  const found: TrashSessionInfo[] = []
  if (!existsSync(sessionsRoot)) return found
  for (const projectKey of await readdir(sessionsRoot)) {
    const projectDir = join(sessionsRoot, projectKey)
    let entries: string[] = []
    try {
      entries = (await readdir(projectDir, { withFileTypes: true }))
        .filter(entry => entry.isDirectory() && entry.name.startsWith('session-'))
        .map(entry => entry.name)
    } catch {
      continue
    }
    for (const dirName of entries) {
      const sessionId = dirName.replace(/^session-/, '')
      const dirPath = join(projectDir, dirName)
      const info = await stat(dirPath).catch(() => undefined)
      found.push({
        projectKey,
        sessionId,
        dirPath,
        archived: archived.has(sessionId),
        modifiedAt: info?.mtimeMs ?? 0,
      })
    }
  }
  return found.sort((left, right) => right.modifiedAt - left.modifiedAt)
}

export class ActiveSessionError extends Error {
  constructor(sessionId: string) {
    super(`session ${sessionId} is running; close it before deleting`)
  }
}

/** Delete one session into the trash; refuses ids the WebUI reports as live. */
export async function deleteSessionToTrash(
  dshHome: string,
  projectKey: string,
  sessionId: string,
  liveSessionIds: readonly string[],
): Promise<void> {
  if (liveSessionIds.includes(sessionId)) throw new ActiveSessionError(sessionId)
  await moveToTrash(dshHome, join(dshHome, 'sessions', projectKey, `session-${sessionId}`), {
    kind: 'session',
    name: `session-${sessionId}`,
    source: 'deleted from the desktop trash page',
  })
  // A trashed session must not stay on the archive list: restoring should
  // surface it again, and a stale id would resurrect a phantom archive row.
  await unarchiveSession(dshHome, sessionId).catch(() => {})
}

/** Restore one trashed session and clear its archive flag. */
export async function restoreSessionFromTrash(dshHome: string, trashId: string): Promise<void> {
  const entry = await restoreFromTrash(dshHome, trashId)
  const match = /session-([^/\\]+)$/.exec(entry.name)
  if (match !== null) await unarchiveSession(dshHome, match[1]!).catch(() => {})
}
