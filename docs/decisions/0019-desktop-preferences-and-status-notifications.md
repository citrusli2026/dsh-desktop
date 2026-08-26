# 0019: Desktop preferences and status notifications

- Date: 2026-08-26
- Status: accepted
- 中文：[0019](0019-desktop-preferences-and-status-notifications.zh.md)

## Context

shell.6 addresses two desktop workflow gaps: users need to replace the summon
shortcut with a combination they already use, and they need to know when Harness
finishes, fails, or needs confirmation while the window is in the tray. Shortcuts,
launch-at-login, and native notices belong to the desktop shell; they should not
be written to upstream Harness `settings.yaml` or grant operating-system access
to the renderer.

## Decision

1. The `dsh-desktop-controls` plugin adds a desktop preferences item under
   Harness Settings → General: custom global summon shortcut, launch at login,
   start hidden in the tray, and desktop status notices. Preferences live in
   Electron `userData/shell-preferences.json`, separate from Harness and CLI data.
2. The main process validates, registers, and persists shortcuts; a recording must
   contain a modifier. On conflict or platform rejection, the old shortcut stays
   active and the UI gets an actionable failure state. Harness startup is never
   blocked. The default remains `Ctrl/Cmd + Shift + Space`.
3. Launch at login is enabled only for packaged Windows/macOS builds and is off by
   default. Start-hidden is available only with launch at login. Linux and
   development builds report the capability as unavailable rather than pretending
   the setting succeeded.
4. Notices consume only session/background-job state derived by the plugin from
   Harness's official `useSessions` state. The main process detects public-state
   edges and uses native Electron notifications while the window is unfocused for
   completion, failure, or pending input. The first report establishes a baseline,
   so a page reload does not create a false notice; users can disable notices.
5. Neither plugin nor main process reads the screen, screenshots, or DOM to infer
   status, and no status data is uploaded. The plugin talks to a narrow bridge
   available only to a verified Harness origin; IPC still validates origin and
   normalizes fields.

## Consequences

- Positive: users control the shortcut, startup behavior, and reminder intensity,
  while the in-app entry remains reachable when Windows hides its menu bar.
- Positive: long-running agents can provide low-interruption completion/failure
  feedback while the workspace is hidden.
- Positive: the feature stays outside Harness configuration and clearly reports
  native capabilities unavailable on Linux.
- Negative: launch-at-login behavior depends on the operating system and packaged
  install state; this release has no consistent Linux switch.
- Negative: system notification settings can mute notices; the tray and in-app
  state remain the visible fallbacks.

## Alternatives

- Store preferences in Harness `settings.yaml`: would cross the upstream boundary
  and make CLI sessions observe desktop behavior — rejected.
- Let the Web UI request notifications or register global shortcuts: violates the
  renderer permission boundary and is unreliable while the page is hidden — rejected.
- Infer task status with screenshots, visual recognition, or DOM polling: outside
  the shell boundary, and the official product already provides visual capability —
  rejected.
- Enable launch at login and notifications by default: changes system behavior and
  increases interruption — rejected.
