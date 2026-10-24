# Vendored: dsh-whale-widget

- Upstream: <https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget> (MIT for code; see `PROVENANCE.md` for assets)
- Source branch: `feat/electron-desktop-pet` from the community fork
  <https://github.com/chengchuchu666-alt/DeepSeek-Balance-Whale-Widget>, plus the small
  integration patch proposed at <https://github.com/chengchuchu666-alt/DeepSeek-Balance-Whale-Widget/pull/1>
  (`dsh.companion` declaration + pet-page bridge to `window.dshCompanion`).
- Base version: 0.4.2.
- Local changes: **none beyond that integration patch**. The shell mounts this copy only when the
  user enables "小鲸鱼桌宠" in desktop settings; it is not installed into the user's profile as a
  normal plugin and is not updated from npm.
- Attribution: the settings toggle links to the upstream repository. Upstream issues and feature
  requests should go to <https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/issues>.
- Assets (`assets/**`) are distributed as-is with the plugin under their own terms (`PROVENANCE.md`);
  they are not relicensed under dsh-desktop's MIT.
