#!/usr/bin/env node
/** Validate two large installers plus hashes and required Windows updater metadata. */
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse as parseYaml } from 'yaml'

export function expectedAssetNames(version) {
  const macInstaller = `dsh-desktop-${version}-arm64-mac.dmg`
  const windowsInstaller = `dsh-desktop-setup-${version}.exe`
  const linuxDeb = `dsh-desktop-${version}-x64.deb`
  const linuxAppImage = `dsh-desktop-${version}-x64.AppImage`
  return [
    macInstaller,
    `${macInstaller}.sha256`,
    windowsInstaller,
    `${windowsInstaller}.sha256`,
    `${windowsInstaller}.blockmap`,
    'latest.yml',
    linuxDeb,
    `${linuxDeb}.sha256`,
    linuxAppImage,
    `${linuxAppImage}.sha256`,
  ]
}

function isSha512(value) {
  return typeof value === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(value)
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

  for (const installer of expected.filter(name => name.endsWith('.dmg') || name.endsWith('.exe') || name.endsWith('.deb') || name.endsWith('.AppImage'))) {
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
  let update
  try {
    update = parseYaml(updateManifest)
  } catch (error) {
    throw new Error(`latest.yml is not valid YAML: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (update === null || typeof update !== 'object' || Array.isArray(update)) {
    throw new Error('latest.yml must contain an object')
  }
  if (update.version !== version) throw new Error(`latest.yml version does not match ${version}`)
  if (update.path !== windowsInstaller) throw new Error(`latest.yml path does not reference ${windowsInstaller}`)
  if (!isSha512(update.sha512)) {
    throw new Error('latest.yml is missing a top-level sha512')
  }
  if (!Array.isArray(update.files)) throw new Error('latest.yml is missing its files list')
  const windowsEntry = update.files.find(file => file !== null && typeof file === 'object' && file.url === windowsInstaller)
  if (windowsEntry === undefined || !isSha512(windowsEntry.sha512)) {
    throw new Error(`latest.yml files list does not contain a hashed entry for ${windowsInstaller}`)
  }
  const windowsSha512 = createHash('sha512').update(await readFile(resolve(directory, windowsInstaller))).digest('base64')
  if (update.sha512 !== windowsSha512 || windowsEntry.sha512 !== windowsSha512) {
    throw new Error(`latest.yml sha512 does not match ${windowsInstaller}`)
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
