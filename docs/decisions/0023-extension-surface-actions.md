# 0023: Extension surfaces carry extension actions only

- Date: 2026-08-29
- Status: accepted
- 中文:[0023](0023-extension-surface-actions.zh.md)

## Context

The desktop-controls overlay mixed genuine extension actions (device
pairing) with generic app affordances: a fullscreen toggle, log access, and
diagnostics export. Meanwhile the app Extensions menu and the tray menu each
carried a different subset, so the three extension surfaces drifted apart
and non-extension items crowded the overlay.

## Decision

Every extension surface — the desktop-controls overlay, the app Extensions
menu, and the tray menu — exposes the same trio:

- Device pairing (LAN link);
- Safe Mode (start / exit, reflecting the active state);
- About.

Fullscreen is a window affordance served by the native View menu, not an
extension. Logs and diagnostics are maintenance entries and live as buttons
inside the About dialog. The crash-recovery page keeps its own log and
export buttons: at crash time it is the only reachable surface.

## Consequences

- Positive: one mental model across overlay, Extensions menu, and tray —
  the same three actions in the same order; About becomes the single
  diagnostics entry point;
- Negative: logs are two taps deeper from the tray (tray → About → Open
  Logs); the `toggleFullscreen` desktop action and preload bridge entry are
  gone (no caller remains).

## Alternatives

- Keep logs/diagnostics in the tray and Help menu as well: three
  duplicated entries per action, and the surfaces drift again — rejected;
- Keep fullscreen in the overlay: it is a system window function, not an
  extension — rejected.
