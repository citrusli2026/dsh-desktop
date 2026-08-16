---
name: gitcode-release-publisher
description: Publish GitCode releases and mirror large release assets through an already logged-in Edge or Chromium browser session. Use when Codex must upload installers or checksums to GitCode, web file selection is blocked or stalls on large files, direct CLI calls hit GitCode CloudWAF, a domestic release mirror must be verified, or a website refresh must run after GitCode assets become available.
---

# GitCode Release Publisher

Publish assets through GitCode's attachment reservation and signed-storage flow while borrowing authorization from the user's logged-in browser. Keep tokens, cookies, and signed upload URLs out of logs.

## Prerequisites

1. Read the repository's release policy, handoff, workflow, and asset validator before choosing files.
2. Load `kimi-webbridge` and open the GitCode repository in one named Edge or Chromium browser session. Keep that session on a logged-in `gitcode.com` tab while running the bundled script; the script reads that skill's local browser-control session.
3. Confirm that the user authorized release creation and asset upload. Treat publishing as an external write.
4. Verify the local tag, peeled tag commit, filenames, byte sizes, and checksums before upload.
5. Check the GitCode releases page for an existing release with the same tag. Never create a duplicate or move an existing tag silently.

For protocol details and failure diagnosis, read [references/gitcode-release-api.md](references/gitcode-release-api.md).

## Publish workflow

### 1. Build the exact asset set

Use only the files required by the repository's release contract. Do not infer that every GitHub asset belongs on GitCode.

For `dsh-desktop`, mirror only the macOS DMG, Windows EXE, and their two `.sha256` files. Keep `latest.yml` and the EXE `.blockmap` on GitHub for `electron-updater`; do not mirror or render them as user downloads.

Create a task-specific staging directory:

```bash
gc_stage_dir=$(mktemp -d "${TMPDIR:-/tmp}/gitcode-release.XXXXXX")
```

### 2. Upload every selected asset

Keep the browser session focused on a logged-in GitCode tab, then run:

```bash
bash .agents/skills/gitcode-release-publisher/scripts/gitcode-release.sh upload \
  --session "release-task" \
  --repo "owner/repository" \
  --file "/absolute/path/to/installer.dmg" \
  > "$gc_stage_dir/installer.dmg.json"
```

Repeat for each selected file. The command outputs only a reusable attachment descriptor; it does not print browser credentials or the temporary signed upload URL.

Combine descriptors and reject duplicate names:

```bash
jq -s 'sort_by(.name) | if (map(.name) | unique | length) == length then . else error("duplicate asset names") end' \
  "$gc_stage_dir"/*.json > "$gc_stage_dir/assets.json"
```

If the browser's native chooser works reliably, it may be used for small files. Prefer the script after `DOM.setFileInputFiles` reports `Not allowed`, the chooser cannot be controlled, or a large EXE/DMG stalls.

### 3. Create the release

Write the intended release description to a task-specific file, then call:

```bash
bash .agents/skills/gitcode-release-publisher/scripts/gitcode-release.sh create \
  --session "release-task" \
  --repo "owner/repository" \
  --tag "v1.2.3" \
  --ref "FULL_40_CHARACTER_RELEASE_COMMIT" \
  --title "Product v1.2.3" \
  --description-file "$gc_stage_dir/description.md" \
  --assets-file "$gc_stage_dir/assets.json" \
  --status prerelease
```

Use `--status prerelease`, `latest`, or `unset`. Verify the returned tag, commit, and asset count before continuing.

### 4. Verify the public release

Navigate the same browser session to the GitCode releases page and inspect the visible tag, short commit, description, and custom assets. Platform-generated source archives are not custom uploaded assets.

Verify every stable download URL with a one-byte GET:

```bash
bash .agents/skills/gitcode-release-publisher/scripts/gitcode-release.sh verify \
  --repo "owner/repository" \
  --tag "v1.2.3" \
  --assets-file "$gc_stage_dir/assets.json"
```

Do not use HEAD: GitCode commonly returns HTTP 401 for HEAD while anonymous range GET correctly returns 200 or 206.

### 5. Refresh downstream delivery

If the repository generates website data from release availability:

1. Trigger its documented site-data refresh workflow only after all GitCode URLs pass verification.
2. Wait for the workflow and deployment to complete.
3. Verify the live release JSON and visible download buttons in the browser.
4. Update handoff records with the GitHub release run, GitCode tag commit, refresh run, hashes, and final asset policy.
5. Commit and push only the intended repository changes. Preserve unrelated untracked files.

## Safety rules

- Never print or persist the browser access token, cookies, or signed upload URL outside the script's private temporary directory.
- Never substitute a personal token when the user explicitly requested the logged-in browser workflow unless they authorize that change.
- Never publish before confirming the exact tag commit and asset allowlist.
- Never treat an uploaded attachment as public until the release exists and the stable tag URL passes anonymous range GET.
- Never close the user's browser task group unless they ask.
- Stop if GitCode reports an existing same-tag release with a different commit or asset set.
