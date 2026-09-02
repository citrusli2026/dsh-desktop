import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertPreviousTag, installerSuffix, isCurrentInstaller, parseChecksum, previousAssetPatterns } from '../scripts/download-previous-release.mjs'

test('previous release assets select one installer and its checksum per platform', () => {
  assert.deepEqual(previousAssetPatterns('darwin'), ['*.dmg', '*.dmg.sha256'])
  assert.deepEqual(previousAssetPatterns('win32'), ['*-setup-*.exe', '*-setup-*.exe.sha256'])
  assert.deepEqual(previousAssetPatterns('linux'), ['*.deb', '*.deb.sha256'])
  assert.equal(installerSuffix('darwin'), '.dmg')
  assert.equal(installerSuffix('win32'), '.exe')
  assert.equal(installerSuffix('linux'), '.deb')
})

test('previous release selection refuses a same-version overwrite fixture', () => {
  assert.equal(assertPreviousTag('v2.shell.1', 'v2.shell.0'), 'v2.shell.0')
  assert.throws(() => assertPreviousTag('v2.shell.1', 'v2.shell.1'), /previous release is required/)
  assert.throws(() => assertPreviousTag('v2.shell.1', ''), /invalid/)
})

test('current installer selection ignores stale artifacts in a reused dist directory', () => {
  const version = '0.1.2-alpha.4.shell.0'
  assert.equal(isCurrentInstaller(`dsh-desktop-${version}-arm64-mac.dmg`, version, 'darwin'), true)
  assert.equal(isCurrentInstaller('dsh-desktop-0.1.2-alpha.3.shell.0-arm64-mac.dmg', version, 'darwin'), false)
  assert.equal(isCurrentInstaller(`dsh-desktop-setup-${version}.exe`, version, 'win32'), true)
  assert.equal(isCurrentInstaller(`dsh-desktop-${version}-amd64.deb`, version, 'linux'), true)
})

test('release checksum parsing accepts standard sha256 files only', () => {
  assert.equal(parseChecksum(`${'a'.repeat(64)}  installer.dmg\n`), 'a'.repeat(64))
  assert.throws(() => parseChecksum('not-a-checksum installer.dmg'), /malformed/)
})
