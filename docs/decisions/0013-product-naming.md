# 0013: Product naming — app and artifacts are `dsh-desktop`, repository keeps `dsh-electron-shell`

- Date: 2026-08-15
- Status: accepted
- 中文:[0013](0013-product-naming.zh.md)

## Context

The project grew two names: the repository (`dsh-electron-shell`) and the
product (`DSH Electron Shell` app, `dsh-electron-shell-*` artifacts). The
long name reads as a description, not a product; the owner asked for one
short product name while keeping the repository name stable (links, R2
bucket, GitCode mirror, and the appId all derive from it).

## Decision

- **Product name: `dsh-desktop`** — `package.json` `name`,
  electron-builder `productName` (`.app` filename, menu-bar label, DMG
  volume), artifact names (`dsh-desktop-<version>-arm64-mac.dmg`,
  `dsh-desktop-setup-<version>.exe`, …), tray/menu/About copy, shell page
  titles, and the log prefix. The harness UI's own "DeepSeek Harness" title
  still takes over the window once loaded — shell surfaces say `dsh-desktop`,
  harness surfaces say what upstream says.
- **Kept unchanged**: GitHub repository `citrusli2026/dsh-electron-shell`
  (and every URL pointing to it), `appId` (`io.github.citrusli2026.dsh-electron-shell`,
  so existing installs keep their update/identity continuity), the R2 bucket
  and mirror path, and historical decision records.

## Consequences

- Positive: one short, consistent product name across the app, installers,
  website copy, and release titles; repository links and mirrors never break;
- Negative: the packaged app's `userData` directory follows the app name, so
  it moves from `~/Library/Application Support/dsh-electron-shell` to
  `…/dsh-desktop` — logs and window geometry from older builds stay behind
  (small, disposable state; the harness data home is `~/.dsh-desktop` per
  0012 and is unaffected);
- The single-instance lock is keyed on `userData`, so an old-name build and
  a new-name build can run side by side — once, during the transition.

## Alternatives

- Rename the repository too: breaks every published link, the R2 mirror
  path, and appId continuity for near-zero user-facing gain — rejected;
- `DSH Desktop` with a space and capitals: artifact names with spaces were
  already ruled out (decision 0008: upload-artifact rewrites spaces and
  electron-updater would lose the files) — rejected.
