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

const manifest = JSON.parse(readFileSync('manifest/harness/package.json', 'utf8'))
const OLD = manifest.dependencies['@deepseek-ai/dsh']
if (!OLD) {
  console.error('sync-release-age-excludes: no @deepseek-ai/dsh pin in manifest/harness/package.json')
  process.exit(1)
}
if (OLD === NEW) {
  console.log(`sync-release-age-excludes: excludes already at ${NEW}`)
  process.exit(0)
}

const file = 'manifest/harness/pnpm-workspace.yaml'
const src = readFileSync(file, 'utf8')
const replaced = src.split(`@${OLD}'`).join(`@${NEW}'`)

// 保序去重(仅处理列表行),pnpm 自动追加的重复条目在此收敛
const seen = new Set()
const out = []
for (const line of replaced.split('\n')) {
  if (line.startsWith("  - '")) {
    if (seen.has(line)) continue
    seen.add(line)
  }
  out.push(line)
}
writeFileSync(file, out.join('\n'))

const before = (src.match(new RegExp(`@${OLD}'`, 'g')) || []).length
const after = (replaced.match(new RegExp(`@${NEW}'`, 'g')) || []).length
console.log(`sync-release-age-excludes: @${OLD} -> @${NEW} (${before} -> ${after} pinned entries)`)
