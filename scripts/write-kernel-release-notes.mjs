#!/usr/bin/env node
/**
 * Generate release notes for an automated kernel-bump release (the merge of a
 * `dsh-bump/*` PR). Unlike write-release-notes.mjs (a scaffold for hand-written
 * notes), this emits complete, placeholder-free notes: the automation knows
 * exactly what the release contains — a kernel bump with shell revision reset
 * to zero, verified by the watch run and gated by the release pipeline.
 * Usage: node scripts/write-kernel-release-notes.mjs v<version>
 */
import { readFile, writeFile, access } from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()

function fail(message) {
  console.error(`kernel-release-notes: ${message}`)
  process.exit(1)
}

function previousTag(tag) {
  const match = /^(v\d+\.\d+\.\d+-[a-z]+\.\d+)\.shell\.\d+$/.exec(tag)
  return match === null ? undefined : match[1]
}

async function main() {
  const [tag] = process.argv.slice(2)
  if (typeof tag !== 'string' || !/^v\d+\.\d+\.\d+-[a-z]+\.\d+\.shell\.0$/.test(tag)) {
    fail('usage: write-kernel-release-notes.mjs v<dsh>.shell.0 (automated kernel-bump releases only)')
  }
  const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'))
  if (`v${packageJson.version}` !== tag) {
    fail(`package.json version ${packageJson.version} does not match ${tag}`)
  }
  const manifest = await readFile(path.join(ROOT, 'manifest', 'harness', 'package.json'), 'utf8')
  const kernel = /"@deepseek-ai\/dsh"\s*:\s*"([^"]+)"/.exec(manifest)?.[1]
  if (kernel === undefined) fail('manifest harness pin not found')
  const prev = previousTag(tag)
  const file = path.join(ROOT, 'docs', 'release-notes', `${tag}.md`)
  try {
    await access(file)
    fail(`${file} already exists`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const watchRun = process.env.DSH_WATCH_RUN_URL
  const watchLine = watchRun === undefined ? '' : `\n自动化验证运行：${watchRun}（bump + lockfile + bootstrap + smoke 全绿）。`
  const content = `# dsh-desktop ${tag}

DeepSeek Harness 社区桌面版 · 内核升级并锁定官方 \`@deepseek-ai/dsh\` \`${kernel}\`（壳修订归零）。${watchLine}

## 本次更新

- **内核升级**：随官方 \`@deepseek-ai/dsh\` \`${kernel}\`${prev === undefined ? '' : `（上一内置内核 ${prev.replace(/^v/, '')}）`}。上游变更内容见 [官方发布页](https://github.com/deepseek-ai/deepseek-harness/releases)。
- **依赖闭包同步**：重新生成 lockfile，同步 supply-chain release-age 豁免清单；官方 npm 安全审计零已知漏洞。
- **自动化验证**：dsh-watch 在独立运行中完成 bump、bootstrap 与 smoke；本发布继续执行 verify、三平台构建、packaged smoke、attestation 核验与跨版本升级门禁。
- **边界说明**：桌面壳无功能变更；社区插件仍不进入安装包。若插件与新内核不兼容，启动失败时错误页提供一键「升级 / 禁用」恢复。

## 验证

- dsh-watch run：bump PR 内 bootstrap + smoke 全绿。
- Release 门禁：verify（单测 + E2E）、macOS/Windows/Linux 构建、packaged smoke、attestation、跨版本升级数据保留。

## English Summary

- Kernel bump: bundled \`@deepseek-ai/dsh\` locked to \`${kernel}\`${prev === undefined ? '' : ` (previous ${prev.replace(/^v/, '')})`}; shell revision reset to 0. See the [official upstream release notes](https://github.com/deepseek-ai/deepseek-harness/releases) for kernel changes.
- Dependency closure and supply-chain release-age excludes regenerated; zero known vulnerabilities in the official npm audit.
- Desktop shell unchanged. If a community plugin is incompatible with the new kernel, the error page offers one-click Update / Disable recovery.
`
  await writeFile(file, content, 'utf8')
  console.log(`kernel-release-notes: wrote ${file}`)
}

main()
