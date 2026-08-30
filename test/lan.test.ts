import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isLanPairingExpired, isPrivateLanIPv4, LanService, listPrivateLanIPv4, qrSvgFromCode } from '../src/main/lan.ts'
import { pairingPageMarkup } from '../src/main/lan-page.ts'

test('private LAN address detection rejects loopback and public addresses', () => {
  assert.equal(isPrivateLanIPv4('192.168.1.20'), true)
  assert.equal(isPrivateLanIPv4('10.0.0.3'), true)
  assert.equal(isPrivateLanIPv4('172.20.4.2'), true)
  assert.equal(isPrivateLanIPv4('127.0.0.1'), false)
  assert.equal(isPrivateLanIPv4('8.8.8.8'), false)
})

test('pairing expiry is based on an absolute timestamp', () => {
  assert.equal(isLanPairingExpired({ expiresAt: 1_000 }, 999), false)
  assert.equal(isLanPairingExpired({ expiresAt: 1_000 }, 1_000), true)
  const markup = pairingPageMarkup({ baseUrl: 'http://192.168.1.2:3081/', pairingUrl: 'http://192.168.1.2:3081/pair', code: '123456', expiresInSeconds: 600, expiresAt: 1_600_000, lanAddress: '192.168.1.2', listenPort: 3081 }, '<svg></svg>', 'en')
  assert.match(markup, /id="countdown"/)
  assert.match(markup, /setInterval\(updateCountdown, 1000\)/)
  assert.match(markup, /has expired/)
})

test('LAN interface selection keeps private non-internal IPv4 addresses', () => {
  const result = listPrivateLanIPv4({
    WiFi: [
      { address: '192.168.1.10', netmask: '255.255.255.0', family: 'IPv4', mac: '', internal: false, cidr: '192.168.1.10/24' },
      { address: 'fe80::1', netmask: 'ffff:ffff::', family: 'IPv6', mac: '', internal: false, cidr: 'fe80::1/64', scopeid: 0 },
    ],
    bridge0: [{ address: '172.18.0.2', netmask: '255.255.0.0', family: 'IPv4', mac: '', internal: false, cidr: '172.18.0.2/16' }],
    Loopback: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '', internal: true, cidr: '127.0.0.1/8' }],
  })
  assert.deepEqual(result, ['192.168.1.10', '172.18.0.2'])
})

test('QR SVG contains a crisp module grid and white quiet zone', () => {
  const svg = qrSvgFromCode({ size: 3, getModule: (x, y) => x === y })
  assert.match(svg, /viewBox="0 0 11 11"/)
  assert.match(svg, /<rect x="4" y="4" width="1" height="1"\/>/)
  assert.match(svg, /fill="#fff"/)
})

test('LAN start is single-flight and clears its busy state after failure', async () => {
  const service = new LanService({
    mobileShellRoot: '/tmp/missing-mobile-shell',
    getTargetUrl: () => undefined,
  })
  const first = service.start()
  const second = service.start()
  assert.strictEqual(first, second)
  assert.equal(service.isBusy, true)
  await assert.rejects(first, /Harness is not ready yet/)
  assert.equal(service.isBusy, false)
})

test('LAN service starts, pairs, restarts, and stops against a stub proxy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-lan-e2e-'))
  // Minimal mobile-shell manifest pointing at a stub proxy script.
  await writeFile(join(root, 'web-artifact.json'), JSON.stringify({
    format: 'dsh-mobile-shell-web',
    formatVersion: 1,
    version: 'test-1.0.0',
    entrypoints: { proxy: 'proxy.mjs', launcher: 'launcher.mjs', pairing: 'pairing.mjs' },
  }))
  await writeFile(join(root, 'launcher.mjs'), '')
  await writeFile(join(root, 'pairing.mjs'), '')
  await writeFile(join(root, 'proxy.mjs'), `
import { createServer } from 'node:http'
const token = process.env.DSH_REMOTE_TOKEN
const host = process.env.DSH_LISTEN_HOST
const port = Number(process.env.DSH_LISTEN_PORT)
const server = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"ok":true}')
    return
  }
  if (req.url === '/pair/new' && req.method === 'POST') {
    if (req.headers.authorization !== 'Bearer ' + token) {
      res.writeHead(401); res.end('{}'); return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      code: '123456',
      expiresInSeconds: 600,
      pairingUrls: ['http://' + host + ':' + port + '/pair?token=' + token],
    }))
    return
  }
  res.writeHead(404); res.end('{}')
})
server.listen(port, host)
`)

  // Fake harness target on loopback.
  const target: Server = createServer((_req, res) => { res.writeHead(200); res.end('harness') })
  await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve))
  const targetPort = (target.address() as AddressInfo).port

  let stateChanges = 0
  const service = new LanService({
    mobileShellRoot: root,
    nodeExecutable: () => process.execPath,
    getTargetUrl: () => `http://127.0.0.1:${targetPort}`,
    lanAddress: () => '127.0.0.1',
    onStateChanged: () => { stateChanges += 1 },
  })

  try {
    assert.equal(service.isRunning, false)
    const pairing = await service.start()
    assert.match(pairing.code, /^\d{6}$/)
    assert.equal(pairing.lanAddress, '127.0.0.1')
    assert.equal(pairing.listenPort > 0, true)
    assert.equal(service.isRunning, true)
    assert.equal(service.currentPairing?.code, pairing.code)
    assert.equal(pairing.expiresAt > Date.now(), true)
    assert.ok(stateChanges > 0, 'start should have notified state changes')

    // Restart: stop + start, yielding a fresh pairing.
    const restarted = await service.restart()
    assert.match(restarted.code, /^\d{6}$/)
    assert.equal(service.isRunning, true)
    assert.equal(service.currentPairing?.code, restarted.code)

    // Stop clears runtime state.
    await service.stop()
    assert.equal(service.isRunning, false)
    assert.equal(service.currentPairing, undefined)
    assert.equal(service.currentTargetUrl, undefined)

    // Second stop is a safe no-op.
    await service.stop()
  } finally {
    await service.stop().catch(() => {})
    await new Promise<void>(resolve => target.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
})

test('LAN service start rejects a pairing URL whose origin does not match the proxy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-lan-e2e-bad-'))
  await writeFile(join(root, 'web-artifact.json'), JSON.stringify({
    format: 'dsh-mobile-shell-web',
    formatVersion: 1,
    version: 'test-1.0.0',
    entrypoints: { proxy: 'proxy.mjs', launcher: 'launcher.mjs', pairing: 'pairing.mjs' },
  }))
  await writeFile(join(root, 'launcher.mjs'), '')
  await writeFile(join(root, 'pairing.mjs'), '')
  // Stub that returns a pairing URL on a foreign origin — the service must
  // reject it instead of handing the QR code to the user.
  await writeFile(join(root, 'proxy.mjs'), `
import { createServer } from 'node:http'
const token = process.env.DSH_REMOTE_TOKEN
const host = process.env.DSH_LISTEN_HOST
const port = Number(process.env.DSH_LISTEN_PORT)
const server = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200); res.end('{"ok":true}'); return
  }
  if (req.url === '/pair/new' && req.method === 'POST') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ code: '654321', expiresInSeconds: 600,
      pairingUrls: ['http://evil.example.com:9999/pair?token=' + token] }))
    return
  }
  res.writeHead(404); res.end('{}')
})
server.listen(port, host)
`)

  const target: Server = createServer((_req, res) => { res.writeHead(200); res.end('harness') })
  await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve))
  const targetPort = (target.address() as AddressInfo).port

  const service = new LanService({
    mobileShellRoot: root,
    nodeExecutable: () => process.execPath,
    getTargetUrl: () => `http://127.0.0.1:${targetPort}`,
    lanAddress: () => '127.0.0.1',
  })

  try {
    await assert.rejects(service.start(), /no LAN pairing URL on the expected origin/)
    assert.equal(service.isRunning, false)
  } finally {
    await service.stop().catch(() => {})
    await new Promise<void>(resolve => target.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
})
