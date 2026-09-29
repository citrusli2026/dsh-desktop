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

1. `gh` authenticated to `citrusli2026/dsh-desktop` (workflow
   dispatch, run watching, release verification).
2. Working tree clean; `main` fetched. Remote bot commits are common
   (`dsh-shell-bot` site syncs) — always `git pull --rebase` right
   before tagging and re-create the tag if it was made pre-rebase.
3. Local gates runnable: pnpm 10.33.2 (the repo's `packageManager` pin; see the pnpm fault-table entry for why 11.x is banned), Node 24, network to npm registry.
4. For the mirror step: kimi-webbridge daemon + a logged-in gitcode.com
   tab in the user's browser (`~/.kimi-webbridge/bin/kimi-webbridge start`).

## Release-day playbook (follow in order; each step names its success signal)

1. `node scripts/version.mjs check` → exit 3 with `update available: <v>`.
2. `node scripts/version.mjs bump dsh <v>` → prints `synced N dsh-* peer pins`.
3. `node scripts/sync-release-age-excludes.mjs <v>` → `241 -> 229 pinned entries` (numbers vary).
4. `pnpm -C manifest/harness install --lockfile-only` → if it exits with
   `ERR_PNPM_UNUSED_PATCH`, rebuild the login patch for the new kernel
   version (see the patch-regeneration fault-table row), then re-run.
5. `pnpm -C manifest/harness install --frozen-lockfile` → `Done`.
6. `pnpm run bootstrap` → `audit-harness-peers: closure satisfied`; fix
   missing non-optional peers and re-run when it reports gaps.
7. Verify the login patch landed in the staged closure:
   `grep -c openedAttemptId resources/harness/node_modules/@deepseek-ai/dsh-client-ui-settings-account/lib/client.js` → non-zero.
8. `pnpm run verify` → exit 0 (typecheck, unit tests + coverage, site
   checks, build).
9. `pnpm exec playwright test -g "LAN pairing"` → 2 passed. Then
   `pnpm test:e2e:market:offline` → 1 passed, and `pnpm run smoke:packaged`
   → `packaged smoke: OK`.
10. `pnpm test:e2e:market:real` → 2 passed. **If it reports
    `install-failed`**, read the market fault-table row (bundled-pnpm
    publish-age window vs the new kernel's peer enforcement) before
    touching anything.
11. Docs: ARCHITECTURE.md header, README/README.zh.md, `scripts/version.mjs`
    examples → new version.
12. `node scripts/write-release-notes.mjs v<v>.shell.0`, fill every
    `<...>`, `node scripts/write-release-notes.mjs check v<v>.shell.0` →
    `release-notes: OK`. Commit the bump (message:
    `chore: bump dsh kernel to <v> (shell revision resets to 0)`).
13. `git pull --rebase origin main`; `git tag v<v>.shell.0`; push main +
    tag to origin **and** gitcode (branch + tag). Confirm both remotes'
    peeled tag commit match `git rev-parse v<v>.shell.0^{}`.
14. `gh run list --workflow=release.yml --limit 1` → note the id;
    `gh run watch <id> --exit-status` → exit 0, jobs verify + 3×build +
    publish all `success`. **If verify fails on
    `security:audit`**, apply the audit-floor row below, then cancel the
    run, `git tag -f`, force-push the tag to both remotes, and watch the
    new run.
15. `gh release view v<v>.shell.0 --json assets` → 8 assets.
16. Mirror: `node scripts/mirror-gitcode-v2.mjs v<v>.shell.0` → exit 0,
    `6/6 assets verified anonymously`. Add one full-download spot check:
    `curl -sL -o /tmp/v.deb <gitcode deb URL> && shasum -a 256 /tmp/v.deb`
    vs the `.sha256` file.
17. Site data: `node scripts/gen-site-data.mjs` (or `GH_CLI=1 …` when
    direct GitHub and SOCKS are down but gh works) → file written with the
    new tag and `gitcode_ok=true` ×6; commit + push (pull --rebase first;
    on release.json conflict keep the freshly regenerated local version).
18. HANDOFF: new section (next number; check `grep -n "^## " HANDOFF.md |
    tail -1`), status table rows updated, commit + push to both remotes.
19. Live check: `https://dsh-desktop.com/data/release.json` shows the new
    tag + `gitcode_ok=true`; `https://dsh-desktop.com/api/downloads` shows
    live counts. Vercel deploys within a couple of minutes.

## Workflow

### 1. Detect and bump the kernel

```sh
node scripts/version.mjs check   # exits 3 when an upstream update exists
node scripts/version.mjs bump dsh <version|latest>
```

`bump dsh` rewrites `manifest/harness/package.json` pin and
`package.json` version (shell rev resets to 0). Since shell.5 it also
auto-syncs every `@deepseek-ai/dsh-*` peer range that contained the
previous kernel (`scripts/kernel-peers.mjs`). What it does NOT touch is
the release-age exclude list in `manifest/harness/pnpm-workspace.yaml`
(~190 entries pinned to exact kernel versions) — re-pin it with:

```sh
node scripts/sync-release-age-excludes.mjs <newVersion>
```

Then regenerate the lockfile and verify it resolves:

```sh
pnpm -C manifest/harness install --lockfile-only
pnpm -C manifest/harness install --frozen-lockfile
```

pnpm may auto-add new packages to `minimumReleaseAgeExclude`
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
pnpm run verify   # typecheck, unit tests + coverage, site checks, build
```

CI skips the LAN-pairing QR E2E (CI runners expose docker-bridge addresses
that pass the private-LAN probe), so it is a local-only release gate:

```sh
pnpm exec playwright test -g "LAN pairing"   # local machine with real Wi-Fi/Ethernet
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

### 4.5 Release notes (mandatory, every version)

Every tag must ship `docs/release-notes/v<version>.md` — the GitHub Release
body is built from it by the publish job, which **fails when the file is
missing or still has `<...>` placeholders** (see `docs/release-notes/README.md`).

```sh
node scripts/write-release-notes.mjs v<version>   # scaffold a draft
# fill the <...> placeholders: features, verification, English Summary
node scripts/write-release-notes.mjs check v<version>   # local gate, exit 0 = ready
```

Commit the notes with the bump commit so the tag carries them.

### 5. Cut the release

```sh
git fetch origin && git pull --rebase origin main   # bot syncs happen often
git tag v<version>
git push origin main
git push origin v<version>     # triggers .github/workflows/release.yml
git push gitcode main
git push gitcode refs/tags/v<version>:refs/tags/v<version>
```

Push the GitCode branch and exact tag immediately after GitHub. The automated
asset backfill refuses to create or use a GitCode release until that tag peels
to the same commit, preventing a lagging GitCode default branch from receiving
the new release tag by mistake.

Watch the run: `gh run list --workflow=release.yml --limit 1`, then
`gh run watch <id> --exit-status`. Jobs: verify → build (macos-14 +
windows-2022 + ubuntu-24.04) → publish. Success means: 8 assets
(dmg/exe/deb + three `.sha256` + blockmap + latest.yml; AppImage is
not built), attestations verified, release created.

### 6. GitCode mirror (one command — v2 pipeline)

**INCIDENT (2026-09-20 → ongoing, root-caused 2026-09-28/29):**
GitCode's **v5 upload pipeline** (`api.gitcode.com/api/v5/.../upload_url`,
PRIVATE-TOKEN — what the legacy `mirror-gitcode.mjs` upload path and
`gitcode-backfill.yml` use) returns success but **never persists the
object**: the release lists the asset yet anonymous downloads 404
`NOT_PATH`. The **web-api v2 pipeline** (browser-borrowed auth) persists
correctly. Differential proof: pre-incident assets still serve (302); in
the same release a v2-uploaded probe served while v5-uploaded siblings
404'd. Never trust an upload's own success report — only anonymous
Range GETs.

**Prerequisites (check these first — the script fails fast with a clear
message when one is missing):**

1. `gh` authenticated (`gh auth status`) — downloads use `gh release download`.
2. kimi-webbridge daemon up **and** a logged-in gitcode.com tab open in the
   user's browser: `~/.kimi-webbridge/bin/kimi-webbridge start`, then any
   navigate in session `release-task` connects the extension. If no tab is
   open / not logged in, the script says so — ask the user to open
   gitcode.com and sign in, then re-run.
3. The GitCode tag already pushed and aligned (the script checks it):
   `git push gitcode refs/tags/<tag>`.

**Run it:**

```sh
node scripts/mirror-gitcode-v2.mjs <tag>          # mirror everything missing
node scripts/mirror-gitcode-v2.mjs <tag> --check-only   # probe only, no writes
```

Expected success output (grep-able):

```
mirror-v2: tag v<version> aligned at <sha8>
mirror-v2: <N> public asset(s) for v<version>
mirror-v2: present|MISSING <asset>        (per asset)
mirror-v2: downloaded/uploaded <asset>    (only for missing ones)
mirror-v2: linked <N> asset(s) (<M> old link(s) replaced)
mirror-v2: 6/6 assets verified anonymously
```

Exit 0 = every asset serves anonymously. The script is idempotent — safe
to re-run after any failure, it only touches missing assets.

What it does per asset: probe stable URL (range GET) → `gh release
download` + sibling-`.sha256` verification → v2 upload via
`gitcode-release.sh upload` (borrows the tab's auth; ~15 MB/s domestic)
→ link through a v2 PUT (`action:"delete"` + `action:"create"`, see
semantics below) → anonymous re-verification.

**Link-row semantics learned the hard way (the script implements all of
this — read before hand-editing a release):**

- `PUT web-api.gitcode.com/api/v2/projects/<owner%2Frepo>/releases/<tag>`
  with `Authorization: Bearer <localStorage.access_token>` from the tab,
  body `{name, description, release_status:0, assets:[], tag_name,
  links:[...]}`. `links` entries are ADDITIVE actions, not a full set.
- `action:"create"` (default) adds; linking a name that already exists
  returns 400 `release update failed`.
- `action:"delete"` **must carry the link row `id`** (from a v2 GET of the
  release). Without the id the server answers 200 and silently keeps the
  row — a no-op that looks like success — and that row then blocks the
  same-name create with 400. Deleting leaves a null-attachment "tombstone"
  row in the GET listing; the id-carrying delete above is what clears it.
- Never delete the release object or move the tag.

**If the script reports the webbridge tab is unreachable but `gh` works:**
the same PUT can be issued from Node with browser-borrowed headers
(`Authorization`, `Cookie`, `User-Agent`, `Origin`, `Referer`) — the
bundled script already does this, so this is a note for hand-debugging,
not a separate procedure. When the page's own network is hung (fetches
never settle, evaluates time out) but the machine can reach GitCode, this
Node-side path is the workaround; a background-XHR + sync-poll evaluate
also works.

**Legacy v5 path (dead until GitCode fixes it — kept for reference):**

```sh
GITCODE_TOKEN=<gitcode personal token> GITCODE_REPO=citrusli2026/dsh-desktop \
  GH_SOCKS5=127.0.0.1:7890 \
  node scripts/mirror-gitcode.mjs v<version>
```

`mirror-gitcode.mjs` (probe → download → upload → verify, curl `-C -`
resume, idempotent, `--check-only` probe mode, explicit local files) is
kept for its `--check-only` probe mode, which any verification flow can
use. The daily daemon `scripts/gitcode-mirror-daemon.sh` already points
at the v2 script.

**Fallback: dispatch the backfill workflow** — also v5-based, same silent
failure; do not trust it until the incident is fixed:

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
  -r 0-1023 "https://gitcode.com/citrusli2026/dsh-desktop/releases/download/v<version>/$f"; done
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

When direct GitHub and the SOCKS proxy are both unreachable but the
authenticated `gh` CLI still works (a frequent domestic-network state),
run `GH_CLI=1 node scripts/gen-site-data.mjs` — it routes the API reads
and checksum fetches through `gh api` (same escape-hatch idea as
`GH_SOCKS5`, which routes through curl).

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
GITCODE_TOKEN=$(cat ~/.gitcode-token) GITCODE_REPO=citrusli2026/dsh-desktop \
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
| publish fails: `release-notes: missing docs/release-notes/v<tag>.md` | every release must write notes; scaffold with `node scripts/write-release-notes.mjs v<tag>`, fill it, commit, re-run (or re-push the tag) |
| publish fails/ warns: `still contains placeholder <>` | fill every `<...>` in the notes file before tagging |
| `audit-harness-peers` fails after bump | new kernel peer gap; add the package to the manifest and re-install |
| `main` push rejected | bot sync landed; `git pull --rebase`, re-tag if the tag was already cut |
| backfill run cancels at ~120 min with installers missing | normal; re-dispatch (idempotent), expect 2–3 runs |
| upload API reports success + release lists assets, but anonymous Range GET 404 `NOT_PATH` on EVERY asset of a fresh release | v5 upload pipeline silently non-persisting (2026-09-20 incident): uploads via `api.gitcode.com` v5 never reach storage. Switch to the v2 browser pipeline (section 6), delete the dead attachments (`action:"delete"`), re-upload + re-link, re-verify |
| linking a v2-uploaded asset fails with 400 `release update failed` | a link with the same filename already exists on the release; delete the old one first, then link |
| `gitcode_ok=false` in bot sync although mirror is up | bot ran before mirror finished; regenerate locally after verifying |
| CI verify fails on the dependency security audit right after a release-day advisory drop (`security:audit`, fresh GHSAs in the electron toolchain or the harness chain) | raise the **security floors** in BOTH `pnpm-workspace.yaml` override lists (root + `manifest/harness`) to the patched in-range versions, regenerate both lockfiles, re-run `pnpm security:audit` until exit 0, re-bootstrap, then **cancel the failed run, `git tag -f`, force-push the tag to both remotes** (established re-point procedure). Get patched versions from `gh api /advisories/<GHSA>` — if `first_patched_version` is missing it may just not be backfilled yet; check `gh api repos/<repo>/dependabot/alerts` for the real fix version before falling back to an audit ignore (prefer a floor whenever a patched version exists) |
| market:real (`install-failed`) after a kernel bump that adds install-time peer enforcement | the packaged app installs plugins with the **bundled pnpm 11.11.0**, which applies a ~24h publish-age default: it resolves the newest plugin version OLDER than 24h. If that version's peers don't cover the new kernel it is rejected (clear message + `allow-version` guidance in the app's technical detail; the E2E only shows `install-failed`). Diagnose with the bundled probe: `pnpm run build && DSH_MARKET_PROBE=1 pnpm exec playwright test -g @market-probe` prints the full result (status/reason/detail) — see `e2e/market-probe.spec.ts`. Fix = wait for a peer-compatible plugin version to cross the 24h window (self-heals); do NOT downgrade the bundled pnpm or grant allow-version — both strip real safety for all users |
| release PUT returns 200 but a link never disappears, or a same-name re-link returns 400 `release update failed` | the `action:"delete"` descriptor is missing the link row `id` (a v2 GET returns it): without the id the delete is a silent no-op that leaves a null-attachment tombstone blocking the same-name create. `scripts/mirror-gitcode-v2.mjs` carries the id — prefer it over hand-built PUTs |
| runner upload stuck for hours | check assets with Range GETs; if still 404 after a run, cancel and re-dispatch |
| exe specifically times out 3× | retry run; if persistent, switch to browser upload from domestic network |
| mirror via public HTTP proxy: big files (dmg/exe) stall at 0 B or drop mid-download (observed `ghproxy.net`, `gh-proxy.com`) | GitHub assets are blocked directly; use `GH_SOCKS5=127.0.0.1:7890` (Clash SOCKS loop ~1 MB/s, verified fastest). If stuck, kill and rerun the mirror — it is idempotent; or download manually with `curl -sL -x socks5h://127.0.0.1:7890 -C -` and upload via `mirror-gitcode.mjs v<tag> <file...>` |
| same proxy: HTTP port slow (~30 KB/s) but SOCKS port fast (~1 MB/s) | different routes per protocol port; always use the SOCKS slot (`socks5h://`) for asset downloads |
| site-refresh fails: `SyntaxError: Identifier 'classifyPublicAsset' has already been declared` | `scripts/gen-site-data.mjs` had a duplicated local `export function classifyPublicAsset` alongside the import from `release-shape.mjs` (introduced by the architecture refactor); keep only the import, delete the local function, re-trigger the workflow |
| packaged Windows build: `boot failed: bundled harness incomplete: node missing at ...\harness\node\bin\node.exe` | the win-x64 dist zip keeps `node.exe` at the archive root (no `bin/`); `scripts/fetch-node.mjs` now moves it to `node/bin/node.exe` after extraction — mac/linux tarballs already have `bin/node` |
| smoke steps print `packaged smoke: OK` while the app logged a boot failure (Windows) | `app.quit()` drops `process.exitCode` as the process exit code on Windows; `quitGracefully` now forces `app.exit(code)` in `will-quit`. Never judge a gate by the script's exit code alone without a negative-path check (boot failure must exit non-zero) |
| Windows packaged E2E: native menu stays in English after writing a zh preference | directory `fs.watch` can miss content rewrites on Windows; `ShellLocaleController` re-reads `settings.yaml` every 2s as a fallback (refresh() dedupes) |
| deb install step: `dpkg: dependency problems prevent configuration of dsh-desktop` | `dpkg -i` never resolves Depends and the bare runner lacks libnotify4/libsecret-1-0; install with `sudo apt-get install -y ./dist/<deb>` instead |
| `RangeError [ERR_CHILD_PROCESS_STDIO_MAXBUFFER]` from `dpkg -L` | a 160 MB install lists every file, overflowing the 1 MB cap; `smoke-installed.mjs` passes a 32 MB buffer — and selects the binary by `stat` (**regular executable**, since `dpkg -L` lists the `/opt/<app>` directory before the binary inside it) |
| NSIS same-version overwrite (`/S` reinstall) hangs indefinitely | electron-builder replaces the install by running the existing uninstaller; on CI it never finishes (150s and 300s timeouts; zero output; the first silent install takes 4s). Deliberately out of CI scope — the deb reinstall smoke covers the overwrite logic; see test-hardening-plan A-3 |
| `pnpm install --lockfile-only` at the repo root exits 0 but never writes `pnpm-lock.yaml`, and full `pnpm install` hangs after `resolved N, reused M, downloaded 0` (§49/§54) | **ROOT-CAUSED 2026-09-14 (HANDOFF §55)**: pnpm 11.11.0 silently writes no lockfile for trees containing `electron-builder`, and the root `packageManager: pnpm@…` field makes every pnpm >= 10 self-switch (`manage-package-manager-versions`) to the pinned 11.11 before running — so even `npx pnpm@10.33.2` executed 11.11. Fix shipped: `packageManager` pinned to `pnpm@10.33.2` (workflows too); lockfile regenerated natively. Never raise the pin past 10.x until the upstream pnpm 11 defect is fixed; if a one-shot modules-purge prompt appears after a pin change, rerun with `CI=true` |
| custom NSIS hooks never run (installer compiles fine, no error, `MessageBox`/probe code absent from the built installer) | `nsis.include` is resolved via `getResource` against the buildResources FILE LIST — a value like `build/installer.nsh` silently matches nothing (buildResources-relative). Omit the key entirely: the default lookup already finds `build/installer.nsh`. Diagnostic: append a marker line to `$TEMP\dsh-nsis-probe.log` from the hook and check it after a silent install (see HANDOFF §55) |
| a just-pushed release tag needs re-pointing after a rebase | `git tag -f v<version>` locally, then `git push --force origin v<version>`; cancel any release run already started from the old commit first (`gh run cancel <id>`) and force-push the GitCode tag to the same peeled commit (branch is a mirror, force is the established practice) |

## Exit criteria

- GitHub release has the 8 assets; attestations verified in CI.
- GitCode serves all six user-facing assets (dmg, exe, deb, 3× sha256;
  AppImage is not mirrored).
- `site/data/release.json` committed with `gitcode_ok=true` and live
  site confirms tag + counts.
- HANDOFF has the release section and updated status table; all
  commits pushed.
