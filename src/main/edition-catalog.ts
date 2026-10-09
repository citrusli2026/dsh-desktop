/** Curated, read-only Edition metadata for the multi-runtime Dashboard. */

export type EditionKind = 'official-runtime' | 'official-desktop' | 'community-desktop'
export type EditionTrust = 'official-verified' | 'community-verified' | 'community-unverified'
export type EditionInstallMode = 'npm-runtime' | 'github-release' | 'local-import'

export interface EditionManifest {
  id: string
  name: string
  publisher: string
  kind: EditionKind
  trust: EditionTrust
  installMode: EditionInstallMode
  homepage: string
  source: string
  platforms: readonly ('darwin' | 'win32' | 'linux')[]
  isolation: readonly ('L1-data' | 'L2-process' | 'L3-install' | 'L4-os')[]
  runtimePackage?: string
}

const HTTPS_URL = /^https:\/\/[^\s]+$/
const EDITION_ID = /^[a-z0-9][a-z0-9-]{1,63}$/

/**
 * The first catalog is intentionally small and source-linked. It is metadata,
 * not a remote install manifest: no entry grants permission to download or
 * execute a community application.
 */
export const BUILTIN_EDITION_CATALOG: readonly EditionManifest[] = [
  {
    id: 'official-dsh-runtime',
    name: 'Official dsh runtime',
    publisher: 'DeepSeek',
    kind: 'official-runtime',
    trust: 'official-verified',
    installMode: 'npm-runtime',
    homepage: 'https://github.com/deepseek-ai/deepseek-harness',
    source: 'https://registry.npmjs.org/@deepseek-ai/dsh',
    platforms: ['darwin', 'win32', 'linux'],
    isolation: ['L1-data', 'L2-process', 'L3-install'],
    runtimePackage: '@deepseek-ai/dsh',
  },
  {
    id: 'official-harness-desktop',
    name: 'Official Harness Desktop',
    publisher: 'DeepSeek',
    kind: 'official-desktop',
    trust: 'official-verified',
    installMode: 'github-release',
    homepage: 'https://github.com/deepseek-ai/deepseek-harness',
    source: 'https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/desktop',
    platforms: ['darwin', 'win32', 'linux'],
    isolation: ['L1-data', 'L2-process', 'L3-install'],
  },
  {
    id: 'qufei-dsh-desktop',
    name: 'dsh-desktop · qufei1993',
    publisher: 'qufei1993',
    kind: 'community-desktop',
    trust: 'community-verified',
    installMode: 'github-release',
    homepage: 'https://github.com/qufei1993/dsh-desktop',
    source: 'https://github.com/qufei1993/dsh-desktop/releases',
    platforms: ['darwin', 'win32', 'linux'],
    isolation: ['L1-data', 'L2-process', 'L3-install'],
  },
  {
    id: 'dsh-tauri-desktop',
    name: 'DeepSeek Harness Desktop · dsh-tauri',
    publisher: 'dsh-tauri-desk',
    kind: 'community-desktop',
    trust: 'community-verified',
    installMode: 'github-release',
    homepage: 'https://github.com/dsh-tauri-desk/deepseek-harness-desktop',
    source: 'https://github.com/dsh-tauri-desk/deepseek-harness-desktop/releases',
    platforms: ['darwin', 'win32', 'linux'],
    isolation: ['L1-data', 'L2-process', 'L3-install'],
  },
  {
    id: 'deepseek-harness-eac',
    name: 'Deepseek Harness EAC',
    publisher: 'zouyuxuan122',
    kind: 'community-desktop',
    trust: 'community-verified',
    installMode: 'github-release',
    homepage: 'https://github.com/zouyuxuan122/Deepseek-Harness-EAC',
    source: 'https://github.com/zouyuxuan122/Deepseek-Harness-EAC/releases',
    platforms: ['darwin', 'win32', 'linux'],
    isolation: ['L1-data', 'L2-process', 'L3-install'],
  },
]

function validManifest(manifest: EditionManifest): boolean {
  return EDITION_ID.test(manifest.id)
    && manifest.name.trim() !== ''
    && manifest.publisher.trim() !== ''
    && HTTPS_URL.test(manifest.homepage)
    && HTTPS_URL.test(manifest.source)
    && manifest.platforms.length > 0
    && manifest.isolation.includes('L1-data')
}

export function normalizeEditionManifest(raw: unknown): EditionManifest | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const candidate = raw as Partial<EditionManifest>
  if (candidate.kind !== 'official-runtime' && candidate.kind !== 'official-desktop' && candidate.kind !== 'community-desktop') return undefined
  if (candidate.trust !== 'official-verified' && candidate.trust !== 'community-verified' && candidate.trust !== 'community-unverified') return undefined
  if (candidate.installMode !== 'npm-runtime' && candidate.installMode !== 'github-release' && candidate.installMode !== 'local-import') return undefined
  if (!Array.isArray(candidate.platforms) || !candidate.platforms.every(platform => platform === 'darwin' || platform === 'win32' || platform === 'linux')) return undefined
  if (!Array.isArray(candidate.isolation) || !candidate.isolation.every(level => level === 'L1-data' || level === 'L2-process' || level === 'L3-install' || level === 'L4-os')) return undefined
  if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || typeof candidate.publisher !== 'string'
    || typeof candidate.homepage !== 'string' || typeof candidate.source !== 'string') return undefined
  const manifest: EditionManifest = {
    id: candidate.id,
    name: candidate.name,
    publisher: candidate.publisher,
    kind: candidate.kind,
    trust: candidate.trust,
    installMode: candidate.installMode,
    homepage: candidate.homepage,
    source: candidate.source,
    platforms: candidate.platforms,
    isolation: candidate.isolation,
    ...(typeof candidate.runtimePackage === 'string' ? { runtimePackage: candidate.runtimePackage } : {}),
  }
  return validManifest(manifest) ? manifest : undefined
}

export function builtinEditionCatalog(platform: NodeJS.Platform = process.platform): EditionManifest[] {
  return BUILTIN_EDITION_CATALOG
    .filter(edition => edition.platforms.includes(platform as 'darwin' | 'win32' | 'linux'))
    .map(edition => ({ ...edition, platforms: [...edition.platforms], isolation: [...edition.isolation] }))
}

export function builtinEdition(id: string, platform: NodeJS.Platform = process.platform): EditionManifest | undefined {
  return builtinEditionCatalog(platform).find(edition => edition.id === id)
}
