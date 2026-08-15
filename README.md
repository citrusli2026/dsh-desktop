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
- **Updates**: Windows updates in place; unsigned macOS checks for new releases and opens the exact release page for a deliberate manual install (decisions 0010, 0016).

## Versioning

Version and tag are composite: `<dsh version>.shell.<shell rev>` — e.g. `0.1.0-rc.6.shell.3` bundles `@deepseek-ai/dsh` 0.1.0-rc.6 at shell revision 3. `scripts/version.mjs` owns the version field (`show` / `check` / `bump`); a daily `dsh-watch` workflow checks upstream npm and opens a verified bump PR automatically (decision 0009).

## Download

Get the installer for your platform from [GitHub Releases](https://github.com/citrusli2026/dsh-electron-shell/releases):

| Platform | Asset |
|---|---|
| macOS (Apple Silicon only, unsigned) | `dsh-desktop-<version>-arm64-mac.dmg` |
| Windows | `dsh-desktop-setup-<version>.exe` (NSIS) |

- macOS: right-click → Open on first launch (unsigned, decision 0004);
- Windows SmartScreen: choose "More info" → "Run anyway" (unsigned).
- Each installer has a sibling `<installer>.sha256` file, so the user-facing
  surface is at most four assets. The only other release files are the small
  `latest.yml` and Windows `.exe.blockmap` required by in-place updates; no ZIP
  or Linux package is published (decision 0016).

### Slow or blocked GitHub? Download acceleration

If github.com is slow or unreachable from your network, try prefixing the release URL with a community proxy. For example, with the GitHub URL
`https://github.com/citrusli2026/dsh-electron-shell/releases/download/vX.Y.Z/<file>`:

```
https://ghproxy.net/https://github.com/citrusli2026/dsh-electron-shell/releases/download/vX.Y.Z/<file>
```

Other prefixes that come and go over time: `https://gh-proxy.com/`, `https://ghfast.top/`. These are community-run, free, and unaffiliated with this project: availability varies, so try the next one when one is down.

Project owners can use two optional mirror channels:

- **Cloudflare R2** (job `mirror-r2`): S3-compatible object storage with zero egress fees (10 GB free). Create a bucket named `dsh-electron-shell`, create an R2 API token with object read/write on it, then set repository variable `R2_ACCOUNT_ID` and secret `R2_API_TOKEN`. Every release afterwards mirrors automatically under `dsh-electron-shell/<tag>/`; bind a custom domain (or the r2.dev dev URL) on the bucket for stable public links. To backfill an already-published release: download its assets with `gh release download <tag>`, then `wrangler r2 object put "dsh-electron-shell/<tag>/<file>" --file <file>` per asset.
- **GitCode** (manual, verified 2026-08-15): attachments are served from Huawei Cloud CDN nodes inside China. Upload the two installers (and optionally their two tiny checksum files) from a domestic connection, then rerun `Site Data Refresh`. Stable per-asset links exist at `https://gitcode.com/<owner>/<repo>/releases/download/<tag>/<file>`; only the `file-cdn.gitcode.com` host behind them serves time-limited signed URLs, so never paste those.

## Development

Requires Node `^22.19.0 || >=24.0.0` and pnpm 11.

```sh
pnpm install         # deps + Electron binary (npmmirror by default)
pnpm run bootstrap   # materialize the harness closure + bundled Node 22 LTS
pnpm run dev         # run locally
pnpm run smoke       # smoke: harness ready → window loads → verify page → exit
pnpm run dist        # build installers for the current platform (into dist/)
```

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
docs/decisions/      decision records (ADR-style)
```

## Documentation

- [Decision records](docs/decisions/README.md): why it is built this way (bundled Node, isolated `~/.dsh-desktop` home, unsigned-first, closure deployment, supervision protocol, CJS main bundle, …).

## License

[MIT](LICENSE). The bundled DeepSeek Harness runtime comes from [@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh) (MIT).
