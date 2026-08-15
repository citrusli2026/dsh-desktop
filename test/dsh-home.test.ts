/**
 * Unit tests for the desktop data-home resolution (src/main/dsh-home.ts):
 * isolated ~/.dsh-desktop by default, DSH_HOME override always wins
 * (docs/decisions/0012). Run with `pnpm run test`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DESKTOP_DSH_HOME_DIR, resolveDshHome } from '../src/main/dsh-home.ts'

test('defaults to an isolated ~/.dsh-desktop when DSH_HOME is unset', () => {
  assert.equal(resolveDshHome({}, '/home/alice'), join('/home/alice', '.dsh-desktop'))
  assert.equal(DESKTOP_DSH_HOME_DIR, '.dsh-desktop')
})

test('explicit DSH_HOME wins (e.g. ~/.dsh to share with the CLI)', () => {
  assert.equal(resolveDshHome({ DSH_HOME: '/home/alice/.dsh' }, '/home/alice'), '/home/alice/.dsh')
  assert.equal(resolveDshHome({ DSH_HOME: '/custom/home' }, '/home/alice'), '/custom/home')
})

test('blank / whitespace DSH_HOME falls back to the isolated default', () => {
  assert.equal(resolveDshHome({ DSH_HOME: '' }, '/home/alice'), join('/home/alice', '.dsh-desktop'))
  assert.equal(resolveDshHome({ DSH_HOME: '   ' }, '/home/alice'), join('/home/alice', '.dsh-desktop'))
})
