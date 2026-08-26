import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DESKTOP_SUMMON_ACCELERATOR,
  desktopShortcutLabel,
  normalizeDesktopAccelerator,
  registerDesktopSummonShortcut,
  unregisterDesktopSummonShortcut,
} from '../src/main/global-shortcut.ts'

test('registers the stable cross-platform summon accelerator', () => {
  let registered = ''
  let callback: (() => void) | undefined
  const registrar = {
    register(accelerator: string, next: () => void): boolean {
      registered = accelerator
      callback = next
      return true
    },
    unregister() {},
  }
  let summoned = 0
  assert.equal(registerDesktopSummonShortcut(registrar, () => { summoned += 1 }), true)
  assert.equal(registered, DESKTOP_SUMMON_ACCELERATOR)
  callback?.()
  assert.equal(summoned, 1)
})

test('gracefully reports a shortcut conflict or platform failure', () => {
  const registrar = {
    register(): boolean { return false },
    unregister() {},
  }
  assert.equal(registerDesktopSummonShortcut(registrar, () => {}), false)
})

test('registration exceptions do not block startup or shutdown', () => {
  const registrar = {
    register(): boolean { throw new Error('already registered') },
    unregister(): void { throw new Error('service gone') },
  }
  assert.equal(registerDesktopSummonShortcut(registrar, () => {}), false)
  assert.doesNotThrow(() => unregisterDesktopSummonShortcut(registrar))
})

test('shortcut label follows the host platform', () => {
  assert.equal(desktopShortcutLabel('darwin'), '⌘ + Shift + Space')
  assert.equal(desktopShortcutLabel('win32'), 'Ctrl + Shift + Space')
  assert.equal(desktopShortcutLabel('linux'), 'Ctrl + Shift + Space')
})

test('normalizes custom accelerators and rejects modifier-only or malformed input', () => {
  assert.equal(normalizeDesktopAccelerator('ctrl + alt + k'), 'Ctrl+Alt+K')
  assert.equal(normalizeDesktopAccelerator('CmdOrCtrl+Shift+F12'), 'CommandOrControl+Shift+F12')
  assert.equal(normalizeDesktopAccelerator('Shift'), undefined)
  assert.equal(normalizeDesktopAccelerator('Ctrl+Ctrl+K'), undefined)
  assert.equal(normalizeDesktopAccelerator('Ctrl+NotAKey'), undefined)
  assert.equal(desktopShortcutLabel('Ctrl+Alt+K', 'win32'), 'Ctrl + Alt + K')
  assert.equal(desktopShortcutLabel('CommandOrControl+Alt+K', 'darwin'), '⌘ + ⌥ + K')
})

test('custom registration passes the selected accelerator to Electron', () => {
  let registered = ''
  const registrar = {
    register(accelerator: string): boolean { registered = accelerator; return true },
    unregister() {},
  }
  assert.equal(registerDesktopSummonShortcut(registrar, () => {}, 'Ctrl+Alt+K'), true)
  assert.equal(registered, 'Ctrl+Alt+K')
})
