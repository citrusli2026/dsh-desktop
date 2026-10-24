# 0044: Ship the whale widget as an optional built-in plugin

- Date: 2026-10-24
- Status: Accepted
- 中文：[0044](0044-builtin-whale-widget.zh.md)

0043 let the shell host companion windows declared by installed plugins, but users still had to find and
install `dsh-whale-widget` themselves. The maintainer then asked for it to be available out of the box and
switchable, while keeping the original author's attribution and upstream entry point. Bundling a whole
third-party plugin conflicts with 0030's "no desktop pet" exclusion, so this decision keeps the scope
narrow:

The shell ships a **reviewed copy of the community plugin**, enabled by default; users can turn it off in
"Desktop settings → Extensions → Whale companion".

- **Upstream code untouched**: `third_party/dsh-whale-widget` is **unmodified upstream 0.4.2**. The shell
  supplies the companion descriptor for recognised packages (`src/main/companion-compat.ts`, gated to the
  reviewed 0.4.x line) and an adapter page served by the `dsh-desktop-controls` host
  (`/__dsh-desktop/whale-pet`, loading the plugin's own `/dsh-whale/widget.js`). If the plugin ever declares
  `dsh.companion` itself, that declaration wins and the adapter steps aside. `VENDORED.md` records the
  version and asset terms; installers never follow npm updates for it.
- **On by default, opt-out**: the `whaleWidgetEnabled` preference defaults to true (a missing key counts as
  on). While it is off the shell does not hand the patch to the loader and removes the profile symlinks it
  owns, so the plugin manager, the companion list and the panel do not see it.
- **Only the preference mounts it**: `prepareWhaleMount()` decides per Harness spawn, and **Safe Mode never
  mounts it**, matching the "third-party plugins isolated" promise. The toggle needs a Harness restart; the
  settings row provides an explicit button.
- **No profile rewriting**: it uses the shell-owned `--patch` argument and profile symlinks, the same
  mechanism as `dsh-desktop-controls`. A user-installed package of the same name wins; the shell never
  replaces a real directory.
- **Attribution and boundary**: the settings row names MeteorNOX and links upstream. Approvals still happen
  only in the main window (0030/0043 unchanged); bundling grants the shell no approval bridge.
- **Asset licence**: code is MIT, but `assets/**` is distributed as-is under upstream `PROVENANCE.md` and
  is not relicensed under dsh-desktop's MIT.

Consequences: users get the experience without installing anything, and disabling it restores the previous
behaviour exactly; the shell owns one third-party integration with a built-in packaged test and the external
opt-in test, and Safe Mode excludes it automatically. The compat check reads the **mounted** version
(`profiles/node_modules`, the shell's link), so a stale user copy in the web profile (e.g. 0.2.10) cannot
silently disable the companion. Rejected: always-on with no opt-out (users could not restore the old UI),
reimplementing the plugin inside the shell (two implementations to maintain), and auto-updating it from npm
(bypasses shell review).
