#!/usr/bin/env node
/** Write the one public installer's portable sha256sum file on this runner. */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function installerName(version, platform) {
  if (platform === 'darwin') return `dsh-desktop-${version}-arm64-mac.dmg`
  if (platform === 'win32') return `dsh-desktop-setup-${version}.exe`
  throw new Error(`release installers are not published for ${platform}`)
}

export async function writeReleaseChecksum(file) {
  const bytes = await readFile(file)
  const hash = createHash('sha256').update(bytes).digest('hex')
  const output = `${file}.sha256`
  await writeFile(output, `${hash}  ${basename(file)}\n`)
  return output
}

async function main() {
  const directory = resolve(process.argv[2] ?? 'dist')
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const file = resolve(directory, installerName(packageJson.version, process.platform))
  const output = await writeReleaseChecksum(file)
  console.log(`release-checksum: wrote ${output}`)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(`release-checksum: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
