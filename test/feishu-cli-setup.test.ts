import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('one-click Feishu setup delegates to the official CLI installer without credentials', async () => {
  const result = spawnSync(process.execPath, ['scripts/setup-feishu-cli.mjs', '--dry-run'], {
    encoding: 'utf8',
  })

  assert.equal(result.status, 0)
  assert.match(result.stdout, /npx --yes @larksuite\/cli@latest install --lang zh/)
  assert.doesNotMatch(result.stdout, /app_secret|token|secret/i)
})

test('package and reusable skill expose the same setup entry point', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
    scripts?: Record<string, string>
  }
  const skill = await readFile('.agents/skills/feishu-dsh-setup/SKILL.md', 'utf8')

  assert.equal(packageJson.scripts?.['feishu:setup'], 'node scripts/setup-feishu-cli.mjs')
  assert.match(skill, /pnpm run feishu:setup/)
  assert.match(skill, /cc-connect feishu setup/)
  assert.match(skill, /App Secret/)
  assert.match(skill, /repository file/)
})
