import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
// @ts-expect-error - the Host half is plain ESM JavaScript, loaded by the kernel.
import { startIncidentServer } from '../plugins/dsh-desktop-controls/lib/incident-host.js'

interface FakeContext {
  sessionController?: {
    create(request: { cwd: string }): Promise<{ sessionId: string }>
    prompt(request: { sessionId: string; content: { type: string; text: string }[]; requestId: string; mode: string }, signal: AbortSignal): Promise<unknown>
  }
  emit(event: string, payload: { sessionId: string }): void
}

async function ask(port: number, token: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`http://127.0.0.1:${port}/incident/ask`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, json: await response.json().catch(() => undefined) }
}

test('a normal request writes the evidence, creates a session and emits it', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-incident-'))
  const calls: { cwd?: string; prompt?: string } = {}
  const emitted: string[] = []
  const ctx: FakeContext = {
    sessionController: {
      create: async request => { calls.cwd = request.cwd; return { sessionId: 'session-1' } },
      prompt: async request => { calls.prompt = request.content[0]?.text; return { accepted: true } },
    },
    emit: (_event, payload) => { emitted.push(payload.sessionId) },
  }
  const token = 'test-token'
  const server = startIncidentServer(ctx, home, token, () => {})
  try {
    if (!server.listening) await once(server, 'listening')
    const port = (server.address() as AddressInfo).port
    const result = await ask(port, token, {
      id: 'incident-20261024-201500-market',
      title: 'market.profile',
      prompt: 'PROMPT DATA',
      report: 'REPORT DATA',
    })
    assert.equal(result.status, 200)
    assert.deepEqual(result.json, { ok: true, sessionId: 'session-1' })
    assert.equal(calls.prompt, 'PROMPT DATA')
    assert.equal(emitted[0], 'session-1')
    const dir = join(home, 'incidents', 'incident-20261024-201500-market')
    assert.equal(calls.cwd, dir)
    assert.equal(await readFile(join(dir, 'report.md'), 'utf8'), 'REPORT DATA')
    assert.equal(await readFile(join(dir, 'prompt.md'), 'utf8'), 'PROMPT DATA')
  } finally {
    server.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('missing session capabilities answer unsupported without writing or throwing', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-incident-'))
  const server = startIncidentServer({ emit() {} } as FakeContext, home, 't', () => {})
  try {
    if (!server.listening) await once(server, 'listening')
    const port = (server.address() as AddressInfo).port
    const result = await ask(port, 't', { id: 'incident-1', title: 'x', prompt: 'p', report: 'r' })
    assert.equal(result.status, 200)
    assert.deepEqual(result.json, { ok: false, reason: 'unsupported' })
    await assert.rejects(readFile(join(home, 'incidents', 'incident-1', 'report.md'), 'utf8'))
  } finally {
    server.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('an unwritable home falls back to a private temp directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-incident-'))
  const blocked = join(root, 'not-a-directory')
  await writeFile(blocked, 'file')
  let cwd = ''
  const ctx: FakeContext = {
    sessionController: {
      create: async request => { cwd = request.cwd; return { sessionId: 'session-2' } },
      prompt: async () => ({ accepted: true }),
    },
    emit() {},
  }
  const server = startIncidentServer(ctx, blocked, 't', () => {})
  try {
    if (!server.listening) await once(server, 'listening')
    const port = (server.address() as AddressInfo).port
    const result = await ask(port, 't', { id: 'incident-2', title: 'x', prompt: 'p', report: 'r' })
    assert.equal(result.status, 200)
    assert.deepEqual(result.json, { ok: true, sessionId: 'session-2' })
    assert.match(cwd, /dsh-desktop-incident-/)
    assert.equal(await readFile(join(cwd, 'report.md'), 'utf8'), 'r')
  } finally {
    server.close()
    await rm(root, { recursive: true, force: true })
    await rm(cwd, { recursive: true, force: true }).catch(() => undefined)
  }
})

test('a wrong token or path is rejected before any work', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-incident-'))
  const ctx: FakeContext = { emit() {} }
  const server = startIncidentServer(ctx, home, 'right', () => {})
  try {
    if (!server.listening) await once(server, 'listening')
    const port = (server.address() as AddressInfo).port
    const body = { id: 'incident-3', title: 'x', prompt: 'p', report: 'r' }
    assert.equal((await ask(port, 'wrong', body)).status, 403)
    const wrongPath = await fetch(`http://127.0.0.1:${port}/other`, {
      method: 'POST', headers: { authorization: 'Bearer right' }, body: '{}',
    })
    assert.equal(wrongPath.status, 403)
    const malformed = await ask(port, 'right', { id: '../escape' })
    assert.equal(malformed.status, 400)
  } finally {
    server.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('the main-process client binds the endpoint and returns the session', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-incident-'))
  const { IncidentClient } = await import('../src/main/incident-client.ts')
  const ctx: FakeContext = {
    sessionController: {
      create: async () => ({ sessionId: 'session-client' }),
      prompt: async () => ({ accepted: true }),
    },
    emit() {},
  }
  const client = new IncidentClient('client-token')
  assert.equal(await client.ask({ id: 'incident-4', title: 'x', prompt: 'p', report: 'r' }), undefined)
  const server = startIncidentServer(ctx, home, 'client-token', () => {})
  try {
    if (!server.listening) await once(server, 'listening')
    client.bind((server.address() as AddressInfo).port)
    assert.deepEqual(
      await client.ask({ id: 'incident-4', title: 'x', prompt: 'p', report: 'r' }),
      { ok: true, sessionId: 'session-client' },
    )
    // A Host generation change invalidates the old port.
    client.bind(undefined)
    assert.equal(await client.ask({ id: 'incident-5', title: 'x', prompt: 'p', report: 'r' }), undefined)
  } finally {
    server.close()
    await rm(home, { recursive: true, force: true })
  }
})
