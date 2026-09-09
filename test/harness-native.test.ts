import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error Dependency-free build scripts intentionally stay plain ESM JavaScript.
import { harnessRuntimePaths, lockfileRequiresFsExt, planFsExtStep, prependRuntimePath } from '../scripts/rebuild-harness-native.mjs'

test('native harness rebuild resolves bundled Node and node-gyp on Unix', () => {
  assert.deepEqual(harnessRuntimePaths('/repo', 'linux'), {
    harness: '/repo/resources/harness',
    node: '/repo/resources/harness/node/bin/node',
    nodeGyp: '/repo/resources/harness/node/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js',
    fsExt: '/repo/resources/harness/node_modules/fs-ext',
  })
})

test('native harness rebuild resolves the normalized Windows Node layout', () => {
  const paths = harnessRuntimePaths('C:\\repo', 'win32')
  assert.match(paths.node, /resources[\\/]harness[\\/]node[\\/]bin[\\/]node\.exe$/)
  assert.match(paths.nodeGyp, /resources[\\/]harness[\\/]node[\\/]node_modules[\\/]npm[\\/]node_modules[\\/]node-gyp[\\/]bin[\\/]node-gyp\.js$/)
})

test('native harness rebuild places bundled Node first on PATH', () => {
  assert.equal(prependRuntimePath({ PATH: '/usr/bin' }, '/bundle/node/bin/node', 'linux').PATH, '/bundle/node/bin:/usr/bin')
  assert.equal(prependRuntimePath({ Path: 'C:\\Windows' }, 'C:\\bundle\\node\\bin\\node.exe', 'win32').Path, 'C:\\bundle\\node\\bin;C:\\Windows')
})

test('lockfile fs-ext detection matches package entries and importer keys, not fs-extra', () => {
  assert.equal(lockfileRequiresFsExt('packages:\n  fs-ext@2.1.1:\n    resolution: {integrity: sha512-x}\n'), true)
  assert.equal(lockfileRequiresFsExt('importers:\n  .:\n    dependencies:\n      fs-ext:\n        specifier: ^2.1.1\n'), true)
  assert.equal(lockfileRequiresFsExt('packages:\n  fs-extra@1.0.0:\n    resolution: {integrity: sha512-y}\n'), false)
  assert.equal(lockfileRequiresFsExt(''), false)
})

function planFixture(lockfileText: string | null): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-harness-native-'))
  if (lockfileText !== null) {
    const lockfileDir = join(root, 'manifest', 'harness')
    mkdirSync(lockfileDir, { recursive: true })
    writeFileSync(join(lockfileDir, 'pnpm-lock.yaml'), lockfileText)
  }
  return root
}

test('fs-ext step rebuilds when present regardless of the lockfile', () => {
  const root = planFixture('packages:\n  fs-ext@2.1.1:\n')
  assert.deepEqual(planFsExtStep(join(root, 'manifest', 'harness', 'pnpm-lock.yaml'), root), { action: 'rebuild' })
})

test('fs-ext step skips when absent and the lockfile no longer pins it', () => {
  const root = planFixture('packages:\n  koffi@3.1.6:\n  fs-extra@1.0.0:\n')
  assert.deepEqual(planFsExtStep(join(root, 'resources', 'harness', 'node_modules', 'fs-ext'), root), { action: 'skip' })
})

test('fs-ext step fails when the closure lost an fs-ext the lockfile still pins', () => {
  const root = planFixture('packages:\n  fs-ext@2.1.1:\n')
  const missing = join(root, 'resources', 'harness', 'node_modules', 'fs-ext')
  const planned = planFsExtStep(missing, root)
  assert.match(String(planned.error), /fsExt missing at .* while .* still pins it/)
})

test('fs-ext step fails loudly when the lockfile cannot verify the requirement', () => {
  const root = planFixture(null)
  const planned = planFsExtStep(join(root, 'resources', 'harness', 'node_modules', 'fs-ext'), root)
  assert.match(String(planned.error), /lockfile missing at .*; cannot verify the fs-ext requirement/)
})
