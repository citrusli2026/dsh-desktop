/**
 * Windows installer content verification gate (#39/#56 families).
 *
 * Extracts the NSIS installer's inner app-64.7z and asserts that every file
 * whose absence or corruption has produced a user-facing boot failure is
 * present, then hashes the highest-risk binaries against the packaged closure
 * manifest (the same document the in-app health check verifies at runtime):
 *   - the bundled node.exe (#39: AV-damaged runtime),
 *   - the sharp native chain — .node + libvips DLLs (#56: ERR_DLOPEN_FAILED),
 *   - the closure integrity manifest itself,
 *   - shell-owned resources (mobile-shell, agent-trash-hook).
 *
 * Usage: node scripts/verify-windows-installer.mjs <installer.exe>
 * Runs on GitHub windows runners (7z.exe preinstalled) and locally with 7zz.
 * Exits non-zero on the first failed expectation.
 * @module scripts/verify-windows-installer
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let installer = process.argv[2]
if (installer === undefined || !existsSync(installer)) {
  console.error('verify-windows-installer: usage: node scripts/verify-windows-installer.mjs <installer.exe|dist-dir>')
  process.exit(2)
}
if (statSync(installer).isDirectory()) {
  const exes = readdirSync(installer).filter(name => name.endsWith('.exe') && !name.startsWith('Uninstall'))
  if (exes.length !== 1) {
    console.error(`verify-windows-installer: expected exactly one installer exe in ${installer}, found: ${exes.join(', ') || 'none'}`)
    process.exit(2)
  }
  installer = join(installer, exes[0])
  console.log(`verify-windows-installer: verifying ${exes[0]}`)
}

function findSevenZip() {
  for (const candidate of ['7z', '7zz', join(process.env.ProgramFiles ?? 'C:\\Program Files', '7-Zip', '7z.exe')]) {
    const probe = spawnSync(candidate, [], { encoding: 'utf8' })
    if (probe.error === undefined) return candidate
  }
  console.error('verify-windows-installer: 7z/7zz not found on PATH')
  process.exit(2)
}

function run7z(args, quiet = false) {
  const result = spawnSync(SEVEN_ZIP, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0 && !quiet) {
    fail(`7z ${args[0]} failed (tool=${SEVEN_ZIP}, status=${result.status}, error=${result.error?.code ?? 'none'}, stdout=${(result.stdout ?? '').length}B): ${(result.stderr ?? '').slice(0, 300)}`)
  }
  return result
}

const SEVEN_ZIP = findSevenZip()
const work = join(tmpdir(), `verify-win-installer-${Date.now()}`)
rmSync(work, { recursive: true, force: true })

try {
  // 1. The NSIS installer must carry the app payload archive. 7z preserves
  //    the internal path, so the file lands at <out>/$PLUGINSDIR/app-64.7z.
  const listing = run7z(['l', installer]).stdout
  if (!listing.includes('app-64.7z')) fail('installer does not contain $PLUGINSDIR/app-64.7z')
  run7z(['x', '-y', `-o${work}`, installer, '$PLUGINSDIR/app-64.7z'])
  const inner = join(work, '$PLUGINSDIR', 'app-64.7z')
  if (!existsSync(inner)) fail('extracting app-64.7z failed')

  // 2. Presence assertions against the inner archive listing. Windows 7z
  //    lists NSIS entries with backslashes; normalize to forward slashes so
  //    the gate behaves identically on every platform. Paths inside the
  //    payload are relative to the install root (resources/...).
  const innerListing = run7z(['l', inner]).stdout.replaceAll('\\', '/')
  const critical = [
    { label: 'app executable', path: 'dsh-desktop.exe' },
    { label: 'closure integrity manifest', path: 'resources/manifest.json' },
    { label: 'bundled node runtime', path: 'resources/harness/node/bin/node.exe' },
    { label: 'sharp JS entry', path: 'resources/harness/node_modules/sharp/package.json' },
    { label: 'sharp win32 .node binary', glob: 'resources/harness/node_modules/@img/sharp-win32-x64/lib/sharp-win32-x64-' },
    { label: 'libvips core dll', glob: 'resources/harness/node_modules/@img/sharp-win32-x64/lib/libvips-42.dll' },
    { label: 'libvips cpp dll', glob: 'resources/harness/node_modules/@img/sharp-win32-x64/lib/libvips-cpp-' },
    { label: 'mobile shell payload', path: 'resources/mobile-shell/web-artifact.json' },
    { label: 'agent trash hook', path: 'resources/agent-trash-hook/agent-trash-hook.mjs' },
  ]
  const missing = []
  for (const item of critical) {
    const ok = item.glob !== undefined ? innerListing.includes(item.glob) : innerListing.includes(` ${item.path}`)
    if (!ok) missing.push(item.label)
    console.log(`verify-windows-installer: ${ok ? 'ok     ' : 'MISSING'} ${item.label}`)
  }
  if (missing.length > 0) fail(`missing critical files: ${missing.join(', ')}`)

  // 3. Hash the highest-risk binaries against the closure manifest
  //    (manifest key = payload path minus the leading resources/).
  const extractRoot = join(work, 'payload')
  const hashed = [
    'resources/harness/node/bin/node.exe',
    'resources/harness/node_modules/@img/sharp-win32-x64/lib/sharp-win32-x64-0.35.4.node',
    'resources/harness/node_modules/@img/sharp-win32-x64/lib/libvips-42.dll',
    'resources/manifest.json',
  ]
  run7z(['x', '-y', `-o${extractRoot}`, inner, ...hashed])
  const manifest = JSON.parse(readFileSync(join(extractRoot, 'resources', 'manifest.json'), 'utf8'))
  const files = manifest.files ?? {}
  let verified = 0
  for (const relative of hashed) {
    if (relative === 'resources/manifest.json') continue
    const expected = files[relative.replace(/^resources\//, '')]
    if (typeof expected !== 'string') {
      console.log(`verify-windows-installer: warn — no manifest entry for ${relative}`)
      continue
    }
    const actual = createHash('sha256').update(readFileSync(join(extractRoot, relative))).digest('hex')
    if (actual !== expected.toLowerCase()) fail(`sha256 mismatch for ${relative}`)
    console.log(`verify-windows-installer: sha256 ok ${relative.replace(/^resources\//, '')}`)
    verified += 1
  }
  if (verified === 0) fail('closure manifest matched none of the critical files — manifest schema changed?')

  console.log(`verify-windows-installer: OK (${critical.length} critical files present, ${verified} sha256 verified)`)
} finally {
  rmSync(work, { recursive: true, force: true })
}

function fail(message) {
  console.error(`verify-windows-installer: FAIL — ${message}`)
  process.exit(1)
}
