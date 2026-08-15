import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  initializeLocalePreference,
  readLocalePreference,
  readThemePreference,
  resolvePreferredLocale,
  ShellLocaleController,
  SHELL_COPY,
} from '../src/main/locale.ts'

test('system locale uses the first supported primary language and falls back to English', () => {
  assert.equal(resolvePreferredLocale(['zh-Hant-TW']), 'zh')
  assert.equal(resolvePreferredLocale(['en-GB']), 'en')
  assert.equal(resolvePreferredLocale(['ja-JP', 'en-US']), 'en')
  assert.equal(resolvePreferredLocale(['ja-JP', 'ko-KR']), 'en')
})

test('Chinese and English dictionaries have exactly the same keys', () => {
  assert.deepEqual(Object.keys(SHELL_COPY.zh).sort(), Object.keys(SHELL_COPY.en).sort())
})

test('first launch persists the system choice without replacing comments or sibling settings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-locale-'))
  const path = join(dir, 'settings.yaml')
  await writeFile(path, '# retained\nui-theme:\n  preference: dark\n')
  assert.equal(await initializeLocalePreference(path, ['zh-CN']), 'zh')
  const text = await readFile(path, 'utf8')
  assert.match(text, /# retained/)
  assert.match(text, /ui-theme:/)
  assert.equal(await readThemePreference(path), 'dark')
  assert.match(text, /locale:\n  preference: zh/)
})

test('an existing preference always wins over the computer language', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-locale-existing-'))
  const path = join(dir, 'settings.yaml')
  await writeFile(path, 'locale:\n  preference: zh\n')
  assert.equal(await initializeLocalePreference(path, ['en-US']), 'zh')
  assert.equal(await readLocalePreference(path), 'zh')
})

test('invalid settings are never overwritten', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-locale-invalid-'))
  const path = join(dir, 'settings.yaml')
  const invalid = 'locale: [unterminated\n'
  await writeFile(path, invalid)
  await assert.rejects(initializeLocalePreference(path, ['en-US']))
  assert.equal(await readFile(path, 'utf8'), invalid)
})

test('controller follows a Harness locale edit without restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-locale-watch-'))
  const path = join(dir, 'settings.yaml')
  const controller = await ShellLocaleController.create(path, ['en-US'])
  try {
    assert.equal(controller.locale, 'en')
    const changed = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('locale watcher timed out')), 2_000)
      const unsubscribe = controller.subscribe(locale => {
        clearTimeout(timeout)
        unsubscribe()
        resolve(locale)
      })
    })
    const themeChanged = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('theme watcher timed out')), 2_000)
      const unsubscribe = controller.subscribeTheme(theme => {
        clearTimeout(timeout)
        unsubscribe()
        resolve(theme)
      })
    })
    await writeFile(path, 'locale:\n  preference: zh\nui-theme:\n  preference: dark\n')
    assert.equal(await changed, 'zh')
    assert.equal(await themeChanged, 'dark')
    assert.equal(controller.locale, 'zh')
  } finally {
    controller.dispose()
  }
})
