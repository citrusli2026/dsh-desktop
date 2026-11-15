---
name: release-dsh-desktop
description: "Run a full dsh-desktop shell-only or kernel release, pass local gates, cut the composite tag, watch the GitHub release CI, mirror installers to GitCode, verify the site data, and record the run in HANDOFF. Use when the user asks to 发版/发布/release/bump kernel/重发版本, or when version.mjs check reports an upstream update. Companion: gitcode-release-publisher."
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
   (`dsh-shell-bot` site syncs). Sync before tagging; for an integration
   branch use the merge route below to preserve completed task SHAs.
3. Local gates runnable: pnpm 10.33.2 (the repo's `packageManager` pin; see the pnpm fault-table entry for why 11.x is banned), Node 24, network to npm registry.
4. For the mirror step: kimi-webbridge daemon + a logged-in gitcode.com
   tab in the user's browser (`~/.kimi-webbridge/bin/kimi-webbridge start`).

## Release-day playbook (follow in order; each step names its success signal)

### Choose shell-only vs kernel upgrade first

For shell features/fixes without an authorized kernel upgrade, run only
`node scripts/version.mjs bump shell`. Keep the harness pin, peer ranges,
patch versions, release-age excludes and lockfiles unchanged. Do not turn an
upstream update discovered during a shell release into an implicit upgrade.
Skip kernel-only steps 1–7 below; run local verification, fresh versioned
packaging, notes, CI, mirrors and site/HANDOFF as usual. Notes must describe
the unchanged kernel and the actual shell revision, not blindly use `.shell.0`.

When releasing from a user-designated integration branch, preserve its atomic
commit SHAs: fetch and merge `origin/main` on that branch after the task tree is
clean, inspect conflicts, and push the integration branch. A normal `HEAD:main`
push is allowed only after it is a fast-forward; never force the default branch.
Tag that checked commit and push the exact tag to both remotes. Record the tag
SHA separately from later site/HANDOFF commits. Do not rebase completed task
commits merely to incorporate site bot updates.

Published release tags are immutable. Any re-point procedure below applies
only to a new, unpublished candidate after canceling its old run and verifying
that no release assets were published; otherwise bump the shell revision.
Never force-push the default branch or move a historical published tag.

Build `dist:dir` to completion before starting smoke, packaged E2E or real
Feishu acceptance; never rebuild/overwrite the executable they are running.
After the final version bump, repeat both packaged smokes and packaged E2E.
For Feishu changes run the display/manager cases with `--repeat-each=5` and
the full `pnpm run test:e2e:packaged` subset. Production must continue to
ignore fake-bin environment overrides; inject dependencies only in isolated
test main processes. Real messages require an authorized application/conversation,
temporary credential copies and cleanup; verify thoughts cannot enter answer text.

### Kernel-upgrade route

1. `node scripts/version.mjs check` → exit 3 with `update available: <v>`.
2. `node scripts/version.mjs bump dsh <v>` → prints `synced N dsh-* peer pins`.
3. `node scripts/sync-release-age-excludes.mjs <v>` → `241 -> 229 pinned entries` (numbers vary).
4. `pnpm -C manifest/harness install --lockfile-only --no-frozen-lockfile --reporter=append-only` → if the reviewed
   account patch no longer applies, rebuild it for the new kernel
   version (see the patch-regeneration fault-table row), then re-run.
5. `pnpm -C manifest/harness install --frozen-lockfile` → `Done`.
6. `pnpm run bootstrap` → `audit-harness-peers: closure satisfied`; fix
   missing non-optional peers and re-run when it reports gaps.
7. Verify the reviewed closures landed in the staged, deployed kernel:
   - account patch — both hunks must be present in
     `resources/harness/node_modules/@deepseek-ai/dsh-client-ui-settings-account/lib/client.js`:
     the popup fallback `else window.open(this.destination(attempt.authorizeUrl), "_blank", "noopener,noreferrer");`
     and the onboarding guard `"dshDesktop" in globalThis && typeof globalThis.dshOnboarding?.hasApiKey === "function"`.
   - session-trash patch — `pnpm run bootstrap` refuses a kernel that is not in
     `REVIEWED_KERNELS` (`scripts/patch-session-trash.mjs`). To add one, diff both patched bundles
     (`dsh-api-session-controller/lib/index.js`, `dsh-client-ui-workspace/lib/client.js`) between the old and new
     kernel (`npm pack` both versions and `diff -u`), re-run both exported transforms against the new source, then
     add the kernel to the list with that evidence. `test/session-trash-kernel.test.ts` fails until it is added.
8. `pnpm run verify` → exit 0 (typecheck, unit tests + coverage, site
   checks, build).
9. `pnpm exec playwright test -g "LAN pairing"` → 2 passed. Then
   `pnpm test:e2e:market:offline` → 1 passed. Immediately before packaged
   smoke, run `GOPROXY=https://goproxy.cn,direct pnpm run dist:dir`; then run
   `pnpm run smoke:packaged` and `pnpm run smoke:packaged-ui` → both pass.
   The smoke driver passes the source package version into the app and fails
   early if `dist/` is stale, so never treat an old `packaged smoke: OK` as a
   release result.
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
    `gh run watch <id> --exit-status` → exit 0, jobs verify + 4×build
    (macos-15-intel, windows-2022, ubuntu-24.04, ubuntu-24.04-arm) + publish all `success`. **If verify fails on
    `security:audit`**, apply the audit-floor row below, then cancel the
    run, `git tag -f`, force-push the tag to both remotes, and watch the
    new run.
15. `gh release view v<v>.shell.0 --json assets` → 10 assets (dmg, exe, blockmap, latest.yml, amd64 deb, arm64 deb + four `.sha256`).
16. Mirror: `node scripts/mirror-gitcode-v2.mjs v<v>.shell.0` → exit 0,
    `8/8 assets verified anonymously` (installers + checksums; the arm64 deb is mirrored like the amd64 one).
   Add one full-download spot check:
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
previous kernel (`scripts/kernel-peers.mjs`). It also carries the reviewed
account patch filename and pnpm mapping to the new version without changing
the diff (`scripts/kernel-patches.mjs`); existing candidate files or unexpected
mappings stop the bump for review. pnpm must still apply the patch successfully:
an upstream context change requires the manual regeneration below, never
`allowUnusedPatches` or removing the patch gate. What it does NOT touch is
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

If the lockfile step reports `ERR_PNPM_UNUSED_PATCH`, the patch filename still
targets the previous kernel version. Regenerate it against the package that is
actually being installed; do not leave the old patch file beside the new one:

```sh
PATCH_DIR=$(mktemp -d -t dsh-account-patch.XXXXXX)
pnpm -C manifest/harness patch \
  @deepseek-ai/dsh-client-ui-settings-account@<new-kernel> \
  --edit-dir "$PATCH_DIR"
# Edit "$PATCH_DIR/lib/client.js" and re-apply the openedAttemptId auto-open effect.
pnpm -C manifest/harness patch-commit "$PATCH_DIR" \
  --patches-dir manifest/harness/patches
# Update patchedDependencies to the generated <new-kernel>.patch and remove
# the obsolete old-version patch, then regenerate the lockfile.
pnpm -C manifest/harness install --lockfile-only --no-frozen-lockfile --reporter=append-only
pnpm run bootstrap
rg -c 'openedAttemptId' resources/harness/node_modules/@deepseek-ai/dsh-client-ui-settings-account/lib/client.js
```

`pnpm patch` uses the exact package version, while a leftover old patch is
reported as unused; rebuilding the diff from the new package also catches
upstream source-line drift before the release reaches CI.

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
`gh run watch <id> --exit-status`. Jobs: verify → build (macos-15-intel +
windows-2022 + ubuntu-24.04 + ubuntu-24.04-arm) → publish. Success means: 10 assets
(dmg/exe/deb + three `.sha256` + blockmap + latest.yml; AppImage is
not built), attestations verified, release created on the **normal channel**
(`prerelease: false`, and `/releases/latest` resolves to the new tag). Since
2026-10-21 the publish job passes `--prerelease=false`; only publish a
prerelease when the user explicitly asks for a preview.

### 6. GitCode mirror (v2 pipeline)

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
4. Verify the current browser origin is `https://gitcode.com` immediately
   before borrowing authorization. A successful `find_tab` response alone
   is not enough: this release observed evaluate still using the previous
   GitHub page. Navigate this task's current tab to the GitCode releases URL
   and re-check origin/login without printing credential values.
5. Check whether the GitCode release object exists. `mirror-gitcode-v2.mjs`
   links through PUT to an **existing** release; it does not POST-create one.
   For a new tag returning 404, use the companion skill's upload → create
   flow with all six verified descriptors and the exact tag commit first.
   Use `--status unset` when the existing prerelease quota is exhausted.
   Then run the v2 script's `--check-only`; do not assume PUT will upsert.

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

Watch for push races: the bot pushes its own sync; fetch and merge
`origin/main` to preserve recorded atomic-task SHAs, then re-push normally.
Never force main or move a published tag. If `release.json` conflicts, keep the bot's download
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
3. **GitCode 镜像（v2 / gitcode-release-publisher）**：本机上传 dmg/exe/deb + 3×sha256
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
node scripts/mirror-gitcode-v2.mjs v<version> --check-only   # 6× present, no token read
```

- Verify live:
  `https://dsh-desktop.com/data/release.json` (tag + gitcode_ok) and
  `https://dsh-desktop.com/api/downloads` (real-time counts). Vercel
  deploys within a couple of minutes of the push.
- Commit and push. The release is complete when the site shows the
  new tag with `gitcode_ok=true` for all assets.

## Real-machine verification (in the release flow since v0.2.1-rc.2.shell.0)

Two layers, both mandatory before a release is called complete.

### 1. CI visual verification (automatic, every build)

Every desktop runner (macos-15-intel, windows-2022, ubuntu-24.04, ubuntu-24.04-arm) runs the packaged `@smoke` suite and
then **must prove the app rendered**, not merely that a job finished:

```sh
# what CI runs, in order, inside the build job
node scripts/collect-visual-evidence.mjs test-results visual-evidence/packaged
node scripts/verify-visual-evidence.mjs visual-evidence/packaged --label <runner>
```

`verify-visual-evidence.mjs` names the 22 packaged desktop extension surfaces (first-run/safe-mode banner, floating Feishu quick
control and its bottom menu, five Feishu-manager states, message preferences, six settings panes, LAN pairing, trash,
recovery, loading, market popover) and fails the job listing exactly which are missing. Screenshots ride along in the
`packaged-visuals-<runner>` artifact. Playwright wipes its output directory per run, which is why the collector runs
immediately after the packaged run instead of at the end of the job.

Inspect the evidence of a release run:

```sh
gh run download <run-id> -n packaged-visuals-windows-2022 -D /tmp/win-vis
node scripts/verify-visual-evidence.mjs /tmp/win-vis --label windows-2022   # re-check offline
```

### 2. Maintainer real-machine checks (the two boundaries CI cannot reach)

CI runs on GitHub runners; the two boundaries below need the local VMs, and each release records what was covered:

| Boundary | Environment | Checklist |
|---|---|---|
| Windows native install + desktop | UTM 5.x, Windows 11 ARM64 (hand-built bundle: `virt` + `virtio-ramfb`, 8 GB/6 vCPU, `PS2Controller=false` so UTM generates `usb-kbd`) | mount the release ISO/EXE from `installer.iso`, run the NSIS wizard (scope → directory → install → finish), confirm the first-run window, desktop-tools panel (Feishu quick control states), Feishu manager (create-with-QR + message styles), plugins, settings panes, then `Get-MpComputerStatus` + `Get-MpThreatDetection` for the Defender receipt |
| Linux arm64 native install | QEMU + HVF, Ubuntu 24.04.x arm64, GNOME on Xorg, VNC/SSH | `sha256sum -c` the arm64 deb, `dpkg-deb -I` shows `Architecture: arm64`, `sudo apt-get install -y ./…-arm64.deb`, launch from the app menu, screenshot the first-run window (`~/dsh-review/evidence/linux/`) |

Evidence layout: `~/dsh-review/evidence/{windows,windows-ext,linux}/` (screenshots + `.mov` recordings). Record in
HANDOFF what was covered and — explicitly — what was not (for example: tray menu and automation-tasks view were not
captured visually; third-party AV scanning is out of scope unless the user asks).

When a release touches Feishu display settings, the tray, or the automation view, extend the CI surface list in
`scripts/verify-visual-evidence.mjs` first so the coverage is enforced rather than remembered.

## Failure modes seen in the field

| Symptom | Cause / fix |
|---|---|
| Site Data Refresh verifies the mirrors but fails rebasing `site/data/release.json` | local generated-data push raced the bot's five-minute re-probe. Let the in-flight bot finish before pushing the same generated files. If it already failed, verify live delivery, dispatch a fresh refresh from current main after mirrors settle, keep main unchanged until it finishes, then fetch/merge its bot commit. Never force main or retag the release to repair website data |
| GitCode returns HTTP 200/206 but the file has not been checked | status is only availability. Reject HTML, verify range total/first byte against the local asset (or full size/hash for 200), and fully read back at least one installer. Record its SHA; do not treat an upload message or release page as verified delivery |
| browser Actions log appears stuck although job steps have advanced | the live page may be cached. Use current run/job step status and the completed Actions log; a completed job's log may remain unavailable until the whole run ends. Do not infer failed residue or missing artifacts from a stale browser frame |
| Windows peer-client trash test sees the correct session breadcrumb but no treeitems | responsive layout collapsed the sidebar; the Windows work area can constrain BrowserWindow width. Explicitly open the visible sidebar before asserting its tree/session, and use a deliberately narrow peer in all-platform regression. Retain every delete/restore/unarchive and two-client assertion; do not bypass peer checks or merely increase timeouts |
| Chinese real Harness startup has no sessions and an input labelled "Choose workspace" / "选择工作区" on Linux CI | the kernel resolves its default workspace under the system Documents directory, not child cwd. Headless runners may have no XDG Documents. Set the public `workspace-controller.documentsDirectory` profile option to the fixture's temporary directory and make seed/session cwd match that default path. Do not probe or create a real account's Documents in isolated E2E, and do not bypass workspace/session assertions |
| real Harness E2E cannot find Chinese controls on an English CI runner, but passes on a Chinese development machine | trash/message fixtures must configure locale, theme and onboarding directly in the active profile before boot, then assert the rendered locale. Do not rely on asynchronous legacy settings import or replace exact controls with bilingual fallbacks. Keep legacy migration coverage in its dedicated tests |
| a real persistence fixture fails on Windows with `ERR_UNSUPPORTED_ESM_URL_SCHEME`, or its origin-path assertion fails | dynamic imports must use `pathToFileURL(require.resolve(...)).href`, not a native drive path. Compare the exact expected session origin with `path.join`, not a POSIX-only prefix; run the real cross-process lease and restart checks on every release platform |
| a fresh local ad-hoc package blocks fake-secret E2E on a macOS keychain dialog | fake Secrets do not justify real keychain access. In the isolated test main process, inject safeStorage unavailable and assert the existing restricted-file fallback; retain safeStorage adapter unit tests and real protected-storage acceptance. Do not approve system dialogs, modify keychain access or add production bypasses |
| packaged launch with a temporary workspace fails `ENOENT` although the binary exists | a relative `dist` path was resolved against the new cwd; `locatePackagedExecutable` must return an absolute path (unit regression covers relative input) |
| packaged manager remains closed / actions unexpectedly rejected just after launch | absence of the boot overlay is not readiness; require mounted desktop-controls, tolerate only expected navigation/context transitions and body=null while loading; preserve failure-surface assertions |
| live compact/quiet still leaks reasoning as answer text | ACP thought passed through generic fallback and a dedicated mapper; test the complete notification boundary, not only the thought helper, and map `agent_thought_chunk` once |
| packaged trash or another Harness disconnects while tests are running | a concurrent dist rebuild replaced running resources; serialize packaging and runtime gates, then rerun the complete failed suite without weakening assertions |
| `git add` says the manually maintained tracked plugin client is ignored | the broad lib ignore matches even this exact path; use precise `git add -f plugins/dsh-desktop-controls/lib/client.js`, never `git add -A` |
| GitCode upload reports `no extension connected` | start the daemon once; if the browser extension remains disconnected, report this mirror prerequisite to the user while completing other release gates. Do not report the mirror or full release complete |
| publish fails: `release-notes: missing docs/release-notes/v<tag>.md` | every release must write notes; scaffold with `node scripts/write-release-notes.mjs v<tag>`, fill it, commit, re-run (or re-push the tag) |
| publish fails/ warns: `still contains placeholder <>` | fill every `<...>` in the notes file before tagging |
| `pnpm -C manifest/harness install --lockfile-only` reports `ERR_PNPM_UNUSED_PATCH` after a kernel bump | the `patchedDependencies` key and patch filename still target the previous `dsh-client-ui-settings-account` version; use the exact `pnpm patch` → edit → `patch-commit` flow above, remove the obsolete patch, regenerate the lockfile, and re-check both account-patch hunks (popup fallback + onboarding guard) in the staged closure |
| `audit-harness-peers` fails after bump | new kernel peer gap; add the package to the manifest and re-install |
| `main` push rejected | bot sync landed; fetch and merge origin/main, preserve task SHAs, push normally. A published tag remains immutable; a docs/site follow-up is not a reason to retag |
| a `build (macos-…)` job is cancelled within ~1 s with `The configuration 'macos-14-arm64-us-default' is not supported` | macOS 14 images were retired from Actions on 2026-11-02, and the bare `macos-15` label now resolves to an arm64 image. Keep the dmg an x64 build with `macos-15-intel` (its cross-version/attest guards compare the same string). Retagging does not help; only the label does |
| Windows build dies in `fetch-node` with `expected extraction root …node-v24…-win-x64` right after `extracting node-v24….zip` | PowerShell `Expand-Archive` prints `Cannot find an overload for "ExtractToDirectory"` and still exits 0 on current runner images, so the staging root stays empty. `scripts/fetch-node.mjs` / `scripts/install-electron.mjs` now try the bundled bsdtar first, then `pwsh`, then Windows PowerShell, and judge every attempt by the staged runtime instead of the exit status |
| backfill run cancels at ~120 min with installers missing | normal; re-dispatch (idempotent), expect 2–3 runs |
| upload API reports success + release lists assets, but anonymous Range GET 404 `NOT_PATH` on EVERY asset of a fresh release | v5 upload pipeline silently non-persisting (2026-09-20 incident): uploads via `api.gitcode.com` v5 never reach storage. Switch to the v2 browser pipeline (section 6), delete the dead attachments (`action:"delete"`), re-upload + re-link, re-verify |
| linking a v2-uploaded asset fails with 400 `release update failed` | a link with the same filename already exists on the release; delete the old one first, then link |
| `gitcode_ok=false` in bot sync although mirror is up | bot ran before mirror finished; regenerate locally after verifying |
| GitCode release creation returns HTTP 400 `预发布版本最多标记20个` | GitCode has a platform-wide prerelease count limit; keep the same tag/commit and create this release as a normal release (`release_status: 0`). Asset links and website data are unaffected; record the fallback in HANDOFF |
| CI verify fails on the dependency security audit right after a release-day advisory drop (`security:audit`, fresh GHSAs in the electron toolchain or the harness chain) | raise the **security floors** in BOTH `pnpm-workspace.yaml` override lists (root + `manifest/harness`) to the patched in-range versions, regenerate both lockfiles, re-run `pnpm security:audit` until exit 0, re-bootstrap. Retry only an unpublished candidate after stopping old runs and confirming no Release/assets on either host; use the exact tag's force-with-lease. Published versions need a new version. Get patched versions from `gh api /advisories/<GHSA>` — if `first_patched_version` is missing it may just not be backfilled yet; check `gh api repos/<repo>/dependabot/alerts` for the real fix version before falling back to an audit ignore (prefer a floor whenever a patched version exists) |
| market:real (`install-failed`) after a kernel bump that adds install-time peer enforcement | the packaged app installs plugins with the **bundled pnpm 11.11.0**, which applies a ~24h publish-age default: it resolves the newest plugin version OLDER than 24h. If that version's peers don't cover the new kernel it is rejected (clear message + `allow-version` guidance in the app's technical detail; the E2E only shows `install-failed`). Diagnose with the bundled probe: `pnpm run build && DSH_MARKET_PROBE=1 pnpm exec playwright test -g @market-probe` prints the full result (status/reason/detail) — see `e2e/market-probe.spec.ts`. Fix = wait for a peer-compatible plugin version to cross the 24h window (self-heals); do NOT downgrade the bundled pnpm or grant allow-version — both strip real safety for all users |
| release PUT returns 200 but a link never disappears, or a same-name re-link returns 400 `release update failed` | the `action:"delete"` descriptor is missing the link row `id` (a v2 GET returns it): without the id the delete is a silent no-op that leaves a null-attachment tombstone blocking the same-name create. `scripts/mirror-gitcode-v2.mjs` carries the id — prefer it over hand-built PUTs |
| runner upload stuck for hours | check assets with Range GETs; if still 404 after a run, cancel and re-dispatch |
| exe specifically times out 3× | retry run; if persistent, switch to browser upload from domestic network |
| mirror via public HTTP proxy: big files (dmg/exe) stall at 0 B or drop mid-download (observed `ghproxy.net`, `gh-proxy.com`) | GitHub assets are blocked directly; use `GH_SOCKS5=127.0.0.1:7890` (Clash SOCKS loop ~1 MB/s, verified fastest). If stuck, kill and rerun the mirror — it is idempotent; or download manually with `curl -sL -x socks5h://127.0.0.1:7890 -C -` and upload via `mirror-gitcode.mjs v<tag> <file...>` |
| same proxy: HTTP port slow (~30 KB/s) but SOCKS port fast (~1 MB/s) | different routes per protocol port; always use the SOCKS slot (`socks5h://`) for asset downloads |
| site-refresh fails: `SyntaxError: Identifier 'classifyPublicAsset' has already been declared` | `scripts/gen-site-data.mjs` had a duplicated local `export function classifyPublicAsset` alongside the import from `release-shape.mjs` (introduced by the architecture refactor); keep only the import, delete the local function, re-trigger the workflow |
| packaged Windows build: `boot failed: bundled harness incomplete: node missing at ...\harness\node\bin\node.exe` | the win-x64 dist zip keeps `node.exe` at the archive root (no `bin/`); `scripts/fetch-node.mjs` now moves it to `node/bin/node.exe` after extraction — mac/linux tarballs already have `bin/node` |
| smoke steps print `packaged smoke: OK` while the app logged a boot failure (Windows) | `app.quit()` drops `process.exitCode` as the process exit code on Windows; `quitGracefully` now forces `app.exit(code)` in `will-quit`. Never judge a gate by the script's exit code alone without a negative-path check (boot failure must exit non-zero) |
| `pnpm run smoke:packaged` passes but the app version is from an older release | `dist/` was left over from an earlier build; run `pnpm run dist:dir` immediately before smoke. The smoke driver now injects the source version and the packaged app rejects a mismatch before boot |
| Windows packaged E2E: native menu stays in English after writing a zh preference | directory `fs.watch` can miss content rewrites on Windows; `ShellLocaleController` re-reads `settings.yaml` every 2s as a fallback (refresh() dedupes) |
| deb install step: `dpkg: dependency problems prevent configuration of dsh-desktop` | `dpkg -i` never resolves Depends and the bare runner lacks libnotify4/libsecret-1-0; install with `sudo apt-get install -y ./dist/<deb>` instead |
| `RangeError [ERR_CHILD_PROCESS_STDIO_MAXBUFFER]` from `dpkg -L` | a 160 MB install lists every file, overflowing the 1 MB cap; `smoke-installed.mjs` passes a 32 MB buffer — and selects the binary by `stat` (**regular executable**, since `dpkg -L` lists the `/opt/<app>` directory before the binary inside it) |
| NSIS same-version overwrite (`/S` reinstall) hangs indefinitely | electron-builder replaces the install by running the existing uninstaller; on CI it never finishes (150s and 300s timeouts; zero output; the first silent install takes 4s). Deliberately out of CI scope — the deb reinstall smoke covers the overwrite logic; see test-hardening-plan A-3 |
| `pnpm install --lockfile-only` at the repo root exits 0 but never writes `pnpm-lock.yaml`, and full `pnpm install` hangs after `resolved N, reused M, downloaded 0` (§49/§54) | **ROOT-CAUSED 2026-09-14 (HANDOFF §55)**: pnpm 11.11.0 silently writes no lockfile for trees containing `electron-builder`, and the root `packageManager: pnpm@…` field makes every pnpm >= 10 self-switch (`manage-package-manager-versions`) to the pinned 11.11 before running — so even `npx pnpm@10.33.2` executed 11.11. Fix shipped: `packageManager` pinned to `pnpm@10.33.2` (workflows too); lockfile regenerated natively. Never raise the pin past 10.x until the upstream pnpm 11 defect is fixed; if a one-shot modules-purge prompt appears after a pin change, rerun with `CI=true` |
| custom NSIS hooks never run (installer compiles fine, no error, `MessageBox`/probe code absent from the built installer) | `nsis.include` is resolved via `getResource` against the buildResources FILE LIST — a value like `build/installer.nsh` silently matches nothing (buildResources-relative). Omit the key entirely: the default lookup already finds `build/installer.nsh`. Diagnostic: append a marker line to `$TEMP\dsh-nsis-probe.log` from the hook and check it after a silent install (see HANDOFF §55) |
| a failed, unpublished release candidate needs re-pointing | preserve task SHAs with merge, stop old runs, verify neither host has a Release or assets, and push only this exact tag with force-with-lease at the checked old SHA to both hosts. Never force main or move any published tag |

## Exit criteria

- GitHub release has the 10 assets on the normal channel (`prerelease: false`, `releases/latest` points at it); attestations verified in CI.
- GitCode serves all six user-facing assets (dmg, exe, deb, 3× sha256;
  AppImage is not mirrored).
- `site/data/release.json` committed with `gitcode_ok=true` and live
  site confirms tag + counts.
- HANDOFF has the release section and updated status table; all
  commits pushed.
