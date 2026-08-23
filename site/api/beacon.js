/**
 * Vercel Serverless Function — download-link beacon counter.
 *
 * Route: POST /api/beacon?source=<github|gitcode>&platform=<mac|win|linux>
 * Called fire-and-forget from the download buttons (navigator.sendBeacon).
 *
 * Storage: Upstash Redis REST (free tier). Set UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN in the Vercel project to activate; without them
 * the endpoint returns 204 and records nothing — it never blocks a click.
 *
 * Semantics: this counts official-site download-link GUIDANCE (clicks),
 * NOT CDN-side real downloads. GitCode exposes no download counters in its
 * v5 API (asset objects carry only name/type/url), so this is the only
 * self-serviceable GitCode metric; GitHub figures stay real counts.
 */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

function plausible(value, list) {
  return typeof value === 'string' && list.includes(value)
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const source = req.query.source
  const platform = req.query.platform
  if (!plausible(source, ['github', 'gitcode']) || !plausible(platform, ['mac', 'win', 'linux'])) {
    res.status(204).end()
    return
  }

  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    // Disabled mode: never turn a download link into a failing user action.
    res.status(204).end()
    return
  }

  try {
    await fetch(`${UPSTASH_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', `dl:${source}:${platform}`],
        ['INCR', `dl:${source}:total`],
      ]),
    })
  } catch (_) {
    // Fire-and-forget: a counting failure must not surface to the visitor.
  }
  res.status(204).end()
}
