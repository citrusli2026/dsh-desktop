import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Dependency-free build scripts intentionally stay plain ESM JavaScript.
import { harnessRuntimePaths, prependRuntimePath } from '../scripts/rebuild-harness-native.mjs'

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
