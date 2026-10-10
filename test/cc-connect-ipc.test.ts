import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
import { readConnectSettings, writeConnectSettings, connectSettingsPath, CONNECT_DISPLAY_DEFAULTS } from '../src/main/cc-connect-config.ts'
import { ConnectCredentials, credentialsPath } from '../src/main/cc-connect-credentials.ts'
import type { ConnectSaveResult, ConnectSettingsInput } from '../src/main/cc-connect-types.ts'

const preload = readFileSync('src/preload/index.ts', 'utf8')
const main = readFileSync('src/main/index.ts', 'utf8')

test('preload exposes only the narrow cc-connect bridge', () => {
  for (const [method, channel] of [
    ['getConnectState', 'desktop:connect:get-state'],
    ['saveConnectSettings', 'desktop:connect:save-settings'],
    ['pickConnectWorkspace', 'desktop:connect:pick-workspace'],
    ['startConnect', 'desktop:connect:start'],
    ['stopConnect', 'desktop:connect:stop'],
    ['restartConnect', 'desktop:connect:restart'],
  ]) {
    assert.match(preload, new RegExp(`${method}:[\\s\\S]*?ipcRenderer\\.invoke\\('${channel}'`))
  }
  assert.doesNotMatch(preload, /readSecret/)
})

test('cc-connect IPC handlers guard the Harness sender and use a native workspace picker', () => {
  for (const channel of [
    'desktop:connect:get-state',
    'desktop:connect:save-settings',
    'desktop:connect:pick-workspace',
    'desktop:connect:start',
    'desktop:connect:stop',
    'desktop:connect:restart',
  ]) {
    assert.match(main, new RegExp(`ipcMain\\.handle\\('${channel}'[\\s\\S]*?isMainWindowHarnessSender`))
  }
  assert.match(main, /dialog\.showOpenDialog[\s\S]*openDirectory/)
  assert.match(main, /isAbsolute\(.*workspace|workspace.*isAbsolute\(/)
  assert.match(main, /secretConfigured/)
})

/** Execute the actual registered save/get handlers with real temporary config
 * and credential storage. Only Electron/lifecycle capabilities are faked. */
async function settingsIPC(active = false) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-connect-ipc-'))
  let restarts = 0
  let stops = 0
  class Credentials extends ConnectCredentials {
    constructor(path: string) { super(path, { isEncryptionAvailable: () => false, encryptString: () => { throw new Error('unused') }, decryptString: () => { throw new Error('unused') } }) }
  }
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
  const functions = main.slice(main.indexOf('function connectStateFromRuntime('), main.indexOf('async function createConnectSupervisor('))
  const registrations = main.slice(main.indexOf("ipcMain.handle('desktop:connect:get-state'"), main.indexOf("ipcMain.handle('desktop:connect:pick-workspace'"))
  assert.ok(functions && registrations)
  runInNewContext(transformSync(functions + registrations, { loader: 'ts', format: 'cjs' }).code, {
    app: { getPath: () => home }, readConnectSettings, writeConnectSettings, credentialsPath,
    ConnectCredentials: Credentials, isAbsolute, stat, console,
    connectSupervisor: active ? {} : undefined, lastConnectRuntimeState: active ? { phase: 'ready' } : undefined,
    stopConnectSupervisor: async () => { stops++ }, restartConnectForCurrentKernel: async () => { restarts++; return true },
    windowContext: { mainWindow: {}, allowedOrigin: 'test-harness' },
    isMainWindowHarnessSender: (_window: unknown, sender: unknown) => sender === 'authorized',
    ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(channel, handler) },
  })
  return {
    home, get restarts() { return restarts }, get stops() { return stops },
    save: (input: unknown, authorized = true) => handlers.get('desktop:connect:save-settings')!({ sender: authorized ? 'authorized' : 'untrusted' }, input) as Promise<ConnectSaveResult | null>,
    state: () => handlers.get('desktop:connect:get-state')!({ sender: 'authorized' }),
    close: () => rm(home, { recursive: true, force: true }),
  }
}

test('save-settings accepts display preferences, returns resolved state and preserves them for legacy callers', async () => {
  const ipc = await settingsIPC(true)
  try {
    const input: ConnectSettingsInput = { enabled: true, appId: 'cli_fake', workspace: ipc.home, appSecret: 'fake-ipc-secret', detail: 'quiet', cardMode: 'rich', progressStyle: 'card', showStreamPreview: false, streamPreviewIntervalMs: 90000 }
    const result = await ipc.save(input)
    assert.equal(result?.ok, true)
    assert.equal(result!.state.detail, 'quiet')
    assert.equal(result!.state.streamPreviewIntervalMs, 30000)
    assert.equal(result!.state.cardMode, 'rich')
    assert.equal(result!.state.progressStyle, 'card')
    assert.equal(result!.state.showStreamPreview, false)
    assert.equal(ipc.restarts, 1)
    assert.equal(await new ConnectCredentials(credentialsPath(ipc.home), { isEncryptionAvailable: () => false, encryptString: () => Buffer.alloc(0), decryptString: () => '' }).readSecret(), 'fake-ipc-secret')
    const oldCall = await ipc.save({ enabled: true, appId: 'cli_fake', workspace: ipc.home, appSecret: '' })
    assert.equal(oldCall?.ok, true)
    assert.equal(oldCall!.state.detail, 'quiet')
    assert.equal(oldCall!.state.streamPreviewIntervalMs, 30000)
    assert.equal(oldCall!.state.secretConfigured, true)
    assert.doesNotMatch(JSON.stringify(await ipc.state()), /fake-ipc-secret|appSecret/)
    assert.doesNotMatch(await readFile(connectSettingsPath(ipc.home), 'utf8'), /fake-ipc-secret|appSecret/)
  } finally { await ipc.close() }
})

test('save-settings rejects each invalid field before changing settings or credentials and guards the sender', async () => {
  const ipc = await settingsIPC()
  try {
    const base = { enabled: true, appId: 'cli_fake', workspace: ipc.home, appSecret: 'fake-before' }
    assert.equal((await ipc.save(base))?.ok, true)
    const settings = await readFile(connectSettingsPath(ipc.home), 'utf8')
    const credentials = await readFile(credentialsPath(ipc.home), 'utf8')
    for (const fields of [
      { detail: 'loud' }, { detail: null }, { cardMode: 'unknown' }, { cardMode: false },
      { progressStyle: 'unknown' }, { progressStyle: 1 }, { showStreamPreview: 'false' },
      { streamPreviewIntervalMs: '3000' }, { streamPreviewIntervalMs: NaN }, { streamPreviewIntervalMs: Infinity },
      { streamPreviewIntervalMs: 1000.5 }, { streamPreviewIntervalMs: null },
    ]) {
      const result = await ipc.save({ ...base, appSecret: 'fake-after', ...fields })
      assert.equal(result?.ok, false)
      assert.equal(result && 'reason' in result ? result.reason : '', 'invalid-input')
      assert.equal(await readFile(connectSettingsPath(ipc.home), 'utf8'), settings)
      assert.equal(await readFile(credentialsPath(ipc.home), 'utf8'), credentials)
    }
    assert.equal(await ipc.save(base, false), null)
    assert.equal(await readFile(connectSettingsPath(ipc.home), 'utf8'), settings)
    assert.equal(ipc.restarts, 0)
  } finally { await ipc.close() }
})

test('display saves without a running supervisor do not implicitly start, and disabling still stops', async () => {
  const ipc = await settingsIPC()
  try {
    const legacy = await ipc.save({ enabled: false, appId: '', workspace: '' })
    assert.equal(legacy?.ok, true)
    for (const [key, value] of Object.entries(CONNECT_DISPLAY_DEFAULTS)) assert.equal(legacy!.state[key as keyof typeof legacy.state], value)
    const result = await ipc.save({ enabled: true, appId: 'cli_fake', workspace: ipc.home, detail: 'full', streamPreviewIntervalMs: -1 })
    assert.equal(result?.ok, true)
    assert.equal(result!.state.phase, 'stopped')
    assert.equal(result!.state.streamPreviewIntervalMs, 500)
    assert.equal(ipc.restarts, 0)
    assert.equal(ipc.stops, 1)
  } finally { await ipc.close() }
})
