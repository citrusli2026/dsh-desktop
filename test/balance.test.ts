import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  BalanceService,
  formatBalance,
  parseBalancePayload,
  readDeepSeekApiKey,
} from '../src/main/balance.ts'

test('reads the DeepSeek key from the harness credential store refs', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-balance-'))
  try {
    await writeFile(join(home, '.credentials.yaml'), 'version: 1\nrefs:\n  DEEPSEEK_API_KEY: sk-test-000\n')
    assert.equal(await readDeepSeekApiKey(home), 'sk-test-000')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('a missing or empty credential store yields no key and no throw', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-balance-'))
  try {
    assert.equal(await readDeepSeekApiKey(home), undefined)
    await writeFile(join(home, '.credentials.yaml'), 'version: 1\nrefs: {}\n')
    assert.equal(await readDeepSeekApiKey(home), undefined)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('parses the balance payload, preferring CNY, and fails soft on junk', () => {
  const balance = parseBalancePayload({
    is_available: true,
    balance_infos: [
      { currency: 'USD', total_balance: '1.00' },
      { currency: 'CNY', total_balance: '42.50' },
    ],
  })
  assert.deepEqual(balance, { currency: 'CNY', totalBalance: '42.50', isAvailable: true })
  assert.equal(formatBalance(balance!), '¥42.50')
  assert.equal(parseBalancePayload({ balance_infos: [] }), undefined)
  assert.equal(parseBalancePayload('nope'), undefined)
  assert.equal(formatBalance({ currency: 'USD', totalBalance: '7.00', isAvailable: true }), '$7.00')
})

test('BalanceService caches within the TTL, dedupes in-flight, and fails soft', async () => {
  let calls = 0
  let clock = 1_000
  const fetchImpl = async () => {
    calls += 1
    return { ok: true, status: 200, json: async () => ({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: `${calls}.00` }] }) }
  }
  const service = new BalanceService(async () => 'sk-test', fetchImpl, () => clock)
  const first = await service.current()
  assert.equal(first?.totalBalance, '1.00')
  const cached = await service.current()
  assert.equal(cached?.totalBalance, '1.00')
  assert.equal(calls, 1)
  clock += 6 * 60_000
  const refreshed = await service.current()
  assert.equal(refreshed?.totalBalance, '2.00')
  assert.equal(calls, 2)

  const failing = new BalanceService(async () => undefined, fetchImpl)
  assert.equal(await failing.current(), undefined)

  const erroring = new BalanceService(async () => 'sk-test', async () => { throw new Error('down') })
  assert.equal(await erroring.current(), undefined)
})
