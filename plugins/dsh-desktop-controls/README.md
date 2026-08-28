# dsh-desktop-controls

The desktop shell's optional in-app discovery and preference surface.

It contributes one additive `shell.overlay` entry — the draggable in-app
extension entry — to the Harness Web UI. The surface is intentionally small: it
explains the Windows menu-bar fallback and offers named shell actions through
the `dshDesktop` preload bridge (device pairing, full screen, logs, diagnostics,
About last), so the menu stays short and aligned. Its own `settings.section`
page ("Extension settings", next to General/Models/Plugins) can record a global
summon shortcut, configure launch-at-login and start-hidden behavior, and enable
or disable local desktop status notices.

Status notices are derived from the Harness `useSessions` public state exposed to
the plugin. The plugin does not read screenshots or the DOM to infer activity,
and it sends no status data over the network. If the bridge is unavailable, the
controls fall back to instructions for the system tray and window context menu.
