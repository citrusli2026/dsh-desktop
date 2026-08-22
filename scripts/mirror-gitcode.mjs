#!/usr/bin/env node
/**
 * Mirror a GitHub release's user-facing assets to GitCode from this machine
 * (docs/decisions/0008): the domestic network reaches GitCode fast, so this
 * replaces the cross-border GitHub-runner uploads (~160 KB/s, repeated
 * 20+ min attempts) with a one-command flow at domestic speed.
 *
 * Flow per asset:
 *   1. Skip when GitCode already serves the stable URL (one-byte Range GET).
 *   2. Download from GitHub — through GH_SOCKS5 (local Clash SOCKS proxy) or
 *      GH_PROXY_PREFIX when the direct connection is unreachable (the usual
 *      case in China). Verified fastest on this machine: GH_SOCKS5
 *      (127.0.0.1:7890, ~1 MB/s) beats public HTTP proxies (~200 KB/s, which
 *      also drop large files mid-download).
 *   3. Upload through the v5 upload_url flow (fresh signed PUT per attempt,
 *      small files first) — the same flow scripts/gitcode-upload.mjs uses.
 *   4. Verify the stable URL afterwards.
 * An installer's checksum is verified against its sibling .sha256 file when
 * both are in the set. The token never appears in logs or arguments.
 *
 * Usage:
 *   GITCODE_TOKEN=… GITCODE_REPO=owner/repo \
 *     [GITHUB_REPO=owner/repo] [GH_SOCKS5=127.0.0.1:7890] \
 *     node scripts/mirror-gitcode.mjs <tag>
 *
 *   GITCODE_TOKEN=… GITCODE_REPO=owner/repo \
 *     [GH_PROXY_PREFIX=https://ghproxy.net/https://github.com] \
 *     node scripts/mirror-gitcode.mjs <tag>
 *
 *   GITCODE_TOKEN=… GITCODE_REPO=owner/repo node scripts/mirror-gitcode.mjs <tag> <file...>
 *     (explicit local files: skipped download and checksum verification)
 * @module scripts/mirror-gitcode
 */
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import { uploadGitCodeAssets } from './gitcode-upload.mjs'
import { classifyPublicAsset, SHA256_LINE } from './release-shape.mjs'

const execFileP = promisify(execFile)

const GITCODE_REPO = process.env.GITCODE_REPO
const GITHUB_REPO = process.env.GITHUB_REPO ?? 'citrusli2026/dsh-electron-shell'
const GH_BASE = (process.env.GH_PROXY_PREFIX ?? 'https://github.com').replace(/\/+$/, '')
const DOWNLOAD_HEADER_BYTES = 1024

function fail(message) {
  console.error(`mirror-gitcode: ${message}`)
  process.exit(1)
}

/** One-byte Range GET against the stable GitCode URL: 200/206 = present. */
async function gitCodeHas(repo, tag, name) {
  const url = `https://gitcode.com/${repo}/releases/download/${tag}/${name}`
  try {
    const response = await fetch(url, { headers: { Range: 'bytes=0-0' }, redirect: 'follow' })
    await response.body?.cancel()
    return response.status === 200 || response.status === 206
  } catch {
    return false
  }
}

/** Download a release asset from GitHub (through GH_SOCKS5 / GH_PROXY_PREFIX when set). */
async function downloadAsset(tag, name, target) {
  const url = `${GH_BASE}/${GITHUB_REPO}/releases/download/${tag}/${name}`
  const proxyArgs = process.env.GH_SOCKS5
    ? ['--socks5-hostname', process.env.GH_SOCKS5]
    : []
  await execFileP('curl', ['-sfSL', '-C', '-', '--retry', '8', '--retry-all-errors', '--retry-delay', '5',
    '--max-time', '1200', ...proxyArgs, '-o', target, url],
  { maxBuffer: 4 * 1024 * 1024, timeout: 21 * 60_000 })
}

/** Parse a portable sha256sum line and return the hex, or null. */
function checksumHex(text) {
  return SHA256_LINE.exec(text)?.[1] ?? null
}

/**
 * Resolve the asset set: explicit local files win; otherwise the release's
 * public assets (installer + checksum per release-shape) listed in
 * site/data/release.json when its tag matches, or fetched from the GitHub
 * API otherwise.
 */
async function resolveAssetSet(tag, files) {
  if (files.length > 0) return files.map(file => ({ local: file, name: basename(file) }))
  const releaseJson = JSON.parse(await readFile(new URL('../site/data/release.json', import.meta.url), 'utf8'))
  if (releaseJson.release?.tag === tag) {
    return releaseJson.release.assets
      .filter(asset => classifyPublicAsset(asset.name) !== null)
      .map(asset => ({ name: asset.name, size: asset.size }))
  }
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${encodeURIComponent(tag)}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-electron-shell-mirror' },
  })
  if (!response.ok) throw new Error(`GitHub release ${tag} -> HTTP ${response.status}`)
  const release = await response.json()
  return release.assets
    .filter(asset => classifyPublicAsset(asset.name) !== null)
    .map(asset => ({ name: asset.name, size: asset.size }))
}

/** Ensure the GitCode release exists (idempotent); never moves an existing tag. */
async function ensureGitCodeRelease(token, repo, tag) {
  const api = `https://api.gitcode.com/api/v5/repos/${repo}`
  const headers = { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' }
  const existing = await fetch(`${api}/releases/${encodeURIComponent(tag)}`, { headers })
  if (existing.ok) {
    console.log(`mirror-gitcode: release ${tag} already exists on GitCode`)
    return
  }
  const created = await fetch(`${api}/releases`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tag_name: tag,
      name: `dsh-electron-shell ${tag}`,
      prerelease: true,
      body: `Mirrored from https://github.com/${GITHUB_REPO}/releases`,
    }),
  })
  if (!created.ok) throw new Error(`creating GitCode release ${tag} -> HTTP ${created.status}: ${(await created.text()).slice(0, 200)}`)
  console.log(`mirror-gitcode: created GitCode release ${tag}`)
}

/**
 * Verify a downloaded installer against its sibling .sha256 file when both
 * are present locally; returns the mismatch reason or null when OK/skipped.
 */
async function verifyChecksum(asset, stagedDir) {
  const checksumName = `${asset.name}.sha256`
  const installerPath = join(stagedDir, asset.name)
  const checksumPath = join(stagedDir, checksumName)
  if (!existsSync(checksumPath)) return null
  const expected = checksumHex(await readFile(checksumPath, 'utf8'))
  if (expected === null) return `${checksumName} is not a valid sha256sum line`
  const actual = createHash('sha256').update(await readFile(installerPath)).digest('hex')
  return expected === actual ? null : `${asset.name} sha256 mismatch (expected ${expected}, got ${actual})`
}

async function main() {
  const checkOnly = process.argv.includes('--check-only')
  const args = process.argv.slice(2).filter(arg => arg !== '--check-only')
  const token = process.env.GITCODE_TOKEN
  const [tag, ...explicitFiles] = args
  if ((!token || !GITCODE_REPO) && !checkOnly) {
    fail('usage: GITCODE_TOKEN=… GITCODE_REPO=owner/repo node scripts/mirror-gitcode.mjs <tag> [local files...] [--check-only]')
  }
  if (explicitFiles.length === 0 && !existsSync(new URL('../site/data/release.json', import.meta.url))) {
    fail('site/data/release.json is missing; pass explicit file paths instead')
  }

  const assets = await resolveAssetSet(tag, explicitFiles)
  if (assets.length === 0) fail(`no public assets to mirror for ${tag}`)
  console.log(`mirror-gitcode: ${assets.length} asset(s) for ${tag}: ${assets.map(a => a.name).join(', ')}`)

  if (checkOnly) {
    // Probe-only: report what GitCode already serves without touching anything.
    const probeRepo = GITCODE_REPO ?? 'citrusli2026/dsh-electron-shell'
    let present = 0
    for (const asset of assets) {
      const ok = await gitCodeHas(probeRepo, tag, asset.name)
      console.log(`mirror-gitcode: ${ok ? 'present' : 'MISSING'} ${asset.name}`)
      if (ok) present += 1
    }
    console.log(`mirror-gitcode: ${present}/${assets.length} assets present on GitCode`)
    process.exit(present === assets.length ? 0 : 1)
  }

  // Uploads do not need the release to exist first, but creating it early
  // makes the stable URLs probeable and catches tag mistakes up front.
  await ensureGitCodeRelease(token, GITCODE_REPO, tag)

  const stagedDir = await mkdtemp(join(tmpdir(), `mirror-gitcode-${tag}-`))
  const toUpload = []
  const results = []
  try {
    for (const asset of assets) {
      const name = asset.name
      if (await gitCodeHas(GITCODE_REPO, tag, name)) {
        console.log(`mirror-gitcode: skip ${name} (already mirrored)`)
        results.push({ name, status: 'skipped' })
        continue
      }
      let local = asset.local
      if (local === undefined) {
        local = join(stagedDir, name)
        console.log(`mirror-gitcode: downloading ${name} (${Math.round((asset.size ?? 0) / 1024 / 1024)}M)`)
        try {
          await downloadAsset(tag, name, local)
        } catch (error) {
          results.push({ name, status: 'failed', error: `download: ${String(error).slice(0, 200)}` })
          continue
        }
        if (asset.size !== undefined && (await stat(local)).size !== asset.size) {
          results.push({ name, status: 'failed', error: 'downloaded size does not match the release' })
          continue
        }
      }
      toUpload.push({ name, local })
    }

    if (toUpload.length > 0) {
      const { ok, failed } = await uploadGitCodeAssets({ token, repo: GITCODE_REPO, tag, files: toUpload.map(a => a.local) })
      for (const item of toUpload) {
        const name = item.name
        if (failed.includes(item.local)) {
          results.push({ name, status: 'failed', error: 'upload failed after retries' })
          continue
        }
        const checksumError = await verifyChecksum(item, stagedDir)
        if (checksumError !== null) {
          results.push({ name, status: 'failed', error: checksumError })
          continue
        }
        results.push({ name, status: 'uploaded' })
      }
      void ok
    }

    // Final public verification for every intended asset.
    let verified = 0
    for (const asset of assets) {
      const name = asset.name
      if (await gitCodeHas(GITCODE_REPO, tag, name)) {
        verified += 1
        console.log(`mirror-gitcode: verify ${name} -> OK`)
      } else {
        console.error(`mirror-gitcode: verify ${name} -> MISSING`)
      }
    }

    const failedCount = results.filter(r => r.status === 'failed').length
    const summary = results.map(r => r.status === 'failed' ? `${r.name}: ${r.error}` : `${r.name}: ${r.status}`)
    console.log(`mirror-gitcode: ${results.length - failedCount}/${results.length} assets ok, ${verified}/${assets.length} verified live`)
    if (failedCount > 0 || verified !== assets.length) {
      console.error(`mirror-gitcode: summary — ${summary.join(' | ')}`)
      process.exit(1)
    }
    console.log(`mirror-gitcode: ${tag} mirrored (${summary.join(' | ')})`)
  } finally {
    await rm(stagedDir, { recursive: true, force: true })
  }
}

main().catch(error => fail(error instanceof Error ? error.message : String(error)))
