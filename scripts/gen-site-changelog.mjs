#!/usr/bin/env node
/**
 * Regenerate the website changelog pages (site/changelog, site/en/changelog)
 * from docs/release-notes/*.md — the same files that feed the GitHub Release
 * body. Only the content between the CHANGELOG_AUTO markers in each page is
 * replaced; the page scaffold stays hand-maintained. Wired into the
 * site-refresh workflow so every release updates the site without manual
 * edits; run `node scripts/gen-site-changelog.mjs` locally to preview.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const NOTES = path.join(ROOT, 'docs', 'release-notes')
const PAGES = [
  { file: path.join(ROOT, 'site', 'changelog', 'index.html'), lang: 'zh' },
  { file: path.join(ROOT, 'site', 'en', 'changelog', 'index.html'), lang: 'en' },
]
const START = '<!-- changelog:auto:start -->'
const END = '<!-- changelog:auto:end -->'
const MAX_RELEASES = 8

function compareTagsDesc(left, right) {
  const parse = (tag) => tag.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)-([a-z]+)\.(\d+)\.shell\.(\d+)$/)
  const rank = (version) => {
    const match = parse(version)
    if (match === null) return [0, 0, 0, 0, 0, 0]
    const stage = { dev: 0, alpha: 1, beta: 2, rc: 3 }[match[4]] ?? 4
    return [Number(match[1]), Number(match[2]), Number(match[3]), stage, Number(match[5]), Number(match[6])]
  }
  const a = rank(left)
  const b = rank(right)
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return b[index] - a[index]
  }
  return 0
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Render the small inline Markdown subset the release notes use. */
function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
}

function parseNotes(tag, text, lang) {
  const kernelLine = /^内置内核.*$|^DeepSeek Harness.*$/m.exec(text)?.[0] ?? ''
  const sectionHeading = lang === 'zh' ? '## 本次更新' : '## English Summary'
  const fallbackHeading = lang === 'zh' ? '## English Summary' : '## 本次更新'
  const sectionStart = text.indexOf(sectionHeading) !== -1
    ? text.indexOf(sectionHeading)
    : text.indexOf(fallbackHeading)
  if (sectionStart === -1) return null
  const section = text.slice(sectionStart).split('\n## ')[0]
  const bullets = [...section.matchAll(/^- (.+)$/gm)].map(match => match[1])
  if (bullets.length === 0) return null
  const kernel = /`(@deepseek-ai\/dsh)`?\s*`?([\w.-]+)`?/.exec(kernelLine)?.[2]
    ?? /@deepseek-ai\/dsh`\s+`?([\w.-]+)/.exec(kernelLine)?.[1]
  return { tag, kernel, bullets }
}

async function main() {
  const files = (await readdir(NOTES)).filter(name => /^v[\w.-]+\.shell\.\d+\.md$/.test(name))
  const tags = files
    .map(name => name.replace(/\.md$/, ''))
    .sort(compareTagsDesc)
    .slice(0, MAX_RELEASES)
  const entries = []
  for (const tag of tags) {
    const text = await readFile(path.join(NOTES, `${tag}.md`), 'utf8')
    const entry = parseNotes(tag, text, 'zh')
    const entryEn = parseNotes(tag, text, 'en')
    if (entry !== null) entries.push({ zh: entry, en: entryEn ?? entry })
  }
  if (entries.length === 0) throw new Error('no parsable release notes found')

  for (const page of PAGES) {
    const html = await readFile(page.file, 'utf8')
    const start = html.indexOf(START)
    const end = html.indexOf(END)
    if (start === -1 || end === -1 || end < start) {
      throw new Error(`${page.file} is missing the ${START} / ${END} markers`)
    }
    const sections = entries.map(({ zh, en }) => {
      const entry = page.lang === 'zh' ? zh : en
      const kernel = entry.kernel === undefined ? '' : ` <small>（${page.lang === 'zh' ? '内核' : 'kernel'} ${escapeHtml(entry.kernel)}）</small>`
      return `  <h2>${escapeHtml(entry.tag)}${kernel}</h2>\n  <ul>\n${entry.bullets.map(bullet => `    <li>${inlineMarkdown(bullet)}</li>`).join('\n')}\n  </ul>`
    })
    const replacement = `${START}\n${sections.join('\n\n')}\n  ${END}`
    const updated = html.slice(0, start) + replacement + html.slice(end + END.length)
    if (updated !== html) await writeFile(page.file, updated, 'utf8')
    console.log(`site-changelog: ${path.relative(ROOT, page.file)} (${entries.length} releases, ${page.lang})`)
  }
}

main()
