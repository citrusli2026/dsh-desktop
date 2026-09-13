/**
 * Advisory kernel-compatibility check for community plugins. Plugins declare
 * `@deepseek-ai/dsh-*` peer ranges, but the ecosystem's declarations are
 * unreliable in both directions (stale under-declarations and optimistic
 * over-declarations), so the verdict never blocks an install — it only feeds
 * an advisory line into the health check and diagnostics.
 * @module plugin-compat
 */

import { compareSemver, parseSemver } from '../../scripts/release-shape.mjs'

/** npm prerelease gate: a prerelease candidate only satisfies a comparator
 * whose bound shares its [major, minor, patch] tuple. */
function comparatorAllowsPrerelease(bound: string, candidateBase: string): boolean {
  const parsed = parseSemver(bound)
  if (parsed === null || parsed.pre === null) return false
  return parsed.base.join('.') === candidateBase
}

/** Does one space-separated comparator clause cover `version`? Supports the
 * subset the plugin ecosystem actually declares: `^`, `~`, `>=`, `>`, `<=`,
 * `<`, and exact versions, each with optional prereleases. */
function clauseCovers(clause: string, version: string): boolean {
  const candidate = parseSemver(version)
  if (candidate === null) return false
  const candidateBase = candidate.base.join('.')
  const tokens = clause.trim().split(/\s+/).filter(token => token !== '' && token !== '||')
  if (tokens.length === 0) return true
  for (const token of tokens) {
    const match = /^(\^|~|>=|>|<=|<)?(.+)$/.exec(token)
    if (match === null) return false
    const operator = match[1] ?? ''
    const rawBound = match[2] ?? ''
    if (rawBound === '') return false
    const bound = parseSemver(rawBound)
    if (bound === null) return false
    const order = compareSemver(version, rawBound)
    if (order === null) return false
    let ok: boolean
    if (operator === '^') {
      // npm caret semantics: left-most non-zero segment is locked.
      const [maj, min, pat] = bound.base
      const upper = maj > 0 ? `${maj + 1}.0.0` : min > 0 ? `0.${min + 1}.0` : `0.0.${pat + 1}`
      const upperOrder = compareSemver(version, upper)
      ok = upperOrder !== null && upperOrder < 0 && order >= 0
    } else if (operator === '~') {
      const upper = `${bound.base[0]}.${bound.base[1] + 1}.0`
      const upperOrder = compareSemver(version, upper)
      ok = upperOrder !== null && upperOrder < 0 && order >= 0
    } else if (operator === '>=') ok = order >= 0
    else if (operator === '>') ok = order > 0
    else if (operator === '<=') ok = order <= 0
    else if (operator === '<') ok = order < 0
    else ok = order === 0
    if (!ok) return false
  }
  if (candidate.pre !== null) {
    // A prerelease candidate must share its tuple with at least one bound
    // that itself carries a prerelease (0.1.2-rc.1 inside ^0.1.2-alpha.2).
    return tokens.some(token => {
      const match = /^(\^|~|>=|>|<=|<)?(.+)$/.exec(token)
      const rawBound = match?.[2] ?? ''
      return comparatorAllowsPrerelease(rawBound, candidateBase)
    })
  }
  return true
}

/** npm range semantics (OR of comparator clauses) restricted to the subset
 * plugins actually declare. */
export function rangeCoversKernel(range: string, kernelVersion: string): boolean {
  return String(range)
    .split('||')
    .some(clause => clauseCovers(clause, kernelVersion))
}

export interface KernelCompatVerdict {
  /** The plugin declares at least one `@deepseek-ai/dsh-*` peer range. */
  declared: boolean
  /** Whether the declared ranges cover the bundled kernel version. */
  covers: boolean
}

/**
 * Compare a plugin's declared `@deepseek-ai/dsh-*` peer ranges against the
 * bundled kernel. `declared: false` means the plugin declares no kernel
 * peers (nothing to check).
 */
export function kernelCompatAdvisory(peerDependencies: Record<string, string> | undefined, kernelVersion: string): KernelCompatVerdict {
  const ranges = Object.entries(peerDependencies ?? {})
    .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
    .map(([, range]) => range)
    .filter(range => range !== '')
  if (ranges.length === 0) return { declared: false, covers: true }
  return { declared: true, covers: ranges.some(range => rangeCoversKernel(range, kernelVersion)) }
}
