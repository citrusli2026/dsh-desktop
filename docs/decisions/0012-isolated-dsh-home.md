# 0012: Isolate the desktop data home by default

- Date: 2026-08-15
- Status: accepted (supersedes [0003](0003-shared-dsh-home.md))
- 中文:[0012](0012-isolated-dsh-home.zh.md)

## Context

Decision 0003 shared `~/.dsh` with the CLI so sessions, settings, and API keys
carried over. Review feedback reversed the priority: desktop users expect the
app to be a self-contained environment — its own settings, credentials,
sessions, and plugins — so that installing or uninstalling the desktop app
never surprises a CLI workflow, and concurrent CLI + desktop use can no longer
contend over the same state files.

## Decision

The shell now sets `DSH_HOME` for the harness child process to
`~/.dsh-desktop` whenever the user has not set `DSH_HOME` explicitly
(`src/main/dsh-home.ts`, consumed by the supervisor). The escape hatch is the
upstream variable itself: `DSH_HOME=~/.dsh` (or any path) restores sharing —
an explicit opt-in rather than the default.

## Consequences

- Positive: predictable isolation; uninstalling the app removes one
  self-contained directory; CLI and desktop can run side by side with
  different accounts/models/plugins; no cross-surface state drift;
- Negative: existing desktop users' sessions stay behind in `~/.dsh` (nothing
  is migrated automatically; point `DSH_HOME` at the old home to continue);
  first launch asks for the API key again;
- The website and READMEs must stop claiming CLI interop by default.

## Alternatives

- Keep sharing, offer isolation as a settings toggle: preserves the old
  default the review explicitly rejected — rejected;
- Migrate/copy `~/.dsh` into the new home on first run: copies credentials
  the user did not ask to duplicate, and drifts afterwards — rejected;
- App-private `app.getPath('userData')` subtree: hides data inside an
  OS-specific Electron directory that power users cannot find or point the
  CLI at; a named `~/.dsh-desktop` mirrors the upstream mental model —
  rejected.
