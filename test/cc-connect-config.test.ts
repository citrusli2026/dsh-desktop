import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  connectConfigPath,
  connectSettingsPath,
  readConnectSettings,
  renderConnectToml,
  writeConnectSettings,
  writeConnectToml,
} from '../src/main/cc-connect-config.ts'

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'cc-connect-config-test-'))
}

const paths = {
  dataDir: '/tmp/user data/cc-connect/data',
  nodeCommand: '/tmp/resources/harness/node/bin/node',
  dshEntry: '/tmp/resources/harness/node_modules/@deepseek-ai/dsh/lib/bin.js',
  dshHome: '/tmp/user home/.dsh-desktop',
  workspace: '/tmp/work spaces/project',
}

test('renderConnectToml emits only the fixed structure with escaped values and a secret placeholder', () => {
  const toml = renderConnectToml({
    settings: { enabled: true, appId: 'cli_"quoted"\nvalue', workspace: paths.workspace },
    paths,
  })
  assert.match(toml, /data_dir = "\/tmp\/user data\/cc-connect\/data"/)
  assert.match(toml, /app_id = "cli_\\"quoted\\"\\nvalue"/)
  assert.match(toml, /app_secret = "\$\{DSH_CC_CONNECT_FEISHU_SECRET\}"/)
  assert.equal((toml.match(/DSH_CC_CONNECT_FEISHU_SECRET/g) ?? []).length, 1)
  assert.doesNotMatch(toml, /fake-feishu-secret/)
  assert.match(toml, /command = "\/tmp\/resources\/harness\/node\/bin\/node"/)
  assert.match(toml, /work_dir = "\/tmp\/work spaces\/project"/)
})
test('renderConnectToml rejects non-absolute runtime paths', () => {
  assert.throws(() => renderConnectToml({
    settings: { enabled: true, appId: 'cli_test', workspace: 'relative/workspace' },
    paths: { ...paths, workspace: 'relative/workspace' },
  }), /workspace must be absolute/)
})

test('settings and TOML writes are atomic 0600 files under userData/cc-connect', async () => {
  const userData = await tempDir()
  try {
    await writeConnectSettings(userData, { enabled: true, appId: 'cli_test', workspace: paths.workspace })
    assert.deepEqual(await readConnectSettings(userData), { enabled: true, appId: 'cli_test', workspace: paths.workspace })
    assert.equal((await stat(connectSettingsPath(userData))).mode & 0o777, 0o600)

    await writeConnectToml(userData, {
      settings: { enabled: true, appId: 'cli_test', workspace: paths.workspace },
      paths,
    })
    const toml = await readFile(connectConfigPath(userData), 'utf8')
    assert.match(toml, /app_secret = "\$\{DSH_CC_CONNECT_FEISHU_SECRET\}"/)
    assert.equal((await stat(connectConfigPath(userData))).mode & 0o777, 0o600)
    assert.deepEqual((await readdir(join(userData, 'cc-connect'))).sort(), ['config.toml', 'settings.json'])
  } finally {
    await rm(userData, { recursive: true, force: true })
  }
})
