// 用法: node scripts/sync-release-age-excludes.mjs <newVersion>
//
// pnpm 的 minimumReleaseAge(默认 24h)供应链策略会在内核升级时拦住
// 刚发布的 dsh 全家桶:lockfile 换成新版后,`pnpm install --frozen-lockfile`
// 会把新包判定为"发布不足 24 小时"而失败。豁免列表
// manifest/harness/pnpm-workspace.yaml 的 minimumReleaseAgeExclude 必须
// 与内核版本同步 —— 本脚本把列表中的旧 pin 替换为新版本并去重
// (pnpm 有时会自动追加同版本条目,需清理)。
// dsh-watch 在 bump 后调用;发布 runbook 亦手动执行同一命令。

import { readFileSync, writeFileSync } from 'node:fs'

const NEW = process.argv[2]
if (!NEW) {
  console.error('usage: node scripts/sync-release-age-excludes.mjs <newVersion>')
  process.exit(1)
}

const file = 'manifest/harness/pnpm-workspace.yaml'
const src = readFileSync(file, 'utf8')
const dshPin = /^  - '(@deepseek-ai\/dsh(?:-[^@']+)?)@[^']+'$/

// A pin must reference a version the registry actually serves: not every
// dsh-* package publishes every kernel release (e.g.
// dsh-client-ui-sidebar-documentpreview skipped 0.1.6-alpha.1), and an
// exclude pointing at a nonexistent version breaks `pnpm install
// --lockfile-only` outright. Rewrite only packages whose registry metadata
// contains the new version; leave the rest at their resolved old pin.
async function publishedVersion(pkg) {
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`, {
      signal: AbortSignal.timeout(20_000),
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return undefined
    const body = await response.json()
    return typeof body.versions?.[NEW] === 'string' || body.versions?.[NEW] != null ? NEW : undefined
  } catch {
    return undefined
  }
}

const globalDshPin = new RegExp(dshPin.source, 'gm')
const packages = [...new Set([...src.matchAll(globalDshPin)].map((match) => match[1]))]
const availability = new Map()
for (const pkg of packages) availability.set(pkg, await publishedVersion(pkg))
const rewritten = new Set([...availability].filter(([, has]) => has === NEW).map(([pkg]) => pkg))

// For packages that did NOT publish NEW, the pin must carry the version the
// closure actually resolves — taken from the current lockfile, not from the
// workspace file (a previous blind run may have corrupted the line to a
// version the registry never served).
const lockfileSrc = readFileSync('manifest/harness/pnpm-lock.yaml', 'utf8')
const resolved = new Map()
for (const match of lockfileSrc.matchAll(/^  '?(@deepseek-ai\/[^'\s:]+)@([^'(:\s]+)/gm)) {
  if (!resolved.has(match[1])) resolved.set(match[1], match[2])
}

const replacedLines = src.split('\n').map((line) => {
  const match = dshPin.exec(line)
  if (match === null) return line
  if (rewritten.has(match[1])) return `  - '${match[1]}@${NEW}'`
  const resolvedVersion = resolved.get(match[1])
  return resolvedVersion === undefined ? line : `  - '${match[1]}@${resolvedVersion}'`
})
const replaced = replacedLines.join('\n')

// 保留同一包最后出现的 pin。pnpm 自动追加新版条目时，旧版 pin
// 会留在列表前面；按包名收敛，避免冻结安装仍被旧的排除项干扰。
const lastIndex = new Map()
const packagePin = /^  - '(@deepseek-ai\/[^@']+)@[^']+'$/
const replacedList = replaced.split('\n')
replacedList.forEach((line, index) => {
  const match = packagePin.exec(line)
  if (match !== null) lastIndex.set(match[1], index)
})
const out = []
for (const [index, line] of replacedList.entries()) {
  const match = packagePin.exec(line)
  if (match !== null && lastIndex.get(match[1]) !== index) continue
  out.push(line)
}
writeFileSync(file, out.join('\n'))

const before = src.split('\n').filter(line => dshPin.test(line)).length
const after = replaced.split('\n').filter(line => line.endsWith(`@${NEW}'`) && dshPin.test(line)).length
const kept = packages.length - rewritten.size
console.log(`sync-release-age-excludes: dsh pins -> @${NEW} (${before} -> ${after} pinned entries; ${kept} kept at their resolved version from the lockfile)`)
