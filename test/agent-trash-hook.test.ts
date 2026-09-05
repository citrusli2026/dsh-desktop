/**
 * Unit tests for the agent deletion interceptor's command parser
 * (resources/agent-trash-hook/rm-parser.mjs). The parser decides between
 * allow (no deletion), move (confident parse: targets go to the desktop
 * trash), and block (ambiguous or outside the guarded roots).
 * Run with `pnpm run test` (node --test).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error the shipped hook parser is a plain .mjs module
import { parseDeletionCommand, tokenize } from '../resources/agent-trash-hook/rm-parser.mjs'

// A real directory so chdir lands somewhere valid: relative rm targets
// resolve against the hook process cwd, which the bridge pins to the
// session workspace.
const PROJECT = await realpath(await mkdtemp(join(tmpdir(), 'dsh-trash-hook-')))
process.chdir(PROJECT)
process.env.DSH_HOME = '/Users/me/.dsh-desktop'
const HOME = '/Users/me/.dsh-desktop'

test('tokenize respects quotes and splits on separators', () => {
  assert.deepEqual(tokenize("rm 'a b.txt' c.txt"), [
    { type: 'word', value: 'rm' },
    { type: 'word', value: 'a b.txt' },
    { type: 'word', value: 'c.txt' },
  ])
  assert.deepEqual(tokenize('rm a.txt; rm b.txt'), [
    { type: 'word', value: 'rm' },
    { type: 'word', value: 'a.txt' },
    { type: 'separator' },
    { type: 'word', value: 'rm' },
    { type: 'word', value: 'b.txt' },
  ])
  // Unterminated quote fails closed into a single separator token.
  assert.deepEqual(tokenize("rm 'unterminated"), [{ type: 'separator' }])
})

test('commands without deletions are allowed', () => {
  assert.deepEqual(parseDeletionCommand('ls -la', PROJECT), { action: 'allow' })
  assert.deepEqual(parseDeletionCommand('git rm --cached x', PROJECT), { action: 'allow' })
  assert.deepEqual(parseDeletionCommand('echo rm', PROJECT), { action: 'allow' })
  assert.deepEqual(parseDeletionCommand('', PROJECT), { action: 'allow' })
})

test('plain rm targets move into the trash', () => {
  const decision = parseDeletionCommand('rm -rf build/ dist/', PROJECT)
  assert.equal(decision.action, 'move')
  // Targets come back resolved: the mover needs absolute paths.
  if (decision.action === 'move') {
    assert.deepEqual(decision.paths, [join(PROJECT, 'build'), join(PROJECT, 'dist')])
  }
  assert.deepEqual(parseDeletionCommand(`rm -- "${PROJECT}/tmp/x.txt"`, PROJECT), {
    action: 'move',
    paths: [`${PROJECT}/tmp/x.txt`],
  })
  assert.deepEqual(parseDeletionCommand('unlink old.json', PROJECT).action, 'move')
})

test('unrecognized flags block instead of guessing', () => {
  for (const command of ['rm -e x.txt', 'rm --preserve-root /x', 'rm --unknown-flag x']) {
    const decision = parseDeletionCommand(command, PROJECT)
    assert.equal(decision.action, 'block', command)
  }
  const pwsh = parseDeletionCommand('Remove-Item -Recurse -Force build', PROJECT)
  assert.equal(pwsh.action, 'move')
  const pwshUnknown = parseDeletionCommand('Remove-Item -Stream x build', PROJECT)
  assert.equal(pwshUnknown.action, 'block')
  // No targets = no deletion happens; allow.
  assert.equal(parseDeletionCommand('rm -rf', PROJECT).action, 'allow')
})

test('dependency and VCS paths are exempt and block outright', () => {
  const decision = parseDeletionCommand('rm -rf node_modules .git', PROJECT)
  assert.equal(decision.action, 'block')
  if (decision.action === 'block') assert.match(decision.reason, /node_modules/)
})

test('deletions outside the workspace and DSH_HOME block', () => {
  const decision = parseDeletionCommand('rm /etc/hosts', PROJECT)
  assert.equal(decision.action, 'block')
  if (decision.action === 'block') assert.match(decision.reason, /outside the workspace/)
  // DSH_HOME contents are guarded too.
  assert.equal(parseDeletionCommand('rm /Users/me/.dsh-desktop/sessions/x/zstd', PROJECT).action, 'move')
})

test('PowerShell Remove-Item moves when flags are known', () => {
  const decision = parseDeletionCommand(`Remove-Item -LiteralPath "${PROJECT}/build log.txt"`, PROJECT)
  assert.equal(decision.action, 'move')
  const rd = parseDeletionCommand('rd /s /q build', PROJECT)
  // `rd` with cmd-style flags is not a known POSIX rmdir form — fail closed.
  assert.equal(rd.action, 'block')
})
