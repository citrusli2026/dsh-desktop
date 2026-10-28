/**
 * Renderer permission boundary: deny every web permission the bundled Harness
 * UI does not need, and allow the few a shipped surface does need.
 * @module main/permissions
 */
import type { Session } from 'electron'

type PermissionSession = Pick<Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>

/**
 * Web permissions the bundled Harness UI legitimately uses (decision 0049).
 *
 * `clipboard-sanitized-write` is the permission Chromium checks before
 * `navigator.clipboard.writeText`. The Harness routes every copy affordance
 * (message copy, code-block header, path/JSON copy) through that API, so
 * denying it made each copy button silently do nothing: the write rejects with
 * `NotAllowedError`, and the client only falls back to `execCommand('copy')`
 * when the async API is missing. `clipboard-read` stays denied — no shipped
 * surface reads the user's clipboard, and paste events do not need it.
 */
const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set(['clipboard-sanitized-write'])

function isAllowed(permission: string): boolean {
  return ALLOWED_PERMISSIONS.has(permission)
}

/**
 * Deny every web permission except the documented allowlist above. Anything
 * new must be added there deliberately, with a decision record and tests.
 */
export function denyUnexpectedPermissions(target: PermissionSession): void {
  target.setPermissionCheckHandler((_webContents, permission) => isAllowed(permission))
  target.setPermissionRequestHandler((_webContents, permission, callback) => callback(isAllowed(permission)))
}
