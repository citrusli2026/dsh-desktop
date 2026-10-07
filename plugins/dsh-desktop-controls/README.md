# dsh-desktop-controls

The desktop shell's optional in-app discovery and preference surface.

It contributes one additive `shell.overlay` entry — the draggable **Desktop
tools** control — to the Harness Web UI. The compact action panel mirrors the
native shell's device pairing, Safe Mode, Harness restart, and About actions.
Beside it, a non-modal first-success guide tracks runtime, workspace, model, and
first-task completion; it can be dismissed and disappears automatically after
the first successful task. Community plugins are explicitly optional.

Its `settings.section` page (**Desktop settings**, next to
General/Models/Plugins) contains a user-triggered health check, desktop habits,
plugin-market/account state, recovery, and collapsed advanced tools. The health
check is read-only and local by default; proxy, registry, and update-source
probes run only after explicit opt-in. Results are sanitized, never uploaded,
and never trigger automatic file repair. Platform-dependent controls are shown
only when usable.

Status notices and first-task completion are derived from the Harness
`useSessions` public state exposed to the plugin. The plugin does not read
screenshots or the DOM to infer activity, and it sends no status data over the
network. If the bridge is unavailable, the controls fall back to instructions
for the system tray and window context menu.

The Desktop settings page also contains an optional Feishu message connection.
Enter the Feishu App ID and Secret, choose an absolute workspace directory, and
save before starting the bundled cc-connect sidecar. The Secret input is
cleared after a successful save; only whether a Secret is configured and the
sidecar's redacted status are shown back to the page.
