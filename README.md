# dsh-electron-shell

[中文](README.zh.md)

An Electron desktop shell for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`): download, install, and use — functionally identical to `npx @deepseek-ai/dsh web`. The shell only provides the window, process supervision, tray, and updates; it never changes agent behavior. MIT-licensed.

> Unofficial community packaging, not affiliated with DeepSeek AI. DeepSeek Harness is a trademark of DeepSeek; this repo only repackages it under MIT.
> 非官方社区打包,与 DeepSeek AI 无关联;DeepSeek Harness 为 DeepSeek 的商标,本仓库仅做 MIT 许可下的再打包。

## Features

- **Zero setup**: bundles its own Node.js runtime and the complete `@deepseek-ai/dsh` dependency closure — no Node.js install required;
- **Interoperates with the CLI**: shares `~/.dsh` by default, so sessions, settings, and API keys carry over from the command line;
- **Robust**: crash auto-restart with exponential backoff, manual retry on the error page, single-instance lock, tray icon, logs on disk;
- **Updates**: automatic updates on Windows / Linux; macOS waits for signing (decision 0004).

## Versioning

Version and tag are composite: `<dsh version>.shell.<shell rev>` — e.g. `0.1.0-rc.6.shell.3` bundles `@deepseek-ai/dsh` 0.1.0-rc.6 at shell revision 3. `scripts/version.mjs` owns the version field (`show` / `check` / `bump`); a daily `dsh-watch` workflow checks upstream npm and opens a verified bump PR automatically (decision 0009).

## Download

Get the installer for your platform from [GitHub Releases](https://github.com/citrusli2026/dsh-electron-shell/releases):

| Platform | Asset |
|---|---|
| macOS (Apple Silicon only, unsigned) | `dsh-electron-shell-<version>-arm64-mac.dmg` or `-arm64-mac.zip` |
| Windows | `dsh-electron-shell-setup-<version>.exe` (NSIS) |
| Linux | `dsh-electron-shell-<version>-x86_64.AppImage` or `dsh-electron-shell-<version>-amd64.deb` |

- macOS: right-click → Open on first launch (unsigned, decision 0004);
- Windows SmartScreen: choose "More info" → "Run anyway" (unsigned).

### Slow or blocked GitHub? Download acceleration

If github.com is slow or unreachable from your network, try prefixing the release URL with a community proxy. For example, with the GitHub URL
`https://github.com/citrusli2026/dsh-electron-shell/releases/download/vX.Y.Z/<file>`:

```
https://ghproxy.net/https://github.com/citrusli2026/dsh-electron-shell/releases/download/vX.Y.Z/<file>
```

Other prefixes that come and go over time: `https://gh-proxy.com/`, `https://ghfast.top/`. These are community-run, free, and unaffiliated with this project: availability varies, so try the next one when one is down.

Project owners can also enable the optional Cloudflare R2 mirror in the release workflow (job `mirror-r2`, gated on `R2_ACCOUNT_ID` / `R2_API_TOKEN` repository secrets) to publish a stable mirror automatically.

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

- [Decision records](docs/decisions/README.md): why it is built this way (bundled Node, shared `~/.dsh`, unsigned-first, closure deployment, supervision protocol, CJS main bundle, …).

## License

[MIT](LICENSE). The bundled DeepSeek Harness runtime comes from [@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh) (MIT).
