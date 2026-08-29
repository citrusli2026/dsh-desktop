/**
 * First-run curated bundle seeding (decision 0024): a brand-new web profile
 * is initialized offline from the vendored closure, so a fresh install ships
 * with the curated community bundles. An existing profile is never rewritten
 * and a bundle the user uninstalled is never reinstalled — the seed fires
 * only when the profile manifest does not exist yet, exactly the
 * "offline-fixed new-profile initialization" policy the Bundle Edition
 * clients proved out.
 *
 * Seeded bundles are ordinary user bundles: visible in 设置 → 插件, managed
 * (updatable/uninstallable) by dsh-market, and quarantined by Safe Mode like
 * any third-party bundle. They are NOT the shell-owned controls overlay,
 * which keeps its own --patch mount (desktop-controls.ts).
 * @module main/profile-seed
 */
import { existsSync, lstatSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { OFFICIAL_BUNDLES, WEB_PROFILE } from './safe-mode.ts'

/** The curated community bundles a brand-new profile boots with (pinned in
 *  manifest/harness/package.json; vetted for license, activity, and provenance
 *  per decision 0024). */
export const CURATED_SEED_BUNDLES = [
  'dshmarket',
  'dsh-better-sidebar',
  '@linxin666/dsh-client-ui-task-board',
] as const

export interface CuratedSeedOptions {
  /** Effective DSH_HOME (resolveDshHome). */
  dshHome: string
  /** The vendored closure whose node_modules carries the seed packages. */
  bundledNodeModules: string
  seeds?: readonly string[]
}

export interface CuratedSeedOutcome {
  /** Bundles linked into the profile and written into the manifest. */
  seeded: string[]
  /** Seed names missing from the vendored closure. */
  skipped: string[]
  /** True when the profile already existed and nothing was touched. */
  profileExists: boolean
}

/** The web profile manifest path. */
export function profileManifestPath(dshHome: string): string {
  return join(dshHome, 'profiles', WEB_PROFILE, 'package.json')
}

/** The shared profile-local module lookup the loader resolves bundles from. */
function profileModulesDir(dshHome: string): string {
  return join(dshHome, 'profiles', 'node_modules')
}

/** Ordered `dsh.profile.bundles` of the web profile, empty when absent. */
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

/**
 * Seed a brand-new profile. When the manifest already exists the outcome is
 * `{ seeded: [], skipped: [], profileExists: true }` — users own their
 * profile and the seed never runs again. When no seed package is present in
 * the closure the profile is left for the harness's own template init.
 */
export async function seedCuratedProfile(options: CuratedSeedOptions): Promise<CuratedSeedOutcome> {
  const { dshHome, bundledNodeModules, seeds = CURATED_SEED_BUNDLES } = options
  const manifestPath = profileManifestPath(dshHome)
  if (existsSync(manifestPath)) return { seeded: [], skipped: [], profileExists: true }

  const modulesDir = profileModulesDir(dshHome)
  const seeded: string[] = []
  const skipped: string[] = []
  await mkdir(modulesDir, { recursive: true })
  for (const name of seeds) {
    const source = join(bundledNodeModules, name)
    if (!existsSync(join(source, 'package.json'))) {
      skipped.push(name)
      continue
    }
    const link = join(modulesDir, name)
    // Symlink, never copy: the hoisted closure resolves a bundle's runtime
    // dependencies (undici, react, …) by walking up from the real path —
    // the same mechanism healProfilesModuleFallback uses for the official
    // bundles. A copied package would strand those imports.
    try {
      if (lstatSync(link).isSymbolicLink()) {
        if (readlinkSync(link) === source) {
          seeded.push(name)
          continue
        }
        rmSync(link)
      } else {
        rmSync(link, { recursive: true, force: true })
      }
    } catch {
      // Missing link: create it below.
    }
    // Scoped packages need their scope directory inside the profile modules.
    await mkdir(dirname(link), { recursive: true })
    symlinkSync(source, link, process.platform === 'win32' ? 'junction' : 'dir')
    seeded.push(name)
  }
  // A manifest without its seed modules present would fail the boot's bundle
  // resolution; leaving profile creation to the harness template is the
  // graceful degradation path.
  if (seeded.length === 0) return { seeded, skipped, profileExists: false }

  await mkdir(join(dshHome, 'profiles', WEB_PROFILE), { recursive: true })
  const manifest = {
    name: 'dsh-profile-web',
    private: true,
    dependencies: {},
    dsh: {
      profile: {
        bundles: [...OFFICIAL_BUNDLES, ...seeded],
      },
    },
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return { seeded, skipped, profileExists: false }
}
