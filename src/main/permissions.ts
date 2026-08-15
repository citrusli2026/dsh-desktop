/**
 * Renderer permission boundary: the bundled Harness UI does not need device,
 * capture, notification, or filesystem permissions from Electron.
 * @module main/permissions
 */
import type { Session } from 'electron'

type PermissionSession = Pick<Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>

/** Deny every web permission unless a future feature adds an explicit allowlist. */
export function denyUnexpectedPermissions(target: PermissionSession): void {
  target.setPermissionCheckHandler(() => false)
  target.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
}
