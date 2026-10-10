import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { parse } from 'yaml'
// @ts-expect-error the build helper is a plain .mjs module
import { buildLdflags, createSidecarManifest, SIDECAR_BUILD_TAGS, targetForPlatform } from '../scripts/build-cc-connect.mjs'
import { isSmokeVersionMismatch, SMOKE_EXPECTED_VERSION_ENV } from '../src/main/smoke-protocol.ts'

test('electron-builder packs the agent trash hook next to the harness', () => {
  const config = parse(readFileSync('electron-builder.yml', 'utf8')) as {
    extraResources?: Array<{ from?: string; to?: string }>
  }
  const entry = (config.extraResources ?? []).find(item => item.from === 'resources/agent-trash-hook')
  assert.equal(entry?.to, 'agent-trash-hook')
  assert.equal(existsSync('resources/agent-trash-hook/agent-trash-hook.mjs'), true)
  assert.equal(existsSync('resources/agent-trash-hook/rm-parser.mjs'), true)
})

test('electron-builder packs the pinned cc-connect sidecar next to the other resources', () => {
  const config = parse(readFileSync('electron-builder.yml', 'utf8')) as {
    extraResources?: Array<{ from?: string; to?: string; filter?: string[] }>
    mac?: { signIgnore?: string[] }
  }
  const entry = (config.extraResources ?? []).find(item => item.from === 'resources/cc-connect')
  assert.equal(entry?.to, 'cc-connect')
  assert.deepEqual(entry?.filter, ['**/*'])
  assert.deepEqual(config.mac?.signIgnore, ['/Contents/Resources/cc-connect/bin/cc-connect$'])
})

test('cc-connect build metadata is platform-specific and records the binary digest', () => {
  assert.deepEqual(targetForPlatform('darwin', 'arm64'), {
    goos: 'darwin',
    goarch: 'arm64',
    binaryName: 'cc-connect',
  })
  assert.deepEqual(targetForPlatform('win32', 'x64'), {
    goos: 'windows',
    goarch: 'amd64',
    binaryName: 'cc-connect.exe',
  })

  const manifest = createSidecarManifest({
    commit: 'a'.repeat(40),
    platform: 'darwin',
    arch: 'arm64',
    binary: 'bin/cc-connect',
    sha256: 'b'.repeat(64),
  })
  assert.deepEqual(manifest, {
    version: 1,
    commit: 'a'.repeat(40),
    platform: 'darwin',
    arch: 'arm64',
    binary: 'bin/cc-connect',
    sha256: 'b'.repeat(64),
  })
  assert.match(buildLdflags('0.1.0', 'a'.repeat(40), '2026-10-07T00:00:00Z'), /main\.commit=a{40}/)
  assert.ok(SIDECAR_BUILD_TAGS.includes('no_web'))
  assert.ok(SIDECAR_BUILD_TAGS.includes('no_googlechat'))
})

test('cc-connect build is explicit and packaging invokes it', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts?: Record<string, string>
  }
  assert.equal(packageJson.scripts?.['cc-connect:build'], 'node scripts/build-cc-connect.mjs')
  assert.match(packageJson.scripts?.dist ?? '', /cc-connect:build/)
  assert.match(packageJson.scripts?.['dist:dir'] ?? '', /cc-connect:build/)
})

test('Windows installer verification checks the cc-connect sidecar and manifest', () => {
  const verifier = readFileSync('scripts/verify-windows-installer.mjs', 'utf8')
  assert.match(verifier, /resources\/cc-connect\/bin\/cc-connect\.exe/)
  assert.match(verifier, /cc-connect manifest sha256 does not match the packaged sidecar/)
})

test('packaged smoke rejects a stale unpacked app before boot', () => {
  assert.equal(SMOKE_EXPECTED_VERSION_ENV, 'DSH_SMOKE_EXPECTED_VERSION')
  assert.equal(isSmokeVersionMismatch('0.2.1-alpha.2.shell.0', '0.2.1-alpha.2.shell.0'), false)
  assert.equal(isSmokeVersionMismatch('0.2.1-alpha.1.shell.5', '0.2.1-alpha.2.shell.0'), true)
  assert.equal(isSmokeVersionMismatch(undefined, '0.2.1-alpha.2.shell.0'), false)

  const smoke = readFileSync('scripts/smoke-packaged.mjs', 'utf8')
  assert.match(smoke, /SMOKE_EXPECTED_VERSION_ENV/)
})
