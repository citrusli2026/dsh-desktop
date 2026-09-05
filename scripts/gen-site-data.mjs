#!/usr/bin/env node
// gen-site-data.mjs — fetch the latest dsh-desktop release from the GitHub
// API and write site/data/release.json for the static download site.
//
// Usage:
//   node scripts/gen-site-data.mjs            # writes site/data/release.json
//   REPO=owner/name node scripts/gen-site-data.mjs
//
// Auth: set GH_TOKEN or GITHUB_TOKEN to raise the API rate limit (CI does).
// If nothing meaningful changed since the last run, the existing file (and its
// generated_at timestamp) is left untouched so `git diff` stays empty.

import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { classifyPublicAsset, SHA256_LINE } from './release-shape.mjs'

export { classifyPublicAsset } from './release-shape.mjs'

const REPO = process.env.REPO || 'citrusli2026/dsh-desktop'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'site', 'data', 'release.json')

/** GitCode mirror (华为云 CDN,国内直连);下载链接按 tag+文件名拼出并逐一验证。 */
const GITCODE_REPO = process.env.GITCODE_REPO || 'citrusli2026/dsh-desktop'
const GITCODE_BASE = `https://gitcode.com/${GITCODE_REPO}/releases/download`

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''

// GitHub connectivity from a domestic machine is unreliable and may be
// route-dependent; when GH_SOCKS5 is set (same knob as mirror-gitcode.mjs),
// route fetches through the local SOCKS proxy via curl instead of fetch().
const SOCKS = process.env.GH_SOCKS5

function curlText(url, headers) {
  const args = ['-sfSL', '--max-time', '60']
  if (SOCKS) args.push('-x', `socks5h://${SOCKS}`)
  for (const [name, value] of Object.entries(headers)) args.push('-H', `${name}: ${value}`)
  args.push(url)
  return execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

async function api(url) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'User-Agent': 'dsh-desktop-site-generator',
  }
  if (SOCKS !== undefined) return JSON.parse(curlText(url, headers))
  const res = await fetch(url, { headers })
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${url}: ${await res.text()}`)
  }
  return res.json()
}

async function readChecksum(asset) {
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'User-Agent': 'dsh-desktop-site-generator',
  }
  const text = SOCKS !== undefined
    ? curlText(asset.browser_download_url, headers)
    : await (async () => {
        const response = await fetch(asset.browser_download_url, { headers })
        if (!response.ok) throw new Error(`checksum download ${response.status} for ${asset.name}`)
        return response.text()
      })()
  const match = SHA256_LINE.exec(text)
  if (match === null || `${match[2]}.sha256` !== asset.name) throw new Error(`invalid checksum asset ${asset.name}`)
  return match[1]
}

/** GitCode redirects to a time-limited signed CDN URL; HEAD is rejected (401),
 *  so verify with a 1-byte range GET and treat 200/206 as available. */
async function verifyGitCode(url) {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0' }, redirect: 'follow' })
    await res.body?.cancel()
    return res.status === 200 || res.status === 206
  } catch {
    return false
  }
}

const [releases, repo] = await Promise.all([
  api(`https://api.github.com/repos/${REPO}/releases?per_page=100`),
  api(`https://api.github.com/repos/${REPO}`),
])

const published = releases.filter((r) => !r.draft)

const release = published
  .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))[0]

if (!release) {
  throw new Error(`no published release found for ${REPO}`)
}

// 全版本累计安装包下载（dmg + exe，排除校验/升级辅助文件），按平台分别
// 统计：最新 release 的下载数会随每个新版本归零，单看它会严重低估实际
// 使用量。
const downloadsByPlatform = published.reduce(
  (acc, r) => {
    for (const a of r.assets) {
      if (classifyPublicAsset(a.name) !== 'installer') continue
      if (a.name.endsWith('.dmg')) acc.mac += a.download_count || 0
      else if (a.name.endsWith('.exe')) acc.win += a.download_count || 0
      else acc.linux += a.download_count || 0
    }
    return acc
  },
  { mac: 0, win: 0, linux: 0 },
)

const publicAssets = release.assets.filter(a => classifyPublicAsset(a.name) !== null)

const data = {
  generated_at: new Date().toISOString(),
  repo: {
    full_name: repo.full_name,
    html_url: repo.html_url,
    stars: repo.stargazers_count,
    license: repo.license?.spdx_id ?? 'MIT',
  },
  stats: {
    installer_downloads: downloadsByPlatform.mac + downloadsByPlatform.win + downloadsByPlatform.linux,
    mac_downloads: downloadsByPlatform.mac,
    win_downloads: downloadsByPlatform.win,
    linux_downloads: downloadsByPlatform.linux,
    releases: published.length,
  },
  release: {
    tag: release.tag_name,
    name: release.name || release.tag_name,
    html_url: release.html_url,
    published_at: release.published_at,
    prerelease: release.prerelease,
    assets: await Promise.all(publicAssets.map(async (a) => {
      const gitcodeUrl = `${GITCODE_BASE}/${release.tag_name}/${a.name}`
      const kind = classifyPublicAsset(a.name)
      return {
        name: a.name,
        size: a.size,
        downloads: a.download_count,
        url: a.browser_download_url,
        kind,
        sha256: kind === 'checksum' ? await readChecksum(a) : null,
        gitcode_url: gitcodeUrl,
        gitcode_ok: await verifyGitCode(gitcodeUrl),
      }
    })),
  },
}

// Avoid commit noise: if everything except generated_at matches the existing
// file, keep the old file (and its timestamp) as-is.
let previous = null
try {
  previous = JSON.parse(await readFile(OUT, 'utf8'))
} catch {
  /* first run */
}
const strip = (o) => JSON.stringify({ ...o, generated_at: null })
if (previous && strip(previous) === strip(data)) {
  console.log(`release.json unchanged (${release.tag_name}); keeping existing file`)
  process.exit(0)
}

await mkdir(path.dirname(OUT), { recursive: true })
await writeFile(OUT, JSON.stringify(data, null, 2) + '\n')
console.log(`wrote ${path.relative(ROOT, OUT)} for ${release.tag_name} (${publicAssets.length} public assets)`)
