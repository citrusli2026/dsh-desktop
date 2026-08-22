import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
// @ts-expect-error Dependency-free CI scripts intentionally stay plain ESM JavaScript.
import { expectedAssetNames, validateReleaseAssets } from '../scripts/check-release-assets.mjs'
// @ts-expect-error Dependency-free CI scripts intentionally stay plain ESM JavaScript.
import { installerNames, writeReleaseChecksum } from '../scripts/write-release-checksum.mjs'

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version as string

test('release contract has three platforms of installers, hashes, and Windows updater metadata', () => {
  assert.deepEqual(expectedAssetNames(VERSION), [
    `dsh-desktop-${VERSION}-arm64-mac.dmg`,
    `dsh-desktop-${VERSION}-arm64-mac.dmg.sha256`,
    `dsh-desktop-setup-${VERSION}.exe`,
    `dsh-desktop-setup-${VERSION}.exe.sha256`,
    `dsh-desktop-setup-${VERSION}.exe.blockmap`,
    'latest.yml',
    `dsh-desktop-${VERSION}-x64.deb`,
    `dsh-desktop-${VERSION}-x64.deb.sha256`,
    `dsh-desktop-${VERSION}-x64.AppImage`,
    `dsh-desktop-${VERSION}-x64.AppImage.sha256`,
  ])
  assert.deepEqual(installerNames(VERSION, 'darwin'), [`dsh-desktop-${VERSION}-arm64-mac.dmg`])
  assert.deepEqual(installerNames(VERSION, 'win32'), [`dsh-desktop-setup-${VERSION}.exe`])
  assert.deepEqual(installerNames(VERSION, 'linux'), [
    `dsh-desktop-${VERSION}-x64.deb`,
    `dsh-desktop-${VERSION}-x64.AppImage`,
  ])
})

test('checksum writer and release validator reject missing, extra, or changed assets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-release-assets-'))
  try {
    const installers = (expectedAssetNames(VERSION) as string[])
      .filter(name => name.endsWith('.dmg') || name.endsWith('.exe') || name.endsWith('.deb') || name.endsWith('.AppImage'))
    for (const installer of installers) {
      const file = join(directory, installer)
      await writeFile(file, `fixture:${installer}`)
      await writeReleaseChecksum(file)
    }
    await writeFile(join(directory, `dsh-desktop-setup-${VERSION}.exe.blockmap`), 'blockmap-fixture')
    const windowsInstaller = `dsh-desktop-setup-${VERSION}.exe`
    const windowsSha512 = createHash('sha512').update(`fixture:${windowsInstaller}`).digest('base64')
    await writeFile(join(directory, 'latest.yml'), [
      `version: ${VERSION}`,
      'files:',
      `  - url: ${windowsInstaller}`,
      `    sha512: ${windowsSha512}`,
      `path: ${windowsInstaller}`,
      `sha512: ${windowsSha512}`,
      '',
    ].join('\n'))
    assert.equal(await validateReleaseAssets(directory, VERSION), 10)

    await writeFile(join(directory, 'latest.yml'), [
      `version: ${VERSION}`,
      'files:',
      `  - url: ${windowsInstaller}`,
      `    sha512: ${windowsSha512}`,
      `path: ${windowsInstaller}`,
      '',
    ].join('\n'))
    await assert.rejects(validateReleaseAssets(directory, VERSION), /missing a top-level sha512/)

    await writeFile(join(directory, 'latest.yml'), [
      `version: ${VERSION}`,
      'files:',
      `  - url: other.exe`,
      `    sha512: ${windowsSha512}`,
      `path: ${windowsInstaller}`,
      `sha512: ${windowsSha512}`,
      '',
    ].join('\n'))
    await assert.rejects(validateReleaseAssets(directory, VERSION), /does not contain a hashed entry/)

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
