import { test } from 'node:test'
import assert from 'node:assert/strict'
import { builtinEditionCatalog, normalizeEditionManifest } from '../src/main/edition-catalog.ts'

test('built-in Edition catalog separates official runtime from community desktop apps', () => {
  const catalog = builtinEditionCatalog('linux')
  assert.equal(catalog.find(edition => edition.id === 'official-dsh-runtime')?.kind, 'official-runtime')
  assert.equal(catalog.find(edition => edition.id === 'qufei-dsh-desktop')?.kind, 'community-desktop')
  assert.equal(catalog.find(edition => edition.id === 'official-dsh-runtime')?.runtimePackage, '@deepseek-ai/dsh')
  assert.ok(catalog.every(edition => edition.isolation.includes('L1-data')))
  assert.ok(catalog.every(edition => edition.source.startsWith('https://')))
})

test('Edition manifest validation rejects unsafe or incomplete entries', () => {
  const base = {
    id: 'local-test',
    name: 'Local test',
    publisher: 'Tester',
    kind: 'community-desktop' as const,
    trust: 'community-unverified' as const,
    installMode: 'local-import' as const,
    homepage: 'https://example.test/home',
    source: 'https://example.test/source',
    platforms: ['linux' as const],
    isolation: ['L1-data' as const],
  }
  assert.deepEqual(normalizeEditionManifest(base)?.id, 'local-test')
  assert.equal(normalizeEditionManifest({ ...base, source: 'file:///tmp/app' }), undefined)
  assert.equal(normalizeEditionManifest({ ...base, isolation: ['L2-process'] }), undefined)
  assert.equal(normalizeEditionManifest({ ...base, id: '../escape' }), undefined)
})
