/** Unit tests for the renderer permission boundary. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PermissionCheckHandlerHandlerDetails, PermissionRequest, Session, WebContents } from 'electron'
import { denyUnexpectedPermissions } from '../src/main/permissions.ts'

type CheckHandler = NonNullable<Parameters<Session['setPermissionCheckHandler']>[0]>
type RequestHandler = NonNullable<Parameters<Session['setPermissionRequestHandler']>[0]>
type Permission = Parameters<CheckHandler>[1]

function installed () {
  const handlers: { check?: CheckHandler; request?: RequestHandler } = {}
  const target = {
    setPermissionCheckHandler (handler: CheckHandler | null) {
      if (handler !== null) handlers.check = handler
    },
    setPermissionRequestHandler (handler: RequestHandler | null) {
      if (handler !== null) handlers.request = handler
    },
  }

  denyUnexpectedPermissions(target)

  const check = handlers.check
  const request = handlers.request
  assert.ok(check)
  assert.ok(request)

  return {
    check: (permission: Permission) => check(null, permission, 'http://127.0.0.1', {} as PermissionCheckHandlerHandlerDetails),
    request: (permission: Permission) => {
      let granted: boolean | undefined
      request({} as WebContents, permission, value => { granted = value }, {} as PermissionRequest)
      return granted
    },
  }
}

test('allows the clipboard write the Harness copy buttons need', () => {
  const permissions = installed()

  // A denied check here is what made every chat/code-block copy button inert
  // (navigator.clipboard.writeText rejects with NotAllowedError).
  assert.equal(permissions.check('clipboard-sanitized-write'), true)
  assert.equal(permissions.request('clipboard-sanitized-write'), true)
})

test('denies clipboard reads and every other permission', () => {
  const permissions = installed()

  const denied: Permission[] = ['clipboard-read', 'media', 'geolocation', 'notifications', 'display-capture', 'openExternal']
  for (const permission of denied) {
    assert.equal(permissions.check(permission), false, `${permission} must not be checked in`)
    assert.equal(permissions.request(permission), false, `${permission} must not be granted`)
  }
})
