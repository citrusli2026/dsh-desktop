import { test } from 'node:test'
import assert from 'node:assert/strict'
import { desktopPreferenceCapabilities, DesktopPreferencesController } from '../src/main/desktop-preferences.ts'
import type { DesktopPreferences, ShellPreferencesStore } from '../src/main/shell-preferences.ts'

function createStore(initial: Partial<DesktopPreferences> = {}): ShellPreferencesStore {
  let value: DesktopPreferences = {
    shortcut: 'CommandOrControl+Shift+Space',
    launchAtLogin: false,
    launchHidden: false,
    notificationsEnabled: true,
    safeMode: false,
    screenCapture: false,
    firstRunGuideDismissed: false,
    firstTaskCompleted: false,
    ...initial,
  }
  return {
    shouldExplainCloseToTray: () => false,
    markCloseToTrayExplained: () => {},
    getDesktopPreferences: () => value,
    updateDesktopPreferences: patch => value = { ...value, ...patch },
  }
}

function createRegistrar(blocked: readonly string[] = []) {
  const active = new Set<string>()
  const callbacks = new Map<string, () => void>()
  const registrar = {
    register(accelerator: string, callback: () => void): boolean {
      if (blocked.includes(accelerator)) return false
      active.add(accelerator)
      callbacks.set(accelerator, callback)
      return true
    },
    unregister(accelerator: string): void {
      active.delete(accelerator)
      callbacks.delete(accelerator)
    },
  }
  return { registrar, active, callbacks }
}

test('initializes the selected shortcut and packaged login item without showing the window', () => {
  const loginCalls: Array<{ openAtLogin: boolean; openAsHidden: boolean }> = []
  let loginState = { wasOpenedAtLogin: true, wasOpenedAsHidden: true }
  const shortcut = createRegistrar()
  const controller = new DesktopPreferencesController({
    store: createStore({ shortcut: 'Ctrl+Alt+K', launchAtLogin: true, launchHidden: true }),
    registrar: shortcut.registrar,
    onSummon: () => {},
    platform: 'win32',
    packaged: true,
    loginItems: {
      getLoginItemSettings: () => loginState,
      setLoginItemSettings: settings => loginCalls.push(settings),
    },
    notificationsAvailable: true,
  })
  controller.initialize()
  assert.deepEqual(loginCalls, [{ openAtLogin: true, openAsHidden: true }])
  assert.equal(controller.snapshot.shortcutLabel, 'Ctrl + Alt + K')
  assert.equal(controller.snapshot.shortcutRegistered, true)
  assert.equal(controller.shouldStartHidden(), true)
  loginState = { wasOpenedAtLogin: false, wasOpenedAsHidden: false }
  assert.equal(controller.shouldStartHidden(), false)
  controller.dispose()
  assert.deepEqual([...shortcut.active], [])
})

test('a conflicting shortcut leaves the existing registration and preference intact', () => {
  const shortcut = createRegistrar(['Ctrl+Alt+K'])
  const store = createStore()
  const controller = new DesktopPreferencesController({
    store,
    registrar: shortcut.registrar,
    onSummon: () => {},
    platform: 'linux',
    packaged: false,
    notificationsAvailable: false,
  })
  controller.initialize()
  const result = controller.update({ shortcut: 'Ctrl+Alt+K' })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, 'conflict')
  assert.equal(controller.snapshot.shortcut, 'CommandOrControl+Shift+Space')
  assert.equal(controller.snapshot.shortcutRegistered, true)
  assert.deepEqual([...shortcut.active], ['CommandOrControl+Shift+Space'])
})

test('updates startup, hidden launch, and notification preferences', () => {
  const calls: Array<{ openAtLogin: boolean; openAsHidden: boolean }> = []
  const controller = new DesktopPreferencesController({
    store: createStore(),
    registrar: createRegistrar().registrar,
    onSummon: () => {},
    platform: 'darwin',
    packaged: true,
    loginItems: { setLoginItemSettings: settings => calls.push(settings) },
    notificationsAvailable: true,
  })
  controller.initialize()
  assert.equal(controller.update({ launchAtLogin: true }).ok, true)
  assert.equal(controller.update({ launchHidden: true }).ok, true)
  assert.equal(controller.update({ notificationsEnabled: false }).ok, true)
  assert.equal(controller.snapshot.launchAtLogin, true)
  assert.equal(controller.snapshot.launchHidden, true)
  assert.equal(controller.snapshot.notificationsEnabled, false)
  assert.deepEqual(calls, [
    { openAtLogin: false, openAsHidden: false },
    { openAtLogin: true, openAsHidden: false },
    { openAtLogin: true, openAsHidden: true },
  ])
})

test('does not offer login-item preferences on Linux or unpackaged builds', () => {
  const controller = new DesktopPreferencesController({
    store: createStore(),
    registrar: createRegistrar().registrar,
    onSummon: () => {},
    platform: 'linux',
    packaged: true,
    loginItems: { setLoginItemSettings: () => {} },
    notificationsAvailable: true,
  })
  controller.initialize()
  const result = controller.update({ launchAtLogin: true })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, 'unavailable')
  assert.equal(controller.snapshot.launchAtLoginAvailable, false)
})

test('desktop preference capabilities expose the platform matrix', () => {
  assert.deepEqual(desktopPreferenceCapabilities('darwin', true, true), { launchAtLoginAvailable: true, notificationsAvailable: true })
  assert.deepEqual(desktopPreferenceCapabilities('win32', true, false), { launchAtLoginAvailable: true, notificationsAvailable: false })
  assert.deepEqual(desktopPreferenceCapabilities('linux', true, true), { launchAtLoginAvailable: false, notificationsAvailable: true })
  assert.deepEqual(desktopPreferenceCapabilities('darwin', false, true), { launchAtLoginAvailable: false, notificationsAvailable: true })
})
