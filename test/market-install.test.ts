import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyMarketInstallFailure, completeMarketInstall, type MarketInstallProgress } from '../src/main/market-install.ts'

test('classifyMarketInstallFailure distinguishes actionable install causes', () => {
  assert.equal(classifyMarketInstallFailure('ERR_PNPM_META_FETCH_FAIL getaddrinfo ENOTFOUND registry.npmjs.org'), 'network')
  assert.equal(classifyMarketInstallFailure('connect ECONNREFUSED 127.0.0.1:9'), 'network')
  assert.equal(classifyMarketInstallFailure('tunneling socket could not be established, statusCode=407 Proxy Authentication Required'), 'proxy')
  assert.equal(classifyMarketInstallFailure('EACCES: permission denied, open /profile/package.json'), 'profile')
  assert.equal(classifyMarketInstallFailure('ELIFECYCLE postinstall script failed'), 'install-script')
  assert.equal(classifyMarketInstallFailure('', { timedOut: true }), 'timeout')
  assert.equal(classifyMarketInstallFailure('', { spawnFailed: true }), 'spawn')
  assert.equal(classifyMarketInstallFailure('unexpected failure'), 'unknown')
})

test('completeMarketInstall reports phases and returns the concrete installed version', async () => {
  const phases: MarketInstallProgress[] = []
  const result = await completeMarketInstall({
    install: async () => ({ code: 0, stderr: '' }),
    readStatus: async () => ({ name: 'dshmarket', state: 'installed', version: '1.38.1' }),
    restart: async () => true,
    onProgress: phase => phases.push(phase),
  })
  assert.deepEqual(phases, ['preparing', 'installing', 'verifying', 'restarting'])
  assert.deepEqual(result, { status: 'installed', installed: true, stage: 'restart', version: '1.38.1' })
})

test('completeMarketInstall keeps an installed market when only restart fails', async () => {
  const result = await completeMarketInstall({
    install: async () => ({ code: 0, stderr: '' }),
    readStatus: async () => ({ name: 'dshmarket', state: 'installed', version: '1.39.0' }),
    restart: async () => false,
  })
  assert.deepEqual(result, { status: 'restart-failed', installed: true, stage: 'restart', version: '1.39.0' })
})

test('completeMarketInstall categorizes sanitized command failures and stays retryable', async () => {
  let restarted = false
  const result = await completeMarketInstall({
    install: async () => ({ code: 1, stderr: 'ERR_PNPM_FETCH_503 network unavailable' }),
    readStatus: async () => ({ name: 'dshmarket', state: 'missing' }),
    restart: async () => { restarted = true; return true },
  })
  assert.deepEqual(result, {
    status: 'download-failed', installed: false, stage: 'install', reason: 'network',
    detail: 'ERR_PNPM_FETCH_503 network unavailable',
  })
  assert.equal(restarted, false)
})

test('completeMarketInstall treats a missing post-install package as profile damage', async () => {
  const result = await completeMarketInstall({
    install: async () => ({ code: 0, stderr: '' }),
    readStatus: async () => ({ name: 'dshmarket', state: 'damaged' }),
    restart: async () => true,
  })
  assert.equal(result.status, 'install-failed')
  assert.equal(result.reason, 'profile')
  assert.equal(result.stage, 'verify')
})
