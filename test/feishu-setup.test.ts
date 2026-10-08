import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FeishuSetupRun, extractFeishuCredentials } from '../src/main/feishu-setup.ts'

test('extractFeishuCredentials reads generated credentials without exposing them in a status message', () => {
  const credentials = extractFeishuCredentials([
    '[[projects]]',
    'name = "dsh-desktop"',
    '',
    '[[projects.platforms]]',
    'type = "feishu"',
    '',
    '[projects.platforms.options]',
    'app_id = "cli_test_id"',
    'app_secret = "test-secret-value"',
  ].join('\n'))

  assert.deepEqual(credentials, { appId: 'cli_test_id', appSecret: 'test-secret-value' })
})

test('FeishuSetupRun shows a QR, reads the temp config, and cleans up without logging the Secret', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-feishu-setup-test-'))
  const command = join(root, 'fake-cc-connect.mjs')
  const qrPath = join(root, 'qr.png')
  const configPath = join(root, 'config.toml')
  await writeFile(command, [
    '#!/usr/bin/env node',
    "import { writeFileSync } from 'node:fs'",
    "writeFileSync(process.argv[2], Buffer.from('fake-png'))",
    `setTimeout(() => writeFileSync(process.argv[3], ${JSON.stringify('[[projects]]\nname = "dsh-desktop"\n\n[[projects.platforms]]\ntype = "feishu"\n\n[projects.platforms.options]\napp_id = "cli_fake_id"\napp_secret = "fake-secret-value"\n')}), 20)`,
  ].join('\n'))
  await chmod(command, 0o755)

  const stages: string[] = []
  let qr: Buffer | undefined
  const run = new FeishuSetupRun({
    command,
    workspace: root,
    tempDirectory: root,
    timeoutMs: 2_000,
    args: paths => [paths.qrImagePath, paths.configPath],
    onQr: image => { qr = image },
    onStage: stage => { stages.push(stage) },
  })
  const result = await run.start()

  assert.deepEqual(result, { appId: 'cli_fake_id', appSecret: 'fake-secret-value', status: 'completed' })
  assert.deepEqual(qr, Buffer.from('fake-png'))
  assert.deepEqual(stages, ['starting', 'waiting-for-scan', 'completed'])
  await assert.rejects(readFile(configPath))
  await assert.rejects(readFile(qrPath))
  assert.doesNotMatch(stages.join(' '), /fake-secret-value/)
})

test('FeishuSetupRun cancellation never returns or records a Secret', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-feishu-setup-cancel-'))
  const command = join(root, 'fake-cc-connect.mjs')
  await writeFile(command, '#!/usr/bin/env node\nsetInterval(() => {}, 1000)\n')
  await chmod(command, 0o755)
  const stages: string[] = []
  const run = new FeishuSetupRun({
    command,
    workspace: root,
    tempDirectory: root,
    timeoutMs: 2_000,
    args: () => [],
    onStage: stage => { stages.push(stage) },
  })
  const pending = run.start()
  await new Promise(resolve => setTimeout(resolve, 25))
  run.cancel()
  await assert.rejects(pending, /cancelled/)
  assert.equal(stages.at(-1), 'cancelled')
  assert.doesNotMatch(stages.join(' '), /secret/i)
})
