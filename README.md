# dsh-desktop

[中文](README.zh.md) · [Website / 官网](https://dsh-desktop.com)

> Naming: the app and its download artifacts are `dsh-desktop`; the GitHub repository keeps its original name `dsh-electron-shell`. 命名规则:应用与安装包叫 `dsh-desktop`;GitHub 仓库沿用原名 `dsh-electron-shell`。

A dependable desktop workspace for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`): the official WebUI, packaged for your desktop — download, install, and talk. Functionally identical to `npx @deepseek-ai/dsh web`. Community-maintained, MIT-licensed, no affiliation with DeepSeek AI; DeepSeek Harness is a DeepSeek trademark and this repo only repackages it under MIT.

**Website**: [dsh-desktop.com](https://dsh-desktop.com) — product intro, downloads (GitHub and the verified GitCode mirror, in whichever order is usable), and a FAQ covering unsigned-macOS first launch, SmartScreen, checksum & provenance verification. The site syncs with GitHub Releases automatically.

## What you get

- **Zero setup** — bundles a pinned Node.js 22 runtime and the complete `@deepseek-ai/dsh` dependency closure; no Node install, nothing to configure.
- **Isolated by default** — its own data home (`~/.dsh-desktop`) keeps settings, sessions, API keys, and plugins away from your CLI. `DSH_HOME=~/.dsh` shares them again (decision 0012).
- **Dependable** — crash auto-restart with backoff, error-page retry, tray with live harness status, single-instance lock, window geometry persistence, and an exportable diagnostic report. On Windows, desktop actions remain reachable from the in-app `⋮` control, window context menu, or tray even when the menu bar is hidden.
- **Quick to return to** — press the configurable summon shortcut from anywhere to show and focus the desktop workspace after it has been hidden to the tray. It defaults to `Ctrl/Cmd + Shift + Space`; if another app owns it, the tray and context-menu fallbacks remain available.
- **Fits your desktop** — Harness Settings → General lets you record the shortcut, opt into launch at login and start hidden, and enable local status notices. These preferences stay in the shell's own data file.
- **Constrained renderer** — sandbox and context isolation stay on, Node integration stays off, and camera/location/Web notifications/filesystem are denied by default (decision 0014). Optional desktop notices use only public Harness status and never read the screen.
- **Updates** — Windows updates in place; unsigned macOS checks for releases and opens the exact release page (decisions 0010, 0016).

## Download

Installers per platform (plus `latest.yml` and `.exe.blockmap` in the release for Windows updates):

| Platform | Asset |
|---|---|
| macOS (Apple Silicon, unsigned) | `dsh-desktop-<version>-arm64-mac.dmg` |
| Windows | `dsh-desktop-setup-<version>.exe` (NSIS) |
| Linux | `dsh-desktop-<version>-amd64.deb` (Debian/Ubuntu/UOS/Deepin/麒麟) |

Get installers from the [website](https://dsh-desktop.com) (shows GitHub and the GitCode mirror) or [GitHub Releases](https://github.com/citrusli2026/dsh-electron-shell/releases). Verify what you downloaded with the sibling `.sha256`, or `gh attestation verify <file> -R citrusli2026/dsh-electron-shell` for provenance — full steps per platform in the [website FAQ](https://dsh-desktop.com/#faq).

## Versioning

Versions and tags are composite: `<dsh version>.shell.<shell rev>` — e.g. `0.1.1-rc.2.shell.4` bundles `@deepseek-ai/dsh` 0.1.1-rc.2 at shell revision 4. `scripts/version.mjs` owns the version field; a daily `dsh-watch` workflow checks upstream npm and opens a verified bump PR automatically (decision 0009).

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

- **LAN Web connection**: "Extensions → Connect phone / tablet over LAN" starts an isolated mobile-shell Web proxy and one-time pairing QR. The shell only stages the other repo's Web artifact (`dsh-mobile-shell`, immutable tag `v1.0.0`); `DSH_LAN_IP` selects an adapter when needed.
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
