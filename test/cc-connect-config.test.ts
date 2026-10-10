import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  connectConfigPath,
  connectSettingsPath,
  readConnectSettings,
  renderConnectToml,
  writeConnectSettings,
  writeConnectToml,
  normalizeConnectSettings,
  CONNECT_DISPLAY_DEFAULTS,
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
    assert.deepEqual(await readConnectSettings(userData), { enabled: true, appId: 'cli_test', workspace: paths.workspace, ...CONNECT_DISPLAY_DEFAULTS })
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

test('legacy settings resolve all new defaults without rewriting the original file', async () => {
  const userData = await tempDir()
  try {
    await writeConnectSettings(userData, { enabled: true, appId: 'cli_old', workspace: paths.workspace })
    const legacy = JSON.stringify({ enabled: true, appId: 'cli_old', workspace: paths.workspace })
    await writeFile(connectSettingsPath(userData), legacy)
    assert.deepEqual(await readConnectSettings(userData), { enabled: true, appId: 'cli_old', workspace: paths.workspace, ...CONNECT_DISPLAY_DEFAULTS })
    assert.equal(await readFile(connectSettingsPath(userData), 'utf8'), legacy)
    assert.deepEqual(normalizeConnectSettings(null), { enabled: false, appId: '', workspace: '', ...CONNECT_DISPLAY_DEFAULTS })
  } finally { await rm(userData, { recursive: true, force: true }) }
})

test('normalize validates each preference and clamps only finite integer intervals', () => {
  for (const raw of [undefined, null, 'full\n[evil]', 42, {}, false]) {
    const settings = normalizeConnectSettings({ detail: raw, cardMode: raw, progressStyle: raw, showStreamPreview: raw })
    assert.equal(settings.detail, 'compact')
    assert.equal(settings.cardMode, 'legacy')
    assert.equal(settings.progressStyle, 'legacy')
    assert.equal(settings.showStreamPreview, raw === false ? false : true)
  }
  for (const raw of [undefined, null, '3000', NaN, Infinity, -Infinity, 1500.5]) {
    assert.equal(normalizeConnectSettings({ streamPreviewIntervalMs: raw }).streamPreviewIntervalMs, 3000)
  }
  for (const [input, expected] of [[-1, 500], [0, 500], [499, 500], [500, 500], [8000, 8000], [30000, 30000], [30001, 30000]]) {
    assert.equal(normalizeConnectSettings({ streamPreviewIntervalMs: input }).streamPreviewIntervalMs, expected)
  }
})

test('real cc-connect loader parses all detail/card/progress combinations and global preview placement', async () => {
  const root = await tempDir()
  try {
    const runner = join(root, 'parse.go')
    // Existing Go module/loader, not a second TOML parser or platform client.
    await writeFile(runner, `package main
import ("encoding/json"; "os"; "github.com/chenhg5/cc-connect/config")
func main() {
  results := []any{}
  for _, path := range os.Args[1:] {
    cfg, err := config.Load(path); if err != nil { panic(err) }
    if len(cfg.Projects) != 1 || len(cfg.Projects[0].Platforms) != 1 { panic("unexpected projects/platforms") }
    p := cfg.Projects[0]
    results = append(results, map[string]any{"display": p.Display, "preview": cfg.StreamPreview, "platform": p.Platforms[0].Options, "globalDisplay": cfg.Display})
  }
  if err := json.NewEncoder(os.Stdout).Encode(results); err != nil { panic(err) }
}`)
    const files: string[] = []
    const expected: Array<{ detail: string; cardMode: string; progressStyle: string; enabled: boolean; interval: number }> = []
    for (const detail of ['full', 'compact', 'quiet'] as const) {
      for (const cardMode of ['legacy', 'rich'] as const) {
        for (const progressStyle of ['legacy', 'compact', 'card'] as const) {
          const enabled = detail !== 'quiet'
          const interval = enabled ? 8000 : 30000
          const file = join(root, `${files.length}.toml`)
          await writeFile(file, renderConnectToml({ settings: { enabled: true, appId: 'cli_test', workspace: paths.workspace, detail, cardMode, progressStyle, showStreamPreview: enabled, streamPreviewIntervalMs: interval }, paths }))
          files.push(file); expected.push({ detail, cardMode, progressStyle, enabled, interval })
        }
      }
    }
    const defaultFile = join(root, 'default.toml')
    const defaults = renderConnectToml({ settings: { enabled: true, appId: 'cli_old', workspace: paths.workspace }, paths })
    await writeFile(defaultFile, defaults)
    files.push(defaultFile)
    expected.push({ detail: 'compact', cardMode: 'legacy', progressStyle: 'legacy', enabled: true, interval: 3000 })
    assert.equal((defaults.match(/\[stream_preview\]/g) ?? []).length, 1)
    assert.equal((defaults.match(/\[projects.display\]/g) ?? []).length, 1)
    const { stdout } = await promisify(execFile)('go', ['run', runner, ...files], { cwd: 'third_party/cc-connect', timeout: 60_000, env: { ...process.env, DSH_CC_CONNECT_FEISHU_SECRET: 'fake-parse-secret' } })
    const parsed = JSON.parse(stdout)
    assert.equal(parsed.length, 19)
    expected.forEach((item, index) => {
      const result = parsed[index]
      assert.equal(result.display.Mode, item.detail)
      assert.equal(result.display.ThinkingMessages, item.detail === 'full')
      assert.equal(result.display.ToolMessages, item.detail === 'full')
      assert.equal(result.display.CardMode, item.cardMode)
      assert.equal(result.preview.Enabled, item.enabled)
      assert.equal(result.preview.IntervalMs, item.interval)
      assert.equal(result.preview.MinDeltaChars, 80)
      assert.equal(result.globalDisplay.Mode, null, 'project display does not leak to the root table')
      assert.equal(result.platform.progress_style, item.progressStyle)
      assert.equal(result.platform.enable_feishu_card, true)
      assert.equal(result.platform.app_secret, 'fake-parse-secret')
    })
  } finally { await rm(root, { recursive: true, force: true }) }
})
