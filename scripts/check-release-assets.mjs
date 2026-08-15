#!/usr/bin/env node
/** Validate two large installers plus hashes and required Windows updater metadata. */
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function expectedAssetNames(version) {
  const macInstaller = `dsh-desktop-${version}-arm64-mac.dmg`
  const windowsInstaller = `dsh-desktop-setup-${version}.exe`
  return [
    macInstaller,
    `${macInstaller}.sha256`,
    windowsInstaller,
    `${windowsInstaller}.sha256`,
    `${windowsInstaller}.blockmap`,
    'latest.yml',
  ]
}

export async function validateReleaseAssets(directory, version) {
  const actual = (await readdir(directory)).sort()
  const expected = expectedAssetNames(version)
  const missing = expected.filter(name => !actual.includes(name))
  const unexpected = actual.filter(name => !expected.includes(name))
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error([
      missing.length > 0 ? `missing: ${missing.join(', ')}` : '',
      unexpected.length > 0 ? `unexpected: ${unexpected.join(', ')}` : '',
    ].filter(Boolean).join('; '))
  }

  for (const installer of expected.filter(name => name.endsWith('.dmg') || name.endsWith('.exe'))) {
    const bytes = await readFile(resolve(directory, installer))
    const actualHash = createHash('sha256').update(bytes).digest('hex')
    const checksum = await readFile(resolve(directory, `${installer}.sha256`), 'utf8')
    const match = /^([a-f0-9]{64})  ([^\r\n]+)\r?\n$/.exec(checksum)
    if (match === null || match[2] !== installer) {
      throw new Error(`${installer}.sha256 has an invalid sha256sum format`)
    }
    if (match[1] !== actualHash) throw new Error(`${installer}.sha256 does not match ${installer}`)
  }

  const windowsInstaller = `dsh-desktop-setup-${version}.exe`
  const updateManifest = await readFile(resolve(directory, 'latest.yml'), 'utf8')
  if (!updateManifest.includes(windowsInstaller)) {
    throw new Error(`latest.yml does not reference ${windowsInstaller}`)
  }
  const blockmap = await readFile(resolve(directory, `${windowsInstaller}.blockmap`))
  if (blockmap.byteLength === 0) throw new Error(`${windowsInstaller}.blockmap is empty`)
  return expected.length
}

async function main() {
  const [directory, tag] = process.argv.slice(2)
  if (directory === undefined || tag === undefined || !/^v\d/.test(tag)) {
    throw new Error('usage: check-release-assets.mjs <artifact-dir> <v-tag>')
  }
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const version = tag.slice(1)
  if (packageJson.version !== version) {
    throw new Error(`tag ${tag} does not match package version ${packageJson.version}`)
  }
  const count = await validateReleaseAssets(resolve(directory), version)
  console.log(`release-assets: OK (${tag}, ${count} required files)`)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(`release-assets: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
