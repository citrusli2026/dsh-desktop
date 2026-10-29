/**
 * Shared helpers for kernel bumps. Kept dependency-free and pure so both the
 * version tool and tests can use them without touching the network.
 * @module scripts/kernel-peers
 */
import { compareSemver } from './release-shape.mjs'

/**
 * Sync every kernel-versioned direct peer of the manifest to the new kernel
 * version: `@deepseek-ai/dsh-*` ranges that mention the old version carry it
 * into the new one (`^0.1.5-rc.1` → `^0.1.5-rc.2`). Non-kernel packages
 * (`cordis-plugin-group` follows its own line) and unprefixed helpers are
 * untouched. Mutates and returns `dependencies` for easy assertion.
 */
export function syncKernelPeerPins(dependencies, fromVersion, toVersion) {
  for (const [name, range] of Object.entries(dependencies)) {
    if (name === '@deepseek-ai/dsh') continue
    if (!name.startsWith('@deepseek-ai/dsh-')) continue
    if (typeof range === 'string' && range.includes(fromVersion)) {
      dependencies[name] = range.replaceAll(fromVersion, toVersion)
    }
  }
  return dependencies
}

/**
 * First version literal in a range: `~1.0.6-alpha.1` → `1.0.6-alpha.1`.
 * Used to compare a manifest pin against the range a new kernel peers on.
 */
export function minimumVersion(range) {
  return /\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/.exec(String(range))?.[0] ?? null
}

/**
 * Adopt the peer ranges a new kernel's app-boot declares for manifest pins
 * outside the `@deepseek-ai/dsh-*` family. The kernel peers on packages such as
 * `@deepseek-ai/cordis-plugin-group`, which follows its own line and therefore
 * is not covered by `syncKernelPeerPins`; leaving the old pin produced an
 * unmet peer on the 0.2.2-alpha.2 bump (dsh-watch issue #136). Only a strictly
 * newer required minimum replaces the pin. Mutates `dependencies` and returns
 * the names that changed.
 */
export function adoptNonDshPeerPins(dependencies, peers) {
  const changed = []
  for (const [name, range] of Object.entries(dependencies)) {
    if (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) continue
    if (typeof range !== 'string' || peers === null || typeof peers !== 'object') continue
    const required = peers[name]
    if (typeof required !== 'string') continue
    const requiredMin = minimumVersion(required)
    const currentMin = minimumVersion(range)
    if (requiredMin === null || currentMin === null) continue
    const order = compareSemver(requiredMin, currentMin)
    if (order !== null && order > 0) {
      dependencies[name] = required
      changed.push(name)
    }
  }
  return changed
}

/**
 * Peer dependency ranges a published package declares, or null when the
 * registry cannot answer (callers keep their existing pins).
 */
export async function fetchPeerDependencies(pkg, version) {
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`, {
      signal: AbortSignal.timeout(20_000),
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return null
    const body = await response.json()
    const peers = body.versions?.[version]?.peerDependencies
    return peers !== null && typeof peers === 'object' ? peers : null
  } catch {
    return null
  }
}

/**
 * Does the npm registry serve `version` of `pkg`? Not every dsh-* package
 * publishes every kernel release, so a blind range bump can name a version
 * that does not exist (found bundling 0.1.6-alpha.1). Null on any network
 * failure — callers must treat null as "unknown" and keep the old range.
 */
export async function fetchPublishedVersion(pkg, version) {
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`, {
      signal: AbortSignal.timeout(20_000),
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return null
    const body = await response.json()
    return body.versions?.[version] != null
  } catch {
    return null
  }
}

/**
 * Map of `@deepseek-ai/<pkg>` → the version the current lockfile resolved.
 * Pure helper shared by the version tool and the release-age exclude sync.
 * Lockfile keys may carry peer suffixes (`pkg@version(peer@version)`); the
 * name class stops before them so a suffix never becomes a package name.
 */
export function resolvedVersionsFromLockfile(lockfileSource) {
  const resolved = new Map()
  for (const match of lockfileSource.matchAll(/^  '?(@deepseek-ai\/[a-z0-9._-]+)@([^'(:\s]+)/gm)) {
    if (!resolved.has(match[1])) resolved.set(match[1], match[2])
  }
  return resolved
}

/**
 * Kernel packages the lockfile resolves at `version` that the workspace's
 * `minimumReleaseAgeExclude` list does not name yet. A same-day kernel bump
 * introduces transitive packages the old list never had to exempt, and
 * `pnpm install --frozen-lockfile` then rejects the whole closure for the
 * 24h supply-chain window. Pure helper so the exclude sync is testable.
 */
export function kernelExcludeAdditions(workspaceSource, lockfileSource, version) {
  const resolved = resolvedVersionsFromLockfile(lockfileSource)
  const pinned = new Set()
  for (const match of workspaceSource.matchAll(/^  - '(@deepseek-ai\/[^@']+)@([^']+)'$/gm)) {
    if (match[2] === version) pinned.add(match[1])
  }
  return [...resolved]
    .filter(([name, resolvedVersion]) => resolvedVersion === version && name.startsWith('@deepseek-ai/dsh') && !pinned.has(name))
    .map(([name]) => name)
    .sort()
}
