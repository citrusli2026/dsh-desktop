import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ccConnectBin, ccConnectManifestPath, dshBin, nodeBin } from '../src/main/paths.ts'

test('nodeBin selects the platform executable inside the supplied closure', () => {
  assert.equal(nodeBin('/bundle', 'darwin'), '/bundle/node/bin/node')
  assert.equal(nodeBin('/bundle', 'linux'), '/bundle/node/bin/node')
  assert.equal(nodeBin('/bundle', 'win32'), '/bundle/node/bin/node.exe')
})

test('dshBin locates the published CLI entry inside the supplied closure', () => {
  assert.equal(dshBin('/bundle'), '/bundle/node_modules/@deepseek-ai/dsh/lib/bin.js')
})

test('ccConnectBin resolves the bundled sidecar without consulting PATH', () => {
  assert.equal(ccConnectBin('/bundle', 'darwin'), '/bundle/cc-connect/bin/cc-connect')
  assert.equal(ccConnectBin('/bundle', 'linux'), '/bundle/cc-connect/bin/cc-connect')
  assert.equal(ccConnectBin('/bundle', 'win32'), '/bundle/cc-connect/bin/cc-connect.exe')
})

test('ccConnectManifestPath resolves beside the bundled sidecar', () => {
  assert.equal(ccConnectManifestPath('/bundle'), '/bundle/cc-connect/manifest.json')
})
