import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/main/index.ts', 'utf8')

test('cc-connect lifecycle is wired after Harness readiness and before quit completes', () => {
  assert.match(source, /const url = await boot\(\)[\s\S]*?await startConnectAfterHarness\(\)/)
  assert.match(source, /Promise\.all\(\[shellApp\.stopHarness\(\), connectSupervisor\?\.stop\(\), lanService\.stop\(\)\]\)/)
})

test('Safe Mode and kernel changes refresh the sidecar configuration', () => {
  assert.match(source, /applySafeMode[\s\S]*?stopConnectSupervisor\(\)/)
  assert.match(source, /applySafeMode[\s\S]*?startConnectAfterHarness\(\)/)
  assert.match(source, /switchKernel[\s\S]*?restartConnectForCurrentKernel\(\)/)
  assert.match(source, /kernelRestore[\s\S]*?restartConnectForCurrentKernel\(\)/)
  assert.match(source, /DSH_CC_CONNECT_FEISHU_SECRET/)
})

test('the fake Sidecar command override is development-only and never renderer-controlled', () => {
  assert.match(source, /!app\.isPackaged[\s\S]*DSH_CC_CONNECT_TEST_BIN/)
  assert.match(source, /command:\s*!app\.isPackaged[\s\S]*ccConnectBin\(\)/)
})
