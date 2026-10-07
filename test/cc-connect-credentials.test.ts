import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, rm, stat } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConnectCredentials, credentialsPath } from '../src/main/cc-connect-credentials.ts'

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'cc-connect-credentials-test-'))
}

function fakeSafeStorage(available: boolean) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8').replace(/^encrypted:/, ''),
  }
}

test('safeStorage credentials round-trip without writing the secret in plaintext', async () => {
  const userData = await tempDir()
  const secret = 'fake-feishu-secret'
  try {
    const credentials = new ConnectCredentials(credentialsPath(userData), fakeSafeStorage(true))
    assert.equal(await credentials.setSecret(secret), 'safeStorage')
    assert.deepEqual(await credentials.state(), { secretConfigured: true, credentialProtection: 'safeStorage' })
    assert.equal(await credentials.readSecret(), secret)
    assert.doesNotMatch(await readFile(credentialsPath(userData), 'utf8'), new RegExp(secret))
    await credentials.clearSecret()
    assert.deepEqual(await credentials.state(), { secretConfigured: false, credentialProtection: 'none' })
  } finally {
    await rm(userData, { recursive: true, force: true })
  }
})
test('unavailable safeStorage falls back to a 0600 local credential file', async () => {
  const userData = await tempDir()
  try {
    const credentials = new ConnectCredentials(credentialsPath(userData), fakeSafeStorage(false))
    assert.equal(await credentials.setSecret('fake-file-secret'), 'file')
    assert.deepEqual(await credentials.state(), { secretConfigured: true, credentialProtection: 'file' })
    assert.equal(await credentials.readSecret(), 'fake-file-secret')
    assert.equal((await stat(credentialsPath(userData))).mode & 0o777, 0o600)
  } finally {
    await rm(userData, { recursive: true, force: true })
  }
})

test('credential errors redact the supplied Secret', async () => {
  const userData = await tempDir()
  const secret = 'fake-error-secret'
  try {
    const storage = {
      ...fakeSafeStorage(true),
      encryptString: () => { throw new Error(`provider rejected ${secret}`) },
    }
    const credentials = new ConnectCredentials(credentialsPath(userData), storage)
    await assert.rejects(credentials.setSecret(secret), error => {
      assert.ok(error instanceof Error)
      assert.doesNotMatch(error.message, new RegExp(secret))
      assert.match(error.message, /credential storage failed/)
      return true
    })
  } finally {
    await rm(userData, { recursive: true, force: true })
  }
})
