/** Narrow, version-bound account-UI extension; never patches user overlays.
 *
 * Up to 0.2.2-alpha.3 the account bundle shipped formatted, so both changes
 * lived in `manifest/harness/patches/*.patch` and pnpm applied them at install
 * time. 0.2.2-rc.2 began publishing `lib/client.js` minified: the whole bundle
 * is one line, so a unified diff would be a pair of ~187 KB lines that carry no
 * reviewable context, and pnpm's patcher cannot apply the old formatted diff to
 * it at all (`ERR_PNPM_UNUSED_PATCH` in every dsh-watch run from rc.1 on).
 * The reviewed change therefore moved to a deploy-time transform — the same
 * shape as `patch-session-trash.mjs` — where each edit asserts its upstream
 * anchor resolves exactly once. The review surface is upstream's published
 * `src/` (rc.2+ ships TypeScript sources next to the bundle) plus the two
 * behavior tests in test/kernel-account-patch.test.ts, which exercise the
 * deployed bundle.
 */
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REVIEWED_KERNELS } from './patch-session-trash.mjs'

const PACKAGE = '@deepseek-ai/dsh-client-ui-settings-account'
const loginMarker = 'dsh-desktop: account-login-fallback-v1'
const desktopMarker = 'dsh-desktop: account-desktop-guard-v1'

/** Fall back to a fresh tab when Electron denies the preopened blank one.
 *
 * `BrowserLogin.begin()` preopens `about:blank` and binds it to the Host
 * attempt; the desktop shell refuses `window.open` for that origin, so `popup`
 * stays null and the authorize URL was never opened anywhere — the sign-in
 * dialog just sat there. The fallback runs only on the branch upstream already
 * takes when the attempt has an authorize URL and has not navigated yet.
 */
export function patchAccountLogin(source) {
  if (source.includes(loginMarker)) return source
  // Whitespace-tolerant: formatted bundles indent the statement over one line,
  // minified ones inline it, and neither carries the trailing semicolon.
  const anchor = /if\s*\(\s*this\.popup\s*&&\s*!\s*this\.popup\.closed\s*\)\s*this\.popup\.location\.replace\(\s*this\.destination\(\s*attempt\.authorizeUrl\s*\)\s*\)\s*;?/g
  const found = source.match(anchor) ?? []
  if (found.length !== 1) throw new Error('account patch: preopened-tab navigation anchor changed; review the login lifecycle before building')
  const fallback = `/* ${loginMarker} */ if (this.popup && !this.popup.closed) this.popup.location.replace(this.destination(attempt.authorizeUrl)); else window.open(this.destination(attempt.authorizeUrl), "_blank", "noopener,noreferrer");`
  return source.replace(anchor, () => fallback)
}

/** Do not select the official desktop login path from just `dshDesktop`.
 *
 * The community Web shell exposes `globalThis.dshDesktop` for its own bridge
 * but does not ship the official desktop onboarding bridge, so the upstream
 * test `"dshDesktop" in globalThis` sent the whole sign-in flow down a route
 * that can never complete here. The guard requires the onboarding capability
 * the route actually calls.
 */
export function patchAccountDesktopGuard(source) {
  if (source.includes(desktopMarker)) return source
  const anchor = /const desktop\s*=\s*["'`]dshDesktop["'`]\s*in\s+globalThis\s*;?/
  const found = source.match(new RegExp(anchor.source, 'g')) ?? []
  if (found.length !== 1) throw new Error('account patch: desktop capability detection anchor changed; review login routing on a kernel upgrade')
  return source.replace(anchor, () => `/* ${desktopMarker} */ const desktop = "dshDesktop" in globalThis && typeof globalThis.dshOnboarding?.hasApiKey === "function";`)
}

/** Apply both reviewed edits to the deployed closure the app ships. */
export async function patchBundledAccountUi(root, upstreamRoot = root) {
  const packageRoot = join(root, 'node_modules', PACKAGE)
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  if (!REVIEWED_KERNELS.includes(manifest.version)) throw new Error(`account patch: unsupported kernel ${manifest.version}; login review required`)
  const file = join(packageRoot, 'lib', 'client.js')
  const upstreamFile = join(upstreamRoot, 'node_modules', PACKAGE, 'lib', 'client.js')
  const source = await readFile(upstreamFile, 'utf8')
  const patched = patchAccountDesktopGuard(patchAccountLogin(source))
  if (await readFile(file, 'utf8') !== patched) {
    // Rename, never rewrite in place: a pnpm deploy may hardlink the file into
    // the closure, and an in-place write would edit the staged manifest too.
    const temporary = file + '.desktop-account.tmp'
    await writeFile(temporary, patched)
    await rename(temporary, file)
  }
}
