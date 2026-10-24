import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canForwardMouseMoves,
  companionPosition,
  companionUrl,
  isCompanionResponseOk,
  parseCompanionDescriptor,
} from '../src/main/companion-policy.ts'

test('companion declarations require a same-origin path and bounded sizes', () => {
  const full = parseCompanionDescriptor('dsh-whale-widget', {
    route: '/dsh-whale/pet', width: 560, height: 620, title: ' 小鲸鱼 ', showOnMinimize: false,
  })
  assert.deepEqual(full, {
    id: 'dsh-whale-widget', route: '/dsh-whale/pet', width: 560, height: 620, title: '小鲸鱼', showOnMinimize: false,
  })
  assert.deepEqual(parseCompanionDescriptor('pkg', { route: '/pet' }), {
    id: 'pkg', route: '/pet', width: 480, height: 600, title: 'pkg', showOnMinimize: true,
  })
  for (const route of ['//evil.example/x', '/a/../b', '/a?x=1', '/a#frag', 'https://example.com/x', 'pet', '/a b', '', `/${'a'.repeat(200)}`]) {
    assert.equal(parseCompanionDescriptor('pkg', { route }), undefined, route)
  }
  for (const [width, height] of [[100, 600], [480, 1300], [1.5, 600], ['480', 600]]) {
    assert.equal(parseCompanionDescriptor('pkg', { route: '/pet', width, height }), undefined)
  }
  assert.equal(parseCompanionDescriptor('pkg', null), undefined)
  assert.equal(parseCompanionDescriptor('pkg', { route: '/pet', title: 'x'.repeat(200) })?.title.length, 80)
})

test('companion URLs stay on the loopback Harness and forward only the login token', () => {
  const url = new URL(companionUrl('http://127.0.0.1:4300/?token=abc&session=secret', '/dsh-whale/pet')!)
  assert.equal(url.origin, 'http://127.0.0.1:4300')
  assert.equal(url.pathname, '/dsh-whale/pet')
  assert.equal(url.searchParams.get('token'), 'abc')
  assert.equal(url.searchParams.get('dshCompanion'), '1')
  assert.equal(url.searchParams.has('session'), false)
  for (const base of [undefined, 'file:///tmp/x', 'data:text/html,hi', 'https://example.com/?token=a', 'http://192.168.1.2:4300/']) {
    assert.equal(companionUrl(base, '/pet'), undefined, String(base))
  }
  assert.equal(companionUrl('http://127.0.0.1:4300/', '//evil.example'), undefined)
})

test('only a 2xx HTML response may open a companion window', () => {
  assert.equal(isCompanionResponseOk(200, 'text/html; charset=utf-8'), true)
  assert.equal(isCompanionResponseOk(204, 'text/html'), true)
  assert.equal(isCompanionResponseOk(404, 'text/html'), false)
  assert.equal(isCompanionResponseOk(200, 'application/json'), false)
  assert.equal(isCompanionResponseOk(200, null), false)
})

test('companion placement stays inside the work area and cascades', () => {
  const area = { x: 0, y: 0, width: 1440, height: 900 }
  assert.deepEqual(companionPosition(area, { width: 480, height: 600 }), { x: 952, y: 292 })
  assert.deepEqual(companionPosition(area, { width: 480, height: 600 }, 2), { x: 904, y: 244 })
  const small = { x: 100, y: 100, width: 400, height: 400 }
  const placed = companionPosition(small, { width: 480, height: 600 })
  assert.deepEqual(placed, { x: 100, y: 100 })
})

test('click-through is only offered where mouse moves are forwarded', () => {
  assert.equal(canForwardMouseMoves('darwin'), true)
  assert.equal(canForwardMouseMoves('win32'), true)
  assert.equal(canForwardMouseMoves('linux'), false)
})
