/**
 * Composite versioning (docs/decisions/0009): the app version and git tag are
 * `<dsh version>.shell.<shell revision>` — e.g. `0.1.1-rc.1.shell.3` bundles
 * @deepseek-ai/dsh 0.1.1-rc.1 at shell revision 3. This tool is the single
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

/** Minimal semver parse/compare — enough for dotted numeric + alphanumeric prereleases. */
function parseVer(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(v)
  if (m === null) return null
  return { base: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] === undefined ? null : m[4].split('.') }
}

function compareVer(a, b) {
  const pa = parseVer(a)
  const pb = parseVer(b)
  if (pa === null || pb === null) fail(`not a semver: ${pa === null ? a : b}`)
  for (let i = 0; i < 3; i += 1) if (pa.base[i] !== pb.base[i]) return pa.base[i] - pb.base[i]
  if (pa.pre === null && pb.pre === null) return 0
  if (pa.pre === null) return 1
  if (pb.pre === null) return -1
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i += 1) {
    const x = pa.pre[i]
    const y = pb.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) {
      const d = Number(x) - Number(y)
      if (d !== 0) return d
    } else if (nx) return -1
    else if (ny) return 1
    else if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/** Split a composite version into its dsh part and shell revision. */
function parseComposite(version) {
  const m = /^(.+)\.shell\.(\d+)$/.exec(version)
  if (m === null || parseVer(m[1]) === null) return null
  return { dsh: m[1], rev: Number(m[2]) }
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
  const composite = parseComposite(pkg.version)
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
      const versions = Object.keys(doc.versions ?? {}).filter(v => parseVer(v) !== null)
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
    if (parseVer(dsh) === null) fail(`not a semver: ${dsh}`)
    await writeState(dsh, 0)
    console.log('version: next steps — pnpm -C manifest/harness install --lockfile-only && pnpm run bootstrap && pnpm run smoke')
    return
  }

  if (command === 'set') {
    const [dsh, rev] = [arg, process.argv[4]]
    if (parseVer(dsh ?? '') === null || !/^\d+$/.test(rev ?? '')) fail('usage: set <dsh-version> <shell-rev>')
    await writeState(dsh, Number(rev))
    return
  }

  fail('usage: show | check | bump shell | bump dsh <v|latest> | set <dsh> <rev>')
}

main().catch(error => fail(error instanceof Error ? error.message : String(error)))
