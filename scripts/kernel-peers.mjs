/**
 * Shared helpers for kernel bumps. Kept dependency-free and pure so both the
 * version tool and tests can use them without touching the network.
 * @module scripts/kernel-peers
 */

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
 */
export function resolvedVersionsFromLockfile(lockfileSource) {
  const resolved = new Map()
  for (const match of lockfileSource.matchAll(/^  '?(@deepseek-ai\/[^'\s:]+)@([^'(:\s]+)/gm)) {
    if (!resolved.has(match[1])) resolved.set(match[1], match[2])
  }
  return resolved
}
