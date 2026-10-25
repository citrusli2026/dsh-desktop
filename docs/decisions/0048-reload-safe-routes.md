# 0048: Reload-safe webserver route registration

- Date: 2026-10-25
- Status: Accepted
- 中文：[0048](0048-reload-safe-routes.zh.md)

Upstream `dsh-whale-widget` bug #268: toggling a plugin makes the kernel re-run a plugin's `apply`
**before** disposing the previous execution (Cordis `Fiber._reload`). The whale registers exact routes
such as `/dsh-whale/image.png`; the second pass hits
`webserver: duplicate exact route "/dsh-whale/image.png"`, and the desktop restarts. The plugin cannot
fix the ordering, and the shell cannot modify the vendored plugin without abandoning the "upstream code
untouched" rule (ADR 0044).

Decision: the shell's host plugin installs a **reload-safe route guard** on the webserver service at
the earliest patch position, before third-party plugins apply.

- It wraps `register` once per webserver instance (state on `globalThis`, so it survives the controls
  plugin's own reload) and remembers every disposer it created.
- Registering the same `(kind, path)` again first calls the previous disposer, then registers the new
  route. A first registration, a normal dispose, and unrelated paths behave exactly as before.
- If the service cannot be wrapped (frozen/proxy), it logs once and leaves the server untouched rather
  than breaking boot.
- Scope: only routes registered **through the wrapped service after installation**. Routes registered
  before the guard (none in the desktop patch order) still use the kernel's duplicate guard.
- The guard does not touch config, plugin code, or response handling; it only makes route ownership
  replaceable across a reload.

Consequences: a plugin toggle no longer turns a duplicate route into a desktop restart; the shell owns
a small, documented compatibility layer. Rejected: patching the vendored whale (violates ADR 0044),
disabling hot reload (loses other plugin toggles), and swallowing the error without replacing the route
(the old handler would keep serving stale state).

Tests: unit coverage of replace/dispose/frozen-service behaviour; the packaged whale and companion
suites confirm the guard does not disturb normal registration. A live Cordis reload is not automated
because the kernel exposes no stable test hook for it.
