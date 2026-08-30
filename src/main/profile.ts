/** Read-only helpers for the user's Harness profile and installed plugins. */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { WEB_PROFILE } from './safe-mode.ts'

/** The web profile manifest path inside the user's DSH_HOME. */
export function profileManifestPath(dshHome: string): string {
  return join(dshHome, 'profiles', WEB_PROFILE, 'package.json')
}

export type ProfilePackageState = 'installed' | 'missing' | 'damaged'

export interface ProfilePackageStatus {
  name: string
  state: ProfilePackageState
  version?: string
}

export interface ProfileStatus {
  manifest: 'installed' | 'missing' | 'damaged'
  bundles: string[]
  userBundles: string[]
  dshMarket: ProfilePackageStatus
}

const DSHMARKET_PACKAGE = 'dshmarket'

function packageCandidates(dshHome: string, name: string): string[] {
  return [
    join(dshHome, 'profiles', WEB_PROFILE, 'node_modules', name),
    join(dshHome, 'profiles', 'node_modules', name),
  ]
}

async function packageStatus(dshHome: string, name: string, listed: boolean): Promise<ProfilePackageStatus> {
  if (!listed) return { name, state: 'missing' }
  const packageDir = packageCandidates(dshHome, name).find(candidate => existsSync(candidate))
  if (packageDir === undefined) return { name, state: 'damaged' }
  try {
    const packageJson = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8')) as { version?: unknown }
    return typeof packageJson.version === 'string' && packageJson.version !== ''
      ? { name, state: 'installed', version: packageJson.version }
      : { name, state: 'damaged' }
  } catch {
    return { name, state: 'damaged' }
  }
}

/** Read the user profile state without changing any profile files. */
export async function readProfileStatus(dshHome: string): Promise<ProfileStatus> {
  let raw: string
  try {
    raw = await readFile(profileManifestPath(dshHome), 'utf8')
  } catch {
    return {
      manifest: 'missing',
      bundles: [],
      userBundles: [],
      dshMarket: { name: DSHMARKET_PACKAGE, state: 'missing' },
    }
  }
  try {
    const manifest = JSON.parse(raw) as { dsh?: { profile?: { bundles?: unknown } } }
    const bundles = Array.isArray(manifest.dsh?.profile?.bundles)
      ? manifest.dsh.profile.bundles.filter((name): name is string => typeof name === 'string')
      : []
    return {
      manifest: 'installed',
      bundles,
      userBundles: bundles.filter(name => name !== '@deepseek-ai/dsh-base' && name !== '@deepseek-ai/dsh-web-app'),
      dshMarket: await packageStatus(dshHome, DSHMARKET_PACKAGE, bundles.includes(DSHMARKET_PACKAGE)),
    }
  } catch {
    return {
      manifest: 'damaged',
      bundles: [],
      userBundles: [],
      dshMarket: { name: DSHMARKET_PACKAGE, state: 'damaged' },
    }
  }
}

/** Return the bundles the user has installed in the web profile. */
export async function readProfileBundles(dshHome: string): Promise<string[]> {
  return (await readProfileStatus(dshHome)).bundles
}
