import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error - the Host half is plain ESM JavaScript.
import { installRouteGuard } from '../plugins/dsh-desktop-controls/lib/route-guard.js'

interface Route { kind: string; path: string; handler: () => string }

class FakeServer {
  routes = new Map<string, Route>()
  register(route: Route): () => void {
    const key = `${route.kind}:${route.path}`
    if (this.routes.has(key)) throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`)
    this.routes.set(key, route)
    return () => { this.routes.delete(key) }
  }
}

test('a reload re-registration replaces the route instead of throwing', () => {
  const server = new FakeServer()
  assert.equal(installRouteGuard(server), true)
  const first = server.register({ kind: 'exact', path: '/dsh-whale/image.png', handler: () => 'first' })
  // Simulate Cordis re-running apply before the old execution disposes.
  const second = server.register({ kind: 'exact', path: '/dsh-whale/image.png', handler: () => 'second' })
  assert.equal(server.routes.get('exact:/dsh-whale/image.png')?.handler(), 'second')
  second()
  assert.equal(server.routes.has('exact:/dsh-whale/image.png'), false)
  first()
  assert.equal(server.routes.has('exact:/dsh-whale/image.png'), false)
  delete (globalThis as { __dshDesktopRouteGuard?: unknown }).__dshDesktopRouteGuard
})

test('the guard is installed once per webserver and leaves other paths alone', () => {
  const server = new FakeServer()
  const original = server.register
  assert.equal(installRouteGuard(server), true)
  assert.notEqual(server.register, original)
  const wrapped = server.register
  assert.equal(installRouteGuard(server), true)
  assert.equal(server.register, wrapped)
  server.register({ kind: 'prefix', path: '/api', handler: () => 'api' })
  assert.deepEqual([...server.routes.keys()], ['prefix:/api'])
  delete (globalThis as { __dshDesktopRouteGuard?: unknown }).__dshDesktopRouteGuard
})

test('a frozen service is reported instead of crashing the plugin', () => {
  const server = Object.freeze({ register: () => () => {} })
  assert.equal(installRouteGuard(server), false)
})
