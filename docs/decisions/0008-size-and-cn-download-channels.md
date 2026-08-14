# 0008: Size reduction and download channels for Chinese networks

- Date: 2026-02-09
- Status: accepted
- 中文:[0008](0008-size-and-cn-download-channels.zh.md)

## Context

Two release-quality concerns surfaced after v0.1.0-pre.0: the installers were
large (dmg 236MB / zip 259MB / exe 184MB / AppImage 248MB / deb 178MB), and
many users in China cannot reach github.com reliably, which undermines the
download-and-use goal.

## Decision

**Size** (nothing functional is removed):

- The deploy prunes runtime-irrelevant closure content: node-pty's
  foreign-platform prebuilds (58MB, its loader uses
  `prebuilds/<platform>-<arch>` — verified under the bundled Node), node-pty
  build-time sources, every `*.map` (19MB), every `*.d.ts` (13MB), and
  `@types/` (2.8MB); licenses are never touched. Closure: 349MB → 188MB;
  measured dmg 237MB → 209MB, zip 259MB → 223MB at identical compression;
- NSIS keeps electron-builder defaults (v26 removed the `compression` option);
  the dmg image switches from UDZO (zlib) to UDBZ (bzip2), trading one-time
  release-build time for size — measured: dmg 209MB → 185MB, zip unchanged
  at 223MB;
- Electron itself, the bundled Node, and every agent capability stay
  untouched — shrinking by feature removal was explicitly out of scope.

**China download channels**:

- The README (EN + zh) documents the community-proxy prefix trick with
  currently working candidates (`ghproxy.net` tested 2026-08; `gh-proxy.com`,
  `ghfast.top` as fallbacks) plus a clear disclaimer that these are
  community-run and churn;
- The release workflow gains an optional `mirror-r2` job that uploads every
  asset to a Cloudflare R2 bucket (10GB free storage, free egress) under
  `dsh-electron-shell/<tag>/` (renamed from `dsh-desktop/<tag>/` together with
  the repository; old-prefix objects stay in place), gated on `R2_ACCOUNT_ID`
  / `R2_API_TOKEN` repository
  secrets — skipped silently when unconfigured, so forks and CI stay green.

## Consequences

- Positive: ~15-20% smaller installers with zero feature loss; a stable,
  free, automatable mirror path once secrets are configured, plus a
  zero-setup proxy recipe for users today;
- Negative: UDBZ raises the macOS release-leg duration (one-time per release);
  community proxies are unreliable by nature — the README says so and lists
  alternatives.

## Alternatives

- Shrinking by dropping capabilities (sharp/pi-ai/otel providers): violates
  "functionality unchanged" — rejected;
- Self-hosted CDN (OSS/COS/UPYUN): recurring cost and real-name compliance,
  not free — rejected for now;
- Gitee release mirror: 100MB per-file cap vs 150-260MB assets — rejected.
