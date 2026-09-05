/**
 * Unit tests for the shell pages (src/main/pages.ts): HTML escaping of the
 * log tail and the retry button's recovery contract (the P0 stuck-button
 * regression: a resolved `false` from the retry bridge must re-enable the
 * button, not leave the page stuck on "正在启动…").
 * Run with `pnpm run test` (node --test; Node >= 22.19 strips the types natively).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorPageHtml, loadingPageHtml } from '../src/main/pages.ts'

test('errorPageHtml escapes the log tail before embedding it', () => {
  const html = errorPageHtml(6, '<script>alert("x")</script> & "quoted"')
  assert.ok(!html.includes('<script>alert'), 'raw script tag must not survive')
  assert.ok(html.includes(encodeURIComponent('&lt;script&gt;')) || html.includes('%3Cscript%3E'),
    'angle brackets must be escaped (page is a data: URL, so compare on the encoded form too)')
})

test('errorPageHtml retry script restores the button on a resolved false', () => {
  const html = decodeURIComponent(errorPageHtml(6, 'tail'))
  assert.ok(html.includes('.then('), 'the retry result promise must be chained')
  assert.ok(html.includes('if (!ok) restore()'), 'a resolved false must trigger recovery')
  assert.ok(html.includes('.catch(restore)'), 'a rejected promise must trigger recovery')
})

test('errorPageHtml retry script restores the button when the bridge is missing', () => {
  const html = decodeURIComponent(errorPageHtml(6, 'tail'))
  assert.ok(html.includes('bridge ? bridge() : undefined'))
  // Non-promise result (missing preload bridge) also restores.
  assert.ok(html.includes('restore();'))
})

test('errorPageHtml names the suspected failing plugin when present', () => {
  const html = decodeURIComponent(errorPageHtml(6, 'tail', false, [{ id: 'spike-broken', name: 'pkg-a' }]))
  assert.ok(html.includes('page.suspects') || html.includes('Suspected failing plugin'))
  assert.ok(html.includes('spike-broken'))
  assert.ok(html.includes('pkg-a'))
})

test('errorPageHtml renders one recovery row per unique failing package', () => {
  const html = decodeURIComponent(errorPageHtml(6, 'tail', false, [
    { id: 'row-1', name: 'dshmarket' },
    { id: 'row-2', name: 'dshmarket' },
    { id: 'row-3', name: 'dsh-better-sidebar' },
  ]))
  assert.ok(/<button[^>]+data-plugin-action="update"/.test(html), 'each row offers Update')
  assert.ok(/<button[^>]+data-plugin-action="disable"/.test(html), 'each row offers Disable')
  assert.ok(/<button[^>]+data-plugin-action="update-all"/.test(html), 'an update-all action exists')
  assert.equal((html.match(/<span class="plugin-state"/g) ?? []).length, 2, 'duplicate rows collapse onto one state slot')
  assert.ok(html.includes('data-plugin="dshmarket"'))
  assert.ok(html.includes('data-plugin="dsh-better-sidebar"'))
  // The update-all path passes no name; the per-row path passes the package.
  assert.ok(html.includes("invoke(all ? undefined : name)"), 'update-all must not send a package name')
})

test('errorPageHtml without suspects renders no plugin recovery section', () => {
  const html = decodeURIComponent(errorPageHtml(6, 'tail'))
  assert.ok(!/data-plugin-action=/.test(html.replace(/function[\s\S]*?\n      }/g, '')), 'no action buttons without suspects')
  assert.ok(!html.includes('class="plugin-row"'))
})

test('loadingPageHtml and errorPageHtml render as data URLs', () => {
  assert.ok(loadingPageHtml().startsWith('data:text/html;charset=utf-8,'))
  assert.ok(errorPageHtml(6, 'tail').startsWith('data:text/html;charset=utf-8,'))
  const loading = decodeURIComponent(loadingPageHtml('zh'))
  assert.ok(loading.includes('正在启动内置运行时…'))
  assert.ok(loading.includes('class="loading-line"'))
  assert.ok(!loading.includes('class="spinner"'))
  assert.ok(!loading.includes('class="progress"'))
  assert.match(decodeURIComponent(loadingPageHtml('en', 'waiting-for-ready')), /Waiting for Harness to be ready/)
  assert.match(decodeURIComponent(loadingPageHtml('zh', 'retrying', 3_000)), /约 3 秒后自动重试/)
  assert.ok(decodeURIComponent(errorPageHtml(6, 'tail')).includes('Start again'))
  assert.ok(decodeURIComponent(errorPageHtml(6, 'tail', false, [], 'zh')).includes('再次启动'))
})

test('built-in pages carry a restrictive CSP and the error page exposes local diagnostics', () => {
  const loading = decodeURIComponent(loadingPageHtml())
  const error = decodeURIComponent(errorPageHtml(6, 'tail'))
  assert.match(loading, /Content-Security-Policy/)
  assert.match(loading, /default-src 'none'/)
  assert.match(error, /Export Diagnostic Report/)
  assert.match(error, /dshDesktop\.exportDiagnostics/)
})


test('errorPageHtml swaps the plugin hint to the kernel-cliff copy when classified', () => {
  const html = decodeURIComponent(errorPageHtml(6, 'tail', false, [{ id: 'r', name: 'dshmarket' }], 'en', 'kernel-api'))
  assert.ok(html.includes('no longer exports'), 'kernel-api hint must explain the missing export')
  const plain = decodeURIComponent(errorPageHtml(6, 'tail', false, [{ id: 'r', name: 'dshmarket' }], 'en', 'unknown'))
  assert.ok(!plain.includes('no longer exports'))
})


test('errorPageHtml wires the support-issue action and the current-version tri-state', () => {
  const html = decodeURIComponent(errorPageHtml(6, 'tail', false, [{ id: 'r', name: 'dshmarket' }]))
  assert.ok(/<button[^>]+onclick="getHelp\(\)"/.test(html), 'a GitHub-issue action is offered')
  assert.ok(html.includes('openSupportIssue'), 'the getHelp bridge calls openSupportIssue')
  // The update bridge can resolve 'current' when a no-op install was already
  // the newest obtainable version (registry metadata lag).
  assert.ok(html.includes("ok === 'current'"), 'the recovery script handles the current-version result')
  assert.ok(html.includes('ALREADY_CURRENT'), 'the current-version copy is wired')
})
