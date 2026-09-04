# dsh-desktop

[中文](README.zh.md) · [Website / 官网](https://dsh-desktop.com)

A dependable Electron desktop shell for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`): the official WebUI, packaged for your desktop — download, install, and use. Functionally identical to `npx @deepseek-ai/dsh web`. Community-maintained, MIT-licensed, no affiliation with DeepSeek AI; DeepSeek Harness is a DeepSeek trademark and this repo only repackages it under MIT.

## Product scope

`dsh-desktop` is a community-maintained personal project focused on a reliable Electron shell plus an out-of-the-box experience. It adds the desktop surface around the official Harness WebUI — runtime packaging, native window and tray behavior, supervision, recovery, diagnostics, updates, and practical desktop entry points — without becoming a separate Agent workspace or chat product.

Community plugins are always installed manually by the user. The installer contains no community plugins and does not seed them on first launch; install `dsh-market` from Settings → Desktop settings → Plugin market only when needed, then choose other plugins yourself. Signing and notarization are intentionally deferred until the product has enough real-world usage to justify them.

**Website**: [dsh-desktop.com](https://dsh-desktop.com) — product intro, downloads (GitHub and the verified GitCode mirror, in whichever order is usable), and a FAQ covering unsigned-macOS first launch, SmartScreen, checksum & provenance verification. The site syncs with GitHub Releases automatically.

## What you get

- **No runtime setup** — bundles a pinned Node.js 22 runtime and the complete `@deepseek-ai/dsh` dependency closure; no separate Node install or terminal bootstrap.
- **Isolated by default** — its own data home (`~/.dsh-desktop`) keeps settings, sessions, API keys, and plugins away from your CLI. `DSH_HOME=~/.dsh` shares them again (decision 0012).
- **Dependable** — crash auto-restart with backoff, error-page retry, tray with live harness status, single-instance lock, window geometry persistence, and an exportable diagnostic report. On Windows, desktop actions remain reachable from Desktop tools, the window context menu, or the tray even when the menu bar is hidden.
- **Quick to return to** — press the configurable summon shortcut from anywhere to show and focus the desktop app after it has been hidden to the tray. It defaults to `Ctrl/Cmd + Shift + Space`; if another app owns it, the tray and context-menu fallbacks remain available.
- **A clear first-success path** — a lightweight, dismissible main-screen guide tracks runtime → workspace → model → first completed task and then gets out of the way. The plugin market is explicitly optional.
- **One-click health check** — Settings → Desktop settings checks the bundled runtime, writable data folders and disk, Harness loopback, profile, plugins, and versions. Optional proxy/registry/update probes require an explicit opt-in; results stay local and sanitized, with no automatic repair.
- **Fits your desktop** — Settings → Desktop settings lets you record the shortcut, opt into launch at login and start hidden, and enable local status notices. These preferences stay in the shell's own data file.
- **Out-of-the-box plugin path** — the installer keeps community plugins out of the bundle. Install the market manually from Settings → Desktop settings → Plugin market; the panel reports each install phase, the actual installed version, and a retryable, sanitized cause when the registry, proxy, profile, or install script fails.
- **Recovers from a broken plugin** — Safe Mode (the error page, Desktop tools, or Desktop settings) boots with third-party plugins quarantined while official and built-in extensions keep running; the diagnostic report names the suspected failing plugin.
- **Portable agent presets** — Settings → Desktop settings exports a preset as one `.dshpreset` file and imports it elsewhere with conflict checks (skip / replace / clone) and a trust warning.
- **Constrained renderer** — sandbox and context isolation stay on, Node integration stays off, and camera/location/Web notifications/filesystem are denied by default (decision 0014). Optional desktop notices use only public Harness status and never read the screen; clicking a notice focuses the app.
- **Updates** — Windows updates in place; unsigned macOS checks for releases and opens the exact release page (decisions 0010, 0016).

## Download

Installers per platform (plus `latest.yml` and `.exe.blockmap` in the release for Windows updates):

| Platform | Asset |
|---|---|
| macOS (Apple Silicon, unsigned) | `dsh-desktop-<version>-arm64-mac.dmg` |
| Windows | `dsh-desktop-setup-<version>.exe` (NSIS) |
| Linux | `dsh-desktop-<version>-amd64.deb` (Debian/Ubuntu/UOS/Deepin/麒麟) |

Get installers from the [website](https://dsh-desktop.com) (shows GitHub and the GitCode mirror) or [GitHub Releases](https://github.com/citrusli2026/dsh-desktop/releases). Verify what you downloaded with the sibling `.sha256`, or `gh attestation verify <file> -R citrusli2026/dsh-desktop` for provenance — full steps per platform in the [website FAQ](https://dsh-desktop.com/#faq).

## FAQ

- **A plugin breaks the app and Harness will not start.** Start Safe Mode from the error page (`Start in Safe Mode`) or Desktop tools / Desktop settings. Third-party plugins are quarantined while the official bundles and built-in extensions keep running; the exported diagnostic report lists the plugins and flags the suspected culprit, and the official Settings → Plugins manager stays available for uninstalling it. Exit Safe Mode once it is fixed.
- **Something looks unhealthy but Harness still opens.** Run Settings → Desktop settings → Run health check. Local checks do not make network requests; opt in separately when proxy, registry, or update-source connectivity also needs checking. The report stays on the device and does not modify user files.
- **The plugin market does not install.** Desktop settings distinguishes network, proxy, timeout, profile, install-script, and bundled-tool failures. Expand the sanitized technical detail or export diagnostics, fix the reported environment issue, and retry; a failed attempt never marks the market as installed.
- **Share an agent preset with a teammate or another machine.** Settings → Desktop settings → Agent presets exports the selected preset as one `.dshpreset` file; the other side imports it from the same panel. Imports check for a name conflict (skip / replace / clone) and install as a *user* preset — never replacing a built-in one.
- **Where are desktop preferences stored?** In the shell's own `shell-preferences.json` under the Electron user-data directory — separate from Harness `settings.yaml` and from CLI data (`DSH_HOME`).
- **Diagnostic report?** The error page or `⋮` → Export diagnostics writes a local-only report (recent harness output, plugin inventory, suspected failing plugins, shell/harness versions) to a path you choose.

## Versioning

Versions and tags are composite: `<dsh version>.shell.<shell rev>` — e.g. `0.1.2-rc.1.shell.1` bundles `@deepseek-ai/dsh` 0.1.2-rc.1 at shell revision 1. `scripts/version.mjs` owns the version field; a daily `dsh-watch` workflow checks upstream npm and opens a verified bump PR automatically (decision 0009).

## Development

Requires Node `^22.19.0 || >=24.0.0` and pnpm 11:

```sh
pnpm install         # deps + Electron binary
pnpm run bootstrap   # materialize the harness closure + bundled Node 22 LTS
pnpm run dev         # run locally
pnpm run smoke       # smoke: harness ready -> window loads -> verify page -> exit
pnpm run verify      # typecheck, unit tests + coverage, site checks, build
pnpm run dist        # build installers for the current platform (into dist/)
```

- **LAN Web connection**: "Desktop tools → Connect a mobile device" starts an isolated mobile-shell Web proxy and one-time pairing QR. The shell only stages the other repo's Web artifact (`dsh-mobile-shell`, immutable tag `v1.0.0`); `DSH_LAN_IP` selects an adapter when needed.
- The bundled Node is pinned in `manifest/node-runtime.json` with per-platform SHA-256, so bootstrap is reproducible from the committed values.

## Layout

```
src/main/        Electron main: supervision, window, pages, tray
src/preload/     sandboxed bridge (manual harness retry for the error page)
scripts/         fetch-node / deploy-harness / install-electron / build / gen-icons
manifest/        dependency pin for @deepseek-ai/dsh and its closure
docs/decisions/  ADR-style decision records
```

## Documentation

- [Documentation index & governance](docs/README.md) · [Decision records](docs/decisions/README.md)
- [CONTEXT.md](CONTEXT.md) — domain vocabulary for agents · [HANDOFF.md](HANDOFF.md) — release log and operational history

## License

[MIT](LICENSE). The bundled DeepSeek Harness runtime comes from [@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh) (MIT).
