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
 * Usage (CLI):
 *   GITCODE_TOKEN=… GITCODE_REPO=owner/repo node scripts/gitcode-upload.mjs <tag> <file...>
 *
 * Programmatic (used by scripts/mirror-gitcode.mjs):
 *   import { uploadGitCodeAssets } from './gitcode-upload.mjs'
 * @module scripts/gitcode-upload
 */
import { execFile } from 'node:child_process'
import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

const ATTEMPTS = 3

export async function getUploadTarget(api, tag, name, token) {
  const metaResponse = await fetch(
    `${api}/releases/${encodeURIComponent(tag)}/upload_url?file_name=${encodeURIComponent(name)}`,
    { headers: { 'PRIVATE-TOKEN': token } })
  if (!metaResponse.ok) throw new Error(`upload_url for ${name} -> HTTP ${metaResponse.status}`)
  const { url, headers } = await metaResponse.json()
  if (typeof url !== 'string' || headers === undefined) throw new Error(`upload_url for ${name}: unexpected response shape`)
  return { url, headers }
}

async function putFile(path, { url, headers }) {
  // PUT via curl: Node fetch(undici) caps response-header wait at 300s, which a
  // ~200MB upload to OBS can exceed before the server answers. The outer
  // timeout must leave one full attempt room: cross-border OBS runs at
  // ~150 KB/s, so the largest installer (~242 MB) needs ~27 min; the 21 min
  // cap used to cut such transfers short on every attempt and the files never
  // landed (observed shell.10 backfill: three installers, zero completions).
  const args = ['-sfS', '--max-time', '1800', '-o', '/dev/null', '-T', path]
  for (const [key, value] of Object.entries(headers)) args.push('-H', `${key}: ${value}`)
  args.push(url)
  try {
    await execFileP('curl', args, { maxBuffer: 4 * 1024 * 1024, timeout: 33 * 60_000 })
  } catch (error) {
    throw new Error(String(error.stderr || error.message).slice(0, 300))
  }
}

async function uploadOne(api, tag, token, path) {
  const name = path.split('/').pop()
  const sizeMb = Math.round(statSync(path).size / 1024 / 1024)
  let lastError = 'unknown'
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const target = await getUploadTarget(api, tag, name, token) // fresh signature per attempt
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

/**
 * Upload every given file to the GitCode release, smallest first (a slow
 * run should land checksums before the big binaries). Never rejects; the
 * result carries the failed file names.
 */
export async function uploadGitCodeAssets({ token, repo, tag, files }) {
  const api = `https://api.gitcode.com/api/v5/repos/${repo}`
  const failed = []
  const ordered = [...files].sort((a, b) => statSync(a).size - statSync(b).size)
  for (const file of ordered) {
    if (!(await uploadOne(api, tag, token, file))) failed.push(file)
  }
  return { ok: failed.length === 0, failed }
}

function main() {
  const token = process.env.GITCODE_TOKEN
  const repo = process.env.GITCODE_REPO
  const [tag, ...files] = process.argv.slice(2)
  if (!token || !repo || !tag || files.length === 0) {
    console.error('usage: GITCODE_TOKEN=… GITCODE_REPO=owner/repo node scripts/gitcode-upload.mjs <tag> <file...>')
    process.exit(1)
  }
  uploadGitCodeAssets({ token, repo, tag, files }).then(({ ok, failed }) => {
    if (!ok) {
      console.error(`gitcode-upload: ${failed.length}/${files.length} file(s) failed for ${tag}`)
      process.exit(1)
    }
    console.log(`gitcode-upload: all ${files.length} file(s) uploaded for ${tag}`)
  }).catch(error => {
    console.error(`gitcode-upload: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
}
