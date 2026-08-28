#!/usr/bin/env node
/**
 * Release-notes gate: every tag ships a committed docs/release-notes/v<tag>.md.
 * Usage:
 *   node scripts/write-release-notes.mjs v<tag>          # scaffold a draft (refuses to overwrite)
 *   node scripts/write-release-notes.mjs check v<tag>    # exit 0 when notes exist (CI gate)
 * The file is the single source of the GitHub Release body (release.yml assembles
 * the standard install/verify block around it) — see docs/release-notes/README.md.
 */
import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const DIRECTORY = path.join(ROOT, 'docs', 'release-notes')

const TEMPLATE = (tag) => `# dsh-desktop ${tag}

DeepSeek Harness 社区桌面版 · 内置内核 \`@deepseek-ai/dsh\` <内核版本>（未变，壳修订 +<N>）。

## 本次更新

- <功能一>：<面向用户的说明，解决什么问题>
- <功能二>：...
- <边界说明>：<本地功能/隐私边界一句话>

## 验证

- <单测/E2E/打包门禁结果>
- <镜像/官网数据状态>

## English Summary

- <English bullet per change>
`

function fail(message) {
  console.error(`release-notes: ${message}`)
  process.exit(1)
}

async function main() {
  const [first, second] = process.argv.slice(2)
  const mode = first === 'check' ? 'check' : 'scaffold'
  const tag = first === 'check' ? second : first
  if (mode === 'check') {
    if (typeof tag !== 'string' || !tag.startsWith('v')) fail('usage: write-release-notes.mjs check v<tag>')
    const file = path.join(DIRECTORY, `${tag}.md`)
    try {
      const content = await readFile(file, 'utf8')
      if (content.trim() === '') fail(`${file} exists but is empty`)
      if (!content.includes('<')) return console.log(`release-notes: OK (${file})`)
      console.warn(`release-notes: WARNING (${file} still contains placeholder <> — fill them in before tagging, or remove the check warning)`)
      return
    } catch (error) {
      if (error?.code === 'ENOENT') fail(`missing ${file}; every release must ship notes (scaffold with 'node scripts/write-release-notes.mjs ${tag}')`)
      throw error
    }
  }
  if (typeof tag !== 'string' || !tag.startsWith('v')) fail('usage: write-release-notes.mjs v<tag> | write-release-notes.mjs check v<tag>')
  await access(ROOT).catch(() => fail('run from the repo root'))
  const file = path.join(DIRECTORY, `${tag}.md`)
  try {
    await access(file)
    fail(`${file} already exists — edit it instead of overwriting`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  await writeFile(file, TEMPLATE(tag))
  console.log(`release-notes: scaffolded ${file} — fill in the <...> placeholders, then commit it with the bump.`)
}

main().catch(error => fail(error instanceof Error ? error.message : String(error)))
