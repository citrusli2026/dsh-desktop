import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, splitCompositeVersion, latestPublishedRelease } from '../src/main/update-check.ts'
// @ts-expect-error Dependency-free CI scripts intentionally stay plain ESM JavaScript.
import * as shape from '../scripts/release-shape.mjs'

/**
 * Parity suite: the TS side (update-check.ts, used by the macOS update prompt
 * and the About surface) must agree with the canonical release vocabulary in
 * scripts/release-shape.mjs. A drift here means the app displays versions
 * differently from the tooling that produces them.
 */

test('compareVersions agrees with release-shape compareSemver', () => {
  const pairs: ReadonlyArray<readonly [string, string]> = [
    ['0.1.0', '0.1.0'],
    ['0.1.0', '0.1.1'],
    ['0.1.1', '0.1.0'],
    ['0.1.0-rc.1', '0.1.0'],
    ['0.1.0', '0.1.0-rc.1'],
    ['0.1.0-rc.2', '0.1.0-rc.1'],
    ['0.1.0-rc.9', '0.1.0-rc.10'],
    ['0.1.0-alpha.1', '0.1.0-beta.1'],
    ['1.0.0', '0.9.9'],
    ['not-a-version', '0.1.0'],
    ['0.1.0', 'garbage'],
  ]
  for (const [a, b] of pairs) {
    const ts = compareVersions(a, b)
    const canonical = shape.compareSemver(a, b)
    // undefined and null both mean "unparseable"; every other value must match.
    assert.equal(ts === undefined ? null : ts, canonical, `compareVersions(${a}, ${b})`)
  }
})

test('splitCompositeVersion agrees with release-shape parseCompositeVersion', () => {
  const versions = [
    '0.1.1-rc.2.shell.0',
    '1.0.0.shell.12',
    '0.1.0.shell.1',
    '0.1.1-rc.2.shell.0.shell.1',
    'plain-version',
    '0.1.0.shell.x',
    '0.1.0.shell.0.shell.1',
  ]
  for (const version of versions) {
    const ts = splitCompositeVersion(version)
    const canonical = shape.parseCompositeVersion(version)
    const expected = canonical === null
      ? undefined
      : { dsh: canonical.dsh, shellRev: canonical.rev }
    assert.deepEqual(ts, expected, `splitCompositeVersion(${version})`)
  }
})

test('latestPublishedRelease picks the same winner release-shape would', () => {
  const payload = [
    { draft: false, tag_name: 'v0.1.0-rc.8.shell.2', html_url: 'https://github.com/citrusli2026/dsh-electron-shell/releases/tag/v0.1.0-rc.8.shell.2' },
    { draft: false, tag_name: 'v0.1.1-rc.2.shell.0', html_url: 'https://github.com/citrusli2026/dsh-electron-shell/releases/tag/v0.1.1-rc.2.shell.0' },
    { draft: false, tag_name: 'v0.1.1-rc.2.shell.1', html_url: 'https://github.com/citrusli2026/dsh-electron-shell/releases/tag/v0.1.1-rc.2.shell.1' },
    { draft: true, tag_name: 'v9.9.9.shell.9', html_url: 'https://github.com/citrusli2026/dsh-electron-shell/releases/tag/v9.9.9.shell.9' },
  ]
  const winner = latestPublishedRelease(payload)
  assert.ok(winner !== undefined)
  const [, shellRev] = winner.version.split('.shell.')
  assert.equal(shellRev, '1')
  const composite = shape.parseCompositeVersion(winner.version)
  assert.ok(composite !== null)
  assert.equal(composite.rev, 1)
})

test('classifyPublicAsset covers the tooling asset vocabulary', () => {
  const version = '0.1.1-rc.2.shell.0'
  for (const name of shape.expectedAssetNames(version)) {
    if (name.endsWith('.sha256')) assert.equal(shape.classifyPublicAsset(name), 'checksum', name)
    else if (name.endsWith('.blockmap') || name === 'latest.yml') assert.equal(shape.classifyPublicAsset(name), null, name)
    else assert.equal(shape.classifyPublicAsset(name), 'installer', name)
  }
  assert.equal(shape.classifyPublicAsset('random-file.txt'), null)
})
