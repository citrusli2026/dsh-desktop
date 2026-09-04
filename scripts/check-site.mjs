#!/usr/bin/env node
/** Static integrity checks for the zero-build website. */
import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { classifyOs, classifyPublicAsset } from './release-shape.mjs'
// The site's data layer is a plain ESM module with no DOM access, so the
// checker imports the real dictionaries instead of regex-scraping app.js.
import { I18N, mergeLiveCounts, platformOf, splitCompositeTag } from '../site/assets/data-model.js'

const ROOT = process.cwd()
const SITE = path.join(ROOT, 'site')

function requireValue(condition, message) {
  if (!condition) throw new Error(`site-check: ${message}`)
}

function parseJsonLd(pageHtml, relative) {
  const blocks = [...pageHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  requireValue(blocks.length > 0, `${relative} structured data is missing`)
  return blocks.flatMap((match, index) => {
    try {
      const value = JSON.parse(match[1])
      return Array.isArray(value['@graph']) ? value['@graph'] : [value]
    } catch (error) {
      throw new Error(`site-check: ${relative} JSON-LD block ${index + 1} is invalid: ${error.message}`)
    }
  })
}

async function collectHtmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await collectHtmlFiles(fullPath))
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(fullPath)
  }
  return files
}

const [html, releaseRaw, vercelRaw, sitemap, notFoundHtml, styleCss, appJs] = await Promise.all([
  readFile(path.join(SITE, 'index.html'), 'utf8'),
  readFile(path.join(SITE, 'data', 'release.json'), 'utf8'),
  readFile(path.join(SITE, 'vercel.json'), 'utf8'),
  readFile(path.join(SITE, 'sitemap.xml'), 'utf8'),
  readFile(path.join(SITE, '404.html'), 'utf8'),
  readFile(path.join(SITE, 'assets', 'style.css'), 'utf8'),
  readFile(path.join(SITE, 'assets', 'app.js'), 'utf8'),
])
const pageFiles = (await collectHtmlFiles(SITE)).filter(file => !file.endsWith(`${path.sep}404.html`))
const pageDocs = await Promise.all(pageFiles.map(async (file) => ({
  file,
  html: await readFile(file, 'utf8'),
})))

requireValue(pageDocs.length === 12, `expected 12 crawlable HTML pages, found ${pageDocs.length}`)
for (const { file, html: pageHtml } of pageDocs) {
  const relative = path.relative(SITE, file).split(path.sep).join('/')
  const expectedCanonical = relative === 'index.html'
    ? 'https://dsh-desktop.com/'
    : `https://dsh-desktop.com/${relative.replace(/\/index\.html$/, '')}`
  const canonical = pageHtml.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
  const expectedLanguage = relative.startsWith('en/') ? 'en' : 'zh-CN'
  const canonicalPath = new URL(expectedCanonical).pathname
  const expectedZhPath = canonicalPath.startsWith('/en') ? canonicalPath.slice(3) || '/' : canonicalPath
  const expectedEnPath = canonicalPath.startsWith('/en') ? canonicalPath : canonicalPath === '/' ? '/en' : `/en${canonicalPath}`
  const alternates = Object.fromEntries(
    [...pageHtml.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)]
      .map(match => [match[1], match[2]]),
  )
  requireValue(canonical === expectedCanonical, `${relative} canonical must be ${expectedCanonical}`)
  requireValue(/<title>[^<]+<\/title>/.test(pageHtml), `${relative} title is missing`)
  requireValue(/<meta name="description" content="[^"]+"/.test(pageHtml), `${relative} meta description is missing`)
  requireValue(alternates['zh-CN'] === `https://dsh-desktop.com${expectedZhPath}`, `${relative} Chinese alternate is incorrect`)
  requireValue(alternates.en === `https://dsh-desktop.com${expectedEnPath}`, `${relative} English alternate is incorrect`)
  requireValue(alternates['x-default'] === alternates.en, `${relative} x-default must use the English fallback`)
  requireValue(/class="theme-toggle"/.test(pageHtml) && /class="menu-toggle"/.test(pageHtml), `${relative} shared header controls are missing`)
  requireValue(/class="gh-chip"/.test(pageHtml), `${relative} GitHub header link is missing`)
  requireValue(/class="footer__sync"/.test(pageHtml), `${relative} shared footer sync block is missing`)
  requireValue(!/class="[^\"]*\bseo-button(?!-)\b/.test(pageHtml), `${relative} must use the shared homepage button system`)

  const structuredData = parseJsonLd(pageHtml, relative)
  requireValue(!structuredData.some(item => ['HowTo', 'FAQPage'].includes(item['@type'])), `${relative} contains unsupported search feature markup`)
  if (relative !== 'index.html') {
    const webPage = structuredData.find(item => item['@type'] === 'WebPage')
    requireValue(webPage?.url === expectedCanonical, `${relative} WebPage URL must match its canonical`)
    requireValue(webPage?.inLanguage === expectedLanguage, `${relative} WebPage language must be ${expectedLanguage}`)
  }
  if (relative === 'download/index.html' || relative === 'en/download/index.html') {
    requireValue(/id="platform-rows"/.test(pageHtml) && /id="first-run"/.test(pageHtml), `${relative} download surface is incomplete`)
    requireValue(/id="download-toast"/.test(pageHtml) && /assets\/app\.js\?v=\d+/.test(pageHtml), `${relative} shared download logic is missing`)
  }

  const localReferences = [...pageHtml.matchAll(/(?:href|src)="(\/(?:assets|data)\/[^"?#]+)[^"]*"/g)].map(match => match[1])
  for (const reference of localReferences) await access(path.join(SITE, reference.slice(1)))
}

const pageTitles = pageDocs.map(({ html: pageHtml }) => pageHtml.match(/<title>([^<]+)<\/title>/)?.[1])
const pageDescriptions = pageDocs.map(({ html: pageHtml }) => pageHtml.match(/<meta name="description" content="([^"]+)"/)?.[1])
requireValue(new Set(pageTitles).size === pageDocs.length, 'crawlable pages must have unique titles')
requireValue(new Set(pageDescriptions).size === pageDocs.length, 'crawlable pages must have unique meta descriptions')

requireValue(/<meta name="robots" content="noindex, nofollow"/.test(notFoundHtml), '404 page must be noindex')
requireValue(/class="theme-toggle"/.test(notFoundHtml) && /class="menu-toggle"/.test(notFoundHtml), '404 page must use the shared header controls')
requireValue(/class="gh-chip"/.test(notFoundHtml), '404 page GitHub header link is missing')
requireValue(/id="error-path"/.test(notFoundHtml) && /href="\/"/.test(notFoundHtml), '404 page must show the missing path and a home link')
const notFoundReferences = [...notFoundHtml.matchAll(/(?:href|src)="(\/(?:assets|data)\/[^"?#]+)[^"]*"/g)].map(match => match[1])
for (const reference of notFoundReferences) await access(path.join(SITE, reference.slice(1)))

const sitemapLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
const expectedSitemapLocations = [
  'https://dsh-desktop.com/',
  'https://dsh-desktop.com/en',
  'https://dsh-desktop.com/download',
  'https://dsh-desktop.com/en/download',
  'https://dsh-desktop.com/docs/install',
  'https://dsh-desktop.com/en/docs/install',
  'https://dsh-desktop.com/docs/faq',
  'https://dsh-desktop.com/en/docs/faq',
  'https://dsh-desktop.com/docs/why-desktop',
  'https://dsh-desktop.com/en/docs/why-desktop',
  'https://dsh-desktop.com/changelog',
  'https://dsh-desktop.com/en/changelog',
]
requireValue(/xmlns:xhtml="http:\/\/www.w3.org\/1999\/xhtml"/.test(sitemap), 'sitemap hreflang namespace is missing')
requireValue(new Set(sitemapLocations).size === expectedSitemapLocations.length, 'sitemap contains duplicate URLs')
requireValue(expectedSitemapLocations.every(url => sitemapLocations.includes(url)), 'sitemap must include every crawlable language page')
requireValue(!sitemap.includes('404') && !sitemap.includes('/api/'), 'sitemap must not include non-content routes')
requireValue(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sitemap), 'sitemap lastmod is missing')

requireValue(/name="google-site-verification" content="0NO32QsuJviivUirAXGOcVgj2knN_m5NCus7GpE-ZXg"/.test(html), 'Google Search Console verification meta tag is missing')
requireValue(/\.gh-chip::before/.test(styleCss) && /github-mark\.svg/.test(styleCss), 'shared GitHub icon styling is missing')
await access(path.join(SITE, 'assets', 'github-mark.svg'))
requireValue(/"@type": "WebSite"/.test(html), 'WebSite structured data is missing from the homepage')
requireValue(/href="\/download"/.test(html), 'homepage must expose a crawlable download page link')
requireValue(/class="lang-toggle" href="\/en"/.test(html), 'homepage language switch must link to the English URL')
requireValue(!/navigator\.language|dsh-site-lang|function applyLang|function bindLangToggle/.test(appJs), 'page language must come from its crawlable URL, not client-side detection')
const software = parseJsonLd(html, 'index.html').find(item => item['@type'] === 'SoftwareApplication')
requireValue(software?.offers?.price === 0 && software.offers.priceCurrency === 'USD', 'free SoftwareApplication offer must declare a zero price')
const data = JSON.parse(releaseRaw)
JSON.parse(vercelRaw)

requireValue(typeof data.release?.tag === 'string' && data.release.tag.startsWith('v'), 'release tag is missing')
requireValue(splitCompositeTag(data.release.tag) !== null, 'release tag must be composite (<dsh>.shell.<rev>)')
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
const installerOs = new Set(installers.map(asset => classifyOs(asset.name)).filter(Boolean))
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
  requireValue(classifyPublicAsset(asset.name) === asset.kind, `${asset.name} has an unsupported public kind`)
  // The browser's render-time classifier must agree with the canonical one,
  // so a release-shape change can never silently diverge on the site.
  const browserOs = platformOf(asset.name)?.os ?? null
  requireValue(browserOs === classifyOs(asset.name), `${asset.name} is classified differently by app.js and release-shape`)
  requireValue(typeof asset.name === 'string' && asset.name !== '', 'asset name is missing')
  requireValue(typeof asset.size === 'number' && asset.size > 0, `${asset.name} has an invalid size`)
  requireValue(asset.url.includes(`/download/${data.release.tag}/${asset.name}`), `${asset.name} GitHub URL does not match the release`)
  requireValue(typeof asset.gitcode_ok === 'boolean', `${asset.name} GitCode status is not boolean`)
}
requireValue(checksums.length === 0 || checksums.length === installers.length, 'checksums must be absent or complete for every installer')
for (const checksum of checksums) {
  const installerName = checksum.name.replace(/\.sha256$/, '')
  requireValue(installers.some(asset => asset.name === installerName), `${checksum.name} has no matching installer`)
  requireValue(typeof checksum.sha256 === 'string' && /^[a-f0-9]{64}$/.test(checksum.sha256), `${checksum.name} has an invalid SHA-256`)
}

const zhKeys = new Set(Object.keys(I18N.zh))
const enKeys = new Set(Object.keys(I18N.en))
requireValue([...zhKeys].every(key => enKeys.has(key)) && [...enKeys].every(key => zhKeys.has(key)), 'Chinese and English translation keys differ')
for (const match of html.matchAll(/data-i18n="([^"]+)"/g)) {
  requireValue(zhKeys.has(match[1]), `HTML uses missing translation key ${match[1]}`)
}

// Live-count merging must keep the release.json shape and only report a
// change when something actually moved; app.js skips re-render on null.
{
  const live = {
    assets: data.release.assets.map(asset => ({ name: asset.name, downloads: (asset.downloads || 0) + 1 })),
    mac_downloads: 1, win_downloads: 2, linux_downloads: 3, total_downloads: 6,
    generated_at: '2026-01-01T00:00:00.000Z',
  }
  const merged = mergeLiveCounts(data, live)
  requireValue(merged !== null, 'mergeLiveCounts must produce an update when counts move')
  requireValue(merged.release.assets.every(asset => asset.downloads === (data.release.assets.find(a => a.name === asset.name)?.downloads || 0) + 1), 'mergeLiveCounts must apply live per-asset counts')
  requireValue(merged.stats?.mac_downloads === 1 && merged.stats?.win_downloads === 2 && merged.stats?.linux_downloads === 3 && merged.stats?.installer_downloads === 6, 'mergeLiveCounts must apply live platform totals')
  requireValue(mergeLiveCounts(merged, live) === null, 'mergeLiveCounts must skip an unchanged live payload')
  requireValue(mergeLiveCounts(data, { assets: [] }) === null, 'mergeLiveCounts must return null without a change')
  requireValue(mergeLiveCounts(data, null) === null, 'mergeLiveCounts must tolerate a null payload')
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
requireValue(!/(^|\n)\[data-reveal\]\s*\{/.test(styleCss), 'reveal content must stay visible before JavaScript initializes')
requireValue(/\.reveal-pending/.test(styleCss) && /classList\.add\('reveal-pending'\)/.test(appJs), 'reveal enhancement must opt into its hidden state')

const tabTargets = [...html.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1])
for (const id of tabTargets) requireValue(html.includes(`id="${id}"`), `tab target #${id} is missing`)

console.log(`site-check: OK (${data.release.tag}, ${installers.length} installers, ${zhKeys.size} translations)`)
