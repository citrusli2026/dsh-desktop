# 0018: Global shortcut for summoning the desktop shell

- Date: 2026-08-26
- Status: accepted
- 中文：[0018](0018-global-summon-shortcut.zh.md)

## Context

dsh-desktop stays in the system tray when its window is closed. That is useful for a
long-running Harness process, but returning from an editor, terminal, or browser
requires finding the tray icon first. The upstream Harness is a local Web UI and
cannot register an operating-system global summon shortcut on behalf of this shell.

## Decision

1. Release builds register `Ctrl/Cmd + Shift + Space` by default. The action always
   shows and focuses dsh-desktop instead of toggling hidden state, so an accidental
   press cannot make the window disappear.
2. Registration stays in the main process and adds no renderer permission or bridge;
   shutdown unregisters only the combination owned by this project.
3. If another application owns the combination, or the platform rejects it, the app
   continues normally and the tray reports the unavailable state. The tray, context
   menu, and application menu remain complete fallbacks.
4. Smoke tests do not register a real global shortcut. Pure unit tests cover the
   accelerator, conflict, and release paths without affecting the test desktop.

## Consequences

- Positive: users can return to the desktop workspace from anywhere after hiding it
  in the tray, which suits long-running agents.
- Positive: a shortcut conflict never prevents Harness from starting, and visible
  fallback entries remain available.
- Negative: the fixed combination may conflict with another application; this release
  reports the conflict but does not offer customization.
- Negative: the shortcut only works while dsh-desktop is running; it does not launch
  a stopped app.

## Alternatives

- An application-menu accelerator only: the menu is unavailable once the app is hidden,
  so it does not solve desktop summon — rejected.
- `Ctrl/Cmd + J`: likely to collide with browser or upstream Web shortcuts — rejected.
- Default autostart: changes user system behavior and exceeds this small on-demand
  iteration — deferred.
- Visual recognition or screenshot entry points: outside the desktop-shell boundary,
  and the official product already provides that capability — rejected.

