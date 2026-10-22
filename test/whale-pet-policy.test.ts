import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import { whalePetUrl, approvalClickScript } from '../src/main/whale-pet-policy.ts'

test('pet URL accepts only a local HTTP service and forwards only its login token', () => {
  const url = new URL(whalePetUrl('http://127.0.0.1:3000/chat?token=abc&session=secret')!)
  assert.equal(url.pathname, '/dsh-whale/pet')
  assert.equal(url.searchParams.get('token'), 'abc')
  assert.equal(url.searchParams.get('dshwPet'), '1')
  assert.equal(url.searchParams.has('session'), false)
  for (const base of [undefined, 'data:text/html,hi', 'file:///tmp/a', 'https://example.com', 'invalid']) {
    assert.equal(whalePetUrl(base), undefined)
  }
})

test('approval bridge accepts only explicit allow-once or reject requests with identity', () => {
  assert.equal(approvalClickScript('allowed-always', 'a'), undefined)
  assert.equal(approvalClickScript('allowed-once', ''), undefined)
  assert.equal(approvalClickScript('allowed-once', {}), undefined)
})

test('approval targets the exact panel and matching enabled button', () => {
  let clicked = ''
  const button = (textContent: string, disabled = false) => ({ textContent, disabled, click() { clicked = textContent } })
  const buttons = [button('Always allow'), button('允许一次'), button('拒绝')]
  const panel = (id: string) => ({ getAttribute: () => id, querySelectorAll: () => buttons })
  const document = { querySelectorAll: () => [panel('other'), panel('target')] }
  const result = runInNewContext(approvalClickScript('allowed-once', 'target')!, { document })
  assert.equal(result.ok, true)
  assert.equal(clicked, '允许一次')
  clicked = ''
  assert.equal(runInNewContext(approvalClickScript('rejected', 'missing')!, { document }).ok, false)
  assert.equal(clicked, '')
  buttons[1]!.disabled = true
  assert.equal(runInNewContext(approvalClickScript('allowed-once', 'target')!, { document }).ok, false)
  assert.equal(clicked, '')
})

test('unknown labels never fall back to the first or last button, and IDs cannot inject code', () => {
  let clicked = false
  const document = { querySelectorAll: () => [{
    getAttribute: () => 'a', querySelectorAll: () => [{ textContent: 'Always allow', click: () => { clicked = true } }],
  }] }
  assert.equal(runInNewContext(approvalClickScript('allowed-once', 'a')!, { document }).ok, false)
  assert.equal(runInNewContext(approvalClickScript('allowed-once', 'a";throw Error(); //')!, { document }).ok, false)
  assert.equal(clicked, false)
})
