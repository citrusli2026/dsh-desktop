import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPrivateLanIPv4, listPrivateLanIPv4, qrSvgFromCode } from '../src/main/lan.ts'

test('private LAN address detection rejects loopback and public addresses', () => {
  assert.equal(isPrivateLanIPv4('192.168.1.20'), true)
  assert.equal(isPrivateLanIPv4('10.0.0.3'), true)
  assert.equal(isPrivateLanIPv4('172.20.4.2'), true)
  assert.equal(isPrivateLanIPv4('127.0.0.1'), false)
  assert.equal(isPrivateLanIPv4('8.8.8.8'), false)
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
