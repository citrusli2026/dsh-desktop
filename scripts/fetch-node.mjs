/**
 * Stage the bundled Node.js runtime for the harness child process
 * (docs/decisions/0002): pick the latest 22.x LTS (>= 22.19.0) for the
 * current platform/arch from nodejs.org, verify it against the official
 * SHASUMS256.txt, extract it to resources/harness/node/, and record a
 * provenance manifest. Re-runs are skipped when the same version is staged.
 * @module scripts/fetch-node
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { extract } from 'tar'

const DIST_BASE = process.env.NODE_DIST_MIRROR ?? 'https://npmmirror.com/mirrors/node'
const HARNESS_ROOT = join(process.cwd(), 'resources', 'harness')
const TMP_ROOT = join(process.cwd(), 'resources', 'harness.tmp')

function fail(message) {
  console.error(`fetch-node: ${message}`)
  process.exit(1)
}

/** Node dist label for the current platform/arch, e.g. darwin-arm64. */
function distName() {
  const platform = process.platform === 'darwin' ? 'darwin'
    : process.platform === 'linux' ? 'linux'
    : process.platform === 'win32' ? 'win32'
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

async function main() {
  const name = distName()
  const archiveExt = name.startsWith('win32') ? 'zip' : 'tar.gz'
  const index = JSON.parse(await fetchText(`${DIST_BASE}/index.json`))
  const version = index.find(entry =>
    typeof entry.version === 'string' && entry.version.startsWith('v22.')
    && entry.lts !== false && atLeast22_19(entry.version),
  )?.version
  if (version === undefined) fail('no Node 22.x LTS (>= 22.19.0) found in index.json')
  const file = `node-${version}-${name}.${archiveExt}`
  const nodeDir = join(HARNESS_ROOT, 'node')
  const nodeExecutable = join(nodeDir, 'bin', name.startsWith('win32') ? 'node.exe' : 'node')
  const manifestPath = join(nodeDir, 'NODE_DIST.json')

  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      if (manifest.version === version && manifest.distName === name && existsSync(nodeExecutable)) {
        console.log(`fetch-node: Node ${version} for ${name} already staged, skipping`)
        return
      }
    } catch {
      // Unreadable manifest: fall through and re-stage.
    }
  }

  const sums = await fetchText(`${DIST_BASE}/${version}/SHASUMS256.txt`)
  const expected = sums.split('\n')
    .map(line => line.trim().split(/\s+/))
    .find(parts => parts[1] === file)?.[0]
  if (expected === undefined) fail(`no checksum for ${file} in SHASUMS256.txt`)

  await rm(TMP_ROOT, { recursive: true, force: true })
  await mkdir(TMP_ROOT, { recursive: true })
  const archivePath = join(TMP_ROOT, file)
  console.log(`fetch-node: downloading ${file}`)
  const buffer = await downloadFile(`${DIST_BASE}/${version}/${file}`, archivePath)
  const actual = sha256(buffer)
  if (actual !== expected) fail(`checksum mismatch for ${file}: expected ${expected}, got ${actual}`)

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
  if (!name.startsWith('win32')) await chmod(nodeExecutable, 0o755)

  await writeFile(manifestPath, `${JSON.stringify({
    version, distName: name, file, sha256: actual, fetchedAt: new Date().toISOString(),
  }, null, 2)}\n`)
  await rm(TMP_ROOT, { recursive: true, force: true })
  console.log(`fetch-node: staged Node ${version} for ${name}`)
}

main().catch(error => {
  fail(error instanceof Error ? error.message : String(error))
})
