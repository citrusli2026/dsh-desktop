/**
 * Pure semver comparison for the composite `<dsh version>.shell.<rev>`
 * version (docs/decisions/0009), used by the macOS check-only update prompt.
 * Mirrors scripts/version.mjs's compareVer but returns `undefined` on
 * unparseable input instead of exiting — the release feed is untrusted.
 * No imports, no I/O (test/update-check.test.ts).
 * @module main/update-check
 */

interface ParsedVersion {
  base: [number, number, number]
  pre: string[] | null
}

function parseVersion(version: string): ParsedVersion | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version)
  if (match === null) return undefined
  return {
    base: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] === undefined ? null : match[4].split('.'),
  }
}

/**
 * Compare two semver strings (negative: a < b; zero: equal; positive: a > b).
 * @returns undefined when either side is not a parseable semver.
 */
export function compareVersions(a: string, b: string): number | undefined {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (pa === undefined || pb === undefined) return undefined
  for (let i = 0; i < 3; i += 1) {
    const diff = pa.base[i]! - pb.base[i]!
    if (diff !== 0) return diff
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
    const xNumeric = /^\d+$/.test(x)
    const yNumeric = /^\d+$/.test(y)
    if (xNumeric && yNumeric) {
      const diff = Number(x) - Number(y)
      if (diff !== 0) return diff
    } else if (xNumeric) return -1
    else if (yNumeric) return 1
    else if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/**
 * Whether `candidate` is a strictly newer release than `current`.
 * Unparseable input (an odd tag_name on the releases feed) is never "newer".
 */
export function isNewerVersion(current: string, candidate: string): boolean {
  const order = compareVersions(candidate, current)
  return order !== undefined && order > 0
}

/**
 * Pick the newest non-draft version from GitHub's releases-list payload.
 * Prereleases are intentionally eligible: every dsh-desktop build is a
 * prerelease until the upstream dsh version leaves RC status.
 */
export function latestPublishedVersion(payload: unknown): string | undefined {
  return latestPublishedRelease(payload)?.version
}

export interface PublishedRelease {
  version: string
  htmlUrl: string
}

/** Pick the newest eligible release together with its exact GitHub page URL. */
export function latestPublishedRelease(payload: unknown): PublishedRelease | undefined {
  if (!Array.isArray(payload)) return undefined
  let latest: PublishedRelease | undefined
  for (const item of payload) {
    if (typeof item !== 'object' || item === null) continue
    const release = item as { draft?: unknown; tag_name?: unknown; html_url?: unknown }
    if (release.draft === true || typeof release.tag_name !== 'string' || typeof release.html_url !== 'string') continue
    const candidate = release.tag_name.replace(/^v/, '')
    if (parseVersion(candidate) === undefined) continue
    let url: URL
    try {
      url = new URL(release.html_url)
    } catch {
      continue
    }
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.startsWith('/citrusli2026/dsh-electron-shell/releases/')) continue
    if (latest === undefined || compareVersions(candidate, latest.version)! > 0) {
      latest = { version: candidate, htmlUrl: url.href }
    }
  }
  return latest
}

/**
 * Split the composite `<dsh version>.shell.<rev>` version
 * (docs/decisions/0009) for display in the About surface.
 * @returns the bundled dsh version and shell revision, or undefined when the
 *   version is not composite (e.g. a plain dev version).
 */
export function splitCompositeVersion(version: string): { dsh: string; shellRev: number } | undefined {
  const match = /^(.+)\.shell\.(\d+)$/.exec(version)
  if (match === null || match[1] === undefined || match[2] === undefined) return undefined
  // The dsh part must itself be a semver; mirrors scripts/release-shape.mjs's
  // parseCompositeVersion so the About surface and the release tooling can
  // never disagree about what counts as a composite version.
  if (parseVersion(match[1]) === undefined) return undefined
  return { dsh: match[1], shellRev: Number(match[2]) }
}
