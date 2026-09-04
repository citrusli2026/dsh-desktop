/**
 * Plugin recovery actions for the error page: compare installed community
 * plugins against the npm registry, upgrade them in place, or disable one by
 * removing it from the profile bundle list. Disabling is deliberately
 * reversible and file-preserving: the package directory stays on disk, only
 * the `dsh.profile.bundles` entry (and its dependency entry) is removed.
 * @module main/plugin-recovery
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { WEB_PROFILE } from './safe-mode.ts'

export interface ProfileManifest {
  name?: string
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
}

export interface PluginUpdateInfo {
  name: string
  installed?: string
  latest?: string
  /** True when a newer published version exists. */
  updatable: boolean
}

/** -1 when a < b, 1 when a > b, 0 when equal; prerelease sorts below release. */
export function compareSemver(left: string, right: string): number {
  const parse = (value: string): { core: number[]; pre: string[] } => {
    const [main, ...pre] = value.replace(/^v/, '').split('-')
    return {
      core: (main ?? '').split('.').map(part => Number.parseInt(part, 10) || 0),
      pre: pre.length > 0 ? pre.join('-').split('.') : [],
    }
  }
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < 3; index += 1) {
    const diff = (a.core[index] ?? 0) - (b.core[index] ?? 0)
    if (diff !== 0) return Math.sign(diff)
  }
  if (a.pre.length === 0 && b.pre.length === 0) return 0
  if (a.pre.length === 0) return 1
  if (b.pre.length === 0) return -1
  return Math.sign(a.pre.join('.').localeCompare(b.pre.join('.'), 'en', { numeric: true }))
}

/** Read the profile manifest; a missing or damaged file yields an empty one. */
export async function readProfileManifest(dshHome: string, profile = WEB_PROFILE): Promise<ProfileManifest> {
  try {
    return JSON.parse(await readFile(join(dshHome, 'profiles', profile, 'package.json'), 'utf8')) as ProfileManifest
  } catch {
    return {}
  }
}

export async function writeProfileManifest(
  dshHome: string,
  manifest: ProfileManifest,
  profile = WEB_PROFILE,
): Promise<void> {
  await writeFile(
    join(dshHome, 'profiles', profile, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
}

/** Remove one bundle from the manifest's bundle list and dependencies. */
export function withoutBundle(manifest: ProfileManifest, name: string): ProfileManifest {
  const bundles = (manifest.dsh?.profile?.bundles ?? []).filter(bundle => bundle !== name)
  const dependencies = { ...(manifest.dependencies ?? {}) }
  delete dependencies[name]
  return {
    ...manifest,
    ...(Object.keys(dependencies).length > 0 || manifest.dependencies !== undefined ? { dependencies } : {}),
    dsh: { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles } },
  }
}

/** Query the npm registry for each package's latest published version. */
export async function latestVersions(
  names: readonly string[],
  fetchImpl: typeof fetch = fetch,
  registryUrl = 'https://registry.npmjs.org',
): Promise<Record<string, string>> {
  const results = await Promise.all(names.map(async (name) => {
    try {
      const response = await fetchImpl(`${registryUrl}/${encodeURIComponent(name)}/latest`, {
        signal: AbortSignal.timeout(10_000),
        headers: { accept: 'application/json' },
      })
      if (!response.ok) return [name, undefined] as const
      const body = await response.json() as { version?: unknown }
      return [name, typeof body.version === 'string' ? body.version : undefined] as const
    } catch {
      return [name, undefined] as const
    }
  }))
  return Object.fromEntries(results.filter((entry): entry is [string, string] => entry[1] !== undefined))
}

/**
 * Build per-plugin update info for the recovery surface: a plugin is
 * updatable when the registry publishes a version newer than installed.
 */
export function pluginUpdateInfos(
  installed: Record<string, string | undefined>,
  latest: Record<string, string>,
): PluginUpdateInfo[] {
  return Object.entries(installed).map(([name, current]) => {
    const newest = latest[name]
    return {
      name,
      ...(current === undefined ? {} : { installed: current }),
      ...(newest === undefined ? {} : { latest: newest }),
      updatable: newest !== undefined && (current === undefined || compareSemver(current, newest) < 0),
    }
  })
}
