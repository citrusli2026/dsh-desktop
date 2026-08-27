# 0020: Desktop entry help surface and notification click-to-focus

- Date: 2026-08-28
- Status: accepted
- 中文：[0020](0020-desktop-entry-help-surface.zh.md)

## Context

shell.4 introduced the in-app `⋮` entry so Windows users reach LAN pairing,
fullscreen, and About without a visible menu bar. Shell.6 then added desktop
status notices, but clicking a notice did nothing after it was shown — with the
window hidden to the tray, a "task completed" message could not bring the user
back to the conversation. Two small gaps remained: diagnostics and logs were
still only reachable from the tray/menu, and the summon shortcut was only shown
inside the Harness settings page.

## Decision

1. The `⋮` panel becomes the complete desktop help surface: besides LAN pairing,
   fullscreen, and About it adds "open logs folder" and "export diagnostics",
   reusing the exact tray/menu actions behind the same allowlisted
   `desktop:action` bridge; the panel also shows the current summon shortcut
   (refreshed every time it opens, straight from the shell preferences snapshot).
   Nothing is removed from the tray, context menu, or application menu.
2. A desktop status notification now summons and focuses the main window on
   click — a single, deliberate action. It does not navigate to the session,
   read content, or act on the harness.
3. The bridge stays narrow and origin-checked: new actions are plain strings
   handled in one switch, verified sender, one boolean result each, same as the
   existing three.

## Consequences

- Positive: on Windows (and everywhere) users reach logs and the diagnostic
  report without digging into the tray; the help surface is one predictable
  place.
- Positive: clicking a notice always lands the user on the workspace, matching
  native notification conventions on all three platforms.
- Negative: "export diagnostics" still opens a save dialog from the web-renderer
  trigger; the dialog is a native surface controlled by the main process.
- Negative: the panel is a bit taller; the fixed hint styling keeps it compact.

## Alternatives

- Navigate to the notifying session on click: the notice only carries session
  title/id, and mapping that to a frontend view is harness-internal; skip until
  upstream exposes a stable link.
- Replace the tray/menu entries with the panel: would remove the native fallback
  that this project treats as a hard boundary.
