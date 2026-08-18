import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  modlensFailureHints,
  modlensPatchPath,
  prepareModlensMount,
  readModlensVersion,
  runModlensTest,
} from '../src/main/vision.ts'

async function fixtureHarness(): Promise<{ root: string; home: string; cleanup: () => Promise<void> }> {
  const base = await mkdtemp(join(tmpdir(), 'dsh-vision-test-'))
  const root = join(base, 'harness')
  const home = join(base, 'dsh-home')
  const pkgDir = join(root, 'node_modules', '@liustack', 'modlens')
  await mkdir(join(pkgDir, 'dsh'), { recursive: true })
  await writeFile(join(pkgDir, 'package.json'), '{"name":"@liustack/modlens","version":"3.17.2"}\n')
  await writeFile(join(pkgDir, 'cordis.patch.yml'), "- insert:\n    - id: modlens\n      name: '@liustack/modlens'\n")
  await writeFile(join(pkgDir, 'dsh', 'index.js'), 'export {}\n')
  return { root, home, cleanup: () => rm(base, { recursive: true, force: true }) }
}

test('modlensPatchPath locates the shipped patch overlay inside the closure', () => {
  assert.equal(
    modlensPatchPath('/bundle'),
    '/bundle/node_modules/@liustack/modlens/cordis.patch.yml',
  )
})

test('readModlensVersion reads the bundled version and tolerates a missing closure', async () => {
  const { root, cleanup } = await fixtureHarness()
  try {
    assert.equal(readModlensVersion(root), '3.17.2')
    assert.equal(readModlensVersion(join(root, 'does-not-exist')), undefined)
  } finally {
    await cleanup()
  }
})

test('modlensFailureHints classifies known engine failures into actionable hints', () => {
  const aggregate = 'Every configured vision provider failed for this image. pi could not print an API key for kimi-coding/k3. Run `pi auth` to check that credential. | claude-cli provider failed with code 1.'
  assert.deepEqual(modlensFailureHints(aggregate), [{ kind: 'pi-auth' }, { kind: 'claude-login' }])
  assert.deepEqual(
    modlensFailureHints("403 You've reached your usage limit for this billing cycle."),
    [{ kind: 'quota' }],
  )
  assert.deepEqual(modlensFailureHints('antigravity-cli: agy not on PATH'), [{ kind: 'agy' }])
  assert.deepEqual(modlensFailureHints('gemini-api: missing: apiKey'), [{ kind: 'api-key' }])
})

test('modlensFailureHints falls back to a generic hint with the raw message', () => {
  assert.deepEqual(modlensFailureHints('something else entirely'), [
    { kind: 'generic', message: 'something else entirely' },
  ])
  assert.deepEqual(modlensFailureHints(''), [])
  const long = modlensFailureHints('x'.repeat(500))
  assert.equal(long.length, 1)
  assert.equal(long[0]!.kind, 'generic')
  assert.equal(long[0]!.message, `${'x'.repeat(400)}…`)
})

test('prepareModlensMount links the bundle into the profile and returns the patch', async () => {
  const { root, home, cleanup } = await fixtureHarness()
  try {
    const patch = prepareModlensMount(home, root)
    assert.equal(patch, join(root, 'node_modules', '@liustack', 'modlens', 'cordis.patch.yml'))
    const link = join(home, 'profiles', 'node_modules', '@liustack', 'modlens')
    assert.equal(await readlink(link), join(root, 'node_modules', '@liustack', 'modlens'))
  } finally {
    await cleanup()
  }
})

test('prepareModlensMount returns undefined when the bundle is incomplete', async () => {
  const base = await mkdtemp(join(tmpdir(), 'dsh-vision-test-'))
  try {
    assert.equal(prepareModlensMount(join(base, 'home'), join(base, 'empty-harness')), undefined)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('prepareModlensMount retargets a stale fallback link', async () => {
  const { root, home, cleanup } = await fixtureHarness()
  try {
    const link = join(home, 'profiles', 'node_modules', '@liustack', 'modlens')
    await mkdir(join(link, '..'), { recursive: true })
    await mkdir(join(root, 'elsewhere'), { recursive: true })
    await symlink(join(root, 'elsewhere'), link, 'dir')
    const patch = prepareModlensMount(home, root)
    assert.equal(patch, modlensPatchPath(root))
    assert.equal(await readlink(link), join(root, 'node_modules', '@liustack', 'modlens'))
  } finally {
    await cleanup()
  }
})

test('prepareModlensMount never clobbers a profile-managed install', async () => {
  const { root, home, cleanup } = await fixtureHarness()
  try {
    const managed = join(home, 'profiles', 'node_modules', '@liustack', 'modlens')
    await mkdir(join(managed, 'dsh'), { recursive: true })
    await writeFile(join(managed, 'dsh', 'index.js'), '// user-managed install\n')
    const patch = prepareModlensMount(home, root)
    // The real directory already satisfies the loader, so the patch mounts.
    assert.equal(patch, modlensPatchPath(root))
    const entries = await readlink(managed).then(() => 'symlink', () => 'dir')
    assert.equal(entries, 'dir')
  } finally {
    await cleanup()
  }
})

async function fakeCliFixture(script: string): Promise<{ cli: string; cleanup: () => Promise<void> }> {
  const base = await mkdtemp(join(tmpdir(), 'dsh-vision-cli-'))
  const cli = join(base, 'fake-modlens.js')
  await writeFile(cli, script)
  return { cli, cleanup: () => rm(base, { recursive: true, force: true }) }
}

test('runModlensTest parses a successful recognition', async () => {
  const { cli, cleanup } = await fakeCliFixture("console.log(JSON.stringify({ result: 'a cat' }))\n")
  try {
    const result = await runModlensTest({ node: process.execPath, cli, providerTimeoutMs: 5_000, maxAttempts: 1, bufferMs: 1_000 })
    assert.equal(result.ok, true)
    assert.deepEqual(result.result, { result: 'a cat' })
    assert.equal(result.hints, undefined)
  } finally {
    await cleanup()
  }
})

test('runModlensTest surfaces a CLI failure with classified hints', async () => {
  const { cli, cleanup } = await fakeCliFixture("console.error('gemini-api: missing: apiKey'); process.exit(1)\n")
  try {
    const result = await runModlensTest({ node: process.execPath, cli, providerTimeoutMs: 5_000, maxAttempts: 1, bufferMs: 1_000 })
    assert.equal(result.ok, false)
    assert.match(result.error!, /missing: apiKey/)
    assert.deepEqual(result.hints, [{ kind: 'api-key' }])
  } finally {
    await cleanup()
  }
})

test('runModlensTest budgets the whole failover chain, not one provider', async () => {
  const { cli, cleanup } = await fakeCliFixture('setInterval(function(){}, 1000)\n')
  try {
    const started = Date.now()
    const result = await runModlensTest({ node: process.execPath, cli, providerTimeoutMs: 200, maxAttempts: 2, bufferMs: 300 })
    const elapsed = Date.now() - started
    assert.equal(result.ok, false)
    assert.match(result.error!, /timed out/)
    // Budget is 200*2+300 = 700ms. Killing at the per-provider budget (200ms)
    // would also surface a timeout, so assert the run really held the chain
    // budget open — that is what lets multi-engine failover finish.
    assert.ok(elapsed >= 700, `expected the run to last the full chain budget, took ${elapsed}ms`)
    assert.ok(elapsed < 5_000, `expected the run to end promptly, took ${elapsed}ms`)
  } finally {
    await cleanup()
  }
})
