import { test } from 'node:test'
import assert from 'node:assert/strict'
import { feishuSetupPageMarkup } from '../src/main/feishu-page.ts'

test('Feishu setup page renders the QR and never renders credentials', () => {
  const page = feishuSetupPageMarkup('zh', { stage: 'waiting-for-scan', qrDataUrl: 'data:image/png;base64,ZmFrZQ==' })
  assert.match(page, /配置飞书机器人/)
  assert.match(page, /data:image\/png;base64,ZmFrZQ==/)
  assert.match(page, /等待手机确认授权/)
  assert.doesNotMatch(page, /fake-secret|cli_fake_id/)
})

test('Feishu setup page renders a safe failure state without process details', () => {
  const page = feishuSetupPageMarkup('en', { stage: 'error' })
  assert.match(page, /Feishu bot setup failed/)
  assert.doesNotMatch(page, /exit|secret|app_id/i)
})
