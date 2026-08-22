import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asDataUrl, escapeHtml } from '../src/main/shell-html.ts'

test('escapeHtml escapes the five dangerous characters', () => {
  assert.equal(escapeHtml(`<a href="x" title='y'>&`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;')
})

test('escapeHtml leaves safe text untouched', () => {
  assert.equal(escapeHtml('plain text 123'), 'plain text 123')
})

test('asDataUrl percent-encodes the page', () => {
  const url = asDataUrl('<!doctype html><p>hello & goodbye</p>')
  assert.ok(url.startsWith('data:text/html;charset=utf-8,'))
  assert.ok(url.includes('hello%20%26%20goodbye'))
  assert.ok(!url.includes('<p>'), 'markup must be encoded, not raw')
})

test('shell pages are data URLs through the shared helper', async () => {
  const { loadingPageHtml } = await import('../src/main/pages.ts')
  const url = loadingPageHtml('en')
  assert.ok(url.startsWith('data:text/html;charset=utf-8,'))
  assert.ok(!url.includes('<style>'), 'raw markup must not leak into the URL')
})
