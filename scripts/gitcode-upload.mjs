/**
 * Upload release assets to a GitCode release (docs/decisions/0008 amendment).
 *
 * Flow per attempt: GET upload_url (returns a fresh OBS pre-signed PUT URL
 * plus the exact signed headers — including x-obs-callback, which registers
 * the object as a release attachment) → PUT the bytes with those headers
 * verbatim. Every retry re-fetches the signed URL, so a slow transfer never
 * races an expiring signature (the previous single-shot version died on 502
 * after ~18 min cross-border pushes from GitHub runners).
 *
 * Files are independent: one failure does not abort the batch; the exit code
 * reflects the final tally. The token enters the request path only inside
 * GitCode's own response and is never logged.
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
import { statSync } from 'node:fs'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

const API = `https://api.gitcode.com/api/v5/repos/${REPO}`
const ATTEMPTS = 3

async function getUploadTarget(name) {
  const metaResponse = await fetch(
    `${API}/releases/${encodeURIComponent(tag)}/upload_url?file_name=${encodeURIComponent(name)}`,
    { headers: { 'PRIVATE-TOKEN': TOKEN } })
  if (!metaResponse.ok) throw new Error(`upload_url for ${name} -> HTTP ${metaResponse.status}`)
  const { url, headers } = await metaResponse.json()
  if (typeof url !== 'string' || headers === undefined) throw new Error(`upload_url for ${name}: unexpected response shape`)
  return { url, headers }
}

async function putFile(path, { url, headers }) {
  // PUT via curl: Node fetch(undici) caps response-header wait at 300s, which a
  // ~200MB upload to OBS can exceed before the server answers.
  const args = ['-sfS', '--max-time', '1200', '-o', '/dev/null', '-T', path]
  for (const [key, value] of Object.entries(headers)) args.push('-H', `${key}: ${value}`)
  args.push(url)
  try {
    await execFileP('curl', args, { maxBuffer: 4 * 1024 * 1024, timeout: 21 * 60_000 })
  } catch (error) {
    throw new Error(String(error.stderr || error.message).slice(0, 300))
  }
}

async function uploadOne(path) {
  const name = path.split('/').pop()
  const sizeMb = Math.round(statSync(path).size / 1024 / 1024)
  let lastError = 'unknown'
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const target = await getUploadTarget(name) // fresh signature per attempt
      await putFile(path, target)
      console.log(`gitcode-upload: ${name} uploaded (${sizeMb}M, attempt ${attempt}/${ATTEMPTS})`)
      return true
    } catch (error) {
      lastError = error.message
      console.error(`gitcode-upload: ${name} attempt ${attempt}/${ATTEMPTS} failed: ${lastError}`)
    }
  }
  console.error(`gitcode-upload: ${name} FAILED after ${ATTEMPTS} attempts`)
  return false
}

let failed = 0
// Upload small files first: a cross-border run may exhaust its job timeout
// on a large installer, so checksums/updater metadata should land before
// the big binaries instead of waiting behind them.
const ordered = [...files].sort((a, b) => statSync(a).size - statSync(b).size)
for (const file of ordered) {
  if (!(await uploadOne(file))) failed++
}
if (failed > 0) {
  console.error(`gitcode-upload: ${failed}/${files.length} file(s) failed for ${tag}`)
  process.exit(1)
}
console.log(`gitcode-upload: all ${files.length} file(s) uploaded for ${tag}`)
