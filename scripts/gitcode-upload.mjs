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

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

const API = `https://api.gitcode.com/api/v5/repos/${REPO}`

async function uploadOne(path) {
  const name = path.split('/').pop()
  const metaResponse = await fetch(
    `${API}/releases/${encodeURIComponent(tag)}/upload_url?access_token=${TOKEN}&file_name=${encodeURIComponent(name)}`)
  if (!metaResponse.ok) throw new Error(`upload_url for ${name} -> HTTP ${metaResponse.status}`)
  const { url, headers } = await metaResponse.json()
  if (typeof url !== 'string' || headers === undefined) throw new Error(`upload_url for ${name}: unexpected response shape`)

  // PUT via curl: Node fetch(undici) caps response-header wait at 300s, which a
  // ~200MB upload to OBS can exceed before the server answers.
  const args = ['-sfS', '--max-time', '1200', '-T', path]
  for (const [key, value] of Object.entries(headers)) args.push('-H', `${key}: ${value}`)
  args.push(url)
  try {
    await execFileP('curl', args, { maxBuffer: 4 * 1024 * 1024, timeout: 21 * 60_000 })
  } catch (error) {
    throw new Error(`PUT ${name} failed: ${String(error.stderr || error.message).slice(0, 300)}`)
  }
  const { statSync } = await import('node:fs')
  console.log(`gitcode-upload: ${name} uploaded (${Math.round(statSync(path).size / 1024 / 1024)}M)`)
}

for (const file of files) {
  await uploadOne(file)
}
