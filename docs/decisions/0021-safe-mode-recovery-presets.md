# 0021: Safe mode, recovery center, and portable presets

- Date: 2026-08-28
- Status: accepted
- 中文：[0021](0021-safe-mode-recovery-presets.zh.md)

## Context

A single broken third-party plugin can brick the whole profile: the harness fails
to render while the desktop shell's only recovery path is retry. Community
solutions treat this with a non-destructive Safe Mode (dataelement), checkpoint
snapshots and a recovery page (anywhere-labs), or snapshots plus auto-repair
(EAC). The shell's diagnostic report does not yet include plugin context, so
"which plugin broke it" is a manual investigation. Separately, agent presets are
a first-class upstream concept with a trusted-root mount model, but upstream
ships no export/import, so presets are neither portable nor shareable outside
the agent. shell.9 groups these under one recovery-and-sharing theme; it must
not delete or rewrite user plugin files, and must not duplicate official
WebUI/visual capabilities.

## Decision

1. **Safe Mode is a shell-owned startup mode.** The composed plugin tree for a
   Safe Mode run is: official `dsh.profile.bundles` + the shell-owned
   `dsh-desktop-controls` overlay + a Safe-Mode overlay that disables every
   user plugin entry from the profile. User plugins are not loaded; user
   plugin files, profile `package.json`, and `cordis.patch.yml` are never
   deleted, moved, or rewritten. The same DSH_HOME stays in use, so sessions,
   `settings.yaml`, and API credentials are untouched.
2. **Two triggers.** Automatic: the harness fails to reach readiness, crash
   loops past the restart budget, or emits a plugin-load failure signature in
   its output (the exact signature is pinned by a spike; timeout and crash-loop
   remain the fallback). Manual: the extensions entry and the Extensions
   settings row expose "Start in Safe Mode" as a desktop action. Entering Safe
   Mode stops the harness and restarts with the Safe-Mode argument set.
3. **Safe Mode persists until explicitly exited.** The flag lives in
   `shell-preferences.json`; the in-window banner and the Extensions row show
   the state and offer "Exit Safe Mode", which restarts with the normal
   argument set. A restart without exiting stays in Safe Mode so a broken
   plugin cannot re-brick the app at boot.
4. **Recovery center.** The shell error page becomes a four-action center:
   Retry (unchanged), Start in Safe Mode (hidden when already in Safe Mode),
   Export diagnostics, and Open logs folder. All actions go through the
   existing sender-validated `desktop:action` bridge.
5. **Diagnostics enhancement.** The exported report gains: profile plugin
   inventory (profile dependencies plus patch entries), suspected-bad-plugin
   candidates extracted from harness log error signatures, the current
   Safe-Mode state, and bundled shell/harness versions. The report stays
   local-only (decision 0015).
6. **Portable presets (`.dshpreset`).** Export a mounted agent preset into a
   single package file; import runs conflict detection on the preset id
   (skip / overwrite / clone under a new name) and shows a trust warning for
   any preset whose root is not the official pre-bundled one — the same
   trusted-root distinction upstream already uses. The imported preset mounts
   through the official preset picker; the agent model and harness behavior
   are unchanged. Only local export/import of static files is in scope; no
   market or remote download.
7. **In-shell diagnostics viewing.** An exported package can be viewed in
   shell for report text and `harness.log` with pure text rendering. Generic
   file preview (PDF/CSV/image…) is out of scope this round because it
   overlaps official attachment/workspace viewing.

## Consequences

- Positive: a broken plugin no longer bricks the profile, and the guided
  recovery surface (retry → Safe Mode → export → logs) gives non-experts a
  path back in.
- Positive: diagnostics answer "which plugin" with inventory plus log-derived
  candidates instead of manual log dredging.
- Positive: agent presets become portable and shareable through one static
  file, with the shell owning conflict handling and trust warnings.
- Positive: everything is non-destructive and upgrade-safe; user plugin data
  and Harness configuration are never modified.
- Negative: automatic detection depends on harness output text that upstream
  may reword; the spike pins today's signature and the timeout/crash-loop
  path always covers it.
- Negative: Safe Mode hides all third-party plugins at once — the user still
  has to identify the culprit (inventory + candidates narrow it; official
  Settings → Plugins remains the fix surface).
- Negative: preset trust warnings are shell-level attribution, not code-level
  sandbox verification.
- Negative: Safe Mode adds a second startup state that must be tested on all
  three platforms (packaged smoke), and it persists a mode the user might
  forget about — mitigated by the persistent banner.

## Alternatives

- Temporarily rename user plugin directories: a crash mid-restore can leave
  plugins half-moved, it conflicts with hoisted pnpm linking, and it races
  with concurrent access — rejected in favor of loader-composition overlay.
- A dedicated Safe profile via `--profile`: profiles isolate data, so
  sessions, settings, and API credentials would be hidden — rejected.
- Delete the broken plugin automatically: destructive, modifies user
  data, and cannot judge intent — rejected; the official plugin manager
  stays the fix surface.
- Checkpoint snapshots plus auto rollback (anywhere-labs/EAC style): heavy,
  and past the "no change to agent behavior" shell boundary — deferred.
- Generic file preview (PDF/CSV/JSON/YAML): overlaps official attachment
  and workspace preview — deferred.
- Preset market or remote download: a supply-chain surface far beyond one
  static file — rejected this round.
