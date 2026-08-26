import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createShellPreferences } from '../src/main/shell-preferences.ts'

async function tempPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'shell-prefs-test-'))
  return join(dir, 'shell-preferences.json')
}

test('first run explains close-to-tray, then remembers', async () => {
  const path = await tempPath()
  try {
    const store = createShellPreferences(path)
    assert.equal(store.shouldExplainCloseToTray(), true, 'first run explains')
    store.markCloseToTrayExplained()
    assert.equal(store.shouldExplainCloseToTray(), false, 'explained once, never again')
    // A fresh store over the same file sees the persisted state.
    assert.equal(createShellPreferences(path).shouldExplainCloseToTray(), false)
  } finally {
    await rm(join(path, '..'), { recursive: true, force: true })
  }
})

test('mark does not clobber other keys and writes atomically', async () => {
  const path = await tempPath()
  try {
    await writeFile(path, '{"futureKey":"kept"}\n')
    const store = createShellPreferences(path)
    store.markCloseToTrayExplained()
    const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
    assert.equal(raw.closeToTrayExplained, true)
    assert.equal(raw.futureKey, 'kept')
    // No temp files may survive the atomic write.
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(join(path, '..'))
    assert.deepEqual(entries, ['shell-preferences.json'])
  } finally {
    await rm(join(path, '..'), { recursive: true, force: true })
  }
})

test('malformed preferences fall back to the first-run explanation', async () => {
  const path = await tempPath()
  try {
    await writeFile(path, '{broken json')
    const store = createShellPreferences(path)
    assert.equal(store.shouldExplainCloseToTray(), true)
  } finally {
    await rm(join(path, '..'), { recursive: true, force: true })
  }
})

test('desktop preferences use safe defaults and preserve unrelated keys', async () => {
  const path = await tempPath()
  try {
    const store = createShellPreferences(path)
    assert.deepEqual(store.getDesktopPreferences(), {
      shortcut: 'CommandOrControl+Shift+Space',
      launchAtLogin: false,
      launchHidden: false,
      notificationsEnabled: true,
    })
    store.updateDesktopPreferences({ shortcut: 'Ctrl+Alt+K', launchAtLogin: true, launchHidden: true, notificationsEnabled: false })
    assert.deepEqual(store.getDesktopPreferences(), {
      shortcut: 'Ctrl+Alt+K',
      launchAtLogin: true,
      launchHidden: true,
      notificationsEnabled: false,
    })
    const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
    assert.equal(raw.closeToTrayExplained, undefined)
  } finally {
    await rm(join(path, '..'), { recursive: true, force: true })
  }
})
