/**
 * Vercel Serverless Function — proxy GitHub Release download counts.
 *
 * Route: GET /api/downloads
 * Caches at Vercel Edge for 5 minutes (s-maxage=300).
 *
 * Security: repo is hardcoded to prevent SSRF. Only the owning repository's
 * public release metadata is ever proxied; no user-supplied repo parameter
 * is accepted.
 */

const REPO = 'citrusli2026/dsh-electron-shell'
const CACHE_MAX_AGE = 300

function classifyAsset(name) {
  if (/^dsh-desktop-.+\.(dmg|exe)$/.test(name)) return 'installer'
  if (/^dsh-desktop-.+\.(dmg|exe)\.sha256$/.test(name)) return 'checksum'
  return null
}

module.exports = async function handler(req, res) {
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

  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${REPO}/releases?per_page=5`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'dsh-desktop-download-proxy',
        },
      }
    )

    if (!ghRes.ok) {
      res.status(502).json({ error: 'GitHub API error', status: ghRes.status })
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

    res.setHeader('Cache-Control', `public, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=600`)
    res.setHeader('Content-Type', 'application/json')
    res.status(200).json({
      tag: latest.tag_name,
      generated_at: new Date().toISOString(),
      source: 'github',
      assets: publicAssets,
    })
  } catch (err) {
    res.status(500).json({ error: 'Internal error' })
  }
}
