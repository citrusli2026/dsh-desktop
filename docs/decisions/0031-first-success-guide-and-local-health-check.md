# 0031: Lightweight First-Success Guide and Local-First Health Check

- Date: 2026-09-04
- Status: Accepted
- 中文：[0031](0031-first-success-guide-and-local-health-check.zh.md)

## Context

The desktop shell's visual system is already coherent, but its desktop-only
capabilities were hidden behind an entry named “Extensions.” New users could
open the official Harness UI without knowing the next useful step, while users
with a degraded runtime or profile had to assemble evidence from several
recovery surfaces.

A blocking onboarding wizard would compete with Harness's own first-run prompts
and imply that community plugins are required. An automatic repair tool would
also cross the shell's non-destructive data boundary.

## Decision

Rename the visible shell entry to **Desktop tools** and its settings page to
**Desktop settings**.

Add a one-time, dismissible, non-modal guide beside the main-screen entry. It
shows four steps: runtime ready, workspace selected, model configured, and first
task completed. The first three steps are derived locally from the public
Harness session summary. The main process alone records completion after an
existing non-blank successful conversation or a real running-to-completed edge.
The renderer may dismiss the guide but cannot mark a task complete. The plugin
market is stated as optional and is not part of the success path.

Add a user-triggered health check at the top of Desktop settings:

- local checks cover bundled runtime files and versions, both writable data
  roots and available disk, Harness readiness and loopback reachability, plus
  profile, plugin, market, Safe Mode, and kernel state;
- proxy, npm registry, and update-source probes run only after an explicit
  checkbox opt-in and connectivity failures remain advisory warnings;
- results use OK / warning / failed states with a next action, stay in memory,
  exclude paths, URLs, logs, proxy addresses, and caught errors, and are never
  uploaded;
- checks are read-only and never repair, delete, move, or rewrite user files.

## Consequences

- A fresh install has a visible next step without another blocking modal.
- Existing users with completed conversations do not receive retroactive
  onboarding noise.
- Common environment failures can be separated locally before exporting a
  broader diagnostic report.
- Network access remains visible and opt-in, and the health check cannot become
  a second configuration or repair system.

## Alternatives

- **Blocking first-run wizard:** rejected because Harness already owns account,
  model, and conversation setup, and stacked modals make first launch worse.
- **Require the plugin market before first use:** rejected; all community
  plugins remain optional, manual installs.
- **Automatically fix failed checks:** rejected because it could mutate user
  profiles or permissions without enough context.
- **Always probe external services:** rejected because local diagnosis should
  not silently make network requests.
