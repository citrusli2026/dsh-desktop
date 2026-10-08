import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'

test('bundled DSH ACP fulfills the Desktop integration contract with a local mock route', async () => {
  const child = spawn(process.execPath, [resolve('test/dsh-acp-contract-runner.mjs')], {
    stdio: 'inherit',
  })
  const [code, signal] = await once(child, 'exit')
  assert.equal(code, 0, signal === null ? 'ACP contract runner failed' : `ACP contract runner terminated by ${signal}`)
})
