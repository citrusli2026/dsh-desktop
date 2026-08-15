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

## Amendment 2026-08-15: GitCode as the second channel

Field measurement on the maintainer's network: direct github.com downloads ran
at ~100KB/s, a community proxy at ~4MB/s, and a GitCode-hosted attachment came
from Huawei Cloud CDN nodes inside China (CNAME `*.cdnhwc*`, OBS S3 headers).
GitCode's OpenAPI gained release create + attachment `upload_url` endpoints in
2025-06, so the release workflow gained a `mirror-gitcode` job (gated on
variable `GITCODE_REPO` + secret `GITCODE_TOKEN`) as a second, China-fast
channel next to R2. Live-tested 2026-08-15 (`scripts/gitcode-upload.mjs`):
`upload_url` returns an OBS pre-signed PUT plus signed headers (the
`x-obs-callback` registers the object as a release attachment), and stable
per-asset links exist at `gitcode.com/<repo>/releases/download/<tag>/<file>` —
only the `file-cdn.gitcode.com` host behind them is time-limited, so public
copy must use the former. R2 keeps the stable, self-controlled, globally fast
(outside China) fixed-URL role.

## Amendment 2026-08-15 (2): manual mirror upload; site narrows to macOS/Windows with dual sources

The `mirror-gitcode` push job failed on both shell.8 and shell.9: GitHub's
overseas runners reach GitCode OBS at ~150 KB/s, so a ~200 MB asset takes
~18 minutes and the OBS pre-signed PUT URL expires mid-transfer (502); the
uploader's fail-fast then aborted the whole batch. A GitCode-side pull-mode
pipeline (domestic runner pulls from GitHub, writes to OBS) was designed and
then rejected by the maintainer: a second cross-platform pipeline is
disproportionate complexity for a best-effort channel.

The channel is now **manual**: after each release the maintainer uploads the
two user-facing installers (macOS dmg, Windows exe) and their optional checksum files through the GitCode
release page — the maintainer's domestic network makes browser uploads
painless, the same approach other projects use. blockmap / latest*.yml are
not mirrored: auto-updater always talks to GitHub, and the site no longer
shows engineering files. After uploading, trigger `Site Data Refresh` once;
`gen-site-data.mjs`'s range-GET probe flips those assets to `gitcode_ok` and
the site starts showing the mirror source.

The download section narrows accordingly:

- only the macOS DMG and Windows EXE render; decision 0016 later removed Linux
  packages and the secondary macOS ZIP from GitHub Releases as well;
- every asset shows two buttons side by side: GitCode mirror (when
  `gitcode_ok`) and GitHub — Chinese UI puts the mirror first, English puts
  GitHub first; no more single-source language switching;
- the collapsed "all files (incl. delta-update metadata)" table is removed —
  update metadata is consumed programmatically by electron-updater from
  GitHub, so listing it on the site served no user purpose;
- the `mirror-gitcode` job is gone from `release-mirrors.yml` (R2 stays);
  `scripts/gitcode-upload.mjs` keeps its hardened retries (fresh signed URL
  per attempt, per-file failure isolation) for manual/debug use only.
