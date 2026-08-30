#!/usr/bin/env node
/** Validate the small, explicit runtime contract shipped by the desktop shell. */
import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const runtime = JSON.parse(await readFile('manifest/node-runtime.json', 'utf8'))
const failures = []

if (typeof runtime.version !== 'string' || !/^v22\.\d+\.\d+$/.test(runtime.version)) failures.push('bundled Node pin must be a Node 22 version')
if (runtime.source !== 'https://nodejs.org/dist/v22.23.2/SHASUMS256.txt') failures.push('bundled Node pin must come from the recorded Node.js 22.23.2 checksum source')
for (const platform of ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win-arm64', 'win-x64']) {
  if (typeof runtime.sha256?.[platform] !== 'string' || !/^[a-f0-9]{64}$/.test(runtime.sha256[platform])) failures.push(`missing SHA-256 pin for ${platform}`)
}
if (packageJson.engines?.node !== '^22.19.0 || >=24.0.0') failures.push('desktop Node engine contract changed without an explicit runtime review')
if (packageJson.dependencies?.dshmarket !== undefined || packageJson.devDependencies?.dshmarket !== undefined) failures.push('community plugin market must not be a desktop dependency')

if (failures.length > 0) {
  console.error(failures.map(failure => `runtime-boundary: ${failure}`).join('\n'))
  process.exitCode = 1
} else {
  console.log(`runtime-boundary: OK (Node ${runtime.version}; Electron ${packageJson.devDependencies?.electron ?? 'unknown'})`)
}
