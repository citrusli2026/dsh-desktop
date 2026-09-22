import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { missingVcRuntimeDlls, shouldPromptVcRuntime, vcRuntimeDismissedPath, VC_REDIST_URL, VC_RUNTIME_DLLS } from '../src/main/win-runtime.ts'

test('missingVcRuntimeDlls reports nothing off Windows', () => {
  // The test host runs on the build platform (mac/linux CI); the check must
  // be a no-op there regardless of what System32 contains.
  if (process.platform === 'win32') return
  assert.deepEqual(missingVcRuntimeDlls('/nonexistent-root'), [])
})

test('missingVcRuntimeDlls names exactly the DLLs absent from a fake System32', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-win-runtime-sys-'))
  try {
    mkdirSync(join(root, 'System32'), { recursive: true })
    // Present two of the three; msvcp140.dll is the classic dlopen blocker.
    writeFileSync(join(root, 'System32', 'vcruntime140.dll'), '')
    writeFileSync(join(root, 'System32', 'vcruntime140_1.dll'), '')
    assert.deepEqual(missingVcRuntimeDlls(root, 'win32'), ['msvcp140.dll'])
    // A complete System32 yields an empty list.
    writeFileSync(join(root, 'System32', 'msvcp140.dll'), '')
    assert.deepEqual(missingVcRuntimeDlls(root, 'win32'), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('shouldPromptVcRuntime gates on platform, missing DLLs, and dismissal', () => {
  assert.equal(shouldPromptVcRuntime('win32', ['msvcp140.dll'], false), true)
  assert.equal(shouldPromptVcRuntime('win32', [], false), false, 'nothing missing → no prompt')
  assert.equal(shouldPromptVcRuntime('win32', ['msvcp140.dll'], true), false, 'dismissed → no prompt')
  assert.equal(shouldPromptVcRuntime('darwin', ['msvcp140.dll'], false), false, 'not Windows → no prompt')
  assert.equal(shouldPromptVcRuntime('linux', ['msvcp140.dll'], false), false)
})

test('dismissal marker path lives under userData and the flow round-trips', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-win-runtime-'))
  try {
    const marker = vcRuntimeDismissedPath(home)
    assert.ok(marker.includes('vc-runtime-prompt-dismissed'))
    assert.equal(existsSync(marker), false)
    writeFileSync(marker, '')
    assert.equal(existsSync(marker), true)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('the redistributable link is the official aka.ms alias and the DLL list matches sharp needs', () => {
  assert.equal(VC_REDIST_URL, 'https://aka.ms/vs/17/release/vc_redist.x64.exe')
  assert.ok(VC_RUNTIME_DLLS.includes('msvcp140.dll'))
  assert.ok(VC_RUNTIME_DLLS.includes('vcruntime140.dll'))
  assert.ok(VC_RUNTIME_DLLS.includes('vcruntime140_1.dll'))
})
