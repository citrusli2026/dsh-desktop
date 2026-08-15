#!/usr/bin/env node
// gen-site-data.mjs — fetch the latest dsh-electron-shell release from the GitHub
// API and write site/data/release.json for the static download site.
//
// Usage:
//   node scripts/gen-site-data.mjs            # writes site/data/release.json
//   REPO=owner/name node scripts/gen-site-data.mjs
//
// Auth: set GH_TOKEN or GITHUB_TOKEN to raise the API rate limit (CI does).
// If nothing meaningful changed since the last run, the existing file (and its
// generated_at timestamp) is left untouched so `git diff` stays empty.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const REPO = process.env.REPO || 'citrusli2026/dsh-electron-shell'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'site', 'data', 'release.json')

/** GitCode mirror (华为云 CDN,国内直连);下载链接按 tag+文件名拼出并逐一验证。 */
const GITCODE_REPO = process.env.GITCODE_REPO || 'citrusli2026/dsh-electron-shell'
const GITCODE_BASE = `https://gitcode.com/${GITCODE_REPO}/releases/download`

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''

async function api(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'User-Agent': 'dsh-electron-shell-site-generator',
    },
  })
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${url}: ${await res.text()}`)
  }
  return res.json()
}

function classify(name) {
  if (name.endsWith('.blockmap')) return 'blockmap'
  if (/^latest.*\.yml$/.test(name)) return 'update-meta'
  return 'installer'
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
  api(`https://api.github.com/repos/${REPO}/releases?per_page=10`),
  api(`https://api.github.com/repos/${REPO}`),
])

const release = releases
  .filter((r) => !r.draft)
  .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))[0]

if (!release) {
  throw new Error(`no published release found for ${REPO}`)
}

const data = {
  generated_at: new Date().toISOString(),
  repo: {
    full_name: repo.full_name,
    html_url: repo.html_url,
    stars: repo.stargazers_count,
    license: repo.license?.spdx_id ?? 'MIT',
  },
  release: {
    tag: release.tag_name,
    name: release.name || release.tag_name,
    html_url: release.html_url,
    published_at: release.published_at,
    prerelease: release.prerelease,
    assets: await Promise.all(release.assets.map(async (a) => {
      const gitcodeUrl = `${GITCODE_BASE}/${release.tag_name}/${a.name}`
      return {
        name: a.name,
        size: a.size,
        downloads: a.download_count,
        url: a.browser_download_url,
        kind: classify(a.name),
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
console.log(`wrote ${path.relative(ROOT, OUT)} for ${release.tag_name} (${release.assets.length} assets)`)
