#!/usr/bin/env node
/** Static integrity checks for the zero-build website. */
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const SITE = path.join(ROOT, 'site')

function requireValue(condition, message) {
  if (!condition) throw new Error(`site-check: ${message}`)
}

const [html, appJs, releaseRaw, vercelRaw] = await Promise.all([
  readFile(path.join(SITE, 'index.html'), 'utf8'),
  readFile(path.join(SITE, 'assets', 'app.js'), 'utf8'),
  readFile(path.join(SITE, 'data', 'release.json'), 'utf8'),
  readFile(path.join(SITE, 'vercel.json'), 'utf8'),
])
const data = JSON.parse(releaseRaw)
JSON.parse(vercelRaw)

requireValue(typeof data.release?.tag === 'string' && data.release.tag.startsWith('v'), 'release tag is missing')
requireValue(Array.isArray(data.release.assets), 'release assets are missing')
requireValue([2, 4, 6].includes(data.release.assets.length), 'public asset count must be 2, 4, or 6 (installers + checksums, Linux deb only)')
requireValue(Number.isInteger(data.stats?.installer_downloads) && data.stats.installer_downloads >= 0, 'stats.installer_downloads must be a non-negative integer')
requireValue(Number.isInteger(data.stats?.mac_downloads) && data.stats.mac_downloads >= 0, 'stats.mac_downloads must be a non-negative integer')
requireValue(Number.isInteger(data.stats?.win_downloads) && data.stats.win_downloads >= 0, 'stats.win_downloads must be a non-negative integer')
requireValue(Number.isInteger(data.stats?.linux_downloads) && data.stats.linux_downloads >= 0, 'stats.linux_downloads must be a non-negative integer')
requireValue(data.stats.installer_downloads === data.stats.mac_downloads + data.stats.win_downloads + data.stats.linux_downloads, 'stats.installer_downloads must equal mac + win + linux downloads')
requireValue(Number.isInteger(data.stats?.releases) && data.stats.releases >= 1, 'stats.releases must be a positive integer')

const installers = data.release.assets.filter(asset => asset.kind === 'installer')
const checksums = data.release.assets.filter(asset => asset.kind === 'checksum')
// 三平台:mac/win 必选(现状),linux 在发布后出现(mac 1 + win 1 + linux 1-2)
requireValue(installers.length >= 2 && installers.length <= 6, 'installer count must be between 2 and 6')
const osOf = name => /-arm64-mac\.dmg$/.test(name) ? 'mac' : /setup-.*\.exe$/.test(name) ? 'win' : /\.deb$/.test(name) ? 'linux' : null
const installerOs = new Set(installers.map(asset => osOf(asset.name)).filter(Boolean))
for (const platform of ['mac', 'win']) {
  requireValue(installerOs.has(platform), `${platform} must have at least one installer`)
}
for (const [platform, pattern] of [
  ['macOS', /-arm64-mac\.dmg$/],
  ['Windows', /\.exe$/],
]) {
  requireValue(installers.some(asset => pattern.test(asset.name)), `${platform} must have a matching installer`)
}
if (installerOs.has('linux')) {
  requireValue(installers.some(asset => /\.deb$/.test(asset.name)), 'Linux must have a deb installer')
}
for (const asset of data.release.assets) {
  requireValue(asset.kind === 'installer' || asset.kind === 'checksum', `${asset.name} has an unsupported public kind`)
  requireValue(typeof asset.name === 'string' && asset.name !== '', 'asset name is missing')
  requireValue(typeof asset.size === 'number' && asset.size > 0, `${asset.name} has an invalid size`)
  requireValue(asset.url.includes(`/download/${data.release.tag}/${asset.name}`), `${asset.name} GitHub URL does not match the release`)
  requireValue(typeof asset.gitcode_ok === 'boolean', `${asset.name} GitCode status is not boolean`)
}
requireValue(checksums.length === 0 || checksums.length === 2, 'checksums must be absent or complete for both installers')
for (const checksum of checksums) {
  const installerName = checksum.name.replace(/\.sha256$/, '')
  requireValue(installers.some(asset => asset.name === installerName), `${checksum.name} has no matching installer`)
  requireValue(typeof checksum.sha256 === 'string' && /^[a-f0-9]{64}$/.test(checksum.sha256), `${checksum.name} has an invalid SHA-256`)
}

const localReferences = [...html.matchAll(/(?:href|src)="(\/(?:assets|data)\/[^"?#]+)[^\"]*"/g)].map(match => match[1])
for (const reference of localReferences) await access(path.join(SITE, reference.slice(1)))

const zhBlock = /\n\s*zh:\s*\{([\s\S]*?)\n\s*\},\n\s*en:/.exec(appJs)?.[1]
const enBlock = /\n\s*en:\s*\{([\s\S]*?)\n\s*\},\n\s*\}/.exec(appJs)?.[1]
requireValue(zhBlock !== undefined && enBlock !== undefined, 'cannot read the translation dictionaries')
const keys = block => new Set([...block.matchAll(/'([^']+)':/g)].map(match => match[1]))
const zhKeys = keys(zhBlock)
const enKeys = keys(enBlock)
requireValue([...zhKeys].every(key => enKeys.has(key)) && [...enKeys].every(key => zhKeys.has(key)), 'Chinese and English translation keys differ')
for (const match of html.matchAll(/data-i18n="([^"]+)"/g)) {
  requireValue(zhKeys.has(match[1]), `HTML uses missing translation key ${match[1]}`)
}

// 版本号必须单一数据源:图例 chip 由 app.js 从 release.json 动态填充,
// index.html 里不允许出现硬编码的复合版本号(防每次发布后失同步)。
requireValue(/id="legend-core"/.test(html), 'legend chip #legend-core is missing')
requireValue(/id="legend-shell"/.test(html), 'legend chip #legend-shell is missing')
requireValue(!/\blegend-chip[^>]*>\s*\d+\.\d+/.test(html), 'legend chips must not hardcode a version number')
requireValue(/id="download-toast"/.test(html), 'download toast container is missing')
requireValue(/og:image/.test(html) && /assets\/og-image\.png/.test(html), 'og:image meta must point to /assets/og-image.png')
requireValue(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html), 'Google Fonts must not be referenced (system font stack instead)')
requireValue(/Content-Security-Policy/.test(html), 'CSP meta is missing')

const tabTargets = [...html.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1])
for (const id of tabTargets) requireValue(html.includes(`id="${id}"`), `tab target #${id} is missing`)

console.log(`site-check: OK (${data.release.tag}, ${installers.length} installers, ${zhKeys.size} translations)`)
