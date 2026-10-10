/** Host-side transaction: kernel owns lifecycle/archive state, shared helpers own disk layout. */
import { createServer, type Server } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { basename, join } from 'node:path'
import { listTrash, moveToTrash, restoreFromTrash, SessionRestoreConflictError } from './trash.ts'
import { listSessions } from './trash-sessions.ts'

interface HostContext {
  sessionController: {
    withIdleSession(id: string, operation: (header: { id: string; cwd?: string }) => Promise<unknown>): Promise<unknown>
    list(request: Record<string, never>, signal: AbortSignal): Promise<{ items: readonly { sessionId: string }[] }>
  }
  sessionPersistence: { list(): Promise<readonly { header: { id: string; cwd?: string } }[]> }
  workspaceRegistry: { unarchiveSession(id: string): Promise<void>; readonly archivedSessionIds: readonly string[] }
  emit(event: 'api-session/added', summary: { sessionId: string }): void
}

export type SessionTrashRequest =
  | { action: 'list' }
  | { action: 'delete'; projectKey: string; sessionId: string }
  | { action: 'restore'; trashId: string }
  | { action: 'unarchive'; sessionId: string }

const safeId = (value: unknown): value is string => typeof value === 'string' && /^[\w.~+-]+$/.test(value) && value !== '.' && value !== '..'

export function parseSessionTrashRequest(raw: unknown): SessionTrashRequest | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const input = raw as Record<string, unknown>
  if (input.action === 'list') return { action: 'list' }
  if (input.action === 'delete' && safeId(input.projectKey) && safeId(input.sessionId)) return { action: 'delete', projectKey: input.projectKey, sessionId: input.sessionId }
  if (input.action === 'restore' && safeId(input.trashId)) return { action: 'restore', trashId: input.trashId }
  if (input.action === 'unarchive' && safeId(input.sessionId)) return { action: 'unarchive', sessionId: input.sessionId }
  return undefined
}

/** Pinned JSONL readable-key contract (separator runs, UTF-16 escaping, bounded key). */
export function sessionProjectKey(cwd: string | undefined): string {
  if (cwd === undefined) return '_no-cwd'
  let key = ''
  let separator = false
  for (const char of cwd.split('')) {
    if (/[:/\\]/.test(char)) {
      if (!separator) key += '-'
      separator = true
    } else {
      key += /^[A-Za-z0-9._-]$/.test(char) ? char : `~${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`
      separator = false
    }
  }
  return `--${(key.replace(/^-+/, '') || 'root').slice(0, 251)}--`
}

export async function runSessionTrash(ctx: HostContext, home: string, request: SessionTrashRequest): Promise<unknown> {
  if (request.action === 'list') {
    const snapshots = await ctx.sessionPersistence.list()
    return (await listSessions(home)).map(row => {
      const snapshot = snapshots.find(item => item.header.id === `session-${row.sessionId}` && sessionProjectKey(item.header.cwd) === row.projectKey)
      const id = snapshot?.header.id ?? row.sessionId
      return { ...row, sessionId: id, archived: ctx.workspaceRegistry.archivedSessionIds.includes(id) }
    })
  }
  if (request.action === 'unarchive') {
    await ctx.workspaceRegistry.unarchiveSession(request.sessionId)
  } else if (request.action === 'restore') {
    const entry = (await listTrash(home)).find(item => item.id === request.trashId)
    if (entry?.kind !== 'session') throw new Error('not a trashed session')
    if ((await ctx.sessionController.list({}, AbortSignal.timeout(15_000))).items.some(item => item.sessionId === entry.name)) throw new SessionRestoreConflictError()
    const restored = await restoreFromTrash(home, request.trashId, async restored => {
      const snapshot = (await ctx.sessionPersistence.list()).find(item => item.header.id === restored.name)
      if (snapshot === undefined || basename(restored.originPath) !== snapshot.header.id ||
          restored.originPath !== join(home, 'sessions', sessionProjectKey(snapshot.header.cwd), snapshot.header.id)) throw new Error('restored session identity mismatch')
      await ctx.workspaceRegistry.unarchiveSession(restored.name)
    })
    const summary = (await ctx.sessionController.list({}, AbortSignal.timeout(15_000))).items.find(item => item.sessionId === restored.name)
    if (summary !== undefined) ctx.emit('api-session/added', summary)
  } else {
    if (typeof ctx.sessionController.withIdleSession !== 'function') throw new Error('kernel does not support safe session removal')
    await ctx.sessionController.withIdleSession(request.sessionId, async header => {
      if (header.id !== request.sessionId) throw new Error('session identity mismatch')
      const directory = join(home, 'sessions', request.projectKey, request.sessionId)
      // Verify that the caller's disk row names the same workspace as the
      // authoritative header before touching any directory.
      if (sessionProjectKey(header.cwd) !== request.projectKey) throw new Error('session workspace mismatch')
      await moveToTrash(home, directory, { kind: 'session', name: request.sessionId, source: 'deleted from the desktop trash page' },
        () => ctx.workspaceRegistry.unarchiveSession(request.sessionId))
    })
  }
  return true
}

/** Private loopback transport; the random token stays in main/Host, never renderer or logs. */
export function startSessionTrashServer(ctx: HostContext, home: string, token: string, ready: (port: number) => void): Server {
  let chain: Promise<unknown> = Promise.resolve()
  const server = createServer((request, response) => {
    const auth = Buffer.from(request.headers.authorization ?? '')
    const expected = Buffer.from(`Bearer ${token}`)
    if (request.method !== 'POST' || request.url !== '/session-trash' || auth.length !== expected.length || !timingSafeEqual(auth, expected)) {
      response.writeHead(403).end()
      return
    }
    let body = ''
    request.setEncoding('utf8')
    request.on('data', chunk => {
      body += chunk
      if (Buffer.byteLength(body) > 2048) request.destroy()
    })
    request.on('end', () => {
      let parsed: SessionTrashRequest | undefined
      try { parsed = parseSessionTrashRequest(JSON.parse(body)) } catch { /* invalid input */ }
      if (parsed === undefined) { response.writeHead(400).end(); return }
      const operation = chain.then(() => runSessionTrash(ctx, home, parsed!))
      chain = operation.catch(() => undefined)
      void operation.then(
        data => response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, data })),
        (error: unknown) => {
          const code = (error as { code?: unknown })?.code
          response.writeHead(409, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, reason: error instanceof SessionRestoreConflictError ? 'conflict' : code === 'session/agent-busy' || (error as Error)?.name === 'SessionAlreadyOwnedError' ? 'active' : 'failed' }))
        },
      )
    })
  })
  server.listen(0, '127.0.0.1', () => { ready((server.address() as { port: number }).port) })
  return server
}
