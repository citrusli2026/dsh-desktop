/** Read installed plugins' companion declarations without executing them. */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { COMPANION_LIMITS, parseCompanionDescriptor, type CompanionDescriptor } from './companion-policy.ts'

/** Package names installed directly in the active Web profile. */
async function installedPackages(profileDir: string): Promise<string[]> {
  let names: string[]
  try {
    names = await readdir(join(profileDir, 'node_modules'))
  } catch {
    return []
  }
  const packages: string[] = []
  const root = join(profileDir, 'node_modules')
  for (const name of names.sort()) {
    if (name.startsWith('.') || name === '.bin') continue
    if (name.startsWith('@')) {
      try {
        for (const child of (await readdir(join(root, name))).sort()) packages.push(`${name}/${child}`)
      } catch { /* unreadable scope */ }
    } else {
      packages.push(name)
    }
    if (packages.length >= COMPANION_LIMITS.maxPackages) break
  }
  return packages
}

/**
 * One descriptor per installed package that declares `dsh.companion`.
 * Declarations are read from package.json only — plugin code is never run.
 */
export async function discoverCompanions(dshHome: string): Promise<CompanionDescriptor[]> {
  const profileDir = join(dshHome, 'profiles', 'web')
  const packages = await installedPackages(profileDir)
  const found: CompanionDescriptor[] = []
  for (const name of packages) {
    try {
      const manifest = JSON.parse(await readFile(join(profileDir, 'node_modules', name, 'package.json'), 'utf8')) as {
        dsh?: { companion?: unknown }
      }
      const descriptor = parseCompanionDescriptor(name, manifest.dsh?.companion)
      if (descriptor !== undefined) found.push(descriptor)
    } catch { /* missing, unreadable or damaged package */ }
  }
  return found.slice(0, COMPANION_LIMITS.maxCompanions)
}
