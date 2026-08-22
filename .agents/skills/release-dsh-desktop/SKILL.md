---
name: release-dsh-desktop
description: "Run a full dsh-desktop release — bump the bundled @deepseek-ai/dsh kernel, pass local gates, cut the composite tag, watch the GitHub release CI, mirror installers to GitCode, verify the site data, and record the run in HANDOFF. Use when the user asks to 发版/发布/release/bump kernel/重发版本, or when version.mjs check reports an upstream update. Companion: gitcode-release-publisher (browser-based GitCode uploads when backfill stalls)."
---

# dsh-desktop Release Runbook

End-to-end release of the Electron shell. The version is composite
`<dsh version>.shell.<shell rev>` (docs/decisions/0009); a kernel bump
resets the shell revision to 0. Site data, GitCode mirror, and HANDOFF
are all part of the release, not afterthoughts.

## Prerequisites

1. `gh` authenticated to `citrusli2026/dsh-electron-shell` (workflow
   dispatch, run watching, release verification).
2. Working tree clean; `main` fetched. Remote bot commits are common
   (`dsh-shell-bot` site syncs) — always `git pull --rebase` right
   before tagging and re-create the tag if it was made pre-rebase.
3. Local gates runnable: pnpm 11.8, Node 22, network to npm registry.

## Workflow

### 1. Detect and bump the kernel

```sh
node scripts/version.mjs check   # exits 3 when an upstream update exists
node scripts/version.mjs bump dsh <version|latest>
```

`bump dsh` rewrites `manifest/harness/package.json` pin and
`package.json` version (shell rev resets to 0). It does NOT touch
`pnpm-workspace.yaml`, which also carries release-age pins:

```sh
# replace all dsh-* pins (e.g. 192 lines at an rc bump)
sed -i '' 's/@0\.1\.0-rc\.8/@0.1.1-rc.1/g' manifest/harness/pnpm-workspace.yaml
```

Then regenerate the lockfile and verify it resolves:

```sh
pnpm -C manifest/harness install --lockfile-only
pnpm -C manifest/harness install --frozen-lockfile
```

pnpm 11 may auto-add new packages to `minimumReleaseAgeExclude`
(supply-chain policy) — that is expected, keep it.

### 2. Bootstrap the closure and fix peer gaps

```sh
pnpm run bootstrap   # deploy-harness + fetch-node, stages resources/harness
```

The `audit-harness-peers` gate fails on new kernels with missing
non-optional peers (observed: `dsh-llm-pi-ai` needed
`@deepseek-ai/dsh-authorization@^0.1.1-rc.1` in 0.1.1-rc.1). Add the
reported package to `manifest/harness/package.json` dependencies,
re-run `pnpm -C manifest/harness install --lockfile-only`, then
bootstrap again until `audit-harness-peers: closure satisfied`.

### 3. Local gates

```sh
pnpm run verify   # typecheck, 67 unit tests + coverage, site checks, build
```

### 4. Sync docs and examples to the new kernel

- `docs/ARCHITECTURE.md` header: `最后更新: <date> · 当前代码基线
  <version>（未发布）`
- `README.md` / `README.zh.md` and `scripts/version.mjs` composite
  version examples — keep them matching the current kernel
- `site/index.html` legend chip: update only if the chip no longer
  matches the latest *released* kernel (the site shows released
  versions; a fresh bump does not require a chip change)

Commit the bump (message style: `chore: bump dsh kernel to X
(shell revision resets to 0)`).

### 5. Cut the release

```sh
git fetch origin && git pull --rebase origin main   # bot syncs happen often
git tag v<version>
git push origin main
git push origin v<version>     # triggers .github/workflows/release.yml
```

Watch the run: `gh run list --workflow=release.yml --limit 1`, then
`gh run watch <id> --exit-status`. Jobs: verify → build (macos-14 +
windows-2022 + ubuntu-24.04) → publish. Success means: 8 assets
(dmg/exe/deb + three `.sha256` + blockmap + latest.yml; AppImage is
not built), attestations verified, release created.

### 6. GitCode mirror (domestic machine first, backfill as fallback)

**Preferred: mirror from this machine** — domestic network reaches GitCode
fast (~2 MB/s vs ~160 KB/s cross-border), one command does probe → download
→ upload → verify. GitHub assets are unreachable directly from this
machine, so the download goes through a proxy: `GH_SOCKS5` (a local Clash /
similar SOCKS endpoint) is the verified fastest path (~1 MB/s), falling back
to `GH_PROXY_PREFIX` when the SOCKS tunnel is down:

```sh
GITCODE_TOKEN=<gitcode personal token> GITCODE_REPO=citrusli2026/dsh-electron-shell \
  GH_SOCKS5=127.0.0.1:7890 \
  node scripts/mirror-gitcode.mjs v<version>

# fallback: public HTTP proxy prefix
GITCODE_TOKEN=<gitcode personal token> GITCODE_REPO=citrusli2026/dsh-electron-shell \
  GH_PROXY_PREFIX=<proxy prefix, e.g. https://ghproxy.net/https://github.com> \
  node scripts/mirror-gitcode.mjs v<version>
```

Network facts (verified on shell.1): HTTP + SOCKS ports of the same Clash
proxy can route differently — `curl -x http://127.0.0.1:7890` measured
~30 KB/s while `curl -x socks5h://127.0.0.1:7890` measured ~1 MB/s, so
always prefer the SOCKS slot; public HTTP proxies (ghproxy.net,
gh-proxy.com) sit at ~0.2 MB/s and are the ones that give up on large
files (dmg/exe) mid-download. The mirror script downloads with curl
`-C -` resume and 8 retries.

Idempotent and re-runnable: already-mirrored assets are skipped (one-byte
Range GET) and installers are checksum-verified against their sibling
`.sha256`. Probe-only (no token needed): add `--check-only`. Explicit local
files skip the download: `node scripts/mirror-gitcode.mjs v<version> <file...>`
(the daily daemon `gitcode-mirror-daemon.sh` defaults `GH_SOCKS5` to
`127.0.0.1:7890`).

**Fallback: dispatch the backfill workflow** (idempotent — only missing
files are uploaded, safe to re-run):

```sh
gh workflow run gitcode-backfill.yml -f tag=v<version>
```

Reality notes (observed on rc.8.shell.0 and shell.18):
- Cross-border runner → GitCode OBS can take 20+ min per 20-min
  attempt; a run may need 2–3 dispatches to get dmg and exe both.
- A run stuck with `updatedAt` frozen does not mean dead — check
  assets directly with Range GETs instead of trusting timestamps.
- Job budget is 120 min; one file failing burns the whole run.
  Re-dispatch rather than hand-holding a long run.
- Small files (sha256/blockmap/latest.yml) usually land on the first
  run; installers are the long tail.
- Fallback when runner bandwidth is hopeless: the maintainer's
  domestic connection (Shanghai → GitCode ≈ 50 ms) uploading from a
  logged-in browser — see the `gitcode-release-publisher` skill.

Verify every asset with a one-byte Range GET (302/200/206 = present,
404 = missing):

```sh
for f in <asset...>; do curl -s -o /dev/null -w "%{http_code}" \
  -r 0-1023 "https://gitcode.com/citrusli2026/dsh-electron-shell/releases/download/v<version>/$f"; done
```

### 7. Site data

`site-refresh.yml` auto-syncs on Release completion (bot commit
`site: sync release data v<version>`). It probes GitCode live, so it
may mark `gitcode_ok=false` if it ran before the mirror finished, and
the probe can false-positive on GitCode HTML responses. After the
mirror is confirmed, regenerate locally and commit:

```sh
node scripts/gen-site-data.mjs   # sets gitcode_ok from live Range GETs
git add site/data/release.json && git commit -m "chore: refresh release data — verified GitCode mirror and download counts"
```

Watch for push races: the bot pushes its own sync; `git pull --rebase`
and re-push. If `release.json` conflicts, keep the bot's download
counts and regenerate over it.

### 8. HANDOFF and live verification

Add a release section with the template below, then update the status
table rows (最新代码基线 / 已发布 / 核心发布 / 官网数据 / 国内镜像).
Fill the placeholders from the commands in the template.

```markdown
## 十八、<tag> 发布（<date>）

1. **内核升级**：`<dsh>.<rev>` 说明（bump 命令、lockfile、release-age 豁免同步）。
2. **发布**：tag `v<version>` → `<short-sha>`（核对 peeled commit），release.yml
   verify + build + publish 全绿；<N> 文件契约齐全，attestation 与 packaged smoke 通过。
3. **GitCode 镜像（mirror-gitcode.mjs）**：本机直连上传 dmg/exe/deb + 3×sha256
   （<实际耗时>），Range GET 6×206；`gitcode_ok` 已刷新。
4. **网站数据**：gen-site-data 重新生成（stats <n> 次：mac x / win y / linux z），
   site-refresh 自动同步提交 <sha>。

发布元数据：
- Release run `<id>`（成功）；Site Data Refresh run `<id>`（自动，成功）；
- 线上验证：`/data/release.json` 指向 <tag>、资产 `gitcode_ok=true`、
  `/api/downloads` 实时计数可用。
```

Fill commands:

```sh
gh run list --workflow=release.yml --limit 1 --json databaseId,status --jq '.[0]'
gh run list --workflow=site-refresh.yml --limit 1 --json databaseId,status --jq '.[0]'
git rev-parse --short v<version>^{}     # peeled tag commit, cross-check the mirror tag
GITCODE_TOKEN=$(cat ~/.gitcode-token) GITCODE_REPO=citrusli2026/dsh-electron-shell \
  node scripts/mirror-gitcode.mjs v<version> --check-only   # 6× present
```

- Verify live:
  `https://dsh-desktop.com/data/release.json` (tag + gitcode_ok) and
  `https://dsh-desktop.com/api/downloads` (real-time counts). Vercel
  deploys within a couple of minutes of the push.
- Commit and push. The release is complete when the site shows the
  new tag with `gitcode_ok=true` for all assets.

## Failure modes seen in the field

| Symptom | Cause / fix |
|---|---|
| `audit-harness-peers` fails after bump | new kernel peer gap; add the package to the manifest and re-install |
| `main` push rejected | bot sync landed; `git pull --rebase`, re-tag if the tag was already cut |
| backfill run cancels at ~120 min with installers missing | normal; re-dispatch (idempotent), expect 2–3 runs |
| `gitcode_ok=false` in bot sync although mirror is up | bot ran before mirror finished; regenerate locally after verifying |
| runner upload stuck for hours | check assets with Range GETs; if still 404 after a run, cancel and re-dispatch |
| exe specifically times out 3× | retry run; if persistent, switch to browser upload from domestic network |
| mirror via public HTTP proxy: big files (dmg/exe) stall at 0 B or drop mid-download (observed `ghproxy.net`, `gh-proxy.com`) | GitHub assets are blocked directly; use `GH_SOCKS5=127.0.0.1:7890` (Clash SOCKS loop ~1 MB/s, verified fastest). If stuck, kill and rerun the mirror — it is idempotent; or download manually with `curl -sL -x socks5h://127.0.0.1:7890 -C -` and upload via `mirror-gitcode.mjs v<tag> <file...>` |
| same proxy: HTTP port slow (~30 KB/s) but SOCKS port fast (~1 MB/s) | different routes per protocol port; always use the SOCKS slot (`socks5h://`) for asset downloads |
| site-refresh fails: `SyntaxError: Identifier 'classifyPublicAsset' has already been declared` | `scripts/gen-site-data.mjs` had a duplicated local `export function classifyPublicAsset` alongside the import from `release-shape.mjs` (introduced by the architecture refactor); keep only the import, delete the local function, re-trigger the workflow |

## Exit criteria

- GitHub release has the 8 assets; attestations verified in CI.
- GitCode serves all six user-facing assets (dmg, exe, deb, 3× sha256;
  AppImage is not mirrored).
- `site/data/release.json` committed with `gitcode_ok=true` and live
  site confirms tag + counts.
- HANDOFF has the release section and updated status table; all
  commits pushed.
