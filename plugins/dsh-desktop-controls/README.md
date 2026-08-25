# dsh-desktop-controls

The desktop shell's optional in-app discovery surface.

It contributes one additive `shell.overlay` entry to the Harness Web UI. The
surface is intentionally small: it explains the Windows menu-bar fallback and
offers only a fixed set of named shell actions through the `dshDesktop` preload
bridge. If the bridge is unavailable, it falls back to instructions for the
system tray and window context menu.
