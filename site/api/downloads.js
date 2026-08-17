/**
 * Vercel Serverless Function — proxy GitHub Release download counts.
 *
 * Route: GET /api/downloads
 * Query: ?repo=owner/name (default: citrusli2026/dsh-electron-shell)
 *
 * Caches at Vercel Edge for 5 minutes (s-maxage=300).
 * On cache miss or expiration, fetches from GitHub API.
 *
 * Response:
 * {
 *   tag: "v0.1.0-rc.6.shell.15",
 *   generated_at: "2026-08-17T09:00:00Z",
 *   source: "github",
 *   assets: [
 *     { name: "...dmg", downloads: 12 },
 *     { name: "...exe", downloads: 25 }
 *   ]
 * }
 */

const DEFAULT_REPO = 'citrusli2026/dsh-electron-shell'
const CACHE_MAX_AGE = 300 // 5 minutes

function classifyAsset(name) {
  if (/^dsh-desktop-.+\.(dmg|exe)$/.test(name)) return 'installer'
  if (/^dsh-desktop-.+\.(dmg|exe)\.sha256$/.test(name)) return 'checksum'
  return null
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const repo = req.query.repo || DEFAULT_REPO

  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${repo}/releases?per_page=5`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'dsh-desktop-download-proxy',
        },
      }
    )

    if (!ghRes.ok) {
      const body = await ghRes.text()
      res.status(502).json({ error: 'GitHub API error', status: ghRes.status, body: body.slice(0, 200) })
      return
    }

    const releases = await ghRes.json()
    const latest = releases.find(r => !r.draft)

    if (!latest) {
      res.status(404).json({ error: 'No published release found' })
      return
    }

    const publicAssets = latest.assets
      .filter(a => classifyAsset(a.name) !== null)
      .map(a => ({
        name: a.name,
        downloads: a.download_count,
        kind: classifyAsset(a.name),
      }))

    const payload = {
      tag: latest.tag_name,
      generated_at: new Date().toISOString(),
      source: 'github',
      assets: publicAssets,
    }

    // Edge cache: Vercel CDN caches for 5 minutes
    res.setHeader('Cache-Control', `public, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=600`)
    res.setHeader('Content-Type', 'application/json')
    res.status(200).json(payload)

  } catch (err) {
    res.status(500).json({ error: 'Internal error', message: err.message })
  }
}
