import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { parse } from 'yaml'
// @ts-expect-error Release tooling intentionally stays plain ESM JavaScript.
import { patchAccountDesktopGuard, patchAccountLogin } from '../scripts/patch-account-ui.mjs'

// Verify the deployed closure the app ships, not a potentially stale or
// differently-hoisted manifest node_modules directory.
const account = await readFile('resources/harness/node_modules/@deepseek-ai/dsh-client-ui-settings-account/lib/client.js', 'utf8')
const harnessRequire = createRequire(resolve('resources/harness/node_modules/@deepseek-ai/dsh/package.json'))

/** Slice the upstream `BrowserLogin` class out of a bundle of either shape.
 *
 * Kernels up to 0.2.2-alpha.3 publish this bundle formatted, one statement per
 * line with JSDoc; 0.2.2-rc.2 publishes it minified onto a single line. The
 * transform anchors are whitespace-tolerant, so the tests read whichever shape
 * the deployed closure has. A `/` outside a comment or string means a regular
 * expression literal, which this reader does not model — it refuses instead of
 * slicing the class wrong.
 */
function browserLoginSource(source: string): string {
  const start = source.search(/(?:var|let|const)\s+BrowserLogin\s*=\s*class\s*\{/)
  assert.ok(start >= 0, 'review the pinned account browser lifecycle if its boundary changes')
  let depth = 0
  let quote: string | null = null
  let comment: '//' | '/*' | null = null
  for (let index = source.indexOf('{', start); index < source.length; index++) {
    const char = source[index]!
    const next = source[index + 1]
    if (comment === '//') { if (char === '\n') comment = null; continue }
    if (comment === '/*') { if (char === '*' && next === '/') { comment = null; index++ } continue }
    if (quote !== null) {
      if (char === '\\') index++
      else if (char === quote) quote = null
      continue
    }
    if (char === '/' && next === '/') { comment = '//'; index++; continue }
    if (char === '/' && next === '*') { comment = '/*'; index++; continue }
    assert.notEqual(char, '/', 'the pinned BrowserLogin now contains a regular expression; extend this reader before trusting it')
    if (char === '"' || char === "'" || char === '`') { quote = char; continue }
    if (char === '{') depth++
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1)
  }
  throw new Error('unterminated BrowserLogin class')
}

test('the reviewed transforms still apply to a bundle of either shape', () => {
  const formatted = `\t\t\tvar BrowserLogin = class {\n\t\t\t\tupdate(view) {\n\t\t\t\t\tif (this.popup && !this.popup.closed) this.popup.location.replace(this.destination(attempt.authorizeUrl));\n\t\t\t\t}\n\t\t\t};\n\t\t\tfunction apply(ctx) {\n\t\t\t\tconst desktop = "dshDesktop" in globalThis;\n\t\t\t}`
  const minified = 'var BrowserLogin=class{update(view){if(!attempt?.authorizeUrl||this.navigated)return;this.navigated=true;if(this.popup&&!this.popup.closed)this.popup.location.replace(this.destination(attempt.authorizeUrl))}};function apply(ctx){const desktop=`dshDesktop`in globalThis;ctx.effect()}'
  for (const source of [formatted, minified]) {
    const patched = patchAccountDesktopGuard(patchAccountLogin(source))
    assert.notEqual(patched, source)
    assert.equal(patchAccountDesktopGuard(patchAccountLogin(patched)), patched, 'the transforms are idempotent')
    assert.match(patched, /else window\.open\(this\.destination\(attempt\.authorizeUrl\), "_blank", "noopener,noreferrer"\)/)
    assert.equal(patched.match(/const desktop = /g)?.length, 1, 'the desktop guard must replace the upstream test, not shadow it')
    assert.match(patched, /in globalThis && typeof globalThis\.dshOnboarding\?\.hasApiKey === "function";/)
  }
  assert.throws(() => patchAccountLogin('if (this.popup) this.popup.location.replace(url);'), /preopened-tab navigation anchor changed/)
  assert.throws(() => patchAccountDesktopGuard('const desktop = "dshDesktop" in window;'), /desktop capability detection anchor changed/)
})

test('the community Web shell namespace does not select the official desktop-only login path', () => {
  const detection = account.match(/const desktop = (.*?);/)
  assert.ok(detection, 'review desktop capability detection on a kernel upgrade')
  const isDesktop = (globals: object) => runInNewContext(detection[1]!, globals)
  assert.equal(isDesktop({}), false)
  assert.equal(isDesktop({ dshDesktop: { getDesktopPreferences() {} } }), false)
  assert.equal(isDesktop({ dshDesktop: {}, dshOnboarding: {} }), false)
  assert.equal(isDesktop({ dshDesktop: {}, dshOnboarding: { hasApiKey() {} } }), true)
})

test('kernel account login opens the system-browser URL once when Electron denies the preopened blank tab', () => {
  const opened: unknown[][] = []
  const BrowserLogin = runInNewContext(browserLoginSource(account) + '\nBrowserLogin', {
    window: { open: (...args: unknown[]) => { opened.push(args); return null } },
  })
  const browser = new BrowserLogin((url: string) => url)
  browser.begin()
  const view = { attempt: { id: 'fake-attempt', phase: 'waiting-browser', authorizeUrl: 'https://auth.invalid/authorize' } }
  browser.follow(view)
  browser.update(view)
  assert.deepEqual(opened, [
    ['about:blank', '_blank'],
    ['https://auth.invalid/authorize', '_blank', 'noopener,noreferrer'],
  ])
})

test('kernel account login preserves the upstream owned-popup route and cancellation cleanup', () => {
  const navigated: string[] = []
  let opened = 0
  let closed = 0
  const popup = { opener: {}, closed: false, location: { replace: (url: string) => navigated.push(url) }, close: () => { closed++ } }
  const BrowserLogin = runInNewContext(browserLoginSource(account) + '\nBrowserLogin', {
    window: { open: () => { opened++; return popup } },
  })
  const browser = new BrowserLogin((url: string) => url)
  browser.begin()
  const view = { attempt: { id: 'fake-attempt', phase: 'waiting-browser', authorizeUrl: 'https://auth.invalid/authorize' } }
  browser.follow(view)
  browser.update(view)
  assert.equal(opened, 1)
  assert.equal(popup.opener, null)
  assert.deepEqual(navigated, ['https://auth.invalid/authorize'])
  browser.update({ attempt: { ...view.attempt, phase: 'cancelled' } })
  assert.equal(closed, 1)
})

test('ACP keeps the saved Models credential composition; the new headless-only override is not applied to the bot', async () => {
  // Inspect composition data, never execute the upstream !!js expressions.
  const options = { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value: string) => value }] }
  // Resolve from the owning runtime: clean platform installs may legitimately
  // nest transitive bundles instead of hoisting them to node_modules' root.
  const base = parse(await readFile(harnessRequire.resolve('@deepseek-ai/dsh-base/cordis.patch.yml'), 'utf8'), options)
  const acp = parse(await readFile(harnessRequire.resolve('@deepseek-ai/dsh-acp-app/cordis.patch.yml'), 'utf8'), options)
  const headless = parse(await readFile(harnessRequire.resolve('@deepseek-ai/dsh-headless/cordis.patch.yml'), 'utf8'), options)
  const entries = base.flatMap((entry: { insert?: unknown[] }) => entry.insert ?? [])
  assert.ok(entries.some((entry: { id?: string; name?: string }) => entry.id === 'credentials' && entry.name === '@deepseek-ai/dsh-credentials-local'))
  assert.equal(acp.some((entry: { id?: string }) => entry.id === 'credentials'), false)
  assert.equal(headless.some((entry: { id?: string; disabled?: boolean }) => entry.id === 'credentials' && entry.disabled === true), true)
})
