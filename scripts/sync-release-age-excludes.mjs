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
const replacedLines = src.split('\n').map((line) => {
  const match = dshPin.exec(line)
  return match === null ? line : `  - '${match[1]}@${NEW}'`
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
console.log(`sync-release-age-excludes: dsh pins -> @${NEW} (${before} -> ${after} pinned entries)`)
