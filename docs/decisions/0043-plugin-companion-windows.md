# 0043: Companion windows declared by installed plugins

- Date: 2026-10-23
- Status: Accepted
- 中文：[0043](0043-plugin-companion-windows.zh.md)

ADR 0030 listed "desktop pets" among the things the shell does not build. An external request (#130,
dsh-whale-widget) showed the underlying need is broader and legitimate: a user who minimized the main
window lost a plugin's at-a-glance status, and asked for that plugin's own surface to stay on the desktop.
Rejecting it as "a pet" would keep the shell from serving a class of plugin UI it can host safely.

Decision: the shell owns a **generic companion-window capability**, and each companion is declared by the
installed plugin itself. A package opts in from its own `package.json`:

```json
"dsh": { "companion": { "route": "/dsh-whale/pet", "width": 560, "height": 620, "title": "小鲸鱼", "showOnMinimize": true } }
```

The capability is deliberately narrow:

- **Read-only discovery.** The shell scans the active Web profile's `node_modules/*/package.json` for the
  declaration. Plugin code is never imported, executed or inspected beyond that file.
- **Same-origin path only.** `route` must be an absolute path (no scheme, `//`, `..`, query or fragment).
  The window loads it on the Harness origin with only the login token forwarded.
- **Probe before show.** The route must answer 2xx with `text/html` within four seconds; otherwise no window
  is created, so a declaration without a served page cannot leave a transparent ghost window.
- **Sandboxed window.** `sandbox` + `contextIsolation`, no `nodeIntegration`, `window.open` denied,
  navigation and redirects pinned to the declared path.
- **No agent bridge.** The companion preload exposes only "hide me" and "focus the main window". The shell
  never reads the Harness DOM, never calls `executeJavaScript`, and offers no approval actions; approvals
  stay in the main window.
- **Lifecycle.** Companions show on minimize (when declared), hide on restore/show/hide/close, follow
  `display-metrics-changed` for placement, and are destroyed on quit. Placement is the bottom-right of the
  display containing the main window, cascading for multiple companions.
- **Panel control.** The desktop-tools panel lists declared companions and toggles them through two
  sender-validated IPC handlers (`companion:list`, `companion:toggle`).

This supersedes ADR 0030's blanket "desktop pets" exclusion **only** for this bounded, plugin-declared
window; it does not admit agent-workbench surfaces, a second chat UI, or shell-rendered plugin content.
It also supersedes the artifact-patching distribution model of the #130 patch: replacing `app.asar` and
disabling auto-update is incompatible with a reliable, updatable shell, while a declaration survives
updates.

Consequences: a plugin author adds one manifest field and a served route; users get the window without an
environment flag or a rebuilt shell. The shell takes on discovery parsing, route probing and a second
window lifecycle — covered by policy/discovery unit tests and a packaged end-to-end test that minimizes the
real shell and restores it from the companion. Rejected alternatives: hardcoding `/dsh-whale/pet` and the
plugin's CSS classes (vendor coupling that silently breaks); loading the page in an iframe (cannot survive a
minimized window); a renderer-supplied approval bridge (turns the shell into an approval surface and
depends on unscrapable DOM).
