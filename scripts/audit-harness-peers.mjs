/**
 * Audit the deployed harness closure for unsatisfied non-optional peer
 * dependencies. pnpm deploy runs with auto-install-peers=false (the closure
 * must be explicit), so every peer a closure package actually declares must
 * be listed as a direct dependency of manifest/harness/package.json or be
 * present transitively; anything else is a runtime `ERR_MODULE_NOT_FOUND`.
 * @module scripts/audit-harness-peers
 */
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = process.cwd()
const MODULES = join(ROOT, 'resources', 'harness', 'node_modules')
const SCOPES = new Set(['@deepseek-ai', '@agentclientprotocol', '@earendil-works', '@google', '@koromix', '@img', '@electron', '@types'])

async function collectPackages(dir) {
  const packages = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.bin') continue
    if (entry.isDirectory()) {
      if (entry.name.startsWith('@') && !SCOPES.has(entry.name)) continue
      const sub = join(dir, entry.name)
      const manifestPath = join(sub, 'package.json')
      if (existsSync(manifestPath)) packages.push(sub)
      if (entry.name.startsWith('@')) packages.push(...await collectPackages(sub))
    }
  }
  return packages
}

async function main() {
  if (!existsSync(MODULES)) throw new Error('closure not deployed; run pnpm run deploy-harness first')
  const missing = new Map()
  for (const pkgDir of await collectPackages(MODULES)) {
    const manifest = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8'))
    const name = manifest.name
    const peers = manifest.peerDependencies ?? {}
    const optional = manifest.peerDependenciesMeta ?? {}
    for (const [peer, range] of Object.entries(peers)) {
      if (optional[peer]?.optional === true) continue
      const present = existsSync(join(MODULES, peer, 'package.json'))
        || existsSync(join(MODULES, peer.replace('/', '__'), 'package.json'))
      if (!present) {
        if (!missing.has(peer)) missing.set(peer, new Set())
        missing.get(peer).add(`${name} wants ${peer}@${range}`)
      }
    }
  }
  if (missing.size === 0) {
    console.log('audit-harness-peers: closure satisfied, no missing non-optional peers')
    return
  }
  console.error('audit-harness-peers: missing non-optional peers (add them to manifest/harness/package.json):')
  for (const [peer, wanters] of [...missing.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.error(`  ${peer}\n${[...wanters].map(w => `    <- ${w}`).join('\n')}`)
  }
  process.exit(1)
}

main().catch(error => {
  console.error('audit-harness-peers:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
