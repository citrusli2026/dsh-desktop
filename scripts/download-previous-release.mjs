/** Download and checksum-verify the installer referenced by current site data.
 * The site still points at the previous release while a new tag is building,
 * which makes this a deterministic cross-version upgrade fixture. */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

export function previousAssetPatterns(platform = process.platform) {
  if (platform === 'darwin') return ['*.dmg', '*.dmg.sha256']
  if (platform === 'win32') return ['*-setup-*.exe', '*-setup-*.exe.sha256']
  if (platform === 'linux') return ['*.deb', '*.deb.sha256']
  throw new Error(`unsupported upgrade platform: ${platform}`)
}

export function installerSuffix(platform = process.platform) {
  if (platform === 'darwin') return '.dmg'
  if (platform === 'win32') return '.exe'
  if (platform === 'linux') return '.deb'
  throw new Error(`unsupported upgrade platform: ${platform}`)
}

/** Linux installers are per architecture. The upgrade smoke installs the
 *  previous release on this runner, so it must pick a deb this machine can
 *  actually install; other platforms ship one installer for the OS. */
export function installerRunsHere(name, platform = process.platform, arch = process.arch) {
  if (platform !== 'linux') return true
  const suffix = arch === 'arm64' ? 'arm64' : 'amd64'
  return name.endsWith(`-${suffix}.deb`)
}

export function isCurrentInstaller(name, version, platform = process.platform) {
  // The public macOS build is Apple Silicon only (decision 0016), so the dmg
  // name carries `arm64` even though electron-builder fills ${arch} from the
  // build host: the release runner is an arm64 macOS image.
  if (platform === 'darwin') return name.endsWith(`-${version}-arm64-mac.dmg`)
  if (platform === 'win32') return name === `dsh-desktop-setup-${version}.exe`
  if (platform === 'linux') return name.startsWith(`dsh-desktop-${version}-`) && name.endsWith('.deb')
  throw new Error(`unsupported upgrade platform: ${platform}`)
}

export function parseChecksum(text) {
  const match = /^([a-f0-9]{64})\s+/i.exec(text.trim())
  if (match === null) throw new Error('previous release checksum is malformed')
  return match[1].toLowerCase()
}

export function assertPreviousTag(currentTag, previousTag, allowSameVersion = false) {
  if (!/^v\S+$/.test(previousTag)) throw new Error(`site release tag is invalid: ${previousTag}`)
  if (previousTag === currentTag && !allowSameVersion) throw new Error(`site data still points at current build ${currentTag}; a previous release is required`)
  return previousTag
}

async function sha256File(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export async function verifyPreviousInstaller(dir, platform = process.platform, arch = process.arch) {
  const suffix = installerSuffix(platform)
  const files = await readdir(dir)
  // Linux now publishes one deb per architecture, so the suffix alone is
  // ambiguous: pick the installer that could actually run here.
  const installers = files.filter(name => name.endsWith(suffix) && !name.endsWith(`${suffix}.sha256`) && installerRunsHere(name, platform, arch))
  if (installers.length !== 1) {
    throw new Error(`expected one previous ${suffix} installer for ${arch} under ${dir}, found ${installers.length} (${files.filter(name => name.endsWith(suffix)).join(', ') || 'none'})`)
  }
  const installer = resolve(dir, installers[0])
  const checksumFile = `${installer}.sha256`
  const expected = parseChecksum(await readFile(checksumFile, 'utf8'))
  const actual = await sha256File(installer)
  if (actual !== expected) throw new Error(`previous installer checksum mismatch: ${installers[0]}`)
  return installer
}

export async function downloadPreviousRelease(dir, platform = process.platform, allowSameVersion = false) {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
  const siteData = JSON.parse(await readFile('site/data/release.json', 'utf8'))
  const currentTag = `v${packageJson.version}`
  const previousTag = assertPreviousTag(currentTag, siteData.release?.tag ?? '', allowSameVersion)
  await mkdir(dir, { recursive: true })
  const args = ['release', 'download', previousTag, '--repo', siteData.repo?.full_name ?? 'citrusli2026/dsh-desktop', '--dir', dir, '--clobber']
  for (const pattern of previousAssetPatterns(platform)) args.push('--pattern', pattern)
  await execFileP('gh', args, { maxBuffer: 8 * 1024 * 1024 })
  const installer = await verifyPreviousInstaller(dir, platform, process.arch)
  console.log(`previous release: ${previousTag} -> ${installer} (SHA-256 verified)`)
  return { previousTag, installer }
}

const entry = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (entry === fileURLToPath(import.meta.url)) {
  // An unpublished branch candidate can keep the published version number.
  // Tag builds remain strict; only manual validation supplies this flag.
  await downloadPreviousRelease(resolve(process.argv[2] ?? 'test-results/previous-release'), process.platform, process.argv.includes('--allow-same-version'))
}
