/**
 * Single source of truth for the release vocabulary shared by the release
 * tooling and the app (docs/decisions/0009): composite-version parsing,
 * installer naming, public-asset classification, and checksum formats.
 *
 * Every script that names installers, parses versions, or classifies release
 * assets imports from here instead of re-implementing the rule, so a release
 * shape change (e.g. the deb-only pivot) is a one-file edit, and the parity
 * test (test/release-shape-parity.test.ts) pins the TS side (update-check.ts)
 * to this module's semantics.
 * @module scripts/release-shape
 */

/** Minimal semver parse — enough for dotted numeric + alphanumeric prereleases. */
export function parseSemver(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value)
  if (match === null) return null
  return {
    base: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] === undefined ? null : match[4].split('.'),
  }
}

/**
 * Compare two semver strings (negative: a < b; zero: equal; positive: a > b).
 * @returns null when either side is not a parseable semver.
 */
export function compareSemver(a, b) {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (pa === null || pb === null) return null
  for (let i = 0; i < 3; i += 1) {
    if (pa.base[i] !== pb.base[i]) return pa.base[i] - pb.base[i]
  }
  if (pa.pre === null && pb.pre === null) return 0
  // A release outranks any of its prereleases.
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
      const diff = Number(x) - Number(y)
      if (diff !== 0) return diff
    } else if (nx) return -1
    else if (ny) return 1
    else if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/** Is `value` a parseable semver? */
export function isSemver(value) {
  return parseSemver(value) !== null
}

/**
 * Split a composite `<dsh version>.shell.<rev>` version (docs/decisions/0009).
 * @returns the bundled dsh version and shell revision, or null when the
 *   version is not composite.
 */
export function parseCompositeVersion(version) {
  const match = /^(.+)\.shell\.(\d+)$/.exec(version)
  if (match === null || parseSemver(match[1]) === null) return null
  return { dsh: match[1], rev: Number(match[2]) }
}

/** Installer file names published for one platform (electron-builder conventions). */
export function installerNames(version, platform) {
  if (platform === 'darwin') return [`dsh-desktop-${version}-arm64-mac.dmg`]
  if (platform === 'win32') return [`dsh-desktop-setup-${version}.exe`]
  if (platform === 'linux') return [`dsh-desktop-${version}-amd64.deb`]
  throw new Error(`release installers are not published for ${platform}`)
}

/** Every asset the release gate requires for a published version. */
export function expectedAssetNames(version) {
  const mac = installerNames(version, 'darwin')[0]
  const win = installerNames(version, 'win32')[0]
  const linux = installerNames(version, 'linux')[0]
  return [
    mac,
    `${mac}.sha256`,
    win,
    `${win}.sha256`,
    `${win}.blockmap`,
    'latest.yml',
    linux,
    `${linux}.sha256`,
  ]
}

/**
 * Classify a release asset as user-facing or auxiliary.
 * @returns 'installer' | 'checksum' | null (non-public files like blockmap).
 */
export function classifyPublicAsset(name) {
  if (classifyOs(name) !== null) return 'installer'
  if (name.endsWith('.sha256') && classifyOs(name.slice(0, -'.sha256'.length)) !== null) return 'checksum'
  return null
}

/** Which platform an installer name serves, or null (names are anchored to
 *  the published dsh-desktop installer shapes). */
export function classifyOs(name) {
  if (/^dsh-desktop-.+-arm64-mac\.dmg$/.test(name)) return 'mac'
  if (/^dsh-desktop-setup-.+\.exe$/.test(name)) return 'win'
  if (/^dsh-desktop-.+\.deb$/.test(name)) return 'linux'
  return null
}

/** Format of a portable sha256sum line: "<64 hex>  <file name>". */
export const SHA256_LINE = /^([a-f0-9]{64})  ([^\r\n]+)\r?\n$/

/** Is `value` a 64-character lowercase hex SHA-256? */
export function isSha256Hex(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

/** Is `value` a base64 SHA-512 as used by electron-updater's latest.yml? */
export function isSha512Base64(value) {
  return typeof value === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(value)
}
