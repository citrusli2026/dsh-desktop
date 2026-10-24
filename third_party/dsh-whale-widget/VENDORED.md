# Vendored: dsh-whale-widget

- Upstream: <https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget> (MIT for code; see `PROVENANCE.md` for assets)
- Version: **0.4.2, unmodified** (published npm tarball `dsh-whale-widget-0.4.2.tgz`).
- No upstream patch is required: the shell supplies the companion descriptor and serves the pet page
  itself (`plugins/dsh-desktop-controls`), so the plugin needs no `dsh.companion` field and no pet route.
  If upstream later ships its own declaration/route, that declaration wins (see `src/main/companion-discovery.ts`).
- Mounted only while the user enables "小鲸鱼桌宠"; not installed into the user's profile as a normal
  plugin and not updated from npm.
- Attribution: the settings toggle links to the upstream repository. Upstream issues and feature
  requests should go to <https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/issues>.
- Assets (`assets/**`) are distributed as-is with the plugin under their own terms (`PROVENANCE.md`);
  they are not relicensed under dsh-desktop's MIT.
