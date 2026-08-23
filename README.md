# dsh-desktop

[中文](README.zh.md) · [Website / 官网](https://dsh-desktop.com)

> Naming: the app and its download artifacts are `dsh-desktop`; the GitHub repository keeps its original name `dsh-electron-shell`. 命名规则:应用与安装包叫 `dsh-desktop`;GitHub 仓库沿用原名 `dsh-electron-shell`。

A dependable desktop workspace for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`): the official WebUI, packaged for your desktop — download, install, and talk. Functionally identical to `npx @deepseek-ai/dsh web`. Community-maintained, MIT-licensed, no affiliation with DeepSeek AI; DeepSeek Harness is a DeepSeek trademark and this repo only repackages it under MIT.

**Website**: [dsh-desktop.com](https://dsh-desktop.com) — product intro, downloads, and a FAQ (unsigned-macOS first launch, SmartScreen, checksum & provenance verification, mirror options). The site syncs with GitHub Releases automatically and lists a verified GitCode mirror ahead of GitHub on the Chinese interface.

## What you get

- **Zero setup** — bundles a pinned Node.js 22 runtime and the complete `@deepseek-ai/dsh` dependency closure; no Node install, nothing to configure.
- **Isolated by default** — its own data home (`~/.dsh-desktop`) keeps settings, sessions, API keys, and plugins away from your CLI. `DSH_HOME=~/.dsh` shares them again (decision 0012).
- **Dependable** — crash auto-restart with backoff, error-page retry, tray with live harness status, single-instance lock, window geometry persistence, and an exportable diagnostic report.
- **Constrained renderer** — sandbox and context isolation stay on, Node integration stays off, and camera/location/notifications/filesystem are denied by default (decision 0014).
- **Updates** — Windows updates in place; unsigned macOS checks for releases and opens the exact release page (decisions 0010, 0016).

## Download

Installers per platform (plus `latest.yml` and `.exe.blockmap` in the release for Windows updates):

| Platform | Asset |
|---|---|
| macOS (Apple Silicon, unsigned) | `dsh-desktop-<version>-arm64-mac.dmg` |
| Windows | `dsh-desktop-setup-<version>.exe` (NSIS) |
| Linux | `dsh-desktop-<version>-amd64.deb` (Debian/Ubuntu/UOS/Deepin/麒麟) |

From [GitHub Releases](https://github.com/citrusli2026/dsh-electron-shell/releases), or the GitCode mirror when shown. To verify what you downloaded: check the sibling `.sha256`, or `gh attestation verify <file> -R citrusli2026/dsh-electron-shell` for provenance — full steps per platform in the [website FAQ](https://dsh-desktop.com/#faq). GitHub slow or blocked? The FAQ covers the Chinese mirror and community proxies.

## Versioning

Versions and tags are composite: `<dsh version>.shell.<shell rev>` — e.g. `0.1.1-rc.2.shell.2` bundles `@deepseek-ai/dsh` 0.1.1-rc.2 at shell revision 2. `scripts/version.mjs` owns the version field; a daily `dsh-watch` workflow checks upstream npm and opens a verified bump PR automatically (decision 0009).

## Development

Requires Node `^22.19.0 || >=24.0.0` and pnpm 11:

```sh
pnpm install         # deps + Electron binary (npmmirror by default)
pnpm run bootstrap   # materialize the harness closure + bundled Node 22 LTS
pnpm run dev         # run locally
pnpm run smoke       # smoke: harness ready -> window loads -> verify page -> exit
pnpm run verify      # typecheck, unit tests + coverage, site checks, build
pnpm run dist        # build installers for the current platform (into dist/)
```

- **LAN Web connection**: "Extensions → Connect phone / tablet over LAN" starts an isolated mobile-shell Web proxy and one-time pairing QR. The shell only stages the other repo's Web artifact (`dsh-mobile-shell`, immutable tag `v1.0.0`); `DSH_LAN_IP` selects an adapter when needed.
- **Mirrors for the sandboxed fetch**: `NPM_CONFIG_REGISTRY`, `ELECTRON_MIRROR`, `ELECTRON_BUILDER_BINARIES_MIRROR`, `NODE_DIST_MIRROR` (default npmmirror). The bundled Node is pinned in `manifest/node-runtime.json` with per-platform SHA-256, so a mirror can only deliver bytes matching the commit.

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
