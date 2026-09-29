#!/usr/bin/env node
/**
 * Mirror a GitHub release's user-facing assets to GitCode through the
 * web-api v2 pipeline — the one the GitCode web UI itself uses.
 *
 * WHY THIS EXISTS (2026-09-20 incident, root-caused 2026-09-28/29):
 * the legacy v5 flow (api.gitcode.com, PRIVATE-TOKEN — scripts/mirror-gitcode.mjs
 * and gitcode-backfill.yml) reports success but NEVER persists the object:
 * the release lists the asset while anonymous downloads 404 `NOT_PATH`.
 * The v2 pipeline (web-api.gitcode.com, browser-borrowed auth) persists
 * correctly. Until GitCode fixes v5, THIS script is the mirror of record.
 *
 * Flow per asset:
 *   1. Skip when GitCode already serves the stable URL (range GET, 200/206).
 *   2. Download from GitHub via `gh release download` (its HTTP stack
 *      survives domestic routes where curl/fetch time out), verify sha256
 *      against the sibling .sha256 file.
 *   3. Upload through the v2 reservation + signed OBS PUT flow, borrowing
 *      the logged-in browser tab's auth (kimi-webbridge). The descriptor
 *      JSON the uploader prints is retained; secrets never reach the log.
 *   4. Link the descriptors on the existing GitCode release with a v2 PUT
 *      (`action:"create"`; same-name old links get `action:"delete"` in the
 *      same call — linking a name that still exists fails with 400).
 *   5. Re-verify every stable URL anonymously.
 *
 * Prerequisites:
 *   - `gh` authenticated to GITHUB_REPO.
 *   - kimi-webbridge daemon up with a logged-in gitcode.com tab; the tab
 *     session name defaults to `release-task` (--session to change). Start
 *     it with: ~/.kimi-webbridge/bin/kimi-webbridge start
 *   - GitCode tag already pushed and aligned with the local tag.
 *
 * Usage:
 *   node scripts/mirror-gitcode-v2.mjs <tag> [--check-only] [--work-dir DIR] [--session NAME]
 *
 * @module scripts/mirror-gitcode-v2
 */
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { classifyPublicAsset, SHA256_LINE } from './release-shape.mjs'

const execFileP = promisify(execFile)

const GITCODE_REPO = process.env.GITCODE_REPO ?? 'citrusli2026/dsh-desktop'
const GITHUB_REPO = process.env.GITHUB_REPO ?? 'citrusli2026/dsh-desktop'
const WEBBRIDGE = process.env.KIMI_WEBBRIDGE_URL ?? 'http://127.0.0.1:10086'
const UPLOAD_SCRIPT = fileURLToPath(new URL('../.agents/skills/gitcode-release-publisher/scripts/gitcode-release.sh', import.meta.url))

function fail(message) {
  console.error(`mirror-v2: ${message}`)
  process.exit(1)
}

function log(message) {
  console.log(`mirror-v2: ${message}`)
}

/** One-byte range GET against the stable GitCode URL: 200/206 = present. */
async function gitCodeHas(tag, name) {
  const url = `https://gitcode.com/${GITCODE_REPO}/releases/download/${tag}/${name}`
  try {
    const response = await fetch(url, { headers: { Range: 'bytes=0-0' }, redirect: 'follow' })
    await response.body?.cancel()
    return response.status === 200 || response.status === 206
  } catch {
    return false
  }
}

/** Refuse to attach assets to a release whose GitCode tag points elsewhere. */
async function verifyGitCodeTag(tag) {
  const local = (await execFileP('git', ['rev-parse', `${tag}^{commit}`], { encoding: 'utf8' })).stdout.trim()
  const remote = (await execFileP('git', ['ls-remote', `https://gitcode.com/${GITCODE_REPO}.git`, `refs/tags/${tag}`, `refs/tags/${tag}^{}`], { encoding: 'utf8' })).stdout.trim().split('\n').filter(Boolean)
  const peeled = remote.find(line => line.endsWith(`refs/tags/${tag}^{}`))
  const direct = remote.find(line => line.endsWith(`refs/tags/${tag}`))
  const mirrored = (peeled ?? direct)?.split(/\s+/)[0]
  if (mirrored === undefined) fail(`GitCode tag ${tag} is missing; push GitCode main and the release tag first`)
  if (mirrored !== local) fail(`GitCode tag ${tag} points to ${mirrored.slice(0, 8)}, expected ${local.slice(0, 8)}; sync GitCode main and force the tag first`)
  log(`tag ${tag} aligned at ${local.slice(0, 8)}`)
  return local
}

/** Public asset list from the GitHub release; gh CLI first (resilient), fetch fallback. */
async function resolveAssets(tag) {
  let release
  try {
    const { stdout } = await execFileP('gh', ['api', `repos/${GITHUB_REPO}/releases/tags/${tag}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    release = JSON.parse(stdout)
  } catch {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${encodeURIComponent(tag)}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-desktop-mirror-v2' },
    })
    if (!response.ok) fail(`GitHub release ${tag} -> HTTP ${response.status}`)
    release = await response.json()
  }
  return release.assets
    .filter(asset => classifyPublicAsset(asset.name) !== null)
    .map(asset => ({ name: asset.name, size: asset.size }))
}

/** Borrow the logged-in tab's credential material through webbridge. */
async function borrowAuth(session) {
  const call = async (action, args) => {
    const res = await fetch(`${WEBBRIDGE}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, args, session }),
    })
    return res.json()
  }
  let headerRes
  try {
    headerRes = await call('evaluate', {
      code: '(()=>JSON.stringify({tk:localStorage.getItem("access_token"),ck:document.cookie,ua:navigator.userAgent,rf:location.href}))()',
    })
  } catch {
    fail(`kimi-webbridge unreachable at ${WEBBRIDGE} — start it (~/.kimi-webbridge/bin/kimi-webbridge start) and keep a logged-in gitcode.com tab open`)
  }
  if (!headerRes.ok) {
    fail(`webbridge tab unavailable (${JSON.stringify(headerRes.error).slice(0, 120)}) — open a logged-in gitcode.com tab in session "${session}"`)
  }
  const { tk, ck, ua, rf } = JSON.parse(headerRes.data.value)
  if (typeof tk !== 'string' || tk === 'null') fail('no access_token in the tab — sign in to gitcode.com in that browser session')
  return { Authorization: `Bearer ${tk}`, Cookie: ck, 'User-Agent': ua, Origin: 'https://gitcode.com', Referer: rf, Accept: 'application/json, text/plain, */*' }
}

async function webApi(auth, method, path, body) {
  const res = await fetch(`https://web-api.gitcode.com/api/v2${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...auth },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  return { status: res.status, text }
}

function releasePayload(tag, links) {
  return {
    name: `dsh-desktop ${tag}`,
    description: `Mirrored from https://github.com/${GITHUB_REPO}/releases`,
    release_status: 0,
    links,
    assets: [],
    tag_name: tag,
  }
}

/** Existing links on the release (names + ids; never printed with secrets). */
async function existingLinks(auth, tag) {
  const res = await webApi(auth, 'GET', `/projects/${encodeURIComponent(GITCODE_REPO)}/releases/${encodeURIComponent(tag)}`)
  if (res.status !== 200) return []
  try {
    const json = JSON.parse(res.text)
    return (json?.assets?.links ?? []).map(link => ({ id: link.id, name: link.name, url: link.url }))
  } catch {
    return []
  }
}

const args = process.argv.slice(2)
const checkOnly = args.includes('--check-only')
const workDirFlag = args.indexOf('--work-dir')
const sessionFlag = args.indexOf('--session')
const session = sessionFlag >= 0 ? args[sessionFlag + 1] : 'release-task'
const tag = args.find(arg => !arg.startsWith('--') && arg !== session)

if (tag === undefined || !/^v/.test(tag)) fail('usage: node scripts/mirror-gitcode-v2.mjs <tag> [--check-only] [--work-dir DIR] [--session NAME]')

const assets = await resolveAssets(tag)
if (assets.length === 0) fail(`no public assets on the GitHub release ${tag}`)
log(`${assets.length} public asset(s) for ${tag}`)
await verifyGitCodeTag(tag)

const missing = []
for (const asset of assets) {
  const present = await gitCodeHas(tag, asset.name)
  log(`${present ? 'present' : 'MISSING'} ${asset.name}`)
  if (!present) missing.push(asset)
}
if (checkOnly) {
  log(`${assets.length - missing.length}/${assets.length} assets present on GitCode`)
  process.exit(missing.length === 0 ? 0 : 1)
}
if (missing.length === 0) {
  log('nothing to do — all assets already served')
  process.exit(0)
}

const workDir = workDirFlag >= 0 ? args[workDirFlag + 1] : await mkdtemp(join(tmpdir(), `mirror-v2-${tag}-`))
await mkdir(workDir, { recursive: true })
const keepWorkDir = workDirFlag >= 0

try {
  // 1. Download missing assets + their checksums via gh, verifying as we go.
  for (const asset of missing) {
    const target = join(workDir, asset.name)
    if (!existsSync(target) || (await stat(target)).size !== asset.size) {
      log(`downloading ${asset.name}`)
      await execFileP('gh', ['release', 'download', tag, '-R', GITHUB_REPO, '-p', asset.name, '-O', target, '--clobber'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    }
  }
  for (const asset of missing) {
    if (classifyPublicAsset(asset.name) !== 'installer') continue
    const checksumName = `${asset.name}.sha256`
    const checksumPath = join(workDir, checksumName)
    if (!existsSync(checksumPath)) {
      await execFileP('gh', ['release', 'download', tag, '-R', GITHUB_REPO, '-p', checksumName, '-O', checksumPath, '--clobber'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    }
    const match = SHA256_LINE.exec(await readFile(checksumPath, 'utf8'))
    if (match === null) fail(`${checksumName} is not a valid sha256sum line`)
    const actual = createHash('sha256').update(await readFile(join(workDir, asset.name))).digest('hex')
    if (match[1] !== actual) fail(`${asset.name} sha256 mismatch (expected ${match[1]}, got ${actual})`)
    log(`checksum ok ${asset.name}`)
  }

  // 2. Upload through the v2 pipeline (browser-borrowed auth handled inside).
  const descriptors = []
  for (const asset of missing) {
    const target = join(workDir, asset.name)
    const { stdout } = await execFileP('bash', [UPLOAD_SCRIPT, 'upload', '--session', session, '--repo', GITCODE_REPO, '--file', target], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    const descriptor = JSON.parse(stdout.trim().split('\n').at(-1))
    if (typeof descriptor.attachment_id !== 'string') fail(`upload of ${asset.name} returned no descriptor: ${stdout.slice(0, 200)}`)
    descriptors.push(descriptor)
    log(`uploaded ${asset.name} (${Math.round(asset.size / 1024 / 1024)}M)`)
  }

  // 3. Link: delete same-name predecessors, then create — one PUT. The delete
  // descriptor MUST carry the link row id: without it GitCode answers 200 and
  // silently keeps the row, which then blocks the same-name create with 400.
  const auth = await borrowAuth(session)
  const existing = await existingLinks(auth, tag)
  const names = new Set(descriptors.map(d => d.name))
  const links = [
    ...existing.filter(l => names.has(l.name)).map(l => ({ id: l.id, name: l.name, url: l.url, action: 'delete' })),
    ...descriptors,
  ]
  const put = await webApi(auth, 'PUT', `/projects/${encodeURIComponent(GITCODE_REPO)}/releases/${encodeURIComponent(tag)}`, releasePayload(tag, links))
  if (put.status !== 200 && put.status !== 201) {
    fail(`linking failed: HTTP ${put.status} ${put.text.slice(0, 200)} (if this persists, re-run; already-linked names are handled by the same name)`)
  }
  log(`linked ${descriptors.length} asset(s) (${links.length - descriptors.length} old link(s) replaced)`)

  // 4. Anonymous verification.
  let ok = 0
  for (const asset of assets) {
    const present = await gitCodeHas(tag, asset.name)
    if (present) ok += 1
    log(`verify ${asset.name} -> ${present ? 'OK' : 'MISSING'}`)
  }
  log(`${ok}/${assets.length} assets verified anonymously`)
  process.exit(ok === assets.length ? 0 : 1)
} finally {
  if (!keepWorkDir) await rm(workDir, { recursive: true, force: true })
  else log(`staging kept at ${workDir}`)
}
