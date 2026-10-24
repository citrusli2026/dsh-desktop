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

test('errorPageHtml explains a damaged bundled runtime when the harness failed to spawn', () => {
  // Issue #39: an upgrade-residue node binary fails at spawn with EFTYPE; the
  // page must say "reinstall" instead of leaving the raw error as the only clue.
  const damaged = decodeURIComponent(errorPageHtml(0, 'spawn EFTYPE'))
  assert.ok(damaged.includes('Node'), 'a runtime hint names the Node runtime')
  assert.ok(damaged.includes('Reinstall') || damaged.includes('重新安装'), 'the runtime hint calls for a reinstall')
  const unrelated = decodeURIComponent(errorPageHtml(0, 'harness exited before ready (code 1)'))
  assert.ok(!unrelated.includes('failed to start'), 'an ordinary crash keeps the plain page')
})

test('error page renders the native-module hint for dlopen failures', async () => {
  const { errorPageHtml } = await import('../src/main/pages.ts')
  const tail = 'Error: failed to apply loader entry workspace\nERR_DLOPEN_FAILED, The specified module could not be found.'
  const html = decodeURIComponent(errorPageHtml(1, tail, false, [], 'zh').replace(/^data:text\/html;charset=utf-8,/, ''))
  assert.match(html, /原生组件加载失败/)
  assert.match(html, /VC\+\+ 2015-2022/)
  // The spawn-failure hint must NOT appear for a dlopen failure.
  assert.doesNotMatch(html, /spawn EFTYPE 的唯一线索|运行文件.*缺失、损坏/)
})

test('errorPageHtml explains a missing kernel package with the upgrade hint', () => {
  const html = decodeURIComponent(errorPageHtml(6, 'failed to import loader entry preset-pentest (@deepseek-ai/dsh-agent-preset): Cannot find package', false, [
    { id: 'preset-pentest', name: '@deepseek-ai/dsh-agent-preset' },
  ], 'en', 'missing-package'))
  assert.ok(html.includes('does not carry'), 'the missing-package hint must be used')
  assert.ok(html.includes('@deepseek-ai/dsh-agent-preset'))
})

test('errorPageHtml offers the profile write repair when the preflight blocked the boot', () => {
  const tail = 'dsh-desktop: profile-not-writable: C:\\Users\\me\\.dsh-desktop\\profiles\\web\\cordis.yml — the bundled kernel rewrites profiles/<name>/cordis.yml on every start'
  const html = decodeURIComponent(errorPageHtml(0, tail))
  assert.ok(html.includes('cordis.yml'), 'the blocked path must be named')
  assert.ok(html.includes('repairProfile()'), 'the repair action must be wired')
  assert.ok(html.includes('Repair file permissions'), 'the repair button must be labelled')
  assert.ok(html.includes('Controlled Folder Access'), 'the Windows guidance must be present')
})

test('errorPageHtml offers releasing the automatic quarantine', () => {
  const html = decodeURIComponent(errorPageHtml(0, 'tail', false, [{ id: 'preset-pentest', quarantined: true }]))
  assert.ok(html.includes('clearQuarantine()'))
  assert.ok(html.includes('Release plugin quarantine'))
  const clean = decodeURIComponent(errorPageHtml(0, 'tail', false, [{ id: 'preset-pentest' }]))
  assert.ok(!clean.includes('Release plugin quarantine'), 'no quarantine section without quarantined rows')
})

test('the recovery page offers AI triage and a fallback export path', () => {
  const html = decodeURIComponent(errorPageHtml(3, 'boom', false, [], 'zh', 'kernel-api').split(',').slice(1).join(','))
  assert.match(html, /data-dsh-ask-ai/)
  assert.match(html, /askAi\(\)/)
  assert.match(html, /问 AI 诊断/)
  assert.match(html, /startup\.kernel-api/)
  assert.match(html, /exportDiagnostics/)
  assert.match(html, /Harness 当前不可用/)
  const english = decodeURIComponent(errorPageHtml(3, 'boom', false, [], 'en', 'missing-package').split(',').slice(1).join(','))
  assert.match(english, /Ask AI to diagnose/)
  assert.match(english, /startup\.missing-package/)
  assert.match(english, /Harness is not available/)
})
