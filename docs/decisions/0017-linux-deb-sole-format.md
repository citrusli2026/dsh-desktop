# 0017: Linux deb as the sole Linux release format

- Date: 2026-08-23 (the change itself shipped with v0.1.1-rc.2.shell.1 on 2026-08-22; recorded here today)
- Status: accepted — partially supersedes 0016's Linux exclusion
- 中文:[0017](0017-linux-deb-sole-format.zh.md)

## Context

Decision 0016 (2026-08-15) deliberately excluded Linux from the release
surface: "Linux remains the CI host ... but is no longer a packaged
distribution target" and "deb ... not uploaded". Field reality outran the
decision: a large share of the project's audience runs domestic Linux
desktops (Debian/Ubuntu derivatives, UOS, Deepin, 麒麟), and for them the
only alternative is `npx @deepseek-ai/dsh web`, which requires Node plus
npm access — a much higher bar than a double-click installer. The build
matrix therefore gained a Linux target (ubuntu-24.04) producing one
`.deb`; the decision record was never updated, leaving the docs and the
release validator's contract out of sync with the pipeline.

## Decision

- Every release carries exactly three installers: macOS
  `dsh-desktop-<version>-arm64-mac.dmg`, Windows
  `dsh-desktop-setup-<version>.exe` (NSIS), and Linux
  `dsh-desktop-<version>-amd64.deb`.
- deb is the **single** Linux format. No AppImage, snap, flatpak, or
  RPM. One package covers Debian, Ubuntu, UOS, Deepin, and 麒麟 with a
  double-click install; the deb declares its runtime dependencies
  (`libnotify4`, `libsecret-1-0`, `libappindicator3-1`), and minimal
  systems resolve them with `sudo apt-get install -y ./dsh-desktop-<version>-amd64.deb`
  rather than a bare `dpkg -i`.
- The release remains exactly 8 files: three installers + three
  `.sha256` + `latest.yml` + `.exe.blockmap`. The validator rejects both
  missing and additional files.
- The deb is built on an ubuntu-24.04 runner (electron-builder deb
  requires a Linux host; electronDist is platform-local), and its
  chrome-sandbox SUID comes from electron-builder's default postinst.

## Consequences

- One obvious large download per supported desktop platform remains; the
  eight-file contract stays auditable (three package kinds, still no
  ZIP/metadata sprawl).
- The Linux target is verified in CI before release: packaged smoke
  chain (boot, S2.5 UI render, S1 fault injections), packaged E2E, and an
  installed-package smoke on the deb (real SUID sandbox, install,
  reinstall, uninstall semantics) — see docs/ARCHITECTURE.md §3 and
  docs/test-hardening-plan.md.
- 0016's statements about Linux are superseded where they conflict
  ("Linux ... not a packaged distribution target", "deb ... not
  uploaded"); the rest of 0016 stands.

## Alternatives

- Keep 0016's two-platform surface: simplest, but excludes the domestic
  Linux desktops the project targets — rejected on audience grounds.
- AppImage: portable and universal, but nowhere near as clean for
  double-click installs on Debian/Ubuntu/UOS/Deepin/麒麟, and it adds a
  second Linux file to the release contract — rejected.
- Static not-repackaged instructions (`npx`): requires Node/npm on the
  user machine, defeating the shell's zero-setup promise — rejected.
