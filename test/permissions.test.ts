/** Unit tests for the renderer permission boundary. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PermissionCheckHandlerHandlerDetails, PermissionRequest, Session, WebContents } from 'electron'
import { denyUnexpectedPermissions } from '../src/main/permissions.ts'

test('denies both permission checks and permission requests', () => {
  const handlers: {
    check?: NonNullable<Parameters<Session['setPermissionCheckHandler']>[0]>
    request?: NonNullable<Parameters<Session['setPermissionRequestHandler']>[0]>
  } = {}
  const target = {
    setPermissionCheckHandler(handler: Parameters<Session['setPermissionCheckHandler']>[0]) {
      if (handler !== null) handlers.check = handler
    },
    setPermissionRequestHandler(handler: Parameters<Session['setPermissionRequestHandler']>[0]) {
      if (handler !== null) handlers.request = handler
    },
  }

  denyUnexpectedPermissions(target)

  assert.ok(handlers.check)
  assert.equal(handlers.check(null, 'geolocation', 'http://127.0.0.1', {} as PermissionCheckHandlerHandlerDetails), false)

  let granted: boolean | undefined
  assert.ok(handlers.request)
  handlers.request({} as WebContents, 'media', value => { granted = value }, {} as PermissionRequest)
  assert.equal(granted, false)
})
