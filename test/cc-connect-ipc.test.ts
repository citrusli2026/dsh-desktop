import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

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
