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
 * repaired. Two anchors are maintained: the profile directory itself
 * (`profiles/<name>/node_modules`, resolved by the 0.1.6-alpha.2+ profile
 * resolution generation and by plain walk-up) and the legacy profiles-level
 * link (`profiles/node_modules`, still used by older kernels reachable via
 * kernel-restore). This mirrors dsh's profile resolution without modifying
 * the user's installed plugin configuration.
 */
function ensureProfileModuleLinks(dshHome: string, harnessDir: string): void {
  const target = packagePath(harnessDir)
  const profilesRoot = join(dshHome, 'profiles')
  const links = [
    join(profilesRoot, 'node_modules', PACKAGE_NAME),
    join(profilesRoot, 'web', 'node_modules', PACKAGE_NAME),
  ]
  for (const link of links) {
    mkdirSync(dirname(link), { recursive: true })
    try {
      if (lstatSync(link).isSymbolicLink()) {
        let current: string | undefined
        try {
          current = readlinkSync(link)
        } catch {
          current = undefined
        }
        if (current === target) continue
        rmSync(link)
      } else {
        continue
      }
    } catch {
      // Missing link: create it below.
    }
    symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
  }
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
    ensureProfileModuleLinks(dshHome, harnessDir)
  } catch {
    // A read-only home can still have a profile-managed package already.
  }
  return existsSync(join(dshHome, 'profiles', 'web', 'node_modules', PACKAGE_NAME, 'lib', 'index.js'))
    || existsSync(join(dshHome, 'profiles', 'node_modules', PACKAGE_NAME, 'lib', 'index.js'))
    ? patch
    : undefined
}
