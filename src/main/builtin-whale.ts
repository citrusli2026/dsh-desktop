/**
 * Built-in, opt-in whale widget (ADR 0044).
 *
 * The package is vendored under `third_party/dsh-whale-widget` and staged into
 * the deployed closure by `scripts/build.mjs`. It is mounted as a shell-owned
 * patch only while the user keeps the setting on, and never in Safe Mode, so
 * disabling it removes both the widget and its companion window without
 * touching the user's profile configuration.
 */
import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const WHALE_PACKAGE_NAME = 'dsh-whale-widget'

function packagePath(harnessDir: string, ...segments: readonly string[]): string {
  return join(harnessDir, 'node_modules', WHALE_PACKAGE_NAME, ...segments)
}

/** Patch file the loader needs for the bundled package. */
export function whalePatchPath(harnessDir: string): string {
  return packagePath(harnessDir, 'cordis.patch.yml')
}

function profileLinks(dshHome: string): string[] {
  const profilesRoot = join(dshHome, 'profiles')
  return [
    join(profilesRoot, 'node_modules', WHALE_PACKAGE_NAME),
    join(profilesRoot, 'web', 'node_modules', WHALE_PACKAGE_NAME),
  ]
}

function pointsAt(link: string, target: string): boolean {
  try {
    return realpathSync(link) === realpathSync(target)
  } catch {
    return false
  }
}

/** Remove only links this shell owns; a user-managed copy is left alone. */
function removeOwnedLinks(dshHome: string, harnessDir: string): void {
  const target = packagePath(harnessDir)
  for (const link of profileLinks(dshHome)) {
    try {
      if (!lstatSync(link).isSymbolicLink()) continue
      if (!pointsAt(link, target)) continue
      rmSync(link)
    } catch {
      // Missing link (or a dangling one we cannot resolve): nothing to do.
      try {
        if (lstatSync(link).isSymbolicLink()) rmSync(link)
      } catch { /* absent */ }
    }
  }
}

function ensureLinks(dshHome: string, harnessDir: string): void {
  const target = packagePath(harnessDir)
  for (const link of profileLinks(dshHome)) {
    mkdirSync(dirname(link), { recursive: true })
    try {
      if (lstatSync(link).isSymbolicLink()) {
        if (pointsAt(link, target)) continue
        rmSync(link)
      } else {
        // A real directory belongs to the user (normal plugin install): keep it.
        continue
      }
    } catch {
      // Missing link: create it below.
    }
    symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
  }
}

/**
 * Mount the bundled whale widget when enabled.
 *
 * Returns the patch path for the loader, or undefined when the package is
 * incomplete or the feature is off. Disabling also removes the profile links
 * so companion discovery and the panel stop seeing a package that will not
 * be mounted.
 */
export function prepareWhaleMount(dshHome: string, harnessDir: string, enabled: boolean): string | undefined {
  if (!enabled) {
    removeOwnedLinks(dshHome, harnessDir)
    return undefined
  }
  const patch = whalePatchPath(harnessDir)
  const present = ['lib/index.js', 'assets/whale-widget.js', 'package.json']
    .every(relative => existsSync(packagePath(harnessDir, relative)))
  if (!existsSync(patch) || !present) return undefined
  try {
    ensureLinks(dshHome, harnessDir)
  } catch {
    // A read-only home can still have a profile-managed package.
  }
  return patch
}
