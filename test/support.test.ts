/**
 * Unit tests for the prefilled support-issue URL (src/main/support.ts): the
 * error page's "Open a GitHub issue" action must stay generic and sanitized —
 * no log text, tokens, or on-device paths are ever embedded.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { supportIssueBody, supportIssueUrl } from '../src/main/support.ts'

const BASE_CONTEXT = {
  appVersion: '0.1.2-rc.1.shell.5',
  platform: 'darwin' as const,
  arch: 'arm64',
  kernelVersion: '0.1.2-rc.1',
  safeMode: false,
  suspects: ['dshmarket'],
  cause: 'kernel-api' as const,
}

test('supportIssueUrl encodes a human-readable title and body', () => {
  const url = supportIssueUrl(BASE_CONTEXT)
  assert.ok(url.startsWith('https://github.com/citrusli2026/dsh-desktop/issues/new?'))
  const parsed = new URL(url)
  assert.equal(parsed.searchParams.get('title'), 'dsh-desktop 0.1.2-rc.1.shell.5 · darwin · arm64 · plugin/kernel API')
  const body = parsed.searchParams.get('body') ?? ''
  assert.ok(body.includes('dshmarket'), 'suspect names are listed for maintainers')
  assert.ok(body.includes('Export Diagnostic Report'), 'the report is attached by the user, never auto-sent')
})

test('supportIssueBody collapses newlines from free-form values', () => {
  const body = supportIssueBody({ ...BASE_CONTEXT, appVersion: '0.1.2\r\nX-Injected: 1', kernelVersion: 'a\nb' })
  assert.ok(!body.includes('\r'), 'no CR remains from version fields')
  // The injected value must stay inline on its own field line and never open
  // a new structural line (e.g. a markdown header or another list item).
  assert.ok(!body.split('\n').some(line => line.startsWith('X-Injected')), 'no line starts with the injected value')
  assert.ok(!body.split('\n').some(line => line.startsWith('- ') && line.includes('b') && !line.includes('内核')), 'kernel version stays on its own line')
})

test('supportIssueBody without suspects says so plainly', () => {
  const body = supportIssueBody({ ...BASE_CONTEXT, suspects: [], cause: 'unknown' })
  assert.ok(body.includes('未检测到可疑插件'))
  assert.ok(!body.includes('插件引用了当前内核已移除'))
})
