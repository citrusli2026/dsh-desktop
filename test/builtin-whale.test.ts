/**
 * Built-in whale widget (ADR 0044): the shell mounts its vendored copy only
 * while the setting is on, and disabling it must not look like a user-managed
 * plugin install. These tests run against a temp "harness" tree so no Electron
 * or real profile is involved.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile, lstat, readlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareWhaleMount, whalePatchPath } from '../src/main/builtin-whale.ts'

async function fixture(): Promise<{ root: string; home: string; harness: string; cleanup(): Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'builtin-whale-'))
  const harness = join(root, 'harness')
  const home = join(root, 'home')
  const pkg = join(harness, 'node_modules', 'dsh-whale-widget')
  await mkdir(join(pkg, 'lib'), { recursive: true })
  await mkdir(join(pkg, 'assets'), { recursive: true })
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'dsh-whale-widget', version: '0.4.2', dsh: { companion: { route: '/dsh-whale/pet' } } }))
  await writeFile(join(pkg, 'cordis.patch.yml'), '- insert:\n    - id: dsh-whale-widget\n      name: dsh-whale-widget\n')
  await writeFile(join(pkg, 'lib', 'index.js'), 'export function apply() {}\n')
  await writeFile(join(pkg, 'assets', 'whale-widget.js'), '// client\n')
  await mkdir(join(home, 'profiles', 'web'), { recursive: true })
  return { root, home, harness, cleanup: () => rm(root, { recursive: true, force: true }) }
}

test('disabled leaves no patch and no profile links', async () => {
  const f = await fixture()
  try {
    assert.equal(prepareWhaleMount(f.home, f.harness, false), undefined)
    await assert.rejects(lstat(join(f.home, 'profiles', 'web', 'node_modules', 'dsh-whale-widget')))
    await assert.rejects(lstat(join(f.home, 'profiles', 'node_modules', 'dsh-whale-widget')))
  } finally { await f.cleanup() }
})

test('enabled returns the patch and links the package into the web profile', async () => {
  const f = await fixture()
  try {
    const patch = prepareWhaleMount(f.home, f.harness, true)
    assert.equal(patch, whalePatchPath(f.harness))
    for (const link of [
      join(f.home, 'profiles', 'web', 'node_modules', 'dsh-whale-widget'),
      join(f.home, 'profiles', 'node_modules', 'dsh-whale-widget'),
    ]) {
      assert.equal((await lstat(link)).isSymbolicLink(), true)
      assert.equal(await readlink(link), join(f.harness, 'node_modules', 'dsh-whale-widget'))
    }
  } finally { await f.cleanup() }
})

test('turning it off removes only the shell-owned links', async () => {
  const f = await fixture()
  try {
    prepareWhaleMount(f.home, f.harness, true)
    assert.equal(prepareWhaleMount(f.home, f.harness, false), undefined)
    await assert.rejects(lstat(join(f.home, 'profiles', 'web', 'node_modules', 'dsh-whale-widget')))
  } finally { await f.cleanup() }
})

test('a user-managed real package is never replaced or removed', async () => {
  const f = await fixture()
  try {
    const real = join(f.home, 'profiles', 'web', 'node_modules', 'dsh-whale-widget')
    await mkdir(real, { recursive: true })
    prepareWhaleMount(f.home, f.harness, true)
    assert.equal((await lstat(real)).isSymbolicLink(), false, 'real directory kept')
    prepareWhaleMount(f.home, f.harness, false)
    assert.equal((await lstat(real)).isSymbolicLink(), false, 'real directory still kept')
  } finally { await f.cleanup() }
})

test('an incomplete package is not mounted', async () => {
  const f = await fixture()
  try {
    await rm(join(f.harness, 'node_modules', 'dsh-whale-widget', 'assets', 'whale-widget.js'))
    assert.equal(prepareWhaleMount(f.home, f.harness, true), undefined)
  } finally { await f.cleanup() }
})
