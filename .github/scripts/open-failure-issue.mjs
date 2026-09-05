#!/usr/bin/env node
/**
 * Open (or append to) an issue when an automation workflow fails, so a silent
 * CI break never leaves the release chain or site data silently stale.
 * Dedupes on the exact open-issue title; a later failure of the same kind
 * comments on the existing issue instead of stacking duplicates.
 *
 * Usage (run in a GitHub Actions checkout; gh is authenticated via GITHUB_TOKEN):
 *   node .github/scripts/open-failure-issue.mjs "<title>" "<body>"
 */
import { execFileSync } from 'node:child_process'

const [, , title, body] = process.argv
if (typeof title !== 'string' || title === '' || typeof body !== 'string' || body === '') {
  console.error('usage: open-failure-issue.mjs "<title>" "<body>"')
  process.exit(2)
}

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', ...(input === undefined ? {} : { input }) }).trim()
}

const repo = process.env.GITHUB_REPOSITORY
if (repo === undefined) throw new Error('GITHUB_REPOSITORY is not set')
const runUrl = `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`
const fullBody = `${body}\n\nFailing run: ${runUrl}`

const existing = gh(['search', 'issues', '--repo', repo, `"${title}"`, '--state', 'open', '--json', 'number', '--jq', '.[0].number'])
if (existing === '' || existing === 'null' || existing === '[]' || Number(existing) === 0) {
  gh(['issue', 'create', '--repo', repo, '--title', title, '--body', fullBody])
  console.log(`open-failure-issue: created "${title}"`)
} else {
  gh(['issue', 'comment', '--repo', repo, String(existing), '--body', `Failure recurred.\n\n${fullBody}`])
  console.log(`open-failure-issue: commented on #${existing} for "${title}"`)
}
