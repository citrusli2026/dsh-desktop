import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('cc-connect user documentation covers setup, lifecycle, storage, and removal', async () => {
  const guide = await readFile('docs/cc-connect.md', 'utf8')
  const index = await readFile('docs/README.md', 'utf8')
  const releaseNotes = await readFile('docs/release-notes/v0.2.1-alpha.1.shell.4.md', 'utf8')

  for (const phrase of [
    '飞书开放平台',
    'im.message.receive_v1',
    'WebSocket 长连接',
    '启动',
    '停止',
    'Safe Mode',
    'credentials.json',
    '脱敏',
    '彻底禁用',
    '删除凭证',
    'DSH_CC_CONNECT_FEISHU_SECRET',
  ]) {
    assert.match(guide, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  assert.match(index, /cc-connect\.md/)
  assert.match(releaseNotes, /cc-connect|飞书消息连接/i)
})
