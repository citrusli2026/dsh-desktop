/**
 * Download and stage the Electron binary. electron@43 dropped the npm
 * postinstall script in favor of an `install-electron` bin, so the root
 * postinstall runs this instead.
 *
 * Strategy (mirror-aware, resumable, verified):
 *   1. Skip when path.txt already points at a staged dist.
 *   2. Reuse a project-local zip cache under node_modules/.cache/electron
 *      when its sha256 matches the electron package's checksums.json.
 *   3. Download with curl (retry + resume) from ELECTRON_MIRROR
 *      (default npmmirror, see .npmrc), verify sha256, extract with
 *      extract-zip, write path.txt.
 * electron-builder reuses the same dist via `electronDist` in
 * electron-builder.yml, so the zip is downloaded exactly once per version.
 * @module scripts/install-electron
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import extractZip from 'extract-zip'

const ROOT = process.cwd()
const PKG_DIR = join(ROOT, 'node_modules', 'electron')
const DIST_DIR = join(PKG_DIR, 'dist')
const CACHE_DIR = join(ROOT, 'node_modules', '.cache', 'electron')
const MIRROR = process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/'

function fail(message) {
  console.error(`install-electron: ${message}`)
  process.exit(1)
}

const platform = { darwin: 'darwin', linux: 'linux', win32: 'win32' }[process.platform]
const arch = { arm64: 'arm64', x64: 'x64' }[process.arch]
if (platform === undefined || arch === undefined) fail(`unsupported platform/arch: ${process.platform}/${process.arch}`)

const platformPath = { darwin: 'Electron.app/Contents/MacOS/Electron', linux: 'electron', win32: 'electron.exe' }[platform]

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex')

async function main() {
  if (!existsSync(PKG_DIR)) {
    console.log('install-electron: electron package not installed, skipping')
    return
  }
  const version = JSON.parse(await readFile(join(PKG_DIR, 'package.json'), 'utf8')).version
  const file = `electron-v${version}-${platform}-${arch}.zip`
  const expected = JSON.parse(await readFile(join(PKG_DIR, 'checksums.json'), 'utf8'))[file]
  if (typeof expected !== 'string') fail(`no checksum entry for ${file} in electron/checksums.json`)

  const pathTxt = join(PKG_DIR, 'path.txt')
  if (existsSync(pathTxt) && existsSync(DIST_DIR)) {
    try {
      if (readFileSync(pathTxt, 'utf8').trim() === platformPath) {
        console.log(`install-electron: Electron ${version} already staged, skipping`)
        return
      }
    } catch {
      // Fall through and re-stage.
    }
  }

  await mkdir(CACHE_DIR, { recursive: true })
  const zipPath = join(CACHE_DIR, file)
  const url = `${MIRROR}v${version}/${file}`

  let cached = false
  if (existsSync(zipPath)) {
    cached = sha256(await readFile(zipPath)) === expected
  }
  if (!cached) {
    console.log(`install-electron: downloading ${url}`)
    const tmpPath = `${zipPath}.part`
    rmSync(tmpPath, { force: true })
    const result = spawnSync('curl', [
      '-fL', '--retry', '5', '--retry-all-errors', '--retry-delay', '2',
      '-C', '-', '-o', tmpPath, url,
    ], { stdio: 'inherit' })
    if (result.status !== 0) fail(`curl exited ${String(result.status)}`)
    if (sha256(await readFile(tmpPath)) !== expected) fail(`checksum mismatch for ${file}`)
    await rename(tmpPath, zipPath)
  } else {
    console.log(`install-electron: reusing cached ${file}`)
  }

  console.log('install-electron: extracting electron dist')
  rmSync(DIST_DIR, { recursive: true, force: true })
  await extractZip(zipPath, { dir: DIST_DIR })
  await writeFile(pathTxt, platformPath)
  console.log(`install-electron: staged Electron ${version} at ${DIST_DIR}`)
}

main().catch(error => {
  fail(error instanceof Error ? error.stack ?? error.message : String(error))
})
