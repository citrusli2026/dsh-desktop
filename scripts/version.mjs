/**
 * Composite versioning (docs/decisions/0009): the app version and git tag are
 * `<dsh version>.shell.<shell revision>` — e.g. `0.1.2-alpha.3.shell.0` bundles
 * @deepseek-ai/dsh 0.1.2-alpha.3 at shell revision 0. This tool is the single
 * writer of package.json's `version` field and the manifest's dsh pin.
 *
 *   node scripts/version.mjs show                  current parts + consistency check
 *   node scripts/version.mjs check                 exit 3 when upstream dsh is newer (CI)
 *   node scripts/version.mjs bump shell            shell revision +1
 *   node scripts/version.mjs bump dsh <v|latest>   new upstream pin, shell revision resets to 0
 *   node scripts/version.mjs set <dsh> <rev>       explicit migration/emergency write
 * @module scripts/version
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { compareSemver, isSemver, parseCompositeVersion } from './release-shape.mjs'

const ROOT = process.cwd()
const PKG_PATH = join(ROOT, 'package.json')
const MANIFEST_PATH = join(ROOT, 'manifest', 'harness', 'package.json')
const REGISTRIES = [
  process.env.NPM_CONFIG_REGISTRY ?? 'https://registry.npmmirror.com',
  'https://registry.npmjs.org',
]

/** Distinct exit codes so CI can branch: 3 = update available, 4 = inconsistent state. */
const EXIT_UPDATE_AVAILABLE = 3
const EXIT_INCONSISTENT = 4

function fail(message) {
  console.error(`version: ${message}`)
  process.exit(1)
}

/** Compare two semvers, failing fast on anything unparseable (release-shape
 *  returns null instead; here a broken version is a hard error). */
function compareVer(a, b) {
  const order = compareSemver(a, b)
  if (order === null) fail(`not a semver: ${!isSemver(a) ? a : b}`)
  return order
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function currentState() {
  const pkg = await readJson(PKG_PATH)
  const manifest = await readJson(MANIFEST_PATH)
  const pinned = manifest.dependencies?.['@deepseek-ai/dsh']
  const composite = parseCompositeVersion(pkg.version)
  return { pkg, pinned, composite }
}

/** Latest published upstream version: max over every published version string. */
async function latestUpstream() {
  let lastError
  for (const registry of REGISTRIES) {
    try {
      const response = await fetch(`${registry}/@deepseek-ai/dsh`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const doc = await response.json()
      const versions = Object.keys(doc.versions ?? {}).filter(v => isSemver(v) !== null)
      if (versions.length === 0) throw new Error('no parseable versions in registry doc')
      return { latest: versions.reduce((a, b) => (compareVer(a, b) >= 0 ? a : b)), registry }
    } catch (error) {
      lastError = error
    }
  }
  fail(`cannot reach any npm registry: ${lastError}`)
}

async function writeState(dsh, rev) {
  const { pkg } = await currentState()
  pkg.version = `${dsh}.shell.${rev}`
  await writeJson(PKG_PATH, pkg)
  const manifest = await readJson(MANIFEST_PATH)
  manifest.dependencies['@deepseek-ai/dsh'] = dsh
  await writeJson(MANIFEST_PATH, manifest)
  console.log(`version: dsh=${dsh} shell=${rev} -> ${pkg.version}`)
}

async function main() {
  const [command, arg] = process.argv.slice(2)
  const state = await currentState()

  if (command === 'show') {
    console.log(`version: package.json = ${state.pkg.version}`)
    console.log(`version: manifest pin = @deepseek-ai/dsh ${state.pinned}`)
    if (state.composite === null) fail(`version ${state.pkg.version} is not composite (<dsh>.shell.<rev>)`)
    console.log(`version: dsh=${state.composite.dsh} shell=${state.composite.rev}`)
    if (state.composite.dsh !== state.pinned) {
      console.error(`version: INCONSISTENT — composite dsh part ${state.composite.dsh} != manifest pin ${state.pinned}`)
      process.exit(EXIT_INCONSISTENT)
    }
    console.log('version: consistent')
    return
  }

  if (command === 'check') {
    if (state.composite === null) fail(`version ${state.pkg.version} is not composite`)
    if (state.composite.dsh !== state.pinned) {
      console.error(`version: INCONSISTENT — composite dsh part ${state.composite.dsh} != manifest pin ${state.pinned}`)
      process.exit(EXIT_INCONSISTENT)
    }
    const { latest, registry } = await latestUpstream()
    if (compareVer(latest, state.pinned) > 0) {
      console.log(`version-check: update available: ${latest}`)
      console.log(`version-check: bundled ${state.pinned}, latest ${latest} (via ${registry})`)
      process.exit(EXIT_UPDATE_AVAILABLE)
    }
    console.log(`version-check: dsh ${state.pinned} is the latest published (via ${registry})`)
    return
  }

  if (command === 'bump' && arg === 'shell') {
    if (state.composite === null) fail(`version ${state.pkg.version} is not composite`)
    await writeState(state.composite.dsh, state.composite.rev + 1)
    return
  }

  if (command === 'bump' && arg === 'dsh') {
    const target = process.argv[4]
    if (target === undefined) fail('usage: bump dsh <version|latest>')
    const dsh = target === 'latest' ? (await latestUpstream()).latest : target
    if (!isSemver(dsh)) fail(`not a semver: ${dsh}`)
    await writeState(dsh, 0)
    console.log('version: next steps — pnpm -C manifest/harness install --lockfile-only && pnpm run bootstrap && pnpm run smoke')
    return
  }

  if (command === 'set') {
    const [dsh, rev] = [arg, process.argv[4]]
    if (!isSemver(dsh ?? '') || !/^\d+$/.test(rev ?? '')) fail('usage: set <dsh-version> <shell-rev>')
    await writeState(dsh, Number(rev))
    return
  }

  fail('usage: show | check | bump shell | bump dsh <v|latest> | set <dsh> <rev>')
}

main().catch(error => fail(error instanceof Error ? error.message : String(error)))
