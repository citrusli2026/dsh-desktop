/** Prepare the bundled Web-only desktop controls plugin for dsh's profile loader. */
import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'

const PACKAGE_NAME = 'dsh-desktop-controls'

function packagePath(harnessDir: string, ...segments: readonly string[]): string {
  return join(harnessDir, 'node_modules', PACKAGE_NAME, ...segments)
}

/** Absolute patch path used by the default Web profile. */
export function desktopControlsPatchPath(harnessDir: string): string {
  return packagePath(harnessDir, 'cordis.patch.yml')
}

/**
 * Make the bundled package resolvable from the profile-local loader lookup.
 * A user-managed real package always wins; only a missing or stale symlink is
 * repaired. This mirrors dsh's profile resolution without modifying the
 * user's installed plugin configuration.
 */
function ensureProfileModuleLink(dshHome: string, harnessDir: string): void {
  const target = packagePath(harnessDir)
  const link = join(dshHome, 'profiles', 'node_modules', PACKAGE_NAME)
  mkdirSync(dirname(link), { recursive: true })
  try {
    if (lstatSync(link).isSymbolicLink()) {
      let current: string | undefined
      try {
        current = readlinkSync(link)
      } catch {
        current = undefined
      }
      if (current === target) return
      rmSync(link)
    } else {
      return
    }
  } catch {
    // Missing link: create it below.
  }
  symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
}

/**
 * Return the patch when the package is complete and resolvable. Any failure
 * is handled by the supervisor as a graceful stock-Harness fallback.
 */
export function prepareDesktopControlsMount(dshHome: string, harnessDir: string): string | undefined {
  const patch = desktopControlsPatchPath(harnessDir)
  const client = packagePath(harnessDir, 'lib', 'client.js')
  const host = packagePath(harnessDir, 'lib', 'index.js')
  if (!existsSync(patch) || !existsSync(client) || !existsSync(host)) return undefined
  try {
    ensureProfileModuleLink(dshHome, harnessDir)
  } catch {
    // A read-only home can still have a profile-managed package already.
  }
  return existsSync(join(dshHome, 'profiles', 'node_modules', PACKAGE_NAME, 'lib', 'index.js'))
    ? patch
    : undefined
}
