import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyMarketInstallFailure, completeMarketInstall, marketIncompatibility, type MarketInstallProgress } from '../src/main/market-install.ts'

test('classifyMarketInstallFailure distinguishes actionable install causes', () => {
  assert.equal(classifyMarketInstallFailure('ERR_PNPM_META_FETCH_FAIL getaddrinfo ENOTFOUND registry.npmjs.org'), 'network')
  assert.equal(classifyMarketInstallFailure('connect ECONNREFUSED 127.0.0.1:9'), 'network')
  assert.equal(classifyMarketInstallFailure('tunneling socket could not be established, statusCode=407 Proxy Authentication Required'), 'proxy')
  assert.equal(classifyMarketInstallFailure('EACCES: permission denied, open /profile/package.json'), 'profile')
  assert.equal(classifyMarketInstallFailure('ELIFECYCLE postinstall script failed'), 'install-script')
  assert.equal(classifyMarketInstallFailure('', { timedOut: true }), 'timeout')
  assert.equal(classifyMarketInstallFailure('', { spawnFailed: true }), 'spawn')
  assert.equal(classifyMarketInstallFailure('dsh: installation rejected: Plugin dshmarket@1.45.1 is incompatible with dsh 0.2.1-rc.2'), 'incompatible')
  assert.equal(classifyMarketInstallFailure('unexpected failure'), 'unknown')
})

test('marketIncompatibility reads the CLI gate verdict for the market package only', () => {
  const output = [
    'dsh: warning: Plugin dsh-better-sidebar@0.17.1 is incompatible with dsh 0.2.1-rc.2: requirements {}',
    'dsh: warning: Plugin dshmarket@1.45.1 is incompatible with dsh 0.2.1-rc.2: requirements {"@deepseek-ai/dsh-settings":"^0.1.0-rc.7"}.',
    'dsh: it stays installed but profile startup denies it until you grant an exemption for those exact versions.',
  ].join('\n')
  assert.match(marketIncompatibility(output) ?? '', /^Plugin dshmarket@1\.45\.1 is incompatible with dsh 0\.2\.1-rc\.2/)
  assert.equal(marketIncompatibility('Plugin dsh-better-sidebar@0.17.1 is incompatible with dsh 0.2.1-rc.2'), undefined)
  assert.equal(marketIncompatibility(''), undefined)
})

test('completeMarketInstall reports phases and returns the concrete installed version', async () => {
  const phases: MarketInstallProgress[] = []
  const result = await completeMarketInstall({
    install: async () => ({ code: 0, stderr: '' }),
    readStatus: async () => ({ name: 'dshmarket', state: 'installed', version: '1.38.1' }),
    enable: async () => { throw new Error('an enabled market is never re-enabled') },
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
    enable: async () => { throw new Error('an enabled market is never re-enabled') },
    restart: async () => false,
  })
  assert.deepEqual(result, { status: 'restart-failed', installed: true, stage: 'restart', version: '1.39.0' })
})

test('completeMarketInstall re-enables a market the profile kept installed but disabled', async () => {
  // `dsh plugin add` exits 0 without re-enabling a retained dependency, so the
  // shell has to put the boot entry back before it reports success.
  let enabled = false
  const result = await completeMarketInstall({
    install: async () => ({ code: 0, stderr: 'Packages: -2\nDone in 665ms\n' }),
    readStatus: async () => enabled
      ? { name: 'dshmarket', state: 'installed', version: '1.69.0', present: true }
      : { name: 'dshmarket', state: 'missing', version: '1.45.1', present: true },
    enable: async () => { enabled = true; return { enabled: true, version: '1.69.0' } },
    restart: async () => true,
  })
  assert.deepEqual(result, { status: 'installed', installed: true, stage: 'restart', version: '1.69.0' })
})

test('completeMarketInstall trusts the CLI compatibility gate over its own enable step', async () => {
  const gate = 'Plugin dshmarket@1.45.1 is incompatible with dsh 0.2.1-rc.2: requirements {"@deepseek-ai/dsh-settings":"^0.1.0-rc.7"}.'
  const result = await completeMarketInstall({
    install: async () => ({ code: 0, stderr: `dsh: warning: ${gate}\ndsh: it stays installed but profile startup denies it.` }),
    readStatus: async () => ({ name: 'dshmarket', state: 'missing', version: '1.45.1', present: true }),
    enable: async () => { throw new Error('an incompatible bundle must not be enabled') },
    restart: async () => { throw new Error('a skipped bundle must not restart Harness') },
  })
  assert.equal(result.status, 'install-failed')
  assert.equal(result.reason, 'incompatible')
  assert.equal(result.stage, 'verify')
  assert.equal(result.detail, gate)
})

test('completeMarketInstall explains why the profile refused the boot entry', async () => {
  const result = await completeMarketInstall({
    install: async () => ({ code: 0, stderr: '' }),
    readStatus: async () => ({ name: 'dshmarket', state: 'missing', present: false }),
    enable: async () => ({ enabled: false, failure: 'missing', detail: 'dshmarket is recorded in the profile but not installed' }),
    restart: async () => true,
  })
  assert.deepEqual(result, {
    status: 'install-failed', installed: false, stage: 'verify', reason: 'profile',
    detail: 'dshmarket is recorded in the profile but not installed',
  })
})

test('completeMarketInstall reports a rejected incompatible version as its own cause', async () => {
  const rejection = [
    'dsh: installation rejected: Plugin dshmarket@1.69.0 is incompatible with dsh 0.1.2-alpha.2: requirements {}.',
    'dsh: restored package.json, pnpm-lock.yaml, and node_modules.',
  ].join('\n')
  const result = await completeMarketInstall({
    install: async () => ({ code: 1, stderr: rejection }),
    readStatus: async () => { throw new Error('a rejected install is never verified') },
    enable: async () => { throw new Error('a rejected install is never enabled') },
    restart: async () => { throw new Error('a rejected install never restarts Harness') },
  })
  assert.equal(result.status, 'install-failed')
  assert.equal(result.reason, 'incompatible')
  assert.equal(result.stage, 'install')
})

test('completeMarketInstall categorizes sanitized command failures and stays retryable', async () => {
  let restarted = false
  const result = await completeMarketInstall({
    install: async () => ({ code: 1, stderr: 'ERR_PNPM_FETCH_503 network unavailable' }),
    readStatus: async () => ({ name: 'dshmarket', state: 'missing' }),
    enable: async () => { throw new Error('a failed install has nothing to enable') },
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
    enable: async () => ({ enabled: false, failure: 'damaged', detail: 'dshmarket has no readable package.json' }),
    restart: async () => true,
  })
  assert.equal(result.status, 'install-failed')
  assert.equal(result.reason, 'profile')
  assert.equal(result.stage, 'verify')
})
