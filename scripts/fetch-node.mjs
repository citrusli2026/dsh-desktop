/**
 * Stage the bundled Node.js runtime for the harness child process
 * (docs/decisions/0002). Reproducible by construction: the version and the
 * per-platform SHA-256 are pinned in manifest/node-runtime.json, and the
 * mirror only delivers bytes that must match the committed hash — payload
 * and checksum no longer share a trust root, so a poisoned mirror cannot
 * swap the runtime.
 *
 * Maintainers bump the pin deliberately:
 *   node scripts/fetch-node.mjs --update-pin
 * which resolves the latest 22.x LTS (>= 22.19.0) from nodejs.org and
 * records the official SHASUMS256.txt values into the pin file, then stages
 * it. Re-runs are skipped when the pinned version is already staged.
 * @module scripts/fetch-node
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { extract } from 'tar'

/** Bootstrap payload source: fast mirror by default, bytes verified against the pin. */
const DIST_BASE = process.env.NODE_DIST_MIRROR ?? 'https://npmmirror.com/mirrors/node'
/** Trust anchor for --update-pin: always the official dist, never a mirror. */
const OFFICIAL_DIST = 'https://nodejs.org/dist'
const PIN_PATH = join(process.cwd(), 'manifest', 'node-runtime.json')
const HARNESS_ROOT = join(process.cwd(), 'resources', 'harness')
const TMP_ROOT = join(process.cwd(), 'resources', 'harness.tmp')
const DIST_NAMES = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win-arm64', 'win-x64']

const UPDATE_PIN = process.argv.includes('--update-pin')

function fail(message) {
  console.error(`fetch-node: ${message}`)
  process.exit(1)
}

/** Node dist label for the current platform/arch, e.g. darwin-arm64, win-x64. */
function distName() {
  const platform = process.platform === 'darwin' ? 'darwin'
    : process.platform === 'linux' ? 'linux'
    : process.platform === 'win32' ? 'win'
    : null
  const arch = process.arch === 'arm64' ? 'arm64'
    : process.arch === 'x64' ? 'x64'
    : null
  if (platform === null || arch === null) fail(`unsupported platform/arch: ${process.platform}/${process.arch}`)
  return `${platform}-${arch}`
}

/** True when the version tag satisfies the >= 22.19.0 engines floor. */
function atLeast22_19(tag) {
  const parts = tag.slice(1).split('.').map(Number)
  return parts.length === 3 && parts[0] === 22 && (parts[1] > 19 || (parts[1] === 19 && parts[2] >= 0))
}

async function fetchText(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`)
  return response.text()
}

async function downloadFile(url, dest) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  await writeFile(dest, buffer)
  return buffer
}

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex')

async function readPin() {
  try {
    return JSON.parse(await readFile(PIN_PATH, 'utf8'))
  } catch {
    fail(`cannot read pin file ${PIN_PATH}; restore it or run with --update-pin`)
  }
}

/**
 * Refresh the pin from the official nodejs.org dist: latest 22.x LTS plus
 * the SHASUMS256.txt entry of every supported platform archive.
 */
async function updatePin() {
  const index = JSON.parse(await fetchText(`${OFFICIAL_DIST}/index.json`))
  const version = index.find(entry =>
    typeof entry.version === 'string' && entry.version.startsWith('v22.')
    && entry.lts !== false && atLeast22_19(entry.version),
  )?.version
  if (version === undefined) fail('no Node 22.x LTS (>= 22.19.0) found in official index.json')
  const sums = await fetchText(`${OFFICIAL_DIST}/${version}/SHASUMS256.txt`)
  const hashes = {}
  for (const name of DIST_NAMES) {
    const file = `node-${version}-${name}.${name.startsWith('win') ? 'zip' : 'tar.gz'}`
    const hash = sums.split('\n')
      .map(line => line.trim().split(/\s+/))
      .find(parts => parts[1] === file)?.[0]
    if (hash === undefined) fail(`no checksum for ${file} in official SHASUMS256.txt`)
    hashes[name] = hash
  }
  const pin = {
    version,
    pinnedAt: new Date().toISOString().slice(0, 10),
    source: `${OFFICIAL_DIST}/${version}/SHASUMS256.txt`,
    comment: 'Pinned Node.js 22 LTS runtime for the bundled harness (scripts/fetch-node.mjs). Hashes are recorded from the official nodejs.org SHASUMS256.txt at pin time; mirrors only deliver bytes that must match. Bump deliberately: node scripts/fetch-node.mjs --update-pin',
    sha256: hashes,
  }
  await writeFile(PIN_PATH, `${JSON.stringify(pin, null, 2)}\n`)
  console.log(`fetch-node: pinned Node ${version} in ${PIN_PATH}`)
  return pin
}

async function main() {
  const pin = UPDATE_PIN ? await updatePin() : await readPin()
  const version = pin.version
  const name = distName()
  const expected = pin.sha256?.[name]
  if (typeof expected !== 'string') fail(`no pinned sha256 for ${name} in ${PIN_PATH}`)
  const file = `node-${version}-${name}.${name.startsWith('win') ? 'zip' : 'tar.gz'}`
  const nodeDir = join(HARNESS_ROOT, 'node')
  const nodeExecutable = join(nodeDir, 'bin', name.startsWith('win') ? 'node.exe' : 'node')
  const manifestPath = join(nodeDir, 'NODE_DIST.json')

  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      if (manifest.version === version && manifest.distName === name
        && manifest.sha256 === expected && existsSync(nodeExecutable)) {
        console.log(`fetch-node: Node ${version} for ${name} already staged, skipping`)
        return
      }
    } catch {
      // Unreadable manifest: fall through and re-stage.
    }
  }

  await rm(TMP_ROOT, { recursive: true, force: true })
  await mkdir(TMP_ROOT, { recursive: true })
  const archivePath = join(TMP_ROOT, file)
  console.log(`fetch-node: downloading ${file} (pinned ${version})`)
  const buffer = await downloadFile(`${DIST_BASE}/${version}/${file}`, archivePath)
  const actual = sha256(buffer)
  if (actual !== expected) fail(`checksum mismatch for ${file}: pinned ${expected}, got ${actual}`)

  console.log(`fetch-node: extracting ${file}`)
  if (file.endsWith('.zip')) {
    const result = spawnSync('powershell', ['-NoProfile', '-Command',
      `Expand-Archive -Force -Path '${archivePath}' -DestinationPath '${TMP_ROOT}'`], { stdio: 'inherit' })
    if (result.status !== 0) fail('zip extraction failed')
  } else {
    await extract({ file: archivePath, cwd: TMP_ROOT })
  }

  const extracted = join(TMP_ROOT, `node-${version}-${name}`)
  if (!existsSync(extracted)) fail(`expected extraction root ${extracted}`)
  await rm(nodeDir, { recursive: true, force: true })
  await rename(extracted, nodeDir)
  if (name.startsWith('win')) {
    // The Windows dist zip keeps node.exe at the archive root; the shell's
    // runtime contract (nodeBin in src/main/paths.ts) is node/bin/node.exe on
    // every platform, so move it into place.
    const rootExe = join(nodeDir, 'node.exe')
    if (!existsSync(rootExe)) fail(`expected Windows runtime at ${rootExe}`)
    await mkdir(join(nodeDir, 'bin'), { recursive: true })
    await rename(rootExe, nodeExecutable)
  } else {
    await chmod(nodeExecutable, 0o755)
  }

  await writeFile(manifestPath, `${JSON.stringify({
    version, distName: name, file, sha256: actual, fetchedAt: new Date().toISOString(),
  }, null, 2)}\n`)
  await rm(TMP_ROOT, { recursive: true, force: true })
  console.log(`fetch-node: staged Node ${version} for ${name}`)
}

main().catch(error => {
  fail(error instanceof Error ? error.message : String(error))
})
