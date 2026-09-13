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
