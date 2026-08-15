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
