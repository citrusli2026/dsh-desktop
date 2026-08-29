import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ensureInstallShims, prependPath, proxyEnvFromResolveProxy } from '../src/main/install-env.ts'

test('install shims launch the bundled pnpm and node by absolute path', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'dsh-install-env-'))
  try {
    const dir = ensureInstallShims(userData, { nodeBin: '/closure/node/bin/node', pnpmBin: '/closure/node_modules/pnpm/bin/pnpm.cjs' })
    assert.equal(dir, join(userData, 'bin-shims'))
    const pnpm = await readFile(join(dir, 'pnpm'), 'utf8')
    assert.match(pnpm, /exec "\/closure\/node\/bin\/node" "\/closure\/node_modules\/pnpm\/bin\/pnpm\.cjs" "\$@"/)
    const node = await readFile(join(dir, 'node'), 'utf8')
    assert.match(node, /exec "\/closure\/node\/bin\/node" "\$@"/)
    assert.equal((await stat(join(dir, 'pnpm'))).mode & 0o111, 0o111)
    assert.equal((await stat(join(dir, 'node'))).mode & 0o111, 0o111)
  } finally {
    await rm(userData, { recursive: true, force: true })
  }
})

test('windows install shims are cmd launchers', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'dsh-install-env-'))
  try {
    const dir = ensureInstallShims(userData, { nodeBin: 'C:\\n\\node.exe', pnpmBin: 'C:\\n\\pnpm.cjs' }, 'win32')
    const pnpm = await readFile(join(dir, 'pnpm.cmd'), 'utf8')
    assert.match(pnpm, /"C:\\n\\node\.exe" "C:\\n\\pnpm\.cjs" %\*/)
    const node = await readFile(join(dir, 'node.cmd'), 'utf8')
    assert.match(node, /"C:\\n\\node\.exe" %\*/)
  } finally {
    await rm(userData, { recursive: true, force: true })
  }
})

test('prependPath fronts the shim dir on either PATH spelling', () => {
  assert.equal(prependPath({ PATH: '/usr/bin' }, '/shims').PATH, '/shims:/usr/bin')
  assert.equal(prependPath({ Path: 'C:\\Windows' }, 'C:\\shims', 'win32').Path, 'C:\\shims;C:\\Windows')
  assert.equal(prependPath({}, '/shims').PATH, '/shims')
})

test('proxy env is derived from the Chromium resolveProxy string', () => {
  assert.deepEqual(proxyEnvFromResolveProxy('DIRECT', {}), {})
  assert.deepEqual(proxyEnvFromResolveProxy(undefined, {}), {})
  assert.deepEqual(proxyEnvFromResolveProxy('PROXY 127.0.0.1:7890', {}), {
    HTTPS_PROXY: 'http://127.0.0.1:7890',
    HTTP_PROXY: 'http://127.0.0.1:7890',
    NO_PROXY: 'localhost,127.0.0.1,::1',
  })
  assert.deepEqual(proxyEnvFromResolveProxy('PROXY 10.0.0.1:8080; DIRECT', {}), {
    HTTPS_PROXY: 'http://10.0.0.1:8080',
    HTTP_PROXY: 'http://10.0.0.1:8080',
    NO_PROXY: 'localhost,127.0.0.1,::1',
  })
  assert.deepEqual(proxyEnvFromResolveProxy('SOCKS5 127.0.0.1:7890', {}), {
    ALL_PROXY: 'socks5://127.0.0.1:7890',
    NO_PROXY: 'localhost,127.0.0.1,::1',
  })
  // A user-set proxy env var wins over the system setting.
  assert.deepEqual(proxyEnvFromResolveProxy('PROXY 10.0.0.1:8080', { HTTPS_PROXY: 'http://127.0.0.1:7890' }), {})
  assert.deepEqual(proxyEnvFromResolveProxy('PROXY 10.0.0.1:8080', { all_proxy: 'socks5://127.0.0.1:7890' }), {})
})
