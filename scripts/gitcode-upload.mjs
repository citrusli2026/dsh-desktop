/**
 * Upload release assets to a GitCode release (docs/decisions/0008 amendment).
 *
 * Flow per file: GET upload_url (returns an OBS pre-signed PUT URL plus the
 * exact signed headers — including x-obs-callback, which registers the object
 * as a release attachment) → PUT the bytes with those headers verbatim.
 * The token enters the request path only inside GitCode's own response and
 * is never logged.
 *
 * Usage:
 *   GITCODE_TOKEN=… GITCODE_REPO=owner/repo node scripts/gitcode-upload.mjs <tag> <file...>
 * @module scripts/gitcode-upload
 */
const TOKEN = process.env.GITCODE_TOKEN
const REPO = process.env.GITCODE_REPO
const [tag, ...files] = process.argv.slice(2)

if (!TOKEN || !REPO || !tag || files.length === 0) {
  console.error('usage: GITCODE_TOKEN=… GITCODE_REPO=owner/repo node scripts/gitcode-upload.mjs <tag> <file...>')
  process.exit(1)
}

const API = `https://api.gitcode.com/api/v5/repos/${REPO}`

async function uploadOne(path) {
  const name = path.split('/').pop()
  const metaResponse = await fetch(
    `${API}/releases/${encodeURIComponent(tag)}/upload_url?access_token=${TOKEN}&file_name=${encodeURIComponent(name)}`)
  if (!metaResponse.ok) throw new Error(`upload_url for ${name} -> HTTP ${metaResponse.status}`)
  const { url, headers } = await metaResponse.json()
  if (typeof url !== 'string' || headers === undefined) throw new Error(`upload_url for ${name}: unexpected response shape`)

  const { readFile } = await import('node:fs/promises')
  const body = await readFile(path)
  const put = await fetch(url, { method: 'PUT', headers, body })
  if (!put.ok) throw new Error(`PUT ${name} -> HTTP ${put.status}: ${(await put.text()).slice(0, 200)}`)
  console.log(`gitcode-upload: ${name} uploaded (${Math.round(body.length / 1024 / 1024)}M)`)
}

for (const file of files) {
  await uploadOne(file)
}
