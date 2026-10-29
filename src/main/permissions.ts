/**
 * Renderer permission boundary: deny every web permission the bundled Harness
 * UI does not need, and allow the few a shipped surface does need.
 * @module main/permissions
 */
import type { Session } from 'electron'

type PermissionSession = Pick<Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>

/**
 * Web permissions the bundled Harness UI legitimately uses, whatever the media
 * type (decisions 0049 and 0050).
 *
 * `clipboard-sanitized-write` is the permission Chromium checks before
 * `navigator.clipboard.writeText`. The Harness routes every copy affordance
 * (message copy, code-block header, path/JSON copy) through that API, so
 * denying it made each copy button silently do nothing: the write rejects with
 * `NotAllowedError`, and the client only falls back to `execCommand('copy')`
 * when the async API is missing. `clipboard-read` stays denied — the two async
 * read call sites are xterm's capability probe and the spreadsheet preview's
 * explicit paste menu, which already falls back to its own clipboard buffer.
 */
const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set(['clipboard-sanitized-write'])

/**
 * Media device types granted per decision 0050: voice input
 * (`dsh-experimental-client-ui-voice-input`) records the chat prompt through
 * `getUserMedia({ audio })`. The camera is never needed, so a compromised
 * renderer cannot turn it on.
 */
function mediaAllowed(types: readonly ('video' | 'audio')[] | undefined): boolean {
  return types !== undefined && types.length > 0 && types.every(type => type === 'audio')
}

/**
 * Deny every web permission except the documented allowlists above. Anything
 * new must be added there deliberately, with a decision record and tests.
 */
export function denyUnexpectedPermissions(target: PermissionSession): void {
  target.setPermissionCheckHandler((_webContents, permission, _requestingOrigin, details) => {
    if (ALLOWED_PERMISSIONS.has(permission)) return true
    // A check carries one media type: `audio`, `video` or `unknown`. Only an
    // audio check passes; `video` and `unknown` stay denied.
    return permission === 'media' && details.mediaType === 'audio'
  })
  target.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if (ALLOWED_PERMISSIONS.has(permission)) return callback(true)
    // A request lists every type it wants: audio-only passes, any video fails.
    callback(permission === 'media' && mediaAllowed('mediaTypes' in details ? details.mediaTypes : undefined))
  })
}
