import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error Dependency-free CI scripts intentionally stay plain ESM JavaScript.
import { expectedAssetNames, validateReleaseAssets } from '../scripts/check-release-assets.mjs'
// @ts-expect-error Dependency-free CI scripts intentionally stay plain ESM JavaScript.
import { installerName, writeReleaseChecksum } from '../scripts/write-release-checksum.mjs'

const VERSION = '0.1.0-rc.6.shell.11'

test('release contract has two large installers, two hashes, and Windows updater metadata', () => {
  assert.deepEqual(expectedAssetNames(VERSION), [
    `dsh-desktop-${VERSION}-arm64-mac.dmg`,
    `dsh-desktop-${VERSION}-arm64-mac.dmg.sha256`,
    `dsh-desktop-setup-${VERSION}.exe`,
    `dsh-desktop-setup-${VERSION}.exe.sha256`,
    `dsh-desktop-setup-${VERSION}.exe.blockmap`,
    'latest.yml',
  ])
  assert.equal(installerName(VERSION, 'darwin'), `dsh-desktop-${VERSION}-arm64-mac.dmg`)
  assert.equal(installerName(VERSION, 'win32'), `dsh-desktop-setup-${VERSION}.exe`)
  assert.throws(() => installerName(VERSION, 'linux'), /not published/)
})

test('checksum writer and release validator reject missing, extra, or changed assets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-release-assets-'))
  try {
    const installers = (expectedAssetNames(VERSION) as string[]).filter(name => name.endsWith('.dmg') || name.endsWith('.exe'))
    for (const installer of installers) {
      const file = join(directory, installer)
      await writeFile(file, `fixture:${installer}`)
      await writeReleaseChecksum(file)
    }
    await writeFile(join(directory, `dsh-desktop-setup-${VERSION}.exe.blockmap`), 'blockmap-fixture')
    await writeFile(join(directory, 'latest.yml'), `version: ${VERSION}\npath: dsh-desktop-setup-${VERSION}.exe\n`)
    assert.equal(await validateReleaseAssets(directory, VERSION), 6)

    await writeFile(join(directory, 'latest-mac.yml'), 'not required')
    await assert.rejects(validateReleaseAssets(directory, VERSION), /unexpected: latest-mac\.yml/)
    await rm(join(directory, 'latest-mac.yml'))

    const changedInstaller = installers[0]
    assert.ok(changedInstaller)
    const changed = join(directory, changedInstaller)
    await writeFile(changed, `${await readFile(changed, 'utf8')}:changed`)
    await assert.rejects(validateReleaseAssets(directory, VERSION), /does not match/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
