# 0049: Allow the clipboard write permission the Harness copy buttons need

- Date: 2026-10-28
- Status: Accepted; extended by [0050](0050-microphone-media-allowlist.md) (microphone audio)
- Amends: [0014](0014-deny-renderer-permissions-by-default.md)
- 中文：[0049](0049-clipboard-write-allowlist.zh.md)

ADR 0014 denies every renderer web permission and requires any real need to become
a narrow, documented allowlist with tests instead of a relaxed default. The chat
surface has such a need: every copy affordance in the bundled Harness UI — the
assistant/user message copy row, the code-block header copy button, path and JSON
copy — calls `navigator.clipboard.writeText`. Chromium gates that call behind the
`clipboard-sanitized-write` permission, and Electron routes the check through the
session handler 0014 installed as `() => false`. The write therefore rejected
with `NotAllowedError`, the client only falls back to `execCommand('copy')` when
the async API is *missing*, and the click had no effect at all: no clipboard
write, no icon change, no error. Reported against the chat page: the copy button
at the top-right of a code block does nothing.

Decision: keep the deny-by-default boundary and add exactly one entry to an
allowlist in `src/main/permissions.ts` — `clipboard-sanitized-write`, allowed by
both the check handler and the request handler. `clipboard-read` stays denied: no
shipped surface reads the user's clipboard and paste events do not need it.

- Verified end to end before shipping: an Electron window driven by the checks the
  shell installs rejects `writeText` with `NotAllowedError: Write permission
  denied` when every check returns `false`, and resolves normally when only
  `clipboard-sanitized-write` is allowed.
- Unit tests assert both directions: the allowed permission is checked in and
  granted; `clipboard-read`, `media`, `geolocation`, `notifications`,
  `display-capture` and `openExternal` stay denied.
- Anything else that a future Harness feature needs still requires its own
  decision record, tests, and an entry in that set.

Consequences: copy works across the chat UI in the desktop shell, and the
boundary stays explicit — a new permission cannot slip in without editing the
allowlist. Negative: the permission is session-wide, so any page loaded into the
one sandboxed main window (the loopback Harness origin, guarded by the navigation
allowlist) may write the clipboard. That is accepted because writing is the least
privileged clipboard capability, it never exposes existing clipboard content, and
the renderer is trusted first-party UI.

Rejected alternatives: allowing every request from the loopback origin (ADR 0014
already rejected it, and origin trust is not a capability argument); patching the
vendored Harness client to fall back to `execCommand('copy')` (it would mask
future permission regressions, cannot copy non-text payloads, and contradicts the
"upstream code untouched" rule); adding a preload IPC clipboard bridge (the
Harness UI is upstream code that calls `navigator.clipboard` directly, so the
bridge would never be used).
