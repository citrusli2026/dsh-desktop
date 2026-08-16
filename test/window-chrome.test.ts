import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hiddenTitleBarOptions, MACOS_SIDEBAR_COLLAPSED_SAFE_TOP, MACOS_SIDEBAR_SAFE_TOP, WINDOW_CONTROLS_OVERLAY_HEIGHT } from '../src/main/window-chrome.ts'

test('macOS hides the title bar while retaining native traffic lights', () => {
  assert.deepEqual(hiddenTitleBarOptions('darwin', false), { titleBarStyle: 'hidden' })
  assert.equal(MACOS_SIDEBAR_SAFE_TOP, 12)
  assert.equal(MACOS_SIDEBAR_COLLAPSED_SAFE_TOP, 25)
})

test('Windows and Linux use transparent controls overlays with accessible symbols', () => {
  assert.deepEqual(hiddenTitleBarOptions('win32', false), {
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#202123',
      height: WINDOW_CONTROLS_OVERLAY_HEIGHT,
    },
  })
  assert.equal(hiddenTitleBarOptions('linux', true).titleBarOverlay?.symbolColor, '#f4f4f5')
})
