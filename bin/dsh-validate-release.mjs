#!/usr/bin/env node
/**
 * dsh-validate-release — Standalone CLI for validating dsh-desktop release assets.
 *
 * Usage:
 *   npx dsh-validate-release <artifact-dir> <v-tag>
 *
 * Validates:
 *   - Strict 6-file manifest (DMG + DMG.sha256 + EXE + EXE.sha256 + blockmap + latest.yml)
 *   - SHA-256 checksums match
 *   - latest.yml version, path, sha512, and files list
 *   - Package version matches the tag
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateReleaseAssets, expectedAssetNames } from '../scripts/check-release-assets.mjs'

async function main() {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`dsh-validate-release — Validate dsh-desktop release assets

Usage:
  dsh-validate-release <artifact-dir> <v-tag>

Arguments:
  artifact-dir   Directory containing release assets
  v-tag          Version tag (e.g., v0.1.0-rc.6.shell.15)

Exit codes:
  0  All validations passed
  1  Validation failed

Examples:
  dsh-validate-release ./dist v0.1.0-rc.6.shell.15
  dsh-validate-release ./release-assets v0.1.0-rc.6.shell.15
`)
    process.exit(0)
  }

  const [directory, tag] = args
  if (directory === undefined || tag === undefined || !/^v\d/.test(tag)) {
    console.error('Error: usage: dsh-validate-release <artifact-dir> <v-tag>')
    console.error('       Run with --help for details.')
    process.exit(1)
  }

  const packageJson = JSON.parse(await readFile(
    new URL('../package.json', import.meta.url),
    'utf8'
  ))
  const version = tag.slice(1)
  if (packageJson.version !== version) {
    console.error(`Error: tag ${tag} does not match package version ${packageJson.version}`)
    process.exit(1)
  }

  const expected = expectedAssetNames(version)
  console.log(`Validating ${expected.length} expected assets in ${resolve(directory)}`)
  console.log(`Expected: ${expected.join(', ')}`)
  console.log()

  try {
    const count = await validateReleaseAssets(resolve(directory), version)
    console.log(`✅ release-assets: OK (${tag}, ${count} required files)`)
    process.exit(0)
  } catch (error) {
    console.error(`❌ release-assets: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
}
