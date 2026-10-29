/** Unit tests for the renderer permission boundary. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { MediaAccessPermissionRequest, PermissionCheckHandlerHandlerDetails, PermissionRequest, Session, WebContents } from 'electron'
import { denyUnexpectedPermissions } from '../src/main/permissions.ts'

type CheckHandler = NonNullable<Parameters<Session['setPermissionCheckHandler']>[0]>
type RequestHandler = NonNullable<Parameters<Session['setPermissionRequestHandler']>[0]>
type Permission = Parameters<CheckHandler>[1]
type Details = PermissionCheckHandlerHandlerDetails

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
    check: (permission: Permission, details: Details = {} as Details) =>
      check(null, permission, 'http://127.0.0.1', details),
    request: (permission: Permission, details: PermissionRequest = {} as PermissionRequest) => {
      let granted: boolean | undefined
      request({} as WebContents, permission, value => { granted = value }, details)
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

test('allows microphone-only media for voice input (decision 0050)', () => {
  const permissions = installed()

  assert.equal(permissions.check('media', { mediaType: 'audio' } as Details), true)
  assert.equal(
    permissions.request('media', { mediaTypes: ['audio'] } as MediaAccessPermissionRequest),
    true,
  )

  // The camera stays shut: a video check, a video request, audio+video, and a
  // request whose types are unknown all fall through to the deny default.
  assert.equal(permissions.check('media', { mediaType: 'video' } as Details), false)
  assert.equal(permissions.check('media', { mediaType: 'unknown' } as Details), false)
  assert.equal(permissions.check('media'), false)
  assert.equal(permissions.request('media', { mediaTypes: ['video'] } as MediaAccessPermissionRequest), false)
  assert.equal(permissions.request('media', { mediaTypes: ['audio', 'video'] } as MediaAccessPermissionRequest), false)
  assert.equal(permissions.request('media', { mediaTypes: [] } as unknown as MediaAccessPermissionRequest), false)
  assert.equal(permissions.request('media'), false)
})

test('denies clipboard reads and every other permission', () => {
  const permissions = installed()

  const denied: Permission[] = ['clipboard-read', 'geolocation', 'notifications', 'display-capture', 'openExternal', 'fullscreen', 'pointerLock']
  for (const permission of denied) {
    assert.equal(permissions.check(permission), false, `${permission} must not be checked in`)
    assert.equal(permissions.request(permission), false, `${permission} must not be granted`)
  }
})
