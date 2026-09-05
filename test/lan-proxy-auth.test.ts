import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROXY_PATH = fileURLToPath(new URL('../resources/mobile-shell/proxy/dsh-remote.mjs', import.meta.url))
const MASTER_TOKEN = 'master-token-0123456789'
const LAUNCH_TOKEN = 'kernel-launch-token-0123456789abcdef'
const KERNEL_401 = 'dsh web authentication required; reopen the URL printed by dsh web.'

interface UpstreamHandle {
  server: Server
  port: number
  /** Invalidate the currently issued session, as a kernel secret rotation would. */
  rotate(): void
  exchanges(): number
}

/** Kernel-like upstream: index served only with the issued signed cookie. */
async function startUpstream(): Promise<UpstreamHandle> {
  let session: string | undefined
  let issued = 0
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://dsh.invalid')
    const token = url.searchParams.get('token')
    if (token !== null) {
      if (req.method === 'GET' && url.pathname === '/' && token === LAUNCH_TOKEN) {
        issued += 1
        session = `v1.${issued.toString(36).padStart(8, '0')}${Math.random().toString(36).slice(2, 10)}`
        res.writeHead(303, {
          location: '/',
          'set-cookie': `dsh-auth-test=${session}; Max-Age=2592000; Path=/; HttpOnly; SameSite=Strict`,
        })
        res.end()
      } else {
        res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(`${KERNEL_401}\n`)
      }
      return
    }
    const cookie = String(req.headers.cookie ?? '')
    const value = /(?:^|;\s*)dsh-auth-test=([^;]+)/.exec(cookie)?.[1]
    if (value === undefined || value !== session) {
      res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(`${KERNEL_401}\n`)
      return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end('<!doctype html><html><head><title>upstream</title></head><body>upstream index</body></html>')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    server,
    port: (server.address() as AddressInfo).port,
    rotate: () => { session = 'rotated-away' },
    exchanges: () => issued,
  }
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}

interface ProxyHandle {
  baseUrl: string
  stop(): Promise<void>
}

async function startProxy(upstreamPort: number, options: { upstreamToken?: string } = {}): Promise<ProxyHandle> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-lan-proxy-'))
  const listenPort = await freePort()
  const child = spawn(process.execPath, [PROXY_PATH], {
    env: {
      ...process.env,
      DSH_REMOTE_TOKEN: MASTER_TOKEN,
      ...(options.upstreamToken === undefined ? {} : { DSH_UPSTREAM_TOKEN: options.upstreamToken }),
      DSH_LISTEN_HOST: '127.0.0.1',
      DSH_LISTEN_PORT: String(listenPort),
      DSH_TARGET_HOST: '127.0.0.1',
      DSH_TARGET_PORT: String(upstreamPort),
      DSH_LAUNCHER: 'off',
      DSH_PAIR_QR: 'off',
      DSH_STATE_FILE: join(root, 'devices.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => process.stderr.write(`dsh-remote: ${chunk}`))

  const baseUrl = `http://127.0.0.1:${listenPort}/`
  const deadline = Date.now() + 10_000
  for (;;) {
    try {
      const response = await fetch(`${baseUrl}healthz`, { signal: AbortSignal.timeout(1000) })
      await response.body?.cancel()
      if (response.ok) break
    } catch { /* not listening yet */ }
    if (Date.now() > deadline) throw new Error('dsh-remote did not become healthy')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return {
    baseUrl,
    stop: async () => {
      child.kill()
      await new Promise<void>(resolve => child.once('exit', () => resolve()))
      await rm(root, { recursive: true, force: true })
    },
  }
}

/** Pair a device through the real proxy endpoints; returns its bearer token. */
async function pairDevice(baseUrl: string): Promise<string> {
  const mint = await fetch(`${baseUrl}pair/new`, {
    method: 'POST',
    headers: { authorization: `Bearer ${MASTER_TOKEN}` },
  })
  const { code } = await mint.json() as { code?: string }
  assert.match(code ?? '', /^\d{6}$/)
  const pair = await fetch(`${baseUrl}pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dsh-client': 'app' },
    body: JSON.stringify({ code, name: 'proxy-auth-test' }),
  })
  const body = await pair.json() as { token?: string }
  assert.equal(pair.status, 200)
  assert.equal(typeof body.token, 'string')
  return body.token!
}

test('dsh-remote forwards the upstream 401 unchanged without DSH_UPSTREAM_TOKEN', async () => {
  const upstream = await startUpstream()
  const proxy = await startProxy(upstream.port)
  try {
    const deviceToken = await pairDevice(proxy.baseUrl)
    const response = await fetch(`${proxy.baseUrl}`, { headers: { authorization: `Bearer ${deviceToken}` } })
    assert.equal(response.status, 401)
    assert.equal(await response.text(), `${KERNEL_401}\n`)
    assert.equal(upstream.exchanges(), 0)
  } finally {
    await proxy.stop()
    await new Promise<void>(resolve => upstream.server.close(() => resolve()))
  }
})

test('dsh-remote exchanges DSH_UPSTREAM_TOKEN and presents the session cookie', async () => {
  const upstream = await startUpstream()
  const proxy = await startProxy(upstream.port, { upstreamToken: LAUNCH_TOKEN })
  try {
    const deviceToken = await pairDevice(proxy.baseUrl)
    const headers = { authorization: `Bearer ${deviceToken}` }
    // Two loads: the second proves the cached cookie is reused, not re-minted.
    for (let load = 0; load < 2; load += 1) {
      const response = await fetch(`${proxy.baseUrl}`, { headers })
      assert.equal(response.status, 200)
      assert.match(await response.text(), /upstream index/)
    }
    assert.ok(upstream.exchanges() >= 1, 'proxy should have filed the token exchange')
  } finally {
    await proxy.stop()
    await new Promise<void>(resolve => upstream.server.close(() => resolve()))
  }
})

test('dsh-remote re-exchanges once and replays when the upstream rejects the cookie', async () => {
  const upstream = await startUpstream()
  const proxy = await startProxy(upstream.port, { upstreamToken: LAUNCH_TOKEN })
  try {
    const deviceToken = await pairDevice(proxy.baseUrl)
    const first = await fetch(`${proxy.baseUrl}`, { headers: { authorization: `Bearer ${deviceToken}` } })
    assert.equal(first.status, 200)

    // Kernel secret rotation: the cached cookie stops being valid; the proxy
    // must re-file the exchange and replay the body-less index request.
    upstream.rotate()
    const second = await fetch(`${proxy.baseUrl}`, { headers: { authorization: `Bearer ${deviceToken}` } })
    assert.equal(second.status, 200)
    assert.match(await second.text(), /upstream index/)
    assert.ok(upstream.exchanges() >= 2, 'proxy should have re-filed the exchange after rotation')
  } finally {
    await proxy.stop()
    await new Promise<void>(resolve => upstream.server.close(() => resolve()))
  }
})
