# dsh-desktop

[中文](README.zh.md)

> Naming: the app and its download artifacts are `dsh-desktop`; the GitHub repository keeps its original name `dsh-electron-shell`. 命名规则:应用与安装包叫 `dsh-desktop`;GitHub 仓库沿用原名 `dsh-electron-shell`。

An Electron desktop shell for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`): download, install, and use — functionally identical to `npx @deepseek-ai/dsh web`. The shell only provides the window, process supervision, tray, and updates; it never changes agent behavior. MIT-licensed.

> Unofficial community packaging, not affiliated with DeepSeek AI. DeepSeek Harness is a trademark of DeepSeek; this repo only repackages it under MIT.
> 非官方社区打包,与 DeepSeek AI 无关联;DeepSeek Harness 为 DeepSeek 的商标,本仓库仅做 MIT 许可下的再打包。

**Website / 官网**: <https://dsh-desktop.com> — intro & downloads, auto-synced with GitHub Releases (`site/` + `site-refresh` workflow).

## Features

- **Zero setup**: bundles its own Node.js runtime and the complete `@deepseek-ai/dsh` dependency closure — no Node.js install required;
- **Isolated by default**: the desktop app keeps its own data home (`~/.dsh-desktop`) — settings, sessions, API keys, and plugins stay separate from the CLI; set `DSH_HOME=~/.dsh` to share with the CLI again (decision 0012);
- **Robust**: crash auto-restart with exponential backoff, manual retry on the error page, single-instance lock, system tray with live harness status (restart / logs / update check), persisted window geometry, logs on disk;
- **Restrained renderer**: context isolation and sandboxing stay enabled, Node integration stays off, navigation is guarded, and unexpected device, capture, notification, or filesystem permissions are denied by default (decision 0014);
- **Web mobile connection**: "Extensions → Connect phone / tablet over LAN" starts an isolated mobile-shell Web proxy and shows a one-time pairing QR code. Only the other repository's Web launcher and proxy are staged; Android/iOS projects are not included in the Electron installer;
- **Updates**: Windows updates in place; unsigned macOS checks for new releases and opens the exact release page for a deliberate manual install (decisions 0010, 0016).

## Versioning

Version and tag are composite: `<dsh version>.shell.<shell rev>` — e.g. `0.1.1-rc.2.shell.2` bundles `@deepseek-ai/dsh` 0.1.1-rc.2 at shell revision 2. `scripts/version.mjs` owns the version field (`show` / `check` / `bump`); a daily `dsh-watch` workflow checks upstream npm and opens a verified bump PR automatically (decision 0009).

CI and Release consume the mobile-shell Web artifact from the immutable upstream tag `v1.0.0`; update that pin only as an explicit compatibility change.

## Download

Get the installer for your platform from [GitHub Releases](https://github.com/citrusli2026/dsh-electron-shell/releases):

| Platform | Asset |
|---|---|
| macOS (Apple Silicon only, unsigned) | `dsh-desktop-<version>-arm64-mac.dmg` |
| Windows | `dsh-desktop-setup-<version>.exe` (NSIS) |
| Linux | `dsh-desktop-<version>-amd64.deb` (Debian/Ubuntu/UOS/Deepin/麒麟) |

- macOS: right-click → Open on first launch (unsigned, decision 0004);
- Windows SmartScreen: choose "More info" → "Run anyway" (unsigned).
- Linux: double-click the deb; on a minimal install let apt resolve the
  runtime libraries — `sudo apt-get install -y ./dsh-desktop-<version>-amd64.deb`.
- Every installer ships with a sibling `<installer>.sha256` checksum file,
  so a release holds 3 installers + 3 checksums + `latest.yml` +
  `.exe.blockmap` (the two small Windows updater files) = 8 files. The
  Linux deb was added after decision 0016 (which predates the Linux
  format) as the single Linux delivery format: it covers Debian,
  Ubuntu, UOS, Deepin, and 麒麟 with one double-click install (decision
  0017). No ZIP or AppImage is published.

### If macOS still refuses to open

If right-click → Open still provides no way to continue, and you trust the source of the installer, run:

```sh
xattr -dr com.apple.quarantine "/Applications/dsh-desktop.app"
open "/Applications/dsh-desktop.app"
```

This removes the app's download-quarantine marker and launches it again. It does not add an Apple developer signature or notarization; use it only for an installer whose source you have verified. You may need to repeat it after downloading or replacing the app.

### Slow or blocked GitHub? Download acceleration

If github.com is slow or unreachable from your network, a community proxy prefix may help. For example:

```
https://ghproxy.net/https://github.com/citrusli2026/dsh-electron-shell/releases/download/vX.Y.Z/<file>
```

Other community proxies (`https://gh-proxy.com/`, `https://ghfast.top/`) have been observed to come and go; **some are currently unreachable**. These are third-party, free, and unaffiliated with this project — availability is not guaranteed. If one fails, try another or use the GitCode mirror when available (Chinese interface shows it automatically when verified).

Project owners can use two optional mirror channels:

- **Cloudflare R2** (job `mirror-r2`): S3-compatible object storage with zero egress fees (10 GB free). Create a bucket named `dsh-electron-shell`, create an R2 API token with object read/write on it, then set repository variable `R2_ACCOUNT_ID` and secret `R2_API_TOKEN`. Every release afterwards mirrors automatically under `dsh-electron-shell/<tag>/`; bind a custom domain (or the r2.dev dev URL) on the bucket for stable public links. To backfill an already-published release: download its assets with `gh release download <tag>`, then `wrangler r2 object put "dsh-electron-shell/<tag>/<file>" --file <file>` per asset.
- **GitCode** (manual, verified 2026-08-15): attachments are served from Huawei Cloud CDN nodes inside China. Upload the two installers (and optionally their two tiny checksum files) from a domestic connection, then rerun `Site Data Refresh`. Stable per-asset links exist at `https://gitcode.com/<owner>/<repo>/releases/download/<tag>/<file>`; only the `file-cdn.gitcode.com` host behind them serves time-limited signed URLs, so never paste those.

## Vision (ModLens)

No longer bundled. Upstream DeepSeek Harness added native image support for DeepSeek models (`inputModalities` with image, opt-in per model) in `0.1.0-rc.8`, so the shell's ModLens bridge was removed to avoid overlapping with the official feature. Image handling is entirely upstream's now.

## Development

Requires Node `^22.19.0 || >=24.0.0` and pnpm 11.

```sh
pnpm install         # deps + Electron binary (npmmirror by default)
pnpm run bootstrap   # materialize the harness closure + bundled Node 22 LTS
pnpm run dev         # run locally
pnpm run smoke       # smoke: harness ready → window loads → verify page → exit
pnpm run dist        # build installers for the current platform (into dist/)
```

### LAN Web connection

After Harness is ready, choose “Extensions → Connect phone / tablet over LAN”. The
desktop app selects a private LAN IPv4 address, starts a separate mobile-shell Web
proxy, and shows a QR code. A phone or tablet scans it, confirms the one-time pairing
code, and then uses the host-served Web UI. The proxy always forwards to loopback;
the master token stays in the proxy process and is never written to desktop settings.

The build consumes the isolated `dsh-mobile-shell/dist/web` artifact and stages it
into the gitignored `resources/mobile-shell/` directory. Build and verify that
artifact first:

```sh
cd /absolute/path/dsh-mobile-shell
npm run package:web
npm run verify:web

cd /absolute/path/dsh-desktop
DSH_MOBILE_SHELL_WEB_ROOT=/absolute/path/dsh-mobile-shell/dist/web pnpm run build
```

The desktop shell depends only on `web-artifact.json`'s format version and three
entrypoints, not on the other repository's source layout. Rebuild the Web artifact
after updating that repository, then rebuild the desktop app. Set
`DSH_LAN_IP=192.168.1.23` when multiple LAN adapters need an explicit choice.

Mirrors: this repository defaults to npmmirror (fast in China) for npm packages, the Electron binary, electron-builder helpers, and the bundled Node tarball. Override per environment variable if you prefer the official sources:

- `NPM_CONFIG_REGISTRY`
- `ELECTRON_MIRROR`
- `ELECTRON_BUILDER_BINARIES_MIRROR`
- `NODE_DIST_MIRROR` (official: `https://nodejs.org/dist`)

The bundled Node itself is pinned: version and per-platform SHA-256 live in `manifest/node-runtime.json`, so bootstrap is reproducible and a mirror can only deliver bytes matching the committed hash. Maintainers bump the pin with `node scripts/fetch-node.mjs --update-pin`, which re-resolves the latest 22.x LTS against the official nodejs.org dist.

## Layout

```
src/main/            Electron main: supervision, window, pages, tray
src/preload/         sandboxed bridge (manual harness retry for the error page)
scripts/             fetch-node / deploy-harness / install-electron / build / gen-icons
manifest/harness/    pure dependency manifest pinning @deepseek-ai/dsh and its closure
resources/harness/   bootstrap output (gitignored)
resources/mobile-shell/  staged mobile-shell Web resources (gitignored)
docs/decisions/      decision records (ADR-style)
```

## Documentation

- [Documentation index & governance](docs/README.md): how the docs are organized and kept current.
- [Decision records](docs/decisions/README.md): why it is built this way (bundled Node, isolated `~/.dsh-desktop` home, unsigned-first, closure deployment, supervision protocol, CJS main bundle, …).

## License

[MIT](LICENSE). The bundled DeepSeek Harness runtime comes from [@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh) (MIT).
