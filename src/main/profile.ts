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
  /** The package directory exists on disk even though the boot list does not
   * name it — an installed package the user (or an upgrade) left disabled. */
  present?: boolean
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

/** Resolve an installed package directory inside the web profile, including
 * packages that are present but no longer on the boot list. */
function profilePackageDir(dshHome: string, name: string): string | undefined {
  return packageCandidates(dshHome, name).find(candidate => existsSync(candidate))
}

async function installedVersion(packageDir: string): Promise<string | undefined> {
  try {
    const packageJson = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8')) as { version?: unknown }
    return typeof packageJson.version === 'string' && packageJson.version !== '' ? packageJson.version : undefined
  } catch {
    return undefined
  }
}

async function packageStatus(dshHome: string, name: string, listed: boolean): Promise<ProfilePackageStatus> {
  const packageDir = profilePackageDir(dshHome, name)
  if (packageDir === undefined) return { name, state: listed ? 'damaged' : 'missing', present: false }
  const version = await installedVersion(packageDir)
  // A disabled package with an unreadable manifest stays "missing" for the
  // boot list's purposes; only a listed one is damaged.
  if (version === undefined) return { name, state: listed ? 'damaged' : 'missing', present: true }
  return listed
    ? { name, state: 'installed', version, present: true }
    : { name, state: 'missing', version, present: true }
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
      dshMarket: { name: DSHMARKET_PACKAGE, state: 'missing', present: false },
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
      dshMarket: { name: DSHMARKET_PACKAGE, state: 'damaged', present: false },
    }
  }
}

/** Return the bundles the user has installed in the web profile. */
export async function readProfileBundles(dshHome: string): Promise<string[]> {
  return (await readProfileStatus(dshHome)).bundles
}
