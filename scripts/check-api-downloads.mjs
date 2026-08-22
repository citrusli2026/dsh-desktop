#!/usr/bin/env node
/**
 * Local behavioral test for site/api/downloads.js.
 * Injects a mocked global fetch so no real network is needed.
 *
 * Usage: node scripts/check-api-downloads.mjs
 */

import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const handler = require('../site/api/downloads.js')

const releaseJson = JSON.parse(
  await readFile(new URL('../site/data/release.json', import.meta.url), 'utf8')
)

function makeRes() {
  const headers = {}
  const res = {
    headers,
    setHeader(k, v) { headers[k] = v },
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this },
    json(obj) { this.body = obj; return this },
    end() { this.body = ''; return this },
  }
  return res
}

function makeReq(method = 'GET', host = 'dsh-desktop.com') {
  return { method, headers: { host, 'x-forwarded-proto': 'https' } }
}

function runCase(name, { fetchImpl, expectStatus, expectSource, expectCounts, expectTotal, req }) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, opts) => {
    const result = fetchImpl(String(url), opts)
    if (result && typeof result.then === 'function') return result
    const status = result.status
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => result.body,
    }
  }

  const res = makeRes()
  return handler(req || makeReq(), res).then(() => {
    globalThis.fetch = originalFetch
    const ok = res.statusCode === expectStatus
    let detail = `status=${res.statusCode} (expect ${expectStatus})`
    if (res.body) {
      detail += ` source=${res.body.source} (expect ${expectSource})`
      if (typeof res.body.total_downloads === 'number') detail += ` total=${res.body.total_downloads}`
      if (res.body.assets) {
        const names = res.body.assets.map(a => a.name)
        detail += ` assets=[${names.join(', ')}]`
        detail += ` counts=[${res.body.assets.map(a => a.downloads).join(', ')}]`
        if (expectCounts) {
          const match = expectCounts.every((c, i) => res.body.assets[i] && res.body.assets[i].downloads === c)
          detail += ` countsMatch=${match}`
        }
      }
    }
    const totalOk = expectTotal === undefined || res.body?.total_downloads === expectTotal
    if (!ok || (expectSource && res.body && res.body.source !== expectSource) || !totalOk) {
      throw new Error(`${name} FAILED — ${detail}`)
    }
    console.log(`ok — ${name} (${detail})`)
  }).catch(err => {
    globalThis.fetch = originalFetch
    throw err
  })
}

const dataUrl = /\/data\/release\.json$/
const tagUrl = /releases\/tags\//
const listUrl = /releases\?per_page/

await runCase('real-time counts from GitHub tag endpoint', {
  fetchImpl(url) {
    if (dataUrl.test(url)) return { status: 200, body: releaseJson }
    if (tagUrl.test(url)) {
      const assets = releaseJson.release.assets.map(a => ({
        name: a.name,
        download_count: (a.downloads || 0) + 100,
      }))
      return { status: 200, body: { assets } }
    }
    if (listUrl.test(url)) {
      // 全量列表：一个 release，含 dmg/exe 安装包计数与辅助文件
      return { status: 200, body: [
        { draft: false, assets: [
          { name: 'dsh-desktop-x-arm64-mac.dmg', download_count: 500 },
          { name: 'dsh-desktop-setup-x.exe', download_count: 400 },
          { name: 'dsh-desktop-x-arm64-mac.dmg.sha256', download_count: 999 },
        ] },
      ] }
    }
    return { status: 404, body: { message: 'nope' } }
  },
  expectStatus: 200,
  expectSource: 'github',
  expectCounts: releaseJson.release.assets.map(a => (a.downloads || 0) + 100),
  // 累计只统计安装包(dmg+exe=900),排除 sha256 辅助文件
  expectTotal: 900,
})

await runCase('static fallback when GitHub tag endpoint fails', {
  fetchImpl(url) {
    if (dataUrl.test(url)) return { status: 200, body: releaseJson }
    return { status: 500, body: { message: 'boom' } }
  },
  expectStatus: 200,
  expectSource: 'release-data',
  expectCounts: releaseJson.release.assets.map(a => a.downloads || 0),
  expectTotal: releaseJson.stats?.installer_downloads ?? null,
})

await runCase('malicious Host header cannot redirect same-site fetch', {
  fetchImpl(url) {
    if (url.includes('evil.example')) throw new Error('SSRF: fetched attacker-controlled host')
    if (dataUrl.test(url)) return { status: 200, body: releaseJson }
    return { status: 500, body: { message: 'boom' } }
  },
  req: makeReq('GET', 'evil.example'),
  expectStatus: 200,
  expectSource: 'release-data',
  expectCounts: releaseJson.release.assets.map(a => a.downloads || 0),
  expectTotal: releaseJson.stats?.installer_downloads ?? null,
})

await runCase('404 legacy path when no local data and no listable release', {
  fetchImpl(url) {
    if (dataUrl.test(url)) return { status: 404, body: { message: 'missing' } }
    if (listUrl.test(url)) return { status: 200, body: [] }
    return { status: 500, body: { message: 'boom' } }
  },
  expectStatus: 404,
  expectSource: null,
})

console.log('api-downloads check: ALL PASS')
