import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Dependency-free build scripts intentionally stay plain ESM JavaScript.
import { syncKernelPeerPins } from '../scripts/kernel-peers.mjs'

test('syncKernelPeerPins moves kernel-versioned peers and leaves everything else alone', () => {
  const deps: Record<string, string> = {
    '@deepseek-ai/dsh': '0.1.5-rc.2',
    '@deepseek-ai/dsh-settings': '^0.1.5-rc.1',
    '@deepseek-ai/dsh-util-time': '^0.1.5-rc.1',
    '@deepseek-ai/dsh-session-turn-outline': '^0.1.5-rc.1',
    'dsh-desktop-controls': 'file:../../plugins/dsh-desktop-controls',
    '@deepseek-ai/cordis-plugin-group': '^1.0.2',
    yaml: '^2.9.0',
  }
  const synced = syncKernelPeerPins(deps, '0.1.5-rc.1', '0.1.5-rc.2')
  assert.equal(synced['@deepseek-ai/dsh'], '0.1.5-rc.2')
  assert.equal(synced['@deepseek-ai/dsh-settings'], '^0.1.5-rc.2')
  assert.equal(synced['@deepseek-ai/dsh-util-time'], '^0.1.5-rc.2')
  assert.equal(synced['@deepseek-ai/dsh-session-turn-outline'], '^0.1.5-rc.2')
  assert.equal(synced['dsh-desktop-controls'], 'file:../../plugins/dsh-desktop-controls')
  assert.equal(synced['@deepseek-ai/cordis-plugin-group'], '^1.0.2')
  assert.equal(synced.yaml, '^2.9.0')
})

test('syncKernelPeerPins rewrites unions that mention the old version', () => {
  const deps: Record<string, string> = {
    '@deepseek-ai/dsh-settings': '^0.1.4 || ^0.1.5-rc.1',
  }
  syncKernelPeerPins(deps, '0.1.5-rc.1', '0.1.5-rc.2')
  assert.equal(deps['@deepseek-ai/dsh-settings'], '^0.1.4 || ^0.1.5-rc.2')
})

test('syncKernelPeerPins keeps peers that never named the old version', () => {
  const deps: Record<string, string> = {
    '@deepseek-ai/dsh-settings': '^0.1.5-rc.2',
  }
  syncKernelPeerPins(deps, '0.1.5-rc.1', '0.1.5-rc.2')
  assert.equal(deps['@deepseek-ai/dsh-settings'], '^0.1.5-rc.2')
})

import { kernelCompatAdvisory, rangeCoversKernel } from '../src/main/plugin-compat.ts'

test('rangeCoversKernel follows npm prerelease semantics on the observed declarations', () => {
  // dshmarket declares three caret clauses; 0.1.2-rc.1 shares the tuple with
  // the third, 0.1.5-rc.2 shares none (stale under-declaration).
  const dshmarket = '^0.1.0-rc.7 || ^0.1.1-rc.2 || ^0.1.2-alpha.2'
  assert.equal(rangeCoversKernel(dshmarket, '0.1.2-rc.1'), true)
  assert.equal(rangeCoversKernel(dshmarket, '0.1.2'), true)
  assert.equal(rangeCoversKernel(dshmarket, '0.1.5-rc.2'), false)
  // agent-teams declares exact versions in a union.
  const agentTeams = '0.1.5-rc.1 || 0.1.2-rc.1 || 0.1.2-alpha.5'
  assert.equal(rangeCoversKernel(agentTeams, '0.1.5-rc.1'), true)
  assert.equal(rangeCoversKernel(agentTeams, '0.1.5-rc.2'), false)
  // Caret with a prerelease bound covers later prereleases of the same tuple.
  assert.equal(rangeCoversKernel('^0.1.5-rc.2', '0.1.5-rc.3'), true)
  assert.equal(rangeCoversKernel('^0.1.5-rc.2', '0.1.5'), true)
  assert.equal(rangeCoversKernel('^0.1.5-rc.2', '0.1.6-alpha.1'), false)
  assert.equal(rangeCoversKernel('~1.2.3', '1.2.9'), true)
  assert.equal(rangeCoversKernel('~1.2.3', '1.3.0'), false)
})

test('kernelCompatAdvisory only speaks up when kernel peers are declared and uncovered', () => {
  const peers = { '@deepseek-ai/dsh-settings': '^0.1.2-alpha.2', '@deepseek-ai/cordis': '^4.0.1' }
  assert.deepEqual(kernelCompatAdvisory(peers, '0.1.2-rc.1'), { declared: true, covers: true })
  assert.deepEqual(kernelCompatAdvisory(peers, '0.1.5-rc.2'), { declared: true, covers: false })
  assert.deepEqual(kernelCompatAdvisory({ '@deepseek-ai/cordis': '^4.0.1' }, '0.1.5-rc.2'), { declared: false, covers: true })
  assert.deepEqual(kernelCompatAdvisory(undefined, '0.1.5-rc.2'), { declared: false, covers: true })
})
