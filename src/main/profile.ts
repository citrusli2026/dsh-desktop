/** Read-only helpers for the user's Harness profile and installed plugins. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { WEB_PROFILE } from './safe-mode.ts'

/** The web profile manifest path inside the user's DSH_HOME. */
export function profileManifestPath(dshHome: string): string {
  return join(dshHome, 'profiles', WEB_PROFILE, 'package.json')
}

/** Return the bundles the user has installed in the web profile. */
export async function readProfileBundles(dshHome: string): Promise<string[]> {
  try {
    const raw = await readFile(profileManifestPath(dshHome), 'utf8')
    const manifest = JSON.parse(raw) as { dsh?: { profile?: { bundles?: unknown } } }
    const bundles = manifest.dsh?.profile?.bundles
    return Array.isArray(bundles) ? bundles.filter((name): name is string => typeof name === 'string') : []
  } catch {
    return []
  }
}
