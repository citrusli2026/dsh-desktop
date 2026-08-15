/**
 * Unit tests for the pure semver comparison behind the macOS check-only
 * update prompt (src/main/update-check.ts). The composite version
 * `<dsh>.shell.<rev>` (docs/decisions/0009) is semver: the shell revision is
 * a prerelease identifier, so `rc.6.shell.4` outranks `rc.6.shell.3`.
 * Run with `pnpm run test` (node --test; Node >= 22.19 strips the types natively).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, isNewerVersion, latestPublishedRelease, latestPublishedVersion, splitCompositeVersion } from '../src/main/update-check.ts'

test('isNewerVersion detects a newer shell revision', () => {
  assert.equal(isNewerVersion('0.1.0-rc.6.shell.3', '0.1.0-rc.6.shell.4'), true)
  assert.equal(isNewerVersion('0.1.0-rc.6.shell.3', '0.1.0-rc.6.shell.10'), true)
})

test('isNewerVersion detects a newer bundled dsh version', () => {
  assert.equal(isNewerVersion('0.1.0-rc.6.shell.3', '0.1.0-rc.7'), true)
  assert.equal(isNewerVersion('0.1.0-rc.6.shell.3', '0.2.0'), true)
})

test('isNewerVersion rejects equal, older, and unparseable candidates', () => {
  assert.equal(isNewerVersion('0.1.0-rc.6.shell.3', '0.1.0-rc.6.shell.3'), false)
  assert.equal(isNewerVersion('0.1.0-rc.6.shell.3', '0.1.0-rc.6.shell.2'), false)
  assert.equal(isNewerVersion('0.1.0-rc.6.shell.3', 'latest'), false)
  assert.equal(isNewerVersion('0.1.0-rc.6.shell.3', ''), false)
})

test('a release outranks its prereleases', () => {
  assert.equal(isNewerVersion('0.1.0-rc.6.shell.9', '0.1.0'), true)
  assert.equal(isNewerVersion('0.1.0', '0.1.0-rc.7'), false)
})

test('compareVersions orders prerelease identifiers per semver', () => {
  assert.ok(compareVersions('0.1.0-rc.6.shell.3', '0.1.0-rc.6.shell.3') === 0)
  assert.ok(compareVersions('0.1.0-rc.10', '0.1.0-rc.9')! > 0, 'numeric identifiers compare numerically')
  assert.ok(compareVersions('0.1.0-alpha', '0.1.0-alpha.1')! < 0, 'shorter prerelease set ranks lower')
  assert.ok(compareVersions('0.1.0-1', '0.1.0-alpha')! < 0, 'numeric identifiers rank below alphanumeric')
  assert.equal(compareVersions('nonsense', '0.1.0'), undefined)
})

test('splitCompositeVersion splits the About-surface version', () => {
  assert.deepEqual(splitCompositeVersion('0.1.0-rc.6.shell.4'), { dsh: '0.1.0-rc.6', shellRev: 4 })
  assert.deepEqual(splitCompositeVersion('1.2.3.shell.0'), { dsh: '1.2.3', shellRev: 0 })
  assert.equal(splitCompositeVersion('1.2.3'), undefined, 'plain versions are not composite')
  assert.equal(splitCompositeVersion('0.1.0-rc.6.shell.x'), undefined)
})

test('latestPublishedVersion includes prereleases and ignores drafts or malformed entries', () => {
  assert.equal(latestPublishedVersion([
    { tag_name: 'v0.1.0-rc.6.shell.7', draft: false, prerelease: true, html_url: 'https://github.com/citrusli2026/dsh-electron-shell/releases/tag/v0.1.0-rc.6.shell.7' },
    { tag_name: 'v0.1.0-rc.6.shell.10', draft: false, prerelease: true, html_url: 'https://github.com/citrusli2026/dsh-electron-shell/releases/tag/v0.1.0-rc.6.shell.10' },
    { tag_name: 'v9.9.9', draft: true, prerelease: false, html_url: 'https://github.com/citrusli2026/dsh-electron-shell/releases/tag/v9.9.9' },
    { tag_name: 'not-a-version', draft: false, html_url: 'https://github.com/citrusli2026/dsh-electron-shell/releases/tag/nope' },
  ]), '0.1.0-rc.6.shell.10')
  assert.equal(latestPublishedVersion({ message: 'Not Found' }), undefined)
})

test('latestPublishedRelease returns the exact trusted prerelease URL', () => {
  assert.deepEqual(latestPublishedRelease([
    { tag_name: 'v0.1.0-rc.6.shell.10', draft: false, html_url: 'https://github.com/citrusli2026/dsh-electron-shell/releases/tag/v0.1.0-rc.6.shell.10' },
    { tag_name: 'v9.9.9', draft: false, html_url: 'https://evil.example/releases/tag/v9.9.9' },
  ]), {
    version: '0.1.0-rc.6.shell.10',
    htmlUrl: 'https://github.com/citrusli2026/dsh-electron-shell/releases/tag/v0.1.0-rc.6.shell.10',
  })
})
