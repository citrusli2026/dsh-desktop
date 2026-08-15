#!/usr/bin/env node
/** Validate the cross-platform release bundle before GitHub publication. */
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function expectedAssetNames(version) {
  return [
    `dsh-desktop-${version}-amd64.deb`,
    `dsh-desktop-${version}-arm64-mac.dmg`,
    `dsh-desktop-${version}-arm64-mac.dmg.blockmap`,
    `dsh-desktop-${version}-arm64-mac.zip`,
    `dsh-desktop-${version}-arm64-mac.zip.blockmap`,
    `dsh-desktop-${version}-x86_64.AppImage`,
    `dsh-desktop-setup-${version}.exe`,
    `dsh-desktop-setup-${version}.exe.blockmap`,
    'latest-linux.yml',
    'latest-mac.yml',
    'latest.yml',
  ]
}

export async function validateReleaseAssets(directory, version) {
  const names = new Set(await readdir(directory))
  const expected = expectedAssetNames(version)
  const missing = expected.filter(name => !names.has(name))
  if (missing.length > 0) throw new Error(`missing release assets: ${missing.join(', ')}`)

  const metadata = [
    ['latest.yml', `dsh-desktop-setup-${version}.exe`],
    ['latest-mac.yml', `dsh-desktop-${version}-arm64-mac.zip`],
    ['latest-linux.yml', `dsh-desktop-${version}-x86_64.AppImage`],
  ]
  for (const [file, installer] of metadata) {
    const body = await readFile(resolve(directory, file), 'utf8')
    if (!body.includes(installer)) throw new Error(`${file} does not reference ${installer}`)
  }
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
