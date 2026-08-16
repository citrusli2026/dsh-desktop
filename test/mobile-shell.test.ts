import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readMobileShellArtifact } from '../src/main/mobile-shell.ts'

function makeArtifact(entrypoints = {
  proxy: 'proxy/dsh-remote.mjs',
  launcher: 'app/www/index.html',
  pairing: 'proxy/pairing-qr.mjs',
}): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-mobile-shell-web-'))
  for (const file of Object.values(entrypoints)) {
    const target = join(root, file)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, '')
  }
  writeFileSync(join(root, 'web-artifact.json'), JSON.stringify({
    format: 'dsh-mobile-shell-web',
    formatVersion: 1,
    version: '0.1.0',
    entrypoints,
  }))
  return root
}

test('mobile-shell adapter reads the versioned Web artifact contract', () => {
  const root = makeArtifact()
  try {
    const artifact = readMobileShellArtifact(root)
    assert.equal(artifact.manifest.formatVersion, 1)
    assert.equal(artifact.proxyPath, join(root, 'proxy/dsh-remote.mjs'))
    assert.equal(artifact.launcherPath, join(root, 'app/www/index.html'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('mobile-shell adapter rejects entrypoints outside the artifact root', () => {
  const root = makeArtifact({
    proxy: '../proxy.mjs',
    launcher: 'app/www/index.html',
    pairing: 'proxy/pairing-qr.mjs',
  })
  try {
    assert.throws(() => readMobileShellArtifact(root), /escapes the artifact root/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
