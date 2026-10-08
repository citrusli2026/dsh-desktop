import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

test('bundled DSH ACP fulfills the Desktop integration contract with a local mock route', () => {
  execFileSync(process.execPath, [resolve('test/dsh-acp-contract-runner.mjs')], {
    stdio: 'inherit',
    timeout: 120_000,
  })
})
